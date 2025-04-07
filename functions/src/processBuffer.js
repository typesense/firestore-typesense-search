const {onSchedule} = require("firebase-functions/v2/scheduler");
const {info, debug, error} = require("firebase-functions/logger");
const config = require("./config.js");
const createTypesenseClient = require("./createTypesenseClient.js");
const {typesenseDocumentFromSnapshot} = require("./utils.js");

const admin = require("firebase-admin");
const {default: ImportError} = require("typesense/lib/Typesense/Errors/ImportError.js");

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

exports.processBuffer = onSchedule(config.typesenseBufferFlushInterval, async (event) => {
  await processTypesenseBuffer();
});

const createDeleteFilter = (ids) => {
  const commaSeparatedIds = ids.join(",");
  return `id:[${commaSeparatedIds}]`;
};

/**
 * Fetches pending buffer documents from Firestore
 * @return {Promise<FirebaseFirestore.QuerySnapshot>} Query snapshot of buffer documents
 */
const fetchPendingBufferDocuments = async () => {
  const bufferRef = admin
    .firestore()
    .collection(config.typesenseBufferCollectionInFirestore)
    .where("status", "in", ["pending", "retrying"])
    .where("retries", "<=", config.typesenseBufferMaxRetries)
    .orderBy("timestamp")
    .limit(config.typesenseBufferBatchSize);

  return bufferRef.get();
};

/**
 * Organizes buffer documents into batches for processing
 * @param {FirebaseFirestore.QuerySnapshot} bufferDocs - Query snapshot of buffer documents
 * @return {Object} Object containing categorized batches and document references
 */
const organizeBatchOperations = async (bufferDocs) => {
  const upsertBatch = [];
  const deleteBatch = [];
  const processBatch = admin.firestore().batch();
  const docRefs = new Map();

  bufferDocs.forEach((doc) => {
    const data = doc.data();
    const documentId = data.documentId;

    processBatch.update(doc.ref, {status: "processing"});
    docRefs.set(documentId, doc.ref);

    if (data.type === "upsert") {
      upsertBatch.push({
        id: documentId,
        ...data.document,
      });
    } else if (data.type === "delete") {
      deleteBatch.push(documentId);
    }
  });

  await processBatch.commit();

  return {
    upsertBatch,
    deleteBatch,
    docRefs,
  };
};

/**
 * Marks documents as completed in the buffer
 * @param {string[]} documentIds - IDs of documents to mark as completed
 * @param {Map} docRefs - Map of document IDs to Firestore references
 * @return {Promise<void>}
 */
const markDocumentsAsCompleted = async (documentIds, docRefs) => {
  const completionBatch = admin.firestore().batch();

  documentIds.forEach((documentId) => {
    const ref = docRefs.get(documentId);
    if (ref) {
      completionBatch.update(ref, {status: "completed"});
    }
  });

  await completionBatch.commit();
};

/**
 * Updates document status based on processing result
 * @param {FirebaseFirestore.DocumentReference} docRef - Firestore reference to the document
 * @param {string} errorMessage - Error message to store
 * @param {FirebaseFirestore.WriteBatch} batch - Firestore write batch to add the operation to
 * @return {Promise<void>}
 */
const updateDocumentStatus = async (docRef, errorMessage, batch) => {
  const doc = await docRef.get();
  const data = doc.data();

  if (data.retries >= config.typesenseBufferMaxRetries) {
    batch.update(docRef, {
      status: "failed",
      lastError: errorMessage,
    });
  } else {
    batch.update(docRef, {
      status: "retrying",
      retries: data.retries + 1,
      lastError: errorMessage,
    });
  }
};

/**
 * Processes upsert operations in Typesense
 * @param {Array} upsertBatch - Array of documents to upsert
 * @param {Map} docRefs - Map of document IDs to Firestore references
 * @param {Object} typesense - Typesense client instance
 * @return {Promise<void>}
 */
