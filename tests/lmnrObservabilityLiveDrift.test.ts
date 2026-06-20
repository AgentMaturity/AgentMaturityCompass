import { describe, expect, test } from "vitest";
import { buildLiveDriftWatchAlerts, verifyLiveDriftReceipt } from "../src/watch/liveDriftAlerts.js";
import {
  LMNR_OBSERVABILITY_METADATA,
  runLmnrObservabilityLiveDrift,
  type LmnrObservabilityLiveDriftRow,
  type LmnrObservabilityMetadataProof,
  type LmnrObservabilitySignal,
  type LmnrObservabilitySurface,
} from "../src/watch/lmnrObservabilityLiveDrift.js";

const metadataProof: LmnrObservabilityMetadataProof = {
  requestedSourceUrl: LMNR_OBSERVABILITY_METADATA.requestedSourceUrl,
  canonicalSourceUrl: LMNR_OBSERVABILITY_METADATA.canonicalSourceUrl,
  homepageStatusCode: LMNR_OBSERVABILITY_METADATA.statusCode,
  homepageContentType: LMNR_OBSERVABILITY_METADATA.contentType,
  homepageTitle: LMNR_OBSERVABILITY_METADATA.title,
  homepageSnapshotHash: "sha256:5221821af80b83708e4c3cc801e28f0929b225598f58a11bef3e02f87f77c155",
  docsOverviewHash: "sha256:93dd66d1b4dabf1341a2afe6d6e87e1e45d32bd8a5d3c45b8df7db60e2138b84",
  llmsTxtHash: "sha256:c3e04b0643d4715152d1fd4fc83cde6eec36f96453f0817a97dad70ef76ea888",
  tracingDocsHash: "sha256:da9e67123cbcf05c1b6bf3d4d81d1c0e2189f6228225781c35a7d3744bcf26ca",
  evaluationsQuickstartHash: "sha256:ba4bd28190b951415fc77d8ccdfee7abb2d61ccbd750068c03992418443c5a93",
  evaluationConceptsHash: "sha256:bc1caa16be12358a9fed7b4cdb9c0b2e263450998222a33078238811c6a0e66d",
  alertsDocsHash: "sha256:70e83d3fe5e019d2dbe21dda1196385060ef43d4a113f69186ae24fb6356a420",
  piiRedactionDocsHash: "sha256:516c3839d58d000d3f4db78fe72669e6b89bdf22264584b519bdb1504e932cff",
  integrationOverviewDocsHash: "sha256:11dff3f0772972076e9e9acb05ccdc3dd0bc970a5cd48a33caf9a0a8a7c29c6e",
  mcpDocsHash: "sha256:f707077f18163c86e9faa3c19587339f1231caf859b148cb14da048712c058be",
  metadataSnapshotHash: "amc-gap-0619-lmnr-live-source-metadata-v1",
  metadataRetrievedAt: "2026-06-20T08:20:00.000Z",
  amcNativeMappingHash: "amc-gap-0619-lmnr-score-shield-watch-mapping-v1",
  scoreSurfaceMappingHash: "amc-gap-0619-lmnr-score-surface-v1",
  shieldSurfaceMappingHash: "amc-gap-0619-lmnr-shield-surface-v1",
  watchSurfaceMappingHash: "amc-gap-0619-lmnr-watch-surface-v1",
  noSdkImporterSubsystemProofHash: "amc-gap-0619-no-lmnr-sdk-importer-subsystem-v1",
  noCopiedProseProofHash: "amc-gap-0619-no-lmnr-docs-prose-copy-v1",
  baselineDistributionHash: "amc-gap-0619-baseline-distribution-v1",
  liveSampleManifestHash: "amc-gap-0619-live-sample-manifest-v1",
  driftStatisticHash: "amc-gap-0619-drift-statistic-v1",
  alertReceiptHash: "amc-gap-0619-alert-receipt-v1",
  signedEvidencePolicyHash: "amc-gap-0619-signed-evidence-policy-v1",
  failClosedThresholdPolicyHash: "amc-gap-0619-fail-closed-thresholds-v1",
  replayCommandHash: "amc-gap-0619-focused-test-command-v1",
  ciReceiptHash: "amc-gap-0619-ci-receipt-v1",
};

const surfaces: LmnrObservabilitySurface[] = ["Score", "Shield", "Watch"];
const signals: LmnrObservabilitySignal[] = ["evaluation", "pii_redaction", "alert"];

