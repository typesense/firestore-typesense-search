import {Timestamp} from "firebase-admin/firestore";
import {onDocumentWritten} from "firebase-functions/firestore";
import {debug, error, info} from "firebase-functions/logger";
import {errorText, isFirestoreData, matchCollection, type DocumentBody, type DocumentFailure, type ResolvedCollection} from "./collection.js";
import {BACKFILL_BATCH_SIZE, BACKFILL_STATUS_DOCUMENT, BACKFILL_TRIGGER_DOCUMENT, ISSUES_COLLECTION} from "./config.js";
import {documentIssueId} from "./issues.js";
import * as params from "./params.js";
import {parseDocumentPath, parseFirestorePath, type DocumentPath} from "./paths.js";
import {err, ok, unreachable, type Result} from "./result.js";
import {getRuntime, type ReadyRuntime, type Runtime} from "./runtime.js";
import type {KitFirestore, QueryDocumentLike, QueryLike} from "./store.js";
import {deterministicFailure} from "./typesenseErrors.js";

const MAX_REPORTED_FAILURES = 20;

export interface TriggerLike {
  get(field: string): unknown;
}

export type BackfillRequest = {readonly kind: "all"} | {readonly kind: "only"; readonly firestorePaths: readonly string[]; readonly unknownPaths: readonly string[]};

interface CollectionCounts {
  read: number;
  indexed: number;
  excluded: number;
  failed: number;
}

type CollectionReport = CollectionCounts & {
  readonly firestorePath: string;
  readonly typesenseCollection: string;
  readonly error?: string;
};

type BackfillFailure = {
  readonly documentPath: string;
  readonly typesenseCollection: string;
  readonly stage: DocumentFailure["stage"];
  readonly message: string;
};

type BackfillStatus =
  | {readonly state: "running"; readonly startedAt: Timestamp; readonly request: BackfillRequest; readonly collections: readonly string[]}
  | {
      readonly state: "completed";
      readonly startedAt: Timestamp;
      readonly finishedAt: Timestamp;
      readonly request: BackfillRequest;
      readonly collections: readonly CollectionReport[];
      readonly failureCount: number;
      readonly failures: readonly BackfillFailure[];
    }
  | {readonly state: "rejected"; readonly finishedAt: Timestamp; readonly message: string; readonly problems: readonly string[]};

interface PendingDocument {
  readonly documentPath: DocumentPath;
  readonly document: DocumentBody;
}

interface ImportOutcome {
  readonly success: boolean;
  readonly error?: unknown;
}

interface ImportResult {
  readonly indexed: readonly DocumentPath[];
  readonly stop?: string;
}

interface CollectionRun {
  readonly firestore: KitFirestore;
  readonly ready: ReadyRuntime;
  readonly collection: ResolvedCollection;
  readonly counts: CollectionCounts;
  readonly failures: BackfillFailure[];
}

function isImportOutcome(value: unknown): value is ImportOutcome {
  return isFirestoreData(value) && typeof value["success"] === "boolean";
}

async function writeStatus(firestore: KitFirestore, status: BackfillStatus): Promise<void> {
  await firestore.doc(BACKFILL_STATUS_DOCUMENT).set(status);
}

function parseBackfillRequest(trigger: TriggerLike, configuredPaths: readonly string[]): Result<BackfillRequest, string> {
  const requested = trigger.get("firestore_collections");
  if (requested === undefined) return ok({kind: "all"});
  if (!Array.isArray(requested) || !requested.every((path): path is string => typeof path === "string")) {
    return err(`The \`firestore_collections\` key in ${BACKFILL_TRIGGER_DOCUMENT} must be a list of Firestore collection paths.`);
  }

  const firestorePaths: readonly string[] = requested;
  const unknownPaths = firestorePaths.filter((path) => !configuredPaths.includes(path));
  if (firestorePaths.length > 0 && unknownPaths.length === firestorePaths.length) {
    return err(
      `The \`firestore_collections\` key in ${BACKFILL_TRIGGER_DOCUMENT} did not contain any of the configured collections: ${configuredPaths.join(",")}. Requested: ${firestorePaths.join(",")}`,
    );
  }
  return ok({kind: "only", firestorePaths, unknownPaths});
}

