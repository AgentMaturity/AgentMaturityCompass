import { describe, expect, test } from "vitest";
import {
  runReplayBenchmarkCorpus,
  verifyReplayBenchmarkCorpusReceipt,
  type ReplayBenchmarkCorpusRowInput,
  type ReplayBenchmarkLlmEvaluationSystemJudgeFamily,
  type ReplayBenchmarkLlmEvaluationSystemMode,
} from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";
import { diagnoseEvalReplayCorpusBoundary } from "../src/diagnostic/evalReplayCorpusBoundary.js";

const h = (nibble: string) => nibble.repeat(64);

const honeyHiveSourceRefs = ["https://www.honeyhive.ai/", "https://docs.honeyhive.ai/llms.txt"];

const verifiedHoneyHiveSource = {
  homepageHash: "ab186e299b70a30e008dc2426f820d68c97caf7f703fb273d579dca1a1d78f68",
  docsIndexHash: "3fccc5aa50b08ae8b8b493ce868a3aa5cdfef3d12d8be96857c748d49dda5e1b",
  overviewHash: "8c2e23f26cd88b63117e2a24c099e186e2c554b0c9b0b8a087a41cedfc052cfc",
  experimentsQuickstartHash: "02265466dd8f9b32ce7598124d0c2b8f66e943e9ef7041a225b83f56ed2283c1",
  tracingIntroHash: "a95d764e2b082471d04597c364c2cea69b5b2437c5e4c9f0893746e8a7e304cb",
};

const completeHoneyHiveEvalPack = {
  sourceRefHash: verifiedHoneyHiveSource.homepageHash,
  docsIndexHash: verifiedHoneyHiveSource.docsIndexHash,
  docsOverviewHash: verifiedHoneyHiveSource.overviewHash,
  packageVersionRefHash: h("d"),
  clientInstallManifestHash: h("e"),
  datasetManifestHash: h("f"),
  experimentManifestHash: h("1"),
  traceExportManifestHash: h("2"),
  evaluatorConfigHash: h("3"),
  judgeRosterHash: h("4"),
  monitorPolicyHash: h("5"),
  deterministicScoringPolicyHash: h("6"),
  executionManifestHash: h("7"),
  openTelemetryTraceHash: h("8"),
  dashboardSnapshotBoundaryHash: h("9"),
  resultManifestHash: h("0"),
  analysisReportHash: h("a"),
  summaryReportHash: h("b"),
  exportReceiptHash: h("c"),
  replayCommandHash: h("d"),
  ciReceiptHash: h("e"),
  noConfigOnlyBoundaryHash: h("f"),
};

