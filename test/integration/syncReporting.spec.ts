import {Timestamp} from "firebase-admin/firestore";
import {afterAll, beforeAll, beforeEach, describe, expect, it} from "vitest";
import {TestEnvironment, waitForFunctions} from "./support/testEnvironment.js";

const COLLECTION = "reporting_books";
const anyTimestamp: unknown = expect.any(Timestamp);

describe("syncReporting", () => {
  const env = new TestEnvironment({
    dotenvConfig: `
LOCATION=us-central1
FIRESTORE_DATABASE_REGION=nam5
FIRESTORE_COLLECTION_PATHS=books
TYPESENSE_COLLECTION_NAMES=${COLLECTION}
FIRESTORE_COLLECTION_FIELDS_LIST=title
TYPESENSE_HOSTS=localhost
TYPESENSE_PORT=8108
TYPESENSE_PROTOCOL=http
TYPESENSE_API_KEY=xyz
`,
  });

  const issueRef = (docId: string): FirebaseFirestore.DocumentReference => env.firestore.doc(`typesense_sync/issues/typesense_issues/${COLLECTION}:books%2F${docId}`);

  async function recreateWithIntegerTitle(): Promise<void> {
    await env.typesense
      .collections(COLLECTION)
      .delete()
      .catch(() => undefined);
    await env.typesense.collections().create({name: COLLECTION, fields: [{name: "title", type: "int32"}]});
  }

  beforeAll(async () => {
    await env.setup();
  });

  afterAll(async () => {
    await env.teardown();
  });

  beforeEach(async () => {
    await env.clearAllData();
    await env.firestore.recursiveDelete(env.firestore.collection("typesense_sync"));
  });

  it("does not resync a write that changes no indexed field", async () => {
    const ref = await env.firestore.collection("books").add({title: "Dune", views: 1});
    await waitForFunctions(3000);
    await env.typesense.collections(COLLECTION).documents(ref.id).delete();

    await ref.update({views: 2});
    await waitForFunctions(3000);
    expect(await env.exportDocuments(COLLECTION)).toStrictEqual([]);

    await ref.update({title: "Dune Messiah"});
    await waitForFunctions(3000);
    expect(await env.exportDocuments(COLLECTION)).toStrictEqual([{id: ref.id, title: "Dune Messiah"}]);
  });

  it("records a document Typesense rejects in an issue document", async () => {
    await recreateWithIntegerTitle();

    const ref = await env.firestore.collection("books").add({title: "Dune"});
    await waitForFunctions(3000);

    const issue = await issueRef(ref.id).get();
    expect(issue.data()).toStrictEqual({
      collection: COLLECTION,
      documentPath: `books/${ref.id}`,
      stage: "typesense",
      message: "Typesense rejected the document (HTTP 400): Field `title` must be an int32.",
      detail: {httpStatus: 400, response: "Field `title` must be an int32."},
      lastSeenAt: anyTimestamp,
      count: 1,
      expireAt: anyTimestamp,
    });
    const expireAt: unknown = issue.get("expireAt");
    expect(expireAt instanceof Timestamp ? expireAt.toMillis() - Date.now() : 0).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
  });

  it("reports the backfill and clears the issues of documents it indexes", async () => {
    await recreateWithIntegerTitle();
    const ref = await env.firestore.collection("books").add({title: "Dune"});
    await waitForFunctions(3000);
    expect((await issueRef(ref.id).get()).exists).toBe(true);

    await env.recreateTypesenseCollections([COLLECTION]);
    await env.triggerBackfill();
    await waitForFunctions(3000);

    expect((await issueRef(ref.id).get()).exists).toBe(false);
    expect((await env.firestore.doc("typesense_sync/backfill_status").get()).data()).toStrictEqual({
      state: "completed",
      startedAt: anyTimestamp,
      finishedAt: anyTimestamp,
      request: {kind: "all"},
      collections: [{firestorePath: "books", typesenseCollection: COLLECTION, read: 1, indexed: 1, excluded: 0, failed: 0}],
      failureCount: 0,
      failures: [],
    });
  });
});
