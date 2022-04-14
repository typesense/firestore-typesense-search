const admin = require("firebase-admin");
const config = require("./config");

/**
 * @param {DocumentSnapshot} firestoreDocumentSnapshot
 * @param {Array} fieldsToExtract
 * @return {Object} typesenseDocument
 */
exports.typesenseDocumentFromSnapshot = (
    firestoreDocumentSnapshot,
    fieldsToExtract = config.firestoreCollectionFields,
) => {
  const data = firestoreDocumentSnapshot.data();

  let entries = Object.entries(data);

  if (fieldsToExtract.length) {
    entries = entries.filter(([key]) => fieldsToExtract.includes(key));
  }

  const typesenseDocument = Object.fromEntries(
      entries.map(([key, value]) => {
        const isGeoPoint = value instanceof admin.firestore.GeoPoint;
        return [key, isGeoPoint ? [value.latitude, value.longitude] : value];
      }),
  );
  typesenseDocument.id = firestoreDocumentSnapshot.id;
  return typesenseDocument;
};
