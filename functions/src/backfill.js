const {onDocumentWritten} = require("firebase-functions/v2/firestore");
const {info, error} = require("firebase-functions/logger");
const admin = require("firebase-admin");
const config = require("./config.js");
const createTypesenseClient = require("./createTypesenseClient.js");
const utils = require("./utils.js");

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const validateBackfillRun = (snapshot) => {
  if (![true, "true"].includes(snapshot.after.get("trigger"))) {
    error("Skipping backfill. `trigger: true` key " + `was not found in Firestore document ${config.typesenseBackfillTriggerDocumentInFirestore}.`);
    return false;
  }

  // Check if there's a collection specific sync setup
  const collectionsToSync = snapshot.after.get("firestore_collections");
  if (Array.isArray(collectionsToSync) && !collectionsToSync.includes(config.firestoreCollectionPath)) {
    error("Skipping backfill. The `firestore_collections` key in " + `${config.typesenseBackfillTriggerDocumentInFirestore} did not contain collection ${config.firestoreCollectionPath}.`);
    return false;
  }

  return true;
};

module.exports = onDocumentWritten(config.typesenseBackfillTriggerDocumentInFirestore, async (event) => {
  info(
      "Backfilling " +
      `${config.firestoreCollectionFields.join(",")} fields in Firestore documents ` +
      `from ${config.firestoreCollectionPath} ` +
      `into Typesense Collection ${config.typesenseCollectionName} ` +
      `on ${config.typesenseHosts.join(",")}`,
  );

  if (!validateBackfillRun(event.data)) {
    return false;
  }

  const typesense = createTypesenseClient();

  const querySnapshot = await admin.firestore().collection(config.firestoreCollectionPath);

  let lastDoc = null;

  do {
    const queryFotThisBatch = lastDoc ? querySnapshot.startAfter(lastDoc) : querySnapshot;
    const thisBatch = await queryFotThisBatch.limit(config.typesenseBackfillBatchSize).get();
    if (thisBatch.empty) {
      break;
    }
    const currentDocumentsBatch = await Promise.all(
        thisBatch.docs.map(async (doc) => {
          return await utils.typesenseDocumentFromSnapshot(doc);
        }),
    );

    lastDoc = thisBatch.docs.at(-1) ?? null;
    try {
      await typesense.collections(encodeURIComponent(config.typesenseCollectionName)).documents().import(currentDocumentsBatch);
      info(`Imported ${currentDocumentsBatch.length} documents into Typesense`);
    } catch (error) {
      error(`Import error in a batch of documents from ${currentDocumentsBatch[0].id} to ${lastDoc.id}`, error);
      if ("importResults" in error) {
        logImportErrors(error.importResults);
      }
    }

    if (currentDocumentsBatch.length < config.typesenseBackfillBatchSize) {
      break;
    }
    // Recurse on the next process tick, to avoid
    // issues with the event loop on firebase functions related to resource release
    await new Promise((resolve) => process.nextTick(resolve));
  } while (lastDoc);

  info("Done backfilling to Typesense from Firestore");
});

/**
 * Log import errors, if any.
 * @param {Typesense.ImportError} importResults
 */
function logImportErrors(importResults) {
  importResults.forEach((result) => {
    if (result.success) return;

    error(`Error importing document with error: ${result.error}`, result);
  });
}
