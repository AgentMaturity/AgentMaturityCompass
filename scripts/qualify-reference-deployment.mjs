#!/usr/bin/env node
// P2-06 reference-deployment qualification: runs the 22-check matrix in
// qualification/reference-deployment/matrix.json against one Helm release and writes
// the contract receipt (qualification/receipt.schema.json) plus one artifact per check.
//
//   node scripts/qualify-reference-deployment.mjs --kube-context CTX --release amc-rd \
//     --image-a REPO@sha256:A --image-b REPO@sha256:B --out qualification/YYYY-MM-DD-P2-06/kind \
//     [--namespace NS] [--targets FILE] [--ephemeral-secrets] [--ha] [--keep]
//
// helm and kubectl run through execFile-style argument arrays, never shell strings.
// Exit 0: every check passed. Exit 1: any check failed or did not run (a check that did not
// run is a failure, as in deploy-verify.mjs's evaluateChecks). Exit 2: usage error, missing
// tool, or recovery targets that are not filled in (there are no defaults).
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { arch, platform, release as osRelease } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isEntrypoint } from "./lib/entrypoint.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const MATRIX_DIR = join(ROOT, "qualification/reference-deployment");
const DIGEST_REF = /^[a-z0-9][a-z0-9._/:-]*@sha256:[a-f0-9]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TARGET_STATUSES = new Set(["agreed", "engineering-placeholder"]);
export const RESULT_STATUSES = new Set(["passed", "failed", "not_run"]);

export class UsageError extends Error {}

export function loadMatrix(dir = MATRIX_DIR) {
  const matrix = JSON.parse(readFileSync(join(dir, "matrix.json"), "utf8"));
  if (matrix.schema !== "amc.reference-deployment-matrix/1" || !Array.isArray(matrix.checks)) throw new Error("matrix.json: unknown schema");
  return matrix;
}

/** Problems with a recovery-targets record; empty means usable. Nothing is defaulted. */
export function targetProblems(targets) {
  const problems = [];
  if (targets?.schema !== "amc.recovery-targets/1") problems.push("schema must be amc.recovery-targets/1");
  for (const key of ["rpoSeconds", "rtoSeconds", "backupCadenceSeconds"]) {
    if (!Number.isInteger(targets?.[key]) || targets[key] <= 0) problems.push(`${key} must be a positive integer`);
  }
  for (const key of ["agreedBy", "partner"]) {
    if (typeof targets?.[key] !== "string" || targets[key].trim() === "") problems.push(`${key} must be filled in`);
  }
  if (typeof targets?.agreedOn !== "string" || !DATE.test(targets.agreedOn)) problems.push("agreedOn must be YYYY-MM-DD");
  if (!TARGET_STATUSES.has(targets?.status)) problems.push(`status must be one of ${[...TARGET_STATUSES].join(", ")}`);
  return problems;
}

export function parseArgs(argv) {
  const opts = { namespace: "default", targets: join(MATRIX_DIR, "targets.json"), ephemeralSecrets: false, ha: false, keep: false };
  const flags = { "--kube-context": "kubeContext", "--release": "release", "--image-a": "imageA", "--image-b": "imageB",
    "--out": "out", "--namespace": "namespace", "--targets": "targets" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--ephemeral-secrets") opts.ephemeralSecrets = true;
    else if (arg === "--ha") opts.ha = true;
    else if (arg === "--keep") opts.keep = true;
    else if (flags[arg]) {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new UsageError(`${arg} needs a value`);
      opts[flags[arg]] = value;
      i += 1;
    } else throw new UsageError(`unknown argument ${arg}`);
  }
  for (const flag of ["--kube-context", "--release", "--image-a", "--image-b", "--out"]) {
    if (!opts[flags[flag]]) throw new UsageError(`${flag} is required`);
  }
  for (const flag of ["--image-a", "--image-b"]) {
    if (!DIGEST_REF.test(opts[flags[flag]])) throw new UsageError(`${flag} must be REPO@sha256:<64 hex>`);
  }
  if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(opts.release)) throw new UsageError("--release must be a DNS label");
  return opts;
}

