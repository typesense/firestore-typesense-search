import type {CollectionConfig} from "./config.js";
import type {PathParams} from "./paths.js";

export type TypesenseFieldValue = string | number | boolean | null | TypesenseFieldValue[] | {[key: string]: TypesenseFieldValue};

export interface TypesenseDocument {
  id: string;
  [field: string]: TypesenseFieldValue;
}

/** Runs last, on every document sent to Typesense: backfill and writes alike. */
export type DocumentMapper = (document: TypesenseDocument, typesenseCollection: string) => TypesenseDocument;

let documentMapper: DocumentMapper = (document) => document;

export function setDocumentMapper(mapper: DocumentMapper): void {
  documentMapper = mapper;
}

export interface DocumentSnapshotLike {
  readonly id: string;
  data(): unknown;
}

type MappedValue = string | number | boolean | null | undefined | MappedValue[] | MappedObject;
interface MappedObject {
  [key: string]: MappedValue;
}

type Container = Record<string, unknown> | unknown[];

interface TimestampLike {
  readonly seconds: unknown;
  readonly nanoseconds: unknown;
  toDate(): unknown;
}

function isObjectLike(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function isContainer(value: unknown): value is Container {
  return typeof value === "object" && value !== null;
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function isMappedArray(value: MappedValue): value is MappedValue[] {
  return Array.isArray(value);
}

function isTimestampLike(value: Readonly<Record<string, unknown>>): value is Readonly<Record<string, unknown>> & TimestampLike {
  return value["seconds"] != null && value["nanoseconds"] != null && typeof value["toDate"] === "function";
}

function isIntegerKey(key: string): boolean {
  return Number.isInteger(Number(key));
}

function childOf(value: unknown, key: string): unknown {
  return isObjectLike(value) ? value[key] : undefined;
}

function mappedChildOf(value: MappedValue, key: string): MappedValue {
  if (isMappedArray(value)) return isIntegerKey(key) ? value[Number(key)] : undefined;
  if (typeof value === "object" && value !== null) return value[key];
  return undefined;
}

function setChild(container: Container, key: string, value: unknown): void {
  if (Array.isArray(container)) {
    if (isIntegerKey(key)) container[Number(key)] = value;
    return;
  }
  container[key] = value;
}

export function mapValue(value: unknown): MappedValue {
  if (isUnknownArray(value)) {
    return value.map(mapValue);
  }

  if (isObjectLike(value)) {
    if (isTimestampLike(value)) {
      // convert date to Unix timestamp
      // https://typesense.org/docs/0.22.2/api/collections.html#indexing-dates
      const date = value.toDate();
      if (date instanceof Date) return Math.floor(date.getTime() / 1000);
    }

    const latitude = value["latitude"] ?? value["lat"];
    const longitude = value["longitude"] ?? value["lng"];
    const keyCount = Object.keys(value).length;
    const hasGeohashField = value["geohash"] != null && keyCount === 3;
    if (latitude != null && longitude != null && (keyCount === 2 || hasGeohashField)) {
      return [mapValue(latitude), mapValue(longitude)];
    }

    const path = value["path"];
    if (value["firestore"] != null && path != null) {
      return {path: mapValue(path)};
    }

    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, mapValue(nested)]));
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }
  return undefined;
}

function getNestedValue(data: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (current === undefined) return undefined;
    if (isUnknownArray(current)) {
      return isIntegerKey(key) ? current[Number(key)] : current.map((item) => ({[key]: childOf(item, key)}));
    }
    return childOf(current, key);
  }, data);
}

function setNestedValue(target: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split(".");
  let container: Container = target;

  for (const [index, key] of keys.entries()) {
    const nextKey = keys[index + 1];
    if (nextKey === undefined) {
      setChild(container, key, value);
      return;
    }

    let next = childOf(container, key);
    if (next === undefined) {
      next = isIntegerKey(nextKey) ? [] : {};
      setChild(container, key, next);
    }
    if (!isContainer(next)) return;
    container = next;
  }
}

function mergeArrays(arrays: readonly (readonly unknown[])[]): Record<string, unknown>[] {
  const maxLength = Math.max(...arrays.map((array) => array.length));
  return Array.from({length: maxLength}, (_, index) => {
    const merged: Record<string, unknown> = {};
    for (const array of arrays) {
      const item = array[index];
      if (isObjectLike(item)) Object.assign(merged, item);
    }
    return merged;
  });
}

export function extractField(data: unknown, acc: Record<string, unknown>, field: string): Record<string, unknown> {
  const value = getNestedValue(data, field);
  if (value === undefined) return acc;

  const [topLevelField = field] = field.split(".");
  if (isUnknownArray(value) && typeof value[0] === "object") {
    const existing = acc[topLevelField];
    return {...acc, [topLevelField]: isUnknownArray(existing) ? mergeArrays([existing, value]) : value};
  }

  setNestedValue(acc, field, value);
  return acc;
}

export function flattenDocument(obj: MappedObject, prefix = ""): MappedObject {
  const result: MappedObject = {};

  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value !== "object" || value === null) {
      result[newKey] = value;
      continue;
    }

    if (isMappedArray(value)) {
      const first = value[0];
      if (typeof first !== "object" || first === null) {
        result[newKey] = value;
        continue;
      }
      for (const subKey of Object.keys(first)) {
        result[`${newKey}.${subKey}`] = value.map((item) => mappedChildOf(item, subKey)).filter((item) => item !== undefined);
      }
      continue;
    }

    Object.assign(result, flattenDocument(value, newKey));
  }

  return result;
}

function toFieldValue(value: MappedValue): TypesenseFieldValue | undefined {
  if (value === undefined) return undefined;
  if (isMappedArray(value)) return value.map((item) => toFieldValue(item) ?? null);
  if (typeof value === "object" && value !== null) return toFieldObject(value);
  return value;
}

function toFieldObject(obj: MappedObject): Record<string, TypesenseFieldValue> {
  const result: Record<string, TypesenseFieldValue> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fieldValue = toFieldValue(value);
    if (fieldValue !== undefined) result[key] = fieldValue;
  }
  return result;
}

export function createTypesenseDocument(
  snapshot: DocumentSnapshotLike,
  collectionConfig: Pick<CollectionConfig, "typesenseCollection" | "fields" | "flattenNested">,
  contextParams: PathParams,
): TypesenseDocument {
  const data = snapshot.data();
  if (!isObjectLike(data)) {
    throw new Error("Document data is null");
  }

  const extracted = collectionConfig.fields.length === 0 ? data : collectionConfig.fields.reduce<Record<string, unknown>>((acc, field) => extractField(data, acc, field), {});
  const mapped: MappedObject = Object.fromEntries(Object.entries(extracted).map(([key, value]) => [key, mapValue(value)]));

  // using flat to flatten nested objects for older versions of Typesense that did not support nested fields
  // https://typesense.org/docs/0.22.2/api/collections.html#indexing-nested-fields
  const shaped = collectionConfig.flattenNested ? flattenDocument(mapped) : mapped;

  const typesenseDocument: TypesenseDocument = {...toFieldObject(shaped), id: snapshot.id};
  for (const [key, value] of Object.entries(contextParams)) {
    if (key !== "docId") typesenseDocument[key] = value;
  }
  return documentMapper(typesenseDocument, collectionConfig.typesenseCollection);
}
