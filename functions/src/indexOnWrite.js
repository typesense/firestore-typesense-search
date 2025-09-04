const {debug} = require("firebase-functions/logger");
const config = require("./config.js");
const utils = require("./utils.js");
const createTypesenseClient = require("./createTypesenseClient.js");
const {onDocumentWritten} = require("firebase-functions/v2/firestore");

/**
 * Handle document indexing for a specific collection
 * @param {DocumentSnapshot} snapshot - Firestore document snapshot
 * @param {Object} collectionConfig - Collection-specific configuration
 * @param {Object} contextParams - Context parameters from the trigger
 */
async function handleDocumentIndexing(snapshot, collectionConfig, contextParams) {
  const typesense = createTypesenseClient();
  const collectionName = encodeURIComponent(collectionConfig.typesenseCollection);

  if (snapshot.data.after.data() == null) {
    // Delete
    const documentId = snapshot.data.before.id;
    debug(`Deleting document ${documentId} from collection ${collectionConfig.typesenseCollection}`);
    return await typesense.collections(collectionName).documents(encodeURIComponent(documentId)).delete();
  } else {
    // Create / update
    const latestSnapshot = await snapshot.data.after.ref.get();
    const typesenseDocument = await utils.createTypesenseDocument(latestSnapshot, collectionConfig, contextParams);

    if (config.shouldLogTypesenseInserts) {
      debug(`Upserting document ${JSON.stringify(typesenseDocument)} to collection ${collectionConfig.typesenseCollection}`);
    } else {
      debug(`Upserting document ${typesenseDocument.id} to collection ${collectionConfig.typesenseCollection}`);
    }

    return await typesense.collections(collectionName).documents().upsert(typesenseDocument);
  }
}

Object.entries(config.collections).forEach(([firestorePath, collectionConfig]) => {
  const functionName = `indexOnWrite_${firestorePath.replace(/[^a-zA-Z0-9]/g, "_")}`;

  exports[functionName] = onDocumentWritten(`${firestorePath}/{docId}`, async (snapshot, context) => {
    console.log(`Processing document in collection: ${firestorePath} with ID: ${snapshot.data.after?.id || snapshot.data.before?.id}`);
    debug(`Processing document in collection: ${firestorePath}`);

    const collectionConfigWithParams = {
      ...collectionConfig,
      pathParams: snapshot.params,
    };

    return await handleDocumentIndexing(snapshot, collectionConfigWithParams, snapshot.params);
  });
});

// Legacy single collection support (for backward compatibility)
if (config.firestoreCollectionPath && config.typesenseCollectionName) {
  exports.indexOnWrite = onDocumentWritten(`${config.firestoreCollectionPath}/{docId}`, async (snapshot, context) => {
    debug(`Processing document in legacy collection: ${config.firestoreCollectionPath}`);

    const legacyCollectionConfig = {
      firestorePath: config.firestoreCollectionPath,
      typesenseCollection: config.typesenseCollectionName,
      fields: config.firestoreCollectionFields,
      flattenNested: config.shouldFlattenNestedDocuments,
    };

    return await handleDocumentIndexing(snapshot, legacyCollectionConfig, snapshot.params);
  });
}
