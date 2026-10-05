import {warn} from "firebase-functions/logger";
import {getCollectionConfigMode} from "./config.js";

let hasLoggedConfigWarning = false;

export function warnIfUsingLegacyCollectionConfig(): void {
  if (hasLoggedConfigWarning) return;

  const mode = getCollectionConfigMode();

  if (mode === "both") {
    warn(
      "Both legacy and multi-collection params are set. Using the multi-collection params and ignoring " +
        "FIRESTORE_COLLECTION_PATH, FIRESTORE_COLLECTION_FIELDS, TYPESENSE_COLLECTION_NAME, and FLATTEN_NESTED_DOCUMENTS. " +
        "Please remove the legacy params from your configuration.",
    );
    hasLoggedConfigWarning = true;
    return;
  }

  if (mode === "legacy") {
    warn(
      "The legacy single-collection params FIRESTORE_COLLECTION_PATH, FIRESTORE_COLLECTION_FIELDS, " +
        "TYPESENSE_COLLECTION_NAME, and FLATTEN_NESTED_DOCUMENTS are deprecated and will be removed in a future major release. " +
        "Please migrate to FIRESTORE_COLLECTION_PATHS, FIRESTORE_COLLECTION_FIELDS_LIST, TYPESENSE_COLLECTION_NAMES, and FLATTEN_NESTED_DOCUMENTS_LIST.",
    );
    hasLoggedConfigWarning = true;
  }
}
