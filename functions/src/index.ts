import {requiresRole} from "firebase-functions";

requiresRole("roles/datastore.user");

export {indexOnWrite} from "./indexOnWrite.js";
export {backfill} from "./backfill.js";