function row(
  index: number,
  phase: "baseline" | "live",
  overrides: Partial<LmnrObservabilityLiveDriftRow> = {},
): LmnrObservabilityLiveDriftRow {
  const surface = surfaces[index]!;
  const signal = signals[index]!;
  const score = phase === "baseline" ? 0.92 - index * 0.01 : 0.91 - index * 0.01;
  return {
    traceId: `${phase}-lmnr-${index + 1}`,
    scenarioId: `lmnr-${surface.toLowerCase()}-${signal}`,
    timestamp: phase === "baseline" ? `2026-06-20T08:0${index}:00.000Z` : `2026-06-20T09:0${index}:00.000Z`,
    score0to1: score,
    passed: true,
    refused: false,
    errored: false,
    behaviorSignature: `lmnr:${surface}:${signal}:stable`,
    lifecycleStage: "deployment_maintenance",
    taskCategory: "metadata-only lmnr observability live drift",
    domain: "agent observability",
    agentEvaluationDimension: "evaluation_frameworks",
    latencyMs: phase === "baseline" ? 320 + index * 15 : 330 + index * 15,
    costUsd: phase === "baseline" ? 0.002 + index * 0.0001 : 0.0021 + index * 0.0001,
    evidenceRefs: [`lmnr-evidence:${phase}-${index + 1}`],
    signedEvidenceRefs: [`lmnr-ledger:${phase}-${index + 1}`],
    lmnrSurface: surface,
    lmnrSignal: signal,
    lmnrProjectIdHash: `lmnr-project:${index + 1}`,
    lmnrTraceIdHash: `lmnr-trace:${phase}-${index + 1}`,
    lmnrSpanTreeHash: `lmnr-span-tree:${phase}-${index + 1}`,
    lmnrEvaluationRunHash: `lmnr-eval-run:${phase}-${index + 1}`,
    lmnrDatasetSnapshotHash: `lmnr-dataset:${phase}-${index + 1}`,
    lmnrScoreEventHash: `lmnr-score-event:${phase}-${index + 1}`,
    lmnrAlertPolicyHash: `lmnr-alert-policy:${phase}-${index + 1}`,
    lmnrAlertReceiptHash: metadataProof.alertReceiptHash,
    lmnrPrivacyBoundaryHash: metadataProof.piiRedactionDocsHash,
    lmnrNoRawTracePayloadHash: metadataProof.noCopiedProseProofHash,
    lmnrNoSdkImporterSubsystemProofHash: metadataProof.noSdkImporterSubsystemProofHash,
    ...overrides,
  };
}

const baselineRows = [0, 1, 2].map((index) => row(index, "baseline"));
const stableLiveRows = [0, 1, 2].map((index) => row(index, "live"));

function run(overrides: LmnrObservabilityMetadataProof = metadataProof, liveRows = stableLiveRows) {
  return runLmnrObservabilityLiveDrift({
    agentId: "observability-agent",
    metadataProof: overrides,
    baselineWindow: {
      windowId: "lmnr-baseline",
      startedAt: "2026-06-20T08:00:00.000Z",
      endedAt: "2026-06-20T08:10:00.000Z",
      rows: baselineRows,
    },
    liveWindow: {
      windowId: "lmnr-live",
      startedAt: "2026-06-20T09:00:00.000Z",
      endedAt: "2026-06-20T09:10:00.000Z",
      rows: liveRows,
    },
    now: new Date("2026-06-20T10:00:00.000Z"),
  });
}

describe("runLmnrObservabilityLiveDrift", () => {
  test("approves stable metadata-only LMNR observability drift and exposes distribution, sample, statistic, and receipt", () => {
    const result = run();

    expect(result.lmnrObservabilityEvidenceCoverage0to1).toBe(1);
    expect(result.missingReasons).toEqual([]);
    expect(result.receipt.failClosed).toBe(false);
    expect(result.baselineDistribution.sampleSize).toBe(3);
    expect(result.liveSample).toHaveLength(3);
    expect(result.driftStatistic.scoreDrift.scoreDrop0to1).toBeLessThanOrEqual(0.02);
    expect(result.alertReceipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.rowProofs).toHaveLength(6);
    expect(result.receipt.sourceRefs).toEqual(expect.arrayContaining([
      LMNR_OBSERVABILITY_METADATA.requestedSourceUrl,
      LMNR_OBSERVABILITY_METADATA.canonicalSourceUrl,
      metadataProof.noSdkImporterSubsystemProofHash,
      metadataProof.noCopiedProseProofHash,
    ]));
    expect(buildLiveDriftWatchAlerts(result.receipt)).toEqual([]);
    expect(verifyLiveDriftReceipt(result.receipt)).toMatchObject({ valid: true });
  });

  test("fails closed when live source metadata or docs proof is incomplete", () => {
    const result = run({
      ...metadataProof,
      homepageTitle: "Unknown observability product",
      llmsTxtHash: "",
      alertsDocsHash: "",
      noSdkImporterSubsystemProofHash: "",
    });

    expect(result.lmnrObservabilityEvidenceCoverage0to1).toBeLessThan(1);
    expect(result.missingReasons).toEqual(expect.arrayContaining([
      "llmsTxtHash",
      "alertsDocsHash",
      "noSdkImporterSubsystemProofHash",
      "metadataMismatch.homepageTitle",
    ]));
    expect(result.receipt.failClosed).toBe(true);
    expect(result.receipt.alerts.map((alert) => alert.metricId)).toContain("observabilityEvidenceCoverage0to1");
    expect(result.watchAlerts.map((alert) => alert.metricId)).toContain("observabilityEvidenceCoverage0to1");
    expect(verifyLiveDriftReceipt(result.receipt)).toMatchObject({ valid: true });
  });

  test("alerts when live Score/Shield/Watch observability sample drifts from baseline", () => {
    const driftingRows = stableLiveRows.map((sample, index): LmnrObservabilityLiveDriftRow => ({
      ...sample,
      score0to1: 0.6 - index * 0.03,
      passed: false,
      behaviorSignature: `lmnr:${sample.lmnrSurface}:${sample.lmnrSignal}:regressed`,
      evidenceRefs: [`lmnr-drift-evidence:${index + 1}`],
      signedEvidenceRefs: [`lmnr-drift-ledger:${index + 1}`],
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
