#!/usr/bin/env node
/**
 * Keeps the committed compliance artifacts honest.
 *
 * sbom.json sat in the repository root declaring
 * `agent-maturity-compass 1.0.0` while 1.1.1 shipped, generated five months
 * earlier by a one-off `npx cyclonedx-npm` — even though AMC ships its own
 * deterministic CycloneDX generator. The five compliance-*.json reports carried
 * evidence windows that closed in March.
 *
 * Stale evidence in a product whose thesis is evidence over claims is worse
 * than no evidence, because it reads as current. This turns silent rot into a
 * failure that names the command to fix it.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const MAX_AGE_DAYS = 180;
const failures = [];

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const sbomPath = join(root, "sbom.json");
if (existsSync(sbomPath)) {
  const sbom = JSON.parse(readFileSync(sbomPath, "utf8"));
  const declared = sbom?.metadata?.component?.version;
  if (declared !== pkg.version) {
    failures.push(
      `sbom.json describes version ${declared}, but package.json ships ${pkg.version}.\n` +
        `    Regenerate with AMC's own generator: node dist/cli.js release sbom --out sbom.json`
    );
  }
}

const REPORTS = [
  ["compliance-soc2.json", "SOC2"],
  ["compliance-gdpr.json", "GDPR"],
  ["compliance-iso_42001.json", "ISO_42001"],
  ["compliance-nist_ai_rmf.json", "NIST_AI_RMF"],
  ["compliance-eu_ai_act.json", "EU_AI_ACT"]
];

const now = Date.now();
for (const [file, framework] of REPORTS) {
  const path = join(root, file);
  if (!existsSync(path)) continue;
  const report = JSON.parse(readFileSync(path, "utf8"));
  const end = Number(report.windowEndTs);
  if (!Number.isFinite(end)) {
    failures.push(`${file}: no readable windowEndTs; cannot tell whether it is current.`);
    continue;
  }
  const ageDays = Math.floor((now - end) / 86_400_000);
  if (ageDays > MAX_AGE_DAYS) {
    failures.push(
      `${file}: evidence window closed ${ageDays} days ago (limit ${MAX_AGE_DAYS}).\n` +
        `    Regenerate: node dist/cli.js comply report --framework ${framework} --out ${file}`
    );
  }
}

if (failures.length > 0) {
  console.error("Stale compliance artifacts:\n" + failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
console.log("Committed compliance artifacts are current.");
