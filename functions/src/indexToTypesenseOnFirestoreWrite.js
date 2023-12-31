const functions = require("firebase-functions");
const config = require("./config.js");
const createTypesenseClient = require("./createTypesenseClient.js");
const utils = require("./utils.js");

module.exports = functions.firestore.document(config.firestoreCollectionPath)
    .onWrite(async (snapshot, context) => {
      const typesense = createTypesenseClient();

      if (snapshot.after.data() == null) {
      // Delete
        const documentId = snapshot.before.id;
        functions.logger.debug(`Deleting document ${documentId}`);
        return await typesense
            .collections(encodeURIComponent(config.typesenseCollectionName))
            .documents(encodeURIComponent(documentId))
            .delete();
      } else {
      // Create / update

        // snapshot.after.ref.get() will refetch the latest version of the document
        const latestSnapshot = await snapshot.after.ref.get();
        const typesenseDocument = await utils.typesenseDocumentFromSnapshot(latestSnapshot);

        functions.logger.debug(`Upserting document ${JSON.stringify(typesenseDocument)}`);
        return await typesense
            .collections(encodeURIComponent(config.typesenseCollectionName))
            .documents().upsert(typesenseDocument, {"action": "emplace", "dirty_values": "coerce_or_drop"});
      }
    });
