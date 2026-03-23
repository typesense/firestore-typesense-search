/**
 * Parse comma-separated string into array, handling empty values
 * @param {string} str - Comma-separated string
 * @return {Array} Array of trimmed, non-empty values
 */
function parseCommaSeparated(str) {
  if (!str) return [];
  return str
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item);
}

/**
 * Parse pipe-separated string into array of arrays
 * @param {string} str - Pipe-separated string where each part is comma-separated
 * @return {Array} Array of arrays
 */
function parsePipeSeparated(str) {
  if (!str) return [];
  return str.split("|").map((part) => parseCommaSeparated(part));
}

/**
 * Parse comma-separated boolean string into array
 * @param {string} str - Comma-separated string of true/false values
 * @return {Array} Array of boolean values
 */
function parseBooleanList(str) {
  if (!str) return [];
  return str.split(",").map((item) => item.trim() === "true");
}

/**
 * @param {string|undefined|null} value
 * @return {boolean} true when the value is present and non-empty
 */
function hasValue(value) {
  return value != null && String(value).trim() !== "";
}

/**
 * Detect whether the legacy single-collection configuration is in use.
 * @return {boolean}
 */
function hasLegacyCollectionConfig() {
  return hasValue(process.env.FIRESTORE_COLLECTION_PATH) && hasValue(process.env.TYPESENSE_COLLECTION_NAME);
}

/**
 * Detect whether the new multi-collection configuration is in use.
 * @return {boolean}
 */
function hasMultiCollectionConfig() {
  return hasValue(process.env.FIRESTORE_COLLECTION_PATHS) && hasValue(process.env.TYPESENSE_COLLECTION_NAMES);
}

/**
 * Detect whether legacy configuration is partially set.
 * @return {boolean}
 */
function hasPartialLegacyCollectionConfig() {
  const hasPath = hasValue(process.env.FIRESTORE_COLLECTION_PATH);
  const hasCollection = hasValue(process.env.TYPESENSE_COLLECTION_NAME);
  return hasPath !== hasCollection;
}

/**
 * Detect whether new multi-collection configuration is partially set.
 * @return {boolean}
 */
function hasPartialMultiCollectionConfig() {
  const hasPaths = hasValue(process.env.FIRESTORE_COLLECTION_PATHS);
  const hasCollections = hasValue(process.env.TYPESENSE_COLLECTION_NAMES);
  return hasPaths !== hasCollections;
}

/**
 * Determine the active collection config mode.
 * @return {"none"|"legacy"|"multi"|"both"}
 */
function getCollectionConfigMode() {
  const legacyConfigured = hasLegacyCollectionConfig();
  const multiConfigured = hasMultiCollectionConfig();

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

  if (legacyConfigured && multiConfigured) {
    return "both";
  }

  if (multiConfigured) {
    return "multi";
  }

  if (legacyConfigured) {
    return "legacy";
  }

  return "none";
}

/**
 * Create collection configuration map from environment variables
 * @return {Object} Map of collection configurations keyed by Firestore path
 */
function createCollectionConfigMap() {
  const mode = getCollectionConfigMode();

  if (mode === "both" || mode === "multi") {
    const firestorePaths = parseCommaSeparated(process.env.FIRESTORE_COLLECTION_PATHS);
    const typesenseNames = parseCommaSeparated(process.env.TYPESENSE_COLLECTION_NAMES);
    const fieldsList = parsePipeSeparated(process.env.FIRESTORE_COLLECTION_FIELDS_LIST);
    const flattenList = parseBooleanList(process.env.FLATTEN_NESTED_DOCUMENTS_LIST);

    // Validate that we have matching counts
    if (firestorePaths.length !== typesenseNames.length) {
      throw new Error(`Mismatch in collection counts: ${firestorePaths.length} Firestore paths vs ${typesenseNames.length} Typesense names`);
    }

    // Create collection map
    const collectionMap = {};

    firestorePaths.forEach((path, index) => {
      collectionMap[path] = {
        firestorePath: path,
        typesenseCollection: typesenseNames[index],
        fields: fieldsList[index] || [],
        flattenNested: flattenList[index] || false,
      };
    });

    return collectionMap;
  }

  if (mode === "legacy") {
    const firestorePath = process.env.FIRESTORE_COLLECTION_PATH;
    const typesenseCollection = process.env.TYPESENSE_COLLECTION_NAME;

    return {
      [firestorePath]: {
        firestorePath,
        typesenseCollection,
        fields: parseCommaSeparated(process.env.FIRESTORE_COLLECTION_FIELDS),
        flattenNested: process.env.FLATTEN_NESTED_DOCUMENTS === "true",
      },
    };
  }

  throw new Error(
    "No Firestore collection config found. Set either the legacy single-collection params " +
      "(FIRESTORE_COLLECTION_PATH and TYPESENSE_COLLECTION_NAME) or the new multi-collection params " +
      "(FIRESTORE_COLLECTION_PATHS and TYPESENSE_COLLECTION_NAMES).",
  );
}

module.exports = {
  // Multi-collection configuration
  get collections() {
    return createCollectionConfigMap();
  },

  // Legacy single collection support (for backward compatibility)
  firestoreCollectionPath: process.env.FIRESTORE_COLLECTION_PATH,
  firestoreCollectionFields: (process.env.FIRESTORE_COLLECTION_FIELDS || "")
    .split(",")
    .map((f) => f.trim())
    .filter((f) => f),
  shouldFlattenNestedDocuments: process.env.FLATTEN_NESTED_DOCUMENTS === "true",

  // Global settings
  shouldLogTypesenseInserts: process.env.LOG_TYPESENSE_INSERTS === "true",
  typesenseHosts: (process.env.TYPESENSE_HOSTS || "").split(",").map((e) => e.trim()),
  typesensePort: process.env.TYPESENSE_PORT || 443,
  typesenseProtocol: process.env.TYPESENSE_PROTOCOL || "https",
  typesenseCollectionName: process.env.TYPESENSE_COLLECTION_NAME,
  typesenseAPIKey: process.env.TYPESENSE_API_KEY,
  typesenseBackfillTriggerDocumentInFirestore: "typesense_sync/backfill",
  typesenseBackfillBatchSize: 1000,

  // Helper functions
  parseCommaSeparated,
  parsePipeSeparated,
  parseBooleanList,
  hasLegacyCollectionConfig,
  hasMultiCollectionConfig,
  hasPartialLegacyCollectionConfig,
  hasPartialMultiCollectionConfig,
  getCollectionConfigMode,
  createCollectionConfigMap,
};
