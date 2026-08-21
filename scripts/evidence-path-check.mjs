#!/usr/bin/env node
/**
 * Catches evidence paths that point at modules nobody wrote.
 *
 * Score modules credit an agent when a candidate path exists. 138 of the 213
 * `src/` paths named no module in the repository — most because AMC genuinely
 * lacks that capability, but some because the path was simply wrong: the
 * criterion looked for `src/ops/rateLimiter.ts` while the rate limiter shipped
 * at `src/product/toolRateLimiter.ts`, so AMC scored itself hasRateLimiting
 * false for a feature it has.
 *
 * A wrong path and an absent capability score identically — zero, forever, with
 * no signal. Freezing the known-absent set means a new nonexistent path, which
 * is almost always a typo, fails here instead.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const registryPath = join(root, "scripts", "evidence-paths.json");
const update = process.argv.includes("--update");

function collectPhantomPaths() {
  const phantom = new Set();
  for (const file of readdirSync(join(root, "src", "score"))) {
    if (!file.endsWith(".ts")) continue;
    const source = readFileSync(join(root, "src", "score", file), "utf8");
    if (!source.includes("evidencePathExists") && !source.includes("assessCriterion")) continue;
    for (const match of source.matchAll(/"(src\/[^"]+)"/g)) {
      if (!existsSync(join(root, match[1]))) phantom.add(match[1]);
    }
  }
  return [...phantom].sort();
}

const registry = JSON.parse(readFileSync(registryPath, "utf8"));
const known = new Set(registry.knownAbsentCapabilities);
const current = collectPhantomPaths();

if (update) {
  writeFileSync(registryPath, `${JSON.stringify({ ...registry, knownAbsentCapabilities: current }, null, 2)}\n`);
  console.log(`Recorded ${current.length} known-absent evidence paths.`);
  process.exit(0);
}

const added = current.filter((p) => !known.has(p));
const resolved = [...known].filter((p) => !current.includes(p));

if (added.length > 0) {
  console.error(
    "Evidence paths that name no module in the repository:\n" +
      added.map((p) => `  - ${p}`).join("\n") +
      "\n\nA criterion pointing at a path nobody wrote can never be met.\n" +
      "Either fix the path to name the module that provides the capability, or\n" +
      "if the capability really is absent, record it:\n" +
      "  node scripts/evidence-path-check.mjs --update"
  );
  process.exit(1);
}

if (resolved.length > 0) {
  console.log(
    `${resolved.length} previously-absent capability path(s) now exist. Run --update to record:\n` +
      resolved.map((p) => `  - ${p}`).join("\n")
  );
}
console.log(`Evidence paths check passed (${known.size} known-absent capabilities).`);
