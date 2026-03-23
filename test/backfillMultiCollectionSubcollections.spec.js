const {TestEnvironment} = require("./support/testEnvironment");

describe("backfillMultiCollectionSubcollections", () => {
  let testEnvironment;
  let config = null;
  let firestore = null;
  let typesense = null;

  const parentCollectionPath1 = "users";
  const parentCollectionPath2 = "stores";
  const childFieldName1 = "books";
  const childFieldName2 = "products";
  const unrelatedCollectionPath = "unrelatedCollectionToNotBackfill";

  beforeAll((done) => {
    testEnvironment = new TestEnvironment({
      dotenvPath: "extensions/test-params-multi-collection-subcollections.local.env",
      outputAllEmulatorLogs: true,
    });
    testEnvironment.setupTestEnvironment((err) => {
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
    // Clear all configured collections
    const collections = Object.keys(config.collections);

    // Clear Firestore collections - need to clear parent collections to remove subcollections
    for (const collectionPath of collections) {
      // For subcollections, we need to clear the parent collection
      const parentPath = collectionPath.split("/")[0]; // e.g., "users" from "users/{userId}/books"
      await firestore.recursiveDelete(firestore.collection(parentPath));
    }

    await firestore.recursiveDelete(firestore.collection(unrelatedCollectionPath));

    await new Promise((r) => setTimeout(r, 3000));

    // Clear and recreate Typesense collections
    for (const collectionName of Object.values(config.collections).map((c) => c.typesenseCollection)) {
      try {
        await typesense.collections(encodeURIComponent(collectionName)).delete();
      } catch (e) {
        console.info(`${collectionName} collection not found, proceeding...`);
      }

      await typesense.collections().create({
        name: collectionName,
        fields: [{name: ".*", type: "auto"}],
        enable_nested_fields: true,
      });
    }

    // Wait for Typesense collections to be ready
    await new Promise((r) => setTimeout(r, 1000));
  });

  describe("when firestore_collections is not specified", () => {
    it("backfills existing Firestore data in all subcollections to Typesense when `trigger: true` is set", async () => {
      const parentDocData1 = {
        name: "John Doe",
        email: "john@example.com",
      };

      const parentDocData2 = {
        name: "Store ABC",
        location: "NYC",
      };

      const subDocData1 = {
        title: "Book Title",
        author: "Author A",
        rating: 4.5,
      };

      const subDocData2 = {
        name: "Product XYZ",
        price: 99.99,
        category: "electronics",
      };

      // Create parent documents in Firestore
      const parentDocRef1 = await firestore.collection(parentCollectionPath1).add(parentDocData1);
      const parentDocRef2 = await firestore.collection(parentCollectionPath2).add(parentDocData2);

      // Create subcollections with documents under the parent documents
      const subCollectionRef1 = parentDocRef1.collection(childFieldName1);
      const subDocRef1 = await subCollectionRef1.add(subDocData1);

      const subCollectionRef2 = parentDocRef2.collection(childFieldName2);
      const subDocRef2 = await subCollectionRef2.add(subDocData2);

      // Wait for firestore cloud function to write to Typesense
      await new Promise((r) => setTimeout(r, 2000));

      // Delete Typesense collections to test backfill
      for (const collectionName of Object.values(config.collections).map((c) => c.typesenseCollection)) {
        await typesense.collections(encodeURIComponent(collectionName)).delete();
        await typesense.collections().create({
          name: collectionName,
          fields: [{name: ".*", type: "auto"}],
          enable_nested_fields: true,
        });
      }

      await firestore.collection(config.typesenseBackfillTriggerDocumentInFirestore.split("/")[0]).doc("backfill").set({trigger: true});
      await new Promise((r) => setTimeout(r, 2000));

      const userBooksDocsStr = await typesense.collections(encodeURIComponent("user_books")).documents().export();
      const userBooksDocs = userBooksDocsStr
        .split("\n")
        .filter((s) => s.trim())
        .map((s) => JSON.parse(s));
      expect(userBooksDocs.length).toBe(1);
      expect(userBooksDocs[0]).toStrictEqual({
        id: subDocRef1.id,
        title: subDocData1.title,
        author: subDocData1.author,
        rating: subDocData1.rating,
        userId: parentDocRef1.id,
      });

      const storeProductsDocsStr = await typesense.collections(encodeURIComponent("store_products")).documents().export();
      const storeProductsDocs = storeProductsDocsStr
        .split("\n")
        .filter((s) => s.trim())
        .map((s) => JSON.parse(s));
      expect(storeProductsDocs.length).toBe(1);
      expect(storeProductsDocs[0]).toStrictEqual({
        id: subDocRef2.id,
        name: subDocData2.name,
        price: subDocData2.price,
        category: subDocData2.category,
        storeId: parentDocRef2.id,
      });
    });
  });

  describe("when firestore_collections is specified", () => {
    describe("when firestore_collections includes configured subcollections", () => {
      it("backfills existing Firestore data in specified subcollections to Typesense when `trigger: true` is set", async () => {
        const parentDocData1 = {
          name: "John Doe",
          email: "john@example.com",
        };

        const parentDocData2 = {
          name: "Store ABC",
          location: "NYC",
        };

        const subDocData1 = {
          title: "Book Title",
          author: "Author A",
          rating: 4.5,
        };

        const subDocData2 = {
          name: "Product XYZ",
          price: 99.99,
          category: "electronics",
        };

        // Create parent documents in Firestore
        const parentDocRef1 = await firestore.collection(parentCollectionPath1).add(parentDocData1);
        const parentDocRef2 = await firestore.collection(parentCollectionPath2).add(parentDocData2);

        // Create subcollections with documents under the parent documents
        const subCollectionRef1 = parentDocRef1.collection(childFieldName1);
        const subDocRef1 = await subCollectionRef1.add(subDocData1);

        const subCollectionRef2 = parentDocRef2.collection(childFieldName2);
        await subCollectionRef2.add(subDocData2);

        // Wait for firestore cloud function to write to Typesense
        await new Promise((r) => setTimeout(r, 2000));

        // Delete Typesense collections to test backfill
        for (const collectionName of Object.values(config.collections).map((c) => c.typesenseCollection)) {
          await typesense.collections(encodeURIComponent(collectionName)).delete();
          await typesense.collections().create({
            name: collectionName,
            fields: [{name: ".*", type: "auto"}],
            enable_nested_fields: true,
          });
        }

        // Trigger backfill for specific subcollections only
        await firestore
          .collection(config.typesenseBackfillTriggerDocumentInFirestore.split("/")[0])
          .doc("backfill")
          .set({
            trigger: true,
            firestore_collections: ["users/{userId}/books"],
          });
        await new Promise((r) => setTimeout(r, 2000));

        // Check that only specified subcollections were backfilled
        const userBooksDocsStr = await typesense.collections(encodeURIComponent("user_books")).documents().export();
        const userBooksDocs = userBooksDocsStr
          .split("\n")
          .filter((s) => s.trim())
          .map((s) => JSON.parse(s));
        expect(userBooksDocs.length).toBe(1);
        expect(userBooksDocs[0]).toStrictEqual({
          id: subDocRef1.id,
          title: subDocData1.title,
          author: subDocData1.author,
          rating: subDocData1.rating,
          userId: parentDocRef1.id,
        });

        // Check that store_products collection was NOT backfilled
        const storeProductsDocsStr = await typesense.collections(encodeURIComponent("store_products")).documents().export();
        expect(storeProductsDocsStr).toEqual("");
      });
    });

    describe("when firestore_collections does not include any configured subcollections", () => {
      it("does not backfill existing Firestore data when `trigger: true` is set", async () => {
        const parentDocData1 = {
          name: "John Doe",
          email: "john@example.com",
        };

        const parentDocData2 = {
          name: "Store ABC",
          location: "NYC",
        };

        const subDocData1 = {
          title: "Book Title",
          author: "Author A",
          rating: 4.5,
        };

        const subDocData2 = {
          name: "Product XYZ",
          price: 99.99,
          category: "electronics",
        };

        // Create parent documents in Firestore
        const parentDocRef1 = await firestore.collection(parentCollectionPath1).add(parentDocData1);
        const parentDocRef2 = await firestore.collection(parentCollectionPath2).add(parentDocData2);

        // Create subcollections with documents under the parent documents
        const subCollectionRef1 = parentDocRef1.collection(childFieldName1);
        await subCollectionRef1.add(subDocData1);

        const subCollectionRef2 = parentDocRef2.collection(childFieldName2);
        await subCollectionRef2.add(subDocData2);

        // Wait for firestore cloud function to write to Typesense
        await new Promise((r) => setTimeout(r, 2000));

        // Delete Typesense collections to test backfill
        for (const collectionName of Object.values(config.collections).map((c) => c.typesenseCollection)) {
          await typesense.collections(encodeURIComponent(collectionName)).delete();
          await typesense.collections().create({
            name: collectionName,
            fields: [{name: ".*", type: "auto"}],
            enable_nested_fields: true,
          });
        }

        // Trigger backfill for non-configured subcollections
        await firestore
          .collection(config.typesenseBackfillTriggerDocumentInFirestore.split("/")[0])
          .doc("backfill")
          .set({
            trigger: true,
            firestore_collections: ["some/other/collection", "another/unrelated/collection"],
          });
        await new Promise((r) => setTimeout(r, 2000));

        // Check that no collections were backfilled
        for (const collectionName of Object.values(config.collections).map((c) => c.typesenseCollection)) {
          const docsStr = await typesense.collections(encodeURIComponent(collectionName)).documents().export();
          expect(docsStr).toEqual("");
        }
      });
    });
  });

  describe("Backfill subcollections with field filtering", () => {
    it("respects collection-specific field filtering during backfill", async () => {
      const parentDocData1 = {
        name: "John Doe",
        email: "john@example.com",
      };

      const parentDocData2 = {
        name: "Store ABC",
        location: "NYC",
      };

      const subDocData1 = {
        title: "Book Title",
        author: "Author A",
        rating: 4.5,
        isbn: "123456789", // This should be filtered out (not in fields list)
        publisher: "Publisher XYZ", // This should be filtered out (not in fields list)
      };

      const subDocData2 = {
        name: "Product XYZ",
        price: 99.99,
        category: "electronics",
        sku: "SKU123", // This should be filtered out (not in fields list)
        brand: "Brand ABC", // This should be filtered out (not in fields list)
      };

      // Create parent documents in Firestore
      const parentDocRef1 = await firestore.collection(parentCollectionPath1).add(parentDocData1);
      const parentDocRef2 = await firestore.collection(parentCollectionPath2).add(parentDocData2);

      // Create subcollections with documents under the parent documents
      const subCollectionRef1 = parentDocRef1.collection(childFieldName1);
      const subDocRef1 = await subCollectionRef1.add(subDocData1);

      const subCollectionRef2 = parentDocRef2.collection(childFieldName2);
      const subDocRef2 = await subCollectionRef2.add(subDocData2);

      // Wait for firestore cloud function to write to Typesense
      await new Promise((r) => setTimeout(r, 2000));

      // Delete Typesense collections to test backfill
      for (const collectionName of Object.values(config.collections).map((c) => c.typesenseCollection)) {
        await typesense.collections(encodeURIComponent(collectionName)).delete();
        await typesense.collections().create({
          name: collectionName,
          fields: [{name: ".*", type: "auto"}],
          enable_nested_fields: true,
        });
      }

      await firestore.collection(config.typesenseBackfillTriggerDocumentInFirestore.split("/")[0]).doc("backfill").set({trigger: true});
      await new Promise((r) => setTimeout(r, 5000));

      // Check that only specified fields were backfilled
      const userBooksDocsStr = await typesense.collections(encodeURIComponent("user_books")).documents().export();
      const userBooksDocs = userBooksDocsStr
        .split("\n")
        .filter((s) => s.trim())
        .map((s) => JSON.parse(s));
      expect(userBooksDocs.length).toBe(1);
      expect(userBooksDocs[0]).toStrictEqual({
        id: subDocRef1.id,
        title: subDocData1.title,
        author: subDocData1.author,
        rating: subDocData1.rating,
        userId: parentDocRef1.id,
        // isbn and publisher should NOT be present
      });
      expect(userBooksDocs[0]).not.toHaveProperty("isbn");
      expect(userBooksDocs[0]).not.toHaveProperty("publisher");

      const storeProductsDocsStr = await typesense.collections(encodeURIComponent("store_products")).documents().export();
      const storeProductsDocs = storeProductsDocsStr
        .split("\n")
        .filter((s) => s.trim())
        .map((s) => JSON.parse(s));
      expect(storeProductsDocs.length).toBe(1);
      expect(storeProductsDocs[0]).toStrictEqual({
        id: subDocRef2.id,
        name: subDocData2.name,
        price: subDocData2.price,
        category: subDocData2.category,
        storeId: parentDocRef2.id,
        // sku and brand should NOT be present
      });
      expect(storeProductsDocs[0]).not.toHaveProperty("sku");
      expect(storeProductsDocs[0]).not.toHaveProperty("brand");
    });
  });

  describe("Backfill subcollections", () => {
    it("Ensure backfill doesn't backfill unrelated collections", async () => {
      const parentDocData1 = {
        name: "John Doe",
        email: "john@example.com",
      };

      const parentDocData2 = {
        name: "Store ABC",
        location: "NYC",
      };

      const subDocData1 = {
        title: "Book Title",
        author: "Author A",
        rating: 4.5,
      };

      const subDocData2 = {
        name: "Product XYZ",
        price: 99.99,
        category: "electronics",
      };

      // Create parent documents in Firestore
      const parentDocRef1 = await firestore.collection(parentCollectionPath1).add(parentDocData1);
      const parentDocRef2 = await firestore.collection(parentCollectionPath2).add(parentDocData2);

      // Create subcollections with documents under the parent documents
      const subCollectionRef1 = parentDocRef1.collection(childFieldName1);
      const subDocRef1 = await subCollectionRef1.add(subDocData1);

      const subCollectionRef2 = parentDocRef2.collection(childFieldName2);
      const subDocRef2 = await subCollectionRef2.add(subDocData2);

      // Create an unrelated set of documents that should not be backfilled
      const unrelatedParentDocData = {
        name: "Unrelated Parent",
        type: "unrelated",
      };

      const unrelatedSubDocData = {
        title: "Unrelated Document",
        content: "This should not be backfilled",
      };

      // Create unrelated parent document in Firestore
      const unrelatedParentDocRef = await firestore.collection(unrelatedCollectionPath).add(unrelatedParentDocData);

      // Create a subcollection with document under the unrelated parent document
      const unrelatedSubCollectionRef = unrelatedParentDocRef.collection(childFieldName1);
      await unrelatedSubCollectionRef.add(unrelatedSubDocData);

      // Wait for firestore cloud function to write to Typesense
      await new Promise((r) => setTimeout(r, 2000));

      // Delete Typesense collections to test backfill
      for (const collectionName of Object.values(config.collections).map((c) => c.typesenseCollection)) {
        await typesense.collections(encodeURIComponent(collectionName)).delete();
        await typesense.collections().create({
          name: collectionName,
          fields: [{name: ".*", type: "auto"}],
          enable_nested_fields: true,
        });
      }

      // Trigger backfill for configured subcollections only
      await firestore
        .collection(config.typesenseBackfillTriggerDocumentInFirestore.split("/")[0])
        .doc("backfill")
        .set({
          trigger: true,
          firestore_collections: ["users/{userId}/books", "stores/{storeId}/products"],
        });
      await new Promise((r) => setTimeout(r, 2000));

      // Check that only configured subcollections were backfilled
      const userBooksDocsStr = await typesense.collections(encodeURIComponent("user_books")).documents().export();
      const userBooksDocs = userBooksDocsStr
        .split("\n")
        .filter((s) => s.trim())
        .map((s) => JSON.parse(s));
      expect(userBooksDocs.length).toBe(1);
      expect(userBooksDocs[0]).toStrictEqual({
        id: subDocRef1.id,
        title: subDocData1.title,
        author: subDocData1.author,
        rating: subDocData1.rating,
        userId: parentDocRef1.id,
      });

      const storeProductsDocsStr = await typesense.collections(encodeURIComponent("store_products")).documents().export();
      const storeProductsDocs = storeProductsDocsStr
        .split("\n")
        .filter((s) => s.trim())
        .map((s) => JSON.parse(s));
      expect(storeProductsDocs.length).toBe(1);
      expect(storeProductsDocs[0]).toStrictEqual({
        id: subDocRef2.id,
        name: subDocData2.name,
        price: subDocData2.price,
        category: subDocData2.category,
        storeId: parentDocRef2.id,
      });

      // Verify that unrelated documents were not backfilled
      // (The unrelated collection doesn't have a corresponding Typesense collection, so we can't check it directly)
      // But we can verify that only our expected documents are in the configured collections
      expect(userBooksDocs.length).toBe(1);
      expect(storeProductsDocs.length).toBe(1);
    });
  });
});
