import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { collectBenchData } from "../src/bench/benchCollector.js";
import { initBenchPolicy, loadBenchPolicy } from "../src/bench/benchPolicyStore.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import { collectForecastSignals } from "../src/forecast/forecastSignals.js";
import { scoreLevelTransitions, scoreTransitionQuality } from "../src/score/levelTransition.js";
import type { DiagnosticReport } from "../src/types.js";
import { initWorkspace } from "../src/workspace.js";
import { writeAnchoredRun } from "./helpers/sealedRun.js";

/**
 * AXE-27 (remaining sites): an empty evidence denominator reads as not measured, never as full credit.
 */
const roots: string[] = [];
afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("level transition promotion retention", () => {
  const demotion = scoreTransitionQuality({
    agentId: "a", dimension: "reliability", fromLevel: 3, toLevel: 2, direction: "demotion",
    timestamp: "2026-02-24T00:00:00Z", evidenceCount: 20, sustainedDays: 10, adversarialTested: false
  });

  test("no promotions leave retention unmeasured and earn no retention credit", () => {
    const report = scoreLevelTransitions([demotion]);
    expect(report.promotionRetentionRate).toBeNull();
    const withoutRetention = Math.round(report.avgTransitionQuality * 0.5 + Math.max(0, 20 - report.demotionRate * 10));
    expect(report.score).toBe(withoutRetention);
    expect(report.gaps.some((gap) => gap.includes("promotion reversion"))).toBe(false);
  });

  test("a retained promotion is still measured as 1", () => {
    const promotion = scoreTransitionQuality({ ...demotion, fromLevel: 2, toLevel: 3, direction: "promotion" });
    expect(scoreLevelTransitions([promotion]).promotionRetentionRate).toBe(1);
  });
});

function workspace(): string {
  process.env.AMC_VAULT_PASSPHRASE ??= "axe27-remaining-pass";
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-axe27r-")));
  roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  initBenchPolicy(dir);
  return dir;
}

function run(runId: string, ts: number, toolHubUsage?: DiagnosticReport["toolHubUsage"]): DiagnosticReport {
  return {
    agentId: "default", runId, ts, windowStartTs: ts - 86_400_000, windowEndTs: ts, status: "VALID", verificationPassed: true,
    trustBoundaryViolated: false, trustBoundaryMessage: null, integrityIndex: 0.9, trustLabel: "HIGH TRUST", targetProfileId: "default",
    layerScores: [], questionScores: [], inflationAttempts: [], unsupportedClaimCount: 0, contradictionCount: 0, correlationRatio: 0.95,
    invalidReceiptsCount: 0, correlationWarnings: [], evidenceCoverage: 0.9, evidenceTrustCoverage: { observed: 0.9, attested: 0.1, selfReported: 0 },
    targetDiff: [], prioritizedUpgradeActions: [], evidenceToCollectNext: [], runSealSig: "", reportJsonSha256: "",
    ...(toolHubUsage ? { toolHubUsage } : {})
  } as DiagnosticReport;
}

describe("ToolHub denial rate", () => {
  const usage = (toolActionCount: number, deniedActionCount: number) => ({ toolActionCount, toolResultCount: toolActionCount, deniedActionCount });

  test("runs without tool actions add no denial-rate point, and the bench reports it as not measured", () => {
    const ws = workspace(), now = Date.now(), dir = getAgentPaths(ws, "default").runsDir;
    writeAnchoredRun(ws, dir, run("run_none", now - 2 * 86_400_000));
    writeAnchoredRun(ws, dir, run("run_zero", now - 86_400_000, usage(0, 0)));
    const signals = collectForecastSignals({ workspace: ws, scope: { type: "AGENT", id: "default" } });
    expect(signals.points.operating.toolhub_denial_rate ?? []).toEqual([]);
    const bench = collectBenchData({ workspace: ws, scopeType: "AGENT", scopeId: "default", windowDays: 30, policy: loadBenchPolicy(ws) }).bench;
    expect(bench.metrics.operatingHealth.toolhubDenialRate).toBeNull();
  });

  test("a run with tool actions is measured, including a measured zero", () => {
    const ws = workspace(), now = Date.now(), dir = getAgentPaths(ws, "default").runsDir;
    writeAnchoredRun(ws, dir, run("run_some", now - 2 * 86_400_000, usage(4, 1)));
    writeAnchoredRun(ws, dir, run("run_clean", now - 86_400_000, usage(5, 0)));
    const signals = collectForecastSignals({ workspace: ws, scope: { type: "AGENT", id: "default" } });
    expect(signals.points.operating.toolhub_denial_rate?.map((point) => point.value)).toEqual([0.25, 0]);
    const bench = collectBenchData({ workspace: ws, scopeType: "AGENT", scopeId: "default", windowDays: 30, policy: loadBenchPolicy(ws) }).bench;
    expect(bench.metrics.operatingHealth.toolhubDenialRate).toBe(0);
  });
});
