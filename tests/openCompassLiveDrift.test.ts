import { describe, expect, test } from "vitest";
import { buildLiveDriftWatchAlerts, verifyLiveDriftReceipt } from "../src/watch/liveDriftAlerts.js";
import {
  OPENCOMPASS_LIVE_DRIFT_METADATA,
  runOpenCompassLiveDrift,
  type OpenCompassLiveDriftMetadataProof,
  type OpenCompassLiveDriftRow,
  type OpenCompassLiveDriftSignal,
  type OpenCompassLiveDriftSurface,
} from "../src/watch/openCompassLiveDrift.js";

const metadataProof: OpenCompassLiveDriftMetadataProof = {
  requestedSourceUrl: OPENCOMPASS_LIVE_DRIFT_METADATA.requestedSourceUrl,
  canonicalSourceUrl: OPENCOMPASS_LIVE_DRIFT_METADATA.canonicalSourceUrl,
  rankSourceUrl: OPENCOMPASS_LIVE_DRIFT_METADATA.rankSourceUrl,
  docsSourceUrl: OPENCOMPASS_LIVE_DRIFT_METADATA.docsSourceUrl,
  homepageStatusCode: OPENCOMPASS_LIVE_DRIFT_METADATA.homepageStatusCode,
  rankStatusCode: OPENCOMPASS_LIVE_DRIFT_METADATA.rankStatusCode,
  docsStatusCode: OPENCOMPASS_LIVE_DRIFT_METADATA.docsStatusCode,
  homepageContentType: OPENCOMPASS_LIVE_DRIFT_METADATA.homepageContentType,
  rankContentType: OPENCOMPASS_LIVE_DRIFT_METADATA.rankContentType,
  docsContentType: OPENCOMPASS_LIVE_DRIFT_METADATA.docsContentType,
  homepageTitle: OPENCOMPASS_LIVE_DRIFT_METADATA.title,
  rankTitle: OPENCOMPASS_LIVE_DRIFT_METADATA.rankTitle,
  docsTitle: OPENCOMPASS_LIVE_DRIFT_METADATA.docsTitle,
  homepageSnapshotHash: "sha256:4ac11f09b8ac5c506cb151a027723763ea42909de768f852f79f34433a6185c1",
  rankSnapshotHash: "sha256:26f2fc9e3244a903cc86fdae65ab3d5502bfe2fd74ad3c1fba719f2d0090c19f",
  docsSnapshotHash: "sha256:5f96f29aa932c8f89c39bf0e28c0cd9f8049270a0d6104d6becd3dd11f63b3c5",
  spaAssetHash: "sha256:c96b8f91c20998190ebb1782242e3d5d0ecfcda0765955c4a6dccb7e4e95e10a",
  rankAssetHash: "sha256:d3abd82e1846b4c9e6f23ae7a5a60188859eb259faad263a40cad8650e0c0c9b",
  headerManifestHash: "sha256:3c277a0f0fbb61e3c03870326ab7f31831761197e28e81adc2bc0646329807ab",
  datasetManifestHash: "sha256:705b589221bf7bf91373dd4f3f3838d78a4f23b7852e79093f7db12e99f2fb25",
  metadataSnapshotHash: "amc-gap-0637-opencompass-live-source-metadata-v1",
  metadataRetrievedAt: "2026-06-21T00:00:00.000Z",
  amcNativeMappingHash: "amc-gap-0637-opencompass-score-shield-watch-mapping-v1",
  scoreSurfaceMappingHash: "amc-gap-0637-opencompass-score-surface-v1",
  shieldSurfaceMappingHash: "amc-gap-0637-opencompass-shield-surface-v1",
  watchSurfaceMappingHash: "amc-gap-0637-opencompass-watch-surface-v1",
  noOpenCompassSubsystemProofHash: "amc-gap-0637-no-opencompass-subsystem-v1",
  noSdkImporterSubsystemProofHash: "amc-gap-0637-no-opencompass-sdk-importer-subsystem-v1",
  noCopiedWebsiteDocsProseHash: "amc-gap-0637-no-copied-opencompass-website-docs-prose-v1",
  noCopiedConfigOrResultRowsHash: "amc-gap-0637-no-copied-opencompass-config-result-rows-v1",
  baselineDistributionHash: "amc-gap-0637-baseline-distribution-v1",
  liveSampleManifestHash: "amc-gap-0637-live-sample-manifest-v1",
  driftStatisticHash: "amc-gap-0637-drift-statistic-v1",
  alertReceiptHash: "amc-gap-0637-alert-receipt-v1",
  signedEvidencePolicyHash: "amc-gap-0637-signed-evidence-policy-v1",
  failClosedThresholdPolicyHash: "amc-gap-0637-fail-closed-thresholds-v1",
  replayCommandHash: "amc-gap-0637-focused-test-command-v1",
  ciReceiptHash: "amc-gap-0637-ci-receipt-v1",
};

