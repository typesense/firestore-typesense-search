const {debug} = require("firebase-functions/logger");
const config = require("./config.js");
const utils = require("./utils.js");
const createTypesenseClient = require("./createTypesenseClient.js");
const {warnIfUsingLegacyCollectionConfig} = require("./deprecation.js");
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

/**
 * Find the collection config that matches a Firestore document path.
 * @param {string} documentPath - Firestore document path.
 * @return {[string, Object]|undefined} Matching collection entry, if any.
 */
function findCollectionConfigForDocumentPath(documentPath) {
  return Object.entries(config.collections).find(([firestorePath]) => utils.pathMatchesSelector(documentPath, firestorePath) !== null);
}

exports.indexOnWrite = onDocumentWritten("{path=**}/{docId}", async (snapshot) => {
  warnIfUsingLegacyCollectionConfig();

  const documentPath = snapshot.data.after?.ref.path || snapshot.data.before?.ref.path;
  const matchedCollection = documentPath ? findCollectionConfigForDocumentPath(documentPath) : null;

  if (!matchedCollection) {
    debug(`Skipping write for unconfigured document path: ${documentPath || "unknown"}`);
    return;
  }

  const [firestorePath, collectionConfig] = matchedCollection;
  const pathParams = utils.pathMatchesSelector(documentPath, firestorePath) || {};

  console.log(`Processing document in collection: ${firestorePath} with ID: ${snapshot.data.after?.id || snapshot.data.before?.id}`);
  debug(`Processing document in collection: ${firestorePath}`);

  const collectionConfigWithParams = {
    ...collectionConfig,
    pathParams,
  };

  return await handleDocumentIndexing(snapshot, collectionConfigWithParams, pathParams);
});
