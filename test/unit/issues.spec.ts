import {describe, expect, it} from "vitest";
import {createIssueRecorder, documentIssueId, type SyncIssue} from "../../src/issues.js";
import {parseDocumentPath} from "../../src/paths.js";
import {FakeFirestore} from "./support/fakeFirestore.js";

function issue(response: string): SyncIssue {
  const documentPath = parseDocumentPath("books/b1");
  if (documentPath === undefined) throw new Error("Invalid test path");
  return {stage: "typesense", message: response, httpStatus: 400, response, transient: false, target: {typesenseCollection: "books", documentPath}};
}

describe("createIssueRecorder", () => {
  it("rewrites an identical issue only after ten minutes", async () => {
    const store = new FakeFirestore();
    let now = 0;
    const recorder = createIssueRecorder(store, () => now);

    await recorder.record(issue("A"));
    now += 9 * 60 * 1000;
    await recorder.record(issue("A"));
    await recorder.record(issue("B"));
    now += 10 * 60 * 1000;
    await recorder.record(issue("B"));

    expect(store.writes.map(({data}) => data?.["message"])).toStrictEqual(["A", "B", "B"]);
  });
});

describe("concurrent records", () => {
  it("writes identical issues once", async () => {
    const store = new FakeFirestore();
    const recorder = createIssueRecorder(store);

    await Promise.all([recorder.record(issue("A")), recorder.record(issue("A")), recorder.record(issue("A"))]);

    expect(store.writes.map(({data}) => data?.["message"])).toStrictEqual(["A"]);
  });

  it("writes different issues in order and remembers the last one", async () => {
    const store = new FakeFirestore();
    const recorder = createIssueRecorder(store);

    await Promise.all([recorder.record(issue("A")), recorder.record(issue("B"))]);
    await recorder.record(issue("B"));
    await recorder.record(issue("A"));

    expect(store.writes.map(({data}) => data?.["message"])).toStrictEqual(["A", "B", "A"]);
  });

  it("rejects a failed write and still runs the next one", async () => {
    const store = new FakeFirestore();
    store.failingWrites = 1;
    const recorder = createIssueRecorder(store);

    const results = await Promise.allSettled([recorder.record(issue("A")), recorder.record(issue("A"))]);

    expect(results.map(({status}) => status)).toStrictEqual(["rejected", "fulfilled"]);
    expect(store.writes.map(({data}) => data?.["message"])).toStrictEqual(["A"]);
  });
});

describe("documentIssueId", () => {
  it("keeps the Typesense collection and document path readable", () => {
    expect(documentIssueId(issueTarget("books_v1/x", "users/u1/books/b1"))).toBe("books_v1%2Fx:users%2Fu1%2Fbooks%2Fb1");
  });

  it("hashes an ID Firestore would reject", () => {
    expect(documentIssueId(issueTarget("__books", "books/b1__"))).toMatch(/^sha256-[0-9a-f]{64}$/);
    expect(documentIssueId(issueTarget("books", `books/${"x".repeat(1600)}`))).toMatch(/^sha256-[0-9a-f]{64}$/);
  });
});

function issueTarget(typesenseCollection: string, path: string): {readonly typesenseCollection: string; readonly documentPath: NonNullable<ReturnType<typeof parseDocumentPath>>} {
  const documentPath = parseDocumentPath(path);
  if (documentPath === undefined) throw new Error(`Invalid test path ${path}`);
  return {typesenseCollection, documentPath};
}
