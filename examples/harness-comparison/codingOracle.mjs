#!/usr/bin/env node
// Three controlled pure-JS repair tasks, not a representative coding benchmark.
// The comparison runner pins this file and remains the authority for target
// cleanup/provenance. This import-free VM child is bounded, not an OS sandbox.
// Expected values are never in the target workspace or VM probe input; only
// the parent compares them. No AMC-specific ledger or runtime is required.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import vm from "node:vm";

const VERSION = "2026-09-08";
const SOURCE_LIMIT = 128 * 1024;
const INPUT_LIMIT = 2 * 1024 * 1024;
const PROBE_TIMEOUT_MS = 2500;
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const valueCase = (id, args, expected) => ({ id, args, expected });
const errorCase = (id, args, errorName) => ({ id, args, errorName });
const suites = {
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

async function probeSource(source, suite, workspace) {
  return new Promise(resolveProbe => {
    // Inherit the outer oracle's process group so its cancellation owns all
    // descendants. Do not detach a nested group or launch via a shell.
    const child = spawn(process.execPath, ["--experimental-vm-modules", "--no-warnings", "--max-old-space-size=64", fileURLToPath(import.meta.url), "--probe"], {
      cwd: workspace, env: { LANG: "C.UTF-8", TZ: "UTC" }, stdio: ["pipe", "pipe", "pipe"], shell: false
    });
    const stdout = []; let stdoutBytes = 0, stderrBytes = 0, truncated = false, timedOut = false, spawnError = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, PROBE_TIMEOUT_MS);
    child.on("error", () => { spawnError = true; });
    child.stdout.on("data", chunk => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > 64 * 1024) { truncated = true; child.kill("SIGKILL"); }
      else stdout.push(chunk);
    });
    child.stderr.on("data", chunk => { stderrBytes += chunk.length; if (stderrBytes > 8 * 1024) { truncated = true; child.kill("SIGKILL"); } });
    child.stdin.on("error", () => {});
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      let output = null;
      if (!timedOut && !truncated && !spawnError && exitCode === 0 && signal === null) {
        try { output = JSON.parse(Buffer.concat(stdout).toString("utf8")); } catch { /* Explicit failed probe below. */ }
      }
      resolveProbe({ exitCode, signal, timedOut, truncated, spawnError, output });
    });
    child.stdin.end(JSON.stringify({ source, exportName: suite.exportName, cases: suite.cases.map(({ id, args }) => ({ id, args })) }));
  });
}

async function runProbe() {
  const input = await readInput(), rows = [];
  for (const test of input.cases) {
    // A fresh context prevents one case's globals or argument mutations from
    // influencing another. All arguments belong to the target's own VM realm.
    const context = vm.createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } });
    const arrayPrototype = new vm.Script("Array.prototype").runInContext(context);
    const objectPrototype = new vm.Script("Object.prototype").runInContext(context);
    const module = new vm.SourceTextModule(input.source, { context, identifier: "solution.mjs",
      importModuleDynamically: () => { throw new Error("imports-not-supported"); } });
    await module.link(() => { throw new Error("imports-not-supported"); });
    await module.evaluate({ timeout: 250 });
    const fn = module.namespace[input.exportName];
    if (typeof fn !== "function") throw new Error("missing-export");
    const args = new vm.Script(`(${JSON.stringify(test.args)})`).runInContext(context);
    let row, value;
    try {
      value = fn(...args);
    } catch (error) {
      const name = error?.name;
      row = { id: test.id, outcome: "threw", errorName: ["TypeError", "RangeError", "SyntaxError"].includes(name) ? name : "Error" };
    }
    if (!row) {
      // Copy only ordinary dense arrays and primitive leaves. Never call target
      // toJSON/getters or interpret a serialization failure as its TypeError.
      // These contracts return arrays, so objects/promises are invalid output.
      let remaining = 8192;
      const copy = (item, depth = 0) => {
        if (--remaining < 0 || depth > 32) throw new Error("output-bound");
        if (typeof item === "string" || typeof item === "number" && Number.isFinite(item)) return item;
        if (!Array.isArray(item) || Object.getPrototypeOf(item) !== arrayPrototype || item.length > 4096) throw new Error("ordinary-array-required");
        const descriptors = Object.getOwnPropertyDescriptors(item);
        if (Reflect.ownKeys(descriptors).length !== item.length + 1) throw new Error("custom-array-properties");
        return Array.from({ length: item.length }, (_, index) => {
          const descriptor = descriptors[index];
          if (!descriptor || !Object.hasOwn(descriptor, "value")) throw new Error("sparse-or-accessor-array");
          return copy(descriptor.value, depth + 1);
        });
      };
      try { row = { id: test.id, outcome: "returned", valueJson: JSON.stringify(copy(value)) }; }
      catch { row = { id: test.id, outcome: "invalid-output" }; }
    }
    // Do not use target toJSON/prototype methods to decide input immutability.
    // Reconstruct data through own descriptors and compare with trusted input.
    let inputBudget = 8192;
    const inputCopy = (item, depth = 0) => {
      if (--inputBudget < 0 || depth > 32) throw new Error("input-observation-bound");
      if (item === null || ["string", "boolean"].includes(typeof item) || typeof item === "number" && Number.isFinite(item)) return item;
      const array = Array.isArray(item);
      if (!item || typeof item !== "object" || Object.getPrototypeOf(item) !== (array ? arrayPrototype : objectPrototype)) throw new Error("changed-input-type");
      const descriptors = Object.getOwnPropertyDescriptors(item);
      if (array) {
        if (item.length > 4096 || Reflect.ownKeys(descriptors).length !== item.length + 1) throw new Error("changed-array-properties");
        return Array.from({ length: item.length }, (_, index) => {
          const descriptor = descriptors[index];
          if (!descriptor || !Object.hasOwn(descriptor, "value")) throw new Error("changed-array-property");
          return inputCopy(descriptor.value, depth + 1);
        });
      }
      const result = {};
      for (const key of Reflect.ownKeys(descriptors)) {
        const descriptor = descriptors[key];
        if (typeof key !== "string" || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable) throw new Error("changed-object-property");
        Object.defineProperty(result, key, { value: inputCopy(descriptor.value, depth + 1), enumerable: true });
      }
      return result;
    };
    try { row.mutated = !isDeepStrictEqual(inputCopy(args), test.args); }
    catch { row.mutated = true; }
    rows.push(row);
  }
  process.stdout.write(JSON.stringify({ rows }) + "\n");
}

