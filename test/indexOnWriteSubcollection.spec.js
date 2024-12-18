const firebase = require("firebase-admin");
const config = require("../functions/src/config.js");
const typesense = require("../functions/src/createTypesenseClient.js")();

const app = firebase.initializeApp({
  // Use a special URL to talk to the Realtime Database emulator
  databaseURL: `${process.env.FIREBASE_DATABASE_EMULATOR_HOST}?ns=${process.env.GCLOUD_PROJECT}`,
  projectId: process.env.GCLOUD_PROJECT,
});
const firestore = app.firestore();

describe("indexOnWriteSubcollection", () => {
  const parentCollectionPath = process.env.TEST_FIRESTORE_PARENT_COLLECTION_PATH;
  const childFieldName = process.env.TEST_FIRESTORE_CHILD_FIELD_NAME;
  let parentIdField = null;

  beforeAll(async () => {
    const matches = config.firestoreCollectionPath.match(/{([^}]+)}/g);
    expect(matches).toBeDefined();
    expect(matches.length).toBe(1);

    parentIdField = matches[0].replace(/{|}/g, "");
    expect(parentIdField).toBeDefined();
  });

  beforeEach(async () => {
    // delete the Firestore collection
    await firestore.recursiveDelete(firestore.collection(parentCollectionPath));

    // Clear any previously created collections
    try {
      await typesense.collections(encodeURIComponent(config.typesenseCollectionName)).delete();
    } catch (e) {
      console.info(`${config.typesenseCollectionName} collection not found, proceeding...`);
    }

    // recreate the Typesense collection
    await typesense.collections().create({
      name: config.typesenseCollectionName,
      fields: [{name: ".*", type: "auto"}],
      enable_nested_fields: true,
    });
  });

  afterAll(async () => {
    // clean up the whole firebase app
    await app.delete();
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
