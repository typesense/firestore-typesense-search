const functions = require("firebase-functions");

exports.indexToTypesenseOnFirestoreWrite = functions.handler.firestore.document
    .onWrite((change, context) => {
      console.dir(change.after.data());
      console.dir(change.before.data());
      return true;
    });
