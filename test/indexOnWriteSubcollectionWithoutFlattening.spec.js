const firebase = require("firebase-admin");
const config = require("../functions/src/config.js");
const typesense = require("../functions/src/createTypesenseClient.js")();

const app = firebase.initializeApp({
  // Use a special URL to talk to the Realtime Database emulator
  databaseURL: `${process.env.FIREBASE_DATABASE_EMULATOR_HOST}?ns=${process.env.GCLOUD_PROJECT}`,
  projectId: process.env.GCLOUD_PROJECT,
});
const firestore = app.firestore();
const subcollection = "subcollection";
const typesenseSubcollectionName = config.typesenseCollectionName + "/" + subcollection;

describe("indexOnWriteWithoutFlattening", () => {
  beforeEach(async () => {
    // delete the Firestore collection
    await firestore.recursiveDelete(firestore.collection(config.firestoreCollectionPath));
    // delete the Typesense collections
    const collectionsToDelete = [
      typesenseSubcollectionName,
      config.typesenseCollectionName,
    ];
    for (const collectionName of collectionsToDelete) {
      try {
        await typesense.collections(encodeURIComponent(collectionName)).delete();
      } catch (e) {
          console.info(`${collectionName} collection not found, proceeding...`);
      }
    }

    // recreate the Typesense collection
    await typesense.collections().create({
      name: typesenseSubcollectionName,
      fields: [{name: ".*", type: "auto"}],
      enable_nested_fields: true,
    });
  });

  afterAll(async () => {
    // clean up the whole firebase app
    await app.delete();
  });
  describe("Backfill from subcollections", () => {
    it("backfills documents from subcollections to Typesense", async () => {
      // Defne the parent document and subcollection data
      process.env.FLATTEN_NESTED_DOCUMENTS = "false";

      const docData = {
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
      const docRef = await firestore.collection(config.firestoreCollectionPath).add(docData);

      // create a subcollection with document under the parent document
      const subCollectionRef = docRef.collection(subcollection);
      const subDocRef = await subCollectionRef.add(subDocData);

      // wait for the Firestore cloud function to write to Typesense
      await new Promise((r) => setTimeout(r, 2500));

      // check that the document was indexed
      let typesenseDocsStr = await typesense
        .collections(encodeURIComponent(typesenseSubcollectionName))
        .documents()
        .export();
      let typesenseDocs = typesenseDocsStr.split("\n").map((s) => JSON.parse(s));

      expect(typesenseDocs.length).toBe(1);
      expect(typesenseDocs[0]).toStrictEqual({
        id: subDocData.id,
        ...subDocData,
      });

      // update document in Firestore
      subDocData.nested_field.field1 = "new value1";

      await subDocRef.update(subDocRef);

      // wait for the Firestore cloud function to write to Typesense
      await new Promise((r) => setTimeout(r, 2500));

      // check that the document was updated
      typesenseDocsStr = await typesense
        .collections(encodeURIComponent(typesenseSubcollectionName))
        .documents()
        .export({exclude_fields: ""});
      typesenseDocs = typesenseDocsStr.split("\n").map((s) => JSON.parse(s));

      expect(typesenseDocs.length).toBe(1);
      expect(typesenseDocs[0]).toStrictEqual({
        id: subDocData.id,
        ...subDocData,
      });

      // delete both documents in Firestore
      await subDocRef.delete();
      await docRef.delete();

      // wait for the Firestore cloud function to write to Typesense
      await new Promise((r) => setTimeout(r, 2500));

      // check that the subcollection document was deleted
      typesenseDocsStr = await typesense.collections(encodeURIComponent(typesenseSubcollectionName)).documents().export();

      expect(typesenseDocsStr).toBe("");
    });
  });
});