#!/usr/bin/env node
/**
 * Security mutation batch (P0-30).
 *
 *   node scripts/mutation-batch.mjs --batch <entries.json> --out <result.json> [--only <id,id>]
 *
 * <entries.json> is an array of
 *   { id, oldIssue, file, find, replace, tests: string[], expect: "killed" | "equivalent", note? }
 *
 * First every distinct test set runs once unmutated: a set that already fails cannot kill anything.
 * Then, per entry: refuse unless `git status --porcelain` is empty, require `find` exactly once in
 * `file`, apply the replacement, run `vitest run <tests> --reporter=json`, restore the original bytes
 * (also on SIGINT, SIGTERM and any throw) and refuse to continue unless the tree is clean again.
 *
 * Exit 0 when every `killed` entry was killed and every `equivalent` entry survived; 1 otherwise;
 * 2 on a usage error, a dirty tree or a test run that left files behind.
 * Never run it in a checkout with work in progress: it rewrites tracked files while tests run.
 */
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, normalize, relative, resolve } from "node:path";

const RUN_TIMEOUT_MS = 20 * 60_000;
const MAX_NAMES = 20;

class BatchAbort extends Error {}

function parseArgs(argv) {
  const args = { batch: null, out: null, only: null };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (!["--batch", "--out", "--only"].includes(flag) || value === undefined) {
      throw new BatchAbort(`usage: mutation-batch.mjs --batch <file> --out <file> [--only <id,id>] (bad argument ${flag})`);
    }
    args[flag.slice(2)] = value;
    i += 1;
  }
  if (!args.batch || !args.out) throw new BatchAbort("usage: mutation-batch.mjs --batch <file> --out <file> [--only <id,id>]");
  return args;
}

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function assertClean(root, when) {
  const status = git(root, "status", "--porcelain");
  if (status !== "") throw new BatchAbort(`working tree is not clean ${when}; refusing:\n${status}`);
}

function validateEntries(value, root) {
  if (!Array.isArray(value) || value.length === 0) throw new BatchAbort("batch must be a non-empty array of entries");
  const ids = new Set();
  for (const entry of value) {
    const where = `entry ${JSON.stringify(entry?.id)}`;
    const strings = ["id", "oldIssue", "file", "find"];
    if (!entry || typeof entry !== "object") throw new BatchAbort(`${where}: not an object`);
    for (const key of strings) {
      if (typeof entry[key] !== "string" || entry[key].length === 0) throw new BatchAbort(`${where}: ${key} must be a non-empty string`);
    }
    if (typeof entry.replace !== "string" || entry.replace === entry.find) throw new BatchAbort(`${where}: replace must be a string that differs from find`);
    if (!Array.isArray(entry.tests) || entry.tests.length === 0 || entry.tests.some((t) => typeof t !== "string" || t.length === 0)) {
      throw new BatchAbort(`${where}: tests must be a non-empty array of paths`);
    }
    if (entry.expect !== "killed" && entry.expect !== "equivalent") throw new BatchAbort(`${where}: expect must be "killed" or "equivalent"`);
    if (entry.note !== undefined && typeof entry.note !== "string") throw new BatchAbort(`${where}: note must be a string`);
    if (isAbsolute(entry.file) || normalize(entry.file).startsWith("..")) throw new BatchAbort(`${where}: file must be a repository-relative path`);
    if (git(root, "ls-files", "--", entry.file) !== entry.file) throw new BatchAbort(`${where}: ${entry.file} is not a tracked file`);
    if (ids.has(entry.id)) throw new BatchAbort(`${where}: duplicate id`);
    ids.add(entry.id);
  }
  return value;
}

function occurrences(text, find) {
  const at = [];
  for (let index = text.indexOf(find); index !== -1; index = text.indexOf(find, index + 1)) at.push(index);
  return at;
}

// The one file currently mutated, so every exit path can put its bytes back.
let active = null;
let child = null;
function restoreActive() {
  if (active === null) return;
  writeFileSync(active.path, active.original);
  active = null;
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child?.kill(signal);
    process.stderr.write(`mutation-batch: ${signal}; restoring the original bytes\n`);
    process.exit(signal === "SIGINT" ? 130 : 143);
  });
}
// process.exit() from any path (signal, error, normal end) runs this synchronously.
process.on("exit", restoreActive);

function summariseReport(root, path) {
  let report;
  try {
    report = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { totals: null, failingTests: [], failedFiles: [] };
  }
  const failingTests = [];
  const failedFiles = [];
  for (const file of report.testResults ?? []) {
    const name = relative(root, String(file.name ?? ""));
    const failed = (file.assertionResults ?? []).filter((test) => test.status === "failed");
    for (const test of failed) failingTests.push(`${name} > ${test.fullName ?? test.title}`);
    if (file.status === "failed" && failed.length === 0) failedFiles.push(`${name}: ${String(file.message ?? "suite failed").split("\n")[0].slice(0, 200)}`);
  }
  return {
    totals: { total: report.numTotalTests ?? 0, passed: report.numPassedTests ?? 0, failed: report.numFailedTests ?? 0 },
    failingTests: failingTests.slice(0, MAX_NAMES),
    failingTestCount: failingTests.length,
    failedFiles
  };
}

