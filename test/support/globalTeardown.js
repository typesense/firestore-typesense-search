const {teardown: teardownDevServer} = require("jest-dev-server");

module.exports = async function globalTeardown() {
  // eslint-disable-next-line no-undef
  return await teardownDevServer(globalThis.servers);
};
