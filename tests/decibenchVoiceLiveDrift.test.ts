import { describe, expect, test } from "vitest";
import { buildLiveDriftWatchAlerts, verifyLiveDriftReceipt } from "../src/watch/liveDriftAlerts.js";
import {
  runDecibenchVoiceLiveDrift,
  type DecibenchVoiceLiveDriftRow,
  type DecibenchVoiceSourceProof,
} from "../src/watch/decibenchVoiceLiveDrift.js";

const sourceProof: DecibenchVoiceSourceProof = {
  sourceRefHash: "github:unforkopensource-org/decibench@7ff8b821b307a31d09e4c00d538ffdf31776c855",
  repositorySnapshotHash: "tree:7ff8b821b307a31d09e4c00d538ffdf31776c855:393-entries",
  licenseReferenceHash: "LICENSE@acad0a216e37adc7bd826dd3825b51fd109b202d",
  githubLicenseNoAssertionHash: "github-api-license-noassertion-2026-06-20",
  defaultBranchHash: "main@7ff8b821b307a31d09e4c00d538ffdf31776c855",
  releaseTagHash: "v1.0.0@2e09e01e705b532968b92667c1f23bee62870bdd",
  readmeBlobHash: "README.md@6228d2fd913b01a7c68afa062b1e55fd4fbdb581",
  pyprojectHash: "pyproject.toml@1860ac191a6d751ab02c03d98d909b273c6355fb",
  ciWorkflowHash: ".github/workflows/ci.yml@749f329dab15a179b7b0f7f7e733401970e3a609",
  makefileHash: "Makefile@f8c7988797c0bb427e9582f575337f871161cc7c",
  configExampleHash: "decibench.toml.example@d706de0cb80b7d8b532c83bfc4753cb3bf0346c7",
  srcTreeHash: "src@5884a794f15b7e5985bfbd3bfeefa323d1151417",
  decibenchPackageTreeHash: "src/decibench@9d96c83b5134479804f7742bf52fe5af55fd539a",
  cliTreeHash: "src/decibench/cli@90c4f13db9539bf393fafeca70e14190c2141a31",
  cliRunHash: "src/decibench/cli/run.py@5435ada9df9197ff0bc4147926f74dcb191764b5",
  cliRagHash: "src/decibench/cli/rag.py@f52e5415f4dc10583b4b2dcea6a567f63da20df9",
  mcpTreeHash: "src/decibench/mcp@e3a384f264b19bf9ad5d80126891cd50a50aa6c0",
  mcpToolsRagHash: "src/decibench/mcp/tools_rag.py@ea19d1a10babfadcf3c069be203d75d79801baeb",
  ragTreeHash: "src/decibench/rag@84647074cd36da295a35fec2cd5e0c41d2f19aba",
  evaluatorsTreeHash: "src/decibench/evaluators@d0df9528bae1b953b27756f41d127d6b1d08ad60",
  audioTreeHash: "src/decibench/audio@fc63bca2e8fc5cb0a882c4c25977ad21f7f431a3",
  scenariosTreeHash: "src/decibench/scenarios@0e41c9bc4fd77792b8cbc719023470d7f5209c14",
  scenarioSuiteManifestHash: "src/decibench/scenarios/suites@5d63858973e9521039dc2f6e63d8dc84ebeacc4f",
  testsTreeHash: "tests@0e4447f64554509519092c9b192d1ddb84bef959",
  bridgeSidecarTreeHash: "bridge_sidecar@4bd4c115b4613cd0e101cb3f759657b37fb530d4",
  dashboardTreeHash: "dashboard@0d7f63eeaa6d58780c310cf76e403c1adb7063c3",
  docsTreeHash: "docs@73700a80583d8fdfc2e90da7b1d2e585054be0a2",
  releaseCheckHash: "scripts/release-check.sh@8c762d28cc61ee9b0166840ea5656271dae83433",
  deterministicEvalManifestHash: "amc-decibench-deterministic-eval-manifest-v1",
  semanticEvalManifestHash: "amc-decibench-semantic-eval-manifest-v1",
  ragEvalManifestHash: "amc-decibench-rag-eval-manifest-v1",
  baselineDistributionHash: "amc-decibench-baseline-distribution-v1",
  liveSampleManifestHash: "amc-decibench-live-sample-manifest-v1",
  driftStatisticHash: "amc-decibench-drift-statistic-v1",
  alertReceiptHash: "amc-decibench-alert-receipt-v1",
  replayCommandHash: "amc-decibench-replay-command-v1",
  ciReceiptHash: "amc-decibench-ci-receipt-v1",
  noSourceCopyProofHash: "amc-decibench-no-source-copy-proof-v1",
  noTranscriptCopyProofHash: "amc-decibench-no-transcript-copy-proof-v1",
  privacyBoundaryHash: "amc-decibench-private-audio-transcript-boundary-v1",
};

