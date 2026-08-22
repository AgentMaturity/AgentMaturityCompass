#!/usr/bin/env node
/**
 * Rescopes the vendored Cordis family from `@deepseek-ai/*` to `@amc/*`.
 *
 * The tree is vendored from DeepSeek Harness, which had already rescoped it
 * from upstream `@cordisjs/*` / `cordis` / `cosmokit` / `schemastery` for the
 * same reason we do: every consuming package declares the framework as a peer
 * dependency, so publishing the consumer publishes this layer too, and
 * publishing under the upstream names would squat them on the registry.
 *
 * What is deliberately NOT renamed, matching dsh's rule (vendor/README.md §17):
 * directory names, version numbers, dependency ranges, and every upstream
 * runtime identifier — `Symbol.for('schemastery')` and Schemastery's `vendor:`
 * metadata field keep their upstream values. Renaming those would change
 * behaviour, not packaging.
 *
 *   node scripts/vendor/rescope-vendor.mjs --check   report what would change
 *   node scripts/vendor/rescope-vendor.mjs --apply   rewrite in place
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const vendorDir = join(root, "vendor");
const FROM = "@deepseek-ai";
const TO = "@amc";

const apply = process.argv.includes("--apply");
const check = process.argv.includes("--check") || !apply;

/** Text files worth rewriting; skips LICENSE so upstream notices stay verbatim. */
const REWRITABLE = /\.(ts|tsx|js|mjs|cjs|json|md|yml|yaml)$/;

/**
 * Provenance records, excluded from both rewrite and check.
 *
 * UPSTREAM_LEDGER_DSH.md is DeepSeek Harness's own ledger, kept verbatim so
 * their reasoning is not paraphrased away — rewriting the scope inside it would
 * make it describe a rename that never happened there. VENDOR_DIVERGENCE.md
 * documents the rename and so must name both scopes to be readable at all.
 *
 * An earlier run rewrote the dsh ledger before this exclusion existed; it was
 * restored by reversing the substitution.
 */
const PROVENANCE_DOCS = new Set(["UPSTREAM_LEDGER_DSH.md", "VENDOR_DIVERGENCE.md"]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "lib") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (REWRITABLE.test(entry) && !PROVENANCE_DOCS.has(entry)) out.push(full);
  }
  return out;
}

const files = walk(vendorDir);
const changed = [];

for (const file of files) {
  const before = readFileSync(file, "utf8");
  if (!before.includes(FROM)) continue;
  const after = before.replaceAll(FROM, TO);
  changed.push({ file: file.replace(`${root}/`, ""), hits: before.split(FROM).length - 1 });
  if (apply) writeFileSync(file, after);
}

const total = changed.reduce((sum, c) => sum + c.hits, 0);

if (apply) {
  console.log(`Rescoped ${FROM}/* -> ${TO}/* : ${total} occurrences in ${changed.length} files.`);
  process.exit(0);
}

if (changed.length === 0) {
  console.log(`Vendor tree is fully rescoped to ${TO}/*.`);
  process.exit(0);
}

console.error(
  `Vendor tree still carries ${total} ${FROM} reference(s) in ${changed.length} file(s):\n` +
    changed.slice(0, 20).map((c) => `  - ${c.file} (${c.hits})`).join("\n") +
    (changed.length > 20 ? `\n  ...and ${changed.length - 20} more` : "") +
    `\n  Run: node scripts/vendor/rescope-vendor.mjs --apply`
);
process.exit(1);