function runTests(root, tests) {
  const dir = mkdtempSync(join(tmpdir(), "amc-mutation-batch-"));
  const outputFile = join(dir, "vitest.json");
  const bin = join(root, "node_modules", ".bin", process.platform === "win32" ? "vitest.cmd" : "vitest");
  const started = Date.now();
  return new Promise((resolvePromise) => {
    let tail = "";
    child = spawn(bin, ["run", ...tests, "--reporter=json", `--outputFile=${outputFile}`], {
      cwd: root, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CI: process.env.CI ?? "1" }
    });
    const keep = (chunk) => { tail = (tail + chunk.toString("utf8")).slice(-2000); };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    const timer = setTimeout(() => child?.kill("SIGKILL"), RUN_TIMEOUT_MS);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      child = null;
      const summary = summariseReport(root, outputFile);
      rmSync(dir, { recursive: true, force: true });
      resolvePromise({
        exitCode: code ?? (signal ? 128 : 1),
        signal: signal ?? null,
        durationMs: Date.now() - started,
        ...summary,
        ...(summary.totals === null ? { outputTail: tail } : {})
      });
    });
  });
}

function judge(expect, killed) {
  if (expect === "killed") return killed ? "killed" : "survived";
  return killed ? "equivalent-killed" : "equivalent";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = git(process.cwd(), "rev-parse", "--show-toplevel");
  let entries = validateEntries(JSON.parse(readFileSync(resolve(args.batch), "utf8")), root);
  if (args.only) {
    const wanted = new Set(args.only.split(","));
    entries = entries.filter((entry) => wanted.has(entry.id));
    if (entries.length !== wanted.size) throw new BatchAbort(`--only names ids that are not in the batch: ${args.only}`);
  }
  assertClean(root, "before the batch");
  const commit = git(root, "rev-parse", "HEAD");
  const startedAt = new Date().toISOString();

  const baselines = new Map();
  for (const tests of new Set(entries.map((entry) => JSON.stringify(entry.tests)))) {
    const run = await runTests(root, JSON.parse(tests));
    assertClean(root, `after the unmutated run of ${tests}`);
    baselines.set(tests, run);
    process.stdout.write(`baseline ${run.exitCode === 0 ? "green" : "RED"} ${tests}\n`);
  }

  const results = [];
  for (const entry of entries) {
    const base = { id: entry.id, oldIssue: entry.oldIssue, file: entry.file, expect: entry.expect, tests: entry.tests, ...(entry.note ? { note: entry.note } : {}) };
    const baseline = baselines.get(JSON.stringify(entry.tests));
    if (baseline.exitCode !== 0) {
      results.push({ ...base, outcome: "baseline-failed", ok: false, reason: "the unmutated test set already fails", failingTests: baseline.failingTests, failedFiles: baseline.failedFiles });
      continue;
    }
    assertClean(root, `before ${entry.id}`);
    const path = join(root, entry.file);
    const original = readFileSync(path);
    const text = original.toString("utf8");
    const at = occurrences(text, entry.find);
    if (at.length !== 1) {
      results.push({ ...base, outcome: "error", ok: false, reason: `find occurs ${at.length} times; exactly one is required` });
      continue;
    }
    const line = text.slice(0, at[0]).split("\n").length;
    active = { path, original };
    let run;
    try {
      writeFileSync(path, text.slice(0, at[0]) + entry.replace + text.slice(at[0] + entry.find.length));
      run = await runTests(root, entry.tests);
    } finally {
      restoreActive();
    }
    if (!readFileSync(path).equals(original)) throw new BatchAbort(`${entry.id}: restore did not reproduce the original bytes of ${entry.file}`);
    assertClean(root, `after ${entry.id}`);
    const outcome = judge(entry.expect, run.exitCode !== 0);
    results.push({ ...base, line, outcome, ok: outcome === entry.expect, ...run });
    process.stdout.write(`${outcome === entry.expect ? "ok  " : "FAIL"} ${entry.id} ${outcome} (${run.durationMs} ms)\n`);
  }

  const count = (outcome) => results.filter((result) => result.outcome === outcome).length;
  const byIssue = {};
  for (const result of results) {
    const row = (byIssue[result.oldIssue] ??= { entries: 0, killed: 0, survived: 0, equivalent: 0, other: 0 });
    row.entries += 1;
    if (result.outcome in row) row[result.outcome] += 1;
    else row.other += 1;
  }
  const report = {
    schema: "amc.mutation-batch.result.v1",
    commit,
    startedAt,
    finishedAt: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    summary: { entries: results.length, killed: count("killed"), survived: count("survived"), equivalent: count("equivalent"),
      equivalentKilled: count("equivalent-killed"), errors: count("error") + count("baseline-failed"), byIssue },
    baselines: [...baselines].map(([tests, run]) => ({ tests: JSON.parse(tests), exitCode: run.exitCode, durationMs: run.durationMs, totals: run.totals })),
    results
  };
  writeFileSync(resolve(args.out), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${report.summary.killed} killed, ${report.summary.survived} survived, ${report.summary.equivalent} equivalent, `
    + `${report.summary.equivalentKilled} equivalent-killed, ${report.summary.errors} errors\n`);
  return results.every((result) => result.ok) ? 0 : 1;
}

main().then((code) => process.exit(code), (error) => {
  restoreActive();
  process.stderr.write(`mutation-batch: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(error instanceof BatchAbort ? 2 : 1);
});
