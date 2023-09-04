const config = require("./config");
const Typesense = require("typesense");

function getRandomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

module.exports = new Typesense.Client({
  nodes: config.typesenseHosts.map((h) => {
    return {
      host: h,
      port: config.typesensePort,
      protocol: config.typesenseProtocol,
    };
  } ),
  apiKey: config.typesenseAPIKey,
  connectionTimeoutSeconds: getRandomNumber(60, 90),
  retryIntervalSeconds: getRandomNumber(60, 120),
});