const processUpsertOperations = async (upsertBatch, docRefs, typesense) => {
  if (upsertBatch.length === 0) return;

  debug(`Upserting ${upsertBatch.length} documents`);

  try {
    const typesenseDocuments = await Promise.all(
      upsertBatch.map(async (doc) => {
        return await typesenseDocumentFromSnapshot({
          id: doc.id,
          data: () => doc,
        });
      }),
    );

    await typesense.collections(config.typesenseCollectionName).documents().import(typesenseDocuments, {action: "upsert", return_id: true});

    debug(`Successfully upserted ${typesenseDocuments.length} documents`);

    // Mark all documents as completed
    const documentIds = typesenseDocuments.map((doc) => doc.id);
    await markDocumentsAsCompleted(documentIds, docRefs);
  } catch (err) {
    const isImportError = err instanceof ImportError;
    const errorMessage = isImportError ? `Error upserting documents: ${JSON.stringify(err.payload.failedItems)}` : `Error upserting documents: ${err.message}`;

    error(errorMessage);

    const completionBatch = admin.firestore().batch();

    if (isImportError && err.payload && err.payload.failedItems) {
      const failedIds = new Map();
      err.payload.failedItems.forEach((item) => failedIds.set(item.id, {error: item.error}));

      for (const [documentId, docRef] of docRefs.entries()) {
        if (failedIds.has(documentId)) {
          const lastError = failedIds.get(documentId).error ?? err.message ?? "Unknown error";
          await updateDocumentStatus(docRef, lastError, completionBatch);
        }
      }
    }

    await completionBatch.commit();
  }
};

/**
 * Processes delete operations in Typesense
 * @param {string[]} deleteBatch - Array of document IDs to delete
 * @param {Map} docRefs - Map of document IDs to Firestore references
 * @param {Object} typesense - Typesense client instance
 * @return {Promise<void>}
 */
const processDeleteOperations = async (deleteBatch, docRefs, typesense) => {
  if (deleteBatch.length === 0) return;

  debug(`Deleting ${deleteBatch.length} documents`);

  try {
    const result = await typesense
      .collections(config.typesenseCollectionName)
      .documents()
      .delete({
        filter_by: createDeleteFilter(deleteBatch),
        batch_size: config.typesenseBufferBatchSize,
        return_id: true,
      });

    if (result.num_deleted !== deleteBatch.length) {
      const completionBatch = admin.firestore().batch();
      const missing = result.num_deleted === 0 ? deleteBatch : deleteBatch.filter((id) => !result.ids.includes(id));

      for (const id of missing) {
        const docRef = docRefs.get(id);
        if (docRef) {
          await updateDocumentStatus(docRef, "Missing from Typesense", completionBatch);
        }
      }

      await completionBatch.commit();
      error(`Missing ${missing.length} documents from delete batch: ${missing.join(", ")}`);
    } else {
      debug(`Successfully deleted ${deleteBatch.length} documents`);
      await markDocumentsAsCompleted(deleteBatch, docRefs);
    }
  } catch (err) {
    error(`Error deleting documents: ${err.message}`);

    const completionBatch = admin.firestore().batch();

    for (const documentId of deleteBatch) {
      const docRef = docRefs.get(documentId);
      if (docRef) {
        await updateDocumentStatus(docRef, err.message, completionBatch);
      }
    }

    await completionBatch.commit();
  }
};

/**
 * Main function to process the Typesense buffer
 * @return {Promise<void>}
 */
const processTypesenseBuffer = async () => {
  const typesense = createTypesenseClient();

  info("Processing buffer");

  const bufferDocs = await fetchPendingBufferDocuments();

  if (bufferDocs.empty) {
    info("No documents to process");
    return;
  }

  info(`Processing ${bufferDocs.size} documents`);

  const {upsertBatch, deleteBatch, docRefs} = await organizeBatchOperations(bufferDocs);

  await processUpsertOperations(upsertBatch, docRefs, typesense);
  await processDeleteOperations(deleteBatch, docRefs, typesense);

  info(`Completed processing ${bufferDocs.size} documents`);
};

exports.processTypesenseBuffer = processTypesenseBuffer;
