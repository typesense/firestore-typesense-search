import {describe, expectTypeOf, it} from "vitest";
import {matchCollection, type DocumentContext} from "../../src/collection.js";
import type {TypesenseDocumentId} from "../../src/ids.js";
import type {SyncIssue} from "../../src/issues.js";
import type {CollectionPath, DocumentPath} from "../../src/paths.js";
import type {SyncPlan, WritePlan} from "../../src/plan.js";

describe("branded types", () => {
  it("keep Firestore IDs and paths apart from Typesense document IDs", () => {
    expectTypeOf<string>().not.toExtend<TypesenseDocumentId>();
    expectTypeOf<DocumentContext["docId"]>().not.toExtend<TypesenseDocumentId>();
    expectTypeOf<DocumentPath>().not.toExtend<TypesenseDocumentId>();
    expectTypeOf<TypesenseDocumentId>().not.toExtend<DocumentPath>();
  });

  it("keep document paths apart from collection paths", () => {
    expectTypeOf<string>().not.toExtend<DocumentPath>();
    expectTypeOf<CollectionPath>().not.toExtend<DocumentPath>();
    expectTypeOf<DocumentPath>().not.toExtend<CollectionPath>();
  });

  it("can still be read as strings", () => {
    expectTypeOf<TypesenseDocumentId>().toExtend<string>();
    expectTypeOf<DocumentPath>().toExtend<string>();
    expectTypeOf<CollectionPath>().toExtend<string>();
  });

  it("are what the planner and the issue writer take", () => {
    expectTypeOf(matchCollection).parameter(1).toEqualTypeOf<DocumentPath>();
    expectTypeOf<Extract<WritePlan, {kind: "delete"}>["id"]>().toEqualTypeOf<TypesenseDocumentId>();
    expectTypeOf<Extract<SyncPlan, {kind: "upsert"}>["staleId"]>().toEqualTypeOf<TypesenseDocumentId | undefined>();
    expectTypeOf<Extract<SyncIssue, {stage: "typesense"}>["target"]["documentPath"]>().toEqualTypeOf<DocumentPath>();
  });
});

describe("unions", () => {
  it("name every case a switch has to handle", () => {
    expectTypeOf<WritePlan["kind"]>().toEqualTypeOf<"skip" | "reject" | "delete" | "sync">();
    expectTypeOf<SyncPlan["kind"]>().toEqualTypeOf<"none" | "remove" | "reject" | "upsert">();
    expectTypeOf<SyncIssue["stage"]>().toEqualTypeOf<"schema" | "indexIf" | "id" | "document" | "lookup" | "typesense" | "config">();
  });
});
