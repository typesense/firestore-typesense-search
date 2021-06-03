const config = require("./config");
const Typesense = require("typesense");

module.exports = new Typesense.Client({
  nodes: config.typesenseHosts.map((h) => {
    return {
      host: h,
      port: config.typesensePort,
      protocol: config.typesenseProtocol,
    };
  } ),
  apiKey: config.typesenseAPIKey,
});