function honeyHiveReplayRow(metadataOnly = false): ReplayBenchmarkCorpusRowInput {
  const baselineScore = 0.76;
  const candidateScore = metadataOnly ? 0.61 : 0.83;
  return {
    rowId: metadataOnly ? "honeyhive-metadata-only-eval-claim" : "honeyhive-agent-eval-replay-pack",
    fixture: {
      task: metadataOnly
        ? "Public HoneyHive product metadata without AMC-owned replay fixture, trace export, result manifest, or CI receipt."
        : "Replay an AMC-owned HoneyHive-style agent evaluation pack with dataset, traces, evaluators, monitors, score delta, and CI receipt evidence.",
      inputHash: h("1"),
      expectedHash: h("2"),
      seed: metadataOnly ? 618 : 1618,
      outputArtifactHashes: metadataOnly ? [] : [h("3"), completeHoneyHiveEvalPack.summaryReportHash],
      runtime: {
        kind: "custom" as const,
        version: "honeyhive-eval-replay-fixture-2026.06.20",
        commandHash: h("4"),
        dependencyHash: h("5"),
        sandboxProfile: metadataOnly ? "metadata-only" : "amc-owned-honeyhive-eval-replay",
      },
      agentBenchmarkReplay: {
        benchmarkId: "amc-honeyhive-eval-replay",
        benchmarkVersion: "2026.06.20",
        paperRefHash: completeHoneyHiveEvalPack.sourceRefHash,
        repositorySnapshotHash: completeHoneyHiveEvalPack.docsIndexHash,
        datasetManifestHash: metadataOnly ? undefined : completeHoneyHiveEvalPack.datasetManifestHash,
        agentConfigHash: metadataOnly ? undefined : completeHoneyHiveEvalPack.clientInstallManifestHash,
        globalConfigHash: metadataOnly ? undefined : completeHoneyHiveEvalPack.evaluatorConfigHash,
        modelServerConfigHash: metadataOnly ? undefined : completeHoneyHiveEvalPack.judgeRosterHash,
        environmentManifestHash: metadataOnly ? undefined : completeHoneyHiveEvalPack.executionManifestHash,
        dependencyLockHash: h("5"),
        runCommandHash: h("4"),
        replayCommandHash: metadataOnly ? undefined : completeHoneyHiveEvalPack.replayCommandHash,
        tracePathHash: metadataOnly ? undefined : completeHoneyHiveEvalPack.traceExportManifestHash,
        sampleTraceHash: metadataOnly ? undefined : completeHoneyHiveEvalPack.openTelemetryTraceHash,
        resultManifestHash: metadataOnly ? undefined : completeHoneyHiveEvalPack.resultManifestHash,
        metricsReportHash: metadataOnly ? undefined : completeHoneyHiveEvalPack.analysisReportHash,
        architecture: "custom" as const,
        workload: "custom" as const,
        deterministicSeed: metadataOnly ? undefined : 1618,
        sampleCount: metadataOnly ? 1 : 18,
        minSampleCount: 12,
        shuffled: !metadataOnly,
        traceSaved: !metadataOnly,
        baselineMetric0to1: baselineScore,
        candidateMetric0to1: candidateScore,
        replayPassRate0to1: metadataOnly ? 0.4 : 1,
        minReplayPassRate0to1: 0.99,
        traceCoverage0to1: metadataOnly ? 0.1 : 0.98,
        minTraceCoverage0to1: 0.95,
        maxScoreRegression0to1: 0.02,
        llmEvaluationSystemBenchmarkId: "amc-honeyhive-eval-replay",
        llmEvaluationSystemSourceRefHash: completeHoneyHiveEvalPack.sourceRefHash,
        llmEvaluationSystemRepositorySnapshotHash: completeHoneyHiveEvalPack.docsIndexHash,
        llmEvaluationSystemLicenseRefHash: metadataOnly ? null : completeHoneyHiveEvalPack.docsOverviewHash,
        llmEvaluationSystemPackageVersionRefHash: metadataOnly ? null : completeHoneyHiveEvalPack.packageVersionRefHash,
        llmEvaluationSystemMcpInstallManifestHash: metadataOnly ? null : completeHoneyHiveEvalPack.clientInstallManifestHash,
        llmEvaluationSystemDatasetManifestHash: metadataOnly ? null : completeHoneyHiveEvalPack.datasetManifestHash,
        llmEvaluationSystemSyntheticQaManifestHash: metadataOnly ? null : completeHoneyHiveEvalPack.experimentManifestHash,
        llmEvaluationSystemDocumentGroundingManifestHash: metadataOnly ? null : completeHoneyHiveEvalPack.traceExportManifestHash,
        llmEvaluationSystemJudgeConfigHash: metadataOnly ? null : completeHoneyHiveEvalPack.evaluatorConfigHash,
        llmEvaluationSystemJuryRosterHash: metadataOnly ? null : completeHoneyHiveEvalPack.judgeRosterHash,
        llmEvaluationSystemCriteriaManifestHash: metadataOnly ? null : completeHoneyHiveEvalPack.monitorPolicyHash,
        llmEvaluationSystemBinaryScoringPolicyHash: metadataOnly ? null : completeHoneyHiveEvalPack.deterministicScoringPolicyHash,
        llmEvaluationSystemExecutionManifestHash: metadataOnly ? null : completeHoneyHiveEvalPack.executionManifestHash,
        llmEvaluationSystemAgentTraceManifestHash: metadataOnly ? null : completeHoneyHiveEvalPack.traceExportManifestHash,
        llmEvaluationSystemOpenTelemetryTraceHash: metadataOnly ? null : completeHoneyHiveEvalPack.openTelemetryTraceHash,
        llmEvaluationSystemBedrockAccessBoundaryHash: metadataOnly ? null : completeHoneyHiveEvalPack.dashboardSnapshotBoundaryHash,
        llmEvaluationSystemResultManifestHash: metadataOnly ? null : completeHoneyHiveEvalPack.resultManifestHash,
        llmEvaluationSystemAnalysisReportHash: metadataOnly ? null : completeHoneyHiveEvalPack.analysisReportHash,
        llmEvaluationSystemPdfReportHash: metadataOnly ? null : completeHoneyHiveEvalPack.summaryReportHash,
        llmEvaluationSystemS3SyncReceiptHash: metadataOnly ? null : completeHoneyHiveEvalPack.exportReceiptHash,
        llmEvaluationSystemReplayCommandHash: metadataOnly ? null : completeHoneyHiveEvalPack.replayCommandHash,
        llmEvaluationSystemCiReceiptHash: metadataOnly ? null : completeHoneyHiveEvalPack.ciReceiptHash,
        llmEvaluationSystemNoConfigOnlyBoundaryHash: metadataOnly ? null : completeHoneyHiveEvalPack.noConfigOnlyBoundaryHash,
        llmEvaluationSystemModes: metadataOnly
          ? (["custom"] as ReplayBenchmarkLlmEvaluationSystemMode[])
          : (["dataset_generation", "judge_configuration", "agent_trace", "custom"] as ReplayBenchmarkLlmEvaluationSystemMode[]),
        minLlmEvaluationSystemModeCount: 4,
        llmEvaluationSystemJudgeFamilies: metadataOnly
          ? (["custom"] as ReplayBenchmarkLlmEvaluationSystemJudgeFamily[])
          : (["openai", "anthropic", "custom"] as ReplayBenchmarkLlmEvaluationSystemJudgeFamily[]),
        minLlmEvaluationSystemJudgeFamilyCount: 2,
        llmEvaluationSystemDatasetCount: metadataOnly ? 0 : 2,
        minLlmEvaluationSystemDatasetCount: 2,
        llmEvaluationSystemJudgeCount: metadataOnly ? 1 : 3,
        minLlmEvaluationSystemJudgeCount: 2,
        llmEvaluationSystemCriteriaCount: metadataOnly ? 0 : 6,
        minLlmEvaluationSystemCriteriaCount: 4,
        llmEvaluationSystemEvaluationCaseCount: metadataOnly ? 1 : 18,
        minLlmEvaluationSystemEvaluationCaseCount: 12,
        llmEvaluationSystemDeterministicSeed: metadataOnly ? undefined : 1618,
        llmEvaluationSystemBaselineJuryScore0to1: baselineScore,
        llmEvaluationSystemCandidateJuryScore0to1: candidateScore,
        maxLlmEvaluationSystemJuryScoreRegression0to1: 0.02,
        llmEvaluationSystemBinaryScoringCoverage0to1: metadataOnly ? 0 : 0.97,
        minLlmEvaluationSystemBinaryScoringCoverage0to1: 0.95,
        llmEvaluationSystemJudgeAgreement0to1: metadataOnly ? 0.2 : 0.84,
        minLlmEvaluationSystemJudgeAgreement0to1: 0.75,
        llmEvaluationSystemReplayPassRate0to1: metadataOnly ? 0.4 : 1,
        minLlmEvaluationSystemReplayPassRate0to1: 0.99,
        llmEvaluationSystemReportCoverage0to1: metadataOnly ? 0 : 1,
        minLlmEvaluationSystemReportCoverage0to1: 1,
        llmEvaluationSystemAgentTraceCoverage0to1: metadataOnly ? 0.1 : 0.98,
        minLlmEvaluationSystemAgentTraceCoverage0to1: 0.95,
        llmEvaluationSystemNoSyntheticDataCopyBoundary: !metadataOnly,
        llmEvaluationSystemNoPdfReportOnlyBoundary: !metadataOnly,
      },
      metadata: {
        reviewedSource: "HoneyHive public homepage and docs index",
        sourceDocsIndex: "https://docs.honeyhive.ai/llms.txt",
        noUpstreamPayloadCopied: true,
      },
    },
    baseline: {
      score0to1: baselineScore,
      evidenceRefs: ["trace:honeyhive-baseline"],
      signedEvidenceRefs: metadataOnly ? [] : ["ledger:sig-honeyhive-baseline"],
    },
    candidate: {
      score0to1: candidateScore,
      evidenceRefs: [metadataOnly ? "trace:honeyhive-candidate-regressed" : "trace:honeyhive-candidate"],
      signedEvidenceRefs: metadataOnly ? [] : ["ledger:sig-honeyhive-candidate"],
    },
    surfaces: ["Score", "Shield", "Watch"],
  };
}

