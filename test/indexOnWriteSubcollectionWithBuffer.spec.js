const {TestEnvironment} = require("./support/testEnvironment");

const TEST_FIRESTORE_PARENT_COLLECTION_PATH = "users";
const TEST_FIRESTORE_CHILD_FIELD_NAME = "books";

const TEST_TYPESENSE_FIELDS = [
  {name: "author", type: "string"},
  {name: "title", type: "string"},
];

describe("indexOnWriteSubcollectionWithBuffer", () => {
  let testEnvironment;

  const parentCollectionPath = TEST_FIRESTORE_PARENT_COLLECTION_PATH;
  const childFieldName = TEST_FIRESTORE_CHILD_FIELD_NAME;
  let parentIdField = null;

  let config = null;
  let firestore = null;

  beforeAll((done) => {
    testEnvironment = new TestEnvironment({
      dotenvPath: "extensions/test-params-subcategory-buffer-enabled.local.env",
      outputAllEmulatorLogs: true,
      typesenseFields: TEST_TYPESENSE_FIELDS,
    });
    testEnvironment.setupTestEnvironment((err) => {
      const matches = testEnvironment.config.firestoreCollectionPath.match(/{([^}]+)}/g);
      expect(matches).toBeDefined();
      expect(matches.length).toBe(1);

      parentIdField = matches[0].replace(/{|}/g, "");
      expect(parentIdField).toBeDefined();

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

  describe("Subcollection writes with buffering", () => {
    it("adds subcollection document to buffer when created", async () => {
      const parentDocData = {
        name: "Parent User",
        age: 30,
      };
      const parentDocRef = await firestore.collection(parentCollectionPath).add(parentDocData);

      const subDocData = {
        author: "Subcollection Author",
        title: "Subcollection Title",
        nested_field: {
          field1: "value1",
          field2: ["value2", "value3", "value4"],
        },
      };
      const subDocRef = await parentDocRef.collection(childFieldName).add(subDocData);

      await new Promise((r) => setTimeout(r, 2500));

      const bufferSnapshot = await firestore.collection(config.typesenseBufferCollectionInFirestore).where("documentId", "==", subDocRef.id).where("type", "==", "upsert").get();

      expect(bufferSnapshot.empty).toBe(false);
      const bufferDoc = bufferSnapshot.docs[0].data();
      expect(bufferDoc.status).toBe("pending");
      expect(bufferDoc.document).toMatchObject(subDocData);
      expect(bufferDoc.documentId).toBe(subDocRef.id);

      expect(bufferDoc.pathParams).toBeDefined();
      expect(bufferDoc.pathParams[parentIdField]).toBe(parentDocRef.id);
    });

    it("adds subcollection document to buffer when updated", async () => {
      const parentDocRef = await firestore.collection(parentCollectionPath).add({
        name: "Parent User",
      });

      const originalSubDocData = {
        author: "Original Author",
        title: "Original Title",
      };
      const subDocRef = await parentDocRef.collection(childFieldName).add(originalSubDocData);

      await new Promise((r) => setTimeout(r, 2500));

      const updatedSubDocData = {
        author: "Updated Author",
        title: "Updated Title",
        additionalField: "New field",
      };
      await subDocRef.update(updatedSubDocData);

      await new Promise((r) => setTimeout(r, 2500));

      const bufferSnapshot = await firestore
        .collection(config.typesenseBufferCollectionInFirestore)
        .where("documentId", "==", subDocRef.id)
        .where("type", "==", "upsert")
        .orderBy("timestamp", "desc")
        .limit(1)
        .get();

      expect(bufferSnapshot.empty).toBe(false);
      const bufferDoc = bufferSnapshot.docs[0].data();
      expect(bufferDoc.status).toBe("pending");
      expect(bufferDoc.document).toMatchObject(updatedSubDocData);
      expect(bufferDoc.documentId).toBe(subDocRef.id);

      expect(bufferDoc.pathParams).toBeDefined();
      expect(bufferDoc.pathParams[parentIdField]).toBe(parentDocRef.id);
    });

    it("adds delete operation to buffer when subcollection document is deleted", async () => {
      const parentDocRef = await firestore.collection(parentCollectionPath).add({
        name: "Parent User for Delete Test",
      });

      const subDocData = {
        author: "Delete Subcollection Test",
        title: "Will Be Deleted",
      };
      const subDocRef = await parentDocRef.collection(childFieldName).add(subDocData);

      await new Promise((r) => setTimeout(r, 2500));

      await subDocRef.delete();

      await new Promise((r) => setTimeout(r, 2500));

      const bufferSnapshot = await firestore.collection(config.typesenseBufferCollectionInFirestore).where("documentId", "==", subDocRef.id).where("type", "==", "delete").get();

      expect(bufferSnapshot.empty).toBe(false);
      const bufferDoc = bufferSnapshot.docs[0].data();
      expect(bufferDoc.status).toBe("pending");
      expect(bufferDoc.documentId).toBe(subDocRef.id);
      expect(bufferDoc.type).toBe("delete");

      expect(bufferDoc.pathParams).toBeDefined();
      expect(bufferDoc.pathParams[parentIdField]).toBe(parentDocRef.id);
    });

    it("adds documents with nested fields correctly to buffer", async () => {
      const parentDocRef = await firestore.collection(parentCollectionPath).add({
        name: "Parent with Nested Fields",
      });

      const complexSubDocData = {
        author: "Complex Author",
        title: "Complex Title",
        nested_object: {
          level1: {
            level2: {
              level3: "Deep nested value",
              array: [1, 2, 3],
            },
            sibling: "Sibling value",
          },
          tags: ["fiction", "adventure", "bestseller"],
        },
        publishing: {
          date: new Date("2023-01-01"),
          publisher: "Test Publisher",
        },
      };

      const subDocRef = await parentDocRef.collection(childFieldName).add(complexSubDocData);

      await new Promise((r) => setTimeout(r, 2500));

      const bufferSnapshot = await firestore.collection(config.typesenseBufferCollectionInFirestore).where("documentId", "==", subDocRef.id).where("type", "==", "upsert").get();

      expect(bufferSnapshot.empty).toBe(false);
      const bufferDoc = bufferSnapshot.docs[0].data();

      expect(bufferDoc.status).toBe("pending");
      expect(bufferDoc.document).toBeDefined();
      expect(bufferDoc.document.nested_object).toBeDefined();
      expect(bufferDoc.document.nested_object.level1.level2.level3).toBe("Deep nested value");
      expect(bufferDoc.document.nested_object.level1.level2.array).toEqual([1, 2, 3]);
      expect(bufferDoc.document.nested_object.tags).toEqual(["fiction", "adventure", "bestseller"]);

      expect(bufferDoc.pathParams).toBeDefined();
      expect(bufferDoc.pathParams[parentIdField]).toBe(parentDocRef.id);
    });

    it("handles subcollection access after parent deletion", async () => {
      const parentDocRef = await firestore.collection(parentCollectionPath).add({
        name: "Parent to Delete",
      });

      const subDocRefs = [];
      for (let i = 0; i < 3; i++) {
        const subDocRef = await parentDocRef.collection(childFieldName).add({
          author: `Author ${i}`,
          title: `Title ${i}`,
        });
        subDocRefs.push(subDocRef);
      }

      await new Promise((r) => setTimeout(r, 2500));

      await parentDocRef.delete();

      await new Promise((r) => setTimeout(r, 2500));

      const parentDocSnapshot = await parentDocRef.get();
      expect(parentDocSnapshot.exists).toBe(false);

      // In Firestore, deleting a parent document does NOT automatically delete subcollection documents
      // Subcollection documents can still be accessed via their full path
      for (const subDocRef of subDocRefs) {
        const subDocSnapshot = await subDocRef.get();
        expect(subDocSnapshot.exists).toBe(true);
      }

      // NOTE: The indexOnWrite function is configured to listen only on a specific collection path
      // It wouldn't be triggered for parent document deletions since they're on a different path
      // So we don't expect any buffer entries for the parent document deletion

      // If we later delete a subcollection document directly, it should still add to buffer
      if (subDocRefs.length > 0) {
        const subDocRefToDelete = subDocRefs[0];
        await subDocRefToDelete.delete();

        await new Promise((r) => setTimeout(r, 2500));

        const subDocBufferSnapshot = await firestore.collection(config.typesenseBufferCollectionInFirestore).where("documentId", "==", subDocRefToDelete.id).where("type", "==", "delete").get();

        expect(subDocBufferSnapshot.empty).toBe(false);
        const subDocBufferDoc = subDocBufferSnapshot.docs[0].data();
        expect(subDocBufferDoc.status).toBe("pending");
        expect(subDocBufferDoc.type).toBe("delete");
        expect(subDocBufferDoc.pathParams).toBeDefined();
        expect(subDocBufferDoc.pathParams[parentIdField]).toBe(parentDocRef.id);
      }
    });
  });
});
