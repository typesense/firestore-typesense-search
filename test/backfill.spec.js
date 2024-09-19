const firebase = require("firebase-admin");
const config = require("../functions/src/config.js");
const typesense = require("../functions/src/createTypesenseClient.js")();

const app = firebase.initializeApp({
  // Use a special URL to talk to the Realtime Database emulator
  databaseURL: `${process.env.FIREBASE_DATABASE_EMULATOR_HOST}?ns=${process.env.GCLOUD_PROJECT}`,
  projectId: process.env.GCLOUD_PROJECT,
});
const firestore = app.firestore();

describe("backfill", () => {
  beforeEach(async () => {
    // Clear the database between tests
    await firestore.recursiveDelete(firestore.collection(config.firestoreCollectionPath));

    // Clear any previously created collections
    try {
      await typesense.collections(encodeURIComponent(config.typesenseCollectionName)).delete();
    } catch (e) {
      console.info(`${config.typesenseCollectionName} collection not found, proceeding...`);
    }

    // Create a new Typesense collection
    return typesense.collections().create({
      name: config.typesenseCollectionName,
      fields: [
        {name: ".*", type: "auto"},
      ],
    });
  });

  afterAll(async () => {
    // clean up the firebase app after all tests have run
    await app.delete();
  });

  describe("when firestore_collections is not specified", () => {
    it("backfills existing Firestore data in all collections to Typesense" +
      " when `trigger: true` is set " +
      ` in ${config.typesenseBackfillTriggerDocumentInFirestore}`, async () => {
      const book = {
        author: "Author A",
        title: "Title X",
        country: "USA",
      };
      const firestoreDoc = await firestore.collection(config.firestoreCollectionPath).add(book);
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
        .set({trigger: true});
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
        id: firestoreDoc.id,
        author: book.author,
        title: book.title,
      });
    });
  });

  describe("when firestore_collections is specified", () => {
    describe("when firestore_collections includes this collection", () => {
      it("backfills existing Firestore data in this particular collection to Typesense" +
      " when `trigger: true` is set " +
      ` in ${config.typesenseBackfillTriggerDocumentInFirestore}`, async () => {
        const book = {
          author: "Author A",
          title: "Title X",
          country: "USA",
        };
        const firestoreDoc = await firestore.collection(config.firestoreCollectionPath).add(book);
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
          id: firestoreDoc.id,
          author: book.author,
          title: book.title,
        });
      });
    });
    describe("when firestore_collections does not include this collection", () => {
      it("does not backfill existing Firestore data in this particular collection to Typesense" +
      " when `trigger: true` is set " +
      ` in ${config.typesenseBackfillTriggerDocumentInFirestore}`, async () => {
        const book = {
          author: "Author A",
          title: "Title X",
          country: "USA",
        };
        await firestore.collection(config.firestoreCollectionPath).add(book);
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
      });
    });
  });
});
