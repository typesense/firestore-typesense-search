import {spawn, type ChildProcessWithoutNullStreams} from "node:child_process";
import {readFileSync, rmSync, writeFileSync} from "node:fs";
import path from "node:path";
import {setTimeout as sleep} from "node:timers/promises";
import {fileURLToPath} from "node:url";
import {deleteApp, initializeApp, type App} from "firebase-admin/app";
import {getFirestore, type DocumentData, type Firestore} from "firebase-admin/firestore";
import type {Client} from "typesense";
import {BACKFILL_TRIGGER_DOCUMENT, createCollectionConfigMap, getTypesenseConnectionConfig, type CollectionConfig, type CollectionConfigMap} from "../../../functions/src/config.js";
import {createTypesenseClient} from "../../../functions/src/typesenseClient.js";

export type TypesenseRecord = Readonly<Record<string, unknown>>;

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const FUNCTIONS_ENV_PATH = path.join(PROJECT_ROOT, "functions/.env");
const FUNCTIONS_SECRETS_PATH = path.join(PROJECT_ROOT, "functions/.secret.local");
const FUNCTIONS_EMULATOR_ENV_PATH = path.join(PROJECT_ROOT, "functions/.env.local");
const SECRET_KEYS = new Set(["TYPESENSE_API_KEY"]);
const CONFIG_KEYS = [
  "LOCATION",
  "FIRESTORE_DATABASE_REGION",
  "DATABASE",
  "FIRESTORE_COLLECTION_PATHS",
  "TYPESENSE_COLLECTION_NAMES",
  "FIRESTORE_COLLECTION_FIELDS_LIST",
  "FLATTEN_NESTED_DOCUMENTS_LIST",
  "TYPESENSE_HOSTS",
  "TYPESENSE_PORT",
  "TYPESENSE_PROTOCOL",
  "TYPESENSE_API_KEY",
  "LOG_TYPESENSE_INSERTS",
];

const ANSI_ESCAPE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

function isRecord(value: unknown): value is TypesenseRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEnvFile(contents: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    entries.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }
  return entries;
}

function serializeEnv(entries: Iterable<readonly [string, string]>): string {
  return [...entries].map(([key, value]) => `${key}=${value}`).join("\n") + "\n";
}

function readProjectId(): string {
  const firebaseRc: unknown = JSON.parse(readFileSync(path.join(PROJECT_ROOT, ".firebaserc"), "utf8"));
  const projects = isRecord(firebaseRc) ? firebaseRc["projects"] : undefined;
  const projectId = isRecord(projects) ? projects["default"] : undefined;
  if (typeof projectId !== "string" || projectId === "") {
    throw new Error("No default project found in .firebaserc");
  }
  return projectId;
}

function logMessageOf(line: string): string {
  const flat = line.replace(ANSI_ESCAPE, "").replace(/^>\s*/, "");
  try {
    const parsed: unknown = JSON.parse(flat);
    return isRecord(parsed) && typeof parsed["message"] === "string" ? parsed["message"] : line;
  } catch {
    return line;
  }
}

export interface TestEnvironmentOptions {
  readonly dotenvPath?: string;
  readonly dotenvConfig?: string;
  readonly outputAllEmulatorLogs?: boolean;
}

export class TestEnvironment {
  readonly #env: Map<string, string>;
  readonly #outputAllEmulatorLogs: boolean;
  #emulator: ChildProcessWithoutNullStreams | undefined;
  #app: App | undefined;
  #firestore: Firestore | undefined;
  #typesense: Client | undefined;
  #shouldCaptureLogs = false;

  capturedEmulatorLogs = "";

  constructor({dotenvPath, dotenvConfig, outputAllEmulatorLogs = false}: TestEnvironmentOptions) {
    if (dotenvPath !== undefined && dotenvConfig !== undefined) {
      throw new Error("Provide either 'dotenvPath' or 'dotenvConfig', not both.");
    }
    const contents = dotenvPath !== undefined ? readFileSync(path.join(PROJECT_ROOT, dotenvPath), "utf8") : (dotenvConfig ?? "");
    this.#env = parseEnvFile(contents);
    this.#outputAllEmulatorLogs = outputAllEmulatorLogs;
  }

