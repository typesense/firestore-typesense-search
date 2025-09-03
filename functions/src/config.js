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
 * Create collection configuration map from environment variables
 * @return {Object} Map of collection configurations keyed by Firestore path
 */
function createCollectionConfigMap() {
  const firestorePaths = parseCommaSeparated(process.env.FIRESTORE_COLLECTION_PATHS || process.env.FIRESTORE_COLLECTION_PATH);
  const typesenseNames = parseCommaSeparated(process.env.TYPESENSE_COLLECTION_NAMES || process.env.TYPESENSE_COLLECTION_NAME);
  const fieldsList = parsePipeSeparated(process.env.FIRESTORE_COLLECTION_FIELDS_LIST || process.env.FIRESTORE_COLLECTION_FIELDS);
  const flattenList = parseBooleanList(process.env.FLATTEN_NESTED_DOCUMENTS_LIST || process.env.FLATTEN_NESTED_DOCUMENTS);

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
  createCollectionConfigMap,
};
