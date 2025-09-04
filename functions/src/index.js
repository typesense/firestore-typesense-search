require("dotenv").config();

// import all functions from indexOnWrite.js (including dynamically generated ones)
const indexOnWriteModule = require("./indexOnWrite.js");

// export all functions from indexOnWrite module
Object.keys(indexOnWriteModule).forEach((key) => {
  exports[key] = indexOnWriteModule[key];
});

exports.backfill = require("./backfill.js");
