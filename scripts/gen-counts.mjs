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

// ── Prose surfaces ───────────────────────────────────────────────────────
/**
 * Nine public files state the same counts as plain prose rather than markers,
 * so `--write` updated README and left the badge, both websites, CONTRIBUTING,
 * the launch drafts and the whitepaper to be hand-edited. That is precisely the
 * drift this script exists to end, and it is what let the published figure sit
 * at 8,604 while the repository held 8,478.
 *
 * Each pattern is anchored to its surrounding words so only genuine count
 * claims are rewritten, never an unrelated number that happens to look similar.
 */
const PROSE_PATTERNS = [
  // README CI badge, where the thousands separator is URL-encoded.
  { key: "testBlocks", encoded: true, re: /(tests-)([\d,]|%2C)+(%20passing)/g, wrap: (m, truth) => `tests-${truth}%20passing` },
  { key: "testBlocks", re: /([\d,]+)( passing Vitest tests)/g },
  { key: "testBlocks", re: /([\d,]+)( passing tests)/g },
  { key: "testBlocks", re: /([\d,]+)( Passing Tests)/g },
  { key: "testBlocks", re: /(?<=stat-value">)([\d,]+)(?=<\/span><span class="stat-label">passing tests)/g },
  { key: "testBlocks", re: /(?<=<b>)([\d,]+)(?=<\/b><span>Tests)/g },
  { key: "testFiles", re: /(across )([\d,]+)( files)/g, group: 2 }
];

const PROSE_SURFACES = [
  "README.md",
  "CONTRIBUTING.md",
  "website/index.html",
  "website/lite.html",
  "website/i18n.js",
  "docs/content/show-hn-draft.md",
  "docs/content/reddit-launch-drafts.md",
  "docs/internal/competitive-landscape.md",
  "docs/internal/mirofish-simulation-council.md",
  "whitepaper/AMC_WHITEPAPER_v1.md"
];

const plain = (key) => counts[key].toLocaleString("en-US");
const encoded = (key) => plain(key).replace(/,/g, "%2C");

for (const rel of PROSE_SURFACES) {
  const path = join(root, rel);
  if (!existsSync(path)) continue;
  const original = readFileSync(path, "utf8");
  let updated = original;

  for (const pattern of PROSE_PATTERNS) {
    const truth = pattern.encoded ? encoded(pattern.key) : plain(pattern.key);
    updated = updated.replace(pattern.re, (whole, ...groups) => {
      if (pattern.wrap) return pattern.wrap(whole, truth);
      if (pattern.group === 2) {
        const [before, current, after] = groups;
        return current === truth ? whole : `${before}${truth}${after}`;
      }
      // Lookaround patterns capture the bare number; the rest carry a suffix.
      if (groups.length >= 2 && typeof groups[1] === "string") {
        const [current, after] = groups;
        return current === truth ? whole : `${truth}${after}`;
      }
      return whole === truth ? whole : truth;
    });
  }

  if (updated !== original) {
    if (mode === "check") {
      failures.push(`${rel}: published counts are stale. Run: node scripts/gen-counts.mjs --write`);
    } else if (mode === "write") {
      writeFileSync(path, updated);
      rewrote += 1;
    }
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
