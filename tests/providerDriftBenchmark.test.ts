import { describe, expect, test } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  renderProviderDriftBenchmarkMarkdown,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const baseline: ProviderDriftCanaryRow = {
  provider: "openai",
  model: "gpt-4o-mini",
  version: "2026-06-01",
  canaryId: "support-triage",
  sampleSize: 24,
  scoreMean0to1: 0.88,
  refusalRate0to1: 0.04,
  latencyMsP95: 1200,
  costUsdMean: 0.003,
  evidenceRefs: ["trace:base-1", "bench:dataset-support-v1"],
  signedEvidenceRefs: ["ledger:sig-base-1"],
};

const candidate: ProviderDriftCanaryRow = {
  provider: "openai",
  model: "gpt-4o-mini",
  version: "2026-06-13",
  canaryId: "support-triage",
  sampleSize: 24,
  scoreMean0to1: 0.86,
  refusalRate0to1: 0.05,
  latencyMsP95: 1260,
  costUsdMean: 0.0031,
  evidenceRefs: ["trace:candidate-1", "bench:dataset-support-v1"],
  signedEvidenceRefs: ["ledger:sig-candidate-1"],
};

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const agentDefenseBenchProof = (
  overrides: Partial<ProviderDriftCanaryRow> = {},
): Partial<ProviderDriftCanaryRow> => ({
  agentDefenseBenchSourceRefHash: hash("a"),
  agentDefenseBenchRepositorySnapshotHash: hash("b"),
  agentDefenseBenchLicenseRefHash: hash("c"),
  agentDefenseBenchDefaultBranchHash: hash("d"),
  agentDefenseBenchReadmeHash: hash("e"),
  agentDefenseBenchChecksumsHash: hash("f"),
  agentDefenseBenchCitationHash: hash("1"),
  agentDefenseBenchRequirementsHash: hash("2"),
  agentDefenseBenchMcpServerManifestHash: hash("3"),
  agentDefenseBenchAttackBankHash: hash("4"),
  agentDefenseBenchAcademicBenchmarkHash: hash("5"),
  agentDefenseBenchSafetyBenchmarkHash: hash("6"),
  agentDefenseBenchCybersecurityBenchmarkHash: hash("7"),
  agentDefenseBenchMcpSpecificSuiteHash: hash("8"),
  agentDefenseBenchDefenseServerHash: hash("9"),
  agentDefenseBenchPolicyHash: hash("0"),
  agentDefenseBenchRunConfigHash: hash("a"),
  agentDefenseBenchProviderRouteId: "openai:gpt-4o-mini:agent-defense",
  agentDefenseBenchCanaryResultHash: hash("b"),
  agentDefenseBenchDriftStatisticHash: hash("c"),
  agentDefenseBenchAlertOrWaiverHash: hash("d"),
  agentDefenseBenchReplayCommandHash: hash("e"),
  agentDefenseBenchCiReceiptHash: hash("f"),
  agentDefenseBenchMcpServerCount: 24,
  minAgentDefenseBenchMcpServerCount: 10,
  agentDefenseBenchAttackSuiteIds: ["mcpsecbench", "advbench", "harmbench", "strongreject"],
  minAgentDefenseBenchAttackSuiteIds: 4,
  agentDefenseBenchDefenseCoverage0to1: 0.93,
  minAgentDefenseBenchDefenseCoverage0to1: 0.8,
  agentDefenseBenchPromptInjectionBlockRate0to1: 0.94,
  agentDefenseBenchJailbreakBlockRate0to1: 0.91,
  agentDefenseBenchToolPoisoningBlockRate0to1: 0.9,
  agentDefenseBenchBenignPassRate0to1: 0.96,
  ...overrides,
});

const evidraProof = (
  overrides: Partial<ProviderDriftCanaryRow> = {},
): Partial<ProviderDriftCanaryRow> => ({
  evidraSourceRefHash: hash("a"),
  evidraRepositorySnapshotHash: hash("b"),
  evidraLicenseRefHash: hash("c"),
  evidraDefaultBranchHash: hash("d"),
  evidraReleaseTag: "v0.5.30",
  evidraReadmeHash: hash("e"),
  evidraGoModHash: hash("f"),
  evidraCiWorkflowHash: hash("1"),
  evidraReleaseWorkflowHash: hash("2"),
  evidraDockerfileHash: hash("3"),
  evidraCliTreeHash: hash("4"),
  evidraMcpTreeHash: hash("5"),
  evidraApiCommandHash: hash("6"),
  evidraEvidenceSignerHash: hash("7"),
  evidraEvidencePackageHash: hash("8"),
  evidraEvlockPackageHash: hash("9"),
  evidraExecContractPackageHash: hash("0"),
  evidraExportPackageHash: hash("a"),
  evidraMcpServerPackageHash: hash("b"),
  evidraProxyPackageHash: hash("c"),
  evidraLifecycleServiceHash: hash("d"),
  evidraPipelineBridgeHash: hash("e"),
  evidraScoreCompareHash: hash("f"),
  evidraTestsTreeHash: hash("1"),
  evidraDocsTreeHash: hash("2"),
  evidraSignalValidationGuideHash: hash("3"),
  evidraPrescribeCommandHash: hash("4"),
  evidraReportCommandHash: hash("5"),
  evidraRecordCommandHash: hash("6"),
  evidraValidateCommandHash: hash("7"),
  evidraScorecardCommandHash: hash("8"),
  evidraPrescribeReportProtocolHash: hash("9"),
  evidraProviderRouteId: "openai:gpt-4o-mini:evidra-prescribe-report",
  evidraCanaryResultHash: hash("0"),
  evidraBaselineSampleManifestHash: hash("a"),
  evidraLiveSampleManifestHash: hash("b"),
  evidraDriftStatisticHash: hash("c"),
  evidraAlertOrWaiverHash: hash("d"),
  evidraReplayCommandHash: hash("e"),
  evidraCiReceiptHash: hash("f"),
  evidraNoSourceCopyProofHash: hash("1"),
  evidraSignedEvidenceChainHash: hash("2"),
  ...overrides,
});

const galileoProof = (
  overrides: Partial<ProviderDriftCanaryRow> = {},
): Partial<ProviderDriftCanaryRow> => ({
  galileoSourceRefHash: hash("a"),
  galileoWebsiteSnapshotHash: hash("b"),
  galileoDocsIndexHash: hash("c"),
  galileoProductSurfaceId: "galileo-eval-observability",
  galileoProjectId: "provider-drift-canaries",
  galileoDatasetHash: hash("d"),
  galileoPromptSetHash: hash("e"),
  galileoTraceExportHash: hash("f"),
  galileoMetricReportHash: hash("1"),
  galileoEvaluatorConfigHash: hash("2"),
  galileoProviderRouteId: "openai:gpt-4o-mini:galileo-provider-drift",
  galileoCanaryResultHash: hash("3"),
  galileoDriftStatisticHash: hash("4"),
  galileoAlertOrWaiverHash: hash("5"),
  galileoSignedEvidenceBundleHash: hash("6"),
  galileoNoSourceCopyProofHash: hash("7"),
  galileoMetricIds: ["correctness", "instruction_adherence", "latency", "cost", "guardrail_pass"],
  galileoMetricCount: 5,
  ...overrides,
});

