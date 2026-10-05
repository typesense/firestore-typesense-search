import {execFileSync} from "node:child_process";
import {existsSync, readFileSync} from "node:fs";

const SELF = "scripts/forbid-escape-hatches.ts";

const FORBIDDEN: readonly {readonly pattern: RegExp; readonly reason: string}[] = [
  {pattern: /\b(?:eslint|oxlint)-(?:disable|enable)\b/, reason: "lint suppression comment"},
  {pattern: /@ts-(?:ignore|expect-error|nocheck)\b/, reason: "TypeScript suppression comment"},
  {pattern: /(?::|\bas|<|\|)\s*any\b(?!-)/, reason: "explicit `any`"},
];

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "*.ts", "*.mts", "*.cts", "*.js", "*.mjs", "*.cjs"], {
  encoding: "utf8",
})
  .split("\n")
  .filter((file) => file !== "" && file !== SELF && existsSync(file));

const violations: string[] = [];
for (const file of files) {
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, index) => {
      for (const {pattern, reason} of FORBIDDEN) {
        if (pattern.test(line)) violations.push(`${file}:${index + 1}: ${reason}: ${line.trim()}`);
      }
    });
}

if (violations.length > 0) {
  console.error(`Found ${violations.length} forbidden escape hatch(es):\n${violations.join("\n")}`);
  process.exit(1);
}
console.log(`No escape hatches in ${files.length} files.`);
