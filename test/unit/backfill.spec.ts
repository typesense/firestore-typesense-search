import {Timestamp} from "firebase-admin/firestore";
import {afterAll, beforeAll, beforeEach, describe, expect, it} from "vitest";
import {handleBackfillTrigger, type TriggerLike} from "../../src/backfill.js";
import {resolveCollection} from "../../src/collection.js";
import {parseCollectionPath} from "../../src/paths.js";
import {ok} from "../../src/result.js";
import {createRuntime, type Runtime} from "../../src/runtime.js";
import {FakeFirestore, type Data, type RecordedWrite} from "./support/fakeFirestore.js";
import {StubTypesense, type RecordedRequest} from "./support/stubTypesense.js";

const typesense = new StubTypesense();
const anyTimestamp: unknown = expect.any(Timestamp);
let port = 0;

function runtimeFor(store: FakeFirestore, overrides: Readonly<Record<string, string>> = {}): Runtime {
  return createRuntime({
    env: {
      FIRESTORE_COLLECTION_PATHS: "users/{userId}/books",
      TYPESENSE_COLLECTION_NAMES: "user_books",
      TYPESENSE_HOSTS: "127.0.0.1",
      TYPESENSE_PORT: String(port),
      TYPESENSE_PROTOCOL: "http",
      TYPESENSE_API_KEY: "xyz",
      ...overrides,
    },
    firestore: store,
    typesense: {retryIntervalSeconds: 0.001, connectionTimeoutSeconds: 5},
  });
}

function trigger(fields: Data = {trigger: true}): TriggerLike {
  return {get: (field) => fields[field]};
}

function seed(store: FakeFirestore, paths: readonly string[]): void {
  for (const path of paths) store.documents.set(path, {title: path.split("/").at(-1) ?? path});
}

function books(count: number, parent: string): string[] {
  return Array.from({length: count}, (_, index) => `${parent}/books/${parent.replaceAll("/", "-")}-${index}`);
}

function importedBatchSizes(collection = "user_books"): number[] {
  return typesense.requests.filter(({url}) => url.startsWith(`/collections/${collection}/documents/import`)).map(({body}) => body.split("\n").filter((line) => line !== "").length);
}

function statusWrites(store: FakeFirestore): RecordedWrite[] {
  return store.writes.filter(({path}) => path === "typesense_sync/backfill_status");
}

function failImportsWhere(fails: (document: Data) => boolean): (request: RecordedRequest) => {status: number; body: string} | undefined {
  return (request) => {
    if (!request.url.includes("/documents/import")) return undefined;
    const lines = request.body.split("\n").filter((line) => line !== "");
    const results = lines.map((line) => {
      const parsed: unknown = JSON.parse(line);
      const document: Data = typeof parsed === "object" && parsed !== null ? Object.fromEntries(Object.entries(parsed)) : {};
      return fails(document) ? {success: false, error: "Field `title` must be an int32.", document: line} : {success: true};
    });
    return {status: 200, body: results.map((result) => JSON.stringify(result)).join("\n")};
  };
}