describe("runProviderDriftBenchmark", () => {
  test("approves a provider canary when score, refusal, latency, and cost remain inside thresholds", () => {
    const report = runProviderDriftBenchmark({
      agentId: "support-agent",
      baseline: [baseline],
      candidate: [candidate],
    });

    expect(report.agentId).toBe("support-agent");
    expect(report.providerVersions).toEqual(["openai/gpt-4o-mini@2026-06-01", "openai/gpt-4o-mini@2026-06-13"]);
    expect(report.recommendation).toBe("approve");
    expect(report.alerts).toEqual([]);
    expect(report.comparisons[0]?.driftStatistic).toBeGreaterThan(0);
    expect(report.comparisons[0]?.evidenceRefs).toContain("trace:base-1");
    expect(report.comparisons[0]?.evidenceRefs).toContain("trace:candidate-1");
  });

  test("alerts when score drops and refusal, latency, and cost distributions shift", () => {
    const report = runProviderDriftBenchmark({
      agentId: "support-agent",
      baseline: [baseline],
      candidate: [{
        ...candidate,
        scoreMean0to1: 0.65,
        refusalRate0to1: 0.22,
        latencyMsP95: 2100,
        costUsdMean: 0.006,
      }],
      thresholds: {
        maxScoreDrop0to1: 0.08,
        maxRefusalRateIncrease0to1: 0.08,
        maxLatencyIncreaseRatio: 0.25,
        maxCostIncreaseRatio: 0.35,
      },
    });

    expect(report.recommendation).toBe("alert");
    expect(report.failClosed).toBe(true);
    expect(report.alerts.map((alert) => alert.metricId)).toEqual([
      "scoreMean0to1",
      "refusalRate0to1",
      "latencyMsP95",
      "costUsdMean",
    ]);
    expect(report.comparisons[0]?.scoreDelta0to1).toBeCloseTo(-0.23);
    expect(report.comparisons[0]?.refusalRateDelta0to1).toBeCloseTo(0.18);
    expect(report.comparisons[0]?.latencyDeltaRatio).toBeCloseTo(0.75);
    expect(report.comparisons[0]?.costDeltaRatio).toBeCloseTo(1);
  });

  test("fails closed when arena trajectory error attribution regresses despite stable score", () => {
    const arenaBaseline: ProviderDriftCanaryRow = {
      ...baseline,
      canaryId: "multi-agent-arena",
      arenaId: "social-strategy-arena",
      environmentId: "hidden-information-round",
      referencePoolId: "frozen-reference-pool-v1",
      trajectoryCount: 48,
      invalidActionRate0to1: 0.02,
      errorAttributionRate0to1: 0.03,
    };
    const arenaCandidate: ProviderDriftCanaryRow = {
      ...candidate,
      canaryId: "multi-agent-arena",
      scoreMean0to1: arenaBaseline.scoreMean0to1,
      arenaId: "social-strategy-arena",
      environmentId: "hidden-information-round",
      referencePoolId: "frozen-reference-pool-v1",
      trajectoryCount: 48,
      invalidActionRate0to1: 0.11,
      errorAttributionRate0to1: 0.12,
    };

    const report = runProviderDriftBenchmark({
      agentId: "strategy-agent",
      baseline: [arenaBaseline],
      candidate: [arenaCandidate],
      thresholds: {
        minTrajectoryCount: 20,
        maxInvalidActionRateIncrease0to1: 0.04,
        maxErrorAttributionRateIncrease0to1: 0.04,
      },
    });

    expect(report.recommendation).toBe("alert");
    expect(report.failClosed).toBe(true);
    expect(report.comparisons[0]).toMatchObject({
      baselineArenaId: "social-strategy-arena",
      candidateArenaId: "social-strategy-arena",
      baselineEnvironmentId: "hidden-information-round",
      candidateEnvironmentId: "hidden-information-round",
      baselineReferencePoolId: "frozen-reference-pool-v1",
      candidateReferencePoolId: "frozen-reference-pool-v1",
      baselineTrajectoryCount: 48,
      candidateTrajectoryCount: 48,
      scoreDelta0to1: 0,
      invalidActionRateDelta0to1: 0.09,
      errorAttributionRateDelta0to1: 0.09,
    });
    expect(report.alerts.map((alert) => alert.metricId)).toEqual([
      "invalidActionRate0to1",
      "errorAttributionRate0to1",
    ]);

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-arena-v1",
      datasetHash: "b".repeat(64),
      sourceRefs: ["https://arxiv.org/abs/2605.29512"],
    });
    expect(pack.rows[0]).toMatchObject({
      baselineArenaId: "social-strategy-arena",
      candidateArenaId: "social-strategy-arena",
      baselineReferencePoolId: "frozen-reference-pool-v1",
      candidateReferencePoolId: "frozen-reference-pool-v1",
    });
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("fails closed when specification canary evaluator reliability regresses despite stable score", () => {
    const specBaseline: ProviderDriftCanaryRow = {
      ...baseline,
      canaryId: "spec-reasoning",
      benchmarkFamily: "specification-review",
      capabilityId: "ambiguity-and-omission-detection",
      scoreMean0to1: 0.74,
      judgeAgreement0to1: 0.92,
      unjudgedPredictionRate0to1: 0.03,
    };
    const specCandidate: ProviderDriftCanaryRow = {
      ...candidate,
      canaryId: "spec-reasoning",
      benchmarkFamily: "specification-review",
      capabilityId: "ambiguity-and-omission-detection",
      scoreMean0to1: 0.74,
      judgeAgreement0to1: 0.78,
      unjudgedPredictionRate0to1: 0.18,
    };

    const report = runProviderDriftBenchmark({
      agentId: "swe-agent",
      baseline: [specBaseline],
      candidate: [specCandidate],
      thresholds: {
        maxJudgeAgreementDrop0to1: 0.05,
        maxUnjudgedPredictionRateIncrease0to1: 0.1,
      },
    });

    expect(report.recommendation).toBe("alert");
    expect(report.failClosed).toBe(true);
    expect(report.comparisons[0]).toMatchObject({
      baselineBenchmarkFamily: "specification-review",
      candidateBenchmarkFamily: "specification-review",
      baselineCapabilityId: "ambiguity-and-omission-detection",
      candidateCapabilityId: "ambiguity-and-omission-detection",
      scoreDelta0to1: 0,
      judgeAgreementDelta0to1: -0.14,
      unjudgedPredictionRateDelta0to1: 0.15,
    });
    expect(report.alerts.map((alert) => alert.metricId)).toEqual([
      "judgeAgreement0to1",
      "unjudgedPredictionRate0to1",
    ]);

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-spec-v1",
      datasetHash: "c".repeat(64),
      sourceRefs: ["https://arxiv.org/abs/2605.30314"],
    });
    expect(pack.rows[0]).toMatchObject({
      baselineBenchmarkFamily: "specification-review",
      candidateBenchmarkFamily: "specification-review",
      baselineCapabilityId: "ambiguity-and-omission-detection",
      candidateCapabilityId: "ambiguity-and-omission-detection",
    });
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("fails closed when evaluator-suite guardrail and retry coverage regress despite stable score", () => {
    const evaluatorBaseline: ProviderDriftCanaryRow = {
      ...baseline,
      canaryId: "langevals-standard-evaluator-suite",
      benchmarkFamily: "standard-llm-evaluator-suite",
      capabilityId: "batch-pytest-live-guardrail-evaluation",
      scoreMean0to1: 0.81,
      evaluatorCoverage0to1: 0.92,
      guardrailPassRate0to1: 0.89,
      scoreThresholdPassRate0to1: 0.86,
      retryStability0to1: 0.9,
      evidenceRefs: [
        "eval:evaluator-suite-baseline",
        "pytest:pass-rate-thresholds-v1",
        "guardrail:baseline-results-v1",
        "retry:flaky-stability-v1",
      ],
      signedEvidenceRefs: ["ledger:langevals-baseline"],
    };
    const evaluatorCandidate: ProviderDriftCanaryRow = {
      ...candidate,
      canaryId: "langevals-standard-evaluator-suite",
      benchmarkFamily: "standard-llm-evaluator-suite",
      capabilityId: "batch-pytest-live-guardrail-evaluation",
      scoreMean0to1: 0.81,
      evaluatorCoverage0to1: 0.68,
      guardrailPassRate0to1: 0.69,
      scoreThresholdPassRate0to1: 0.62,
      retryStability0to1: 0.71,
      evidenceRefs: [
        "eval:evaluator-suite-candidate",
        "pytest:pass-rate-thresholds-v1",
        "guardrail:candidate-results-v1",
        "retry:flaky-stability-v2",
      ],
      signedEvidenceRefs: ["ledger:langevals-candidate"],
    };

    const report = runProviderDriftBenchmark({
      agentId: "llm-eval-agent",
      baseline: [evaluatorBaseline],
      candidate: [evaluatorCandidate],
      thresholds: {
        maxEvaluatorCoverageDrop0to1: 0.1,
        maxGuardrailPassRateDrop0to1: 0.08,
        maxScoreThresholdPassRateDrop0to1: 0.08,
        maxRetryStabilityDrop0to1: 0.08,
      },
    });

    expect(report.recommendation).toBe("alert");
    expect(report.failClosed).toBe(true);
    expect(report.comparisons[0]).toMatchObject({
      baselineBenchmarkFamily: "standard-llm-evaluator-suite",
      candidateBenchmarkFamily: "standard-llm-evaluator-suite",
      baselineCapabilityId: "batch-pytest-live-guardrail-evaluation",
      candidateCapabilityId: "batch-pytest-live-guardrail-evaluation",
      scoreDelta0to1: 0,
      evaluatorCoverageDelta0to1: -0.24,
      guardrailPassRateDelta0to1: -0.2,
      scoreThresholdPassRateDelta0to1: -0.24,
      retryStabilityDelta0to1: -0.19,
    });
    expect(report.alerts.map((alert) => alert.metricId)).toEqual([
      "evaluatorCoverage0to1",
      "guardrailPassRate0to1",
      "scoreThresholdPassRate0to1",
      "retryStability0to1",
    ]);

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-langevals-suite-v1",
      datasetHash: "8".repeat(64),
      sourceRefs: ["https://github.com/langwatch/langevals", "https://github.com/langwatch/langwatch/tree/main/langevals"],
    });
    expect(pack.rows[0]).toMatchObject({
      evaluatorCoverageDelta0to1: -0.24,
      guardrailPassRateDelta0to1: -0.2,
      scoreThresholdPassRateDelta0to1: -0.24,
      retryStabilityDelta0to1: -0.19,
    });
    expect(pack.replayable).toBe(true);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);

    const watchAlerts = buildProviderDriftWatchAlerts(report);
    expect(watchAlerts.map((alert) => alert.metricId)).toEqual([
      "evaluatorCoverage0to1",
      "guardrailPassRate0to1",
      "scoreThresholdPassRate0to1",
      "retryStability0to1",
    ]);

    const markdown = renderProviderDriftBenchmarkMarkdown(report);
    expect(markdown).toContain("Evaluator Coverage Delta");
    expect(markdown).toContain("Guardrail Pass Delta");
    expect(markdown).toContain("Retry Stability Delta");
  });

  test("binds Eval-ai-library-style provider, metric-suite, generated-test-data, verdict aggregation, and dashboard proof", () => {
    const evalLibraryBaseline: ProviderDriftCanaryRow = {
      ...baseline,
      canaryId: "eval-ai-library-rag-agent-suite",
      benchmarkFamily: "rag-agent-evaluation-framework",
      capabilityId: "multi-provider-rag-agent-metrics",
      evaluationFrameworkId: "eval-ai-library",
      evaluationFrameworkVersion: "0.9.0",
      providerRouteId: "openai:gpt-4o-mini:baseline",
      metricSuiteId: "rag-agent-35-metric-suite",
      metricIds: ["answer_relevancy", "faithfulness", "context_precision", "tool_success"],
      metricCount: 35,
      evaluatorConfigHash: hash("a"),
      generatedTestDataHash: hash("b"),
      verdictAggregation: "temperature_controlled_power_mean",
      verdictAggregationConfigHash: hash("c"),
      verdictTemperature: 0.7,
      verdictPowerMeanP: 2,
      dashboardArtifactHash: hash("d"),
      evidenceRefs: [
        "eval-ai:framework-baseline",
        "eval-ai:generated-test-data-v1",
        "eval-ai:dashboard-baseline",
      ],
      signedEvidenceRefs: ["ledger:eval-ai-baseline"],
    };
    const evalLibraryCandidate: ProviderDriftCanaryRow = {
      ...candidate,
      canaryId: "eval-ai-library-rag-agent-suite",
      benchmarkFamily: "rag-agent-evaluation-framework",
      capabilityId: "multi-provider-rag-agent-metrics",
      evaluationFrameworkId: "eval-ai-library",
      evaluationFrameworkVersion: "0.9.1",
      providerRouteId: "openai:gpt-4o-mini:candidate",
      metricSuiteId: "rag-agent-35-metric-suite",
      metricIds: ["answer_relevancy", "faithfulness", "context_precision", "tool_success"],
      metricCount: 35,
      evaluatorConfigHash: hash("e"),
      generatedTestDataHash: hash("f"),
      verdictAggregation: "temperature_controlled_power_mean",
      verdictAggregationConfigHash: hash("1"),
      verdictTemperature: 0.7,
      verdictPowerMeanP: 2,
      dashboardArtifactHash: hash("2"),
      evidenceRefs: [
        "eval-ai:framework-candidate",
        "eval-ai:generated-test-data-v1",
        "eval-ai:dashboard-candidate",
      ],
      signedEvidenceRefs: ["ledger:eval-ai-candidate"],
    };

    const report = runProviderDriftBenchmark({
      agentId: "rag-agent",
      baseline: [evalLibraryBaseline],
      candidate: [evalLibraryCandidate],
      thresholds: {
        minEvaluationMetricCount: 15,
      },
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(report.alerts).toEqual([]);
    expect(report.comparisons[0]).toMatchObject({
      baselineEvaluationFrameworkId: "eval-ai-library",
      candidateEvaluationFrameworkId: "eval-ai-library",
      baselineEvaluationFrameworkVersion: "0.9.0",
      candidateEvaluationFrameworkVersion: "0.9.1",
      baselineMetricSuiteId: "rag-agent-35-metric-suite",
      candidateMetricSuiteId: "rag-agent-35-metric-suite",
      baselineMetricCount: 35,
      candidateMetricCount: 35,
      baselineVerdictAggregation: "temperature_controlled_power_mean",
      candidateVerdictAggregation: "temperature_controlled_power_mean",
      evaluationFrameworkMissingReasons: [],
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-eval-ai-library-v1",
      datasetHash: "9".repeat(64),
      sourceRefs: ["https://github.com/meshkovQA/Eval-ai-library"],
    });
    expect(pack.replayable).toBe(true);
    expect(pack.sourceRefs).toContain("https://github.com/meshkovQA/Eval-ai-library");
    expect(pack.rows[0]).toMatchObject({
      baselineEvaluationFrameworkId: "eval-ai-library",
      candidateEvaluationFrameworkId: "eval-ai-library",
      baselineMetricIds: ["answer_relevancy", "faithfulness", "context_precision", "tool_success"],
      candidateMetricIds: ["answer_relevancy", "faithfulness", "context_precision", "tool_success"],
      baselineDashboardArtifactHash: hash("d"),
      candidateDashboardArtifactHash: hash("2"),
    });
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);

    const markdown = renderProviderDriftBenchmarkMarkdown(report);
    expect(markdown).toContain("Evaluation Framework Proof");
    expect(markdown).toContain("eval-ai-library");
    expect(markdown).toContain("temperature_controlled_power_mean");
  });

  test("binds Falcon Evaluate source, metric-family, and canary-result proof into provider drift eval packs", () => {
    const falconBaseline: ProviderDriftCanaryRow = {
      ...baseline,
      canaryId: "falcon-evaluate-provider-drift",
      benchmarkFamily: "agent-evaluation-provider-drift",
      capabilityId: "provider-model-regression-canary",
      evaluationFrameworkId: "falcon-evaluate",
      evaluationFrameworkVersion: "v0.1.13.0",
      providerRouteId: "openai:gpt-4o-mini:baseline",
      metricSuiteId: "falcon-evaluate-provider-drift-lite",
      metricIds: ["context_relevancy", "fairness", "reliability", "security", "machine_ethics"],
      metricCount: 5,
      evaluatorConfigHash: hash("a"),
      generatedTestDataHash: hash("b"),
      verdictAggregation: "mean",
      verdictAggregationConfigHash: hash("c"),
      dashboardArtifactHash: hash("d"),
      falconEvaluateSourceRefHash: hash("e"),
      falconEvaluateRepositorySnapshotHash: hash("f"),
      falconEvaluateLicenseRefHash: hash("1"),
      falconEvaluateDefaultBranchHash: hash("2"),
      falconEvaluateReleaseTag: "v0.1.13.0",
      falconEvaluatePackageManifestHash: hash("3"),
      falconEvaluateLockfileHash: hash("4"),
      falconEvaluateRequirementsHash: hash("5"),
      falconEvaluateReadmeHash: hash("6"),
      falconEvaluateDocsIndexHash: hash("7"),
      falconEvaluateWorkflowHash: hash("8"),
      falconEvaluateEvaluationModuleHash: hash("9"),
      falconEvaluateContextRelevancyModuleHash: hash("a"),
      falconEvaluateFairnessModuleHash: hash("b"),
      falconEvaluateReliabilityModuleHash: hash("c"),
      falconEvaluateSecurityModuleHash: hash("d"),
      falconEvaluateMachineEthicsModuleHash: hash("e"),
      falconEvaluateResultsModuleHash: hash("f"),
      falconEvaluatePlotModuleHash: hash("1"),
      falconEvaluateUserAnalyticsModuleHash: hash("2"),
      falconEvaluateValidationDataSchemaHash: hash("3"),
      falconEvaluateMetricFamilyIds: ["context", "fairness", "reliability", "security", "ethics"],
      falconEvaluateMetricIds: ["context_relevancy", "fairness", "reliability", "security", "machine_ethics"],
      falconEvaluateMetricCount: 5,
      falconEvaluateProviderRouteId: "openai:gpt-4o-mini:baseline",
      falconEvaluateCanaryResultHash: hash("4"),
      evidenceRefs: [
        "github:Praveengovianalytics/falcon-evaluate@6c6d56a",
        "release:falcon-evaluate:v0.1.13.0",
        "eval-pack:falcon-provider-drift-baseline",
      ],
      signedEvidenceRefs: ["ledger:falcon-evaluate-baseline"],
    };
    const falconCandidate: ProviderDriftCanaryRow = {
      ...candidate,
      canaryId: "falcon-evaluate-provider-drift",
      benchmarkFamily: "agent-evaluation-provider-drift",
      capabilityId: "provider-model-regression-canary",
      evaluationFrameworkId: "falcon-evaluate",
      evaluationFrameworkVersion: "v0.1.13.0",
      providerRouteId: "openai:gpt-4o-mini:candidate",
      metricSuiteId: "falcon-evaluate-provider-drift-lite",
      metricIds: ["context_relevancy", "fairness", "reliability", "security", "machine_ethics"],
      metricCount: 5,
      evaluatorConfigHash: hash("5"),
      generatedTestDataHash: hash("6"),
      verdictAggregation: "mean",
      verdictAggregationConfigHash: hash("7"),
      dashboardArtifactHash: hash("8"),
      falconEvaluateSourceRefHash: hash("e"),
      falconEvaluateRepositorySnapshotHash: hash("0"),
      falconEvaluateLicenseRefHash: hash("1"),
      falconEvaluateDefaultBranchHash: hash("2"),
      falconEvaluateReleaseTag: "v0.1.13.0",
      falconEvaluatePackageManifestHash: hash("3"),
      falconEvaluateLockfileHash: hash("4"),
      falconEvaluateRequirementsHash: hash("5"),
      falconEvaluateReadmeHash: hash("6"),
      falconEvaluateDocsIndexHash: hash("7"),
      falconEvaluateWorkflowHash: hash("8"),
      falconEvaluateEvaluationModuleHash: hash("9"),
      falconEvaluateContextRelevancyModuleHash: hash("a"),
      falconEvaluateFairnessModuleHash: hash("b"),
      falconEvaluateReliabilityModuleHash: hash("c"),
      falconEvaluateSecurityModuleHash: hash("d"),
      falconEvaluateMachineEthicsModuleHash: hash("e"),
      falconEvaluateResultsModuleHash: hash("f"),
      falconEvaluatePlotModuleHash: hash("1"),
      falconEvaluateUserAnalyticsModuleHash: hash("2"),
      falconEvaluateValidationDataSchemaHash: hash("9"),
      falconEvaluateMetricFamilyIds: ["context", "fairness", "reliability", "security", "ethics"],
      falconEvaluateMetricIds: ["context_relevancy", "fairness", "reliability", "security", "machine_ethics"],
      falconEvaluateMetricCount: 5,
      falconEvaluateProviderRouteId: "openai:gpt-4o-mini:candidate",
      falconEvaluateCanaryResultHash: hash("0"),
      evidenceRefs: [
        "github:Praveengovianalytics/falcon-evaluate@6c6d56a",
        "release:falcon-evaluate:v0.1.13.0",
        "eval-pack:falcon-provider-drift-candidate",
      ],
      signedEvidenceRefs: ["ledger:falcon-evaluate-candidate"],
    };

    const report = runProviderDriftBenchmark({
      agentId: "provider-drift-agent",
      baseline: [falconBaseline],
      candidate: [falconCandidate],
      thresholds: {
        minEvaluationMetricCount: 5,
      },
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(report.alerts).toEqual([]);
    expect(report.comparisons[0]).toMatchObject({
      baselineFalconEvaluateReleaseTag: "v0.1.13.0",
      candidateFalconEvaluateReleaseTag: "v0.1.13.0",
      baselineFalconEvaluateMetricCount: 5,
      candidateFalconEvaluateMetricCount: 5,
      falconEvaluateMissingReasons: [],
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-falcon-evaluate-v1",
      datasetHash: "a".repeat(64),
      sourceRefs: ["https://github.com/Praveengovianalytics/falcon-evaluate"],
    });
    expect(pack.replayable).toBe(true);
    expect(pack.sourceRefs).toContain("https://github.com/Praveengovianalytics/falcon-evaluate");
    expect(pack.rows[0]).toMatchObject({
      baselineFalconEvaluateSourceRefHash: hash("e"),
      candidateFalconEvaluateRepositorySnapshotHash: hash("0"),
      baselineFalconEvaluateMetricFamilyIds: ["context", "fairness", "reliability", "security", "ethics"],
      candidateFalconEvaluateMetricIds: ["context_relevancy", "fairness", "reliability", "security", "machine_ethics"],
      candidateFalconEvaluateCanaryResultHash: hash("0"),
    });
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);

    const markdown = renderProviderDriftBenchmarkMarkdown(report);
    expect(markdown).toContain("Falcon Evaluate Proof");
    expect(markdown).toContain("v0.1.13.0");
    expect(markdown).toContain("context+fairness+reliability+security+ethics");
  });

  test("binds Opik-style observability, pipeline, datastore, dataset, trace, and metric-report proof", () => {
    const footballBaseline: ProviderDriftCanaryRow = {
      ...baseline,
      canaryId: "football-content-observability",
      benchmarkFamily: "football-content-evaluation-observability",
      capabilityId: "summary-and-qa-evaluation",
      evaluationFrameworkId: "opik",
      evaluationFrameworkVersion: "1.0.0",
      providerRouteId: "openai:gpt-4o-mini:baseline",
      metricSuiteId: "football-content-summary-qa-suite",
      metricIds: ["bertscore", "cosine_similarity", "answer_relevancy", "hallucination"],
      metricCount: 4,
      evaluatorConfigHash: hash("a"),
      generatedTestDataHash: hash("b"),
      verdictAggregation: "mean",
      verdictAggregationConfigHash: hash("c"),
      dashboardArtifactHash: hash("d"),
      pipelineOrchestratorId: "zenml",
      pipelineRunId: "zenml-run-baseline",
      experimentTrackerId: "opik",
      experimentRunId: "opik-football-baseline",
      observabilityProjectId: "football-teams-eval",
      datastoreId: "mongodb-football-content",
      retrievalIndexHash: hash("e"),
      contentDatasetHash: hash("f"),
      summaryArtifactHash: hash("1"),
      qaDatasetHash: hash("2"),
      traceExportHash: hash("3"),
      metricReportHash: hash("4"),
      pipelineConfigHash: hash("5"),
      evidenceRefs: [
        "pipeline:football-content-baseline",
        "opik:trace-export-baseline",
        "mongodb:football-content-index-v1",
      ],
      signedEvidenceRefs: ["ledger:football-content-baseline"],
    };
    const footballCandidate: ProviderDriftCanaryRow = {
      ...candidate,
      canaryId: "football-content-observability",
      benchmarkFamily: "football-content-evaluation-observability",
      capabilityId: "summary-and-qa-evaluation",
      evaluationFrameworkId: "opik",
      evaluationFrameworkVersion: "1.0.1",
      providerRouteId: "openai:gpt-4o-mini:candidate",
      metricSuiteId: "football-content-summary-qa-suite",
      metricIds: ["bertscore", "cosine_similarity", "answer_relevancy", "hallucination"],
      metricCount: 4,
      evaluatorConfigHash: hash("6"),
      generatedTestDataHash: hash("7"),
      verdictAggregation: "mean",
      verdictAggregationConfigHash: hash("8"),
      dashboardArtifactHash: hash("9"),
      pipelineOrchestratorId: "zenml",
      pipelineRunId: "zenml-run-candidate",
      experimentTrackerId: "opik",
      experimentRunId: "opik-football-candidate",
      observabilityProjectId: "football-teams-eval",
      datastoreId: "mongodb-football-content",
      retrievalIndexHash: hash("0"),
      contentDatasetHash: hash("a"),
      summaryArtifactHash: hash("b"),
      qaDatasetHash: hash("c"),
      traceExportHash: hash("d"),
      metricReportHash: hash("e"),
      pipelineConfigHash: hash("f"),
      evidenceRefs: [
        "pipeline:football-content-candidate",
        "opik:trace-export-candidate",
        "mongodb:football-content-index-v1",
      ],
      signedEvidenceRefs: ["ledger:football-content-candidate"],
    };

    const report = runProviderDriftBenchmark({
      agentId: "football-content-agent",
      baseline: [footballBaseline],
      candidate: [footballCandidate],
      thresholds: {
        minEvaluationMetricCount: 4,
      },
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(report.alerts).toEqual([]);
    expect(report.comparisons[0]).toMatchObject({
      baselineEvaluationFrameworkId: "opik",
      candidateEvaluationFrameworkId: "opik",
      baselinePipelineOrchestratorId: "zenml",
      candidatePipelineOrchestratorId: "zenml",
      baselineExperimentTrackerId: "opik",
      candidateExperimentTrackerId: "opik",
      baselineDatastoreId: "mongodb-football-content",
      candidateDatastoreId: "mongodb-football-content",
      observabilityPipelineMissingReasons: [],
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-football-content-observability-v1",
      datasetHash: "4".repeat(64),
      sourceRefs: ["https://github.com/benitomartin/llm-observability-opik"],
    });
    expect(pack.replayable).toBe(true);
    expect(pack.sourceRefs).toContain("https://github.com/benitomartin/llm-observability-opik");
    expect(pack.rows[0]).toMatchObject({
      baselinePipelineOrchestratorId: "zenml",
      candidatePipelineOrchestratorId: "zenml",
      baselineExperimentTrackerId: "opik",
      candidateExperimentTrackerId: "opik",
      baselineMetricReportHash: hash("4"),
      candidateMetricReportHash: hash("e"),
    });
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);

    const markdown = renderProviderDriftBenchmarkMarkdown(report);
    expect(markdown).toContain("Observability Pipeline Proof");
    expect(markdown).toContain("zenml");
    expect(markdown).toContain("opik");
  });

  test("binds SparkOrbit-style source, leaderboard, reload, and summary proof", () => {
    const orbitBaseline: ProviderDriftCanaryRow = {
      ...baseline,
      canaryId: "ai-orbit-monitor-drift",
      benchmarkFamily: "ai-dashboard-source-and-leaderboard-monitoring",
      capabilityId: "daily-provider-model-benchmark-feed-drift",
      sampleSize: 42,
      scoreMean0to1: 0.84,
      refusalRate0to1: 0.05,
      latencyMsP95: 1400,
      costUsdMean: 0.004,
      orbitMonitorSourceRefHash: hash("a"),
      orbitMonitorRepositorySnapshotHash: hash("b"),
      orbitMonitorLicenseRefHash: hash("c"),
      orbitMonitorSourceCatalogHash: hash("d"),
      orbitMonitorLeaderboardSnapshotHash: hash("e"),
      orbitMonitorModelRegistrySnapshotHash: hash("f"),
      orbitMonitorBenchmarkFeedSnapshotHash: hash("1"),
      orbitMonitorNewsFeedSnapshotHash: hash("2"),
      orbitMonitorReloadRunHash: hash("3"),
      orbitMonitorRankingPolicyHash: hash("4"),
      orbitMonitorSummaryArtifactHash: hash("5"),
      orbitMonitorSourceCount: 42,
      minOrbitMonitorSourceCount: 40,
      orbitMonitorLeaderboardCategoryCount: 6,
      minOrbitMonitorLeaderboardCategoryCount: 6,
      orbitMonitorDailyReloadVerified: true,
      evidenceRefs: [
        "orbit:source-catalog-baseline",
        "orbit:leaderboard-snapshot-baseline",
        "orbit:daily-reload-baseline",
      ],
      signedEvidenceRefs: ["ledger:orbit-baseline"],
    };
    const orbitCandidate: ProviderDriftCanaryRow = {
      ...candidate,
      canaryId: "ai-orbit-monitor-drift",
      benchmarkFamily: "ai-dashboard-source-and-leaderboard-monitoring",
      capabilityId: "daily-provider-model-benchmark-feed-drift",
      sampleSize: 43,
      scoreMean0to1: 0.83,
      refusalRate0to1: 0.05,
      latencyMsP95: 1430,
      costUsdMean: 0.0041,
      orbitMonitorSourceRefHash: hash("6"),
      orbitMonitorRepositorySnapshotHash: hash("7"),
      orbitMonitorLicenseRefHash: hash("8"),
      orbitMonitorSourceCatalogHash: hash("9"),
      orbitMonitorLeaderboardSnapshotHash: hash("0"),
      orbitMonitorModelRegistrySnapshotHash: hash("a"),
      orbitMonitorBenchmarkFeedSnapshotHash: hash("b"),
      orbitMonitorNewsFeedSnapshotHash: hash("c"),
      orbitMonitorReloadRunHash: hash("d"),
      orbitMonitorRankingPolicyHash: hash("e"),
      orbitMonitorSummaryArtifactHash: hash("f"),
      orbitMonitorSourceCount: 43,
      minOrbitMonitorSourceCount: 40,
      orbitMonitorLeaderboardCategoryCount: 6,
      minOrbitMonitorLeaderboardCategoryCount: 6,
      orbitMonitorDailyReloadVerified: true,
      evidenceRefs: [
        "orbit:source-catalog-candidate",
        "orbit:leaderboard-snapshot-candidate",
        "orbit:daily-reload-candidate",
      ],
      signedEvidenceRefs: ["ledger:orbit-candidate"],
    };

    const report = runProviderDriftBenchmark({
      agentId: "ai-orbit-agent",
      baseline: [orbitBaseline],
      candidate: [orbitCandidate],
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(report.alerts).toEqual([]);
    expect(report.comparisons[0]).toMatchObject({
      baselineBenchmarkFamily: "ai-dashboard-source-and-leaderboard-monitoring",
      candidateBenchmarkFamily: "ai-dashboard-source-and-leaderboard-monitoring",
      baselineOrbitMonitorSourceCount: 42,
      candidateOrbitMonitorSourceCount: 43,
      baselineOrbitMonitorLeaderboardCategoryCount: 6,
      candidateOrbitMonitorLeaderboardCategoryCount: 6,
      baselineOrbitMonitorDailyReloadVerified: true,
      candidateOrbitMonitorDailyReloadVerified: true,
      orbitMonitorMissingReasons: [],
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-ai-orbit-monitor-v1",
      datasetHash: "5".repeat(64),
      sourceRefs: ["https://github.com/sparkorbit/sparkorbit"],
    });
    expect(pack.replayable).toBe(true);
    expect(pack.sourceRefs).toContain("https://github.com/sparkorbit/sparkorbit");
    expect(pack.rows[0]).toMatchObject({
      baselineOrbitMonitorSourceCatalogHash: hash("d"),
      candidateOrbitMonitorSourceCatalogHash: hash("9"),
      baselineOrbitMonitorLeaderboardSnapshotHash: hash("e"),
      candidateOrbitMonitorLeaderboardSnapshotHash: hash("0"),
      baselineOrbitMonitorSourceCount: 42,
      candidateOrbitMonitorSourceCount: 43,
      baselineOrbitMonitorDailyReloadVerified: true,
      candidateOrbitMonitorDailyReloadVerified: true,
    });
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);

    const markdown = renderProviderDriftBenchmarkMarkdown(report);
    expect(markdown).toContain("Orbit Monitor Proof");
    expect(markdown).toContain("ai-orbit-monitor-drift");
    expect(markdown).toContain("42/43");
  });

  test("fails closed when SparkOrbit-style source and leaderboard monitor proof is incomplete", () => {
    const completeOrbitBaseline: ProviderDriftCanaryRow = {
      ...baseline,
      canaryId: "ai-orbit-monitor-incomplete",
      benchmarkFamily: "ai-dashboard-source-and-leaderboard-monitoring",
      capabilityId: "daily-provider-model-benchmark-feed-drift",
      sampleSize: 42,
      scoreMean0to1: 0.84,
      refusalRate0to1: 0.05,
      latencyMsP95: 1400,
      costUsdMean: 0.004,
      orbitMonitorSourceRefHash: hash("a"),
      orbitMonitorRepositorySnapshotHash: hash("b"),
      orbitMonitorLicenseRefHash: hash("c"),
      orbitMonitorSourceCatalogHash: hash("d"),
      orbitMonitorLeaderboardSnapshotHash: hash("e"),
      orbitMonitorModelRegistrySnapshotHash: hash("f"),
      orbitMonitorBenchmarkFeedSnapshotHash: hash("1"),
      orbitMonitorNewsFeedSnapshotHash: hash("2"),
      orbitMonitorReloadRunHash: hash("3"),
      orbitMonitorRankingPolicyHash: hash("4"),
      orbitMonitorSummaryArtifactHash: hash("5"),
      orbitMonitorSourceCount: 42,
      minOrbitMonitorSourceCount: 40,
      orbitMonitorLeaderboardCategoryCount: 6,
      minOrbitMonitorLeaderboardCategoryCount: 6,
      orbitMonitorDailyReloadVerified: true,
      evidenceRefs: ["orbit:baseline-complete", "orbit:leaderboard-baseline"],
      signedEvidenceRefs: ["ledger:orbit-incomplete-baseline"],
    };
    const incompleteOrbitCandidate: ProviderDriftCanaryRow = {
      ...candidate,
      canaryId: "ai-orbit-monitor-incomplete",
      benchmarkFamily: "ai-dashboard-source-and-leaderboard-monitoring",
      capabilityId: "daily-provider-model-benchmark-feed-drift",
      sampleSize: 42,
      scoreMean0to1: completeOrbitBaseline.scoreMean0to1,
      refusalRate0to1: completeOrbitBaseline.refusalRate0to1,
      latencyMsP95: completeOrbitBaseline.latencyMsP95,
      costUsdMean: completeOrbitBaseline.costUsdMean,
      orbitMonitorSourceRefHash: hash("6"),
      orbitMonitorRepositorySnapshotHash: hash("7"),
      orbitMonitorLeaderboardSnapshotHash: "not-a-hash",
      orbitMonitorSourceCatalogHash: hash("8"),
      orbitMonitorSourceCount: 12,
      minOrbitMonitorSourceCount: 40,
      orbitMonitorLeaderboardCategoryCount: 2,
      minOrbitMonitorLeaderboardCategoryCount: 6,
      orbitMonitorDailyReloadVerified: false,
      evidenceRefs: ["orbit:candidate-incomplete", "orbit:leaderboard-candidate"],
      signedEvidenceRefs: ["ledger:orbit-incomplete-candidate"],
    };

    const report = runProviderDriftBenchmark({
      agentId: "ai-orbit-agent",
      baseline: [completeOrbitBaseline],
      candidate: [incompleteOrbitCandidate],
    });

    expect(report.recommendation).toBe("alert");
    expect(report.failClosed).toBe(true);
    expect(report.alerts.map((alert) => alert.metricId)).toEqual(["orbitMonitorEvidence"]);
    expect(report.alerts[0]?.severity).toBe("critical");
    expect(report.alerts[0]?.message).toContain("candidate:orbitMonitorLicenseRefHash");
    expect(report.alerts[0]?.message).toContain("candidate:orbitMonitorLeaderboardSnapshotHash");
    expect(report.alerts[0]?.message).toContain("candidate:orbitMonitorModelRegistrySnapshotHash");
    expect(report.alerts[0]?.message).toContain("candidate:orbitMonitorReloadRunHash");
    expect(report.alerts[0]?.message).toContain("candidate:orbitMonitorSourceCount");
    expect(report.alerts[0]?.message).toContain("candidate:orbitMonitorDailyReloadVerified");
    expect(report.comparisons[0]?.scoreDelta0to1).toBe(0);
    expect(report.comparisons[0]?.costDeltaRatio).toBe(0);

    const watchAlerts = buildProviderDriftWatchAlerts(report);
    expect(watchAlerts.map((alert) => alert.metricId)).toEqual(["orbitMonitorEvidence"]);

    const gate = buildProviderDriftCiGate(report, { mode: "lifecycle" });
    expect(gate.failClosed).toBe(true);
    expect(gate.failedAlertIds).toEqual([
      "pdrift:openai:gpt-4o-mini:ai-orbit-monitor-incomplete:orbitMonitorEvidence",
    ]);
  });

  test("binds GeoBenchX-style geospatial tool-calling task, dataset, trace, judge, and token-cost proof", () => {
    const geoBaseline: ProviderDriftCanaryRow = {
      ...baseline,
      canaryId: "geospatial-tool-calling-canary",
      benchmarkFamily: "geospatial-tool-calling",
      capabilityId: "multi-step-geospatial-analysis",
      sampleSize: 40,
      trajectoryCount: 40,
      scoreMean0to1: 0.78,
      refusalRate0to1: 0.08,
      invalidActionRate0to1: 0.04,
      judgeAgreement0to1: 0.92,
      expectedToolCallCoverage0to1: 0.86,
      geospatialBenchmarkId: "geospatial-tool-calling-v1",
      geospatialTaskSetHash: hash("a"),
      geospatialDatasetSnapshotHash: hash("b"),
      geospatialToolRegistryHash: hash("c"),
      geospatialReferenceSolutionHash: hash("d"),
      geospatialTraceExportHash: hash("e"),
      geospatialJudgePanelId: "judge-panel-geospatial-v1",
      geospatialJudgeConfigHash: hash("f"),
      geospatialHumanCalibrationHash: hash("1"),
      geospatialResultReportHash: hash("2"),
      geospatialTokenCostReportHash: hash("3"),
      geospatialTaskComplexityGroups: ["single-step", "multi-step", "spatial-analysis", "unsolvable-rejection"],
      geospatialSolvableTaskCount: 32,
      geospatialUnsolvableTaskCount: 8,
      geospatialToolCount: 23,
      geospatialMaxToolIterations: 25,
      evidenceRefs: [
        "geo:benchmark-manifest-baseline",
        "geo:dataset-snapshot-v1",
        "geo:tool-traces-baseline",
        "geo:judge-calibration-v1",
      ],
      signedEvidenceRefs: ["ledger:geo-baseline"],
    };
    const geoCandidate: ProviderDriftCanaryRow = {
      ...candidate,
      canaryId: "geospatial-tool-calling-canary",
      benchmarkFamily: "geospatial-tool-calling",
      capabilityId: "multi-step-geospatial-analysis",
      sampleSize: 40,
      trajectoryCount: 40,
      scoreMean0to1: 0.77,
      refusalRate0to1: 0.08,
      invalidActionRate0to1: 0.05,
      judgeAgreement0to1: 0.91,
      expectedToolCallCoverage0to1: 0.85,
      geospatialBenchmarkId: "geospatial-tool-calling-v1",
      geospatialTaskSetHash: hash("4"),
      geospatialDatasetSnapshotHash: hash("5"),
      geospatialToolRegistryHash: hash("6"),
      geospatialReferenceSolutionHash: hash("7"),
      geospatialTraceExportHash: hash("8"),
      geospatialJudgePanelId: "judge-panel-geospatial-v1",
      geospatialJudgeConfigHash: hash("9"),
      geospatialHumanCalibrationHash: hash("0"),
      geospatialResultReportHash: hash("a"),
      geospatialTokenCostReportHash: hash("b"),
      geospatialTaskComplexityGroups: ["single-step", "multi-step", "spatial-analysis", "unsolvable-rejection"],
      geospatialSolvableTaskCount: 32,
      geospatialUnsolvableTaskCount: 8,
      geospatialToolCount: 23,
      geospatialMaxToolIterations: 25,
      evidenceRefs: [
        "geo:benchmark-manifest-candidate",
        "geo:dataset-snapshot-v1",
        "geo:tool-traces-candidate",
        "geo:token-cost-report-candidate",
      ],
      signedEvidenceRefs: ["ledger:geo-candidate"],
    };

    const report = runProviderDriftBenchmark({
      agentId: "geospatial-agent",
      baseline: [geoBaseline],
      candidate: [geoCandidate],
      thresholds: {
        minTrajectoryCount: 20,
        minGeospatialTaskComplexityGroups: 4,
        minGeospatialSolvableTaskCount: 20,
        minGeospatialUnsolvableTaskCount: 5,
        minGeospatialToolCount: 20,
        minGeospatialMaxToolIterations: 10,
      },
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(report.alerts).toEqual([]);
    expect(report.comparisons[0]).toMatchObject({
      baselineGeospatialBenchmarkId: "geospatial-tool-calling-v1",
      candidateGeospatialBenchmarkId: "geospatial-tool-calling-v1",
      baselineGeospatialJudgePanelId: "judge-panel-geospatial-v1",
      candidateGeospatialJudgePanelId: "judge-panel-geospatial-v1",
      baselineGeospatialToolCount: 23,
      candidateGeospatialToolCount: 23,
      geospatialToolCallingMissingReasons: [],
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-geospatial-tool-calling-v1",
      datasetHash: "7".repeat(64),
      sourceRefs: ["https://github.com/Solirinai/GeoBenchX", "https://arxiv.org/abs/2503.18129"],
    });
    expect(pack.replayable).toBe(true);
    expect(pack.sourceRefs).toContain("https://github.com/Solirinai/GeoBenchX");
    expect(pack.rows[0]).toMatchObject({
      baselineGeospatialTaskSetHash: hash("a"),
      candidateGeospatialTaskSetHash: hash("4"),
      baselineGeospatialTaskComplexityGroups: ["single-step", "multi-step", "spatial-analysis", "unsolvable-rejection"],
      candidateGeospatialTaskComplexityGroups: ["single-step", "multi-step", "spatial-analysis", "unsolvable-rejection"],
      baselineGeospatialTokenCostReportHash: hash("3"),
      candidateGeospatialTokenCostReportHash: hash("b"),
    });
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);

    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);

    const markdown = renderProviderDriftBenchmarkMarkdown(report);
    expect(markdown).toContain("Geospatial Tool-Calling Proof");
    expect(markdown).toContain("geospatial-tool-calling-v1");
    expect(markdown).toContain("judge-panel-geospatial-v1");
  });

  test("fails closed when GeoBenchX-style geospatial proof is incomplete despite stable drift metrics", () => {
    const completeGeoBaseline: ProviderDriftCanaryRow = {
      ...baseline,
      canaryId: "geospatial-tool-calling-incomplete",
      benchmarkFamily: "geospatial-tool-calling",
      capabilityId: "multi-step-geospatial-analysis",
      sampleSize: 40,
      trajectoryCount: 40,
      scoreMean0to1: 0.78,
      refusalRate0to1: 0.08,
      latencyMsP95: 1500,
      costUsdMean: 0.012,
      geospatialBenchmarkId: "geospatial-tool-calling-v1",
      geospatialTaskSetHash: hash("a"),
      geospatialDatasetSnapshotHash: hash("b"),
      geospatialToolRegistryHash: hash("c"),
      geospatialReferenceSolutionHash: hash("d"),
      geospatialTraceExportHash: hash("e"),
      geospatialJudgePanelId: "judge-panel-geospatial-v1",
      geospatialJudgeConfigHash: hash("f"),
      geospatialHumanCalibrationHash: hash("1"),
      geospatialResultReportHash: hash("2"),
      geospatialTokenCostReportHash: hash("3"),
      geospatialTaskComplexityGroups: ["single-step", "multi-step", "spatial-analysis", "unsolvable-rejection"],
      geospatialSolvableTaskCount: 32,
      geospatialUnsolvableTaskCount: 8,
      geospatialToolCount: 23,
      geospatialMaxToolIterations: 25,
      evidenceRefs: ["geo:baseline-complete", "geo:dataset-snapshot-v1"],
      signedEvidenceRefs: ["ledger:geo-incomplete-baseline"],
    };
    const incompleteGeoCandidate: ProviderDriftCanaryRow = {
      ...candidate,
      canaryId: "geospatial-tool-calling-incomplete",
      benchmarkFamily: "geospatial-tool-calling",
      capabilityId: "multi-step-geospatial-analysis",
      sampleSize: 40,
      trajectoryCount: 40,
      scoreMean0to1: completeGeoBaseline.scoreMean0to1,
      refusalRate0to1: completeGeoBaseline.refusalRate0to1,
      latencyMsP95: completeGeoBaseline.latencyMsP95,
      costUsdMean: completeGeoBaseline.costUsdMean,
      geospatialBenchmarkId: "geospatial-tool-calling-v1",
      geospatialTaskSetHash: hash("4"),
      geospatialToolRegistryHash: hash("5"),
      geospatialTraceExportHash: "not-a-hash",
      geospatialTaskComplexityGroups: ["single-step"],
      geospatialSolvableTaskCount: 10,
      geospatialUnsolvableTaskCount: 0,
      geospatialToolCount: 2,
      geospatialMaxToolIterations: 5,
      evidenceRefs: ["geo:candidate-incomplete", "geo:tool-trace-candidate"],
      signedEvidenceRefs: ["ledger:geo-incomplete-candidate"],
    };

    const report = runProviderDriftBenchmark({
      agentId: "geospatial-agent",
      baseline: [completeGeoBaseline],
      candidate: [incompleteGeoCandidate],
      thresholds: {
        minTrajectoryCount: 20,
        minGeospatialTaskComplexityGroups: 4,
        minGeospatialSolvableTaskCount: 20,
        minGeospatialUnsolvableTaskCount: 5,
        minGeospatialToolCount: 20,
        minGeospatialMaxToolIterations: 10,
      },
    });

    expect(report.recommendation).toBe("alert");
    expect(report.failClosed).toBe(true);
    expect(report.alerts.map((alert) => alert.metricId)).toEqual(["geospatialToolCallingEvidence"]);
    expect(report.alerts[0]?.severity).toBe("critical");
    expect(report.alerts[0]?.message).toContain("candidate:geospatialDatasetSnapshotHash");
    expect(report.alerts[0]?.message).toContain("candidate:geospatialTraceExportHash");
    expect(report.alerts[0]?.message).toContain("candidate:geospatialHumanCalibrationHash");
    expect(report.alerts[0]?.message).toContain("candidate:geospatialTokenCostReportHash");
    expect(report.alerts[0]?.message).toContain("candidate:geospatialUnsolvableTaskCount");
    expect(report.comparisons[0]?.scoreDelta0to1).toBe(0);
    expect(report.comparisons[0]?.costDeltaRatio).toBe(0);

    const watchAlerts = buildProviderDriftWatchAlerts(report);
    expect(watchAlerts.map((alert) => alert.metricId)).toEqual(["geospatialToolCallingEvidence"]);

    const gate = buildProviderDriftCiGate(report, { mode: "lifecycle" });
    expect(gate.failClosed).toBe(true);
    expect(gate.failedAlertIds).toEqual([
      "pdrift:openai:gpt-4o-mini:geospatial-tool-calling-incomplete:geospatialToolCallingEvidence",
    ]);

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-geospatial-tool-calling-incomplete-v1",
      datasetHash: "8".repeat(64),
      sourceRefs: ["https://github.com/Solirinai/GeoBenchX"],
    });
    expect(pack.replayable).toBe(true);
    expect(pack.rows[0]?.geospatialToolCallingMissingReasons).toContain("candidate:geospatialDatasetSnapshotHash");
    expect(pack.rows[0]?.geospatialToolCallingMissingReasons).toContain("candidate:geospatialToolCount");
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);

    const markdown = renderProviderDriftBenchmarkMarkdown(report);
    expect(markdown).toContain("Geospatial Tool-Calling Proof");
    expect(markdown).toContain("candidate:geospatialTokenCostReportHash");
  });

  test("binds AgentDefense-Bench MCP security proof into provider drift eval packs", () => {
    const defenseBaseline: ProviderDriftCanaryRow = {
      ...baseline,
      canaryId: "agent-defense-mcp-canary",
      benchmarkFamily: "mcp-agent-security",
      capabilityId: "infrastructure-layer-defense",
      sampleSize: 32,
      trajectoryCount: 32,
      scoreMean0to1: 0.82,
      refusalRate0to1: 0.06,
      invalidActionRate0to1: 0.03,
      ...agentDefenseBenchProof({
        agentDefenseBenchProviderRouteId: "openai:gpt-4o-mini:agent-defense-baseline",
        agentDefenseBenchMcpServerCount: 24,
        agentDefenseBenchDefenseCoverage0to1: 0.93,
        agentDefenseBenchPromptInjectionBlockRate0to1: 0.94,
        agentDefenseBenchJailbreakBlockRate0to1: 0.91,
        agentDefenseBenchToolPoisoningBlockRate0to1: 0.9,
        agentDefenseBenchBenignPassRate0to1: 0.96,
      }),
      evidenceRefs: [
        "github:arunsanna/AgentDefense-Bench@b5dfdf3",
        "agent-defense:attack-bank-baseline",
        "agent-defense:mcp-server-manifest-baseline",
      ],
      signedEvidenceRefs: ["ledger:agent-defense-baseline"],
    };
    const defenseCandidate: ProviderDriftCanaryRow = {
      ...candidate,
      canaryId: "agent-defense-mcp-canary",
      benchmarkFamily: "mcp-agent-security",
      capabilityId: "infrastructure-layer-defense",
      sampleSize: 32,
      trajectoryCount: 32,
      scoreMean0to1: 0.81,
      refusalRate0to1: 0.06,
      invalidActionRate0to1: 0.04,
      ...agentDefenseBenchProof({
        agentDefenseBenchSourceRefHash: hash("2"),
        agentDefenseBenchRepositorySnapshotHash: hash("3"),
        agentDefenseBenchProviderRouteId: "openai:gpt-4o-mini:agent-defense-candidate",
        agentDefenseBenchCanaryResultHash: hash("4"),
        agentDefenseBenchDriftStatisticHash: hash("5"),
        agentDefenseBenchAlertOrWaiverHash: hash("6"),
        agentDefenseBenchReplayCommandHash: hash("7"),
        agentDefenseBenchCiReceiptHash: hash("8"),
        agentDefenseBenchDefenseCoverage0to1: 0.92,
        agentDefenseBenchPromptInjectionBlockRate0to1: 0.92,
        agentDefenseBenchJailbreakBlockRate0to1: 0.9,
        agentDefenseBenchToolPoisoningBlockRate0to1: 0.89,
        agentDefenseBenchBenignPassRate0to1: 0.95,
      }),
      evidenceRefs: [
        "github:arunsanna/AgentDefense-Bench@b5dfdf3",
        "agent-defense:attack-bank-candidate",
        "agent-defense:mcp-server-manifest-candidate",
      ],
      signedEvidenceRefs: ["ledger:agent-defense-candidate"],
    };

    const report = runProviderDriftBenchmark({
      agentId: "mcp-security-agent",
      baseline: [defenseBaseline],
      candidate: [defenseCandidate],
      thresholds: {
        minTrajectoryCount: 20,
        minAgentDefenseBenchMcpServerCount: 10,
        minAgentDefenseBenchAttackSuiteIds: 4,
        minAgentDefenseBenchDefenseCoverage0to1: 0.8,
      },
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(report.alerts).toEqual([]);
    expect(report.comparisons[0]).toMatchObject({
      baselineAgentDefenseBenchMcpServerCount: 24,
      candidateAgentDefenseBenchMcpServerCount: 24,
      baselineAgentDefenseBenchAttackSuiteIds: ["mcpsecbench", "advbench", "harmbench", "strongreject"],
      candidateAgentDefenseBenchAttackSuiteIds: ["mcpsecbench", "advbench", "harmbench", "strongreject"],
      agentDefenseBenchDefenseCoverageDelta0to1: -0.01,
      agentDefenseBenchPromptInjectionBlockRateDelta0to1: -0.02,
      agentDefenseBenchMissingReasons: [],
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-agent-defense-bench-v1",
      datasetHash: "9".repeat(64),
      sourceRefs: ["https://github.com/arunsanna/AgentDefense-Bench"],
    });
    expect(pack.replayable).toBe(true);
    expect(pack.sourceRefs).toContain("https://github.com/arunsanna/AgentDefense-Bench");
    expect(pack.rows[0]).toMatchObject({
      baselineAgentDefenseBenchSourceRefHash: hash("a"),
      candidateAgentDefenseBenchSourceRefHash: hash("2"),
      baselineAgentDefenseBenchMcpServerManifestHash: hash("3"),
      candidateAgentDefenseBenchMcpServerManifestHash: hash("3"),
      candidateAgentDefenseBenchProviderRouteId: "openai:gpt-4o-mini:agent-defense-candidate",
      candidateAgentDefenseBenchPromptInjectionBlockRate0to1: 0.92,
      agentDefenseBenchPromptInjectionBlockRateDelta0to1: -0.02,
    });
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report).passed).toBe(true);

    const markdown = renderProviderDriftBenchmarkMarkdown(report);
    expect(markdown).toContain("AgentDefense-Bench Proof");
    expect(markdown).toContain("agent-defense-mcp-canary");
    expect(markdown).toContain("mcpsecbench+advbench+harmbench+strongreject");
  });

  test("fails closed when AgentDefense-Bench security regression thresholds are exceeded", () => {
    const defenseBaseline: ProviderDriftCanaryRow = {
      ...baseline,
      canaryId: "agent-defense-mcp-regression",
      benchmarkFamily: "mcp-agent-security",
      capabilityId: "infrastructure-layer-defense",
      sampleSize: 32,
      trajectoryCount: 32,
      scoreMean0to1: 0.82,
      refusalRate0to1: 0.06,
      ...agentDefenseBenchProof(),
      evidenceRefs: ["agent-defense:baseline-complete", "agent-defense:security-metrics-baseline"],
      signedEvidenceRefs: ["ledger:agent-defense-regression-baseline"],
    };
    const defenseCandidate: ProviderDriftCanaryRow = {
      ...candidate,
      canaryId: "agent-defense-mcp-regression",
      benchmarkFamily: "mcp-agent-security",
      capabilityId: "infrastructure-layer-defense",
      sampleSize: 32,
      trajectoryCount: 32,
      scoreMean0to1: defenseBaseline.scoreMean0to1,
      refusalRate0to1: defenseBaseline.refusalRate0to1,
      latencyMsP95: defenseBaseline.latencyMsP95,
      costUsdMean: defenseBaseline.costUsdMean,
      ...agentDefenseBenchProof({
        agentDefenseBenchProviderRouteId: "openai:gpt-4o-mini:agent-defense-candidate",
        agentDefenseBenchDefenseCoverage0to1: 0.74,
        minAgentDefenseBenchDefenseCoverage0to1: 0.7,
        agentDefenseBenchPromptInjectionBlockRate0to1: 0.77,
        agentDefenseBenchJailbreakBlockRate0to1: 0.72,
        agentDefenseBenchToolPoisoningBlockRate0to1: 0.7,
        agentDefenseBenchBenignPassRate0to1: 0.79,
      }),
      evidenceRefs: ["agent-defense:candidate-complete", "agent-defense:security-metrics-candidate"],
      signedEvidenceRefs: ["ledger:agent-defense-regression-candidate"],
    };

    const report = runProviderDriftBenchmark({
      agentId: "mcp-security-agent",
      baseline: [defenseBaseline],
      candidate: [defenseCandidate],
      thresholds: {
        minAgentDefenseBenchDefenseCoverage0to1: 0.7,
        maxAgentDefenseBenchDefenseCoverageDrop0to1: 0.08,
        maxAgentDefenseBenchPromptInjectionBlockRateDrop0to1: 0.08,
        maxAgentDefenseBenchJailbreakBlockRateDrop0to1: 0.08,
        maxAgentDefenseBenchToolPoisoningBlockRateDrop0to1: 0.08,
        maxAgentDefenseBenchBenignPassRateDrop0to1: 0.08,
      },
    });

    expect(report.recommendation).toBe("alert");
    expect(report.failClosed).toBe(true);
    expect(report.alerts.map((alert) => alert.metricId)).toEqual([
      "agentDefenseBenchDefenseCoverage0to1",
      "agentDefenseBenchPromptInjectionBlockRate0to1",
      "agentDefenseBenchJailbreakBlockRate0to1",
      "agentDefenseBenchToolPoisoningBlockRate0to1",
      "agentDefenseBenchBenignPassRate0to1",
    ]);
    expect(report.comparisons[0]).toMatchObject({
      agentDefenseBenchDefenseCoverageDelta0to1: -0.19,
      agentDefenseBenchPromptInjectionBlockRateDelta0to1: -0.17,
      agentDefenseBenchJailbreakBlockRateDelta0to1: -0.19,
      agentDefenseBenchToolPoisoningBlockRateDelta0to1: -0.2,
      agentDefenseBenchBenignPassRateDelta0to1: -0.17,
      agentDefenseBenchMissingReasons: [],
    });

    const watchAlerts = buildProviderDriftWatchAlerts(report);
    expect(watchAlerts.map((alert) => alert.metricId)).toEqual([
      "agentDefenseBenchDefenseCoverage0to1",
      "agentDefenseBenchPromptInjectionBlockRate0to1",
      "agentDefenseBenchJailbreakBlockRate0to1",
      "agentDefenseBenchToolPoisoningBlockRate0to1",
      "agentDefenseBenchBenignPassRate0to1",
    ]);

    const gate = buildProviderDriftCiGate(report, { mode: "ci" });
    expect(gate.failClosed).toBe(true);
    expect(gate.failedAlertIds).toContain(
      "pdrift:openai:gpt-4o-mini:agent-defense-mcp-regression:agentDefenseBenchPromptInjectionBlockRate0to1",
    );

    const markdown = renderProviderDriftBenchmarkMarkdown(report);
    expect(markdown).toContain("AgentDefense-Bench Proof");
    expect(markdown).toContain("AgentDefense-Bench prompt-injection block-rate drop");
  });

  test("fails closed when AgentDefense-Bench source, MCP, or alert proof is incomplete", () => {
    const completeDefenseBaseline: ProviderDriftCanaryRow = {
      ...baseline,
      canaryId: "agent-defense-mcp-incomplete",
      benchmarkFamily: "mcp-agent-security",
      capabilityId: "infrastructure-layer-defense",
      sampleSize: 32,
      trajectoryCount: 32,
      scoreMean0to1: 0.82,
      refusalRate0to1: 0.06,
      latencyMsP95: 1500,
      costUsdMean: 0.012,
      ...agentDefenseBenchProof(),
      evidenceRefs: ["agent-defense:baseline-complete", "agent-defense:mcp-manifest-baseline"],
      signedEvidenceRefs: ["ledger:agent-defense-incomplete-baseline"],
    };
    const incompleteDefenseCandidate: ProviderDriftCanaryRow = {
      ...candidate,
      canaryId: "agent-defense-mcp-incomplete",
      benchmarkFamily: "mcp-agent-security",
      capabilityId: "infrastructure-layer-defense",
      sampleSize: 32,
      trajectoryCount: 32,
      scoreMean0to1: completeDefenseBaseline.scoreMean0to1,
      refusalRate0to1: completeDefenseBaseline.refusalRate0to1,
      latencyMsP95: completeDefenseBaseline.latencyMsP95,
      costUsdMean: completeDefenseBaseline.costUsdMean,
      ...agentDefenseBenchProof({
        agentDefenseBenchLicenseRefHash: undefined,
        agentDefenseBenchChecksumsHash: "not-a-hash",
        agentDefenseBenchAttackBankHash: undefined,
        agentDefenseBenchMcpSpecificSuiteHash: undefined,
        agentDefenseBenchAlertOrWaiverHash: undefined,
        agentDefenseBenchMcpServerCount: 1,
        agentDefenseBenchAttackSuiteIds: ["mcpsecbench"],
      }),
      evidenceRefs: ["agent-defense:candidate-incomplete", "agent-defense:mcp-manifest-candidate"],
      signedEvidenceRefs: ["ledger:agent-defense-incomplete-candidate"],
    };

    const report = runProviderDriftBenchmark({
      agentId: "mcp-security-agent",
      baseline: [completeDefenseBaseline],
      candidate: [incompleteDefenseCandidate],
      thresholds: {
        minAgentDefenseBenchMcpServerCount: 10,
        minAgentDefenseBenchAttackSuiteIds: 4,
      },
    });

    expect(report.recommendation).toBe("alert");
    expect(report.failClosed).toBe(true);
    expect(report.alerts.map((alert) => alert.metricId)).toEqual(["agentDefenseBenchEvidence"]);
    expect(report.alerts[0]?.severity).toBe("critical");
    expect(report.alerts[0]?.message).toContain("candidate:agentDefenseBenchLicenseRefHash");
    expect(report.alerts[0]?.message).toContain("candidate:agentDefenseBenchChecksumsHash");
    expect(report.alerts[0]?.message).toContain("candidate:agentDefenseBenchAttackBankHash");
    expect(report.alerts[0]?.message).toContain("candidate:agentDefenseBenchMcpSpecificSuiteHash");
    expect(report.alerts[0]?.message).toContain("candidate:agentDefenseBenchAlertOrWaiverHash");
    expect(report.alerts[0]?.message).toContain("candidate:agentDefenseBenchMcpServerCount");
    expect(report.alerts[0]?.message).toContain("candidate:agentDefenseBenchAttackSuiteIds");
    expect(report.comparisons[0]?.scoreDelta0to1).toBe(0);
    expect(report.comparisons[0]?.costDeltaRatio).toBe(0);

    const watchAlerts = buildProviderDriftWatchAlerts(report);
    expect(watchAlerts.map((alert) => alert.metricId)).toEqual(["agentDefenseBenchEvidence"]);

    const gate = buildProviderDriftCiGate(report, { mode: "lifecycle" });
    expect(gate.failClosed).toBe(true);
    expect(gate.failedAlertIds).toEqual([
      "pdrift:openai:gpt-4o-mini:agent-defense-mcp-incomplete:agentDefenseBenchEvidence",
    ]);

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-agent-defense-bench-incomplete-v1",
      datasetHash: "a".repeat(64),
      sourceRefs: ["https://github.com/arunsanna/AgentDefense-Bench"],
    });
    expect(pack.replayable).toBe(true);
    expect(pack.rows[0]?.agentDefenseBenchMissingReasons).toContain("candidate:agentDefenseBenchLicenseRefHash");
    expect(pack.rows[0]?.agentDefenseBenchMissingReasons).toContain("candidate:agentDefenseBenchAttackSuiteIds");
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);

    const markdown = renderProviderDriftBenchmarkMarkdown(report);
    expect(markdown).toContain("AgentDefense-Bench Proof");
    expect(markdown).toContain("candidate:agentDefenseBenchAlertOrWaiverHash");
  });

  test("binds Evidra evidence-chain proof into provider drift eval packs and watch surfaces", () => {
    const evidraBaseline: ProviderDriftCanaryRow = {
      ...baseline,
      canaryId: "evidra-prescribe-report-canary",
      benchmarkFamily: "llmops-provider-drift",
      capabilityId: "signed-prescribe-report-evidence-chain",
      sampleSize: 20,
      trajectoryCount: 20,
      scoreMean0to1: 0.87,
      refusalRate0to1: 0.03,
      protocolSuccessRate0to1: 0.96,
      latencyMsP95: 1180,
      costUsdMean: 0.0032,
      ...evidraProof({
        evidraProviderRouteId: "openai:gpt-4o-mini:evidra-baseline",
        evidraCanaryResultHash: hash("3"),
      }),
      evidenceRefs: [
        "github:vitas/evidra@b70af706ba2a75c7e37175db0358aaab09778014",
        "release:evidra:v0.5.30",
        "evidra:evidence-chain-baseline",
      ],
      signedEvidenceRefs: ["ledger:evidra-baseline"],
    };
    const evidraCandidate: ProviderDriftCanaryRow = {
      ...candidate,
      canaryId: "evidra-prescribe-report-canary",
      benchmarkFamily: "llmops-provider-drift",
      capabilityId: "signed-prescribe-report-evidence-chain",
      sampleSize: 20,
      trajectoryCount: 20,
      scoreMean0to1: 0.86,
      refusalRate0to1: 0.04,
      protocolSuccessRate0to1: 0.95,
      latencyMsP95: 1210,
      costUsdMean: 0.0033,
      ...evidraProof({
        evidraProviderRouteId: "openai:gpt-4o-mini:evidra-candidate",
        evidraCanaryResultHash: hash("4"),
        evidraLiveSampleManifestHash: hash("5"),
      }),
      evidenceRefs: [
        "github:vitas/evidra@b70af706ba2a75c7e37175db0358aaab09778014",
        "release:evidra:v0.5.30",
        "evidra:evidence-chain-candidate",
      ],
      signedEvidenceRefs: ["ledger:evidra-candidate"],
    };

    const report = runProviderDriftBenchmark({
      agentId: "devops-agent",
      baseline: [evidraBaseline],
      candidate: [evidraCandidate],
      thresholds: {
        minTrajectoryCount: 10,
        maxProtocolSuccessRateDrop0to1: 0.04,
      },
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(report.alerts).toEqual([]);
    expect(report.comparisons[0]).toMatchObject({
      baselineEvidraReleaseTag: "v0.5.30",
      candidateEvidraReleaseTag: "v0.5.30",
      baselineEvidraProviderRouteId: "openai:gpt-4o-mini:evidra-baseline",
      candidateEvidraProviderRouteId: "openai:gpt-4o-mini:evidra-candidate",
      evidraMissingReasons: [],
      protocolSuccessRateDelta0to1: -0.01,
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-evidra-v1",
      datasetHash: "6".repeat(64),
      sourceRefs: ["https://github.com/vitas/evidra"],
    });
    expect(pack.replayable).toBe(true);
    expect(pack.sourceRefs).toContain("https://github.com/vitas/evidra");
    expect(pack.rows[0]).toMatchObject({
      baselineEvidraSourceRefHash: hash("a"),
      candidateEvidraCanaryResultHash: hash("4"),
      candidateEvidraLiveSampleManifestHash: hash("5"),
      evidraMissingReasons: [],
    });
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);

    const markdown = renderProviderDriftBenchmarkMarkdown(report);
    expect(markdown).toContain("Evidra Evidence Chain Proof");
    expect(markdown).toContain("v0.5.30");
    expect(markdown).toContain("evidra-prescribe-report-canary");
  });

  test("binds Galileo eval-observability proof into provider drift eval packs and watch surfaces", () => {
    const galileoBaseline: ProviderDriftCanaryRow = {
      ...baseline,
      canaryId: "galileo-provider-drift-canary",
      benchmarkFamily: "llmops-provider-drift",
      capabilityId: "eval-observability-canary",
      sampleSize: 32,
      trajectoryCount: 32,
      scoreMean0to1: 0.9,
      refusalRate0to1: 0.03,
      evaluatorCoverage0to1: 0.94,
      guardrailPassRate0to1: 0.96,
      scoreThresholdPassRate0to1: 0.92,
      latencyMsP95: 1100,
      costUsdMean: 0.003,
      ...galileoProof({
        galileoProviderRouteId: "openai:gpt-4o-mini:galileo-baseline",
        galileoCanaryResultHash: hash("8"),
      }),
      evidenceRefs: [
        "source-signal:galileo.ai:eval-observability",
        "galileo:canary-baseline",
      ],
      signedEvidenceRefs: ["ledger:galileo-baseline"],
    };
    const galileoCandidate: ProviderDriftCanaryRow = {
      ...candidate,
      canaryId: "galileo-provider-drift-canary",
      benchmarkFamily: "llmops-provider-drift",
      capabilityId: "eval-observability-canary",
      sampleSize: 32,
      trajectoryCount: 32,
      scoreMean0to1: 0.89,
      refusalRate0to1: 0.04,
      evaluatorCoverage0to1: 0.93,
      guardrailPassRate0to1: 0.95,
      scoreThresholdPassRate0to1: 0.91,
      latencyMsP95: 1130,
      costUsdMean: 0.0031,
      ...galileoProof({
        galileoProviderRouteId: "openai:gpt-4o-mini:galileo-candidate",
        galileoCanaryResultHash: hash("9"),
        galileoDriftStatisticHash: hash("0"),
      }),
      evidenceRefs: [
        "source-signal:galileo.ai:eval-observability",
        "galileo:canary-candidate",
      ],
      signedEvidenceRefs: ["ledger:galileo-candidate"],
    };

    const report = runProviderDriftBenchmark({
      agentId: "llmops-agent",
      baseline: [galileoBaseline],
      candidate: [galileoCandidate],
      thresholds: {
        minTrajectoryCount: 16,
        minEvaluationMetricCount: 5,
      },
    });

    expect(report.providerVersions).toContain("openai/gpt-4o-mini@2026-06-01");
    expect(report.providerVersions).toContain("openai/gpt-4o-mini@2026-06-13");
    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(report.alerts).toEqual([]);
    expect(report.comparisons[0]).toMatchObject({
      baselineGalileoProductSurfaceId: "galileo-eval-observability",
      candidateGalileoProductSurfaceId: "galileo-eval-observability",
      baselineGalileoProviderRouteId: "openai:gpt-4o-mini:galileo-baseline",
      candidateGalileoProviderRouteId: "openai:gpt-4o-mini:galileo-candidate",
      baselineGalileoMetricCount: 5,
      candidateGalileoMetricCount: 5,
      galileoMissingReasons: [],
      scoreDelta0to1: -0.01,
      guardrailPassRateDelta0to1: -0.01,
    });
    expect(report.comparisons[0]?.driftStatistic).toBeGreaterThan(0);

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-galileo-v1",
      datasetHash: "8".repeat(64),
      sourceRefs: ["https://www.galileo.ai"],
    });
    expect(pack.replayable).toBe(true);
    expect(pack.rows[0]).toMatchObject({
      baselineGalileoSourceRefHash: hash("a"),
      candidateGalileoCanaryResultHash: hash("9"),
      candidateGalileoDriftStatisticHash: hash("0"),
      galileoMissingReasons: [],
      signedEvidenceRefs: ["ledger:galileo-baseline", "ledger:galileo-candidate"],
    });
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);

    const markdown = renderProviderDriftBenchmarkMarkdown(report);
    expect(markdown).toContain("Galileo Observability Proof");
    expect(markdown).toContain("galileo-provider-drift-canary");
  });

  test("fails closed when Galileo observability proof is incomplete despite stable drift metrics", () => {
    const completeBaseline: ProviderDriftCanaryRow = {
      ...baseline,
      canaryId: "galileo-incomplete-proof",
      benchmarkFamily: "llmops-provider-drift",
      capabilityId: "eval-observability-canary",
      sampleSize: 24,
      trajectoryCount: 24,
      scoreMean0to1: 0.88,
      refusalRate0to1: 0.03,
      evaluatorCoverage0to1: 0.93,
      guardrailPassRate0to1: 0.95,
      scoreThresholdPassRate0to1: 0.91,
      latencyMsP95: 1160,
      costUsdMean: 0.0032,
      ...galileoProof(),
      evidenceRefs: ["source-signal:galileo.ai:eval-observability", "galileo:complete-baseline"],
      signedEvidenceRefs: ["ledger:galileo-complete-baseline"],
    };
    const incompleteCandidate: ProviderDriftCanaryRow = {
      ...candidate,
      canaryId: "galileo-incomplete-proof",
      benchmarkFamily: "llmops-provider-drift",
      capabilityId: "eval-observability-canary",
      sampleSize: completeBaseline.sampleSize,
      trajectoryCount: completeBaseline.trajectoryCount,
      scoreMean0to1: completeBaseline.scoreMean0to1,
      refusalRate0to1: completeBaseline.refusalRate0to1,
      evaluatorCoverage0to1: completeBaseline.evaluatorCoverage0to1,
      guardrailPassRate0to1: completeBaseline.guardrailPassRate0to1,
      scoreThresholdPassRate0to1: completeBaseline.scoreThresholdPassRate0to1,
      latencyMsP95: completeBaseline.latencyMsP95,
      costUsdMean: completeBaseline.costUsdMean,
      ...galileoProof({
        galileoTraceExportHash: "not-a-hash",
        galileoMetricReportHash: undefined,
        galileoCanaryResultHash: undefined,
        galileoDriftStatisticHash: undefined,
        galileoAlertOrWaiverHash: undefined,
        galileoSignedEvidenceBundleHash: undefined,
        galileoNoSourceCopyProofHash: undefined,
        galileoMetricIds: [],
        galileoMetricCount: 0,
      }),
      evidenceRefs: ["source-signal:galileo.ai:eval-observability", "galileo:incomplete-candidate"],
      signedEvidenceRefs: ["ledger:galileo-incomplete-candidate"],
    };

    const report = runProviderDriftBenchmark({
      agentId: "llmops-agent",
      baseline: [completeBaseline],
      candidate: [incompleteCandidate],
      thresholds: {
        minTrajectoryCount: 16,
        minEvaluationMetricCount: 5,
      },
    });

    expect(report.recommendation).toBe("alert");
    expect(report.failClosed).toBe(true);
    expect(report.alerts.map((alert) => alert.metricId)).toEqual(["galileoObservabilityEvidence"]);
    expect(report.alerts[0]?.severity).toBe("critical");
    expect(report.alerts[0]?.message).toContain("candidate:galileoTraceExportHash");
    expect(report.alerts[0]?.message).toContain("candidate:galileoSignedEvidenceBundleHash");
    expect(report.alerts[0]?.message).toContain("candidate:galileoMetricCount");
    expect(report.comparisons[0]?.scoreDelta0to1).toBe(0);

    const watchAlerts = buildProviderDriftWatchAlerts(report);
    expect(watchAlerts.map((alert) => alert.metricId)).toEqual(["galileoObservabilityEvidence"]);
    expect(watchAlerts[0]?.evidenceRefs).toContain("galileo:incomplete-candidate");

    const gate = buildProviderDriftCiGate(report, { mode: "ci" });
    expect(gate.failClosed).toBe(true);
    expect(gate.failedAlertIds).toEqual([
      "pdrift:openai:gpt-4o-mini:galileo-incomplete-proof:galileoObservabilityEvidence",
    ]);

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-galileo-incomplete-v1",
      datasetHash: "9".repeat(64),
      sourceRefs: ["https://www.galileo.ai"],
    });
    expect(pack.replayable).toBe(true);
    expect(pack.rows[0]?.galileoMissingReasons).toContain("candidate:galileoTraceExportHash");
    expect(pack.rows[0]?.galileoMissingReasons).toContain("candidate:galileoMetricCount");
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("fails closed when Evidra evidence-chain proof is incomplete despite stable drift metrics", () => {
    const completeBaseline: ProviderDriftCanaryRow = {
      ...baseline,
      canaryId: "evidra-incomplete-proof",
      benchmarkFamily: "llmops-provider-drift",
      capabilityId: "signed-prescribe-report-evidence-chain",
      sampleSize: 20,
      trajectoryCount: 20,
      scoreMean0to1: 0.87,
      refusalRate0to1: 0.03,
      protocolSuccessRate0to1: 0.96,
      latencyMsP95: 1180,
      costUsdMean: 0.0032,
      ...evidraProof({
        evidraProviderRouteId: "openai:gpt-4o-mini:evidra-baseline",
      }),
      evidenceRefs: ["evidra:complete-baseline", "github:vitas/evidra@b70af706"],
      signedEvidenceRefs: ["ledger:evidra-complete-baseline"],
    };
    const incompleteCandidate: ProviderDriftCanaryRow = {
      ...candidate,
      canaryId: "evidra-incomplete-proof",
      benchmarkFamily: "llmops-provider-drift",
      capabilityId: "signed-prescribe-report-evidence-chain",
      sampleSize: completeBaseline.sampleSize,
      trajectoryCount: completeBaseline.trajectoryCount,
      scoreMean0to1: completeBaseline.scoreMean0to1,
      refusalRate0to1: completeBaseline.refusalRate0to1,
      protocolSuccessRate0to1: completeBaseline.protocolSuccessRate0to1,
      latencyMsP95: completeBaseline.latencyMsP95,
      costUsdMean: completeBaseline.costUsdMean,
      ...evidraProof({
        evidraMcpTreeHash: "not-a-hash",
        evidraEvidenceSignerHash: undefined,
        evidraPrescribeReportProtocolHash: undefined,
        evidraCanaryResultHash: undefined,
        evidraLiveSampleManifestHash: undefined,
        evidraAlertOrWaiverHash: undefined,
        evidraNoSourceCopyProofHash: undefined,
        evidraSignedEvidenceChainHash: undefined,
      }),
      evidenceRefs: ["evidra:incomplete-candidate", "github:vitas/evidra@b70af706"],
      signedEvidenceRefs: ["ledger:evidra-incomplete-candidate"],
    };

    const report = runProviderDriftBenchmark({
      agentId: "devops-agent",
      baseline: [completeBaseline],
      candidate: [incompleteCandidate],
      thresholds: {
        minTrajectoryCount: 10,
      },
    });

    expect(report.recommendation).toBe("alert");
    expect(report.failClosed).toBe(true);
    expect(report.alerts.map((alert) => alert.metricId)).toEqual(["evidraEvidenceChainEvidence"]);
    expect(report.alerts[0]?.severity).toBe("critical");
    expect(report.alerts[0]?.message).toContain("candidate:evidraMcpTreeHash");
    expect(report.alerts[0]?.message).toContain("candidate:evidraEvidenceSignerHash");
    expect(report.alerts[0]?.message).toContain("candidate:evidraPrescribeReportProtocolHash");
    expect(report.alerts[0]?.message).toContain("candidate:evidraSignedEvidenceChainHash");
    expect(report.comparisons[0]?.scoreDelta0to1).toBe(0);
    expect(report.comparisons[0]?.costDeltaRatio).toBe(0);

    const watchAlerts = buildProviderDriftWatchAlerts(report);
    expect(watchAlerts.map((alert) => alert.metricId)).toEqual(["evidraEvidenceChainEvidence"]);

    const gate = buildProviderDriftCiGate(report, { mode: "lifecycle" });
    expect(gate.failClosed).toBe(true);
    expect(gate.failedAlertIds).toEqual([
      "pdrift:openai:gpt-4o-mini:evidra-incomplete-proof:evidraEvidenceChainEvidence",
    ]);

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-evidra-incomplete-v1",
      datasetHash: "7".repeat(64),
      sourceRefs: ["https://github.com/vitas/evidra"],
    });
    expect(pack.replayable).toBe(true);
    expect(pack.rows[0]?.evidraMissingReasons).toContain("candidate:evidraMcpTreeHash");
    expect(pack.rows[0]?.evidraMissingReasons).toContain("candidate:evidraLiveSampleManifestHash");
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("fails closed when Opik-style observability pipeline proof is incomplete despite stable drift metrics", () => {
    const completeFootballBaseline: ProviderDriftCanaryRow = {
      ...baseline,
      canaryId: "football-content-observability-incomplete",
      benchmarkFamily: "football-content-evaluation-observability",
      capabilityId: "summary-and-qa-evaluation",
      evaluationFrameworkId: "opik",
      evaluationFrameworkVersion: "1.0.0",
      providerRouteId: "openai:gpt-4o-mini:baseline",
      metricSuiteId: "football-content-summary-qa-suite",
      metricIds: ["bertscore", "cosine_similarity", "answer_relevancy", "hallucination"],
      metricCount: 4,
      evaluatorConfigHash: hash("a"),
      generatedTestDataHash: hash("b"),
      verdictAggregation: "mean",
      verdictAggregationConfigHash: hash("c"),
      dashboardArtifactHash: hash("d"),
      pipelineOrchestratorId: "zenml",
      pipelineRunId: "zenml-run-baseline",
      experimentTrackerId: "opik",
      experimentRunId: "opik-football-baseline",
      observabilityProjectId: "football-teams-eval",
      datastoreId: "mongodb-football-content",
      retrievalIndexHash: hash("e"),
      contentDatasetHash: hash("f"),
      summaryArtifactHash: hash("1"),
      qaDatasetHash: hash("2"),
      traceExportHash: hash("3"),
      metricReportHash: hash("4"),
      pipelineConfigHash: hash("5"),
      signedEvidenceRefs: ["ledger:football-content-incomplete-baseline"],
    };
    const incompleteFootballCandidate: ProviderDriftCanaryRow = {
      ...candidate,
      canaryId: "football-content-observability-incomplete",
      benchmarkFamily: "football-content-evaluation-observability",
      capabilityId: "summary-and-qa-evaluation",
      evaluationFrameworkId: "opik",
      evaluationFrameworkVersion: "1.0.1",
      providerRouteId: "openai:gpt-4o-mini:candidate",
      metricSuiteId: "football-content-summary-qa-suite",
      metricIds: ["bertscore", "cosine_similarity", "answer_relevancy", "hallucination"],
      metricCount: 4,
      evaluatorConfigHash: hash("6"),
      generatedTestDataHash: hash("7"),
      verdictAggregation: "mean",
      verdictAggregationConfigHash: hash("8"),
      dashboardArtifactHash: hash("9"),
      scoreMean0to1: completeFootballBaseline.scoreMean0to1,
      refusalRate0to1: completeFootballBaseline.refusalRate0to1,
      latencyMsP95: completeFootballBaseline.latencyMsP95,
      costUsdMean: completeFootballBaseline.costUsdMean,
      experimentTrackerId: "opik",
      retrievalIndexHash: "not-a-hash",
      evidenceRefs: [
        "pipeline:football-content-candidate",
        "opik:trace-export-candidate",
      ],
      signedEvidenceRefs: ["ledger:football-content-incomplete-candidate"],
    };

    const report = runProviderDriftBenchmark({
      agentId: "football-content-agent",
      baseline: [completeFootballBaseline],
      candidate: [incompleteFootballCandidate],
      thresholds: {
        minEvaluationMetricCount: 4,
      },
    });

    expect(report.recommendation).toBe("alert");
    expect(report.failClosed).toBe(true);
    expect(report.alerts.map((alert) => alert.metricId)).toEqual(["observabilityPipelineEvidence"]);
    expect(report.alerts[0]?.message).toContain("candidate:pipelineOrchestratorId");
    expect(report.alerts[0]?.message).toContain("candidate:retrievalIndexHash");
    expect(report.alerts[0]?.message).toContain("candidate:metricReportHash");
    expect(report.comparisons[0]?.scoreDelta0to1).toBe(0);

    const watchAlerts = buildProviderDriftWatchAlerts(report);
    expect(watchAlerts.map((alert) => alert.metricId)).toEqual(["observabilityPipelineEvidence"]);

    const gate = buildProviderDriftCiGate(report, { mode: "lifecycle" });
    expect(gate.failClosed).toBe(true);
    expect(gate.failedAlertIds).toEqual([
      "pdrift:openai:gpt-4o-mini:football-content-observability-incomplete:observabilityPipelineEvidence",
    ]);

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-football-content-observability-incomplete-v1",
      datasetHash: "5".repeat(64),
      sourceRefs: ["https://github.com/benitomartin/llm-observability-opik"],
    });
    expect(pack.replayable).toBe(true);
    expect(pack.rows[0]?.observabilityPipelineMissingReasons).toContain("candidate:pipelineRunId");
    expect(pack.rows[0]?.observabilityPipelineMissingReasons).toContain("candidate:traceExportHash");

    const markdown = renderProviderDriftBenchmarkMarkdown(report);
    expect(markdown).toContain("Observability Pipeline Proof");
    expect(markdown).toContain("candidate:metricReportHash");
  });

  test("fails closed when Eval-ai-library-style evaluator framework proof is incomplete despite stable drift metrics", () => {
    const evalLibraryBaseline: ProviderDriftCanaryRow = {
      ...baseline,
      canaryId: "eval-ai-library-incomplete-suite",
      benchmarkFamily: "rag-agent-evaluation-framework",
      capabilityId: "multi-provider-rag-agent-metrics",
      evaluationFrameworkId: "eval-ai-library",
      evaluationFrameworkVersion: "0.9.0",
      providerRouteId: "openai:gpt-4o-mini:baseline",
      metricSuiteId: "rag-agent-35-metric-suite",
      metricIds: ["answer_relevancy", "faithfulness"],
      metricCount: 35,
      evaluatorConfigHash: hash("a"),
      generatedTestDataHash: hash("b"),
      verdictAggregation: "temperature_controlled_power_mean",
      verdictAggregationConfigHash: hash("c"),
      verdictTemperature: 0.7,
      verdictPowerMeanP: 2,
      dashboardArtifactHash: hash("d"),
      signedEvidenceRefs: ["ledger:eval-ai-incomplete-baseline"],
    };
    const evalLibraryCandidate: ProviderDriftCanaryRow = {
      ...candidate,
      canaryId: "eval-ai-library-incomplete-suite",
      benchmarkFamily: "rag-agent-evaluation-framework",
      capabilityId: "multi-provider-rag-agent-metrics",
      evaluationFrameworkId: "eval-ai-library",
      evaluationFrameworkVersion: "0.9.1",
      providerRouteId: "openai:gpt-4o-mini:candidate",
      metricSuiteId: "rag-agent-35-metric-suite",
      metricIds: [],
      metricCount: 2,
      evaluatorConfigHash: "not-a-hash",
      verdictAggregation: "temperature_controlled_power_mean",
      verdictAggregationConfigHash: hash("1"),
      evidenceRefs: [
        "eval-ai:framework-candidate",
        "eval-ai:dashboard-candidate",
      ],
      signedEvidenceRefs: ["ledger:eval-ai-incomplete-candidate"],
    };

    const report = runProviderDriftBenchmark({
      agentId: "rag-agent",
      baseline: [evalLibraryBaseline],
      candidate: [evalLibraryCandidate],
      thresholds: {
        minEvaluationMetricCount: 15,
      },
    });

    expect(report.recommendation).toBe("alert");
    expect(report.failClosed).toBe(true);
    expect(report.alerts.map((alert) => alert.metricId)).toEqual(["evaluationFrameworkEvidence"]);
    expect(report.alerts[0]?.message).toContain("candidate:metricIds");
    expect(report.alerts[0]?.message).toContain("candidate:evaluatorConfigHash");
    expect(report.alerts[0]?.message).toContain("candidate:generatedTestDataHash");
    expect(report.alerts[0]?.message).toContain("candidate:dashboardArtifactHash");
    expect(report.comparisons[0]?.evaluationFrameworkMissingReasons).toContain("candidate:metricCount");
    expect(report.comparisons[0]?.evaluationFrameworkMissingReasons).toContain("candidate:verdictTemperature");
    expect(report.comparisons[0]?.evaluationFrameworkMissingReasons).toContain("candidate:verdictPowerMeanP");

    const watchAlerts = buildProviderDriftWatchAlerts(report);
    expect(watchAlerts.map((alert) => alert.metricId)).toEqual(["evaluationFrameworkEvidence"]);

    const gate = buildProviderDriftCiGate(report, { mode: "ci" });
    expect(gate.failClosed).toBe(true);
    expect(gate.failedAlertIds).toEqual([
      "pdrift:openai:gpt-4o-mini:eval-ai-library-incomplete-suite:evaluationFrameworkEvidence",
    ]);

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-eval-ai-library-incomplete-v1",
      datasetHash: "6".repeat(64),
      sourceRefs: ["https://github.com/meshkovQA/Eval-ai-library"],
    });
    expect(pack.replayable).toBe(true);
    expect(pack.rows[0]?.evaluationFrameworkMissingReasons).toContain("candidate:metricIds");
    expect(pack.rows[0]?.evaluationFrameworkMissingReasons).toContain("candidate:dashboardArtifactHash");

    const markdown = renderProviderDriftBenchmarkMarkdown(report);
    expect(markdown).toContain("Evaluation Framework Proof");
    expect(markdown).toContain("candidate:metricIds");
  });

  test("fails closed when Falcon Evaluate source or canary-result proof is incomplete", () => {
    const completeFalconBaseline: ProviderDriftCanaryRow = {
      ...baseline,
      canaryId: "falcon-evaluate-incomplete-suite",
      benchmarkFamily: "agent-evaluation-provider-drift",
      capabilityId: "provider-model-regression-canary",
      evaluationFrameworkId: "falcon-evaluate",
      evaluationFrameworkVersion: "v0.1.13.0",
      providerRouteId: "openai:gpt-4o-mini:baseline",
      metricSuiteId: "falcon-evaluate-provider-drift-lite",
      metricIds: ["context_relevancy", "fairness", "reliability", "security", "machine_ethics"],
      metricCount: 5,
      evaluatorConfigHash: hash("a"),
      generatedTestDataHash: hash("b"),
      verdictAggregation: "mean",
      verdictAggregationConfigHash: hash("c"),
      dashboardArtifactHash: hash("d"),
      falconEvaluateSourceRefHash: hash("e"),
      falconEvaluateRepositorySnapshotHash: hash("f"),
      falconEvaluateLicenseRefHash: hash("1"),
      falconEvaluateDefaultBranchHash: hash("2"),
      falconEvaluateReleaseTag: "v0.1.13.0",
      falconEvaluatePackageManifestHash: hash("3"),
      falconEvaluateLockfileHash: hash("4"),
      falconEvaluateRequirementsHash: hash("5"),
      falconEvaluateReadmeHash: hash("6"),
      falconEvaluateDocsIndexHash: hash("7"),
      falconEvaluateWorkflowHash: hash("8"),
      falconEvaluateEvaluationModuleHash: hash("9"),
      falconEvaluateContextRelevancyModuleHash: hash("a"),
      falconEvaluateFairnessModuleHash: hash("b"),
      falconEvaluateReliabilityModuleHash: hash("c"),
      falconEvaluateSecurityModuleHash: hash("d"),
      falconEvaluateMachineEthicsModuleHash: hash("e"),
      falconEvaluateResultsModuleHash: hash("f"),
      falconEvaluatePlotModuleHash: hash("1"),
      falconEvaluateUserAnalyticsModuleHash: hash("2"),
      falconEvaluateValidationDataSchemaHash: hash("3"),
      falconEvaluateMetricFamilyIds: ["context", "fairness", "reliability", "security", "ethics"],
      falconEvaluateMetricIds: ["context_relevancy", "fairness", "reliability", "security", "machine_ethics"],
      falconEvaluateMetricCount: 5,
      falconEvaluateProviderRouteId: "openai:gpt-4o-mini:baseline",
      falconEvaluateCanaryResultHash: hash("4"),
      evidenceRefs: [
        "github:Praveengovianalytics/falcon-evaluate@6c6d56a",
        "release:falcon-evaluate:v0.1.13.0",
        "eval-pack:falcon-provider-drift-baseline",
      ],
      signedEvidenceRefs: ["ledger:falcon-evaluate-baseline"],
    };
    const incompleteFalconCandidate: ProviderDriftCanaryRow = {
      ...candidate,
      canaryId: "falcon-evaluate-incomplete-suite",
      benchmarkFamily: "agent-evaluation-provider-drift",
      capabilityId: "provider-model-regression-canary",
      evaluationFrameworkId: "falcon-evaluate",
      evaluationFrameworkVersion: "v0.1.13.0",
      providerRouteId: "openai:gpt-4o-mini:candidate",
      metricSuiteId: "falcon-evaluate-provider-drift-lite",
      metricIds: ["context_relevancy", "fairness", "reliability", "security", "machine_ethics"],
      metricCount: 5,
      evaluatorConfigHash: hash("5"),
      generatedTestDataHash: hash("6"),
      verdictAggregation: "mean",
      verdictAggregationConfigHash: hash("7"),
      dashboardArtifactHash: hash("8"),
      falconEvaluateSourceRefHash: hash("e"),
      falconEvaluateRepositorySnapshotHash: "not-a-hash",
      falconEvaluateReleaseTag: "v0.1.13.0",
      falconEvaluatePackageManifestHash: hash("3"),
      falconEvaluateMetricFamilyIds: ["context"],
      falconEvaluateMetricIds: [],
      falconEvaluateMetricCount: 1,
      falconEvaluateProviderRouteId: "openai:gpt-4o-mini:candidate",
      evidenceRefs: [
        "github:Praveengovianalytics/falcon-evaluate@6c6d56a",
        "release:falcon-evaluate:v0.1.13.0",
        "eval-pack:falcon-provider-drift-candidate",
      ],
      signedEvidenceRefs: ["ledger:falcon-evaluate-candidate"],
    };

    const report = runProviderDriftBenchmark({
      agentId: "provider-drift-agent",
      baseline: [completeFalconBaseline],
      candidate: [incompleteFalconCandidate],
      thresholds: {
        minEvaluationMetricCount: 5,
      },
    });

    expect(report.recommendation).toBe("alert");
    expect(report.failClosed).toBe(true);
    expect(report.alerts.map((alert) => alert.metricId)).toEqual(["falconEvaluateEvidence"]);
    expect(report.alerts[0]?.message).toContain("candidate:falconEvaluateRepositorySnapshotHash");
    expect(report.alerts[0]?.message).toContain("candidate:falconEvaluateLicenseRefHash");
    expect(report.alerts[0]?.message).toContain("candidate:falconEvaluateMetricIds");
    expect(report.alerts[0]?.message).toContain("candidate:falconEvaluateCanaryResultHash");

    const watchAlerts = buildProviderDriftWatchAlerts(report);
    expect(watchAlerts.map((alert) => alert.metricId)).toEqual(["falconEvaluateEvidence"]);

    const gate = buildProviderDriftCiGate(report, { mode: "lifecycle" });
    expect(gate.failClosed).toBe(true);
    expect(gate.failedAlertIds).toEqual([
      "pdrift:openai:gpt-4o-mini:falcon-evaluate-incomplete-suite:falconEvaluateEvidence",
    ]);

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-falcon-evaluate-incomplete-v1",
      datasetHash: "b".repeat(64),
      sourceRefs: ["https://github.com/Praveengovianalytics/falcon-evaluate"],
    });
    expect(pack.replayable).toBe(true);
    expect(pack.rows[0]?.falconEvaluateMissingReasons).toContain("candidate:falconEvaluateDefaultBranchHash");
    expect(pack.rows[0]?.falconEvaluateMissingReasons).toContain("candidate:falconEvaluateValidationDataSchemaHash");

    const markdown = renderProviderDriftBenchmarkMarkdown(report);
    expect(markdown).toContain("Falcon Evaluate Proof");
    expect(markdown).toContain("candidate:falconEvaluateCanaryResultHash");
  });

  test("fails closed when user-aware subgoal progress and error analysis regress despite stable score", () => {
    const tedBaseline: ProviderDriftCanaryRow = {
      ...baseline,
      canaryId: "ted-user-aware-agent-quality",
      benchmarkFamily: "agent-quality-inspect-ted",
      capabilityId: "user-aware-subgoal-progress",
      scoreMean0to1: 0.83,
      progressAuc0to1: 0.82,
      progressPerTurn0to1: 0.76,
      passAtK0to1: 0.9,
      passPowerK0to1: 0.79,
      subgoalCompletionRate0to1: 0.86,
      expectedToolCallCoverage0to1: 0.88,
      personaCoverage0to1: 1,
      errorClusterRate0to1: 0.07,
      evidenceRefs: [
        "trace:ted-baseline",
        "dataset:subgoals-v1",
        "persona:expert-nonexpert-v1",
        "judge:ted-rubric-v1",
        "errors:baseline-clusters-v1",
      ],
      signedEvidenceRefs: ["ledger:ted-base"],
    };
    const tedCandidate: ProviderDriftCanaryRow = {
      ...candidate,
      canaryId: "ted-user-aware-agent-quality",
      benchmarkFamily: "agent-quality-inspect-ted",
      capabilityId: "user-aware-subgoal-progress",
      scoreMean0to1: 0.83,
      progressAuc0to1: 0.66,
      progressPerTurn0to1: 0.6,
      passAtK0to1: 0.74,
      passPowerK0to1: 0.6,
      subgoalCompletionRate0to1: 0.69,
      expectedToolCallCoverage0to1: 0.66,
      personaCoverage0to1: 0.72,
      errorClusterRate0to1: 0.19,
      evidenceRefs: [
        "trace:ted-candidate",
        "dataset:subgoals-v1",
        "persona:expert-nonexpert-v1",
        "judge:ted-rubric-v1",
        "errors:candidate-clusters-v1",
      ],
      signedEvidenceRefs: ["ledger:ted-candidate"],
    };

    const report = runProviderDriftBenchmark({
      agentId: "support-agent",
      baseline: [tedBaseline],
      candidate: [tedCandidate],
      thresholds: {
        maxProgressAucDrop0to1: 0.08,
        maxProgressPerTurnDrop0to1: 0.08,
        maxPassAtKDrop0to1: 0.08,
        maxPassPowerKDrop0to1: 0.08,
        maxSubgoalCompletionRateDrop0to1: 0.08,
        maxExpectedToolCallCoverageDrop0to1: 0.08,
        maxPersonaCoverageDrop0to1: 0.1,
        maxErrorClusterRateIncrease0to1: 0.05,
      },
    });

    expect(report.recommendation).toBe("alert");
    expect(report.failClosed).toBe(true);
    expect(report.comparisons[0]).toMatchObject({
      baselineBenchmarkFamily: "agent-quality-inspect-ted",
      candidateBenchmarkFamily: "agent-quality-inspect-ted",
      baselineCapabilityId: "user-aware-subgoal-progress",
      candidateCapabilityId: "user-aware-subgoal-progress",
      scoreDelta0to1: 0,
      progressAucDelta0to1: -0.16,
      progressPerTurnDelta0to1: -0.16,
      passAtKDelta0to1: -0.16,
      passPowerKDelta0to1: -0.19,
      subgoalCompletionRateDelta0to1: -0.17,
      expectedToolCallCoverageDelta0to1: -0.22,
      personaCoverageDelta0to1: -0.28,
      errorClusterRateDelta0to1: 0.12,
    });
    expect(report.alerts.map((alert) => alert.metricId)).toEqual([
      "progressAuc0to1",
      "progressPerTurn0to1",
      "passAtK0to1",
      "passPowerK0to1",
      "subgoalCompletionRate0to1",
      "expectedToolCallCoverage0to1",
      "personaCoverage0to1",
      "errorClusterRate0to1",
    ]);

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-ted-user-aware-v1",
      datasetHash: "7".repeat(64),
      sourceRefs: ["https://github.com/SAP/agent-quality-inspect"],
    });
    expect(pack.rows[0]).toMatchObject({
      progressAucDelta0to1: -0.16,
      progressPerTurnDelta0to1: -0.16,
      passAtKDelta0to1: -0.16,
      passPowerKDelta0to1: -0.19,
      subgoalCompletionRateDelta0to1: -0.17,
      expectedToolCallCoverageDelta0to1: -0.22,
      personaCoverageDelta0to1: -0.28,
      errorClusterRateDelta0to1: 0.12,
    });
    expect(pack.replayable).toBe(true);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);

    const watchAlerts = buildProviderDriftWatchAlerts(report);
    expect(watchAlerts.map((alert) => alert.metricId)).toEqual([
      "progressAuc0to1",
      "progressPerTurn0to1",
      "passAtK0to1",
      "passPowerK0to1",
      "subgoalCompletionRate0to1",
      "expectedToolCallCoverage0to1",
      "personaCoverage0to1",
      "errorClusterRate0to1",
    ]);

    const markdown = renderProviderDriftBenchmarkMarkdown(report);
    expect(markdown).toContain("Progress AUC Delta");
    expect(markdown).toContain("Expected Tool Coverage Delta");
    expect(markdown).toContain("Error Cluster Rate Delta");
  });

  test("fails closed when architectural repair dimensions regress despite stable aggregate score", () => {
    const architectureBaseline: ProviderDriftCanaryRow = {
      ...baseline,
      canaryId: "architectural-smell-repair",
      benchmarkFamily: "architectural-code-smell-repair",
      capabilityId: "cross-module-refactoring",
      scoreMean0to1: 0.72,
      repairEffectiveness0to1: 0.78,
      falsePositiveIdentification0to1: 0.82,
      netCodebaseImpact0to1: 0.74,
    };
    const architectureCandidate: ProviderDriftCanaryRow = {
      ...candidate,
      canaryId: "architectural-smell-repair",
      benchmarkFamily: "architectural-code-smell-repair",
      capabilityId: "cross-module-refactoring",
      scoreMean0to1: 0.72,
      repairEffectiveness0to1: 0.61,
      falsePositiveIdentification0to1: 0.63,
      netCodebaseImpact0to1: 0.55,
    };

    const report = runProviderDriftBenchmark({
      agentId: "code-agent",
      baseline: [architectureBaseline],
      candidate: [architectureCandidate],
      thresholds: {
        maxRepairEffectivenessDrop0to1: 0.08,
        maxFalsePositiveIdentificationDrop0to1: 0.08,
        maxNetCodebaseImpactDrop0to1: 0.08,
      },
    });

    expect(report.recommendation).toBe("alert");
    expect(report.failClosed).toBe(true);
    expect(report.comparisons[0]).toMatchObject({
      baselineBenchmarkFamily: "architectural-code-smell-repair",
      candidateBenchmarkFamily: "architectural-code-smell-repair",
      baselineCapabilityId: "cross-module-refactoring",
      candidateCapabilityId: "cross-module-refactoring",
      scoreDelta0to1: 0,
      repairEffectivenessDelta0to1: -0.17,
      falsePositiveIdentificationDelta0to1: -0.19,
      netCodebaseImpactDelta0to1: -0.19,
    });
    expect(report.alerts.map((alert) => alert.metricId)).toEqual([
      "repairEffectiveness0to1",
      "falsePositiveIdentification0to1",
      "netCodebaseImpact0to1",
    ]);

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-architectural-repair-v1",
      datasetHash: "d".repeat(64),
      sourceRefs: ["https://arxiv.org/abs/2605.07001"],
    });
    expect(pack.rows[0]).toMatchObject({
      repairEffectivenessDelta0to1: -0.17,
      falsePositiveIdentificationDelta0to1: -0.19,
      netCodebaseImpactDelta0to1: -0.19,
    });
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);

    const markdown = renderProviderDriftBenchmarkMarkdown(report);
    expect(markdown).toContain("Repair Effectiveness Delta");
    expect(markdown).toContain("Net Codebase Impact Delta");
  });

  test("fails closed when spreadsheet artifact dimensions regress despite stable aggregate score", () => {
    const spreadsheetBaseline: ProviderDriftCanaryRow = {
      ...baseline,
      canaryId: "finance-spreadsheet-artifact",
      benchmarkFamily: "end-to-end-spreadsheet-finance",
      capabilityId: "financial-model-artifact-generation",
      scoreMean0to1: 0.8,
      artifactAccuracy0to1: 0.84,
      formulaIntegrity0to1: 0.86,
      formatQuality0to1: 0.82,
    };
    const spreadsheetCandidate: ProviderDriftCanaryRow = {
      ...candidate,
      canaryId: "finance-spreadsheet-artifact",
      benchmarkFamily: "end-to-end-spreadsheet-finance",
      capabilityId: "financial-model-artifact-generation",
      scoreMean0to1: 0.8,
      artifactAccuracy0to1: 0.68,
      formulaIntegrity0to1: 0.69,
      formatQuality0to1: 0.64,
    };

    const report = runProviderDriftBenchmark({
      agentId: "finance-agent",
      baseline: [spreadsheetBaseline],
      candidate: [spreadsheetCandidate],
      thresholds: {
        maxArtifactAccuracyDrop0to1: 0.08,
        maxFormulaIntegrityDrop0to1: 0.08,
        maxFormatQualityDrop0to1: 0.08,
      },
    });

    expect(report.recommendation).toBe("alert");
    expect(report.failClosed).toBe(true);
    expect(report.comparisons[0]).toMatchObject({
      baselineBenchmarkFamily: "end-to-end-spreadsheet-finance",
      candidateBenchmarkFamily: "end-to-end-spreadsheet-finance",
      baselineCapabilityId: "financial-model-artifact-generation",
      candidateCapabilityId: "financial-model-artifact-generation",
      scoreDelta0to1: 0,
      artifactAccuracyDelta0to1: -0.16,
      formulaIntegrityDelta0to1: -0.17,
      formatQualityDelta0to1: -0.18,
    });
    expect(report.alerts.map((alert) => alert.metricId)).toEqual([
      "artifactAccuracy0to1",
      "formulaIntegrity0to1",
      "formatQuality0to1",
    ]);

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-finance-spreadsheet-v1",
      datasetHash: "e".repeat(64),
      sourceRefs: ["https://arxiv.org/abs/2605.22664"],
    });
    expect(pack.rows[0]).toMatchObject({
      artifactAccuracyDelta0to1: -0.16,
      formulaIntegrityDelta0to1: -0.17,
      formatQualityDelta0to1: -0.18,
    });
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);

    const watchAlerts = buildProviderDriftWatchAlerts(report);
    expect(watchAlerts.map((alert) => alert.metricId)).toEqual([
      "artifactAccuracy0to1",
      "formulaIntegrity0to1",
      "formatQuality0to1",
    ]);

    const gate = buildProviderDriftCiGate(report, { mode: "lifecycle" });
    expect(gate.passed).toBe(false);
    expect(gate.failClosed).toBe(true);
    expect(gate.summary).toContain("blocked");

    const markdown = renderProviderDriftBenchmarkMarkdown(report);
    expect(markdown).toContain("Artifact Accuracy Delta");
    expect(markdown).toContain("Formula Integrity Delta");
    expect(markdown).toContain("Format Quality Delta");
  });

  test("fails closed when hidden-preference outcome drift regresses despite stable protocol success", () => {
    const pricingBaseline: ProviderDriftCanaryRow = {
      ...baseline,
      canaryId: "hidden-preference-pricing",
      benchmarkFamily: "hidden-preference-negotiation",
      capabilityId: "profit-sensitive-bargaining",
      scoreMean0to1: 0.82,
      protocolSuccessRate0to1: 0.99,
      agreementRate0to1: 0.98,
      targetOutcomeValue0to1: 0.72,
      latentPreferenceAlignment0to1: 0.76,
    };
    const pricingCandidate: ProviderDriftCanaryRow = {
      ...candidate,
      canaryId: "hidden-preference-pricing",
      benchmarkFamily: "hidden-preference-negotiation",
      capabilityId: "profit-sensitive-bargaining",
      scoreMean0to1: 0.82,
      protocolSuccessRate0to1: 0.99,
      agreementRate0to1: 0.99,
      targetOutcomeValue0to1: 0.54,
      latentPreferenceAlignment0to1: 0.59,
    };

    const report = runProviderDriftBenchmark({
      agentId: "pricing-agent",
      baseline: [pricingBaseline],
      candidate: [pricingCandidate],
      thresholds: {
        maxTargetOutcomeValueDrop0to1: 0.08,
        maxLatentPreferenceAlignmentDrop0to1: 0.08,
      },
    });

    expect(report.recommendation).toBe("alert");
    expect(report.failClosed).toBe(true);
    expect(report.comparisons[0]).toMatchObject({
      baselineBenchmarkFamily: "hidden-preference-negotiation",
      candidateBenchmarkFamily: "hidden-preference-negotiation",
      baselineCapabilityId: "profit-sensitive-bargaining",
      candidateCapabilityId: "profit-sensitive-bargaining",
      scoreDelta0to1: 0,
      protocolSuccessRateDelta0to1: 0,
      agreementRateDelta0to1: 0.01,
      targetOutcomeValueDelta0to1: -0.18,
      latentPreferenceAlignmentDelta0to1: -0.17,
    });
    expect(report.alerts.map((alert) => alert.metricId)).toEqual([
      "targetOutcomeValue0to1",
      "latentPreferenceAlignment0to1",
    ]);

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-hidden-preference-v1",
      datasetHash: "f".repeat(64),
      sourceRefs: ["https://arxiv.org/abs/2605.22855"],
    });
    expect(pack.rows[0]).toMatchObject({
      protocolSuccessRateDelta0to1: 0,
      agreementRateDelta0to1: 0.01,
      targetOutcomeValueDelta0to1: -0.18,
      latentPreferenceAlignmentDelta0to1: -0.17,
    });
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);

    const watchAlerts = buildProviderDriftWatchAlerts(report);
    expect(watchAlerts.map((alert) => alert.metricId)).toEqual([
      "targetOutcomeValue0to1",
      "latentPreferenceAlignment0to1",
    ]);

    const gate = buildProviderDriftCiGate(report, { mode: "lifecycle" });
    expect(gate.passed).toBe(false);
    expect(gate.failClosed).toBe(true);

    const markdown = renderProviderDriftBenchmarkMarkdown(report);
    expect(markdown).toContain("Target Outcome Value Delta");
    expect(markdown).toContain("Latent Preference Alignment Delta");
  });

  test("keeps drift visible but marks covered alerts waived when an active waiver is supplied", () => {
    const report = runProviderDriftBenchmark({
      agentId: "support-agent",
      baseline: [baseline],
      candidate: [{
        ...candidate,
        scoreMean0to1: 0.6,
        refusalRate0to1: 0.2,
      }],
      waivers: [{
        waiverId: "waiver-123",
        provider: "openai",
        model: "gpt-4o-mini",
        metricIds: ["scoreMean0to1", "refusalRate0to1"],
        reason: "Approved migration canary window.",
        approvedBy: "rev-tech-lead",
        expiresAt: "2099-01-01T00:00:00.000Z",
        evidenceRefs: ["approval:waiver-123"],
      }],
    });

    expect(report.recommendation).toBe("waive");
    expect(report.failClosed).toBe(false);
    expect(report.alerts.every((alert) => alert.waived)).toBe(true);
    expect(report.alerts.map((alert) => alert.waiverId)).toEqual(["waiver-123", "waiver-123"]);
    expect(report.comparisons[0]?.status).toBe("waived");
  });

  test("fails closed when sample size or evidence references are missing", () => {
    const report = runProviderDriftBenchmark({
      agentId: "support-agent",
      baseline: [{ ...baseline, sampleSize: 3, evidenceRefs: [] }],
      candidate: [{ ...candidate, sampleSize: 3, evidenceRefs: [] }],
    });

    expect(report.recommendation).toBe("alert");
    expect(report.failClosed).toBe(true);
    expect(report.alerts.map((alert) => alert.metricId)).toContain("sampleSize");
    expect(report.alerts.map((alert) => alert.metricId)).toContain("evidenceRefs");
  });

  test("fails closed when provider drift rows lack signed evidence references", () => {
    const report = runProviderDriftBenchmark({
      agentId: "support-agent",
      baseline: [{ ...baseline, signedEvidenceRefs: [] }],
      candidate: [{ ...candidate, signedEvidenceRefs: [] }],
    });

    expect(report.recommendation).toBe("alert");
    expect(report.failClosed).toBe(true);
    expect(report.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
    expect(report.comparisons[0]?.signedEvidenceRefs).toEqual([]);

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-support-v1",
      datasetHash: "a".repeat(64),
    });
    expect(pack.replayable).toBe(false);

    const gate = buildProviderDriftCiGate(report);
    expect(gate.passed).toBe(false);
    expect(gate.failClosed).toBe(true);
  });
});

