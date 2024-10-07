const test = require("firebase-functions-test")({
  projectId: process.env.GCLOUD_PROJECT,
});

describe("Utils", () => {
  describe("typesenseDocumentFromSnapshot", () => {
    describe("when document fields are mentioned explicitly", () => {
      it("returns a Typesense document with only the specified fields", async () => {
        const typesenseDocumentFromSnapshot = (await import("../functions/src/utils.js")).typesenseDocumentFromSnapshot;

        const documentSnapshot = test.firestore.makeDocumentSnapshot(
          {
            author: "Author X",
            title: "Title X",
            country: "USA",
          },
          "id",
        );

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
        const typesenseDocumentFromSnapshot = (await import("../functions/src/utils.js")).typesenseDocumentFromSnapshot;

        const documentSnapshot = test.firestore.makeDocumentSnapshot(
          {
            author: "Author X",
            title: "Title X",
            country: "USA",
          },
          "id",
        );

        const result = await typesenseDocumentFromSnapshot(documentSnapshot, []);
        expect(result).toEqual({
          id: "id",
          author: "Author X",
          title: "Title X",
          country: "USA",
        });
      });
    });

    describe("Parsing geopoint datatype", () => {
      it("Can parse object into geopoint when there are only lat, lng & geohash fields", async () => {
        const typesenseDocumentFromSnapshot = (await import("../functions/src/utils.js")).typesenseDocumentFromSnapshot;
        const data = [
          {
            location: {
              latitude: 1,
              longitude: 2,
            },
          },
          {
            location: {
              lat: 1,
              lng: 2,
            },
          },
          {
            location: {
              geohash: "abc",
              latitude: 1,
              longitude: 2,
            },
          },
          {
            location: {
              geohash: "abc",
              lat: 1,
              lng: 2,
            },
          },
        ];
        data.forEach(async (item) => {
          const documentSnapshot = test.firestore.makeDocumentSnapshot(item, "id");
          const result = await typesenseDocumentFromSnapshot(documentSnapshot, []);
          expect(result).toEqual({
            id: "id",
            location: [1, 2],
          });
        });
      });

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
        const result = await typesenseDocumentFromSnapshot(documentSnapshot, []);
        expect(result).toEqual({
          id: "id",
          title: "Title X",
          author: null,
          genres: ["comedy"],
          "location.country": "USA",
          "location.geohash": "abc",
          "location.latitude": 1,
          "location.longitude": 2,
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
        const result = await typesenseDocumentFromSnapshot(documentSnapshot, ["user.name", "user.address.city", "tags"]);
        expect(result).toEqual({
          id: "id",
          "user.name": "John Doe",
          "user.address.city": "New York",
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
        const result = await typesenseDocumentFromSnapshot(documentSnapshot, ["user.name", "user.address.city"]);
        expect(result).toEqual({
          id: "id",
          "user.name": "John Doe",
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
        const result = await typesenseDocumentFromSnapshot(documentSnapshot, ["title", "user.name"]);
        expect(result).toEqual({
          id: "id",
          title: "Main Title",
          "user.name": "John Doe",
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
        const result = await typesenseDocumentFromSnapshot(documentSnapshot, ["comments.author", "comments.text", "comments.likes"]);
        expect(result).toEqual({
          id: "id",
          "comments.author": ["Alice", "Bob"],
          "comments.text": ["Great post!", "Thanks for sharing."],
          "comments.likes": [5],
        });
      });
    });
  });
});
