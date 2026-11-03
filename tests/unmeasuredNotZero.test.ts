import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { collectBenchData } from "../src/bench/benchCollector.js";
import { benchComparisonWithInputs } from "../src/bench/benchComparer.js";
import { flattenBenchMetrics, percentileTable } from "../src/bench/benchPercentiles.js";
import { initBenchPolicy, loadBenchPolicy } from "../src/bench/benchPolicyStore.js";
import type { BenchArtifact } from "../src/bench/benchSchema.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import { initWorkspace } from "../src/workspace.js";
import { writeAnchoredRun } from "./helpers/sealedRun.js";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";
import { evaluateValueEvidenceGates } from "../src/value/valueEvidenceGates.js";
import { defaultValuePolicy } from "../src/value/valuePolicySchema.js";
import { trustKindShares } from "../src/value/valueScoring.js";

/**
 * 2.0 truth reset, residual cases: a value AMC did not measure reads not evaluated (null with a reason), never 0.
 * A real count of 0 events stays a measured 0.
 */
const layerName: LayerName = "Strategic Agent Operations";
const score = (questionId: string): QuestionScore => ({ questionId, claimedLevel: 4, supportedMaxLevel: 4, finalLevel: 4,
  confidence: 0.95, evidenceEventIds: [`ev-${questionId}`], flags: [], narrative: `${questionId} supported` });
const metricInput = (over: Partial<Parameters<typeof buildMetricValidationReport>[0]> = {}): Parameters<typeof buildMetricValidationReport>[0] => {
  const questionScores = Array.from({ length: 6 }, (_, index) => score(`AMC-1.${index + 1}`));
  return { agentId: "agent-a", runId: "run-a", ts: Date.UTC(2026, 5, 13), trustLabel: "HIGH TRUST", integrityIndex: 1,
    evidenceCoverage: 1, correlationRatio: 1, unsupportedClaimCount: 0,
    layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }], questionScores,
    questions: questionScores.map((row) => ({ id: row.questionId, layerName })), ...over };
};

describe("metric validity", () => {
  test("a metric with no question scores has no construct validity and no interval, and fails closed", () => {
    const row = buildMetricValidationReport(metricInput({ questionScores: [], questions: [] })).rows[0]!;
    expect(row.constructValidity).toBeNull();
    expect(row.confidenceInterval).toBeNull();
    expect(row.testRetestStability).toBeNull();
    expect(row.status).toBe("fail");
    expect(row.warnings).toContain("construct validity not evaluated: no question scores");
  });

  test("an unmeasured correlation earns no construct validity credit and is named, not read as a measured 0", () => {
    const measured = buildMetricValidationReport(metricInput({ correlationRatio: 0 }));
    const unmeasured = buildMetricValidationReport(metricInput({ correlationRatio: null }));
    expect(unmeasured.rows[0]!.constructValidity).toBe(measured.rows[0]!.constructValidity);
    expect(unmeasured.warnings).toContain("correlation ratio not measured (no receipted trace); it adds no construct validity");
    expect(measured.warnings.join("\n")).not.toMatch(/correlation ratio not measured/);
  });

  test("a prior run with no layer scores adds no 0 to test-retest stability", () => {
    const prior = (runId: string, ts: number, layers: number[]): DiagnosticReport => ({ agentId: "agent-a", runId, ts,
      layerScores: layers.map((avgFinalLevel) => ({ layerName, avgFinalLevel, confidenceWeightedFinalLevel: avgFinalLevel })) }) as DiagnosticReport;
    const steady = [prior("p1", 1, [4]), prior("p2", 2, [4])];
    const withEmpty = [...steady, prior("p3", 3, [])];
    const overall = (priors: DiagnosticReport[]) => buildMetricValidationReport(metricInput(), priors).rows[0]!.testRetestStability;
    expect(overall(withEmpty)).toBe(overall(steady));
  });
});

describe("value report", () => {
  test("strong-claim gates read an unmeasured integrity or observed share as not measured, never as 0", () => {
    const result = evaluateValueEvidenceGates(defaultValuePolicy(), { integrityIndex: null, correlationRatio: 1,
      observedShare: null, selfReportedShare: null, notaryRequired: false, notaryHealthy: true });
    expect(result.ok).toBe(false);
    expect(result.reasons).toEqual(["integrityIndex not measured", "observedShare not measured (no value events)"]);
  });

  test("a policy minimum of 0 sets no requirement, and a maximum has nothing to cap without events", () => {
    const policy = defaultValuePolicy();
    policy.valuePolicy.evidenceGates.minIntegrityIndexForStrongClaims = 0;
    policy.valuePolicy.evidenceGates.minObservedShareForStrongClaims = 0;
    expect(evaluateValueEvidenceGates(policy, { integrityIndex: null, correlationRatio: 1, observedShare: null,
      selfReportedShare: null, notaryRequired: false, notaryHealthy: true }).ok).toBe(true);
  });

  test("trust-kind shares over no events are null; over real events a 0 share stays a measured 0", () => {
    expect(trustKindShares([])).toEqual({ observed: null, attested: null, selfReported: null });
    expect(trustKindShares([{ source: { trustKind: "SELF_REPORTED" } }])).toEqual({ observed: 0, attested: 0, selfReported: 1 });
  });
});

