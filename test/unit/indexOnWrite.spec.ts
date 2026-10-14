import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it} from "vitest";
import {handleDocumentWrite, type DocumentChangeLike} from "../../src/indexOnWrite.js";
import {StubTypesense} from "./support/stubTypesense.js";

function snapshot(path: string, exists: boolean, data: Record<string, unknown> = {}): DocumentChangeLike["after"] {
  const id = path.split("/").at(-1) ?? path;
  return {
    exists,
    id,
    ref: {
      path,
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
    await handleDocumentWrite({before: snapshot("books/doc1", false), after: snapshot("books/doc1", true, {title: "T"})});

    expect(typesense.requests).toStrictEqual([{method: "POST", url: "/collections/books/documents?action=upsert", body: '{"title":"T","id":"doc1"}'}]);
  });

  it("URL-encodes the collection name exactly once", async () => {
    process.env["TYPESENSE_COLLECTION_NAMES"] = "books_firestore/1";
    try {
      await handleDocumentWrite({before: snapshot("books/doc1", false), after: snapshot("books/doc1", true, {title: "T"})});
    } finally {
      process.env["TYPESENSE_COLLECTION_NAMES"] = "books";
    }

    expect(typesense.requests.map(({url}) => url)).toStrictEqual(["/collections/books_firestore%2F1/documents?action=upsert"]);
  });

  it("deletes a removed document", async () => {
    await handleDocumentWrite({before: snapshot("books/doc1", true), after: snapshot("books/doc1", false)});

    expect(typesense.requests.map(({method, url}) => `${method} ${url}`)).toStrictEqual(["DELETE /collections/books/documents/doc1"]);
  });

  it("treats deleting a document that is not in Typesense as success", async () => {
    typesense.status = 404;

    await expect(handleDocumentWrite({before: snapshot("books/doc1", true), after: snapshot("books/doc1", false)})).resolves.toBeUndefined();
  });

  it("still fails on other delete errors", async () => {
    typesense.status = 401;

    await expect(handleDocumentWrite({before: snapshot("books/doc1", true), after: snapshot("books/doc1", false)})).rejects.toThrow("Request failed with HTTP code 401");
  });

  it("ignores documents outside the configured collections", async () => {
    await handleDocumentWrite({before: snapshot("magazines/doc1", false), after: snapshot("magazines/doc1", true)});

    expect(typesense.requests).toStrictEqual([]);
  });

  describe.each([
    {paths: "users,users/{userId}/books", names: "users,books"},
    {paths: "users/{userId}/books,users", names: "books,users"},
  ])("with a collection and its subcollection configured as $paths", ({paths, names}) => {
    beforeEach(() => {
      process.env["FIRESTORE_COLLECTION_PATHS"] = paths;
      process.env["TYPESENSE_COLLECTION_NAMES"] = names;
    });

    afterEach(() => {
      process.env["FIRESTORE_COLLECTION_PATHS"] = "books";
      process.env["TYPESENSE_COLLECTION_NAMES"] = "books";
    });

    it("upserts each document into its own collection", async () => {
      await handleDocumentWrite({before: snapshot("users/u1", false), after: snapshot("users/u1", true, {name: "U"})});
      await handleDocumentWrite({before: snapshot("users/u1/books/b1", false), after: snapshot("users/u1/books/b1", true, {title: "T"})});

      expect(typesense.requests).toStrictEqual([
        {method: "POST", url: "/collections/users/documents?action=upsert", body: '{"name":"U","id":"u1"}'},
        {method: "POST", url: "/collections/books/documents?action=upsert", body: '{"title":"T","id":"b1","userId":"u1"}'},
      ]);
    });

    it("deletes a subcollection document only from its own collection", async () => {
      await handleDocumentWrite({before: snapshot("users/u1/books/b1", true), after: snapshot("users/u1/books/b1", false)});

      expect(typesense.requests.map(({method, url}) => `${method} ${url}`)).toStrictEqual(["DELETE /collections/books/documents/b1"]);
    });

    it("ignores documents in an unconfigured subcollection of a configured collection", async () => {
      await handleDocumentWrite({before: snapshot("users/u1/reviews/r1", false), after: snapshot("users/u1/reviews/r1", true)});
      await handleDocumentWrite({before: snapshot("users/u1/reviews/r1", true), after: snapshot("users/u1/reviews/r1", false)});

      expect(typesense.requests).toStrictEqual([]);
    });
  });
});
