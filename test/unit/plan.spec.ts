import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {Timestamp} from "firebase-admin/firestore";
import {describe, expect, it} from "vitest";
import {matchCollection, resolveCollection, type CollectionMatch, type CollectionSpec, type FirestoreData, type ResolvedCollection, type SchemaProblem} from "../../src/collection.js";
import {parseTypesenseDocumentId, type TypesenseDocumentId} from "../../src/ids.js";
import {parseCollectionPath, parseDocumentPath, type CollectionPath} from "../../src/paths.js";
import {planSync, planWrite, type SyncPlan} from "../../src/plan.js";
import {err, ok, type Result} from "../../src/result.js";

interface Submission {
  readonly title: string;
  readonly status: "draft" | "published";
  readonly slug?: string;
}

const LISTED = ["title", "status", "slug", "updatedAt"];

function collectionPath(value: string): CollectionPath {
  const parsed = parseCollectionPath(value);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.value;
}

function typesenseId(value: string): TypesenseDocumentId {
  const parsed = parseTypesenseDocumentId(value);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.value;
}

function validate(projection: FirestoreData): Result<Submission, readonly SchemaProblem[]> {
  const title = projection["title"];
  const status = projection["status"];
  const slug = projection["slug"];
  const problems: SchemaProblem[] = [];
  if (typeof title !== "string") problems.push({path: "title", message: "Expected a string"});
  if (status !== "draft" && status !== "published") problems.push({path: "status", message: 'Expected "draft" or "published"'});
  if (slug !== undefined && typeof slug !== "string") problems.push({path: "slug", message: "Expected a string"});
  if (typeof title !== "string" || (status !== "draft" && status !== "published") || problems.length > 0) return err(problems);
  return ok({title, status, ...(typeof slug === "string" ? {slug} : {})});
}

const submissions: ResolvedCollection = resolveCollection<Submission>({
  path: collectionPath("tenants/{tenantId}/submissions"),
  typesenseCollection: "submissions",
  consistency: "reread",
  project: (data) => Object.fromEntries(LISTED.flatMap((field) => (Object.hasOwn(data, field) ? [[field, data[field]]] : []))),
  validate,
  indexIf: (data) => {
    if (data.title === "throw in indexIf") throw new Error("indexIf exploded");
    return data.status === "published";
  },
  id: (data, {params, docId}) => {
    if (data.title === "throw in id") throw new Error("id exploded");
    if (data.title === "empty id") return "";
    return data.slug ?? `${params["tenantId"] ?? ""}_${docId}`;
  },
  document: (data, {params}) => {
    if (data.title === "throw in document") throw new Error("document exploded");
    return {title: data.title, tenant_id: params["tenantId"] ?? ""};
  },
});

function match(documentPath: string, collections: readonly ResolvedCollection[] = [submissions]): CollectionMatch | undefined {
  const parsed = parseDocumentPath(documentPath);
  return parsed === undefined ? undefined : matchCollection(collections, parsed);
}

function matched(documentPath = "tenants/t1/submissions/s1"): CollectionMatch {
  const result = match(documentPath);
  if (result === undefined) throw new Error(`No collection matches ${documentPath}`);
  return result;
}

const published = {title: "Hello", status: "published", views: 1};
const draft = {title: "Hello", status: "draft", views: 1};
const invalid = {title: 42, status: "published", views: 1};

function plan(before: FirestoreData | undefined, after: FirestoreData | undefined): ReturnType<typeof planWrite> {
  const {collection, context} = matched();
  return planWrite(collection, context, before, after);
}

function sync(previousId: string | undefined, latest: FirestoreData | undefined): SyncPlan {
  const {collection, context} = matched();
  return planSync(collection, context, previousId === undefined ? undefined : typesenseId(previousId), latest);
}

describe("matchCollection (step 1)", () => {
  it("matches a configured path and extracts its params", () => {
    expect(match("tenants/t1/submissions/s1")?.context).toStrictEqual({documentPath: "tenants/t1/submissions/s1", docId: "s1", params: {tenantId: "t1"}});
  });

  it.each(["tenants/t1", "tenants/t1/drafts/s1", "tenants/t1/submissions/s1/submissions/s2"])("does not match %s", (documentPath) => {
    expect(match(documentPath)).toBeUndefined();
  });

  it("never matches the kit's own state, even under a placeholder path", () => {
    const anything = resolveCollection(passThroughSpec("{scope}/{scopeId}/typesense_issues"));
    expect(match("typesense_sync/issues/typesense_issues/x", [anything])).toBeUndefined();
    expect(match("other/issues/typesense_issues/x", [anything])).toBeDefined();
  });
});

