const {TestEnvironment} = require("./support/testEnvironment");

describe("indexOnWriteLogging - when shouldLogTypesenseInserts is false", () => {
  let testEnvironment;

  beforeAll((done) => {
    try {
      testEnvironment = new TestEnvironment({
        dotenvPath: "extensions/test-params-flatten-nested-true.local.env",
      });
      testEnvironment.setupTestEnvironment(done);
    } catch (e) {
      console.error(e);
      done(e);
    }
  });

  afterAll(async () => {
    await testEnvironment.teardownTestEnvironment();
  });

  beforeEach(async () => {
    await testEnvironment.clearAllData();
  });

  describe("testing onWrite logging", () => {
    it("logs only itemId", async () => {
      const docData = {
        author: "value1",
        title: "value2",
      };
      testEnvironment.resetCapturedEmulatorLogs();
      const docRef = await testEnvironment.firestore.collection(testEnvironment.config.firestoreCollectionPath).add(docData);

      await new Promise((r) => setTimeout(r, 5000));
      expect(testEnvironment.capturedEmulatorLogs).toContain(`Upserting document ${docRef.id}`);
    });
  });

  describe("testing backfill logging", () => {
    it("backfills existing Firestore data in all collections to Typesense", async () => {
      const book = {
        author: "Author A",
        title: "Title X",
        country: "USA",
      };
      const firestoreDoc = await testEnvironment.firestore.collection(testEnvironment.config.firestoreCollectionPath).add(book);
      // Wait for firestore cloud function to write to Typesense
      await new Promise((r) => setTimeout(r, 2000));

      // Get the first collection from the multi-collection config
      const firstCollection = Object.values(testEnvironment.config.collections)[0];

      // The above will automatically add the document to Typesense,
      // so delete it so we can test backfill
      await testEnvironment.typesense.collections(encodeURIComponent(firstCollection.typesenseCollection)).delete();
      await testEnvironment.typesense.collections().create({
        name: firstCollection.typesenseCollection,
        fields: [{name: ".*", type: "auto"}],
      });

      await testEnvironment.firestore.collection(testEnvironment.config.typesenseBackfillTriggerDocumentInFirestore.split("/")[0]).doc("backfill").set({trigger: true});
      // Wait for firestore cloud function to write to Typesense
      await new Promise((r) => setTimeout(r, 2000));

      // Check that the data was backfilled
      const typesenseDocsStr = await testEnvironment.typesense.collections(encodeURIComponent(firstCollection.typesenseCollection)).documents().export();
      const typesenseDocs = typesenseDocsStr.split("\n").map((s) => JSON.parse(s));
      expect(typesenseDocs.length).toBe(1);
      expect(typesenseDocs[0]).toStrictEqual({
        id: firestoreDoc.id,
        author: book.author,
        title: book.title,
      });

      // Check that the backfill log was written
      expect(testEnvironment.capturedEmulatorLogs).not.toContain("Backfilling document");

      expect(testEnvironment.capturedEmulatorLogs).toContain("Completed backfill for all collections");
    });
  });
});

describe("indexOnWriteLogging - when shouldLogTypesenseInserts is true", () => {
  let testEnvironment;

  beforeAll((done) => {
    testEnvironment = new TestEnvironment({
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
    testEnvironment.setupTestEnvironment(done);
  });

  afterAll(async () => {
    await testEnvironment.teardownTestEnvironment();
  });

  beforeEach(async () => {
    await testEnvironment.clearAllData();
  });

  describe("testing basic onWrite logging", () => {
    it("logs detailed inserts", async () => {
      const docData = {
        author: "value1",
        title: "value2",
      };

      testEnvironment.resetCapturedEmulatorLogs();
      const docRef = await testEnvironment.firestore.collection(testEnvironment.config.firestoreCollectionPath).add(docData);

      await new Promise((r) => setTimeout(r, 5000));
      expect(testEnvironment.capturedEmulatorLogs).toContain(`Upserting document ${JSON.stringify({...docData, id: docRef.id})}`);
    });
  });

  describe("testing backfill logging", () => {
    it("backfills existing Firestore data in all collections to Typesense", async () => {
      const book = {
        author: "Author A",
        title: "Title X",
        country: "USA",
      };
      const firestoreDoc = await testEnvironment.firestore.collection(testEnvironment.config.firestoreCollectionPath).add(book);
      // Wait for firestore cloud function to write to Typesense
      await new Promise((r) => setTimeout(r, 2000));

      // Get the first collection from the multi-collection config
      const firstCollection = Object.values(testEnvironment.config.collections)[0];

      // The above will automatically add the document to Typesense,
      // so delete it so we can test backfill
      await testEnvironment.typesense.collections(encodeURIComponent(firstCollection.typesenseCollection)).delete();
      await testEnvironment.typesense.collections().create({
        name: firstCollection.typesenseCollection,
        fields: [{name: ".*", type: "auto"}],
      });

      await testEnvironment.firestore.collection(testEnvironment.config.typesenseBackfillTriggerDocumentInFirestore.split("/")[0]).doc("backfill").set({trigger: true});
      // Wait for firestore cloud function to write to Typesense
      await new Promise((r) => setTimeout(r, 2000));

      // Check that the data was backfilled
      const typesenseDocsStr = await testEnvironment.typesense.collections(encodeURIComponent(firstCollection.typesenseCollection)).documents().export();
      const typesenseDocs = typesenseDocsStr.split("\n").map((s) => JSON.parse(s));
      expect(typesenseDocs.length).toBe(1);
      const expectedResult = {
        author: book.author,
        title: book.title,
        id: firestoreDoc.id,
      };
      expect(typesenseDocs[0]).toStrictEqual(expectedResult);

      // Check that the backfill log was written
      expect(testEnvironment.capturedEmulatorLogs).toContain(`Backfilling document ${JSON.stringify(expectedResult)}`);

      expect(testEnvironment.capturedEmulatorLogs).toContain("Completed backfill for all collections");
    });
  });
});
