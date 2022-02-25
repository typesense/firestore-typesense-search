const functions = require("firebase-functions");
const config = require("./config");
const typesense = require("./typesenseClient");
const utils = require("./utils");

module.exports = functions.handler.firestore.document
    .onWrite((snapshot, context) => {
      if (snapshot.before.data() == null) {
        // Create
        const typesenseDocument = utils.typesenseDocumentFromSnapshot(snapshot.after);
        functions.logger.debug(`Creating document ${JSON.stringify(typesenseDocument)}`);
        return typesense
            .collections(encodeURIComponent(config.typesenseCollectionName))
            .documents()
            .create(typesenseDocument);
      } else if (snapshot.after.data() == null) {
        // Delete
        const documentId = snapshot.before.id;
        functions.logger.debug(`Deleting document ${documentId}`);
        return typesense
            .collections(encodeURIComponent(config.typesenseCollectionName))
            .documents(documentId)
            .delete();
      } else {
        // Update
        const typesenseDocument = utils.typesenseDocumentFromSnapshot(snapshot.after);
        functions.logger.debug(`Upserting document ${JSON.stringify(typesenseDocument)}`);
        return typesense
            .collections(encodeURIComponent(config.typesenseCollectionName))
            .documents()
            .upsert(typesenseDocument);
      }
    });
