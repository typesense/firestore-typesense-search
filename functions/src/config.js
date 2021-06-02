module.exports = {
  firestoreCollectionPath: process.env.FIRESTORE_COLLECTION_PATH,
  firestoreCollectionFields:
    process.env.FIRESTORE_COLLECTION_FIELDS.split(",").map((e) => e.trim()),
  typesenseHosts:
    process.env.TYPESENSE_HOSTS.split(",").map((e) => e.trim()),
  typesenseCollectionName: process.env.TYPESENSE_COLLECTION_NAME,
  typesenseAPIKey: process.env.TYPESENSE_API_KEY,
  typesenseBackfillTriggerDocumentInFirestore: "typesense_sync/backfill",
  typesenseBackfillBatchSize: 1000,
};
