import {beforeEach, describe, expect, it} from "vitest";
import {assertNoRemovedParams, createCollectionConfigMap, getTypesenseConnectionConfig, parseBooleanList, parseCommaSeparated, parsePipeSeparated} from "../../functions/src/config.js";

const COLLECTION_KEYS = [
  "FIRESTORE_COLLECTION_PATHS",
  "TYPESENSE_COLLECTION_NAMES",
  "FIRESTORE_COLLECTION_FIELDS_LIST",
  "FLATTEN_NESTED_DOCUMENTS_LIST",
  "FIRESTORE_COLLECTION_PATH",
  "TYPESENSE_COLLECTION_NAME",
  "FIRESTORE_COLLECTION_FIELDS",
  "FLATTEN_NESTED_DOCUMENTS",
  "TYPESENSE_HOSTS",
  "TYPESENSE_PORT",
  "TYPESENSE_PROTOCOL",
  "TYPESENSE_API_KEY",
];

describe("Multi-Collection Configuration", () => {
  beforeEach(() => {
    for (const key of COLLECTION_KEYS) Reflect.deleteProperty(process.env, key);
  });

  describe("parseCommaSeparated", () => {
    it("should parse comma-separated strings correctly", () => {
      expect(parseCommaSeparated("a,b,c")).toEqual(["a", "b", "c"]);
      expect(parseCommaSeparated("a, b , c")).toEqual(["a", "b", "c"]);
      expect(parseCommaSeparated("")).toEqual([]);
      expect(parseCommaSeparated(null)).toEqual([]);
      expect(parseCommaSeparated(undefined)).toEqual([]);
    });
  });

  describe("parsePipeSeparated", () => {
    it("should parse pipe-separated strings correctly", () => {
      expect(parsePipeSeparated("a,b|c,d")).toEqual([
        ["a", "b"],
        ["c", "d"],
      ]);
      expect(parsePipeSeparated("a|b|c")).toEqual([["a"], ["b"], ["c"]]);
      expect(parsePipeSeparated("")).toEqual([]);
      expect(parsePipeSeparated(null)).toEqual([]);
    });
  });

  describe("parseBooleanList", () => {
    it("should parse boolean lists correctly", () => {
      expect(parseBooleanList("true,false,true")).toEqual([true, false, true]);
      expect(parseBooleanList("false,true")).toEqual([false, true]);
      expect(parseBooleanList("")).toEqual([]);
      expect(parseBooleanList(null)).toEqual([]);
    });
  });

  describe("createCollectionConfigMap", () => {
    it("should create collection map from new multi-collection parameters", () => {
      process.env["FIRESTORE_COLLECTION_PATHS"] = "users,products";
      process.env["TYPESENSE_COLLECTION_NAMES"] = "users,products";
      process.env["FIRESTORE_COLLECTION_FIELDS_LIST"] = "name,email|title,description";
      process.env["FLATTEN_NESTED_DOCUMENTS_LIST"] = "false,true";

      expect(createCollectionConfigMap()).toEqual({
        users: {firestorePath: "users", typesenseCollection: "users", fields: ["name", "email"], flattenNested: false},
        products: {firestorePath: "products", typesenseCollection: "products", fields: ["title", "description"], flattenNested: true},
      });
    });

    it("should handle empty fields and flatten settings", () => {
      process.env["FIRESTORE_COLLECTION_PATHS"] = "users,products";
      process.env["TYPESENSE_COLLECTION_NAMES"] = "users,products";

      expect(createCollectionConfigMap()).toEqual({
        users: {firestorePath: "users", typesenseCollection: "users", fields: [], flattenNested: false},
        products: {firestorePath: "products", typesenseCollection: "products", fields: [], flattenNested: false},
      });
    });

    it("should skip empty field lists between pipes", () => {
      process.env["FIRESTORE_COLLECTION_PATHS"] = "users,products,customers";
      process.env["TYPESENSE_COLLECTION_NAMES"] = "users,products,customers";
      process.env["FIRESTORE_COLLECTION_FIELDS_LIST"] = "||name,email";

      expect(Object.values(createCollectionConfigMap()).map((config) => config.fields)).toEqual([[], [], ["name", "email"]]);
    });

    it("should throw error for mismatched collection counts", () => {
      process.env["FIRESTORE_COLLECTION_PATHS"] = "users,products";
      process.env["TYPESENSE_COLLECTION_NAMES"] = "users";

      expect(() => createCollectionConfigMap()).toThrow("Mismatch in collection counts: 2 Firestore paths vs 1 Typesense names");
    });

    it("should throw error when no collection config is provided", () => {
      expect(() => createCollectionConfigMap()).toThrow("No Firestore collection config found. Set FIRESTORE_COLLECTION_PATHS and TYPESENSE_COLLECTION_NAMES.");
    });

    it("should throw error when only one of the collection params is set", () => {
      process.env["FIRESTORE_COLLECTION_PATHS"] = "users,products";

      expect(() => createCollectionConfigMap()).toThrow("Mismatch in collection counts: 2 Firestore paths vs 0 Typesense names");
    });
  });

  describe("assertNoRemovedParams", () => {
    it("should explain how to replace the removed single-collection params", () => {
      process.env["FIRESTORE_COLLECTION_PATH"] = "books";
      process.env["TYPESENSE_COLLECTION_NAME"] = "books_firestore";
      process.env["FIRESTORE_COLLECTION_FIELDS"] = "title,author";
      process.env["FLATTEN_NESTED_DOCUMENTS"] = "";

      expect(() => {
        assertNoRemovedParams();
      }).toThrow(
        "were removed in 4.0.0. Replace them in your configuration with:\n" +
          "FIRESTORE_COLLECTION_PATHS=books\nTYPESENSE_COLLECTION_NAMES=books_firestore\nFIRESTORE_COLLECTION_FIELDS_LIST=title,author\n" +
          "See https://github.com/typesense/firestore-typesense-search/blob/master/UPGRADING.md",
      );
    });

    it("should pass when the collection params are set, even if removed params remain", () => {
      process.env["FIRESTORE_COLLECTION_PATH"] = "books";
      process.env["TYPESENSE_COLLECTION_NAME"] = "books";
      process.env["FIRESTORE_COLLECTION_PATHS"] = "users";
      process.env["TYPESENSE_COLLECTION_NAMES"] = "users";

      expect(() => {
        assertNoRemovedParams();
      }).not.toThrow();
      expect(Object.keys(createCollectionConfigMap())).toEqual(["users"]);
    });

    it("should pass when nothing is configured yet, so a first deploy can prompt for the params", () => {
      expect(() => {
        assertNoRemovedParams();
      }).not.toThrow();
    });
  });

  describe("collections", () => {
    it("should key collections by Firestore path in configured order", () => {
      process.env["FIRESTORE_COLLECTION_PATHS"] = "users,products";
      process.env["TYPESENSE_COLLECTION_NAMES"] = "users,products";

      expect(Object.keys(createCollectionConfigMap())).toEqual(["users", "products"]);
    });
  });

  describe("getTypesenseConnectionConfig", () => {
    it("should default to https on port 443", () => {
      process.env["TYPESENSE_HOSTS"] = "a.typesense.net, b.typesense.net";
      process.env["TYPESENSE_API_KEY"] = "secret";

      expect(getTypesenseConnectionConfig()).toEqual({
        nodes: [
          {host: "a.typesense.net", port: 443, protocol: "https"},
          {host: "b.typesense.net", port: 443, protocol: "https"},
        ],
        apiKey: "secret",
      });
    });

    it("should read TYPESENSE_PORT and TYPESENSE_PROTOCOL from the environment", () => {
      process.env["TYPESENSE_HOSTS"] = "localhost";
      process.env["TYPESENSE_PORT"] = "8108";
      process.env["TYPESENSE_PROTOCOL"] = "http";
      process.env["TYPESENSE_API_KEY"] = "xyz";

      expect(getTypesenseConnectionConfig()).toEqual({nodes: [{host: "localhost", port: 8108, protocol: "http"}], apiKey: "xyz"});
    });

    it("should reject an invalid port or protocol", () => {
      process.env["TYPESENSE_HOSTS"] = "localhost";
      process.env["TYPESENSE_PORT"] = "abc";
      expect(() => getTypesenseConnectionConfig()).toThrow('Invalid TYPESENSE_PORT "abc"');

      process.env["TYPESENSE_PORT"] = "8108";
      process.env["TYPESENSE_PROTOCOL"] = "ftp";
      expect(() => getTypesenseConnectionConfig()).toThrow('Invalid TYPESENSE_PROTOCOL "ftp"');
    });
  });
});