function recordFailure(run: CollectionRun, documentPath: string, failure: Pick<DocumentFailure, "stage" | "message">): void {
  run.counts.failed += 1;
  if (run.failures.length < MAX_REPORTED_FAILURES) {
    run.failures.push({documentPath, typesenseCollection: run.collection.typesenseCollection, stage: failure.stage, message: failure.message});
  }
}

async function loadIssueIds(firestore: KitFirestore, typesenseCollection: string): Promise<Set<string>> {
  const ids = new Set<string>();
  const query = firestore.collection(ISSUES_COLLECTION).where("collection", "==", typesenseCollection);
  let last: QueryDocumentLike | undefined;
  for (;;) {
    const page = await (last === undefined ? query : query.startAfter(last)).limit(BACKFILL_BATCH_SIZE).get();
    for (const doc of page.docs) ids.add(doc.id);
    last = page.docs.at(-1);
    if (page.size < BACKFILL_BATCH_SIZE) return ids;
  }
}

async function importDocuments(run: CollectionRun, pending: readonly PendingDocument[]): Promise<ImportResult> {
  if (pending.length === 0) return {indexed: []};
  const {typesenseCollection} = run.collection;

  let results: unknown;
  try {
    results = await run.ready.typesense
      .collections(typesenseCollection)
      .documents()
      .import(
        pending.map(({document}) => document),
        {action: "upsert", return_id: true, throwOnFail: false},
      );
  } catch (importError: unknown) {
    error(`Import error in a batch of documents from ${pending[0]?.documentPath ?? "?"} to ${pending.at(-1)?.documentPath ?? "?"}`, importError);
    const rejection = deterministicFailure(importError, typesenseCollection);
    const failure: Pick<DocumentFailure, "stage" | "message"> = rejection ?? {stage: "typesense", message: `The import request failed: ${errorText(importError)}`};
    for (const {documentPath} of pending) recordFailure(run, documentPath, failure);
    if (rejection === undefined) throw importError;
    return {indexed: [], stop: `Stopped after the first rejected import request. ${rejection.message}`};
  }

  if (!Array.isArray(results) || results.length !== pending.length || !results.every(isImportOutcome)) {
    for (const {documentPath} of pending) recordFailure(run, documentPath, {stage: "typesense", message: "Typesense returned an unexpected import response."});
    return {indexed: []};
  }

  const indexed: DocumentPath[] = [];
  results.forEach((result, index) => {
    const entry = pending[index];
    if (entry === undefined) return;
    if (result.success) {
      run.counts.indexed += 1;
      indexed.push(entry.documentPath);
      return;
    }
    error(`Error importing document ${entry.documentPath}: ${errorText(result.error)}`);
    recordFailure(run, entry.documentPath, {stage: "typesense", message: `Typesense rejected the document: ${errorText(result.error)}`});
  });
  return {indexed};
}

async function collectPage(run: CollectionRun, docs: readonly QueryDocumentLike[]): Promise<PendingDocument[]> {
  const pending: PendingDocument[] = [];
  for (const doc of docs) {
    const documentPath = parseDocumentPath(doc.ref.path);
    const match = documentPath === undefined ? undefined : matchCollection([run.collection], documentPath);
    const data = doc.data();
    if (documentPath === undefined || match === undefined || !isFirestoreData(data)) continue;
    run.counts.read += 1;

    const evaluation = run.collection.evaluate(run.collection.project(data), match.context);
    switch (evaluation.kind) {
      case "excluded":
        run.counts.excluded += 1;
        break;
      case "rejected":
        recordFailure(run, documentPath, evaluation.failure);
        break;
      case "included": {
        const built = await evaluation.build();
        if (!built.ok) {
          recordFailure(run, documentPath, built.error);
          break;
        }
        const document = {...built.value, id: evaluation.id};
        if (run.ready.logInserts) debug(`Backfilling document ${JSON.stringify(document)}`);
        pending.push({documentPath, document});
        break;
      }
      default:
        unreachable(evaluation);
    }
  }
  return pending;
}

