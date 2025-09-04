const {createTypesenseDocument} = require("../functions/src/utils.js");

describe("Utils", () => {
  describe("createTypesenseDocument", () => {
    describe("Basic functionality", () => {
      it("creates a Typesense document with all fields when no fields specified", async () => {
        const documentSnapshot = {
          data: () => ({
            title: "Book Title",
            author: "Author Name",
            rating: 4.5,
            price: 29.99,
          }),
          id: "doc123",
        };

        const collectionConfig = {
          fields: [],
          flattenNested: false,
          typesenseCollection: "books",
        };

        const result = await createTypesenseDocument(documentSnapshot, collectionConfig, {});
        expect(result).toEqual({
          id: "doc123",
          title: "Book Title",
          author: "Author Name",
          rating: 4.5,
          price: 29.99,
        });
      });

      it("creates a Typesense document with only specified fields", async () => {
        const documentSnapshot = {
          data: () => ({
            title: "Book Title",
            author: "Author Name",
            rating: 4.5,
            price: 29.99,
            isbn: "1234567890",
          }),
          id: "doc123",
        };

        const collectionConfig = {
          fields: ["title", "author", "rating"],
          flattenNested: false,
          typesenseCollection: "books",
        };

        const result = await createTypesenseDocument(documentSnapshot, collectionConfig, {});
        expect(result).toEqual({
          id: "doc123",
          title: "Book Title",
          author: "Author Name",
          rating: 4.5,
        });
      });

      it("adds context parameters to the document", async () => {
        const documentSnapshot = {
          data: () => ({
            title: "Book Title",
            author: "Author Name",
          }),
          id: "doc123",
        };

        const collectionConfig = {
          fields: ["title", "author"],
          flattenNested: false,
          typesenseCollection: "books",
        };

        const contextParams = {
          userId: "user123",
          category: "fiction",
        };

        const result = await createTypesenseDocument(documentSnapshot, collectionConfig, contextParams);
        expect(result).toEqual({
          id: "doc123",
          title: "Book Title",
          author: "Author Name",
          userId: "user123",
          category: "fiction",
        });
      });

      it("excludes docId from context parameters", async () => {
        const documentSnapshot = {
          data: () => ({
            title: "Book Title",
            author: "Author Name",
          }),
          id: "doc123",
        };

        const collectionConfig = {
          fields: ["title", "author"],
          flattenNested: false,
          typesenseCollection: "books",
        };

        const contextParams = {
          docId: "should-be-excluded",
          userId: "user123",
        };

        const result = await createTypesenseDocument(documentSnapshot, collectionConfig, contextParams);
        expect(result).toEqual({
          id: "doc123",
          title: "Book Title",
          author: "Author Name",
          userId: "user123",
        });
        expect(result).not.toHaveProperty("docId");
      });

      it("throws error when document data is null", async () => {
        const documentSnapshot = {
          data: () => null,
          id: "doc123",
        };

        const collectionConfig = {
          fields: ["title", "author"],
          flattenNested: false,
          typesenseCollection: "books",
        };

        await expect(createTypesenseDocument(documentSnapshot, collectionConfig, {})).rejects.toThrow("Document data is null");
      });
    });

    describe("Nested fields handling without flattening", () => {
      it("extracts nested fields using dot notation", async () => {
        const documentSnapshot = {
          data: () => ({
            user: {
              name: "John Doe",
              address: {
                city: "New York",
                country: "USA",
              },
            },
            tags: ["tag1", "tag2"],
          }),
          id: "doc123",
        };

        const collectionConfig = {
          fields: ["user.name", "user.address.city", "tags"],
          flattenNested: false,
          typesenseCollection: "books",
        };

        const result = await createTypesenseDocument(documentSnapshot, collectionConfig, {});
        expect(result).toEqual({
          id: "doc123",
          user: {name: "John Doe", address: {city: "New York"}},
          tags: ["tag1", "tag2"],
        });
      });

      it("handles missing nested fields gracefully", async () => {
        const documentSnapshot = {
          data: () => ({
            user: {
              name: "John Doe",
            },
          }),
          id: "doc123",
        };

        const collectionConfig = {
          fields: ["user.name", "user.address.city"],
          flattenNested: false,
          typesenseCollection: "books",
        };

        const result = await createTypesenseDocument(documentSnapshot, collectionConfig, {});
        expect(result).toEqual({
          id: "doc123",
          user: {
            name: "John Doe",
          },
        });
      });

      it("handles array indexing in dot notation", async () => {
        const documentSnapshot = {
          data: () => ({
            comments: [
              {author: "Alice", text: "Great post!"},
              {author: "Bob", text: "Thanks for sharing.", likes: 5},
            ],
          }),
          id: "doc123",
        };

        const collectionConfig = {
          fields: ["comments.author", "comments.text", "comments.likes"],
          flattenNested: false,
          typesenseCollection: "books",
        };

        const result = await createTypesenseDocument(documentSnapshot, collectionConfig, {});
        expect(result).toEqual({
          id: "doc123",
          comments: [
            {author: "Alice", text: "Great post!"},
            {author: "Bob", text: "Thanks for sharing.", likes: 5},
          ],
        });
      });
    });

    describe("Flattened document handling", () => {
      it("creates a flattened Typesense document with all fields when no fields specified", async () => {
        const documentSnapshot = {
          data: () => ({
            title: "Book Title",
            author: "Author Name",
            metadata: {
              rating: 4.5,
              price: 29.99,
              tags: ["fiction", "adventure"],
            },
          }),
          id: "doc123",
        };

        const collectionConfig = {
          fields: [],
          flattenNested: true,
          typesenseCollection: "books",
        };

        const result = await createTypesenseDocument(documentSnapshot, collectionConfig, {});
        expect(result).toEqual({
          id: "doc123",
          title: "Book Title",
          author: "Author Name",
          "metadata.rating": 4.5,
          "metadata.price": 29.99,
          "metadata.tags": ["fiction", "adventure"],
        });
      });

      it("creates a flattened Typesense document with only specified fields", async () => {
        const documentSnapshot = {
          data: () => ({
            title: "Book Title",
            author: "Author Name",
            metadata: {
              rating: 4.5,
              price: 29.99,
              tags: ["fiction", "adventure"],
            },
            isbn: "1234567890",
          }),
          id: "doc123",
        };

        const collectionConfig = {
          fields: ["title", "metadata.rating"],
          flattenNested: true,
          typesenseCollection: "books",
        };

        const result = await createTypesenseDocument(documentSnapshot, collectionConfig, {});
        expect(result).toEqual({
          id: "doc123",
          title: "Book Title",
          "metadata.rating": 4.5,
        });
      });

      it("adds context parameters to flattened document", async () => {
        const documentSnapshot = {
          data: () => ({
            title: "Book Title",
            metadata: {
              rating: 4.5,
            },
          }),
          id: "doc123",
        };

        const collectionConfig = {
          fields: ["title", "metadata.rating"],
          flattenNested: true,
          typesenseCollection: "books",
        };

        const contextParams = {
          userId: "user123",
          category: "fiction",
        };

        const result = await createTypesenseDocument(documentSnapshot, collectionConfig, contextParams);
        expect(result).toEqual({
          id: "doc123",
          title: "Book Title",
          "metadata.rating": 4.5,
          userId: "user123",
          category: "fiction",
        });
      });

      it("handles nested fields using dot notation with flattening", async () => {
        const documentSnapshot = {
          data: () => ({
            user: {
              name: "John Doe",
              address: {
                city: "New York",
                country: "USA",
              },
            },
            tags: ["tag1", "tag2"],
          }),
          id: "doc123",
        };

        const collectionConfig = {
          fields: ["user.name", "user.address.city", "tags"],
          flattenNested: true,
          typesenseCollection: "books",
        };

        const result = await createTypesenseDocument(documentSnapshot, collectionConfig, {});
        expect(result).toEqual({
          id: "doc123",
          "user.name": "John Doe",
          "user.address.city": "New York",
          tags: ["tag1", "tag2"],
        });
      });

      it("handles missing nested fields gracefully with flattening", async () => {
        const documentSnapshot = {
          data: () => ({
            user: {
              name: "John Doe",
            },
          }),
          id: "doc123",
        };

        const collectionConfig = {
          fields: ["user.name", "user.address.city"],
          flattenNested: true,
          typesenseCollection: "books",
        };

        const result = await createTypesenseDocument(documentSnapshot, collectionConfig, {});
        expect(result).toEqual({
          id: "doc123",
          "user.name": "John Doe",
        });
      });

      it("handles array indexing in dot notation with flattening", async () => {
        const documentSnapshot = {
          data: () => ({
            comments: [
              {author: "Alice", text: "Great post!"},
              {author: "Bob", text: "Thanks for sharing.", likes: 5},
            ],
          }),
          id: "doc123",
        };

        const collectionConfig = {
          fields: ["comments.author", "comments.text", "comments.likes"],
          flattenNested: true,
          typesenseCollection: "books",
        };

        const result = await createTypesenseDocument(documentSnapshot, collectionConfig, {});
        expect(result).toEqual({
          id: "doc123",
          "comments.author": ["Alice", "Bob"],
          "comments.text": ["Great post!", "Thanks for sharing."],
          "comments.likes": [5],
        });
      });

      it("handles nested objects with arrays", async () => {
        const documentSnapshot = {
          data: () => ({
            title: "Book Title",
            reviews: [
              {author: "Alice", rating: 5, comment: "Great book!"},
              {author: "Bob", rating: 4, comment: "Good read"},
            ],
          }),
          id: "doc123",
        };

        const collectionConfig = {
          fields: ["title", "reviews"],
          flattenNested: true,
          typesenseCollection: "books",
        };

        const result = await createTypesenseDocument(documentSnapshot, collectionConfig, {});
        expect(result).toEqual({
          id: "doc123",
          title: "Book Title",
          "reviews.author": ["Alice", "Bob"],
          "reviews.rating": [5, 4],
          "reviews.comment": ["Great book!", "Good read"],
        });
      });

      it("handles complex nested structures", async () => {
        const documentSnapshot = {
          data: () => ({
            title: "Book Title",
            author: {
              name: "John Doe",
              contact: {
                email: "john@example.com",
                phone: "123-456-7890",
              },
            },
            metadata: {
              categories: ["fiction", "adventure"],
              stats: {
                views: 1000,
                likes: 500,
              },
            },
          }),
          id: "doc123",
        };

        const collectionConfig = {
          fields: [],
          flattenNested: true,
          typesenseCollection: "books",
        };

        const result = await createTypesenseDocument(documentSnapshot, collectionConfig, {});
        expect(result).toEqual({
          id: "doc123",
          title: "Book Title",
          "author.name": "John Doe",
          "author.contact.email": "john@example.com",
          "author.contact.phone": "123-456-7890",
          "metadata.categories": ["fiction", "adventure"],
          "metadata.stats.views": 1000,
          "metadata.stats.likes": 500,
        });
      });
    });

    describe("Field filtering with flattening", () => {
      it("filters fields and flattens nested objects", async () => {
        const documentSnapshot = {
          data: () => ({
            title: "Book Title",
            author: {
              name: "John Doe",
              contact: {
                email: "john@example.com",
                phone: "123-456-7890",
              },
            },
            metadata: {
              rating: 4.5,
              price: 29.99,
            },
            isbn: "1234567890",
          }),
          id: "doc123",
        };

        const collectionConfig = {
          fields: ["title", "author.name", "metadata.rating"],
          flattenNested: true,
          typesenseCollection: "books",
        };

        const result = await createTypesenseDocument(documentSnapshot, collectionConfig, {});
        expect(result).toEqual({
          id: "doc123",
          title: "Book Title",
          "author.name": "John Doe",
          "metadata.rating": 4.5,
        });
      });
    });

    describe("Data type mapping", () => {
      it("maps Firestore timestamps to Unix timestamps", async () => {
        const timestamp = {
          seconds: 1672531200,
          nanoseconds: 0,
          toDate: () => new Date("2023-01-01T00:00:00Z"),
        };

        const documentSnapshot = {
          data: () => ({
            title: "Book Title",
            createdAt: timestamp,
            updatedAt: timestamp,
          }),
          id: "doc123",
        };

        const collectionConfig = {
          fields: ["title", "createdAt", "updatedAt"],
          flattenNested: false,
          typesenseCollection: "books",
        };

        const result = await createTypesenseDocument(documentSnapshot, collectionConfig, {});
        expect(result).toEqual({
          id: "doc123",
          title: "Book Title",
          createdAt: 1672531200, // Unix timestamp for 2023-01-01T00:00:00Z
          updatedAt: 1672531200,
        });
      });

      it("maps geopoint objects to arrays", async () => {
        const documentSnapshot = {
          data: () => ({
            title: "Book Title",
            location: {
              latitude: 40.7128,
              longitude: -74.006,
            },
            location2: {
              lat: 34.0522,
              lng: -118.2437,
            },
            location3: {
              latitude: 51.5074,
              longitude: -0.1278,
              geohash: "gcpvj0",
            },
          }),
          id: "doc123",
        };

        const collectionConfig = {
          fields: ["title", "location", "location2", "location3"],
          flattenNested: false,
          typesenseCollection: "books",
        };

        const result = await createTypesenseDocument(documentSnapshot, collectionConfig, {});
        expect(result).toEqual({
          id: "doc123",
          title: "Book Title",
          location: [40.7128, -74.006],
          location2: [34.0522, -118.2437],
          location3: [51.5074, -0.1278],
        });
      });

      it("does not map objects with additional fields to geopoints", async () => {
        const documentSnapshot = {
          data: () => ({
            title: "Book Title",
            location: {
              latitude: 40.7128,
              longitude: -74.006,
              country: "USA",
              city: "New York",
            },
          }),
          id: "doc123",
        };

        const collectionConfig = {
          fields: ["title", "location"],
          flattenNested: false,
          typesenseCollection: "books",
        };

        const result = await createTypesenseDocument(documentSnapshot, collectionConfig, {});
        expect(result).toEqual({
          id: "doc123",
          title: "Book Title",
          location: {
            latitude: 40.7128,
            longitude: -74.006,
            country: "USA",
            city: "New York",
          },
        });
      });

      it("maps Firestore references to path objects", async () => {
        const documentSnapshot = {
          data: () => ({
            title: "Book Title",
            authorRef: {
              firestore: {},
              path: "users/author123",
            },
            categoryRef: {
              firestore: {},
              path: "categories/fiction",
            },
          }),
          id: "doc123",
        };

        const collectionConfig = {
          fields: ["title", "authorRef", "categoryRef"],
          flattenNested: false,
          typesenseCollection: "books",
        };

        const result = await createTypesenseDocument(documentSnapshot, collectionConfig, {});
        expect(result).toEqual({
          id: "doc123",
          title: "Book Title",
          authorRef: {path: "users/author123"},
          categoryRef: {path: "categories/fiction"},
        });
      });

      it("maps arrays recursively", async () => {
        const timestamp = {
          seconds: 1672531200,
          nanoseconds: 0,
          toDate: () => new Date("2023-01-01T00:00:00Z"),
        };

        const documentSnapshot = {
          data: () => ({
            title: "Book Title",
            tags: ["fiction", "adventure"],
            locations: [
              {latitude: 40.7128, longitude: -74.006},
              {latitude: 34.0522, longitude: -118.2437},
            ],
            timestamps: [timestamp, timestamp],
          }),
          id: "doc123",
        };

        const collectionConfig = {
          fields: ["title", "tags", "locations", "timestamps"],
          flattenNested: false,
          typesenseCollection: "books",
        };

        const result = await createTypesenseDocument(documentSnapshot, collectionConfig, {});
        expect(result).toEqual({
          id: "doc123",
          title: "Book Title",
          tags: ["fiction", "adventure"],
          locations: [
            [40.7128, -74.006],
            [34.0522, -118.2437],
          ],
          timestamps: [1672531200, 1672531200],
        });
      });
    });
  });
});
