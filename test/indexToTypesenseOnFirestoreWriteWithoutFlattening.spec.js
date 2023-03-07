const firebase = require("firebase-admin");
const config = require("../functions/src/config");
const typesense = require("../functions/src/typesenseClient");

const app = firebase.initializeApp({
  // Use a special URL to talk to the Realtime Database emulator
  databaseURL: `${process.env.FIREBASE_DATABASE_EMULATOR_HOST}?ns=${process.env.GCLOUD_PROJECT}`,
  projectId: process.env.GCLOUD_PROJECT,
});
const firestore = app.firestore();

describe("indexToTypesenseOnFirestoreWriteWithoutFlattening", () => {
  beforeEach(async () => {
    // delete the Firestore collection
    await firestore.recursiveDelete(firestore.collection(config.firestoreCollectionPath));

    // delete the Typesense collection
    try {
      await typesense.collections(encodeURIComponent(config.typesenseCollectionName)).delete();
    } catch (e) {
      console.info(`${config.typesenseCollectionName} collection not found, proceeding...`);
    }

    // recreate the Typesense collection
    await typesense.collections().create({
      name: config.typesenseCollectionName,
      fields: [{name: ".*", type: "auto"}],
    });
  });

  afterAll(async () => {
    // clean up the whole firebase app
    await app.delete();
  });

  describe("when the FLATTEN_NESTED_DOCUMENTS is false", () => {
    it("indexes nested fields on writes to specified Firestore collection", async () => {
      process.env.FLATTEN_NESTED_DOCUMENTS = "false";

      const docData = {
        nested_field: {
          field1: "value1",
          field2: ["value2", "value3", "value4"],
          field3: {
            fieldA: "valueA",
            fieldB: ["valueB", "valueC", "valueD"],
          },
        },
      };

      // create document in Firestore
      const docRef = await firestore.collection(config.firestoreCollectionPath).add(docData);

      // wait for the Firestore cloud function to write to Typesense
      await new Promise((r) => setTimeout(r, 2500));

      // check that the document was indexed
      let typesenseDocsStr = await typesense
          .collections(encodeURIComponent(config.typesenseCollectionName))
          .documents()
          .export();
      let typesenseDocs = typesenseDocsStr.split("\n").map((s) => JSON.parse(s));

      expect(typesenseDocs.length).toBe(1);
      expect(typesenseDocs[0]).toStrictEqual({
        "id": docRef.id,
        ...docData,
      });

      // update document in Firestore
      docData.nested_field.field1 = "new value1";

      await docRef.update(docData);

      // wait for the Firestore cloud function to write to Typesense
      await new Promise((r) => setTimeout(r, 2500));

      // check that the document was updated
      typesenseDocsStr = await typesense
          .collections(encodeURIComponent(config.typesenseCollectionName))
          .documents()
          .export();
      typesenseDocs = typesenseDocsStr.split("\n").map((s) => JSON.parse(s));

      expect(typesenseDocs.length).toBe(1);
      expect(typesenseDocs[0]).toStrictEqual({
        "id": docRef.id,
        ...docData,
      });

      // delete document in Firestore
      await docRef.delete();

      // wait for the Firestore cloud function to write to Typesense
      await new Promise((r) => setTimeout(r, 2500));

      // check that the document was deleted
      typesenseDocsStr = await typesense
          .collections(encodeURIComponent(config.typesenseCollectionName))
          .documents()
          .export();

      expect(typesenseDocsStr).toBe("");
    });
  });
});