const surfaces: OpenCompassLiveDriftSurface[] = ["Score", "Shield", "Watch"];
const signals: OpenCompassLiveDriftSignal[] = ["leaderboard", "evaluation", "dataset"];

function row(
  index: number,
  phase: "baseline" | "live",
  overrides: Partial<OpenCompassLiveDriftRow> = {},
): OpenCompassLiveDriftRow {
  const surface = surfaces[index]!;
  const signal = signals[index]!;
  const score = phase === "baseline" ? 0.89 - index * 0.01 : 0.88 - index * 0.01;
  return {
    traceId: `${phase}-opencompass-${index + 1}`,
    scenarioId: `opencompass-${surface.toLowerCase()}-${signal}`,
    timestamp: phase === "baseline" ? `2026-06-21T00:0${index}:00.000Z` : `2026-06-21T01:0${index}:00.000Z`,
    score0to1: score,
    passed: true,
    refused: false,
    errored: false,
    behaviorSignature: `opencompass:${surface}:${signal}:stable`,
    lifecycleStage: "deployment_maintenance",
    taskCategory: "metadata-only opencompass live drift",
    domain: "agent evaluation",
    agentEvaluationDimension: "evaluation_frameworks",
    latencyMs: phase === "baseline" ? 260 + index * 12 : 270 + index * 12,
    costUsd: phase === "baseline" ? 0.0018 + index * 0.0001 : 0.0019 + index * 0.0001,
    evidenceRefs: [`opencompass-evidence:${phase}-${index + 1}`],
    signedEvidenceRefs: [`opencompass-ledger:${phase}-${index + 1}`],
    openCompassSurface: surface,
    openCompassSignal: signal,
    openCompassBenchmarkSuiteHash: `opencompass-benchmark-suite:${index + 1}`,
    openCompassDatasetManifestHash: metadataProof.datasetManifestHash,
    openCompassModelOrAgentHash: `opencompass-agent:${index + 1}`,
    openCompassEvaluationConfigHash: `opencompass-eval-config:${phase}-${index + 1}`,
    openCompassScoreReportHash: `opencompass-score-report:${phase}-${index + 1}`,
    openCompassLeaderboardSnapshotHash: metadataProof.rankSnapshotHash,
    openCompassRankTableSchemaHash: metadataProof.headerManifestHash,
    openCompassAlertPolicyHash: metadataProof.failClosedThresholdPolicyHash,
    openCompassAlertReceiptHash: metadataProof.alertReceiptHash,
    openCompassSourceMetadataHash: metadataProof.metadataSnapshotHash,
    openCompassNoRawResultRowsHash: metadataProof.noCopiedConfigOrResultRowsHash,
    openCompassNoSdkImporterSubsystemProofHash: metadataProof.noSdkImporterSubsystemProofHash,
    ...overrides,
  };
}

const baselineRows = [0, 1, 2].map((index) => row(index, "baseline"));
const stableLiveRows = [0, 1, 2].map((index) => row(index, "live"));

