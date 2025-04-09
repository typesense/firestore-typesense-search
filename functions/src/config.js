module.exports = {
  firestoreCollectionPath: process.env.FIRESTORE_COLLECTION_PATH,
  firestoreCollectionFields: (process.env.FIRESTORE_COLLECTION_FIELDS || "")
    .split(",")
    .map((f) => f.trim())
    .filter((f) => f),
  shouldFlattenNestedDocuments: process.env.FLATTEN_NESTED_DOCUMENTS === "true",
  shouldLogTypesenseInserts: process.env.LOG_TYPESENSE_INSERTS === "true",
  typesenseHosts: (process.env.TYPESENSE_HOSTS || "").split(",").map((e) => e.trim()),
  typesensePort: process.env.TYPESENSE_PORT || 443,
  typesenseProtocol: process.env.TYPESENSE_PROTOCOL || "https",
  typesenseCollectionName: process.env.TYPESENSE_COLLECTION_NAME,
  typesenseAPIKey: process.env.TYPESENSE_API_KEY,
  typesenseBackfillTriggerDocumentInFirestore: "typesense_sync/backfill",
  typesenseBackfillBatchSize: process.env.TYPESENSE_BACKFILL_BATCH_SIZE || 1000,
  typesenseUseBuffer: process.env.TYPESENSE_USE_BUFFER === "true",
  typesenseBufferCollectionInFirestore: process.env.TYPESENSE_BUFFER_COLLECTION_IN_FIRESTORE || "typesense_buffer",
  typesenseBufferBatchSize: process.env.TYPESENSE_BUFFER_BATCH_SIZE || 100,
  typesenseBufferMaxRetries: process.env.TYPESENSE_BUFFER_MAX_RETRIES || 3,
  typesenseBufferFlushInterval: process.env.TYPESENSE_BUFFER_FLUSH_INTERVAL || 1000 * 60 * 3, // 3 minutes
};
