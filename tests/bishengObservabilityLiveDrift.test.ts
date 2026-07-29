import { describe, expect, test } from "vitest";
import { extractBishengObservabilityDriftStatistic } from "../src/drift/bishengObservabilityLiveDrift.js";
import { projectBishengObservabilityScoreSurface } from "../src/score/bishengObservabilityLiveDriftScore.js";
import {
  BISHENG_OBSERVABILITY_METADATA,
  runBishengObservabilityLiveDrift,
  type BishengObservabilityLiveDriftRow,
  type BishengObservabilityMetadataProof,
  type BishengObservabilitySignal,
  type BishengObservabilitySurface,
} from "../src/watch/bishengObservabilityLiveDrift.js";
import { buildLiveDriftWatchAlerts, verifyLiveDriftReceipt } from "../src/watch/liveDriftAlerts.js";

const metadataProof: BishengObservabilityMetadataProof = {
  repositoryUrl: BISHENG_OBSERVABILITY_METADATA.repositoryUrl,
  defaultBranch: BISHENG_OBSERVABILITY_METADATA.defaultBranch,
  headCommit: BISHENG_OBSERVABILITY_METADATA.headCommit,
  licenseSpdxId: BISHENG_OBSERVABILITY_METADATA.licenseSpdxId,
  primaryLanguage: BISHENG_OBSERVABILITY_METADATA.primaryLanguage,
  repoMetadataHash: "amc-gap-0635-bisheng-github-api-metadata-v1",
  readmeBlobSha: "03bb75fd82a5d84087e598dc7becbd2e516ae3f6",
  licenseBlobSha: "da11a3ce3aa786f2f2e5fbd5d471320aa39cf958",
  tagRefsHash: "amc-gap-0635-bisheng-tag-refs-vtest-v260beta4-v260beta3-v260beta2-v260beta1",
  metadataRetrievedAt: "2026-06-21T00:00:00.000Z",
  amcNativeMappingHash: "amc-gap-0635-bisheng-score-shield-watch-mapping-v1",
  scoreSurfaceMappingHash: "amc-gap-0635-bisheng-score-surface-v1",
  shieldSurfaceMappingHash: "amc-gap-0635-bisheng-shield-surface-v1",
  watchSurfaceMappingHash: "amc-gap-0635-bisheng-watch-surface-v1",
  noBishengSubsystemProofHash: "amc-gap-0635-no-bisheng-subsystem-v1",
  noSdkImporterProofHash: "amc-gap-0635-no-sdk-importer-v1",
  noCopiedWorkflowConfigProofHash: "amc-gap-0635-no-upstream-code-prose-config-workflow-copy-v1",
  baselineDistributionHash: "amc-gap-0635-baseline-distribution-v1",
  liveSampleManifestHash: "amc-gap-0635-live-sample-manifest-v1",
  driftStatisticHash: "amc-gap-0635-drift-statistic-v1",
  alertReceiptHash: "amc-gap-0635-alert-receipt-v1",
  signedEvidencePolicyHash: "amc-gap-0635-signed-evidence-policy-v1",
  failClosedThresholdPolicyHash: "amc-gap-0635-fail-closed-thresholds-v1",
  replayCommandHash: "amc-gap-0635-focused-vitest-command-v1",
  ciReceiptHash: "amc-gap-0635-ci-receipt-v1",
};

const surfaces: BishengObservabilitySurface[] = ["Score", "Shield", "Watch"];
const signals: BishengObservabilitySignal[] = ["evaluation", "alert", "dashboard"];

