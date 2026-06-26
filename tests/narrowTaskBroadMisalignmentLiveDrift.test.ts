import { describe, expect, test } from "vitest";
import { buildLiveDriftWatchAlerts, verifyLiveDriftReceipt } from "../src/watch/liveDriftAlerts.js";
import {
  NARROW_TASK_BROAD_MISALIGNMENT_METADATA,
  runNarrowTaskBroadMisalignmentLiveDrift,
  type NarrowTaskBroadMisalignmentLiveDriftRow,
  type NarrowTaskBroadMisalignmentMetadataProof,
  type NarrowTaskBroadMisalignmentRiskSignal,
  type NarrowTaskBroadMisalignmentSurface,
} from "../src/watch/narrowTaskBroadMisalignmentLiveDrift.js";

const metadataProof: NarrowTaskBroadMisalignmentMetadataProof = {
  openAlexWorkId: NARROW_TASK_BROAD_MISALIGNMENT_METADATA.openAlexWorkId,
  doi: NARROW_TASK_BROAD_MISALIGNMENT_METADATA.doiUrl,
  title: NARROW_TASK_BROAD_MISALIGNMENT_METADATA.title,
  venue: NARROW_TASK_BROAD_MISALIGNMENT_METADATA.venue,
  publisher: NARROW_TASK_BROAD_MISALIGNMENT_METADATA.publisher,
  publicationYear: NARROW_TASK_BROAD_MISALIGNMENT_METADATA.publicationYear,
  publicationDate: NARROW_TASK_BROAD_MISALIGNMENT_METADATA.publicationDate,
  openAlexType: NARROW_TASK_BROAD_MISALIGNMENT_METADATA.openAlexType,
  crossrefType: NARROW_TASK_BROAD_MISALIGNMENT_METADATA.crossrefType,
  openAlexLicense: NARROW_TASK_BROAD_MISALIGNMENT_METADATA.openAlexLicense,
  openAlexSourceHash: "openalex:W7124177090:2026-06-20",
  crossrefSourceHash: "crossref:10.1038/s41586-025-09937-5:2026-06-20",
  publisherLandingPageHash: "nature-doi-landing:10.1038/s41586-025-09937-5:2026-06-20",
  metadataSnapshotHash: "metadata-only-narrow-task-broad-misalignment-v1",
  metadataRetrievedAt: "2026-06-20T06:00:00.000Z",
  relevanceMappingHash: "amc-gap-0623-narrow-task-broad-misalignment-relevance-score-shield-watch-v1",
  scoreSurfaceMappingHash: "amc-gap-0623-score-surface-mapping-v1",
  shieldSurfaceMappingHash: "amc-gap-0623-shield-surface-mapping-v1",
  watchSurfaceMappingHash: "amc-gap-0623-watch-surface-mapping-v1",
  baselineDistributionHash: "amc-gap-0623-baseline-distribution-v1",
  liveSampleManifestHash: "amc-gap-0623-live-sample-manifest-v1",
  driftStatisticHash: "amc-gap-0623-drift-statistic-v1",
  alertReceiptHash: "amc-gap-0623-alert-receipt-v1",
  noPaperProseCopiedHash: "amc-gap-0623-no-paper-prose-or-data-copy-proof-v1",
};

const surfaces: NarrowTaskBroadMisalignmentSurface[] = ["Score", "Shield", "Watch"];
const signals: NarrowTaskBroadMisalignmentRiskSignal[] = [
  "behavioral_generalization",
  "safety_policy_adherence",
  "goal_integrity",
];

function row(
  index: number,
  phase: "baseline" | "live",
  overrides: Partial<NarrowTaskBroadMisalignmentLiveDriftRow> = {},
): NarrowTaskBroadMisalignmentLiveDriftRow {
  const surface = surfaces[index]!;
  const signal = signals[index]!;
  const score = phase === "baseline" ? 0.93 - index * 0.01 : 0.92 - index * 0.01;
  return {
    traceId: `${phase}-ntbm-${index + 1}`,
    scenarioId: `ntbm-${surface.toLowerCase()}-${signal}`,
    timestamp: phase === "baseline" ? `2026-06-20T06:0${index}:00.000Z` : `2026-06-20T07:0${index}:00.000Z`,
    score0to1: score,
    passed: true,
    refused: false,
    errored: false,
    behaviorSignature: `ntbm:${surface}:${signal}:stable`,
    lifecycleStage: "deployment_maintenance",
    taskCategory: "narrow-task broad-misalignment live drift",
    domain: "agent alignment",
    agentEvaluationDimension: "evaluation_frameworks",
    latencyMs: phase === "baseline" ? 300 + index * 20 : 310 + index * 20,
    costUsd: phase === "baseline" ? 0.0015 + index * 0.0001 : 0.0016 + index * 0.0001,
    controlInterpretability0to1: surface === "Score" ? score : undefined,
    controlInterruptibility0to1: surface === "Shield" ? score : undefined,
    controlCorrectability0to1: surface === "Shield" ? score : undefined,
    socialSemanticAlignment0to1: surface === "Watch" ? score : undefined,
    evidenceRefs: [`ntbm-evidence:${phase}-${index + 1}`],
    signedEvidenceRefs: [`ntbm-ledger:${phase}-${index + 1}`],
    ntbmSurface: surface,
    ntbmRiskSignal: signal,
    ntbmControlId: `ntbm-control-${surface.toLowerCase()}-${signal}`,
    ntbmMetadataSnapshotHash: metadataProof.metadataSnapshotHash,
    ntbmBaselineDistributionHash: metadataProof.baselineDistributionHash,
    ntbmLiveSampleManifestHash: metadataProof.liveSampleManifestHash,
    ntbmDriftStatisticHash: metadataProof.driftStatisticHash,
    ntbmAlertReceiptHash: metadataProof.alertReceiptHash,
    ntbmScoreEvidenceHash: surface === "Score" ? `score-evidence-${phase}-${index + 1}` : undefined,
    ntbmShieldPolicyHash: surface === "Shield" ? `shield-policy-${phase}-${index + 1}` : undefined,
    ntbmWatchSignalHash: surface === "Watch" ? `watch-signal-${phase}-${index + 1}` : undefined,
    ntbmNoPaperProseCopiedHash: metadataProof.noPaperProseCopiedHash,
    ...overrides,
  };
}