async function runOracle() {
  const checks = [];
  const check = (id, passed, evidence) => checks.push({ id, passed: Boolean(passed), evidence });
  let input, fixture, suite, snapshot;
  try {
    if (process.argv.length !== 4) throw new Error("arguments");
    input = await readInput();
    const bytes = regularBytes(resolve(process.argv[3]), INPUT_LIMIT);
    fixture = JSON.parse(bytes.toString("utf8"));
    suite = Object.hasOwn(suites, fixture?.id) ? suites[fixture.id] : null;
    check("fixture-pin", /^[a-f0-9]{64}$/.test(input?.fixtureSha256) && sha256(bytes) === input.fixtureSha256,
      "The copied fixture bytes must match the comparison runner's pinned SHA256.");
    check("fixture-contract", input?.schemaVersion === VERSION && fixture?.schemaVersion === VERSION && suite && input.taskId === fixture.id,
      "The pinned fixture and parent task must identify one supported versioned coding task.");
    check("target-process", input?.process?.exitCode === 0 && input.process.signal === null && input.process.terminatedBy === null && input.process.treeExitProven === true,
      "The parent runner must report a successful, settled target process with no forced termination.");
    let receipt;
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
      snapshot = solutionSnapshot(process.argv[2]);
      check("solution-file", true, `Evaluated source snapshot SHA256 ${snapshot.digest}; regular unsymlinked repo/solution.mjs, at most ${SOURCE_LIMIT} bytes.`);
    } catch {
      check("solution-file", false, "repo/solution.mjs must be a stable, bounded, valid UTF-8 regular file in an unsymlinked repository directory.");
    }
  } catch {
    check("oracle-input", false, "Oracle arguments, comparison envelope or pinned fixture are missing, malformed, changed or exceed their bounds.");
  }
  if (suite) {
    if (checks.every(row => row.passed) && snapshot) {
      const result = await probeSource(snapshot.source, suite, realpathSync(resolve(process.argv[2])));
      const successful = result.exitCode === 0 && result.signal === null && !result.timedOut && !result.truncated && !result.spawnError &&
        Array.isArray(result.output?.rows) && result.output.rows.length === suite.cases.length;
      check("probe-execution", successful, result.timedOut ? `Solution evaluation exceeded the ${PROBE_TIMEOUT_MS}ms child deadline.` :
        result.truncated ? "Solution evaluation exceeded the child output bound." : "A bounded Node child must load the import-free module and finish every independent case without startup, syntax or export failure.");
      for (const [index, test] of suite.cases.entries()) {
        const actual = successful ? result.output.rows[index] : null;
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
      try { check("source-unchanged", solutionSnapshot(process.argv[2]).digest === snapshot.digest, "The evaluated source bytes and repository boundary must remain unchanged after the probe."); }
      catch { check("source-unchanged", false, "The source or its repository boundary changed during evaluation."); }
    } else {
      for (const test of suite.cases) check(`case-${test.id}`, false, "Planned case was not run because prerequisite evidence or the solution file was invalid.");
    }
  }
  process.stdout.write(JSON.stringify({ schemaVersion: VERSION, verdict: checks.every(row => row.passed) ? "pass" : "fail", checks }) + "\n");
}

if (process.argv[2] === "--probe") {
  runProbe().catch(() => { process.stderr.write("Solution probe failed during module loading or observation.\n"); process.exitCode = 1; });
} else {
  runOracle().catch(() => {
    process.stdout.write(JSON.stringify({ schemaVersion: VERSION, verdict: "fail", checks: [{ id: "oracle-error", passed: false, evidence: "The coding oracle could not complete; no successful behavior is inferred." }] }) + "\n");
  });
}
