const {debug} = require("firebase-functions/logger");
const config = require("./config.js");
const utils = require("./utils.js");
const createTypesenseClient = require("./createTypesenseClient.js");
const {onDocumentWritten} = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

exports.indexOnWrite = onDocumentWritten(`${config.firestoreCollectionPath}/{docId}`, async (snapshot, _) => {
  const typesense = createTypesenseClient();

  if (config.typesenseUseBuffer) {
    return await bufferedWrites(snapshot);
  }

  return await realTimeWrites(snapshot, typesense);
});

const bufferedWrites = async (snapshot) => {
  if (snapshot.data.after.data() == null) {
    // Delete
    const documentId = snapshot.data.before.id;
    debug(`Buffering delete for document ${documentId}`);

    return await admin.firestore().collection(config.typesenseBufferCollectionInFirestore).add({
      documentId: documentId,
      type: "delete",
      status: "pending",
      timestamp: Date.now(),
      retries: 0,
      pathParams: snapshot.params,
    });
  } else {
    // Create / update
    const latestSnapshot = await snapshot.data.after.ref.get();
    const document = latestSnapshot.data();
    const documentId = latestSnapshot.id;

    debug(`Buffering upsert for document ${documentId}`);

    return await admin.firestore().collection(config.typesenseBufferCollectionInFirestore).add({
      documentId: documentId,
      document: document,
      type: "upsert",
      status: "pending",
      timestamp: Date.now(),
      retries: 0,
      pathParams: snapshot.params,
    });
  }
};

const realTimeWrites = async (snapshot, typesense) => {
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
};
