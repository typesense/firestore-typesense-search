import {afterAll, beforeAll, beforeEach, describe, expect, it} from "vitest";
import {TestEnvironment, waitForFunctions} from "./support/testEnvironment.js";

describe("backfillMultiCollection", () => {
  const env = new TestEnvironment({
    dotenvPath: "extensions/test-params-multi-collection.local.env",
    outputAllEmulatorLogs: true,
  });

  const typesenseCollectionNames = (): string[] => Object.values(env.collections).map((c) => c.typesenseCollection);

  beforeAll(async () => {
    await env.setup();
  });

  afterAll(async () => {
    await env.teardown();
  });

  beforeEach(async () => {
    for (const collectionPath of Object.keys(env.collections)) {
      await env.firestore.recursiveDelete(env.firestore.collection(collectionPath));
    }

    await env.recreateTypesenseCollections(typesenseCollectionNames());
  });

  describe("when firestore_collections is not specified", () => {
    it("backfills existing Firestore data in all collections to Typesense when `trigger: true` is set", async () => {
      const userData = {
        name: "John Doe",
        email: "john@example.com",
        profile: {
          age: 30,
          location: "NYC",
        },
      };

      const productData = {
        title: "Sample Product",
        description: "A great product",
        nested_field: {
          tags: ["electronics", "gadget"],
          category: "tech",
        },
      };

      const customerData = {
        name: "Jane Smith",
        email: "jane@example.com",
        profile: {
          age: 25,
          location: "LA",
        },
      };

      const orderData = {
        title: "Order #123",
        description: "Customer order",
        nested_field: {
          items: ["item1", "item2"],
          status: "pending",
        },
      };

      const userDoc = await env.firestore.collection("users").add(userData);
      const productDoc = await env.firestore.collection("products").add(productData);
      const customerDoc = await env.firestore.collection("customers").add(customerData);
      const orderDoc = await env.firestore.collection("orders").add(orderData);

      await waitForFunctions(2000);

      await env.recreateTypesenseCollections(typesenseCollectionNames());

      await env.triggerBackfill({trigger: true});
      await waitForFunctions(5000);

      expect(await env.exportDocuments("users")).toStrictEqual([
        {
          id: userDoc.id,
          name: userData.name,
          email: userData.email,
          profile: userData.profile,
        },
      ]);

      expect(await env.exportDocuments("products")).toStrictEqual([
        {
          id: productDoc.id,
          title: productData.title,
          description: productData.description,
          "nested_field.tags": productData.nested_field.tags,
          "nested_field.category": productData.nested_field.category,
        },
      ]);

      expect(await env.exportDocuments("customers")).toStrictEqual([
        {
          id: customerDoc.id,
          name: customerData.name,
          email: customerData.email,
          profile: customerData.profile,
        },
      ]);

      expect(await env.exportDocuments("orders")).toStrictEqual([
        {
          id: orderDoc.id,
          title: orderData.title,
          description: orderData.description,
          "nested_field.items": orderData.nested_field.items,
          "nested_field.status": orderData.nested_field.status,
        },
      ]);
    });
  });

  describe("when firestore_collections is specified", () => {
    describe("when firestore_collections includes configured collections", () => {
      it("backfills existing Firestore data in specified collections to Typesense when `trigger: true` is set", async () => {
        const userData = {
          name: "John Doe",
          email: "john@example.com",
          profile: {
            age: 30,
            location: "NYC",
          },
        };

        const productData = {
          title: "Sample Product",
          description: "A great product",
          nested_field: {
            tags: ["electronics", "gadget"],
            category: "tech",
          },
        };

        const customerData = {
          name: "Jane Smith",
          email: "jane@example.com",
          profile: {
            age: 25,
            location: "LA",
          },
        };

        const userDoc = await env.firestore.collection("users").add(userData);
        const productDoc = await env.firestore.collection("products").add(productData);
        await env.firestore.collection("customers").add(customerData);

        await waitForFunctions(2000);

        await env.recreateTypesenseCollections(typesenseCollectionNames());

        await env.triggerBackfill({
          trigger: true,
          firestore_collections: ["users", "products"],
        });
        await waitForFunctions(2000);

        expect(await env.exportDocuments("users")).toStrictEqual([
          {
            id: userDoc.id,
            name: userData.name,
            email: userData.email,
            profile: userData.profile,
          },
        ]);

        expect(await env.exportDocuments("products")).toStrictEqual([
          {
            id: productDoc.id,
            title: productData.title,
            description: productData.description,
            "nested_field.tags": productData.nested_field.tags,
            "nested_field.category": productData.nested_field.category,
          },
        ]);

        expect(await env.exportDocuments("customers")).toEqual([]);
      });
    });

    describe("when firestore_collections does not include any configured collections", () => {
      it("does not backfill existing Firestore data when `trigger: true` is set", async () => {
        const userData = {
          name: "John Doe",
          email: "john@example.com",
          profile: {
            age: 30,
            location: "NYC",
          },
        };

        const productData = {
          title: "Sample Product",
          description: "A great product",
          nested_field: {
            tags: ["electronics", "gadget"],
            category: "tech",
          },
        };

        await env.firestore.collection("users").add(userData);
        await env.firestore.collection("products").add(productData);

        await waitForFunctions(2000);

        await env.recreateTypesenseCollections(typesenseCollectionNames());

        await env.triggerBackfill({
          trigger: true,
          firestore_collections: ["some/other/collection", "another/unrelated/collection"],
        });
        await waitForFunctions(5000);

        for (const collectionName of typesenseCollectionNames()) {
          expect(await env.exportDocuments(collectionName)).toEqual([]);
        }
      });
    });
  });

  describe("Backfill with field filtering", () => {
    it("respects collection-specific field filtering during backfill", async () => {
      const customerData = [
        {
          name: "John Doe",
          email: "john@example.com",
          age: 30, // this should be filtered out (not in fields list)
          phone: "123-456-7890", // this should be filtered out (not in fields list)
          profile: {
            age: 30,
            location: "NYC",
          },
        },
        {
          name: "Jane Smith",
          email: "jane@example.com",
          age: 25, // this should be filtered out (not in fields list)
          phone: "987-654-3210", // this should be filtered out (not in fields list)
          profile: {
            age: 25,
            location: "LA",
          },
        },
      ];

      const orderData = [
        {
          title: "Order #123",
          description: "Customer order",
          price: 99.99, // this should be filtered out (not in fields list)
          category: "electronics", // this should be filtered out (not in fields list)
          nested_field: {
            items: ["item1", "item2"],
            status: "pending",
          },
        },
        {
          title: "Order #456",
          description: "Another order",
          price: 149.99, // this should be filtered out (not in fields list)
          category: "clothing", // this should be filtered out (not in fields list)
          nested_field: {
            items: ["item3", "item4"],
            status: "shipped",
          },
        },
      ];

      const customers = await Promise.all(
        customerData.map(async (data) => ({
          data,
          ref: await env.firestore.collection("customers").add(data),
        })),
      );
      const orders = await Promise.all(
        orderData.map(async (data) => ({
          data,
          ref: await env.firestore.collection("orders").add(data),
        })),
      );

      await waitForFunctions(2000);

      await env.recreateTypesenseCollections(typesenseCollectionNames());

      await env.triggerBackfill({trigger: true});
      await waitForFunctions(2000);

      const customersDocs = await env.exportDocuments("customers");
      expect(customersDocs.length).toBe(2);

      for (const {data, ref} of customers) {
        const customerDoc = customersDocs.find((doc) => doc["id"] === ref.id);
        expect(customerDoc).toBeDefined();
        expect(customerDoc).toStrictEqual({
          id: ref.id,
          name: data.name,
          email: data.email,
          profile: data.profile,
        });
        expect(customerDoc).not.toHaveProperty("age");
        expect(customerDoc).not.toHaveProperty("phone");
      }

      const ordersDocs = await env.exportDocuments("orders");
      expect(ordersDocs.length).toBe(2);

      for (const {data, ref} of orders) {
        const orderDoc = ordersDocs.find((doc) => doc["id"] === ref.id);
        expect(orderDoc).toBeDefined();
        expect(orderDoc).toStrictEqual({
          id: ref.id,
          title: data.title,
          description: data.description,
          "nested_field.items": data.nested_field.items,
          "nested_field.status": data.nested_field.status,
        });
        expect(orderDoc).not.toHaveProperty("price");
        expect(orderDoc).not.toHaveProperty("category");
      }
    });
  });
});
