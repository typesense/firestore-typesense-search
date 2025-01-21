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
      expect(testEnvironment.capturedEmulatorLogs).toContain(
        `Upserting document ${docRef.id}`,
      );
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

      // The above will automatically add the document to Typesense,
      // so delete it so we can test backfill
      await testEnvironment.typesense.collections(encodeURIComponent(testEnvironment.config.typesenseCollectionName)).delete();
      await testEnvironment.typesense.collections().create({
        name: testEnvironment.config.typesenseCollectionName,
        fields: [
          {name: ".*", type: "auto"},
        ],
      });

      await testEnvironment.firestore
        .collection(testEnvironment.config.typesenseBackfillTriggerDocumentInFirestore.split("/")[0])
        .doc("backfill")
        .set({trigger: true});
      // Wait for firestore cloud function to write to Typesense
      await new Promise((r) => setTimeout(r, 2000));

      // Check that the data was backfilled
      const typesenseDocsStr = await testEnvironment.typesense
        .collections(encodeURIComponent(testEnvironment.config.typesenseCollectionName))
        .documents()
        .export();
      const typesenseDocs = typesenseDocsStr.split("\n").map((s) => JSON.parse(s));
      expect(typesenseDocs.length).toBe(1);
      expect(typesenseDocs[0]).toStrictEqual({
        id: firestoreDoc.id,
        author: book.author,
        title: book.title,
      });

      // Check that the backfill log was written
      expect(testEnvironment.capturedEmulatorLogs).not.toContain(
        "Backfilling document",
      );

      expect(testEnvironment.capturedEmulatorLogs).toContain(
        "Imported 1 documents into Typesense",
      );
    });
  });
});

describe("indexOnWriteLogging - when shouldLogTypesenseInserts is true", () => {
  let testEnvironment;

  beforeAll((done) => {
    testEnvironment = new TestEnvironment({
      dotenvConfig: `
LOCATION=us-central1
FIRESTORE_COLLECTION_PATH=books
FIRESTORE_COLLECTION_FIELDS=author,title,rating,isAvailable,location,createdAt,nested_field,tags,nullField,ref
FLATTEN_NESTED_DOCUMENTS=true
LOG_TYPESENSE_INSERTS=true
TYPESENSE_HOSTS=localhost
TYPESENSE_PORT=8108
TYPESENSE_PROTOCOL=http
TYPESENSE_COLLECTION_NAME=books_firestore/1
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
      expect(testEnvironment.capturedEmulatorLogs).toContain(
        `Upserting document ${JSON.stringify({...docData, id: docRef.id})}`,
      );
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

      // The above will automatically add the document to Typesense,
      // so delete it so we can test backfill
      await testEnvironment.typesense.collections(encodeURIComponent(testEnvironment.config.typesenseCollectionName)).delete();
      await testEnvironment.typesense.collections().create({
        name: testEnvironment.config.typesenseCollectionName,
        fields: [
          {name: ".*", type: "auto"},
        ],
      });

      await testEnvironment.firestore
        .collection(testEnvironment.config.typesenseBackfillTriggerDocumentInFirestore.split("/")[0])
        .doc("backfill")
        .set({trigger: true});
      // Wait for firestore cloud function to write to Typesense
      await new Promise((r) => setTimeout(r, 2000));

      // Check that the data was backfilled
      const typesenseDocsStr = await testEnvironment.typesense
        .collections(encodeURIComponent(testEnvironment.config.typesenseCollectionName))
        .documents()
        .export();
      const typesenseDocs = typesenseDocsStr.split("\n").map((s) => JSON.parse(s));
      expect(typesenseDocs.length).toBe(1);
      const expectedResult = {
        author: book.author,
        title: book.title,
        id: firestoreDoc.id,
      };
      expect(typesenseDocs[0]).toStrictEqual(expectedResult);

      // Check that the backfill log was written
      expect(testEnvironment.capturedEmulatorLogs).toContain(
        `Backfilling document ${JSON.stringify(expectedResult)}`,
      );

      expect(testEnvironment.capturedEmulatorLogs).toContain(
        "Imported 1 documents into Typesense",
      );
    });
  });
});
