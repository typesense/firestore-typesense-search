import {requiresRole} from "firebase-functions";
import {assertNoRemovedParams} from "./config.js";

assertNoRemovedParams();

requiresRole("roles/datastore.user");

export {indexOnWrite} from "./indexOnWrite.js";
export {backfill} from "./backfill.js";
