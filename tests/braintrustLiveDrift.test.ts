import { describe, expect, test } from "vitest";
import { buildLiveDriftWatchAlerts, verifyLiveDriftReceipt } from "../src/watch/liveDriftAlerts.js";
import {
  runBraintrustLiveDrift,
  type BraintrustLiveDriftRow,
  type BraintrustSourceProof,
} from "../src/watch/braintrustLiveDrift.js";

const sourceProof: BraintrustSourceProof = {
  sourceRefHash: "braintrust.dev@2026-06-20",
  productPageMetadataHash: "https://www.braintrust.dev#sha256:2cb54cb2041155ebd95ef5df6a233b0182ecdde8b8456da1a5c201f76a2777e8",
  llmsTxtHash: "https://www.braintrust.dev/llms.txt#sha256:ee1802d94b245a92cac5e0504a4b0e2e15e9e6ec7ccec229366661201afc7e7e",
  docsSnapshotHash: "braintrust-docs-snapshot-2026-06-20",
  tracingQuickstartHash: "docs/tracing-quickstart.md#sha256:0cb2aad2331b63311c39e575ad4c51fdaaa0f1f9003b547bda1aa5b940b47b7b",
  evaluationQuickstartHash: "docs/evaluation-quickstart.md#sha256:0513c8a24097f22c42ca5336d43e5e137500ec5807d7fa4de6115e4ff97782c8",
  runEvaluationsDocHash: "docs/evaluate/run-evaluations.md#sha256:f137996405c2fcdbf22585050dfbc4696e8ff1c4a21cb982e2a691cea8c38da4",
  compareExperimentsDocHash: "docs/evaluate/compare-experiments.md#sha256:0bb9bc839ceb5ddcfb075170dbaa0873b69378afa38a7ab79f1e35102a63a472",
  onlineScoringDocHash: "docs/evaluate/score-online.md#sha256:0096b177f8bb9dffcfea0ca6e15d13162bf55be4ff72b8872c0d083bae4039d9",
  observeDocsHash: "docs/observe/index.md#sha256:9fb4ef714f9fde0f317b1b615fa5abe585b44402887b45599510b68697132b9e",
  deploymentMonitorDocHash: "docs/deploy/monitor.md#sha256:6031ca3ef5b406ae949b46ec8f412d6fae5b769bb272c312370c1296d4db2eb9",
  amcNativeMappingHash: "amc-braintrust-watch-score-shield-mapping-v1",
  noStandaloneSubsystemProofHash: "amc-braintrust-no-standalone-subsystem-v1",
  noCopiedProseProofHash: "amc-braintrust-no-copied-prose-v1",
  baselineDistributionHash: "amc-braintrust-baseline-distribution-v1",
  liveSampleManifestHash: "amc-braintrust-live-sample-manifest-v1",
  driftStatisticHash: "amc-braintrust-drift-statistic-v1",
  alertReceiptHash: "amc-braintrust-alert-receipt-v1",
  signedEvidencePolicyHash: "amc-braintrust-signed-evidence-policy-v1",
  failClosedThresholdPolicyHash: "amc-braintrust-fail-closed-threshold-policy-v1",
  replayCommandHash: "amc-braintrust-replay-command-v1",
  ciReceiptHash: "amc-braintrust-ci-receipt-v1",
};

function row(
  index: number,
  phase: "baseline" | "live",
  surface: BraintrustLiveDriftRow["braintrustSurface"],
  overrides: Partial<BraintrustLiveDriftRow> = {},
): BraintrustLiveDriftRow {
  const score = phase === "baseline" ? 0.92 - index * 0.01 : 0.91 - index * 0.01;
  return {
    traceId: `${phase}-braintrust-${index + 1}`,
    scenarioId: `braintrust-${surface}-${index + 1}`,
    timestamp: phase === "baseline" ? `2026-06-19T02:0${index}:00.000Z` : `2026-06-19T03:0${index}:00.000Z`,
    score0to1: score,
    passed: true,
    refused: false,
    errored: false,
    behaviorSignature: `braintrust:${surface}|scorer:quality-regression`,
    taskCategory: "ai observability evaluation",
    domain: "agent evaluation",
    agentEvaluationDimension: "evaluation_frameworks",
    latencyMs: phase === "baseline" ? 720 + index * 20 : 745 + index * 20,
    costUsd: phase === "baseline" ? 0.003 + index * 0.001 : 0.0032 + index * 0.001,
    evidenceRefs: [`braintrust-trace-export:${phase}-${index + 1}`],
    signedEvidenceRefs: [`amc-ledger:braintrust-${phase}-${index + 1}`],
    braintrustSurface: surface,
    braintrustProjectIdHash: "bt-project-hash",
    braintrustTraceIdHash: `bt-trace-${phase}-${index + 1}`,
    braintrustSpanTreeHash: `bt-span-tree-${phase}-${index + 1}`,
    braintrustDatasetSnapshotHash: "bt-dataset-snapshot-v1",
    braintrustExperimentRunHash: `bt-experiment-${phase}-${index + 1}`,
    braintrustScorerManifestHash: "bt-scorer-manifest-v1",
    braintrustScoreEventHash: `bt-score-event-${phase}-${index + 1}`,
    braintrustFeedbackReceiptHash: `bt-feedback-${phase}-${index + 1}`,
    braintrustAlertReceiptHash: sourceProof.alertReceiptHash,
    braintrustNoProductPageOnlyProofHash: "amc-row-not-product-page-only-v1",
    ...overrides,
  };
}

const baselineRows = [
  row(0, "baseline", "trace"),
  row(1, "baseline", "online_score"),
  row(2, "baseline", "experiment"),
];

