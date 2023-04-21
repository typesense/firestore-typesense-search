const admin = require("firebase-admin");
const flat = require("flat");
const config = require("./config");

const mapValue = (value) => {
  if (value instanceof admin.firestore.Timestamp) {
    // convert date to Unix timestamp
    // https://typesense.org/docs/0.22.2/api/collections.html#indexing-dates
    return Math.floor(value.toDate().getTime() / 1000);
  } else if (value instanceof admin.firestore.GeoPoint) {
    return [value.latitude, value.longitude];
  } else if (value instanceof admin.firestore.DocumentReference) {
    return {"path": value.path};
  } else if (Array.isArray(value)) {
    return value.map(mapValue);
  } else if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, value]) => [key, mapValue(value)]));
  } else {
    return value;
  }
};

/**
 * @param {DocumentSnapshot} firestoreDocumentSnapshot
 * @param {Map<string,string>} fieldsToExtract
 * @return {Object} typesenseDocument
 */
exports.typesenseDocumentFromSnapshot = (
    firestoreDocumentSnapshot,
    fieldsToExtract = config.firestoreCollectionFields,
) => {
  const data = firestoreDocumentSnapshot.data();

  let entries = Object.entries(data);

  if (fieldsToExtract.size) {
    entries = entries.filter(([key]) => fieldsToExtract.has(key));
  }

  // Build a document with just the fields requested by the user, and mapped from Firestore types to Typesense types
  const mappedDocument = Object.fromEntries(entries.map(([key, value]) => [fieldsToExtract.get(key), mapValue(value)]));

  // using flat to flatten nested objects for older versions of Typesense that did not support nested fields
  // https://typesense.org/docs/0.22.2/api/collections.html#indexing-nested-fields
  const typesenseDocument = config.shouldFlattenNestedDocuments ?
    flat(mappedDocument, {safe: true}) :
    mappedDocument;

  typesenseDocument.id = firestoreDocumentSnapshot.id;

  return typesenseDocument;
};
