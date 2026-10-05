import {getApp, getApps, initializeApp, type App} from "firebase-admin/app";

const DEFAULT_APP_NAME = "[DEFAULT]";

export function getDefaultApp(): App {
  return getApps().some((app) => app.name === DEFAULT_APP_NAME) ? getApp() : initializeApp();
}
