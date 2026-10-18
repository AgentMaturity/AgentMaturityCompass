#!/usr/bin/env node
// Three controlled pure-JS repair tasks, not a representative coding benchmark.
// `node codingOracle.mjs <workspace> <fixture> <containment.json>`, envelope on stdin.
// The comparison runner pins this file and remains the authority for target
// cleanup/provenance. The model-written solution runs only in the pinned
// container (pilot/oracles/containedProbe.mjs: no network, read-only, nobody, no
// mounts); without one the oracle refuses ("not measured: containment
// unavailable") and never runs it on the host. Expected values are never in the
// target workspace or probe input; only this process compares them.
import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { ContainmentUnavailableError, runContainedProbeDetailed } from "./pilot/oracles/containedProbe.mjs";

const VERSION = "2026-09-08";
const SOURCE_LIMIT = 128 * 1024;
const INPUT_LIMIT = 2 * 1024 * 1024;
const PROBE_TIMEOUT_MS = 120_000; // container start included
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const valueCase = (id, args, expected) => ({ id, args, expected });
const errorCase = (id, args, errorName) => ({ id, args, errorName });
export const suites = {
  "coding-range-normalization": { exportName: "normalizeRanges", cases: [
    valueCase("empty", [[]], []),
    valueCase("reverse-adjacent", [[[5, 3], [1, 2]]], [[1, 5]]),
    valueCase("negative-transitive", [[[8, 9], [-3, -1], [1, 5], [0, 0], [7, 6]]], [[-3, 9]]),
    valueCase("nested-duplicate", [[[4, 7], [1, 10], [1, 10], [3, 3]]], [[1, 10]]),
    valueCase("gaps-sorting", [[[9, 8], [-2, -4], [2, 1]]], [[-4, -2], [1, 2], [8, 9]]),
    valueCase("safe-limits", [[[9007199254740991, 9007199254740990], [-9007199254740991, -9007199254740991]]], [[-9007199254740991, -9007199254740991], [9007199254740990, 9007199254740991]]),
    errorCase("non-array", [null], "TypeError"),
    errorCase("short-range", [[[1]]], "TypeError"),
    errorCase("long-range", [[[1, 2, 3]]], "TypeError"),
    errorCase("string-endpoint", [[[1, "2"]]], "TypeError"),
    errorCase("fractional-endpoint", [[[1, 1.5]]], "TypeError"),
    errorCase("unsafe-endpoint", [[[1, 9007199254740992]]], "TypeError"),
    errorCase("late-invalid-no-mutation", [[[8, 4], [1, 2], null]], "TypeError")
  ] },
  "coding-quoted-csv": { exportName: "parseCsv", cases: [
    valueCase("empty", [""], []),
    valueCase("blank-record", ["\n"], [[""]]),
    valueCase("spaces-empty-fields", [" a ,b,\n,,"], [[" a ", "b", ""], ["", "", ""]]),
    valueCase("quoted-comma", ['a,"b,c",d\r\n'], [["a", "b,c", "d"]]),
    valueCase("escaped-quotes", ['"say ""hi""",""'], [['say "hi"', ""]]),
    valueCase("quoted-line-breaks", ['"first\r\nsecond\nthird",x\n'], [["first\r\nsecond\nthird", "x"]]),
    valueCase("several-blank-records", ["\r\n\r\n"], [[""], [""]]),
    valueCase("final-empty-field", ['"x",'], [["x", ""]]),
    valueCase("unicode", ['λ,"雪,☀"'], [["λ", "雪,☀"]]),
    errorCase("non-string", [0], "TypeError"),
    errorCase("unclosed-quote", ['a,"unfinished'], "SyntaxError"),
    errorCase("quote-in-unquoted", ['a,b"c'], "SyntaxError"),
    errorCase("after-quote", ['"a" b'], "SyntaxError"),
    errorCase("bare-cr", ['a\rb'], "SyntaxError")
  ] },
  "coding-stable-dependencies": { exportName: "orderDependencies", cases: [
    valueCase("empty", [[]], []),
    valueCase("input-order", [[{ id: "z", dependsOn: [] }, { id: "a", dependsOn: [] }]], ["z", "a"]),
    valueCase("newly-ready-precedes-queued", [[{ id: "first", dependsOn: ["unlock"] }, { id: "unlock", dependsOn: [] }, { id: "waiting", dependsOn: [] }]], ["unlock", "first", "waiting"]),
    valueCase("diamond", [[{ id: "end", dependsOn: ["left", "right"] }, { id: "right", dependsOn: ["root"] }, { id: "left", dependsOn: ["root"] }, { id: "root", dependsOn: [] }]], ["root", "right", "left", "end"]),
    valueCase("duplicate-dependency", [[{ id: "b", dependsOn: ["a", "a"] }, { id: "a", dependsOn: [], note: "ignored" }]], ["a", "b"]),
    valueCase("map-key-names", [[{ id: "__proto__", dependsOn: ["constructor"] }, { id: "constructor", dependsOn: [] }]], ["constructor", "__proto__"]),
    errorCase("cycle", [[{ id: "a", dependsOn: ["b"] }, { id: "b", dependsOn: ["a"] }]], "RangeError"),
    errorCase("self-cycle", [[{ id: "a", dependsOn: ["a"] }]], "RangeError"),
    errorCase("non-array", [{}], "TypeError"),
    errorCase("null-record", [[null]], "TypeError"),
    errorCase("duplicate-id", [[{ id: "a", dependsOn: [] }, { id: "a", dependsOn: [] }]], "TypeError"),
    errorCase("unknown-dependency", [[{ id: "a", dependsOn: ["missing"] }]], "TypeError"),
    errorCase("empty-id", [[{ id: "", dependsOn: [] }]], "TypeError"),
    errorCase("invalid-dependency", [[{ id: "a", dependsOn: [1] }]], "TypeError"),
    errorCase("missing-dependencies", [[{ id: "a" }]], "TypeError"),
    errorCase("late-invalid-no-mutation", [[{ id: "z", dependsOn: ["a"] }, { id: "a", dependsOn: [] }, { id: "bad", dependsOn: null }]], "TypeError")
  ] }
};

