import { describe, expect, test } from "vitest";
import {
  runReplayBenchmarkCorpus,
  verifyReplayBenchmarkCorpusReceipt,
} from "../src/benchmarks/replayBenchmarkCorpus.js";

const h = (nibble: string) => nibble.repeat(64);

const langWatchSourceRefs = ["https://langwatch.ai", "https://docs.langwatch.ai/llms.txt"];

const completeLangWatchEvalPack = {
  sourceRefHash: h("a"),
  docsIndexHash: h("b"),
  licenseRefHash: h("c"),
  packageVersionRefHash: h("d"),
  sdkInstallManifestHash: h("e"),
  datasetManifestHash: h("f"),
  scenarioManifestHash: h("1"),
  traceExportManifestHash: h("2"),
  evaluatorConfigHash: h("3"),
  judgeRosterHash: h("4"),
  guardrailPolicyHash: h("5"),
  deterministicScoringPolicyHash: h("6"),
  executionManifestHash: h("7"),
  openTelemetryTraceHash: h("8"),
  monitorSnapshotHash: h("9"),
  resultManifestHash: h("0"),
  analysisReportHash: h("a"),
  summaryReportHash: h("b"),
  exportReceiptHash: h("c"),
  replayCommandHash: h("d"),
  ciReceiptHash: h("e"),
  noConfigOnlyBoundaryHash: h("f"),
};

