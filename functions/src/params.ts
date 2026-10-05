import {defineSecret, defineString, select} from "firebase-functions/params";

const FUNCTION_LOCATIONS: Readonly<Record<string, string>> = {
  "us-central1 (Iowa)": "us-central1",
  "us-east1 (South Carolina)": "us-east1",
  "us-east4 (Northern Virginia)": "us-east4",
  "us-east5 (Columbus)": "us-east5",
  "us-south1 (Dallas)": "us-south1",
  "us-west1 (Oregon)": "us-west1",
  "us-west2 (Los Angeles)": "us-west2",
  "us-west3 (Salt Lake City)": "us-west3",
  "us-west4 (Las Vegas)": "us-west4",
  "northamerica-northeast1 (Montreal)": "northamerica-northeast1",
  "northamerica-northeast2 (Toronto)": "northamerica-northeast2",
  "southamerica-east1 (Sao Paulo)": "southamerica-east1",
  "southamerica-west1 (Santiago)": "southamerica-west1",
  "europe-north1 (Finland)": "europe-north1",
  "europe-west1 (Belgium)": "europe-west1",
  "europe-west2 (London)": "europe-west2",
  "europe-west3 (Frankfurt)": "europe-west3",
  "europe-west4 (Netherlands)": "europe-west4",
  "europe-west6 (Zurich)": "europe-west6",
  "europe-west8 (Milan)": "europe-west8",
  "europe-west9 (Paris)": "europe-west9",
  "europe-west10 (Berlin)": "europe-west10",
  "europe-west12 (Turin)": "europe-west12",
  "europe-central2 (Warsaw)": "europe-central2",
  "europe-southwest1 (Madrid)": "europe-southwest1",
  "me-central1 (Doha)": "me-central1",
  "me-central2 (Dammam)": "me-central2",
  "me-west1 (Tel Aviv)": "me-west1",
  "asia-east1 (Taiwan)": "asia-east1",
  "asia-east2 (Hong Kong)": "asia-east2",
  "asia-northeast1 (Tokyo)": "asia-northeast1",
  "asia-northeast2 (Osaka)": "asia-northeast2",
  "asia-northeast3 (Seoul)": "asia-northeast3",
  "asia-south1 (Mumbai)": "asia-south1",
  "asia-south2 (Delhi)": "asia-south2",
  "asia-southeast1 (Singapore)": "asia-southeast1",
  "asia-southeast2 (Jakarta)": "asia-southeast2",
  "australia-southeast1 (Sydney)": "australia-southeast1",
  "australia-southeast2 (Melbourne)": "australia-southeast2",
};

const FIRESTORE_LOCATIONS: Readonly<Record<string, string>> = {
  "nam5 (US multi-region)": "nam5",
  "eur3 (Europe multi-region)": "eur3",
  "us-central1 (Iowa)": "us-central1",
  "us-west1 (Oregon)": "us-west1",
  "us-west2 (Los Angeles)": "us-west2",
  "us-west3 (Salt Lake City)": "us-west3",
  "us-west4 (Las Vegas)": "us-west4",
  "us-east1 (South Carolina)": "us-east1",
  "us-east4 (Northern Virginia)": "us-east4",
  "us-east5 (Columbus)": "us-east5",
  "us-south1 (Dallas)": "us-south1",
  "northamerica-northeast1 (Montreal)": "northamerica-northeast1",
  "northamerica-northeast2 (Toronto)": "northamerica-northeast2",
  "northamerica-south1 (Queretaro)": "northamerica-south1",
  "southamerica-east1 (São Paulo)": "southamerica-east1",
  "southamerica-west1 (Santiago)": "southamerica-west1",
  "europe-west1 (Belgium)": "europe-west1",
  "europe-west2 (London)": "europe-west2",
  "europe-west3 (Frankfurt)": "europe-west3",
  "europe-west4 (Netherlands)": "europe-west4",
  "europe-west6 (Zürich)": "europe-west6",
  "europe-west8 (Milan)": "europe-west8",
  "europe-west9 (Paris)": "europe-west9",
  "europe-west10 (Berlin)": "europe-west10",
  "europe-west12 (Turin)": "europe-west12",
  "europe-central2 (Warsaw)": "europe-central2",
  "europe-north1 (Finland)": "europe-north1",
  "europe-north2 (Stockholm)": "europe-north2",
  "europe-southwest1 (Madrid)": "europe-southwest1",
  "me-central1 (Doha)": "me-central1",
  "me-central2 (Dammam)": "me-central2",
  "me-west1 (Tel Aviv)": "me-west1",
  "asia-east1 (Taiwan)": "asia-east1",
  "asia-east2 (Hong Kong)": "asia-east2",
  "asia-northeast1 (Tokyo)": "asia-northeast1",
  "asia-northeast2 (Osaka)": "asia-northeast2",
  "asia-northeast3 (Seoul)": "asia-northeast3",
  "asia-south1 (Mumbai)": "asia-south1",
  "asia-south2 (Delhi)": "asia-south2",
  "asia-southeast1 (Singapore)": "asia-southeast1",
  "asia-southeast2 (Jakarta)": "asia-southeast2",
  "australia-southeast1 (Sydney)": "australia-southeast1",
  "australia-southeast2 (Melbourne)": "australia-southeast2",
  "africa-south1 (Johannesburg)": "africa-south1",
};

const YES_NO: Readonly<Record<string, string>> = {No: "false", Yes: "true"};

export const location = defineString("LOCATION", {
  label: "Cloud Functions location",
  description: "Where do you want to deploy the functions? For optimal performance, select a location close to your Firestore database region.",
  input: select(FUNCTION_LOCATIONS),
  default: "us-central1",
});

