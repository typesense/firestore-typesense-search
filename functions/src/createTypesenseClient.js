const config = require("./config.js");
const Typesense = require("typesense");

module.exports = function () {
  return new Typesense.Client({
    nodes: config.typesenseHosts.map((h) => {
      return {
        host: h,
        port: config.typesensePort,
        protocol: config.typesenseProtocol,
      };
    }),
    apiKey: config.typesenseAPIKey,
    connectionTimeoutSeconds: config.typesenseConnectionTimeoutSeconds,
    retryIntervalSeconds: config.typesenseRetryIntervalSeconds,
  });
};
