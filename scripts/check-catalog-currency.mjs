#!/usr/bin/env node
/**
 * Catalog review currency (P1-34, docs/catalog/GOVERNANCE.md), through effectiveSupport: reviewed or qualified content
 * whose support does not stand (overdue, unverified, open re-verify item or unverifiable trust) is an error; a review
 * due within 14 days, an approved review the YAML declares without a verified record, and register entries due a
 * status review are warnings. A malformed catalog or governance file is an error. Exit 1 on any error. Review records
 * are verified against this machine's operator trust (the AMC home's signed trust lists and pinned roots) at the
 * server's clock; `--as-of` previews a later date and CI never passes it. The D-08 expert roster does not exist yet, so
 * no reviewed content can stand. Nothing is edited. Reads dist/ (build first).
 *
 * Usage: node scripts/check-catalog-currency.mjs [--as-of YYYY-MM-DD] [--json]
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { isEntrypoint } from "./lib/entrypoint.mjs";

async function main(argv) {
  const { values } = parseArgs({ args: argv, options: { "as-of": { type: "string" }, json: { type: "boolean" } } });
  const asOf = values["as-of"] ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error(`--as-of ${asOf} is not YYYY-MM-DD`);
  // The clock is the server's: a preview may look ahead, never back to before a review lapsed.
  if (asOf < new Date().toISOString().slice(0, 10)) throw new Error(`--as-of ${asOf} is before today; it may only look ahead`);
  const root = process.cwd();
  const dist = (rel) => join(root, "dist", rel);
  if (!existsSync(dist("catalog/governance/index.js"))) throw new Error("Build first: dist/catalog/governance/index.js not found (pnpm run build).");
  const { loadCatalog } = await import(pathToFileURL(dist("catalog/loader.js")).href);
  const { catalogCurrencyFindings, readGovernance } = await import(pathToFileURL(dist("catalog/governance/index.js")).href);
  const { REGULATORY_REGISTER } = await import(pathToFileURL(dist("compliance/regulatory/index.js")).href);

  const catalogRoot = join(root, "catalog");
  const cat = loadCatalog({ root: catalogRoot });
  const governance = readGovernance(catalogRoot);
  const authorsOf = (controlId) => {
    const file = cat.controlFiles.get(controlId);
    const log = file ? spawnSync("git", ["log", "--format=%an%n%ae", "--", join("catalog", file)], { cwd: root, encoding: "utf8" }) : null;
    if (!log || log.status !== 0) throw new Error(`cannot read the git authors of ${controlId}; refusing to judge reviewer independence without them`);
    return [...new Set(log.stdout.split("\n").filter(Boolean))];
  };
  const authority = { trust: {}, now: values["as-of"] ? new Date(`${asOf}T00:00:00Z`) : new Date(), records: governance.reviews,
    experts: new Map(), authorsOf, f5Confirmations: governance.f5Confirmations, reverify: governance.reverify, register: REGULATORY_REGISTER };
  const findings = [
    ...[...cat.issues, ...governance.issues].filter((i) => i.severity === "error")
      .map((i) => ({ code: i.code, severity: "error", controlId: i.controlId, message: `${i.file} ${i.path}: ${i.message}` })),
    ...catalogCurrencyFindings(cat, authority)
  ];
  const errors = findings.filter((f) => f.severity === "error").length;
  if (values.json) {
    console.log(JSON.stringify({ asOf, controls: cat.controls.size, reverifyOpen: governance.reverify.filter((i) => i.status === "open").length, findings }, null, 2));
  } else {
    for (const f of findings) (f.severity === "error" ? console.error : console.log)(`${f.severity} ${f.code}${f.controlId ? ` ${f.controlId}` : ""}: ${f.message}`);
    console.log(`Catalog currency as of ${asOf}: ${cat.controls.size} controls, ${errors} errors, ${findings.length - errors} warnings; `
      + `${governance.reverify.filter((i) => i.status === "open").length} re-verify items open, ${governance.reviews.length} review records. Experimental content has no review to fall due.`);
  }
  return errors > 0 ? 1 : 0;
}

if (isEntrypoint(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