function row(
  index: number,
  phase: "baseline" | "live",
  overrides: Partial<BishengObservabilityLiveDriftRow> = {},
): BishengObservabilityLiveDriftRow {
  const surface = surfaces[index]!;
  const signal = signals[index]!;
  const score = phase === "baseline" ? 0.93 - index * 0.01 : 0.92 - index * 0.01;
  return {
    traceId: `${phase}-bisheng-${index + 1}`,
    scenarioId: `bisheng-${surface.toLowerCase()}-${signal}`,
    timestamp: phase === "baseline" ? `2026-06-21T00:0${index}:00.000Z` : `2026-06-21T01:0${index}:00.000Z`,
    score0to1: score,
    passed: true,
    refused: false,
    errored: false,
    behaviorSignature: `bisheng:${surface}:${signal}:stable`,
    lifecycleStage: "deployment_maintenance",
    taskCategory: "metadata-only Bisheng observability live drift",
    domain: "agent observability",
    agentEvaluationDimension: "evaluation_frameworks",
    observabilityBenchmarkId: "bisheng-metadata-only-observability-v1",
    observabilityTaskSpecHash: `bisheng-task-spec:${signal}`,
    observabilityGeneratedTaskHash: `bisheng-generated-task:${phase}-${index + 1}`,
    observabilityEnvironmentConfigHash: "amc-owned-observability-env-v1",
    observabilityDockerConfigHash: "amc-owned-observability-docker-v1",
    observabilityScenarioClockHash: `bisheng-scenario-clock:${surface}:${signal}`,
    observabilityScenarioClockAligned: true,
    observabilityAgentTrajectoryHash: `bisheng-trajectory:${phase}-${index + 1}`,
    observabilityCommandStdoutHash: `bisheng-stdout:${phase}-${index + 1}`,
    observabilityGradingDetailsHash: `bisheng-grading:${phase}-${index + 1}`,
    observabilityRewardHash: `bisheng-reward:${phase}-${index + 1}`,
    observabilityResultJsonHash: `bisheng-result:${phase}-${index + 1}`,
    observabilityHtmlReportHash: `bisheng-report:${phase}-${index + 1}`,
    observabilityIncidentContextId: `bisheng-context:${surface}:${signal}`,
    observabilityTaskType: "custom",
    observabilityDataSource: "custom",
    observabilityToolMode: "custom",
    observabilityDeterministicCheckPassRate0to1: 1,
    observabilityRubricScore0to1: score,
    observabilityResolutionScore0to1: score - 0.01,
    observabilityEvidenceCoverage0to1: 1,
    latencyMs: phase === "baseline" ? 400 + index * 20 : 410 + index * 20,
    costUsd: phase === "baseline" ? 0.003 + index * 0.0001 : 0.0031 + index * 0.0001,
    evidenceRefs: [`bisheng-evidence:${phase}-${index + 1}`],
    signedEvidenceRefs: [`bisheng-ledger:${phase}-${index + 1}`],
    bishengSurface: surface,
    bishengSignal: signal,
    bishengProjectHash: `bisheng-project:${index + 1}`,
    bishengTraceHash: `bisheng-trace:${phase}-${index + 1}`,
    bishengSpanTreeHash: `bisheng-span-tree:${phase}-${index + 1}`,
    bishengEvaluationRunHash: `bisheng-eval-run:${phase}-${index + 1}`,
    bishengDatasetSnapshotHash: `bisheng-dataset:${phase}-${index + 1}`,
    bishengScoreEventHash: `bisheng-score-event:${phase}-${index + 1}`,
    bishengAlertPolicyHash: `bisheng-alert-policy:${phase}-${index + 1}`,
    bishengAlertReceiptHash: metadataProof.alertReceiptHash,
    bishengTenantBoundaryHash: "amc-gap-0635-tenant-boundary-v1",
    bishengNoRawPayloadHash: "amc-gap-0635-no-raw-trace-payload-v1",
    bishengNoWorkflowConfigCopyProofHash: metadataProof.noCopiedWorkflowConfigProofHash,
    ...overrides,
  };
}

const baselineRows = [0, 1, 2].map((index) => row(index, "baseline"));
const stableLiveRows = [0, 1, 2].map((index) => row(index, "live"));

function run(overrides: BishengObservabilityMetadataProof = metadataProof, liveRows = stableLiveRows) {
  return runBishengObservabilityLiveDrift({
    agentId: "bisheng-observability-agent",
    metadataProof: overrides,
    baselineWindow: {
      windowId: "bisheng-baseline",
      startedAt: "2026-06-21T00:00:00.000Z",
      endedAt: "2026-06-21T00:10:00.000Z",
      rows: baselineRows,
    },
    liveWindow: {
      windowId: "bisheng-live",
      startedAt: "2026-06-21T01:00:00.000Z",
      endedAt: "2026-06-21T01:10:00.000Z",
      rows: liveRows,
    },
    now: new Date("2026-06-21T02:00:00.000Z"),
  });
}

