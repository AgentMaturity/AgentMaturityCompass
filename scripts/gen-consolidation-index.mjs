#!/usr/bin/env node
// Regenerates the audit binder crosswalk index in docs/catalog/CONSOLIDATION.md (P1-53) from the built package:
// the 36 binder controls (src/audit/auditMapBuiltin.ts) and the catalog controls whose crosswalk names them
// (amc-audit-map-v1). `--check` fails when the committed index differs. Build first (pnpm run build).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const DOC = join(root, "docs/catalog/CONSOLIDATION.md");
const BEGIN = "<!-- binder-index:begin (node scripts/gen-consolidation-index.mjs) -->";
const END = "<!-- binder-index:end -->";
const load = (rel) => import(pathToFileURL(join(root, "dist", rel)).href);
const [{ loadCatalog }, crosswalks, { defaultAuditMapBuiltin }] = await Promise.all([
  load("catalog/loader.js"), load("catalog/crosswalks.js"), load("audit/auditMapBuiltin.js")
]);
const ids = defaultAuditMapBuiltin().auditMap.controlFamilies.flatMap((f) => f.controls.map((c) => c.controlId));
const table = crosswalks.renderBinderCrosswalkIndex(crosswalks.binderCrosswalkIndex(loadCatalog(), ids));
const doc = readFileSync(DOC, "utf8");
const start = doc.indexOf(BEGIN);
const end = doc.indexOf(END);
if (start < 0 || end < start) throw new Error(`${DOC} lacks the binder-index markers`);
const next = `${doc.slice(0, start + BEGIN.length)}\n${table}\n${doc.slice(end)}`;
if (process.argv.includes("--check")) {
  if (next !== doc) { console.error("docs/catalog/CONSOLIDATION.md binder index is stale: run node scripts/gen-consolidation-index.mjs"); process.exit(1); }
  console.log(`binder index current (${ids.length} binder controls)`);
} else {
  writeFileSync(DOC, next);
  console.log(`wrote binder index (${ids.length} binder controls)`);
}
