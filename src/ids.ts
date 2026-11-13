import type {Brand} from "./brand.js";
import {err, ok, type Result} from "./result.js";

export type TypesenseDocumentId = Brand<string, "TypesenseDocumentId">;

function isTypesenseDocumentId(value: string): value is TypesenseDocumentId {
  return value.trim() !== "";
}

export function describeValue(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (Array.isArray(value)) return "an array";
  if (typeof value === "object") return "an object";
  if (typeof value === "string") return `string ${JSON.stringify(value)}`;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return `${typeof value} ${String(value)}`;
  return `a ${typeof value}`;
}

export function parseTypesenseDocumentId(value: unknown): Result<TypesenseDocumentId, string> {
  if (typeof value !== "string") return err(`must be a string, got ${describeValue(value)}`);
  if (!isTypesenseDocumentId(value)) return err("must not be empty");
  return ok(value);
}
