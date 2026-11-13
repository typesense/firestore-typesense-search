import {getFirestore} from "firebase-admin/firestore";
import type {Client} from "typesense";
import type {ResolvedCollection} from "./collection.js";
import {formatConfigProblems, parseCollectionConfigs, parseConnection, resolveEnvCollection, type ConfigProblem, type Env} from "./config.js";
import {getDefaultApp} from "./firebaseApp.js";
import {createIssueRecorder, type ConfigIssue, type IssueRecorder} from "./issues.js";
import * as params from "./params.js";
import {err, ok, type Result} from "./result.js";
import type {KitFirestore} from "./store.js";
import {createTypesenseClient, type ConfigurationOptions} from "./typesenseClient.js";

export interface ReadyRuntime {
  readonly collections: readonly ResolvedCollection[];
  readonly typesense: Client;
  readonly logInserts: boolean;
}

export interface Runtime {
  readonly ready: Result<ReadyRuntime, ConfigIssue>;
  readonly firestore: KitFirestore;
  readonly issues: IssueRecorder;
}

export interface RuntimeOptions {
  readonly env: Env;
  readonly firestore: KitFirestore;
  readonly typesense?: Partial<ConfigurationOptions>;
}

function configIssue(problems: readonly ConfigProblem[]): ConfigIssue {
  return {
    stage: "config",
    message: "The kit's configuration is invalid, so no documents are being indexed. Fix the kit's .env and deploy again.",
    problems: formatConfigProblems(problems),
  };
}

export function createRuntime({env, firestore, typesense = {}}: RuntimeOptions): Runtime {
  const collections = parseCollectionConfigs(env);
  const connection = parseConnection(env);
  const ready: Result<ReadyRuntime, ConfigIssue> =
    collections.ok && connection.ok
      ? ok({
          collections: collections.value.map(resolveEnvCollection),
          typesense: createTypesenseClient({...connection.value, ...typesense}),
          logInserts: env["LOG_TYPESENSE_INSERTS"] === "true",
        })
      : err(configIssue([...(collections.ok ? [] : collections.error), ...(connection.ok ? [] : connection.error)]));
  return {ready, firestore, issues: createIssueRecorder(firestore)};
}

let instance: Runtime | undefined;

export function getRuntime(): Runtime {
  instance ??= createRuntime({env: process.env, firestore: getFirestore(getDefaultApp(), params.database.value())});
  return instance;
}

export function resetRuntime(): void {
  instance = undefined;
}
