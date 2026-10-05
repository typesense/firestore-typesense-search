import {afterAll, beforeAll, beforeEach, describe, expect, it} from "vitest";
import {TestEnvironment, waitForFunctions} from "./support/testEnvironment.js";

async function expectBackfillOfOneBook(env: TestEnvironment): Promise<Readonly<Record<string, unknown>>> {
  const {firestorePath, typesenseCollection} = env.firstCollection;
  const book = {author: "Author A", title: "Title X", country: "USA"};
  const firestoreDoc = await env.firestore.collection(firestorePath).add(book);
  await waitForFunctions(2000);

  await env.recreateTypesenseCollections([typesenseCollection], {enableNestedFields: false});

  await env.triggerBackfill();
  await waitForFunctions(2000);

  const expected = {author: book.author, title: book.title, id: firestoreDoc.id};
  expect(await env.exportDocuments(typesenseCollection)).toStrictEqual([expected]);
  expect(env.capturedEmulatorLogs).toContain("Completed backfill for all collections");
  return expected;
}

describe("indexOnWriteLogging - when shouldLogTypesenseInserts is false", () => {
  const env = new TestEnvironment({
    dotenvPath: "test/integration/fixtures/flatten-nested-true.env",
  });

  beforeAll(async () => {
    await env.setup();
  });

  afterAll(async () => {
    await env.teardown();
  });

  beforeEach(async () => {
    await env.clearAllData();
  });

  it("logs only the document id on write", async () => {
    env.resetCapturedEmulatorLogs();
    const docRef = await env.firestore.collection(env.firstCollection.firestorePath).add({author: "value1", title: "value2"});

    await waitForFunctions(5000);
    expect(env.capturedEmulatorLogs).toContain(`Upserting document ${docRef.id}`);
  });

  it("does not log backfilled documents", async () => {
    await expectBackfillOfOneBook(env);
    expect(env.capturedEmulatorLogs).not.toContain("Backfilling document");
  });
});

describe("indexOnWriteLogging - when shouldLogTypesenseInserts is true", () => {
  const env = new TestEnvironment({
    dotenvConfig: `
LOCATION=us-central1
FIRESTORE_DATABASE_REGION=nam5
FIRESTORE_COLLECTION_PATHS=books
TYPESENSE_COLLECTION_NAMES=books_firestore/1
FIRESTORE_COLLECTION_FIELDS_LIST=author,title,rating,isAvailable,location,createdAt,nested_field,tags,nullField,ref
FLATTEN_NESTED_DOCUMENTS_LIST=true
LOG_TYPESENSE_INSERTS=true
TYPESENSE_HOSTS=localhost
TYPESENSE_PORT=8108
TYPESENSE_PROTOCOL=http
TYPESENSE_API_KEY=xyz
`,
  });

  beforeAll(async () => {
    await env.setup();
  });

  afterAll(async () => {
    await env.teardown();
  });

  beforeEach(async () => {
    await env.clearAllData();
  });

  it("logs the full document on write", async () => {
    const docData = {author: "value1", title: "value2"};

    env.resetCapturedEmulatorLogs();
    const docRef = await env.firestore.collection(env.firstCollection.firestorePath).add(docData);

    await waitForFunctions(5000);
    expect(env.capturedEmulatorLogs).toContain(`Upserting document ${JSON.stringify({...docData, id: docRef.id})}`);
  });

  it("logs the full document on backfill", async () => {
    const expected = await expectBackfillOfOneBook(env);
    expect(env.capturedEmulatorLogs).toContain(`Backfilling document ${JSON.stringify(expected)}`);
  });
});
