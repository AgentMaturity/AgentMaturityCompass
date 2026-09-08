import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { comparisonOracleSchema } from "../src/benchmarks/harnessComparisonSchema.js";

// These are synthetic oracle-contract fixtures. They do not run a harness or
// model, and cannot establish coding quality, comparative scores or superiority.
// Authored during implementation; execution is deferred to the final batch.
type CodingFixture = { schemaVersion: string; id: string; description: string; prompt: string; files: Record<string, string> };
const fixtures: CodingFixture[] = JSON.parse(readFileSync(resolve("examples/harness-comparison/codingCases.json"), "utf8"));
const oracle = resolve("examples/harness-comparison/codingOracle.mjs");
const directories: string[] = [];
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true }); });
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");

// Independently authored reference repairs. Production oracle expected values
// are not imported into these implementations or sent to the evaluated module.
const reference: Record<string, string> = {
  "coding-range-normalization": String.raw`
export function normalizeRanges(ranges) {
  if (!Array.isArray(ranges) || ranges.some(r => !Array.isArray(r) || r.length !== 2 || !r.every(Number.isSafeInteger))) throw new TypeError();
  const sorted = ranges.map(([a,b]) => [Math.min(a,b), Math.max(a,b)]).sort((a,b) => a[0]-b[0] || a[1]-b[1]);
  const result = [];
  for (const range of sorted) {
    const tail = result[result.length-1];
    if (tail && range[0] <= tail[1]+1) tail[1] = Math.max(tail[1], range[1]);
    else result.push(range);
  }
  return result;
}`,
  "coding-quoted-csv": String.raw`
export function parseCsv(text) {
  if (typeof text !== 'string') throw new TypeError();
  if (!text.length) return [];
  const rows = []; let row = [], field = '', state = 'start', ended = false;
  for (let i=0; i<text.length; i++) {
    const c = text[i]; ended = false;
    if (state === 'quoted') {
      if (c === '"') {
        if (text[i+1] === '"') { field += '"'; i++; }
        else state = 'closed';
      } else field += c;
      continue;
    }
    if (c === ',') { row.push(field); field=''; state='start'; continue; }
    if (c === '\n' || c === '\r') {
      if (c === '\r') { if (text[i+1] !== '\n') throw new SyntaxError(); i++; }
      row.push(field); rows.push(row); row=[]; field=''; state='start'; ended=true; continue;
    }
    if (state === 'closed') throw new SyntaxError();
    if (c === '"') { if (state !== 'start') throw new SyntaxError(); state='quoted'; }
    else { field += c; state='plain'; }
  }
  if (state === 'quoted') throw new SyntaxError();
  if (!ended) { row.push(field); rows.push(row); }
  return rows;
}`,
  "coding-stable-dependencies": String.raw`
export function orderDependencies(records) {
  if (!Array.isArray(records)) throw new TypeError();
  const entries = new Map();
  for (const r of records) {
    if (!r || typeof r !== 'object' || Array.isArray(r) || typeof r.id !== 'string' || !r.id || !Array.isArray(r.dependsOn) || r.dependsOn.some(d => typeof d !== 'string' || !d) || entries.has(r.id)) throw new TypeError();
    entries.set(r.id, new Set(r.dependsOn));
  }
  for (const deps of entries.values()) for (const d of deps) if (!entries.has(d)) throw new TypeError();
  const result = [], complete = new Set();
  while (result.length < records.length) {
    const next = records.find(r => !complete.has(r.id) && [...entries.get(r.id)].every(d => complete.has(d)));
    if (!next) throw new RangeError();
    result.push(next.id); complete.add(next.id);
  }
  return result;
}`
};

function context(id = "coding-range-normalization", source?: string) {
  const fixture = fixtures.find(row => row.id === id);
  if (!fixture) throw new Error("Missing test fixture");
  const workspace = mkdtempSync(join(tmpdir(), "amc-coding-oracle-")); directories.push(workspace);
  mkdirSync(join(workspace, "repo"));
  const solution = join(workspace, "repo", "solution.mjs"), fixturePath = join(workspace, "fixture.json");
  const fixtureBytes = JSON.stringify(fixture);
  writeFileSync(solution, source ?? reference[id]!); writeFileSync(fixturePath, fixtureBytes);
  const receipt = { schemaVersion: "2026-09-08", kind: "local-coding", fixtureId: id, targetId: "fixture-harness",
    execution: { exitCode: 0, signal: null as string | null, timedOut: false, truncated: false }, error: null as string | null, modelRequests: 1 };
  const envelope = { schemaVersion: "2026-09-08", taskId: id, targetId: "fixture-harness", trialId: "fixture-trial",
    process: { exitCode: 0, signal: null as string | null, terminatedBy: null as string | null, treeExitProven: true },
    stdout: "", stderr: "", fixtureSha256: hash(fixtureBytes),
    observations: { schemaVersion: "2026-09-08", modelExecution: { modelCalled: true, source: "adapter-observation", evidenceRef: "Synthetic observation; no model was called in this test." } } };
  function run() {
    envelope.stdout = JSON.stringify(receipt);
    const result = spawnSync(process.execPath, [oracle, workspace, fixturePath], {
      input: JSON.stringify(envelope), encoding: "utf8", timeout: 10_000, maxBuffer: 512 * 1024,
      env: { LANG: "C.UTF-8", TZ: "UTC" }
    });
    expect(result.error).toBeUndefined(); expect(result.signal).toBeNull(); expect(result.status).toBe(0);
    return comparisonOracleSchema.parse(JSON.parse(result.stdout));
  }
  return { workspace, fixture, fixturePath, solution, receipt, envelope, run };
}