function langWatchReplayRow(metadataOnly = false) {
  const baselineScore = 0.74;
  const candidateScore = metadataOnly ? 0.66 : 0.82;
  return {
    rowId: metadataOnly ? "langwatch-metadata-only-eval-claim" : "langwatch-agent-eval-replay-pack",
    fixture: {
      task: metadataOnly
        ? "Public LangWatch metadata without an AMC-owned replay fixture, trace export, result manifest, or CI receipt."
        : "Replay an AMC-owned LangWatch-style agent evaluation pack with dataset, traces, guardrails, judges, monitors, and CI receipt evidence.",
      inputHash: h("1"),
      expectedHash: h("2"),
      seed: metadataOnly ? 609 : 1609,
      outputArtifactHashes: metadataOnly ? [] : [h("3"), completeLangWatchEvalPack.summaryReportHash],
      runtime: {
        kind: "custom" as const,
        version: "langwatch-eval-replay-fixture-2026.06.20",
        commandHash: h("4"),
        dependencyHash: h("5"),
        sandboxProfile: metadataOnly ? "metadata-only" : "amc-owned-langwatch-eval-replay",
      },
      agentBenchmarkReplay: {
        benchmarkId: "amc-langwatch-eval-replay",
        benchmarkVersion: "2026.06.20",
        paperRefHash: completeLangWatchEvalPack.sourceRefHash,
        repositorySnapshotHash: completeLangWatchEvalPack.docsIndexHash,
        datasetManifestHash: metadataOnly ? undefined : completeLangWatchEvalPack.datasetManifestHash,
        agentConfigHash: metadataOnly ? undefined : completeLangWatchEvalPack.sdkInstallManifestHash,
        globalConfigHash: metadataOnly ? undefined : completeLangWatchEvalPack.evaluatorConfigHash,
        modelServerConfigHash: metadataOnly ? undefined : completeLangWatchEvalPack.judgeRosterHash,
        environmentManifestHash: metadataOnly ? undefined : completeLangWatchEvalPack.executionManifestHash,
        dependencyLockHash: h("5"),
        runCommandHash: h("4"),
        replayCommandHash: metadataOnly ? undefined : completeLangWatchEvalPack.replayCommandHash,
        tracePathHash: metadataOnly ? undefined : completeLangWatchEvalPack.traceExportManifestHash,
        sampleTraceHash: metadataOnly ? undefined : completeLangWatchEvalPack.openTelemetryTraceHash,
        resultManifestHash: metadataOnly ? undefined : completeLangWatchEvalPack.resultManifestHash,
        metricsReportHash: metadataOnly ? undefined : completeLangWatchEvalPack.analysisReportHash,
        architecture: "custom" as const,
        workload: "custom" as const,
        deterministicSeed: metadataOnly ? undefined : 1609,
        sampleCount: metadataOnly ? 1 : 16,
        minSampleCount: 12,
        shuffled: !metadataOnly,
        traceSaved: !metadataOnly,
        baselineMetric0to1: baselineScore,
        candidateMetric0to1: candidateScore,
        replayPassRate0to1: metadataOnly ? 0.45 : 1,
        minReplayPassRate0to1: 0.99,
        traceCoverage0to1: metadataOnly ? 0.1 : 0.97,
        minTraceCoverage0to1: 0.95,
        maxScoreRegression0to1: 0.02,
        llmEvaluationSystemBenchmarkId: "amc-langwatch-eval-replay",
        llmEvaluationSystemSourceRefHash: completeLangWatchEvalPack.sourceRefHash,
        llmEvaluationSystemRepositorySnapshotHash: completeLangWatchEvalPack.docsIndexHash,
        llmEvaluationSystemLicenseRefHash: metadataOnly ? null : completeLangWatchEvalPack.licenseRefHash,
        llmEvaluationSystemPackageVersionRefHash: metadataOnly ? null : completeLangWatchEvalPack.packageVersionRefHash,
        llmEvaluationSystemMcpInstallManifestHash: metadataOnly ? null : completeLangWatchEvalPack.sdkInstallManifestHash,
        llmEvaluationSystemDatasetManifestHash: metadataOnly ? null : completeLangWatchEvalPack.datasetManifestHash,
        llmEvaluationSystemSyntheticQaManifestHash: metadataOnly ? null : completeLangWatchEvalPack.scenarioManifestHash,
        llmEvaluationSystemDocumentGroundingManifestHash: metadataOnly ? null : completeLangWatchEvalPack.traceExportManifestHash,
        llmEvaluationSystemJudgeConfigHash: metadataOnly ? null : completeLangWatchEvalPack.evaluatorConfigHash,
        llmEvaluationSystemJuryRosterHash: metadataOnly ? null : completeLangWatchEvalPack.judgeRosterHash,
        llmEvaluationSystemCriteriaManifestHash: metadataOnly ? null : completeLangWatchEvalPack.guardrailPolicyHash,
        llmEvaluationSystemBinaryScoringPolicyHash: metadataOnly ? null : completeLangWatchEvalPack.deterministicScoringPolicyHash,
        llmEvaluationSystemExecutionManifestHash: metadataOnly ? null : completeLangWatchEvalPack.executionManifestHash,
        llmEvaluationSystemAgentTraceManifestHash: metadataOnly ? null : completeLangWatchEvalPack.traceExportManifestHash,
        llmEvaluationSystemOpenTelemetryTraceHash: metadataOnly ? null : completeLangWatchEvalPack.openTelemetryTraceHash,
        llmEvaluationSystemBedrockAccessBoundaryHash: metadataOnly ? null : completeLangWatchEvalPack.monitorSnapshotHash,
        llmEvaluationSystemResultManifestHash: metadataOnly ? null : completeLangWatchEvalPack.resultManifestHash,
        llmEvaluationSystemAnalysisReportHash: metadataOnly ? null : completeLangWatchEvalPack.analysisReportHash,
        llmEvaluationSystemPdfReportHash: metadataOnly ? null : completeLangWatchEvalPack.summaryReportHash,
        llmEvaluationSystemS3SyncReceiptHash: metadataOnly ? null : completeLangWatchEvalPack.exportReceiptHash,
        llmEvaluationSystemReplayCommandHash: metadataOnly ? null : completeLangWatchEvalPack.replayCommandHash,
        llmEvaluationSystemCiReceiptHash: metadataOnly ? null : completeLangWatchEvalPack.ciReceiptHash,
        llmEvaluationSystemNoConfigOnlyBoundaryHash: metadataOnly ? null : completeLangWatchEvalPack.noConfigOnlyBoundaryHash,
        llmEvaluationSystemModes: metadataOnly
          ? (["custom"] as const)
          : (["dataset_generation", "judge_configuration", "agent_trace", "custom"] as const),
        minLlmEvaluationSystemModeCount: 4,
        llmEvaluationSystemJudgeFamilies: metadataOnly ? (["custom"] as const) : (["openai", "azure", "custom"] as const),
        minLlmEvaluationSystemJudgeFamilyCount: 2,
        llmEvaluationSystemDatasetCount: metadataOnly ? 0 : 2,
        minLlmEvaluationSystemDatasetCount: 2,
        llmEvaluationSystemJudgeCount: metadataOnly ? 1 : 3,
        minLlmEvaluationSystemJudgeCount: 2,
        llmEvaluationSystemCriteriaCount: metadataOnly ? 0 : 5,
        minLlmEvaluationSystemCriteriaCount: 4,
        llmEvaluationSystemEvaluationCaseCount: metadataOnly ? 1 : 16,
        minLlmEvaluationSystemEvaluationCaseCount: 12,
        llmEvaluationSystemDeterministicSeed: metadataOnly ? undefined : 1609,
        llmEvaluationSystemBaselineJuryScore0to1: baselineScore,
        llmEvaluationSystemCandidateJuryScore0to1: candidateScore,
        maxLlmEvaluationSystemJuryScoreRegression0to1: 0.02,
        llmEvaluationSystemBinaryScoringCoverage0to1: metadataOnly ? 0 : 0.96,
        minLlmEvaluationSystemBinaryScoringCoverage0to1: 0.95,
        llmEvaluationSystemJudgeAgreement0to1: metadataOnly ? 0.3 : 0.81,
        minLlmEvaluationSystemJudgeAgreement0to1: 0.75,
        llmEvaluationSystemReplayPassRate0to1: metadataOnly ? 0.45 : 1,
        minLlmEvaluationSystemReplayPassRate0to1: 0.99,
        llmEvaluationSystemReportCoverage0to1: metadataOnly ? 0 : 1,
        minLlmEvaluationSystemReportCoverage0to1: 1,
        llmEvaluationSystemAgentTraceCoverage0to1: metadataOnly ? 0.1 : 0.97,
        minLlmEvaluationSystemAgentTraceCoverage0to1: 0.95,
        llmEvaluationSystemNoSyntheticDataCopyBoundary: !metadataOnly,
        llmEvaluationSystemNoPdfReportOnlyBoundary: !metadataOnly,
      },
      metadata: {
        reviewedSource: "LangWatch public product page and docs index",
        sourceDocsIndex: "https://docs.langwatch.ai/llms.txt",
        noUpstreamPayloadCopied: true,
      },
    },
    baseline: {
      score0to1: baselineScore,
      evidenceRefs: ["trace:langwatch-baseline"],
      signedEvidenceRefs: metadataOnly ? [] : ["ledger:sig-langwatch-baseline"],
    },
    candidate: {
      score0to1: candidateScore,
      evidenceRefs: [metadataOnly ? "trace:langwatch-candidate-regressed" : "trace:langwatch-candidate"],
      signedEvidenceRefs: metadataOnly ? [] : ["ledger:sig-langwatch-candidate"],
    },
    surfaces: ["Score", "Shield", "Watch"] as const,
  };
}

