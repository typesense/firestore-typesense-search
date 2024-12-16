const config = require("./config.js");

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
 * Sets a nested value in an object using a dot-notated path.
 * @param {Object} obj - The object to modify.
 * @param {string} path - The dot-notated path to the value.
 * @param {*} value - The value to set.
 * @return {Object} The modified object.
 */
function setNestedValue(obj, path, value) {
  const keys = path.split(".");
  keys.reduce((acc, key, index) => {
    if (index === keys.length - 1) {
      acc[key] = value;
      return acc;
    }
    if (acc[key] === undefined) {
      acc[key] = Number.isInteger(+keys[index + 1]) ? [] : {};
    }
    return acc[key];
  }, obj);
  return obj;
}

/**
 * Gets a nested value from an object using a dot-notated path.
 * @param {Object} obj - The object to retrieve the value from.
 * @param {string} path - The dot-notated path to the value.
 * @return {*} The value at the specified path, or undefined if not found.
 */
function getNestedValue(obj, path) {
  const keys = path.split(".");
  return keys.reduce((current, key) => {
    if (current === undefined) return undefined;
    if (Array.isArray(current)) {
      return Number.isInteger(+key) ? current[+key] : current.map((item) => ({[key]: item[key]}));
    }
    return current[key];
  }, obj);
}

/**
 * Merges an array of objects into a single array, combining objects at the same index.
 * @param {Array<Object[]>} arrays - An array of object arrays to merge.
 * @return {Object[]} A merged array of objects.
 */
function mergeArrays(arrays) {
  const maxLength = Math.max(...arrays.map((arr) => arr.length));
  return Array.from({length: maxLength}, (_, i) => Object.assign({}, ...arrays.map((arr) => arr[i] || {})));
}

/**
 * Extracts a field from the data and adds it to the accumulator.
 * @param {Object} data - The source data object.
 * @param {Object} acc - The accumulator object.
 * @param {string} field - The field to extract.
 * @return {Object} The updated accumulator.
 */
function extractField(data, acc, field) {
  const value = getNestedValue(data, field);
  if (value === undefined) return acc;
  const [topLevelField] = field.split(".");
  const isArrayOfObjects = Array.isArray(value) && typeof value[0] === "object";
  if (isArrayOfObjects) {
    return {
      ...acc,
      [topLevelField]: acc[topLevelField] ? mergeArrays([acc[topLevelField], value]) : value,
    };
  } else {
    return setNestedValue(acc, field, value);
  }
}

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
 * @param {Object} contextParams
 * @param {Array} fieldsToExtract
 * @return {Object} typesenseDocument
 */
exports.typesenseDocumentFromSnapshot = async (firestoreDocumentSnapshot, contextParams = {}, fieldsToExtract = config.firestoreCollectionFields) => {
  const data = firestoreDocumentSnapshot.data();

  const extractedData = fieldsToExtract.length === 0 ? data : fieldsToExtract.reduce((acc, field) => extractField(data, acc, field), {});

  const mappedDocument = Object.fromEntries(Object.entries(extractedData).map(([key, value]) => [key, mapValue(value)]));

  // using flat to flatten nested objects for older versions of Typesense that did not support nested fields
  // https://typesense.org/docs/0.22.2/api/collections.html#indexing-nested-fields
  const typesenseDocument = config.shouldFlattenNestedDocuments ? flattenDocument(mappedDocument) : mappedDocument;
  console.log("typesenseDocument", typesenseDocument);

  typesenseDocument.id = firestoreDocumentSnapshot.id;

  Object.entries(contextParams).forEach(([key, value]) => {
    typesenseDocument[key] = value;
  });

  return typesenseDocument;
};