function queryFor(firestore: KitFirestore, collection: ResolvedCollection): QueryLike {
  const pathSegments = collection.path.split("/").filter((segment) => segment !== "");
  const collectionGroupId = pathSegments.at(-1);
  const isGroupQuery = pathSegments.length > 1 && Object.keys(parseFirestorePath(collection.path)).length > 0;
  return isGroupQuery && collectionGroupId !== undefined ? firestore.collectionGroup(collectionGroupId) : firestore.collection(collection.path);
}

async function backfillCollection(run: CollectionRun): Promise<string | undefined> {
  const issueIds = await loadIssueIds(run.firestore, run.collection.typesenseCollection);
  const query = queryFor(run.firestore, run.collection);
  let lastDoc: QueryDocumentLike | undefined;

  for (;;) {
    const batch = await (lastDoc === undefined ? query : query.startAfter(lastDoc)).limit(BACKFILL_BATCH_SIZE).get();
    if (batch.empty) break;
    lastDoc = batch.docs.at(-1);

    const {indexed, stop} = await importDocuments(run, await collectPage(run, batch.docs));
    const resolved = indexed.map((documentPath) => documentIssueId({typesenseCollection: run.collection.typesenseCollection, documentPath})).filter((id) => issueIds.has(id));
    await Promise.all(resolved.map((id) => run.firestore.doc(`${ISSUES_COLLECTION}/${id}`).delete()));

    if (stop !== undefined) return stop;
    if (batch.size < BACKFILL_BATCH_SIZE) break;

    // Recurse on the next process tick, to avoid
    // issues with the event loop on firebase functions related to resource release
    await new Promise<void>((resolve) => {
      process.nextTick(resolve);
    });
  }
  return undefined;
}

async function reject(firestore: KitFirestore, message: string, problems: readonly string[] = []): Promise<void> {
  error(`Skipping backfill. ${message}`);
  await writeStatus(firestore, {state: "rejected", finishedAt: Timestamp.now(), message, problems});
}

export async function handleBackfillTrigger(trigger: TriggerLike, runtime: Runtime = getRuntime()): Promise<void> {
  const triggerValue = trigger.get("trigger");
  if (triggerValue !== true && triggerValue !== "true") {
    error(`Skipping backfill. \`trigger: true\` key was not found in Firestore document ${BACKFILL_TRIGGER_DOCUMENT}.`);
    return;
  }

  const {firestore} = runtime;
  if (!runtime.ready.ok) {
    await runtime.issues.record(runtime.ready.error);
    await reject(firestore, runtime.ready.error.message, runtime.ready.error.problems);
    return;
  }
  const ready = runtime.ready.value;

  const parsed = parseBackfillRequest(
    trigger,
    ready.collections.map((collection) => collection.path),
  );
  if (!parsed.ok) {
    await reject(firestore, parsed.error);
    return;
  }
  const request = parsed.value;

  const selected = request.kind === "all" ? ready.collections : ready.collections.filter((collection) => request.firestorePaths.includes(collection.path));
  const names = selected.map((collection) => collection.path).join(", ");
  info(`Starting backfill for ${selected.length} collections: ${names}`);

  const startedAt = Timestamp.now();
  await writeStatus(firestore, {state: "running", startedAt, request, collections: selected.map((collection) => collection.path)});

  const failures: BackfillFailure[] = [];
  const reports: CollectionReport[] = [];
  let transient: {readonly error: unknown} | undefined;
  for (const collection of selected) {
    info(`Processing collection: ${collection.path}`);
    const counts: CollectionCounts = {read: 0, indexed: 0, excluded: 0, failed: 0};
    const base = {firestorePath: collection.path, typesenseCollection: collection.typesenseCollection};
    try {
      const stopped = await backfillCollection({firestore, ready, collection, counts, failures});
      reports.push({...base, ...counts, ...(stopped === undefined ? {} : {error: stopped})});
    } catch (collectionError: unknown) {
      transient ??= {error: collectionError};
      error(`Error backfilling collection ${collection.path}:`, collectionError);
      reports.push({...base, ...counts, error: errorText(collectionError)});
    }
  }

  await writeStatus(firestore, {
    state: "completed",
    startedAt,
    finishedAt: Timestamp.now(),
    request,
    collections: reports,
    failureCount: reports.reduce((total, report) => total + report.failed, 0),
    failures,
  });
  if (transient !== undefined) throw transient.error;
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
    await handleBackfillTrigger(event.data.after);
  },
);
