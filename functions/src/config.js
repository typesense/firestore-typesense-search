/**
 * @param {string} fieldNames
 * @return {Map} map of field names where key is the field name in Firestore and value is the field name in Typesense
 * @example
  * parseFieldNames("foo=bar, baz") => Map { "foo" => "bar", "baz" => "baz" }
  * parseFieldNames("foo=bar, baz=qux") => Map { "foo" => "bar", "baz" => "qux" }
  * parseFieldNames("foo=bar, baz=qux,") => Map { "foo" => "bar", "baz" => "qux" }
  * parseFieldNames("foo, baz = qux, bar , ") => Map { "foo" => "foo", "baz" => "qux", "bar" => "bar" }
  */
const parseFieldNames = (fieldNames) => new Map(
    fieldNames.split(",")
        .filter((v) => v)
        .map(
            (f) => {
              const [key, value = key] = f.split("=").map((p) => p.trim());
              return [key, value];
            },
        ),
);

module.exports = {
  firestoreCollectionPath: process.env.FIRESTORE_COLLECTION_PATH,
  firestoreCollectionFields:
  parseFieldNames(process.env.FIRESTORE_COLLECTION_FIELDS || ""),
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

