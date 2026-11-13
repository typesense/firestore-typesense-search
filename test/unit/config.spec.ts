import {beforeEach, describe, expect, it} from "vitest";
import {formatConfigProblems, parseBooleanList, parseCollectionConfigs, parseCommaSeparated, parseConnection, parsePipeSeparated, type CollectionConfig, type ConfigProblem} from "../../src/config.js";
import type {Result} from "../../src/result.js";

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

function problemsOf(result: Result<unknown, readonly ConfigProblem[]>): string[] {
  return result.ok ? [] : formatConfigProblems(result.error);
}

function configs(): readonly CollectionConfig[] {
  const parsed = parseCollectionConfigs(process.env);
  if (!parsed.ok) throw new Error(formatConfigProblems(parsed.error).join("\n"));
  return parsed.value;
}

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

  describe("parseCollectionConfigs", () => {
    it("should create collection configs from the multi-collection parameters", () => {
      process.env["FIRESTORE_COLLECTION_PATHS"] = "users,products";
      process.env["TYPESENSE_COLLECTION_NAMES"] = "users,products";
      process.env["FIRESTORE_COLLECTION_FIELDS_LIST"] = "name,email|title,description";
      process.env["FLATTEN_NESTED_DOCUMENTS_LIST"] = "false,true";

      expect(parseCollectionConfigs(process.env)).toEqual({
        ok: true,
        value: [
          {firestorePath: "users", typesenseCollection: "users", fields: ["name", "email"], flattenNested: false},
          {firestorePath: "products", typesenseCollection: "products", fields: ["title", "description"], flattenNested: true},
        ],
      });
    });

    it("should handle empty fields and flatten settings", () => {
      process.env["FIRESTORE_COLLECTION_PATHS"] = "users,products";
      process.env["TYPESENSE_COLLECTION_NAMES"] = "users,products";

      expect(parseCollectionConfigs(process.env)).toEqual({
        ok: true,
        value: [
          {firestorePath: "users", typesenseCollection: "users", fields: [], flattenNested: false},
          {firestorePath: "products", typesenseCollection: "products", fields: [], flattenNested: false},
        ],
      });
    });

    it("should skip empty field lists between pipes", () => {
      process.env["FIRESTORE_COLLECTION_PATHS"] = "users,products,customers";
      process.env["TYPESENSE_COLLECTION_NAMES"] = "users,products,customers";
      process.env["FIRESTORE_COLLECTION_FIELDS_LIST"] = "||name,email";

      expect(configs().map((config) => config.fields)).toEqual([[], [], ["name", "email"]]);
    });

    it("should keep the configured order", () => {
      process.env["FIRESTORE_COLLECTION_PATHS"] = "users,products";
      process.env["TYPESENSE_COLLECTION_NAMES"] = "users,products";

      expect(configs().map((config) => config.firestorePath)).toEqual(["users", "products"]);
    });

    it("should report mismatched collection counts", () => {
      process.env["FIRESTORE_COLLECTION_PATHS"] = "users,products";
      process.env["TYPESENSE_COLLECTION_NAMES"] = "users";

      expect(problemsOf(parseCollectionConfigs(process.env))).toStrictEqual([
        "FIRESTORE_COLLECTION_PATHS lists 2 paths but TYPESENSE_COLLECTION_NAMES lists 1 name. Give each path one Typesense collection name, in the same order.\n" +
          "    FIRESTORE_COLLECTION_PATHS=users,products\n    TYPESENSE_COLLECTION_NAMES=users",
      ]);
    });

    it("should report when no collection config is provided", () => {
      expect(problemsOf(parseCollectionConfigs(process.env))).toStrictEqual(["No collections are configured. Set FIRESTORE_COLLECTION_PATHS and TYPESENSE_COLLECTION_NAMES."]);
    });

    it("should report when only one of the collection params is set", () => {
      process.env["FIRESTORE_COLLECTION_PATHS"] = "users,products";

      expect(problemsOf(parseCollectionConfigs(process.env))[0]).toContain("FIRESTORE_COLLECTION_PATHS lists 2 paths but TYPESENSE_COLLECTION_NAMES lists 0 names.");
    });

    it("should explain how to replace the removed single-collection params", () => {
      process.env["FIRESTORE_COLLECTION_PATH"] = "books";
      process.env["TYPESENSE_COLLECTION_NAME"] = "books_firestore";
      process.env["FIRESTORE_COLLECTION_FIELDS"] = "title,author";
      process.env["FLATTEN_NESTED_DOCUMENTS"] = "";

      expect(problemsOf(parseCollectionConfigs(process.env))).toStrictEqual([
        "The single-collection params FIRESTORE_COLLECTION_PATH, TYPESENSE_COLLECTION_NAME, FIRESTORE_COLLECTION_FIELDS and FLATTEN_NESTED_DOCUMENTS were removed in 4.0.0 " +
          "(see https://github.com/typesense/firestore-typesense-search/blob/master/UPGRADING.md). Replace them in your configuration with:\n" +
          "    FIRESTORE_COLLECTION_PATHS=books\n    TYPESENSE_COLLECTION_NAMES=books_firestore\n    FIRESTORE_COLLECTION_FIELDS_LIST=title,author",
      ]);
    });

    it("should use the collection params when they are set, even if removed params remain", () => {
      process.env["FIRESTORE_COLLECTION_PATH"] = "books";
      process.env["TYPESENSE_COLLECTION_NAME"] = "books";
      process.env["FIRESTORE_COLLECTION_PATHS"] = "users";
      process.env["TYPESENSE_COLLECTION_NAMES"] = "users";

      expect(configs().map((config) => config.firestorePath)).toEqual(["users"]);
    });
  });

  describe("parseConnection", () => {
    it("should default to https on port 443", () => {
      process.env["TYPESENSE_HOSTS"] = "a.typesense.net, b.typesense.net";
      process.env["TYPESENSE_API_KEY"] = "secret";

      expect(parseConnection(process.env)).toEqual({
        ok: true,
        value: {
          nodes: [
            {host: "a.typesense.net", port: 443, protocol: "https"},
            {host: "b.typesense.net", port: 443, protocol: "https"},
          ],
          apiKey: "secret",
        },
      });
    });

    it("should read TYPESENSE_PORT and TYPESENSE_PROTOCOL from the environment", () => {
      process.env["TYPESENSE_HOSTS"] = "localhost";
      process.env["TYPESENSE_PORT"] = "8108";
      process.env["TYPESENSE_PROTOCOL"] = "http";
      process.env["TYPESENSE_API_KEY"] = "xyz";

      expect(parseConnection(process.env)).toEqual({ok: true, value: {nodes: [{host: "localhost", port: 8108, protocol: "http"}], apiKey: "xyz"}});
    });

    it("should reject an invalid port or protocol", () => {
      process.env["TYPESENSE_HOSTS"] = "localhost";
      process.env["TYPESENSE_PORT"] = "abc";
      process.env["TYPESENSE_API_KEY"] = "xyz";
      expect(problemsOf(parseConnection(process.env))).toStrictEqual(['TYPESENSE_PORT is "abc". Use a positive integer such as 443.\n    TYPESENSE_PORT=abc']);

      process.env["TYPESENSE_PORT"] = "8108";
      process.env["TYPESENSE_PROTOCOL"] = "ftp";
      expect(problemsOf(parseConnection(process.env))).toStrictEqual(['TYPESENSE_PROTOCOL is "ftp". Use http or https.\n    TYPESENSE_PROTOCOL=ftp']);
    });
  });
});
