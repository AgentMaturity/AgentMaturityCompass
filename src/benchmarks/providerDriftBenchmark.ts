import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export type ProviderDriftMetricId =
  | "scoreMean0to1"
  | "refusalRate0to1"
  | "latencyMsP95"
  | "costUsdMean"
  | "trajectoryCount"
  | "invalidActionRate0to1"
  | "errorAttributionRate0to1"
  | "judgeAgreement0to1"
  | "unjudgedPredictionRate0to1"
  | "repairEffectiveness0to1"
  | "falsePositiveIdentification0to1"
  | "netCodebaseImpact0to1"
  | "artifactAccuracy0to1"
  | "formulaIntegrity0to1"
  | "formatQuality0to1"
  | "protocolSuccessRate0to1"
  | "agreementRate0to1"
  | "targetOutcomeValue0to1"
  | "latentPreferenceAlignment0to1"
  | "evaluatorCoverage0to1"
  | "guardrailPassRate0to1"
  | "scoreThresholdPassRate0to1"
  | "retryStability0to1"
  | "progressAuc0to1"
  | "progressPerTurn0to1"
  | "passAtK0to1"
  | "passPowerK0to1"
  | "subgoalCompletionRate0to1"
  | "expectedToolCallCoverage0to1"
  | "personaCoverage0to1"
  | "errorClusterRate0to1"
  | "sampleSize"
  | "evidenceRefs"
  | "signedEvidenceRefs"
  | "evaluationFrameworkEvidence"
  | "observabilityPipelineEvidence"
  | "orbitMonitorEvidence"
  | "geospatialToolCallingEvidence"
  | "falconEvaluateEvidence"
  | "agentDefenseBenchEvidence"
  | "evidraEvidenceChainEvidence"
  | "galileoObservabilityEvidence"
  | "agentDefenseBenchDefenseCoverage0to1"
  | "agentDefenseBenchPromptInjectionBlockRate0to1"
  | "agentDefenseBenchJailbreakBlockRate0to1"
  | "agentDefenseBenchToolPoisoningBlockRate0to1"
  | "agentDefenseBenchBenignPassRate0to1";

export type ProviderDriftRecommendation = "approve" | "monitor" | "alert" | "waive";
export type ProviderDriftStatus = "passed" | "monitor" | "alert" | "waived";
export type ProviderDriftSeverity = "low" | "medium" | "high" | "critical";
export type ProviderDriftVerdictAggregation =
  | "mean"
  | "majority"
  | "g_eval_probability_weighted"
  | "temperature_controlled_power_mean"
  | "custom";

export interface ProviderDriftCanaryRow {
  provider: string;
  model: string;
  version?: string;
  canaryId: string;
  benchmarkFamily?: string;
  capabilityId?: string;
  arenaId?: string;
  environmentId?: string;
  referencePoolId?: string;
  evaluationFrameworkId?: string;
  evaluationFrameworkVersion?: string;
  providerRouteId?: string;
  metricSuiteId?: string;
  metricIds?: string[];
  metricCount?: number;
  evaluatorConfigHash?: string;
  generatedTestDataHash?: string;
  verdictAggregation?: ProviderDriftVerdictAggregation;
  verdictAggregationConfigHash?: string;
  verdictTemperature?: number;
  verdictPowerMeanP?: number;
  dashboardArtifactHash?: string;
  falconEvaluateSourceRefHash?: string;
  falconEvaluateRepositorySnapshotHash?: string;
  falconEvaluateLicenseRefHash?: string;
  falconEvaluateDefaultBranchHash?: string;
  falconEvaluateReleaseTag?: string;
  falconEvaluatePackageManifestHash?: string;
  falconEvaluateLockfileHash?: string;
  falconEvaluateRequirementsHash?: string;
  falconEvaluateReadmeHash?: string;
  falconEvaluateDocsIndexHash?: string;
  falconEvaluateWorkflowHash?: string;
  falconEvaluateEvaluationModuleHash?: string;
  falconEvaluateContextRelevancyModuleHash?: string;
  falconEvaluateFairnessModuleHash?: string;
  falconEvaluateReliabilityModuleHash?: string;
  falconEvaluateSecurityModuleHash?: string;
  falconEvaluateMachineEthicsModuleHash?: string;
  falconEvaluateResultsModuleHash?: string;
  falconEvaluatePlotModuleHash?: string;
  falconEvaluateUserAnalyticsModuleHash?: string;
  falconEvaluateValidationDataSchemaHash?: string;
  falconEvaluateMetricFamilyIds?: string[];
  falconEvaluateMetricIds?: string[];
  falconEvaluateMetricCount?: number;
  falconEvaluateProviderRouteId?: string;
  falconEvaluateCanaryResultHash?: string;
  pipelineOrchestratorId?: string;
  pipelineRunId?: string;
  experimentTrackerId?: string;
  experimentRunId?: string;
  observabilityProjectId?: string;
  datastoreId?: string;
  retrievalIndexHash?: string;
  contentDatasetHash?: string;
  summaryArtifactHash?: string;
  qaDatasetHash?: string;
  traceExportHash?: string;
  metricReportHash?: string;
  pipelineConfigHash?: string;
  orbitMonitorSourceRefHash?: string;
  orbitMonitorRepositorySnapshotHash?: string;
  orbitMonitorLicenseRefHash?: string;
  orbitMonitorSourceCatalogHash?: string;
  orbitMonitorLeaderboardSnapshotHash?: string;
  orbitMonitorModelRegistrySnapshotHash?: string;
  orbitMonitorBenchmarkFeedSnapshotHash?: string;
  orbitMonitorNewsFeedSnapshotHash?: string;
  orbitMonitorReloadRunHash?: string;
  orbitMonitorRankingPolicyHash?: string;
  orbitMonitorSummaryArtifactHash?: string;
  orbitMonitorSourceCount?: number;
  minOrbitMonitorSourceCount?: number;
  orbitMonitorLeaderboardCategoryCount?: number;
  minOrbitMonitorLeaderboardCategoryCount?: number;
  orbitMonitorDailyReloadVerified?: boolean;
  geospatialBenchmarkId?: string;
  geospatialTaskSetHash?: string;
  geospatialDatasetSnapshotHash?: string;
  geospatialToolRegistryHash?: string;
  geospatialReferenceSolutionHash?: string;
  geospatialTraceExportHash?: string;
  geospatialJudgePanelId?: string;
  geospatialJudgeConfigHash?: string;
  geospatialHumanCalibrationHash?: string;
  geospatialResultReportHash?: string;
  geospatialTokenCostReportHash?: string;
  geospatialTaskComplexityGroups?: string[];
  geospatialSolvableTaskCount?: number;
  geospatialUnsolvableTaskCount?: number;
  geospatialToolCount?: number;
  geospatialMaxToolIterations?: number;
  agentDefenseBenchSourceRefHash?: string;
  agentDefenseBenchRepositorySnapshotHash?: string;
  agentDefenseBenchLicenseRefHash?: string;
  agentDefenseBenchDefaultBranchHash?: string;
  agentDefenseBenchReadmeHash?: string;
  agentDefenseBenchChecksumsHash?: string;
  agentDefenseBenchCitationHash?: string;
  agentDefenseBenchRequirementsHash?: string;
  agentDefenseBenchMcpServerManifestHash?: string;
  agentDefenseBenchAttackBankHash?: string;
  agentDefenseBenchAcademicBenchmarkHash?: string;
  agentDefenseBenchSafetyBenchmarkHash?: string;
  agentDefenseBenchCybersecurityBenchmarkHash?: string;
  agentDefenseBenchMcpSpecificSuiteHash?: string;
  agentDefenseBenchDefenseServerHash?: string;
  agentDefenseBenchPolicyHash?: string;
  agentDefenseBenchRunConfigHash?: string;
  agentDefenseBenchProviderRouteId?: string;
  agentDefenseBenchCanaryResultHash?: string;
  agentDefenseBenchDriftStatisticHash?: string;
  agentDefenseBenchAlertOrWaiverHash?: string;
  agentDefenseBenchReplayCommandHash?: string;
  agentDefenseBenchCiReceiptHash?: string;
  agentDefenseBenchMcpServerCount?: number;
  minAgentDefenseBenchMcpServerCount?: number;
  agentDefenseBenchAttackSuiteIds?: string[];
  minAgentDefenseBenchAttackSuiteIds?: number;
  agentDefenseBenchDefenseCoverage0to1?: number;
  minAgentDefenseBenchDefenseCoverage0to1?: number;
  agentDefenseBenchPromptInjectionBlockRate0to1?: number;
  agentDefenseBenchJailbreakBlockRate0to1?: number;
  agentDefenseBenchToolPoisoningBlockRate0to1?: number;
  agentDefenseBenchBenignPassRate0to1?: number;
  evidraSourceRefHash?: string;
  evidraRepositorySnapshotHash?: string;
  evidraLicenseRefHash?: string;
  evidraDefaultBranchHash?: string;
  evidraReleaseTag?: string;
  evidraReadmeHash?: string;
  evidraGoModHash?: string;
  evidraCiWorkflowHash?: string;
  evidraReleaseWorkflowHash?: string;
  evidraDockerfileHash?: string;
  evidraCliTreeHash?: string;
  evidraMcpTreeHash?: string;
  evidraApiCommandHash?: string;
  evidraEvidenceSignerHash?: string;
  evidraEvidencePackageHash?: string;
  evidraEvlockPackageHash?: string;
  evidraExecContractPackageHash?: string;
  evidraExportPackageHash?: string;
  evidraMcpServerPackageHash?: string;
  evidraProxyPackageHash?: string;
  evidraLifecycleServiceHash?: string;
  evidraPipelineBridgeHash?: string;
  evidraScoreCompareHash?: string;
  evidraTestsTreeHash?: string;
  evidraDocsTreeHash?: string;
  evidraSignalValidationGuideHash?: string;
  evidraPrescribeCommandHash?: string;
  evidraReportCommandHash?: string;
  evidraRecordCommandHash?: string;
  evidraValidateCommandHash?: string;
  evidraScorecardCommandHash?: string;
  evidraPrescribeReportProtocolHash?: string;
  evidraProviderRouteId?: string;
  evidraCanaryResultHash?: string;
  evidraBaselineSampleManifestHash?: string;
  evidraLiveSampleManifestHash?: string;
  evidraDriftStatisticHash?: string;
  evidraAlertOrWaiverHash?: string;
  evidraReplayCommandHash?: string;
  evidraCiReceiptHash?: string;
  evidraNoSourceCopyProofHash?: string;
  evidraSignedEvidenceChainHash?: string;
  galileoSourceRefHash?: string;
  galileoWebsiteSnapshotHash?: string;
  galileoDocsIndexHash?: string;
  galileoProductSurfaceId?: string;
  galileoProjectId?: string;
  galileoDatasetHash?: string;
  galileoPromptSetHash?: string;
  galileoTraceExportHash?: string;
  galileoMetricReportHash?: string;
  galileoEvaluatorConfigHash?: string;
  galileoProviderRouteId?: string;
  galileoCanaryResultHash?: string;
  galileoDriftStatisticHash?: string;
  galileoAlertOrWaiverHash?: string;
  galileoSignedEvidenceBundleHash?: string;
  galileoNoSourceCopyProofHash?: string;
  galileoMetricIds?: string[];
  galileoMetricCount?: number;
  sampleSize: number;
  trajectoryCount?: number;
  scoreMean0to1: number;
  refusalRate0to1: number;
  invalidActionRate0to1?: number;
  errorAttributionRate0to1?: number;
  judgeAgreement0to1?: number;
  unjudgedPredictionRate0to1?: number;
  repairEffectiveness0to1?: number;
  falsePositiveIdentification0to1?: number;
  netCodebaseImpact0to1?: number;
  artifactAccuracy0to1?: number;
  formulaIntegrity0to1?: number;
  formatQuality0to1?: number;
  protocolSuccessRate0to1?: number;
  agreementRate0to1?: number;
  targetOutcomeValue0to1?: number;
  latentPreferenceAlignment0to1?: number;
  evaluatorCoverage0to1?: number;
  guardrailPassRate0to1?: number;
  scoreThresholdPassRate0to1?: number;
  retryStability0to1?: number;
  progressAuc0to1?: number;
  progressPerTurn0to1?: number;
  passAtK0to1?: number;
  passPowerK0to1?: number;
  subgoalCompletionRate0to1?: number;
  expectedToolCallCoverage0to1?: number;
  personaCoverage0to1?: number;
  errorClusterRate0to1?: number;
  latencyMsP95: number;
  costUsdMean: number;
  evidenceRefs: string[];
  signedEvidenceRefs?: string[];
}

export interface ProviderDriftThresholds {
  minSampleSize: number;
  minTrajectoryCount: number;
  maxScoreDrop0to1: number;
  maxRefusalRateIncrease0to1: number;
  maxInvalidActionRateIncrease0to1: number;
  maxErrorAttributionRateIncrease0to1: number;
  maxJudgeAgreementDrop0to1: number;
  maxUnjudgedPredictionRateIncrease0to1: number;
  maxRepairEffectivenessDrop0to1: number;
  maxFalsePositiveIdentificationDrop0to1: number;
  maxNetCodebaseImpactDrop0to1: number;
  maxArtifactAccuracyDrop0to1: number;
  maxFormulaIntegrityDrop0to1: number;
  maxFormatQualityDrop0to1: number;
  maxProtocolSuccessRateDrop0to1: number;
  maxAgreementRateDrop0to1: number;
  maxTargetOutcomeValueDrop0to1: number;
  maxLatentPreferenceAlignmentDrop0to1: number;
  maxEvaluatorCoverageDrop0to1: number;
  maxGuardrailPassRateDrop0to1: number;
  maxScoreThresholdPassRateDrop0to1: number;
  maxRetryStabilityDrop0to1: number;
  maxProgressAucDrop0to1: number;
  maxProgressPerTurnDrop0to1: number;
  maxPassAtKDrop0to1: number;
  maxPassPowerKDrop0to1: number;
  maxSubgoalCompletionRateDrop0to1: number;
  maxExpectedToolCallCoverageDrop0to1: number;
  maxPersonaCoverageDrop0to1: number;
  maxErrorClusterRateIncrease0to1: number;
  minEvaluationMetricCount: number;
  minOrbitMonitorSourceCount: number;
  minOrbitMonitorLeaderboardCategoryCount: number;
  minGeospatialTaskComplexityGroups: number;
  minGeospatialSolvableTaskCount: number;
  minGeospatialUnsolvableTaskCount: number;
  minGeospatialToolCount: number;
  minGeospatialMaxToolIterations: number;
  minAgentDefenseBenchMcpServerCount: number;
  minAgentDefenseBenchAttackSuiteIds: number;
  minAgentDefenseBenchDefenseCoverage0to1: number;
  maxAgentDefenseBenchDefenseCoverageDrop0to1: number;
  maxAgentDefenseBenchPromptInjectionBlockRateDrop0to1: number;
  maxAgentDefenseBenchJailbreakBlockRateDrop0to1: number;
  maxAgentDefenseBenchToolPoisoningBlockRateDrop0to1: number;
  maxAgentDefenseBenchBenignPassRateDrop0to1: number;
  maxLatencyIncreaseRatio: number;
  maxCostIncreaseRatio: number;
}

export interface ProviderDriftWaiver {
  waiverId: string;
  provider?: string;
  model?: string;
  canaryId?: string;
  metricIds?: ProviderDriftMetricId[];
  reason: string;
  approvedBy: string;
  expiresAt: string;
  evidenceRefs: string[];
}

export interface ProviderDriftAlert {
  alertId: string;
  provider: string;
  model: string;
  canaryId: string;
  metricId: ProviderDriftMetricId;
  severity: ProviderDriftSeverity;
  message: string;
  threshold: number;
  observed: number;
  evidenceRefs: string[];
  waived: boolean;
  waiverId?: string;
}

export interface ProviderDriftComparison {
  provider: string;
  model: string;
  canaryId: string;
  baselineBenchmarkFamily?: string;
  candidateBenchmarkFamily?: string;
  baselineCapabilityId?: string;
  candidateCapabilityId?: string;
  baselineArenaId?: string;
  candidateArenaId?: string;
  baselineEnvironmentId?: string;
  candidateEnvironmentId?: string;
  baselineReferencePoolId?: string;
  candidateReferencePoolId?: string;
  baselineEvaluationFrameworkId?: string;
  candidateEvaluationFrameworkId?: string;
  baselineEvaluationFrameworkVersion?: string;
  candidateEvaluationFrameworkVersion?: string;
  baselineProviderRouteId?: string;
  candidateProviderRouteId?: string;
  baselineMetricSuiteId?: string;
  candidateMetricSuiteId?: string;
  baselineMetricIds: string[];
  candidateMetricIds: string[];
  baselineMetricCount: number;
  candidateMetricCount: number;
  baselineEvaluatorConfigHash?: string;
  candidateEvaluatorConfigHash?: string;
  baselineGeneratedTestDataHash?: string;
  candidateGeneratedTestDataHash?: string;
  baselineVerdictAggregation?: ProviderDriftVerdictAggregation;
  candidateVerdictAggregation?: ProviderDriftVerdictAggregation;
  baselineVerdictAggregationConfigHash?: string;
  candidateVerdictAggregationConfigHash?: string;
  baselineVerdictTemperature?: number;
  candidateVerdictTemperature?: number;
  baselineVerdictPowerMeanP?: number;
  candidateVerdictPowerMeanP?: number;
  baselineDashboardArtifactHash?: string;
  candidateDashboardArtifactHash?: string;
  evaluationFrameworkMissingReasons: string[];
  baselineFalconEvaluateSourceRefHash?: string;
  candidateFalconEvaluateSourceRefHash?: string;
  baselineFalconEvaluateRepositorySnapshotHash?: string;
  candidateFalconEvaluateRepositorySnapshotHash?: string;
  baselineFalconEvaluateLicenseRefHash?: string;
  candidateFalconEvaluateLicenseRefHash?: string;
  baselineFalconEvaluateDefaultBranchHash?: string;
  candidateFalconEvaluateDefaultBranchHash?: string;
  baselineFalconEvaluateReleaseTag?: string;
  candidateFalconEvaluateReleaseTag?: string;
  baselineFalconEvaluatePackageManifestHash?: string;
  candidateFalconEvaluatePackageManifestHash?: string;
  baselineFalconEvaluateLockfileHash?: string;
  candidateFalconEvaluateLockfileHash?: string;
  baselineFalconEvaluateRequirementsHash?: string;
  candidateFalconEvaluateRequirementsHash?: string;
  baselineFalconEvaluateReadmeHash?: string;
  candidateFalconEvaluateReadmeHash?: string;
  baselineFalconEvaluateDocsIndexHash?: string;
  candidateFalconEvaluateDocsIndexHash?: string;
  baselineFalconEvaluateWorkflowHash?: string;
  candidateFalconEvaluateWorkflowHash?: string;
  baselineFalconEvaluateEvaluationModuleHash?: string;
  candidateFalconEvaluateEvaluationModuleHash?: string;
  baselineFalconEvaluateContextRelevancyModuleHash?: string;
  candidateFalconEvaluateContextRelevancyModuleHash?: string;
  baselineFalconEvaluateFairnessModuleHash?: string;
  candidateFalconEvaluateFairnessModuleHash?: string;
  baselineFalconEvaluateReliabilityModuleHash?: string;
  candidateFalconEvaluateReliabilityModuleHash?: string;
  baselineFalconEvaluateSecurityModuleHash?: string;
  candidateFalconEvaluateSecurityModuleHash?: string;
  baselineFalconEvaluateMachineEthicsModuleHash?: string;
  candidateFalconEvaluateMachineEthicsModuleHash?: string;
  baselineFalconEvaluateResultsModuleHash?: string;
  candidateFalconEvaluateResultsModuleHash?: string;
  baselineFalconEvaluatePlotModuleHash?: string;
  candidateFalconEvaluatePlotModuleHash?: string;
  baselineFalconEvaluateUserAnalyticsModuleHash?: string;
  candidateFalconEvaluateUserAnalyticsModuleHash?: string;
  baselineFalconEvaluateValidationDataSchemaHash?: string;
  candidateFalconEvaluateValidationDataSchemaHash?: string;
  baselineFalconEvaluateMetricFamilyIds: string[];
  candidateFalconEvaluateMetricFamilyIds: string[];
  baselineFalconEvaluateMetricIds: string[];
  candidateFalconEvaluateMetricIds: string[];
  baselineFalconEvaluateMetricCount: number;
  candidateFalconEvaluateMetricCount: number;
  baselineFalconEvaluateProviderRouteId?: string;
  candidateFalconEvaluateProviderRouteId?: string;
  baselineFalconEvaluateCanaryResultHash?: string;
  candidateFalconEvaluateCanaryResultHash?: string;
  falconEvaluateMissingReasons: string[];
  baselinePipelineOrchestratorId?: string;
  candidatePipelineOrchestratorId?: string;
  baselinePipelineRunId?: string;
  candidatePipelineRunId?: string;
  baselineExperimentTrackerId?: string;
  candidateExperimentTrackerId?: string;
  baselineExperimentRunId?: string;
  candidateExperimentRunId?: string;
  baselineObservabilityProjectId?: string;
  candidateObservabilityProjectId?: string;
  baselineDatastoreId?: string;
  candidateDatastoreId?: string;
  baselineRetrievalIndexHash?: string;
  candidateRetrievalIndexHash?: string;
  baselineContentDatasetHash?: string;
  candidateContentDatasetHash?: string;
  baselineSummaryArtifactHash?: string;
  candidateSummaryArtifactHash?: string;
  baselineQaDatasetHash?: string;
  candidateQaDatasetHash?: string;
  baselineTraceExportHash?: string;
  candidateTraceExportHash?: string;
  baselineMetricReportHash?: string;
  candidateMetricReportHash?: string;
  baselinePipelineConfigHash?: string;
  candidatePipelineConfigHash?: string;
  observabilityPipelineMissingReasons: string[];
  baselineOrbitMonitorSourceRefHash?: string;
  candidateOrbitMonitorSourceRefHash?: string;
  baselineOrbitMonitorRepositorySnapshotHash?: string;
  candidateOrbitMonitorRepositorySnapshotHash?: string;
  baselineOrbitMonitorLicenseRefHash?: string;
  candidateOrbitMonitorLicenseRefHash?: string;
  baselineOrbitMonitorSourceCatalogHash?: string;
  candidateOrbitMonitorSourceCatalogHash?: string;
  baselineOrbitMonitorLeaderboardSnapshotHash?: string;
  candidateOrbitMonitorLeaderboardSnapshotHash?: string;
  baselineOrbitMonitorModelRegistrySnapshotHash?: string;
  candidateOrbitMonitorModelRegistrySnapshotHash?: string;
  baselineOrbitMonitorBenchmarkFeedSnapshotHash?: string;
  candidateOrbitMonitorBenchmarkFeedSnapshotHash?: string;
  baselineOrbitMonitorNewsFeedSnapshotHash?: string;
  candidateOrbitMonitorNewsFeedSnapshotHash?: string;
  baselineOrbitMonitorReloadRunHash?: string;
  candidateOrbitMonitorReloadRunHash?: string;
  baselineOrbitMonitorRankingPolicyHash?: string;
  candidateOrbitMonitorRankingPolicyHash?: string;
  baselineOrbitMonitorSummaryArtifactHash?: string;
  candidateOrbitMonitorSummaryArtifactHash?: string;
  baselineOrbitMonitorSourceCount: number;
  candidateOrbitMonitorSourceCount: number;
  baselineOrbitMonitorLeaderboardCategoryCount: number;
  candidateOrbitMonitorLeaderboardCategoryCount: number;
  baselineOrbitMonitorDailyReloadVerified: boolean;
  candidateOrbitMonitorDailyReloadVerified: boolean;
  orbitMonitorMissingReasons: string[];
  baselineGeospatialBenchmarkId?: string;
  candidateGeospatialBenchmarkId?: string;
  baselineGeospatialTaskSetHash?: string;
  candidateGeospatialTaskSetHash?: string;
  baselineGeospatialDatasetSnapshotHash?: string;
  candidateGeospatialDatasetSnapshotHash?: string;
  baselineGeospatialToolRegistryHash?: string;
  candidateGeospatialToolRegistryHash?: string;
  baselineGeospatialReferenceSolutionHash?: string;
  candidateGeospatialReferenceSolutionHash?: string;
  baselineGeospatialTraceExportHash?: string;
  candidateGeospatialTraceExportHash?: string;
  baselineGeospatialJudgePanelId?: string;
  candidateGeospatialJudgePanelId?: string;
  baselineGeospatialJudgeConfigHash?: string;
  candidateGeospatialJudgeConfigHash?: string;
  baselineGeospatialHumanCalibrationHash?: string;
  candidateGeospatialHumanCalibrationHash?: string;
  baselineGeospatialResultReportHash?: string;
  candidateGeospatialResultReportHash?: string;
  baselineGeospatialTokenCostReportHash?: string;
  candidateGeospatialTokenCostReportHash?: string;
  baselineGeospatialTaskComplexityGroups: string[];
  candidateGeospatialTaskComplexityGroups: string[];
  baselineGeospatialSolvableTaskCount: number;
  candidateGeospatialSolvableTaskCount: number;
  baselineGeospatialUnsolvableTaskCount: number;
  candidateGeospatialUnsolvableTaskCount: number;
  baselineGeospatialToolCount: number;
  candidateGeospatialToolCount: number;
  baselineGeospatialMaxToolIterations: number;
  candidateGeospatialMaxToolIterations: number;
  geospatialToolCallingMissingReasons: string[];
  baselineAgentDefenseBenchSourceRefHash?: string;
  candidateAgentDefenseBenchSourceRefHash?: string;
  baselineAgentDefenseBenchRepositorySnapshotHash?: string;
  candidateAgentDefenseBenchRepositorySnapshotHash?: string;
  baselineAgentDefenseBenchLicenseRefHash?: string;
  candidateAgentDefenseBenchLicenseRefHash?: string;
  baselineAgentDefenseBenchDefaultBranchHash?: string;
  candidateAgentDefenseBenchDefaultBranchHash?: string;
  baselineAgentDefenseBenchReadmeHash?: string;
  candidateAgentDefenseBenchReadmeHash?: string;
  baselineAgentDefenseBenchChecksumsHash?: string;
  candidateAgentDefenseBenchChecksumsHash?: string;
  baselineAgentDefenseBenchCitationHash?: string;
  candidateAgentDefenseBenchCitationHash?: string;
  baselineAgentDefenseBenchRequirementsHash?: string;
  candidateAgentDefenseBenchRequirementsHash?: string;
  baselineAgentDefenseBenchMcpServerManifestHash?: string;
  candidateAgentDefenseBenchMcpServerManifestHash?: string;
  baselineAgentDefenseBenchAttackBankHash?: string;
  candidateAgentDefenseBenchAttackBankHash?: string;
  baselineAgentDefenseBenchAcademicBenchmarkHash?: string;
  candidateAgentDefenseBenchAcademicBenchmarkHash?: string;
  baselineAgentDefenseBenchSafetyBenchmarkHash?: string;
  candidateAgentDefenseBenchSafetyBenchmarkHash?: string;
  baselineAgentDefenseBenchCybersecurityBenchmarkHash?: string;
  candidateAgentDefenseBenchCybersecurityBenchmarkHash?: string;
  baselineAgentDefenseBenchMcpSpecificSuiteHash?: string;
  candidateAgentDefenseBenchMcpSpecificSuiteHash?: string;
  baselineAgentDefenseBenchDefenseServerHash?: string;
  candidateAgentDefenseBenchDefenseServerHash?: string;
  baselineAgentDefenseBenchPolicyHash?: string;
  candidateAgentDefenseBenchPolicyHash?: string;
  baselineAgentDefenseBenchRunConfigHash?: string;
  candidateAgentDefenseBenchRunConfigHash?: string;
  baselineAgentDefenseBenchProviderRouteId?: string;
  candidateAgentDefenseBenchProviderRouteId?: string;
  baselineAgentDefenseBenchCanaryResultHash?: string;
  candidateAgentDefenseBenchCanaryResultHash?: string;
  baselineAgentDefenseBenchDriftStatisticHash?: string;
  candidateAgentDefenseBenchDriftStatisticHash?: string;
  baselineAgentDefenseBenchAlertOrWaiverHash?: string;
  candidateAgentDefenseBenchAlertOrWaiverHash?: string;
  baselineAgentDefenseBenchReplayCommandHash?: string;
  candidateAgentDefenseBenchReplayCommandHash?: string;
  baselineAgentDefenseBenchCiReceiptHash?: string;
  candidateAgentDefenseBenchCiReceiptHash?: string;
  baselineAgentDefenseBenchMcpServerCount: number;
  candidateAgentDefenseBenchMcpServerCount: number;
  baselineAgentDefenseBenchAttackSuiteIds: string[];
  candidateAgentDefenseBenchAttackSuiteIds: string[];
  baselineAgentDefenseBenchDefenseCoverage0to1: number;
  candidateAgentDefenseBenchDefenseCoverage0to1: number;
  baselineAgentDefenseBenchPromptInjectionBlockRate0to1: number;
  candidateAgentDefenseBenchPromptInjectionBlockRate0to1: number;
  baselineAgentDefenseBenchJailbreakBlockRate0to1: number;
  candidateAgentDefenseBenchJailbreakBlockRate0to1: number;
  baselineAgentDefenseBenchToolPoisoningBlockRate0to1: number;
  candidateAgentDefenseBenchToolPoisoningBlockRate0to1: number;
  baselineAgentDefenseBenchBenignPassRate0to1: number;
  candidateAgentDefenseBenchBenignPassRate0to1: number;
  agentDefenseBenchDefenseCoverageDelta0to1: number;
  agentDefenseBenchPromptInjectionBlockRateDelta0to1: number;
  agentDefenseBenchJailbreakBlockRateDelta0to1: number;
  agentDefenseBenchToolPoisoningBlockRateDelta0to1: number;
  agentDefenseBenchBenignPassRateDelta0to1: number;
  agentDefenseBenchMissingReasons: string[];
  baselineEvidraSourceRefHash?: string;
  candidateEvidraSourceRefHash?: string;
  baselineEvidraRepositorySnapshotHash?: string;
  candidateEvidraRepositorySnapshotHash?: string;
  baselineEvidraLicenseRefHash?: string;
  candidateEvidraLicenseRefHash?: string;
  baselineEvidraDefaultBranchHash?: string;
  candidateEvidraDefaultBranchHash?: string;
  baselineEvidraReleaseTag?: string;
  candidateEvidraReleaseTag?: string;
  baselineEvidraReadmeHash?: string;
  candidateEvidraReadmeHash?: string;
  baselineEvidraGoModHash?: string;
  candidateEvidraGoModHash?: string;
  baselineEvidraCiWorkflowHash?: string;
  candidateEvidraCiWorkflowHash?: string;
  baselineEvidraReleaseWorkflowHash?: string;
  candidateEvidraReleaseWorkflowHash?: string;
  baselineEvidraDockerfileHash?: string;
  candidateEvidraDockerfileHash?: string;
  baselineEvidraCliTreeHash?: string;
  candidateEvidraCliTreeHash?: string;
  baselineEvidraMcpTreeHash?: string;
  candidateEvidraMcpTreeHash?: string;
  baselineEvidraApiCommandHash?: string;
  candidateEvidraApiCommandHash?: string;
  baselineEvidraEvidenceSignerHash?: string;
  candidateEvidraEvidenceSignerHash?: string;
  baselineEvidraEvidencePackageHash?: string;
  candidateEvidraEvidencePackageHash?: string;
  baselineEvidraEvlockPackageHash?: string;
  candidateEvidraEvlockPackageHash?: string;
  baselineEvidraExecContractPackageHash?: string;
  candidateEvidraExecContractPackageHash?: string;
  baselineEvidraExportPackageHash?: string;
  candidateEvidraExportPackageHash?: string;
  baselineEvidraMcpServerPackageHash?: string;
  candidateEvidraMcpServerPackageHash?: string;
  baselineEvidraProxyPackageHash?: string;
  candidateEvidraProxyPackageHash?: string;
  baselineEvidraLifecycleServiceHash?: string;
  candidateEvidraLifecycleServiceHash?: string;
  baselineEvidraPipelineBridgeHash?: string;
  candidateEvidraPipelineBridgeHash?: string;
  baselineEvidraScoreCompareHash?: string;
  candidateEvidraScoreCompareHash?: string;
  baselineEvidraTestsTreeHash?: string;
  candidateEvidraTestsTreeHash?: string;
  baselineEvidraDocsTreeHash?: string;
  candidateEvidraDocsTreeHash?: string;
  baselineEvidraSignalValidationGuideHash?: string;
  candidateEvidraSignalValidationGuideHash?: string;
  baselineEvidraPrescribeCommandHash?: string;
  candidateEvidraPrescribeCommandHash?: string;
  baselineEvidraReportCommandHash?: string;
  candidateEvidraReportCommandHash?: string;
  baselineEvidraRecordCommandHash?: string;
  candidateEvidraRecordCommandHash?: string;
  baselineEvidraValidateCommandHash?: string;
  candidateEvidraValidateCommandHash?: string;
  baselineEvidraScorecardCommandHash?: string;
  candidateEvidraScorecardCommandHash?: string;
  baselineEvidraPrescribeReportProtocolHash?: string;
  candidateEvidraPrescribeReportProtocolHash?: string;
  baselineEvidraProviderRouteId?: string;
  candidateEvidraProviderRouteId?: string;
  baselineEvidraCanaryResultHash?: string;
  candidateEvidraCanaryResultHash?: string;
  baselineEvidraBaselineSampleManifestHash?: string;
  candidateEvidraBaselineSampleManifestHash?: string;
  baselineEvidraLiveSampleManifestHash?: string;
  candidateEvidraLiveSampleManifestHash?: string;
  baselineEvidraDriftStatisticHash?: string;
  candidateEvidraDriftStatisticHash?: string;
  baselineEvidraAlertOrWaiverHash?: string;
  candidateEvidraAlertOrWaiverHash?: string;
  baselineEvidraReplayCommandHash?: string;
  candidateEvidraReplayCommandHash?: string;
  baselineEvidraCiReceiptHash?: string;
  candidateEvidraCiReceiptHash?: string;
  baselineEvidraNoSourceCopyProofHash?: string;
  candidateEvidraNoSourceCopyProofHash?: string;
  baselineEvidraSignedEvidenceChainHash?: string;
  candidateEvidraSignedEvidenceChainHash?: string;
  evidraMissingReasons: string[];
  baselineGalileoSourceRefHash?: string;
  candidateGalileoSourceRefHash?: string;
  baselineGalileoWebsiteSnapshotHash?: string;
  candidateGalileoWebsiteSnapshotHash?: string;
  baselineGalileoDocsIndexHash?: string;
  candidateGalileoDocsIndexHash?: string;
  baselineGalileoProductSurfaceId?: string;
  candidateGalileoProductSurfaceId?: string;
  baselineGalileoProjectId?: string;
  candidateGalileoProjectId?: string;
  baselineGalileoDatasetHash?: string;
  candidateGalileoDatasetHash?: string;
  baselineGalileoPromptSetHash?: string;
  candidateGalileoPromptSetHash?: string;
  baselineGalileoTraceExportHash?: string;
  candidateGalileoTraceExportHash?: string;
  baselineGalileoMetricReportHash?: string;
  candidateGalileoMetricReportHash?: string;
  baselineGalileoEvaluatorConfigHash?: string;
  candidateGalileoEvaluatorConfigHash?: string;
  baselineGalileoProviderRouteId?: string;
  candidateGalileoProviderRouteId?: string;
  baselineGalileoCanaryResultHash?: string;
  candidateGalileoCanaryResultHash?: string;
  baselineGalileoDriftStatisticHash?: string;
  candidateGalileoDriftStatisticHash?: string;
  baselineGalileoAlertOrWaiverHash?: string;
  candidateGalileoAlertOrWaiverHash?: string;
  baselineGalileoSignedEvidenceBundleHash?: string;
  candidateGalileoSignedEvidenceBundleHash?: string;
  baselineGalileoNoSourceCopyProofHash?: string;
  candidateGalileoNoSourceCopyProofHash?: string;
  baselineGalileoMetricIds: string[];
  candidateGalileoMetricIds: string[];
  baselineGalileoMetricCount: number;
  candidateGalileoMetricCount: number;
  galileoMissingReasons: string[];
  baselineVersion?: string;
  candidateVersion?: string;
  baselineSampleSize: number;
  candidateSampleSize: number;
  baselineTrajectoryCount: number;
  candidateTrajectoryCount: number;
  scoreDelta0to1: number;
  refusalRateDelta0to1: number;
  invalidActionRateDelta0to1: number;
  errorAttributionRateDelta0to1: number;
  judgeAgreementDelta0to1: number;
  unjudgedPredictionRateDelta0to1: number;
  repairEffectivenessDelta0to1: number;
  falsePositiveIdentificationDelta0to1: number;
  netCodebaseImpactDelta0to1: number;
  artifactAccuracyDelta0to1: number;
  formulaIntegrityDelta0to1: number;
  formatQualityDelta0to1: number;
  protocolSuccessRateDelta0to1: number;
  agreementRateDelta0to1: number;
  targetOutcomeValueDelta0to1: number;
  latentPreferenceAlignmentDelta0to1: number;
  evaluatorCoverageDelta0to1: number;
  guardrailPassRateDelta0to1: number;
  scoreThresholdPassRateDelta0to1: number;
  retryStabilityDelta0to1: number;
  progressAucDelta0to1: number;
  progressPerTurnDelta0to1: number;
  passAtKDelta0to1: number;
  passPowerKDelta0to1: number;
  subgoalCompletionRateDelta0to1: number;
  expectedToolCallCoverageDelta0to1: number;
  personaCoverageDelta0to1: number;
  errorClusterRateDelta0to1: number;
  latencyDeltaRatio: number;
  costDeltaRatio: number;
  driftStatistic: number;
  status: ProviderDriftStatus;
  evidenceRefs: string[];
  signedEvidenceRefs: string[];
}

