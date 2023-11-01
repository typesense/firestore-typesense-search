const {setup: setupDevServer} = require("jest-dev-server");

module.exports = async function globalSetup() {
  // eslint-disable-next-line no-undef
  globalThis.servers = await setupDevServer({
    command: "npm run typesenseServer",
    port: 8108,
    host: "0.0.0.0",
    usedPortAction: "ignore",
    launchTimeout: 50000,
    waitOnScheme: {
      window: 5000,
    },
  });
};
