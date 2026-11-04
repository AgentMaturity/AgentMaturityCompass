import { describe, expect, test } from "vitest";
import {
  guardedDelta,
  guardedDrop,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftMetricId,
  type LiveDriftSampleRow,
  type LiveDriftThresholds,
  type LiveDriftWindow,
} from "../src/watch/liveDriftAlerts.js";
import { runAiReputationClaudeLiveDrift } from "../src/watch/aiReputationClaudeLiveDrift.js";
import { runAwesomeAgentMemoryLiveDrift } from "../src/watch/awesomeAgentMemoryLiveDrift.js";
import { runLlmFighterLiveDrift } from "../src/watch/llmFighterLiveDrift.js";
import { runCtfAgentBenchmarkLiveDrift } from "../src/watch/ctfAgentBenchmarkLiveDrift.js";
import { runDarwinGodelMachineLiveDrift } from "../src/watch/darwinGodelMachineLiveDrift.js";
import { runGarageLiveDrift } from "../src/watch/garageLiveDrift.js";
import { runAgentReadingTestLiveDrift } from "../src/watch/agentReadingTestLiveDrift.js";
import { runRailScoreLiveDrift } from "../src/watch/railScoreLiveDrift.js";

// AXE-23: these published ratios previously defaulted an absent domain to 1.
const emptyDomainRatios = [
  "ragPassageGroundingCoverage0to1",
  "ragHumanVerificationCoverage0to1",
  "ragCitationCoverage0to1",
  "ragAnswerSupportCoverage0to1",
  "ollamaMetricsEvidenceCoverage0to1",
  "credenceEngineEvidenceCoverage0to1",
  "piArenaDefenseBlockRate0to1",
  "piArenaAgentTaskSuccessRate0to1",
  "piArenaToolCallSuccessRateMean0to1",
  "piArenaEvidenceCoverage0to1",
  "backdoorAgentCleanAccuracy0to1",
  "backdoorAgentTrajectoryCoverage0to1",
  "backdoorAgentEvidenceCoverage0to1",
  "agentSecuritySourceOriginCoverage0to1",
  "agentSecurityTaintPropagationCoverage0to1",
  "agentSecurityPolicyDecisionAccuracyMean0to1",
  "agentSecuritySecretScrubRate0to1",
  "agentSecurityAuditTrailIntegrity0to1",
  "agentTestingMethodologyCoverage0to1",
  "agentTestingScenarioCoverage0to1",
  "agentTestingFaultInjectionCoverage0to1",
  "agentTestingResiliencePassRate0to1",
  "agentTestingObservabilitySignalCoverage0to1",
  "chaosProductionReliabilityMean0to1",
  "chaosResilienceScoreMean0to1",
  "chaosRecoveryPassRate0to1",
  "chaosFailureTraceCoverage0to1",
  "recoveryBenchRecoverySuccessRate0to1",
  "recoveryBenchRecoveryRewardMean0to1",
  "recoveryBenchReplayIntegrityRate0to1",
  "recoveryBenchFailureTraceCoverage0to1",
  "recoveryBenchCorruptedEnvironmentCoverage0to1",
  "recoveryBenchContextCoverage0to1",
  "adkEvalPassRate0to1",
  "adkToolCallSuccessRate0to1",
  "adkGraphCoverage0to1",
  "adkStreamingStability0to1",
  "adkDeploymentReadiness0to1",
  "physicianBenchTaskSuccessRate0to1",
  "physicianBenchCheckpointPassRate0to1",
  "physicianBenchFhirDataAccessAccuracy0to1",
  "physicianBenchClinicalActionSafetyRate0to1",
  "physicianBenchDocumentationQualityMean0to1",
  "kiteEvidenceCoverage0to1",
  "pokerEvalEvidenceCoverage0to1",
  "noMiraclAbstentionAccuracyMean0to1",
  "noMiraclEvidenceCoverage0to1",
  "agenticSearchCitationCoverage0to1",
  "documentDatasetNumGuardCoverage0to1",
  "cpuAgenticEvidenceCoverage0to1",
  "evalTechniqueAlgorithmicFeedbackCoverage0to1",
  "evalTechniqueEvidenceCoverage0to1",
  "sapAgentEvalObjectiveCoverage0to1",
  "sapAgentEvalProcessCoverage0to1",
  "sapAgentEvalEnterpriseContextCoverage0to1",
  "sapAgentEvalEvidenceCoverage0to1",
  "agentEvalObservabilityConfigCoverage0to1",
  "agentEvalObservabilityTelemetryCoverage0to1",
  "agentEvalObservabilityEvidenceCoverage0to1",
  "hedraRagReplayPassRate0to1",
  "hedraRagEvidenceCoverage0to1",
  "agentEvalHarnessToolSuccessRate0to1",
  "agentEvalHarnessTraceCoverage0to1",
  "agentEvalHarnessEvidenceCoverage0to1",
  "strandsBenchmarkHarnessTaskSuccessRate0to1",
  "strandsBenchmarkHarnessPatchApplyRate0to1",
  "strandsBenchmarkHarnessTestPassRate0to1",
  "strandsBenchmarkHarnessTrajectoryCoverage0to1",
  "strandsBenchmarkHarnessEvidenceCoverage0to1",
  "privacyWebEvidenceCoverage0to1",
  "observabilityEvidenceCoverage0to1",
  "naviBenchEvidenceCoverage0to1",
  "legalAgentCitationCoverage0to1",
  "legalAgentEvidenceCoverage0to1",
  "researchGymArtifactCoverage0to1",
  "osUniverseEvidenceCoverage0to1",
  "ollamaMetricsModelLoadedRate0to1",
  "redTeamDatasetCoverage0to1",
  "redTeamTaxonomyCoverage0to1",
  "redTeamAttackCoverage0to1",
  "redTeamGuardCoverage0to1",
  "agentSecurityEvidenceCoverage0to1",
  "agentTestingEvidenceCoverage0to1",
  "chaosImprovementEvalCoverage0to1",
  "chaosEvidenceCoverage0to1",
  "recoveryBenchEvidenceCoverage0to1",
  "adkEvidenceCoverage0to1",
  "physicianBenchTrajectoryCoverage0to1",
  "physicianBenchArtifactCoverage0to1",
  "physicianBenchEvidenceCoverage0to1",
  "ctfFirstCorrectFlagForwardingRate0to1",
  "ctfTraceCoverageRate0to1",
  "ragGeneratedDataFinalCoverage0to1",
  "ragDatasetBuilderEvidenceCoverage0to1",
  "ragStrategyEvidenceCoverage0to1",
  "llmRagEvalSuiteEvidenceCoverage0to1",
  "noMiraclLanguageCoverage0to1",
  "noMiraclSubsetCoverage0to1",
  "scalingLawDiscoveryEvidenceCoverage0to1",
  "genomicsReferenceCoverage0to1",
  "genomicsFormatConformanceRate0to1",
  "genomicsExpertCurationCoverage0to1",
  "agenticSearchTraceCoverage0to1",
  "documentDatasetEvidenceCoverage0to1",
  "localSystemProcessIdentityCoverage0to1",
  "localSystemGhostDriverDetectionCoverage0to1",
  "localSystemProactiveAlertCoverage0to1",
  "localSystemLocalOnlyPrivacyCoverage0to1",
  "localSystemEvidenceCoverage0to1",
  "observabilityTraceCoverage0to1",
  "observabilityReportCoverage0to1",
  "observabilityScenarioClockAlignmentRate0to1",
  "webOperatorReplayCoverage0to1",
  "naviBenchTrajectoryCoverage0to1",
  "naviBenchVisualizationCoverage0to1",
  "researchGymInspectionPassRate0to1",
] as const;

