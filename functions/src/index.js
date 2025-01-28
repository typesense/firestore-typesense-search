require("dotenv").config();

const {indexOnWrite} = require("./indexOnWrite.js");
exports.indexOnWrite = indexOnWrite;
exports.backfill = require("./backfill.js");
