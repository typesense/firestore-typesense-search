import {afterAll, beforeAll, beforeEach, describe, expect, it} from "vitest";
import {TestEnvironment, waitForFunctions} from "./support/testEnvironment.js";

describe("backfillMultiCollectionSubcollections", () => {
  const env = new TestEnvironment({
    dotenvPath: "test/integration/fixtures/multi-collection-subcollections.env",
    outputAllEmulatorLogs: true,
  });

  const parentCollectionPath1 = "users";
  const parentCollectionPath2 = "stores";
  const childFieldName1 = "books";
  const childFieldName2 = "products";
  const unrelatedCollectionPath = "unrelatedCollectionToNotBackfill";

  const typesenseCollectionNames = (): string[] => Object.values(env.collections).map((c) => c.typesenseCollection);

  beforeAll(async () => {
    await env.setup();
  });

  afterAll(async () => {
    await env.teardown();
  });

  beforeEach(async () => {
    // Clear Firestore collections - need to clear parent collections to remove subcollections
    for (const collectionPath of Object.keys(env.collections)) {
      // For subcollections, we need to clear the parent collection
      const parentPath = collectionPath.split("/")[0] ?? collectionPath; // e.g., "users" from "users/{userId}/books"
      await env.firestore.recursiveDelete(env.firestore.collection(parentPath));
    }

    await env.firestore.recursiveDelete(env.firestore.collection(unrelatedCollectionPath));

    await waitForFunctions(3000);

    // Clear and recreate Typesense collections
    await env.recreateTypesenseCollections(typesenseCollectionNames());

    // Wait for Typesense collections to be ready
    await waitForFunctions(1000);
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
      const parentDocRef1 = await env.firestore.collection(parentCollectionPath1).add(parentDocData1);
      const parentDocRef2 = await env.firestore.collection(parentCollectionPath2).add(parentDocData2);

      // Create subcollections with documents under the parent documents
      const subDocRef1 = await parentDocRef1.collection(childFieldName1).add(subDocData1);
      const subDocRef2 = await parentDocRef2.collection(childFieldName2).add(subDocData2);

      // Wait for firestore cloud function to write to Typesense
      await waitForFunctions(2000);

      // Delete Typesense collections to test backfill
      await env.recreateTypesenseCollections(typesenseCollectionNames());

      await env.triggerBackfill({trigger: true});
      await waitForFunctions(2000);

      expect(await env.exportDocuments("user_books")).toStrictEqual([
        {
          id: subDocRef1.id,
          title: subDocData1.title,
          author: subDocData1.author,
          rating: subDocData1.rating,
          userId: parentDocRef1.id,
        },
      ]);

      expect(await env.exportDocuments("store_products")).toStrictEqual([
        {
          id: subDocRef2.id,
          name: subDocData2.name,
          price: subDocData2.price,
          category: subDocData2.category,
          storeId: parentDocRef2.id,
        },
      ]);
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
        const parentDocRef1 = await env.firestore.collection(parentCollectionPath1).add(parentDocData1);
        const parentDocRef2 = await env.firestore.collection(parentCollectionPath2).add(parentDocData2);

        // Create subcollections with documents under the parent documents
        const subDocRef1 = await parentDocRef1.collection(childFieldName1).add(subDocData1);
        await parentDocRef2.collection(childFieldName2).add(subDocData2);

        // Wait for firestore cloud function to write to Typesense
        await waitForFunctions(2000);

        // Delete Typesense collections to test backfill
        await env.recreateTypesenseCollections(typesenseCollectionNames());

        // Trigger backfill for specific subcollections only
        await env.triggerBackfill({
          trigger: true,
          firestore_collections: ["users/{userId}/books"],
        });
        await waitForFunctions(2000);

        // Check that only specified subcollections were backfilled
        expect(await env.exportDocuments("user_books")).toStrictEqual([
          {
            id: subDocRef1.id,
            title: subDocData1.title,
            author: subDocData1.author,
            rating: subDocData1.rating,
            userId: parentDocRef1.id,
          },
        ]);

        // Check that store_products collection was NOT backfilled
        expect(await env.exportDocuments("store_products")).toEqual([]);
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
        const parentDocRef1 = await env.firestore.collection(parentCollectionPath1).add(parentDocData1);
        const parentDocRef2 = await env.firestore.collection(parentCollectionPath2).add(parentDocData2);

        // Create subcollections with documents under the parent documents
        await parentDocRef1.collection(childFieldName1).add(subDocData1);
        await parentDocRef2.collection(childFieldName2).add(subDocData2);

        // Wait for firestore cloud function to write to Typesense
        await waitForFunctions(2000);

        // Delete Typesense collections to test backfill
        await env.recreateTypesenseCollections(typesenseCollectionNames());

        // Trigger backfill for non-configured subcollections
        await env.triggerBackfill({
          trigger: true,
          firestore_collections: ["some/other/collection", "another/unrelated/collection"],
        });
        await waitForFunctions(2000);

        // Check that no collections were backfilled
        for (const collectionName of typesenseCollectionNames()) {
          expect(await env.exportDocuments(collectionName)).toEqual([]);
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
      const parentDocRef1 = await env.firestore.collection(parentCollectionPath1).add(parentDocData1);
      const parentDocRef2 = await env.firestore.collection(parentCollectionPath2).add(parentDocData2);

      // Create subcollections with documents under the parent documents
      const subDocRef1 = await parentDocRef1.collection(childFieldName1).add(subDocData1);
      const subDocRef2 = await parentDocRef2.collection(childFieldName2).add(subDocData2);

      // Wait for firestore cloud function to write to Typesense
      await waitForFunctions(2000);

      // Delete Typesense collections to test backfill
      await env.recreateTypesenseCollections(typesenseCollectionNames());

      await env.triggerBackfill({trigger: true});
      await waitForFunctions(5000);

      // Check that only specified fields were backfilled
      const userBooksDocs = await env.exportDocuments("user_books");
      expect(userBooksDocs.length).toBe(1);
      const [userBook] = userBooksDocs;
      expect(userBook).toStrictEqual({
        id: subDocRef1.id,
        title: subDocData1.title,
        author: subDocData1.author,
        rating: subDocData1.rating,
        userId: parentDocRef1.id,
        // isbn and publisher should NOT be present
      });
      expect(userBook).not.toHaveProperty("isbn");
      expect(userBook).not.toHaveProperty("publisher");

      const storeProductsDocs = await env.exportDocuments("store_products");
      expect(storeProductsDocs.length).toBe(1);
      const [storeProduct] = storeProductsDocs;
      expect(storeProduct).toStrictEqual({
        id: subDocRef2.id,
        name: subDocData2.name,
        price: subDocData2.price,
        category: subDocData2.category,
        storeId: parentDocRef2.id,
        // sku and brand should NOT be present
      });
      expect(storeProduct).not.toHaveProperty("sku");
      expect(storeProduct).not.toHaveProperty("brand");
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
      const parentDocRef1 = await env.firestore.collection(parentCollectionPath1).add(parentDocData1);
      const parentDocRef2 = await env.firestore.collection(parentCollectionPath2).add(parentDocData2);

      // Create subcollections with documents under the parent documents
      const subDocRef1 = await parentDocRef1.collection(childFieldName1).add(subDocData1);
      const subDocRef2 = await parentDocRef2.collection(childFieldName2).add(subDocData2);

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
      const unrelatedParentDocRef = await env.firestore.collection(unrelatedCollectionPath).add(unrelatedParentDocData);

      // Create a subcollection with document under the unrelated parent document
      await unrelatedParentDocRef.collection(childFieldName1).add(unrelatedSubDocData);

      // Wait for firestore cloud function to write to Typesense
      await waitForFunctions(2000);

      // Delete Typesense collections to test backfill
      await env.recreateTypesenseCollections(typesenseCollectionNames());

      // Trigger backfill for configured subcollections only
      await env.triggerBackfill({
        trigger: true,
        firestore_collections: ["users/{userId}/books", "stores/{storeId}/products"],
      });
      await waitForFunctions(2000);

      // Check that only configured subcollections were backfilled
      expect(await env.exportDocuments("user_books")).toStrictEqual([
        {
          id: subDocRef1.id,
          title: subDocData1.title,
          author: subDocData1.author,
          rating: subDocData1.rating,
          userId: parentDocRef1.id,
        },
      ]);

      expect(await env.exportDocuments("store_products")).toStrictEqual([
        {
          id: subDocRef2.id,
          name: subDocData2.name,
          price: subDocData2.price,
          category: subDocData2.category,
          storeId: parentDocRef2.id,
        },
      ]);
    });
  });
});