describe("handleBackfillTrigger", () => {
  let store: FakeFirestore;

  beforeAll(async () => {
    port = await typesense.start();
  });

  afterAll(async () => {
    await typesense.stop();
  });

  beforeEach(() => {
    typesense.reset();
    store = new FakeFirestore();
  });

  describe("paging", () => {
    it("keeps paging when documents outside the configured path shorten a full page", async () => {
      const [first, ...rest] = books(999, "users/u1");
      if (first === undefined) throw new Error("No documents");
      seed(store, [first, "shelves/s1/books/unrelated", ...rest, ...books(1, "users/u2")]);

      await handleBackfillTrigger(trigger(), runtimeFor(store));

      expect(importedBatchSizes()).toStrictEqual([999, 1]);
    });

    it("keeps paging past a full page of documents outside the configured path", async () => {
      seed(store, [...books(1000, "shelves/s1"), ...books(2, "users/u1")]);

      await handleBackfillTrigger(trigger(), runtimeFor(store));

      expect(importedBatchSizes()).toStrictEqual([2]);
    });

    it("skips documents of a same-named subcollection nested below the configured path", async () => {
      seed(store, [...books(2, "users/u1"), ...books(1, "users/u1/books/b1")]);

      await handleBackfillTrigger(trigger(), runtimeFor(store));

      expect(importedBatchSizes()).toStrictEqual([2]);
    });
  });

  describe("cost", () => {
    it.each([
      [3, 3 + 1, [3]],
      [1000, 1000 + 1 + 1, [1000]],
      [2500, 2500 + 1, [1000, 1000, 500]],
    ])("reads each of %i documents once, plus one issue lookup, and writes only the report", async (count, reads, batches) => {
      seed(store, books(count, "users/u1"));
      store.reads = 0;

      await handleBackfillTrigger(trigger(), runtimeFor(store));

      expect({reads: store.reads, writes: store.writes.length, imports: importedBatchSizes()}).toStrictEqual({reads, writes: 2, imports: batches});
    });
  });

  describe("report", () => {
    it("writes the status when the run starts and when it ends", async () => {
      seed(store, books(2, "users/u1"));
      typesense.respond = failImportsWhere((document) => document["id"] === "users-u1-1");

      await handleBackfillTrigger(trigger(), runtimeFor(store));

      expect(statusWrites(store).map(({data}) => data)).toStrictEqual([
        {state: "running", startedAt: anyTimestamp, request: {kind: "all"}, collections: ["users/{userId}/books"]},
        {
          state: "completed",
          startedAt: anyTimestamp,
          finishedAt: anyTimestamp,
          request: {kind: "all"},
          collections: [{firestorePath: "users/{userId}/books", typesenseCollection: "user_books", read: 2, indexed: 1, excluded: 0, failed: 1}],
          failureCount: 1,
          failures: [
            {
              documentPath: "users/u1/books/users-u1-1",
              typesenseCollection: "user_books",
              stage: "typesense",
              message: "Typesense rejected the document: Field `title` must be an int32.",
            },
          ],
        },
      ]);
    });

    it("keeps the first 20 failures and counts the rest", async () => {
      seed(store, books(25, "users/u1"));
      typesense.respond = failImportsWhere(() => true);

      await handleBackfillTrigger(trigger(), runtimeFor(store));

      const final = statusWrites(store).at(-1)?.data;
      expect(final?.["failureCount"]).toBe(25);
      expect(final?.["failures"]).toHaveLength(20);
    });

    it("counts excluded and rejected documents", async () => {
      store.documents.set("books/a", {status: "published"});
      store.documents.set("books/b", {status: "draft"});
      store.documents.set("books/c", {status: "broken"});
      const base = runtimeFor(store, {FIRESTORE_COLLECTION_PATHS: "books", TYPESENSE_COLLECTION_NAMES: "books"});
      if (!base.ready.ok) throw new Error("Expected a valid test config");
      const path = parseCollectionPath("books");
      if (!path.ok) throw new Error(path.error);
      const collection = resolveCollection<Data>({
        path: path.value,
        typesenseCollection: "books",
        consistency: "reread",
        project: (data) => data,
        validate: (data) => (data["status"] === "broken" ? {ok: false, error: [{path: "status", message: "Unknown status"}]} : ok(data)),
        indexIf: (data) => data["status"] === "published",
        id: (_data, {docId}) => docId,
        document: (data) => data,
      });

      await handleBackfillTrigger(trigger(), {...base, ready: ok({...base.ready.value, collections: [collection]})});

      expect(statusWrites(store).at(-1)?.data).toMatchObject({
        collections: [{read: 3, indexed: 1, excluded: 1, failed: 1}],
        failures: [{documentPath: "books/c", stage: "schema", message: "The document does not match the collection schema: status: Unknown status"}],
      });
    });

    it("writes the report and then fails the run on a transient import error", async () => {
      seed(store, [...books(2, "users/u1"), "stores/s1/products/p1"]);
      typesense.respond = (request) => (request.url.startsWith("/collections/user_books/") ? {status: 503} : undefined);
      const runtime = runtimeFor(store, {FIRESTORE_COLLECTION_PATHS: "users/{userId}/books,stores/{storeId}/products", TYPESENSE_COLLECTION_NAMES: "user_books,store_products"});

      await expect(handleBackfillTrigger(trigger(), runtime)).rejects.toThrow("Request failed with HTTP code 503");

      expect(statusWrites(store).at(-1)?.data).toMatchObject({
        state: "completed",
        collections: [
          {firestorePath: "users/{userId}/books", read: 2, indexed: 0, failed: 2, error: "Request failed with HTTP code 503 | Server said: Stub error 503"},
          {firestorePath: "stores/{storeId}/products", read: 1, indexed: 1, failed: 0},
        ],
        failures: [{stage: "typesense", message: "The import request failed: Request failed with HTTP code 503 | Server said: Stub error 503"}, {stage: "typesense"}],
      });
    });

    it("stops a collection at the first import request Typesense rejects", async () => {
      const missing = 'Typesense has no collection named "user_books" (HTTP 404). Create it, or fix TYPESENSE_COLLECTION_NAMES.';
      seed(store, books(2500, "users/u1"));
      store.reads = 0;
      typesense.respond = () => ({status: 404, body: JSON.stringify({message: "Not found."})});

      await handleBackfillTrigger(trigger(), runtimeFor(store));

      expect({reads: store.reads, imports: importedBatchSizes()}).toStrictEqual({reads: 1 + 1000, imports: [1000]});
      expect(statusWrites(store).at(-1)?.data).toMatchObject({
        collections: [{read: 1000, indexed: 0, failed: 1000, error: `Stopped after the first rejected import request. ${missing}`}],
        failureCount: 1000,
        failures: Array.from({length: 20}, () => ({message: missing})),
      });
    });
  });

  describe("issues", () => {
    it("deletes the issue documents of documents it indexes", async () => {
      seed(store, books(2, "users/u1"));
      const indexedIssue = "typesense_sync/issues/typesense_issues/user_books:users%2Fu1%2Fbooks%2Fusers-u1-0";
      const failedIssue = "typesense_sync/issues/typesense_issues/user_books:users%2Fu1%2Fbooks%2Fusers-u1-1";
      const otherIssue = "typesense_sync/issues/typesense_issues/other:users%2Fu1%2Fbooks%2Fusers-u1-0";
      store.documents.set(indexedIssue, {collection: "user_books", documentPath: "users/u1/books/users-u1-0"});
      store.documents.set(failedIssue, {collection: "user_books", documentPath: "users/u1/books/users-u1-1"});
      store.documents.set(otherIssue, {collection: "other", documentPath: "users/u1/books/users-u1-0"});
      typesense.respond = failImportsWhere((document) => document["id"] === "users-u1-1");

      await handleBackfillTrigger(trigger(), runtimeFor(store));

      expect(store.writes.filter(({kind}) => kind === "delete").map(({path}) => path)).toStrictEqual([indexedIssue]);
      expect([...store.documents.keys()].filter((path) => path.startsWith("typesense_sync/issues/"))).toStrictEqual([failedIssue, otherIssue]);
    });
  });

  describe("requests", () => {
    it("does nothing unless trigger is true", async () => {
      seed(store, books(1, "users/u1"));

      await handleBackfillTrigger(trigger({trigger: false}), runtimeFor(store));

      expect({writes: store.writes, typesense: typesense.requests}).toStrictEqual({writes: [], typesense: []});
    });

    it("backfills only the requested collections and reports unknown ones", async () => {
      seed(store, [...books(1, "users/u1"), "stores/s1/products/p1"]);
      const runtime = runtimeFor(store, {FIRESTORE_COLLECTION_PATHS: "users/{userId}/books,stores/{storeId}/products", TYPESENSE_COLLECTION_NAMES: "user_books,store_products"});

      await handleBackfillTrigger(trigger({trigger: true, firestore_collections: ["stores/{storeId}/products", "nope"]}), runtime);

      expect(importedBatchSizes("store_products")).toStrictEqual([1]);
      expect(importedBatchSizes("user_books")).toStrictEqual([]);
      expect(statusWrites(store).at(-1)?.data?.["request"]).toStrictEqual({kind: "only", firestorePaths: ["stores/{storeId}/products", "nope"], unknownPaths: ["nope"]});
    });

    it.each([
      [{trigger: true, firestore_collections: "users/{userId}/books"}, "The `firestore_collections` key in typesense_sync/backfill must be a list of Firestore collection paths."],
      [
        {trigger: true, firestore_collections: ["nope"]},
        "The `firestore_collections` key in typesense_sync/backfill did not contain any of the configured collections: users/{userId}/books. Requested: nope",
      ],
    ])("rejects an invalid request in the report: %j", async (fields, message) => {
      await handleBackfillTrigger(trigger(fields), runtimeFor(store));

      expect(statusWrites(store).map(({data}) => data)).toStrictEqual([{state: "rejected", finishedAt: anyTimestamp, message, problems: []}]);
      expect(typesense.requests).toStrictEqual([]);
    });

    it("rejects the run and records a config issue when the config is invalid", async () => {
      const namesProblem: unknown = expect.stringContaining("TYPESENSE_COLLECTION_NAMES lists 0 names");
      await handleBackfillTrigger(trigger(), runtimeFor(store, {TYPESENSE_COLLECTION_NAMES: ""}));

      expect(store.writes.map(({path}) => path)).toStrictEqual(["typesense_sync/issues/typesense_issues/config", "typesense_sync/backfill_status"]);
      expect(statusWrites(store).at(0)?.data).toMatchObject({state: "rejected", problems: [namesProblem]});
    });
  });
});
