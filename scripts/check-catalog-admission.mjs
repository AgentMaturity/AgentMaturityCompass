#!/usr/bin/env node
/**
 * Catalog pack admission (P1-33, docs/catalog/ADMISSION.md): runs the compiled checker over every pack in catalog/ and
 * exits 1 when a pack's declared support is not admissible (a reviewed or qualified claim it does not meet, or a pack
 * failing P1-09 validation) or a committed report under catalog/admission/ is malformed. Experimental, unreviewed packs
 * are reported and never fail the check for being experimental. Review records are verified against this machine's
 * operator trust; the D-08 roster does not exist yet, so no pack can be admitted as reviewed. Nothing is written.
 * Reads dist/ (build first).
 *
 * Usage: node scripts/check-catalog-admission.mjs [--json]
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { isEntrypoint } from "./lib/entrypoint.mjs";

async function main(argv) {
  const { values } = parseArgs({ args: argv, options: { json: { type: "boolean" } } });
  const entry = join(process.cwd(), "dist", "catalog", "admission", "index.js");
  if (!existsSync(entry)) throw new Error("Build first: dist/catalog/admission/index.js not found (pnpm run build).");
  const { renderCatalogCheck, runCatalogCheck } = await import(pathToFileURL(entry).href);
  const result = await runCatalogCheck({ catalogRoot: join(process.cwd(), "catalog") });
  if (values.json) console.log(JSON.stringify(result, null, 2));
  else for (const line of renderCatalogCheck(result)) (line.startsWith("REFUSED") || line.startsWith("error") ? console.error : console.log)(line);
  return result.exitCode;
}

if (isEntrypoint(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