function row(
  index: number,
  phase: "baseline" | "live",
  taskType: DecibenchVoiceLiveDriftRow["decibenchVoiceTaskType"],
  overrides: Partial<DecibenchVoiceLiveDriftRow> = {},
): DecibenchVoiceLiveDriftRow {
  const score = phase === "baseline" ? 0.91 - index * 0.01 : 0.9 - index * 0.01;
  return {
    traceId: `${phase}-decibench-${index + 1}`,
    scenarioId: `decibench-${taskType}-${index + 1}`,
    timestamp: phase === "baseline" ? `2026-06-20T03:0${index}:00.000Z` : `2026-06-20T04:0${index}:00.000Z`,
    score0to1: score,
    passed: true,
    refused: false,
    errored: false,
    behaviorSignature: `decibench:${taskType}|channel:voice|eval:stable`,
    taskCategory: "voice ai live drift",
    domain: "agent evaluation",
    agentEvaluationDimension: "evaluation_frameworks",
    latencyMs: phase === "baseline" ? 900 + index * 40 : 920 + index * 40,
    costUsd: phase === "baseline" ? 0.004 + index * 0.001 : 0.0042 + index * 0.001,
    evidenceRefs: [`decibench-trace:${phase}-${index + 1}`],
    signedEvidenceRefs: [`decibench-ledger:${phase}-${index + 1}`],
    decibenchVoiceTaskType: taskType,
    decibenchChannel: index === 0 ? "recorded_audio" : index === 1 ? "telephony_bridge" : "websocket",
    decibenchProviderRouteHash: "provider-route-voice-agent-v1",
    decibenchScenarioSuiteHash: "scenario-suite-quick-standard-v1",
    decibenchScenarioHash: `scenario-${taskType}-${index + 1}`,
    decibenchAudioFixtureHash: `audio-fixture-${phase}-${index + 1}`,
    decibenchTranscriptHash: `transcript-private-${phase}-${index + 1}`,
    decibenchExpectedBehaviorHash: `expected-behavior-${index + 1}`,
    decibenchActualBehaviorHash: `actual-behavior-${phase}-${index + 1}`,
    decibenchEvaluatorTraceHash: `evaluator-trace-${phase}-${index + 1}`,
    decibenchRagContextHash: `rag-context-${index + 1}`,
    decibenchToolTraceHash: `mcp-tool-trace-${phase}-${index + 1}`,
    decibenchNoTranscriptCopyProofHash: sourceProof.noTranscriptCopyProofHash,
    decibenchNoSourceCopyProofHash: sourceProof.noSourceCopyProofHash,
    decibenchWer0to1: 0.04 + index * 0.01,
    decibenchLatencyMs: 920 + index * 40,
    decibenchTaskCompletion0to1: score,
    decibenchHallucinationRate0to1: 0.02,
    decibenchRagGrounding0to1: score - 0.03,
    decibenchAudioQuality0to1: score - 0.02,
    ...overrides,
  };
}

const baselineRows = [
  row(0, "baseline", "task_completion"),
  row(1, "baseline", "latency"),
  row(2, "baseline", "rag_grounding"),
];

const stableLiveRows = [
  row(0, "live", "task_completion"),
  row(1, "live", "latency"),
  row(2, "live", "rag_grounding"),
];

