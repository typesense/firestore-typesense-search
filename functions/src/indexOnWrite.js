const {onDocumentWritten} = require("firebase-functions/v2/firestore");
const {debug} = require("firebase-functions/logger");
const config = require("./config.js");
const createTypesenseClient = require("./createTypesenseClient.js");
const utils = require("./utils.js");

module.exports = onDocumentWritten(config.firestoreCollectionPath, async (event) => {
  const typesense = createTypesenseClient();

  if (event.data.after.data() == null) {
    // Delete
    const documentId = event.data.before.id;
    debug(`Deleting document ${documentId}`);
    return await typesense.collections(encodeURIComponent(config.typesenseCollectionName)).documents(encodeURIComponent(documentId)).delete();
  } else {
    // Create / update

    // event.data.after.ref.get() will refetch the latest version of the document
    const latestEventData = await event.data.after.ref.get();
    const typesenseDocument = await utils.typesenseDocumentFromevent.data(latestEventData.data);

    debug(`Upserting document ${JSON.stringify(typesenseDocument)}`);
    return await typesense.collections(encodeURIComponent(config.typesenseCollectionName)).documents().upsert(typesenseDocument);
  }
});