const now = new Date("2026-10-29T00:00:00.000Z");
function window(windowId: string, rows: LiveDriftSampleRow[] = []): LiveDriftWindow {
  return {
    windowId,
    startedAt: "2026-10-28T00:00:00.000Z",
    endedAt: "2026-10-28T01:00:00.000Z",
    rows,
  };
}
function sample(overrides: Partial<LiveDriftSampleRow> = {}): LiveDriftSampleRow {
  return {
    traceId: "trace-1",
    scenarioId: "scenario-1",
    timestamp: "2026-10-28T00:30:00.000Z",
    score0to1: 1,
    passed: true,
    refused: false,
    errored: false,
    behaviorSignature: "task:complete",
    toolCallCount: 0,
    latencyMs: 1,
    costUsd: 0,
    evidenceRefs: ["trace:1"],
    signedEvidenceRefs: ["ledger:signed-1"],
    ...overrides,
  };
}
function run(baseline: LiveDriftSampleRow[] = [], live: LiveDriftSampleRow[] = []) {
  return runLiveScoreBehaviorDrift({
    agentId: "empty-window-agent",
    baselineWindow: window("baseline", baseline),
    liveWindow: window("live", live),
    thresholds: { minBaselineSampleSize: 0, minLiveSampleSize: 0 },
    now,
  });
}