function passThroughSpec(value: string): CollectionSpec<FirestoreData> {
  return {
    path: collectionPath(value),
    typesenseCollection: "anything",
    consistency: "reread",
    project: (data) => data,
    validate: ok,
    indexIf: () => true,
    id: (_data, {docId}) => docId,
    document: (data) => data,
  };
}

describe("planWrite", () => {
  describe("delete events (step 4)", () => {
    it("deletes the ID the document was indexed under", () => {
      expect(plan(published, undefined)).toStrictEqual({kind: "delete", id: "t1_s1"});
      expect(plan({...published, slug: "hello"}, undefined)).toStrictEqual({kind: "delete", id: "hello"});
    });

    it.each([
      ["excluded", draft],
      ["invalid", invalid],
      ["failing indexIf", {...published, title: "throw in indexIf"}],
      ["failing id", {...published, title: "throw in id"}],
    ])("skips a document that was %s before", (_label, before) => {
      expect(plan(before, undefined)).toStrictEqual({kind: "skip", reason: "not-indexed"});
    });

    it("skips an event with no data on either side", () => {
      expect(plan(undefined, undefined)).toStrictEqual({kind: "skip", reason: "not-indexed"});
    });
  });

  describe("documents in the index neither before nor after (step 5)", () => {
    it.each([
      ["a new draft", undefined, draft],
      ["an edited draft", draft, {...draft, title: "Changed"}],
      ["an invalid document turning into a draft", invalid, draft],
    ])("skips %s", (_label, before, after) => {
      expect(plan(before, after)).toStrictEqual({kind: "skip", reason: "excluded"});
    });

    it("rejects a new document that fails the schema, with the problems", () => {
      expect(plan(undefined, invalid)).toStrictEqual({
        kind: "reject",
        failure: {stage: "schema", message: "The document does not match the collection schema: title: Expected a string", problems: [{path: "title", message: "Expected a string"}]},
      });
    });

    it.each([
      ["a draft", draft],
      ["an invalid document with other values", {...invalid, title: 43}],
    ])("rejects %s turning invalid", (_label, before) => {
      expect(plan(before, invalid)).toMatchObject({kind: "reject", failure: {stage: "schema"}});
    });

    it.each([
      ["indexIf", "throw in indexIf", "indexIf threw: indexIf exploded"],
      ["id", "throw in id", "id threw: id exploded"],
      ["id", "empty id", "id returned an invalid Typesense document ID: it must not be empty"],
    ])("rejects a document whose %s hook fails (%s)", (stage, title, message) => {
      expect(plan(undefined, {...published, title})).toMatchObject({kind: "reject", failure: {stage, message}});
    });
  });

  describe("unchanged listed fields (step 6)", () => {
    it("skips a write that changes only unlisted fields", () => {
      expect(plan(published, {...published, views: 2})).toStrictEqual({kind: "skip", reason: "unchanged"});
    });

    it("skips an unchanged invalid document without reporting it again", () => {
      expect(plan(invalid, {...invalid, views: 2})).toStrictEqual({kind: "skip", reason: "unchanged"});
    });

    it("compares Firestore values by value", () => {
      const before = {...published, updatedAt: Timestamp.fromMillis(1000)};
      expect(plan(before, {...before, updatedAt: Timestamp.fromMillis(1000)})).toStrictEqual({kind: "skip", reason: "unchanged"});
      expect(plan(before, {...before, updatedAt: Timestamp.fromMillis(2000)})).toStrictEqual({kind: "sync", previousId: "t1_s1"});
    });

    it("treats a listed field that appears or disappears as a change", () => {
      expect(plan(published, {...published, slug: "hello"})).toStrictEqual({kind: "sync", previousId: "t1_s1"});
      expect(plan({...published, slug: "hello"}, published)).toStrictEqual({kind: "sync", previousId: "hello"});
    });
  });

  describe("everything else syncs (step 7)", () => {
    it.each([
      ["a new published document", undefined, published, undefined],
      ["a draft being published", draft, published, undefined],
      ["an invalid document being fixed", invalid, published, undefined],
      ["a published document being edited", published, {...published, title: "Changed"}, "t1_s1"],
      ["a published document turning into a draft", published, draft, "t1_s1"],
      ["a published document turning invalid", published, invalid, "t1_s1"],
      ["a published document whose ID changes", published, {...published, slug: "hello"}, "t1_s1"],
    ])("syncs %s", (_label, before, after, previousId) => {
      expect(plan(before, after)).toStrictEqual({kind: "sync", previousId});
    });
  });
});

