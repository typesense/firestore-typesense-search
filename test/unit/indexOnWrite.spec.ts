import {afterAll, beforeAll, beforeEach, describe, expect, it} from "vitest";
import {handleDocumentWrite, type DocumentChangeLike} from "../../src/indexOnWrite.js";
import {StubTypesense} from "./support/stubTypesense.js";

function snapshot(id: string, exists: boolean, data: Record<string, unknown> = {}): DocumentChangeLike["after"] {
  return {
    exists,
    id,
    ref: {
      path: `books/${id}`,
      get: () => Promise.resolve({id, data: () => (exists ? data : undefined)}),
    },
  };
}

describe("handleDocumentWrite", () => {
  const typesense = new StubTypesense();

  beforeAll(async () => {
    const port = await typesense.start();
    process.env["FIRESTORE_COLLECTION_PATHS"] = "books";
    process.env["TYPESENSE_COLLECTION_NAMES"] = "books";
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
    typesense.status = 200;
  });

  it("upserts the latest state of a written document", async () => {
    await handleDocumentWrite({before: snapshot("doc1", false), after: snapshot("doc1", true, {title: "T"})});

    expect(typesense.requests).toStrictEqual([{method: "POST", url: "/collections/books/documents?action=upsert", body: '{"title":"T","id":"doc1"}'}]);
  });

  it("URL-encodes the collection name exactly once", async () => {
    process.env["TYPESENSE_COLLECTION_NAMES"] = "books_firestore/1";
    try {
      await handleDocumentWrite({before: snapshot("doc1", false), after: snapshot("doc1", true, {title: "T"})});
    } finally {
      process.env["TYPESENSE_COLLECTION_NAMES"] = "books";
    }

    expect(typesense.requests.map(({url}) => url)).toStrictEqual(["/collections/books_firestore%2F1/documents?action=upsert"]);
  });

  it("deletes a removed document", async () => {
    await handleDocumentWrite({before: snapshot("doc1", true), after: snapshot("doc1", false)});

    expect(typesense.requests.map(({method, url}) => `${method} ${url}`)).toStrictEqual(["DELETE /collections/books/documents/doc1"]);
  });

  it("treats deleting a document that is not in Typesense as success", async () => {
    typesense.status = 404;

    await expect(handleDocumentWrite({before: snapshot("doc1", true), after: snapshot("doc1", false)})).resolves.toBeUndefined();
  });

  it("still fails on other delete errors", async () => {
    typesense.status = 401;

    await expect(handleDocumentWrite({before: snapshot("doc1", true), after: snapshot("doc1", false)})).rejects.toThrow("Request failed with HTTP code 401");
  });

  it("ignores documents outside the configured collections", async () => {
    const outside: DocumentChangeLike["after"] = {...snapshot("doc1", true), ref: {path: "magazines/doc1", get: () => Promise.resolve({id: "doc1", data: () => ({})})}};

    await handleDocumentWrite({before: outside, after: outside});

    expect(typesense.requests).toStrictEqual([]);
  });
});
