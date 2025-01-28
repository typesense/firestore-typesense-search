const {TestEnvironment} = require("./support/testEnvironment");

// test case configs
const TEST_FIRESTORE_PARENT_COLLECTION_PATH = "users";
const TEST_FIRESTORE_CHILD_FIELD_NAME = "books";


describe("indexOnWriteSubcollection", () => {
  let testEnvironment;

  const parentCollectionPath = TEST_FIRESTORE_PARENT_COLLECTION_PATH;
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

    await testEnvironment.clearAllData();
  });

  describe("Backfill from dynamic subcollections", () => {
    it("backfills documents from dynamic subcollections to Typesense", async () => {
      process.env.FLATTEN_NESTED_DOCUMENTS = "false";

      const parentDocData = {
        nested_field: {
          field1: "value1",
        },
      };

      const subDocData = {
        nested_field: {
          field1: "value1",
          field2: ["value2", "value3", "value4"],
          field3: {
            fieldA: "valueA",
            fieldB: ["valueB", "valueC", "valueD"],
          },
        },
      };

      // create parent document in Firestore
      const parentDocRef = await firestore.collection(parentCollectionPath).add(parentDocData);

      // create a subcollection with document under the parent document
      const subCollectionRef = parentDocRef.collection(childFieldName);
      const subDocRef = await subCollectionRef.add(subDocData);

      // wait for the Firestore cloud function to write to Typesense
      await new Promise((r) => setTimeout(r, 2500));

      // check that the document was indexed
      let typesenseDocsStr = await typesense.collections(encodeURIComponent(config.typesenseCollectionName)).documents().export({exclude_fields: ""});
      let typesenseDocs = typesenseDocsStr.split("\n").map((s) => JSON.parse(s));

      expect(typesenseDocs.length).toBe(1);
      expect(typesenseDocs[0]).toStrictEqual({
        id: subDocRef.id,
        ...subDocData,
        [parentIdField]: parentDocRef.id,
      });

      // update document in Firestore
      subDocData.nested_field.field1 = "new value1";

      await subDocRef.update(subDocData);

      // wait for the Firestore cloud function to write to Typesense
      await new Promise((r) => setTimeout(r, 2500));

      // check that the document was updated
      typesenseDocsStr = await typesense.collections(encodeURIComponent(config.typesenseCollectionName)).documents().export({exclude_fields: ""});
      typesenseDocs = typesenseDocsStr.split("\n").map((s) => JSON.parse(s));

      expect(typesenseDocs.length).toBe(1);
      expect(typesenseDocs[0]).toStrictEqual({
        id: subDocRef.id,
        ...subDocData,
        [parentIdField]: parentDocRef.id,
      });

      // delete both documents in Firestore
      await subDocRef.delete();
      await parentDocRef.delete();

      // wait for the Firestore cloud function to write to Typesense
      await new Promise((r) => setTimeout(r, 2500));

      // check that the subcollection document was deleted
      typesenseDocsStr = await typesense.collections(encodeURIComponent(config.typesenseCollectionName)).documents().export({exclude_fields: ""});

      expect(typesenseDocsStr).toBe("");
    });
  });
});
