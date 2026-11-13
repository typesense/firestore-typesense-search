import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import {resolveCollection, type ResolvedCollection} from "../../src/collection.js";
import {handleDocumentWrite} from "../../src/indexOnWrite.js";
import {parseCollectionPath, type CollectionPath} from "../../src/paths.js";
import {err, ok} from "../../src/result.js";
import {createRuntime, getRuntime, resetRuntime, type Runtime} from "../../src/runtime.js";
import {FakeFirestore, writeEvent, type Data} from "./support/fakeFirestore.js";
import {StubTypesense} from "./support/stubTypesense.js";

const typesense = new StubTypesense();
let port = 0;

function envFor(overrides: Readonly<Record<string, string>> = {}): Record<string, string> {
  return {
    FIRESTORE_COLLECTION_PATHS: "books",
    TYPESENSE_COLLECTION_NAMES: "books",
    TYPESENSE_HOSTS: "127.0.0.1",
    TYPESENSE_PORT: String(port),
    TYPESENSE_PROTOCOL: "http",
    TYPESENSE_API_KEY: "xyz",
    ...overrides,
  };
}

function runtimeFor(store: FakeFirestore, overrides: Readonly<Record<string, string>> = {}): Runtime {
  return createRuntime({env: envFor(overrides), firestore: store, typesense: {retryIntervalSeconds: 0.001, connectionTimeoutSeconds: 5}});
}

function withCollections(runtime: Runtime, collections: readonly ResolvedCollection[]): Runtime {
  if (!runtime.ready.ok) throw new Error("Expected a valid test config");
  return {...runtime, ready: ok({...runtime.ready.value, collections})};
}

function booksPath(): CollectionPath {
  const parsed = parseCollectionPath("books");
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.value;
}

function publishedBooks(consistency: "reread" | "event" = "reread"): ResolvedCollection {
  return resolveCollection<Data>({
    path: booksPath(),
    typesenseCollection: "books",
    consistency,
    project: (data) => ({title: data["title"], status: data["status"], slug: data["slug"]}),
    validate: ok,
    indexIf: (data) => data["status"] === "published",
    id: (data, {docId}) => (typeof data["slug"] === "string" ? data["slug"] : docId),
    document: (data) => ({title: data["title"]}),
  });
}

function requestLines(): string[] {
  return typesense.requests.map(({method, url}) => `${method} ${url}`);
}

