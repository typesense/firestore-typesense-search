import {execFileSync} from "node:child_process";
import {copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync} from "node:fs";
import path from "node:path";

const OUT_DIR = "dist";
const PACKAGE_DIR = path.join(OUT_DIR, "package");
const DOCS = ["README.md", "CHANGELOG.md", "UPGRADING.md"];

function run(command: string, args: readonly string[], cwd = "."): string {
  return execFileSync(command, args, {cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"]});
}

function readDependencies(packageJsonPath: string): Readonly<Record<string, string>> {
  const parsed: unknown = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  if (typeof parsed !== "object" || parsed === null || !("dependencies" in parsed)) return {};
  const {dependencies} = parsed;
  if (typeof dependencies !== "object" || dependencies === null) return {};
  return Object.fromEntries(Object.entries(dependencies).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

function installedVersion(dependency: string): string {
  const parsed: unknown = JSON.parse(readFileSync(path.join("functions/node_modules", dependency, "package.json"), "utf8"));
  if (typeof parsed !== "object" || parsed === null || !("version" in parsed) || typeof parsed.version !== "string") {
    throw new Error(`Cannot read the installed version of ${dependency}`);
  }
  return parsed.version;
}

rmSync(OUT_DIR, {recursive: true, force: true});
mkdirSync(OUT_DIR);
rmSync("functions/lib", {recursive: true, force: true});
rmSync("functions/tsconfig.tsbuildinfo", {force: true});
run("pnpm", ["--filter", "./functions", "build"]);

run("npm", ["pack", "--ignore-scripts", "--pack-destination", path.resolve(OUT_DIR)], "functions");
const tarball = readdirSync(OUT_DIR).find((file) => file.endsWith(".tgz"));
if (tarball === undefined) throw new Error("npm pack produced no tarball");
run("tar", ["xzf", tarball], OUT_DIR);
rmSync(path.join(OUT_DIR, tarball));

for (const doc of DOCS) copyFileSync(doc, path.join(PACKAGE_DIR, doc));
run("npm", ["pkg", "delete", "devDependencies", "scripts"], PACKAGE_DIR);
run("npm", ["pkg", "set", "engines.node=>=22"], PACKAGE_DIR);

const ranges = readDependencies(path.join(PACKAGE_DIR, "package.json"));
const tested = Object.keys(ranges).map((dependency) => `${dependency}@${installedVersion(dependency)}`);
run("npm", ["install", "--package-lock-only", "--no-audit", "--no-fund", "--save-exact", ...tested], PACKAGE_DIR);
run("npm", ["pkg", "set", ...Object.entries(ranges).map(([dependency, range]) => `dependencies.${dependency}=${range}`)], PACKAGE_DIR);
run("npm", ["install", "--package-lock-only", "--no-audit", "--no-fund"], PACKAGE_DIR);
run("npm", ["shrinkwrap"], PACKAGE_DIR);

console.log(`Packed ${PACKAGE_DIR} with dependencies pinned to the tested versions: ${tested.join(", ")}`);
