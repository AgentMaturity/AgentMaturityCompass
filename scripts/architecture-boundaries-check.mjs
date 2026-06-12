#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

function lineCount(file) {
  return readFileSync(join(root, file), "utf8").split("\n").length;
}

const lineBudgets = [
  { file: "src/cli.ts", legacyAuditLineCount: 24417 },
  { file: "src/studio/studioServer.ts", legacyAuditLineCount: 8883 }
];

const lineCounts = Object.fromEntries(
  lineBudgets.map((budget) => [budget.file, lineCount(budget.file)])
);

for (const budget of lineBudgets) {
  const actual = lineCounts[budget.file];
  if (actual >= budget.legacyAuditLineCount) {
    fail(`${budget.file} has ${actual} lines; expected below audit baseline ${budget.legacyAuditLineCount}.`);
  }
}

const apiSource = readFileSync(join(root, "src/api/index.ts"), "utf8");
const prefixBranchCount = (apiSource.match(/pathname\.startsWith/g) ?? []).length;
if (!apiSource.includes("API_ROUTE_REGISTRY")) {
  fail("src/api/index.ts must expose API_ROUTE_REGISTRY.");
}
if (prefixBranchCount > 2) {
  fail(`src/api/index.ts still contains ${prefixBranchCount} pathname.startsWith checks; expected registry-based dispatch.`);
}

const cliPath = join(root, "dist", "cli.js");
if (!existsSync(cliPath)) {
  fail("dist/cli.js is missing; run npm run build before architecture-boundaries-check.");
} else {
  const inventory = spawnSync("node", [cliPath, "commands", "--json"], {
    cwd: root,
    encoding: "utf8",
    timeout: 60_000
  });
  if (inventory.status !== 0) {
    fail(`CLI command inventory failed: ${(inventory.stderr || inventory.stdout).slice(-1000)}`);
  } else {
    try {
      const parsed = JSON.parse(inventory.stdout);
      const paths = new Set(parsed.commands.map((command) => command.path));
      for (const commandPath of ["api", "api status", "api routes", "api start", "api docs"]) {
        if (!paths.has(commandPath)) {
          fail(`Missing CLI command path: ${commandPath}`);
        }
      }
    } catch (error) {
      fail(`Unable to parse CLI command inventory JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

const apiDistPath = join(root, "dist", "api", "index.js");
if (!existsSync(apiDistPath)) {
  fail("dist/api/index.js is missing; run npm run build before architecture-boundaries-check.");
} else {
  const api = await import(pathToFileURL(apiDistPath).href);
  if (!Array.isArray(api.API_ROUTE_REGISTRY) || api.API_ROUTE_REGISTRY.length < 30) {
    fail("Built API_ROUTE_REGISTRY is missing or too small.");
  }
  if (api.matchApiRoute?.("/api/v1/score/session")?.id !== "score") {
    fail("Built API registry no longer matches /api/v1/score/session.");
  }
  if (api.isPublicApiRoute?.("/api/v1/health") !== true) {
    fail("Built API registry no longer marks /api/v1/health public.");
  }
}

const result = {
  status: failures.length === 0 ? "passed" : "failed",
  lineCounts,
  prefixBranchCount,
  failures
};

if (failures.length > 0) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(result, null, 2));
