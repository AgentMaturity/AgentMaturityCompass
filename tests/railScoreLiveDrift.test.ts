import { describe, expect, test } from "vitest";
import { buildLiveDriftWatchAlerts, verifyLiveDriftReceipt } from "../src/watch/liveDriftAlerts.js";
import {
  runRailScoreLiveDrift,
  type RailScoreEvaluationDimension,
  type RailScoreGuardrailMode,
  type RailScoreLiveDriftRow,
} from "../src/watch/railScoreLiveDrift.js";

const dimensions: RailScoreEvaluationDimension[] = ["fairness", "safety", "privacy"];
const modes: RailScoreGuardrailMode[] = ["score_only", "safe_regeneration", "agent_tool_call"];

function railRow(
  index: number,
  phase: "baseline" | "live",
  overrides: Partial<RailScoreLiveDriftRow> = {},
): RailScoreLiveDriftRow {
  const dimension = dimensions[index]!;
  const guardrailMode = modes[index]!;
  return {
    traceId: `rail-score-${phase}-${index + 1}`,
    scenarioId: `rail-score-${dimension}-${index + 1}`,
    timestamp: phase === "baseline" ? `2026-06-20T00:0${index}:00.000Z` : `2026-06-20T01:0${index}:00.000Z`,
    evalPackId: "rail-score-live-drift-v1",
    sourceRefHash: "github:Responsible-AI-Labs/rail-score-sdk@1ceabf522621bbd208cf9423acfa3683a3ddba60",
    repositorySnapshotHash: "tree:68ac4b8285595f9eb00d7113d39958a61943c7a5",
    licenseRefHash: "LICENSE@a01d97a6a3ee494b4af9099eab2b3c0b2c970efd",
    releaseRefHash: "github-release:v2.6.1@2026-06-07T13:06:56Z",
    pypiPackageHash: "pypi:rail-score-sdk@2.6.1",
    pypiWheelHash: "pypi-wheel:rail_score_sdk-2.6.1-py3-none-any.whl@sha256:5061c78da45d0eae3218e2dbeee78ee6e9a89303155704e75ada22a11f4551e3",
    pypiSdistHash: "pypi-sdist:rail_score_sdk-2.6.1.tar.gz@sha256:65d72ca34defda1c872112a6bdd087358b9f1727bbc3c0e02230ead22319b38c",
    readmeBlobHash: "README.md@7e7ef90933b285036b4101343559e8e2743bd903",
    pyprojectBlobHash: "pyproject.toml@a265bdccc56bc8de5936df0128691cb68efb5206",
    requirementsBlobHash: "requirements.txt@a8608b2c6a57e72113cd5743a8022109d1db0a96",
    ciWorkflowHash: ".github/workflows/python-ci.yml@7bcddbab2c27e6bc6c31f06c36c7cddfa37b1c3b",
    publishWorkflowHash: ".github/workflows/python-publish.yml@c615493fdbe8d1fa2bd35880b15e2f26530de4dd",
    clientHash: "rail_score_sdk/client.py@a74cb34f8522e427900fad4f0f445f8254910d7d",
    modelsHash: "rail_score_sdk/models.py@e1e28b02e94d2cbea14efa4e7d056d3ed70117b5",
    policiesHash: "rail_score_sdk/policies.py@a3d8f4b8bc7cbc19fb600de8f38b8a8ae8667aba",
    sessionHash: "rail_score_sdk/session.py@861dd3ee314c6d170d6c565657780d88fe1a34d4",
    middlewareHash: "rail_score_sdk/middleware.py@5f81b8b7164a1c9e0520551993b7dbf6126f5dd8",
    telemetryCoreHash: "rail_score_sdk/telemetry/core.py@bd831ef08d1b5be30ef1c4bab3f986c68b6cca27",
    telemetryInstrumentorHash: "rail_score_sdk/telemetry/instrumentor.py@04e615a4df33ab174fd165c572ae02f601e8272b",
    complianceLoggerHash: "rail_score_sdk/telemetry/compliance_logger.py@423e3da5840d8a71001f9f41c314bda7dbef8685",
    reviewQueueHash: "rail_score_sdk/telemetry/review_queue.py@7f34c5f474b1bd3f39a3c86978fb08cf8de6835d",
    agentClientHash: "rail_score_sdk/agent/client.py@c6fe1514a9213c87736c2be8faac39a92d01fb90",
    agentModelsHash: "rail_score_sdk/agent/models.py@a796620464c781ba9ebe2ddadfc496aba85ba309",
    agentSessionHash: "rail_score_sdk/agent/session.py@65ae95c8bdb419ec2efa709fadb4c1ef8a0e8b78",
    agentPolicyHash: "rail_score_sdk/agent/policy.py@99734d0d8dde98cacf6fb22d37de35165c408c44",
    openAiWrapperHash: "rail_score_sdk/integrations/openai.py@b8d72b1a7eb049c2447e9a19d02ee6df50766b0c",
    langfuseIntegrationHash: "rail_score_sdk/integrations/langfuse.py@d9cd9d6910c543845c8421558396fe20de4e3147",
    liteLlmGuardrailHash: "rail_score_sdk/integrations/litellm_guardrail.py@bf0e0248ac4b6d9d5f83d1c2fbfacd4c3fc828c0",
    dpdpClientHash: "rail_score_sdk/compliance/dpdp/client.py@0ed9bf8fa8923325746843b0de11291a603c7c6d",
    dpdpScannerHash: "rail_score_sdk/compliance/dpdp/scanner.py@bfca0abc6488a2cd6bf588c6137d12769bb157cf",
    baselineResultHash: `rail-score-baseline-result-${index + 1}`,
    liveResultHash: phase === "live" ? `rail-score-live-result-${index + 1}` : undefined,
    driftStatisticHash: phase === "live" ? `rail-score-drift-statistic-${index + 1}` : undefined,
    alertReceiptHash: phase === "live" ? `rail-score-alert-receipt-${index + 1}` : undefined,
    evaluationDimension: dimension,
    guardrailMode,
    complianceFramework: index === 0 ? "eu_ai_act" : index === 1 ? "hipaa" : "dpdp",
    modelProvider: index === 0 ? "openai" : index === 1 ? "anthropic" : "google",
    score0to1: phase === "baseline" ? 0.91 - index * 0.01 : 0.895 - index * 0.01,
    guardrailPassRate0to1: phase === "baseline" ? 0.96 - index * 0.01 : 0.95 - index * 0.01,
    safeRegenerationRate0to1: phase === "baseline" ? 0.9 - index * 0.01 : 0.89 - index * 0.01,
    agentToolCallAccuracy0to1: phase === "baseline" ? 0.92 - index * 0.01 : 0.91 - index * 0.01,
    compliancePassRate0to1: phase === "baseline" ? 0.97 - index * 0.005 : 0.965 - index * 0.005,
    telemetryCoverage0to1: 1,
    promptInjectionBlockRate0to1: phase === "baseline" ? 0.94 - index * 0.01 : 0.93 - index * 0.01,
    latencyMs: phase === "baseline" ? 820 + index * 20 : 840 + index * 20,
    costUsd: phase === "baseline" ? 0.004 + index * 0.001 : 0.0042 + index * 0.001,
    evidenceRefs: [`rail-score-trace:${phase}-${index + 1}`],
    signedEvidenceRefs: [`rail-score-ledger:${phase}-${index + 1}`],
    ...overrides,
  };
}

