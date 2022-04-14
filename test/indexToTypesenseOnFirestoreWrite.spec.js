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
      fields: [{"name": ".*", "type": "auto"}],
    });
  });

  afterAll(async () => {
    // clean up the whole firebase app
    await app.delete();
  });

  it("indexes string values on writes to specified Firestore collection", async () => {
    const docData = {name: "test"};

    // create document in Firestore
    const docRef = await firestore.collection(config.firestoreCollectionPath).add(docData);

    // wait for the Firestore cloud function to write to Typesense
    await new Promise((r) => setTimeout(r, 3000));

    // check that the document was indexed
    let typesenseDocsStr = await typesense
        .collections(encodeURIComponent(config.typesenseCollectionName))
        .documents()
        .export();
    let typesenseDocs = typesenseDocsStr.split("\n").map((s) => JSON.parse(s));

    expect(typesenseDocs.length).toBe(1);
    expect(typesenseDocs[0]).toStrictEqual({id: docRef.id, name: docData.name});

    // update document in Firestore
    docData.name = "test2";

    await docRef.update(docData);

    // wait for the Firestore cloud function to write to Typesense
    await new Promise((r) => setTimeout(r, 3000));

    // check that the document was updated
    typesenseDocsStr = await typesense
        .collections(encodeURIComponent(config.typesenseCollectionName))
        .documents()
        .export();
    typesenseDocs = typesenseDocsStr.split("\n").map((s) => JSON.parse(s));

    expect(typesenseDocs.length).toBe(1);
    expect(typesenseDocs[0]).toStrictEqual({id: docRef.id, name: docData.name});

    // delete document in Firestore
    await docRef.delete();

    // wait for the Firestore cloud function to write to Typesense
    await new Promise((r) => setTimeout(r, 3000));

    // check that the document was deleted
    typesenseDocsStr = await typesense
        .collections(encodeURIComponent(config.typesenseCollectionName))
        .documents()
        .export();
    typesenseDocs = typesenseDocsStr.split("\n").map((s) => JSON.parse(s));

    expect(typesenseDocs.length).toBe(0);
  });

  it("indexes number values on writes to specified Firestore collection", async () => {
    const docData = {age: 22};

    // create document in Firestore
    const docRef = await firestore.collection(config.firestoreCollectionPath).add(docData);

    // wait for the Firestore cloud function to write to Typesense
    await new Promise((r) => setTimeout(r, 3000));

    // check that the document was indexed
    let typesenseDocsStr = await typesense
        .collections(encodeURIComponent(config.typesenseCollectionName))
        .documents()
        .export();
    let typesenseDocs = typesenseDocsStr.split("\n").map((s) => JSON.parse(s));

    expect(typesenseDocs.length).toBe(1);
    expect(typesenseDocs[0]).toStrictEqual({id: docRef.id, age: docData.age});

    // update document in Firestore
    docData.age = 43;

    await docRef.update(docData);

    // wait for the Firestore cloud function to write to Typesense
    await new Promise((r) => setTimeout(r, 3000));

    // check that the document was updated
    typesenseDocsStr = await typesense
        .collections(encodeURIComponent(config.typesenseCollectionName))
        .documents()
        .export();
    typesenseDocs = typesenseDocsStr.split("\n").map((s) => JSON.parse(s));

    expect(typesenseDocs.length).toBe(1);
    expect(typesenseDocs[0]).toStrictEqual({id: docRef.id, age: docData.age});

    // delete document in Firestore
    await docRef.delete();

    // wait for the Firestore cloud function to write to Typesense
    await new Promise((r) => setTimeout(r, 3000));

    // check that the document was deleted
    typesenseDocsStr = await typesense
        .collections(encodeURIComponent(config.typesenseCollectionName))
        .documents()
        .export();
    typesenseDocs = typesenseDocsStr.split("\n").map((s) => JSON.parse(s));

    expect(typesenseDocs.length).toBe(0);
  });

  it("indexes boolean values on writes to specified Firestore collection", async () => {
    const docData = {isActive: true};

    // create document in Firestore
    const docRef = await firestore.collection(config.firestoreCollectionPath).add(docData);

    // wait for the Firestore cloud function to write to Typesense
    await new Promise((r) => setTimeout(r, 3000));

    // check that the document was indexed
    let typesenseDocsStr = await typesense
        .collections(encodeURIComponent(config.typesenseCollectionName))
        .documents()
        .export();
    let typesenseDocs = typesenseDocsStr.split("\n").map((s) => JSON.parse(s));

    expect(typesenseDocs.length).toBe(1);
    expect(typesenseDocs[0]).toStrictEqual({id: docRef.id, isActive: docData.isActive});

    // update document in Firestore
    docData.isActive = false;

    await docRef.update(docData);

    // wait for the Firestore cloud function to write to Typesense
    await new Promise((r) => setTimeout(r, 3000));

    // check that the document was updated
    typesenseDocsStr = await typesense
        .collections(encodeURIComponent(config.typesenseCollectionName))
        .documents()
        .export();
    typesenseDocs = typesenseDocsStr.split("\n").map((s) => JSON.parse(s));

    expect(typesenseDocs.length).toBe(1);
    expect(typesenseDocs[0]).toStrictEqual({id: docRef.id, isActive: docData.isActive});

    // delete document in Firestore
    await docRef.delete();

    // wait for the Firestore cloud function to write to Typesense
    await new Promise((r) => setTimeout(r, 3000));

    // check that the document was deleted
    typesenseDocsStr = await typesense
        .collections(encodeURIComponent(config.typesenseCollectionName))
        .documents()
        .export();
    typesenseDocs = typesenseDocsStr.split("\n").map((s) => JSON.parse(s));

    expect(typesenseDocs.length).toBe(0);
  });

  it("indexes timestamp values on writes to specified Firestore collection", async () => {
    const docData = {date: new Date()};

    // create document in Firestore
    const docRef = await firestore.collection(config.firestoreCollectionPath).add(docData);

    // wait for the Firestore cloud function to write to Typesense
    await new Promise((r) => setTimeout(r, 3000));

    // check that the document was indexed
    let typesenseDocsStr = await typesense
        .collections(encodeURIComponent(config.typesenseCollectionName))
        .documents()
        .export();
    let typesenseDocs = typesenseDocsStr.split("\n").map((s) => JSON.parse(s));

    expect(typesenseDocs.length).toBe(1);
    expect(typesenseDocs[0]).toStrictEqual({
      id: docRef.id,
      date: Math.floor(docData.date.getTime() / 1000),
    });

    // update document in Firestore
    docData.date = new Date(docData.date.getTime() + 1000);

    await docRef.update(docData);

    // wait for the Firestore cloud function to write to Typesense
    await new Promise((r) => setTimeout(r, 3000));

    // check that the document was updated
    typesenseDocsStr = await typesense
        .collections(encodeURIComponent(config.typesenseCollectionName))
        .documents()
        .export();
    typesenseDocs = typesenseDocsStr.split("\n").map((s) => JSON.parse(s));

    expect(typesenseDocs.length).toBe(1);
    expect(typesenseDocs[0]).toStrictEqual({
      id: docRef.id,
      date: Math.floor(docData.date.getTime() / 1000),
    });

    // delete document in Firestore
    await docRef.delete();

    // wait for the Firestore cloud function to write to Typesense
    await new Promise((r) => setTimeout(r, 3000));

    // check that the document was deleted
    typesenseDocsStr = await typesense
        .collections(encodeURIComponent(config.typesenseCollectionName))
        .documents()
        .export();
    typesenseDocs = typesenseDocsStr.split("\n").map((s) => JSON.parse(s));

    expect(typesenseDocs.length).toBe(0);
  });

  it("indexes geo point values on writes to specified Firestore collection", async () => {
    const docData = {location: new firebase.firestore.GeoPoint(0, 0)};

    // create document in Firestore
    const docRef = await firestore.collection(config.firestoreCollectionPath).add(docData);

    // wait for the Firestore cloud function to write to Typesense
    await new Promise((r) => setTimeout(r, 3000));

    // check that the document was indexed
    let typesenseDocsStr = await typesense
        .collections(encodeURIComponent(config.typesenseCollectionName))
        .documents()
        .export();
    let typesenseDocs = typesenseDocsStr.split("\n").map((s) => JSON.parse(s));

    expect(typesenseDocs.length).toBe(1);
    expect(typesenseDocs[0]).toStrictEqual({
      id: docRef.id,
      location: [docData.location.latitude, docData.location.longitude],
    });

    // update document in Firestore
    docData.location = new firebase.firestore.GeoPoint(1, 1);

    await docRef.update(docData);

    // wait for the Firestore cloud function to write to Typesense
    await new Promise((r) => setTimeout(r, 3000));

    // check that the document was updated
    typesenseDocsStr = await typesense
        .collections(encodeURIComponent(config.typesenseCollectionName))
        .documents()
        .export();
    typesenseDocs = typesenseDocsStr.split("\n").map((s) => JSON.parse(s));

    expect(typesenseDocs.length).toBe(1);
    expect(typesenseDocs[0]).toStrictEqual({
      id: docRef.id,
      location: [docData.location.latitude, docData.location.longitude],
    });

    // delete document in Firestore
    await docRef.delete();

    // wait for the Firestore cloud function to write to Typesense
    await new Promise((r) => setTimeout(r, 3000));

    // check that the document was deleted
    typesenseDocsStr = await typesense
        .collections(encodeURIComponent(config.typesenseCollectionName))
        .documents()
        .export();
    typesenseDocs = typesenseDocsStr.split("\n").map((s) => JSON.parse(s));

    expect(typesenseDocs.length).toBe(0);
  });
});