function runHoneyHiveReplay(metadataOnly = false) {
  return runReplayBenchmarkCorpus({
    agentId: "honeyhive-instrumented-agent",
    corpusId: "honeyhive-eval-replay-corpus",
    corpusVersion: "2026.06.20",
    baselineRunId: "honeyhive-eval-baseline",
    candidateRunId: metadataOnly ? "honeyhive-eval-candidate-regressed" : "honeyhive-eval-candidate",
    gateMode: metadataOnly ? "lifecycle" : "ci",
    sourceRefs: honeyHiveSourceRefs,
    thresholds: {
      maxScoreRegression0to1: 0.02,
      minSignedEvidenceRefs: 2,
      maxCandidateAttackSuccessRate0to1: 0.05,
      maxAttackSuccessRateRegression0to1: 0.01,
      minAttackSuccessRateReduction0to1: 0,
      requireAttackSuccessRateForRiskRows: false,
      requireOutputArtifactHashForRuntimeRows: true,
    },
    rows: [honeyHiveReplayRow(metadataOnly)],
  });
}

describe("HoneyHive eval replay corpus source review", () => {
  test("binds HoneyHive-style eval packs to replay manifests, fixture hashes, score deltas, diagnostic boundaries, and CI receipts", () => {
    const result = runHoneyHiveReplay(false);

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.fixtureHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "honeyhive-agent-eval-replay-pack",
      status: "passed",
      baselineScore0to1: 0.76,
      candidateScore0to1: 0.83,
      scoreDelta0to1: 0.07,
      signedEvidenceRefs: ["ledger:sig-honeyhive-baseline", "ledger:sig-honeyhive-candidate"],
      surfaces: ["Score", "Shield", "Watch"],
    });
    expect(result.manifest.agentBenchmarkReplaySummary).toMatchObject({
      llmEvaluationSystemReplayRowCount: 1,
      failedLlmEvaluationSystemReplayRowIds: [],
      averageLlmEvaluationSystemJuryScoreDelta0to1: 0.07,
      averageLlmEvaluationSystemReplayPassRate0to1: 1,
    });
    expect(result.ciReceipt).toMatchObject({
      mode: "ci",
      passed: true,
      failClosed: false,
      fixtureHash: result.manifest.fixtureHash,
      manifestHash: result.manifest.manifestHash,
      scoreDelta0to1: result.manifest.scoreDelta0to1,
      failedRowIds: [],
      llmEvaluationSystemReplayRowCount: 1,
      failedLlmEvaluationSystemReplayRowIds: [],
    });
    expect(result.watchAlerts).toEqual([]);
    expect(verifyReplayBenchmarkCorpusReceipt(result.manifest, result.ciReceipt)).toEqual({ valid: true, errors: [] });

    const evidenceReceipt = buildEvalReplayCorpusEvidenceReceipt(result);
    expect(evidenceReceipt).toMatchObject({
      source: "eval-replay-corpus",
      status: "ready",
      manifestHash: result.manifest.manifestHash,
      fixtureHash: result.manifest.fixtureHash,
      scoreDelta0to1: 0.07,
      surfaces: ["Score", "Shield", "Watch"],
      signedEvidenceRefCount: 2,
      replayManifestPresent: true,
      fixtureHashPresent: true,
      ciReceiptPresent: true,
      failClosed: false,
    });
    expect(evidenceReceipt.ciReceiptHash).toMatch(/^[a-f0-9]{64}$/);

    const diagnosticBoundary = diagnoseEvalReplayCorpusBoundary(evidenceReceipt);
    expect(diagnosticBoundary).toMatchObject({
      score: "ready",
      shield: "ready",
      watch: "ready",
      allowedSurfaces: ["Score", "Shield", "Watch"],
      blockedSurfaces: [],
      failClosed: false,
    });
  });

  test("fails closed when HoneyHive source proof is metadata-only and unsigned", () => {
    const result = runHoneyHiveReplay(true);

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("signed evidence refs below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("output artifact hashes missing for runtime row");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay dataset manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay replay command hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay trace saved disabled");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay score regression exceeds threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay llm-evaluation-system ci receipt hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay llm-evaluation-system replay pass rate below threshold");
    expect(result.ciReceipt).toMatchObject({
      mode: "lifecycle",
      passed: false,
      failClosed: true,
      failedRowIds: ["honeyhive-metadata-only-eval-claim"],
      failedLlmEvaluationSystemReplayRowIds: ["honeyhive-metadata-only-eval-claim"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      source: "replay-benchmark-corpus",
      severity: "critical",
      rowId: "honeyhive-metadata-only-eval-claim",
    });

    const evidenceReceipt = buildEvalReplayCorpusEvidenceReceipt(result);
    expect(evidenceReceipt.status).toBe("fail_closed");
    expect(evidenceReceipt.failClosed).toBe(true);
    expect(evidenceReceipt.failedRowIds).toEqual(["honeyhive-metadata-only-eval-claim"]);
    expect(evidenceReceipt.recommendation).toMatch(/Fail closed/);

    const diagnosticBoundary = diagnoseEvalReplayCorpusBoundary(evidenceReceipt);
    expect(diagnosticBoundary).toMatchObject({
      score: "blocked",
      shield: "blocked",
      watch: "blocked",
      allowedSurfaces: [],
      blockedSurfaces: ["Score", "Shield", "Watch"],
      failClosed: true,
    });
  });
});
