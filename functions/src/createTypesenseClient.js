const config = require("./config.js");
const Typesense = require("typesense");

// eslint-disable-next-line require-jsdoc
function getRandomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

module.exports = function () {
  const connectionTimeout =
    !process.env.TYPESENSE_CONNECTION_TIMEOUT_SECONDS || Number.isNaN(config.typesenseConnectionTimeoutSeconds) ? getRandomNumber(60, 90) : config.typesenseConnectionTimeoutSeconds;

  const retryInterval = !process.env.TYPESENSE_RETRY_INTERVAL_SECONDS || Number.isNaN(config.typesenseRetryIntervalSeconds) ? getRandomNumber(60, 120) : config.typesenseRetryIntervalSeconds;

  return new Typesense.Client({
    nodes: config.typesenseHosts.map((h) => {
      return {
        host: h,
        port: config.typesensePort,
        protocol: config.typesenseProtocol,
      };
    }),
    apiKey: config.typesenseAPIKey,
    connectionTimeoutSeconds: connectionTimeout,
    retryIntervalSeconds: retryInterval,
  });
};