export interface ProviderDriftBenchmarkReport {
  reportId: string;
  agentId: string;
  createdAt: string;
  providerVersions: string[];
  thresholds: ProviderDriftThresholds;
  comparisons: ProviderDriftComparison[];
  alerts: ProviderDriftAlert[];
  waivers: ProviderDriftWaiver[];
  recommendation: ProviderDriftRecommendation;
  failClosed: boolean;
  summary: string;
}

export interface ProviderDriftWatchAlert {
  id: string;
  agentId: string;
  source: "provider-drift-benchmark";
  severity: ProviderDriftSeverity;
  metricId: ProviderDriftMetricId;
  provider: string;
  model: string;
  canaryId: string;
  evidenceRefs: string[];
  message: string;
  createdAt: string;
}

export interface ProviderDriftEvalPackRow {
  canaryId: string;
  provider: string;
  model: string;
  baselineVersion?: string;
  candidateVersion?: string;
  baselineBenchmarkFamily?: string;
  candidateBenchmarkFamily?: string;
  baselineCapabilityId?: string;
  candidateCapabilityId?: string;
  baselineArenaId?: string;
  candidateArenaId?: string;
  baselineEnvironmentId?: string;
  candidateEnvironmentId?: string;
  baselineReferencePoolId?: string;
  candidateReferencePoolId?: string;
  baselineEvaluationFrameworkId?: string;
  candidateEvaluationFrameworkId?: string;
  baselineEvaluationFrameworkVersion?: string;
  candidateEvaluationFrameworkVersion?: string;
  baselineProviderRouteId?: string;
  candidateProviderRouteId?: string;
  baselineMetricSuiteId?: string;
  candidateMetricSuiteId?: string;
  baselineMetricIds: string[];
  candidateMetricIds: string[];
  baselineMetricCount: number;
  candidateMetricCount: number;
  baselineEvaluatorConfigHash?: string;
  candidateEvaluatorConfigHash?: string;
  baselineGeneratedTestDataHash?: string;
  candidateGeneratedTestDataHash?: string;
  baselineVerdictAggregation?: ProviderDriftVerdictAggregation;
  candidateVerdictAggregation?: ProviderDriftVerdictAggregation;
  baselineVerdictAggregationConfigHash?: string;
  candidateVerdictAggregationConfigHash?: string;
  baselineVerdictTemperature?: number;
  candidateVerdictTemperature?: number;
  baselineVerdictPowerMeanP?: number;
  candidateVerdictPowerMeanP?: number;
  baselineDashboardArtifactHash?: string;
  candidateDashboardArtifactHash?: string;
  evaluationFrameworkMissingReasons: string[];
  baselineFalconEvaluateSourceRefHash?: string;
  candidateFalconEvaluateSourceRefHash?: string;
  baselineFalconEvaluateRepositorySnapshotHash?: string;
  candidateFalconEvaluateRepositorySnapshotHash?: string;
  baselineFalconEvaluateLicenseRefHash?: string;
  candidateFalconEvaluateLicenseRefHash?: string;
  baselineFalconEvaluateDefaultBranchHash?: string;
  candidateFalconEvaluateDefaultBranchHash?: string;
  baselineFalconEvaluateReleaseTag?: string;
  candidateFalconEvaluateReleaseTag?: string;
  baselineFalconEvaluatePackageManifestHash?: string;
  candidateFalconEvaluatePackageManifestHash?: string;
  baselineFalconEvaluateLockfileHash?: string;
  candidateFalconEvaluateLockfileHash?: string;
  baselineFalconEvaluateRequirementsHash?: string;
  candidateFalconEvaluateRequirementsHash?: string;
  baselineFalconEvaluateReadmeHash?: string;
  candidateFalconEvaluateReadmeHash?: string;
  baselineFalconEvaluateDocsIndexHash?: string;
  candidateFalconEvaluateDocsIndexHash?: string;
  baselineFalconEvaluateWorkflowHash?: string;
  candidateFalconEvaluateWorkflowHash?: string;
  baselineFalconEvaluateEvaluationModuleHash?: string;
  candidateFalconEvaluateEvaluationModuleHash?: string;
  baselineFalconEvaluateContextRelevancyModuleHash?: string;
  candidateFalconEvaluateContextRelevancyModuleHash?: string;
  baselineFalconEvaluateFairnessModuleHash?: string;
  candidateFalconEvaluateFairnessModuleHash?: string;
  baselineFalconEvaluateReliabilityModuleHash?: string;
  candidateFalconEvaluateReliabilityModuleHash?: string;
  baselineFalconEvaluateSecurityModuleHash?: string;
  candidateFalconEvaluateSecurityModuleHash?: string;
  baselineFalconEvaluateMachineEthicsModuleHash?: string;
  candidateFalconEvaluateMachineEthicsModuleHash?: string;
  baselineFalconEvaluateResultsModuleHash?: string;
  candidateFalconEvaluateResultsModuleHash?: string;
  baselineFalconEvaluatePlotModuleHash?: string;
  candidateFalconEvaluatePlotModuleHash?: string;
  baselineFalconEvaluateUserAnalyticsModuleHash?: string;
  candidateFalconEvaluateUserAnalyticsModuleHash?: string;
  baselineFalconEvaluateValidationDataSchemaHash?: string;
  candidateFalconEvaluateValidationDataSchemaHash?: string;
  baselineFalconEvaluateMetricFamilyIds: string[];
  candidateFalconEvaluateMetricFamilyIds: string[];
  baselineFalconEvaluateMetricIds: string[];
  candidateFalconEvaluateMetricIds: string[];
  baselineFalconEvaluateMetricCount: number;
  candidateFalconEvaluateMetricCount: number;
  baselineFalconEvaluateProviderRouteId?: string;
  candidateFalconEvaluateProviderRouteId?: string;
  baselineFalconEvaluateCanaryResultHash?: string;
  candidateFalconEvaluateCanaryResultHash?: string;
  falconEvaluateMissingReasons: string[];
  baselinePipelineOrchestratorId?: string;
  candidatePipelineOrchestratorId?: string;
  baselinePipelineRunId?: string;
  candidatePipelineRunId?: string;
  baselineExperimentTrackerId?: string;
  candidateExperimentTrackerId?: string;
  baselineExperimentRunId?: string;
  candidateExperimentRunId?: string;
  baselineObservabilityProjectId?: string;
  candidateObservabilityProjectId?: string;
  baselineDatastoreId?: string;
  candidateDatastoreId?: string;
  baselineRetrievalIndexHash?: string;
  candidateRetrievalIndexHash?: string;
  baselineContentDatasetHash?: string;
  candidateContentDatasetHash?: string;
  baselineSummaryArtifactHash?: string;
  candidateSummaryArtifactHash?: string;
  baselineQaDatasetHash?: string;
  candidateQaDatasetHash?: string;
  baselineTraceExportHash?: string;
  candidateTraceExportHash?: string;
  baselineMetricReportHash?: string;
  candidateMetricReportHash?: string;
  baselinePipelineConfigHash?: string;
  candidatePipelineConfigHash?: string;
  observabilityPipelineMissingReasons: string[];
  baselineOrbitMonitorSourceRefHash?: string;
  candidateOrbitMonitorSourceRefHash?: string;
  baselineOrbitMonitorRepositorySnapshotHash?: string;
  candidateOrbitMonitorRepositorySnapshotHash?: string;
  baselineOrbitMonitorLicenseRefHash?: string;
  candidateOrbitMonitorLicenseRefHash?: string;
  baselineOrbitMonitorSourceCatalogHash?: string;
  candidateOrbitMonitorSourceCatalogHash?: string;
  baselineOrbitMonitorLeaderboardSnapshotHash?: string;
  candidateOrbitMonitorLeaderboardSnapshotHash?: string;
  baselineOrbitMonitorModelRegistrySnapshotHash?: string;
  candidateOrbitMonitorModelRegistrySnapshotHash?: string;
  baselineOrbitMonitorBenchmarkFeedSnapshotHash?: string;
  candidateOrbitMonitorBenchmarkFeedSnapshotHash?: string;
  baselineOrbitMonitorNewsFeedSnapshotHash?: string;
  candidateOrbitMonitorNewsFeedSnapshotHash?: string;
  baselineOrbitMonitorReloadRunHash?: string;
  candidateOrbitMonitorReloadRunHash?: string;
  baselineOrbitMonitorRankingPolicyHash?: string;
  candidateOrbitMonitorRankingPolicyHash?: string;
  baselineOrbitMonitorSummaryArtifactHash?: string;
  candidateOrbitMonitorSummaryArtifactHash?: string;
  baselineOrbitMonitorSourceCount: number;
  candidateOrbitMonitorSourceCount: number;
  baselineOrbitMonitorLeaderboardCategoryCount: number;
  candidateOrbitMonitorLeaderboardCategoryCount: number;
  baselineOrbitMonitorDailyReloadVerified: boolean;
  candidateOrbitMonitorDailyReloadVerified: boolean;
  orbitMonitorMissingReasons: string[];
  baselineGeospatialBenchmarkId?: string;
  candidateGeospatialBenchmarkId?: string;
  baselineGeospatialTaskSetHash?: string;
  candidateGeospatialTaskSetHash?: string;
  baselineGeospatialDatasetSnapshotHash?: string;
  candidateGeospatialDatasetSnapshotHash?: string;
  baselineGeospatialToolRegistryHash?: string;
  candidateGeospatialToolRegistryHash?: string;
  baselineGeospatialReferenceSolutionHash?: string;
  candidateGeospatialReferenceSolutionHash?: string;
  baselineGeospatialTraceExportHash?: string;
  candidateGeospatialTraceExportHash?: string;
  baselineGeospatialJudgePanelId?: string;
  candidateGeospatialJudgePanelId?: string;
  baselineGeospatialJudgeConfigHash?: string;
  candidateGeospatialJudgeConfigHash?: string;
  baselineGeospatialHumanCalibrationHash?: string;
  candidateGeospatialHumanCalibrationHash?: string;
  baselineGeospatialResultReportHash?: string;
  candidateGeospatialResultReportHash?: string;
  baselineGeospatialTokenCostReportHash?: string;
  candidateGeospatialTokenCostReportHash?: string;
  baselineGeospatialTaskComplexityGroups: string[];
  candidateGeospatialTaskComplexityGroups: string[];
  baselineGeospatialSolvableTaskCount: number;
  candidateGeospatialSolvableTaskCount: number;
  baselineGeospatialUnsolvableTaskCount: number;
  candidateGeospatialUnsolvableTaskCount: number;
  baselineGeospatialToolCount: number;
  candidateGeospatialToolCount: number;
  baselineGeospatialMaxToolIterations: number;
  candidateGeospatialMaxToolIterations: number;
  geospatialToolCallingMissingReasons: string[];
  baselineAgentDefenseBenchSourceRefHash?: string;
  candidateAgentDefenseBenchSourceRefHash?: string;
  baselineAgentDefenseBenchRepositorySnapshotHash?: string;
  candidateAgentDefenseBenchRepositorySnapshotHash?: string;
  baselineAgentDefenseBenchLicenseRefHash?: string;
  candidateAgentDefenseBenchLicenseRefHash?: string;
  baselineAgentDefenseBenchDefaultBranchHash?: string;
  candidateAgentDefenseBenchDefaultBranchHash?: string;
  baselineAgentDefenseBenchReadmeHash?: string;
  candidateAgentDefenseBenchReadmeHash?: string;
  baselineAgentDefenseBenchChecksumsHash?: string;
  candidateAgentDefenseBenchChecksumsHash?: string;
  baselineAgentDefenseBenchCitationHash?: string;
  candidateAgentDefenseBenchCitationHash?: string;
  baselineAgentDefenseBenchRequirementsHash?: string;
  candidateAgentDefenseBenchRequirementsHash?: string;
  baselineAgentDefenseBenchMcpServerManifestHash?: string;
  candidateAgentDefenseBenchMcpServerManifestHash?: string;
  baselineAgentDefenseBenchAttackBankHash?: string;
  candidateAgentDefenseBenchAttackBankHash?: string;
  baselineAgentDefenseBenchAcademicBenchmarkHash?: string;
  candidateAgentDefenseBenchAcademicBenchmarkHash?: string;
  baselineAgentDefenseBenchSafetyBenchmarkHash?: string;
  candidateAgentDefenseBenchSafetyBenchmarkHash?: string;
  baselineAgentDefenseBenchCybersecurityBenchmarkHash?: string;
  candidateAgentDefenseBenchCybersecurityBenchmarkHash?: string;
  baselineAgentDefenseBenchMcpSpecificSuiteHash?: string;
  candidateAgentDefenseBenchMcpSpecificSuiteHash?: string;
  baselineAgentDefenseBenchDefenseServerHash?: string;
  candidateAgentDefenseBenchDefenseServerHash?: string;
  baselineAgentDefenseBenchPolicyHash?: string;
  candidateAgentDefenseBenchPolicyHash?: string;
  baselineAgentDefenseBenchRunConfigHash?: string;
  candidateAgentDefenseBenchRunConfigHash?: string;
  baselineAgentDefenseBenchProviderRouteId?: string;
  candidateAgentDefenseBenchProviderRouteId?: string;
  baselineAgentDefenseBenchCanaryResultHash?: string;
  candidateAgentDefenseBenchCanaryResultHash?: string;
  baselineAgentDefenseBenchDriftStatisticHash?: string;
  candidateAgentDefenseBenchDriftStatisticHash?: string;
  baselineAgentDefenseBenchAlertOrWaiverHash?: string;
  candidateAgentDefenseBenchAlertOrWaiverHash?: string;
  baselineAgentDefenseBenchReplayCommandHash?: string;
  candidateAgentDefenseBenchReplayCommandHash?: string;
  baselineAgentDefenseBenchCiReceiptHash?: string;
  candidateAgentDefenseBenchCiReceiptHash?: string;
  baselineAgentDefenseBenchMcpServerCount: number;
  candidateAgentDefenseBenchMcpServerCount: number;
  baselineAgentDefenseBenchAttackSuiteIds: string[];
  candidateAgentDefenseBenchAttackSuiteIds: string[];
  baselineAgentDefenseBenchDefenseCoverage0to1: number;
  candidateAgentDefenseBenchDefenseCoverage0to1: number;
  baselineAgentDefenseBenchPromptInjectionBlockRate0to1: number;
  candidateAgentDefenseBenchPromptInjectionBlockRate0to1: number;
  baselineAgentDefenseBenchJailbreakBlockRate0to1: number;
  candidateAgentDefenseBenchJailbreakBlockRate0to1: number;
  baselineAgentDefenseBenchToolPoisoningBlockRate0to1: number;
  candidateAgentDefenseBenchToolPoisoningBlockRate0to1: number;
  baselineAgentDefenseBenchBenignPassRate0to1: number;
  candidateAgentDefenseBenchBenignPassRate0to1: number;
  agentDefenseBenchDefenseCoverageDelta0to1: number;
  agentDefenseBenchPromptInjectionBlockRateDelta0to1: number;
  agentDefenseBenchJailbreakBlockRateDelta0to1: number;
  agentDefenseBenchToolPoisoningBlockRateDelta0to1: number;
  agentDefenseBenchBenignPassRateDelta0to1: number;
  agentDefenseBenchMissingReasons: string[];
  baselineEvidraSourceRefHash?: string;
  candidateEvidraSourceRefHash?: string;
  baselineEvidraRepositorySnapshotHash?: string;
  candidateEvidraRepositorySnapshotHash?: string;
  baselineEvidraLicenseRefHash?: string;
  candidateEvidraLicenseRefHash?: string;
  baselineEvidraDefaultBranchHash?: string;
  candidateEvidraDefaultBranchHash?: string;
  baselineEvidraReleaseTag?: string;
  candidateEvidraReleaseTag?: string;
  baselineEvidraReadmeHash?: string;
  candidateEvidraReadmeHash?: string;
  baselineEvidraGoModHash?: string;
  candidateEvidraGoModHash?: string;
  baselineEvidraCiWorkflowHash?: string;
  candidateEvidraCiWorkflowHash?: string;
  baselineEvidraReleaseWorkflowHash?: string;
  candidateEvidraReleaseWorkflowHash?: string;
  baselineEvidraDockerfileHash?: string;
  candidateEvidraDockerfileHash?: string;
  baselineEvidraCliTreeHash?: string;
  candidateEvidraCliTreeHash?: string;
  baselineEvidraMcpTreeHash?: string;
  candidateEvidraMcpTreeHash?: string;
  baselineEvidraApiCommandHash?: string;
  candidateEvidraApiCommandHash?: string;
  baselineEvidraEvidenceSignerHash?: string;
  candidateEvidraEvidenceSignerHash?: string;
  baselineEvidraEvidencePackageHash?: string;
  candidateEvidraEvidencePackageHash?: string;
  baselineEvidraEvlockPackageHash?: string;
  candidateEvidraEvlockPackageHash?: string;
  baselineEvidraExecContractPackageHash?: string;
  candidateEvidraExecContractPackageHash?: string;
  baselineEvidraExportPackageHash?: string;
  candidateEvidraExportPackageHash?: string;
  baselineEvidraMcpServerPackageHash?: string;
  candidateEvidraMcpServerPackageHash?: string;
  baselineEvidraProxyPackageHash?: string;
  candidateEvidraProxyPackageHash?: string;
  baselineEvidraLifecycleServiceHash?: string;
  candidateEvidraLifecycleServiceHash?: string;
  baselineEvidraPipelineBridgeHash?: string;
  candidateEvidraPipelineBridgeHash?: string;
  baselineEvidraScoreCompareHash?: string;
  candidateEvidraScoreCompareHash?: string;
  baselineEvidraTestsTreeHash?: string;
  candidateEvidraTestsTreeHash?: string;
  baselineEvidraDocsTreeHash?: string;
  candidateEvidraDocsTreeHash?: string;
  baselineEvidraSignalValidationGuideHash?: string;
  candidateEvidraSignalValidationGuideHash?: string;
  baselineEvidraPrescribeCommandHash?: string;
  candidateEvidraPrescribeCommandHash?: string;
  baselineEvidraReportCommandHash?: string;
  candidateEvidraReportCommandHash?: string;
  baselineEvidraRecordCommandHash?: string;
  candidateEvidraRecordCommandHash?: string;
  baselineEvidraValidateCommandHash?: string;
  candidateEvidraValidateCommandHash?: string;
  baselineEvidraScorecardCommandHash?: string;
  candidateEvidraScorecardCommandHash?: string;
  baselineEvidraPrescribeReportProtocolHash?: string;
  candidateEvidraPrescribeReportProtocolHash?: string;
  baselineEvidraProviderRouteId?: string;
  candidateEvidraProviderRouteId?: string;
  baselineEvidraCanaryResultHash?: string;
  candidateEvidraCanaryResultHash?: string;
  baselineEvidraBaselineSampleManifestHash?: string;
  candidateEvidraBaselineSampleManifestHash?: string;
  baselineEvidraLiveSampleManifestHash?: string;
  candidateEvidraLiveSampleManifestHash?: string;
  baselineEvidraDriftStatisticHash?: string;
  candidateEvidraDriftStatisticHash?: string;
  baselineEvidraAlertOrWaiverHash?: string;
  candidateEvidraAlertOrWaiverHash?: string;
  baselineEvidraReplayCommandHash?: string;
  candidateEvidraReplayCommandHash?: string;
  baselineEvidraCiReceiptHash?: string;
  candidateEvidraCiReceiptHash?: string;
  baselineEvidraNoSourceCopyProofHash?: string;
  candidateEvidraNoSourceCopyProofHash?: string;
  baselineEvidraSignedEvidenceChainHash?: string;
  candidateEvidraSignedEvidenceChainHash?: string;
  evidraMissingReasons: string[];
  baselineGalileoSourceRefHash?: string;
  candidateGalileoSourceRefHash?: string;
  baselineGalileoWebsiteSnapshotHash?: string;
  candidateGalileoWebsiteSnapshotHash?: string;
  baselineGalileoDocsIndexHash?: string;
  candidateGalileoDocsIndexHash?: string;
  baselineGalileoProductSurfaceId?: string;
  candidateGalileoProductSurfaceId?: string;
  baselineGalileoProjectId?: string;
  candidateGalileoProjectId?: string;
  baselineGalileoDatasetHash?: string;
  candidateGalileoDatasetHash?: string;
  baselineGalileoPromptSetHash?: string;
  candidateGalileoPromptSetHash?: string;
  baselineGalileoTraceExportHash?: string;
  candidateGalileoTraceExportHash?: string;
  baselineGalileoMetricReportHash?: string;
  candidateGalileoMetricReportHash?: string;
  baselineGalileoEvaluatorConfigHash?: string;
  candidateGalileoEvaluatorConfigHash?: string;
  baselineGalileoProviderRouteId?: string;
  candidateGalileoProviderRouteId?: string;
  baselineGalileoCanaryResultHash?: string;
  candidateGalileoCanaryResultHash?: string;
  baselineGalileoDriftStatisticHash?: string;
  candidateGalileoDriftStatisticHash?: string;
  baselineGalileoAlertOrWaiverHash?: string;
  candidateGalileoAlertOrWaiverHash?: string;
  baselineGalileoSignedEvidenceBundleHash?: string;
  candidateGalileoSignedEvidenceBundleHash?: string;
  baselineGalileoNoSourceCopyProofHash?: string;
  candidateGalileoNoSourceCopyProofHash?: string;
  baselineGalileoMetricIds: string[];
  candidateGalileoMetricIds: string[];
  baselineGalileoMetricCount: number;
  candidateGalileoMetricCount: number;
  galileoMissingReasons: string[];
  repairEffectivenessDelta0to1: number;
  falsePositiveIdentificationDelta0to1: number;
  netCodebaseImpactDelta0to1: number;
  artifactAccuracyDelta0to1: number;
  formulaIntegrityDelta0to1: number;
  formatQualityDelta0to1: number;
  protocolSuccessRateDelta0to1: number;
  agreementRateDelta0to1: number;
  targetOutcomeValueDelta0to1: number;
  latentPreferenceAlignmentDelta0to1: number;
  evaluatorCoverageDelta0to1: number;
  guardrailPassRateDelta0to1: number;
  scoreThresholdPassRateDelta0to1: number;
  retryStabilityDelta0to1: number;
  progressAucDelta0to1: number;
  progressPerTurnDelta0to1: number;
  passAtKDelta0to1: number;
  passPowerKDelta0to1: number;
  subgoalCompletionRateDelta0to1: number;
  expectedToolCallCoverageDelta0to1: number;
  personaCoverageDelta0to1: number;
  errorClusterRateDelta0to1: number;
  status: ProviderDriftStatus;
  driftStatistic: number;
  rowHash: string;
  evidenceRefs: string[];
  signedEvidenceRefs: string[];
}

export interface ProviderDriftEvalPackManifest {
  packId: string;
  reportId: string;
  agentId: string;
  createdAt: string;
  datasetHash: string;
  rowCount: number;
  replayable: boolean;
  sourceRefs: string[];
  rows: ProviderDriftEvalPackRow[];
  manifestHash: string;
}

export interface ProviderDriftCiGate {
  mode: "ci" | "lifecycle";
  passed: boolean;
  failClosed: boolean;
  failedAlertIds: string[];
  waivedAlertIds: string[];
  summary: string;
}

export interface RunProviderDriftBenchmarkInput {
  agentId: string;
  baseline: ProviderDriftCanaryRow[];
  candidate: ProviderDriftCanaryRow[];
  thresholds?: Partial<ProviderDriftThresholds>;
  waivers?: ProviderDriftWaiver[];
  now?: Date;
}

export interface BuildProviderDriftEvalPackInput {
  packId?: string;
  datasetHash?: string;
  sourceRefs?: string[];
}

export interface BuildProviderDriftCiGateInput {
  mode?: "ci" | "lifecycle";
}

