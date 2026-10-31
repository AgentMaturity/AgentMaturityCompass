import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { analyze as analyzeModule } from "../examples/harness-comparison/pilot/analyze.mjs";

// P1-47 analysis on synthetic report.json fixtures. These numbers are made up for the test and are never results.
type Trial = Record<string, unknown>;
type Row = Record<string, any>; // the .mjs analysis output is untyped
const analyze = analyzeModule as unknown as (reports: unknown[]) => { [section: string]: Row } & { taskQuality: { perTask: Row[]; pairs: Row[] }; overhead: { pairs: Row[] };
  cost: Row[]; falseBlocks: { model: Row[]; scripted: Row[] }; planned: Row; excluded: Row; recovery: Row; actionEvidence: Row };
const directories: string[] = [];
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true }); });

const usage = { inputTokens: 10, outputTokens: 5, cacheReadTokens: null, cacheWriteTokens: null, source: "provider-response", evidenceRef: "test" };
const cost = (amountUsd: number) => ({ amountUsd, source: "published-rate-calculation", sourceUrl: "https://example.com/rates", asOf: "2026-10-01", evidenceRef: "test" });
function trial(targetId: string, taskId: string, options: { verdict?: "pass" | "fail" | null; status?: string; ms?: number; usd?: number | null; rep?: number;
  lane?: string; laneKind?: string; falsePositives?: { count: number; eligible: number }; checks?: Array<{ id: string; passed: boolean | null }>; observedOutcome?: string | null } = {}): Trial {
  const status = options.status ?? "executed", verdict = status === "executed" ? (options.verdict ?? "pass") : null;
  const ran = status !== "unavailable";
  return { id: `${targetId}-${taskId}-r${options.rep ?? 1}`, targetId, taskId, laneId: options.lane ?? "live", laneKind: options.laneKind ?? "live-provider",
    repetition: options.rep ?? 1, scenario: "success", status, verdict, observedOutcome: options.observedOutcome ?? verdict, modelCalled: ran ? true : null,
    reason: status === "executed" ? null : status === "unavailable" ? "Required named live credentials are unavailable." : "The independent oracle could not determine the scenario outcome.",
    process: ran ? { exitCode: 0, signal: null, terminatedBy: null, treeExitProven: true, durationMs: options.ms ?? 1000 } : null,
    oracle: ran && verdict ? { schemaVersion: "2026-09-08", verdict, checks: options.checks ?? [{ id: "x", passed: verdict === "pass" }],
      ...(options.falsePositives ? { falsePositives: { ...options.falsePositives, evidenceRef: "test" } } : {}) } : null,
    observations: ran && options.usd !== null ? { schemaVersion: "2026-09-08", usage, ...(options.usd === undefined ? {} : { cost: cost(options.usd) }) } : null,
    budgetStatus: "within-recorded-bounds", artifacts: [] };
}
const report = (trials: Trial[], laneKind = "live-provider") => ({ schemaVersion: "2026-09-08", comparisonId: "pilot-test", manifestSha256: "a".repeat(64),
  manifest: { lanes: [{ id: (trials[0]?.laneId as string) ?? "live", kind: laneKind }] }, trials });

