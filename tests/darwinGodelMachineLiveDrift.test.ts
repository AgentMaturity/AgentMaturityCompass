import { describe, expect, test } from "vitest";
import {
  runDarwinGodelMachineLiveDrift,
  type DarwinGodelMachineBenchmarkFamily,
  type DarwinGodelMachineLiveDriftRow,
  type DarwinGodelMachineSandboxMode,
} from "../src/watch/darwinGodelMachineLiveDrift.js";
import { verifyLiveDriftReceipt } from "../src/watch/liveDriftAlerts.js";
import { withBlankEvidenceRefs } from "./helpers/liveDriftEvidence.js";

const benchmarkFamilies: DarwinGodelMachineBenchmarkFamily[] = [
  "humaneval_calibrated",
  "humaneval_headroom",
  "string_manipulation",
];

const sandboxModes: DarwinGodelMachineSandboxMode[] = [
  "docker_full_process",
  "docker_command",
  "host_fallback",
];

function dgmRow(
  index: number,
  phase: "baseline" | "live",
  overrides: Partial<DarwinGodelMachineLiveDriftRow> = {},
): DarwinGodelMachineLiveDriftRow {
  const benchmarkFamily = benchmarkFamilies[index]!;
  const sandboxMode = sandboxModes[index]!;
  const isBaseline = phase === "baseline";
  return {
    traceId: `dgm-${phase}-${index + 1}`,
    scenarioId: `dgm-${benchmarkFamily}-${phase}-${index + 1}`,
    timestamp: isBaseline
      ? `2026-06-20T00:0${index}:00.000Z`
      : `2026-06-20T01:0${index}:00.000Z`,
    dgmRunId: `dgm-run-${phase}-${index + 1}`,
    sourceRefHash: "lemoz-dgm-source-ref",
    repositorySnapshotHash: "013b2351e95b7e731c4c621939eb102e008a255a",
    noLicenseBoundaryHash: "github-license-null-dgm",
    readmeBlobHash: "ea1092ad2206800e5520732c007b725592a4552d",
    securityPolicyHash: "f7a6f69a9a268d8c65e73590b98b1645f961fc49",
    ciWorkflowHash: "3e9034d6b179bab02b38fb320e383ec9d84a707e",
    controllerHash: "8a6cc1308437e289155d2ab3ab6d40a5bac950b1",
    archiveHash: "4bf36898abc2372b9b61c1d13377d175a316890b",
    selfModificationHash: "dgm-self-modification-tree",
    evaluationHarnessHash: "56895751cddd2f48fd9963a94702983a5b3cc7e6",
    scorerHash: "95a8d308408f5ae6ea23c4764a292754e301d166",
    sandboxDockerfileHash: "43710e8a959c37de11668039acc883c833a9ce4f",
    sandboxManagerHash: "f1763d12bd960a50cf053d9a054dc5fdebbe6374",
    liveRunConfigHash: "fee4e2f5de641dfaab57352181d94c3e724c4704",
    liveProofConfigHash: "caff5aae69cce56531fd2bc2c59fe847a8928b35",
    modelMatrixConfigHash: "08541e721eefeb469a6716a81fb5f85787cda7e3",
    benchmarkManifestHash: "eb66db3468b33d117ee593d89b4831adb7780dff",
    scoreMovementManifestHash: "6064021e895879727bbc5eff14ead9ab79c79432",
    livePlanVerifierHash: "7d71f8f11968d73f3dc3296a3aab5a58aa74231b",
    sandboxVerifierHash: "840bf32a1a9f71c6437729a8ea3a6aa04a300bdd",
    archiveScoreSummarizerHash: "968196e148680a1281703220e4ae66a6f274df07",
    fullProcessSandboxRunnerHash: "d408824e64d2885de28f30df47fef57a255e9151",
    baselineResultHash: isBaseline ? `dgm-baseline-result-${index + 1}` : undefined,
    liveResultHash: isBaseline ? undefined : `dgm-live-result-${index + 1}`,
    driftStatisticHash: isBaseline ? undefined : `dgm-drift-stat-${index + 1}`,
    alertReceiptHash: isBaseline ? undefined : `dgm-alert-${index + 1}`,
    generation: index + 1,
    parentAgentHash: `dgm-parent-agent-${index + 1}`,
    candidateAgentHash: `dgm-candidate-agent-${index + 1}`,
    lineageGraphHash: `dgm-lineage-${index + 1}`,
    providerRouteHash: "dgm-provider-route-anthropic-openai-compatible",
    modelId: index === 0 ? "claude-sonnet-4-6" : "gpt-5-mini",
    sandboxMode,
    benchmarkFamily,
    parentScore0to1: 0.61 + index * 0.01,
    candidateScore0to1: isBaseline ? 0.84 - index * 0.01 : 0.83 - index * 0.01,
    passRate0to1: isBaseline ? 0.94 - index * 0.01 : 0.93 - index * 0.01,
    mutationAccepted: true,
    regressionFailureRate0to1: isBaseline ? 0.01 : 0.012,
    latencyMs: isBaseline ? 900 + index * 20 : 930 + index * 20,
    costUsd: isBaseline ? 0.18 + index * 0.01 : 0.19 + index * 0.01,
    agentStepCount: 4 + index,
    evidenceRefs: [`dgm-trace:${phase}-${index + 1}`],
    signedEvidenceRefs: [`dgm-ledger:${phase}-${index + 1}`],
    ...overrides,
  };
}

