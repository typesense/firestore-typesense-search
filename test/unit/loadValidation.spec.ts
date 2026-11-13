import {afterEach, describe, expect, it, vi} from "vitest";
import {assertConfigAtLoad} from "../../src/config.js";

const VALID = {FIRESTORE_COLLECTION_PATHS: "users,users/{userId}/books", TYPESENSE_COLLECTION_NAMES: "users,books"};

function problemsOf(env: Readonly<Record<string, string>>): string {
  try {
    assertConfigAtLoad({FUNCTIONS_CONTROL_API: "true", ...env});
  } catch (error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
  return "";
}

describe("assertConfigAtLoad", () => {
  it.each([
    ["nothing is set", {}],
    ["both collection params are empty", {FIRESTORE_COLLECTION_PATHS: " ", TYPESENSE_COLLECTION_NAMES: ""}],
    ["only unrelated params are set, even invalid ones", {FIRESTORE_COLLECTION_FIELDS_LIST: "a|b|c", TYPESENSE_PORT: "abc"}],
    ["only the paths are set, so the CLI prompts for the names", {FIRESTORE_COLLECTION_PATHS: "users,products"}],
    ["only the names are set, so the CLI prompts for the paths", {TYPESENSE_COLLECTION_NAMES: "users"}],
  ])("passes silently when %s, so kits:install can still prompt", (_label, env) => {
    expect(problemsOf(env)).toBe("");
  });

  it("passes a valid config without the Typesense host or secret", () => {
    expect(problemsOf({...VALID, FIRESTORE_COLLECTION_FIELDS_LIST: "name|title||", FLATTEN_NESTED_DOCUMENTS_LIST: "false,true,false"})).toBe("");
  });

  it("still explains the removed single-collection params", () => {
    expect(problemsOf({FIRESTORE_COLLECTION_PATH: "books", TYPESENSE_COLLECTION_NAME: "books_v1"})).toBe(
      "typesense-firestore-search: fix the kit's .env and deploy again.\n\n" +
        "The single-collection params FIRESTORE_COLLECTION_PATH, TYPESENSE_COLLECTION_NAME, FIRESTORE_COLLECTION_FIELDS and FLATTEN_NESTED_DOCUMENTS were removed in 4.0.0 " +
        "(see https://github.com/typesense/firestore-typesense-search/blob/master/UPGRADING.md). Replace them in your configuration with:\n" +
        "    FIRESTORE_COLLECTION_PATHS=books\n    TYPESENSE_COLLECTION_NAMES=books_v1",
    );
  });

  it("ignores removed params left next to the new ones", () => {
    expect(problemsOf({...VALID, FIRESTORE_COLLECTION_PATH: "books"})).toBe("");
  });

  it("names the lines to change", () => {
    expect(problemsOf({FIRESTORE_COLLECTION_PATHS: "users,products", TYPESENSE_COLLECTION_NAMES: "users"})).toBe(
      "typesense-firestore-search: fix the kit's .env and deploy again.\n\n" +
        "FIRESTORE_COLLECTION_PATHS lists 2 paths but TYPESENSE_COLLECTION_NAMES lists 1 name. Give each path one Typesense collection name, in the same order.\n" +
        "    FIRESTORE_COLLECTION_PATHS=users,products\n" +
        "    TYPESENSE_COLLECTION_NAMES=users",
    );
  });

  it.each([
    ["a path under typesense_sync", {FIRESTORE_COLLECTION_PATHS: "users,typesense_sync/x/logs", TYPESENSE_COLLECTION_NAMES: "users,logs"}, 'entry "typesense_sync/x/logs" is under typesense_sync'],
    ["a duplicate path", {FIRESTORE_COLLECTION_PATHS: "users,users", TYPESENSE_COLLECTION_NAMES: "a,b"}, 'FIRESTORE_COLLECTION_PATHS lists "users" more than once'],
    ["a document path", {FIRESTORE_COLLECTION_PATHS: "users/u1", TYPESENSE_COLLECTION_NAMES: "users"}, 'entry "users/u1" points to a document, not a collection'],
    ["a repeated placeholder", {FIRESTORE_COLLECTION_PATHS: "{a}/x/{a}", TYPESENSE_COLLECTION_NAMES: "x"}, 'entry "{a}/x/{a}" uses the placeholder {a} more than once'],
    ["a field group without a path", {...VALID, FIRESTORE_COLLECTION_FIELDS_LIST: "name||title"}, "FIRESTORE_COLLECTION_FIELDS_LIST has 3 field groups but FIRESTORE_COLLECTION_PATHS lists 2 paths"],
    ["a flatten value that is not a boolean", {...VALID, FLATTEN_NESTED_DOCUMENTS_LIST: "false,yes"}, 'FLATTEN_NESTED_DOCUMENTS_LIST entry 2 is "yes". Use true or false.'],
    ["a flatten value without a path", {...VALID, FLATTEN_NESTED_DOCUMENTS_LIST: "false,false,true"}, "FLATTEN_NESTED_DOCUMENTS_LIST has 3 entries but FIRESTORE_COLLECTION_PATHS lists 2 paths"],
    ["an invalid port", {...VALID, TYPESENSE_PORT: "-1"}, 'TYPESENSE_PORT is "-1". Use a positive integer such as 443.\n    TYPESENSE_PORT=-1'],
    ["an invalid protocol", {...VALID, TYPESENSE_PROTOCOL: "ftp"}, 'TYPESENSE_PROTOCOL is "ftp". Use http or https.'],
  ])("rejects %s", (_label, env, message) => {
    expect(problemsOf(env)).toContain(message);
  });

  it("leaves a deployed function to report the config at its first invocation", () => {
    expect(() => {
      assertConfigAtLoad({FIRESTORE_COLLECTION_PATHS: "users,products", TYPESENSE_COLLECTION_NAMES: "users", FIRESTORE_COLLECTION_PATH: "books"});
    }).not.toThrow();
  });

  it("lists every problem at once", () => {
    const message = problemsOf({FIRESTORE_COLLECTION_PATHS: "users,typesense_sync/x/y", TYPESENSE_COLLECTION_NAMES: "users", TYPESENSE_PROTOCOL: "ftp"});

    expect(
      message
        .split("\n\n")
        .slice(1)
        .map((problem) => problem.split(".")[0]),
    ).toStrictEqual([
      "FIRESTORE_COLLECTION_PATHS lists 2 paths but TYPESENSE_COLLECTION_NAMES lists 1 name",
      'FIRESTORE_COLLECTION_PATHS entry "typesense_sync/x/y" is under typesense_sync, where the kit keeps its own state',
      'TYPESENSE_PROTOCOL is "ftp"',
    ]);
  });
});

describe("loading the package", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("does not throw when the collection params are unset", async () => {
    vi.stubEnv("FIRESTORE_COLLECTION_PATHS", "");
    vi.stubEnv("TYPESENSE_COLLECTION_NAMES", "");

    await expect(import("../../src/index.js")).resolves.toHaveProperty("indexOnWrite");
  });

  it("fails discovery with the fix when the config is invalid", async () => {
    vi.stubEnv("FUNCTIONS_CONTROL_API", "true");
    vi.stubEnv("FIRESTORE_COLLECTION_PATHS", "users,products");
    vi.stubEnv("TYPESENSE_COLLECTION_NAMES", "users");

    await expect(import("../../src/index.js")).rejects.toThrow("FIRESTORE_COLLECTION_PATHS lists 2 paths but TYPESENSE_COLLECTION_NAMES lists 1 name");
  });

  it("does not throw in a deployed function, where the first invocation reports the config instead", async () => {
    vi.stubEnv("FUNCTIONS_CONTROL_API", "");
    vi.stubEnv("FIRESTORE_COLLECTION_PATHS", "users,products");
    vi.stubEnv("TYPESENSE_COLLECTION_NAMES", "users");

    await expect(import("../../src/index.js")).resolves.toHaveProperty("backfill");
  });
});
