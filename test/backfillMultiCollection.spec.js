const {TestEnvironment} = require("./support/testEnvironment");

describe("backfillMultiCollection", () => {
  let testEnvironment;
  let config = null;
  let firestore = null;
  let typesense = null;

  beforeAll((done) => {
    testEnvironment = new TestEnvironment({
      dotenvPath: "extensions/test-params-multi-collection.local.env",
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
    const collections = Object.keys(config.collections);

    for (const collectionPath of collections) {
      await firestore.recursiveDelete(firestore.collection(collectionPath));
    }

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

      const userDoc = await firestore.collection("users").add(userData);
      const productDoc = await firestore.collection("products").add(productData);
      const customerDoc = await firestore.collection("customers").add(customerData);
      const orderDoc = await firestore.collection("orders").add(orderData);

      await new Promise((r) => setTimeout(r, 2000));

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

      const usersDocsStr = await typesense.collections(encodeURIComponent("users")).documents().export();
      const usersDocs = usersDocsStr
        .split("\n")
        .filter((s) => s.trim())
        .map((s) => JSON.parse(s));
      expect(usersDocs.length).toBe(1);
      expect(usersDocs[0]).toStrictEqual({
        id: userDoc.id,
        name: userData.name,
        email: userData.email,
        profile: userData.profile,
      });

      const productsDocsStr = await typesense.collections(encodeURIComponent("products")).documents().export();
      const productsDocs = productsDocsStr
        .split("\n")
        .filter((s) => s.trim())
        .map((s) => JSON.parse(s));
      expect(productsDocs.length).toBe(1);
      expect(productsDocs[0]).toStrictEqual({
        id: productDoc.id,
        title: productData.title,
        description: productData.description,
        "nested_field.tags": productData.nested_field.tags,
        "nested_field.category": productData.nested_field.category,
      });

      const customersDocsStr = await typesense.collections(encodeURIComponent("customers")).documents().export();
      const customersDocs = customersDocsStr
        .split("\n")
        .filter((s) => s.trim())
        .map((s) => JSON.parse(s));
      expect(customersDocs.length).toBe(1);
      expect(customersDocs[0]).toStrictEqual({
        id: customerDoc.id,
        name: customerData.name,
        email: customerData.email,
        profile: customerData.profile,
      });

      const ordersDocsStr = await typesense.collections(encodeURIComponent("orders")).documents().export();
      const ordersDocs = ordersDocsStr
        .split("\n")
        .filter((s) => s.trim())
        .map((s) => JSON.parse(s));
      expect(ordersDocs.length).toBe(1);
      expect(ordersDocs[0]).toStrictEqual({
        id: orderDoc.id,
        title: orderData.title,
        description: orderData.description,
        "nested_field.items": orderData.nested_field.items,
        "nested_field.status": orderData.nested_field.status,
      });
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

        const userDoc = await firestore.collection("users").add(userData);
        const productDoc = await firestore.collection("products").add(productData);
        await firestore.collection("customers").add(customerData);

        await new Promise((r) => setTimeout(r, 2000));

        for (const collectionName of Object.values(config.collections).map((c) => c.typesenseCollection)) {
          await typesense.collections(encodeURIComponent(collectionName)).delete();
          await typesense.collections().create({
            name: collectionName,
            fields: [{name: ".*", type: "auto"}],
            enable_nested_fields: true,
          });
        }

        await firestore
          .collection(config.typesenseBackfillTriggerDocumentInFirestore.split("/")[0])
          .doc("backfill")
          .set({
            trigger: true,
            firestore_collections: ["users", "products"],
          });
        await new Promise((r) => setTimeout(r, 2000));

        const usersDocsStr = await typesense.collections(encodeURIComponent("users")).documents().export();
        const usersDocs = usersDocsStr
          .split("\n")
          .filter((s) => s.trim())
          .map((s) => JSON.parse(s));
        expect(usersDocs.length).toBe(1);
        expect(usersDocs[0]).toStrictEqual({
          id: userDoc.id,
          name: userData.name,
          email: userData.email,
          profile: userData.profile,
        });

        const productsDocsStr = await typesense.collections(encodeURIComponent("products")).documents().export();
        const productsDocs = productsDocsStr
          .split("\n")
          .filter((s) => s.trim())
          .map((s) => JSON.parse(s));
        expect(productsDocs.length).toBe(1);
        expect(productsDocs[0]).toStrictEqual({
          id: productDoc.id,
          title: productData.title,
          description: productData.description,
          "nested_field.tags": productData.nested_field.tags,
          "nested_field.category": productData.nested_field.category,
        });

        const customersDocsStr = await typesense.collections(encodeURIComponent("customers")).documents().export();
        expect(customersDocsStr).toEqual("");
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

        await firestore.collection("users").add(userData);
        await firestore.collection("products").add(productData);

        await new Promise((r) => setTimeout(r, 2000));

        for (const collectionName of Object.values(config.collections).map((c) => c.typesenseCollection)) {
          await typesense.collections(encodeURIComponent(collectionName)).delete();
          await typesense.collections().create({
            name: collectionName,
            fields: [{name: ".*", type: "auto"}],
            enable_nested_fields: true,
          });
        }

        await firestore
          .collection(config.typesenseBackfillTriggerDocumentInFirestore.split("/")[0])
          .doc("backfill")
          .set({
            trigger: true,
            firestore_collections: ["some/other/collection", "another/unrelated/collection"],
          });
        await new Promise((r) => setTimeout(r, 5000));

        for (const collectionName of Object.values(config.collections).map((c) => c.typesenseCollection)) {
          const docsStr = await typesense.collections(encodeURIComponent(collectionName)).documents().export();
          expect(docsStr).toEqual("");
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

      const customerDocs = await Promise.all(customerData.map((data) => firestore.collection("customers").add(data)));
      const orderDocs = await Promise.all(orderData.map((data) => firestore.collection("orders").add(data)));

      await new Promise((r) => setTimeout(r, 2000));

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

      const customersDocsStr = await typesense.collections(encodeURIComponent("customers")).documents().export();
      const customersDocs = customersDocsStr
        .split("\n")
        .filter((s) => s.trim())
        .map((s) => JSON.parse(s));
      expect(customersDocs.length).toBe(2);

      customerData.forEach((data, index) => {
        const customerDoc = customersDocs.find((doc) => doc.id === customerDocs[index].id);
        expect(customerDoc).toBeDefined();
        expect(customerDoc).toStrictEqual({
          id: customerDocs[index].id,
          name: data.name,
          email: data.email,
          profile: data.profile,
        });
        expect(customerDoc).not.toHaveProperty("age");
        expect(customerDoc).not.toHaveProperty("phone");
      });

      const ordersDocsStr = await typesense.collections(encodeURIComponent("orders")).documents().export();
      const ordersDocs = ordersDocsStr
        .split("\n")
        .filter((s) => s.trim())
        .map((s) => JSON.parse(s));
      expect(ordersDocs.length).toBe(2);

      orderData.forEach((data, index) => {
        const orderDoc = ordersDocs.find((doc) => doc.id === orderDocs[index].id);
        expect(orderDoc).toBeDefined();
        expect(orderDoc).toStrictEqual({
          id: orderDocs[index].id,
          title: data.title,
          description: data.description,
          "nested_field.items": data.nested_field.items,
          "nested_field.status": data.nested_field.status,
        });
        expect(orderDoc).not.toHaveProperty("price");
        expect(orderDoc).not.toHaveProperty("category");
      });
    });
  });
});
