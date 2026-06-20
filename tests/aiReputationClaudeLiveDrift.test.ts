import { describe, expect, test } from "vitest";
import {
  runAiReputationClaudeLiveDrift,
  type AiReputationClaudeLiveDriftRow,
  type AiReputationPlatform,
  type AiReputationTask,
} from "../src/watch/aiReputationClaudeLiveDrift.js";
import { verifyLiveDriftReceipt } from "../src/watch/liveDriftAlerts.js";

const platforms: AiReputationPlatform[] = ["google_reviews", "yelp", "social"];
const tasks: AiReputationTask[] = ["review_analysis", "competitor_benchmark", "review_response"];

function reputationRow(
  index: number,
  phase: "baseline" | "live",
  overrides: Partial<AiReputationClaudeLiveDriftRow> = {},
): AiReputationClaudeLiveDriftRow {
  const platform = platforms[index]!;
  const task = tasks[index]!;
  return {
    traceId: `ai-reputation-${phase}-${index + 1}`,
    scenarioId: `ai-reputation-${platform}-${task}-${index + 1}`,
    timestamp: phase === "baseline"
      ? `2026-06-19T00:0${index}:00.000Z`
      : `2026-06-19T01:0${index}:00.000Z`,
    reputationRunId: `reputation-run-${phase}-${index + 1}`,
    sourceRefHash: "zubair-ai-reputation-source-ref",
    repositorySnapshotHash: "d1d341ba3dc78e3d93a835ac651bb94a59a090a2",
    noLicenseBoundaryHash: "github-license-null-review",
    readmeBlobHash: "1c0c427757919dfa1bb6861338dc601dc7a1c267",
    agentRosterHash: "58b10c338a7223abe088134e3c4e89f028e11521",
    skillCatalogHash: "80c9758ec45ec653c0f01b4dff520c923a156fe9",
    installScriptHash: "be74f6c5bca66fcfbb84e6bf506a781a5ea54604",
    reviewSourceManifestHash: `review-source-manifest-${platform}`,
    sentimentPipelineHash: "reputation-sentiment-skill-8bfa961",
    competitorBenchmarkHash: "reputation-competitor-agent-049a997",
    responsePolicyHash: "reputation-response-policy-6327eaf",
    crisisPlaybookHash: "reputation-crisis-skill-36ad068",
    reportTemplateHash: "reputation-pdf-report-a2011e",
    baselineResultHash: phase === "baseline" ? `ai-reputation-baseline-result-${index + 1}` : undefined,
    liveResultHash: phase === "live" ? `ai-reputation-live-result-${index + 1}` : undefined,
    driftStatisticHash: phase === "live" ? `ai-reputation-drift-stat-${index + 1}` : undefined,
    alertReceiptHash: phase === "live" ? `ai-reputation-alert-${index + 1}` : undefined,
    reviewPlatform: platform,
    reputationTask: task,
    reputationScore0to1: phase === "baseline" ? 0.91 - index * 0.01 : 0.9 - index * 0.01,
    sentimentScoreMinus1to1: phase === "baseline" ? 0.62 - index * 0.02 : 0.6 - index * 0.02,
    responseQuality0to1: phase === "baseline" ? 0.89 - index * 0.01 : 0.88 - index * 0.01,
    crisisReadiness0to1: phase === "baseline" ? 0.84 - index * 0.01 : 0.83 - index * 0.01,
    reviewCoverage0to1: phase === "baseline" ? 0.96 : 0.95,
    hallucinatedCitationRate0to1: phase === "baseline" ? 0.01 : 0.012,
    piiLeakRate0to1: 0,
    responsePolicyCompliance0to1: phase === "baseline" ? 0.98 : 0.97,
    evidenceRefs: [`ai-reputation-trace:${phase}-${index + 1}`],
    signedEvidenceRefs: [`ai-reputation-ledger:${phase}-${index + 1}`],
    ...overrides,
  };
}

