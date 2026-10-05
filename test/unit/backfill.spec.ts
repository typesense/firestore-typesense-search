import {afterAll, beforeAll, beforeEach, describe, expect, it} from "vitest";
import {handleBackfillTrigger, type FirestoreLike} from "../../functions/src/backfill.js";
import {StubTypesense} from "./support/stubTypesense.js";

type FakeQuery = ReturnType<FirestoreLike["collectionGroup"]>;
type FakeDocument = Parameters<FakeQuery["startAfter"]>[0];

function fakeDocument(path: string): FakeDocument {
  const id = path.split("/").at(-1) ?? path;
  return {id, ref: {path}, data: () => ({title: id})};
}

function fakeQuery(docs: readonly FakeDocument[], start = 0, limit = docs.length): FakeQuery {
  return {
    startAfter: (document) => fakeQuery(docs, docs.indexOf(document) + 1, limit),
    limit: (pageSize) => fakeQuery(docs, start, pageSize),
    get: () => {
      const page = docs.slice(start, start + limit);
      return Promise.resolve({empty: page.length === 0, size: page.length, docs: page});
    },
  };
}

function fakeFirestore(collectionGroup: readonly FakeDocument[]): FirestoreLike {
  return {
    collection: () => fakeQuery([]),
    collectionGroup: () => fakeQuery(collectionGroup),
  };
}

function books(count: number, parent: string): FakeDocument[] {
  return Array.from({length: count}, (_, index) => fakeDocument(`${parent}/books/${parent.replaceAll("/", "-")}-${index}`));
}

const trigger = {get: (field: unknown): unknown => (field === "trigger" ? true : undefined)};

describe("handleBackfillTrigger", () => {
  const typesense = new StubTypesense();

  const importedBatchSizes = (): number[] =>
    typesense.requests.filter(({url}) => url.startsWith("/collections/user_books/documents/import")).map(({body}) => body.split("\n").filter((line) => line !== "").length);

  beforeAll(async () => {
    const port = await typesense.start();
    process.env["FIRESTORE_COLLECTION_PATHS"] = "users/{userId}/books";
    process.env["TYPESENSE_COLLECTION_NAMES"] = "user_books";
    process.env["TYPESENSE_HOSTS"] = "127.0.0.1";
    process.env["TYPESENSE_PORT"] = String(port);
    process.env["TYPESENSE_PROTOCOL"] = "http";
    process.env["TYPESENSE_API_KEY"] = "xyz";
  });

  afterAll(async () => {
    await typesense.stop();
  });

  beforeEach(() => {
    typesense.requests.length = 0;
  });

  it("keeps paging when documents outside the configured path shorten a full page", async () => {
    const [first, ...rest] = books(999, "users/u1");
    if (first === undefined) throw new Error("No documents");
    const documents = [first, fakeDocument("shelves/s1/books/unrelated"), ...rest, ...books(1, "users/u2")];

    await handleBackfillTrigger(trigger, fakeFirestore(documents));

    expect(importedBatchSizes()).toStrictEqual([999, 1]);
  });

  it("keeps paging past a full page of documents outside the configured path", async () => {
    await handleBackfillTrigger(trigger, fakeFirestore([...books(1000, "shelves/s1"), ...books(2, "users/u1")]));

    expect(importedBatchSizes()).toStrictEqual([2]);
  });
});