describe("handleDocumentWrite", () => {
  let store: FakeFirestore;
  let runtime: Runtime;

  const cost = (): {reads: number; writes: number; typesense: number} => ({reads: store.reads, writes: store.writes.length, typesense: typesense.requests.length});

  beforeAll(async () => {
    port = await typesense.start();
  });

  afterAll(async () => {
    await typesense.stop();
  });

  beforeEach(() => {
    typesense.reset();
    store = new FakeFirestore();
    runtime = runtimeFor(store);
  });

  it("upserts the latest state of a written document", async () => {
    await handleDocumentWrite(writeEvent(store, "books/doc1", {after: {title: "T"}}), runtime);

    expect(typesense.requests).toStrictEqual([{method: "POST", url: "/collections/books/documents?action=upsert", body: '{"title":"T","id":"doc1"}'}]);
  });

  it("URL-encodes the collection name exactly once", async () => {
    await handleDocumentWrite(writeEvent(store, "books/doc1", {after: {title: "T"}}), runtimeFor(store, {TYPESENSE_COLLECTION_NAMES: "books_firestore/1"}));

    expect(typesense.requests.map(({url}) => url)).toStrictEqual(["/collections/books_firestore%2F1/documents?action=upsert"]);
  });

  it("indexes the document as it is now when an older event arrives late", async () => {
    await handleDocumentWrite(writeEvent(store, "books/doc1", {before: {title: "A"}, after: {title: "B"}, latest: {title: "C"}}), runtime);

    expect(typesense.requests.map(({body}) => body)).toStrictEqual(['{"title":"C","id":"doc1"}']);
  });

  it("deletes the document when it was deleted after the event", async () => {
    await handleDocumentWrite(writeEvent(store, "books/doc1", {before: {title: "A"}, after: {title: "B"}, latest: null}), runtime);

    expect(requestLines()).toStrictEqual(["DELETE /collections/books/documents/doc1"]);
  });

  it("deletes a removed document", async () => {
    await handleDocumentWrite(writeEvent(store, "books/doc1", {before: {title: "T"}}), runtime);

    expect(requestLines()).toStrictEqual(["DELETE /collections/books/documents/doc1"]);
  });

  it("treats deleting a document that is not in Typesense as success", async () => {
    typesense.status = 404;

    await expect(handleDocumentWrite(writeEvent(store, "books/doc1", {before: {title: "T"}}), runtime)).resolves.toBeUndefined();
    expect(store.writes).toStrictEqual([]);
  });

  it("ignores documents outside the configured collections", async () => {
    await handleDocumentWrite(writeEvent(store, "magazines/doc1", {after: {title: "T"}}), runtime);

    expect(cost()).toStrictEqual({reads: 0, writes: 0, typesense: 0});
  });

  describe.each([
    {paths: "users,users/{userId}/books", names: "users,books"},
    {paths: "users/{userId}/books,users", names: "books,users"},
  ])("with a collection and its subcollection configured as $paths", ({paths, names}) => {
    beforeEach(() => {
      runtime = runtimeFor(store, {FIRESTORE_COLLECTION_PATHS: paths, TYPESENSE_COLLECTION_NAMES: names});
    });

    it("upserts each document into its own collection", async () => {
      await handleDocumentWrite(writeEvent(store, "users/u1", {after: {name: "U"}}), runtime);
      await handleDocumentWrite(writeEvent(store, "users/u1/books/b1", {after: {title: "T"}}), runtime);

      expect(typesense.requests).toStrictEqual([
        {method: "POST", url: "/collections/users/documents?action=upsert", body: '{"name":"U","id":"u1"}'},
        {method: "POST", url: "/collections/books/documents?action=upsert", body: '{"title":"T","userId":"u1","id":"b1"}'},
      ]);
    });

    it("deletes a subcollection document only from its own collection", async () => {
      await handleDocumentWrite(writeEvent(store, "users/u1/books/b1", {before: {title: "T"}}), runtime);

      expect(requestLines()).toStrictEqual(["DELETE /collections/books/documents/b1"]);
    });

    it("ignores documents in an unconfigured subcollection of a configured collection", async () => {
      await handleDocumentWrite(writeEvent(store, "users/u1/reviews/r1", {after: {text: "R"}}), runtime);
      await handleDocumentWrite(writeEvent(store, "users/u1/reviews/r1", {before: {text: "R"}}), runtime);

      expect(typesense.requests).toStrictEqual([]);
    });
  });

  describe("cost", () => {
    it("makes no call for a write that changes no listed field", async () => {
      runtime = runtimeFor(store, {FIRESTORE_COLLECTION_FIELDS_LIST: "title,author.name"});

      await handleDocumentWrite(writeEvent(store, "books/doc1", {before: {title: "T", author: {name: "A"}, views: 1}, after: {title: "T", author: {name: "A"}, views: 2}}), runtime);

      expect(cost()).toStrictEqual({reads: 0, writes: 0, typesense: 0});
    });

    it("makes no call for a write when every field is indexed and nothing changed", async () => {
      await handleDocumentWrite(writeEvent(store, "books/doc1", {before: {title: "T"}, after: {title: "T"}}), runtime);

      expect(cost()).toStrictEqual({reads: 0, writes: 0, typesense: 0});
    });

    it("makes no call for a document excluded before and after", async () => {
      runtime = withCollections(runtime, [publishedBooks()]);

      await handleDocumentWrite(writeEvent(store, "books/doc1", {before: {title: "A", status: "draft"}, after: {title: "B", status: "draft"}}), runtime);

      expect(cost()).toStrictEqual({reads: 0, writes: 0, typesense: 0});
    });

    it("reads once and calls Typesense once for a write that changes a listed field", async () => {
      runtime = runtimeFor(store, {FIRESTORE_COLLECTION_FIELDS_LIST: "title"});

      await handleDocumentWrite(writeEvent(store, "books/doc1", {before: {title: "A"}, after: {title: "B"}}), runtime);

      expect(cost()).toStrictEqual({reads: 1, writes: 0, typesense: 1});
    });

    it("skips the read with event consistency", async () => {
      runtime = withCollections(runtime, [publishedBooks("event")]);

      await handleDocumentWrite(
        writeEvent(store, "books/doc1", {before: {title: "A", status: "published"}, after: {title: "B", status: "published"}, latest: {title: "C", status: "published"}}),
        runtime,
      );

      expect(cost()).toStrictEqual({reads: 0, writes: 0, typesense: 1});
      expect(typesense.requests.map(({body}) => body)).toStrictEqual(['{"title":"B","id":"doc1"}']);
    });

    it("reads once and deletes once when a document stops qualifying", async () => {
      runtime = withCollections(runtime, [publishedBooks()]);

      await handleDocumentWrite(writeEvent(store, "books/doc1", {before: {title: "A", status: "published"}, after: {title: "A", status: "draft"}}), runtime);

      expect(cost()).toStrictEqual({reads: 1, writes: 0, typesense: 1});
      expect(requestLines()).toStrictEqual(["DELETE /collections/books/documents/doc1"]);
    });

    it("deletes an indexed document without reading", async () => {
      await handleDocumentWrite(writeEvent(store, "books/doc1", {before: {title: "T"}}), runtime);

      expect(cost()).toStrictEqual({reads: 0, writes: 0, typesense: 1});
    });

    it("makes no call when deleting a document that was never indexed", async () => {
      runtime = withCollections(runtime, [publishedBooks()]);

      await handleDocumentWrite(writeEvent(store, "books/doc1", {before: {title: "A", status: "draft"}}), runtime);

      expect(cost()).toStrictEqual({reads: 0, writes: 0, typesense: 0});
    });

    it("upserts the new ID and deletes the old one when the ID changes", async () => {
      runtime = withCollections(runtime, [publishedBooks()]);

      await handleDocumentWrite(writeEvent(store, "books/doc1", {before: {title: "A", status: "published"}, after: {title: "A", status: "published", slug: "a"}}), runtime);

      expect(cost()).toStrictEqual({reads: 1, writes: 0, typesense: 2});
      expect(requestLines()).toStrictEqual(["POST /collections/books/documents?action=upsert", "DELETE /collections/books/documents/doc1"]);
    });

    it("writes one issue document when a document fails", async () => {
      typesense.status = 400;

      await handleDocumentWrite(writeEvent(store, "books/doc1", {after: {title: "T"}}), runtime);

      expect(cost()).toStrictEqual({reads: 1, writes: 1, typesense: 1});
    });
  });

  describe("failures", () => {
    it("records a document Typesense rejects and succeeds", async () => {
      const anyTimestamp: unknown = expect.any(Timestamp);
      typesense.respond = () => ({status: 400, body: JSON.stringify({message: "Field `title` must be a string."})});

      await expect(handleDocumentWrite(writeEvent(store, "books/doc1", {after: {title: 1}}), runtime)).resolves.toBeUndefined();

      expect(store.issueWrites()).toStrictEqual([
        {
          kind: "set",
          path: "typesense_sync/issues/typesense_issues/books:books%2Fdoc1",
          data: {
            collection: "books",
            documentPath: "books/doc1",
            stage: "typesense",
            message: "Typesense rejected the document (HTTP 400): Field `title` must be a string.",
            detail: {httpStatus: 400, response: "Field `title` must be a string."},
            lastSeenAt: FieldValue.serverTimestamp(),
            count: FieldValue.increment(1),
            expireAt: anyTimestamp,
          },
          mergeFields: ["collection", "documentPath", "stage", "message", "detail", "lastSeenAt", "count", "expireAt"],
        },
      ]);
    });

    it("explains a missing Typesense collection", async () => {
      typesense.respond = () => ({status: 404, body: JSON.stringify({message: "Not found."})});

      await handleDocumentWrite(writeEvent(store, "books/doc1", {after: {title: "T"}}), runtime);

      expect(store.issueWrites().map(({data}) => data?.["message"])).toStrictEqual(['Typesense has no collection named "books" (HTTP 404). Create it, or fix TYPESENSE_COLLECTION_NAMES.']);
    });

    it("records a rejected delete instead of failing", async () => {
      typesense.status = 401;

      await expect(handleDocumentWrite(writeEvent(store, "books/doc1", {before: {title: "T"}}), runtime)).resolves.toBeUndefined();

      expect(store.issueWrites().map(({data}) => data?.["stage"])).toStrictEqual(["typesense"]);
    });

    it.each([500, 503, 429, 408])("records HTTP %i and still fails the invocation", async (status) => {
      typesense.status = status;

      await expect(handleDocumentWrite(writeEvent(store, "books/doc1", {after: {title: "T"}}), runtime)).rejects.toThrow(
        `Typesense could not be reached or failed temporarily (HTTP ${status}: Stub error ${status}), so the kit could not upsert document doc1.`,
      );

      expect(store.issueWrites().map(({data}) => ({stage: data?.["stage"], detail: data?.["detail"]}))).toStrictEqual([
        {stage: "typesense", detail: {httpStatus: status, response: `Stub error ${status}`}},
      ]);
    });

    it("records an unreachable Typesense and still fails the invocation", async () => {
      runtime = runtimeFor(store, {TYPESENSE_PORT: "1"});

      await expect(handleDocumentWrite(writeEvent(store, "books/doc1", {before: {title: "T"}}), runtime)).rejects.toThrow(
        "Typesense could not be reached or failed temporarily (connect ECONNREFUSED 127.0.0.1:1), so the kit could not delete document doc1.",
      );

      expect(store.issueWrites().map(({data}) => data?.["detail"])).toStrictEqual([{httpStatus: null, response: "connect ECONNREFUSED 127.0.0.1:1"}]);
    });

    it("reports a failed removal of a document that turned invalid as temporary", async () => {
      runtime = withCollections(runtime, [
        resolveCollection<Data>({
          path: booksPath(),
          typesenseCollection: "books",
          consistency: "reread",
          project: (data) => ({title: data["title"]}),
          validate: (data) => (typeof data["title"] === "string" ? ok(data) : err([{path: "title", message: "must be a string"}])),
          indexIf: () => true,
          id: (_data, {docId}) => docId,
          document: (data) => data,
        }),
      ]);
      typesense.status = 503;

      await expect(handleDocumentWrite(writeEvent(store, "books/doc1", {before: {title: "A"}, after: {title: 1}}), runtime)).rejects.toThrow("so the kit could not delete document doc1.");

      expect(store.issueWrites().map(({data}) => data?.["stage"])).toStrictEqual(["typesense"]);
    });

    it("reports a temporary failure to remove the old ID over a rejected upsert", async () => {
      runtime = withCollections(runtime, [publishedBooks()]);
      typesense.respond = ({method}) => ({status: method === "DELETE" ? 503 : 400});

      await expect(handleDocumentWrite(writeEvent(store, "books/doc1", {before: {title: "A", status: "published"}, after: {title: "A", status: "published", slug: "a"}}), runtime)).rejects.toThrow(
        "so the kit could not delete document doc1.",
      );

      expect(store.issueWrites().map(({data}) => data?.["detail"])).toStrictEqual([{httpStatus: 503, response: "Stub error 503"}]);
    });

    it("still removes the old ID when the upsert under the new ID fails temporarily", async () => {
      runtime = withCollections(runtime, [publishedBooks()]);
      typesense.respond = ({method}) => ({status: method === "DELETE" ? 200 : 503});

      await expect(handleDocumentWrite(writeEvent(store, "books/doc1", {before: {title: "A", status: "published"}, after: {title: "A", status: "published", slug: "a"}}), runtime)).rejects.toThrow(
        "so the kit could not upsert document a.",
      );

      expect(requestLines().at(-1)).toBe("DELETE /collections/books/documents/doc1");
    });

    it("names the old ID when both requests of an ID change fail temporarily", async () => {
      runtime = withCollections(runtime, [publishedBooks()]);
      typesense.status = 503;

      await expect(handleDocumentWrite(writeEvent(store, "books/doc1", {before: {title: "A", status: "published"}, after: {title: "A", status: "published", slug: "a"}}), runtime)).rejects.toThrow(
        "so the kit could not delete document doc1.",
      );
    });

    it("writes an identical issue for the same document only once per instance", async () => {
      typesense.status = 400;

      await handleDocumentWrite(writeEvent(store, "books/doc1", {after: {title: "A"}}), runtime);
      await handleDocumentWrite(writeEvent(store, "books/doc1", {before: {title: "A"}, after: {title: "B"}}), runtime);
      typesense.status = 422;
      await handleDocumentWrite(writeEvent(store, "books/doc1", {before: {title: "B"}, after: {title: "C"}}), runtime);

      expect(store.issueWrites().map(({data}) => data?.["detail"])).toStrictEqual([
        {httpStatus: 400, response: "Stub error 400"},
        {httpStatus: 422, response: "Stub error 422"},
      ]);
    });
  });

  describe("configuration backstop", () => {
    it("records one config issue instead of throwing when the config is invalid", async () => {
      runtime = runtimeFor(store, {TYPESENSE_COLLECTION_NAMES: "books,extra"});

      await expect(handleDocumentWrite(writeEvent(store, "books/doc1", {after: {title: "T"}}), runtime)).resolves.toBeUndefined();
      await handleDocumentWrite(writeEvent(store, "books/doc2", {after: {title: "T"}}), runtime);

      expect(typesense.requests).toStrictEqual([]);
      expect(store.issueWrites()).toMatchObject([
        {
          path: "typesense_sync/issues/typesense_issues/config",
          data: {
            stage: "config",
            message: "The kit's configuration is invalid, so no documents are being indexed. Fix the kit's .env and deploy again.",
            detail: {
              problems: [
                "FIRESTORE_COLLECTION_PATHS lists 1 path but TYPESENSE_COLLECTION_NAMES lists 2 names. Give each path one Typesense collection name, in the same order.\n" +
                  "    FIRESTORE_COLLECTION_PATHS=books\n    TYPESENSE_COLLECTION_NAMES=books,extra",
              ],
            },
          },
        },
      ]);
    });

    it("reports missing collection params at the first invocation", async () => {
      runtime = runtimeFor(store, {FIRESTORE_COLLECTION_PATHS: "", TYPESENSE_COLLECTION_NAMES: ""});

      await handleDocumentWrite(writeEvent(store, "books/doc1", {after: {title: "T"}}), runtime);

      expect(store.issueWrites().map(({data}) => data?.["detail"])).toStrictEqual([{problems: ["No collections are configured. Set FIRESTORE_COLLECTION_PATHS and TYPESENSE_COLLECTION_NAMES."]}]);
    });

    it("reports the removed single-collection params with their replacements", async () => {
      runtime = runtimeFor(store, {FIRESTORE_COLLECTION_PATHS: "", TYPESENSE_COLLECTION_NAMES: "", FIRESTORE_COLLECTION_PATH: "books", TYPESENSE_COLLECTION_NAME: "books_v1"});

      await handleDocumentWrite(writeEvent(store, "books/doc1", {after: {title: "T"}}), runtime);

      expect(store.issueWrites().map(({data}) => data?.["detail"])).toStrictEqual([
        {
          problems: [
            "The single-collection params FIRESTORE_COLLECTION_PATH, TYPESENSE_COLLECTION_NAME, FIRESTORE_COLLECTION_FIELDS and FLATTEN_NESTED_DOCUMENTS were removed in 4.0.0 " +
              "(see https://github.com/typesense/firestore-typesense-search/blob/master/UPGRADING.md). Replace them in your configuration with:\n" +
              "    FIRESTORE_COLLECTION_PATHS=books\n    TYPESENSE_COLLECTION_NAMES=books_v1",
          ],
        },
      ]);
    });

    it("ignores writes to the kit's own documents, even with an invalid config", async () => {
      runtime = runtimeFor(store, {TYPESENSE_COLLECTION_NAMES: "books,extra"});

      await handleDocumentWrite(writeEvent(store, "typesense_sync/issues/typesense_issues/config", {after: {stage: "config"}}), runtime);

      expect(cost()).toStrictEqual({reads: 0, writes: 0, typesense: 0});
    });
  });
});

describe("getRuntime", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetRuntime();
  });

  it("parses the config and creates the Typesense client once per instance", () => {
    for (const [key, value] of Object.entries({...envFor(), TYPESENSE_PORT: "8108"})) vi.stubEnv(key, value);
    resetRuntime();

    const first = getRuntime();
    vi.stubEnv("TYPESENSE_COLLECTION_NAMES", "renamed");

    expect(getRuntime()).toBe(first);
    expect(first.ready.ok && first.ready.value.collections.map(({typesenseCollection}) => typesenseCollection)).toStrictEqual(["books"]);

    resetRuntime();
    const second = getRuntime();
    expect(second.ready.ok && second.ready.value.collections.map(({typesenseCollection}) => typesenseCollection)).toStrictEqual(["renamed"]);
  });
});
