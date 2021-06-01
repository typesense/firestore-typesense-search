const functions = require("firebase-functions");
const config = require("./config");
const Typesense = require("typesense");

/**
 * @param {DocumentSnapshot} firestoreDocumentSnapshot
 * @return {Object} typesenseDocument
 */
function typesenseDocumentFromSnapshot(firestoreDocumentSnapshot) {
  const document = Object.fromEntries(
      Object.entries(firestoreDocumentSnapshot.data())
          .filter(([key]) => config.firestoreCollectionFields.includes(key)
          )
  );
  document.id = firestoreDocumentSnapshot.id;
  return document;
}

exports.indexToTypesenseOnFirestoreWrite = functions.handler.firestore.document
    .onWrite((snapshot, context) => {
      const typesense = new Typesense.Client({
        nodes: config.typesenseHosts.map((h) => {
          return {host: h, port: 443, protocol: "https"};
        } ),
        apiKey: config.typesenseAPIKey,
      });

      if (snapshot.before == null) {
        // Create
        const typesenseDocument = typesenseDocumentFromSnapshot(snapshot.after);
        return typesense
            .collections(config.typesenseCollectionName)
            .documents()
            .create(typesenseDocument);
      } else if (snapshot.after == null) {
        // Delete
        const documentId = snapshot.before.id;
        return typesense
            .collections(config.typesenseCollectionName)
            .documents(documentId)
            .delete();
      } else {
        // Update
        const typesenseDocument = typesenseDocumentFromSnapshot(snapshot.after);
        const documentId = snapshot.after.id;
        return typesense
            .collections(config.typesenseCollectionName)
            .documents(documentId)
            .update(typesenseDocument);
      }
    });
