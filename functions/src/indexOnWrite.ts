import {onDocumentWritten} from "firebase-functions/firestore";
import {debug, info} from "firebase-functions/logger";
import {Errors} from "typesense";
import {createCollectionConfigMap, getTypesenseConnectionConfig, shouldLogTypesenseInserts, type CollectionConfig} from "./config.js";
import {createTypesenseDocument, type DocumentSnapshotLike} from "./document.js";
import {getDefaultApp} from "./firebaseApp.js";
import * as params from "./params.js";
import {pathMatchesSelector, type PathParams} from "./paths.js";
import {createTypesenseClient} from "./typesenseClient.js";

interface DocumentRefLike {
  readonly path: string;
  get(): Promise<DocumentSnapshotLike>;
}

interface WrittenSnapshotLike {
  readonly exists: boolean;
  readonly id: string;
  readonly ref: DocumentRefLike;
}

export interface DocumentChangeLike {
  readonly before: WrittenSnapshotLike;
  readonly after: WrittenSnapshotLike;
}

interface MatchedCollection {
  readonly config: CollectionConfig;
  readonly pathParams: PathParams;
}

function findCollectionForDocumentPath(documentPath: string): MatchedCollection | undefined {
  for (const config of Object.values(createCollectionConfigMap())) {
    const pathParams = pathMatchesSelector(documentPath, config.firestorePath);
    if (pathParams !== null) return {config, pathParams};
  }
  return undefined;
}

export async function handleDocumentWrite(change: DocumentChangeLike): Promise<void> {
  const documentPath = change.after.ref.path || change.before.ref.path;
  const matched = findCollectionForDocumentPath(documentPath);
  if (matched === undefined) {
    debug(`Skipping write for unconfigured document path: ${documentPath}`);
    return;
  }

  const {config, pathParams} = matched;
  info(`Processing document in collection: ${config.firestorePath} with ID: ${change.after.id || change.before.id}`);

  const typesense = createTypesenseClient(getTypesenseConnectionConfig());
  const collection = typesense.collections(config.typesenseCollection);

  if (!change.after.exists) {
    const documentId = change.before.id;
    debug(`Deleting document ${documentId} from collection ${config.typesenseCollection}`);
    try {
      await collection.documents(documentId).delete();
    } catch (err: unknown) {
      if (err instanceof Errors.ObjectNotFound) {
        debug(`Document ${documentId} was not in collection ${config.typesenseCollection}; nothing to delete`);
        return;
      }
      throw err;
    }
    return;
  }

  const latestSnapshot = await change.after.ref.get();
  const typesenseDocument = createTypesenseDocument(latestSnapshot, config, pathParams);

  if (shouldLogTypesenseInserts()) {
    debug(`Upserting document ${JSON.stringify(typesenseDocument)} to collection ${config.typesenseCollection}`);
  } else {
    debug(`Upserting document ${typesenseDocument.id} to collection ${config.typesenseCollection}`);
  }

  await collection.documents().upsert(typesenseDocument);
}

export const indexOnWrite = onDocumentWritten(
  {
    document: "{path=**}/{documentID}",
    database: params.database,
    region: params.location,
    timeoutSeconds: 540,
    secrets: [params.typesenseApiKey],
  },
  async (event) => {
    if (event.data === undefined) {
      debug("No change data in event, returning");
      return;
    }
    getDefaultApp();
    await handleDocumentWrite(event.data);
  },
);