async function readInput() {
  const chunks = []; let length = 0;
  for await (const chunk of process.stdin) {
    length += chunk.length;
    if (length > INPUT_LIMIT) throw new Error("input-bound");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function regularBytes(path, limit) {
  if (lstatSync(path).isSymbolicLink()) throw new Error("symlink");
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.size > limit) throw new Error("file-bound");
    const buffer = Buffer.alloc(before.size + 1); let length = 0;
    while (length < buffer.length) {
      const count = readSync(fd, buffer, length, buffer.length - length, null);
      if (!count) break;
      length += count;
    }
    const after = fstatSync(fd), linked = lstatSync(path);
    if (length !== before.size || !linked.isFile() || linked.isSymbolicLink() ||
        [after, linked].some(row => row.dev !== before.dev || row.ino !== before.ino || row.size !== before.size || row.mtimeMs !== before.mtimeMs || row.ctimeMs !== before.ctimeMs)) throw new Error("file-changed");
    return buffer.subarray(0, length);
  } finally { closeSync(fd); }
}

function solutionSnapshot(workspace) {
  const root = realpathSync(resolve(workspace)), repo = join(root, "repo");
  const stat = lstatSync(repo);
  if (stat.isSymbolicLink() || !stat.isDirectory() || realpathSync(repo) !== repo) throw new Error("repository-boundary");
  const path = join(repo, "solution.mjs"), bytes = regularBytes(path, SOURCE_LIMIT);
  const after = lstatSync(repo);
  if (!after.isDirectory() || after.isSymbolicLink() || after.dev !== stat.dev || after.ino !== stat.ino || realpathSync(repo) !== repo) throw new Error("repository-changed");
  // Reject invalid UTF-8 rather than evaluating a lossy replacement of the bytes.
  const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return { path, source, digest: sha256(bytes) };
}

const refusal = (reason) => ({ schemaVersion: VERSION, verdict: "inconclusive",
  checks: [{ id: "containment", passed: null, evidence: `not measured: containment unavailable (${reason}); model-written code is never run on the host.` }] });

/**
 * Judges one trial. `probe(input)` returns { rows, timedOut } from the shared hardened probe; the command line passes the
 * contained runner, and only contract tests pass the test-only seam. A ContainmentUnavailableError is a refusal.
 */
