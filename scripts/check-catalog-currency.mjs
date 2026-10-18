#!/usr/bin/env node
/**
 * Catalog review currency (P1-34, docs/catalog/GOVERNANCE.md). Reports reviews due within 14 days (warning), overdue
 * reviews (error for reviewed and qualified content, warning otherwise), reviewed content whose next review cannot be
 * scheduled or that cites an instrument tied to an open re-verify item (GOV_REVERIFY_OPEN, error), and register entries
 * due a status review (warning). A malformed catalog or governance file is an error. Exit 1 on any error. Nothing is
 * edited: overdue content is only compiled as experimental. Reads dist/ (build first).
 *
 * Usage: node scripts/check-catalog-currency.mjs [--as-of YYYY-MM-DD] [--json]
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { isEntrypoint } from "./lib/entrypoint.mjs";

async function main(argv) {
  const { values } = parseArgs({ args: argv, options: { "as-of": { type: "string" }, json: { type: "boolean" } } });
  const asOf = values["as-of"] ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error(`--as-of ${asOf} is not YYYY-MM-DD`);
  const root = process.cwd();
  const dist = (rel) => join(root, "dist", rel);
  if (!existsSync(dist("catalog/governance/index.js"))) throw new Error("Build first: dist/catalog/governance/index.js not found (pnpm run build).");
  const { loadCatalog } = await import(pathToFileURL(dist("catalog/loader.js")).href);
  const { catalogCurrencyFindings, readGovernance } = await import(pathToFileURL(dist("catalog/governance/index.js")).href);
  const { REGULATORY_REGISTER } = await import(pathToFileURL(dist("compliance/regulatory/index.js")).href);

  const catalogRoot = join(root, "catalog");
  const cat = loadCatalog({ root: catalogRoot });
  const governance = readGovernance(catalogRoot);
  const findings = [
    ...[...cat.issues, ...governance.issues].filter((i) => i.severity === "error")
      .map((i) => ({ code: i.code, severity: "error", controlId: i.controlId, message: `${i.file} ${i.path}: ${i.message}` })),
    ...catalogCurrencyFindings(cat, REGULATORY_REGISTER, governance.reverify, asOf)
  ];
  const errors = findings.filter((f) => f.severity === "error").length;
  if (values.json) {
    console.log(JSON.stringify({ asOf, controls: cat.controls.size, reverifyOpen: governance.reverify.filter((i) => i.status === "open").length, findings }, null, 2));
  } else {
    for (const f of findings) (f.severity === "error" ? console.error : console.log)(`${f.severity} ${f.code}${f.controlId ? ` ${f.controlId}` : ""}: ${f.message}`);
    console.log(`Catalog currency as of ${asOf}: ${cat.controls.size} controls, ${errors} errors, ${findings.length - errors} warnings; `
      + `${governance.reverify.filter((i) => i.status === "open").length} re-verify items open. Experimental content has no review to fall due.`);
  }
  return errors > 0 ? 1 : 0;
}

if (isEntrypoint(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
