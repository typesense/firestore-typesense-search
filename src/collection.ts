import {describeValue, parseTypesenseDocumentId, type TypesenseDocumentId} from "./ids.js";
import {documentIdOf, isUnderKitState, matchDocumentPath, type CollectionPath, type DocumentPath, type PathParams} from "./paths.js";
import {err, ok, type Result} from "./result.js";

export type FirestoreData = Readonly<Record<string, unknown>>;
export type DocumentBody = Readonly<Record<string, unknown>>;
export type Consistency = "reread" | "event";

export interface DocumentContext {
  readonly documentPath: DocumentPath;
  readonly docId: string;
  readonly params: PathParams;
}

export interface SchemaProblem {
  readonly path: string;
  readonly message: string;
}

export type HookStage = "indexIf" | "id" | "document" | "lookup";

export type DocumentFailure =
  | {readonly stage: "schema"; readonly message: string; readonly problems: readonly SchemaProblem[]}
  | {readonly stage: HookStage; readonly message: string; readonly error: string}
  | {readonly stage: "typesense"; readonly message: string; readonly httpStatus: number | null; readonly response: string; readonly transient: boolean};

export interface CollectionSpec<Data> {
  readonly path: CollectionPath;
  readonly typesenseCollection: string;
  readonly consistency: Consistency;
  readonly project: (data: FirestoreData) => FirestoreData;
  readonly validate: (projection: FirestoreData) => Result<Data, readonly SchemaProblem[]>;
  readonly indexIf: (data: Data, context: DocumentContext) => boolean;
  readonly id: (data: Data, context: DocumentContext) => string;
  readonly document: (data: Data, context: DocumentContext) => DocumentBody | Promise<DocumentBody>;
}

export type BuildResult = Result<DocumentBody, DocumentFailure>;

export type Evaluation =
  | {readonly kind: "rejected"; readonly failure: DocumentFailure}
  | {readonly kind: "excluded"}
  | {readonly kind: "included"; readonly id: TypesenseDocumentId; readonly build: () => Promise<BuildResult>};

export interface ResolvedCollection {
  readonly path: CollectionPath;
  readonly typesenseCollection: string;
  readonly consistency: Consistency;
  readonly project: (data: FirestoreData) => FirestoreData;
  readonly evaluate: (projection: FirestoreData, context: DocumentContext) => Evaluation;
}

export interface CollectionMatch {
  readonly collection: ResolvedCollection;
  readonly context: DocumentContext;
}

export function isFirestoreData(value: unknown): value is FirestoreData {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function hookFailure(stage: HookStage, error: unknown): DocumentFailure {
  const text = errorText(error);
  return {stage, message: `${stage} threw: ${text}`, error: text};
}

function attempt<T>(stage: HookStage, run: () => T): Result<T, DocumentFailure> {
  try {
    return ok(run());
  } catch (error: unknown) {
    return err(hookFailure(stage, error));
  }
}

function schemaFailure(problems: readonly SchemaProblem[]): DocumentFailure {
  const listed = problems.map(({path, message}) => (path === "" ? message : `${path}: ${message}`)).join("; ");
  return {stage: "schema", message: `The document does not match the collection schema: ${listed}`, problems};
}

function validateProjection<Data>(spec: CollectionSpec<Data>, projection: FirestoreData): Result<Data, DocumentFailure> {
  try {
    const validated = spec.validate(projection);
    return validated.ok ? validated : err(schemaFailure(validated.error));
  } catch (error: unknown) {
    const text = errorText(error);
    return err({stage: "schema", message: `The schema validation threw: ${text}`, problems: [{path: "", message: text}]});
  }
}

async function buildDocument<Data>(spec: CollectionSpec<Data>, data: Data, context: DocumentContext): Promise<BuildResult> {
  try {
    const body: unknown = await spec.document(data, context);
    if (isFirestoreData(body)) return ok(body);
    const text = `returned ${describeValue(body)} instead of an object`;
    return err({stage: "document", message: `document ${text}`, error: text});
  } catch (error: unknown) {
    return err(hookFailure("document", error));
  }
}

export function resolveCollection<Data>(spec: CollectionSpec<Data>): ResolvedCollection {
  return {
    path: spec.path,
    typesenseCollection: spec.typesenseCollection,
    consistency: spec.consistency,
    project: spec.project,
    evaluate: (projection, context) => {
      const validated = validateProjection(spec, projection);
      if (!validated.ok) return {kind: "rejected", failure: validated.error};
      const data = validated.value;

      const included = attempt("indexIf", () => spec.indexIf(data, context));
      if (!included.ok) return {kind: "rejected", failure: included.error};
      if (!included.value) return {kind: "excluded"};

      const returned = attempt("id", () => spec.id(data, context));
      if (!returned.ok) return {kind: "rejected", failure: returned.error};
      const id = parseTypesenseDocumentId(returned.value);
      if (!id.ok) return {kind: "rejected", failure: {stage: "id", message: `id returned an invalid Typesense document ID: it ${id.error}`, error: id.error}};

      return {kind: "included", id: id.value, build: () => buildDocument(spec, data, context)};
    },
  };
}

export function matchCollection(collections: readonly ResolvedCollection[], documentPath: DocumentPath): CollectionMatch | undefined {
  if (isUnderKitState(documentPath)) return undefined;
  for (const collection of collections) {
    const params = matchDocumentPath(documentPath, collection.path);
    if (params !== null) return {collection, context: {documentPath, docId: documentIdOf(documentPath), params}};
  }
  return undefined;
}