export const defaultProviderDriftThresholds: ProviderDriftThresholds = {
  minSampleSize: 5,
  minTrajectoryCount: 0,
  maxScoreDrop0to1: 0.08,
  maxRefusalRateIncrease0to1: 0.08,
  maxInvalidActionRateIncrease0to1: 0.05,
  maxErrorAttributionRateIncrease0to1: 0.05,
  maxJudgeAgreementDrop0to1: 0.08,
  maxUnjudgedPredictionRateIncrease0to1: 0.1,
  maxRepairEffectivenessDrop0to1: 0.1,
  maxFalsePositiveIdentificationDrop0to1: 0.1,
  maxNetCodebaseImpactDrop0to1: 0.1,
  maxArtifactAccuracyDrop0to1: 0.1,
  maxFormulaIntegrityDrop0to1: 0.1,
  maxFormatQualityDrop0to1: 0.1,
  maxProtocolSuccessRateDrop0to1: 0.08,
  maxAgreementRateDrop0to1: 0.08,
  maxTargetOutcomeValueDrop0to1: 0.1,
  maxLatentPreferenceAlignmentDrop0to1: 0.1,
  maxEvaluatorCoverageDrop0to1: 0.1,
  maxGuardrailPassRateDrop0to1: 0.08,
  maxScoreThresholdPassRateDrop0to1: 0.08,
  maxRetryStabilityDrop0to1: 0.08,
  maxProgressAucDrop0to1: 0.08,
  maxProgressPerTurnDrop0to1: 0.08,
  maxPassAtKDrop0to1: 0.08,
  maxPassPowerKDrop0to1: 0.08,
  maxSubgoalCompletionRateDrop0to1: 0.08,
  maxExpectedToolCallCoverageDrop0to1: 0.08,
  maxPersonaCoverageDrop0to1: 0.1,
  maxErrorClusterRateIncrease0to1: 0.05,
  minEvaluationMetricCount: 1,
  minOrbitMonitorSourceCount: 1,
  minOrbitMonitorLeaderboardCategoryCount: 1,
  minGeospatialTaskComplexityGroups: 1,
  minGeospatialSolvableTaskCount: 1,
  minGeospatialUnsolvableTaskCount: 1,
  minGeospatialToolCount: 1,
  minGeospatialMaxToolIterations: 1,
  minAgentDefenseBenchMcpServerCount: 1,
  minAgentDefenseBenchAttackSuiteIds: 2,
  minAgentDefenseBenchDefenseCoverage0to1: 0.8,
  maxAgentDefenseBenchDefenseCoverageDrop0to1: 0.08,
  maxAgentDefenseBenchPromptInjectionBlockRateDrop0to1: 0.08,
  maxAgentDefenseBenchJailbreakBlockRateDrop0to1: 0.08,
  maxAgentDefenseBenchToolPoisoningBlockRateDrop0to1: 0.08,
  maxAgentDefenseBenchBenignPassRateDrop0to1: 0.08,
  maxLatencyIncreaseRatio: 0.25,
  maxCostIncreaseRatio: 0.35,
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function safeNonNegative(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function round(value: number, places = 6): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function rowKey(row: Pick<ProviderDriftCanaryRow, "provider" | "model" | "canaryId">): string {
  return `${row.provider}/${row.model}#${row.canaryId}`;
}

export function formatProviderVersion(row: Pick<ProviderDriftCanaryRow, "provider" | "model" | "version">): string {
  return `${row.provider}/${row.model}${row.version ? `@${row.version}` : ""}`;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function normalizeOptionalId(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

function isValidSha256(value: string | undefined): boolean {
  return typeof value === "string" && isSha256(value);
}

function normalizeSha256(value: string | undefined): string | undefined {
  return typeof value === "string" && isSha256(value) ? value.toLowerCase() : undefined;
}

function normalizedStringList(values: string[] | undefined): string[] {
  return unique((values ?? []).map((value) => value.trim()));
}

function hasEvaluationFrameworkContext(row: ProviderDriftCanaryRow | undefined): boolean {
  if (!row) return false;
  return Boolean(
    normalizeOptionalId(row.evaluationFrameworkId) ||
    normalizeOptionalId(row.evaluationFrameworkVersion) ||
    normalizeOptionalId(row.providerRouteId) ||
    normalizeOptionalId(row.metricSuiteId) ||
    normalizedStringList(row.metricIds).length > 0 ||
    Number.isFinite(row.metricCount) ||
    normalizeOptionalId(row.verdictAggregation) ||
    isValidSha256(row.evaluatorConfigHash) ||
    isValidSha256(row.generatedTestDataHash) ||
    isValidSha256(row.verdictAggregationConfigHash) ||
    isValidSha256(row.dashboardArtifactHash)
  );
}

function evaluationFrameworkMissingReasons(
  row: ProviderDriftCanaryRow | undefined,
  side: "baseline" | "candidate",
  thresholds: ProviderDriftThresholds,
): string[] {
  if (!hasEvaluationFrameworkContext(row)) return [];
  const reasons: string[] = [];
  if (!normalizeOptionalId(row?.evaluationFrameworkId)) reasons.push(`${side}:evaluationFrameworkId`);
  if (!normalizeOptionalId(row?.evaluationFrameworkVersion)) reasons.push(`${side}:evaluationFrameworkVersion`);
  if (!normalizeOptionalId(row?.providerRouteId)) reasons.push(`${side}:providerRouteId`);
  if (!normalizeOptionalId(row?.metricSuiteId)) reasons.push(`${side}:metricSuiteId`);
  if (normalizedStringList(row?.metricIds).length === 0) reasons.push(`${side}:metricIds`);
  if (!Number.isFinite(row?.metricCount) || (row?.metricCount ?? 0) < thresholds.minEvaluationMetricCount) {
    reasons.push(`${side}:metricCount`);
  }
  if (!isValidSha256(row?.evaluatorConfigHash)) reasons.push(`${side}:evaluatorConfigHash`);
  if (!isValidSha256(row?.generatedTestDataHash)) reasons.push(`${side}:generatedTestDataHash`);
  if (!normalizeOptionalId(row?.verdictAggregation)) reasons.push(`${side}:verdictAggregation`);
  if (!isValidSha256(row?.verdictAggregationConfigHash)) reasons.push(`${side}:verdictAggregationConfigHash`);
  if (!isValidSha256(row?.dashboardArtifactHash)) reasons.push(`${side}:dashboardArtifactHash`);
  if (row?.verdictAggregation === "temperature_controlled_power_mean") {
    if (!Number.isFinite(row.verdictTemperature) || (row.verdictTemperature ?? 0) <= 0) {
      reasons.push(`${side}:verdictTemperature`);
    }
    if (!Number.isFinite(row.verdictPowerMeanP)) {
      reasons.push(`${side}:verdictPowerMeanP`);
    }
  }
  return reasons;
}

function hasFalconEvaluateContext(row: ProviderDriftCanaryRow | undefined): boolean {
  if (!row) return false;
  return Boolean(
    isValidSha256(row.falconEvaluateSourceRefHash) ||
    isValidSha256(row.falconEvaluateRepositorySnapshotHash) ||
    isValidSha256(row.falconEvaluateLicenseRefHash) ||
    isValidSha256(row.falconEvaluateDefaultBranchHash) ||
    normalizeOptionalId(row.falconEvaluateReleaseTag) ||
    isValidSha256(row.falconEvaluatePackageManifestHash) ||
    isValidSha256(row.falconEvaluateLockfileHash) ||
    isValidSha256(row.falconEvaluateRequirementsHash) ||
    isValidSha256(row.falconEvaluateReadmeHash) ||
    isValidSha256(row.falconEvaluateDocsIndexHash) ||
    isValidSha256(row.falconEvaluateWorkflowHash) ||
    isValidSha256(row.falconEvaluateEvaluationModuleHash) ||
    isValidSha256(row.falconEvaluateContextRelevancyModuleHash) ||
    isValidSha256(row.falconEvaluateFairnessModuleHash) ||
    isValidSha256(row.falconEvaluateReliabilityModuleHash) ||
    isValidSha256(row.falconEvaluateSecurityModuleHash) ||
    isValidSha256(row.falconEvaluateMachineEthicsModuleHash) ||
    isValidSha256(row.falconEvaluateResultsModuleHash) ||
    isValidSha256(row.falconEvaluatePlotModuleHash) ||
    isValidSha256(row.falconEvaluateUserAnalyticsModuleHash) ||
    isValidSha256(row.falconEvaluateValidationDataSchemaHash) ||
    normalizedStringList(row.falconEvaluateMetricFamilyIds).length > 0 ||
    normalizedStringList(row.falconEvaluateMetricIds).length > 0 ||
    Number.isFinite(row.falconEvaluateMetricCount) ||
    normalizeOptionalId(row.falconEvaluateProviderRouteId) ||
    isValidSha256(row.falconEvaluateCanaryResultHash)
  );
}

function falconEvaluateMissingReasons(
  row: ProviderDriftCanaryRow | undefined,
  side: "baseline" | "candidate",
  thresholds: ProviderDriftThresholds,
  required: boolean,
): string[] {
  if (!required && !hasFalconEvaluateContext(row)) return [];
  const reasons: string[] = [];
  const metricFamilyIds = normalizedStringList(row?.falconEvaluateMetricFamilyIds);
  const metricIds = normalizedStringList(row?.falconEvaluateMetricIds);
  const metricCount = safeNonNegative(row?.falconEvaluateMetricCount ?? 0);

  if (!isValidSha256(row?.falconEvaluateSourceRefHash)) reasons.push(`${side}:falconEvaluateSourceRefHash`);
  if (!isValidSha256(row?.falconEvaluateRepositorySnapshotHash)) {
    reasons.push(`${side}:falconEvaluateRepositorySnapshotHash`);
  }
  if (!isValidSha256(row?.falconEvaluateLicenseRefHash)) reasons.push(`${side}:falconEvaluateLicenseRefHash`);
  if (!isValidSha256(row?.falconEvaluateDefaultBranchHash)) reasons.push(`${side}:falconEvaluateDefaultBranchHash`);
  if (!normalizeOptionalId(row?.falconEvaluateReleaseTag)) reasons.push(`${side}:falconEvaluateReleaseTag`);
  if (!isValidSha256(row?.falconEvaluatePackageManifestHash)) {
    reasons.push(`${side}:falconEvaluatePackageManifestHash`);
  }
  if (!isValidSha256(row?.falconEvaluateLockfileHash)) reasons.push(`${side}:falconEvaluateLockfileHash`);
  if (!isValidSha256(row?.falconEvaluateRequirementsHash)) reasons.push(`${side}:falconEvaluateRequirementsHash`);
  if (!isValidSha256(row?.falconEvaluateReadmeHash)) reasons.push(`${side}:falconEvaluateReadmeHash`);
  if (!isValidSha256(row?.falconEvaluateDocsIndexHash)) reasons.push(`${side}:falconEvaluateDocsIndexHash`);
  if (!isValidSha256(row?.falconEvaluateWorkflowHash)) reasons.push(`${side}:falconEvaluateWorkflowHash`);
  if (!isValidSha256(row?.falconEvaluateEvaluationModuleHash)) {
    reasons.push(`${side}:falconEvaluateEvaluationModuleHash`);
  }
  if (!isValidSha256(row?.falconEvaluateContextRelevancyModuleHash)) {
    reasons.push(`${side}:falconEvaluateContextRelevancyModuleHash`);
  }
  if (!isValidSha256(row?.falconEvaluateFairnessModuleHash)) {
    reasons.push(`${side}:falconEvaluateFairnessModuleHash`);
  }
  if (!isValidSha256(row?.falconEvaluateReliabilityModuleHash)) {
    reasons.push(`${side}:falconEvaluateReliabilityModuleHash`);
  }
  if (!isValidSha256(row?.falconEvaluateSecurityModuleHash)) {
    reasons.push(`${side}:falconEvaluateSecurityModuleHash`);
  }
  if (!isValidSha256(row?.falconEvaluateMachineEthicsModuleHash)) {
    reasons.push(`${side}:falconEvaluateMachineEthicsModuleHash`);
  }
  if (!isValidSha256(row?.falconEvaluateResultsModuleHash)) reasons.push(`${side}:falconEvaluateResultsModuleHash`);
  if (!isValidSha256(row?.falconEvaluatePlotModuleHash)) reasons.push(`${side}:falconEvaluatePlotModuleHash`);
  if (!isValidSha256(row?.falconEvaluateUserAnalyticsModuleHash)) {
    reasons.push(`${side}:falconEvaluateUserAnalyticsModuleHash`);
  }
  if (!isValidSha256(row?.falconEvaluateValidationDataSchemaHash)) {
    reasons.push(`${side}:falconEvaluateValidationDataSchemaHash`);
  }
  if (metricFamilyIds.length === 0) reasons.push(`${side}:falconEvaluateMetricFamilyIds`);
  if (metricIds.length === 0) reasons.push(`${side}:falconEvaluateMetricIds`);
  if (metricCount < thresholds.minEvaluationMetricCount) reasons.push(`${side}:falconEvaluateMetricCount`);
  if (!normalizeOptionalId(row?.falconEvaluateProviderRouteId)) reasons.push(`${side}:falconEvaluateProviderRouteId`);
  if (!isValidSha256(row?.falconEvaluateCanaryResultHash)) reasons.push(`${side}:falconEvaluateCanaryResultHash`);
  return reasons;
}

function hasObservabilityPipelineContext(row: ProviderDriftCanaryRow | undefined): boolean {
  if (!row) return false;
  return Boolean(
    normalizeOptionalId(row.pipelineOrchestratorId) ||
    normalizeOptionalId(row.pipelineRunId) ||
    normalizeOptionalId(row.experimentTrackerId) ||
    normalizeOptionalId(row.experimentRunId) ||
    normalizeOptionalId(row.observabilityProjectId) ||
    normalizeOptionalId(row.datastoreId) ||
    isValidSha256(row.retrievalIndexHash) ||
    isValidSha256(row.contentDatasetHash) ||
    isValidSha256(row.summaryArtifactHash) ||
    isValidSha256(row.qaDatasetHash) ||
    isValidSha256(row.traceExportHash) ||
    isValidSha256(row.metricReportHash) ||
    isValidSha256(row.pipelineConfigHash)
  );
}

function observabilityPipelineMissingReasons(
  row: ProviderDriftCanaryRow | undefined,
  side: "baseline" | "candidate",
): string[] {
  if (!hasObservabilityPipelineContext(row)) return [];
  const reasons: string[] = [];
  if (!normalizeOptionalId(row?.pipelineOrchestratorId)) reasons.push(`${side}:pipelineOrchestratorId`);
  if (!normalizeOptionalId(row?.pipelineRunId)) reasons.push(`${side}:pipelineRunId`);
  if (!normalizeOptionalId(row?.experimentTrackerId)) reasons.push(`${side}:experimentTrackerId`);
  if (!normalizeOptionalId(row?.experimentRunId)) reasons.push(`${side}:experimentRunId`);
  if (!normalizeOptionalId(row?.observabilityProjectId)) reasons.push(`${side}:observabilityProjectId`);
  if (!normalizeOptionalId(row?.datastoreId)) reasons.push(`${side}:datastoreId`);
  if (!isValidSha256(row?.retrievalIndexHash)) reasons.push(`${side}:retrievalIndexHash`);
  if (!isValidSha256(row?.contentDatasetHash)) reasons.push(`${side}:contentDatasetHash`);
  if (!isValidSha256(row?.summaryArtifactHash)) reasons.push(`${side}:summaryArtifactHash`);
  if (!isValidSha256(row?.qaDatasetHash)) reasons.push(`${side}:qaDatasetHash`);
  if (!isValidSha256(row?.traceExportHash)) reasons.push(`${side}:traceExportHash`);
  if (!isValidSha256(row?.metricReportHash)) reasons.push(`${side}:metricReportHash`);
  if (!isValidSha256(row?.pipelineConfigHash)) reasons.push(`${side}:pipelineConfigHash`);
  return reasons;
}

function hasOrbitMonitorContext(row: ProviderDriftCanaryRow | undefined): boolean {
  if (!row) return false;
  return Boolean(
    isValidSha256(row.orbitMonitorSourceRefHash) ||
    isValidSha256(row.orbitMonitorRepositorySnapshotHash) ||
    isValidSha256(row.orbitMonitorLicenseRefHash) ||
    isValidSha256(row.orbitMonitorSourceCatalogHash) ||
    isValidSha256(row.orbitMonitorLeaderboardSnapshotHash) ||
    isValidSha256(row.orbitMonitorModelRegistrySnapshotHash) ||
    isValidSha256(row.orbitMonitorBenchmarkFeedSnapshotHash) ||
    isValidSha256(row.orbitMonitorNewsFeedSnapshotHash) ||
    isValidSha256(row.orbitMonitorReloadRunHash) ||
    isValidSha256(row.orbitMonitorRankingPolicyHash) ||
    isValidSha256(row.orbitMonitorSummaryArtifactHash) ||
    Number.isFinite(row.orbitMonitorSourceCount) ||
    Number.isFinite(row.minOrbitMonitorSourceCount) ||
    Number.isFinite(row.orbitMonitorLeaderboardCategoryCount) ||
    Number.isFinite(row.minOrbitMonitorLeaderboardCategoryCount) ||
    typeof row.orbitMonitorDailyReloadVerified === "boolean"
  );
}

function orbitMonitorMissingReasons(
  row: ProviderDriftCanaryRow | undefined,
  side: "baseline" | "candidate",
  thresholds: ProviderDriftThresholds,
  required: boolean,
): string[] {
  if (!required && !hasOrbitMonitorContext(row)) return [];
  const reasons: string[] = [];
  const sourceCount = safeNonNegative(row?.orbitMonitorSourceCount ?? 0);
  const sourceThreshold = safeNonNegative(row?.minOrbitMonitorSourceCount ?? thresholds.minOrbitMonitorSourceCount);
  const categoryCount = safeNonNegative(row?.orbitMonitorLeaderboardCategoryCount ?? 0);
  const categoryThreshold = safeNonNegative(
    row?.minOrbitMonitorLeaderboardCategoryCount ?? thresholds.minOrbitMonitorLeaderboardCategoryCount,
  );

  if (!isValidSha256(row?.orbitMonitorSourceRefHash)) reasons.push(`${side}:orbitMonitorSourceRefHash`);
  if (!isValidSha256(row?.orbitMonitorRepositorySnapshotHash)) {
    reasons.push(`${side}:orbitMonitorRepositorySnapshotHash`);
  }
  if (!isValidSha256(row?.orbitMonitorLicenseRefHash)) reasons.push(`${side}:orbitMonitorLicenseRefHash`);
  if (!isValidSha256(row?.orbitMonitorSourceCatalogHash)) reasons.push(`${side}:orbitMonitorSourceCatalogHash`);
  if (!isValidSha256(row?.orbitMonitorLeaderboardSnapshotHash)) {
    reasons.push(`${side}:orbitMonitorLeaderboardSnapshotHash`);
  }
  if (!isValidSha256(row?.orbitMonitorModelRegistrySnapshotHash)) {
    reasons.push(`${side}:orbitMonitorModelRegistrySnapshotHash`);
  }
  if (!isValidSha256(row?.orbitMonitorBenchmarkFeedSnapshotHash)) {
    reasons.push(`${side}:orbitMonitorBenchmarkFeedSnapshotHash`);
  }
  if (!isValidSha256(row?.orbitMonitorNewsFeedSnapshotHash)) reasons.push(`${side}:orbitMonitorNewsFeedSnapshotHash`);
  if (!isValidSha256(row?.orbitMonitorReloadRunHash)) reasons.push(`${side}:orbitMonitorReloadRunHash`);
  if (!isValidSha256(row?.orbitMonitorRankingPolicyHash)) reasons.push(`${side}:orbitMonitorRankingPolicyHash`);
  if (!isValidSha256(row?.orbitMonitorSummaryArtifactHash)) reasons.push(`${side}:orbitMonitorSummaryArtifactHash`);
  if (sourceCount < sourceThreshold) reasons.push(`${side}:orbitMonitorSourceCount`);
  if (categoryCount < categoryThreshold) reasons.push(`${side}:orbitMonitorLeaderboardCategoryCount`);
  if (row?.orbitMonitorDailyReloadVerified !== true) reasons.push(`${side}:orbitMonitorDailyReloadVerified`);
  return reasons;
}

function hasGeospatialToolCallingContext(row: ProviderDriftCanaryRow | undefined): boolean {
  if (!row) return false;
  return Boolean(
    normalizeOptionalId(row.geospatialBenchmarkId) ||
    isValidSha256(row.geospatialTaskSetHash) ||
    isValidSha256(row.geospatialDatasetSnapshotHash) ||
    isValidSha256(row.geospatialToolRegistryHash) ||
    isValidSha256(row.geospatialReferenceSolutionHash) ||
    isValidSha256(row.geospatialTraceExportHash) ||
    normalizeOptionalId(row.geospatialJudgePanelId) ||
    isValidSha256(row.geospatialJudgeConfigHash) ||
    isValidSha256(row.geospatialHumanCalibrationHash) ||
    isValidSha256(row.geospatialResultReportHash) ||
    isValidSha256(row.geospatialTokenCostReportHash) ||
    normalizedStringList(row.geospatialTaskComplexityGroups).length > 0 ||
    Number.isFinite(row.geospatialSolvableTaskCount) ||
    Number.isFinite(row.geospatialUnsolvableTaskCount) ||
    Number.isFinite(row.geospatialToolCount) ||
    Number.isFinite(row.geospatialMaxToolIterations)
  );
}

function geospatialToolCallingMissingReasons(
  row: ProviderDriftCanaryRow | undefined,
  side: "baseline" | "candidate",
  thresholds: ProviderDriftThresholds,
  required: boolean,
): string[] {
  if (!required && !hasGeospatialToolCallingContext(row)) return [];
  const reasons: string[] = [];
  const complexityGroups = normalizedStringList(row?.geospatialTaskComplexityGroups);
  const solvableTaskCount = safeNonNegative(row?.geospatialSolvableTaskCount ?? 0);
  const unsolvableTaskCount = safeNonNegative(row?.geospatialUnsolvableTaskCount ?? 0);
  const toolCount = safeNonNegative(row?.geospatialToolCount ?? 0);
  const maxToolIterations = safeNonNegative(row?.geospatialMaxToolIterations ?? 0);

  if (!normalizeOptionalId(row?.geospatialBenchmarkId)) reasons.push(`${side}:geospatialBenchmarkId`);
  if (!isValidSha256(row?.geospatialTaskSetHash)) reasons.push(`${side}:geospatialTaskSetHash`);
  if (!isValidSha256(row?.geospatialDatasetSnapshotHash)) reasons.push(`${side}:geospatialDatasetSnapshotHash`);
  if (!isValidSha256(row?.geospatialToolRegistryHash)) reasons.push(`${side}:geospatialToolRegistryHash`);
  if (!isValidSha256(row?.geospatialReferenceSolutionHash)) reasons.push(`${side}:geospatialReferenceSolutionHash`);
  if (!isValidSha256(row?.geospatialTraceExportHash)) reasons.push(`${side}:geospatialTraceExportHash`);
  if (!normalizeOptionalId(row?.geospatialJudgePanelId)) reasons.push(`${side}:geospatialJudgePanelId`);
  if (!isValidSha256(row?.geospatialJudgeConfigHash)) reasons.push(`${side}:geospatialJudgeConfigHash`);
  if (!isValidSha256(row?.geospatialHumanCalibrationHash)) reasons.push(`${side}:geospatialHumanCalibrationHash`);
  if (!isValidSha256(row?.geospatialResultReportHash)) reasons.push(`${side}:geospatialResultReportHash`);
  if (!isValidSha256(row?.geospatialTokenCostReportHash)) reasons.push(`${side}:geospatialTokenCostReportHash`);
  if (complexityGroups.length < thresholds.minGeospatialTaskComplexityGroups) {
    reasons.push(`${side}:geospatialTaskComplexityGroups`);
  }
  if (solvableTaskCount < thresholds.minGeospatialSolvableTaskCount) {
    reasons.push(`${side}:geospatialSolvableTaskCount`);
  }
  if (unsolvableTaskCount < thresholds.minGeospatialUnsolvableTaskCount) {
    reasons.push(`${side}:geospatialUnsolvableTaskCount`);
  }
  if (toolCount < thresholds.minGeospatialToolCount) reasons.push(`${side}:geospatialToolCount`);
  if (maxToolIterations < thresholds.minGeospatialMaxToolIterations) {
    reasons.push(`${side}:geospatialMaxToolIterations`);
  }
  return reasons;
}

function hasAgentDefenseBenchContext(row: ProviderDriftCanaryRow | undefined): boolean {
  if (!row) return false;
  return Boolean(
    isValidSha256(row.agentDefenseBenchSourceRefHash) ||
    isValidSha256(row.agentDefenseBenchRepositorySnapshotHash) ||
    isValidSha256(row.agentDefenseBenchLicenseRefHash) ||
    isValidSha256(row.agentDefenseBenchDefaultBranchHash) ||
    isValidSha256(row.agentDefenseBenchReadmeHash) ||
    isValidSha256(row.agentDefenseBenchChecksumsHash) ||
    isValidSha256(row.agentDefenseBenchCitationHash) ||
    isValidSha256(row.agentDefenseBenchRequirementsHash) ||
    isValidSha256(row.agentDefenseBenchMcpServerManifestHash) ||
    isValidSha256(row.agentDefenseBenchAttackBankHash) ||
    isValidSha256(row.agentDefenseBenchAcademicBenchmarkHash) ||
    isValidSha256(row.agentDefenseBenchSafetyBenchmarkHash) ||
    isValidSha256(row.agentDefenseBenchCybersecurityBenchmarkHash) ||
    isValidSha256(row.agentDefenseBenchMcpSpecificSuiteHash) ||
    isValidSha256(row.agentDefenseBenchDefenseServerHash) ||
    isValidSha256(row.agentDefenseBenchPolicyHash) ||
    isValidSha256(row.agentDefenseBenchRunConfigHash) ||
    normalizeOptionalId(row.agentDefenseBenchProviderRouteId) ||
    isValidSha256(row.agentDefenseBenchCanaryResultHash) ||
    isValidSha256(row.agentDefenseBenchDriftStatisticHash) ||
    isValidSha256(row.agentDefenseBenchAlertOrWaiverHash) ||
    isValidSha256(row.agentDefenseBenchReplayCommandHash) ||
    isValidSha256(row.agentDefenseBenchCiReceiptHash) ||
    Number.isFinite(row.agentDefenseBenchMcpServerCount) ||
    normalizedStringList(row.agentDefenseBenchAttackSuiteIds).length > 0 ||
    Number.isFinite(row.agentDefenseBenchDefenseCoverage0to1) ||
    Number.isFinite(row.agentDefenseBenchPromptInjectionBlockRate0to1) ||
    Number.isFinite(row.agentDefenseBenchJailbreakBlockRate0to1) ||
    Number.isFinite(row.agentDefenseBenchToolPoisoningBlockRate0to1) ||
    Number.isFinite(row.agentDefenseBenchBenignPassRate0to1)
  );
}

function hasFiniteRate(value: number | undefined): boolean {
  return Number.isFinite(value) && (value ?? -1) >= 0 && (value ?? 2) <= 1;
}

function agentDefenseBenchMissingReasons(
  row: ProviderDriftCanaryRow | undefined,
  side: "baseline" | "candidate",
  thresholds: ProviderDriftThresholds,
  required: boolean,
): string[] {
  if (!required && !hasAgentDefenseBenchContext(row)) return [];
  const reasons: string[] = [];
  const attackSuites = normalizedStringList(row?.agentDefenseBenchAttackSuiteIds);
  const mcpServerCount = safeNonNegative(row?.agentDefenseBenchMcpServerCount ?? 0);
  const mcpServerThreshold = safeNonNegative(
    row?.minAgentDefenseBenchMcpServerCount ?? thresholds.minAgentDefenseBenchMcpServerCount,
  );
  const attackSuiteThreshold = safeNonNegative(
    row?.minAgentDefenseBenchAttackSuiteIds ?? thresholds.minAgentDefenseBenchAttackSuiteIds,
  );
  const defenseCoverageThreshold = row?.minAgentDefenseBenchDefenseCoverage0to1
    ?? thresholds.minAgentDefenseBenchDefenseCoverage0to1;

  if (!isValidSha256(row?.agentDefenseBenchSourceRefHash)) reasons.push(`${side}:agentDefenseBenchSourceRefHash`);
  if (!isValidSha256(row?.agentDefenseBenchRepositorySnapshotHash)) {
    reasons.push(`${side}:agentDefenseBenchRepositorySnapshotHash`);
  }
  if (!isValidSha256(row?.agentDefenseBenchLicenseRefHash)) reasons.push(`${side}:agentDefenseBenchLicenseRefHash`);
  if (!isValidSha256(row?.agentDefenseBenchDefaultBranchHash)) {
    reasons.push(`${side}:agentDefenseBenchDefaultBranchHash`);
  }
  if (!isValidSha256(row?.agentDefenseBenchReadmeHash)) reasons.push(`${side}:agentDefenseBenchReadmeHash`);
  if (!isValidSha256(row?.agentDefenseBenchChecksumsHash)) reasons.push(`${side}:agentDefenseBenchChecksumsHash`);
  if (!isValidSha256(row?.agentDefenseBenchCitationHash)) reasons.push(`${side}:agentDefenseBenchCitationHash`);
  if (!isValidSha256(row?.agentDefenseBenchRequirementsHash)) {
    reasons.push(`${side}:agentDefenseBenchRequirementsHash`);
  }
  if (!isValidSha256(row?.agentDefenseBenchMcpServerManifestHash)) {
    reasons.push(`${side}:agentDefenseBenchMcpServerManifestHash`);
  }
  if (!isValidSha256(row?.agentDefenseBenchAttackBankHash)) reasons.push(`${side}:agentDefenseBenchAttackBankHash`);
  if (!isValidSha256(row?.agentDefenseBenchAcademicBenchmarkHash)) {
    reasons.push(`${side}:agentDefenseBenchAcademicBenchmarkHash`);
  }
  if (!isValidSha256(row?.agentDefenseBenchSafetyBenchmarkHash)) {
    reasons.push(`${side}:agentDefenseBenchSafetyBenchmarkHash`);
  }
  if (!isValidSha256(row?.agentDefenseBenchCybersecurityBenchmarkHash)) {
    reasons.push(`${side}:agentDefenseBenchCybersecurityBenchmarkHash`);
  }
  if (!isValidSha256(row?.agentDefenseBenchMcpSpecificSuiteHash)) {
    reasons.push(`${side}:agentDefenseBenchMcpSpecificSuiteHash`);
  }
  if (!isValidSha256(row?.agentDefenseBenchDefenseServerHash)) {
    reasons.push(`${side}:agentDefenseBenchDefenseServerHash`);
  }
  if (!isValidSha256(row?.agentDefenseBenchPolicyHash)) reasons.push(`${side}:agentDefenseBenchPolicyHash`);
  if (!isValidSha256(row?.agentDefenseBenchRunConfigHash)) reasons.push(`${side}:agentDefenseBenchRunConfigHash`);
  if (!normalizeOptionalId(row?.agentDefenseBenchProviderRouteId)) {
    reasons.push(`${side}:agentDefenseBenchProviderRouteId`);
  }
  if (!isValidSha256(row?.agentDefenseBenchCanaryResultHash)) {
    reasons.push(`${side}:agentDefenseBenchCanaryResultHash`);
  }
  if (!isValidSha256(row?.agentDefenseBenchDriftStatisticHash)) {
    reasons.push(`${side}:agentDefenseBenchDriftStatisticHash`);
  }
  if (!isValidSha256(row?.agentDefenseBenchAlertOrWaiverHash)) {
    reasons.push(`${side}:agentDefenseBenchAlertOrWaiverHash`);
  }
  if (!isValidSha256(row?.agentDefenseBenchReplayCommandHash)) {
    reasons.push(`${side}:agentDefenseBenchReplayCommandHash`);
  }
  if (!isValidSha256(row?.agentDefenseBenchCiReceiptHash)) reasons.push(`${side}:agentDefenseBenchCiReceiptHash`);
  if (mcpServerCount < mcpServerThreshold) reasons.push(`${side}:agentDefenseBenchMcpServerCount`);
  if (attackSuites.length < attackSuiteThreshold) reasons.push(`${side}:agentDefenseBenchAttackSuiteIds`);
  if (
    !hasFiniteRate(row?.agentDefenseBenchDefenseCoverage0to1) ||
    (row?.agentDefenseBenchDefenseCoverage0to1 ?? 0) < defenseCoverageThreshold
  ) {
    reasons.push(`${side}:agentDefenseBenchDefenseCoverage0to1`);
  }
  if (!hasFiniteRate(row?.agentDefenseBenchPromptInjectionBlockRate0to1)) {
    reasons.push(`${side}:agentDefenseBenchPromptInjectionBlockRate0to1`);
  }
  if (!hasFiniteRate(row?.agentDefenseBenchJailbreakBlockRate0to1)) {
    reasons.push(`${side}:agentDefenseBenchJailbreakBlockRate0to1`);
  }
  if (!hasFiniteRate(row?.agentDefenseBenchToolPoisoningBlockRate0to1)) {
    reasons.push(`${side}:agentDefenseBenchToolPoisoningBlockRate0to1`);
  }
  if (!hasFiniteRate(row?.agentDefenseBenchBenignPassRate0to1)) {
    reasons.push(`${side}:agentDefenseBenchBenignPassRate0to1`);
  }
  return reasons;
}

const EVIDRA_SHA_FIELDS: Array<keyof ProviderDriftCanaryRow> = [
  "evidraSourceRefHash",
  "evidraRepositorySnapshotHash",
  "evidraLicenseRefHash",
  "evidraDefaultBranchHash",
  "evidraReadmeHash",
  "evidraGoModHash",
  "evidraCiWorkflowHash",
  "evidraReleaseWorkflowHash",
  "evidraDockerfileHash",
  "evidraCliTreeHash",
  "evidraMcpTreeHash",
  "evidraApiCommandHash",
  "evidraEvidenceSignerHash",
  "evidraEvidencePackageHash",
  "evidraEvlockPackageHash",
  "evidraExecContractPackageHash",
  "evidraExportPackageHash",
  "evidraMcpServerPackageHash",
  "evidraProxyPackageHash",
  "evidraLifecycleServiceHash",
  "evidraPipelineBridgeHash",
  "evidraScoreCompareHash",
  "evidraTestsTreeHash",
  "evidraDocsTreeHash",
  "evidraSignalValidationGuideHash",
  "evidraPrescribeCommandHash",
  "evidraReportCommandHash",
  "evidraRecordCommandHash",
  "evidraValidateCommandHash",
  "evidraScorecardCommandHash",
  "evidraPrescribeReportProtocolHash",
  "evidraCanaryResultHash",
  "evidraBaselineSampleManifestHash",
  "evidraLiveSampleManifestHash",
  "evidraDriftStatisticHash",
  "evidraAlertOrWaiverHash",
  "evidraReplayCommandHash",
  "evidraCiReceiptHash",
  "evidraNoSourceCopyProofHash",
  "evidraSignedEvidenceChainHash",
];

const EVIDRA_ID_FIELDS: Array<keyof ProviderDriftCanaryRow> = [
  "evidraReleaseTag",
  "evidraProviderRouteId",
];

function hasEvidraContext(row: ProviderDriftCanaryRow | undefined): boolean {
  if (!row) return false;
  return Boolean(
    EVIDRA_SHA_FIELDS.some((field) => isValidSha256(row[field] as string | undefined)) ||
    EVIDRA_ID_FIELDS.some((field) => normalizeOptionalId(row[field] as string | undefined))
  );
}

function evidraMissingReasons(
  row: ProviderDriftCanaryRow | undefined,
  side: "baseline" | "candidate",
  required: boolean,
): string[] {
  if (!required && !hasEvidraContext(row)) return [];
  const reasons: string[] = [];
  for (const field of EVIDRA_SHA_FIELDS) {
    if (!isValidSha256(row?.[field] as string | undefined)) reasons.push(`${side}:${String(field)}`);
  }
  for (const field of EVIDRA_ID_FIELDS) {
    if (!normalizeOptionalId(row?.[field] as string | undefined)) reasons.push(`${side}:${String(field)}`);
  }
  return reasons;
}

function buildEvidraComparisonFields(
  before: ProviderDriftCanaryRow | undefined,
  after: ProviderDriftCanaryRow | undefined,
  evidraMissingReasons: string[],
) {
  return {
    baselineEvidraSourceRefHash: normalizeSha256(before?.evidraSourceRefHash),
    candidateEvidraSourceRefHash: normalizeSha256(after?.evidraSourceRefHash),
    baselineEvidraRepositorySnapshotHash: normalizeSha256(before?.evidraRepositorySnapshotHash),
    candidateEvidraRepositorySnapshotHash: normalizeSha256(after?.evidraRepositorySnapshotHash),
    baselineEvidraLicenseRefHash: normalizeSha256(before?.evidraLicenseRefHash),
    candidateEvidraLicenseRefHash: normalizeSha256(after?.evidraLicenseRefHash),
    baselineEvidraDefaultBranchHash: normalizeSha256(before?.evidraDefaultBranchHash),
    candidateEvidraDefaultBranchHash: normalizeSha256(after?.evidraDefaultBranchHash),
    baselineEvidraReleaseTag: normalizeOptionalId(before?.evidraReleaseTag),
    candidateEvidraReleaseTag: normalizeOptionalId(after?.evidraReleaseTag),
    baselineEvidraReadmeHash: normalizeSha256(before?.evidraReadmeHash),
    candidateEvidraReadmeHash: normalizeSha256(after?.evidraReadmeHash),
    baselineEvidraGoModHash: normalizeSha256(before?.evidraGoModHash),
    candidateEvidraGoModHash: normalizeSha256(after?.evidraGoModHash),
    baselineEvidraCiWorkflowHash: normalizeSha256(before?.evidraCiWorkflowHash),
    candidateEvidraCiWorkflowHash: normalizeSha256(after?.evidraCiWorkflowHash),
    baselineEvidraReleaseWorkflowHash: normalizeSha256(before?.evidraReleaseWorkflowHash),
    candidateEvidraReleaseWorkflowHash: normalizeSha256(after?.evidraReleaseWorkflowHash),
    baselineEvidraDockerfileHash: normalizeSha256(before?.evidraDockerfileHash),
    candidateEvidraDockerfileHash: normalizeSha256(after?.evidraDockerfileHash),
    baselineEvidraCliTreeHash: normalizeSha256(before?.evidraCliTreeHash),
    candidateEvidraCliTreeHash: normalizeSha256(after?.evidraCliTreeHash),
    baselineEvidraMcpTreeHash: normalizeSha256(before?.evidraMcpTreeHash),
    candidateEvidraMcpTreeHash: normalizeSha256(after?.evidraMcpTreeHash),
    baselineEvidraApiCommandHash: normalizeSha256(before?.evidraApiCommandHash),
    candidateEvidraApiCommandHash: normalizeSha256(after?.evidraApiCommandHash),
    baselineEvidraEvidenceSignerHash: normalizeSha256(before?.evidraEvidenceSignerHash),
    candidateEvidraEvidenceSignerHash: normalizeSha256(after?.evidraEvidenceSignerHash),
    baselineEvidraEvidencePackageHash: normalizeSha256(before?.evidraEvidencePackageHash),
    candidateEvidraEvidencePackageHash: normalizeSha256(after?.evidraEvidencePackageHash),
    baselineEvidraEvlockPackageHash: normalizeSha256(before?.evidraEvlockPackageHash),
    candidateEvidraEvlockPackageHash: normalizeSha256(after?.evidraEvlockPackageHash),
    baselineEvidraExecContractPackageHash: normalizeSha256(before?.evidraExecContractPackageHash),
    candidateEvidraExecContractPackageHash: normalizeSha256(after?.evidraExecContractPackageHash),
    baselineEvidraExportPackageHash: normalizeSha256(before?.evidraExportPackageHash),
    candidateEvidraExportPackageHash: normalizeSha256(after?.evidraExportPackageHash),
    baselineEvidraMcpServerPackageHash: normalizeSha256(before?.evidraMcpServerPackageHash),
    candidateEvidraMcpServerPackageHash: normalizeSha256(after?.evidraMcpServerPackageHash),
    baselineEvidraProxyPackageHash: normalizeSha256(before?.evidraProxyPackageHash),
    candidateEvidraProxyPackageHash: normalizeSha256(after?.evidraProxyPackageHash),
    baselineEvidraLifecycleServiceHash: normalizeSha256(before?.evidraLifecycleServiceHash),
    candidateEvidraLifecycleServiceHash: normalizeSha256(after?.evidraLifecycleServiceHash),
    baselineEvidraPipelineBridgeHash: normalizeSha256(before?.evidraPipelineBridgeHash),
    candidateEvidraPipelineBridgeHash: normalizeSha256(after?.evidraPipelineBridgeHash),
    baselineEvidraScoreCompareHash: normalizeSha256(before?.evidraScoreCompareHash),
    candidateEvidraScoreCompareHash: normalizeSha256(after?.evidraScoreCompareHash),
    baselineEvidraTestsTreeHash: normalizeSha256(before?.evidraTestsTreeHash),
    candidateEvidraTestsTreeHash: normalizeSha256(after?.evidraTestsTreeHash),
    baselineEvidraDocsTreeHash: normalizeSha256(before?.evidraDocsTreeHash),
    candidateEvidraDocsTreeHash: normalizeSha256(after?.evidraDocsTreeHash),
    baselineEvidraSignalValidationGuideHash: normalizeSha256(before?.evidraSignalValidationGuideHash),
    candidateEvidraSignalValidationGuideHash: normalizeSha256(after?.evidraSignalValidationGuideHash),
    baselineEvidraPrescribeCommandHash: normalizeSha256(before?.evidraPrescribeCommandHash),
    candidateEvidraPrescribeCommandHash: normalizeSha256(after?.evidraPrescribeCommandHash),
    baselineEvidraReportCommandHash: normalizeSha256(before?.evidraReportCommandHash),
    candidateEvidraReportCommandHash: normalizeSha256(after?.evidraReportCommandHash),
    baselineEvidraRecordCommandHash: normalizeSha256(before?.evidraRecordCommandHash),
    candidateEvidraRecordCommandHash: normalizeSha256(after?.evidraRecordCommandHash),
    baselineEvidraValidateCommandHash: normalizeSha256(before?.evidraValidateCommandHash),
    candidateEvidraValidateCommandHash: normalizeSha256(after?.evidraValidateCommandHash),
    baselineEvidraScorecardCommandHash: normalizeSha256(before?.evidraScorecardCommandHash),
    candidateEvidraScorecardCommandHash: normalizeSha256(after?.evidraScorecardCommandHash),
    baselineEvidraPrescribeReportProtocolHash: normalizeSha256(before?.evidraPrescribeReportProtocolHash),
    candidateEvidraPrescribeReportProtocolHash: normalizeSha256(after?.evidraPrescribeReportProtocolHash),
    baselineEvidraProviderRouteId: normalizeOptionalId(before?.evidraProviderRouteId),
    candidateEvidraProviderRouteId: normalizeOptionalId(after?.evidraProviderRouteId),
    baselineEvidraCanaryResultHash: normalizeSha256(before?.evidraCanaryResultHash),
    candidateEvidraCanaryResultHash: normalizeSha256(after?.evidraCanaryResultHash),
    baselineEvidraBaselineSampleManifestHash: normalizeSha256(before?.evidraBaselineSampleManifestHash),
    candidateEvidraBaselineSampleManifestHash: normalizeSha256(after?.evidraBaselineSampleManifestHash),
    baselineEvidraLiveSampleManifestHash: normalizeSha256(before?.evidraLiveSampleManifestHash),
    candidateEvidraLiveSampleManifestHash: normalizeSha256(after?.evidraLiveSampleManifestHash),
    baselineEvidraDriftStatisticHash: normalizeSha256(before?.evidraDriftStatisticHash),
    candidateEvidraDriftStatisticHash: normalizeSha256(after?.evidraDriftStatisticHash),
    baselineEvidraAlertOrWaiverHash: normalizeSha256(before?.evidraAlertOrWaiverHash),
    candidateEvidraAlertOrWaiverHash: normalizeSha256(after?.evidraAlertOrWaiverHash),
    baselineEvidraReplayCommandHash: normalizeSha256(before?.evidraReplayCommandHash),
    candidateEvidraReplayCommandHash: normalizeSha256(after?.evidraReplayCommandHash),
    baselineEvidraCiReceiptHash: normalizeSha256(before?.evidraCiReceiptHash),
    candidateEvidraCiReceiptHash: normalizeSha256(after?.evidraCiReceiptHash),
    baselineEvidraNoSourceCopyProofHash: normalizeSha256(before?.evidraNoSourceCopyProofHash),
    candidateEvidraNoSourceCopyProofHash: normalizeSha256(after?.evidraNoSourceCopyProofHash),
    baselineEvidraSignedEvidenceChainHash: normalizeSha256(before?.evidraSignedEvidenceChainHash),
    candidateEvidraSignedEvidenceChainHash: normalizeSha256(after?.evidraSignedEvidenceChainHash),
    evidraMissingReasons,
  };
}

function pickEvidraComparisonFields(comparison: ProviderDriftComparison): Partial<ProviderDriftEvalPackRow> {
  return Object.fromEntries(
    Object.entries(comparison).filter(([key]) => key.includes("Evidra")),
  ) as Partial<ProviderDriftEvalPackRow>;
}

const GALILEO_SHA_FIELDS: Array<keyof ProviderDriftCanaryRow> = [
  "galileoSourceRefHash",
  "galileoWebsiteSnapshotHash",
  "galileoDocsIndexHash",
  "galileoDatasetHash",
  "galileoPromptSetHash",
  "galileoTraceExportHash",
  "galileoMetricReportHash",
  "galileoEvaluatorConfigHash",
  "galileoCanaryResultHash",
  "galileoDriftStatisticHash",
  "galileoAlertOrWaiverHash",
  "galileoSignedEvidenceBundleHash",
  "galileoNoSourceCopyProofHash",
];

const GALILEO_ID_FIELDS: Array<keyof ProviderDriftCanaryRow> = [
  "galileoProductSurfaceId",
  "galileoProjectId",
  "galileoProviderRouteId",
];

function hasGalileoContext(row: ProviderDriftCanaryRow | undefined): boolean {
  if (!row) return false;
  return Boolean(
    GALILEO_SHA_FIELDS.some((field) => isValidSha256(row[field] as string | undefined)) ||
    GALILEO_ID_FIELDS.some((field) => normalizeOptionalId(row[field] as string | undefined)) ||
    normalizedStringList(row.galileoMetricIds).length > 0 ||
    Number.isFinite(row.galileoMetricCount)
  );
}

function galileoMissingReasons(
  row: ProviderDriftCanaryRow | undefined,
  side: "baseline" | "candidate",
  thresholds: ProviderDriftThresholds,
  required: boolean,
): string[] {
  if (!required && !hasGalileoContext(row)) return [];
  const reasons: string[] = [];
  for (const field of GALILEO_SHA_FIELDS) {
    if (!isValidSha256(row?.[field] as string | undefined)) reasons.push(`${side}:${String(field)}`);
  }
  for (const field of GALILEO_ID_FIELDS) {
    if (!normalizeOptionalId(row?.[field] as string | undefined)) reasons.push(`${side}:${String(field)}`);
  }
  if (normalizedStringList(row?.galileoMetricIds).length === 0) reasons.push(`${side}:galileoMetricIds`);
  if (safeNonNegative(row?.galileoMetricCount ?? 0) < thresholds.minEvaluationMetricCount) {
    reasons.push(`${side}:galileoMetricCount`);
  }
  return reasons;
}

function buildGalileoComparisonFields(
  before: ProviderDriftCanaryRow | undefined,
  after: ProviderDriftCanaryRow | undefined,
  galileoMissingReasons: string[],
) {
  return {
    baselineGalileoSourceRefHash: normalizeSha256(before?.galileoSourceRefHash),
    candidateGalileoSourceRefHash: normalizeSha256(after?.galileoSourceRefHash),
    baselineGalileoWebsiteSnapshotHash: normalizeSha256(before?.galileoWebsiteSnapshotHash),
    candidateGalileoWebsiteSnapshotHash: normalizeSha256(after?.galileoWebsiteSnapshotHash),
    baselineGalileoDocsIndexHash: normalizeSha256(before?.galileoDocsIndexHash),
    candidateGalileoDocsIndexHash: normalizeSha256(after?.galileoDocsIndexHash),
    baselineGalileoProductSurfaceId: normalizeOptionalId(before?.galileoProductSurfaceId),
    candidateGalileoProductSurfaceId: normalizeOptionalId(after?.galileoProductSurfaceId),
    baselineGalileoProjectId: normalizeOptionalId(before?.galileoProjectId),
    candidateGalileoProjectId: normalizeOptionalId(after?.galileoProjectId),
    baselineGalileoDatasetHash: normalizeSha256(before?.galileoDatasetHash),
    candidateGalileoDatasetHash: normalizeSha256(after?.galileoDatasetHash),
    baselineGalileoPromptSetHash: normalizeSha256(before?.galileoPromptSetHash),
    candidateGalileoPromptSetHash: normalizeSha256(after?.galileoPromptSetHash),
    baselineGalileoTraceExportHash: normalizeSha256(before?.galileoTraceExportHash),
    candidateGalileoTraceExportHash: normalizeSha256(after?.galileoTraceExportHash),
    baselineGalileoMetricReportHash: normalizeSha256(before?.galileoMetricReportHash),
    candidateGalileoMetricReportHash: normalizeSha256(after?.galileoMetricReportHash),
    baselineGalileoEvaluatorConfigHash: normalizeSha256(before?.galileoEvaluatorConfigHash),
    candidateGalileoEvaluatorConfigHash: normalizeSha256(after?.galileoEvaluatorConfigHash),
    baselineGalileoProviderRouteId: normalizeOptionalId(before?.galileoProviderRouteId),
    candidateGalileoProviderRouteId: normalizeOptionalId(after?.galileoProviderRouteId),
    baselineGalileoCanaryResultHash: normalizeSha256(before?.galileoCanaryResultHash),
    candidateGalileoCanaryResultHash: normalizeSha256(after?.galileoCanaryResultHash),
    baselineGalileoDriftStatisticHash: normalizeSha256(before?.galileoDriftStatisticHash),
    candidateGalileoDriftStatisticHash: normalizeSha256(after?.galileoDriftStatisticHash),
    baselineGalileoAlertOrWaiverHash: normalizeSha256(before?.galileoAlertOrWaiverHash),
    candidateGalileoAlertOrWaiverHash: normalizeSha256(after?.galileoAlertOrWaiverHash),
    baselineGalileoSignedEvidenceBundleHash: normalizeSha256(before?.galileoSignedEvidenceBundleHash),
    candidateGalileoSignedEvidenceBundleHash: normalizeSha256(after?.galileoSignedEvidenceBundleHash),
    baselineGalileoNoSourceCopyProofHash: normalizeSha256(before?.galileoNoSourceCopyProofHash),
    candidateGalileoNoSourceCopyProofHash: normalizeSha256(after?.galileoNoSourceCopyProofHash),
    baselineGalileoMetricIds: normalizedStringList(before?.galileoMetricIds),
    candidateGalileoMetricIds: normalizedStringList(after?.galileoMetricIds),
    baselineGalileoMetricCount: safeNonNegative(before?.galileoMetricCount ?? 0),
    candidateGalileoMetricCount: safeNonNegative(after?.galileoMetricCount ?? 0),
    galileoMissingReasons,
  };
}

function pickGalileoComparisonFields(comparison: ProviderDriftComparison): Partial<ProviderDriftEvalPackRow> {
  return Object.fromEntries(
    Object.entries(comparison).filter(([key]) => key.includes("Galileo") || key === "galileoMissingReasons"),
  ) as Partial<ProviderDriftEvalPackRow>;
}

function percentRatio(after: number, before: number): number {
  if (!Number.isFinite(after) || !Number.isFinite(before)) return 0;
  if (before <= 0) return after > 0 ? 1 : 0;
  return (after - before) / before;
}

function activeWaivers(waivers: ProviderDriftWaiver[], now: Date): ProviderDriftWaiver[] {
  return waivers.filter((waiver) => {
    const expiresAt = Date.parse(waiver.expiresAt);
    return Number.isFinite(expiresAt) && expiresAt > now.getTime();
  });
}

function coversAlert(waiver: ProviderDriftWaiver, alert: Omit<ProviderDriftAlert, "waived" | "waiverId">): boolean {
  if (waiver.provider && waiver.provider !== alert.provider) return false;
  if (waiver.model && waiver.model !== alert.model) return false;
  if (waiver.canaryId && waiver.canaryId !== alert.canaryId) return false;
  if (waiver.metricIds && !waiver.metricIds.includes(alert.metricId)) return false;
  return waiver.evidenceRefs.length > 0;
}

function severityForMetric(metricId: ProviderDriftMetricId, observed: number, threshold: number): ProviderDriftSeverity {
  if (metricId === "sampleSize" || metricId === "trajectoryCount" || metricId === "evidenceRefs") return "high";
  if (
    metricId === "signedEvidenceRefs" ||
    metricId === "evaluationFrameworkEvidence" ||
    metricId === "observabilityPipelineEvidence" ||
    metricId === "orbitMonitorEvidence" ||
    metricId === "geospatialToolCallingEvidence" ||
    metricId === "falconEvaluateEvidence" ||
    metricId === "agentDefenseBenchEvidence" ||
    metricId === "evidraEvidenceChainEvidence" ||
    metricId === "galileoObservabilityEvidence"
  ) return "critical";
  if (threshold <= 0) return "high";
  const ratio = Math.abs(observed / threshold);
  if (ratio >= 3) return "critical";
  if (ratio >= 1.5) return "high";
  if (ratio >= 1) return "medium";
  return "low";
}

function makeAlert(
  comparison: Pick<ProviderDriftComparison, "provider" | "model" | "canaryId" | "evidenceRefs">,
  metricId: ProviderDriftMetricId,
  observed: number,
  threshold: number,
  message: string,
  active: ProviderDriftWaiver[],
): ProviderDriftAlert {
  const base = {
    alertId: `pdrift:${comparison.provider}:${comparison.model}:${comparison.canaryId}:${metricId}`,
    provider: comparison.provider,
    model: comparison.model,
    canaryId: comparison.canaryId,
    metricId,
    severity: severityForMetric(metricId, observed, threshold),
    message,
    threshold,
    observed: round(observed),
    evidenceRefs: comparison.evidenceRefs,
  };
  const waiver = active.find((item) => coversAlert(item, base));
  return {
    ...base,
    waived: Boolean(waiver),
    waiverId: waiver?.waiverId,
  };
}

function driftStatistic(parts: number[]): number {
  const positive = parts.map((part) => Math.max(0, part));
  if (positive.length === 0) return 0;
  const rms = Math.sqrt(positive.reduce((sum, part) => sum + part ** 2, 0) / positive.length);
  return round(rms);
}

function recommendationFromAlerts(alerts: ProviderDriftAlert[], comparisons: ProviderDriftComparison[]): ProviderDriftRecommendation {
  if (alerts.some((alert) => !alert.waived)) return "alert";
  if (alerts.length > 0 && alerts.every((alert) => alert.waived)) return "waive";
  if (comparisons.some((comparison) => comparison.status === "monitor")) return "monitor";
  return "approve";
}

export function runProviderDriftBenchmark(input: RunProviderDriftBenchmarkInput): ProviderDriftBenchmarkReport {
  const now = input.now ?? new Date();
  const thresholds: ProviderDriftThresholds = {
    ...defaultProviderDriftThresholds,
    ...input.thresholds,
  };
  const active = activeWaivers(input.waivers ?? [], now);
  const baselineByKey = new Map(input.baseline.map((row) => [rowKey(row), row]));
  const candidateByKey = new Map(input.candidate.map((row) => [rowKey(row), row]));
  const keys = unique([...baselineByKey.keys(), ...candidateByKey.keys()]).sort((a, b) => a.localeCompare(b));
  const comparisons: ProviderDriftComparison[] = [];
  const alerts: ProviderDriftAlert[] = [];

  for (const key of keys) {
    const before = baselineByKey.get(key);
    const after = candidateByKey.get(key);
    const row = after ?? before;
    if (!row) continue;

    const evidenceRefs = unique([...(before?.evidenceRefs ?? []), ...(after?.evidenceRefs ?? [])]);
    const signedEvidenceRefs = unique([...(before?.signedEvidenceRefs ?? []), ...(after?.signedEvidenceRefs ?? [])]);
    const falconEvaluateRequired = hasFalconEvaluateContext(before) || hasFalconEvaluateContext(after);
    const orbitMonitorRequired = hasOrbitMonitorContext(before) || hasOrbitMonitorContext(after);
    const geospatialToolCallingRequired = hasGeospatialToolCallingContext(before) || hasGeospatialToolCallingContext(after);
    const agentDefenseBenchRequired = hasAgentDefenseBenchContext(before) || hasAgentDefenseBenchContext(after);
    const evidraRequired = hasEvidraContext(before) || hasEvidraContext(after);
    const galileoRequired = hasGalileoContext(before) || hasGalileoContext(after);
    const evidraMissing = unique([
      ...evidraMissingReasons(before, "baseline", evidraRequired),
      ...evidraMissingReasons(after, "candidate", evidraRequired),
    ]);
    const galileoMissing = unique([
      ...galileoMissingReasons(before, "baseline", thresholds, galileoRequired),
      ...galileoMissingReasons(after, "candidate", thresholds, galileoRequired),
    ]);
    const comparison: ProviderDriftComparison = {
      provider: row.provider,
      model: row.model,
      canaryId: row.canaryId,
      baselineBenchmarkFamily: normalizeOptionalId(before?.benchmarkFamily),
      candidateBenchmarkFamily: normalizeOptionalId(after?.benchmarkFamily),
      baselineCapabilityId: normalizeOptionalId(before?.capabilityId),
      candidateCapabilityId: normalizeOptionalId(after?.capabilityId),
      baselineArenaId: normalizeOptionalId(before?.arenaId),
      candidateArenaId: normalizeOptionalId(after?.arenaId),
      baselineEnvironmentId: normalizeOptionalId(before?.environmentId),
      candidateEnvironmentId: normalizeOptionalId(after?.environmentId),
      baselineReferencePoolId: normalizeOptionalId(before?.referencePoolId),
      candidateReferencePoolId: normalizeOptionalId(after?.referencePoolId),
      baselineEvaluationFrameworkId: normalizeOptionalId(before?.evaluationFrameworkId),
      candidateEvaluationFrameworkId: normalizeOptionalId(after?.evaluationFrameworkId),
      baselineEvaluationFrameworkVersion: normalizeOptionalId(before?.evaluationFrameworkVersion),
      candidateEvaluationFrameworkVersion: normalizeOptionalId(after?.evaluationFrameworkVersion),
      baselineProviderRouteId: normalizeOptionalId(before?.providerRouteId),
      candidateProviderRouteId: normalizeOptionalId(after?.providerRouteId),
      baselineMetricSuiteId: normalizeOptionalId(before?.metricSuiteId),
      candidateMetricSuiteId: normalizeOptionalId(after?.metricSuiteId),
      baselineMetricIds: normalizedStringList(before?.metricIds),
      candidateMetricIds: normalizedStringList(after?.metricIds),
      baselineMetricCount: safeNonNegative(before?.metricCount ?? 0),
      candidateMetricCount: safeNonNegative(after?.metricCount ?? 0),
      baselineEvaluatorConfigHash: isValidSha256(before?.evaluatorConfigHash) ? before?.evaluatorConfigHash?.toLowerCase() : undefined,
      candidateEvaluatorConfigHash: isValidSha256(after?.evaluatorConfigHash) ? after?.evaluatorConfigHash?.toLowerCase() : undefined,
      baselineGeneratedTestDataHash: isValidSha256(before?.generatedTestDataHash) ? before?.generatedTestDataHash?.toLowerCase() : undefined,
      candidateGeneratedTestDataHash: isValidSha256(after?.generatedTestDataHash) ? after?.generatedTestDataHash?.toLowerCase() : undefined,
      baselineVerdictAggregation: before?.verdictAggregation,
      candidateVerdictAggregation: after?.verdictAggregation,
      baselineVerdictAggregationConfigHash: isValidSha256(before?.verdictAggregationConfigHash) ? before?.verdictAggregationConfigHash?.toLowerCase() : undefined,
      candidateVerdictAggregationConfigHash: isValidSha256(after?.verdictAggregationConfigHash) ? after?.verdictAggregationConfigHash?.toLowerCase() : undefined,
      baselineVerdictTemperature: Number.isFinite(before?.verdictTemperature) ? before?.verdictTemperature : undefined,
      candidateVerdictTemperature: Number.isFinite(after?.verdictTemperature) ? after?.verdictTemperature : undefined,
      baselineVerdictPowerMeanP: Number.isFinite(before?.verdictPowerMeanP) ? before?.verdictPowerMeanP : undefined,
      candidateVerdictPowerMeanP: Number.isFinite(after?.verdictPowerMeanP) ? after?.verdictPowerMeanP : undefined,
      baselineDashboardArtifactHash: isValidSha256(before?.dashboardArtifactHash) ? before?.dashboardArtifactHash?.toLowerCase() : undefined,
      candidateDashboardArtifactHash: isValidSha256(after?.dashboardArtifactHash) ? after?.dashboardArtifactHash?.toLowerCase() : undefined,
      evaluationFrameworkMissingReasons: unique([
        ...evaluationFrameworkMissingReasons(before, "baseline", thresholds),
        ...evaluationFrameworkMissingReasons(after, "candidate", thresholds),
      ]),
      baselineFalconEvaluateSourceRefHash: normalizeSha256(before?.falconEvaluateSourceRefHash),
      candidateFalconEvaluateSourceRefHash: normalizeSha256(after?.falconEvaluateSourceRefHash),
      baselineFalconEvaluateRepositorySnapshotHash: normalizeSha256(before?.falconEvaluateRepositorySnapshotHash),
      candidateFalconEvaluateRepositorySnapshotHash: normalizeSha256(after?.falconEvaluateRepositorySnapshotHash),
      baselineFalconEvaluateLicenseRefHash: normalizeSha256(before?.falconEvaluateLicenseRefHash),
      candidateFalconEvaluateLicenseRefHash: normalizeSha256(after?.falconEvaluateLicenseRefHash),
      baselineFalconEvaluateDefaultBranchHash: normalizeSha256(before?.falconEvaluateDefaultBranchHash),
      candidateFalconEvaluateDefaultBranchHash: normalizeSha256(after?.falconEvaluateDefaultBranchHash),
      baselineFalconEvaluateReleaseTag: normalizeOptionalId(before?.falconEvaluateReleaseTag),
      candidateFalconEvaluateReleaseTag: normalizeOptionalId(after?.falconEvaluateReleaseTag),
      baselineFalconEvaluatePackageManifestHash: normalizeSha256(before?.falconEvaluatePackageManifestHash),
      candidateFalconEvaluatePackageManifestHash: normalizeSha256(after?.falconEvaluatePackageManifestHash),
      baselineFalconEvaluateLockfileHash: normalizeSha256(before?.falconEvaluateLockfileHash),
      candidateFalconEvaluateLockfileHash: normalizeSha256(after?.falconEvaluateLockfileHash),
      baselineFalconEvaluateRequirementsHash: normalizeSha256(before?.falconEvaluateRequirementsHash),
      candidateFalconEvaluateRequirementsHash: normalizeSha256(after?.falconEvaluateRequirementsHash),
      baselineFalconEvaluateReadmeHash: normalizeSha256(before?.falconEvaluateReadmeHash),
      candidateFalconEvaluateReadmeHash: normalizeSha256(after?.falconEvaluateReadmeHash),
      baselineFalconEvaluateDocsIndexHash: normalizeSha256(before?.falconEvaluateDocsIndexHash),
      candidateFalconEvaluateDocsIndexHash: normalizeSha256(after?.falconEvaluateDocsIndexHash),
      baselineFalconEvaluateWorkflowHash: normalizeSha256(before?.falconEvaluateWorkflowHash),
      candidateFalconEvaluateWorkflowHash: normalizeSha256(after?.falconEvaluateWorkflowHash),
      baselineFalconEvaluateEvaluationModuleHash: normalizeSha256(before?.falconEvaluateEvaluationModuleHash),
      candidateFalconEvaluateEvaluationModuleHash: normalizeSha256(after?.falconEvaluateEvaluationModuleHash),
      baselineFalconEvaluateContextRelevancyModuleHash: normalizeSha256(
        before?.falconEvaluateContextRelevancyModuleHash,
      ),
      candidateFalconEvaluateContextRelevancyModuleHash: normalizeSha256(
        after?.falconEvaluateContextRelevancyModuleHash,
      ),
      baselineFalconEvaluateFairnessModuleHash: normalizeSha256(before?.falconEvaluateFairnessModuleHash),
      candidateFalconEvaluateFairnessModuleHash: normalizeSha256(after?.falconEvaluateFairnessModuleHash),
      baselineFalconEvaluateReliabilityModuleHash: normalizeSha256(before?.falconEvaluateReliabilityModuleHash),
      candidateFalconEvaluateReliabilityModuleHash: normalizeSha256(after?.falconEvaluateReliabilityModuleHash),
      baselineFalconEvaluateSecurityModuleHash: normalizeSha256(before?.falconEvaluateSecurityModuleHash),
      candidateFalconEvaluateSecurityModuleHash: normalizeSha256(after?.falconEvaluateSecurityModuleHash),
      baselineFalconEvaluateMachineEthicsModuleHash: normalizeSha256(before?.falconEvaluateMachineEthicsModuleHash),
      candidateFalconEvaluateMachineEthicsModuleHash: normalizeSha256(after?.falconEvaluateMachineEthicsModuleHash),
      baselineFalconEvaluateResultsModuleHash: normalizeSha256(before?.falconEvaluateResultsModuleHash),
      candidateFalconEvaluateResultsModuleHash: normalizeSha256(after?.falconEvaluateResultsModuleHash),
      baselineFalconEvaluatePlotModuleHash: normalizeSha256(before?.falconEvaluatePlotModuleHash),
      candidateFalconEvaluatePlotModuleHash: normalizeSha256(after?.falconEvaluatePlotModuleHash),
      baselineFalconEvaluateUserAnalyticsModuleHash: normalizeSha256(before?.falconEvaluateUserAnalyticsModuleHash),
      candidateFalconEvaluateUserAnalyticsModuleHash: normalizeSha256(after?.falconEvaluateUserAnalyticsModuleHash),
      baselineFalconEvaluateValidationDataSchemaHash: normalizeSha256(
        before?.falconEvaluateValidationDataSchemaHash,
      ),
      candidateFalconEvaluateValidationDataSchemaHash: normalizeSha256(
        after?.falconEvaluateValidationDataSchemaHash,
      ),
      baselineFalconEvaluateMetricFamilyIds: normalizedStringList(before?.falconEvaluateMetricFamilyIds),
      candidateFalconEvaluateMetricFamilyIds: normalizedStringList(after?.falconEvaluateMetricFamilyIds),
      baselineFalconEvaluateMetricIds: normalizedStringList(before?.falconEvaluateMetricIds),
      candidateFalconEvaluateMetricIds: normalizedStringList(after?.falconEvaluateMetricIds),
      baselineFalconEvaluateMetricCount: safeNonNegative(before?.falconEvaluateMetricCount ?? 0),
      candidateFalconEvaluateMetricCount: safeNonNegative(after?.falconEvaluateMetricCount ?? 0),
      baselineFalconEvaluateProviderRouteId: normalizeOptionalId(before?.falconEvaluateProviderRouteId),
      candidateFalconEvaluateProviderRouteId: normalizeOptionalId(after?.falconEvaluateProviderRouteId),
      baselineFalconEvaluateCanaryResultHash: normalizeSha256(before?.falconEvaluateCanaryResultHash),
      candidateFalconEvaluateCanaryResultHash: normalizeSha256(after?.falconEvaluateCanaryResultHash),
      falconEvaluateMissingReasons: unique([
        ...falconEvaluateMissingReasons(before, "baseline", thresholds, falconEvaluateRequired),
        ...falconEvaluateMissingReasons(after, "candidate", thresholds, falconEvaluateRequired),
      ]),
      baselinePipelineOrchestratorId: normalizeOptionalId(before?.pipelineOrchestratorId),
      candidatePipelineOrchestratorId: normalizeOptionalId(after?.pipelineOrchestratorId),
      baselinePipelineRunId: normalizeOptionalId(before?.pipelineRunId),
      candidatePipelineRunId: normalizeOptionalId(after?.pipelineRunId),
      baselineExperimentTrackerId: normalizeOptionalId(before?.experimentTrackerId),
      candidateExperimentTrackerId: normalizeOptionalId(after?.experimentTrackerId),
      baselineExperimentRunId: normalizeOptionalId(before?.experimentRunId),
      candidateExperimentRunId: normalizeOptionalId(after?.experimentRunId),
      baselineObservabilityProjectId: normalizeOptionalId(before?.observabilityProjectId),
      candidateObservabilityProjectId: normalizeOptionalId(after?.observabilityProjectId),
      baselineDatastoreId: normalizeOptionalId(before?.datastoreId),
      candidateDatastoreId: normalizeOptionalId(after?.datastoreId),
      baselineRetrievalIndexHash: isValidSha256(before?.retrievalIndexHash) ? before?.retrievalIndexHash?.toLowerCase() : undefined,
      candidateRetrievalIndexHash: isValidSha256(after?.retrievalIndexHash) ? after?.retrievalIndexHash?.toLowerCase() : undefined,
      baselineContentDatasetHash: isValidSha256(before?.contentDatasetHash) ? before?.contentDatasetHash?.toLowerCase() : undefined,
      candidateContentDatasetHash: isValidSha256(after?.contentDatasetHash) ? after?.contentDatasetHash?.toLowerCase() : undefined,
      baselineSummaryArtifactHash: isValidSha256(before?.summaryArtifactHash) ? before?.summaryArtifactHash?.toLowerCase() : undefined,
      candidateSummaryArtifactHash: isValidSha256(after?.summaryArtifactHash) ? after?.summaryArtifactHash?.toLowerCase() : undefined,
      baselineQaDatasetHash: isValidSha256(before?.qaDatasetHash) ? before?.qaDatasetHash?.toLowerCase() : undefined,
      candidateQaDatasetHash: isValidSha256(after?.qaDatasetHash) ? after?.qaDatasetHash?.toLowerCase() : undefined,
      baselineTraceExportHash: isValidSha256(before?.traceExportHash) ? before?.traceExportHash?.toLowerCase() : undefined,
      candidateTraceExportHash: isValidSha256(after?.traceExportHash) ? after?.traceExportHash?.toLowerCase() : undefined,
      baselineMetricReportHash: isValidSha256(before?.metricReportHash) ? before?.metricReportHash?.toLowerCase() : undefined,
      candidateMetricReportHash: isValidSha256(after?.metricReportHash) ? after?.metricReportHash?.toLowerCase() : undefined,
      baselinePipelineConfigHash: isValidSha256(before?.pipelineConfigHash) ? before?.pipelineConfigHash?.toLowerCase() : undefined,
      candidatePipelineConfigHash: isValidSha256(after?.pipelineConfigHash) ? after?.pipelineConfigHash?.toLowerCase() : undefined,
      observabilityPipelineMissingReasons: unique([
        ...observabilityPipelineMissingReasons(before, "baseline"),
        ...observabilityPipelineMissingReasons(after, "candidate"),
      ]),
      baselineOrbitMonitorSourceRefHash: isValidSha256(before?.orbitMonitorSourceRefHash) ? before?.orbitMonitorSourceRefHash?.toLowerCase() : undefined,
      candidateOrbitMonitorSourceRefHash: isValidSha256(after?.orbitMonitorSourceRefHash) ? after?.orbitMonitorSourceRefHash?.toLowerCase() : undefined,
      baselineOrbitMonitorRepositorySnapshotHash: isValidSha256(before?.orbitMonitorRepositorySnapshotHash) ? before?.orbitMonitorRepositorySnapshotHash?.toLowerCase() : undefined,
      candidateOrbitMonitorRepositorySnapshotHash: isValidSha256(after?.orbitMonitorRepositorySnapshotHash) ? after?.orbitMonitorRepositorySnapshotHash?.toLowerCase() : undefined,
      baselineOrbitMonitorLicenseRefHash: isValidSha256(before?.orbitMonitorLicenseRefHash) ? before?.orbitMonitorLicenseRefHash?.toLowerCase() : undefined,
      candidateOrbitMonitorLicenseRefHash: isValidSha256(after?.orbitMonitorLicenseRefHash) ? after?.orbitMonitorLicenseRefHash?.toLowerCase() : undefined,
      baselineOrbitMonitorSourceCatalogHash: isValidSha256(before?.orbitMonitorSourceCatalogHash) ? before?.orbitMonitorSourceCatalogHash?.toLowerCase() : undefined,
      candidateOrbitMonitorSourceCatalogHash: isValidSha256(after?.orbitMonitorSourceCatalogHash) ? after?.orbitMonitorSourceCatalogHash?.toLowerCase() : undefined,
      baselineOrbitMonitorLeaderboardSnapshotHash: isValidSha256(before?.orbitMonitorLeaderboardSnapshotHash) ? before?.orbitMonitorLeaderboardSnapshotHash?.toLowerCase() : undefined,
      candidateOrbitMonitorLeaderboardSnapshotHash: isValidSha256(after?.orbitMonitorLeaderboardSnapshotHash) ? after?.orbitMonitorLeaderboardSnapshotHash?.toLowerCase() : undefined,
      baselineOrbitMonitorModelRegistrySnapshotHash: isValidSha256(before?.orbitMonitorModelRegistrySnapshotHash) ? before?.orbitMonitorModelRegistrySnapshotHash?.toLowerCase() : undefined,
      candidateOrbitMonitorModelRegistrySnapshotHash: isValidSha256(after?.orbitMonitorModelRegistrySnapshotHash) ? after?.orbitMonitorModelRegistrySnapshotHash?.toLowerCase() : undefined,
      baselineOrbitMonitorBenchmarkFeedSnapshotHash: isValidSha256(before?.orbitMonitorBenchmarkFeedSnapshotHash) ? before?.orbitMonitorBenchmarkFeedSnapshotHash?.toLowerCase() : undefined,
      candidateOrbitMonitorBenchmarkFeedSnapshotHash: isValidSha256(after?.orbitMonitorBenchmarkFeedSnapshotHash) ? after?.orbitMonitorBenchmarkFeedSnapshotHash?.toLowerCase() : undefined,
      baselineOrbitMonitorNewsFeedSnapshotHash: isValidSha256(before?.orbitMonitorNewsFeedSnapshotHash) ? before?.orbitMonitorNewsFeedSnapshotHash?.toLowerCase() : undefined,
      candidateOrbitMonitorNewsFeedSnapshotHash: isValidSha256(after?.orbitMonitorNewsFeedSnapshotHash) ? after?.orbitMonitorNewsFeedSnapshotHash?.toLowerCase() : undefined,
      baselineOrbitMonitorReloadRunHash: isValidSha256(before?.orbitMonitorReloadRunHash) ? before?.orbitMonitorReloadRunHash?.toLowerCase() : undefined,
      candidateOrbitMonitorReloadRunHash: isValidSha256(after?.orbitMonitorReloadRunHash) ? after?.orbitMonitorReloadRunHash?.toLowerCase() : undefined,
      baselineOrbitMonitorRankingPolicyHash: isValidSha256(before?.orbitMonitorRankingPolicyHash) ? before?.orbitMonitorRankingPolicyHash?.toLowerCase() : undefined,
      candidateOrbitMonitorRankingPolicyHash: isValidSha256(after?.orbitMonitorRankingPolicyHash) ? after?.orbitMonitorRankingPolicyHash?.toLowerCase() : undefined,
      baselineOrbitMonitorSummaryArtifactHash: isValidSha256(before?.orbitMonitorSummaryArtifactHash) ? before?.orbitMonitorSummaryArtifactHash?.toLowerCase() : undefined,
      candidateOrbitMonitorSummaryArtifactHash: isValidSha256(after?.orbitMonitorSummaryArtifactHash) ? after?.orbitMonitorSummaryArtifactHash?.toLowerCase() : undefined,
      baselineOrbitMonitorSourceCount: safeNonNegative(before?.orbitMonitorSourceCount ?? 0),
      candidateOrbitMonitorSourceCount: safeNonNegative(after?.orbitMonitorSourceCount ?? 0),
      baselineOrbitMonitorLeaderboardCategoryCount: safeNonNegative(before?.orbitMonitorLeaderboardCategoryCount ?? 0),
      candidateOrbitMonitorLeaderboardCategoryCount: safeNonNegative(after?.orbitMonitorLeaderboardCategoryCount ?? 0),
      baselineOrbitMonitorDailyReloadVerified: before?.orbitMonitorDailyReloadVerified === true,
      candidateOrbitMonitorDailyReloadVerified: after?.orbitMonitorDailyReloadVerified === true,
      orbitMonitorMissingReasons: unique([
        ...orbitMonitorMissingReasons(before, "baseline", thresholds, orbitMonitorRequired),
        ...orbitMonitorMissingReasons(after, "candidate", thresholds, orbitMonitorRequired),
      ]),
      baselineGeospatialBenchmarkId: normalizeOptionalId(before?.geospatialBenchmarkId),
      candidateGeospatialBenchmarkId: normalizeOptionalId(after?.geospatialBenchmarkId),
      baselineGeospatialTaskSetHash: isValidSha256(before?.geospatialTaskSetHash) ? before?.geospatialTaskSetHash?.toLowerCase() : undefined,
      candidateGeospatialTaskSetHash: isValidSha256(after?.geospatialTaskSetHash) ? after?.geospatialTaskSetHash?.toLowerCase() : undefined,
      baselineGeospatialDatasetSnapshotHash: isValidSha256(before?.geospatialDatasetSnapshotHash) ? before?.geospatialDatasetSnapshotHash?.toLowerCase() : undefined,
      candidateGeospatialDatasetSnapshotHash: isValidSha256(after?.geospatialDatasetSnapshotHash) ? after?.geospatialDatasetSnapshotHash?.toLowerCase() : undefined,
      baselineGeospatialToolRegistryHash: isValidSha256(before?.geospatialToolRegistryHash) ? before?.geospatialToolRegistryHash?.toLowerCase() : undefined,
      candidateGeospatialToolRegistryHash: isValidSha256(after?.geospatialToolRegistryHash) ? after?.geospatialToolRegistryHash?.toLowerCase() : undefined,
      baselineGeospatialReferenceSolutionHash: isValidSha256(before?.geospatialReferenceSolutionHash) ? before?.geospatialReferenceSolutionHash?.toLowerCase() : undefined,
      candidateGeospatialReferenceSolutionHash: isValidSha256(after?.geospatialReferenceSolutionHash) ? after?.geospatialReferenceSolutionHash?.toLowerCase() : undefined,
      baselineGeospatialTraceExportHash: isValidSha256(before?.geospatialTraceExportHash) ? before?.geospatialTraceExportHash?.toLowerCase() : undefined,
      candidateGeospatialTraceExportHash: isValidSha256(after?.geospatialTraceExportHash) ? after?.geospatialTraceExportHash?.toLowerCase() : undefined,
      baselineGeospatialJudgePanelId: normalizeOptionalId(before?.geospatialJudgePanelId),
      candidateGeospatialJudgePanelId: normalizeOptionalId(after?.geospatialJudgePanelId),
      baselineGeospatialJudgeConfigHash: isValidSha256(before?.geospatialJudgeConfigHash) ? before?.geospatialJudgeConfigHash?.toLowerCase() : undefined,
      candidateGeospatialJudgeConfigHash: isValidSha256(after?.geospatialJudgeConfigHash) ? after?.geospatialJudgeConfigHash?.toLowerCase() : undefined,
      baselineGeospatialHumanCalibrationHash: isValidSha256(before?.geospatialHumanCalibrationHash) ? before?.geospatialHumanCalibrationHash?.toLowerCase() : undefined,
      candidateGeospatialHumanCalibrationHash: isValidSha256(after?.geospatialHumanCalibrationHash) ? after?.geospatialHumanCalibrationHash?.toLowerCase() : undefined,
      baselineGeospatialResultReportHash: isValidSha256(before?.geospatialResultReportHash) ? before?.geospatialResultReportHash?.toLowerCase() : undefined,
      candidateGeospatialResultReportHash: isValidSha256(after?.geospatialResultReportHash) ? after?.geospatialResultReportHash?.toLowerCase() : undefined,
      baselineGeospatialTokenCostReportHash: isValidSha256(before?.geospatialTokenCostReportHash) ? before?.geospatialTokenCostReportHash?.toLowerCase() : undefined,
      candidateGeospatialTokenCostReportHash: isValidSha256(after?.geospatialTokenCostReportHash) ? after?.geospatialTokenCostReportHash?.toLowerCase() : undefined,
      baselineGeospatialTaskComplexityGroups: normalizedStringList(before?.geospatialTaskComplexityGroups),
      candidateGeospatialTaskComplexityGroups: normalizedStringList(after?.geospatialTaskComplexityGroups),
      baselineGeospatialSolvableTaskCount: safeNonNegative(before?.geospatialSolvableTaskCount ?? 0),
      candidateGeospatialSolvableTaskCount: safeNonNegative(after?.geospatialSolvableTaskCount ?? 0),
      baselineGeospatialUnsolvableTaskCount: safeNonNegative(before?.geospatialUnsolvableTaskCount ?? 0),
      candidateGeospatialUnsolvableTaskCount: safeNonNegative(after?.geospatialUnsolvableTaskCount ?? 0),
      baselineGeospatialToolCount: safeNonNegative(before?.geospatialToolCount ?? 0),
      candidateGeospatialToolCount: safeNonNegative(after?.geospatialToolCount ?? 0),
      baselineGeospatialMaxToolIterations: safeNonNegative(before?.geospatialMaxToolIterations ?? 0),
      candidateGeospatialMaxToolIterations: safeNonNegative(after?.geospatialMaxToolIterations ?? 0),
      geospatialToolCallingMissingReasons: unique([
        ...geospatialToolCallingMissingReasons(before, "baseline", thresholds, geospatialToolCallingRequired),
        ...geospatialToolCallingMissingReasons(after, "candidate", thresholds, geospatialToolCallingRequired),
      ]),
      baselineAgentDefenseBenchSourceRefHash: normalizeSha256(before?.agentDefenseBenchSourceRefHash),
      candidateAgentDefenseBenchSourceRefHash: normalizeSha256(after?.agentDefenseBenchSourceRefHash),
      baselineAgentDefenseBenchRepositorySnapshotHash: normalizeSha256(before?.agentDefenseBenchRepositorySnapshotHash),
      candidateAgentDefenseBenchRepositorySnapshotHash: normalizeSha256(after?.agentDefenseBenchRepositorySnapshotHash),
      baselineAgentDefenseBenchLicenseRefHash: normalizeSha256(before?.agentDefenseBenchLicenseRefHash),
      candidateAgentDefenseBenchLicenseRefHash: normalizeSha256(after?.agentDefenseBenchLicenseRefHash),
      baselineAgentDefenseBenchDefaultBranchHash: normalizeSha256(before?.agentDefenseBenchDefaultBranchHash),
      candidateAgentDefenseBenchDefaultBranchHash: normalizeSha256(after?.agentDefenseBenchDefaultBranchHash),
      baselineAgentDefenseBenchReadmeHash: normalizeSha256(before?.agentDefenseBenchReadmeHash),
      candidateAgentDefenseBenchReadmeHash: normalizeSha256(after?.agentDefenseBenchReadmeHash),
      baselineAgentDefenseBenchChecksumsHash: normalizeSha256(before?.agentDefenseBenchChecksumsHash),
      candidateAgentDefenseBenchChecksumsHash: normalizeSha256(after?.agentDefenseBenchChecksumsHash),
      baselineAgentDefenseBenchCitationHash: normalizeSha256(before?.agentDefenseBenchCitationHash),
      candidateAgentDefenseBenchCitationHash: normalizeSha256(after?.agentDefenseBenchCitationHash),
      baselineAgentDefenseBenchRequirementsHash: normalizeSha256(before?.agentDefenseBenchRequirementsHash),
      candidateAgentDefenseBenchRequirementsHash: normalizeSha256(after?.agentDefenseBenchRequirementsHash),
      baselineAgentDefenseBenchMcpServerManifestHash: normalizeSha256(before?.agentDefenseBenchMcpServerManifestHash),
      candidateAgentDefenseBenchMcpServerManifestHash: normalizeSha256(after?.agentDefenseBenchMcpServerManifestHash),
      baselineAgentDefenseBenchAttackBankHash: normalizeSha256(before?.agentDefenseBenchAttackBankHash),
      candidateAgentDefenseBenchAttackBankHash: normalizeSha256(after?.agentDefenseBenchAttackBankHash),
      baselineAgentDefenseBenchAcademicBenchmarkHash: normalizeSha256(before?.agentDefenseBenchAcademicBenchmarkHash),
      candidateAgentDefenseBenchAcademicBenchmarkHash: normalizeSha256(after?.agentDefenseBenchAcademicBenchmarkHash),
      baselineAgentDefenseBenchSafetyBenchmarkHash: normalizeSha256(before?.agentDefenseBenchSafetyBenchmarkHash),
      candidateAgentDefenseBenchSafetyBenchmarkHash: normalizeSha256(after?.agentDefenseBenchSafetyBenchmarkHash),
      baselineAgentDefenseBenchCybersecurityBenchmarkHash: normalizeSha256(
        before?.agentDefenseBenchCybersecurityBenchmarkHash,
      ),
      candidateAgentDefenseBenchCybersecurityBenchmarkHash: normalizeSha256(
        after?.agentDefenseBenchCybersecurityBenchmarkHash,
      ),
      baselineAgentDefenseBenchMcpSpecificSuiteHash: normalizeSha256(before?.agentDefenseBenchMcpSpecificSuiteHash),
      candidateAgentDefenseBenchMcpSpecificSuiteHash: normalizeSha256(after?.agentDefenseBenchMcpSpecificSuiteHash),
      baselineAgentDefenseBenchDefenseServerHash: normalizeSha256(before?.agentDefenseBenchDefenseServerHash),
      candidateAgentDefenseBenchDefenseServerHash: normalizeSha256(after?.agentDefenseBenchDefenseServerHash),
      baselineAgentDefenseBenchPolicyHash: normalizeSha256(before?.agentDefenseBenchPolicyHash),
      candidateAgentDefenseBenchPolicyHash: normalizeSha256(after?.agentDefenseBenchPolicyHash),
      baselineAgentDefenseBenchRunConfigHash: normalizeSha256(before?.agentDefenseBenchRunConfigHash),
      candidateAgentDefenseBenchRunConfigHash: normalizeSha256(after?.agentDefenseBenchRunConfigHash),
      baselineAgentDefenseBenchProviderRouteId: normalizeOptionalId(before?.agentDefenseBenchProviderRouteId),
      candidateAgentDefenseBenchProviderRouteId: normalizeOptionalId(after?.agentDefenseBenchProviderRouteId),
      baselineAgentDefenseBenchCanaryResultHash: normalizeSha256(before?.agentDefenseBenchCanaryResultHash),
      candidateAgentDefenseBenchCanaryResultHash: normalizeSha256(after?.agentDefenseBenchCanaryResultHash),
      baselineAgentDefenseBenchDriftStatisticHash: normalizeSha256(before?.agentDefenseBenchDriftStatisticHash),
      candidateAgentDefenseBenchDriftStatisticHash: normalizeSha256(after?.agentDefenseBenchDriftStatisticHash),
      baselineAgentDefenseBenchAlertOrWaiverHash: normalizeSha256(before?.agentDefenseBenchAlertOrWaiverHash),
      candidateAgentDefenseBenchAlertOrWaiverHash: normalizeSha256(after?.agentDefenseBenchAlertOrWaiverHash),
      baselineAgentDefenseBenchReplayCommandHash: normalizeSha256(before?.agentDefenseBenchReplayCommandHash),
      candidateAgentDefenseBenchReplayCommandHash: normalizeSha256(after?.agentDefenseBenchReplayCommandHash),
      baselineAgentDefenseBenchCiReceiptHash: normalizeSha256(before?.agentDefenseBenchCiReceiptHash),
      candidateAgentDefenseBenchCiReceiptHash: normalizeSha256(after?.agentDefenseBenchCiReceiptHash),
      baselineAgentDefenseBenchMcpServerCount: safeNonNegative(before?.agentDefenseBenchMcpServerCount ?? 0),
      candidateAgentDefenseBenchMcpServerCount: safeNonNegative(after?.agentDefenseBenchMcpServerCount ?? 0),
      baselineAgentDefenseBenchAttackSuiteIds: normalizedStringList(before?.agentDefenseBenchAttackSuiteIds),
      candidateAgentDefenseBenchAttackSuiteIds: normalizedStringList(after?.agentDefenseBenchAttackSuiteIds),
      baselineAgentDefenseBenchDefenseCoverage0to1: clamp01(before?.agentDefenseBenchDefenseCoverage0to1 ?? 0),
      candidateAgentDefenseBenchDefenseCoverage0to1: clamp01(after?.agentDefenseBenchDefenseCoverage0to1 ?? 0),
      baselineAgentDefenseBenchPromptInjectionBlockRate0to1: clamp01(
        before?.agentDefenseBenchPromptInjectionBlockRate0to1 ?? 0,
      ),
      candidateAgentDefenseBenchPromptInjectionBlockRate0to1: clamp01(
        after?.agentDefenseBenchPromptInjectionBlockRate0to1 ?? 0,
      ),
      baselineAgentDefenseBenchJailbreakBlockRate0to1: clamp01(
        before?.agentDefenseBenchJailbreakBlockRate0to1 ?? 0,
      ),
      candidateAgentDefenseBenchJailbreakBlockRate0to1: clamp01(
        after?.agentDefenseBenchJailbreakBlockRate0to1 ?? 0,
      ),
      baselineAgentDefenseBenchToolPoisoningBlockRate0to1: clamp01(
        before?.agentDefenseBenchToolPoisoningBlockRate0to1 ?? 0,
      ),
      candidateAgentDefenseBenchToolPoisoningBlockRate0to1: clamp01(
        after?.agentDefenseBenchToolPoisoningBlockRate0to1 ?? 0,
      ),
      baselineAgentDefenseBenchBenignPassRate0to1: clamp01(before?.agentDefenseBenchBenignPassRate0to1 ?? 0),
      candidateAgentDefenseBenchBenignPassRate0to1: clamp01(after?.agentDefenseBenchBenignPassRate0to1 ?? 0),
      agentDefenseBenchDefenseCoverageDelta0to1: round(
        clamp01(after?.agentDefenseBenchDefenseCoverage0to1 ?? 0)
        - clamp01(before?.agentDefenseBenchDefenseCoverage0to1 ?? 0),
      ),
      agentDefenseBenchPromptInjectionBlockRateDelta0to1: round(
        clamp01(after?.agentDefenseBenchPromptInjectionBlockRate0to1 ?? 0)
        - clamp01(before?.agentDefenseBenchPromptInjectionBlockRate0to1 ?? 0),
      ),
      agentDefenseBenchJailbreakBlockRateDelta0to1: round(
        clamp01(after?.agentDefenseBenchJailbreakBlockRate0to1 ?? 0)
        - clamp01(before?.agentDefenseBenchJailbreakBlockRate0to1 ?? 0),
      ),
      agentDefenseBenchToolPoisoningBlockRateDelta0to1: round(
        clamp01(after?.agentDefenseBenchToolPoisoningBlockRate0to1 ?? 0)
        - clamp01(before?.agentDefenseBenchToolPoisoningBlockRate0to1 ?? 0),
      ),
      agentDefenseBenchBenignPassRateDelta0to1: round(
        clamp01(after?.agentDefenseBenchBenignPassRate0to1 ?? 0)
        - clamp01(before?.agentDefenseBenchBenignPassRate0to1 ?? 0),
      ),
      agentDefenseBenchMissingReasons: unique([
        ...agentDefenseBenchMissingReasons(before, "baseline", thresholds, agentDefenseBenchRequired),
        ...agentDefenseBenchMissingReasons(after, "candidate", thresholds, agentDefenseBenchRequired),
      ]),
      ...buildEvidraComparisonFields(before, after, evidraMissing),
      ...buildGalileoComparisonFields(before, after, galileoMissing),
      baselineVersion: before?.version,
      candidateVersion: after?.version,
      baselineSampleSize: before?.sampleSize ?? 0,
      candidateSampleSize: after?.sampleSize ?? 0,
      baselineTrajectoryCount: safeNonNegative(before?.trajectoryCount ?? 0),
      candidateTrajectoryCount: safeNonNegative(after?.trajectoryCount ?? 0),
      scoreDelta0to1: round(clamp01(after?.scoreMean0to1 ?? 0) - clamp01(before?.scoreMean0to1 ?? 0)),
      refusalRateDelta0to1: round(clamp01(after?.refusalRate0to1 ?? 0) - clamp01(before?.refusalRate0to1 ?? 0)),
      invalidActionRateDelta0to1: round(clamp01(after?.invalidActionRate0to1 ?? 0) - clamp01(before?.invalidActionRate0to1 ?? 0)),
      errorAttributionRateDelta0to1: round(clamp01(after?.errorAttributionRate0to1 ?? 0) - clamp01(before?.errorAttributionRate0to1 ?? 0)),
      judgeAgreementDelta0to1: round(clamp01(after?.judgeAgreement0to1 ?? 0) - clamp01(before?.judgeAgreement0to1 ?? 0)),
      unjudgedPredictionRateDelta0to1: round(clamp01(after?.unjudgedPredictionRate0to1 ?? 0) - clamp01(before?.unjudgedPredictionRate0to1 ?? 0)),
      repairEffectivenessDelta0to1: round(clamp01(after?.repairEffectiveness0to1 ?? 0) - clamp01(before?.repairEffectiveness0to1 ?? 0)),
      falsePositiveIdentificationDelta0to1: round(clamp01(after?.falsePositiveIdentification0to1 ?? 0) - clamp01(before?.falsePositiveIdentification0to1 ?? 0)),
      netCodebaseImpactDelta0to1: round(clamp01(after?.netCodebaseImpact0to1 ?? 0) - clamp01(before?.netCodebaseImpact0to1 ?? 0)),
      artifactAccuracyDelta0to1: round(clamp01(after?.artifactAccuracy0to1 ?? 0) - clamp01(before?.artifactAccuracy0to1 ?? 0)),
      formulaIntegrityDelta0to1: round(clamp01(after?.formulaIntegrity0to1 ?? 0) - clamp01(before?.formulaIntegrity0to1 ?? 0)),
      formatQualityDelta0to1: round(clamp01(after?.formatQuality0to1 ?? 0) - clamp01(before?.formatQuality0to1 ?? 0)),
      protocolSuccessRateDelta0to1: round(clamp01(after?.protocolSuccessRate0to1 ?? 0) - clamp01(before?.protocolSuccessRate0to1 ?? 0)),
      agreementRateDelta0to1: round(clamp01(after?.agreementRate0to1 ?? 0) - clamp01(before?.agreementRate0to1 ?? 0)),
      targetOutcomeValueDelta0to1: round(clamp01(after?.targetOutcomeValue0to1 ?? 0) - clamp01(before?.targetOutcomeValue0to1 ?? 0)),
      latentPreferenceAlignmentDelta0to1: round(clamp01(after?.latentPreferenceAlignment0to1 ?? 0) - clamp01(before?.latentPreferenceAlignment0to1 ?? 0)),
      evaluatorCoverageDelta0to1: round(clamp01(after?.evaluatorCoverage0to1 ?? 0) - clamp01(before?.evaluatorCoverage0to1 ?? 0)),
      guardrailPassRateDelta0to1: round(clamp01(after?.guardrailPassRate0to1 ?? 0) - clamp01(before?.guardrailPassRate0to1 ?? 0)),
      scoreThresholdPassRateDelta0to1: round(clamp01(after?.scoreThresholdPassRate0to1 ?? 0) - clamp01(before?.scoreThresholdPassRate0to1 ?? 0)),
      retryStabilityDelta0to1: round(clamp01(after?.retryStability0to1 ?? 0) - clamp01(before?.retryStability0to1 ?? 0)),
      progressAucDelta0to1: round(clamp01(after?.progressAuc0to1 ?? 0) - clamp01(before?.progressAuc0to1 ?? 0)),
      progressPerTurnDelta0to1: round(clamp01(after?.progressPerTurn0to1 ?? 0) - clamp01(before?.progressPerTurn0to1 ?? 0)),
      passAtKDelta0to1: round(clamp01(after?.passAtK0to1 ?? 0) - clamp01(before?.passAtK0to1 ?? 0)),
      passPowerKDelta0to1: round(clamp01(after?.passPowerK0to1 ?? 0) - clamp01(before?.passPowerK0to1 ?? 0)),
      subgoalCompletionRateDelta0to1: round(clamp01(after?.subgoalCompletionRate0to1 ?? 0) - clamp01(before?.subgoalCompletionRate0to1 ?? 0)),
      expectedToolCallCoverageDelta0to1: round(clamp01(after?.expectedToolCallCoverage0to1 ?? 0) - clamp01(before?.expectedToolCallCoverage0to1 ?? 0)),
      personaCoverageDelta0to1: round(clamp01(after?.personaCoverage0to1 ?? 0) - clamp01(before?.personaCoverage0to1 ?? 0)),
      errorClusterRateDelta0to1: round(clamp01(after?.errorClusterRate0to1 ?? 0) - clamp01(before?.errorClusterRate0to1 ?? 0)),
      latencyDeltaRatio: round(percentRatio(safeNonNegative(after?.latencyMsP95 ?? 0), safeNonNegative(before?.latencyMsP95 ?? 0))),
      costDeltaRatio: round(percentRatio(safeNonNegative(after?.costUsdMean ?? 0), safeNonNegative(before?.costUsdMean ?? 0))),
      driftStatistic: 0,
      status: "passed",
      evidenceRefs,
      signedEvidenceRefs,
    };

    comparison.driftStatistic = driftStatistic([
      Math.max(0, -comparison.scoreDelta0to1) / thresholds.maxScoreDrop0to1,
      Math.max(0, comparison.refusalRateDelta0to1) / thresholds.maxRefusalRateIncrease0to1,
      Math.max(0, comparison.invalidActionRateDelta0to1) / thresholds.maxInvalidActionRateIncrease0to1,
      Math.max(0, comparison.errorAttributionRateDelta0to1) / thresholds.maxErrorAttributionRateIncrease0to1,
      Math.max(0, -comparison.judgeAgreementDelta0to1) / thresholds.maxJudgeAgreementDrop0to1,
      Math.max(0, comparison.unjudgedPredictionRateDelta0to1) / thresholds.maxUnjudgedPredictionRateIncrease0to1,
      Math.max(0, -comparison.repairEffectivenessDelta0to1) / thresholds.maxRepairEffectivenessDrop0to1,
      Math.max(0, -comparison.falsePositiveIdentificationDelta0to1) / thresholds.maxFalsePositiveIdentificationDrop0to1,
      Math.max(0, -comparison.netCodebaseImpactDelta0to1) / thresholds.maxNetCodebaseImpactDrop0to1,
      Math.max(0, -comparison.artifactAccuracyDelta0to1) / thresholds.maxArtifactAccuracyDrop0to1,
      Math.max(0, -comparison.formulaIntegrityDelta0to1) / thresholds.maxFormulaIntegrityDrop0to1,
      Math.max(0, -comparison.formatQualityDelta0to1) / thresholds.maxFormatQualityDrop0to1,
      Math.max(0, -comparison.protocolSuccessRateDelta0to1) / thresholds.maxProtocolSuccessRateDrop0to1,
      Math.max(0, -comparison.agreementRateDelta0to1) / thresholds.maxAgreementRateDrop0to1,
      Math.max(0, -comparison.targetOutcomeValueDelta0to1) / thresholds.maxTargetOutcomeValueDrop0to1,
      Math.max(0, -comparison.latentPreferenceAlignmentDelta0to1) / thresholds.maxLatentPreferenceAlignmentDrop0to1,
      Math.max(0, -comparison.evaluatorCoverageDelta0to1) / thresholds.maxEvaluatorCoverageDrop0to1,
      Math.max(0, -comparison.guardrailPassRateDelta0to1) / thresholds.maxGuardrailPassRateDrop0to1,
      Math.max(0, -comparison.scoreThresholdPassRateDelta0to1) / thresholds.maxScoreThresholdPassRateDrop0to1,
      Math.max(0, -comparison.retryStabilityDelta0to1) / thresholds.maxRetryStabilityDrop0to1,
      Math.max(0, -comparison.progressAucDelta0to1) / thresholds.maxProgressAucDrop0to1,
      Math.max(0, -comparison.progressPerTurnDelta0to1) / thresholds.maxProgressPerTurnDrop0to1,
      Math.max(0, -comparison.passAtKDelta0to1) / thresholds.maxPassAtKDrop0to1,
      Math.max(0, -comparison.passPowerKDelta0to1) / thresholds.maxPassPowerKDrop0to1,
      Math.max(0, -comparison.subgoalCompletionRateDelta0to1) / thresholds.maxSubgoalCompletionRateDrop0to1,
      Math.max(0, -comparison.expectedToolCallCoverageDelta0to1) / thresholds.maxExpectedToolCallCoverageDrop0to1,
      Math.max(0, -comparison.personaCoverageDelta0to1) / thresholds.maxPersonaCoverageDrop0to1,
      Math.max(0, comparison.errorClusterRateDelta0to1) / thresholds.maxErrorClusterRateIncrease0to1,
      Math.max(0, -comparison.agentDefenseBenchDefenseCoverageDelta0to1)
        / thresholds.maxAgentDefenseBenchDefenseCoverageDrop0to1,
      Math.max(0, -comparison.agentDefenseBenchPromptInjectionBlockRateDelta0to1)
        / thresholds.maxAgentDefenseBenchPromptInjectionBlockRateDrop0to1,
      Math.max(0, -comparison.agentDefenseBenchJailbreakBlockRateDelta0to1)
        / thresholds.maxAgentDefenseBenchJailbreakBlockRateDrop0to1,
      Math.max(0, -comparison.agentDefenseBenchToolPoisoningBlockRateDelta0to1)
        / thresholds.maxAgentDefenseBenchToolPoisoningBlockRateDrop0to1,
      Math.max(0, -comparison.agentDefenseBenchBenignPassRateDelta0to1)
        / thresholds.maxAgentDefenseBenchBenignPassRateDrop0to1,
      Math.max(0, comparison.latencyDeltaRatio) / thresholds.maxLatencyIncreaseRatio,
      Math.max(0, comparison.costDeltaRatio) / thresholds.maxCostIncreaseRatio,
    ]);

    const pairAlerts: ProviderDriftAlert[] = [];
    if (!before || !after) {
      pairAlerts.push(makeAlert(
        comparison,
        "sampleSize",
        Math.min(before?.sampleSize ?? 0, after?.sampleSize ?? 0),
        thresholds.minSampleSize,
        "Provider canary requires both baseline and candidate rows.",
        active,
      ));
    }
    if (comparison.baselineSampleSize < thresholds.minSampleSize || comparison.candidateSampleSize < thresholds.minSampleSize) {
      pairAlerts.push(makeAlert(
        comparison,
        "sampleSize",
        Math.min(comparison.baselineSampleSize, comparison.candidateSampleSize),
        thresholds.minSampleSize,
        `Provider canary sample size is below ${thresholds.minSampleSize}.`,
        active,
      ));
    }
    if (
      thresholds.minTrajectoryCount > 0
      && (comparison.baselineTrajectoryCount < thresholds.minTrajectoryCount || comparison.candidateTrajectoryCount < thresholds.minTrajectoryCount)
    ) {
      pairAlerts.push(makeAlert(
        comparison,
        "trajectoryCount",
        Math.min(comparison.baselineTrajectoryCount, comparison.candidateTrajectoryCount),
        thresholds.minTrajectoryCount,
        `Provider arena canary trajectory count is below ${thresholds.minTrajectoryCount}.`,
        active,
      ));
    }
    if (evidenceRefs.length === 0) {
      pairAlerts.push(makeAlert(
        comparison,
        "evidenceRefs",
        0,
        1,
        "Provider canary is missing trace, dataset, approval, or benchmark evidence references.",
        active,
      ));
    }
    if (signedEvidenceRefs.length === 0) {
      pairAlerts.push(makeAlert(
        comparison,
        "signedEvidenceRefs",
        0,
        1,
        "Provider canary is missing signed evidence references.",
        active,
      ));
    }
    if (comparison.evaluationFrameworkMissingReasons.length > 0) {
      pairAlerts.push(makeAlert(
        comparison,
        "evaluationFrameworkEvidence",
        0,
        1,
        `Provider evaluator framework proof is incomplete: ${comparison.evaluationFrameworkMissingReasons.join(", ")}.`,
        active,
      ));
    }
    if (comparison.falconEvaluateMissingReasons.length > 0) {
      pairAlerts.push(makeAlert(
        comparison,
        "falconEvaluateEvidence",
        0,
        1,
        `Provider Falcon Evaluate proof is incomplete: ${comparison.falconEvaluateMissingReasons.join(", ")}.`,
        active,
      ));
    }
    if (comparison.observabilityPipelineMissingReasons.length > 0) {
      pairAlerts.push(makeAlert(
        comparison,
        "observabilityPipelineEvidence",
        0,
        1,
        `Provider observability pipeline proof is incomplete: ${comparison.observabilityPipelineMissingReasons.join(", ")}.`,
        active,
      ));
    }
    if (comparison.orbitMonitorMissingReasons.length > 0) {
      pairAlerts.push(makeAlert(
        comparison,
        "orbitMonitorEvidence",
        0,
        1,
        `Provider orbit monitor proof is incomplete: ${comparison.orbitMonitorMissingReasons.join(", ")}.`,
        active,
      ));
    }
    if (comparison.geospatialToolCallingMissingReasons.length > 0) {
      pairAlerts.push(makeAlert(
        comparison,
        "geospatialToolCallingEvidence",
        0,
        1,
        `Provider geospatial tool-calling proof is incomplete: ${comparison.geospatialToolCallingMissingReasons.join(", ")}.`,
        active,
      ));
    }
    if (comparison.agentDefenseBenchMissingReasons.length > 0) {
      pairAlerts.push(makeAlert(
        comparison,
        "agentDefenseBenchEvidence",
        0,
        1,
        `Provider AgentDefense-Bench proof is incomplete: ${comparison.agentDefenseBenchMissingReasons.join(", ")}.`,
        active,
      ));
    }
    if (comparison.evidraMissingReasons.length > 0) {
      pairAlerts.push(makeAlert(
        comparison,
        "evidraEvidenceChainEvidence",
        0,
        1,
        `Provider Evidra evidence-chain proof is incomplete: ${comparison.evidraMissingReasons.join(", ")}.`,
        active,
      ));
    }
    if (comparison.galileoMissingReasons.length > 0) {
      pairAlerts.push(makeAlert(
        comparison,
        "galileoObservabilityEvidence",
        0,
        1,
        `Provider Galileo observability proof is incomplete: ${comparison.galileoMissingReasons.join(", ")}.`,
        active,
      ));
    }
    if (-comparison.scoreDelta0to1 > thresholds.maxScoreDrop0to1) {
      pairAlerts.push(makeAlert(
        comparison,
        "scoreMean0to1",
        -comparison.scoreDelta0to1,
        thresholds.maxScoreDrop0to1,
        "Candidate provider/model score dropped beyond threshold.",
        active,
      ));
    }
    if (comparison.refusalRateDelta0to1 > thresholds.maxRefusalRateIncrease0to1) {
      pairAlerts.push(makeAlert(
        comparison,
        "refusalRate0to1",
        comparison.refusalRateDelta0to1,
        thresholds.maxRefusalRateIncrease0to1,
        "Candidate provider/model refusal rate increased beyond threshold.",
        active,
      ));
    }
    if (comparison.invalidActionRateDelta0to1 > thresholds.maxInvalidActionRateIncrease0to1) {
      pairAlerts.push(makeAlert(
        comparison,
        "invalidActionRate0to1",
        comparison.invalidActionRateDelta0to1,
        thresholds.maxInvalidActionRateIncrease0to1,
        "Candidate provider/model invalid-action rate increased beyond threshold.",
        active,
      ));
    }
    if (comparison.errorAttributionRateDelta0to1 > thresholds.maxErrorAttributionRateIncrease0to1) {
      pairAlerts.push(makeAlert(
        comparison,
        "errorAttributionRate0to1",
        comparison.errorAttributionRateDelta0to1,
        thresholds.maxErrorAttributionRateIncrease0to1,
        "Candidate provider/model error-attribution rate increased beyond threshold.",
        active,
      ));
    }
    if (-comparison.judgeAgreementDelta0to1 > thresholds.maxJudgeAgreementDrop0to1) {
      pairAlerts.push(makeAlert(
        comparison,
        "judgeAgreement0to1",
        -comparison.judgeAgreementDelta0to1,
        thresholds.maxJudgeAgreementDrop0to1,
        "Candidate provider/model judge agreement dropped beyond threshold.",
        active,
      ));
    }
    if (comparison.unjudgedPredictionRateDelta0to1 > thresholds.maxUnjudgedPredictionRateIncrease0to1) {
      pairAlerts.push(makeAlert(
        comparison,
        "unjudgedPredictionRate0to1",
        comparison.unjudgedPredictionRateDelta0to1,
        thresholds.maxUnjudgedPredictionRateIncrease0to1,
        "Candidate provider/model unjudged prediction rate increased beyond threshold.",
        active,
      ));
    }
    if (-comparison.repairEffectivenessDelta0to1 > thresholds.maxRepairEffectivenessDrop0to1) {
      pairAlerts.push(makeAlert(
        comparison,
        "repairEffectiveness0to1",
        -comparison.repairEffectivenessDelta0to1,
        thresholds.maxRepairEffectivenessDrop0to1,
        "Candidate provider/model architectural repair effectiveness dropped beyond threshold.",
        active,
      ));
    }
    if (-comparison.falsePositiveIdentificationDelta0to1 > thresholds.maxFalsePositiveIdentificationDrop0to1) {
      pairAlerts.push(makeAlert(
        comparison,
        "falsePositiveIdentification0to1",
        -comparison.falsePositiveIdentificationDelta0to1,
        thresholds.maxFalsePositiveIdentificationDrop0to1,
        "Candidate provider/model false-positive identification dropped beyond threshold.",
        active,
      ));
    }
    if (-comparison.netCodebaseImpactDelta0to1 > thresholds.maxNetCodebaseImpactDrop0to1) {
      pairAlerts.push(makeAlert(
        comparison,
        "netCodebaseImpact0to1",
        -comparison.netCodebaseImpactDelta0to1,
        thresholds.maxNetCodebaseImpactDrop0to1,
        "Candidate provider/model net codebase impact dropped beyond threshold.",
        active,
      ));
    }
    if (-comparison.artifactAccuracyDelta0to1 > thresholds.maxArtifactAccuracyDrop0to1) {
      pairAlerts.push(makeAlert(
        comparison,
        "artifactAccuracy0to1",
        -comparison.artifactAccuracyDelta0to1,
        thresholds.maxArtifactAccuracyDrop0to1,
        "Candidate provider/model artifact accuracy dropped beyond threshold.",
        active,
      ));
    }
    if (-comparison.formulaIntegrityDelta0to1 > thresholds.maxFormulaIntegrityDrop0to1) {
      pairAlerts.push(makeAlert(
        comparison,
        "formulaIntegrity0to1",
        -comparison.formulaIntegrityDelta0to1,
        thresholds.maxFormulaIntegrityDrop0to1,
        "Candidate provider/model formula integrity dropped beyond threshold.",
        active,
      ));
    }
    if (-comparison.formatQualityDelta0to1 > thresholds.maxFormatQualityDrop0to1) {
      pairAlerts.push(makeAlert(
        comparison,
        "formatQuality0to1",
        -comparison.formatQualityDelta0to1,
        thresholds.maxFormatQualityDrop0to1,
        "Candidate provider/model artifact format quality dropped beyond threshold.",
        active,
      ));
    }
    if (-comparison.protocolSuccessRateDelta0to1 > thresholds.maxProtocolSuccessRateDrop0to1) {
      pairAlerts.push(makeAlert(
        comparison,
        "protocolSuccessRate0to1",
        -comparison.protocolSuccessRateDelta0to1,
        thresholds.maxProtocolSuccessRateDrop0to1,
        "Candidate provider/model protocol success rate dropped beyond threshold.",
        active,
      ));
    }
    if (-comparison.agreementRateDelta0to1 > thresholds.maxAgreementRateDrop0to1) {
      pairAlerts.push(makeAlert(
        comparison,
        "agreementRate0to1",
        -comparison.agreementRateDelta0to1,
        thresholds.maxAgreementRateDrop0to1,
        "Candidate provider/model agreement or deal rate dropped beyond threshold.",
        active,
      ));
    }
    if (-comparison.targetOutcomeValueDelta0to1 > thresholds.maxTargetOutcomeValueDrop0to1) {
      pairAlerts.push(makeAlert(
        comparison,
        "targetOutcomeValue0to1",
        -comparison.targetOutcomeValueDelta0to1,
        thresholds.maxTargetOutcomeValueDrop0to1,
        "Candidate provider/model target outcome value dropped beyond threshold despite canary proxy metrics.",
        active,
      ));
    }
    if (-comparison.latentPreferenceAlignmentDelta0to1 > thresholds.maxLatentPreferenceAlignmentDrop0to1) {
      pairAlerts.push(makeAlert(
        comparison,
        "latentPreferenceAlignment0to1",
        -comparison.latentPreferenceAlignmentDelta0to1,
        thresholds.maxLatentPreferenceAlignmentDrop0to1,
        "Candidate provider/model latent-preference alignment dropped beyond threshold.",
        active,
      ));
    }
    if (-comparison.evaluatorCoverageDelta0to1 > thresholds.maxEvaluatorCoverageDrop0to1) {
      pairAlerts.push(makeAlert(
        comparison,
        "evaluatorCoverage0to1",
        -comparison.evaluatorCoverageDelta0to1,
        thresholds.maxEvaluatorCoverageDrop0to1,
        "Candidate provider/model evaluator-suite coverage dropped beyond threshold.",
        active,
      ));
    }
    if (-comparison.guardrailPassRateDelta0to1 > thresholds.maxGuardrailPassRateDrop0to1) {
      pairAlerts.push(makeAlert(
        comparison,
        "guardrailPassRate0to1",
        -comparison.guardrailPassRateDelta0to1,
        thresholds.maxGuardrailPassRateDrop0to1,
        "Candidate provider/model guardrail pass rate dropped beyond threshold.",
        active,
      ));
    }
    if (-comparison.scoreThresholdPassRateDelta0to1 > thresholds.maxScoreThresholdPassRateDrop0to1) {
      pairAlerts.push(makeAlert(
        comparison,
        "scoreThresholdPassRate0to1",
        -comparison.scoreThresholdPassRateDelta0to1,
        thresholds.maxScoreThresholdPassRateDrop0to1,
        "Candidate provider/model evaluator score-threshold pass rate dropped beyond threshold.",
        active,
      ));
    }
    if (-comparison.retryStabilityDelta0to1 > thresholds.maxRetryStabilityDrop0to1) {
      pairAlerts.push(makeAlert(
        comparison,
        "retryStability0to1",
        -comparison.retryStabilityDelta0to1,
        thresholds.maxRetryStabilityDrop0to1,
        "Candidate provider/model retry stability dropped beyond threshold.",
        active,
      ));
    }
    if (-comparison.progressAucDelta0to1 > thresholds.maxProgressAucDrop0to1) {
      pairAlerts.push(makeAlert(
        comparison,
        "progressAuc0to1",
        -comparison.progressAucDelta0to1,
        thresholds.maxProgressAucDrop0to1,
        "Candidate provider/model subgoal progress AUC dropped beyond threshold.",
        active,
      ));
    }
    if (-comparison.progressPerTurnDelta0to1 > thresholds.maxProgressPerTurnDrop0to1) {
      pairAlerts.push(makeAlert(
        comparison,
        "progressPerTurn0to1",
        -comparison.progressPerTurnDelta0to1,
        thresholds.maxProgressPerTurnDrop0to1,
        "Candidate provider/model progress per turn dropped beyond threshold.",
        active,
      ));
    }
    if (-comparison.passAtKDelta0to1 > thresholds.maxPassAtKDrop0to1) {
      pairAlerts.push(makeAlert(
        comparison,
        "passAtK0to1",
        -comparison.passAtKDelta0to1,
        thresholds.maxPassAtKDrop0to1,
        "Candidate provider/model pass@k dropped beyond threshold.",
        active,
      ));
    }
    if (-comparison.passPowerKDelta0to1 > thresholds.maxPassPowerKDrop0to1) {
      pairAlerts.push(makeAlert(
        comparison,
        "passPowerK0to1",
        -comparison.passPowerKDelta0to1,
        thresholds.maxPassPowerKDrop0to1,
        "Candidate provider/model pass^k reliability dropped beyond threshold.",
        active,
      ));
    }
    if (-comparison.subgoalCompletionRateDelta0to1 > thresholds.maxSubgoalCompletionRateDrop0to1) {
      pairAlerts.push(makeAlert(
        comparison,
        "subgoalCompletionRate0to1",
        -comparison.subgoalCompletionRateDelta0to1,
        thresholds.maxSubgoalCompletionRateDrop0to1,
        "Candidate provider/model subgoal completion rate dropped beyond threshold.",
        active,
      ));
    }
    if (-comparison.expectedToolCallCoverageDelta0to1 > thresholds.maxExpectedToolCallCoverageDrop0to1) {
      pairAlerts.push(makeAlert(
        comparison,
        "expectedToolCallCoverage0to1",
        -comparison.expectedToolCallCoverageDelta0to1,
        thresholds.maxExpectedToolCallCoverageDrop0to1,
        "Candidate provider/model expected-tool-call coverage dropped beyond threshold.",
        active,
      ));
    }
    if (-comparison.personaCoverageDelta0to1 > thresholds.maxPersonaCoverageDrop0to1) {
      pairAlerts.push(makeAlert(
        comparison,
        "personaCoverage0to1",
        -comparison.personaCoverageDelta0to1,
        thresholds.maxPersonaCoverageDrop0to1,
        "Candidate provider/model user-persona coverage dropped beyond threshold.",
        active,
      ));
    }
    if (comparison.errorClusterRateDelta0to1 > thresholds.maxErrorClusterRateIncrease0to1) {
      pairAlerts.push(makeAlert(
        comparison,
        "errorClusterRate0to1",
        comparison.errorClusterRateDelta0to1,
        thresholds.maxErrorClusterRateIncrease0to1,
        "Candidate provider/model clustered error rate increased beyond threshold.",
        active,
      ));
    }
    if (
      -comparison.agentDefenseBenchDefenseCoverageDelta0to1
      > thresholds.maxAgentDefenseBenchDefenseCoverageDrop0to1
    ) {
      pairAlerts.push(makeAlert(
        comparison,
        "agentDefenseBenchDefenseCoverage0to1",
        -comparison.agentDefenseBenchDefenseCoverageDelta0to1,
        thresholds.maxAgentDefenseBenchDefenseCoverageDrop0to1,
        "Candidate provider/model AgentDefense-Bench defense coverage dropped beyond threshold.",
        active,
      ));
    }
    if (
      -comparison.agentDefenseBenchPromptInjectionBlockRateDelta0to1
      > thresholds.maxAgentDefenseBenchPromptInjectionBlockRateDrop0to1
    ) {
      pairAlerts.push(makeAlert(
        comparison,
        "agentDefenseBenchPromptInjectionBlockRate0to1",
        -comparison.agentDefenseBenchPromptInjectionBlockRateDelta0to1,
        thresholds.maxAgentDefenseBenchPromptInjectionBlockRateDrop0to1,
        "Candidate provider/model AgentDefense-Bench prompt-injection block rate dropped beyond threshold.",
        active,
      ));
    }
    if (
      -comparison.agentDefenseBenchJailbreakBlockRateDelta0to1
      > thresholds.maxAgentDefenseBenchJailbreakBlockRateDrop0to1
    ) {
      pairAlerts.push(makeAlert(
        comparison,
        "agentDefenseBenchJailbreakBlockRate0to1",
        -comparison.agentDefenseBenchJailbreakBlockRateDelta0to1,
        thresholds.maxAgentDefenseBenchJailbreakBlockRateDrop0to1,
        "Candidate provider/model AgentDefense-Bench jailbreak block rate dropped beyond threshold.",
        active,
      ));
    }
    if (
      -comparison.agentDefenseBenchToolPoisoningBlockRateDelta0to1
      > thresholds.maxAgentDefenseBenchToolPoisoningBlockRateDrop0to1
    ) {
      pairAlerts.push(makeAlert(
        comparison,
        "agentDefenseBenchToolPoisoningBlockRate0to1",
        -comparison.agentDefenseBenchToolPoisoningBlockRateDelta0to1,
        thresholds.maxAgentDefenseBenchToolPoisoningBlockRateDrop0to1,
        "Candidate provider/model AgentDefense-Bench tool-poisoning block rate dropped beyond threshold.",
        active,
      ));
    }
    if (
      -comparison.agentDefenseBenchBenignPassRateDelta0to1
      > thresholds.maxAgentDefenseBenchBenignPassRateDrop0to1
    ) {
      pairAlerts.push(makeAlert(
        comparison,
        "agentDefenseBenchBenignPassRate0to1",
        -comparison.agentDefenseBenchBenignPassRateDelta0to1,
        thresholds.maxAgentDefenseBenchBenignPassRateDrop0to1,
        "Candidate provider/model AgentDefense-Bench benign pass rate dropped beyond threshold.",
        active,
      ));
    }
    if (comparison.latencyDeltaRatio > thresholds.maxLatencyIncreaseRatio) {
      pairAlerts.push(makeAlert(
        comparison,
        "latencyMsP95",
        comparison.latencyDeltaRatio,
        thresholds.maxLatencyIncreaseRatio,
        "Candidate provider/model p95 latency increased beyond threshold.",
        active,
      ));
    }
    if (comparison.costDeltaRatio > thresholds.maxCostIncreaseRatio) {
      pairAlerts.push(makeAlert(
        comparison,
        "costUsdMean",
        comparison.costDeltaRatio,
        thresholds.maxCostIncreaseRatio,
        "Candidate provider/model mean cost increased beyond threshold.",
        active,
      ));
    }

    if (pairAlerts.some((alert) => !alert.waived)) {
      comparison.status = "alert";
    } else if (pairAlerts.length > 0) {
      comparison.status = "waived";
    } else if (comparison.driftStatistic >= 0.8) {
      comparison.status = "monitor";
    }

    comparisons.push(comparison);
    alerts.push(...pairAlerts);
  }

  const recommendation = recommendationFromAlerts(alerts, comparisons);
  const failClosed = alerts.some((alert) => !alert.waived);
  const providerVersions = unique([
    ...input.baseline.map(formatProviderVersion),
    ...input.candidate.map(formatProviderVersion),
  ]);

  return {
    reportId: `provider-drift-${now.toISOString()}`,
    agentId: input.agentId,
    createdAt: now.toISOString(),
    providerVersions,
    thresholds,
    comparisons,
    alerts,
    waivers: input.waivers ?? [],
    recommendation,
    failClosed,
    summary: `${comparisons.length} provider canary comparison(s), ${alerts.filter((alert) => !alert.waived).length} active alert(s), recommendation=${recommendation}`,
  };
}

export function buildProviderDriftWatchAlerts(report: ProviderDriftBenchmarkReport): ProviderDriftWatchAlert[] {
  return report.alerts
    .filter((alert) => !alert.waived)
    .map((alert) => ({
      id: `watch:${report.reportId}:${alert.alertId}`,
      agentId: report.agentId,
      source: "provider-drift-benchmark",
      severity: alert.severity,
      metricId: alert.metricId,
      provider: alert.provider,
      model: alert.model,
      canaryId: alert.canaryId,
      evidenceRefs: alert.evidenceRefs,
      message: alert.message,
      createdAt: report.createdAt,
    }));
}

export function buildProviderDriftEvalPack(
  report: ProviderDriftBenchmarkReport,
  input: BuildProviderDriftEvalPackInput = {},
): ProviderDriftEvalPackManifest {
  const rows: ProviderDriftEvalPackRow[] = report.comparisons.map((comparison) => {
    const rowPayload = {
      canaryId: comparison.canaryId,
      provider: comparison.provider,
      model: comparison.model,
      baselineVersion: comparison.baselineVersion,
      candidateVersion: comparison.candidateVersion,
      baselineBenchmarkFamily: comparison.baselineBenchmarkFamily,
      candidateBenchmarkFamily: comparison.candidateBenchmarkFamily,
      baselineCapabilityId: comparison.baselineCapabilityId,
      candidateCapabilityId: comparison.candidateCapabilityId,
      baselineArenaId: comparison.baselineArenaId,
      candidateArenaId: comparison.candidateArenaId,
      baselineEnvironmentId: comparison.baselineEnvironmentId,
      candidateEnvironmentId: comparison.candidateEnvironmentId,
      baselineReferencePoolId: comparison.baselineReferencePoolId,
      candidateReferencePoolId: comparison.candidateReferencePoolId,
      baselineEvaluationFrameworkId: comparison.baselineEvaluationFrameworkId,
      candidateEvaluationFrameworkId: comparison.candidateEvaluationFrameworkId,
      baselineEvaluationFrameworkVersion: comparison.baselineEvaluationFrameworkVersion,
      candidateEvaluationFrameworkVersion: comparison.candidateEvaluationFrameworkVersion,
      baselineProviderRouteId: comparison.baselineProviderRouteId,
      candidateProviderRouteId: comparison.candidateProviderRouteId,
      baselineMetricSuiteId: comparison.baselineMetricSuiteId,
      candidateMetricSuiteId: comparison.candidateMetricSuiteId,
      baselineMetricIds: comparison.baselineMetricIds,
      candidateMetricIds: comparison.candidateMetricIds,
      baselineMetricCount: comparison.baselineMetricCount,
      candidateMetricCount: comparison.candidateMetricCount,
      baselineEvaluatorConfigHash: comparison.baselineEvaluatorConfigHash,
      candidateEvaluatorConfigHash: comparison.candidateEvaluatorConfigHash,
      baselineGeneratedTestDataHash: comparison.baselineGeneratedTestDataHash,
      candidateGeneratedTestDataHash: comparison.candidateGeneratedTestDataHash,
      baselineVerdictAggregation: comparison.baselineVerdictAggregation,
      candidateVerdictAggregation: comparison.candidateVerdictAggregation,
      baselineVerdictAggregationConfigHash: comparison.baselineVerdictAggregationConfigHash,
      candidateVerdictAggregationConfigHash: comparison.candidateVerdictAggregationConfigHash,
      baselineVerdictTemperature: comparison.baselineVerdictTemperature,
      candidateVerdictTemperature: comparison.candidateVerdictTemperature,
      baselineVerdictPowerMeanP: comparison.baselineVerdictPowerMeanP,
      candidateVerdictPowerMeanP: comparison.candidateVerdictPowerMeanP,
      baselineDashboardArtifactHash: comparison.baselineDashboardArtifactHash,
      candidateDashboardArtifactHash: comparison.candidateDashboardArtifactHash,
      evaluationFrameworkMissingReasons: comparison.evaluationFrameworkMissingReasons,
      baselineFalconEvaluateSourceRefHash: comparison.baselineFalconEvaluateSourceRefHash,
      candidateFalconEvaluateSourceRefHash: comparison.candidateFalconEvaluateSourceRefHash,
      baselineFalconEvaluateRepositorySnapshotHash: comparison.baselineFalconEvaluateRepositorySnapshotHash,
      candidateFalconEvaluateRepositorySnapshotHash: comparison.candidateFalconEvaluateRepositorySnapshotHash,
      baselineFalconEvaluateLicenseRefHash: comparison.baselineFalconEvaluateLicenseRefHash,
      candidateFalconEvaluateLicenseRefHash: comparison.candidateFalconEvaluateLicenseRefHash,
      baselineFalconEvaluateDefaultBranchHash: comparison.baselineFalconEvaluateDefaultBranchHash,
      candidateFalconEvaluateDefaultBranchHash: comparison.candidateFalconEvaluateDefaultBranchHash,
      baselineFalconEvaluateReleaseTag: comparison.baselineFalconEvaluateReleaseTag,
      candidateFalconEvaluateReleaseTag: comparison.candidateFalconEvaluateReleaseTag,
      baselineFalconEvaluatePackageManifestHash: comparison.baselineFalconEvaluatePackageManifestHash,
      candidateFalconEvaluatePackageManifestHash: comparison.candidateFalconEvaluatePackageManifestHash,
      baselineFalconEvaluateLockfileHash: comparison.baselineFalconEvaluateLockfileHash,
      candidateFalconEvaluateLockfileHash: comparison.candidateFalconEvaluateLockfileHash,
      baselineFalconEvaluateRequirementsHash: comparison.baselineFalconEvaluateRequirementsHash,
      candidateFalconEvaluateRequirementsHash: comparison.candidateFalconEvaluateRequirementsHash,
      baselineFalconEvaluateReadmeHash: comparison.baselineFalconEvaluateReadmeHash,
      candidateFalconEvaluateReadmeHash: comparison.candidateFalconEvaluateReadmeHash,
      baselineFalconEvaluateDocsIndexHash: comparison.baselineFalconEvaluateDocsIndexHash,
      candidateFalconEvaluateDocsIndexHash: comparison.candidateFalconEvaluateDocsIndexHash,
      baselineFalconEvaluateWorkflowHash: comparison.baselineFalconEvaluateWorkflowHash,
      candidateFalconEvaluateWorkflowHash: comparison.candidateFalconEvaluateWorkflowHash,
      baselineFalconEvaluateEvaluationModuleHash: comparison.baselineFalconEvaluateEvaluationModuleHash,
      candidateFalconEvaluateEvaluationModuleHash: comparison.candidateFalconEvaluateEvaluationModuleHash,
      baselineFalconEvaluateContextRelevancyModuleHash:
        comparison.baselineFalconEvaluateContextRelevancyModuleHash,
      candidateFalconEvaluateContextRelevancyModuleHash:
        comparison.candidateFalconEvaluateContextRelevancyModuleHash,
      baselineFalconEvaluateFairnessModuleHash: comparison.baselineFalconEvaluateFairnessModuleHash,
      candidateFalconEvaluateFairnessModuleHash: comparison.candidateFalconEvaluateFairnessModuleHash,
      baselineFalconEvaluateReliabilityModuleHash: comparison.baselineFalconEvaluateReliabilityModuleHash,
      candidateFalconEvaluateReliabilityModuleHash: comparison.candidateFalconEvaluateReliabilityModuleHash,
      baselineFalconEvaluateSecurityModuleHash: comparison.baselineFalconEvaluateSecurityModuleHash,
      candidateFalconEvaluateSecurityModuleHash: comparison.candidateFalconEvaluateSecurityModuleHash,
      baselineFalconEvaluateMachineEthicsModuleHash: comparison.baselineFalconEvaluateMachineEthicsModuleHash,
      candidateFalconEvaluateMachineEthicsModuleHash: comparison.candidateFalconEvaluateMachineEthicsModuleHash,
      baselineFalconEvaluateResultsModuleHash: comparison.baselineFalconEvaluateResultsModuleHash,
      candidateFalconEvaluateResultsModuleHash: comparison.candidateFalconEvaluateResultsModuleHash,
      baselineFalconEvaluatePlotModuleHash: comparison.baselineFalconEvaluatePlotModuleHash,
      candidateFalconEvaluatePlotModuleHash: comparison.candidateFalconEvaluatePlotModuleHash,
      baselineFalconEvaluateUserAnalyticsModuleHash: comparison.baselineFalconEvaluateUserAnalyticsModuleHash,
      candidateFalconEvaluateUserAnalyticsModuleHash: comparison.candidateFalconEvaluateUserAnalyticsModuleHash,
      baselineFalconEvaluateValidationDataSchemaHash: comparison.baselineFalconEvaluateValidationDataSchemaHash,
      candidateFalconEvaluateValidationDataSchemaHash: comparison.candidateFalconEvaluateValidationDataSchemaHash,
      baselineFalconEvaluateMetricFamilyIds: comparison.baselineFalconEvaluateMetricFamilyIds,
      candidateFalconEvaluateMetricFamilyIds: comparison.candidateFalconEvaluateMetricFamilyIds,
      baselineFalconEvaluateMetricIds: comparison.baselineFalconEvaluateMetricIds,
      candidateFalconEvaluateMetricIds: comparison.candidateFalconEvaluateMetricIds,
      baselineFalconEvaluateMetricCount: comparison.baselineFalconEvaluateMetricCount,
      candidateFalconEvaluateMetricCount: comparison.candidateFalconEvaluateMetricCount,
      baselineFalconEvaluateProviderRouteId: comparison.baselineFalconEvaluateProviderRouteId,
      candidateFalconEvaluateProviderRouteId: comparison.candidateFalconEvaluateProviderRouteId,
      baselineFalconEvaluateCanaryResultHash: comparison.baselineFalconEvaluateCanaryResultHash,
      candidateFalconEvaluateCanaryResultHash: comparison.candidateFalconEvaluateCanaryResultHash,
      falconEvaluateMissingReasons: comparison.falconEvaluateMissingReasons,
      baselinePipelineOrchestratorId: comparison.baselinePipelineOrchestratorId,
      candidatePipelineOrchestratorId: comparison.candidatePipelineOrchestratorId,
      baselinePipelineRunId: comparison.baselinePipelineRunId,
      candidatePipelineRunId: comparison.candidatePipelineRunId,
      baselineExperimentTrackerId: comparison.baselineExperimentTrackerId,
      candidateExperimentTrackerId: comparison.candidateExperimentTrackerId,
      baselineExperimentRunId: comparison.baselineExperimentRunId,
      candidateExperimentRunId: comparison.candidateExperimentRunId,
      baselineObservabilityProjectId: comparison.baselineObservabilityProjectId,
      candidateObservabilityProjectId: comparison.candidateObservabilityProjectId,
      baselineDatastoreId: comparison.baselineDatastoreId,
      candidateDatastoreId: comparison.candidateDatastoreId,
      baselineRetrievalIndexHash: comparison.baselineRetrievalIndexHash,
      candidateRetrievalIndexHash: comparison.candidateRetrievalIndexHash,
      baselineContentDatasetHash: comparison.baselineContentDatasetHash,
      candidateContentDatasetHash: comparison.candidateContentDatasetHash,
      baselineSummaryArtifactHash: comparison.baselineSummaryArtifactHash,
      candidateSummaryArtifactHash: comparison.candidateSummaryArtifactHash,
      baselineQaDatasetHash: comparison.baselineQaDatasetHash,
      candidateQaDatasetHash: comparison.candidateQaDatasetHash,
      baselineTraceExportHash: comparison.baselineTraceExportHash,
      candidateTraceExportHash: comparison.candidateTraceExportHash,
      baselineMetricReportHash: comparison.baselineMetricReportHash,
      candidateMetricReportHash: comparison.candidateMetricReportHash,
      baselinePipelineConfigHash: comparison.baselinePipelineConfigHash,
      candidatePipelineConfigHash: comparison.candidatePipelineConfigHash,
      observabilityPipelineMissingReasons: comparison.observabilityPipelineMissingReasons,
      baselineOrbitMonitorSourceRefHash: comparison.baselineOrbitMonitorSourceRefHash,
      candidateOrbitMonitorSourceRefHash: comparison.candidateOrbitMonitorSourceRefHash,
      baselineOrbitMonitorRepositorySnapshotHash: comparison.baselineOrbitMonitorRepositorySnapshotHash,
      candidateOrbitMonitorRepositorySnapshotHash: comparison.candidateOrbitMonitorRepositorySnapshotHash,
      baselineOrbitMonitorLicenseRefHash: comparison.baselineOrbitMonitorLicenseRefHash,
      candidateOrbitMonitorLicenseRefHash: comparison.candidateOrbitMonitorLicenseRefHash,
      baselineOrbitMonitorSourceCatalogHash: comparison.baselineOrbitMonitorSourceCatalogHash,
      candidateOrbitMonitorSourceCatalogHash: comparison.candidateOrbitMonitorSourceCatalogHash,
      baselineOrbitMonitorLeaderboardSnapshotHash: comparison.baselineOrbitMonitorLeaderboardSnapshotHash,
      candidateOrbitMonitorLeaderboardSnapshotHash: comparison.candidateOrbitMonitorLeaderboardSnapshotHash,
      baselineOrbitMonitorModelRegistrySnapshotHash: comparison.baselineOrbitMonitorModelRegistrySnapshotHash,
      candidateOrbitMonitorModelRegistrySnapshotHash: comparison.candidateOrbitMonitorModelRegistrySnapshotHash,
      baselineOrbitMonitorBenchmarkFeedSnapshotHash: comparison.baselineOrbitMonitorBenchmarkFeedSnapshotHash,
      candidateOrbitMonitorBenchmarkFeedSnapshotHash: comparison.candidateOrbitMonitorBenchmarkFeedSnapshotHash,
      baselineOrbitMonitorNewsFeedSnapshotHash: comparison.baselineOrbitMonitorNewsFeedSnapshotHash,
      candidateOrbitMonitorNewsFeedSnapshotHash: comparison.candidateOrbitMonitorNewsFeedSnapshotHash,
      baselineOrbitMonitorReloadRunHash: comparison.baselineOrbitMonitorReloadRunHash,
      candidateOrbitMonitorReloadRunHash: comparison.candidateOrbitMonitorReloadRunHash,
      baselineOrbitMonitorRankingPolicyHash: comparison.baselineOrbitMonitorRankingPolicyHash,
      candidateOrbitMonitorRankingPolicyHash: comparison.candidateOrbitMonitorRankingPolicyHash,
      baselineOrbitMonitorSummaryArtifactHash: comparison.baselineOrbitMonitorSummaryArtifactHash,
      candidateOrbitMonitorSummaryArtifactHash: comparison.candidateOrbitMonitorSummaryArtifactHash,
      baselineOrbitMonitorSourceCount: comparison.baselineOrbitMonitorSourceCount,
      candidateOrbitMonitorSourceCount: comparison.candidateOrbitMonitorSourceCount,
      baselineOrbitMonitorLeaderboardCategoryCount: comparison.baselineOrbitMonitorLeaderboardCategoryCount,
      candidateOrbitMonitorLeaderboardCategoryCount: comparison.candidateOrbitMonitorLeaderboardCategoryCount,
      baselineOrbitMonitorDailyReloadVerified: comparison.baselineOrbitMonitorDailyReloadVerified,
      candidateOrbitMonitorDailyReloadVerified: comparison.candidateOrbitMonitorDailyReloadVerified,
      orbitMonitorMissingReasons: comparison.orbitMonitorMissingReasons,
      baselineGeospatialBenchmarkId: comparison.baselineGeospatialBenchmarkId,
      candidateGeospatialBenchmarkId: comparison.candidateGeospatialBenchmarkId,
      baselineGeospatialTaskSetHash: comparison.baselineGeospatialTaskSetHash,
      candidateGeospatialTaskSetHash: comparison.candidateGeospatialTaskSetHash,
      baselineGeospatialDatasetSnapshotHash: comparison.baselineGeospatialDatasetSnapshotHash,
      candidateGeospatialDatasetSnapshotHash: comparison.candidateGeospatialDatasetSnapshotHash,
      baselineGeospatialToolRegistryHash: comparison.baselineGeospatialToolRegistryHash,
      candidateGeospatialToolRegistryHash: comparison.candidateGeospatialToolRegistryHash,
      baselineGeospatialReferenceSolutionHash: comparison.baselineGeospatialReferenceSolutionHash,
      candidateGeospatialReferenceSolutionHash: comparison.candidateGeospatialReferenceSolutionHash,
      baselineGeospatialTraceExportHash: comparison.baselineGeospatialTraceExportHash,
      candidateGeospatialTraceExportHash: comparison.candidateGeospatialTraceExportHash,
      baselineGeospatialJudgePanelId: comparison.baselineGeospatialJudgePanelId,
      candidateGeospatialJudgePanelId: comparison.candidateGeospatialJudgePanelId,
      baselineGeospatialJudgeConfigHash: comparison.baselineGeospatialJudgeConfigHash,
      candidateGeospatialJudgeConfigHash: comparison.candidateGeospatialJudgeConfigHash,
      baselineGeospatialHumanCalibrationHash: comparison.baselineGeospatialHumanCalibrationHash,
      candidateGeospatialHumanCalibrationHash: comparison.candidateGeospatialHumanCalibrationHash,
      baselineGeospatialResultReportHash: comparison.baselineGeospatialResultReportHash,
      candidateGeospatialResultReportHash: comparison.candidateGeospatialResultReportHash,
      baselineGeospatialTokenCostReportHash: comparison.baselineGeospatialTokenCostReportHash,
      candidateGeospatialTokenCostReportHash: comparison.candidateGeospatialTokenCostReportHash,
      baselineGeospatialTaskComplexityGroups: comparison.baselineGeospatialTaskComplexityGroups,
      candidateGeospatialTaskComplexityGroups: comparison.candidateGeospatialTaskComplexityGroups,
      baselineGeospatialSolvableTaskCount: comparison.baselineGeospatialSolvableTaskCount,
      candidateGeospatialSolvableTaskCount: comparison.candidateGeospatialSolvableTaskCount,
      baselineGeospatialUnsolvableTaskCount: comparison.baselineGeospatialUnsolvableTaskCount,
      candidateGeospatialUnsolvableTaskCount: comparison.candidateGeospatialUnsolvableTaskCount,
      baselineGeospatialToolCount: comparison.baselineGeospatialToolCount,
      candidateGeospatialToolCount: comparison.candidateGeospatialToolCount,
      baselineGeospatialMaxToolIterations: comparison.baselineGeospatialMaxToolIterations,
      candidateGeospatialMaxToolIterations: comparison.candidateGeospatialMaxToolIterations,
      geospatialToolCallingMissingReasons: comparison.geospatialToolCallingMissingReasons,
      baselineAgentDefenseBenchSourceRefHash: comparison.baselineAgentDefenseBenchSourceRefHash,
      candidateAgentDefenseBenchSourceRefHash: comparison.candidateAgentDefenseBenchSourceRefHash,
      baselineAgentDefenseBenchRepositorySnapshotHash: comparison.baselineAgentDefenseBenchRepositorySnapshotHash,
      candidateAgentDefenseBenchRepositorySnapshotHash: comparison.candidateAgentDefenseBenchRepositorySnapshotHash,
      baselineAgentDefenseBenchLicenseRefHash: comparison.baselineAgentDefenseBenchLicenseRefHash,
      candidateAgentDefenseBenchLicenseRefHash: comparison.candidateAgentDefenseBenchLicenseRefHash,
      baselineAgentDefenseBenchDefaultBranchHash: comparison.baselineAgentDefenseBenchDefaultBranchHash,
      candidateAgentDefenseBenchDefaultBranchHash: comparison.candidateAgentDefenseBenchDefaultBranchHash,
      baselineAgentDefenseBenchReadmeHash: comparison.baselineAgentDefenseBenchReadmeHash,
      candidateAgentDefenseBenchReadmeHash: comparison.candidateAgentDefenseBenchReadmeHash,
      baselineAgentDefenseBenchChecksumsHash: comparison.baselineAgentDefenseBenchChecksumsHash,
      candidateAgentDefenseBenchChecksumsHash: comparison.candidateAgentDefenseBenchChecksumsHash,
      baselineAgentDefenseBenchCitationHash: comparison.baselineAgentDefenseBenchCitationHash,
      candidateAgentDefenseBenchCitationHash: comparison.candidateAgentDefenseBenchCitationHash,
      baselineAgentDefenseBenchRequirementsHash: comparison.baselineAgentDefenseBenchRequirementsHash,
      candidateAgentDefenseBenchRequirementsHash: comparison.candidateAgentDefenseBenchRequirementsHash,
      baselineAgentDefenseBenchMcpServerManifestHash: comparison.baselineAgentDefenseBenchMcpServerManifestHash,
      candidateAgentDefenseBenchMcpServerManifestHash: comparison.candidateAgentDefenseBenchMcpServerManifestHash,
      baselineAgentDefenseBenchAttackBankHash: comparison.baselineAgentDefenseBenchAttackBankHash,
      candidateAgentDefenseBenchAttackBankHash: comparison.candidateAgentDefenseBenchAttackBankHash,
      baselineAgentDefenseBenchAcademicBenchmarkHash: comparison.baselineAgentDefenseBenchAcademicBenchmarkHash,
      candidateAgentDefenseBenchAcademicBenchmarkHash: comparison.candidateAgentDefenseBenchAcademicBenchmarkHash,
      baselineAgentDefenseBenchSafetyBenchmarkHash: comparison.baselineAgentDefenseBenchSafetyBenchmarkHash,
      candidateAgentDefenseBenchSafetyBenchmarkHash: comparison.candidateAgentDefenseBenchSafetyBenchmarkHash,
      baselineAgentDefenseBenchCybersecurityBenchmarkHash: comparison.baselineAgentDefenseBenchCybersecurityBenchmarkHash,
      candidateAgentDefenseBenchCybersecurityBenchmarkHash: comparison.candidateAgentDefenseBenchCybersecurityBenchmarkHash,
      baselineAgentDefenseBenchMcpSpecificSuiteHash: comparison.baselineAgentDefenseBenchMcpSpecificSuiteHash,
      candidateAgentDefenseBenchMcpSpecificSuiteHash: comparison.candidateAgentDefenseBenchMcpSpecificSuiteHash,
      baselineAgentDefenseBenchDefenseServerHash: comparison.baselineAgentDefenseBenchDefenseServerHash,
      candidateAgentDefenseBenchDefenseServerHash: comparison.candidateAgentDefenseBenchDefenseServerHash,
      baselineAgentDefenseBenchPolicyHash: comparison.baselineAgentDefenseBenchPolicyHash,
      candidateAgentDefenseBenchPolicyHash: comparison.candidateAgentDefenseBenchPolicyHash,
      baselineAgentDefenseBenchRunConfigHash: comparison.baselineAgentDefenseBenchRunConfigHash,
      candidateAgentDefenseBenchRunConfigHash: comparison.candidateAgentDefenseBenchRunConfigHash,
      baselineAgentDefenseBenchProviderRouteId: comparison.baselineAgentDefenseBenchProviderRouteId,
      candidateAgentDefenseBenchProviderRouteId: comparison.candidateAgentDefenseBenchProviderRouteId,
      baselineAgentDefenseBenchCanaryResultHash: comparison.baselineAgentDefenseBenchCanaryResultHash,
      candidateAgentDefenseBenchCanaryResultHash: comparison.candidateAgentDefenseBenchCanaryResultHash,
      baselineAgentDefenseBenchDriftStatisticHash: comparison.baselineAgentDefenseBenchDriftStatisticHash,
      candidateAgentDefenseBenchDriftStatisticHash: comparison.candidateAgentDefenseBenchDriftStatisticHash,
      baselineAgentDefenseBenchAlertOrWaiverHash: comparison.baselineAgentDefenseBenchAlertOrWaiverHash,
      candidateAgentDefenseBenchAlertOrWaiverHash: comparison.candidateAgentDefenseBenchAlertOrWaiverHash,
      baselineAgentDefenseBenchReplayCommandHash: comparison.baselineAgentDefenseBenchReplayCommandHash,
      candidateAgentDefenseBenchReplayCommandHash: comparison.candidateAgentDefenseBenchReplayCommandHash,
      baselineAgentDefenseBenchCiReceiptHash: comparison.baselineAgentDefenseBenchCiReceiptHash,
      candidateAgentDefenseBenchCiReceiptHash: comparison.candidateAgentDefenseBenchCiReceiptHash,
      baselineAgentDefenseBenchMcpServerCount: comparison.baselineAgentDefenseBenchMcpServerCount,
      candidateAgentDefenseBenchMcpServerCount: comparison.candidateAgentDefenseBenchMcpServerCount,
      baselineAgentDefenseBenchAttackSuiteIds: comparison.baselineAgentDefenseBenchAttackSuiteIds,
      candidateAgentDefenseBenchAttackSuiteIds: comparison.candidateAgentDefenseBenchAttackSuiteIds,
      baselineAgentDefenseBenchDefenseCoverage0to1: comparison.baselineAgentDefenseBenchDefenseCoverage0to1,
      candidateAgentDefenseBenchDefenseCoverage0to1: comparison.candidateAgentDefenseBenchDefenseCoverage0to1,
      baselineAgentDefenseBenchPromptInjectionBlockRate0to1:
        comparison.baselineAgentDefenseBenchPromptInjectionBlockRate0to1,
      candidateAgentDefenseBenchPromptInjectionBlockRate0to1:
        comparison.candidateAgentDefenseBenchPromptInjectionBlockRate0to1,
      baselineAgentDefenseBenchJailbreakBlockRate0to1: comparison.baselineAgentDefenseBenchJailbreakBlockRate0to1,
      candidateAgentDefenseBenchJailbreakBlockRate0to1:
        comparison.candidateAgentDefenseBenchJailbreakBlockRate0to1,
      baselineAgentDefenseBenchToolPoisoningBlockRate0to1:
        comparison.baselineAgentDefenseBenchToolPoisoningBlockRate0to1,
      candidateAgentDefenseBenchToolPoisoningBlockRate0to1:
        comparison.candidateAgentDefenseBenchToolPoisoningBlockRate0to1,
      baselineAgentDefenseBenchBenignPassRate0to1: comparison.baselineAgentDefenseBenchBenignPassRate0to1,
      candidateAgentDefenseBenchBenignPassRate0to1: comparison.candidateAgentDefenseBenchBenignPassRate0to1,
      agentDefenseBenchDefenseCoverageDelta0to1: comparison.agentDefenseBenchDefenseCoverageDelta0to1,
      agentDefenseBenchPromptInjectionBlockRateDelta0to1:
        comparison.agentDefenseBenchPromptInjectionBlockRateDelta0to1,
      agentDefenseBenchJailbreakBlockRateDelta0to1: comparison.agentDefenseBenchJailbreakBlockRateDelta0to1,
      agentDefenseBenchToolPoisoningBlockRateDelta0to1:
        comparison.agentDefenseBenchToolPoisoningBlockRateDelta0to1,
      agentDefenseBenchBenignPassRateDelta0to1: comparison.agentDefenseBenchBenignPassRateDelta0to1,
      agentDefenseBenchMissingReasons: comparison.agentDefenseBenchMissingReasons,
      evidraMissingReasons: comparison.evidraMissingReasons,
      ...pickEvidraComparisonFields(comparison),
      ...pickGalileoComparisonFields(comparison),
      baselineGalileoMetricIds: comparison.baselineGalileoMetricIds,
      candidateGalileoMetricIds: comparison.candidateGalileoMetricIds,
      baselineGalileoMetricCount: comparison.baselineGalileoMetricCount,
      candidateGalileoMetricCount: comparison.candidateGalileoMetricCount,
      galileoMissingReasons: comparison.galileoMissingReasons,
      repairEffectivenessDelta0to1: comparison.repairEffectivenessDelta0to1,
      falsePositiveIdentificationDelta0to1: comparison.falsePositiveIdentificationDelta0to1,
      netCodebaseImpactDelta0to1: comparison.netCodebaseImpactDelta0to1,
      artifactAccuracyDelta0to1: comparison.artifactAccuracyDelta0to1,
      formulaIntegrityDelta0to1: comparison.formulaIntegrityDelta0to1,
      formatQualityDelta0to1: comparison.formatQualityDelta0to1,
      protocolSuccessRateDelta0to1: comparison.protocolSuccessRateDelta0to1,
      agreementRateDelta0to1: comparison.agreementRateDelta0to1,
      targetOutcomeValueDelta0to1: comparison.targetOutcomeValueDelta0to1,
      latentPreferenceAlignmentDelta0to1: comparison.latentPreferenceAlignmentDelta0to1,
      evaluatorCoverageDelta0to1: comparison.evaluatorCoverageDelta0to1,
      guardrailPassRateDelta0to1: comparison.guardrailPassRateDelta0to1,
      scoreThresholdPassRateDelta0to1: comparison.scoreThresholdPassRateDelta0to1,
      retryStabilityDelta0to1: comparison.retryStabilityDelta0to1,
      progressAucDelta0to1: comparison.progressAucDelta0to1,
      progressPerTurnDelta0to1: comparison.progressPerTurnDelta0to1,
      passAtKDelta0to1: comparison.passAtKDelta0to1,
      passPowerKDelta0to1: comparison.passPowerKDelta0to1,
      subgoalCompletionRateDelta0to1: comparison.subgoalCompletionRateDelta0to1,
      expectedToolCallCoverageDelta0to1: comparison.expectedToolCallCoverageDelta0to1,
      personaCoverageDelta0to1: comparison.personaCoverageDelta0to1,
      errorClusterRateDelta0to1: comparison.errorClusterRateDelta0to1,
      status: comparison.status,
      driftStatistic: comparison.driftStatistic,
      evidenceRefs: comparison.evidenceRefs,
      signedEvidenceRefs: comparison.signedEvidenceRefs,
    };
    return {
      ...rowPayload,
      rowHash: sha256Hex(canonicalize(rowPayload)),
    };
  });
  const datasetHash = input.datasetHash ?? sha256Hex(canonicalize(rows.map((row) => row.rowHash)));
  const manifestWithoutHash = {
    packId: input.packId ?? `${report.reportId}:eval-pack`,
    reportId: report.reportId,
    agentId: report.agentId,
    createdAt: report.createdAt,
    datasetHash,
    rowCount: rows.length,
    replayable: rows.length > 0 && isSha256(datasetHash) && rows.every((row) => row.evidenceRefs.length > 0 && row.signedEvidenceRefs.length > 0),
    sourceRefs: input.sourceRefs ?? [],
    rows,
  };
  return {
    ...manifestWithoutHash,
    manifestHash: sha256Hex(canonicalize(manifestWithoutHash)),
  };
}

export function buildProviderDriftCiGate(
  report: ProviderDriftBenchmarkReport,
  input: BuildProviderDriftCiGateInput = {},
): ProviderDriftCiGate {
  const mode = input.mode ?? "ci";
  const activeAlerts = report.alerts.filter((alert) => !alert.waived);
  const waivedAlerts = report.alerts.filter((alert) => alert.waived);
  const passed = activeAlerts.length === 0;
  return {
    mode,
    passed,
    failClosed: !passed,
    failedAlertIds: activeAlerts.map((alert) => alert.alertId),
    waivedAlertIds: waivedAlerts.map((alert) => alert.alertId),
    summary: passed
      ? `Provider drift ${mode} gate passed for ${report.agentId}.`
      : `Provider drift ${mode} gate blocked ${activeAlerts.length} unwaived alert(s) for ${report.agentId}.`,
  };
}

export function renderProviderDriftBenchmarkMarkdown(report: ProviderDriftBenchmarkReport): string {
  const lines: string[] = [];
  lines.push("# Provider Drift Benchmark");
  lines.push("");
  lines.push(`Agent: ${report.agentId}`);
  lines.push(`Recommendation: ${report.recommendation}`);
  lines.push(`Fail Closed: ${report.failClosed ? "yes" : "no"}`);
  lines.push(`Provider Versions: ${report.providerVersions.join(", ") || "none"}`);
  lines.push("");
  lines.push("## Thresholds");
  lines.push("");
  lines.push(`- Minimum sample size: ${report.thresholds.minSampleSize}`);
  lines.push(`- Minimum trajectory count: ${report.thresholds.minTrajectoryCount}`);
  lines.push(`- Maximum score drop: ${report.thresholds.maxScoreDrop0to1}`);
  lines.push(`- Maximum refusal increase: ${report.thresholds.maxRefusalRateIncrease0to1}`);
  lines.push(`- Maximum invalid-action increase: ${report.thresholds.maxInvalidActionRateIncrease0to1}`);
  lines.push(`- Maximum error-attribution increase: ${report.thresholds.maxErrorAttributionRateIncrease0to1}`);
  lines.push(`- Maximum judge-agreement drop: ${report.thresholds.maxJudgeAgreementDrop0to1}`);
  lines.push(`- Maximum unjudged-prediction increase: ${report.thresholds.maxUnjudgedPredictionRateIncrease0to1}`);
  lines.push(`- Maximum repair-effectiveness drop: ${report.thresholds.maxRepairEffectivenessDrop0to1}`);
  lines.push(`- Maximum false-positive identification drop: ${report.thresholds.maxFalsePositiveIdentificationDrop0to1}`);
  lines.push(`- Maximum net codebase impact drop: ${report.thresholds.maxNetCodebaseImpactDrop0to1}`);
  lines.push(`- Maximum artifact accuracy drop: ${report.thresholds.maxArtifactAccuracyDrop0to1}`);
  lines.push(`- Maximum formula integrity drop: ${report.thresholds.maxFormulaIntegrityDrop0to1}`);
  lines.push(`- Maximum format quality drop: ${report.thresholds.maxFormatQualityDrop0to1}`);
  lines.push(`- Maximum protocol success rate drop: ${report.thresholds.maxProtocolSuccessRateDrop0to1}`);
  lines.push(`- Maximum agreement rate drop: ${report.thresholds.maxAgreementRateDrop0to1}`);
  lines.push(`- Maximum target outcome value drop: ${report.thresholds.maxTargetOutcomeValueDrop0to1}`);
  lines.push(`- Maximum latent-preference alignment drop: ${report.thresholds.maxLatentPreferenceAlignmentDrop0to1}`);
  lines.push(`- Maximum evaluator coverage drop: ${report.thresholds.maxEvaluatorCoverageDrop0to1}`);
  lines.push(`- Maximum guardrail pass rate drop: ${report.thresholds.maxGuardrailPassRateDrop0to1}`);
  lines.push(`- Maximum score-threshold pass rate drop: ${report.thresholds.maxScoreThresholdPassRateDrop0to1}`);
  lines.push(`- Maximum retry stability drop: ${report.thresholds.maxRetryStabilityDrop0to1}`);
  lines.push(`- Maximum progress AUC drop: ${report.thresholds.maxProgressAucDrop0to1}`);
  lines.push(`- Maximum progress per turn drop: ${report.thresholds.maxProgressPerTurnDrop0to1}`);
  lines.push(`- Maximum pass@k drop: ${report.thresholds.maxPassAtKDrop0to1}`);
  lines.push(`- Maximum pass^k drop: ${report.thresholds.maxPassPowerKDrop0to1}`);
  lines.push(`- Maximum subgoal completion drop: ${report.thresholds.maxSubgoalCompletionRateDrop0to1}`);
  lines.push(`- Maximum expected-tool-call coverage drop: ${report.thresholds.maxExpectedToolCallCoverageDrop0to1}`);
  lines.push(`- Maximum persona coverage drop: ${report.thresholds.maxPersonaCoverageDrop0to1}`);
  lines.push(`- Maximum error-cluster rate increase: ${report.thresholds.maxErrorClusterRateIncrease0to1}`);
  lines.push(`- Minimum evaluator metric count: ${report.thresholds.minEvaluationMetricCount}`);
  lines.push(`- Minimum geospatial task complexity groups: ${report.thresholds.minGeospatialTaskComplexityGroups}`);
  lines.push(`- Minimum geospatial solvable tasks: ${report.thresholds.minGeospatialSolvableTaskCount}`);
  lines.push(`- Minimum geospatial unsolvable tasks: ${report.thresholds.minGeospatialUnsolvableTaskCount}`);
  lines.push(`- Minimum geospatial tool count: ${report.thresholds.minGeospatialToolCount}`);
  lines.push(`- Minimum geospatial max tool iterations: ${report.thresholds.minGeospatialMaxToolIterations}`);
  lines.push(`- Minimum AgentDefense-Bench MCP server count: ${report.thresholds.minAgentDefenseBenchMcpServerCount}`);
  lines.push(`- Minimum AgentDefense-Bench attack suite count: ${report.thresholds.minAgentDefenseBenchAttackSuiteIds}`);
  lines.push(`- Minimum AgentDefense-Bench defense coverage: ${report.thresholds.minAgentDefenseBenchDefenseCoverage0to1}`);
  lines.push(`- Maximum AgentDefense-Bench defense coverage drop: ${report.thresholds.maxAgentDefenseBenchDefenseCoverageDrop0to1}`);
  lines.push(`- Maximum AgentDefense-Bench prompt-injection block-rate drop: ${report.thresholds.maxAgentDefenseBenchPromptInjectionBlockRateDrop0to1}`);
  lines.push(`- Maximum AgentDefense-Bench jailbreak block-rate drop: ${report.thresholds.maxAgentDefenseBenchJailbreakBlockRateDrop0to1}`);
  lines.push(`- Maximum AgentDefense-Bench tool-poisoning block-rate drop: ${report.thresholds.maxAgentDefenseBenchToolPoisoningBlockRateDrop0to1}`);
  lines.push(`- Maximum AgentDefense-Bench benign-pass-rate drop: ${report.thresholds.maxAgentDefenseBenchBenignPassRateDrop0to1}`);
  lines.push(`- Maximum p95 latency increase ratio: ${report.thresholds.maxLatencyIncreaseRatio}`);
  lines.push(`- Maximum mean cost increase ratio: ${report.thresholds.maxCostIncreaseRatio}`);
  lines.push("");
  lines.push("## Canary Results");
  lines.push("");
  lines.push("| Canary | Provider / Model | Capability | Arena Context | Versions | Samples | Trajectories | Score Delta | Refusal Delta | Invalid Action Delta | Error Attribution Delta | Judge Agreement Delta | Unjudged Prediction Delta | Repair Effectiveness Delta | False Positive Delta | Net Codebase Impact Delta | Artifact Accuracy Delta | Formula Integrity Delta | Format Quality Delta | Protocol Success Delta | Agreement Rate Delta | Target Outcome Value Delta | Latent Preference Alignment Delta | Evaluator Coverage Delta | Guardrail Pass Delta | Score Threshold Pass Delta | Retry Stability Delta | Progress AUC Delta | Progress Per Turn Delta | Pass@k Delta | Pass^k Delta | Subgoal Completion Delta | Expected Tool Coverage Delta | Persona Coverage Delta | Error Cluster Rate Delta | Latency Delta | Cost Delta | Drift Statistic | Status | Evidence |");
  lines.push("|---|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|");
  for (const item of report.comparisons) {
    lines.push([
      item.canaryId,
      `${item.provider}/${item.model}`,
      `${item.baselineBenchmarkFamily ?? "missing"} -> ${item.candidateBenchmarkFamily ?? "missing"} / ${item.baselineCapabilityId ?? "missing"} -> ${item.candidateCapabilityId ?? "missing"}`,
      [
        `${item.baselineArenaId ?? "missing"} -> ${item.candidateArenaId ?? "missing"}`,
        `${item.baselineEnvironmentId ?? "missing"} -> ${item.candidateEnvironmentId ?? "missing"}`,
        `${item.baselineReferencePoolId ?? "missing"} -> ${item.candidateReferencePoolId ?? "missing"}`,
      ].join(" / "),
      `${item.baselineVersion ?? "missing"} -> ${item.candidateVersion ?? "missing"}`,
      `${item.baselineSampleSize}/${item.candidateSampleSize}`,
      `${item.baselineTrajectoryCount}/${item.candidateTrajectoryCount}`,
      item.scoreDelta0to1.toFixed(3),
      item.refusalRateDelta0to1.toFixed(3),
      item.invalidActionRateDelta0to1.toFixed(3),
      item.errorAttributionRateDelta0to1.toFixed(3),
      item.judgeAgreementDelta0to1.toFixed(3),
      item.unjudgedPredictionRateDelta0to1.toFixed(3),
      item.repairEffectivenessDelta0to1.toFixed(3),
      item.falsePositiveIdentificationDelta0to1.toFixed(3),
      item.netCodebaseImpactDelta0to1.toFixed(3),
      item.artifactAccuracyDelta0to1.toFixed(3),
      item.formulaIntegrityDelta0to1.toFixed(3),
      item.formatQualityDelta0to1.toFixed(3),
      item.protocolSuccessRateDelta0to1.toFixed(3),
      item.agreementRateDelta0to1.toFixed(3),
      item.targetOutcomeValueDelta0to1.toFixed(3),
      item.latentPreferenceAlignmentDelta0to1.toFixed(3),
      item.evaluatorCoverageDelta0to1.toFixed(3),
      item.guardrailPassRateDelta0to1.toFixed(3),
      item.scoreThresholdPassRateDelta0to1.toFixed(3),
      item.retryStabilityDelta0to1.toFixed(3),
      item.progressAucDelta0to1.toFixed(3),
      item.progressPerTurnDelta0to1.toFixed(3),
      item.passAtKDelta0to1.toFixed(3),
      item.passPowerKDelta0to1.toFixed(3),
      item.subgoalCompletionRateDelta0to1.toFixed(3),
      item.expectedToolCallCoverageDelta0to1.toFixed(3),
      item.personaCoverageDelta0to1.toFixed(3),
      item.errorClusterRateDelta0to1.toFixed(3),
      item.latencyDeltaRatio.toFixed(3),
      item.costDeltaRatio.toFixed(3),
      item.driftStatistic.toFixed(3),
      item.status,
      item.evidenceRefs.join(", ") || "missing",
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
  lines.push("");
  const frameworkRows = report.comparisons.filter((item) =>
    item.baselineEvaluationFrameworkId ||
    item.candidateEvaluationFrameworkId ||
    item.evaluationFrameworkMissingReasons.length > 0
  );
  if (frameworkRows.length > 0) {
    lines.push("## Evaluation Framework Proof");
    lines.push("");
    lines.push("| Canary | Framework | Provider Route | Metric Suite | Metric Count | Verdict Aggregation | Generated Test Data | Dashboard Artifact | Missing Proof |");
    lines.push("|---|---|---|---|---:|---|---|---|---|");
    for (const item of frameworkRows) {
      lines.push([
        item.canaryId,
        `${item.baselineEvaluationFrameworkId ?? "missing"}@${item.baselineEvaluationFrameworkVersion ?? "missing"} -> ${item.candidateEvaluationFrameworkId ?? "missing"}@${item.candidateEvaluationFrameworkVersion ?? "missing"}`,
        `${item.baselineProviderRouteId ?? "missing"} -> ${item.candidateProviderRouteId ?? "missing"}`,
        `${item.baselineMetricSuiteId ?? "missing"} -> ${item.candidateMetricSuiteId ?? "missing"}`,
        `${item.baselineMetricCount}/${item.candidateMetricCount}`,
        `${item.baselineVerdictAggregation ?? "missing"} -> ${item.candidateVerdictAggregation ?? "missing"}`,
        `${item.baselineGeneratedTestDataHash ? item.baselineGeneratedTestDataHash.slice(0, 12) : "missing"} -> ${item.candidateGeneratedTestDataHash ? item.candidateGeneratedTestDataHash.slice(0, 12) : "missing"}`,
        `${item.baselineDashboardArtifactHash ? item.baselineDashboardArtifactHash.slice(0, 12) : "missing"} -> ${item.candidateDashboardArtifactHash ? item.candidateDashboardArtifactHash.slice(0, 12) : "missing"}`,
        item.evaluationFrameworkMissingReasons.join(", ") || "none",
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    }
    lines.push("");
  }
  const falconRows = report.comparisons.filter((item) =>
    item.baselineFalconEvaluateSourceRefHash ||
    item.candidateFalconEvaluateSourceRefHash ||
    item.baselineFalconEvaluateReleaseTag ||
    item.candidateFalconEvaluateReleaseTag ||
    item.baselineFalconEvaluateMetricFamilyIds.length > 0 ||
    item.candidateFalconEvaluateMetricFamilyIds.length > 0 ||
    item.falconEvaluateMissingReasons.length > 0
  );
  if (falconRows.length > 0) {
    lines.push("## Falcon Evaluate Proof");
    lines.push("");
    lines.push("| Canary | Source Ref | Repository Snapshot | Release | Package / Lock / Requirements | Docs / Workflow | Modules | Metric Families | Metrics | Provider Route | Canary Result | Missing Proof |");
    lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const item of falconRows) {
      lines.push([
        item.canaryId,
        `${item.baselineFalconEvaluateSourceRefHash ? item.baselineFalconEvaluateSourceRefHash.slice(0, 12) : "missing"} -> ${item.candidateFalconEvaluateSourceRefHash ? item.candidateFalconEvaluateSourceRefHash.slice(0, 12) : "missing"}`,
        `${item.baselineFalconEvaluateRepositorySnapshotHash ? item.baselineFalconEvaluateRepositorySnapshotHash.slice(0, 12) : "missing"} -> ${item.candidateFalconEvaluateRepositorySnapshotHash ? item.candidateFalconEvaluateRepositorySnapshotHash.slice(0, 12) : "missing"}`,
        `${item.baselineFalconEvaluateReleaseTag ?? "missing"} -> ${item.candidateFalconEvaluateReleaseTag ?? "missing"}`,
        [
          `${item.baselineFalconEvaluatePackageManifestHash ? item.baselineFalconEvaluatePackageManifestHash.slice(0, 12) : "missing"} -> ${item.candidateFalconEvaluatePackageManifestHash ? item.candidateFalconEvaluatePackageManifestHash.slice(0, 12) : "missing"}`,
          `${item.baselineFalconEvaluateLockfileHash ? item.baselineFalconEvaluateLockfileHash.slice(0, 12) : "missing"} -> ${item.candidateFalconEvaluateLockfileHash ? item.candidateFalconEvaluateLockfileHash.slice(0, 12) : "missing"}`,
          `${item.baselineFalconEvaluateRequirementsHash ? item.baselineFalconEvaluateRequirementsHash.slice(0, 12) : "missing"} -> ${item.candidateFalconEvaluateRequirementsHash ? item.candidateFalconEvaluateRequirementsHash.slice(0, 12) : "missing"}`,
        ].join(" / "),
        [
          `${item.baselineFalconEvaluateDocsIndexHash ? item.baselineFalconEvaluateDocsIndexHash.slice(0, 12) : "missing"} -> ${item.candidateFalconEvaluateDocsIndexHash ? item.candidateFalconEvaluateDocsIndexHash.slice(0, 12) : "missing"}`,
          `${item.baselineFalconEvaluateWorkflowHash ? item.baselineFalconEvaluateWorkflowHash.slice(0, 12) : "missing"} -> ${item.candidateFalconEvaluateWorkflowHash ? item.candidateFalconEvaluateWorkflowHash.slice(0, 12) : "missing"}`,
        ].join(" / "),
        [
          item.baselineFalconEvaluateEvaluationModuleHash,
          item.baselineFalconEvaluateContextRelevancyModuleHash,
          item.baselineFalconEvaluateFairnessModuleHash,
          item.baselineFalconEvaluateReliabilityModuleHash,
          item.baselineFalconEvaluateSecurityModuleHash,
          item.baselineFalconEvaluateMachineEthicsModuleHash,
          item.baselineFalconEvaluateResultsModuleHash,
          item.baselineFalconEvaluatePlotModuleHash,
          item.baselineFalconEvaluateUserAnalyticsModuleHash,
        ].filter(Boolean).length.toString(),
        `${item.baselineFalconEvaluateMetricFamilyIds.join("+") || "missing"} -> ${item.candidateFalconEvaluateMetricFamilyIds.join("+") || "missing"}`,
        `${item.baselineFalconEvaluateMetricCount}/${item.candidateFalconEvaluateMetricCount}`,
        `${item.baselineFalconEvaluateProviderRouteId ?? "missing"} -> ${item.candidateFalconEvaluateProviderRouteId ?? "missing"}`,
        `${item.baselineFalconEvaluateCanaryResultHash ? item.baselineFalconEvaluateCanaryResultHash.slice(0, 12) : "missing"} -> ${item.candidateFalconEvaluateCanaryResultHash ? item.candidateFalconEvaluateCanaryResultHash.slice(0, 12) : "missing"}`,
        item.falconEvaluateMissingReasons.join(", ") || "none",
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    }
    lines.push("");
  }
  const observabilityRows = report.comparisons.filter((item) =>
    item.baselinePipelineOrchestratorId ||
    item.candidatePipelineOrchestratorId ||
    item.baselineExperimentTrackerId ||
    item.candidateExperimentTrackerId ||
    item.baselineObservabilityProjectId ||
    item.candidateObservabilityProjectId ||
    item.baselineDatastoreId ||
    item.candidateDatastoreId ||
    item.observabilityPipelineMissingReasons.length > 0
  );
  if (observabilityRows.length > 0) {
    lines.push("## Observability Pipeline Proof");
    lines.push("");
    lines.push("| Canary | Orchestrator Run | Experiment Tracker | Observability Project | Datastore | Retrieval Index | Content Dataset | Summary Artifact | QA Dataset | Trace Export | Metric Report | Pipeline Config | Missing Proof |");
    lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const item of observabilityRows) {
      lines.push([
        item.canaryId,
        `${item.baselinePipelineOrchestratorId ?? "missing"}:${item.baselinePipelineRunId ?? "missing"} -> ${item.candidatePipelineOrchestratorId ?? "missing"}:${item.candidatePipelineRunId ?? "missing"}`,
        `${item.baselineExperimentTrackerId ?? "missing"}:${item.baselineExperimentRunId ?? "missing"} -> ${item.candidateExperimentTrackerId ?? "missing"}:${item.candidateExperimentRunId ?? "missing"}`,
        `${item.baselineObservabilityProjectId ?? "missing"} -> ${item.candidateObservabilityProjectId ?? "missing"}`,
        `${item.baselineDatastoreId ?? "missing"} -> ${item.candidateDatastoreId ?? "missing"}`,
        `${item.baselineRetrievalIndexHash ? item.baselineRetrievalIndexHash.slice(0, 12) : "missing"} -> ${item.candidateRetrievalIndexHash ? item.candidateRetrievalIndexHash.slice(0, 12) : "missing"}`,
        `${item.baselineContentDatasetHash ? item.baselineContentDatasetHash.slice(0, 12) : "missing"} -> ${item.candidateContentDatasetHash ? item.candidateContentDatasetHash.slice(0, 12) : "missing"}`,
        `${item.baselineSummaryArtifactHash ? item.baselineSummaryArtifactHash.slice(0, 12) : "missing"} -> ${item.candidateSummaryArtifactHash ? item.candidateSummaryArtifactHash.slice(0, 12) : "missing"}`,
        `${item.baselineQaDatasetHash ? item.baselineQaDatasetHash.slice(0, 12) : "missing"} -> ${item.candidateQaDatasetHash ? item.candidateQaDatasetHash.slice(0, 12) : "missing"}`,
        `${item.baselineTraceExportHash ? item.baselineTraceExportHash.slice(0, 12) : "missing"} -> ${item.candidateTraceExportHash ? item.candidateTraceExportHash.slice(0, 12) : "missing"}`,
        `${item.baselineMetricReportHash ? item.baselineMetricReportHash.slice(0, 12) : "missing"} -> ${item.candidateMetricReportHash ? item.candidateMetricReportHash.slice(0, 12) : "missing"}`,
        `${item.baselinePipelineConfigHash ? item.baselinePipelineConfigHash.slice(0, 12) : "missing"} -> ${item.candidatePipelineConfigHash ? item.candidatePipelineConfigHash.slice(0, 12) : "missing"}`,
        item.observabilityPipelineMissingReasons.join(", ") || "none",
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    }
    lines.push("");
  }
  const orbitRows = report.comparisons.filter((item) =>
    item.baselineOrbitMonitorSourceCatalogHash ||
    item.candidateOrbitMonitorSourceCatalogHash ||
    item.baselineOrbitMonitorLeaderboardSnapshotHash ||
    item.candidateOrbitMonitorLeaderboardSnapshotHash ||
    item.orbitMonitorMissingReasons.length > 0
  );
  if (orbitRows.length > 0) {
    lines.push("## Orbit Monitor Proof");
    lines.push("");
    lines.push("| Canary | Source Catalog | Leaderboard Snapshot | Model Registry | Benchmark Feed | News Feed | Reload Run | Ranking Policy | Summary Artifact | Sources | Leaderboard Categories | Daily Reload | Missing Proof |");
    lines.push("|---|---|---|---|---|---|---|---|---|---:|---:|---|---|");
    for (const item of orbitRows) {
      lines.push([
        item.canaryId,
        `${item.baselineOrbitMonitorSourceCatalogHash ? item.baselineOrbitMonitorSourceCatalogHash.slice(0, 12) : "missing"} -> ${item.candidateOrbitMonitorSourceCatalogHash ? item.candidateOrbitMonitorSourceCatalogHash.slice(0, 12) : "missing"}`,
        `${item.baselineOrbitMonitorLeaderboardSnapshotHash ? item.baselineOrbitMonitorLeaderboardSnapshotHash.slice(0, 12) : "missing"} -> ${item.candidateOrbitMonitorLeaderboardSnapshotHash ? item.candidateOrbitMonitorLeaderboardSnapshotHash.slice(0, 12) : "missing"}`,
        `${item.baselineOrbitMonitorModelRegistrySnapshotHash ? item.baselineOrbitMonitorModelRegistrySnapshotHash.slice(0, 12) : "missing"} -> ${item.candidateOrbitMonitorModelRegistrySnapshotHash ? item.candidateOrbitMonitorModelRegistrySnapshotHash.slice(0, 12) : "missing"}`,
        `${item.baselineOrbitMonitorBenchmarkFeedSnapshotHash ? item.baselineOrbitMonitorBenchmarkFeedSnapshotHash.slice(0, 12) : "missing"} -> ${item.candidateOrbitMonitorBenchmarkFeedSnapshotHash ? item.candidateOrbitMonitorBenchmarkFeedSnapshotHash.slice(0, 12) : "missing"}`,
        `${item.baselineOrbitMonitorNewsFeedSnapshotHash ? item.baselineOrbitMonitorNewsFeedSnapshotHash.slice(0, 12) : "missing"} -> ${item.candidateOrbitMonitorNewsFeedSnapshotHash ? item.candidateOrbitMonitorNewsFeedSnapshotHash.slice(0, 12) : "missing"}`,
        `${item.baselineOrbitMonitorReloadRunHash ? item.baselineOrbitMonitorReloadRunHash.slice(0, 12) : "missing"} -> ${item.candidateOrbitMonitorReloadRunHash ? item.candidateOrbitMonitorReloadRunHash.slice(0, 12) : "missing"}`,
        `${item.baselineOrbitMonitorRankingPolicyHash ? item.baselineOrbitMonitorRankingPolicyHash.slice(0, 12) : "missing"} -> ${item.candidateOrbitMonitorRankingPolicyHash ? item.candidateOrbitMonitorRankingPolicyHash.slice(0, 12) : "missing"}`,
        `${item.baselineOrbitMonitorSummaryArtifactHash ? item.baselineOrbitMonitorSummaryArtifactHash.slice(0, 12) : "missing"} -> ${item.candidateOrbitMonitorSummaryArtifactHash ? item.candidateOrbitMonitorSummaryArtifactHash.slice(0, 12) : "missing"}`,
        `${item.baselineOrbitMonitorSourceCount}/${item.candidateOrbitMonitorSourceCount}`,
        `${item.baselineOrbitMonitorLeaderboardCategoryCount}/${item.candidateOrbitMonitorLeaderboardCategoryCount}`,
        `${item.baselineOrbitMonitorDailyReloadVerified ? "yes" : "no"} -> ${item.candidateOrbitMonitorDailyReloadVerified ? "yes" : "no"}`,
        item.orbitMonitorMissingReasons.join(", ") || "none",
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    }
    lines.push("");
  }
  const geospatialRows = report.comparisons.filter((item) =>
    item.baselineGeospatialBenchmarkId ||
    item.candidateGeospatialBenchmarkId ||
    item.baselineGeospatialJudgePanelId ||
    item.candidateGeospatialJudgePanelId ||
    item.baselineGeospatialTaskComplexityGroups.length > 0 ||
    item.candidateGeospatialTaskComplexityGroups.length > 0 ||
    item.geospatialToolCallingMissingReasons.length > 0
  );
  if (geospatialRows.length > 0) {
    lines.push("## Geospatial Tool-Calling Proof");
    lines.push("");
    lines.push("| Canary | Benchmark | Task Set | Dataset Snapshot | Tool Registry | Reference Solutions | Trace Export | Judge Panel | Judge Config | Human Calibration | Result Report | Token/Cost Report | Complexity Groups | Solvable / Unsolvable | Tools | Max Iterations | Missing Proof |");
    lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---:|---:|---:|---|");
    for (const item of geospatialRows) {
      lines.push([
        item.canaryId,
        `${item.baselineGeospatialBenchmarkId ?? "missing"} -> ${item.candidateGeospatialBenchmarkId ?? "missing"}`,
        `${item.baselineGeospatialTaskSetHash ? item.baselineGeospatialTaskSetHash.slice(0, 12) : "missing"} -> ${item.candidateGeospatialTaskSetHash ? item.candidateGeospatialTaskSetHash.slice(0, 12) : "missing"}`,
        `${item.baselineGeospatialDatasetSnapshotHash ? item.baselineGeospatialDatasetSnapshotHash.slice(0, 12) : "missing"} -> ${item.candidateGeospatialDatasetSnapshotHash ? item.candidateGeospatialDatasetSnapshotHash.slice(0, 12) : "missing"}`,
        `${item.baselineGeospatialToolRegistryHash ? item.baselineGeospatialToolRegistryHash.slice(0, 12) : "missing"} -> ${item.candidateGeospatialToolRegistryHash ? item.candidateGeospatialToolRegistryHash.slice(0, 12) : "missing"}`,
        `${item.baselineGeospatialReferenceSolutionHash ? item.baselineGeospatialReferenceSolutionHash.slice(0, 12) : "missing"} -> ${item.candidateGeospatialReferenceSolutionHash ? item.candidateGeospatialReferenceSolutionHash.slice(0, 12) : "missing"}`,
        `${item.baselineGeospatialTraceExportHash ? item.baselineGeospatialTraceExportHash.slice(0, 12) : "missing"} -> ${item.candidateGeospatialTraceExportHash ? item.candidateGeospatialTraceExportHash.slice(0, 12) : "missing"}`,
        `${item.baselineGeospatialJudgePanelId ?? "missing"} -> ${item.candidateGeospatialJudgePanelId ?? "missing"}`,
        `${item.baselineGeospatialJudgeConfigHash ? item.baselineGeospatialJudgeConfigHash.slice(0, 12) : "missing"} -> ${item.candidateGeospatialJudgeConfigHash ? item.candidateGeospatialJudgeConfigHash.slice(0, 12) : "missing"}`,
        `${item.baselineGeospatialHumanCalibrationHash ? item.baselineGeospatialHumanCalibrationHash.slice(0, 12) : "missing"} -> ${item.candidateGeospatialHumanCalibrationHash ? item.candidateGeospatialHumanCalibrationHash.slice(0, 12) : "missing"}`,
        `${item.baselineGeospatialResultReportHash ? item.baselineGeospatialResultReportHash.slice(0, 12) : "missing"} -> ${item.candidateGeospatialResultReportHash ? item.candidateGeospatialResultReportHash.slice(0, 12) : "missing"}`,
        `${item.baselineGeospatialTokenCostReportHash ? item.baselineGeospatialTokenCostReportHash.slice(0, 12) : "missing"} -> ${item.candidateGeospatialTokenCostReportHash ? item.candidateGeospatialTokenCostReportHash.slice(0, 12) : "missing"}`,
        `${item.baselineGeospatialTaskComplexityGroups.join("+") || "missing"} -> ${item.candidateGeospatialTaskComplexityGroups.join("+") || "missing"}`,
        `${item.baselineGeospatialSolvableTaskCount}/${item.baselineGeospatialUnsolvableTaskCount} -> ${item.candidateGeospatialSolvableTaskCount}/${item.candidateGeospatialUnsolvableTaskCount}`,
        `${item.baselineGeospatialToolCount} -> ${item.candidateGeospatialToolCount}`,
        `${item.baselineGeospatialMaxToolIterations} -> ${item.candidateGeospatialMaxToolIterations}`,
        item.geospatialToolCallingMissingReasons.join(", ") || "none",
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    }
    lines.push("");
  }
  const agentDefenseRows = report.comparisons.filter((item) =>
    item.baselineAgentDefenseBenchSourceRefHash ||
    item.candidateAgentDefenseBenchSourceRefHash ||
    item.baselineAgentDefenseBenchMcpServerManifestHash ||
    item.candidateAgentDefenseBenchMcpServerManifestHash ||
    item.baselineAgentDefenseBenchAttackSuiteIds.length > 0 ||
    item.candidateAgentDefenseBenchAttackSuiteIds.length > 0 ||
    item.agentDefenseBenchMissingReasons.length > 0
  );
  if (agentDefenseRows.length > 0) {
    lines.push("## AgentDefense-Bench Proof");
    lines.push("");
    lines.push("| Canary | Source / Repository | License / Branch | README / Checksums / Citation | Requirements / MCP Servers | Attack Banks | Defense Policy | Run / Canary / Drift | Alert / Replay / CI | MCP Servers | Attack Suites | Coverage | Prompt / Jailbreak / Tool / Benign Rates | Missing Proof |");
    lines.push("|---|---|---|---|---|---|---|---|---|---:|---|---|---|---|");
    for (const item of agentDefenseRows) {
      lines.push([
        item.canaryId,
        [
          `${item.baselineAgentDefenseBenchSourceRefHash ? item.baselineAgentDefenseBenchSourceRefHash.slice(0, 12) : "missing"} -> ${item.candidateAgentDefenseBenchSourceRefHash ? item.candidateAgentDefenseBenchSourceRefHash.slice(0, 12) : "missing"}`,
          `${item.baselineAgentDefenseBenchRepositorySnapshotHash ? item.baselineAgentDefenseBenchRepositorySnapshotHash.slice(0, 12) : "missing"} -> ${item.candidateAgentDefenseBenchRepositorySnapshotHash ? item.candidateAgentDefenseBenchRepositorySnapshotHash.slice(0, 12) : "missing"}`,
        ].join(" / "),
        [
          `${item.baselineAgentDefenseBenchLicenseRefHash ? item.baselineAgentDefenseBenchLicenseRefHash.slice(0, 12) : "missing"} -> ${item.candidateAgentDefenseBenchLicenseRefHash ? item.candidateAgentDefenseBenchLicenseRefHash.slice(0, 12) : "missing"}`,
          `${item.baselineAgentDefenseBenchDefaultBranchHash ? item.baselineAgentDefenseBenchDefaultBranchHash.slice(0, 12) : "missing"} -> ${item.candidateAgentDefenseBenchDefaultBranchHash ? item.candidateAgentDefenseBenchDefaultBranchHash.slice(0, 12) : "missing"}`,
        ].join(" / "),
        [
          `${item.baselineAgentDefenseBenchReadmeHash ? item.baselineAgentDefenseBenchReadmeHash.slice(0, 12) : "missing"} -> ${item.candidateAgentDefenseBenchReadmeHash ? item.candidateAgentDefenseBenchReadmeHash.slice(0, 12) : "missing"}`,
          `${item.baselineAgentDefenseBenchChecksumsHash ? item.baselineAgentDefenseBenchChecksumsHash.slice(0, 12) : "missing"} -> ${item.candidateAgentDefenseBenchChecksumsHash ? item.candidateAgentDefenseBenchChecksumsHash.slice(0, 12) : "missing"}`,
          `${item.baselineAgentDefenseBenchCitationHash ? item.baselineAgentDefenseBenchCitationHash.slice(0, 12) : "missing"} -> ${item.candidateAgentDefenseBenchCitationHash ? item.candidateAgentDefenseBenchCitationHash.slice(0, 12) : "missing"}`,
        ].join(" / "),
        [
          `${item.baselineAgentDefenseBenchRequirementsHash ? item.baselineAgentDefenseBenchRequirementsHash.slice(0, 12) : "missing"} -> ${item.candidateAgentDefenseBenchRequirementsHash ? item.candidateAgentDefenseBenchRequirementsHash.slice(0, 12) : "missing"}`,
          `${item.baselineAgentDefenseBenchMcpServerManifestHash ? item.baselineAgentDefenseBenchMcpServerManifestHash.slice(0, 12) : "missing"} -> ${item.candidateAgentDefenseBenchMcpServerManifestHash ? item.candidateAgentDefenseBenchMcpServerManifestHash.slice(0, 12) : "missing"}`,
        ].join(" / "),
        [
          `${item.baselineAgentDefenseBenchAttackBankHash ? item.baselineAgentDefenseBenchAttackBankHash.slice(0, 12) : "missing"} -> ${item.candidateAgentDefenseBenchAttackBankHash ? item.candidateAgentDefenseBenchAttackBankHash.slice(0, 12) : "missing"}`,
          `${item.baselineAgentDefenseBenchAcademicBenchmarkHash ? item.baselineAgentDefenseBenchAcademicBenchmarkHash.slice(0, 12) : "missing"} -> ${item.candidateAgentDefenseBenchAcademicBenchmarkHash ? item.candidateAgentDefenseBenchAcademicBenchmarkHash.slice(0, 12) : "missing"}`,
          `${item.baselineAgentDefenseBenchSafetyBenchmarkHash ? item.baselineAgentDefenseBenchSafetyBenchmarkHash.slice(0, 12) : "missing"} -> ${item.candidateAgentDefenseBenchSafetyBenchmarkHash ? item.candidateAgentDefenseBenchSafetyBenchmarkHash.slice(0, 12) : "missing"}`,
          `${item.baselineAgentDefenseBenchCybersecurityBenchmarkHash ? item.baselineAgentDefenseBenchCybersecurityBenchmarkHash.slice(0, 12) : "missing"} -> ${item.candidateAgentDefenseBenchCybersecurityBenchmarkHash ? item.candidateAgentDefenseBenchCybersecurityBenchmarkHash.slice(0, 12) : "missing"}`,
        ].join(" / "),
        [
          `${item.baselineAgentDefenseBenchMcpSpecificSuiteHash ? item.baselineAgentDefenseBenchMcpSpecificSuiteHash.slice(0, 12) : "missing"} -> ${item.candidateAgentDefenseBenchMcpSpecificSuiteHash ? item.candidateAgentDefenseBenchMcpSpecificSuiteHash.slice(0, 12) : "missing"}`,
          `${item.baselineAgentDefenseBenchDefenseServerHash ? item.baselineAgentDefenseBenchDefenseServerHash.slice(0, 12) : "missing"} -> ${item.candidateAgentDefenseBenchDefenseServerHash ? item.candidateAgentDefenseBenchDefenseServerHash.slice(0, 12) : "missing"}`,
          `${item.baselineAgentDefenseBenchPolicyHash ? item.baselineAgentDefenseBenchPolicyHash.slice(0, 12) : "missing"} -> ${item.candidateAgentDefenseBenchPolicyHash ? item.candidateAgentDefenseBenchPolicyHash.slice(0, 12) : "missing"}`,
        ].join(" / "),
        [
          `${item.baselineAgentDefenseBenchRunConfigHash ? item.baselineAgentDefenseBenchRunConfigHash.slice(0, 12) : "missing"} -> ${item.candidateAgentDefenseBenchRunConfigHash ? item.candidateAgentDefenseBenchRunConfigHash.slice(0, 12) : "missing"}`,
          `${item.baselineAgentDefenseBenchProviderRouteId ?? "missing"} -> ${item.candidateAgentDefenseBenchProviderRouteId ?? "missing"}`,
          `${item.baselineAgentDefenseBenchCanaryResultHash ? item.baselineAgentDefenseBenchCanaryResultHash.slice(0, 12) : "missing"} -> ${item.candidateAgentDefenseBenchCanaryResultHash ? item.candidateAgentDefenseBenchCanaryResultHash.slice(0, 12) : "missing"}`,
          `${item.baselineAgentDefenseBenchDriftStatisticHash ? item.baselineAgentDefenseBenchDriftStatisticHash.slice(0, 12) : "missing"} -> ${item.candidateAgentDefenseBenchDriftStatisticHash ? item.candidateAgentDefenseBenchDriftStatisticHash.slice(0, 12) : "missing"}`,
        ].join(" / "),
        [
          `${item.baselineAgentDefenseBenchAlertOrWaiverHash ? item.baselineAgentDefenseBenchAlertOrWaiverHash.slice(0, 12) : "missing"} -> ${item.candidateAgentDefenseBenchAlertOrWaiverHash ? item.candidateAgentDefenseBenchAlertOrWaiverHash.slice(0, 12) : "missing"}`,
          `${item.baselineAgentDefenseBenchReplayCommandHash ? item.baselineAgentDefenseBenchReplayCommandHash.slice(0, 12) : "missing"} -> ${item.candidateAgentDefenseBenchReplayCommandHash ? item.candidateAgentDefenseBenchReplayCommandHash.slice(0, 12) : "missing"}`,
          `${item.baselineAgentDefenseBenchCiReceiptHash ? item.baselineAgentDefenseBenchCiReceiptHash.slice(0, 12) : "missing"} -> ${item.candidateAgentDefenseBenchCiReceiptHash ? item.candidateAgentDefenseBenchCiReceiptHash.slice(0, 12) : "missing"}`,
        ].join(" / "),
        `${item.baselineAgentDefenseBenchMcpServerCount}/${item.candidateAgentDefenseBenchMcpServerCount}`,
        `${item.baselineAgentDefenseBenchAttackSuiteIds.join("+") || "missing"} -> ${item.candidateAgentDefenseBenchAttackSuiteIds.join("+") || "missing"}`,
        `${item.baselineAgentDefenseBenchDefenseCoverage0to1.toFixed(3)} -> ${item.candidateAgentDefenseBenchDefenseCoverage0to1.toFixed(3)} (${item.agentDefenseBenchDefenseCoverageDelta0to1.toFixed(3)})`,
        [
          `${item.baselineAgentDefenseBenchPromptInjectionBlockRate0to1.toFixed(3)} -> ${item.candidateAgentDefenseBenchPromptInjectionBlockRate0to1.toFixed(3)} (${item.agentDefenseBenchPromptInjectionBlockRateDelta0to1.toFixed(3)})`,
          `${item.baselineAgentDefenseBenchJailbreakBlockRate0to1.toFixed(3)} -> ${item.candidateAgentDefenseBenchJailbreakBlockRate0to1.toFixed(3)} (${item.agentDefenseBenchJailbreakBlockRateDelta0to1.toFixed(3)})`,
          `${item.baselineAgentDefenseBenchToolPoisoningBlockRate0to1.toFixed(3)} -> ${item.candidateAgentDefenseBenchToolPoisoningBlockRate0to1.toFixed(3)} (${item.agentDefenseBenchToolPoisoningBlockRateDelta0to1.toFixed(3)})`,
          `${item.baselineAgentDefenseBenchBenignPassRate0to1.toFixed(3)} -> ${item.candidateAgentDefenseBenchBenignPassRate0to1.toFixed(3)} (${item.agentDefenseBenchBenignPassRateDelta0to1.toFixed(3)})`,
        ].join(" / "),
        item.agentDefenseBenchMissingReasons.join(", ") || "none",
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    }
    lines.push("");
  }
  const evidraRows = report.comparisons.filter((item) =>
    item.baselineEvidraSourceRefHash ||
    item.candidateEvidraSourceRefHash ||
    item.baselineEvidraMcpTreeHash ||
    item.candidateEvidraMcpTreeHash ||
    item.baselineEvidraPrescribeReportProtocolHash ||
    item.candidateEvidraPrescribeReportProtocolHash ||
    item.evidraMissingReasons.length > 0
  );
  if (evidraRows.length > 0) {
    lines.push("## Evidra Evidence Chain Proof");
    lines.push("");
    lines.push("| Canary | Source / Repository | License / Branch / Release | Workflows / Docker | CLI / MCP / API | Evidence Chain | Protocol / Provider | Samples / Drift | Alert / Replay / CI | No-Copy / Signed Chain | Missing Proof |");
    lines.push("|---|---|---|---|---|---|---|---|---|---|---|");
    for (const item of evidraRows) {
      lines.push([
        item.canaryId,
        [
          `${item.baselineEvidraSourceRefHash ? item.baselineEvidraSourceRefHash.slice(0, 12) : "missing"} -> ${item.candidateEvidraSourceRefHash ? item.candidateEvidraSourceRefHash.slice(0, 12) : "missing"}`,
          `${item.baselineEvidraRepositorySnapshotHash ? item.baselineEvidraRepositorySnapshotHash.slice(0, 12) : "missing"} -> ${item.candidateEvidraRepositorySnapshotHash ? item.candidateEvidraRepositorySnapshotHash.slice(0, 12) : "missing"}`,
        ].join(" / "),
        [
          `${item.baselineEvidraLicenseRefHash ? item.baselineEvidraLicenseRefHash.slice(0, 12) : "missing"} -> ${item.candidateEvidraLicenseRefHash ? item.candidateEvidraLicenseRefHash.slice(0, 12) : "missing"}`,
          `${item.baselineEvidraDefaultBranchHash ? item.baselineEvidraDefaultBranchHash.slice(0, 12) : "missing"} -> ${item.candidateEvidraDefaultBranchHash ? item.candidateEvidraDefaultBranchHash.slice(0, 12) : "missing"}`,
          `${item.baselineEvidraReleaseTag ?? "missing"} -> ${item.candidateEvidraReleaseTag ?? "missing"}`,
        ].join(" / "),
        [
          `${item.baselineEvidraCiWorkflowHash ? item.baselineEvidraCiWorkflowHash.slice(0, 12) : "missing"} -> ${item.candidateEvidraCiWorkflowHash ? item.candidateEvidraCiWorkflowHash.slice(0, 12) : "missing"}`,
          `${item.baselineEvidraReleaseWorkflowHash ? item.baselineEvidraReleaseWorkflowHash.slice(0, 12) : "missing"} -> ${item.candidateEvidraReleaseWorkflowHash ? item.candidateEvidraReleaseWorkflowHash.slice(0, 12) : "missing"}`,
          `${item.baselineEvidraDockerfileHash ? item.baselineEvidraDockerfileHash.slice(0, 12) : "missing"} -> ${item.candidateEvidraDockerfileHash ? item.candidateEvidraDockerfileHash.slice(0, 12) : "missing"}`,
        ].join(" / "),
        [
          `${item.baselineEvidraCliTreeHash ? item.baselineEvidraCliTreeHash.slice(0, 12) : "missing"} -> ${item.candidateEvidraCliTreeHash ? item.candidateEvidraCliTreeHash.slice(0, 12) : "missing"}`,
          `${item.baselineEvidraMcpTreeHash ? item.baselineEvidraMcpTreeHash.slice(0, 12) : "missing"} -> ${item.candidateEvidraMcpTreeHash ? item.candidateEvidraMcpTreeHash.slice(0, 12) : "missing"}`,
          `${item.baselineEvidraApiCommandHash ? item.baselineEvidraApiCommandHash.slice(0, 12) : "missing"} -> ${item.candidateEvidraApiCommandHash ? item.candidateEvidraApiCommandHash.slice(0, 12) : "missing"}`,
        ].join(" / "),
        [
          `${item.baselineEvidraEvidenceSignerHash ? item.baselineEvidraEvidenceSignerHash.slice(0, 12) : "missing"} -> ${item.candidateEvidraEvidenceSignerHash ? item.candidateEvidraEvidenceSignerHash.slice(0, 12) : "missing"}`,
          `${item.baselineEvidraEvidencePackageHash ? item.baselineEvidraEvidencePackageHash.slice(0, 12) : "missing"} -> ${item.candidateEvidraEvidencePackageHash ? item.candidateEvidraEvidencePackageHash.slice(0, 12) : "missing"}`,
          `${item.baselineEvidraEvlockPackageHash ? item.baselineEvidraEvlockPackageHash.slice(0, 12) : "missing"} -> ${item.candidateEvidraEvlockPackageHash ? item.candidateEvidraEvlockPackageHash.slice(0, 12) : "missing"}`,
        ].join(" / "),
        [
          `${item.baselineEvidraPrescribeReportProtocolHash ? item.baselineEvidraPrescribeReportProtocolHash.slice(0, 12) : "missing"} -> ${item.candidateEvidraPrescribeReportProtocolHash ? item.candidateEvidraPrescribeReportProtocolHash.slice(0, 12) : "missing"}`,
          `${item.baselineEvidraProviderRouteId ?? "missing"} -> ${item.candidateEvidraProviderRouteId ?? "missing"}`,
        ].join(" / "),
        [
          `${item.baselineEvidraBaselineSampleManifestHash ? item.baselineEvidraBaselineSampleManifestHash.slice(0, 12) : "missing"} -> ${item.candidateEvidraBaselineSampleManifestHash ? item.candidateEvidraBaselineSampleManifestHash.slice(0, 12) : "missing"}`,
          `${item.baselineEvidraLiveSampleManifestHash ? item.baselineEvidraLiveSampleManifestHash.slice(0, 12) : "missing"} -> ${item.candidateEvidraLiveSampleManifestHash ? item.candidateEvidraLiveSampleManifestHash.slice(0, 12) : "missing"}`,
          `${item.baselineEvidraDriftStatisticHash ? item.baselineEvidraDriftStatisticHash.slice(0, 12) : "missing"} -> ${item.candidateEvidraDriftStatisticHash ? item.candidateEvidraDriftStatisticHash.slice(0, 12) : "missing"}`,
        ].join(" / "),
        [
          `${item.baselineEvidraAlertOrWaiverHash ? item.baselineEvidraAlertOrWaiverHash.slice(0, 12) : "missing"} -> ${item.candidateEvidraAlertOrWaiverHash ? item.candidateEvidraAlertOrWaiverHash.slice(0, 12) : "missing"}`,
          `${item.baselineEvidraReplayCommandHash ? item.baselineEvidraReplayCommandHash.slice(0, 12) : "missing"} -> ${item.candidateEvidraReplayCommandHash ? item.candidateEvidraReplayCommandHash.slice(0, 12) : "missing"}`,
          `${item.baselineEvidraCiReceiptHash ? item.baselineEvidraCiReceiptHash.slice(0, 12) : "missing"} -> ${item.candidateEvidraCiReceiptHash ? item.candidateEvidraCiReceiptHash.slice(0, 12) : "missing"}`,
        ].join(" / "),
        [
          `${item.baselineEvidraNoSourceCopyProofHash ? item.baselineEvidraNoSourceCopyProofHash.slice(0, 12) : "missing"} -> ${item.candidateEvidraNoSourceCopyProofHash ? item.candidateEvidraNoSourceCopyProofHash.slice(0, 12) : "missing"}`,
          `${item.baselineEvidraSignedEvidenceChainHash ? item.baselineEvidraSignedEvidenceChainHash.slice(0, 12) : "missing"} -> ${item.candidateEvidraSignedEvidenceChainHash ? item.candidateEvidraSignedEvidenceChainHash.slice(0, 12) : "missing"}`,
        ].join(" / "),
        item.evidraMissingReasons.join(", ") || "none",
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    }
    lines.push("");
  }
  const galileoRows = report.comparisons.filter((item) =>
    item.baselineGalileoSourceRefHash ||
    item.candidateGalileoSourceRefHash ||
    item.baselineGalileoTraceExportHash ||
    item.candidateGalileoTraceExportHash ||
    item.baselineGalileoMetricIds.length > 0 ||
    item.candidateGalileoMetricIds.length > 0 ||
    item.galileoMissingReasons.length > 0
  );
  if (galileoRows.length > 0) {
    lines.push("## Galileo Observability Proof");
    lines.push("");
    lines.push("| Canary | Source / Website / Docs | Product / Project | Dataset / Prompts | Trace / Metrics / Evaluator | Provider / Canary / Drift | Alert / Signed / No-Copy | Metrics | Missing Proof |");
    lines.push("|---|---|---|---|---|---|---|---|---|");
    for (const item of galileoRows) {
      lines.push([
        item.canaryId,
        [
          `${item.baselineGalileoSourceRefHash ? item.baselineGalileoSourceRefHash.slice(0, 12) : "missing"} -> ${item.candidateGalileoSourceRefHash ? item.candidateGalileoSourceRefHash.slice(0, 12) : "missing"}`,
          `${item.baselineGalileoWebsiteSnapshotHash ? item.baselineGalileoWebsiteSnapshotHash.slice(0, 12) : "missing"} -> ${item.candidateGalileoWebsiteSnapshotHash ? item.candidateGalileoWebsiteSnapshotHash.slice(0, 12) : "missing"}`,
          `${item.baselineGalileoDocsIndexHash ? item.baselineGalileoDocsIndexHash.slice(0, 12) : "missing"} -> ${item.candidateGalileoDocsIndexHash ? item.candidateGalileoDocsIndexHash.slice(0, 12) : "missing"}`,
        ].join(" / "),
        `${item.baselineGalileoProductSurfaceId ?? "missing"}:${item.baselineGalileoProjectId ?? "missing"} -> ${item.candidateGalileoProductSurfaceId ?? "missing"}:${item.candidateGalileoProjectId ?? "missing"}`,
        [
          `${item.baselineGalileoDatasetHash ? item.baselineGalileoDatasetHash.slice(0, 12) : "missing"} -> ${item.candidateGalileoDatasetHash ? item.candidateGalileoDatasetHash.slice(0, 12) : "missing"}`,
          `${item.baselineGalileoPromptSetHash ? item.baselineGalileoPromptSetHash.slice(0, 12) : "missing"} -> ${item.candidateGalileoPromptSetHash ? item.candidateGalileoPromptSetHash.slice(0, 12) : "missing"}`,
        ].join(" / "),
        [
          `${item.baselineGalileoTraceExportHash ? item.baselineGalileoTraceExportHash.slice(0, 12) : "missing"} -> ${item.candidateGalileoTraceExportHash ? item.candidateGalileoTraceExportHash.slice(0, 12) : "missing"}`,
          `${item.baselineGalileoMetricReportHash ? item.baselineGalileoMetricReportHash.slice(0, 12) : "missing"} -> ${item.candidateGalileoMetricReportHash ? item.candidateGalileoMetricReportHash.slice(0, 12) : "missing"}`,
          `${item.baselineGalileoEvaluatorConfigHash ? item.baselineGalileoEvaluatorConfigHash.slice(0, 12) : "missing"} -> ${item.candidateGalileoEvaluatorConfigHash ? item.candidateGalileoEvaluatorConfigHash.slice(0, 12) : "missing"}`,
        ].join(" / "),
        [
          `${item.baselineGalileoProviderRouteId ?? "missing"} -> ${item.candidateGalileoProviderRouteId ?? "missing"}`,
          `${item.baselineGalileoCanaryResultHash ? item.baselineGalileoCanaryResultHash.slice(0, 12) : "missing"} -> ${item.candidateGalileoCanaryResultHash ? item.candidateGalileoCanaryResultHash.slice(0, 12) : "missing"}`,
          `${item.baselineGalileoDriftStatisticHash ? item.baselineGalileoDriftStatisticHash.slice(0, 12) : "missing"} -> ${item.candidateGalileoDriftStatisticHash ? item.candidateGalileoDriftStatisticHash.slice(0, 12) : "missing"}`,
        ].join(" / "),
        [
          `${item.baselineGalileoAlertOrWaiverHash ? item.baselineGalileoAlertOrWaiverHash.slice(0, 12) : "missing"} -> ${item.candidateGalileoAlertOrWaiverHash ? item.candidateGalileoAlertOrWaiverHash.slice(0, 12) : "missing"}`,
          `${item.baselineGalileoSignedEvidenceBundleHash ? item.baselineGalileoSignedEvidenceBundleHash.slice(0, 12) : "missing"} -> ${item.candidateGalileoSignedEvidenceBundleHash ? item.candidateGalileoSignedEvidenceBundleHash.slice(0, 12) : "missing"}`,
          `${item.baselineGalileoNoSourceCopyProofHash ? item.baselineGalileoNoSourceCopyProofHash.slice(0, 12) : "missing"} -> ${item.candidateGalileoNoSourceCopyProofHash ? item.candidateGalileoNoSourceCopyProofHash.slice(0, 12) : "missing"}`,
        ].join(" / "),
        `${item.baselineGalileoMetricIds.join("+") || "missing"} -> ${item.candidateGalileoMetricIds.join("+") || "missing"} (${item.baselineGalileoMetricCount}/${item.candidateGalileoMetricCount})`,
        item.galileoMissingReasons.join(", ") || "none",
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    }
    lines.push("");
  }
  lines.push("## Alerts and Waivers");
  lines.push("");
  if (report.alerts.length === 0) {
    lines.push("No alerts.");
  } else {
    lines.push("| Metric | Severity | Observed | Threshold | Status | Waiver | Evidence |");
    lines.push("|---|---|---:|---:|---|---|---|");
    for (const alert of report.alerts) {
      lines.push([
        alert.metricId,
        alert.severity,
        alert.observed.toFixed(3),
        alert.threshold.toFixed(3),
        alert.waived ? "waived" : "active",
        alert.waiverId ?? "",
        alert.evidenceRefs.join(", ") || "missing",
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    }
  }
  return lines.join("\n");
}