const emptyReceipt = run();
describe("AXE-23 empty live drift windows", () => {
  test("marks both empty distributions as not evaluated", () => {
    expect(emptyReceipt.baselineDistribution).toMatchObject({ evidenceOutcome: "not_evaluated" });
    expect(emptyReceipt.liveDistribution).toMatchObject({ evidenceOutcome: "not_evaluated" });
  });

  test.each(emptyDomainRatios)("%s is null when its domain has no observations", metric => {
    expect(emptyReceipt.baselineDistribution[metric]).toBeNull();
    expect(emptyReceipt.liveDistribution[metric]).toBeNull();
    const unrelatedReceipt = run([sample()], [sample()]);
    expect(unrelatedReceipt.baselineDistribution[metric]).toBeNull();
    expect(unrelatedReceipt.liveDistribution[metric]).toBeNull();
  });

  test.each([{ live: [] }, { live: [sample()] }])(
    "reports vanished PIArena evidence without inventing a measured drop (live=$live)", ({ live }) => {
      const receipt = run([sample({ piArenaBenchmarkId: "piarena", piArenaDefenseBlocked: true })], live);
      expect(receipt.baselineDistribution.piArenaRowCount).toBe(1);
      expect(receipt.liveDistribution.piArenaRowCount).toBe(0);
      expect(receipt.liveDistribution.piArenaEvidenceCoverage0to1).toBeNull();
      expect(receipt.scoreDrift.piArenaEvidenceCoverageDrop0to1).toBeNull();
      expect(receipt.alerts).toContainEqual(expect.objectContaining({
        metricId: "piArenaEvidenceCoverage0to1",
        observed: null,
        message: expect.stringMatching(/evidence missing/i),
      }));
      expect(receipt.failClosed).toBe(true);
      expect(receipt.recommendation).toBe("alert");
    },
  );

  test("empty windows cannot approve even when sample thresholds are zero", () => {
    const receipt = run([], []);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.failClosed).toBe(true);
    for (const windowName of ["Baseline", "Live"]) {
      expect(receipt.alerts).toContainEqual(expect.objectContaining({
        metricId: "sampleSize", observed: null, threshold: 0,
        message: expect.stringContaining(windowName === "Baseline" ? "Baseline evaluation distribution sample size" : "Live production sample size"),
      }));
    }
  });

  test("retains measured zero and one instead of confusing them with an empty domain", () => {
    const receipt = run(
      [sample({ piArenaBenchmarkId: "piarena", piArenaDefenseBlocked: true })],
      [sample({ piArenaBenchmarkId: "piarena", piArenaDefenseBlocked: false, piArenaToolCallSuccessRate0to1: 0 })],
    );
    expect(receipt.baselineDistribution).toMatchObject({ evidenceOutcome: "measured", piArenaDefenseBlockRate0to1: 1 });
    expect(receipt.liveDistribution).toMatchObject({
      evidenceOutcome: "measured", piArenaDefenseBlockRate0to1: 0,
      piArenaToolCallSuccessRateMean0to1: 0, piArenaEvidenceCoverage0to1: 0,
    });
    expect(receipt.scoreDrift.piArenaDefenseBlockRateDrop0to1).toBe(1);
    expect(receipt.alerts.filter(alert => /evidence missing/i.test(alert.message))).toEqual([]);
  });

  test("does not report vanished evidence for domains absent from both windows", () => {
    const receipt = run([sample()], [sample()]);
    expect(receipt.alerts.filter(alert => /evidence missing/i.test(alert.message))).toEqual([]);
  });

  test("preserves null through receipt serialization and hash verification", () => {
    const receipt = run([sample({ piArenaBenchmarkId: "piarena" })]);
    const restored = JSON.parse(JSON.stringify(receipt));
    expect(restored.liveDistribution.piArenaEvidenceCoverage0to1).toBeNull();
    expect(verifyLiveDriftReceipt(restored)).toMatchObject({ valid: true });
  });

  test.each([guardedDrop, guardedDelta])("nullable drift operands remain unavailable", guard => {
    expect(guard(true, 1, null)).toBeNull();
    expect(guard(true, null, 1)).toBeNull();
    expect(guard(false, null, null)).toBeNull();
    expect(guard(false, 1, 0)).toBe(0);
  });
});

