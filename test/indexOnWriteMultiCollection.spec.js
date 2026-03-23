const {TestEnvironment} = require("./support/testEnvironment");

describe("indexOnWriteMultiCollection", () => {
  let testEnvironment;

  beforeAll((done) => {
    testEnvironment = new TestEnvironment({
      dotenvPath: "extensions/test-params-multi-collection.local.env",
      outputAllEmulatorLogs: false,
    });

    testEnvironment.setupTestEnvironment((err) => {
      if (err) {
        done(err);
        return;
      }

      console.log("Available collections:", Object.keys(testEnvironment.config.collections));

      done();
    });
  });

  afterAll(async () => {
    await testEnvironment.teardownTestEnvironment();
  });

  beforeEach(async () => {
    for (const collectionName of Object.keys(testEnvironment.config.collections)) {
      try {
        await testEnvironment.typesense.collections(encodeURIComponent(collectionName)).delete();
      } catch (e) {
        console.log(`${collectionName} not found, proceeding...`);
      }

      await testEnvironment.typesense.collections().create({
        name: collectionName,
        fields: [{name: ".*", type: "auto"}],
        enable_nested_fields: true,
      });
    }
  });

  describe("Basic Data Types", () => {
    it("should index string values on writes to multiple collections", async () => {
      const userData = {name: "John Doe"};
      const productData = {title: "Sample Product"};

      const userRef = await testEnvironment.firestore.collection("users").add(userData);
      const productRef = await testEnvironment.firestore.collection("products").add(productData);

      await new Promise((r) => setTimeout(r, 3000));

      const usersDocsStr = await testEnvironment.typesense.collections(encodeURIComponent("users")).documents().export();
      const usersDocs = usersDocsStr
        .split("\n")
        .filter((s) => s)
        .map((s) => JSON.parse(s));

      const productsDocsStr = await testEnvironment.typesense.collections(encodeURIComponent("products")).documents().export();
      const productsDocs = productsDocsStr
        .split("\n")
        .filter((s) => s)
        .map((s) => JSON.parse(s));

      expect(usersDocs.length).toBe(1);
      expect(productsDocs.length).toBe(1);
      expect(usersDocs[0]).toStrictEqual({id: userRef.id, name: userData.name});
      expect(productsDocs[0]).toStrictEqual({id: productRef.id, title: productData.title});
    });

    it("should index numeric values on writes to multiple collections", async () => {
      const userData = {age: 30};
      const productData = {price: 99.99};

      const userRef = await testEnvironment.firestore.collection("users").add(userData);
      const productRef = await testEnvironment.firestore.collection("products").add(productData);

      await new Promise((r) => setTimeout(r, 3000));

      const usersDocsStr = await testEnvironment.typesense.collections(encodeURIComponent("users")).documents().export();
      const usersDocs = usersDocsStr
        .split("\n")
        .filter((s) => s)
        .map((s) => JSON.parse(s));

      const productsDocsStr = await testEnvironment.typesense.collections(encodeURIComponent("products")).documents().export();
      const productsDocs = productsDocsStr
        .split("\n")
        .filter((s) => s)
        .map((s) => JSON.parse(s));

      expect(usersDocs.length).toBe(1);
      expect(productsDocs.length).toBe(1);
      expect(usersDocs[0]).toStrictEqual({id: userRef.id, age: userData.age});
      expect(productsDocs[0]).toStrictEqual({id: productRef.id, price: productData.price});
    });

    it("should index boolean values on writes to multiple collections", async () => {
      const userData = {isActive: true};
      const productData = {isAvailable: false};

      const userRef = await testEnvironment.firestore.collection("users").add(userData);
      const productRef = await testEnvironment.firestore.collection("products").add(productData);

      await new Promise((r) => setTimeout(r, 3000));

      const usersDocsStr = await testEnvironment.typesense.collections(encodeURIComponent("users")).documents().export();
      const usersDocs = usersDocsStr
        .split("\n")
        .filter((s) => s)
        .map((s) => JSON.parse(s));

      const productsDocsStr = await testEnvironment.typesense.collections(encodeURIComponent("products")).documents().export();
      const productsDocs = productsDocsStr
        .split("\n")
        .filter((s) => s)
        .map((s) => JSON.parse(s));

      expect(usersDocs.length).toBe(1);
      expect(productsDocs.length).toBe(1);
      expect(usersDocs[0]).toStrictEqual({id: userRef.id, isActive: userData.isActive});
      expect(productsDocs[0]).toStrictEqual({id: productRef.id, isAvailable: productData.isAvailable});
    });

    it("should index null values on writes to multiple collections", async () => {
      const userData = {name: null};
      const productData = {description: null};

      const userRef = await testEnvironment.firestore.collection("users").add(userData);
      const productRef = await testEnvironment.firestore.collection("products").add(productData);

      await new Promise((r) => setTimeout(r, 3000));

      const usersDocsStr = await testEnvironment.typesense.collections(encodeURIComponent("users")).documents().export();
      const usersDocs = usersDocsStr
        .split("\n")
        .filter((s) => s)
        .map((s) => JSON.parse(s));

      const productsDocsStr = await testEnvironment.typesense.collections(encodeURIComponent("products")).documents().export();
      const productsDocs = productsDocsStr
        .split("\n")
        .filter((s) => s)
        .map((s) => JSON.parse(s));

      expect(usersDocs.length).toBe(1);
      expect(productsDocs.length).toBe(1);
      expect(usersDocs[0]).toStrictEqual({id: userRef.id});
      expect(productsDocs[0]).toStrictEqual({id: productRef.id});
    });

    it("should index timestamp values on writes to multiple collections", async () => {
      const now = new Date();
      const userData = {createdAt: now};
      const productData = {updatedAt: now};

      const userRef = await testEnvironment.firestore.collection("users").add(userData);
      const productRef = await testEnvironment.firestore.collection("products").add(productData);

      await new Promise((r) => setTimeout(r, 3000));

      const usersDocsStr = await testEnvironment.typesense.collections(encodeURIComponent("users")).documents().export();
      const usersDocs = usersDocsStr
        .split("\n")
        .filter((s) => s)
        .map((s) => JSON.parse(s));

      const productsDocsStr = await testEnvironment.typesense.collections(encodeURIComponent("products")).documents().export();
      const productsDocs = productsDocsStr
        .split("\n")
        .filter((s) => s)
        .map((s) => JSON.parse(s));

      expect(usersDocs.length).toBe(1);
      expect(productsDocs.length).toBe(1);
      expect(usersDocs[0]).toStrictEqual({id: userRef.id, createdAt: Math.floor(now.getTime() / 1000)});
      expect(productsDocs[0]).toStrictEqual({id: productRef.id, updatedAt: Math.floor(now.getTime() / 1000)});
    });

    it("should index geo point values on writes to multiple collections", async () => {
      const userData = {location: {latitude: 40.7128, longitude: -74.006}};
      const productData = {shippingLocation: {latitude: 34.0522, longitude: -118.2437}};

      await testEnvironment.firestore.collection("users").add(userData);
      await testEnvironment.firestore.collection("products").add(productData);

      await new Promise((r) => setTimeout(r, 3000));

      const usersDocsStr = await testEnvironment.typesense.collections(encodeURIComponent("users")).documents().export();
      const usersDocs = usersDocsStr
        .split("\n")
        .filter((s) => s)
        .map((s) => JSON.parse(s));

      const productsDocsStr = await testEnvironment.typesense.collections(encodeURIComponent("products")).documents().export();
      const productsDocs = productsDocsStr
        .split("\n")
        .filter((s) => s)
        .map((s) => JSON.parse(s));

      expect(usersDocs.length).toBe(1);
      expect(productsDocs.length).toBe(1);
      expect(usersDocs[0].location).toEqual([40.7128, -74.006]);
      expect(productsDocs[0].shippingLocation).toEqual([34.0522, -118.2437]);
    });

    it("should index array values on writes to multiple collections", async () => {
      const userData = {tags: ["admin", "user", "premium"]};
      const productData = {categories: ["electronics", "gadgets"]};

      const userRef = await testEnvironment.firestore.collection("users").add(userData);
      const productRef = await testEnvironment.firestore.collection("products").add(productData);

      await new Promise((r) => setTimeout(r, 3000));

      const usersDocsStr = await testEnvironment.typesense.collections(encodeURIComponent("users")).documents().export();
      const usersDocs = usersDocsStr
        .split("\n")
        .filter((s) => s)
        .map((s) => JSON.parse(s));

      const productsDocsStr = await testEnvironment.typesense.collections(encodeURIComponent("products")).documents().export();
      const productsDocs = productsDocsStr
        .split("\n")
        .filter((s) => s)
        .map((s) => JSON.parse(s));

      expect(usersDocs.length).toBe(1);
      expect(productsDocs.length).toBe(1);
      expect(usersDocs[0]).toStrictEqual({id: userRef.id, tags: userData.tags});
      expect(productsDocs[0]).toStrictEqual({id: productRef.id, categories: productData.categories});
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

      const userRef = await testEnvironment.firestore.collection("users").add(userData);

      await new Promise((r) => setTimeout(r, 3000));

      const usersDocsStr = await testEnvironment.typesense.collections(encodeURIComponent("users")).documents().export();
      const usersDocs = usersDocsStr
        .split("\n")
        .filter((s) => s)
        .map((s) => JSON.parse(s));

      expect(usersDocs.length).toBe(1);
      expect(usersDocs[0]).toStrictEqual({
        id: userRef.id,
        profile: {
          age: 30,
          location: "New York",
          preferences: {
            theme: "dark",
            language: "en",
          },
        },
      });
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

      const productRef = await testEnvironment.firestore.collection("products").add(productData);

      await new Promise((r) => setTimeout(r, 3000));

      const productsDocsStr = await testEnvironment.typesense.collections(encodeURIComponent("products")).documents().export();
      const productsDocs = productsDocsStr
        .split("\n")
        .filter((s) => s)
        .map((s) => JSON.parse(s));

      expect(productsDocs.length).toBe(1);
      expect(productsDocs[0]).toStrictEqual({
        id: productRef.id,
        "details.brand": "Apple",
        "details.specs.color": "black",
        "details.specs.weight": "200g",
      });
    });
  });

  describe("Document Operations", () => {
    it("should handle document updates in multiple collections", async () => {
      const userData = {name: "John Doe", email: "john@example.com"};
      const productData = {title: "Sample Product", price: 99.99};

      const userRef = await testEnvironment.firestore.collection("users").add(userData);
      const productRef = await testEnvironment.firestore.collection("products").add(productData);

      await new Promise((r) => setTimeout(r, 3000));

      await userRef.update({name: "John Updated", email: "john.updated@example.com"});
      await productRef.update({title: "Updated Product", price: 149.99});

      await new Promise((r) => setTimeout(r, 3000));

      const usersDocsStr = await testEnvironment.typesense.collections(encodeURIComponent("users")).documents().export();
      const usersDocs = usersDocsStr
        .split("\n")
        .filter((s) => s)
        .map((s) => JSON.parse(s));

      const productsDocsStr = await testEnvironment.typesense.collections(encodeURIComponent("products")).documents().export();
      const productsDocs = productsDocsStr
        .split("\n")
        .filter((s) => s)
        .map((s) => JSON.parse(s));

      expect(usersDocs.length).toBe(1);
      expect(productsDocs.length).toBe(1);
      expect(usersDocs[0]).toStrictEqual({
        id: userRef.id,
        name: "John Updated",
        email: "john.updated@example.com",
      });

      expect(productsDocs[0]).toStrictEqual({
        id: productRef.id,
        title: "Updated Product",
        price: 149.99,
      });
    });

    it("should handle document deletions in multiple collections", async () => {
      const userData = {name: "John Doe"};
      const productData = {title: "Sample Product"};

      const userRef = await testEnvironment.firestore.collection("users").add(userData);
      const productRef = await testEnvironment.firestore.collection("products").add(productData);

      await new Promise((r) => setTimeout(r, 3000));

      await userRef.delete();
      await productRef.delete();

      await new Promise((r) => setTimeout(r, 3000));

      const usersDocsStr = await testEnvironment.typesense.collections(encodeURIComponent("users")).documents().export();
      const productsDocsStr = await testEnvironment.typesense.collections(encodeURIComponent("products")).documents().export();

      expect(usersDocsStr).toBe("");
      expect(productsDocsStr).toBe("");
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

      const customerRef = await testEnvironment.firestore.collection("customers").add(customerData);
      const orderRef = await testEnvironment.firestore.collection("orders").add(orderData);
      await testEnvironment.firestore.collection("orders").add(orderData);

      await new Promise((r) => setTimeout(r, 3000));

      const customersDocsStr = await testEnvironment.typesense.collections(encodeURIComponent("customers")).documents().export();
      const customersDocs = customersDocsStr
        .split("\n")
        .filter((s) => s)
        .map((s) => JSON.parse(s));

      const ordersDocsStr = await testEnvironment.typesense.collections(encodeURIComponent("orders")).documents().export();
      const ordersDocs = ordersDocsStr
        .split("\n")
        .filter((s) => s)
        .map((s) => JSON.parse(s));

      expect(customersDocs[0]).not.toHaveProperty("age");
      expect(customersDocs[0]).not.toHaveProperty("phone");
      expect(customersDocs[0]).toStrictEqual({id: customerRef.id, name: customerData.name, email: customerData.email, profile: customerData.profile});

      expect(ordersDocs[0]).not.toHaveProperty("price");
      expect(ordersDocs[0]).not.toHaveProperty("category");
      expect(ordersDocs[0]).toStrictEqual({
        id: orderRef.id,
        title: orderData.title,
        description: orderData.description,
        "nested_field.tags": orderData.nested_field.tags,
        "nested_field.category": orderData.nested_field.category,
      });
    });
  });
});
