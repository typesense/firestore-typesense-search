const config = require("./config.js");
const get = require("lodash.get");

const mapValue = (value) => {
  const isObject = typeof value === "object";
  const notNull = value !== null;
  const length = isObject && notNull ? Object.keys(value).length : 0;

  const latitude = value?.latitude ?? value?.lat;
  const longitude = value?.longitude ?? value?.lng;
  const hasGeohashField = value?.geohash != null && length == 3;
  const isGeopointType = latitude != null && longitude != null && (length == 2 || hasGeohashField);

  if (isObject && notNull && value.seconds != null && value.nanoseconds != null) {
    // convert date to Unix timestamp
    // https://typesense.org/docs/0.22.2/api/collections.html#indexing-dates
    return Math.floor(value.toDate().getTime() / 1000);
  } else if (isObject && notNull && isGeopointType) {
    return [latitude, longitude];
  } else if (isObject && notNull && value.firestore != null && value.path != null) {
    return {path: value.path};
  } else if (Array.isArray(value)) {
    return value.map(mapValue);
  } else if (isObject && notNull) {
    return Object.fromEntries(Object.entries(value).map(([key, value]) => [key, mapValue(value)]));
  } else {
    return value;
  }
};

/**
 * Flattens a nested object, converting nested properties to dot-notation.
 * @param {Object} obj - The object to flatten.
 * @param {string} [prefix=""] - The prefix to use for flattened keys.
 * @return {Object} A new flattened object.
 */
function flattenDocument(obj, prefix = "") {
  return Object.keys(obj).reduce((acc, key) => {
    const newKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];
    // Handle primitive values (including null)
    if (typeof value !== "object" || value === null) {
      acc[newKey] = value;
      return acc;
    }
    // Handle arrays
    if (Array.isArray(value)) {
      if (value.length === 0 || typeof value[0] !== "object") {
        acc[newKey] = value;
        return acc;
      }
      Object.keys(value[0]).forEach((subKey) => {
        acc[`${newKey}.${subKey}`] = value.map((item) => item[subKey]).filter((v) => v !== undefined);
      });
      return acc;
    }
    // Handle nested objects
    return {...acc, ...flattenDocument(value, newKey)};
  }, {});
}

/**
 * @param {DocumentSnapshot} firestoreDocumentSnapshot
 * @param {Array} fieldsToExtract
 * @return {Object} typesenseDocument
 */
exports.typesenseDocumentFromSnapshot = async (firestoreDocumentSnapshot, fieldsToExtract = config.firestoreCollectionFields) => {
  const flat = await import("flat");
  const data = firestoreDocumentSnapshot.data();

  const extractedData =
    fieldsToExtract.length === 0 ? data :
       fieldsToExtract.reduce((acc, field) => {
         acc[field] = get(data, field);
         return acc;
       }, {});

  const mappedDocument = Object.fromEntries(Object.entries(extractedData).map(([key, value]) => [key, mapValue(value)]));

  // using flat to flatten nested objects for older versions of Typesense that did not support nested fields
  // https://typesense.org/docs/0.22.2/api/collections.html#indexing-nested-fields
  const typesenseDocument = config.shouldFlattenNestedDocuments ? flattenDocument(mappedDocument) : mappedDocument;

  typesenseDocument.id = firestoreDocumentSnapshot.id;

  return typesenseDocument;
};
