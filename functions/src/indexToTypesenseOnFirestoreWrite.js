const functions = require("firebase-functions");
const config = require("./config");
const typesense = require("./typesenseClient");
const utils = require("./utils");

module.exports = functions.handler.firestore.document
    .onWrite(async (snapshot, context) => {
      if (snapshot.after.data() == null) {
        // Delete
        const documentId = snapshot.before.id;
        functions.logger.debug(`Deleting document ${documentId}`);
        return await typesense
            .collections(encodeURIComponent(config.typesenseCollectionName))
            .documents(documentId)
            .delete();
      } else {
        // Create / update

        // snapshot.after.ref.get() will refetch the latest version of the document
        const latestSnapshot = await snapshot.after.ref.get();
        const typesenseDocument = utils.typesenseDocumentFromSnapshot(latestSnapshot);

        functions.logger.debug(`Upserting document ${JSON.stringify(typesenseDocument)}`);
        return await typesense
            .collections(encodeURIComponent(config.typesenseCollectionName))
            .documents()
            .upsert(typesenseDocument);
      }
    });
