import {onDocumentWritten} from "firebase-functions/firestore";
import {debug, info} from "firebase-functions/logger";
import {Errors} from "typesense";
import {isFirestoreData, matchCollection, type DocumentFailure, type FirestoreData} from "./collection.js";
import type {TypesenseDocumentId} from "./ids.js";
import type {DocumentTarget} from "./issues.js";
import * as params from "./params.js";
import {isUnderKitState, parseDocumentPath} from "./paths.js";
import {planSync, planWrite, type SyncPlan} from "./plan.js";
import {unreachable} from "./result.js";
import {getRuntime, type ReadyRuntime, type Runtime} from "./runtime.js";
import {attemptTypesense} from "./typesenseErrors.js";

interface SnapshotLike {
  data(): unknown;
}

interface WrittenSnapshotLike extends SnapshotLike {
  readonly ref: {
    readonly path: string;
    get(): Promise<SnapshotLike>;
  };
}

export interface DocumentChangeLike {
  readonly before: WrittenSnapshotLike;
  readonly after: WrittenSnapshotLike;
}

function dataOf(snapshot: SnapshotLike): FirestoreData | undefined {
  const data = snapshot.data();
  return isFirestoreData(data) ? data : undefined;
}

async function removeDocument(ready: ReadyRuntime, typesenseCollection: string, id: TypesenseDocumentId | undefined): Promise<DocumentFailure | undefined> {
  if (id === undefined) return undefined;
  debug(`Deleting document ${id} from collection ${typesenseCollection}`);
  return attemptTypesense(typesenseCollection, `delete document ${id}`, async () => {
    try {
      await ready.typesense.collections(typesenseCollection).documents(id).delete();
    } catch (error: unknown) {
      if (!(error instanceof Errors.ObjectNotFound)) throw error;
      debug(`Document ${id} was not in collection ${typesenseCollection}; nothing to delete`);
    }
  });
}

async function upsertDocument(ready: ReadyRuntime, typesenseCollection: string, plan: Extract<SyncPlan, {kind: "upsert"}>): Promise<DocumentFailure | undefined> {
  const built = await plan.build();
  if (!built.ok) return built.error;

  const document = {...built.value, id: plan.id};
  debug(`Upserting document ${ready.logInserts ? JSON.stringify(document) : plan.id} to collection ${typesenseCollection}`);
  return attemptTypesense(typesenseCollection, `upsert document ${plan.id}`, () => ready.typesense.collections(typesenseCollection).documents().upsert(document));
}

function isTransient(failure: DocumentFailure | undefined): boolean {
  return failure?.stage === "typesense" && failure.transient;
}

function reportedFailure(...failures: readonly (DocumentFailure | undefined)[]): DocumentFailure | undefined {
  return failures.find(isTransient) ?? failures.find((failure) => failure !== undefined);
}

async function executeSync(plan: SyncPlan, ready: ReadyRuntime, target: DocumentTarget): Promise<DocumentFailure | undefined> {
  const {typesenseCollection} = target;
  switch (plan.kind) {
    case "none":
      debug(`Skipping ${target.documentPath}: it is not indexed and does not qualify now`);
      return undefined;
    case "remove":
      return removeDocument(ready, typesenseCollection, plan.id);
    case "reject":
      return reportedFailure(plan.failure, await removeDocument(ready, typesenseCollection, plan.staleId));
    case "upsert": {
      const upserted = await upsertDocument(ready, typesenseCollection, plan);
      return reportedFailure(await removeDocument(ready, typesenseCollection, plan.staleId), upserted);
    }
    default:
      return unreachable(plan);
  }
}

export async function handleDocumentWrite(change: DocumentChangeLike, runtime: Runtime = getRuntime()): Promise<void> {
  const rawPath = change.after.ref.path || change.before.ref.path;
  if (isUnderKitState(rawPath)) return;

  if (!runtime.ready.ok) {
    await runtime.issues.record(runtime.ready.error);
    return;
  }
  const ready = runtime.ready.value;

  const documentPath = parseDocumentPath(rawPath);
  const match = documentPath === undefined ? undefined : matchCollection(ready.collections, documentPath);
  if (documentPath === undefined || match === undefined) {
    debug(`Skipping write for unconfigured document path: ${rawPath}`);
    return;
  }

  const {collection, context} = match;
  const target: DocumentTarget = {typesenseCollection: collection.typesenseCollection, documentPath};
  info(`Processing document in collection: ${collection.path} with ID: ${context.docId}`);

  const plan = planWrite(collection, context, dataOf(change.before), dataOf(change.after));
  let failure: DocumentFailure | undefined;
  switch (plan.kind) {
    case "skip":
      debug(`Skipping ${documentPath}: ${plan.reason}`);
      return;
    case "reject":
      failure = plan.failure;
      break;
    case "delete":
      failure = await removeDocument(ready, collection.typesenseCollection, plan.id);
      break;
    case "sync": {
      const latest = collection.consistency === "reread" ? dataOf(await change.after.ref.get()) : dataOf(change.after);
      failure = await executeSync(planSync(collection, context, plan.previousId, latest), ready, target);
      break;
    }
    default:
      unreachable(plan);
  }

  if (failure === undefined) return;
  await runtime.issues.record({...failure, target});
  if (isTransient(failure)) throw new Error(failure.message);
}

export const indexOnWrite = onDocumentWritten(
  {
    document: "{path=**}/{documentID}",
    database: params.database,
    region: params.location,
    timeoutSeconds: 540,
    secrets: [params.typesenseApiKey],
  },
  async (event) => {
    if (event.data === undefined) {
      debug("No change data in event, returning");
      return;
    }
    await handleDocumentWrite(event.data);
  },
);
