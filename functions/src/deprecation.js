const {warn} = require("firebase-functions/logger");
const config = require("./config.js");

let hasLoggedConfigWarning = false;

/**
 * Emit a deprecation warning when the legacy single-collection config is active.
 * The warning is logged once per function instance.
 */
function warnIfUsingLegacyCollectionConfig() {
  if (hasLoggedConfigWarning) {
    return;
  }

  const mode = config.getCollectionConfigMode();

  if (mode === "none") {
    return;
  }

  if (mode === "both") {
    warn(
      "Both legacy and multi-collection params are set. Using the multi-collection params and ignoring " +
        "FIRESTORE_COLLECTION_PATH, FIRESTORE_COLLECTION_FIELDS, TYPESENSE_COLLECTION_NAME, and FLATTEN_NESTED_DOCUMENTS. " +
        "Please remove the legacy params from this extension install.",
    );
    hasLoggedConfigWarning = true;
    return;
  }

  if (mode === "legacy") {
    warn(
      "The legacy single-collection extension params FIRESTORE_COLLECTION_PATH, FIRESTORE_COLLECTION_FIELDS, " +
        "TYPESENSE_COLLECTION_NAME, and FLATTEN_NESTED_DOCUMENTS are deprecated and will be removed in a future major release. " +
        "Please migrate to FIRESTORE_COLLECTION_PATHS, FIRESTORE_COLLECTION_FIELDS_LIST, TYPESENSE_COLLECTION_NAMES, and FLATTEN_NESTED_DOCUMENTS_LIST.",
    );
    hasLoggedConfigWarning = true;
  }
}

module.exports = {
  warnIfUsingLegacyCollectionConfig,
};
