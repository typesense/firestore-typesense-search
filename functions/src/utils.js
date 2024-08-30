const config = require("./config.js");

const mapValue = (value) => {
  const isObject = typeof value === 'object';
  const notNull = value !== null;
  const length = Object.keys(value).length;

  const latitude = value.latitude ?? value.lat;
  const longitude = value.longitude ?? value.lng;
  const hasGeohashField = value.geohash != null && length == 3;
  const isGeopointType = latitude != null && longitude != null && (length == 2 || hasGeohashField);

  if (isObject && notNull && value.seconds != null && value.nanoseconds != null) {
    // convert date to Unix timestamp
    // https://typesense.org/docs/0.22.2/api/collections.html#indexing-dates
    return Math.floor(value.toDate().getTime() / 1000);
  } else if (isObject && notNull && isGeopointType) {
    return [latitude, longitude];
  } else if (isObject && notNull && value.firestore != null && value.path != null) {
    return {"path": value.path};
  } else if (Array.isArray(value)) {
    return value.map(mapValue);
  } else if (isObject && notNull) {
    return Object.fromEntries(Object.entries(value).map(([key, value]) => [key, mapValue(value)]));
  } else {
    return value;
  }
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
  const mappedDocument = Object.fromEntries(entries.map(([key, value]) => [key, mapValue(value)]));

  // using flat to flatten nested objects for older versions of Typesense that did not support nested fields
  // https://typesense.org/docs/0.22.2/api/collections.html#indexing-nested-fields
  const typesenseDocument = config.shouldFlattenNestedDocuments ?
    flat.flatten(mappedDocument, {safe: true}) :
    mappedDocument;

  typesenseDocument.id = firestoreDocumentSnapshot.id;

  return typesenseDocument;
};