function runLangWatchReplay(metadataOnly = false) {
  return runReplayBenchmarkCorpus({
    agentId: "langwatch-instrumented-agent",
    corpusId: "langwatch-eval-replay-corpus",
    corpusVersion: "2026.06.20",
    baselineRunId: "langwatch-eval-baseline",
    candidateRunId: metadataOnly ? "langwatch-eval-candidate-regressed" : "langwatch-eval-candidate",
    gateMode: metadataOnly ? "lifecycle" : "ci",
    sourceRefs: langWatchSourceRefs,
    thresholds: {
      maxScoreRegression0to1: 0.02,
      minSignedEvidenceRefs: 2,
      maxCandidateAttackSuccessRate0to1: 0.05,
      maxAttackSuccessRateRegression0to1: 0.01,
      minAttackSuccessRateReduction0to1: 0,
      requireAttackSuccessRateForRiskRows: false,
      requireOutputArtifactHashForRuntimeRows: true,
    },
    rows: [langWatchReplayRow(metadataOnly)],
  });
}

describe("LangWatch eval replay corpus source review", () => {
  test("binds LangWatch-style eval packs to replay manifests, fixture hashes, score deltas, signed rows, and CI receipts", () => {
    const result = runLangWatchReplay(false);

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.fixtureHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "langwatch-agent-eval-replay-pack",
      status: "passed",
      baselineScore0to1: 0.74,
      candidateScore0to1: 0.82,
      scoreDelta0to1: 0.08,
      signedEvidenceRefs: ["ledger:sig-langwatch-baseline", "ledger:sig-langwatch-candidate"],
      surfaces: ["Score", "Shield", "Watch"],
    });
    expect(result.manifest.rows[0]?.fixtureHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.manifest.agentBenchmarkReplaySummary).toMatchObject({
      llmEvaluationSystemReplayRowCount: 1,
      failedLlmEvaluationSystemReplayRowIds: [],
      averageLlmEvaluationSystemJuryScoreDelta0to1: 0.08,
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

    const verification = verifyReplayBenchmarkCorpusReceipt(result.manifest, result.ciReceipt);
    expect(verification).toEqual({ valid: true, errors: [] });
  });

  test("fails closed when LangWatch source proof is metadata-only and unsigned", () => {
    const result = runLangWatchReplay(true);

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
      failedRowIds: ["langwatch-metadata-only-eval-claim"],
      failedLlmEvaluationSystemReplayRowIds: ["langwatch-metadata-only-eval-claim"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      source: "replay-benchmark-corpus",
      severity: "critical",
      rowId: "langwatch-metadata-only-eval-claim",
    });
  });
});