describe("runDecibenchVoiceLiveDrift", () => {
  test("approves stable Decibench voice live drift with source, transcript, and row proof", () => {
    const result = runDecibenchVoiceLiveDrift({
      agentId: "voice-agent",
      sourceProof,
      baselineWindow: {
        windowId: "decibench-baseline",
        startedAt: "2026-06-20T03:00:00.000Z",
        endedAt: "2026-06-20T03:10:00.000Z",
        rows: baselineRows,
      },
      liveWindow: {
        windowId: "decibench-live",
        startedAt: "2026-06-20T04:00:00.000Z",
        endedAt: "2026-06-20T04:10:00.000Z",
        rows: stableLiveRows,
      },
      now: new Date("2026-06-20T05:00:00.000Z"),
    });

    expect(result.decibenchEvidenceCoverage0to1).toBe(1);
    expect(result.missingReasons).toEqual([]);
    expect(result.receipt.failClosed).toBe(false);
    expect(result.receipt.sourceRefs).toContain(sourceProof.sourceRefHash);
    expect(result.receipt.summary).toContain("Decibench");
    expect(result.rowProofs).toHaveLength(6);
    expect(result.rowProofs.every((proof) => proof.signedEvidenceRefs.length > 0)).toBe(true);
    expect(buildLiveDriftWatchAlerts(result.receipt)).toEqual([]);
    expect(verifyLiveDriftReceipt(result.receipt)).toMatchObject({ valid: true });
  });

  test("fails closed when Decibench proof is missing even if generic drift is stable", () => {
    const result = runDecibenchVoiceLiveDrift({
      agentId: "voice-agent",
      sourceProof: {
        ...sourceProof,
        readmeBlobHash: "",
        cliRunHash: "",
        mcpToolsRagHash: "",
        driftStatisticHash: "",
        noTranscriptCopyProofHash: "",
      },
      baselineWindow: {
        windowId: "decibench-baseline",
        startedAt: "2026-06-20T03:00:00.000Z",
        endedAt: "2026-06-20T03:10:00.000Z",
        rows: baselineRows,
      },
      liveWindow: {
        windowId: "decibench-live",
        startedAt: "2026-06-20T04:00:00.000Z",
        endedAt: "2026-06-20T04:10:00.000Z",
        rows: stableLiveRows,
      },
      now: new Date("2026-06-20T05:00:00.000Z"),
    });

    expect(result.decibenchEvidenceCoverage0to1).toBeLessThan(1);
    expect(result.missingReasons).toEqual(expect.arrayContaining([
      "readmeBlobHash",
      "cliRunHash",
      "mcpToolsRagHash",
      "driftStatisticHash",
      "noTranscriptCopyProofHash",
    ]));
    expect(result.receipt.failClosed).toBe(true);
    expect(result.receipt.alerts.map((alert) => alert.metricId)).toContain("decibenchEvidenceCoverage0to1");
    expect(buildLiveDriftWatchAlerts(result.receipt).map((alert) => alert.metricId)).toContain("decibenchEvidenceCoverage0to1");
    expect(verifyLiveDriftReceipt(result.receipt)).toMatchObject({ valid: true });
  });

  test("fails closed when live voice behavior and score drift exceed thresholds", () => {
    const driftingRows = stableLiveRows.map((sample, index): DecibenchVoiceLiveDriftRow => ({
      ...sample,
      score0to1: 0.62 - index * 0.02,
      passed: index !== 2,
      behaviorSignature: `decibench:${sample.decibenchVoiceTaskType}|channel:voice|eval:regressed`,
      decibenchTaskCompletion0to1: 0.62 - index * 0.02,
      decibenchHallucinationRate0to1: 0.2,
      evidenceRefs: [`decibench-drift-trace:${index + 1}`],
      signedEvidenceRefs: [`decibench-drift-ledger:${index + 1}`],
    }));

    const result = runDecibenchVoiceLiveDrift({
      agentId: "voice-agent",
      sourceProof,
      baselineWindow: {
        windowId: "decibench-baseline",
        startedAt: "2026-06-20T03:00:00.000Z",
        endedAt: "2026-06-20T03:10:00.000Z",
        rows: baselineRows,
      },
      liveWindow: {
        windowId: "decibench-live",
        startedAt: "2026-06-20T04:00:00.000Z",
        endedAt: "2026-06-20T04:10:00.000Z",
        rows: driftingRows,
      },
      thresholds: {
        maxScoreDrop0to1: 0.05,
        maxPassRateDrop0to1: 0.05,
      },
      now: new Date("2026-06-20T05:00:00.000Z"),
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
