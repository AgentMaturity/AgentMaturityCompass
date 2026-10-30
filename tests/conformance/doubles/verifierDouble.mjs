#!/usr/bin/env node
/**
 * P1-32 test double: `verifierDouble.mjs <mode> verify <artifact> [flags]` runs AMC's standalone verifier, then breaks
 * its report the way a careless verifier would. `correct` passes the report through unchanged.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [mode, ...args] = process.argv.slice(2);
const bin = join(dirname(fileURLToPath(import.meta.url)), "../../../packages/verifier/bin/amc-verify.mjs");
const run = spawnSync(process.execPath, [bin, ...args], { encoding: "utf8" });
const report = JSON.parse(run.stdout);
const DIMENSIONS = ["integrity", "issuerAdmission", "scope", "freshness", "completeness", "satisfaction"];

/** Reports `dimension` as passing when it failed only for one of `codes`. */
function ignore(dimension, codes) {
  const reported = report.reasonCodes[dimension] ?? [];
  if (reported.length > 0 && reported.every(code => codes.includes(code))) {
    report[dimension].status = "pass";
    report.reasonCodes[dimension] = [];
  }
}

const exitFor = () => (DIMENSIONS.some(d => report[d].status === "fail") ? 1 : DIMENSIONS.every(d => report[d].status === "pass") ? 0 : 3);

switch (mode) {
  case "correct":
    break;
  case "trust-embedded-key": // admits whichever key the artifact carries
    ignore("issuerAdmission", ["ISSUER_NOT_PINNED"]);
    break;
  case "ignore-revocation": // never reads revokedAt
    ignore("issuerAdmission", ["ISSUER_REVOKED"]);
    break;
  case "ignore-as-of": // never compares validity windows with the as-of time
    ignore("issuerAdmission", ["KEY_EXPIRED", "KEY_NOT_YET_VALID"]);
    ignore("freshness", ["ATTESTATION_EXPIRED", "NOT_YET_VALID"]);
    break;
  case "merge-results": { // one verdict copied into all six dimensions
    const statuses = DIMENSIONS.map(d => report[d].status);
    const merged = statuses.includes("fail") ? "fail" : statuses.includes("not-evaluated") ? "not-evaluated" : "pass";
    for (const dimension of DIMENSIONS) report[dimension].status = merged;
    break;
  }
  case "crash-on-empty": // dies on a record with no evidence
    if ((report.reasonCodes.completeness ?? []).includes("EMPTY_EVIDENCE")) {
      process.stderr.write("TypeError: Cannot read properties of undefined (reading 'length')\n");
      process.exit(2);
    }
    break;
  default:
    process.stderr.write(`unknown mode ${mode}\n`);
    process.exit(64);
}
process.stdout.write(JSON.stringify(report));
process.exitCode = mode === "correct" ? run.status : exitFor();
