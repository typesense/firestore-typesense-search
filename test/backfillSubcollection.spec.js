const firebase = require("firebase-admin");
const config = require("../functions/src/config.js");
const typesense = require("../functions/src/createTypesenseClient.js")();

const app = firebase.initializeApp({
  // Use a special URL to talk to the Realtime Database emulator
  databaseURL: `${process.env.FIREBASE_DATABASE_EMULATOR_HOST}?ns=${process.env.GCLOUD_PROJECT}`,
  projectId: process.env.GCLOUD_PROJECT,
});
const firestore = app.firestore();

describe("backfillSubcollection", () => {
  const parentCollectionPath = process.env.TEST_FIRESTORE_PARENT_COLLECTION_PATH;
  const unrelatedCollectionPath = "unrelatedCollectionToNotBackfill";
  const childFieldName = process.env.TEST_FIRESTORE_CHILD_FIELD_NAME;
  let parentIdField = null;

  beforeAll(() => {
    const matches = config.firestoreCollectionPath.match(/{([^}]+)}/g);
    expect(matches).toBeDefined();
    expect(matches.length).toBe(1);

    parentIdField = matches[0].replace(/{|}/g, "");
    expect(parentIdField).toBeDefined();
  });

  beforeEach(async () => {
    // Clear the database between tests
    await firestore.recursiveDelete(firestore.collection(parentCollectionPath));
    await firestore.recursiveDelete(firestore.collection(unrelatedCollectionPath));

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
        " when `trigger: true` is set " +
        ` in ${config.typesenseBackfillTriggerDocumentInFirestore}`, async () => {
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
        " when `trigger: true` is set " +
        ` in ${config.typesenseBackfillTriggerDocumentInFirestore}`, async () => {
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
        await subCollectionRef.add(subDocData);
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