describe("Darwin Godel Machine live drift", () => {
  test("approves stable self-improvement score movement with source, sandbox, benchmark, lineage, and alert proof", () => {
    const baselineRows = [0, 1, 2].map((index) => dgmRow(index, "baseline"));
    const liveRows = [0, 1, 2].map((index) => dgmRow(index, "live"));

    const result = runDarwinGodelMachineLiveDrift({
      agentId: "self-improving-coding-agent",
      baselineWindow: {
        windowId: "baseline-dgm",
        startedAt: "2026-06-20T00:00:00.000Z",
        endedAt: "2026-06-20T00:10:00.000Z",
        rows: baselineRows,
      },
      liveWindow: {
        windowId: "live-dgm",
        startedAt: "2026-06-20T01:00:00.000Z",
        endedAt: "2026-06-20T01:10:00.000Z",
        rows: liveRows,
      },
      now: new Date("2026-06-20T02:00:00.000Z"),
    });

    expect(result.receipt.failClosed).toBe(false);
    expect(result.receipt.recommendation).toBe("approve");
    expect(result.receipt.sourceRefs).toContain("https://github.com/lemoz/darwin-godel-machine");
    expect(result.liveDistribution.evidenceCoverage0to1).toBe(1);
    expect(result.liveDistribution.benchmarkFamilyDistribution.humaneval_calibrated).toBeCloseTo(1 / 3, 5);
    expect(result.liveDistribution.sandboxModeDistribution.docker_full_process).toBeCloseTo(1 / 3, 5);
    expect(result.scoreDrift.scoreMovementDrop0to1).toBeCloseTo(0.01, 5);
    expect(result.scoreDrift.regressionFailureRateIncrease0to1).toBeCloseTo(0.002, 5);
    expect(result.behaviorDrift.contextDivergence0to1).toBe(0);
    expect(result.liveRows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.darwinGodelMachineReceiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyLiveDriftReceipt(result.receipt).valid).toBe(true);
  });

  test("fails closed when self-improvement evidence references contain only whitespace", () => {
    const result = runDarwinGodelMachineLiveDrift({
      agentId: "self-improving-coding-agent",
      baselineWindow: {
        windowId: "baseline-dgm-blank-refs",
        startedAt: "2026-06-20T00:00:00.000Z",
        endedAt: "2026-06-20T00:10:00.000Z",
        rows: [0, 1, 2].map((index) => dgmRow(index, "baseline")),
      },
      liveWindow: {
        windowId: "live-dgm-blank-refs",
        startedAt: "2026-06-20T01:00:00.000Z",
        endedAt: "2026-06-20T01:10:00.000Z",
        rows: withBlankEvidenceRefs([0, 1, 2].map((index) => dgmRow(index, "live"))),
      },
      now: new Date("2026-06-20T02:00:00.000Z"),
    });

    expect(result.liveDistribution.evidenceCoverage0to1).toBeLessThan(1);
    expect(result.liveRows[0]?.evidenceCoverage0to1).toBeLessThan(1);
    expect(result.liveRows[1]?.evidenceCoverage0to1).toBeLessThan(1);
    expect(result.receipt.alerts.map((alert) => alert.metricId)).toContain("darwinGodelEvidenceCoverage0to1");
    expect(result.receipt.failClosed).toBe(true);
  });

  test("fails closed when live self-improvement loses proof, regresses score movement, and lacks signed evidence", () => {
    const baselineRows = [0, 1, 2].map((index) => dgmRow(index, "baseline"));
    const liveRows = [0, 1, 2].map((index) =>
      dgmRow(index, "live", {
        sandboxManagerHash: index === 0 ? "" : "f1763d12bd960a50cf053d9a054dc5fdebbe6374",
        liveResultHash: index === 0 ? undefined : `dgm-live-result-${index + 1}`,
        driftStatisticHash: index === 0 ? undefined : `dgm-drift-stat-${index + 1}`,
        alertReceiptHash: index === 0 ? undefined : `dgm-alert-${index + 1}`,
        candidateScore0to1: 0.55,
        passRate0to1: 0.61,
        mutationAccepted: false,
        regressionFailureRate0to1: 0.19,
        lineageGraphHash: index === 0 ? "" : `dgm-lineage-${index + 1}`,
        signedEvidenceRefs: index === 0 ? [] : [`dgm-ledger:live-${index + 1}`],
      })
    );

    const result = runDarwinGodelMachineLiveDrift({
      agentId: "self-improving-coding-agent",
      baselineWindow: {
        windowId: "baseline-dgm",
        startedAt: "2026-06-20T00:00:00.000Z",
        endedAt: "2026-06-20T00:10:00.000Z",
        rows: baselineRows,
      },
      liveWindow: {
        windowId: "live-dgm",
        startedAt: "2026-06-20T01:00:00.000Z",
        endedAt: "2026-06-20T01:10:00.000Z",
        rows: liveRows,
      },
      now: new Date("2026-06-20T02:00:00.000Z"),
    });

    const alertMetricIds = result.receipt.alerts.map((alert) => alert.metricId);
    expect(result.receipt.failClosed).toBe(true);
    expect(result.receipt.recommendation).toBe("alert");
    expect(result.scoreDrift.scoreMovementDrop0to1).toBeGreaterThan(0.2);
    expect(result.scoreDrift.regressionFailureRateIncrease0to1).toBeGreaterThan(0.15);
    expect(result.liveDistribution.evidenceCoverage0to1).toBeLessThan(1);
    expect(alertMetricIds).toContain("darwinGodelScoreMovementMean0to1");
    expect(alertMetricIds).toContain("darwinGodelRegressionFailureRate0to1");
    expect(alertMetricIds).toContain("darwinGodelEvidenceCoverage0to1");
    expect(result.liveRows[0]?.evidenceCoverage0to1).toBeLessThan(1);
    const verification = verifyLiveDriftReceipt(result.receipt);
    expect(verification.valid).toBe(false);
    expect(verification.errors.join(" ")).toContain("missing signedEvidenceRefs");
  });
});
