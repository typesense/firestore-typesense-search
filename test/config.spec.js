const config = require("../functions/src/config.js");

describe("Multi-Collection Configuration", () => {
  beforeEach(() => {
    delete process.env.FIRESTORE_COLLECTION_PATHS;
    delete process.env.TYPESENSE_COLLECTION_NAMES;
    delete process.env.FIRESTORE_COLLECTION_FIELDS_LIST;
    delete process.env.FLATTEN_NESTED_DOCUMENTS_LIST;
    delete process.env.FIRESTORE_COLLECTION_PATH;
    delete process.env.TYPESENSE_COLLECTION_NAME;
    delete process.env.FIRESTORE_COLLECTION_FIELDS;
    delete process.env.FLATTEN_NESTED_DOCUMENTS;
  });

  describe("parseCommaSeparated", () => {
    it("should parse comma-separated strings correctly", () => {
      expect(config.parseCommaSeparated("a,b,c")).toEqual(["a", "b", "c"]);
      expect(config.parseCommaSeparated("a, b , c")).toEqual(["a", "b", "c"]);
      expect(config.parseCommaSeparated("")).toEqual([]);
      expect(config.parseCommaSeparated(null)).toEqual([]);
      expect(config.parseCommaSeparated(undefined)).toEqual([]);
    });
  });

  describe("parsePipeSeparated", () => {
    it("should parse pipe-separated strings correctly", () => {
      expect(config.parsePipeSeparated("a,b|c,d")).toEqual([
        ["a", "b"],
        ["c", "d"],
      ]);
      expect(config.parsePipeSeparated("a|b|c")).toEqual([["a"], ["b"], ["c"]]);
      expect(config.parsePipeSeparated("")).toEqual([]);
      expect(config.parsePipeSeparated(null)).toEqual([]);
    });
  });

  describe("parseBooleanList", () => {
    it("should parse boolean lists correctly", () => {
      expect(config.parseBooleanList("true,false,true")).toEqual([true, false, true]);
      expect(config.parseBooleanList("false,true")).toEqual([false, true]);
      expect(config.parseBooleanList("")).toEqual([]);
      expect(config.parseBooleanList(null)).toEqual([]);
    });
  });

  describe("createCollectionConfigMap", () => {
    it("should create collection map from new multi-collection parameters", () => {
      process.env.FIRESTORE_COLLECTION_PATHS = "users,products";
      process.env.TYPESENSE_COLLECTION_NAMES = "users,products";
      process.env.FIRESTORE_COLLECTION_FIELDS_LIST = "name,email|title,description";
      process.env.FLATTEN_NESTED_DOCUMENTS_LIST = "false,true";

      const collectionMap = config.createCollectionConfigMap();

      expect(collectionMap).toEqual({
        users: {
          firestorePath: "users",
          typesenseCollection: "users",
          fields: ["name", "email"],
          flattenNested: false,
        },
        products: {
          firestorePath: "products",
          typesenseCollection: "products",
          fields: ["title", "description"],
          flattenNested: true,
        },
      });
    });

    it("should create collection map from legacy single collection parameters", () => {
      process.env.FIRESTORE_COLLECTION_PATH = "books";
      process.env.TYPESENSE_COLLECTION_NAME = "books";
      process.env.FIRESTORE_COLLECTION_FIELDS = "title,author";
      process.env.FLATTEN_NESTED_DOCUMENTS = "true";

      const collectionMap = config.createCollectionConfigMap();

      expect(collectionMap).toEqual({
        books: {
          firestorePath: "books",
          typesenseCollection: "books",
          fields: ["title", "author"],
          flattenNested: true,
        },
      });
    });

    it("should handle empty fields and flatten settings", () => {
      process.env.FIRESTORE_COLLECTION_PATHS = "users,products";
      process.env.TYPESENSE_COLLECTION_NAMES = "users,products";

      const collectionMap = config.createCollectionConfigMap();

      expect(collectionMap).toEqual({
        users: {
          firestorePath: "users",
          typesenseCollection: "users",
          fields: [],
          flattenNested: false,
        },
        products: {
          firestorePath: "products",
          typesenseCollection: "products",
          fields: [],
          flattenNested: false,
        },
      });
    });

    it("should throw error for mismatched collection counts", () => {
      process.env.FIRESTORE_COLLECTION_PATHS = "users,products";
      process.env.TYPESENSE_COLLECTION_NAMES = "users";

      expect(() => config.createCollectionConfigMap()).toThrow("Mismatch in collection counts: 2 Firestore paths vs 1 Typesense names");
    });
  });

  describe("collections property", () => {
    it("should expose collections map in config", () => {
      process.env.FIRESTORE_COLLECTION_PATHS = "users,products";
      process.env.TYPESENSE_COLLECTION_NAMES = "users,products";

      expect(config.collections).toBeDefined();
      expect(Object.keys(config.collections)).toEqual(["users", "products"]);
    });
  });
});
