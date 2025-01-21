const {execSync, spawn} = require("child_process");
const firebase = require("firebase-admin");
const path = require("path");
const fs = require("fs");

const directConsole = require("console");

/**
 * Load the default Firebase project ID from .firebaserc and set it to process.env.GCLOUD_PROJECT.
 * Also set FIRESTORE_EMULATOR_HOST to the Firestore emulator host.
 * @param {string} projectRootPath the path to the root of the project
 * @throws {Error} - If the .firebaserc file is missing or the default project is not set.
 */
function loadFirebaseEnvironment(projectRootPath) {
  try {
    const firebaseRc = JSON.parse(fs.readFileSync(path.resolve(projectRootPath, ".firebaserc"), "utf8"));
    const defaultProjectId = firebaseRc.projects?.default;

    if (!defaultProjectId) {
      throw new Error("No default project found in .firebaserc");
    }

    process.env.GCLOUD_PROJECT = defaultProjectId;
    process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080"; // explcitly set emulator host, used for firebase-admin
  } catch (error) {
    console.error("Error loading .firebaserc:", error.message);
    throw error;
  }
}

/**
 * Class that sets up a test environment for the Firestore Typesense Search extension.
 * <p>
 * Creates a new Firebase project, sets up the Firestore emulator, and
 * configures the extension to use the Firestore emulator as the backend.
 * <p>
 * Also provides a Firestore client for tests to use, and a Typesense client
 * that is configured to connect to the Typesense server running on localhost.
 * <p>
 * Additionally, provides a method to capture the emulator logs and write them
 * to a file.
 */
class TestEnvironment {
  // Global ouput all emulator logs
  projectRootPath = path.resolve(__dirname, "../../");
  firebaseEnvPath = "extensions/firestore-typesense-search.env.local";
  shouldOutputAllEmulatorLogs = false;
  dotenvPath = null;
  dotenvConfig = null;

  // Emulator vars
  emulator = null;
  capturedEmulatorLogs = "";
  shouldLogEmulator = false;

  // Test client case vars
  config = null;
  firebaseApp = null;
  firestore = null;
  typesense = null;

  /**
   * Initialize a test environment with a specific dotenv config and a flag for logging all emulator logs.
   * @param {{dotenvConfig: string, debugLog: boolean}} config
   * @param {string} config.dotenvConfig - path to the env file to use for the firebase emulator and test
   * @param {boolean} config.debugLog - whether to log all emulator logs to console
   */
  constructor({
    dotenvPath,
    dotenvConfig,
    outputAllEmulatorLogs = false,
  } = {}) {
    this.dotenvPath = dotenvPath;
    this.dotenvConfig = dotenvConfig;
    this.shouldOutputAllEmulatorLogs = outputAllEmulatorLogs;

    if (dotenvPath && dotenvConfig) {
      throw new Error("Provide either 'dotenvPath' or 'dotenvConfig', not both.");
    }
  }

  /**
   * Set up a test environment for the Firestore Typesense Search extension.
   * <p>
   * Creates a new Firebase project, sets up the Firestore emulator, and
   * configures the extension to use the Firestore emulator as the backend.
   * <p>
   * Also provides a Firestore client for tests to use, and a Typesense client
   * that is configured to connect to the Typesense server running on localhost.
   * <p>
   * @param {function} done - callback to call when the test environment is set up
   */
  setupTestEnvironment(done) {
    directConsole.log("Setting Up Firebase emulator...");
    if (this.dotenvPath) {
      directConsole.log(`Copying ${this.dotenvPath} to ${this.firebaseEnvPath}...`);
      execSync(
        `cp -f ${this.dotenvPath} ${this.firebaseEnvPath}`,
      );
    } else if (this.dotenvConfig) {
      fs.writeFileSync(this.firebaseEnvPath, this.dotenvConfig);
    }

    this.emulator = spawn(
      "firebase",
      [
        "emulators:start",
        "--only",
        "functions,firestore,extensions",
      ],
      {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          NODE_OPTIONS: "--experimental-vm-modules",
          FORCE_COLOR: "1",
        },
      },
    );

