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

  // Check if there's a collection specific sync setup
  const collectionsToSync = snapshot.after.get("firestore_collections");
  if (Array.isArray(collectionsToSync) && !collectionsToSync.includes(config.firestoreCollectionPath)) {
    functions.logger.error(
        "Skipping backfill. The `firestore_collections` key in " +
      `${config.typesenseBackfillTriggerDocumentInFirestore} did not contain collection ${config.firestoreCollectionPath}.`);
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

      const isSubcollection = config.firestoreCollectionPath.includes("/");
      let query;
      if (isSubcollection) {
        const collectionGroup = config.firestoreCollectionPath.split("/").pop();
        query = admin.firestore().collectionGroup(collectionGroup);
      } else {
        query= admin.firestore().collection(config.firestoreCollectionPath);
      }
      const querySnapshot = await query.get();

      let currentDocumentNumber = 0;
      let currentDocumentsBatch = [];
      for (const firestoreDocument of querySnapshot.docs) {
        currentDocumentNumber += 1;
        currentDocumentsBatch.push(utils.typesenseDocumentFromSnapshot(firestoreDocument));

        if (currentDocumentNumber === config.typesenseBackfillBatchSize) {
          try {
            await typesense
                .collections(encodeURIComponent(config.typesenseCollectionName))
                .documents()
                .import(currentDocumentsBatch);
            currentDocumentsBatch = [];
            functions.logger.info(`Imported ${currentDocumentNumber} documents into Typesense`);
          } catch (error) {
            functions.logger.error("Import error", error);
          }
        }
      }
      if (currentDocumentsBatch.length > 0) {
        try {
          await typesense
              .collections(encodeURIComponent(config.typesenseCollectionName))
              .documents()
              .import(currentDocumentsBatch);
          functions.logger.info(`Imported ${currentDocumentNumber} documents into Typesense`);
        } catch (error) {
          functions.logger.error("Import error", error);
        }
      }

      functions.logger.info("Done backfilling to Typesense from Firestore");
    });
