import * as params from "./params.js";
import type {ConfigurationOptions} from "./typesenseClient.js";

export interface CollectionConfig {
  readonly firestorePath: string;
  readonly typesenseCollection: string;
  readonly fields: readonly string[];
  readonly flattenNested: boolean;
}

export type CollectionConfigMap = Readonly<Record<string, CollectionConfig>>;

export type CollectionConfigMode = "none" | "legacy" | "multi" | "both";

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

function hasValue(value: string): boolean {
  return value.trim() !== "";
}

export function hasLegacyCollectionConfig(): boolean {
  return hasValue(params.firestoreCollectionPath.value()) && hasValue(params.typesenseCollectionName.value());
}

export function hasMultiCollectionConfig(): boolean {
  return hasValue(params.firestoreCollectionPaths.value()) && hasValue(params.typesenseCollectionNames.value());
}

export function hasPartialLegacyCollectionConfig(): boolean {
  return hasValue(params.firestoreCollectionPath.value()) !== hasValue(params.typesenseCollectionName.value());
}

export function hasPartialMultiCollectionConfig(): boolean {
  return hasValue(params.firestoreCollectionPaths.value()) !== hasValue(params.typesenseCollectionNames.value());
}

export function getCollectionConfigMode(): CollectionConfigMode {
  if (hasPartialLegacyCollectionConfig()) {
    throw new Error(
      "Incomplete legacy collection config. Set both FIRESTORE_COLLECTION_PATH and TYPESENSE_COLLECTION_NAME, " +
        "or remove the legacy params and use FIRESTORE_COLLECTION_PATHS and TYPESENSE_COLLECTION_NAMES instead.",
    );
  }

  if (hasPartialMultiCollectionConfig()) {
    throw new Error(
      "Incomplete multi-collection config. Set both FIRESTORE_COLLECTION_PATHS and TYPESENSE_COLLECTION_NAMES, " +
        "or remove the new params and use the legacy FIRESTORE_COLLECTION_PATH and TYPESENSE_COLLECTION_NAME instead.",
    );
  }

  const legacyConfigured = hasLegacyCollectionConfig();
  const multiConfigured = hasMultiCollectionConfig();

  if (legacyConfigured && multiConfigured) return "both";
  if (multiConfigured) return "multi";
  if (legacyConfigured) return "legacy";
  return "none";
}

export function createCollectionConfigMap(): CollectionConfigMap {
  const mode = getCollectionConfigMode();

  if (mode === "both" || mode === "multi") {
    const firestorePaths = parseCommaSeparated(params.firestoreCollectionPaths.value());
    const typesenseNames = parseCommaSeparated(params.typesenseCollectionNames.value());
    const fieldsList = parsePipeSeparated(params.firestoreCollectionFieldsList.value());
    const flattenList = parseBooleanList(params.flattenNestedDocumentsList.value());

    if (firestorePaths.length !== typesenseNames.length) {
      throw new Error(`Mismatch in collection counts: ${firestorePaths.length} Firestore paths vs ${typesenseNames.length} Typesense names`);
    }

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

  if (mode === "legacy") {
    const firestorePath = params.firestoreCollectionPath.value();
    return {
      [firestorePath]: {
        firestorePath,
        typesenseCollection: params.typesenseCollectionName.value(),
        fields: parseCommaSeparated(params.firestoreCollectionFields.value()),
        flattenNested: params.flattenNestedDocuments.value() === "true",
      },
    };
  }

  throw new Error(
    "No Firestore collection config found. Set either the legacy single-collection params " +
      "(FIRESTORE_COLLECTION_PATH and TYPESENSE_COLLECTION_NAME) or the new multi-collection params " +
      "(FIRESTORE_COLLECTION_PATHS and TYPESENSE_COLLECTION_NAMES).",
  );
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
