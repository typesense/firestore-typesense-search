const firebase = require("firebase-admin");
const config = require("../functions/src/config");
const typesense = require("../functions/src/typesenseClient");

const app = firebase.initializeApp({
  // Use a special URL to talk to the Realtime Database emulator
  databaseURL: `${process.env.FIREBASE_DATABASE_EMULATOR_HOST}?ns=${process.env.GCLOUD_PROJECT}`,
  projectId: process.env.GCLOUD_PROJECT,
});
const firestore = app.firestore();

describe("indexToTypesenseOnFirestoreWrite", () => {
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
        {"name": ".*", "type": "auto"},
      ],
    });
  });

  afterAll(async () => {
    // clean up the firebase app after all tests have run
    await app.delete();
  });

  it("indexes to Typesense on writes to specified Firestore collection", async () => {
    const book = {
      author: "Author A",
      title: "Title X",
      country: "USA",
    };

    // Creation
    const firestoreDoc = await firestore.collection(config.firestoreCollectionPath).add(book);
    // Wait for firestore cloud function to write to Typesense
    await new Promise((r) => setTimeout(r, 2000));

    let typesenseDocsStr = await typesense
        .collections(encodeURIComponent(config.typesenseCollectionName))
        .documents()
        .export();
    let typesenseDocs = typesenseDocsStr.split("\n").map((s) => JSON.parse(s));
    expect(typesenseDocs.length).toBe(1);
    expect(typesenseDocs[0]).toStrictEqual({
      id: firestoreDoc.id,
      author: book.author,
      title: book.title,
    });

    // Updates
    book.title = "Title Y";
    await firestore
        .collection(config.firestoreCollectionPath)
        .doc(firestoreDoc.id)
        .set(book);
    // Wait for firestore cloud function to write to Typesense
    await new Promise((r) => setTimeout(r, 2000));

    typesenseDocsStr = await typesense
        .collections(encodeURIComponent(config.typesenseCollectionName))
        .documents()
        .export();
    typesenseDocs = typesenseDocsStr.split("\n").map((s) => JSON.parse(s));
    expect(typesenseDocs.length).toBe(1);
    expect(typesenseDocs[0]).toStrictEqual({
      id: firestoreDoc.id,
      author: book.author,
      title: book.title,
    });

    // Deletes
    await firestore
        .collection(config.firestoreCollectionPath)
        .doc(firestoreDoc.id)
        .delete();
    // Wait for firestore cloud function to write to Typesense
    await new Promise((r) => setTimeout(r, 2000));

    const typesenseCollection = await typesense
        .collections(encodeURIComponent(config.typesenseCollectionName))
        .retrieve();
    expect(typesenseCollection.num_documents).toBe(0);
  });
});