export async function judgeCodingTrial({ workspace, fixturePath, envelope, probe }) {
  const checks = [];
  const check = (id, passed, evidence) => checks.push({ id, passed: Boolean(passed), evidence });
  const input = envelope;
  let fixture, suite, snapshot, receipt;
  try {
    const bytes = regularBytes(resolve(fixturePath), INPUT_LIMIT);
    fixture = JSON.parse(bytes.toString("utf8"));
    suite = Object.hasOwn(suites, fixture?.id) ? suites[fixture.id] : null;
    check("fixture-pin", /^[a-f0-9]{64}$/.test(input?.fixtureSha256) && sha256(bytes) === input.fixtureSha256,
      "The copied fixture bytes must match the comparison runner's pinned SHA256.");
    check("fixture-contract", input?.schemaVersion === VERSION && fixture?.schemaVersion === VERSION && suite && input.taskId === fixture.id,
      "The pinned fixture and parent task must identify one supported versioned coding task.");
    check("target-process", input?.process?.exitCode === 0 && input.process.signal === null && input.process.terminatedBy === null && input.process.treeExitProven === true,
      "The parent runner must report a successful, settled target process with no forced termination.");
    try { receipt = JSON.parse(input?.stdout); } catch { receipt = null; }
    check("adapter-identity", receipt?.schemaVersion === VERSION && receipt.kind === "local-coding" && receipt.fixtureId === fixture.id &&
      typeof input.targetId === "string" && input.targetId.length > 0 && receipt.targetId === input.targetId,
      "The structured adapter receipt must match this exact task and target; it does not establish code correctness.");
    check("adapter-execution", receipt?.error === null && receipt.execution?.exitCode === 0 && receipt.execution.signal === null &&
      receipt.execution.truncated === false && receipt.execution.timedOut === false,
      "The actual harness execution must succeed without error, timeout, signal or truncated capture.");
    check("model-observation", Number.isSafeInteger(receipt?.modelRequests) && receipt.modelRequests > 0 && input?.observations?.modelExecution?.modelCalled === true,
      "A forwarded model request and completed response are required adapter observations, not an attestation of serving identity or model quality.");
    try {
      snapshot = solutionSnapshot(workspace);
      check("solution-file", true, `Evaluated source snapshot SHA256 ${snapshot.digest}; regular unsymlinked repo/solution.mjs, at most ${SOURCE_LIMIT} bytes.`);
    } catch {
      check("solution-file", false, "repo/solution.mjs must be a stable, bounded, valid UTF-8 regular file in an unsymlinked repository directory.");
    }
  } catch {
    check("oracle-input", false, "Oracle arguments, comparison envelope or pinned fixture are missing, malformed, changed or exceed their bounds.");
  }
  // The adapter could not contain the harness (Pi): no task outcome was observed.
  if (receipt?.containment?.status === "unavailable") return refusal(`the adapter: ${String(receipt.containment.reason ?? "").slice(0, 200)}`);
  if (suite) {
    if (checks.every(row => row.passed) && snapshot) {
      let result;
      try {
        result = await probe({ sources: { "solution.mjs": snapshot.source }, calls: suite.cases.map(test => ({ id: test.id, module: "solution.mjs", export: suite.exportName, args: test.args })) });
      } catch (error) {
        if (error instanceof ContainmentUnavailableError) return refusal(error.message);
        throw error;
      }
      const rows = Array.isArray(result?.rows) ? result.rows : null, loadFailed = rows?.some(row => row?.outcome === "load-failed");
      const successful = rows !== null && rows.length === suite.cases.length && !loadFailed;
      check("probe-execution", successful, result?.timedOut ? "Solution evaluation exceeded the probe's deadline." :
        loadFailed ? "The module did not load: an import, a syntax or startup error, or a missing export." : "The contained probe must load the import-free module and finish every independent case.");
      for (const [index, test] of suite.cases.entries()) {
        const actual = successful ? rows[index] : null;
        let matched = false;
        if (actual?.id === test.id && actual.mutated === false) {
          if (test.errorName) matched = actual.outcome === "threw" && actual.errorName === test.errorName;
          else if (actual.outcome === "returned" && typeof actual.valueJson === "string") {
            try { matched = isDeepStrictEqual(JSON.parse(actual.valueJson), test.expected); } catch { /* Invalid returned data is a failed case. */ }
          }
        }
        check(`case-${test.id}`, matched, !actual ? "Case not completed because the bounded solution probe failed." :
          actual.mutated ? "The solution mutated its input, including on a possible error path." :
          matched ? "Actual function output or required exception matched the independent fixed expectation." : "Actual function output or exception did not match the independent fixed expectation.");
      }
      try { check("source-unchanged", solutionSnapshot(workspace).digest === snapshot.digest, "The evaluated source bytes and repository boundary must remain unchanged after the probe."); }
      catch { check("source-unchanged", false, "The source or its repository boundary changed during evaluation."); }
    } else {
      for (const test of suite.cases) check(`case-${test.id}`, false, "Planned case was not run because prerequisite evidence or the solution file was invalid.");
    }
  }
  return { schemaVersion: VERSION, verdict: checks.every(row => row.passed) ? "pass" : "fail", checks };
}

async function main() {
  let input = null;
  try { input = await readInput(); } catch { input = null; }
  const [workspace, fixture, containmentPath] = process.argv.slice(2);
  let containment;
  try { containment = containmentPath ? JSON.parse(regularBytes(resolve(containmentPath), 64 * 1024).toString("utf8")).docker : undefined; } catch { containment = undefined; }
  const result = await judgeCodingTrial({ workspace: workspace ?? "", fixturePath: fixture ?? "", envelope: input,
    probe: (probeInput) => runContainedProbeDetailed(containment, probeInput, { timeoutMs: PROBE_TIMEOUT_MS }) });
  process.stdout.write(JSON.stringify(result) + "\n");
}

// Run only when executed; tests and the P1-47 pilot import without running anything.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    process.stdout.write(JSON.stringify({ schemaVersion: VERSION, verdict: "fail", checks: [{ id: "oracle-error", passed: false, evidence: "The coding oracle could not complete; no successful behavior is inferred." }] }) + "\n");
  });
}