const satelliteRunners = [
  ["AI Reputation Claude", runAiReputationClaudeLiveDrift],
  ["Awesome Agent Memory", runAwesomeAgentMemoryLiveDrift],
  ["LLM Fighter", runLlmFighterLiveDrift],
  ["CTF Agent Benchmark", runCtfAgentBenchmarkLiveDrift],
  ["Darwin Godel Machine", runDarwinGodelMachineLiveDrift],
  ["GaRAGe", runGarageLiveDrift],
  ["Agent Reading Test", runAgentReadingTestLiveDrift],
  ["RAIL Score", runRailScoreLiveDrift],
] as const;
function satelliteInput() {
  return {
    agentId: "empty-satellite-agent",
    baselineWindow: { ...window("baseline"), rows: [] },
    liveWindow: { ...window("live"), rows: [] },
    thresholds: { minEvidenceCoverage0to1: 0 },
    liveDriftThresholds: { minBaselineSampleSize: 0, minLiveSampleSize: 0 },
    now,
  };
}
describe("AXE-23 domain monitor empty windows", () => {
  test.each(satelliteRunners)("%s coverage is not evaluated and fails closed even with a zero threshold", (_name, runner) => {
    const result = runner(satelliteInput());
    expect(result.baselineDistribution).toMatchObject({ evidenceOutcome: "not_evaluated", evidenceCoverage0to1: null });
    expect(result.liveDistribution).toMatchObject({ evidenceOutcome: "not_evaluated", evidenceCoverage0to1: null });
    expect(result.scoreDrift.evidenceCoverageDrop0to1).toBeNull();
    expect(result.receipt.failClosed).toBe(true);
    expect(result.receipt.alerts).toContainEqual(expect.objectContaining({ observed: null }));
  });

  test("Darwin Godel Machine lineage and sandbox coverage remain unavailable", () => {
    const result = runDarwinGodelMachineLiveDrift(satelliteInput());
    expect(result.baselineDistribution).toMatchObject({ lineageCoverage0to1: null, sandboxCoverage0to1: null });
    expect(result.liveDistribution).toMatchObject({ lineageCoverage0to1: null, sandboxCoverage0to1: null });
  });

  test("empty RAIL Score raises its evidence coverage alert", () => {
    const result = runRailScoreLiveDrift(satelliteInput());
    expect(result.receipt.alerts).toContainEqual(expect.objectContaining({ metricId: "railEvidenceCoverage0to1", observed: null }));
  });
});