/**
 * The receipt verdict. A check passes only with status "passed"; "not_run", "failed", a missing result
 * or an unknown status all fail, and a result for an id outside the matrix is an error too.
 */
export function evaluateResults(matrix, results) {
  const byId = new Map(results.map((result) => [result.id, result]));
  const failures = [], notRun = [];
  for (const { id } of matrix.checks) {
    const status = byId.get(id)?.status;
    if (status === "passed") continue;
    if (status === undefined || status === "not_run") notRun.push(id);
    else failures.push(id);
  }
  const unknown = results.filter((result) => !matrix.checks.some((check) => check.id === result.id)).map((result) => result.id);
  return { pass: failures.length === 0 && notRun.length === 0 && unknown.length === 0, failures, notRun, unknown };
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function gitValue(args) {
  const run = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  return run.status === 0 ? run.stdout.trim() : null;
}

/** The contract receipt (qualification/receipt.schema.json) for one harness run. */
export function buildReceipt({ matrix, results, artifacts, date, commit, branch, environment, notes }) {
  const verdict = evaluateResults(matrix, results);
  const passed = results.filter((result) => result.status === "passed").length;
  return {
    schemaVersion: 1, key: "P2-06", date, commit, branch,
    node: environment.node, pnpm: environment.pnpm, os: environment.os, arch: environment.arch,
    commands: matrix.checks.map(({ id, scenario }) => {
      const result = results.find((entry) => entry.id === id);
      return { cmd: `${id} ${scenario}`, exit: result?.status === "passed" ? 0 : 1, durationMs: result?.durationMs ?? 0 };
    }),
    tests: { total: matrix.checks.length, passed, failed: matrix.checks.length - passed, skipped: 0 },
    artifacts,
    notes: [
      verdict.pass ? "All checks passed." : `Failed: ${verdict.failures.join(", ") || "none"}. Not run (counted as failed): ${verdict.notRun.join(", ") || "none"}.`,
      notes
    ].filter(Boolean).join(" ")
  };
}

/**
 * Synchronous tool call with an argument array; records each command (never stdin or stdout) for the artifact.
 * `binary: true` returns stdout as a Buffer (backup files copied out of a pod).
 */
export function makeRunner(log) {
  return (cmd, args, { input, timeoutMs = 600_000, quiet = false, binary = false } = {}) => {
    const started = Date.now();
    const run = spawnSync(cmd, args, { encoding: binary ? "buffer" : "utf8", input, timeout: timeoutMs, maxBuffer: 512 * 1024 * 1024 });
    const stderr = binary ? run.stderr?.toString("utf8") : run.stderr;
    const result = { status: run.status ?? 1, stdout: run.stdout ?? (binary ? Buffer.alloc(0) : ""), stderr: stderr ?? String(run.error?.message ?? ""),
      durationMs: Date.now() - started };
    log.push({ cmd: [cmd, ...args].join(" "), exit: result.status, durationMs: result.durationMs,
      ...(quiet ? {} : { stderr: result.stderr.slice(-2000) }) });
    return result;
  };
}

export function toolMissing(run, tool) {
  return run(tool, tool === "helm" ? ["version", "--short"] : ["version", "--client", "-o", "json"], { quiet: true }).status !== 0;
}

async function loadChecks(matrix) {
  const registry = new Map();
  for (const module of new Set(matrix.checks.map((check) => check.module))) {
    const loaded = await import(pathToFileURL(join(MATRIX_DIR, module)).href);
    for (const [id, fn] of Object.entries(loaded.checks ?? {})) registry.set(id, fn);
  }
  return registry;
}

/** Run every matrix check in order; a throwing check is "failed", a missing implementation is "not_run". */
export async function runChecks({ matrix, registry, ctx }) {
  const results = [];
  for (const check of matrix.checks) {
    const started = Date.now();
    const fn = registry.get(check.id);
    let result;
    if (check.haOnly && !ctx.ha) result = { status: "not_run", reason: "HA mode is not part of this topology (--ha not given)" };
    else if (!fn) result = { status: "not_run", reason: "no implementation registered" };
    else {
      try { result = await fn(ctx, check); }
      catch (error) { result = { status: "failed", reason: `check threw: ${error instanceof Error ? error.message : String(error)}` }; }
    }
    if (!RESULT_STATUSES.has(result?.status)) result = { status: "failed", reason: `unknown status ${JSON.stringify(result?.status)}` };
    results.push({ id: check.id, scenario: check.scenario, ...result, durationMs: Date.now() - started });
    console.log(`${check.id}: ${result.status}${result.reason ? ` (${result.reason})` : ""}`);
  }
  return results;
}

export async function main(argv, { now = new Date() } = {}) {
  let opts;
  try { opts = parseArgs(argv); }
  catch (error) {
    if (error instanceof UsageError) { console.error(`usage error: ${error.message}`); return 2; }
    throw error;
  }
  let targets;
  try { targets = JSON.parse(readFileSync(opts.targets, "utf8")); }
  catch (error) { console.error(`recovery targets unreadable (${opts.targets}): ${error.message}`); return 2; }
  const problems = targetProblems(targets);
  if (problems.length > 0) {
    console.error(`recovery targets are not filled in (${opts.targets}); Sid records them with the P2-03 partner:\n- ${problems.join("\n- ")}`);
    return 2;
  }
  const commandLog = [];
  const run = makeRunner(commandLog);
  for (const tool of ["helm", "kubectl"]) {
    if (toolMissing(run, tool)) { console.error(`missing tool: ${tool}`); return 2; }
  }
  const out = resolve(opts.out);
  mkdirSync(dirname(out), { recursive: true });
  try { mkdirSync(out); }
  catch (error) {
    if (error?.code === "EEXIST") { console.error(`--out ${out} exists; choose a new directory so earlier evidence is kept`); return 2; }
    throw error;
  }
  mkdirSync(join(out, "checks"));
  const matrix = loadMatrix();
  const registry = await loadChecks(matrix);
  const ctx = { ...opts, targets, run, root: ROOT, chartDir: join(ROOT, "deploy/helm/amc"), outDir: out, state: {},
    artifact: (name, data) => writeFileSync(join(out, "checks", name), typeof data === "string" ? data : `${JSON.stringify(data, null, 2)}\n`) };
  const results = await runChecks({ matrix, registry, ctx });
  if (!opts.keep) (await import(pathToFileURL(join(MATRIX_DIR, "checks/lib.mjs")).href)).cleanup(ctx);
  for (const result of results) ctx.artifact(`${result.id}.json`, result);
  const files = readdirSync(join(out, "checks")).sort().map((name) => `checks/${name}`);
  writeFileSync(join(out, "commands.json"), `${JSON.stringify(commandLog, null, 2)}\n`);
  const report = { kind: "amc.reference-deployment/1", kubeContext: opts.kubeContext, namespace: opts.namespace, release: opts.release,
    images: { a: opts.imageA, b: opts.imageB }, ha: opts.ha, targets, targetsSha256: sha256(readFileSync(opts.targets)),
    matrixSha256: sha256(readFileSync(join(MATRIX_DIR, "matrix.json"))), verdict: evaluateResults(matrix, results),
    results: results.map(({ id, status, reason }) => ({ id, status, reason: reason ?? null })) };
  writeFileSync(join(out, "reference-deployment.json"), `${JSON.stringify(report, null, 2)}\n`);
  files.push("commands.json", "reference-deployment.json");
  const pnpm = run("pnpm", ["--version"], { quiet: true });
  const receipt = buildReceipt({
    matrix, results, date: now.toISOString().slice(0, 10),
    commit: gitValue(["rev-parse", "HEAD"]) ?? "0".repeat(40), branch: gitValue(["rev-parse", "--abbrev-ref", "HEAD"]) ?? "unknown",
    environment: { node: process.version, pnpm: pnpm.status === 0 ? pnpm.stdout.trim() : "not installed", os: `${platform()} ${osRelease()}`, arch: arch() },
    artifacts: files.map((path) => ({ path, sha256: sha256(readFileSync(join(out, path))) })),
    notes: `kube context ${opts.kubeContext}; recovery targets status ${targets.status}.`
  });
  writeFileSync(join(out, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(report.verdict.pass ? "Reference deployment: all checks passed" : "Reference deployment: FAILED");
  return report.verdict.pass ? 0 : 1;
}

if (isEntrypoint(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