const stableLiveRows = [
  row(0, "live", "trace"),
  row(1, "live", "online_score"),
  row(2, "live", "experiment"),
];

describe("runBraintrustLiveDrift", () => {
  test("approves stable Braintrust-style live drift with baseline/live/statistic/alert evidence", () => {
    const result = runBraintrustLiveDrift({
      agentId: "observability-agent",
      sourceProof,
      baselineWindow: {
        windowId: "braintrust-baseline",
        startedAt: "2026-06-19T02:00:00.000Z",
        endedAt: "2026-06-19T02:10:00.000Z",
        rows: baselineRows,
      },
      liveWindow: {
        windowId: "braintrust-live",
        startedAt: "2026-06-19T03:00:00.000Z",
        endedAt: "2026-06-19T03:10:00.000Z",
        rows: stableLiveRows,
      },
      now: new Date("2026-06-20T00:00:00.000Z"),
    });

    expect(result.braintrustEvidenceCoverage0to1).toBe(1);
    expect(result.missingReasons).toEqual([]);
    expect(result.receipt.failClosed).toBe(false);
    expect(result.receipt.sourceRefs).toContain(sourceProof.llmsTxtHash);
    expect(result.receipt.summary).toContain("braintrust evidence coverage=1");
    expect(result.rowProofs).toHaveLength(6);
    expect(result.rowProofs.every((proof) => proof.signedEvidenceRefs.length > 0)).toBe(true);
    expect(buildLiveDriftWatchAlerts(result.receipt)).toEqual([]);
    expect(verifyLiveDriftReceipt(result.receipt)).toMatchObject({ valid: true });
  });

  test("fails closed when only product-page metadata is present", () => {
    const result = runBraintrustLiveDrift({
      agentId: "observability-agent",
      sourceProof: {
        ...sourceProof,
        llmsTxtHash: "",
        docsSnapshotHash: "",
        tracingQuickstartHash: "",
        evaluationQuickstartHash: "",
        runEvaluationsDocHash: "",
        compareExperimentsDocHash: "",
        onlineScoringDocHash: "",
        observeDocsHash: "",
        deploymentMonitorDocHash: "",
        amcNativeMappingHash: "",
        noStandaloneSubsystemProofHash: "",
        noCopiedProseProofHash: "",
        baselineDistributionHash: "",
        liveSampleManifestHash: "",
        driftStatisticHash: "",
        alertReceiptHash: "",
        signedEvidencePolicyHash: "",
        failClosedThresholdPolicyHash: "",
        replayCommandHash: "",
        ciReceiptHash: "",
      },
      baselineWindow: {
        windowId: "braintrust-baseline",
        startedAt: "2026-06-19T02:00:00.000Z",
        endedAt: "2026-06-19T02:10:00.000Z",
        rows: baselineRows.map((sample) => ({
          ...sample,
          braintrustNoProductPageOnlyProofHash: "",
        })),
      },
      liveWindow: {
        windowId: "braintrust-live",
        startedAt: "2026-06-19T03:00:00.000Z",
        endedAt: "2026-06-19T03:10:00.000Z",
        rows: stableLiveRows.map((sample) => ({
          ...sample,
          braintrustNoProductPageOnlyProofHash: "",
        })),
      },
      now: new Date("2026-06-20T00:00:00.000Z"),
    });

    expect(result.braintrustEvidenceCoverage0to1).toBeLessThan(0.75);
    expect(result.missingReasons).toEqual(expect.arrayContaining([
      "llmsTxtHash",
      "docsSnapshotHash",
      "baselineDistributionHash",
      "liveSampleManifestHash",
      "driftStatisticHash",
      "alertReceiptHash",
      "ciReceiptHash",
      "baseline-braintrust-1.braintrustNoProductPageOnlyProofHash",
    ]));
    expect(result.receipt.failClosed).toBe(true);
    expect(result.receipt.alerts.map((alert) => alert.metricId)).toContain("braintrustEvidenceCoverage0to1");
    expect(result.watchAlerts.map((alert) => alert.metricId)).toContain("braintrustEvidenceCoverage0to1");
    expect(verifyLiveDriftReceipt(result.receipt)).toMatchObject({ valid: true });
  });

  test("fails closed when live score and behavior drift exceed thresholds", () => {
    const driftingRows = stableLiveRows.map((sample, index): BraintrustLiveDriftRow => ({
      ...sample,
      score0to1: 0.68 - index * 0.02,
      passed: index !== 2,
      behaviorSignature: `braintrust:${sample.braintrustSurface}|scorer:regression-spike`,
      evidenceRefs: [`braintrust-drift-trace:${index + 1}`],
      signedEvidenceRefs: [`amc-ledger:braintrust-drift-${index + 1}`],
    }));

    const result = runBraintrustLiveDrift({
      agentId: "observability-agent",
      sourceProof,
      baselineWindow: {
        windowId: "braintrust-baseline",
        startedAt: "2026-06-19T02:00:00.000Z",
        endedAt: "2026-06-19T02:10:00.000Z",
        rows: baselineRows,
      },
      liveWindow: {
        windowId: "braintrust-live",
        startedAt: "2026-06-19T03:00:00.000Z",
        endedAt: "2026-06-19T03:10:00.000Z",
        rows: driftingRows,
      },
      thresholds: {
        maxScoreDrop0to1: 0.05,
        maxPassRateDrop0to1: 0.05,
      },
      now: new Date("2026-06-20T00:00:00.000Z"),
    });

    expect(result.missingReasons).toEqual([]);
    expect(result.receipt.failClosed).toBe(true);
    expect(result.receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "passRate0to1",
      "behaviorSignature",
    ]));
    expect(verifyLiveDriftReceipt(result.receipt)).toMatchObject({ valid: true });
  });
});