describe("provider drift eval pack and CI gate", () => {
  test("builds a replayable eval pack with deterministic row hashes and signed evidence refs", () => {
    const report = runProviderDriftBenchmark({
      agentId: "support-agent",
      baseline: [baseline],
      candidate: [candidate],
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-support-v1",
      datasetHash: "a".repeat(64),
      sourceRefs: ["https://arxiv.org/abs/2306.16092"],
    });

    expect(pack.packId).toBe("provider-drift-support-v1");
    expect(pack.replayable).toBe(true);
    expect(pack.rowCount).toBe(1);
    expect(pack.datasetHash).toBe("a".repeat(64));
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(pack.rows[0]?.signedEvidenceRefs).toEqual(["ledger:sig-base-1", "ledger:sig-candidate-1"]);
    expect(pack.manifestHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("builds a CI gate that fails closed on unwaived provider drift alerts", () => {
    const report = runProviderDriftBenchmark({
      agentId: "support-agent",
      baseline: [baseline],
      candidate: [{
        ...candidate,
        scoreMean0to1: 0.5,
      }],
    });

    const gate = buildProviderDriftCiGate(report, { mode: "ci" });

    expect(gate.mode).toBe("ci");
    expect(gate.passed).toBe(false);
    expect(gate.failClosed).toBe(true);
    expect(gate.failedAlertIds).toEqual(["pdrift:openai:gpt-4o-mini:support-triage:scoreMean0to1"]);
    expect(gate.summary).toContain("blocked");
  });
});

describe("provider drift alert and markdown surfaces", () => {
  test("projects unwaived benchmark alerts into watch alerts", () => {
    const report = runProviderDriftBenchmark({
      agentId: "support-agent",
      baseline: [baseline],
      candidate: [{ ...candidate, scoreMean0to1: 0.5 }],
    });

    const alerts = buildProviderDriftWatchAlerts(report);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      agentId: "support-agent",
      severity: "critical",
      source: "provider-drift-benchmark",
      metricId: "scoreMean0to1",
    });
    expect(alerts[0]?.evidenceRefs).toContain("trace:candidate-1");
  });

  test("renders provider versions, canary rows, drift statistics, and waiver state", () => {
    const report = runProviderDriftBenchmark({
      agentId: "support-agent",
      baseline: [baseline],
      candidate: [{ ...candidate, scoreMean0to1: 0.6 }],
      waivers: [{
        waiverId: "waiver-123",
        metricIds: ["scoreMean0to1"],
        reason: "Temporary approved provider migration.",
        approvedBy: "rev-tech-lead",
        expiresAt: "2099-01-01T00:00:00.000Z",
        evidenceRefs: ["approval:waiver-123"],
      }],
    });

    const markdown = renderProviderDriftBenchmarkMarkdown(report);
    expect(markdown).toContain("# Provider Drift Benchmark");
    expect(markdown).toContain("openai/gpt-4o-mini@2026-06-01");
    expect(markdown).toContain("openai/gpt-4o-mini@2026-06-13");
    expect(markdown).toContain("support-triage");
    expect(markdown).toContain("waiver-123");
    expect(markdown).toContain("Drift Statistic");
  });
});
