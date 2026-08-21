#!/usr/bin/env node
/**
 * Single source of truth for the numbers AMC publishes about itself.
 *
 * Every count that mattered had at least two live values: 15 adapters against a
 * "14 Framework Adapters" heading in the same README, 244 questions against
 * 138/67/111/240 across the docs, 143 registered packs against "142" in three
 * places and 149 files on disk, 1,121 test files against a badge reading 1,087.
 *
 * For a product whose thesis is that documented claims drift from provable
 * reality, publishing drifted claims is a live counter-example. This script
 * measures the repo and either reports (--json), rewrites the markers
 * (--write), or fails when a committed number disagrees (--check).
 *
 * Markers in docs look like:
 *   <!-- amc:count:adapters -->15<!-- /amc:count -->
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const mode = process.argv.includes("--check")
  ? "check"
  : process.argv.includes("--write")
    ? "write"
    : "json";

function walk(dir, filter, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, filter, out);
    else if (filter(entry.name)) out.push(full);
  }
  return out;
}

function countFiles(dir, filter) {
  return existsSync(join(root, dir))
    ? readdirSync(join(root, dir)).filter(filter).length
    : 0;
}

/** Counts registered entries by importing the built artifact. */
async function registered(modulePath, fn) {
  const built = join(root, "dist", modulePath);
  if (!existsSync(built)) return null;
  const mod = await import(built);
  return typeof mod[fn] === "function" ? mod[fn]().length : null;
}

const isTs = (n) => n.endsWith(".ts");

export async function collectCounts() {
  const testFiles = walk(join(root, "tests"), (n) => n.endsWith(".test.ts")).length;
  const testBlocks = walk(join(root, "tests"), (n) => n.endsWith(".test.ts"))
    .reduce((sum, f) => {
      const src = readFileSync(f, "utf8");
      return sum + (src.match(/^\s*(it|test)\s*\(/gm) ?? []).length;
    }, 0);

  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

  return {
    adapters: countFiles("src/adapters/builtins", isTs),
    assurancePackFiles: countFiles("src/assurance/packs", (n) => isTs(n) && n !== "index.ts"),
    assurancePacksRegistered: await registered("assurance/packs/index.js", "listAssurancePacks"),
    scoreModules: countFiles("src/score", (n) => isTs(n) && n !== "index.ts"),
    diagnosticQuestions: await (async () => {
      const built = join(root, "dist/diagnostic/questionBank.js");
      if (!existsSync(built)) return null;
      const mod = await import(built);
      const arr = Object.values(mod).find((v) => Array.isArray(v) && v.length > 100);
      return arr ? arr.length : null;
    })(),
    testFiles,
    testBlocks,
    version: pkg.version,
    license: pkg.license
  };
}

const counts = await collectCounts();

if (mode === "json") {
  console.log(JSON.stringify(counts, null, 2));
  process.exit(0);
}

// ── Marker rewriting / verification ──────────────────────────────────────
const TRACKED_FILES = ["README.md"];
const failures = [];
let rewrote = 0;

for (const rel of TRACKED_FILES) {
  const path = join(root, rel);
  if (!existsSync(path)) continue;
  const original = readFileSync(path, "utf8");
  let updated = original;

  updated = updated.replace(
    /<!-- amc:count:(\w+) -->(.*?)<!-- \/amc:count -->/g,
    (whole, key, current) => {
      // Counts appear in prose, so large ones are written with thousands
      // separators to match how a reader sees them.
      const raw = counts[key];
      const truth =
        typeof raw === "number" && raw >= 1000 ? raw.toLocaleString("en-US") : raw;
      if (raw === undefined || raw === null) {
        failures.push(`${rel}: unknown count key "${key}"`);
        return whole;
      }
      if (String(truth) !== current) {
        if (mode === "check") {
          failures.push(
            `${rel}: ${key} says ${current}, actual is ${truth}. Run: node scripts/gen-counts.mjs --write`
          );
        }
        return `<!-- amc:count:${key} -->${truth}<!-- /amc:count -->`;
      }
      return whole;
    }
  );

  if (mode === "write" && updated !== original) {
    writeFileSync(path, updated);
    rewrote += 1;
  }
}

if (mode === "check") {
  if (failures.length > 0) {
    console.error("Count drift detected:\n" + failures.map((f) => `  - ${f}`).join("\n"));
    process.exit(1);
  }
  console.log("Counts match the repository.");
  process.exit(0);
}

console.log(rewrote > 0 ? `Updated ${rewrote} file(s).` : "No changes needed.");