    // Listen for logs from the emulator
    this.emulator.stdout.on("data", (data) => {
      let logMessage = data.toString().trim();

      if (this.shouldLogEmulator) {
        try {
          // eslint-disable-next-line no-control-regex
          const stripAnsi = (str) => str.replace(/\x1b\[[0-9;]*m/g, "");
          let flatLogMessage = stripAnsi(logMessage);

          if (flatLogMessage.startsWith(">")) {
            flatLogMessage = flatLogMessage.replace(/^>\s*/, ""); // Removes "> "
          }

          const parsedLog = JSON.parse(flatLogMessage);
          logMessage = parsedLog.message;
        } catch (e) {
          // Not a JSON log, keep the original logMessage
        }
        this.capturedEmulatorLogs += logMessage + "\n";
      }

      if (this.shouldOutputAllEmulatorLogs) {
        directConsole.log(logMessage);
      }

      if (logMessage.includes("All emulators ready")) { // Adjust to the actual readiness log message
        directConsole.log("Emulator is ready");

        try {
          directConsole.log("Loading testing firebase config and modules...");
          const dotenvResult = require("dotenv").config({path: path.resolve(this.projectRootPath, this.firebaseEnvPath)}); // load same .env as emulator
          if (dotenvResult.error) {
            throw dotenvResult.error;
          }

          this.config = require(path.resolve(this.projectRootPath, "functions/src/config.js"));
          this.typesense = require(path.resolve(this.projectRootPath, "functions/src/createTypesenseClient.js"))();

          loadFirebaseEnvironment(this.projectRootPath);

          directConsole.log("Initializing Firebase Admin Client...");
          this.firebaseApp = firebase.initializeApp({
            databaseURL: `${process.env.FIRESTORE_EMULATOR_HOST}?ns=${process.env.GCLOUD_PROJECT}`,
            projectId: process.env.GCLOUD_PROJECT,
          });
          this.firestore = this.firebaseApp.firestore();

          directConsole.log("Test environment initialization complete");
          this.shouldLogEmulator = true;
          done();
        } catch (e) {
          directConsole.error("Error loading environment variables:", e);
          done(e);
        }
      }
    });

    this.emulator.stderr.on("data", (data) => {
      directConsole.error(data.toString());
    });

    this.emulator.on("close", (code) => {
      if (code !== 0) {
        done(new Error("Emulator exited unexpectedly."));
      }
    });
  }

  /**
   * Reset the captured emulator logs.
   * This will clear the logs collected from the Firebase Emulator.
   */
  resetCapturedEmulatorLogs() {
    this.capturedEmulatorLogs = "";
  }

  /**
   * Clean up the test environment after all tests have run.
   * This will shut down the Firebase Emulator and clean up any data that was created during the tests.
   */
  async teardownTestEnvironment() {
    this.shouldLogEmulator = false;
    if (this.emulator) {
      this.emulator.kill("SIGINT");
      await new Promise((resolve) => this.emulator.on("exit", resolve));
    }

    await this.firebaseApp.delete();
  }

  /**
   * Clears all data in Firestore and Typesense before a test is run.
   * This will delete the Firestore collection and any data in it, and
   * delete the Typesense collection and any data in it.
   */
  async clearAllData() {
    try {
      await this.firestore.recursiveDelete(this.firestore.collection(this.config.firestoreCollectionPath));
    } catch (e) {
      directConsole.info(`${this.config.firestoreCollectionPath} collection not found, proceeding...`);
    }

    try {
      await this.typesense.collections(encodeURIComponent(this.config.typesenseCollectionName)).delete();
    } catch (e) {
      directConsole.info(`${this.config.typesenseCollectionName} collection not found, proceeding...`);
    }
    await this.typesense.collections().create({
      name: this.config.typesenseCollectionName,
      fields: [{name: ".*", type: "auto"}],
      enable_nested_fields: true,
    });
  }
}

module.exports = {
  TestEnvironment,
};