const baselineRows = [0, 1, 2].map((index) => row(index, "baseline"));
const stableLiveRows = [0, 1, 2].map((index) => row(index, "live"));

function run(
  overrides: Parameters<typeof runNarrowTaskBroadMisalignmentLiveDrift>[0]["metadataProof"] = metadataProof,
  liveRows = stableLiveRows,
) {
  return runNarrowTaskBroadMisalignmentLiveDrift({
    agentId: "alignment-watch-agent",
    metadataProof: overrides,
    baselineWindow: {
      windowId: "ntbm-baseline",
      startedAt: "2026-06-20T06:00:00.000Z",
      endedAt: "2026-06-20T06:10:00.000Z",
      rows: baselineRows,
    },
    liveWindow: {
      windowId: "ntbm-live",
      startedAt: "2026-06-20T07:00:00.000Z",
      endedAt: "2026-06-20T07:10:00.000Z",
      rows: liveRows,
    },
    now: new Date("2026-06-20T08:00:00.000Z"),
  });
}

describe("runNarrowTaskBroadMisalignmentLiveDrift", () => {
  test("approves stable metadata-only live drift and exposes baseline distribution, live sample, statistic, and alert receipt", () => {
    const result = run();

    expect(result.narrowTaskBroadMisalignmentEvidenceCoverage0to1).toBe(1);
    expect(result.missingReasons).toEqual([]);
    expect(result.receipt.failClosed).toBe(false);
    expect(result.baselineDistribution.sampleSize).toBe(3);
    expect(result.liveSample).toHaveLength(3);
    expect(result.driftStatistic.scoreDrift.scoreDrop0to1).toBeLessThanOrEqual(0.02);
    expect(result.alertReceipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.rowProofs).toHaveLength(6);
    expect(result.receipt.sourceRefs).toEqual(expect.arrayContaining([
      NARROW_TASK_BROAD_MISALIGNMENT_METADATA.doiUrl,
      `https://openalex.org/${NARROW_TASK_BROAD_MISALIGNMENT_METADATA.openAlexWorkId}`,
      metadataProof.noPaperProseCopiedHash,
    ]));
    expect(buildLiveDriftWatchAlerts(result.receipt)).toEqual([]);
    expect(verifyLiveDriftReceipt(result.receipt)).toMatchObject({ valid: true });
  });

  test("fails closed when DOI/OpenAlex/Nature metadata proof is missing or mismatched", () => {
    const result = run({
      ...metadataProof,
      openAlexWorkId: "W0000000000",
      doi: "10.1038/invalid",
      venue: "Unknown Venue",
      crossrefSourceHash: "",
    });

    expect(result.narrowTaskBroadMisalignmentEvidenceCoverage0to1).toBeLessThan(1);
    expect(result.missingReasons).toEqual(expect.arrayContaining([
      "crossrefSourceHash",
      "metadataMismatch.openAlexWorkId",
      "metadataMismatch.doi",
      "metadataMismatch.venue",
    ]));
    expect(result.receipt.failClosed).toBe(true);
    expect(result.receipt.alerts.map((alert) => alert.metricId)).toContain("narrowTaskBroadMisalignmentEvidenceCoverage0to1");
    expect(result.watchAlerts.map((alert) => alert.metricId)).toContain("narrowTaskBroadMisalignmentEvidenceCoverage0to1");
    expect(verifyLiveDriftReceipt(result.receipt)).toMatchObject({ valid: true });
  });

  test("alerts when live Score/Shield/Watch sample drifts from baseline", () => {
    const driftingRows = stableLiveRows.map((sample, index): NarrowTaskBroadMisalignmentLiveDriftRow => ({
      ...sample,
      score0to1: 0.58 - index * 0.02,
      passed: false,
      behaviorSignature: `ntbm:${sample.ntbmSurface}:${sample.ntbmRiskSignal}:regressed`,
      evidenceRefs: [`ntbm-drift-evidence:${index + 1}`],
      signedEvidenceRefs: [`ntbm-drift-ledger:${index + 1}`],
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
