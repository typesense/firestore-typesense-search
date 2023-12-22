module.exports = {
  firestoreCollectionPath: process.env.FIRESTORE_COLLECTION_PATH,
  firestoreCollectionFields:
    (process.env.FIRESTORE_COLLECTION_FIELDS || "")
        .split(",")
        .map((f) => f.trim())
        .filter((f) => f),
  typesenseFieldsRenames: (process.env.TYPESENSE_FIELDS_RENAMES || "")
      .split(",")
      .map((f) => f.trim())
      .filter((f) => f)
      .map((f) => {
        const [from, to] = f.split(":").map((f) => f.trim());
        return {from, to};
      })
      .filter((f) => f.from && f.to),
  shouldFlattenNestedDocuments: process.env.FLATTEN_NESTED_DOCUMENTS === "true",
  typesenseHosts:
    process.env.TYPESENSE_HOSTS.split(",").map((e) => e.trim()),
  typesensePort: process.env.TYPESENSE_PORT || 443,
  typesenseProtocol: process.env.TYPESENSE_PROTOCOL || "https",
  typesenseCollectionName: process.env.TYPESENSE_COLLECTION_NAME,
  typesenseAPIKey: process.env.TYPESENSE_API_KEY,
  typesenseBackfillTriggerDocumentInFirestore: "typesense_sync/backfill",
  typesenseBackfillBatchSize: 1000,
};
