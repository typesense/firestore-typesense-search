/* eslint-disable indent */
const {onDocumentWritten} = require("firebase-functions/v2/firestore");
const {error, info, debug} = require("firebase-functions/logger");

const admin = require("firebase-admin");
const config = require("./config.js");
const createTypesenseClient = require("./createTypesenseClient.js");
const utils = require("./utils.js");

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const validateBackfillRun = (data) => {
  if (![true, "true"].includes(data.after.get("trigger"))) {
    error("Skipping backfill. `trigger: true` key " + `was not found in Firestore document ${config.typesenseBackfillTriggerDocumentInFirestore}.`);
    return false;
  }

  // Check if there's a collection specific sync setup
  const collectionsToSync = data.after.get("firestore_collections");
  if (Array.isArray(collectionsToSync) && !collectionsToSync.includes(config.firestoreCollectionPath)) {
    error(
      "Skipping backfill. The `firestore_collections` key in " +
        `${config.typesenseBackfillTriggerDocumentInFirestore} did not contain collection ${config.firestoreCollectionPath}. ${collectionsToSync}`,
    );
    return false;
  }

  return true;
};

module.exports = onDocumentWritten("typesense_sync/backfill", async (snapshot, context) => {
  info(
    "Backfilling " +
      `${config.firestoreCollectionFields.join(",")} fields in Firestore documents ` +
      `from ${config.firestoreCollectionPath} ` +
      `into Typesense Collection ${config.typesenseCollectionName} ` +
      `on ${config.typesenseHosts.join(",")}`,
  );

  if (!snapshot.data) {
    return;
  }

  if (!validateBackfillRun(snapshot.data)) {
    return false;
  }

  const typesense = createTypesenseClient();

  const pathSegments = config.firestoreCollectionPath.split("/").filter(Boolean);
  const pathPlaceholders = utils.parseFirestorePath(config.firestoreCollectionPath);
  const isGroupQuery = pathSegments.length > 1 && Object.values(pathPlaceholders).length;

  let querySnapshot;
  if (isGroupQuery) {
    const collectionGroup = pathSegments.pop();
    querySnapshot = admin.firestore().collectionGroup(collectionGroup);
  } else {
    querySnapshot = admin.firestore().collection(config.firestoreCollectionPath);
  }

  let lastDoc = null;

  do {
    const queryFotThisBatch = lastDoc ? querySnapshot.startAfter(lastDoc) : querySnapshot;
    const thisBatch = await queryFotThisBatch.limit(config.typesenseBackfillBatchSize).get();
    if (thisBatch.empty) {
      break;
    }
    const currentDocumentsBatch = (
      await Promise.all(
        thisBatch.docs.map(async (doc) => {
          const docPath = doc.ref.path;
          const pathParams = utils.pathMatchesSelector(docPath, config.firestoreCollectionPath);

          if (!isGroupQuery || (isGroupQuery && pathParams !== null)) {
            const typesenseDocument = await utils.typesenseDocumentFromSnapshot(doc, pathParams);
            if (config.shouldLogTypesenseInserts) {
              debug(`Backfilling document ${JSON.stringify(typesenseDocument)}`);
            }
            return typesenseDocument;
          } else {
            return null;
          }
        }),
      )
    ).filter((doc) => doc !== null);

    lastDoc = thisBatch.docs.at(-1) ?? null;
    try {
      await typesense.collections(config.typesenseCollectionName).documents().import(currentDocumentsBatch, {action: "upsert", return_id: true});
      info(`Imported ${currentDocumentsBatch.length} documents into Typesense`);
    } catch (err) {
      error(`Import error in a batch of documents from ${currentDocumentsBatch[0].id} to ${lastDoc.id}`, err);
      if ("importResults" in err) {
        logImportErrors(err.importResults);
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