export const firestoreDatabaseRegion = defineString("FIRESTORE_DATABASE_REGION", {
  label: "Firestore Database region",
  description: "The region where your Firestore database is located.",
  input: select(FIRESTORE_LOCATIONS),
  default: "nam5",
});

export const database = defineString("DATABASE", {
  label: "Firestore Database",
  description: 'The Firestore database to use. Use "(default)" for the default database.',
  input: {text: {example: "(default)"}},
  default: "(default)",
});

export const firestoreCollectionPath = defineString("FIRESTORE_COLLECTION_PATH", {
  label: "Firestore Collection Path",
  description: "Legacy single-collection configuration. Use this only if you are syncing one Firestore collection. For new installs, prefer FIRESTORE_COLLECTION_PATHS.",
  input: {
    text: {
      example: "path/to/firestore_collection",
      validationRegex: "^$|^[^/]+(/[^/]+/[^/]+)*$",
      validationErrorMessage: 'Firestore collection paths must be an odd number of segments separated by slashes, e.g. "path/to/firestore_collection".',
    },
  },
  default: "",
});

export const firestoreCollectionFields = defineString("FIRESTORE_COLLECTION_FIELDS", {
  label: "Firestore Collection Fields",
  description: "Legacy comma-separated list of fields to index from a single Firestore collection. Leave blank to index all fields. For new installs, prefer FIRESTORE_COLLECTION_FIELDS_LIST.",
  input: {text: {example: "field1,field2,field3"}},
  default: "",
});

export const typesenseCollectionName = defineString("TYPESENSE_COLLECTION_NAME", {
  label: "Typesense Collection Name",
  description: "Legacy Typesense collection name for a single Firestore collection. For new installs, prefer TYPESENSE_COLLECTION_NAMES.",
  default: "",
});

export const flattenNestedDocuments = defineString("FLATTEN_NESTED_DOCUMENTS", {
  label: "Flatten Nested Documents",
  description: 'Legacy flatten setting for a single Firestore collection. Set to "Yes" for Typesense versions 0.23.1 and earlier. For new installs, prefer FLATTEN_NESTED_DOCUMENTS_LIST.',
  input: select(YES_NO),
  default: "false",
});

export const firestoreCollectionPaths = defineString("FIRESTORE_COLLECTION_PATHS", {
  label: "Firestore Collection Paths",
  description:
    'Comma-separated list of Firestore collection paths to index into Typesense. Supports both regular collections and subcollections with path parameters (e.g., "users/{userId}/books"). For existing single-collection installs, this parameter can be left blank.',
  input: {
    text: {
      example: "users,products,users/{userId}/books,stores/{storeId}/products",
      validationRegex: "^$|^[^,]+(?:,[^,]+)*$",
      validationErrorMessage: "Collection paths must be comma-separated without spaces.",
    },
  },
  default: "",
});

export const typesenseCollectionNames = defineString("TYPESENSE_COLLECTION_NAMES", {
  label: "Typesense Collection Names",
  description:
    "Comma-separated list of Typesense collection names corresponding to the Firestore collection paths. The order must match the FIRESTORE_COLLECTION_PATHS parameter. For existing single-collection installs, this parameter can be left blank.",
  input: {
    text: {
      example: "users,products,user_books,store_products",
      validationRegex: "^$|^[^,]+(?:,[^,]+)*$",
      validationErrorMessage: "Collection names must be comma-separated without spaces.",
    },
  },
  default: "",
});

export const firestoreCollectionFieldsList = defineString("FIRESTORE_COLLECTION_FIELDS_LIST", {
  label: "Firestore Collection Fields List",
  description:
    'Pipe-separated list of comma-separated field lists for each collection. Each field list corresponds to a collection in FIRESTORE_COLLECTION_PATHS. Leave empty or use "||" to skip fields for a collection.',
  input: {text: {example: "name,email,profile|title,description,price||name,email|title,description"}},
  default: "",
});

export const flattenNestedDocumentsList = defineString("FLATTEN_NESTED_DOCUMENTS_LIST", {
  label: "Flatten Nested Documents List",
  description: "Comma-separated list of boolean values indicating whether to flatten nested documents for each collection. Each value corresponds to a collection in FIRESTORE_COLLECTION_PATHS.",
  input: {
    text: {
      example: "false,true,false,true",
      validationRegex: "^$|^(true|false)(,(true|false))*$",
      validationErrorMessage: "Flatten Nested Documents List must be empty or a comma-separated list of true/false values.",
    },
  },
  default: "",
});

export const typesenseHosts = defineString("TYPESENSE_HOSTS", {
  label: "Typesense Hosts",
  description:
    "A comma-separated list of Typesense Hosts. For single node clusters, a single hostname is sufficient. For multi-node Highly Available or SDN Clusters, please be sure to mention all hostnames.",
  input: {
    text: {
      example: "xyz.a1.typesense.net,xyz-1.a1.typesense.net,xyz-2.a1.typesense.net,xyz-3.a1.typesense.net",
      nonEmpty: true,
    },
  },
});

export const typesenseApiKey = defineSecret("TYPESENSE_API_KEY", {
  label: "Typesense API Key",
  description: 'An Typesense API key with admin permissions. Click on "Generate API Key" in cluster dashboard in Typesense Cloud',
});

export const logTypesenseInserts = defineString("LOG_TYPESENSE_INSERTS", {
  label: "Log Typesense Inserts for Debugging",
  description: "Should data inserted into Typesense be logged in Cloud Logging? This can be useful for debugging, but should not be enabled in production.",
  input: select(YES_NO),
  default: "false",
});
