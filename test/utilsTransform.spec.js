const {TestEnvironment} = require("./support/testEnvironment");

const mockFetch = jest.fn();
global.fetch = (...args) => mockFetch(...args);

describe("Utils - transformDocument", () => {
  let testEnvironment;
  let utils;
  let config;

  beforeAll((done) => {
    testEnvironment = new TestEnvironment({
      dotenvConfig: `
LOCATION=us-central1
FIRESTORE_DATABASE_REGION=nam5
FIRESTORE_COLLECTION_PATH=books
FIRESTORE_COLLECTION_FIELDS=author,title
TYPESENSE_HOSTS=localhost
TYPESENSE_PORT=8108
TYPESENSE_PROTOCOL=http
TYPESENSE_COLLECTION_NAME=books_firestore
TYPESENSE_API_KEY=xyz
TRANSFORM_FUNCTION_NAME=
TRANSFORM_FUNCTION_SECRET=test-secret
TRANSFORM_FUNCTION_PROJECT_ID=test-project
TRANSFORM_FUNCTION_REGION=us-central1
`,
    });

    testEnvironment.setupTestEnvironment(done);
  });

  beforeEach(() => {
    utils = require("../functions/src/utils.js");
    config = require("../functions/src/config.js");

    mockFetch.mockReset();

    testEnvironment.resetCapturedEmulatorLogs();
  });

  afterAll(async () => {
    await testEnvironment.teardownTestEnvironment();
  });

  describe("when no transform function is defined", () => {
    it("returns the original document and logs an error", async () => {
      config.transformFunctionName = null;

      const document = {id: "123", title: "Test Document"};
      const result = await utils.transformDocument(document);

      expect(result).toEqual(document);

      expect(mockFetch).not.toHaveBeenCalled();

      expect(testEnvironment.capturedEmulatorLogs).toContain("No transform function defined. Returning original document.");
    });
  });

  describe("when transform function is defined", () => {
    beforeEach(() => {
      config.transformFunctionName = "test-transform-function";
    });

    it("successfully transforms a document", async () => {
      const document = {id: "123", title: "Test Document"};
      const transformedDocument = {id: "123", title: "Transformed Document"};

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => transformedDocument,
      });

      const result = await utils.transformDocument(document);

      expect(result).toEqual(transformedDocument);

      expect(mockFetch).toHaveBeenCalledWith("https://us-central1-test-project.cloudfunctions.net/test-transform-function", {
        method: "POST",
        body: JSON.stringify({document}),
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-secret",
        },
      });

      expect(testEnvironment.capturedEmulatorLogs).toContain("Calling transform function: test-transform-function");
      expect(testEnvironment.capturedEmulatorLogs).toContain("Transform function succeeded for document 123");
    });

    it("returns original document when transform function returns null/undefined", async () => {
      const document = {id: "123", title: "Test Document"};

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => null,
      });

      const result = await utils.transformDocument(document);

      expect(result).toEqual(document);

      expect(testEnvironment.capturedEmulatorLogs).toContain("Transform function failed for document 123. Using original document.");
    });

    it("returns original document when fetch response is not OK", async () => {
      const document = {id: "123", title: "Test Document"};

      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: "Internal Server Error",
      });

      const result = await utils.transformDocument(document);

      expect(result).toEqual(document);
    });

    it("returns original document when fetch throws an exception", async () => {
      const document = {id: "123", title: "Test Document"};

      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await utils.transformDocument(document);

      expect(result).toEqual(document);

      expect(testEnvironment.capturedEmulatorLogs).toContain("Error calling transform function: Network error");
    });

    it("handles documents without an ID properly", async () => {
      const document = {title: "Test Document Without ID"};
      const transformedDocument = {title: "Transformed Document"};

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => transformedDocument,
      });

      const result = await utils.transformDocument(document);

      expect(result).toEqual(transformedDocument);

      expect(testEnvironment.capturedEmulatorLogs).toContain("Transform function succeeded for document unknown");
    });
  });
});
