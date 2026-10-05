import * as params from "./params.js";
import type {ConfigurationOptions} from "./typesenseClient.js";

export interface CollectionConfig {
  readonly firestorePath: string;
  readonly typesenseCollection: string;
  readonly fields: readonly string[];
  readonly flattenNested: boolean;
}

export type CollectionConfigMap = Readonly<Record<string, CollectionConfig>>;

export const BACKFILL_TRIGGER_DOCUMENT = "typesense_sync/backfill";
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

function hasEnvValue(name: string): boolean {
  return (process.env[name]?.trim() ?? "") !== "";
}

export function assertNoRemovedParams(): void {
  if (hasEnvValue("FIRESTORE_COLLECTION_PATHS") || hasEnvValue("TYPESENSE_COLLECTION_NAMES")) return;

  const replacements = REMOVED_PARAMS.flatMap(([removed, replacement]) => {
    const value = process.env[removed]?.trim();
    return value ? [`${replacement}=${value}`] : [];
  });
  if (replacements.length === 0) return;

  throw new Error(
    "The single-collection params FIRESTORE_COLLECTION_PATH, TYPESENSE_COLLECTION_NAME, FIRESTORE_COLLECTION_FIELDS and " +
      "FLATTEN_NESTED_DOCUMENTS were removed in 4.0.0. Replace them in your configuration with:\n" +
      replacements.join("\n") +
      "\nSee https://github.com/typesense/firestore-typesense-search/blob/master/UPGRADING.md",
  );
}

export function createCollectionConfigMap(): CollectionConfigMap {
  const firestorePaths = parseCommaSeparated(params.firestoreCollectionPaths.value());
  const typesenseNames = parseCommaSeparated(params.typesenseCollectionNames.value());

  if (firestorePaths.length === 0 && typesenseNames.length === 0) {
    throw new Error("No Firestore collection config found. Set FIRESTORE_COLLECTION_PATHS and TYPESENSE_COLLECTION_NAMES.");
  }

  if (firestorePaths.length !== typesenseNames.length) {
    throw new Error(`Mismatch in collection counts: ${firestorePaths.length} Firestore paths vs ${typesenseNames.length} Typesense names`);
  }

  const fieldsList = parsePipeSeparated(params.firestoreCollectionFieldsList.value());
  const flattenList = parseBooleanList(params.flattenNestedDocumentsList.value());

  const collectionMap: Record<string, CollectionConfig> = {};
  firestorePaths.forEach((firestorePath, index) => {
    collectionMap[firestorePath] = {
      firestorePath,
      typesenseCollection: typesenseNames[index] ?? "",
      fields: fieldsList[index] ?? [],
      flattenNested: flattenList[index] ?? false,
    };
  });
  return collectionMap;
}

export function shouldLogTypesenseInserts(): boolean {
  return params.logTypesenseInserts.value() === "true";
}

function parsePort(value: string | undefined): number {
  if (value === undefined || value === "") return 443;
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid TYPESENSE_PORT "${value}". Expected a positive integer.`);
  }
  return port;
}

function parseProtocol(value: string | undefined): "http" | "https" {
  if (value === undefined || value === "") return "https";
  if (value === "http" || value === "https") return value;
  throw new Error(`Invalid TYPESENSE_PROTOCOL "${value}". Expected "http" or "https".`);
}

export function getTypesenseConnectionConfig(): ConfigurationOptions {
  const port = parsePort(process.env["TYPESENSE_PORT"]);
  const protocol = parseProtocol(process.env["TYPESENSE_PROTOCOL"]);
  return {
    nodes: params.typesenseHosts
      .value()
      .split(",")
      .map((host) => ({host: host.trim(), port, protocol})),
    apiKey: params.typesenseApiKey.value(),
  };
}
