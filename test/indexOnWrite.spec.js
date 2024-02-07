const firebase = require("firebase-admin");
const config = require("../functions/src/config.js");
const typesense = require("../functions/src/createTypesenseClient.js")();

const app = firebase.initializeApp({
  // Use a special URL to talk to the Realtime Database emulator
  databaseURL: `${process.env.FIREBASE_DATABASE_EMULATOR_HOST}?ns=${process.env.GCLOUD_PROJECT}`,
  projectId: process.env.GCLOUD_PROJECT,
});
const firestore = app.firestore();

describe("indexOnWrite", () => {
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

  it("indexes string values on writes to specified Firestore collection", async () => {
    const docData = {author: "test"};

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
    expect(typesenseDocs[0]).toStrictEqual({id: docRef.id, author: docData.author});

    // update document in Firestore
    docData.author = "test2";

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
    expect(typesenseDocs[0]).toStrictEqual({id: docRef.id, author: docData.author});

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

  it("indexes numeric values on writes to specified Firestore collection", async () => {
    const docData = {rating: 22};

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
    expect(typesenseDocs[0]).toStrictEqual({id: docRef.id, rating: docData.rating});

    // update document in Firestore
    docData.rating = 43;

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
    expect(typesenseDocs[0]).toStrictEqual({id: docRef.id, rating: docData.rating});

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

  it("indexes boolean values on writes to specified Firestore collection", async () => {
    const docData = {isAvailable: true};

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
    expect(typesenseDocs[0]).toStrictEqual({id: docRef.id, isAvailable: docData.isAvailable});

    // update document in Firestore
    docData.isAvailable = false;

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
    expect(typesenseDocs[0]).toStrictEqual({id: docRef.id, isAvailable: docData.isAvailable});

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

  describe("when FLATTEN_NESTED_DOCUMENTS is true (default)", () => {
    it("indexes nested fields on writes to specified Firestore collection", async () => {
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
        "nested_field.field1": "value1",
        "nested_field.field2": ["value2", "value3", "value4"],
        "nested_field.field3.fieldA": "valueA",
        "nested_field.field3.fieldB": ["valueB", "valueC", "valueD"],
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
        "nested_field.field1": "new value1",
        "nested_field.field2": ["value2", "value3", "value4"],
        "nested_field.field3.fieldA": "valueA",
        "nested_field.field3.fieldB": ["valueB", "valueC", "valueD"],
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

  it("indexes array values on writes to specified Firestore collection", async () => {
    const docData = {tags: ["tag1", "tag2", "tag3"]};

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
    expect(typesenseDocs[0]).toStrictEqual({"id": docRef.id, "tags": docData.tags});

    // update document in Firestore
    docData.tags = ["tag1", "tag2", "tag3", "tag4"];

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
    expect(typesenseDocs[0]).toStrictEqual({"id": docRef.id, "tags": docData.tags});

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

  it("indexes null values on writes to specified Firestore collection", async () => {
    const docData = {nullField: null};

    // create document in Firestore
    const docRef = await firestore.collection(config.firestoreCollectionPath).add(docData);

    // wait for the Firestore cloud function to write to Typesense
    await new Promise((r) => setTimeout(r, 2500));

    // check that the document was indexed
    let typesenseDocsStr = await typesense
        .collections(encodeURIComponent(config.typesenseCollectionName))
        .documents()
        .export();
    const typesenseDocs = typesenseDocsStr.split("\n").map((s) => JSON.parse(s));

    expect(typesenseDocs.length).toBe(1);
    expect(typesenseDocs[0]).toStrictEqual({"id": docRef.id});

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

  it("indexes timestamp values on writes to specified Firestore collection", async () => {
    const docData = {createdAt: new Date()};

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
      id: docRef.id,
      createdAt: Math.floor(docData.createdAt.getTime() / 1000),
    });

    // update document in Firestore
    docData.createdAt = new Date(docData.createdAt.getTime() + 1000);

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
      id: docRef.id,
      createdAt: Math.floor(docData.createdAt.getTime() / 1000),
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

  it("indexes geo point values on writes to specified Firestore collection", async () => {
    const docData = {location: new firebase.firestore.GeoPoint(0, 0)};

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
      id: docRef.id,
      location: [docData.location.latitude, docData.location.longitude],
    });

    // update document in Firestore
    docData.location = new firebase.firestore.GeoPoint(1, 1);

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
      id: docRef.id,
      location: [docData.location.latitude, docData.location.longitude],
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

  it("adds reference values as ref.path", async () => {
    const docData = {ref: firestore.doc("test/test")};

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
    expect(typesenseDocs[0]).toStrictEqual({"id": docRef.id, "ref.path": "test/test"});

    // update document in Firestore
    docData.ref = firestore.doc("test/test2");

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
    expect(typesenseDocs[0]).toStrictEqual({"id": docRef.id, "ref.path": "test/test2"});

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
