const {debug} = require("firebase-functions/logger");
const config = require("./config.js");
const utils = require("./utils.js");
const createTypesenseClient = require("./createTypesenseClient.js");
const {onDocumentWritten} = require("firebase-functions/v2/firestore");

exports.indexOnWrite = onDocumentWritten(`${config.firestoreCollectionPath}/{docId}`, async (snapshot, _) => {
  const typesense = createTypesenseClient();

  if (snapshot.data.after.data() == null) {
    // Delete
    const documentId = snapshot.data.before.id;
    debug(`Deleting document ${documentId}`);
    return await typesense.collections(encodeURIComponent(config.typesenseCollectionName)).documents(encodeURIComponent(documentId)).delete();
  } else {
    // Create / update

    // snapshot.after.ref.get() will refetch the latest version of the document
    const latestSnapshot = await snapshot.data.after.ref.get();
    let typesenseDocument;
    if (config.transformFunctionName) {
      const transformedDocument = await utils.transformDocument(latestSnapshot);
      typesenseDocument = await utils.typesenseDocumentFromSnapshot(transformedDocument, snapshot.params);
    } else {
      typesenseDocument = await utils.typesenseDocumentFromSnapshot(latestSnapshot, snapshot.params);
    }

    if (config.shouldLogTypesenseInserts) {
      debug(`Upserting document ${JSON.stringify(typesenseDocument)}`);
    } else {
      debug(`Upserting document ${typesenseDocument.id}`);
    }
    return await typesense.collections(encodeURIComponent(config.typesenseCollectionName)).documents().upsert(typesenseDocument);
  }
});
