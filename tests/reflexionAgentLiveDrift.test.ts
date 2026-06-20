import { describe, expect, test } from "vitest";
import { verifyLiveDriftReceipt } from "../src/watch/liveDriftAlerts.js";
import {
  runReflexionAgentLiveDrift,
  type ReflexionAgentLiveDriftRow,
  type ReflexionAgentSourceProof,
} from "../src/watch/reflexionAgentLiveDrift.js";

const sourceProof: ReflexionAgentSourceProof = {
  sourceRefHash: "github:faveos8758/reflexion-agent-ts@a6e80ddbbaf1459db5dbd8ac1ff2f3bf51237c2f",
  repositorySnapshotHash: "tree:a6e80ddbbaf1459db5dbd8ac1ff2f3bf51237c2f:34-entries",
  licenseHash: "MIT:14fac913ccf80234b1848540089a3bbcb6e5283d",
  defaultBranchHash: "main@a6e80ddbbaf1459db5dbd8ac1ff2f3bf51237c2f",
  readmeBlobHash: "README.md@391609479c7191463a148dbc614a7d18e06e3ddb",
  packageJsonHash: "package.json@1c13449b10dece28b65c7e93411b155535ca435c",
  reflexionAgentBlobHash: "src/reflexion/ReflexionAgent.ts@7dfbab093b20d2cfc02c7bbf7345fb1a3ad56e1a",
  evaluatorBlobHash: "src/reflexion/evaluator.ts@c4334e74eeb48f320a77ee44cce370ccb47e808f",
  typesBlobHash: "src/reflexion/types.ts@4ef461c938a1471cd4c9617b2532f6e24d27c68d",
  memoryBlobHash: "src/reflexion/memory/in-memory.ts@ba487e3e61aa62d58c88fd1737d2af856661c629",
  sourceRelevanceMappingHash: "gap-0592:execute-evaluate-reflect-store-retry-to-amc-score-watch-shield-v1",
  evaluatorPolicyHash: "amc-reflexion-evaluator-pass-score-policy-v1",
  reflectionMemoryPolicyHash: "amc-reflexion-feedback-history-memory-policy-v1",
  baselineDistributionHash: "amc-reflexion-baseline-distribution-v1",
  liveSampleManifestHash: "amc-reflexion-live-sample-manifest-v1",
  driftStatisticHash: "amc-reflexion-drift-statistic-v1",
  alertReceiptHash: "amc-reflexion-alert-receipt-v1",
  ciReceiptHash: "amc-reflexion-ci-receipt-v1",
  noSourceCopyProofHash: "amc-reflexion-no-upstream-source-copy-v1",
};

function row(
  index: number,
  phase: "baseline" | "live",
  taskType: ReflexionAgentLiveDriftRow["reflexionTaskType"],
  overrides: Partial<ReflexionAgentLiveDriftRow> = {},
): ReflexionAgentLiveDriftRow {
  const stableScore = phase === "baseline" ? 0.91 - index * 0.01 : 0.9 - index * 0.01;
  return {
    traceId: `${phase}-reflexion-${index + 1}`,
    scenarioId: `reflexion-${taskType}-${index + 1}`,
    timestamp: phase === "baseline" ? `2026-06-20T00:0${index}:00.000Z` : `2026-06-20T01:0${index}:00.000Z`,
    score0to1: stableScore,
    passed: true,
    refused: false,
    errored: false,
    behaviorSignature: `reflexion:${taskType}|loop:evaluate-reflect-retry`,
    taskCategory: "reflexion agent live drift",
    domain: "agent evaluation",
    agentEvaluationDimension: "evaluation_frameworks",
    latencyMs: phase === "baseline" ? 950 + index * 25 : 970 + index * 25,
    costUsd: phase === "baseline" ? 0.004 + index * 0.001 : 0.0042 + index * 0.001,
    evidenceRefs: [`reflexion-trace:${phase}-${index + 1}`],
    signedEvidenceRefs: [`reflexion-ledger:${phase}-${index + 1}`],
    reflexionTaskType: taskType,
    reflexionMaxAttempts: 3,
    reflexionAttemptCount: index === 0 ? 1 : 2,
    reflexionEvaluatorPassed: true,
    reflexionEvaluatorScore0to1: stableScore,
    reflexionFeedbackHistoryHash: `feedback-history-${phase}-${index + 1}`,
    reflexionMemoryRetrievalHash: `memory-retrieval-${phase}-${index + 1}`,
    reflexionReflectionPolicyHash: sourceProof.reflectionMemoryPolicyHash,
    reflexionOutputHash: `model-output-${phase}-${index + 1}`,
    reflexionExpectedHash: `expected-${taskType}-${index + 1}`,
    reflexionNoSourceCopyProofHash: sourceProof.noSourceCopyProofHash,
    ...overrides,
  };
}

const baselineRows = [
  row(0, "baseline", "code_fix"),
  row(1, "baseline", "math"),
  row(2, "baseline", "qa"),
];