describe("GAP-0635 Bisheng observability live drift", () => {
  test("approves stable metadata-only Bisheng live drift and exposes Score, Shield, and Watch surfaces", () => {
    const result = run();
    const scoreSurface = projectBishengObservabilityScoreSurface(result);
    const driftStatistic = extractBishengObservabilityDriftStatistic(result);

    expect(result.bishengObservabilityEvidenceCoverage0to1).toBe(1);
    expect(result.missingReasons).toEqual([]);
    expect(result.receipt.failClosed).toBe(false);
    expect(result.baselineDistribution.sampleSize).toBe(3);
    expect(result.liveSample).toHaveLength(3);
    expect(result.driftStatistic.scoreDrift.scoreDrop0to1).toBeLessThanOrEqual(0.02);
    expect(result.alertReceipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.rowProofs).toHaveLength(6);
    expect(scoreSurface.baselineDistribution.sampleSize).toBe(3);
    expect(driftStatistic.behaviorDrift.behaviorDivergence0to1).toBe(0);
    expect(result.scoreSurface.liveSample).toHaveLength(3);
    expect(result.shieldSurface).toMatchObject({ verification: "passed", failClosed: false });
    expect(result.shieldSurface.ciGate.passed).toBe(true);
    expect(result.watchSurface).toMatchObject({ alertCount: 0, evidenceCoverage0to1: 1 });
    expect(buildLiveDriftWatchAlerts(result.receipt)).toEqual([]);
    expect(verifyLiveDriftReceipt(result.receipt)).toMatchObject({ valid: true, errors: [] });
  });

  test("fails closed when live GitHub metadata proof or no-copy proof is incomplete", () => {
    const result = run({
      ...metadataProof,
      headCommit: "stale-commit",
      repoMetadataHash: "",
      noBishengSubsystemProofHash: "",
      noCopiedWorkflowConfigProofHash: "",
    });

    expect(result.bishengObservabilityEvidenceCoverage0to1).toBeLessThan(1);
    expect(result.missingReasons).toEqual(expect.arrayContaining([
      "repoMetadataHash",
      "noBishengSubsystemProofHash",
      "noCopiedWorkflowConfigProofHash",
      "metadataMismatch.headCommit",
    ]));
    expect(result.receipt.failClosed).toBe(true);
    expect(result.receipt.alerts.map((alert) => alert.metricId)).toContain("observabilityEvidenceCoverage0to1");
    expect(result.shieldSurface.verification).toBe("failed");
    expect(result.watchSurface.alerts.map((alert) => alert.metricId)).toContain("observabilityEvidenceCoverage0to1");
    expect(verifyLiveDriftReceipt(result.receipt)).toMatchObject({ valid: true, errors: [] });
  });

  test("fails closed when evidence references contain only whitespace", () => {
    const liveRows = stableLiveRows.map((sample, index): BishengObservabilityLiveDriftRow => {
      if (index === 0) return { ...sample, evidenceRefs: ["   "] };
      if (index === 1) return { ...sample, signedEvidenceRefs: ["", "  "] };
      return sample;
    });

    const result = run(metadataProof, liveRows);

    expect(result.bishengObservabilityEvidenceCoverage0to1).toBeLessThan(1);
    expect(result.missingReasons).toEqual(expect.arrayContaining([
      "live-bisheng-1.evidenceRefs",
      "live-bisheng-2.signedEvidenceRefs",
    ]));
    expect(result.receipt.failClosed).toBe(true);
    expect(result.shieldSurface.verification).toBe("failed");
    expect(result.rowProofs.find((proof) => proof.traceId === "live-bisheng-1")?.evidenceRefs).toEqual([]);
    expect(result.rowProofs.find((proof) => proof.traceId === "live-bisheng-2")?.signedEvidenceRefs).toEqual([]);
    expect(verifyLiveDriftReceipt(result.receipt).valid).toBe(false);
  });

  test("alerts when live Score, Shield, and Watch observability samples drift from baseline", () => {
    const driftingRows = stableLiveRows.map((sample, index): BishengObservabilityLiveDriftRow => ({
      ...sample,
      score0to1: 0.6 - index * 0.04,
      passed: false,
      behaviorSignature: `bisheng:${sample.bishengSurface}:${sample.bishengSignal}:regressed`,
      observabilityRubricScore0to1: 0.58 - index * 0.04,
      observabilityResolutionScore0to1: 0.56 - index * 0.04,
      observabilityEvidenceCoverage0to1: 0.65,
      evidenceRefs: [`bisheng-drift-evidence:${index + 1}`],
      signedEvidenceRefs: [`bisheng-drift-ledger:${index + 1}`],
    }));

    const result = run(metadataProof, driftingRows);

    expect(result.missingReasons).toEqual([]);
    expect(result.receipt.failClosed).toBe(true);
    expect(result.driftStatistic.scoreDrift.scoreDrop0to1).toBeGreaterThan(0.2);
    expect(result.receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "passRate0to1",
      "behaviorSignature",
      "observabilityEvidenceCoverage0to1",
    ]));
    expect(result.watchSurface.alertCount).toBeGreaterThan(0);
    expect(verifyLiveDriftReceipt(result.receipt)).toMatchObject({ valid: true, errors: [] });
  });
});
