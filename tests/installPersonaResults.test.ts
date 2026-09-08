import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as qa from "../scripts/install-persona-qa.mjs";

const roots: string[] = [];
function temporary() { const dir = mkdtempSync(join(tmpdir(), "amc-persona-results-")); roots.push(dir); return dir; }
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

const score = { ok: true, questionCount: 244, elapsedMs: 123, firstResultSla: { targetMs: 120000, elapsedMs: 123, met: true },
  status: "VALID", artifactStatus: "VALID", evidenceStatus: "INSUFFICIENT_EVIDENCE", claimEligible: false };
const packs = { packs: Array.from({ length: 40 }, (_, i) => ({ packId: String(i) })) };
const roleChecks = {
  solo: [["history", ["history"], "History command exits successfully"]],
  strategy: [["strategy-compare", ["strategy", "compare", "--json"], "Strategy JSON required"]],
  import: [["neutral-import", ["import", "fixture-data", "--dry-run", "--json"], "Import JSON required"]],
  fleet: [["fleet-write", ["fleet", "write"], "Write exits successfully"], ["fleet-validate", ["fleet", "validate"], "Validate exits successfully"]]
};

function fixture(role: keyof typeof roleChecks = "solo", output: Record<string, unknown> = {}, failed: string[] = [], exposeBin = true, raw = false) {
  const tmp = temporary();
  const calls: string[] = [];
  let tick = 1000;
  vi.spyOn(Date, "now").mockImplementation(() => tick);
  const execute = (command: string, args: string[], options: { cwd: string }) => {
    const id = command === "npm" ? "package-install" : args[0] === "--agent" ? "full-score" : args[0] === "domain" ? "domain-packs"
      : args[0] === "strategy" ? "strategy-compare" : args[0] === "import" ? "neutral-import" : args.join(" ");
    calls.push(id); tick += id === "package-install" ? 200 : 700;
    if (command === "npm" && exposeBin) {
      mkdirSync(join(options.cwd, "node_modules", ".bin"), { recursive: true });
      writeFileSync(join(options.cwd, "node_modules", ".bin", "amc"), "fixture only; never executed");
    }
    const payload = id in output ? output[id] : id === "full-score" ? score : id === "domain-packs" ? packs
      : id === "strategy-compare" ? { run: { recommendedStrategyId: "local-safe" } }
      : id === "neutral-import" ? { plan: { status: "ready" } } : {};
    const stdout = typeof payload === "string" ? payload : JSON.stringify(payload);
    const step = { status: failed.includes(id) ? "failed" : "passed", exitCode: failed.includes(id) ? 1 : 0,
      stdout: raw ? stdout.slice(-2500) : stdout, stderr: "", startedAt: "fixture", endedAt: "fixture" };
    if (raw) Object.defineProperty(step, "rawStdout", { value: stdout, enumerable: false });
    return step;
  };
  const result = qa.runPersona({ id: role, name: role, agentId: `${role}-agent`, fixture: "node-cli", checks: roleChecks[role] },
    "fixture.tgz", tmp, { baseEnv: { PATH: process.env.PATH }, execute });
  return { result, calls };
}

