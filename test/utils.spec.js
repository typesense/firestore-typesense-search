const test = require("firebase-functions-test")({
  projectId: process.env.GCLOUD_PROJECT,
});

describe("Utils", () => {
  describe("typesenseDocumentFromSnapshot", () => {
    const typesenseDocumentFromSnapshot =
      require("../functions/src/utils").typesenseDocumentFromSnapshot;
    describe("when document fields are mentioned explicitly", () => {
      it("returns a Typesense document with only the specified fields", () => {
        const documentSnapshot = test.firestore.makeDocumentSnapshot({
          author: "Author X",
          title: "Title X",
          country: "USA",
        }, "id");

        const result = typesenseDocumentFromSnapshot(documentSnapshot);
        expect(result).toEqual({
          id: "id",
          author: "Author X",
          title: "Title X",
        });
      });
    });
    describe("when no fields are mentioned explicitly", () => {
      it("returns a Typesense document with all fields", () => {
        const documentSnapshot = test.firestore.makeDocumentSnapshot({
          author: "Author X",
          title: "Title X",
          country: "USA",
        }, "id");

        const result = typesenseDocumentFromSnapshot(documentSnapshot, []);
        expect(result).toEqual({
          id: "id",
          author: "Author X",
          title: "Title X",
          country: "USA",
        });
      });
    });
  });
});
