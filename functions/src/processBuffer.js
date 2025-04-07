const {onSchedule} = require("firebase-functions/v2/scheduler");
const {info, debug, error} = require("firebase-functions/logger");
const config = require("./config.js");
const createTypesenseClient = require("./createTypesenseClient.js");
const {typesenseDocumentFromSnapshot} = require("./utils.js");

const admin = require("firebase-admin");
const {default: ImportError} = require("typesense/lib/Typesense/Errors/ImportError.js");

exports.processBuffer = onSchedule(config.typesenseBufferFlushInterval, async (event) => {
  await based();
});

const filterByDelete = (ids) => {
  const commaSeparatedIds = ids.join(",");
  return `id:[${commaSeparatedIds}]`;
};

const based = async () => {
  const typesense = createTypesenseClient();

  info("Processing buffer");

  const bufferRef = admin
    .firestore()
    .collection(config.typesenseBufferCollectionInFirestore)
    .where("status", "in", ["pending", "retrying"])
    .where("retries", "<=", config.typesenseBufferMaxRetries)
    .orderBy("timestamp")
    .limit(config.typesenseBufferBatchSize);

  const bufferDocs = await bufferRef.get();

  if (bufferDocs.empty) {
    info("No documents to process");
    return;
  }

  info(`Processing ${bufferDocs.size} documents`);

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

  if (upsertBatch.length > 0) {
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

      const completionBatch = admin.firestore().batch();
      typesenseDocuments.forEach((doc) => {
        const ref = docRefs.get(doc.id);
        if (ref) {
          completionBatch.update(ref, {status: "completed"});
        }
      });
      await completionBatch.commit();
    } catch (err) {
      !(err instanceof ImportError) ? error(`Error upserting documents: ${err.message}`) : error(`Error upserting documents: ${JSON.stringify(err.payload.failedItems)}`);

      const completionBatch = admin.firestore().batch();

      if (err.payload && err.payload.failedItems) {
        const failedIds = new Map();
        err.payload.failedItems.forEach((item) => failedIds.set(item.id, {error: item.error}));

        for (const [documentId, docRef] of docRefs.entries()) {
          if (failedIds.has(documentId)) {
            const doc = await docRef.get();
            const data = doc.data();
            const lastError = failedIds.get(documentId).error ?? err.message ?? "Unknown error";

            if (data.retries === config.typesenseBufferMaxRetries) {
              completionBatch.update(docRef, {
                status: "failed",
                lastError,
              });
            } else {
              completionBatch.update(docRef, {
                status: "retrying",
                retries: data.retries + 1,
                lastError,
              });
            }
          }
        }

        await completionBatch.commit();
      }
    }
  }

  if (deleteBatch.length > 0) {
    debug(`Deleting ${deleteBatch.length} documents`);
    try {
      const result = await typesense
        .collections(config.typesenseCollectionName)
        .documents()
        .delete({filter_by: filterByDelete(deleteBatch), batch_size: config.typesenseBufferBatchSize, return_id: true});

      if (result.num_deleted !== deleteBatch.length) {
        const completionBatch = admin.firestore().batch();
        const missing = result.num_deleted === 0 ? deleteBatch : deleteBatch.filter((id) => !result.ids.includes(id));

        for (const id of missing) {
          const docRef = docRefs.get(id);

          const doc = await docRef.get();
          const data = doc.data();

          if (data.retries < config.typesenseBufferMaxRetries) {
            completionBatch.update(docRef, {
              status: "retrying",
              retries: data.retries + 1,
              lastError: "Missing from Typesense",
            });
          } else {
            completionBatch.update(docRef, {status: "failed", lastError: "Missing from Typesense"});
          }
        }

        await completionBatch.commit();

        error(`Missing ${missing.length} documents from delete batch: ${missing.join(", ")}`);
      } else {
        debug(`Successfully deleted ${deleteBatch.length} documents`);

        const completionBatch = admin.firestore().batch();
        deleteBatch.forEach((documentId) => {
          const ref = docRefs.get(documentId);
          if (ref) {
            completionBatch.update(ref, {status: "completed"});
          }
        });
        await completionBatch.commit();
      }
    } catch (err) {
      error(`Error deleting documents: ${err.message}`);

      const completionBatch = admin.firestore().batch();

      for (const documentId of deleteBatch) {
        const docRef = docRefs.get(documentId);
        if (docRef) {
          const doc = await docRef.get();
          const data = doc.data();

          if (data.retries < config.typesenseBufferMaxRetries) {
            completionBatch.update(docRef, {
              status: "retrying",
              retries: data.retries + 1,
              lastError: err.message,
            });
          } else {
            completionBatch.update(docRef, {
              status: "failed",
              lastError: err.message,
            });
          }
        }
      }

      await completionBatch.commit();
    }
  }

  info(`Completed processing ${bufferDocs.size} documents`);
};

exports.based = based;
