const functions = require("firebase-functions");
const admin = require("firebase-admin");
const config = require("./config");
const typesense = require("./typesenseClient");
const utils = require("./utils");

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const validateBackfillRun = (snapshot) => {
  if (![true, "true"].includes(snapshot.after.get("trigger"))) {
    functions.logger.error(
        "Skipping backfill. `trigger: true` key " +
      `was not found in Firestore document ${config.typesenseBackfillTriggerDocumentInFirestore}.`);
    return false;
  }
  return true;
};

module.exports = functions.handler.firestore.document
    .onWrite(async (snapshot, context) => {
      functions.logger.info("Backfilling " +
      `${config.firestoreCollectionFields.join(",")} fields in Firestore documents ` +
      `from ${config.firestoreCollectionPath} ` +
      `into Typesense Collection ${config.typesenseCollectionName} ` +
      `on ${config.typesenseHosts.join(",")}`);

      if (!validateBackfillRun(snapshot)) {
        return false;
      }

      const querySnapshot =
      await admin.firestore().collection(config.firestoreCollectionPath).get();
      let currentDocumentNumber = 0;
      let currentDocumentsBatch = [];
      querySnapshot.forEach(async (firestoreDocument) => {
        currentDocumentNumber += 1;
        currentDocumentsBatch.push(utils.typesenseDocumentFromSnapshot(firestoreDocument));

        if (currentDocumentNumber === config.typesenseBackfillBatchSize) {
          try {
            await typesense
                .collections(config.typesenseCollectionName)
                .documents()
                .import(currentDocumentsBatch);
            currentDocumentsBatch = [];
            functions.logger.info(`Imported ${currentDocumentNumber} documents into Typesense`);
          } catch (error) {
            functions.logger.error("Import error", error);
          }
        }
      });
      if (currentDocumentsBatch.length > 0) {
        try {
          await typesense
              .collections(config.typesenseCollectionName)
              .documents()
              .import(currentDocumentsBatch);
          functions.logger.info(`Imported ${currentDocumentNumber} documents into Typesense`);
        } catch (error) {
          functions.logger.error("Import error", error);
        }
      }

      functions.logger.info("Done backfilling to Typesense from Firestore");
    });
