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
        let typesenseValue = value;

        if (value instanceof admin.firestore.Timestamp) {
          typesenseValue = Math.floor(value.toDate().getTime() / 1000);
        } else if (value instanceof admin.firestore.GeoPoint) {
          typesenseValue = [value.latitude, value.longitude];
        }

        return [key, typesenseValue];
      }),
  );
  typesenseDocument.id = firestoreDocumentSnapshot.id;
  return typesenseDocument;
};
