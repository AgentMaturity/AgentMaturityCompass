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

function cliCommandPaths() {
  const inventory = join(root, "docs/CLI_COMMAND_INVENTORY.md");
  if (!existsSync(inventory)) return null;
  const paths = [...readFileSync(inventory, "utf8").matchAll(/^\| `(amc [^`]+)` \|/gm)]
    .map((match) => match[1]);
  if (paths.length === 0 || new Set(paths).size !== paths.length) {
    throw new Error("CLI command inventory must contain nonempty, unique command paths.");
  }
  return paths.length;
}

export async function collectCounts() {
  const testFiles = walk(join(root, "tests"), (n) => n.endsWith(".test.ts")).length;
  // Retained for inventory consumers: lexical matches, not discovered cases
  // or execution outcomes. Public surfaces use testFiles instead.
  const testBlocks = walk(join(root, "tests"), (n) => n.endsWith(".test.ts"))
    .reduce((sum, f) => {
      const src = readFileSync(f, "utf8");
      return sum + (src.match(/^\s*(it|test)\s*\(/gm) ?? []).length;
    }, 0);

  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

  return {
    adapters: countFiles("src/adapters/builtins", isTs),
    cliCommandPaths: cliCommandPaths(),
    assurancePackFiles: countFiles("src/assurance/packs", (n) => isTs(n) && n !== "index.ts" && n !== "industryPackManifest.ts"),
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
    testBlocksMethodology: "Regex matches for direct it()/test() calls in tests/**/*.test.ts; may include comments and omit parameterized or generated cases. Not executed tests or passing results.",
    version: pkg.version,
    license: pkg.license
  };
}

const counts = await collectCounts();

if (mode === "json") {
  console.log(JSON.stringify(counts, null, 2));
  process.exit(0);
}

// Only current-facing surfaces are managed. Dated audit/source-review records
// remain historical evidence and are deliberately outside this allowlist.
const CLI_COUNT_SURFACES = new Set([
  "README.md",
  "docs/API_REFERENCE.md",
  "docs/PRICING.md",
  "docs/PRICING_FAQ.md",
  "docs/PRODUCT_EDITIONS.md",
  "docs/ENTERPRISE.md",
  "docs/BENCHMARK_GALLERY.md",
  "website/index.html",
  "website/i18n.js",
  "website/docs/cli.html",
  "website/docs/competitive-analysis.md",
  "src/console/assets/app.js"
]);
const ADAPTER_COUNT_SURFACES = new Set([
  "README.md", "website/index.html", "docs/PRICING.md", "docs/PRICING_FAQ.md"
]);
const PUBLIC_SURFACES = new Set([
  "README.md",
  "CONTRIBUTING.md",
  "website/index.html",
  "website/lite.html",
  "website/i18n.js",
  "docs/content/show-hn-draft.md",
  "docs/content/reddit-launch-drafts.md",
  "docs/internal/competitive-landscape.md",
  "docs/internal/mirofish-simulation-council.md",
  "whitepaper/AMC_WHITEPAPER_v1.md",
  ...CLI_COUNT_SURFACES
]);
const failures = [];
const updates = new Map();
const marker = /<!-- amc:count:(\w+) -->(.*?)<!-- \/amc:count -->/g;
const fileCount = counts.testFiles.toLocaleString("en-US");
const encodedFileCount = fileCount.replace(/,/g, "%2C");

for (const rel of PUBLIC_SURFACES) {
  const path = join(root, rel);
  if (!existsSync(path)) continue;
  const original = readFileSync(path, "utf8");
  let updated = original;

  // Strip markers/tags before inspecting rendered claims, including split
  // HTML labels. A source count cannot attest that any test passed.
  const visible = original.replace(marker, "$2").replace(/<[^>]*>/g, " ");
  const passingClaim = /\b\d[\d,]*\s+(?:passing\s+(?:Vitest\s+)?tests?\b|(?:Vitest\s+)?tests?\s+passing\b)/i;
  const passingBadge = /tests-(?:\d|,|%2c)+%20passing/i;
  if (passingClaim.test(visible) || passingBadge.test(original)) {
    failures.push(`${rel}: unsupported passing-test claim. Publish test source files; execution results require a separate run receipt.`);
  }
  if (original.includes("<!-- amc:count:testBlocks -->")) {
    failures.push(`${rel}: testBlocks is regex inventory, not a public test result. Use the testFiles source inventory.`);
  }

  updated = updated.replace(marker, (whole, key, current) => {
    // Counts appear in prose, so large ones use thousands separators.
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
  });

  // Anchored inventory templates: never rewrite an unrelated number or a
  // historical runtime result to the value measured from source paths.
  updated = updated
    .replace(/test%20source%20files-(?:\d|,|%2c)+/gi, `test%20source%20files-${encodedFileCount}`)
    .replace(/\b\d[\d,]*(?= (?:Vitest )?test source files\b)/gi, fileCount)
    .replace(/(?<=stat-value">)[\d,]+(?=<\/span><span class="stat-label">test source files)/g, fileCount)
    .replace(/(?<=<b>)[\d,]+(?=<\/b><span>Test source<br>files)/g, fileCount);

  if (CLI_COUNT_SURFACES.has(rel)) {
    const templates = [
      /\b\d[\d,]*(?= (?:(?:registered|public) )?CLI (?:command paths|paths)\b)/gi,
      /(?<=CLI \()[\d,]+(?= command paths\))/g,
      /(?<=CLI Reference \()[\d,]+(?= command paths\))/g,
      /(?<=AMC CLI currently registers )[\d,]+(?= command paths\b)/g,
      /(?<=stat-value">)[\d,]+(?=<\/span><span class="stat-label">CLI commands)/g,
      /(?<=\| CLI command paths \| )[\d,]+(?= \|)/g
    ];
    for (const template of templates) {
      updated = updated.replace(template, (current) => {
        if (counts.cliCommandPaths === null) {
          failures.push(`${rel}: CLI command inventory is unavailable; cannot verify command-path claims.`);
          return current;
        }
        return counts.cliCommandPaths.toLocaleString("en-US");
      });
    }
  }
  if (ADAPTER_COUNT_SURFACES.has(rel)) {
    updated = updated.replace(/\b\d[\d,]*(?= (?:built-in |framework )?adapters\b)/gi, String(counts.adapters));
  }

  if (updated !== original) {
    if (mode === "check") {
      failures.push(`${rel}: published counts are stale. Run: node scripts/gen-counts.mjs --write`);
    } else {
      updates.set(path, updated);
    }
  }
}

if (failures.length > 0) {
  console.error("Published count check failed:\n" + failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
if (mode === "check") {
  console.log("Published source counts match the repository; this check does not execute tests.");
  process.exit(0);
}

for (const [path, content] of updates) writeFileSync(path, content);
console.log(updates.size > 0 ? `Updated ${updates.size} file(s).` : "No changes needed.");
