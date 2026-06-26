import { describe, expect, test } from "vitest";
import { buildLiveDriftWatchAlerts, verifyLiveDriftReceipt } from "../src/watch/liveDriftAlerts.js";
import {
  TRISM_AGENTIC_AI_METADATA,
  runTrismAgenticLiveDrift,
  type TrismAgenticLiveDriftRow,
  type TrismAgenticMetadataProof,
  type TrismAgenticRiskSignal,
  type TrismAgenticSurface,
} from "../src/watch/trismAgenticLiveDrift.js";

const metadataProof: TrismAgenticMetadataProof = {
  openAlexWorkId: TRISM_AGENTIC_AI_METADATA.openAlexWorkId,
  doi: TRISM_AGENTIC_AI_METADATA.doiUrl,
  title: TRISM_AGENTIC_AI_METADATA.title,
  venue: TRISM_AGENTIC_AI_METADATA.venue,
  publisher: TRISM_AGENTIC_AI_METADATA.publisher,
  publicationYear: TRISM_AGENTIC_AI_METADATA.publicationYear,
  publicationDate: TRISM_AGENTIC_AI_METADATA.publicationDate,
  openAlexType: TRISM_AGENTIC_AI_METADATA.openAlexType,
  crossrefType: TRISM_AGENTIC_AI_METADATA.crossrefType,
  openAlexLicense: TRISM_AGENTIC_AI_METADATA.openAlexLicense,
  openAlexSourceHash: "openalex:W7133236347:2026-06-20",
  crossrefSourceHash: "crossref:10.1016/j.aiopen.2026.02.006:2026-06-20",
  publisherLandingPageHash: "elsevier-aiopen-doi-landing:2026-06-20",
  metadataSnapshotHash: "metadata-only-trism-agentic-ai-review-v1",
  metadataRetrievedAt: "2026-06-20T06:00:00.000Z",
  relevanceMappingHash: "amc-gap-0610-trism-relevance-score-shield-watch-v1",
  scoreSurfaceMappingHash: "amc-gap-0610-score-surface-mapping-v1",
  shieldSurfaceMappingHash: "amc-gap-0610-shield-surface-mapping-v1",
  watchSurfaceMappingHash: "amc-gap-0610-watch-surface-mapping-v1",
  baselineDistributionHash: "amc-gap-0610-baseline-distribution-v1",
  liveSampleManifestHash: "amc-gap-0610-live-sample-manifest-v1",
  driftStatisticHash: "amc-gap-0610-drift-statistic-v1",
  alertReceiptHash: "amc-gap-0610-alert-receipt-v1",
  noPaperProseCopiedHash: "amc-gap-0610-no-paper-prose-or-data-copy-proof-v1",
};

const surfaces: TrismAgenticSurface[] = ["Score", "Shield", "Watch"];
const signals: TrismAgenticRiskSignal[] = ["trust", "security", "lifecycle_governance"];

function row(
  index: number,
  phase: "baseline" | "live",
  overrides: Partial<TrismAgenticLiveDriftRow> = {},
): TrismAgenticLiveDriftRow {
  const surface = surfaces[index]!;
  const signal = signals[index]!;
  const score = phase === "baseline" ? 0.91 - index * 0.01 : 0.9 - index * 0.01;
  return {
    traceId: `${phase}-trism-${index + 1}`,
    scenarioId: `trism-${surface.toLowerCase()}-${signal}`,
    timestamp: phase === "baseline" ? `2026-06-20T06:0${index}:00.000Z` : `2026-06-20T07:0${index}:00.000Z`,
    score0to1: score,
    passed: true,
    refused: false,
    errored: false,
    behaviorSignature: `trism:${surface}:${signal}:stable`,
    lifecycleStage: "deployment_maintenance",
    taskCategory: "metadata-only trism agentic live drift",
    domain: "agent governance",
    agentEvaluationDimension: "evaluation_frameworks",
    latencyMs: phase === "baseline" ? 250 + index * 20 : 260 + index * 20,
    costUsd: phase === "baseline" ? 0.001 + index * 0.0001 : 0.0011 + index * 0.0001,
    evidenceRefs: [`trism-evidence:${phase}-${index + 1}`],
    signedEvidenceRefs: [`trism-ledger:${phase}-${index + 1}`],
    trismSurface: surface,
    trismRiskSignal: signal,
    trismControlId: `trism-control-${surface.toLowerCase()}-${signal}`,
    trismMetadataSnapshotHash: metadataProof.metadataSnapshotHash,
    trismBaselineDistributionHash: metadataProof.baselineDistributionHash,
    trismLiveSampleManifestHash: metadataProof.liveSampleManifestHash,
    trismDriftStatisticHash: metadataProof.driftStatisticHash,
    trismAlertReceiptHash: metadataProof.alertReceiptHash,
    trismScoreEvidenceHash: surface === "Score" ? `score-evidence-${phase}-${index + 1}` : undefined,
    trismShieldPolicyHash: surface === "Shield" ? `shield-policy-${phase}-${index + 1}` : undefined,
    trismWatchSignalHash: surface === "Watch" ? `watch-signal-${phase}-${index + 1}` : undefined,
    trismNoPaperProseCopiedHash: metadataProof.noPaperProseCopiedHash,
    ...overrides,
  };
}

