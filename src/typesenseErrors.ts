import {Errors} from "typesense";
import type {DocumentFailure} from "./collection.js";

const TRANSIENT_CLIENT_STATUSES: ReadonlySet<number> = new Set([408, 429]);
const SERVER_SAID = " | Server said: ";

export type TypesenseFailure = Extract<DocumentFailure, {readonly stage: "typesense"}>;

function serverMessageOf(message: string): string {
  const index = message.indexOf(SERVER_SAID);
  return index === -1 ? message : message.slice(index + SERVER_SAID.length);
}

function describeRejection(httpStatus: number, typesenseCollection: string, response: string): string {
  if (httpStatus === 401 || httpStatus === 403) {
    return `Typesense refused the API key (HTTP ${httpStatus}). Check that the TYPESENSE_API_KEY secret is an admin key for this cluster.`;
  }
  if (httpStatus === 404) {
    return `Typesense has no collection named "${typesenseCollection}" (HTTP 404). Create it, or fix TYPESENSE_COLLECTION_NAMES.`;
  }
  return `Typesense rejected the document (HTTP ${httpStatus}): ${response}`;
}

export function deterministicFailure(error: unknown, typesenseCollection: string): TypesenseFailure | undefined {
  if (!(error instanceof Errors.TypesenseError)) return undefined;
  const {httpStatus} = error;
  if (httpStatus === undefined || httpStatus < 400 || httpStatus >= 500 || TRANSIENT_CLIENT_STATUSES.has(httpStatus)) return undefined;
  const response = serverMessageOf(error.message);
  return {stage: "typesense", httpStatus, response, transient: false, message: describeRejection(httpStatus, typesenseCollection, response)};
}

function transientFailure(error: unknown, change: string): TypesenseFailure {
  const httpStatus = error instanceof Errors.TypesenseError ? (error.httpStatus ?? null) : null;
  const response = error instanceof Error ? serverMessageOf(error.message) : String(error);
  const reason = httpStatus === null ? response : `HTTP ${httpStatus}: ${response}`;
  return {stage: "typesense", httpStatus, response, transient: true, message: `Typesense could not be reached or failed temporarily (${reason}), so the kit could not ${change}.`};
}

export async function attemptTypesense(typesenseCollection: string, change: string, request: () => Promise<unknown>): Promise<TypesenseFailure | undefined> {
  try {
    await request();
    return undefined;
  } catch (error: unknown) {
    return deterministicFailure(error, typesenseCollection) ?? transientFailure(error, change);
  }
}