describe("bench", () => {
  const roots: string[] = [];
  afterEach(() => { while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true }); });
  const workspace = () => {
    process.env.AMC_VAULT_PASSPHRASE ??= "unmeasured-bench-pass";
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-unmeasured-bench-")));
    roots.push(dir);
    initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
    initBenchPolicy(dir);
    return dir;
  };
  const run = (runId: string, ts: number): DiagnosticReport => ({
    agentId: "default", runId, ts, windowStartTs: ts - 86_400_000, windowEndTs: ts, status: "VALID", verificationPassed: true,
    trustBoundaryViolated: false, trustBoundaryMessage: null, integrityIndex: 0.9, trustLabel: "HIGH TRUST", targetProfileId: "default",
    layerScores: [{ layerName: "Skills", avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }], questionScores: [], inflationAttempts: [],
    unsupportedClaimCount: 0, contradictionCount: 0, correlationRatio: null, invalidReceiptsCount: 0, correlationWarnings: [],
    evidenceCoverage: 0.9, evidenceTrustCoverage: { observed: 0.9, attested: 0.1, selfReported: 0 }, targetDiff: [],
    prioritizedUpgradeActions: [], evidenceToCollectNext: [], runSealSig: "", reportJsonSha256: ""
  }) as DiagnosticReport;
  const collect = (ws: string) => collectBenchData({ workspace: ws, scopeType: "AGENT", scopeId: "default", windowDays: 30,
    policy: loadBenchPolicy(ws) }).bench;

  test("with no run, every signal the window did not measure is null, not 0; counted events stay measured counts", () => {
    const bench = collect(workspace());
    expect(bench.evidence.integrityIndex).toBeNull();
    expect(bench.evidence.correlationRatio).toBeNull();
    expect(bench.evidence.evidenceCoverage).toBeNull();
    expect(bench.evidence.trustLabel).toBe("LOW");
    expect(bench.metrics.maturity.overall).toBeNull();
    expect(Object.values(bench.metrics.maturity.fiveLayers).every((value) => value === null)).toBe(true);
    expect(Object.values(bench.metrics.valueDimensions).every((value) => value === null)).toBe(true);
    expect(bench.metrics.operatingHealth.approvalsBacklogCount).toBeNull();
    expect(bench.metrics.operatingHealth.approvalsMedianAgeHours).toBeNull();
    expect(bench.metrics.operatingHealth.assurance).toEqual({ latestScore: null, injectionFailures: null, exfilAttemptsDetected: null });
    expect(bench.metrics.operatingHealth.budgetExceedEvents).toBe(0); // a real count of ledger events
    expect(bench.metrics.forecastSummary.maturityDeltaShort).toBeNull();
  });

  test("a run that measured one layer and no correlation leaves the others null", () => {
    const ws = workspace();
    writeAnchoredRun(ws, getAgentPaths(ws, "default").runsDir, run("run_one_layer", Date.now() - 86_400_000));
    const bench = collect(ws);
    expect(bench.evidence.integrityIndex).toBe(0.9);
    expect(bench.evidence.correlationRatio).toBeNull();
    expect(bench.evidence.evidenceCoverage).toEqual({ observedShare: 0.9, attestedShare: 0.1, selfReportedShare: 0 });
    expect(bench.metrics.maturity.fiveLayers).toEqual({ strategicOps: null, leadership: null, culture: null, resilience: null, skills: 3 });
  });

  const benchWith = (benchId: string, overall: number | null, correlationRatio: number | null) => ({
    benchId, scope: { type: "WORKSPACE", idHash: "abcdef12" },
    evidence: { integrityIndex: 0.8, correlationRatio, trustLabel: "HIGH" },
    metrics: {
      maturity: { overall, fiveLayers: { strategicOps: 3, leadership: 3, culture: 3, resilience: 3, skills: 3 } },
      strategyFailureRisks: { ecosystemFocusRisk: 10, clarityPathRisk: 10, economicSignificanceRisk: 10, riskAssuranceRisk: 10, digitalDualityRisk: 10 },
      valueDimensions: { emotionalValue: null, functionalValue: null, economicValue: null, brandValue: null, lifetimeValue: null }
    },
    proofBindings: { includedEventProofIds: ["p"] }
  }) as unknown as BenchArtifact;

  test("percentiles rank measured values only; an unmeasured metric has no rank", () => {
    const local = flattenBenchMetrics(benchWith("local", 3, null));
    expect(local.valueScore).toBeNull();
    const table = percentileTable(local, [benchWith("a", null, 0.9), benchWith("b", 2, 0.5)].map(flattenBenchMetrics));
    expect(table.correlationRatio).toBeNull();
    expect(table.valueScore).toBeNull();
    expect(table.overall).toBe(100); // ranked against the one peer that measured it, not against a peer's 0
  });

  test("a composite with an unmeasured input is not evaluated", () => {
    const weights = { ecosystemAlignment: { ecosystemFocusRisk: 0.4, emotionalValue: 0.3, brandValue: 0.3 },
      riskAssurance: { riskAssuranceRisk: 0.4, integrityIndex: 0.3, correlationRatio: 0.3 },
      digitalDuality: { digitalDualityRisk: 0.5, toolGovernanceMaturity: 0.5 } };
    const comparison = benchComparisonWithInputs({}, benchWith("local", 3, null), [], { benchPolicy: { weights } } as never);
    expect(comparison.composites.ecosystemAlignmentScore).toBeNull();
    expect(comparison.composites.riskAssuranceScore).toBeNull();
    expect(comparison.composites.digitalDualityReadiness).toBe(75);
  });
});