describe("automated installation contract results", () => {
  it.each(["solo", "strategy", "import", "fleet"] as const)("reports exact planned checks for %s without human ratings", (role) => {
    const { result } = fixture(role);
    const planned = role === "solo" ? 10 : 11;
    expect(result).toMatchObject({ status: "passed", checkCounts: { planned, executed: planned, passed: planned, failed: 0, skipped: 0 } });
    expect(result).not.toHaveProperty("rating");
    expect(result).not.toHaveProperty("feedback");
    expect(result.summary).toContain(`${planned}/${planned} automated checks passed`);
  });

  it.each(["strategy", "import"] as const)("requires %s evidence even when JSON is null or missing", (role) => {
    for (const payload of [null, "", "not JSON", false, 0, [], {}, { run: null, plan: null }]) {
      const id = role === "strategy" ? "strategy-compare" : "neutral-import";
      const assertion = role === "strategy" ? "strategy-recommendation" : "import-plan-ready";
      const { result } = fixture(role, { [id]: payload });
      expect(result.assertions.find((a: { id: string }) => a.id === assertion)).toMatchObject({ status: "failed" });
      expect(result).toMatchObject({ status: "failed", checkCounts: { planned: 11, passed: 10, failed: 1, skipped: 0 } });
      expect(result.summary).toContain(assertion);
    }
  });

  it.each(["full-score", "domain-packs"])("includes a failed %s assertion in the result summary", (id) => {
    const { result } = fixture("solo", { [id]: null });
    expect(result).toMatchObject({ status: "failed", checkCounts: { planned: 10, passed: 9, failed: 1, skipped: 0 } });
    expect(result.summary).toContain(id === "full-score" ? "full-score-contract" : "domain-pack-count");
    expect(result.feedback ?? result.summary).not.toMatch(/straightforward|acceptable|fast first score|workflow.*worked/);
  });

  it("rejects empty recommendations and unrelated top-level fallback fields", () => {
    for (const value of [{ run: { recommendedStrategyId: " " } }, { recommendedStrategyId: "local-safe" }]) {
      expect(fixture("strategy", { "strategy-compare": value }).result.status).toBe("failed");
    }
    expect(fixture("import", { "neutral-import": { status: "ready" } }).result.status).toBe("failed");
  });

  it("retains unrun checks after a failed installation and never executes a leftover bin", () => {
    const { result, calls } = fixture("solo", {}, ["package-install"]);
    expect(calls).toEqual(["package-install"]);
    expect(result).toMatchObject({ status: "failed", checkCounts: { planned: 10, executed: 1, passed: 0, failed: 1, skipped: 9 } });
    expect([...result.steps.slice(1), ...result.assertions].every((c: { status: string; reason: string }) => c.status === "skipped" && c.reason.includes("package-install"))).toBe(true);
  });

  it("records a missing installed bin and skips all CLI consumers", () => {
    const { result, calls } = fixture("solo", {}, [], false);
    expect(calls).toEqual(["package-install"]);
    expect(result.assertions.find((a: { id: string }) => a.id === "amc-bin")).toMatchObject({ status: "failed" });
    expect(result).toMatchObject({ status: "failed", checkCounts: { planned: 10, executed: 2, passed: 1, failed: 1, skipped: 8 } });
  });

  it("does not accept a failed command's apparently valid JSON", () => {
    const { result } = fixture("strategy", {}, ["strategy-compare"]);
    expect(result.assertions.find((a: { id: string }) => a.id === "strategy-recommendation")).toMatchObject({ status: "skipped" });
    expect(result).toMatchObject({ status: "failed", checkCounts: { planned: 11, passed: 9, failed: 1, skipped: 1 } });
  });
});


describe("persona measurements and serialized reports", () => {
  it("separates command wall time from CLI-reported diagnostic elapsed after JSON serialization", () => {
    const { result } = fixture("solo", { "full-score": { ...score, extra: "x".repeat(4000) } }, [], true, true);
    const restored = JSON.parse(JSON.stringify(result));
    expect(restored).toMatchObject({ status: "passed", measurements: {
      installWallMs: 200, scoreCommandWallMs: 700, cliReportedDiagnosticMs: 123,
      cliReportedSla: { elapsedMs: 123, targetMs: 120000, met: true }
    }, evidence: { questionCount: 244, domainPackCount: 40, artifactStatus: "VALID", evidenceStatus: "INSUFFICIENT_EVIDENCE", claimEligible: false } });
    const report = qa.renderMarkdownReport({ schemaVersion: "2026-09-08", status: "passed", summary: restored.summary,
      startedAt: "fixture", endedAt: "fixture", personaCount: 1, results: [restored], setupSteps: [], setupAssertions: [], scope: "Automated contracts." });
    expect(report).toContain("Install wall ms | Score command wall ms | CLI-reported diagnostic ms");
    expect(report).toContain("200 | 700 | 123 | INSUFFICIENT_EVIDENCE");
    expect(report).not.toMatch(/rating|ease.of.use|straightforward|acceptable|fast first score/i);
    expect(result.steps.find((s: { id: string }) => s.id === "full-score").stdout.length).toBe(2500);
  });

  it("never presents artifact validity as evidence readiness or fills absent status evidence", () => {
    for (const payload of [score, { ...score, evidenceStatus: undefined }, { ...score, artifactStatus: undefined, claimEligible: undefined }]) {
      const { result } = fixture("solo", { "full-score": payload });
      const normalized = JSON.parse(JSON.stringify(result));
      expect(normalized.evidence).toMatchObject({ artifactStatus: payload.artifactStatus ?? null,
        evidenceStatus: payload.evidenceStatus ?? null, claimEligible: payload.claimEligible ?? null });
      const report = qa.renderMarkdownReport({ schemaVersion: "2026-09-08", status: "passed", summary: normalized.summary,
        startedAt: "fixture", endedAt: "fixture", personaCount: 1, results: [normalized], setupSteps: [], setupAssertions: [], scope: "Automated contracts." });
      const lines = report.split("\n");
      const header = lines.find((line) => line.startsWith("| Persona |"))!.split("|").map((cell) => cell.trim());
      const row = lines.find((line) => line.startsWith("| solo |"))!.split("|").map((cell) => cell.trim());
      const evidenceColumn = header.indexOf("Score evidence status");
      expect(evidenceColumn).toBeGreaterThan(0);
      expect(row[evidenceColumn]).toBe(payload.evidenceStatus ?? "n/a");
      expect(row[evidenceColumn]).not.toBe("VALID");
    }
  });

  it.each([undefined, null, -1, "123", Infinity])("does not invent a duration for invalid CLI elapsed %s", (elapsedMs) => {
    const { result } = fixture("solo", { "full-score": { ...score, elapsedMs } });
    expect(result.status).toBe("failed");
    expect(result.measurements.cliReportedDiagnosticMs).toBeNull();
    expect(result.measurements.scoreCommandWallMs).toBe(700);
    expect(result.summary).toContain("full-score-contract");
  });

  it("rejects incoherent declared SLA and nonnumeric question counts", () => {
    for (const output of [{ ...score, firstResultSla: { ...score.firstResultSla, elapsedMs: 500 } },
      { ...score, firstResultSla: { ...score.firstResultSla, met: false } }, { ...score, questionCount: "244" }]) {
      expect(fixture("solo", { "full-score": output }).result.status).toBe("failed");
    }
  });
});

