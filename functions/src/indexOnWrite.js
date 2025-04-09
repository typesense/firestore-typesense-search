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
    return await typesense.collections(config.typesenseCollectionName).documents(documentId).delete();
  } else {
    // Create / update

    // snapshot.after.ref.get() will refetch the latest version of the document
    const latestSnapshot = await snapshot.data.after.ref.get();
    const typesenseDocument = await utils.typesenseDocumentFromSnapshot(latestSnapshot, snapshot.params);

    if (config.shouldLogTypesenseInserts) {
      debug(`Upserting document ${JSON.stringify(typesenseDocument)}`);
    } else {
      debug(`Upserting document ${typesenseDocument.id}`);
    }
    return await typesense.collections(config.typesenseCollectionName).documents().upsert(typesenseDocument);
  }
});
