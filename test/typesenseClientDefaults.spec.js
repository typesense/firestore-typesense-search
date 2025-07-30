describe("Typesense Client Default Random Configuration", () => {
  let originalConnectionTimeout;
  let originalRetryInterval;

  beforeEach(() => {
    originalConnectionTimeout = process.env.TYPESENSE_CONNECTION_TIMEOUT_SECONDS;
    originalRetryInterval = process.env.TYPESENSE_RETRY_INTERVAL_SECONDS;

    jest.resetModules();

    process.env.TYPESENSE_HOSTS = "localhost";
    process.env.TYPESENSE_API_KEY = "test-key";
    process.env.TYPESENSE_COLLECTION_NAME = "test-collection";
  });

  afterEach(() => {
    if (originalConnectionTimeout !== undefined) {
      process.env.TYPESENSE_CONNECTION_TIMEOUT_SECONDS = originalConnectionTimeout;
    } else {
      delete process.env.TYPESENSE_CONNECTION_TIMEOUT_SECONDS;
    }

    if (originalRetryInterval !== undefined) {
      process.env.TYPESENSE_RETRY_INTERVAL_SECONDS = originalRetryInterval;
    } else {
      delete process.env.TYPESENSE_RETRY_INTERVAL_SECONDS;
    }

    delete process.env.TYPESENSE_HOSTS;
    delete process.env.TYPESENSE_API_KEY;
    delete process.env.TYPESENSE_COLLECTION_NAME;

    jest.resetModules();
  });

  describe("when environment variables are not set", () => {
    beforeEach(() => {
      delete process.env.TYPESENSE_CONNECTION_TIMEOUT_SECONDS;
      delete process.env.TYPESENSE_RETRY_INTERVAL_SECONDS;

      jest.resetModules();
    });

    it("should use random connection timeout between 60 and 90 seconds", () => {
      const createTypesenseClient = require("../functions/src/createTypesenseClient");
      const client = createTypesenseClient();

      expect(client.configuration.connectionTimeoutSeconds).toBeGreaterThanOrEqual(60);
      expect(client.configuration.connectionTimeoutSeconds).toBeLessThanOrEqual(90);
      expect(Number.isInteger(client.configuration.connectionTimeoutSeconds)).toBe(true);
    });

    it("should use random retry interval between 60 and 120 seconds", () => {
      const createTypesenseClient = require("../functions/src/createTypesenseClient");
      const client = createTypesenseClient();

      expect(client.configuration.retryIntervalSeconds).toBeGreaterThanOrEqual(60);
      expect(client.configuration.retryIntervalSeconds).toBeLessThanOrEqual(120);
      expect(Number.isInteger(client.configuration.retryIntervalSeconds)).toBe(true);
    });

    it("should generate different random values on multiple client creations", () => {
      const createTypesenseClient = require("../functions/src/createTypesenseClient");
      const clients = [];
      const connectionTimeouts = new Set();
      const retryIntervals = new Set();

      for (let i = 0; i < 10; i++) {
        const client = createTypesenseClient();
        clients.push(client);
        connectionTimeouts.add(client.configuration.connectionTimeoutSeconds);
        retryIntervals.add(client.configuration.retryIntervalSeconds);
      }

      expect(connectionTimeouts.size).toBeGreaterThan(1);
      expect(retryIntervals.size).toBeGreaterThan(1);
    });
  });

  describe("when environment variables are set", () => {
    beforeEach(() => {
      process.env.TYPESENSE_CONNECTION_TIMEOUT_SECONDS = "45";
      process.env.TYPESENSE_RETRY_INTERVAL_SECONDS = "30";

      jest.resetModules();
    });

    it("should use the configured values instead of random ones", () => {
      const createTypesenseClient = require("../functions/src/createTypesenseClient");
      const client = createTypesenseClient();

      expect(client.configuration.connectionTimeoutSeconds).toBe(45);
      expect(client.configuration.retryIntervalSeconds).toBe(30);
    });
  });

  describe("when environment variables are set to invalid values", () => {
    beforeEach(() => {
      process.env.TYPESENSE_CONNECTION_TIMEOUT_SECONDS = "invalid";
      process.env.TYPESENSE_RETRY_INTERVAL_SECONDS = "also-invalid";

      jest.resetModules();
    });

    it("should fall back to random values when parseInt returns NaN", () => {
      const createTypesenseClient = require("../functions/src/createTypesenseClient");
      const client = createTypesenseClient();

      expect(client.configuration.connectionTimeoutSeconds).toBeGreaterThanOrEqual(60);
      expect(client.configuration.connectionTimeoutSeconds).toBeLessThanOrEqual(90);
      expect(client.configuration.retryIntervalSeconds).toBeGreaterThanOrEqual(60);
      expect(client.configuration.retryIntervalSeconds).toBeLessThanOrEqual(120);
    });
  });
});
