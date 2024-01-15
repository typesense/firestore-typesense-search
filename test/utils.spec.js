const test = require("firebase-functions-test")({
  projectId: process.env.GCLOUD_PROJECT,
});

describe("Utils", () => {
  describe("typesenseDocumentFromSnapshot", () => {
    describe("when document fields are mentioned explicitly", () => {
      it("returns a Typesense document with only the specified fields", async () => {
        const typesenseDocumentFromSnapshot =
          (await import("../functions/src/utils.js")).typesenseDocumentFromSnapshot;

        const documentSnapshot = test.firestore.makeDocumentSnapshot({
          author: "Author X",
          title: "Title X",
          country: "USA",
        }, "id");

        const result = await typesenseDocumentFromSnapshot(documentSnapshot);
        expect(result).toEqual({
          id: "id",
          author: "Author X",
          title: "Title X",
        });
      });
    });
    describe("when no fields are mentioned explicitly", () => {
      it("returns a Typesense document with all fields", async () => {
        const typesenseDocumentFromSnapshot =
          (await import("../functions/src/utils.js")).typesenseDocumentFromSnapshot;

        const documentSnapshot = test.firestore.makeDocumentSnapshot({
          author: "Author X",
          title: "Title X",
          country: "USA",
        }, "id");

        const result = await typesenseDocumentFromSnapshot(documentSnapshot, []);
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
