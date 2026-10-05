import {afterAll, beforeAll, beforeEach, describe, expect, it} from "vitest";
import {TestEnvironment, waitForFunctions} from "./support/testEnvironment.js";

describe("indexOnWriteMultiCollectionSubcollections", () => {
  const env = new TestEnvironment({
    dotenvPath: "extensions/test-params-multi-collection-subcollections.local.env",
    outputAllEmulatorLogs: false,
  });

  beforeAll(async () => {
    await env.setup();
  });

  afterAll(async () => {
    await env.teardown();
  });

  beforeEach(async () => {
    await env.recreateTypesenseCollections(["user_books", "store_products"]);
  });

  describe("Subcollection Indexing", () => {
    it("should index documents from user subcollections", async () => {
      const userId = "user123";
      const bookData = {
        title: "The Great Gatsby",
        author: "F. Scott Fitzgerald",
        rating: 4.5,
      };

      await env.firestore.collection("users").doc(userId).set({
        name: "John Doe",
        email: "john@example.com",
      });

      const bookRef = await env.firestore.collection("users").doc(userId).collection("books").add(bookData);

      await waitForFunctions(3000);

      expect(await env.exportDocuments("user_books")).toStrictEqual([
        {
          id: bookRef.id,
          title: bookData.title,
          author: bookData.author,
          rating: bookData.rating,
          userId: userId,
        },
      ]);
    });

    it("should index documents from store subcollections", async () => {
      const storeId = "store456";
      const productData = {
        name: "iPhone 15",
        price: 999.99,
        category: "electronics",
        details: {
          color: "black",
          storage: "256GB",
        },
      };

      await env.firestore.collection("stores").doc(storeId).set({
        name: "Apple Store",
        location: "New York",
      });

      const productRef = await env.firestore.collection("stores").doc(storeId).collection("products").add(productData);

      await waitForFunctions(3000);

      expect(await env.exportDocuments("store_products")).toStrictEqual([
        {
          id: productRef.id,
          name: productData.name,
          price: productData.price,
          category: productData.category,
          storeId: storeId,
        },
      ]);
    });

    it("should handle updates in subcollections", async () => {
      const userId = "user789";
      const bookData = {
        title: "1984",
        author: "George Orwell",
        rating: 3.5,
      };

      await env.firestore.collection("users").doc(userId).set({
        name: "Jane Doe",
        email: "jane@example.com",
      });

      const bookRef = await env.firestore.collection("users").doc(userId).collection("books").add(bookData);

      await waitForFunctions(3000);

      await bookRef.update({
        title: "1984 (Updated)",
        rating: 4.5,
      });

      await waitForFunctions(2000);

      const booksDocs = await env.exportDocuments("user_books");

      console.log("Updated document:", booksDocs[0]);
      expect(booksDocs).toStrictEqual([
        {
          id: bookRef.id,
          title: "1984 (Updated)",
          author: "George Orwell",
          rating: 4.5,
          userId: userId,
        },
      ]);
    });

    it("should handle deletions in subcollections", async () => {
      const userId = "user999";
      const bookData = {
        title: "To Kill a Mockingbird",
        author: "Harper Lee",
        rating: 4.8,
      };

      await env.firestore.collection("users").doc(userId).set({
        name: "Bob Smith",
        email: "bob@example.com",
      });

      const bookRef = await env.firestore.collection("users").doc(userId).collection("books").add(bookData);

      await waitForFunctions(3000);

      await bookRef.delete();

      await waitForFunctions(3000);

      expect(await env.exportDocuments("user_books")).toEqual([]);
    });

    it("should handle multiple subcollections simultaneously", async () => {
      const userId1 = "user1";
      const userId2 = "user2";
      const storeId = "store1";

      const book1Data = {title: "Book 1", author: "Author 1", rating: 3.5};
      const book2Data = {title: "Book 2", author: "Author 2", rating: 4.5};
      const productData = {name: "Product 1", price: 100, category: "tech"};

      await env.firestore.collection("users").doc(userId1).set({name: "User 1"});
      await env.firestore.collection("users").doc(userId2).set({name: "User 2"});
      await env.firestore.collection("stores").doc(storeId).set({name: "Store 1"});

      const book1Ref = await env.firestore.collection("users").doc(userId1).collection("books").add(book1Data);
      const book2Ref = await env.firestore.collection("users").doc(userId2).collection("books").add(book2Data);
      const productRef = await env.firestore.collection("stores").doc(storeId).collection("products").add(productData);

      await waitForFunctions(3000);

      const booksDocs = await env.exportDocuments("user_books");
      const productsDocs = await env.exportDocuments("store_products");

      expect(booksDocs.length).toBe(2);
      expect(productsDocs.length).toBe(1);

      const book1Doc = booksDocs.find((doc) => doc["id"] === book1Ref.id);
      const book2Doc = booksDocs.find((doc) => doc["id"] === book2Ref.id);

      expect(book1Doc).toStrictEqual({
        id: book1Ref.id,
        title: book1Data.title,
        author: book1Data.author,
        rating: book1Data.rating,
        userId: userId1,
      });

      expect(book2Doc).toStrictEqual({
        id: book2Ref.id,
        title: book2Data.title,
        author: book2Data.author,
        rating: book2Data.rating,
        userId: userId2,
      });

      expect(productsDocs).toStrictEqual([
        {
          id: productRef.id,
          name: productData.name,
          price: productData.price,
          category: productData.category,
          storeId: storeId,
        },
      ]);
    });
  });
});
