/* eslint-disable indent */
const {onDocumentWritten} = require("firebase-functions/v2/firestore");
const {error, info, debug} = require("firebase-functions/logger");

const admin = require("firebase-admin");
const config = require("./config.js");
const createTypesenseClient = require("./createTypesenseClient.js");
const utils = require("./utils.js");
const {warnIfUsingLegacyCollectionConfig} = require("./deprecation.js");

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const validateBackfillRun = (data) => {
  if (![true, "true"].includes(data.after.get("trigger"))) {
    error("Skipping backfill. `trigger: true` key " + `was not found in Firestore document ${config.typesenseBackfillTriggerDocumentInFirestore}.`);
    return false;
  }

  const collectionsToSync = data.after.get("firestore_collections");

  // If firestore_collections is not provided, we'll backfill all collections
  if (collectionsToSync !== undefined && !Array.isArray(collectionsToSync)) {
    error("Skipping backfill. The `firestore_collections` key in " + `${config.typesenseBackfillTriggerDocumentInFirestore} is not an array.`);
    return false;
  }

  if (Array.isArray(collectionsToSync) && collectionsToSync.length > 0) {
    const configuredCollections = Object.keys(config.collections);
    const hasMatchingCollection = configuredCollections.some((collection) => collectionsToSync.includes(collection));

    if (!hasMatchingCollection) {
      error(
        "Skipping backfill. The `firestore_collections` key in " +
          `${config.typesenseBackfillTriggerDocumentInFirestore} did not contain any of the configured collections: ${configuredCollections}. Requested: ${collectionsToSync}`,
      );
      return false;
    }
  }

  return true;
};

/**
 * Backfill a single collection
 * @param {string} firestorePath - Firestore collection path
 * @param {Object} collectionConfig - Collection-specific configuration
 * @param {Typesense.Client} typesense - Typesense client
 */
async function backfillCollection(firestorePath, collectionConfig, typesense) {
  const pathSegments = firestorePath.split("/").filter(Boolean);
  const pathPlaceholders = utils.parseFirestorePath(firestorePath);
  const isGroupQuery = pathSegments.length > 1 && Object.values(pathPlaceholders).length;

  let querySnapshot;
  if (isGroupQuery) {
    const collectionGroup = pathSegments.pop();
    querySnapshot = admin.firestore().collectionGroup(collectionGroup);
  } else {
    querySnapshot = admin.firestore().collection(firestorePath);
  }

  let lastDoc = null;
  let totalImported = 0;

  do {
    const queryForThisBatch = lastDoc ? querySnapshot.startAfter(lastDoc) : querySnapshot;
    const thisBatch = await queryForThisBatch.limit(config.typesenseBackfillBatchSize).get();
    if (thisBatch.empty) {
      break;
    }

    const currentDocumentsBatch = (
      await Promise.all(
        thisBatch.docs.map(async (doc) => {
          const docPath = doc.ref.path;
          const pathParams = utils.pathMatchesSelector(docPath, firestorePath);

          if (!isGroupQuery || (isGroupQuery && pathParams !== null)) {
            const typesenseDocument = await utils.createTypesenseDocument(doc, collectionConfig, pathParams);
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

    if (currentDocumentsBatch.length > 0) {
      try {
        await typesense.collections(encodeURIComponent(collectionConfig.typesenseCollection)).documents().import(currentDocumentsBatch, {action: "upsert", return_id: true});
        totalImported += currentDocumentsBatch.length;
      } catch (err) {
        error(`Import error in a batch of documents from ${currentDocumentsBatch[0].id} to ${lastDoc.id}`, err);
        if ("importResults" in err) {
          logImportErrors(err.importResults);
        }
      }
    }

    if (currentDocumentsBatch.length < config.typesenseBackfillBatchSize) {
      break;
    }
    // Recurse on the next process tick, to avoid
    // issues with the event loop on firebase functions related to resource release
    await new Promise((resolve) => process.nextTick(resolve));
  } while (lastDoc);

  return totalImported;
}

module.exports = onDocumentWritten("typesense_sync/backfill", async (snapshot, context) => {
  warnIfUsingLegacyCollectionConfig();

  if (!snapshot.data) {
    info("No snapshot data, returning");
    return;
  }

  if (!validateBackfillRun(snapshot.data)) {
    info("Backfill validation failed, returning false");
    return false;
  }

  const typesense = createTypesenseClient();
  const collections = config.collections;

  const collectionsToSync = snapshot.data.after.get("firestore_collections");
  let collectionsToProcess;

  if (Array.isArray(collectionsToSync)) {
    collectionsToProcess = Object.entries(collections).filter(([path, config]) => collectionsToSync.includes(path));
    info(`Filtered collections to process: ${collectionsToProcess.map(([path]) => path).join(", ")}`);
  } else {
    collectionsToProcess = Object.entries(collections);
    info(`Processing all collections: ${collectionsToProcess.map(([path]) => path).join(", ")}`);
  }

  info(`Starting backfill for ${collectionsToProcess.length} collections: ${collectionsToProcess.map(([path]) => path).join(", ")}`);

  for (const [firestorePath, collectionConfig] of collectionsToProcess) {
    info(`Processing collection: ${firestorePath}`);
    try {
      await backfillCollection(firestorePath, collectionConfig, typesense);
    } catch (err) {
      error(`Error backfilling collection ${firestorePath}:`, err);
    }
  }

  info("Completed backfill for all collections");
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