// Static AXE-23 minimum-coverage contracts. Each row admits exactly its named domain.
const minimumCoverageCases: Array<[LiveDriftMetricId, keyof LiveDriftThresholds, Partial<LiveDriftSampleRow>]> = [
  ["redTeamDatasetCoverage0to1", "minRedTeamDatasetCoverage0to1", { redTeamBenchmarkId: "red-team-baseline" }],
  ["redTeamTaxonomyCoverage0to1", "minRedTeamTaxonomyCoverage0to1", { redTeamBenchmarkId: "red-team-baseline" }],
  ["redTeamAttackCoverage0to1", "minRedTeamAttackCoverage0to1", { redTeamBenchmarkId: "red-team-baseline" }],
  ["redTeamGuardCoverage0to1", "minRedTeamGuardCoverage0to1", { redTeamBenchmarkId: "red-team-baseline" }],
  ["piArenaEvidenceCoverage0to1", "minPiArenaEvidenceCoverage0to1", { piArenaBenchmarkId: "piarena-baseline" }],
  ["backdoorAgentTrajectoryCoverage0to1", "minBackdoorAgentTrajectoryCoverage0to1", { backdoorAgentBenchmarkId: "backdoor-baseline" }],
  ["backdoorAgentEvidenceCoverage0to1", "minBackdoorAgentEvidenceCoverage0to1", { backdoorAgentBenchmarkId: "backdoor-baseline" }],
  ["agentSecuritySourceOriginCoverage0to1", "minAgentSecuritySourceOriginCoverage0to1", { agentSecuritySourceOriginCoverage0to1: 0 }],
  ["agentSecurityTaintPropagationCoverage0to1", "minAgentSecurityTaintPropagationCoverage0to1", { agentSecuritySourceOriginCoverage0to1: 0 }],
  ["agentSecuritySecretScrubRate0to1", "minAgentSecuritySecretScrubRate0to1", { agentSecuritySourceOriginCoverage0to1: 0 }],
  ["agentSecurityAuditTrailIntegrity0to1", "minAgentSecurityAuditTrailIntegrity0to1", { agentSecuritySourceOriginCoverage0to1: 0 }],
  ["agentSecurityEvidenceCoverage0to1", "minAgentSecurityEvidenceCoverage0to1", { agentSecuritySourceOriginCoverage0to1: 0 }],
  ["agentTestingMethodologyCoverage0to1", "minAgentTestingMethodologyCoverage0to1", { agentTestingMethodologyCoverage0to1: 0 }],
  ["agentTestingScenarioCoverage0to1", "minAgentTestingScenarioCoverage0to1", { agentTestingMethodologyCoverage0to1: 0 }],
  ["agentTestingFaultInjectionCoverage0to1", "minAgentTestingFaultInjectionCoverage0to1", { agentTestingMethodologyCoverage0to1: 0 }],
  ["agentTestingResiliencePassRate0to1", "minAgentTestingResiliencePassRate0to1", { agentTestingMethodologyCoverage0to1: 0 }],
  ["agentTestingObservabilitySignalCoverage0to1", "minAgentTestingObservabilitySignalCoverage0to1", { agentTestingMethodologyCoverage0to1: 0 }],
  ["agentTestingEvidenceCoverage0to1", "minAgentTestingEvidenceCoverage0to1", { agentTestingMethodologyCoverage0to1: 0 }],
  ["chaosProductionReliabilityMean0to1", "minChaosProductionReliability0to1", { chaosProductionReliability0to1: 0 }],
  ["chaosResilienceScoreMean0to1", "minChaosResilienceScore0to1", { chaosProductionReliability0to1: 0 }],
  ["chaosRecoveryPassRate0to1", "minChaosRecoveryPassRate0to1", { chaosProductionReliability0to1: 0 }],
  ["chaosFailureTraceCoverage0to1", "minChaosFailureTraceCoverage0to1", { chaosProductionReliability0to1: 0 }],
  ["chaosImprovementEvalCoverage0to1", "minChaosImprovementEvalCoverage0to1", { chaosProductionReliability0to1: 0 }],
  ["chaosEvidenceCoverage0to1", "minChaosEvidenceCoverage0to1", { chaosProductionReliability0to1: 0 }],
  ["recoveryBenchReplayIntegrityRate0to1", "minRecoveryBenchReplayIntegrityRate0to1", { recoveryBenchInitialReward0to1: 0 }],
  ["recoveryBenchFailureTraceCoverage0to1", "minRecoveryBenchFailureTraceCoverage0to1", { recoveryBenchInitialReward0to1: 0 }],
  ["recoveryBenchCorruptedEnvironmentCoverage0to1", "minRecoveryBenchCorruptedEnvironmentCoverage0to1", { recoveryBenchInitialReward0to1: 0 }],
  ["recoveryBenchContextCoverage0to1", "minRecoveryBenchContextCoverage0to1", { recoveryBenchInitialReward0to1: 0 }],
  ["recoveryBenchEvidenceCoverage0to1", "minRecoveryBenchEvidenceCoverage0to1", { recoveryBenchInitialReward0to1: 0 }],
  ["adkEvalPassRate0to1", "minAdkEvalPassRate0to1", { adkEvalPassRate0to1: 0 }],
  ["adkToolCallSuccessRate0to1", "minAdkToolCallSuccessRate0to1", { adkEvalPassRate0to1: 0 }],
  ["adkGraphCoverage0to1", "minAdkGraphCoverage0to1", { adkEvalPassRate0to1: 0 }],
  ["adkStreamingStability0to1", "minAdkStreamingStability0to1", { adkEvalPassRate0to1: 0 }],
  ["adkDeploymentReadiness0to1", "minAdkDeploymentReadiness0to1", { adkEvalPassRate0to1: 0 }],
  ["adkEvidenceCoverage0to1", "minAdkEvidenceCoverage0to1", { adkEvalPassRate0to1: 0 }],
  ["physicianBenchTaskSuccessRate0to1", "minPhysicianBenchTaskSuccessRate0to1", { physicianBenchCheckpointPassRate0to1: 0 }],
  ["physicianBenchCheckpointPassRate0to1", "minPhysicianBenchCheckpointPassRate0to1", { physicianBenchCheckpointPassRate0to1: 0 }],
  ["physicianBenchFhirDataAccessAccuracy0to1", "minPhysicianBenchFhirDataAccessAccuracy0to1", { physicianBenchCheckpointPassRate0to1: 0 }],
  ["physicianBenchClinicalActionSafetyRate0to1", "minPhysicianBenchClinicalActionSafetyRate0to1", { physicianBenchCheckpointPassRate0to1: 0 }],
  ["physicianBenchDocumentationQualityMean0to1", "minPhysicianBenchDocumentationQuality0to1", { physicianBenchCheckpointPassRate0to1: 0 }],
  ["physicianBenchTrajectoryCoverage0to1", "minPhysicianBenchTrajectoryCoverage0to1", { physicianBenchCheckpointPassRate0to1: 0 }],
  ["physicianBenchArtifactCoverage0to1", "minPhysicianBenchArtifactCoverage0to1", { physicianBenchCheckpointPassRate0to1: 0 }],
  ["physicianBenchEvidenceCoverage0to1", "minPhysicianBenchEvidenceCoverage0to1", { physicianBenchCheckpointPassRate0to1: 0 }],
  ["ragGeneratedDataFinalCoverage0to1", "minRagGeneratedDataFinalCoverage0to1", { ragCorpusId: "rag-baseline" }],
  ["ragPassageGroundingCoverage0to1", "minRagPassageGroundingCoverage0to1", { ragPassageGroundingCoverage0to1: 0 }],
  ["ragHumanVerificationCoverage0to1", "minRagHumanVerificationCoverage0to1", { ragPassageGroundingCoverage0to1: 0 }],
  ["ragCitationCoverage0to1", "minRagCitationCoverage0to1", { ragPassageGroundingCoverage0to1: 0 }],
  ["ragAnswerSupportCoverage0to1", "minRagAnswerSupportCoverage0to1", { ragPassageGroundingCoverage0to1: 0 }],
  ["ragDatasetBuilderEvidenceCoverage0to1", "minRagDatasetBuilderEvidenceCoverage0to1", { ragPassageGroundingCoverage0to1: 0 }],
  ["ragStrategyEvidenceCoverage0to1", "minRagStrategyEvidenceCoverage0to1", { ragStrategyComparisonId: "rag-strategy-baseline" }],
  ["kiteEvidenceCoverage0to1", "minKiteEvidenceCoverage0to1", { kiteEvidenceCoverage0to1: 0 }],
  ["pokerEvalEvidenceCoverage0to1", "minPokerEvalEvidenceCoverage0to1", { pokerEvalEvidenceCoverage0to1: 0 }],
  ["llmRagEvalSuiteEvidenceCoverage0to1", "minLlmRagEvalSuiteEvidenceCoverage0to1", { llmRagSemanticSimilarity0to1: 0 }],
  ["noMiraclLanguageCoverage0to1", "minNoMiraclLanguageCoverage0to1", { noMiraclRelevanceAccuracy0to1: 0 }],
  ["noMiraclSubsetCoverage0to1", "minNoMiraclSubsetCoverage0to1", { noMiraclRelevanceAccuracy0to1: 0 }],
  ["noMiraclEvidenceCoverage0to1", "minNoMiraclEvidenceCoverage0to1", { noMiraclRelevanceAccuracy0to1: 0 }],
  ["scalingLawDiscoveryEvidenceCoverage0to1", "minScalingLawEvidenceCoverage0to1", { scalingLawR2: 0 }],
  ["genomicsReferenceCoverage0to1", "minGenomicsReferenceCoverage0to1", { genomicsProblemId: "genomics-baseline" }],
  ["genomicsFormatConformanceRate0to1", "minGenomicsFormatConformanceRate0to1", { genomicsProblemId: "genomics-baseline" }],
  ["genomicsExpertCurationCoverage0to1", "minGenomicsExpertCurationCoverage0to1", { genomicsProblemId: "genomics-baseline" }],
  ["agenticSearchCitationCoverage0to1", "minAgenticSearchCitationCoverage0to1", { agenticSearchBenchmarkId: "search-baseline" }],
  ["agenticSearchTraceCoverage0to1", "minAgenticSearchTraceCoverage0to1", { agenticSearchBenchmarkId: "search-baseline" }],
  ["documentDatasetNumGuardCoverage0to1", "minDocumentDatasetNumGuardCoverage0to1", { documentDatasetNumGuardCoverage0to1: 0 }],
  ["documentDatasetEvidenceCoverage0to1", "minDocumentDatasetEvidenceCoverage0to1", { documentDatasetNumGuardCoverage0to1: 0 }],
  ["cpuAgenticEvidenceCoverage0to1", "minCpuAgenticEvidenceCoverage0to1", { cpuAgenticLatencyP95Ms: 0 }],
  ["evalTechniqueAlgorithmicFeedbackCoverage0to1", "minEvalTechniqueAlgorithmicFeedbackCoverage0to1", { evalTechniqueSuiteId: "eval-baseline" }],
  ["evalTechniqueEvidenceCoverage0to1", "minEvalTechniqueEvidenceCoverage0to1", { evalTechniqueSuiteId: "eval-baseline" }],
  ["sapAgentEvalObjectiveCoverage0to1", "minSapAgentEvalObjectiveCoverage0to1", { sapAgentEvalObjectiveCoverage0to1: 0 }],
  ["sapAgentEvalProcessCoverage0to1", "minSapAgentEvalProcessCoverage0to1", { sapAgentEvalObjectiveCoverage0to1: 0 }],
  ["sapAgentEvalEnterpriseContextCoverage0to1", "minSapAgentEvalEnterpriseContextCoverage0to1", { sapAgentEvalObjectiveCoverage0to1: 0 }],
  ["sapAgentEvalEvidenceCoverage0to1", "minSapAgentEvalEvidenceCoverage0to1", { sapAgentEvalObjectiveCoverage0to1: 0 }],
  ["agentEvalObservabilityConfigCoverage0to1", "minAgentEvalObservabilityConfigCoverage0to1", { agentEvalObservabilityConfigCoverage0to1: 0 }],
  ["agentEvalObservabilityTelemetryCoverage0to1", "minAgentEvalObservabilityTelemetryCoverage0to1", { agentEvalObservabilityConfigCoverage0to1: 0 }],
  ["agentEvalObservabilityEvidenceCoverage0to1", "minAgentEvalObservabilityEvidenceCoverage0to1", { agentEvalObservabilityConfigCoverage0to1: 0 }],
  ["hedraRagReplayPassRate0to1", "minHedraRagReplayPassRate0to1", { hedraRagArtifactId: "hedra-baseline" }],
  ["hedraRagEvidenceCoverage0to1", "minHedraRagEvidenceCoverage0to1", { hedraRagArtifactId: "hedra-baseline" }],
  ["agentEvalHarnessTraceCoverage0to1", "minAgentEvalHarnessTraceCoverage0to1", { agentEvalHarnessToolSuccessRate0to1: 0 }],
  ["agentEvalHarnessEvidenceCoverage0to1", "minAgentEvalHarnessEvidenceCoverage0to1", { agentEvalHarnessToolSuccessRate0to1: 0 }],
  ["strandsBenchmarkHarnessTrajectoryCoverage0to1", "minStrandsBenchmarkHarnessTrajectoryCoverage0to1", { strandsBenchmarkHarnessTaskSuccessRate0to1: 0 }],
  ["strandsBenchmarkHarnessEvidenceCoverage0to1", "minStrandsBenchmarkHarnessEvidenceCoverage0to1", { strandsBenchmarkHarnessTaskSuccessRate0to1: 0 }],
  ["privacyWebEvidenceCoverage0to1", "minPrivacyWebEvidenceCoverage0to1", { privacyWebDataMinimizationPassRate0to1: 0 }],
  ["localSystemProcessIdentityCoverage0to1", "minLocalSystemProcessIdentityCoverage0to1", { localSystemVoltageRailId: "rail-baseline" }],
  ["localSystemGhostDriverDetectionCoverage0to1", "minLocalSystemGhostDriverDetectionCoverage0to1", { localSystemVoltageRailId: "rail-baseline" }],
  ["localSystemProactiveAlertCoverage0to1", "minLocalSystemProactiveAlertCoverage0to1", { localSystemVoltageRailId: "rail-baseline" }],
  ["localSystemLocalOnlyPrivacyCoverage0to1", "minLocalSystemLocalOnlyPrivacyCoverage0to1", { localSystemVoltageRailId: "rail-baseline" }],
  ["localSystemEvidenceCoverage0to1", "minLocalSystemEvidenceCoverage0to1", { localSystemVoltageRailId: "rail-baseline" }],
  ["observabilityEvidenceCoverage0to1", "minObservabilityEvidenceCoverage0to1", { observabilityIncidentContextId: "incident-baseline" }],
  ["observabilityTraceCoverage0to1", "minObservabilityTraceCoverage0to1", { observabilityIncidentContextId: "incident-baseline" }],
  ["observabilityReportCoverage0to1", "minObservabilityReportCoverage0to1", { observabilityIncidentContextId: "incident-baseline" }],
  ["observabilityScenarioClockAlignmentRate0to1", "minObservabilityScenarioClockAlignmentRate0to1", { observabilityIncidentContextId: "incident-baseline" }],
  ["ollamaMetricsModelLoadedRate0to1", "minOllamaMetricsModelLoadedRate0to1", { ollamaMetricsPromptTokensTotal: 0 }],
  ["ollamaMetricsEvidenceCoverage0to1", "minOllamaMetricsEvidenceCoverage0to1", { ollamaMetricsPromptTokensTotal: 0 }],
  ["webOperatorReplayCoverage0to1", "minWebOperatorReplayCoverage0to1", { webOperatorBenchmarkId: "web-baseline" }],
  ["naviBenchTrajectoryCoverage0to1", "minNaviBenchTrajectoryCoverage0to1", { naviBenchLowerBoundScore0to1: 0 }],
  ["naviBenchVisualizationCoverage0to1", "minNaviBenchVisualizationCoverage0to1", { naviBenchLowerBoundScore0to1: 0 }],
  ["naviBenchEvidenceCoverage0to1", "minNaviBenchEvidenceCoverage0to1", { naviBenchLowerBoundScore0to1: 0 }],
  ["legalAgentCitationCoverage0to1", "minLegalAgentCitationCoverage0to1", { legalAgentCitationCoverage0to1: 0 }],
  ["legalAgentEvidenceCoverage0to1", "minLegalAgentEvidenceCoverage0to1", { legalAgentCitationCoverage0to1: 0 }],
  ["researchGymArtifactCoverage0to1", "minResearchGymArtifactCoverage0to1", { researchGymBaselineScore0to1: 0 }],
  ["researchGymInspectionPassRate0to1", "minResearchGymInspectionPassRate0to1", { researchGymBaselineScore0to1: 0 }],
  ["osUniverseEvidenceCoverage0to1", "minOsUniverseEvidenceCoverage0to1", { osUniverseValidationErrorRate0to1: 0 }],
  ["ctfFirstFlagForwardingRate0to1", "minCtfFirstCorrectFlagForwardingRate0to1", { ctfEventId: "ctf-baseline" }],
  ["ctfTraceCoverageRate0to1", "minCtfTraceCoverageRate0to1", { ctfVmImageHash: "ctf-vm-baseline" }],
  ["credenceEngineEvidenceCoverage0to1", "minCredenceEngineEvidenceCoverage0to1", { credenceEngineDecisionQuality0to1: 0 }],
];