const baselineRows = [0, 1, 2].map((index) => row(index, "baseline"));
const stableLiveRows = [0, 1, 2].map((index) => row(index, "live"));

function run(overrides: Parameters<typeof runTrismAgenticLiveDrift>[0]["metadataProof"] = metadataProof, liveRows = stableLiveRows) {
  return runTrismAgenticLiveDrift({
    agentId: "agentic-governance-agent",
    metadataProof: overrides,
    baselineWindow: {
      windowId: "trism-baseline",
      startedAt: "2026-06-20T06:00:00.000Z",
      endedAt: "2026-06-20T06:10:00.000Z",
      rows: baselineRows,
    },
    liveWindow: {
      windowId: "trism-live",
      startedAt: "2026-06-20T07:00:00.000Z",
      endedAt: "2026-06-20T07:10:00.000Z",
      rows: liveRows,
    },
    now: new Date("2026-06-20T08:00:00.000Z"),
  });
}

describe("runTrismAgenticLiveDrift", () => {
  test("approves stable metadata-only TRiSM live drift and exposes distribution, sample, statistic, and receipt", () => {
    const result = run();

    expect(result.trismAgenticEvidenceCoverage0to1).toBe(1);
    expect(result.missingReasons).toEqual([]);
    expect(result.receipt.failClosed).toBe(false);
    expect(result.baselineDistribution.sampleSize).toBe(3);
    expect(result.liveSample).toHaveLength(3);
    expect(result.driftStatistic.scoreDrift.scoreDrop0to1).toBeLessThanOrEqual(0.02);
    expect(result.alertReceipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.rowProofs).toHaveLength(6);
    expect(result.receipt.sourceRefs).toEqual(expect.arrayContaining([
      TRISM_AGENTIC_AI_METADATA.doiUrl,
      `https://openalex.org/${TRISM_AGENTIC_AI_METADATA.openAlexWorkId}`,
      metadataProof.noPaperProseCopiedHash,
    ]));
    expect(buildLiveDriftWatchAlerts(result.receipt)).toEqual([]);
    expect(verifyLiveDriftReceipt(result.receipt)).toMatchObject({ valid: true });
  });

  test("fails closed when DOI/OpenAlex/publisher metadata is missing or mismatched", () => {
    const result = run({
      ...metadataProof,
      doi: "10.1016/j.aiopen.invalid",
      publisher: "Unknown Publisher",
      crossrefSourceHash: "",
    });

    expect(result.trismAgenticEvidenceCoverage0to1).toBeLessThan(1);
    expect(result.missingReasons).toEqual(expect.arrayContaining([
      "crossrefSourceHash",
      "metadataMismatch.doi",
      "metadataMismatch.publisher",
    ]));
    expect(result.receipt.failClosed).toBe(true);
    expect(result.receipt.alerts.map((alert) => alert.metricId)).toContain("trismAgenticEvidenceCoverage0to1");
    expect(result.watchAlerts.map((alert) => alert.metricId)).toContain("trismAgenticEvidenceCoverage0to1");
    expect(verifyLiveDriftReceipt(result.receipt)).toMatchObject({ valid: true });
  });

  test("alerts when live Score/Shield/Watch sample drifts from baseline", () => {
    const driftingRows = stableLiveRows.map((sample, index): TrismAgenticLiveDriftRow => ({
      ...sample,
      score0to1: 0.61 - index * 0.02,
      passed: false,
      behaviorSignature: `trism:${sample.trismSurface}:${sample.trismRiskSignal}:regressed`,
      evidenceRefs: [`trism-drift-evidence:${index + 1}`],
      signedEvidenceRefs: [`trism-drift-ledger:${index + 1}`],
    }));

    const result = run(metadataProof, driftingRows);

    expect(result.missingReasons).toEqual([]);
    expect(result.receipt.failClosed).toBe(true);
    expect(result.driftStatistic.scoreDrift.scoreDrop0to1).toBeGreaterThan(0.2);
    expect(result.receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "passRate0to1",
      "behaviorSignature",
    ]));
    expect(verifyLiveDriftReceipt(result.receipt)).toMatchObject({ valid: true });
  });
});