describe("runRailScoreLiveDrift", () => {
  test("approves stable RAIL Score live drift with source, package, guardrail, telemetry, and compliance proof", () => {
    const result = runRailScoreLiveDrift({
      agentId: "rail-score-agent",
      baselineWindow: {
        windowId: "baseline-rail-score",
        startedAt: "2026-06-20T00:00:00.000Z",
        endedAt: "2026-06-20T00:05:00.000Z",
        rows: dimensions.map((_, index) => railRow(index, "baseline")),
      },
      liveWindow: {
        windowId: "live-rail-score",
        startedAt: "2026-06-20T01:00:00.000Z",
        endedAt: "2026-06-20T01:05:00.000Z",
        rows: dimensions.map((_, index) => railRow(index, "live")),
      },
      sourceRefs: [
        "https://github.com/Responsible-AI-Labs/rail-score-sdk",
        "https://pypi.org/project/rail-score-sdk/",
      ],
      now: new Date("2026-06-20T01:06:00.000Z"),
    });

    expect(result.receipt.failClosed).toBe(false);
    expect(result.receipt.recommendation).toBe("approve");
    expect(result.receipt.alerts).toEqual([]);
    expect(result.railScoreReceiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.receipt.sourceRefs).toEqual(expect.arrayContaining([
      "https://github.com/Responsible-AI-Labs/rail-score-sdk",
      "https://pypi.org/project/rail-score-sdk/",
    ]));
    expect(result.baselineDistribution.rowCount).toBe(3);
    expect(result.liveDistribution.scoreMean0to1).toBeGreaterThan(0.87);
    expect(result.liveDistribution.guardrailPassRate0to1).toBeGreaterThan(0.92);
    expect(result.liveDistribution.safeRegenerationRate0to1).toBeGreaterThan(0.85);
    expect(result.liveDistribution.agentToolCallAccuracyMean0to1).toBeGreaterThan(0.88);
    expect(result.liveDistribution.compliancePassRate0to1).toBeGreaterThan(0.94);
    expect(result.liveDistribution.evidenceCoverage0to1).toBe(1);
    expect(result.behaviorDrift.contextDivergence0to1).toBe(0);
    expect(result.liveRows[0]).toMatchObject({
      evalPackId: "rail-score-live-drift-v1",
      sourceRefHash: "github:Responsible-AI-Labs/rail-score-sdk@1ceabf522621bbd208cf9423acfa3683a3ddba60",
      pypiPackageHash: "pypi:rail-score-sdk@2.6.1",
      liveResultHash: "rail-score-live-result-1",
      driftStatisticHash: "rail-score-drift-statistic-1",
      alertReceiptHash: "rail-score-alert-receipt-1",
      evaluationDimension: "fairness",
      guardrailMode: "score_only",
      evidenceCoverage0to1: 1,
    });
    expect(result.liveRows[0]!.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(buildLiveDriftWatchAlerts(result.receipt)).toEqual([]);
    expect(verifyLiveDriftReceipt(result.receipt)).toMatchObject({
      valid: true,
      errors: [],
      receiptHash: result.receipt.receiptHash,
    });
  });

  test("fails closed when RAIL Score rows lose live result, drift statistic, alert receipt, and source context proof", () => {
    const result = runRailScoreLiveDrift({
      agentId: "rail-score-agent",
      baselineWindow: {
        windowId: "baseline-rail-score-proof",
        startedAt: "2026-06-20T00:00:00.000Z",
        endedAt: "2026-06-20T00:05:00.000Z",
        rows: dimensions.map((_, index) => railRow(index, "baseline")),
      },
      liveWindow: {
        windowId: "live-rail-score-proof",
        startedAt: "2026-06-20T01:00:00.000Z",
        endedAt: "2026-06-20T01:05:00.000Z",
        rows: dimensions.map((_, index) =>
          railRow(index, "live", {
            sourceRefHash: index === 0 ? "github:Responsible-AI-Labs/rail-score-sdk@1ceabf522621bbd208cf9423acfa3683a3ddba60" : "",
            repositorySnapshotHash: index === 0 ? "tree:68ac4b8285595f9eb00d7113d39958a61943c7a5" : "",
            pypiPackageHash: index === 0 ? "pypi:rail-score-sdk@2.6.1" : "",
            pypiWheelHash: index === 0 ? "pypi-wheel:rail_score_sdk-2.6.1-py3-none-any.whl@sha256:5061c78da45d0eae3218e2dbeee78ee6e9a89303155704e75ada22a11f4551e3" : "",
            pypiSdistHash: index === 0 ? "pypi-sdist:rail_score_sdk-2.6.1.tar.gz@sha256:65d72ca34defda1c872112a6bdd087358b9f1727bbc3c0e02230ead22319b38c" : "",
            clientHash: index === 0 ? "rail_score_sdk/client.py@a74cb34f8522e427900fad4f0f445f8254910d7d" : "",
            telemetryCoreHash: index === 0 ? "rail_score_sdk/telemetry/core.py@bd831ef08d1b5be30ef1c4bab3f986c68b6cca27" : "",
            agentClientHash: index === 0 ? "rail_score_sdk/agent/client.py@c6fe1514a9213c87736c2be8faac39a92d01fb90" : "",
            dpdpClientHash: index === 0 ? "rail_score_sdk/compliance/dpdp/client.py@0ed9bf8fa8923325746843b0de11291a603c7c6d" : "",
            liveResultHash: index === 0 ? "rail-score-live-result-1" : undefined,
            driftStatisticHash: index === 0 ? "rail-score-drift-statistic-1" : undefined,
            alertReceiptHash: index === 0 ? "rail-score-alert-receipt-1" : undefined,
            evaluationDimension: index === 0 ? dimensions[index]! : "custom",
            guardrailMode: index === 0 ? modes[index]! : "custom",
            complianceFramework: index === 0 ? "eu_ai_act" : "custom",
            telemetryCoverage0to1: 0.98,
          }),
        ),
      },
      thresholds: {
        maxContextDivergence0to1: 0.2,
      },
      sourceRefs: ["https://github.com/Responsible-AI-Labs/rail-score-sdk"],
      now: new Date("2026-06-20T01:06:00.000Z"),
    });

    expect(result.receipt.failClosed).toBe(true);
    expect(result.receipt.recommendation).toBe("alert");
    expect(result.liveDistribution.evidenceCoverage0to1).toBeLessThan(1);
    expect(result.behaviorDrift.contextDivergence0to1).toBeGreaterThan(0.2);
    expect(result.receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "railEvidenceCoverage0to1",
      "railContextDistribution",
    ]));
    expect(result.liveRows[1]).toMatchObject({
      sourceRefHash: "",
      repositorySnapshotHash: "",
      pypiPackageHash: "",
      liveResultHash: undefined,
      driftStatisticHash: undefined,
      alertReceiptHash: undefined,
      evaluationDimension: "custom",
      guardrailMode: "custom",
      complianceFramework: "custom",
      evidenceCoverage0to1: expect.any(Number),
    });
    expect(result.liveRows[1]!.evidenceCoverage0to1).toBeLessThan(1);
    expect(buildLiveDriftWatchAlerts(result.receipt).map((alert) => alert.metricId)).toEqual(result.receipt.alerts.map((alert) => alert.metricId));
    expect(verifyLiveDriftReceipt(result.receipt)).toMatchObject({
      valid: true,
      errors: [],
    });
  });
});
