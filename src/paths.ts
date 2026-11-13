import type {Brand} from "./brand.js";
import {err, ok, type Result} from "./result.js";

export type PathParams = Readonly<Record<string, string>>;
export type DocumentPath = Brand<string, "DocumentPath">;
export type CollectionPath = Brand<string, "CollectionPath">;

export const KIT_STATE_COLLECTION = "typesense_sync";

const PLACEHOLDER = /^{([^}]+)}$/;

function segmentsOf(path: string): string[] {
  return path.split("/").filter((segment) => segment !== "");
}

function isDocumentPath(path: string): path is DocumentPath {
  const count = segmentsOf(path).length;
  return count > 0 && count % 2 === 0;
}

function isCollectionPath(path: string): path is CollectionPath {
  return segmentsOf(path).length % 2 === 1;
}

export function parseDocumentPath(path: string): DocumentPath | undefined {
  return isDocumentPath(path) ? path : undefined;
}

export function documentIdOf(path: DocumentPath): string {
  return segmentsOf(path).at(-1) ?? path;
}

export function isUnderKitState(path: string): boolean {
  return segmentsOf(path)[0] === KIT_STATE_COLLECTION;
}

export function parseFirestorePath(firestorePath: string | null | undefined): Readonly<Record<string, number>> {
  if (!firestorePath) {
    throw new Error("Invalid Firestore path: Path must be a non-empty string.");
  }

  const placeholders: Record<string, number> = {};
  segmentsOf(firestorePath).forEach((segment, index) => {
    const varName = PLACEHOLDER.exec(segment)?.[1];
    if (varName === undefined) return;
    if (Object.hasOwn(placeholders, varName)) {
      throw new Error(`Duplicate placeholder detected: ${varName}`);
    }
    placeholders[varName] = index;
  });
  return placeholders;
}

export function parseCollectionPath(path: string): Result<CollectionPath, string> {
  if (!isCollectionPath(path)) {
    return err(segmentsOf(path).length === 0 ? "is empty" : "points to a document, not a collection. A collection path has an odd number of segments, such as users or users/{userId}/books");
  }
  const names = segmentsOf(path).flatMap((segment) => PLACEHOLDER.exec(segment)?.[1] ?? []);
  const duplicate = names.find((name, index) => names.indexOf(name) !== index);
  if (duplicate !== undefined) return err(`uses the placeholder {${duplicate}} more than once`);
  return ok(path);
}

export function pathMatchesSelector(path: string | null | undefined, selector: string | null | undefined): PathParams | null {
  if (!path) {
    throw new Error("Invalid path: Path must be a non-empty string.");
  }
  if (!selector) {
    throw new Error("Invalid selector: Selector must be a non-empty string.");
  }

  const pathSegments = segmentsOf(path);
  const selectorSegments = segmentsOf(selector);
  if (pathSegments.length < selectorSegments.length) {
    return null;
  }

  const extracted: Record<string, string> = {};
  for (const [index, selectorSegment] of selectorSegments.entries()) {
    const pathSegment = pathSegments[index];
    if (pathSegment === undefined) return null;

    if (selectorSegment.startsWith("{") && selectorSegment.endsWith("}")) {
      extracted[selectorSegment.slice(1, -1)] = pathSegment;
    } else if (selectorSegment !== pathSegment) {
      return null;
    }
  }
  return extracted;
}

export function matchDocumentPath(documentPath: string, collectionPath: string): PathParams | null {
  const pathParams = pathMatchesSelector(documentPath, collectionPath);
  if (pathParams === null || segmentsOf(documentPath).length !== segmentsOf(collectionPath).length + 1) return null;
  return pathParams;
}
