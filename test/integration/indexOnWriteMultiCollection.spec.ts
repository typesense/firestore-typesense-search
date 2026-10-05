import {afterAll, beforeAll, beforeEach, describe, expect, it} from "vitest";
import {TestEnvironment, waitForFunctions} from "./support/testEnvironment.js";

describe("indexOnWriteMultiCollection", () => {
  const env = new TestEnvironment({
    dotenvPath: "extensions/test-params-multi-collection.local.env",
    outputAllEmulatorLogs: false,
  });

  beforeAll(async () => {
    await env.setup();
    console.log("Available collections:", Object.keys(env.collections));
  });

  afterAll(async () => {
    await env.teardown();
  });

  beforeEach(async () => {
    await env.recreateTypesenseCollections(Object.values(env.collections).map((c) => c.typesenseCollection));
  });

  describe("Basic Data Types", () => {
    it("should index string values on writes to multiple collections", async () => {
      const userData = {name: "John Doe"};
      const productData = {title: "Sample Product"};

      const userRef = await env.firestore.collection("users").add(userData);
      const productRef = await env.firestore.collection("products").add(productData);

      await waitForFunctions(3000);

      expect(await env.exportDocuments("users")).toStrictEqual([{id: userRef.id, name: userData.name}]);
      expect(await env.exportDocuments("products")).toStrictEqual([{id: productRef.id, title: productData.title}]);
    });

    it("should index numeric values on writes to multiple collections", async () => {
      const userData = {age: 30};
      const productData = {price: 99.99};

      const userRef = await env.firestore.collection("users").add(userData);
      const productRef = await env.firestore.collection("products").add(productData);

      await waitForFunctions(3000);

      expect(await env.exportDocuments("users")).toStrictEqual([{id: userRef.id, age: userData.age}]);
      expect(await env.exportDocuments("products")).toStrictEqual([{id: productRef.id, price: productData.price}]);
    });

    it("should index boolean values on writes to multiple collections", async () => {
      const userData = {isActive: true};
      const productData = {isAvailable: false};

      const userRef = await env.firestore.collection("users").add(userData);
      const productRef = await env.firestore.collection("products").add(productData);

      await waitForFunctions(3000);

      expect(await env.exportDocuments("users")).toStrictEqual([{id: userRef.id, isActive: userData.isActive}]);
      expect(await env.exportDocuments("products")).toStrictEqual([{id: productRef.id, isAvailable: productData.isAvailable}]);
    });

    it("should index null values on writes to multiple collections", async () => {
      const userData = {name: null};
      const productData = {description: null};

      const userRef = await env.firestore.collection("users").add(userData);
      const productRef = await env.firestore.collection("products").add(productData);

      await waitForFunctions(3000);

      expect(await env.exportDocuments("users")).toStrictEqual([{id: userRef.id}]);
      expect(await env.exportDocuments("products")).toStrictEqual([{id: productRef.id}]);
    });

    it("should index timestamp values on writes to multiple collections", async () => {
      const now = new Date();
      const userData = {createdAt: now};
      const productData = {updatedAt: now};

      const userRef = await env.firestore.collection("users").add(userData);
      const productRef = await env.firestore.collection("products").add(productData);

      await waitForFunctions(3000);

      expect(await env.exportDocuments("users")).toStrictEqual([{id: userRef.id, createdAt: Math.floor(now.getTime() / 1000)}]);
      expect(await env.exportDocuments("products")).toStrictEqual([{id: productRef.id, updatedAt: Math.floor(now.getTime() / 1000)}]);
    });

    it("should index geo point values on writes to multiple collections", async () => {
      const userData = {location: {latitude: 40.7128, longitude: -74.006}};
      const productData = {shippingLocation: {latitude: 34.0522, longitude: -118.2437}};

      await env.firestore.collection("users").add(userData);
      await env.firestore.collection("products").add(productData);

      await waitForFunctions(3000);

      const usersDocs = await env.exportDocuments("users");
      const productsDocs = await env.exportDocuments("products");

      expect(usersDocs.length).toBe(1);
      expect(productsDocs.length).toBe(1);
      const [userDoc] = usersDocs;
      const [productDoc] = productsDocs;
      expect(userDoc?.["location"]).toEqual([40.7128, -74.006]);
      expect(productDoc?.["shippingLocation"]).toEqual([34.0522, -118.2437]);
    });

    it("should index array values on writes to multiple collections", async () => {
      const userData = {tags: ["admin", "user", "premium"]};
      const productData = {categories: ["electronics", "gadgets"]};

      const userRef = await env.firestore.collection("users").add(userData);
      const productRef = await env.firestore.collection("products").add(productData);

      await waitForFunctions(3000);

      expect(await env.exportDocuments("users")).toStrictEqual([{id: userRef.id, tags: userData.tags}]);
      expect(await env.exportDocuments("products")).toStrictEqual([{id: productRef.id, categories: productData.categories}]);
    });
  });

  describe("Nested Fields", () => {
    it("should index nested fields without flattening for users collection", async () => {
      const userData = {
        profile: {
          age: 30,
          location: "New York",
          preferences: {
            theme: "dark",
            language: "en",
          },
        },
      };

      const userRef = await env.firestore.collection("users").add(userData);

      await waitForFunctions(3000);

      expect(await env.exportDocuments("users")).toStrictEqual([
        {
          id: userRef.id,
          profile: {
            age: 30,
            location: "New York",
            preferences: {
              theme: "dark",
              language: "en",
            },
          },
        },
      ]);
    });

    it("should index nested fields with flattening for products collection", async () => {
      const productData = {
        details: {
          brand: "Apple",
          specs: {
            color: "black",
            weight: "200g",
          },
        },
      };

      const productRef = await env.firestore.collection("products").add(productData);

      await waitForFunctions(3000);

      expect(await env.exportDocuments("products")).toStrictEqual([
        {
          id: productRef.id,
          "details.brand": "Apple",
          "details.specs.color": "black",
          "details.specs.weight": "200g",
        },
      ]);
    });
  });

  describe("Document Operations", () => {
    it("should handle document updates in multiple collections", async () => {
      const userData = {name: "John Doe", email: "john@example.com"};
      const productData = {title: "Sample Product", price: 99.99};

      const userRef = await env.firestore.collection("users").add(userData);
      const productRef = await env.firestore.collection("products").add(productData);

      await waitForFunctions(3000);

      await userRef.update({name: "John Updated", email: "john.updated@example.com"});
      await productRef.update({title: "Updated Product", price: 149.99});

      await waitForFunctions(3000);

      expect(await env.exportDocuments("users")).toStrictEqual([
        {
          id: userRef.id,
          name: "John Updated",
          email: "john.updated@example.com",
        },
      ]);

      expect(await env.exportDocuments("products")).toStrictEqual([
        {
          id: productRef.id,
          title: "Updated Product",
          price: 149.99,
        },
      ]);
    });

    it("should handle document deletions in multiple collections", async () => {
      const userData = {name: "John Doe"};
      const productData = {title: "Sample Product"};

      const userRef = await env.firestore.collection("users").add(userData);
      const productRef = await env.firestore.collection("products").add(productData);

      await waitForFunctions(3000);

      await userRef.delete();
      await productRef.delete();

      await waitForFunctions(3000);

      expect(await env.exportDocuments("users")).toEqual([]);
      expect(await env.exportDocuments("products")).toEqual([]);
    });
  });

  describe("Field Filtering", () => {
    it("should only index specified fields for each collection", async () => {
      const customerData = {
        name: "John Doe",
        email: "john@example.com",
        profile: {
          age: 30,
          location: "New York",
        },
        age: 30,
        phone: "123-456-7890", // This should not be indexed
      };

      const orderData = {
        title: "Sample Order",
        description: "A great order",
        nested_field: {
          category: "electronics",
          tags: ["urgent", "express"],
        },
        price: 99.99,
        category: "electronics", // This should not be indexed
      };

      const customerRef = await env.firestore.collection("customers").add(customerData);
      const orderRef = await env.firestore.collection("orders").add(orderData);
      await env.firestore.collection("orders").add(orderData);

      await waitForFunctions(3000);

      const [customerDoc] = await env.exportDocuments("customers");
      const ordersDocs = await env.exportDocuments("orders");

      expect(customerDoc).not.toHaveProperty("age");
      expect(customerDoc).not.toHaveProperty("phone");
      expect(customerDoc).toStrictEqual({
        id: customerRef.id,
        name: customerData.name,
        email: customerData.email,
        profile: customerData.profile,
      });

      const orderDoc = ordersDocs.find((doc) => doc["id"] === orderRef.id);
      expect(orderDoc).not.toHaveProperty("price");
      expect(orderDoc).not.toHaveProperty("category");
      expect(orderDoc).toStrictEqual({
        id: orderRef.id,
        title: orderData.title,
        description: orderData.description,
        "nested_field.tags": orderData.nested_field.tags,
        "nested_field.category": orderData.nested_field.category,
      });
    });
  });
});
