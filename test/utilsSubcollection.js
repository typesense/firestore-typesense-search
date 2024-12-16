const utils = require("../functions/src/utils");

describe("Utils", () => {
  describe("Parsing static firestore path", () => {
    it("Static firestore path should do nothing", async () => {
      const staticPathVars1 = utils.parseFirestorePath("books");
      expect(staticPathVars1).toEqual({});

      const staticPathVars2 = utils.parseFirestorePath("books/123");
      expect(staticPathVars2).toEqual({});

      const staticPathVars5 = utils.parseFirestorePath("books/123/chapter/456/title");
      expect(staticPathVars5).toEqual({});
    });

    it("Throws an exception if placeholders are empty but fullPath has segments", async () => {
      const fullPath = "/users/123/books/456/author";
      const selector = "/users/123/books/456/author/{authorId}/email";

      const vars = utils.pathMatchesSelector(fullPath, selector);
      expect(vars).toBeNull();
    });
  });

  describe("Parsing dynamic firestore path", () => {
    it("Dynamic firestore path should return placeholders", async () => {
      const dynamicPath2 = "books/{bookId}/chapter";
      const dynamicPathVars2 = utils.parseFirestorePath(dynamicPath2);
      expect(dynamicPathVars2).toEqual({bookId: 1});

      const actualPathVars2 = utils.pathMatchesSelector("books/123/chapter", dynamicPath2);
      expect(actualPathVars2).toEqual({bookId: "123"});

      const dynamicPath5 = "books/{bookId}/chapter/{chapterId}/title";
      const dynamicPathVars5 = utils.parseFirestorePath(dynamicPath5);
      expect(dynamicPathVars5).toEqual({bookId: 1, chapterId: 3});

      const actualPathVars5 = utils.pathMatchesSelector("books/123/chapter/456/title", dynamicPath5);
      expect(actualPathVars5).toEqual({bookId: "123", chapterId: "456"});
    });
  });

  describe("pathMatchesSelector", () => {
    it("should return extracted placeholders for a matching path and selector", () => {
      const path = "users/123/library/456/books/789";
      const selector = "users/{userId}/library/{libraryId}/books";
      const result = utils.pathMatchesSelector(path, selector);
      expect(result).toEqual({userId: "123", libraryId: "456"});
    });

    it("should return null for a non-matching path and selector", () => {
      const path = "users/123/library/456/magazines/789";
      const selector = "users/{userId}/library/{libraryId}/books/{bookId}";
      const result = utils.pathMatchesSelector(path, selector);
      expect(result).toBeNull();
    });

    it("should return null if the path is shorter than the selector", () => {
      const path = "users/123/library/456";
      const selector = "users/{userId}/library/{libraryId}/books/{bookId}";
      const result = utils.pathMatchesSelector(path, selector);
      expect(result).toBeNull();
    });

    it("should handle selectors without placeholders", () => {
      const path = "users/123/library";
      const selector = "users/123/library";
      const result = utils.pathMatchesSelector(path, selector);
      expect(result).toEqual({});
    });

    it("should return null if the static segments of path and selector do not match", () => {
      const path = "users/123/libraries/456";
      const selector = "users/{userId}/library/{libraryId}";
      const result = utils.pathMatchesSelector(path, selector);
      expect(result).toBeNull();
    });

    it("should throw an error for an invalid path", () => {
      const path = null;
      const selector = "users/{userId}/library/{libraryId}";
      expect(() => {
        utils.pathMatchesSelector(path, selector);
      }).toThrow("Invalid path: Path must be a non-empty string.");
    });

    it("should throw an error for an invalid selector", () => {
      const path = "users/123/library/456";
      const selector = null;
      expect(() => {
        utils.pathMatchesSelector(path, selector);
      }).toThrow("Invalid selector: Selector must be a non-empty string.");
    });

    it("should extract placeholders even when additional path segments exist", () => {
      const path = "users/123/library/456/books/789/reviews/101";
      const selector = "users/{userId}/library/{libraryId}/books";
      const result = utils.pathMatchesSelector(path, selector);
      expect(result).toEqual({userId: "123", libraryId: "456"});
    });

    it("should handle paths and selectors with trailing slashes", () => {
      const path = "users/123/library/456/";
      const selector = "users/{userId}/library";
      const result = utils.pathMatchesSelector(path, selector);
      expect(result).toEqual({userId: "123"});
    });
  });
});
