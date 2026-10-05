import {getFirestore, type DocumentSnapshot} from "firebase-admin/firestore";
import {onDocumentWritten} from "firebase-functions/firestore";
import {debug, error, info} from "firebase-functions/logger";
import {Errors, type Client} from "typesense";
import {
  BACKFILL_BATCH_SIZE,
  BACKFILL_TRIGGER_DOCUMENT,
  createCollectionConfigMap,
  getTypesenseConnectionConfig,
  shouldLogTypesenseInserts,
  type CollectionConfig,
  type CollectionConfigMap,
} from "./config.js";
import {getDefaultApp} from "./firebaseApp.js";
import {createTypesenseDocument, type DocumentSnapshotLike, type TypesenseDocument} from "./document.js";
import * as params from "./params.js";
import {parseFirestorePath, pathMatchesSelector} from "./paths.js";
import {createTypesenseClient} from "./typesenseClient.js";

interface QueryDocumentLike extends DocumentSnapshotLike {
  readonly ref: {readonly path: string};
}

interface QuerySnapshotLike {
  readonly empty: boolean;
  readonly size: number;
  readonly docs: readonly QueryDocumentLike[];
}

interface QueryLike {
  startAfter(document: QueryDocumentLike): QueryLike;
  limit(limit: number): QueryLike;
  get(): Promise<QuerySnapshotLike>;
}

export interface FirestoreLike {
  collection(collectionPath: string): QueryLike;
  collectionGroup(collectionId: string): QueryLike;
}

type BackfillRequest = {readonly kind: "all"} | {readonly kind: "only"; readonly firestorePaths: readonly unknown[]};

function parseBackfillRequest(trigger: Pick<DocumentSnapshot, "get">, collections: CollectionConfigMap): BackfillRequest | undefined {
  const triggerValue: unknown = trigger.get("trigger");
  if (triggerValue !== true && triggerValue !== "true") {
    error(`Skipping backfill. \`trigger: true\` key was not found in Firestore document ${BACKFILL_TRIGGER_DOCUMENT}.`);
    return undefined;
  }

  const requested: unknown = trigger.get("firestore_collections");
  if (requested === undefined) {
    return {kind: "all"};
  }
  if (!Array.isArray(requested)) {
    error(`Skipping backfill. The \`firestore_collections\` key in ${BACKFILL_TRIGGER_DOCUMENT} is not an array.`);
    return undefined;
  }

  const firestorePaths: readonly unknown[] = requested;
  const configured = Object.keys(collections);
  if (firestorePaths.length > 0 && !configured.some((path) => firestorePaths.includes(path))) {
    error(
      `Skipping backfill. The \`firestore_collections\` key in ${BACKFILL_TRIGGER_DOCUMENT} did not contain any of the configured collections: ` +
        `${configured.join(",")}. Requested: ${firestorePaths.map(String).join(",")}`,
    );
    return undefined;
  }
  return {kind: "only", firestorePaths};
}

function logImportErrors(err: InstanceType<typeof Errors.ImportError>): void {
  for (const result of err.importResults) {
    if (!result.success) {
      error(`Error importing document with error: ${result.error}`, result);
    }
  }
}

async function backfillCollection(firestore: FirestoreLike, collectionConfig: CollectionConfig, typesense: Client): Promise<number> {
  const {firestorePath} = collectionConfig;
  const pathSegments = firestorePath.split("/").filter((segment) => segment !== "");
  const collectionGroupId = pathSegments.at(-1);
  const isGroupQuery = pathSegments.length > 1 && Object.keys(parseFirestorePath(firestorePath)).length > 0;

  const query: QueryLike = isGroupQuery && collectionGroupId !== undefined ? firestore.collectionGroup(collectionGroupId) : firestore.collection(firestorePath);
  const shouldLog = shouldLogTypesenseInserts();
  const documents = typesense.collections<TypesenseDocument>(collectionConfig.typesenseCollection).documents();

  let lastDoc: QueryDocumentLike | undefined;
  let totalImported = 0;

  for (;;) {
    const batchQuery = lastDoc === undefined ? query : query.startAfter(lastDoc);
    const batch = await batchQuery.limit(BACKFILL_BATCH_SIZE).get();
    if (batch.empty) break;

    const typesenseDocuments: TypesenseDocument[] = [];
    for (const doc of batch.docs) {
      const pathParams = pathMatchesSelector(doc.ref.path, firestorePath);
      if (isGroupQuery && pathParams === null) continue;

      const typesenseDocument = createTypesenseDocument(doc, collectionConfig, pathParams ?? {});
      if (shouldLog) {
        debug(`Backfilling document ${JSON.stringify(typesenseDocument)}`);
      }
      typesenseDocuments.push(typesenseDocument);
    }

    lastDoc = batch.docs.at(-1);

    if (typesenseDocuments.length > 0) {
      try {
        await documents.import(typesenseDocuments, {action: "upsert", return_id: true});
        totalImported += typesenseDocuments.length;
      } catch (err: unknown) {
        error(`Import error in a batch of documents from ${typesenseDocuments[0]?.id ?? "?"} to ${lastDoc?.id ?? "?"}`, err);
        if (err instanceof Errors.ImportError) {
          logImportErrors(err);
        }
      }
    }

    if (batch.size < BACKFILL_BATCH_SIZE) break;

    // Recurse on the next process tick, to avoid
    // issues with the event loop on firebase functions related to resource release
    await new Promise<void>((resolve) => {
      process.nextTick(resolve);
    });
  }

  return totalImported;
}

export async function handleBackfillTrigger(trigger: Pick<DocumentSnapshot, "get">, firestore: FirestoreLike): Promise<void> {
  const collections = createCollectionConfigMap();
  const request = parseBackfillRequest(trigger, collections);
  if (request === undefined) {
    info("Backfill validation failed, returning");
    return;
  }

  const allCollections = Object.values(collections);
  const collectionsToProcess = request.kind === "all" ? allCollections : allCollections.filter((config) => request.firestorePaths.includes(config.firestorePath));
  const names = collectionsToProcess.map((config) => config.firestorePath).join(", ");
  info(request.kind === "all" ? `Processing all collections: ${names}` : `Filtered collections to process: ${names}`);
  info(`Starting backfill for ${collectionsToProcess.length} collections: ${names}`);

  const typesense = createTypesenseClient(getTypesenseConnectionConfig());
  for (const collectionConfig of collectionsToProcess) {
    info(`Processing collection: ${collectionConfig.firestorePath}`);
    try {
      await backfillCollection(firestore, collectionConfig, typesense);
    } catch (err: unknown) {
      error(`Error backfilling collection ${collectionConfig.firestorePath}:`, err);
    }
  }

  info("Completed backfill for all collections");
}

export const backfill = onDocumentWritten(
  {
    document: BACKFILL_TRIGGER_DOCUMENT,
    database: params.database,
    region: params.location,
    timeoutSeconds: 540,
    memory: "2GiB",
    secrets: [params.typesenseApiKey],
  },
  async (event) => {
    if (event.data === undefined) {
      info("No snapshot data, returning");
      return;
    }
    await handleBackfillTrigger(event.data.after, getFirestore(getDefaultApp(), params.database.value()));
  },
);
