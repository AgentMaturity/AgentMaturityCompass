#!/usr/bin/env node
/**
 * Conformance runner for the AMC verifier fixtures (spec/fixtures/v1/README.md):
 *
 *   node packages/verifier/conformance/run.mjs --cmd "<command>" [--fixtures spec/fixtures/v1] [--out conformance-results.json]
 *     [--implementation <name>@<version>]
 *
 * For every case directory holding an expected.json it runs `<command> verify <artifact.json> --trust-list ... --json`
 * (the command is split on whitespace; no shell), reads the verifier report from stdout and compares the six dimension
 * statuses (exactly), the reason codes (the expected ones must be present) and the exit code. Node built-ins only.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

const DIMENSIONS = ["integrity", "issuerAdmission", "scope", "freshness", "completeness", "satisfaction"];

function usage(message) {
  process.stderr.write(`conformance: ${message}\nusage: run.mjs --cmd "<command>" [--fixtures <dir>] [--out <file>] [--implementation <name>@<version>]\n`);
  process.exit(64);
}

let values;
try {
  ({ values } = parseArgs({ options: { cmd: { type: "string" }, fixtures: { type: "string" }, out: { type: "string" }, implementation: { type: "string" } } }));
} catch (error) {
  usage(error.message);
}
if (!values.cmd?.trim()) usage("--cmd is required");
const command = values.cmd.trim().split(/\s+/);
const fixtures = resolve(values.fixtures ?? "spec/fixtures/v1");
const out = resolve(values.out ?? "conformance-results.json");

function run(args) {
  return spawnSync(command[0], [...command.slice(1), ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 120_000 });
}

/** The command line a case's params.json describes. */
function argsFor(dir) {
  const params = JSON.parse(readFileSync(join(dir, "params.json"), "utf8"));
  const args = ["verify", join(dir, "artifact.json")];
  if (existsSync(join(dir, "trust-list.json"))) args.push("--trust-list", join(dir, "trust-list.json"));
  for (const root of params.trustRoots ?? []) args.push("--trust-root", root);
  if (params.rootThreshold !== undefined) args.push("--root-threshold", String(params.rootThreshold));
  if (params.asOf) args.push("--as-of", params.asOf);
  for (const [key, value] of Object.entries(params.expect ?? {})) args.push(`--expect-${key}`, value);
  for (const [id, sequence] of Object.entries(params.knownSequences ?? {})) args.push("--known-sequence", `${id}=${sequence}`);
  if (existsSync(join(dir, "evidence"))) args.push("--evidence-dir", join(dir, "evidence"));
  args.push("--json");
  return args;
}

/** null when the report matches expected.json; otherwise what differs. */
function compare(expected, report, exitCode) {
  const diff = {};
  for (const dimension of DIMENSIONS) {
    const actual = report?.[dimension]?.status;
    if (actual !== expected.dimensions[dimension]) (diff.dimensions ??= {})[dimension] = { expected: expected.dimensions[dimension], actual: actual ?? null };
    const missing = (expected.reasonCodes?.[dimension] ?? []).filter(code => !(report?.reasonCodes?.[dimension] ?? []).includes(code));
    if (missing.length > 0) (diff.reasonCodes ??= {})[dimension] = { missing, actual: report?.reasonCodes?.[dimension] ?? [] };
  }
  if (exitCode !== expected.exitCode) diff.exitCode = { expected: expected.exitCode, actual: exitCode };
  return Object.keys(diff).length === 0 ? null : diff;
}

const names = existsSync(fixtures) ? readdirSync(fixtures).filter(name => existsSync(join(fixtures, name, "expected.json"))).sort() : [];
if (names.length === 0) usage(`no fixture case (a directory with expected.json) under ${fixtures}`);

const cases = names.map(name => {
  const dir = join(fixtures, name);
  const expected = JSON.parse(readFileSync(join(dir, "expected.json"), "utf8"));
  const result = run(argsFor(dir));
  if (result.error) return { case: name, result: "fail", diff: { error: result.error.message } };
  let report = null;
  try { report = JSON.parse(result.stdout); } catch { /* compared as missing below */ }
  const diff = report === null ? { error: `stdout is not a JSON report (exit ${result.status}): ${result.stderr.slice(0, 500)}` } : compare(expected, report, result.status);
  return { case: name, result: diff === null ? "pass" : "fail", diff };
});

const version = run(["--version"]);
const implementation = values.implementation ?? (version.status === 0 && version.stdout.trim() ? version.stdout.trim().split("\n")[0] : "unknown");
const passed = cases.filter(item => item.result === "pass").length;
const results = { suite: "amc-verifier-fixtures", version: "v1", implementation, ranAt: new Date().toISOString(), passed, failed: cases.length - passed, cases };
writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
process.stdout.write(`${implementation}: ${passed}/${cases.length} cases pass (${out})\n`);
for (const item of cases.filter(entry => entry.result === "fail")) process.stdout.write(`  FAIL ${item.case}: ${JSON.stringify(item.diff)}\n`);
process.exitCode = passed === cases.length ? 0 : 1;