describe("AI Reputation Claude live drift", () => {
  test("approves stable reputation-management live drift with source, skill, agent, report, and alert proof", () => {
    const baselineRows = [0, 1, 2].map((index) => reputationRow(index, "baseline"));
    const liveRows = [0, 1, 2].map((index) => reputationRow(index, "live"));

    const result = runAiReputationClaudeLiveDrift({
      agentId: "brand-reputation-agent",
      baselineWindow: {
        windowId: "baseline-ai-reputation",
        startedAt: "2026-06-19T00:00:00.000Z",
        endedAt: "2026-06-19T00:10:00.000Z",
        rows: baselineRows,
      },
      liveWindow: {
        windowId: "live-ai-reputation",
        startedAt: "2026-06-19T01:00:00.000Z",
        endedAt: "2026-06-19T01:10:00.000Z",
        rows: liveRows,
      },
      now: new Date("2026-06-19T02:00:00.000Z"),
    });

    expect(result.receipt.failClosed).toBe(false);
    expect(result.receipt.recommendation).toBe("approve");
    expect(result.receipt.sourceRefs).toContain("https://github.com/zubair-trabzada/ai-reputation-claude");
    expect(result.liveDistribution.evidenceCoverage0to1).toBe(1);
    expect(result.liveDistribution.reviewPlatformDistribution.google_reviews).toBeCloseTo(1 / 3, 5);
    expect(result.liveDistribution.reviewPlatformDistribution.yelp).toBeCloseTo(1 / 3, 5);
    expect(result.liveDistribution.reviewPlatformDistribution.social).toBeCloseTo(1 / 3, 5);
    expect(result.scoreDrift.reputationScoreDrop0to1).toBeCloseTo(0.01, 5);
    expect(result.behaviorDrift.contextDivergence0to1).toBe(0);
    expect(result.liveRows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.reputationReceiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyLiveDriftReceipt(result.receipt).valid).toBe(true);
  });

  test("fails closed when reputation live sample loses proof and brand-safety metrics regress", () => {
    const baselineRows = [0, 1, 2].map((index) => reputationRow(index, "baseline"));
    const liveRows = [0, 1, 2].map((index) =>
      reputationRow(index, "live", {
        skillCatalogHash: index === 0 ? "" : "80c9758ec45ec653c0f01b4dff520c923a156fe9",
        liveResultHash: index === 0 ? undefined : `ai-reputation-live-result-${index + 1}`,
        driftStatisticHash: index === 0 ? undefined : `ai-reputation-drift-stat-${index + 1}`,
        alertReceiptHash: index === 0 ? undefined : `ai-reputation-alert-${index + 1}`,
        reputationScore0to1: 0.65,
        sentimentScoreMinus1to1: 0.05,
        responseQuality0to1: 0.55,
        crisisReadiness0to1: 0.5,
        reviewCoverage0to1: 0.58,
        hallucinatedCitationRate0to1: 0.13,
        piiLeakRate0to1: 0.08,
        responsePolicyCompliance0to1: 0.74,
        signedEvidenceRefs: index === 0 ? [] : [`ai-reputation-ledger:live-${index + 1}`],
      })
    );

    const result = runAiReputationClaudeLiveDrift({
      agentId: "brand-reputation-agent",
      baselineWindow: {
        windowId: "baseline-ai-reputation",
        startedAt: "2026-06-19T00:00:00.000Z",
        endedAt: "2026-06-19T00:10:00.000Z",
        rows: baselineRows,
      },
      liveWindow: {
        windowId: "live-ai-reputation",
        startedAt: "2026-06-19T01:00:00.000Z",
        endedAt: "2026-06-19T01:10:00.000Z",
        rows: liveRows,
      },
      now: new Date("2026-06-19T02:00:00.000Z"),
    });

    const alertMetricIds = result.receipt.alerts.map((alert) => alert.metricId);
    expect(result.receipt.failClosed).toBe(true);
    expect(result.receipt.recommendation).toBe("alert");
    expect(result.scoreDrift.reputationScoreDrop0to1).toBeGreaterThan(0.2);
    expect(result.scoreDrift.hallucinatedCitationRateIncrease0to1).toBeGreaterThan(0.1);
    expect(result.liveDistribution.evidenceCoverage0to1).toBeLessThan(1);
    expect(alertMetricIds).toContain("aiReputationScoreMean0to1");
    expect(alertMetricIds).toContain("aiReputationEvidenceCoverage0to1");
    expect(alertMetricIds).toContain("aiReputationPiiLeakRate0to1");
    expect(result.liveRows[0]?.evidenceCoverage0to1).toBeLessThan(1);
    const verification = verifyLiveDriftReceipt(result.receipt);
    expect(verification.valid).toBe(false);
    expect(verification.errors.join(" ")).toContain("missing signedEvidenceRefs");
  });
});
