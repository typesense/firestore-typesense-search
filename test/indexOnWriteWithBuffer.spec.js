const {TestEnvironment} = require("./support/testEnvironment");

const TEST_FIRESTORE_PARENT_COLLECTION_PATH = "users";

const TEST_TYPESENSE_FIELDS = [
  {name: "author", type: "string"},
  {name: "title", type: "string"},
];

describe("indexOnWriteWithBuffer", () => {
  let testEnvironment;

  const parentCollectionPath = TEST_FIRESTORE_PARENT_COLLECTION_PATH;

  let config = null;
  let firestore = null;

  beforeAll((done) => {
    testEnvironment = new TestEnvironment({
      dotenvPath: "extensions/test-params-buffer-enabled.local.env",
      outputAllEmulatorLogs: true,
      typesenseFields: TEST_TYPESENSE_FIELDS,
    });
    testEnvironment.setupTestEnvironment((err) => {
      config = testEnvironment.config;
      firestore = testEnvironment.firestore;

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

  describe("Regular collection writes with buffering", () => {
    it("adds document to buffer on create and update", async () => {
      const docData = {
        author: "Author A",
        title: "Title X",
      };

      const docRef = await firestore.collection(config.firestoreCollectionPath).add(docData);

      await new Promise((r) => setTimeout(r, 2500));

      let bufferSnapshot = await firestore.collection(config.typesenseBufferCollectionInFirestore).where("documentId", "==", docRef.id).where("type", "==", "upsert").get();

      expect(bufferSnapshot.empty).toBe(false);
      let bufferDoc = bufferSnapshot.docs[0].data();
      expect(bufferDoc.status).toBe("pending");
      expect(bufferDoc.document).toMatchObject(docData);
      expect(bufferDoc.documentId).toBe(docRef.id);

      const updatedData = {
        author: "Author A Updated",
        title: "Title X Updated",
      };
      await docRef.update(updatedData);

      await new Promise((r) => setTimeout(r, 2500));

      bufferSnapshot = await firestore
        .collection(config.typesenseBufferCollectionInFirestore)
        .where("documentId", "==", docRef.id)
        .where("type", "==", "upsert")
        .orderBy("timestamp", "desc")
        .limit(1)
        .get();

      expect(bufferSnapshot.empty).toBe(false);
      bufferDoc = bufferSnapshot.docs[0].data();
      expect(bufferDoc.status).toBe("pending");
      expect(bufferDoc.document).toMatchObject(updatedData);
      expect(bufferDoc.documentId).toBe(docRef.id);
    });

    it("adds delete operation to buffer when document is deleted", async () => {
      const docData = {
        author: "Delete Test Author",
        title: "Delete Test Title",
      };

      const docRef = await firestore.collection(config.firestoreCollectionPath).add(docData);

      await new Promise((r) => setTimeout(r, 2500));

      await docRef.delete();

      await new Promise((r) => setTimeout(r, 2500));

      const bufferSnapshot = await firestore.collection(config.typesenseBufferCollectionInFirestore).where("documentId", "==", docRef.id).where("type", "==", "delete").get();

      expect(bufferSnapshot.empty).toBe(false);
      const bufferDoc = bufferSnapshot.docs[0].data();
      expect(bufferDoc.status).toBe("pending");
      expect(bufferDoc.documentId).toBe(docRef.id);
      expect(bufferDoc.type).toBe("delete");
    });
  });

  describe("Buffer format validation", () => {
    it("includes correct timestamp and retry information in buffer documents", async () => {
      const docData = {
        author: "Time Test Author",
        title: "Time Test Title",
      };

      const docRef = await firestore.collection(config.firestoreCollectionPath).add(docData);

      await new Promise((r) => setTimeout(r, 2500));

      const bufferSnapshot = await firestore.collection(config.typesenseBufferCollectionInFirestore).where("documentId", "==", docRef.id).get();

      expect(bufferSnapshot.empty).toBe(false);
      const bufferDoc = bufferSnapshot.docs[0].data();

      expect(bufferDoc.documentId).toBe(docRef.id);
      expect(bufferDoc.document).toMatchObject(docData);
      expect(bufferDoc.type).toBe("upsert");
      expect(bufferDoc.status).toBe("pending");
      expect(bufferDoc.timestamp).toBeDefined();
      expect(bufferDoc.retries).toBe(0);
    });
  });
});
