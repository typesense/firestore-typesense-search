const config = require("./config.js");

const mapValue = (value) => {
  if (typeof value === "object" && value !== null && value.seconds != null && value.nanoseconds != null) {
    // convert date to Unix timestamp
    // https://typesense.org/docs/0.22.2/api/collections.html#indexing-dates
    return Math.floor(value.toDate().getTime() / 1000);
  } else if (typeof value === "object" && value !== null && value.latitude != null && value.longitude != null) {
    return [value.latitude, value.longitude];
  } else if (typeof value === "object" && value !== null && value.firestore != null && value.path != null) {
    return {"path": value.path};
  } else if (Array.isArray(value)) {
    return value.map(mapValue);
  } else if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, value]) => [key, mapValue(value)]));
  } else {
    return value;
  }
};

const mapKey = (key) => {
  const newKey = config.typesenseFieldsRenames[key] || key;
  return newKey;
};

/**
 * @param {DocumentSnapshot} firestoreDocumentSnapshot
 * @param {Array} fieldsToExtract
 * @return {Object} typesenseDocument
 */
exports.typesenseDocumentFromSnapshot = async (
    firestoreDocumentSnapshot,
    fieldsToExtract = config.firestoreCollectionFields,
) => {
  const flat = await import("flat");
  const data = firestoreDocumentSnapshot.data();

  let entries = Object.entries(data);

  if (fieldsToExtract.length) {
    entries = entries.filter(([key]) => fieldsToExtract.includes(key));
  }

  // Build a document with just the fields requested by the user, and mapped from Firestore types to Typesense types
  const mappedDocument = Object.fromEntries(entries.map(([key, value]) => [mapKey(key), mapValue(value)]));

  // using flat to flatten nested objects for older versions of Typesense that did not support nested fields
  // https://typesense.org/docs/0.22.2/api/collections.html#indexing-nested-fields
  const typesenseDocument = config.shouldFlattenNestedDocuments ?
    flat.flatten(mappedDocument, {safe: true}) :
    mappedDocument;

  typesenseDocument.id = firestoreDocumentSnapshot.id;

  return typesenseDocument;
};
