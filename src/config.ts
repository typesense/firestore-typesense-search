import {resolveCollection, type FirestoreData, type ResolvedCollection} from "./collection.js";
import {buildFieldDocument, projectFields} from "./document.js";
import {isUnderKitState, KIT_STATE_COLLECTION, parseCollectionPath, type CollectionPath} from "./paths.js";
import {err, ok, type Result} from "./result.js";
import type {ConfigurationOptions} from "./typesenseClient.js";

export type Env = Readonly<Record<string, string | undefined>>;

export interface CollectionConfig {
  readonly firestorePath: CollectionPath;
  readonly typesenseCollection: string;
  readonly fields: readonly string[];
  readonly flattenNested: boolean;
}

export interface ConfigProblem {
  readonly message: string;
  readonly lines: readonly string[];
}

export const BACKFILL_TRIGGER_DOCUMENT = `${KIT_STATE_COLLECTION}/backfill`;
export const BACKFILL_STATUS_DOCUMENT = `${KIT_STATE_COLLECTION}/backfill_status`;
export const ISSUES_COLLECTION = `${KIT_STATE_COLLECTION}/issues/typesense_issues`;
export const BACKFILL_BATCH_SIZE = 1000;

export function parseCommaSeparated(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

export function parsePipeSeparated(value: string | null | undefined): string[][] {
  if (!value) return [];
  return value.split("|").map((part) => parseCommaSeparated(part));
}

export function parseBooleanList(value: string | null | undefined): boolean[] {
  if (!value) return [];
  return value.split(",").map((item) => item.trim() === "true");
}

const REMOVED_PARAMS = [
  ["FIRESTORE_COLLECTION_PATH", "FIRESTORE_COLLECTION_PATHS"],
  ["TYPESENSE_COLLECTION_NAME", "TYPESENSE_COLLECTION_NAMES"],
  ["FIRESTORE_COLLECTION_FIELDS", "FIRESTORE_COLLECTION_FIELDS_LIST"],
  ["FLATTEN_NESTED_DOCUMENTS", "FLATTEN_NESTED_DOCUMENTS_LIST"],
] as const;

function valueOf(env: Env, name: string): string {
  return env[name]?.trim() ?? "";
}

function lineOf(env: Env, name: string): string {
  return `${name}=${valueOf(env, name)}`;
}

function plural(count: number, noun: string, nouns = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : nouns}`;
}

const REMOVED_PARAMS_MESSAGE = "The single-collection params FIRESTORE_COLLECTION_PATH, TYPESENSE_COLLECTION_NAME, FIRESTORE_COLLECTION_FIELDS and FLATTEN_NESTED_DOCUMENTS were removed in 4.0.0";
const UPGRADING_URL = "https://github.com/typesense/firestore-typesense-search/blob/master/UPGRADING.md";

function removedParamReplacements(env: Env): string[] {
  return REMOVED_PARAMS.flatMap(([removed, replacement]) => {
    const value = valueOf(env, removed);
    return value ? [`${replacement}=${value}`] : [];
  });
}

function missingCollectionsProblem(env: Env): ConfigProblem {
  const replacements = removedParamReplacements(env);
  if (replacements.length > 0) return {message: `${REMOVED_PARAMS_MESSAGE} (see ${UPGRADING_URL}). Replace them in your configuration with:`, lines: replacements};
  return {message: "No collections are configured. Set FIRESTORE_COLLECTION_PATHS and TYPESENSE_COLLECTION_NAMES.", lines: []};
}

function pathProblems(env: Env, paths: readonly string[]): ConfigProblem[] {
  const line = [lineOf(env, "FIRESTORE_COLLECTION_PATHS")];
  return paths.flatMap((path, index): ConfigProblem[] => {
    const parsed = parseCollectionPath(path);
    if (!parsed.ok) return [{message: `FIRESTORE_COLLECTION_PATHS entry "${path}" ${parsed.error}.`, lines: line}];
    if (isUnderKitState(path)) {
      return [{message: `FIRESTORE_COLLECTION_PATHS entry "${path}" is under ${KIT_STATE_COLLECTION}, where the kit keeps its own state. Remove it.`, lines: line}];
    }
    if (paths.indexOf(path) !== index) {
      return [{message: `FIRESTORE_COLLECTION_PATHS lists "${path}" more than once. List each path once.`, lines: line}];
    }
    return [];
  });
}

function fieldsListProblems(env: Env, pathCount: number): ConfigProblem[] {
  const groups = parsePipeSeparated(valueOf(env, "FIRESTORE_COLLECTION_FIELDS_LIST"));
  if (!groups.slice(pathCount).some((group) => group.length > 0)) return [];
  return [
    {
      message:
        `FIRESTORE_COLLECTION_FIELDS_LIST has ${plural(groups.length, "field group")} but FIRESTORE_COLLECTION_PATHS lists ${plural(pathCount, "path")}. ` +
        "Give one group per path, in the same order, separated by |.",
      lines: [lineOf(env, "FIRESTORE_COLLECTION_PATHS"), lineOf(env, "FIRESTORE_COLLECTION_FIELDS_LIST")],
    },
  ];
}

function flattenListProblems(env: Env, pathCount: number): ConfigProblem[] {
  const raw = valueOf(env, "FLATTEN_NESTED_DOCUMENTS_LIST");
  if (raw === "") return [];
  const entries = raw.split(",").map((entry) => entry.trim());
  const line = [lineOf(env, "FLATTEN_NESTED_DOCUMENTS_LIST")];
  const invalid = entries.flatMap((entry, index): ConfigProblem[] =>
    entry === "" || entry === "true" || entry === "false" ? [] : [{message: `FLATTEN_NESTED_DOCUMENTS_LIST entry ${index + 1} is "${entry}". Use true or false.`, lines: line}],
  );
  if (invalid.length > 0 || !entries.slice(pathCount).includes("true")) return invalid;
  return [
    {
      message: `FLATTEN_NESTED_DOCUMENTS_LIST has ${plural(entries.length, "entry", "entries")} but FIRESTORE_COLLECTION_PATHS lists ${plural(pathCount, "path")}. Give one true or false per path, in the same order.`,
      lines: [lineOf(env, "FIRESTORE_COLLECTION_PATHS"), ...line],
    },
  ];
}

function parsePort(env: Env): Result<number, ConfigProblem> {
  const value = valueOf(env, "TYPESENSE_PORT");
  if (value === "") return ok(443);
  const port = Number(value);
  if (Number.isInteger(port) && port > 0) return ok(port);
  return err({message: `TYPESENSE_PORT is "${value}". Use a positive integer such as 443.`, lines: [lineOf(env, "TYPESENSE_PORT")]});
}

function parseProtocol(env: Env): Result<"http" | "https", ConfigProblem> {
  const value = valueOf(env, "TYPESENSE_PROTOCOL");
  if (value === "") return ok("https");
  if (value === "http" || value === "https") return ok(value);
  return err({message: `TYPESENSE_PROTOCOL is "${value}". Use http or https.`, lines: [lineOf(env, "TYPESENSE_PROTOCOL")]});
}

function errorsOf(...results: readonly Result<unknown, ConfigProblem>[]): ConfigProblem[] {
  return results.flatMap((result) => (result.ok ? [] : [result.error]));
}

export function parseCollectionConfigs(env: Env): Result<readonly CollectionConfig[], readonly ConfigProblem[]> {
  const paths = parseCommaSeparated(valueOf(env, "FIRESTORE_COLLECTION_PATHS"));
  const names = parseCommaSeparated(valueOf(env, "TYPESENSE_COLLECTION_NAMES"));

  if (paths.length === 0 && names.length === 0) return err([missingCollectionsProblem(env)]);

  const problems: ConfigProblem[] = [...pathProblems(env, paths), ...fieldsListProblems(env, paths.length), ...flattenListProblems(env, paths.length)];
  if (paths.length !== names.length) {
    problems.unshift({
      message: `FIRESTORE_COLLECTION_PATHS lists ${plural(paths.length, "path")} but TYPESENSE_COLLECTION_NAMES lists ${plural(names.length, "name")}. Give each path one Typesense collection name, in the same order.`,
      lines: [lineOf(env, "FIRESTORE_COLLECTION_PATHS"), lineOf(env, "TYPESENSE_COLLECTION_NAMES")],
    });
  }
  if (problems.length > 0) return err(problems);

  const fieldsList = parsePipeSeparated(valueOf(env, "FIRESTORE_COLLECTION_FIELDS_LIST"));
  const flattenList = parseBooleanList(valueOf(env, "FLATTEN_NESTED_DOCUMENTS_LIST"));
  const configs = paths.flatMap((path, index): CollectionConfig[] => {
    const firestorePath = parseCollectionPath(path);
    const typesenseCollection = names[index];
    if (!firestorePath.ok || typesenseCollection === undefined) return [];
    return [{firestorePath: firestorePath.value, typesenseCollection, fields: fieldsList[index] ?? [], flattenNested: flattenList[index] ?? false}];
  });
  return ok(configs);
}

export function parseConnection(env: Env): Result<ConfigurationOptions, readonly ConfigProblem[]> {
  const port = parsePort(env);
  const protocol = parseProtocol(env);
  const hosts = parseCommaSeparated(valueOf(env, "TYPESENSE_HOSTS"));
  const apiKey = valueOf(env, "TYPESENSE_API_KEY");

  const problems = errorsOf(port, protocol);
  if (hosts.length === 0) problems.push({message: "TYPESENSE_HOSTS is empty. Set it to your Typesense host names, separated by commas.", lines: [lineOf(env, "TYPESENSE_HOSTS")]});
  if (apiKey === "") problems.push({message: "The TYPESENSE_API_KEY secret is empty. Set it to a Typesense API key with admin permissions.", lines: []});
  if (!port.ok || !protocol.ok || problems.length > 0) return err(problems);

  return ok({nodes: hosts.map((host) => ({host, port: port.value, protocol: protocol.value})), apiKey});
}

export function formatConfigProblems(problems: readonly ConfigProblem[]): string[] {
  return problems.map(({message, lines}) => [message, ...lines.map((line) => `    ${line}`)].join("\n"));
}

function configError(problems: readonly ConfigProblem[]): Error {
  return new Error(`typesense-firestore-search: fix the kit's .env and deploy again.\n\n${formatConfigProblems(problems).join("\n\n")}`);
}

export function assertConfigAtLoad(env: Env = process.env): void {
  if (env["FUNCTIONS_CONTROL_API"] !== "true") return;
  const hasPaths = valueOf(env, "FIRESTORE_COLLECTION_PATHS") !== "";
  if (hasPaths !== (valueOf(env, "TYPESENSE_COLLECTION_NAMES") !== "")) return;
  if (!hasPaths && removedParamReplacements(env).length === 0) return;
  const collections = parseCollectionConfigs(env);
  const problems = [...(collections.ok ? [] : collections.error), ...errorsOf(parsePort(env), parseProtocol(env))];
  if (problems.length > 0) throw configError(problems);
}

export function resolveEnvCollection(config: CollectionConfig): ResolvedCollection {
  return resolveCollection<FirestoreData>({
    path: config.firestorePath,
    typesenseCollection: config.typesenseCollection,
    consistency: "reread",
    project: (data) => projectFields(data, config.fields),
    validate: ok,
    indexIf: () => true,
    id: (_data, {docId}) => docId,
    document: (data, {params}) => buildFieldDocument(data, config.flattenNested, params),
  });
}