  get app(): App {
    if (this.#app === undefined) throw new Error("Test environment is not set up");
    return this.#app;
  }

  get firestore(): Firestore {
    if (this.#firestore === undefined) throw new Error("Test environment is not set up");
    return this.#firestore;
  }

  get typesense(): Client {
    if (this.#typesense === undefined) throw new Error("Test environment is not set up");
    return this.#typesense;
  }

  get collections(): CollectionConfigMap {
    return createCollectionConfigMap();
  }

  get firstCollection(): CollectionConfig {
    const [first] = Object.values(this.collections);
    if (first === undefined) throw new Error("No collections configured");
    return first;
  }

  async setup(): Promise<void> {
    const secrets = [...this.#env].filter(([key]) => SECRET_KEYS.has(key));
    const params = [...this.#env].filter(([key]) => !SECRET_KEYS.has(key));
    rmSync(FUNCTIONS_EMULATOR_ENV_PATH, {force: true});
    writeFileSync(FUNCTIONS_ENV_PATH, serializeEnv(params));
    writeFileSync(FUNCTIONS_SECRETS_PATH, serializeEnv(secrets));

    for (const key of CONFIG_KEYS) Reflect.deleteProperty(process.env, key);
    for (const [key, value] of this.#env) process.env[key] = value;

    const projectId = readProjectId();
    process.env["GCLOUD_PROJECT"] = projectId;
    process.env["FIRESTORE_EMULATOR_HOST"] = "127.0.0.1:8080";

    console.log("Starting Firebase emulator...");
    await this.#startEmulator();

    this.#app = initializeApp({projectId}, `test-${Date.now()}`);
    this.#firestore = getFirestore(this.#app, this.#env.get("DATABASE") ?? "(default)");
    this.#typesense = createTypesenseClient(getTypesenseConnectionConfig());
    this.#shouldCaptureLogs = true;
    console.log("Test environment ready");
  }

  async #startEmulator(): Promise<void> {
    const emulator = spawn("firebase", ["emulators:start", "--only", "functions,firestore"], {
      cwd: PROJECT_ROOT,
      env: {...process.env, FORCE_COLOR: "1"},
    });
    this.#emulator = emulator;

    await new Promise<void>((resolve, reject) => {
      emulator.stdout.on("data", (chunk: Buffer) => {
        const output = chunk.toString().trim();
        const message = logMessageOf(output);
        if (this.#shouldCaptureLogs) this.capturedEmulatorLogs += `${message}\n`;
        if (this.#outputAllEmulatorLogs) console.log(message);
        if (output.includes("All emulators ready")) resolve();
      });
      emulator.stderr.on("data", (chunk: Buffer) => {
        console.error(chunk.toString());
      });
      emulator.on("close", (code) => {
        if (code !== 0) reject(new Error(`Emulator exited unexpectedly with code ${code ?? "null"}`));
      });
    });
  }

  resetCapturedEmulatorLogs(): void {
    this.capturedEmulatorLogs = "";
  }

  async teardown(): Promise<void> {
    this.#shouldCaptureLogs = false;
    const emulator = this.#emulator;
    if (emulator !== undefined && emulator.exitCode === null) {
      const exited = new Promise<void>((resolve) => {
        emulator.on("exit", () => {
          resolve();
        });
      });
      emulator.kill("SIGINT");
      await exited;
    }
    if (this.#app !== undefined) await deleteApp(this.#app);
    rmSync(FUNCTIONS_SECRETS_PATH, {force: true});
    rmSync(FUNCTIONS_EMULATOR_ENV_PATH, {force: true});
  }

  async recreateTypesenseCollections(names: readonly string[], {enableNestedFields = true} = {}): Promise<void> {
    for (const name of names) {
      try {
        await this.typesense.collections(name).delete();
      } catch {
        console.info(`${name} collection not found, proceeding...`);
      }
      await this.typesense.collections().create({
        name,
        fields: [{name: ".*", type: "auto"}],
        enable_nested_fields: enableNestedFields,
      });
    }
  }

  async clearAllData(): Promise<void> {
    for (const config of Object.values(this.collections)) {
      await this.firestore.recursiveDelete(this.firestore.collection(config.firestorePath.split("/")[0] ?? config.firestorePath));
    }
    await this.recreateTypesenseCollections(Object.values(this.collections).map((config) => config.typesenseCollection));
  }

  async exportDocuments(collectionName: string): Promise<TypesenseRecord[]> {
    const exported = await this.typesense.collections(collectionName).documents().export();
    return exported
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => {
        const parsed: unknown = JSON.parse(line);
        if (!isRecord(parsed)) throw new Error(`Unexpected export line: ${line}`);
        return parsed;
      });
  }

  async triggerBackfill(data: DocumentData = {trigger: true}): Promise<void> {
    await this.firestore.doc(BACKFILL_TRIGGER_DOCUMENT).set(data);
  }
}

export async function waitForFunctions(ms: number): Promise<void> {
  await sleep(ms);
}