const twoWindowMinimumMetrics = [
  "llmRagEvalSuiteEvidenceCoverage0to1",
  "noMiraclLanguageCoverage0to1",
  "noMiraclSubsetCoverage0to1",
  "noMiraclEvidenceCoverage0to1",
  "scalingLawDiscoveryEvidenceCoverage0to1",
  "hedraRagReplayPassRate0to1",
  "hedraRagEvidenceCoverage0to1",
  "agentEvalHarnessTraceCoverage0to1",
  "agentEvalHarnessEvidenceCoverage0to1",
  "strandsBenchmarkHarnessTrajectoryCoverage0to1",
  "strandsBenchmarkHarnessEvidenceCoverage0to1",
  "ollamaMetricsModelLoadedRate0to1",
  "ollamaMetricsEvidenceCoverage0to1",
 ] as readonly string[];

const zeroMinimumThresholds = {
  ...Object.fromEntries(minimumCoverageCases.map(([, threshold]) => [threshold, 0])),
  minBaselineSampleSize: 0,
  minLiveSampleSize: 0,
};

describe("AXE-23 nullable minimum coverage guards", () => {
  test.each(minimumCoverageCases)("%s missing live evidence alerts even at a zero minimum", (metricId, _threshold, signal) => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "missing-domain-agent",
      baselineWindow: window("baseline", [sample(signal)]),
      liveWindow: window("live", [sample()]),
      thresholds: zeroMinimumThresholds,
      now,
    });
    expect(receipt.alerts).toContainEqual(expect.objectContaining({ metricId, observed: null }));
    expect(receipt.recommendation).toBe("alert");
  });

  test.each(minimumCoverageCases.filter(([metric]) => twoWindowMinimumMetrics.includes(metric)))(
    "%s retains unavailable baseline coverage when live evidence exists", (metricId, _threshold, signal) => {
      const receipt = runLiveScoreBehaviorDrift({
        agentId: "missing-baseline-domain-agent",
        baselineWindow: window("baseline", [sample()]),
        liveWindow: window("live", [sample(signal)]),
        thresholds: zeroMinimumThresholds,
        now,
      });
      expect(receipt.alerts).toContainEqual(expect.objectContaining({ metricId, observed: null }));
    },
  );

  test("empty baseline and live samples fail closed even at zero sample minima", () => {
    expect(emptyReceipt.alerts.filter(alert => alert.metricId === "sampleSize")).toHaveLength(2);
    expect(emptyReceipt.alerts.filter(alert => alert.metricId === "sampleSize")).toEqual([
      expect.objectContaining({ observed: null, threshold: 0 }),
      expect.objectContaining({ observed: null, threshold: 0 }),
    ]);
  });

  test("Darwin lineage and sandbox null guards alert even at zero minima", () => {
    const result = runDarwinGodelMachineLiveDrift({
      ...satelliteInput(),
      thresholds: { minLineageCoverage0to1: 0, minSandboxCoverage0to1: 0, minEvidenceCoverage0to1: 0 },
    });
    expect(result.receipt.alerts).toContainEqual(expect.objectContaining({ metricId: "darwinGodelLineageCoverage0to1", observed: null }));
    expect(result.receipt.alerts).toContainEqual(expect.objectContaining({ metricId: "darwinGodelSandboxCoverage0to1", observed: null }));
  });
});
