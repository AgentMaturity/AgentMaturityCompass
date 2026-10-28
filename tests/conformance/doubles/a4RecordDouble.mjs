#!/usr/bin/env node
/**
 * P3-24 test double: `a4RecordDouble.mjs <mode> <record> [flags]` runs `amc a4 verify <record> [flags] --json` from
 * dist/, then breaks its report the way a careless A4 record verifier would. `correct` passes it through unchanged.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [mode, ...args] = process.argv.slice(2);
const cli = join(dirname(fileURLToPath(import.meta.url)), "../../../dist/cli.js");
const run = spawnSync(process.execPath, [cli, "a4", "verify", ...args, "--json"], { encoding: "utf8", env: { ...process.env, AMC_A4_PREVIEW: "1" } });
const report = JSON.parse(run.stdout);

switch (mode) {
  case "correct":
    break;
  case "ignore-sod": // names the builder's approval of their own revision, yet passes satisfaction
    if (report.satisfaction.reasons.some(line => line.startsWith("SOD_VIOLATION"))) report.satisfaction.status = "pass";
    break;
  case "count-stale": // counts a decision that names another request, and drops the reason code
    if (report.freshness.status === "fail") report.freshness = { status: "pass", reasons: [] };
    break;
  case "no-codes": // right statuses, but says why in prose only
    for (const dimension of ["integrity", "scope", "freshness", "completeness", "satisfaction"]) {
      const key = dimension === "integrity" ? "errors" : "reasons";
      report[dimension][key] = report[dimension][key].map(line => line.replace(/^[A-Z][A-Z0-9_]*:?\s*/, "because "));
    }
    break;
  case "unlisted-member": // prints a member beside the report that the class does not allow
    report.verdict = "ok";
    break;
  default:
    throw new Error(`unknown mode ${mode}`);
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