describe("planSync", () => {
  it.each([
    ["the document is gone", undefined],
    ["the document no longer qualifies", draft],
  ])("removes the previous ID when %s", (_label, latest) => {
    expect(sync("t1_s1", latest)).toStrictEqual({kind: "remove", id: "t1_s1"});
    expect(sync(undefined, latest)).toStrictEqual({kind: "none"});
  });

  it("rejects an invalid latest document and drops what was indexed", () => {
    expect(sync("t1_s1", invalid)).toMatchObject({kind: "reject", failure: {stage: "schema"}, staleId: "t1_s1"});
    expect(sync(undefined, invalid)).toMatchObject({kind: "reject", failure: {stage: "schema"}, staleId: undefined});
  });

  it("upserts the latest document under its ID", async () => {
    const result = sync("t1_s1", published);
    expect(result).toMatchObject({kind: "upsert", id: "t1_s1", staleId: undefined});
    if (result.kind !== "upsert") throw new Error("Expected an upsert");
    expect(await result.build()).toStrictEqual({ok: true, value: {title: "Hello", tenant_id: "t1"}});
  });

  it("removes the old ID when the ID changes", () => {
    expect(sync("t1_s1", {...published, slug: "hello"})).toMatchObject({kind: "upsert", id: "hello", staleId: "t1_s1"});
  });

  it("returns a failing document hook as a value", async () => {
    const result = sync(undefined, {...published, title: "throw in document"});
    if (result.kind !== "upsert") throw new Error("Expected an upsert");
    expect(await result.build()).toStrictEqual({ok: false, error: {stage: "document", message: "document threw: document exploded", error: "document exploded"}});
  });
});

describe("hooks that break their contract", () => {
  it("rejects a document when schema validation throws", () => {
    const throwing = resolveCollection<FirestoreData>({
      ...passThroughSpec("books"),
      validate: () => {
        throw new Error("validator exploded");
      },
    });
    const parsed = parseDocumentPath("books/b1");
    const found = parsed === undefined ? undefined : matchCollection([throwing], parsed);
    if (found === undefined) throw new Error("No match");

    expect(planWrite(found.collection, found.context, undefined, {title: "T"})).toStrictEqual({
      kind: "reject",
      failure: {stage: "schema", message: "The schema validation threw: validator exploded", problems: [{path: "", message: "validator exploded"}]},
    });
  });

  it.each([
    [undefined, "must be a string, got undefined"],
    [10n, "must be a string, got bigint 10"],
    [{}, "must be a string, got an object"],
    [" ", "must not be empty"],
  ])("explains an invalid document ID %s", (value, message) => {
    expect(parseTypesenseDocumentId(value)).toStrictEqual({ok: false, error: message});
  });
});

describe("planner purity", () => {
  const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src");
  const RUNTIME_IMPORT = /^import\s+(?!type\s)[^;]*?\sfrom\s+"([^"]+)";/gm;

  function runtimeImportsOf(file: string): string[] {
    return [...readFileSync(path.join(SRC, file), "utf8").matchAll(RUNTIME_IMPORT)].flatMap((found) => found[1] ?? []);
  }

  function closureOf(entry: string): {modules: string[]; packages: string[]} {
    const modules = new Set<string>();
    const packages = new Set<string>();
    const visit = (file: string): void => {
      if (modules.has(file)) return;
      modules.add(file);
      for (const specifier of runtimeImportsOf(file)) {
        if (specifier.startsWith("./")) visit(specifier.slice(2).replace(/\.js$/, ".ts"));
        else packages.add(specifier);
      }
    };
    visit(entry);
    return {modules: [...modules].toSorted(), packages: [...packages]};
  }

  it.each(["plan.ts", "collection.ts"])("%s imports nothing that can do I/O", (entry) => {
    expect(closureOf(entry).packages).toStrictEqual([]);
  });

  it("plans with only the equality and result helpers", () => {
    expect(closureOf("plan.ts").modules).toStrictEqual(["equality.ts", "plan.ts", "result.ts"]);
  });
});
