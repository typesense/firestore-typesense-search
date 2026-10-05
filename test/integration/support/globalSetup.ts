import {execFileSync} from "node:child_process";
import {setTimeout as sleep} from "node:timers/promises";

const HEALTH_URL = "http://localhost:8108/health";
const STARTUP_TIMEOUT_MS = 120_000;

async function isTypesenseHealthy(): Promise<boolean> {
  try {
    const response = await fetch(HEALTH_URL);
    return response.ok;
  } catch {
    return false;
  }
}

export default async function setup(): Promise<() => void> {
  if (await isTypesenseHealthy()) {
    console.log("Using the Typesense server already running on :8108");
    return () => undefined;
  }

  console.log("Starting Typesense with docker compose...");
  execFileSync("docker", ["compose", "up", "--detach", "typesense"], {stdio: "inherit"});

  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (!(await isTypesenseHealthy())) {
    if (Date.now() > deadline) {
      throw new Error(`Typesense did not become healthy at ${HEALTH_URL} within ${STARTUP_TIMEOUT_MS / 1000}s`);
    }
    await sleep(1000);
  }

  return () => {
    execFileSync("docker", ["compose", "stop", "typesense"], {stdio: "inherit"});
  };
}
