const {TestEnvironment} = require("./support/testEnvironment");

const TEST_FIRESTORE_PARENT_COLLECTION_PATH = "users";

const TEST_TYPESENSE_FIELDS = [
  {name: "author", type: "string"},
  {name: "title", type: "string"},
];

describe("processBuffer", () => {
  let testEnvironment;

  const parentCollectionPath = TEST_FIRESTORE_PARENT_COLLECTION_PATH;

  let config = null;
  let firestore = null;
  let typesense = null;

  beforeAll((done) => {
    testEnvironment = new TestEnvironment({
      dotenvPath: "extensions/test-params-flatten-nested-false.local.env",
      outputAllEmulatorLogs: true,
      typesenseFields: TEST_TYPESENSE_FIELDS,
    });
    testEnvironment.setupTestEnvironment((err) => {
      config = testEnvironment.config;
      firestore = testEnvironment.firestore;
      typesense = testEnvironment.typesense;
      done();
    });
  });

  afterAll(async () => {
    await testEnvironment.teardownTestEnvironment();
  });

  beforeEach(async () => {
    await firestore.recursiveDelete(firestore.collection(parentCollectionPath));

    await firestore.recursiveDelete(firestore.collection(config.typesenseBufferCollectionInFirestore));

    await testEnvironment.clearAllData();
  });

  describe("Processing buffered operations", () => {
    it("processes pending upsert operations from the buffer collection", async () => {
      const documentId = "test-doc-1";
      const bookData = {
        author: "Author A",
        title: "Title X",
      };

      await firestore.collection(config.typesenseBufferCollectionInFirestore).add({
        documentId: documentId,
        document: bookData,
        type: "upsert",
        status: "pending",
        timestamp: Date.now(),
        retries: 0,
      });

      const {based} = require("../functions/src/processBuffer");
      await based();

      await new Promise((r) => setTimeout(r, 2500));

      const bufferSnapshot = await firestore.collection(config.typesenseBufferCollectionInFirestore).where("documentId", "==", documentId).get();

      expect(bufferSnapshot.empty).toBe(false);
      expect(bufferSnapshot.docs[0].data().status).toBe("completed");

      const typesenseDocsStr = await typesense.collections(config.typesenseCollectionName).documents().export();
      const typesenseDocs = typesenseDocsStr.split("\n").map((s) => JSON.parse(s));

      expect(typesenseDocs.length).toBe(1);
      expect(typesenseDocs[0].id).toBe(documentId);
      expect(typesenseDocs[0].author).toBe(bookData.author);
      expect(typesenseDocs[0].title).toBe(bookData.title);
    });

    it("processes pending delete operations from the buffer collection", async () => {
      const documentId = "test-doc-to-delete";
      const documentData = {
        id: documentId,
        author: "Author B",
        title: "Title Y",
      };

      await typesense.collections(config.typesenseCollectionName).documents().create(documentData);

      const typesenseDocsStrOriginal = await typesense.collections(config.typesenseCollectionName).documents().export();
      const typesenseDocs = typesenseDocsStrOriginal.split("\n").map((s) => JSON.parse(s));
      expect(typesenseDocs.length).toBe(1);

      await firestore.collection(config.typesenseBufferCollectionInFirestore).add({
        documentId: documentId,
        type: "delete",
        status: "pending",
        timestamp: Date.now(),
        retries: 0,
      });

      const {based} = require("../functions/src/processBuffer");
      await based();

      await new Promise((r) => setTimeout(r, 2500));

      const bufferSnapshot = await firestore.collection(config.typesenseBufferCollectionInFirestore).where("documentId", "==", documentId).get();

      expect(bufferSnapshot.empty).toBe(false);
      expect(bufferSnapshot.docs[0].data().status).toBe("completed");

      const typesenseDocsStrAfterDelete = await typesense.collections(config.typesenseCollectionName).documents().export();
      expect(typesenseDocsStrAfterDelete).toBe(""); // Empty means no documents
    });

    it("handles retry logic for failed deletions", async () => {
      const missingDocId = "malformed-doc";

      const documentData = {
        id: "test-doc-to-delete",
        author: "Author B",
        title: "Title Y",
      };

      await typesense.collections(config.typesenseCollectionName).documents().create(documentData);
      await firestore.collection(config.typesenseBufferCollectionInFirestore).add({
        documentId: missingDocId,
        type: "delete",
        status: "pending",
        timestamp: Date.now(),
        retries: 0,
      });
      await firestore.collection(config.typesenseBufferCollectionInFirestore).add({
        documentId: documentData.id,
        document: documentData,
        type: "delete",
        status: "pending",
        timestamp: Date.now(),
        retries: 0,
      });

      const {based} = require("../functions/src/processBuffer");
      for (let i = 0; i < config.typesenseBufferMaxRetries; i++) {
        await based();

        const bufferSnapshot = await firestore.collection(config.typesenseBufferCollectionInFirestore).where("documentId", "==", missingDocId).get();

        expect(bufferSnapshot.empty).toBe(false);
        const docData = bufferSnapshot.docs[0].data();

        console.dir(docData, {depth: null});
        expect(docData.status).toBe("retrying");
        expect(docData.retries).toBe(i + 1);
      }

      await based();
      await new Promise((r) => setTimeout(r, 2500));
      const bufferSnapshot = await firestore.collection(config.typesenseBufferCollectionInFirestore).where("documentId", "==", missingDocId).get();

      expect(bufferSnapshot.empty).toBe(false);
      const docData = bufferSnapshot.docs[0].data();

      expect(docData.status).toBe("failed");
      expect(docData.retries).toBe(config.typesenseBufferMaxRetries);
      expect(docData.lastError).toBeDefined();
    });

    it("handles retry logic for failed upserts", async () => {
      const documentId = "malformed-doc";

      await firestore.collection(config.typesenseBufferCollectionInFirestore).add({
        documentId: documentId,
        // Intentionally missing the document field for upsert to cause failure
        type: "upsert",
        status: "pending",
        timestamp: Date.now(),
        retries: 0,
      });

      const {based} = require("../functions/src/processBuffer");
      for (let i = 0; i < config.typesenseBufferMaxRetries; i++) {
        await based();

        const bufferSnapshot = await firestore.collection(config.typesenseBufferCollectionInFirestore).where("documentId", "==", documentId).get();

        expect(bufferSnapshot.empty).toBe(false);
        const docData = bufferSnapshot.docs[0].data();

        console.dir(docData, {depth: null});
        expect(docData.status).toBe("retrying");
        expect(docData.retries).toBe(i + 1);
      }

      await based();
      await new Promise((r) => setTimeout(r, 2500));
      const bufferSnapshot = await firestore.collection(config.typesenseBufferCollectionInFirestore).where("documentId", "==", documentId).get();

      expect(bufferSnapshot.empty).toBe(false);
      const docData = bufferSnapshot.docs[0].data();

      expect(docData.status).toBe("failed");
      expect(docData.retries).toBe(config.typesenseBufferMaxRetries);
      expect(docData.lastError).toBeDefined();
    });
  });
});
