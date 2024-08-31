const test = require("firebase-functions-test")({
  projectId: process.env.GCLOUD_PROJECT,
});

describe("Utils", () => {
  describe("typesenseDocumentFromSnapshot", () => {
    describe("when document fields are mentioned explicitly", () => {
      it("returns a Typesense document with only the specified fields", async () => {
        const typesenseDocumentFromSnapshot = (
          await import("../functions/src/utils.js")
        ).typesenseDocumentFromSnapshot;

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
        const typesenseDocumentFromSnapshot = (
          await import("../functions/src/utils.js")
        ).typesenseDocumentFromSnapshot;

        const documentSnapshot = test.firestore.makeDocumentSnapshot(
            {
              author: "Author X",
              title: "Title X",
              country: "USA",
            },
            "id",
        );

        const result = await typesenseDocumentFromSnapshot(
            documentSnapshot,
            [],
        );
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
        const typesenseDocumentFromSnapshot = (
          await import("../functions/src/utils.js")
        ).typesenseDocumentFromSnapshot;
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
          const documentSnapshot = test.firestore.makeDocumentSnapshot(
              item,
              "id",
          );
          const result = await typesenseDocumentFromSnapshot(
              documentSnapshot,
              [],
          );
          expect(result).toEqual({
            id: "id",
            location: [1, 2],
          });
        });
      });

      it("Do not parse into geopoint data type if object has other fields", async () => {
        const typesenseDocumentFromSnapshot = (
          await import("../functions/src/utils.js")
        ).typesenseDocumentFromSnapshot;
        const data = {
          title: "Title X",
          location: {
            country: "USA",
            geohash: "abc",
            latitude: 1,
            longitude: 2,
          },
        };
        const documentSnapshot = test.firestore.makeDocumentSnapshot(
            data,
            "id",
        );
        const result = await typesenseDocumentFromSnapshot(
            documentSnapshot,
            [],
        );
        expect(result).toEqual({
          "id": "id",
          "title": "Title X",
          "location.country": "USA",
          "location.geohash": "abc",
          "location.latitude": 1,
          "location.longitude": 2,
        });
      });
    });
  });
});
