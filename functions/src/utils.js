const config = require("./config");

/**
 * @param {DocumentSnapshot} firestoreDocumentSnapshot
 * @return {Object} typesenseDocument
 */
exports.typesenseDocumentFromSnapshot = (firestoreDocumentSnapshot) => {
  const document = Object.fromEntries(
      Object.entries(firestoreDocumentSnapshot.data())
          .filter(([key]) => config.firestoreCollectionFields.includes(key),
          ),
  );
  document.id = firestoreDocumentSnapshot.id;
  return document;
};