const stableLiveRows = [
  row(0, "live", "code_fix"),
  row(1, "live", "math"),
  row(2, "live", "qa"),
];

describe("runReflexionAgentLiveDrift", () => {
  test("approves stable Reflexion-style evaluator drift with complete source and row proof", () => {
    const result = runReflexionAgentLiveDrift({
      agentId: "reflexion-agent",
      sourceProof,
      baselineWindow: {
        windowId: "reflexion-baseline",
        startedAt: "2026-06-20T00:00:00.000Z",
        endedAt: "2026-06-20T00:10:00.000Z",
        rows: baselineRows,
      },
      liveWindow: {
        windowId: "reflexion-live",
        startedAt: "2026-06-20T01:00:00.000Z",
        endedAt: "2026-06-20T01:10:00.000Z",
        rows: stableLiveRows,
      },
      now: new Date("2026-06-20T02:00:00.000Z"),
    });

    expect(result.reflexionAgentEvidenceCoverage0to1).toBe(1);
    expect(result.missingReasons).toEqual([]);
    expect(result.receipt.failClosed).toBe(false);
    expect(result.receipt.sourceRefs).toContain(sourceProof.sourceRefHash);
    expect(result.receipt.summary).toContain("Reflexion-agent evidence coverage=1");
    expect(result.rowProofs).toHaveLength(6);
    expect(result.rowProofs.every((proof) => proof.signedEvidenceRefs.length > 0)).toBe(true);
    expect(result.watchAlerts).toEqual([]);
    expect(verifyLiveDriftReceipt(result.receipt)).toMatchObject({ valid: true });
  });

  test("fails closed when source metadata is incomplete despite stable generic drift", () => {
    const result = runReflexionAgentLiveDrift({
      agentId: "reflexion-agent",
      sourceProof: {
        ...sourceProof,
        readmeBlobHash: "",
        evaluatorBlobHash: "",
        sourceRelevanceMappingHash: "",
        alertReceiptHash: "",
        noSourceCopyProofHash: "",
      },
      baselineWindow: {
        windowId: "reflexion-baseline",
        startedAt: "2026-06-20T00:00:00.000Z",
        endedAt: "2026-06-20T00:10:00.000Z",
        rows: baselineRows,
      },
      liveWindow: {
        windowId: "reflexion-live",
        startedAt: "2026-06-20T01:00:00.000Z",
        endedAt: "2026-06-20T01:10:00.000Z",
        rows: stableLiveRows,
      },
      now: new Date("2026-06-20T02:00:00.000Z"),
    });

    expect(result.reflexionAgentEvidenceCoverage0to1).toBeLessThan(1);
    expect(result.missingReasons).toEqual(expect.arrayContaining([
      "readmeBlobHash",
      "evaluatorBlobHash",
      "sourceRelevanceMappingHash",
      "alertReceiptHash",
      "noSourceCopyProofHash",
    ]));
    expect(result.receipt.failClosed).toBe(true);
    expect(result.watchAlerts.map((alert) => alert.metricId)).toContain("reflexionAgentEvidenceCoverage0to1");
    expect(verifyLiveDriftReceipt(result.receipt)).toMatchObject({ valid: true });
  });

  test("alerts when live Reflexion scores and behavior signatures drift", () => {
    const driftingRows = stableLiveRows.map((sample, index): ReflexionAgentLiveDriftRow => ({
      ...sample,
      score0to1: 0.64 - index * 0.03,
      passed: index === 0,
      reflexionEvaluatorPassed: index === 0,
      reflexionEvaluatorScore0to1: 0.64 - index * 0.03,
      reflexionAttemptCount: 3,
      behaviorSignature: `reflexion:${sample.reflexionTaskType}|loop:repeat-failed-feedback`,
      evidenceRefs: [`reflexion-drift-trace:${index + 1}`],
      signedEvidenceRefs: [`reflexion-drift-ledger:${index + 1}`],
    }));

    const result = runReflexionAgentLiveDrift({
      agentId: "reflexion-agent",
      sourceProof,
      baselineWindow: {
        windowId: "reflexion-baseline",
        startedAt: "2026-06-20T00:00:00.000Z",
        endedAt: "2026-06-20T00:10:00.000Z",
        rows: baselineRows,
      },
      liveWindow: {
        windowId: "reflexion-live",
        startedAt: "2026-06-20T01:00:00.000Z",
        endedAt: "2026-06-20T01:10:00.000Z",
        rows: driftingRows,
      },
      thresholds: {
        maxScoreDrop0to1: 0.05,
        maxPassRateDrop0to1: 0.05,
      },
      now: new Date("2026-06-20T02:00:00.000Z"),
    });

    expect(result.missingReasons).toEqual([]);
    expect(result.reflexionAgentEvidenceCoverage0to1).toBe(1);
    expect(result.receipt.failClosed).toBe(true);
    expect(result.receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "passRate0to1",
      "behaviorSignature",
    ]));
    expect(verifyLiveDriftReceipt(result.receipt)).toMatchObject({ valid: true });
  });
});