describe("neutral coding output oracle", () => {
  test.each(["coding-range-normalization", "coding-quoted-csv", "coding-stable-dependencies"])("accepts a working repair for %s without AMC-specific evidence", id => {
    const result = context(id).run();
    expect(result.verdict).toBe("pass");
    expect(result.checks.filter(check => check.id.startsWith("case-")).length).toBeGreaterThan(10);
    expect(result.checks.every(check => check.passed)).toBe(true);
  }, 15_000);

  test.each(["coding-range-normalization", "coding-quoted-csv", "coding-stable-dependencies"])("rejects the original buggy source for %s despite a successful target receipt", id => {
    const fixture = fixtures.find(row => row.id === id)!;
    const result = context(id, fixture.files["repo/solution.mjs"]).run();
    expect(result.verdict).toBe("fail");
    expect(result.checks.some(check => check.id.startsWith("case-") && check.passed === false)).toBe(true);
    expect(result.checks.find(check => check.id === "adapter-execution")?.passed).toBe(true);
  }, 15_000);

  test("rejects a mutation even when returned ranges are correct", () => {
    const source = reference["coding-range-normalization"]!.replace("return result;", "ranges.reverse(); return result;");
    const result = context("coding-range-normalization", source).run();
    expect(result.checks.find(check => check.id === "case-reverse-adjacent")).toMatchObject({ passed: false, evidence: expect.stringContaining("mutated") });
  });

  test("custom serialization cannot impersonate correct plain-array output", () => {
    const source = reference["coding-range-normalization"]!.replace("return result;", "return {toJSON() { return result; }};");
    const result = context("coding-range-normalization", source).run();
    expect(result.checks.find(check => check.id === "case-empty")?.passed).toBe(false);
  });

  test.each(["target-exit", "target-signal", "unsettled-tree", "target-timeout", "receipt-exit", "receipt-signal", "receipt-timeout", "truncated", "error", "no-requests", "no-response", "target-identity", "fixture-identity", "fixture-pin"])("refuses missing or contradictory execution evidence: %s", kind => {
    const trial = context();
    switch (kind) {
      case "target-exit": trial.envelope.process.exitCode = 7; break;
      case "target-signal": trial.envelope.process.signal = "SIGTERM"; break;
      case "unsettled-tree": trial.envelope.process.treeExitProven = false; break;
      case "target-timeout": trial.envelope.process.terminatedBy = "timeout"; break;
      case "receipt-exit": trial.receipt.execution.exitCode = 7; break;
      case "receipt-signal": trial.receipt.execution.signal = "SIGTERM"; break;
      case "receipt-timeout": trial.receipt.execution.timedOut = true; break;
      case "truncated": trial.receipt.execution.truncated = true; break;
      case "error": trial.receipt.error = "Harness failed"; break;
      case "no-requests": trial.receipt.modelRequests = 0; break;
      case "no-response": trial.envelope.observations.modelExecution.modelCalled = false; break;
      case "target-identity": trial.receipt.targetId = "another-harness"; break;
      case "fixture-identity": trial.receipt.fixtureId = "coding-quoted-csv"; break;
      case "fixture-pin": trial.envelope.fixtureSha256 = "0".repeat(64); break;
    }
    const result = trial.run(); expect(result.verdict).toBe("fail");
    const cases = result.checks.filter(check => check.id.startsWith("case-"));
    expect(cases).toHaveLength(13); expect(cases.every(check => check.passed === false)).toBe(true);
  });

  test.each(["file-symlink", "repo-symlink", "oversized", "missing"])("refuses an unsafe or unusable solution: %s", kind => {
    const trial = context();
    if (kind === "oversized") writeFileSync(trial.solution, " ".repeat(128 * 1024 + 1));
    else if (kind === "missing") rmSync(trial.solution);
    else if (kind === "file-symlink") {
      const outside = join(trial.workspace, "elsewhere.mjs"); writeFileSync(outside, reference["coding-range-normalization"]!);
      rmSync(trial.solution); symlinkSync(outside, trial.solution);
    } else {
      rmSync(join(trial.workspace, "repo"), { recursive: true });
      const outside = join(trial.workspace, "other-repo"); mkdirSync(outside); writeFileSync(join(outside, "solution.mjs"), reference["coding-range-normalization"]!);
      symlinkSync(outside, join(trial.workspace, "repo"));
    }
    const result = trial.run(); expect(result.verdict).toBe("fail");
    expect(result.checks.find(check => check.id === "solution-file")?.passed).toBe(false);
  });

  test.each([
    ["syntax", "export function normalizeRanges( {"],
    ["startup-throw", "throw new Error('failed');"],
    ["missing-export", "export const somethingElse = 1;"],
    ["async-output", "export async function normalizeRanges() { return []; }"]
  ])("reports unusable module behavior: %s", (_name, source) => {
    expect(context("coding-range-normalization", source).run().verdict).toBe("fail");
  });

  test("refuses module imports before their filesystem effect", () => {
    const trial = context(); const marker = join(trial.workspace, "should-not-exist");
    writeFileSync(trial.solution, `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(marker)},'bad'); export const normalizeRanges = () => [];`);
    const result = trial.run(); expect(result.verdict).toBe("fail"); expect(existsSync(marker)).toBe(false);
    expect(result.checks.find(check => check.id === "probe-execution")?.passed).toBe(false);
  });

  test("terminates a nonreturning function and keeps every planned case failed", () => {
    const result = context("coding-range-normalization", "export function normalizeRanges() { while (true) {} }").run();
    expect(result.verdict).toBe("fail");
    expect(result.checks.find(check => check.id === "probe-execution")).toMatchObject({ passed: false, evidence: expect.stringContaining("deadline") });
    expect(result.checks.filter(check => check.id.startsWith("case-") && check.passed === false)).toHaveLength(13);
  }, 15_000);
});
