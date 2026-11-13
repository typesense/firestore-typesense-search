import {createHash} from "node:crypto";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {warn} from "firebase-functions/logger";
import type {DocumentFailure} from "./collection.js";
import {ISSUES_COLLECTION} from "./config.js";
import type {DocumentPath} from "./paths.js";
import {unreachable} from "./result.js";
import type {KitFirestore} from "./store.js";

export interface DocumentTarget {
  readonly typesenseCollection: string;
  readonly documentPath: DocumentPath;
}

export interface ConfigIssue {
  readonly stage: "config";
  readonly message: string;
  readonly problems: readonly string[];
}

export type SyncIssue = (DocumentFailure & {readonly target: DocumentTarget}) | ConfigIssue;

export interface IssueRecorder {
  record(issue: SyncIssue): Promise<void>;
}

export const CONFIG_ISSUE_ID = "config";
const ISSUE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_REMEMBERED_ISSUES = 1000;
const REWRITE_AFTER_MS = 10 * 60 * 1000;
const MAX_DOCUMENT_ID_BYTES = 1500;
const RESERVED_DOCUMENT_ID = /^__.*__$/;

export function documentIssueId(target: DocumentTarget): string {
  const readable = `${encodeURIComponent(target.typesenseCollection)}:${encodeURIComponent(target.documentPath)}`;
  if (Buffer.byteLength(readable) <= MAX_DOCUMENT_ID_BYTES && !RESERVED_DOCUMENT_ID.test(readable)) return readable;
  return `sha256-${createHash("sha256").update(readable).digest("hex")}`;
}

function issueId(issue: SyncIssue): string {
  return issue.stage === "config" ? CONFIG_ISSUE_ID : documentIssueId(issue.target);
}

function targetFields(target: DocumentTarget): Record<string, unknown> {
  return {collection: target.typesenseCollection, documentPath: target.documentPath};
}

function issueFields(issue: SyncIssue): Record<string, unknown> {
  switch (issue.stage) {
    case "config":
      return {stage: issue.stage, message: issue.message, detail: {problems: [...issue.problems]}};
    case "schema":
      return {...targetFields(issue.target), stage: issue.stage, message: issue.message, detail: {problems: issue.problems.map(({path, message}) => ({path, message}))}};
    case "indexIf":
    case "id":
    case "document":
    case "lookup":
      return {...targetFields(issue.target), stage: issue.stage, message: issue.message, detail: {error: issue.error}};
    case "typesense":
      return {...targetFields(issue.target), stage: issue.stage, message: issue.message, detail: {httpStatus: issue.httpStatus, response: issue.response}};
    default:
      return unreachable(issue);
  }
}

function describeIssue(issue: SyncIssue): string {
  return issue.stage === "config" ? `${issue.message}\n${issue.problems.join("\n")}` : `${issue.target.documentPath} (${issue.target.typesenseCollection}): ${issue.message}`;
}

export function createIssueRecorder(firestore: KitFirestore, now: () => number = Date.now): IssueRecorder {
  const written = new Map<string, {readonly fingerprint: string; readonly at: number}>();
  const queued = new Map<string, Promise<void>>();

  async function write(id: string, issue: SyncIssue): Promise<void> {
    const fields = issueFields(issue);
    const fingerprint = JSON.stringify(fields);
    const previous = written.get(id);
    if (previous?.fingerprint === fingerprint && now() - previous.at < REWRITE_AFTER_MS) return;

    warn(`Recording a ${issue.stage} issue in ${ISSUES_COLLECTION}/${id}: ${describeIssue(issue)}`);
    await firestore
      .doc(`${ISSUES_COLLECTION}/${id}`)
      .set(
        {...fields, lastSeenAt: FieldValue.serverTimestamp(), count: FieldValue.increment(1), expireAt: Timestamp.fromMillis(now() + ISSUE_TTL_MS)},
        {mergeFields: [...Object.keys(fields), "lastSeenAt", "count", "expireAt"]},
      );
    if (written.size >= MAX_REMEMBERED_ISSUES) written.clear();
    written.set(id, {fingerprint, at: now()});
  }

  return {
    record(issue) {
      const id = issueId(issue);
      const current = (queued.get(id) ?? Promise.resolve()).catch(() => undefined).then(() => write(id, issue));
      queued.set(id, current);
      return current.finally(() => {
        if (queued.get(id) === current) queued.delete(id);
      });
    },
  };
}