describe("P1-47 pilot analysis", () => {
  test("overhead uses only pairs matched on task, lane, setup and repetition where both passed", () => {
    const out = analyze([report([
      trial("pi-contained", "cod-a", { ms: 1000 }), trial("pi-contained-amc", "cod-a", { ms: 1100 }),
      trial("pi-contained", "cod-b", { ms: 1000 }), trial("pi-contained-amc", "cod-b", { ms: 5000, verdict: "fail" }),
      trial("pi-contained", "cod-c", { ms: 1000 }), trial("pi-contained-amc", "cod-c", { status: "unavailable" }),
      trial("pi-contained", "cod-a", { ms: 2000, rep: 2 }), trial("pi-contained-amc", "cod-a", { ms: 9000, rep: 3 })
    ])]);
    const pair = out.overhead.pairs.find((row) => row.treatment === "pi-contained-amc")!;
    expect(pair).toMatchObject({ baseline: "pi-contained", lane: "live", matchedPairs: 1, median: 0.1, p95: 0.1 });
    expect(pair.gates).toEqual({ medianAtMost10Percent: "met", p95AtMost15Percent: "met" });
  });

  test("failed trials stay in cost and per-correct spend counts them", () => {
    const out = analyze([report([trial("pi-contained", "fin-a", { usd: 1 }), trial("pi-contained", "fin-b", { usd: 3, verdict: "fail" })])]);
    expect(out.cost.find((row) => row.targetId === "pi-contained")!).toMatchObject({ spendUsd: 4, correctOutcomes: 1, costPerCorrectUsd: 4, trialsWithCost: 2 });
  });

  test("missing usage or cost leaves cost unknown, never zero", () => {
    const out = analyze([report([trial("pi-contained", "fin-a", { usd: 1 }), trial("pi-contained", "fin-b", { usd: null })])]);
    const row = out.cost.find((entry) => entry.targetId === "pi-contained")!;
    expect(row.spendUsd).toBeNull(); expect(row.costPerCorrectUsd).toBeNull();
    expect(row.unknownReason).toMatch(/missing/);
  });

  test("inconclusive trials never count as passes", () => {
    const out = analyze([report([trial("pi-contained", "reg-a", { status: "inconclusive", observedOutcome: "pass" }), trial("pi-contained-amc", "reg-a", {})])]);
    const base = out.taskQuality.perTask.find((row) => row.targetId === "pi-contained")!;
    expect(base).toMatchObject({ ran: 1, passes: 0, inconclusive: 1, success: 0 });
  });

  test("paired task-level differences carry a task-clustered t interval and their variance for P2-20", () => {
    const trials = [["cod-a", "pass", "pass"], ["reg-b", "fail", "pass"], ["fin-c", "fail", "fail"]].flatMap(([task, base, amc]) =>
      [trial("pi-contained", task!, { verdict: base as "pass" | "fail" }), trial("pi-contained-amc", task!, { verdict: amc as "pass" | "fail" })]);
    const pair = analyze([report(trials)]).taskQuality.pairs.find((row) => row.treatment === "pi-contained-amc")!;
    // Differences 0, 1, 0: mean 1/3, sample variance 1/3, t(2, 0.975) = 4.303.
    expect(pair.tasks).toBe(3);
    expect(pair.meanDifference).toBeCloseTo(1 / 3, 10);
    expect(pair.varianceOfTaskDifferences).toBeCloseTo(1 / 3, 10);
    expect(pair.ci95[0]).toBeCloseTo(1 / 3 - 4.303 * Math.sqrt(1 / 9), 3);
    expect(pair.ci95[1]).toBeCloseTo(1 / 3 + 4.303 * Math.sqrt(1 / 9), 3);
    expect(pair.perDomain.regulated).toMatchObject({ tasks: 1, meanDifference: 1, ci95: null });
  });

  test("scripted lanes are excluded from every result and only their false blocks are reported, separately", () => {
    const scripted = report([trial("pi-contained-amc", "cod-a", { lane: "scripted", laneKind: "keyless-conformance", usd: 0, falsePositives: { count: 1, eligible: 4 } }),
      trial("pi-contained", "cod-a", { lane: "scripted", laneKind: "keyless-conformance" })], "keyless-conformance");
    const out = analyze([scripted]);
    expect(out.taskQuality.perTask).toEqual([]);
    expect(out.cost).toEqual([]);
    expect(out.excluded.scriptedTrials).toBe(2);
    expect(out.falseBlocks.scripted.find((row) => row.targetId === "pi-contained-amc")).toMatchObject({ count: 1, eligible: 4, rate: 0.25, gate: "not met" });
    expect(out.falseBlocks.model).toEqual([]);
  });

  test("every planned trial stays counted, with unavailable reasons", () => {
    const out = analyze([report([trial("pi-contained", "cod-a", { status: "unavailable" }), trial("pi-contained-amc", "cod-a", { status: "unavailable" })])]);
    expect(out.planned).toMatchObject({ trials: 2, unavailable: 2, executed: 0, inconclusive: 0 });
    expect(out.planned.unavailableReasons).toEqual({ "Required named live credentials are unavailable.": 2 });
    expect(out.overhead.pairs.every((row) => Object.values(row.gates).every(gate => gate === "not measured"))).toBe(true);
  });

  test("recovery counts duplicate effects from the fin-ops oracle; revocation stays not measured", () => {
    const out = analyze([report([trial("pi-contained", "fin-a", { verdict: "fail", checks: [{ id: "no-duplicate-effect", passed: false }] }),
      trial("pi-contained", "fin-b", { checks: [{ id: "no-duplicate-effect", passed: true }] })])]);
    expect(out.recovery.duplicateEffects).toMatchObject({ trialsChecked: 2, trialsWithDuplicates: 1, gate: "not met" });
    expect(out.recovery.dispatchAfterRevocation.status).toBe("not measured");
    expect(out.actionEvidence.status).toBe("not measured");
  });

  test("the output has no ranking, winner or superiority field", () => {
    const out = analyze([report([trial("pi-contained", "cod-a"), trial("pi-contained-amc", "cod-a")])]);
    expect(JSON.stringify(out)).not.toMatch(/"(rank|ranking|winner|superior|superiorityFactor)"/i);
  });

  test("the command line reads report.json files only and refuses an existing output directory", () => {
    const root = mkdtempSync(join(tmpdir(), "amc-pilot-analysis-")); directories.push(root);
    mkdirSync(join(root, "run1"));
    writeFileSync(join(root, "run1", "report.json"), JSON.stringify(report([trial("pi-contained", "cod-a"), trial("pi-contained-amc", "cod-a")])));
    const cli = resolve("examples/harness-comparison/pilot/analyze.mjs");
    const ok = spawnSync(process.execPath, [cli, "--reports", join(root, "run1"), "--out", join(root, "analysis")], { encoding: "utf8" });
    expect(ok.status, ok.stderr).toBe(0);
    const written = JSON.parse(readFileSync(join(root, "analysis", "analysis.json"), "utf8"));
    expect(written.inputs[0]).toMatchObject({ comparisonId: "pilot-test", trials: 2 });
    expect(written.inputs[0].reportSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(readFileSync(join(root, "analysis", "analysis.md"), "utf8")).toContain("No ranking");
    const again = spawnSync(process.execPath, [cli, "--reports", join(root, "run1"), "--out", join(root, "analysis")], { encoding: "utf8" });
    expect(again.status).not.toBe(0);
  });
});
