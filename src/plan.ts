import type {BuildResult, DocumentContext, DocumentFailure, Evaluation, FirestoreData, ResolvedCollection} from "./collection.js";
import {firestoreValuesEqual} from "./equality.js";
import type {TypesenseDocumentId} from "./ids.js";
import {unreachable} from "./result.js";

export type SkipReason = "unchanged" | "excluded" | "not-indexed";

export type WritePlan =
  | {readonly kind: "skip"; readonly reason: SkipReason}
  | {readonly kind: "reject"; readonly failure: DocumentFailure}
  | {readonly kind: "delete"; readonly id: TypesenseDocumentId}
  | {readonly kind: "sync"; readonly previousId: TypesenseDocumentId | undefined};

export type SyncPlan =
  | {readonly kind: "none"}
  | {readonly kind: "remove"; readonly id: TypesenseDocumentId}
  | {readonly kind: "reject"; readonly failure: DocumentFailure; readonly staleId: TypesenseDocumentId | undefined}
  | {readonly kind: "upsert"; readonly id: TypesenseDocumentId; readonly build: () => Promise<BuildResult>; readonly staleId: TypesenseDocumentId | undefined};

function indexedId(evaluation: Evaluation | undefined): TypesenseDocumentId | undefined {
  return evaluation?.kind === "included" ? evaluation.id : undefined;
}

export function planWrite(collection: ResolvedCollection, context: DocumentContext, before: FirestoreData | undefined, after: FirestoreData | undefined): WritePlan {
  const beforeProjection = before === undefined ? undefined : collection.project(before);

  if (after === undefined) {
    const previousId = indexedId(beforeProjection === undefined ? undefined : collection.evaluate(beforeProjection, context));
    return previousId === undefined ? {kind: "skip", reason: "not-indexed"} : {kind: "delete", id: previousId};
  }

  const afterProjection = collection.project(after);
  if (beforeProjection !== undefined && firestoreValuesEqual(beforeProjection, afterProjection)) {
    return {kind: "skip", reason: "unchanged"};
  }

  const previousId = indexedId(beforeProjection === undefined ? undefined : collection.evaluate(beforeProjection, context));
  const now = collection.evaluate(afterProjection, context);
  if (previousId !== undefined || now.kind === "included") return {kind: "sync", previousId};
  return now.kind === "rejected" ? {kind: "reject", failure: now.failure} : {kind: "skip", reason: "excluded"};
}

export function planSync(collection: ResolvedCollection, context: DocumentContext, previousId: TypesenseDocumentId | undefined, latest: FirestoreData | undefined): SyncPlan {
  const removePrevious: SyncPlan = previousId === undefined ? {kind: "none"} : {kind: "remove", id: previousId};
  if (latest === undefined) return removePrevious;

  const now = collection.evaluate(collection.project(latest), context);
  switch (now.kind) {
    case "excluded":
      return removePrevious;
    case "rejected":
      return {kind: "reject", failure: now.failure, staleId: previousId};
    case "included":
      return {kind: "upsert", id: now.id, build: now.build, staleId: previousId === now.id ? undefined : previousId};
    default:
      return unreachable(now);
  }
}
