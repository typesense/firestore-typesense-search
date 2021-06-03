const config = require("./config");

/**
 * @param {DocumentSnapshot} firestoreDocumentSnapshot
 * @param {Array} fieldsToExtract
 * @return {Object} typesenseDocument
 */
exports.typesenseDocumentFromSnapshot = (firestoreDocumentSnapshot, fieldsToExtract = config.firestoreCollectionFields) => {
  if (fieldsToExtract.length === 0) {
    return Object.assign(
        {id: firestoreDocumentSnapshot.id},
        firestoreDocumentSnapshot.data(),
    );
  }

  const typesenseDocument = Object.fromEntries(
      Object.entries(firestoreDocumentSnapshot.data())
          .filter(([key]) => fieldsToExtract.includes(key),
          ),
  );
  typesenseDocument.id = firestoreDocumentSnapshot.id;
  return typesenseDocument;
};
