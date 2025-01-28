const {TestEnvironment} = require("./support/testEnvironment");

// test case configs
const TEST_FIRESTORE_PARENT_COLLECTION_PATH = "users";
const TEST_FIRESTORE_CHILD_FIELD_NAME = "books";

describe("backfillSubcollection", () => {
  let testEnvironment;

  const parentCollectionPath = TEST_FIRESTORE_PARENT_COLLECTION_PATH;
  const unrelatedCollectionPath = "unrelatedCollectionToNotBackfill";
  const childFieldName = TEST_FIRESTORE_CHILD_FIELD_NAME;
  let parentIdField = null;

  let config = null;
  let firestore = null;
  let typesense = null;

  beforeAll((done) => {
    testEnvironment = new TestEnvironment({
      dotenvPath: "extensions/test-params-subcategory-flatten-nested-false.local.env",
      outputAllEmulatorLogs: true,
    });
    testEnvironment.setupTestEnvironment((err) => {
      const matches = testEnvironment.config.firestoreCollectionPath.match(/{([^}]+)}/g);
      expect(matches).toBeDefined();
      expect(matches.length).toBe(1);

      parentIdField = matches[0].replace(/{|}/g, "");
      expect(parentIdField).toBeDefined();

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
    // For subcollections, need special handling to clear parent collection. Deleting here triggers firebase functions
    await firestore.recursiveDelete(firestore.collection(parentCollectionPath));
    await firestore.recursiveDelete(firestore.collection(unrelatedCollectionPath));

    await testEnvironment.clearAllData();
  });

  describe("when firestore_collections is not specified", () => {
    it("backfills existing Firestore data in all collections to Typesense" +
      " when `trigger: true` is set on trigger document", async () => {
      const parentDocData = {
        nested_field: {
          field1: "value1",
        },
      };

      const subDocData = {
        author: "Author A",
        title: "Title X",
        country: "USA",
      };

      // create parent document in Firestore
      const parentDocRef = await testEnvironment.firestore.collection(parentCollectionPath).add(parentDocData);

      // create a subcollection with document under the parent document
      const subCollectionRef = parentDocRef.collection(childFieldName);
      const subDocRef = await subCollectionRef.add(subDocData);

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
        id: subDocRef.id,
        author: subDocData.author,
        title: subDocData.title,
        [parentIdField]: parentDocRef.id,
      });
    });
  });

  describe("when firestore_collections is specified", () => {
    describe("when firestore_collections includes this collection", () => {
      it("backfills existing Firestore data in this particular collection to Typesense" +
        " when `trigger: true` is set on trigger document", async () => {
        const parentDocData = {
          nested_field: {
            field1: "value1",
          },
        };

        const subDocData = {
          author: "Author A",
          title: "Title X",
          country: "USA",
        };

        // create parent document in Firestore
        const parentDocRef = await firestore.collection(parentCollectionPath).add(parentDocData);

        // create a subcollection with document under the parent document
        const subCollectionRef = parentDocRef.collection(childFieldName);
        const subDocRef = await subCollectionRef.add(subDocData);

        // Wait for firestore cloud function to write to Typesense
        await new Promise((r) => setTimeout(r, 2000));

        // The above will automatically add the document to Typesense,
        // so delete it so we can test backfill
        await typesense.collections(encodeURIComponent(config.typesenseCollectionName)).delete();
        await typesense.collections().create({
          name: config.typesenseCollectionName,
          fields: [
            {name: ".*", type: "auto"},
          ],
        });

        await firestore
          .collection(config.typesenseBackfillTriggerDocumentInFirestore.split("/")[0])
          .doc("backfill")
          .set({
            trigger: true,
            firestore_collections: [config.firestoreCollectionPath],
          });
        // Wait for firestore cloud function to write to Typesense
        await new Promise((r) => setTimeout(r, 2000));

        // Check that the data was backfilled
        const typesenseDocsStr = await typesense
          .collections(encodeURIComponent(config.typesenseCollectionName))
          .documents()
          .export();
        const typesenseDocs = typesenseDocsStr.split("\n").map((s) => JSON.parse(s));
        console.log(typesenseDocs);
        expect(typesenseDocs.length).toBe(1);
        expect(typesenseDocs[0]).toStrictEqual({
          id: subDocRef.id,
          author: subDocData.author,
          title: subDocData.title,
          [parentIdField]: parentDocRef.id,
        });
      });
    });

    describe("when firestore_collections does not include this collection", () => {
      it("does not backfill existing Firestore data in this particular collection to Typesense" +
        " when `trigger: true` is set on trigger document", async () => {
        const parentDocData = {
          nested_field: {
            field1: "value1",
          },
        };

        const subDocData = {
          author: "Author A",
          title: "Title X",
          country: "USA",
        };

        // create parent document in Firestore
        const parentDocRef = await firestore.collection(parentCollectionPath).add(parentDocData);

        // create a subcollection with document under the parent document
        const subCollectionRef = parentDocRef.collection(childFieldName);
        const subDocRef = await subCollectionRef.add(subDocData);
        // Wait for firestore cloud function to write to Typesense
        await new Promise((r) => setTimeout(r, 2000));

        // The above will automatically add the document to Typesense,
        // so delete it so we can test backfill
        await typesense.collections(encodeURIComponent(config.typesenseCollectionName)).delete();
        await typesense.collections().create({
          name: config.typesenseCollectionName,
          fields: [
            {name: ".*", type: "auto"},
          ],
        });

        await firestore
          .collection(config.typesenseBackfillTriggerDocumentInFirestore.split("/")[0])
          .doc("backfill")
          .set({
            trigger: true,
            firestore_collections: ["some/other/collection"],
          });
        // Wait for firestore cloud function to write to Typesense
        await new Promise((r) => setTimeout(r, 2000));

        // Check that the data was not backfilled
        const typesenseDocsStr = await typesense
          .collections(encodeURIComponent(config.typesenseCollectionName))
          .documents()
          .export();
        expect(typesenseDocsStr).toEqual("");

        // Check that the error was logged
        testEnvironment.resetCapturedEmulatorLogs();
        subDocRef.delete();
        await new Promise((r) => setTimeout(r, 5000));

        expect(testEnvironment.capturedEmulatorLogs).toContain(
          `Could not find a document with id: ${subDocRef.id}`,
        );
      });
    });
  });

  describe("Backfill subcollections", () => {
    it("Ensure backfill doesnt backfill unrelated collections", async () => {
      const parentDocData = {
        nested_field: {
          field1: "value1",
        },
      };

      const subDocData = {
        author: "Author A",
        title: "Title X",
        country: "USA",
      };

      // create parent document in Firestore
      const parentDocRef = await firestore.collection(parentCollectionPath).add(parentDocData);

      // create a subcollection with document under the parent document
      const subCollectionRef = parentDocRef.collection(childFieldName);
      const subDocRef = await subCollectionRef.add(subDocData);

      // Create an unrelated set of documents that should not be backfilled
      const unrelatedParentDocData = {
        nested_field: {
          field1: "value3",
        },
      };

      const unrelatedSubDocData = {
        author: "Author C",
        title: "Title Z",
        country: "CAN",
      };

      // create unrelated parent document in Firestore
      const unrelatedParentDocRef = await firestore.collection(unrelatedCollectionPath).add(unrelatedParentDocData);

      // create a subcollection with document under the unrelatedparent document
      const unrelatedSubCollectionRef = unrelatedParentDocRef.collection(childFieldName);
      await unrelatedSubCollectionRef.add(unrelatedSubDocData);

      // Wait for firestore cloud function to write to Typesense
      await new Promise((r) => setTimeout(r, 2000));

      // The above will automatically add the document to Typesense,
      // so delete it so we can test backfill
      await typesense.collections(encodeURIComponent(config.typesenseCollectionName)).delete();
      await typesense.collections().create({
        name: config.typesenseCollectionName,
        fields: [
          {name: ".*", type: "auto"},
        ],
      });

      await firestore
        .collection(config.typesenseBackfillTriggerDocumentInFirestore.split("/")[0])
        .doc("backfill")
        .set({
          trigger: true,
          firestore_collections: [config.firestoreCollectionPath],
        });
      // Wait for firestore cloud function to write to Typesense
      await new Promise((r) => setTimeout(r, 2000));

      // Check that the data was backfilled
      const typesenseDocsStr = await typesense
        .collections(encodeURIComponent(config.typesenseCollectionName))
        .documents()
        .export();
      const typesenseDocs = typesenseDocsStr.split("\n").map((s) => JSON.parse(s));
      expect(typesenseDocs.length).toBe(1);

      expect(typesenseDocs[0]).toStrictEqual({
        id: subDocRef.id,
        author: subDocData.author,
        title: subDocData.title,
        [parentIdField]: parentDocRef.id,
      });
    });
  });
});
