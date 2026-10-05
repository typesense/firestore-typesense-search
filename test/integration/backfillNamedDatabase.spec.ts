import {getFirestore} from "firebase-admin/firestore";
import {afterAll, beforeAll, beforeEach, describe, expect, it} from "vitest";
import {TestEnvironment, waitForFunctions} from "./support/testEnvironment.js";

describe("backfillNamedDatabase", () => {
  const env = new TestEnvironment({
    dotenvPath: "test/integration/fixtures/named-database.env",
    outputAllEmulatorLogs: true,
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

  it("backfills documents from the configured database", async () => {
    const book = {title: "Named Database Book"};
    const bookRef = await env.firestore.collection("books").add(book);
    await waitForFunctions(2000);
    await env.recreateTypesenseCollections(["named_database_books"]);

    await env.triggerBackfill();
    await waitForFunctions(2000);

    expect(await env.exportDocuments("named_database_books")).toStrictEqual([{id: bookRef.id, title: book.title}]);
  });

  it("does not backfill documents from the default database", async () => {
    const defaultDatabase = getFirestore(env.app);
    await defaultDatabase.collection("books").add({title: "Default Database Book"});

    try {
      await env.triggerBackfill();
      await waitForFunctions(2000);

      expect(await env.exportDocuments("named_database_books")).toStrictEqual([]);
    } finally {
      await defaultDatabase.recursiveDelete(defaultDatabase.collection("books"));
    }
  });
});
