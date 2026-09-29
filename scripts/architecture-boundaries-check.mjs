#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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

// ── Descending line-count ratchet ────────────────────────────────────────
//
// The previous version tracked two files and only checked "stayed under the
// audit baseline". That permanently blessed the two worst monoliths: cli.ts
// could shrink to 20,000 lines and grow straight back to 24,416 without
// complaint, and the other 57 files over the cap were unguarded entirely.
//
// Now every file over CAP carries a baseline that only moves down. Shrinking a
// file lowers its baseline (with --update); growing past it fails. A new file
// over CAP is rejected outright, so the set cannot expand.

const budgetsPath = join(root, "scripts/line-budgets.json");
const budgetsFile = JSON.parse(readFileSync(budgetsPath, "utf8"));
const CAP = budgetsFile.cap ?? 800;
const recorded = budgetsFile.budgets ?? {};
const dataRegistries = budgetsFile.dataRegistries ?? [];
const updateMode = process.argv.includes("--update");

// Data registries: append-only catalogs (question banks, compliance mappings,
// industry packs) where the 800-line cap does not apply, because the cap exists
// to keep *logic* reviewable and there is nearly none here.
//
// The exemption is verified, not asserted: a listed file must stay below
// MAX_LOGIC_RATIO, so nobody can park logic in one to dodge the cap.
const MAX_LOGIC_RATIO = 0.03;
const LOGIC_PATTERN =
  /^\s*(if|for|while|switch|return|throw|try|catch|function |export function |export async function |class |=>\s*\{)/;

function logicRatio(file) {
  const lines = readFileSync(join(root, file), "utf8").split("\n");
  const logic = lines.filter((l) => LOGIC_PATTERN.test(l)).length;
  return lines.length === 0 ? 0 : logic / lines.length;
}

function allSourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) allSourceFiles(full, out);
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

const lineCounts = {};
const improvements = [];
const nextBudgets = {};

for (const file of allSourceFiles(join(root, "src")).map((f) => f.slice(root.length + 1))) {
  const actual = lineCount(file);
  lineCounts[file] = actual;
  const baseline = recorded[file];

  if (dataRegistries.includes(file)) {
    // Exempt from the cap, but only while it really is data.
    const ratio = logicRatio(file);
    if (ratio > MAX_LOGIC_RATIO) {
      fail(
        `${file} is listed as a data registry but ${(ratio * 100).toFixed(1)}% of its ` +
          `lines are logic (limit ${(MAX_LOGIC_RATIO * 100).toFixed(0)}%). ` +
          `Move the logic out, or remove it from dataRegistries and split the file.`
      );
    }
    continue;
  }

  if (baseline === undefined) {
    // Not currently over the cap and not tracked: only a fresh violation matters.
    if (actual > CAP) {
      fail(
        `${file} is a new file of ${actual} lines, over the ${CAP}-line cap. ` +
          `Split it, or record a deliberate exception in scripts/line-budgets.json.`
      );
    }
    continue;
  }

  if (actual > baseline) {
    fail(
      `${file} grew to ${actual} lines, past its ${baseline}-line baseline. ` +
        `Files over the cap may shrink but must not grow.`
    );
    nextBudgets[file] = baseline;
    continue;
  }

  if (actual < baseline) improvements.push({ file, from: baseline, to: actual });
  // Ratchet: the new baseline is wherever the file now sits.
  nextBudgets[file] = actual <= CAP ? undefined : actual;
}

// Files that fell to or below the cap leave the manifest entirely.
for (const key of Object.keys(nextBudgets)) {
  if (nextBudgets[key] === undefined) delete nextBudgets[key];
}

if (improvements.length > 0) {
  const total = improvements.reduce((sum, i) => sum + (i.from - i.to), 0);
  console.log(`Line ratchet: ${improvements.length} file(s) shrank by ${total} lines.`);
  for (const i of improvements.slice(0, 10)) {
    console.log(`  ${i.file}: ${i.from} -> ${i.to}`);
  }
  if (updateMode) {
    writeFileSync(
      budgetsPath,
      `${JSON.stringify(
        {
          _comment: budgetsFile._comment,
          cap: CAP,
          // Must be carried through: dropping it turns every exempt registry
          // into a "new file over the cap" on the next run.
          dataRegistries,
          budgets: Object.fromEntries(
            Object.entries(nextBudgets).sort((a, b) => b[1] - a[1])
          )
        },
        null,
        2
      )}\n`
    );
    console.log(`Updated ${budgetsPath}. Commit it to lock in the improvement.`);
  } else {
    console.log("Run with --update to lower the baselines and lock this in.");
  }
}

// ── Workspace-package imports stay inside the kernel boundary ────────────
//
// @amc/core and the vendored @amc/cordis packages are workspace packages, not
// published ones: the npm tarball does not contain them. A src/ module that
// imports one is fine only if nothing on a normal CLI path reaches it —
// otherwise `npm install agent-maturity-compass` produces a CLI that throws
// ERR_MODULE_NOT_FOUND on first use.
//
// Only the runtime seam may import these packages. The build bundles that
// module for both installed native execution and composition inspection.
const KERNEL_IMPORT_ALLOWED = [/^src\/kernel\/amcRuntime\.ts$/];

function walkSources(dir, out = []) {
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walkSources(rel, out);
    else if (entry.name.endsWith(".ts")) out.push(rel);
  }
  return out;
}

for (const file of walkSources("src")) {
  if (KERNEL_IMPORT_ALLOWED.some((allowed) => allowed.test(file))) continue;
  const source = readFileSync(join(root, file), "utf8");
  // Type-only imports are erased by tsc, so they cost nothing at runtime.
  const runtimeImport = /(?<!import type )(?:from|import\()\s*["'`]@amc\/(core|cordis)/;
  if (runtimeImport.test(source.replace(/import type[^;]*;/g, ""))) {
    fail(
      `${file} imports a workspace package (@amc/core or @amc/cordis) outside src/kernel/. ` +
        `Those packages are not in the published tarball, so an npm install would fail at runtime.`
    );
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
