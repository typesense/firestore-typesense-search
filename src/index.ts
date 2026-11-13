import {requiresRole} from "firebase-functions";
import {assertConfigAtLoad} from "./config.js";

assertConfigAtLoad();

requiresRole("roles/datastore.user");
requiresRole("roles/eventarc.eventReceiver");
requiresRole("roles/run.invoker");

export {indexOnWrite} from "./indexOnWrite.js";
export {backfill} from "./backfill.js";