describe("versioned persona CLI receipts", () => {
  it.each(["all-valid", "strategy-missing", "pack-failed", "tarball-missing"])("emits consistent JSON/Markdown and cleans up for %s", (mode) => {
    const tmp = temporary();
    const preload = join(tmp, "synthetic-child.mjs");
    const calls = join(tmp, "calls.jsonl");
    writeFileSync(preload, `
import child from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const mode = ${JSON.stringify(mode)};
child.spawnSync = (command, args, options) => {
  appendFileSync(${JSON.stringify(calls)}, JSON.stringify({ command, args }) + "\\n");
  if (args[0] === "pack") {
    if (!["pack-failed", "tarball-missing"].includes(mode)) writeFileSync(join(args[args.indexOf("--pack-destination") + 1], "fixture.tgz"), "fixture never installed");
    return { status: mode === "pack-failed" ? 1 : 0, stdout: "[]", stderr: mode === "pack-failed" ? "synthetic pack failure" : "" };
  }
  if (command === "npm") {
    mkdirSync(join(options.cwd, "node_modules", ".bin"), { recursive: true });
    writeFileSync(join(options.cwd, "node_modules", ".bin", "amc"), "fixture never executed");
  }
  const data = args[0] === "--agent" ? ${JSON.stringify(score)} : args[0] === "domain" ? ${JSON.stringify(packs)}
    : args[0] === "strategy" ? (mode === "strategy-missing" ? null : { run: { recommendedStrategyId: "local-safe" } })
    : args[0] === "import" ? { plan: { status: "ready" } } : {};
  return { status: 0, stdout: JSON.stringify(data), stderr: "" };
};
syncBuiltinESMExports();
`);
    const out = join(tmp, "receipt.json");
    const child = spawnSync(process.execPath, ["--import", preload, join(process.cwd(), "scripts/install-persona-qa.mjs"), "--json", "--out", out], {
      cwd: tmp, env: { ...process.env, TMPDIR: tmp, TMP: tmp, TEMP: tmp }, encoding: "utf8", timeout: 15000
    });
    expect(child.status, child.stderr).toBe(mode === "all-valid" ? 0 : 1);
    const receipt = JSON.parse(readFileSync(out, "utf8"));
    expect(JSON.parse(child.stdout)).toEqual(receipt);
    expect(receipt).toMatchObject({ schemaVersion: "2026-09-08", receiptType: "install-persona-qa", measurementType: "automated-contract-checks",
      status: mode === "all-valid" ? "passed" : "failed", personaCount: 10, checkCounts: { planned: 103 } });
    expect(receipt).not.toHaveProperty("averageRating");
    const report = readFileSync(join(tmp, "receipt.md"), "utf8");
    expect(report).toContain(receipt.summary);
    expect(report).not.toMatch(/rating|ease.of.use|straightforward|acceptable|fast first score/i);
    expect(receipt.results.every((r: Record<string, unknown>) => !("rating" in r) && !("feedback" in r))).toBe(true);
    if (mode === "all-valid") {
      expect(receipt.checkCounts).toEqual({ planned: 103, executed: 103, passed: 103, failed: 0, skipped: 0 });
      expect(receipt.setupCheckCounts).toEqual({ planned: 2, executed: 2, passed: 2, failed: 0, skipped: 0 });
    } else if (mode === "strategy-missing") {
      expect(receipt.checkCounts).toMatchObject({ passed: 102, failed: 1, skipped: 0 });
      expect(report).toContain("failed strategy-recommendation");
    } else {
      expect(receipt.checkCounts).toEqual({ planned: 103, executed: 0, passed: 0, failed: 0, skipped: 103 });
      expect(receipt.results.every((r: { status: string }) => r.status === "skipped")).toBe(true);
      expect(receipt.setupCheckCounts.failed).toBe(1);
      expect(readFileSync(calls, "utf8").trim().split("\n")).toHaveLength(1);
    }
    expect(readdirSync(tmp).filter((name) => name.startsWith("amc-install-persona-qa-"))).toEqual([]);
  });
});
