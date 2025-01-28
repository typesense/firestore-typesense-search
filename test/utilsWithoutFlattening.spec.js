const test = require("firebase-functions-test")({
  projectId: process.env.GCLOUD_PROJECT,
});

describe("Utils", () => {
  describe("typesenseDocumentFromSnapshot", () => {
    describe("Parsing geopoint datatype", () => {
      it("Do not parse into geopoint data type if object has other fields", async () => {
        const typesenseDocumentFromSnapshot = (await import("../functions/src/utils.js")).typesenseDocumentFromSnapshot;
        const data = {
          title: "Title X",
          author: null,
          genres: ["comedy"],
          location: {
            country: "USA",
            geohash: "abc",
            latitude: 1,
            longitude: 2,
          },
        };
        const documentSnapshot = test.firestore.makeDocumentSnapshot(data, "id");
        const result = await typesenseDocumentFromSnapshot(documentSnapshot, {}, []);
        expect(result).toEqual({
          id: "id",
          title: "Title X",
          author: null,
          genres: ["comedy"],
          location: {
            country: "USA",
            geohash: "abc",
            latitude: 1,
            longitude: 2,
          },
        });
      });
    });
    describe("Nested fields extraction", () => {
      it("extracts nested fields using dot notation", async () => {
        const typesenseDocumentFromSnapshot = (await import("../functions/src/utils.js")).typesenseDocumentFromSnapshot;
        const documentSnapshot = test.firestore.makeDocumentSnapshot(
          {
            user: {
              name: "John Doe",
              address: {
                city: "New York",
                country: "USA",
              },
            },
            tags: ["tag1", "tag2"],
          },
          "id",
        );
        const result = await typesenseDocumentFromSnapshot(documentSnapshot, {}, ["user.name", "user.address.city", "tags"]);
        expect(result).toEqual({
          id: "id",
          user: {name: "John Doe", address: {city: "New York"}},
          tags: ["tag1", "tag2"],
        });
      });

      it("handles missing nested fields gracefully", async () => {
        const typesenseDocumentFromSnapshot = (await import("../functions/src/utils.js")).typesenseDocumentFromSnapshot;
        const documentSnapshot = test.firestore.makeDocumentSnapshot(
          {
            user: {
              name: "John Doe",
            },
          },
          "id",
        );
        const result = await typesenseDocumentFromSnapshot(documentSnapshot, {}, ["user.name", "user.address.city"]);
        expect(result).toEqual({
          id: "id",
          user: {
            name: "John Doe",
          },
        });
      });

      it("extracts nested fields alongside top-level fields", async () => {
        const typesenseDocumentFromSnapshot = (await import("../functions/src/utils.js")).typesenseDocumentFromSnapshot;
        const documentSnapshot = test.firestore.makeDocumentSnapshot(
          {
            title: "Main Title",
            user: {
              name: "John Doe",
              age: 30,
            },
          },
          "id",
        );
        const result = await typesenseDocumentFromSnapshot(documentSnapshot, {}, ["title", "user.name"]);
        expect(result).toEqual({
          id: "id",
          title: "Main Title",
          user: {
            name: "John Doe",
          },
        });
      });

      it("handles array indexing in dot notation", async () => {
        const typesenseDocumentFromSnapshot = (await import("../functions/src/utils.js")).typesenseDocumentFromSnapshot;
        const documentSnapshot = test.firestore.makeDocumentSnapshot(
          {
            comments: [
              {author: "Alice", text: "Great post!"},
              {author: "Bob", text: "Thanks for sharing.", likes: 5},
            ],
          },
          "id",
        );
        const result = await typesenseDocumentFromSnapshot(documentSnapshot, {}, ["comments.author", "comments.text", "comments.likes"]);
        expect(result).toEqual({
          id: "id",
          comments: [
            {author: "Alice", text: "Great post!"},
            {author: "Bob", text: "Thanks for sharing.", likes: 5},
          ],
        });
      });
    });
  });
});