function run(overrides: OpenCompassLiveDriftMetadataProof = metadataProof, liveRows = stableLiveRows) {
  return runOpenCompassLiveDrift({
    agentId: "opencompass-agent",
    metadataProof: overrides,
    baselineWindow: {
      windowId: "opencompass-baseline",
      startedAt: "2026-06-21T00:00:00.000Z",
      endedAt: "2026-06-21T00:10:00.000Z",
      rows: baselineRows,
    },
    liveWindow: {
      windowId: "opencompass-live",
      startedAt: "2026-06-21T01:00:00.000Z",
      endedAt: "2026-06-21T01:10:00.000Z",
      rows: liveRows,
    },
    now: new Date("2026-06-21T02:00:00.000Z"),
  });
}

describe("runOpenCompassLiveDrift", () => {
  test("approves stable metadata-only OpenCompass drift and exposes distribution, sample, statistic, and receipt", () => {
    const result = run();

    expect(result.openCompassEvidenceCoverage0to1).toBe(1);
    expect(result.missingReasons).toEqual([]);
    expect(result.receipt.failClosed).toBe(false);
    expect(result.baselineDistribution.sampleSize).toBe(3);
    expect(result.liveSample).toHaveLength(3);
    expect(result.driftStatistic.scoreDrift.scoreDrop0to1).toBeLessThanOrEqual(0.02);
    expect(result.alertReceipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.rowProofs).toHaveLength(6);
    expect(result.receipt.sourceRefs).toEqual(expect.arrayContaining([
      OPENCOMPASS_LIVE_DRIFT_METADATA.requestedSourceUrl,
      OPENCOMPASS_LIVE_DRIFT_METADATA.rankSourceUrl,
      metadataProof.noOpenCompassSubsystemProofHash,
      metadataProof.noSdkImporterSubsystemProofHash,
      metadataProof.noCopiedWebsiteDocsProseHash,
      metadataProof.noCopiedConfigOrResultRowsHash,
    ]));
    expect(buildLiveDriftWatchAlerts(result.receipt)).toEqual([]);
    expect(verifyLiveDriftReceipt(result.receipt)).toMatchObject({ valid: true });
  });

  test("fails closed when OpenCompass source proof or no-subsystem boundary is incomplete", () => {
    const result = run({
      ...metadataProof,
      homepageTitle: "Unknown benchmark",
      docsSnapshotHash: "",
      noOpenCompassSubsystemProofHash: "",
      noCopiedConfigOrResultRowsHash: "",
    });

    expect(result.openCompassEvidenceCoverage0to1).toBeLessThan(1);
    expect(result.missingReasons).toEqual(expect.arrayContaining([
      "docsSnapshotHash",
      "noOpenCompassSubsystemProofHash",
      "noCopiedConfigOrResultRowsHash",
      "metadataMismatch.homepageTitle",
    ]));
    expect(result.receipt.failClosed).toBe(true);
    expect(result.receipt.alerts.map((alert) => alert.metricId)).toContain("agentEvalHarnessEvidenceCoverage0to1");
    expect(result.watchAlerts.map((alert) => alert.metricId)).toContain("agentEvalHarnessEvidenceCoverage0to1");
    expect(verifyLiveDriftReceipt(result.receipt)).toMatchObject({ valid: true });
  });

  test("alerts when live Score/Shield/Watch OpenCompass sample drifts from baseline", () => {
    const driftingRows = stableLiveRows.map((sample, index): OpenCompassLiveDriftRow => ({
      ...sample,
      score0to1: 0.56 - index * 0.03,
      passed: false,
      behaviorSignature: `opencompass:${sample.openCompassSurface}:${sample.openCompassSignal}:regressed`,
      evidenceRefs: [`opencompass-drift-evidence:${index + 1}`],
      signedEvidenceRefs: [`opencompass-drift-ledger:${index + 1}`],
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
