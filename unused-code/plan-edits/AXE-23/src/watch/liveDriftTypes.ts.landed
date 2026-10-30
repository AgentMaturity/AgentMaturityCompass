/**
 * The shape of live-drift evidence (P5.2b, step 1).
 *
 * Lifted verbatim out of `liveDriftAlerts.ts`, which was 15,980 lines — twenty
 * times the repo's 800-line ceiling. 28% of that file was type declarations,
 * and they sat in one contiguous region with nothing but imports interleaved,
 * so moving them is the one change to a file this size that carries no runtime
 * risk at all: types are erased at compile time and `tsc` proves the move exact.
 *
 * WHAT THIS EXPOSES, which is the point rather than a side effect.
 * `LiveDriftSampleRow` is 937 lines and 936 fields drawn from 74 different
 * domain prefixes — `redTeam*`, `physicianBench*`, `hedraRag*`, `navi*` and
 * seventy more. Every domain AMC has ever monitored added its fields to one
 * shared row. That, not the satellite files, is why the engine grew to 16k
 * lines: `runLiveScoreBehaviorDrift` has to aggregate all 74.
 *
 * The satellites are NOT the sprawl. Measured, their median pairwise similarity
 * after normalising away domain names is 0.08, and 19 of 20 already delegate to
 * this engine — they are thin per-domain adapters over a shared core, not
 * clones to collapse.
 */
export type LiveDriftMetricId =
  | "scoreMean0to1"
  | "passRate0to1"
  | "refusalRate0to1"
  | "errorRate0to1"
  | "latencyMsP95"
  | "costUsdMean"
  | "toolCallMean"
  | "toolUseRewardMean0to1"
  | "toolAnswerVerificationRate0to1"
  | "toolJudgeAgreementRate0to1"
  | "toolCallValidityRate0to1"
  | "toolRolloutDiversityMean0to1"
  | "toolEvalImprovementDelta0to1"
  | "toolRlContextDistribution"
  | "credenceEngineDecisionQualityMean0to1"
  | "credenceEnginePosteriorCalibrationMean0to1"
  | "credenceEngineVoiEfficiencyMean0to1"
  | "credenceEngineExpectedUtilityGainMean0to1"
  | "credenceEngineEvidenceCoverage0to1"
  | "credenceEngineContextDistribution"
  | "tradingWinRate0to1"
  | "tradingRiskRewardRatio"
  | "tradingMaxDrawdown0to1"
  | "tradingRealizedPnlPct"
  | "tradingRiskLimitViolationRate0to1"
  | "tradingClaimValidationFailureRate0to1"
  | "tradingVisionChartAgreementMean0to1"
  | "tradingMemoryRetrievalHitRate0to1"
  | "tradingProviderFallbackRate0to1"
  | "tradingContextDistribution"
  | "behaviorSignature"
  | "lifecycleStageDistribution"
  | "deploymentMaintenanceCoverage"
  | "perturbationDistribution"
  | "arenaContextDistribution"
  | "frameworkExecutionContextDistribution"
  | "agentEvaluationDimensionDistribution"
  | "robustnessStabilityMean0to1"
  | "robustnessStabilityDimension0to1"
  | "interactionTurnMean"
  | "invalidActionRate0to1"
  | "errorAttributionRate0to1"
  | "solutionPathMean"
  | "offPathAttemptMean"
  | "divergenceMomentumMean0to1"
  | "actionFixationRate0to1"
  | "socialHarmPrevalence0to1"
  | "socialSentimentMean"
  | "socialSemanticAlignmentMean0to1"
  | "socialLexicalDiversityMean0to1"
  | "socialContextDistribution"
  | "personaHumanLikenessMean0to1"
  | "personaBehaviorCoverageMean0to1"
  | "personaTaskGoalPreservationMean0to1"
  | "personaDistribution"
  | "privacySensitiveDisclosureRate0to1"
  | "privacyPeerExposureRate0to1"
  | "privacySocialPressureMean0to1"
  | "privacySafeguardActiveRate0to1"
  | "artifactAccuracyMean0to1"
  | "formulaIntegrityMean0to1"
  | "formatQualityMean0to1"
  | "processDefectRate0to1"
  | "controlInterpretabilityMean0to1"
  | "controlInterruptibilityMean0to1"
  | "controlCorrectabilityMean0to1"
  | "controlReversibilityMean0to1"
  | "authorityHandoffRateMean0to1"
  | "redTeamUnsafeResponseRate0to1"
  | "redTeamComplianceMean0to1"
  | "redTeamGuardScoreMean0to1"
  | "redTeamDatasetCoverage0to1"
  | "redTeamTaxonomyCoverage0to1"
  | "redTeamAttackCoverage0to1"
  | "redTeamGuardCoverage0to1"
  | "redTeamRiskCategoryDistribution"
  | "redTeamAttackDistribution"
  | "redTeamSubsetDistribution"
  | "redTeamGuardLabelDistribution"
  | "piArenaAttackSuccessRate0to1"
  | "piArenaDefenseBlockRate0to1"
  | "piArenaFalsePositiveRate0to1"
  | "piArenaAgentTaskSuccessRate0to1"
  | "piArenaToolCallSuccessRateMean0to1"
  | "piArenaEvidenceCoverage0to1"
  | "piArenaAttackDistribution"
  | "piArenaDefenseDistribution"
  | "piArenaDatasetDistribution"
  | "piArenaAgentBenchmarkDistribution"
  | "backdoorAgentAttackSuccessRate0to1"
  | "backdoorAgentCleanAccuracy0to1"
  | "backdoorAgentTriggerPersistenceRate0to1"
  | "backdoorAgentTriggerPropagationRate0to1"
  | "backdoorAgentTrajectoryCoverage0to1"
  | "backdoorAgentEvidenceCoverage0to1"
  | "backdoorAgentStageDistribution"
  | "backdoorAgentTaskFamilyDistribution"
  | "backdoorAgentAttackFamilyDistribution"
  | "agentSecuritySourceOriginCoverage0to1"
  | "agentSecurityTaintPropagationCoverage0to1"
  | "agentSecurityPolicyDecisionAccuracyMean0to1"
  | "agentSecuritySecretScrubRate0to1"
  | "agentSecurityAuditTrailIntegrity0to1"
  | "agentSecurityAttackEffectivenessRate0to1"
  | "agentSecurityFalsePositiveRate0to1"
  | "agentSecurityEvidenceCoverage0to1"
  | "trismAgenticEvidenceCoverage0to1"
  | "narrowTaskBroadMisalignmentEvidenceCoverage0to1"
  | "agentSecurityLatencyP95Ms"
  | "agentSecurityContextDistribution"
  | "agentTestingMethodologyCoverage0to1"
  | "agentTestingScenarioCoverage0to1"
  | "agentTestingFaultInjectionCoverage0to1"
  | "agentTestingResiliencePassRate0to1"
  | "agentTestingSafetyRegressionRate0to1"
  | "agentTestingObservabilitySignalCoverage0to1"
  | "agentTestingEvidenceCoverage0to1"
  | "agentTestingContextDistribution"
  | "recoveryBenchRecoverySuccessRate0to1"
  | "recoveryBenchRecoveryRewardMean0to1"
  | "recoveryBenchReplayIntegrityRate0to1"
  | "recoveryBenchFailureTraceCoverage0to1"
  | "recoveryBenchCorruptedEnvironmentCoverage0to1"
  | "recoveryBenchContextCoverage0to1"
  | "recoveryBenchEvidenceCoverage0to1"
  | "recoveryBenchMessageModeDistribution"
  | "recoveryBenchAgentHarnessDistribution"
  | "recoveryBenchTaskDistribution"
  | "chaosProductionReliabilityMean0to1"
  | "chaosResilienceScoreMean0to1"
  | "chaosDropMean0to1"
  | "chaosRecoveryPassRate0to1"
  | "chaosFailureTraceCoverage0to1"
  | "chaosImprovementEvalCoverage0to1"
  | "chaosEvidenceCoverage0to1"
  | "chaosContextDistribution"
  | "adkEvalPassRate0to1"
  | "adkToolCallSuccessRate0to1"
  | "adkGraphCoverage0to1"
  | "adkStreamingStability0to1"
  | "adkDeploymentReadiness0to1"
  | "adkEvidenceCoverage0to1"
  | "adkRuntimeContextDistribution"
  | "physicianBenchTaskSuccessRate0to1"
  | "physicianBenchCheckpointPassRate0to1"
  | "physicianBenchFhirDataAccessAccuracy0to1"
  | "physicianBenchClinicalActionSafetyRate0to1"
  | "physicianBenchDocumentationQualityMean0to1"
  | "physicianBenchTrajectoryCoverage0to1"
  | "physicianBenchArtifactCoverage0to1"
  | "physicianBenchEvidenceCoverage0to1"
  | "physicianBenchSpecialtyDistribution"
  | "physicianBenchTaskTypeDistribution"
  | "physicianBenchEhrContextDistribution"
  | "ctfFlagSolveRate0to1"
  | "ctfExternalSearchUseRate0to1"
  | "ctfContaminationRiskMean0to1"
  | "ctfCompetitionImpactMean0to1"
  | "ctfIndependenceViolationRate0to1"
  | "ctfFirstFlagForwardingRate0to1"
  | "ctfContextDistribution"
  | "ctfCheckpointCompletionMean0to1"
  | "ctfPartialCreditScoreMean0to1"
  | "ctfTraceCoverageRate0to1"
  | "ctfVmContextDistribution"
  | "ctfIsolationViolationRate0to1"
  | "ctfAgentBenchmarkSolveRate0to1"
  | "ctfAgentBenchmarkFirstFlagForwardingRate0to1"
  | "ctfAgentBenchmarkExternalSearchUseRate0to1"
  | "ctfAgentBenchmarkContaminationRiskMean0to1"
  | "ctfAgentBenchmarkCompetitionImpactMean0to1"
  | "ctfAgentBenchmarkIndependenceViolationRate0to1"
  | "ctfAgentBenchmarkCheckpointCompletionMean0to1"
  | "ctfAgentBenchmarkPartialCreditMean0to1"
  | "ctfAgentBenchmarkTraceCoverage0to1"
  | "ctfAgentBenchmarkSandboxIsolationRate0to1"
  | "ctfAgentBenchmarkEvidenceCoverage0to1"
  | "ctfAgentBenchmarkChallengeCategoryDistribution"
  | "ctfAgentBenchmarkRuntimeModeDistribution"
  | "ctfAgentBenchmarkContextDistribution"
  | "llmFighterWinRate0to1"
  | "llmFighterGameScoreMean0to1"
  | "llmFighterCombatStability0to1"
  | "llmFighterActionValidityRate0to1"
  | "llmFighterTraceCoverage0to1"
  | "llmFighterExportCoverage0to1"
  | "llmFighterEvidenceCoverage0to1"
  | "llmFighterArenaDistribution"
  | "llmFighterModelRosterDistribution"
  | "llmFighterRulesetDistribution"
  | "llmFighterContextDistribution"
  | "llmFighterLatencyP95Ms"
  | "llmFighterTurnCountMean"
  | "llmFighterCostUsdMean"
  | "darwinGodelCandidateScoreMean0to1"
  | "darwinGodelScoreMovementMean0to1"
  | "darwinGodelPassRate0to1"
  | "darwinGodelMutationAcceptanceRate0to1"
  | "darwinGodelRegressionFailureRate0to1"
  | "darwinGodelLineageCoverage0to1"
  | "darwinGodelSandboxCoverage0to1"
  | "darwinGodelEvidenceCoverage0to1"
  | "darwinGodelGenerationDistribution"
  | "darwinGodelProviderRouteDistribution"
  | "darwinGodelModelDistribution"
  | "darwinGodelBenchmarkFamilyDistribution"
  | "darwinGodelSandboxModeDistribution"
  | "darwinGodelContextDistribution"
  | "darwinGodelLatencyP95Ms"
  | "darwinGodelCostUsdMean"
  | "railScoreMean0to1"
  | "railGuardrailPassRate0to1"
  | "railSafeRegenerationRate0to1"
  | "railAgentToolCallAccuracyMean0to1"
  | "railCompliancePassRate0to1"
  | "railTelemetryCoverage0to1"
  | "railPromptInjectionBlockRate0to1"
  | "railEvidenceCoverage0to1"
  | "railEvaluationDimensionDistribution"
  | "railGuardrailModeDistribution"
  | "railComplianceFrameworkDistribution"
  | "railContextDistribution"
  | "railLatencyP95Ms"
  | "railCostUsdMean"
  | "garageGroundingPrecisionMean0to1"
  | "garageGroundingRecallMean0to1"
  | "garageCitationSupportMean0to1"
  | "garageDeflectionAccuracyMean0to1"
  | "garageAnswerFaithfulnessMean0to1"
  | "garageValidationCoverage0to1"
  | "garageEvidenceCoverage0to1"
  | "garageQuestionTypeDistribution"
  | "garageComplexityDistribution"
  | "garageCategoryDistribution"
  | "garageSourceDistribution"
  | "garageContextDistribution"
  | "garageLatencyP95Ms"
  | "garageCostUsdMean"
  | "ragAccuracyMean0to1"
  | "ragCompletenessMean0to1"
  | "ragUtilizationMean0to1"
  | "ragNumericalAccuracyMean0to1"
  | "ragHallucinationRate0to1"
  | "ragRetrievalTopKMean"
  | "ragGeneratedDataFinalCoverage0to1"
  | "ragPassageGroundingCoverage0to1"
  | "ragHumanVerificationCoverage0to1"
  | "ragCitationCoverage0to1"
  | "ragAnswerSupportCoverage0to1"
  | "ragDatasetBuilderEvidenceCoverage0to1"
  | "ragStrategyEvidenceCoverage0to1"
  | "ragGenerationCostUsdMean"
  | "ragQuestionCountMean"
  | "ragSourceDocumentCountMean"
  | "ragEvaluationModeDistribution"
  | "ragPipelineContextDistribution"
  | "ragStrategyDistribution"
  | "ragDatasetTierDistribution"
  | "ragQuestionTypeDistribution"
  | "ragBuilderStageDistribution"
  | "ragDatasetBuilderContextDistribution"
  | "kiteGradeMean0to10"
  | "kiteNormalizedGradeMean0to1"
  | "kiteEvidenceCoverage0to1"
  | "kiteQuestionCountMean"
  | "kiteDocumentCountMean"
  | "kiteDatasetFamilyDistribution"
  | "kiteRagConfigurationDistribution"
  | "kiteBenchmarkContextDistribution"
  | "pokerEvalBbPer100Mean"
  | "pokerEvalAllInAdjBbPer100Mean"
  | "pokerEvalEvBbPer100Mean"
  | "pokerEvalVpipRate0to1"
  | "pokerEvalHandCountMean"
  | "pokerEvalEvidenceCoverage0to1"
  | "pokerEvalGameTypeDistribution"
  | "pokerEvalTableContextDistribution"
  | "pokerEvalOpponentPoolDistribution"
  | "llmRagSemanticSimilarityMean0to1"
  | "llmRagBiasRiskMean0to1"
  | "llmRagHallucinationRate0to1"
  | "llmRagEvalSuiteEvidenceCoverage0to1"
  | "llmRagEvalSuiteContextDistribution"
  | "noMiraclRelevanceAccuracyMean0to1"
  | "noMiraclAbstentionAccuracyMean0to1"
  | "noMiraclHallucinationRate0to1"
  | "noMiraclErrorRate0to1"
  | "noMiraclLanguageCoverage0to1"
  | "noMiraclSubsetCoverage0to1"
  | "noMiraclEvidenceCoverage0to1"
  | "noMiraclLanguageDistribution"
  | "noMiraclSubsetDistribution"
  | "noMiraclContextDistribution"
  | "scalingLawDiscoveryR2Mean"
  | "scalingLawDiscoveryNmseMean"
  | "scalingLawDiscoveryNmaeMean"
  | "scalingLawDiscoveryEvidenceCoverage0to1"
  | "scalingLawDiscoveryTaskTypeDistribution"
  | "scalingLawDiscoveryContextDistribution"
  | "genomicsSelectionAccuracyMean0to1"
  | "genomicsPreprocessingQualityMean0to1"
  | "genomicsStatisticalAnalysisAccuracyMean0to1"
  | "genomicsReferenceCoverage0to1"
  | "genomicsFormatConformanceRate0to1"
  | "genomicsExpertCurationCoverage0to1"
  | "genomicsStageDistribution"
  | "genomicsContextDistribution"
  | "agenticSearchPlanningScoreMean0to1"
  | "agenticSearchQueryDecompositionScoreMean0to1"
  | "agenticSearchRelevanceScoreMean0to1"
  | "agenticSearchSynthesisScoreMean0to1"
  | "agenticSearchCitationCoverage0to1"
  | "agenticSearchTraceCoverage0to1"
  | "agenticSearchDatasetFamilyDistribution"
  | "agenticSearchQueryTypeDistribution"
  | "agenticSearchToolContextDistribution"
  | "documentDatasetQaAccuracyMean0to1"
  | "documentDatasetSummaryQualityMean0to1"
  | "documentDatasetRagFaithfulnessMean0to1"
  | "documentDatasetNumGuardCoverage0to1"
  | "documentDatasetNumericMismatchRate0to1"
  | "documentDatasetEvidenceCoverage0to1"
  | "documentDatasetTokenSavingsRatio"
  | "documentDatasetThroughputDocsPerSec"
  | "documentDatasetMemoryRssMb"
  | "documentDatasetTaskDistribution"
  | "documentDatasetFormatDistribution"
  | "documentDatasetExportTargetDistribution"
  | "documentDatasetPipelineContextDistribution"
  | "cpuAgenticLatencyP50Ms"
  | "cpuAgenticLatencyP95Ms"
  | "cpuAgenticLatencyP99Ms"
  | "cpuAgenticThroughputRequestsPerSec"
  | "cpuAgenticCpuUtilizationMean0to1"
  | "cpuAgenticGpuUtilizationMean0to1"
  | "cpuAgenticMemoryRssMb"
  | "cpuAgenticToolExecutionShareMean0to1"
  | "cpuAgenticLlmInferenceShareMean0to1"
  | "cpuAgenticFrameworkOverheadShareMean0to1"
  | "cpuAgenticEvidenceCoverage0to1"
  | "cpuAgenticWorkloadDistribution"
  | "cpuAgenticRuntimeDistribution"
  | "cpuAgenticScheduleDistribution"
  | "cpuAgenticContextDistribution"
  | "evalTechniqueExactMatchAccuracyMean0to1"
  | "evalTechniqueLlmJudgeAgreementMean0to1"
  | "evalTechniqueStructuredValidationMean0to1"
  | "evalTechniqueDynamicGroundTruthPassRate0to1"
  | "evalTechniqueTrajectoryMatchRate0to1"
  | "evalTechniqueToolPrecisionMean0to1"
  | "evalTechniqueToolImprovementDeltaMean0to1"
  | "evalTechniqueRagFaithfulnessMean0to1"
  | "evalTechniqueRagContextRelevanceMean0to1"
  | "evalTechniqueRealtimeFeedbackMean0to1"
  | "evalTechniquePairwiseWinRate0to1"
  | "evalTechniqueSimulationGoalCompletionMean0to1"
  | "evalTechniqueAlgorithmicFeedbackCoverage0to1"
  | "evalTechniqueEvidenceCoverage0to1"
  | "evalTechniqueDistribution"
  | "evalTechniqueContextDistribution"
  | "sapAgentEvalObjectiveCoverage0to1"
  | "sapAgentEvalProcessCoverage0to1"
  | "sapAgentEvalEnterpriseContextCoverage0to1"
  | "sapAgentEvalEvidenceCoverage0to1"
  | "sapAgentEvalObjectiveDistribution"
  | "sapAgentEvalProcessDistribution"
  | "sapAgentEvalEnterpriseContextDistribution"
  | "agentEvalObservabilityConfigCoverage0to1"
  | "agentEvalObservabilityTelemetryCoverage0to1"
  | "agentEvalObservabilityEvidenceCoverage0to1"
  | "agentEvalObservabilityMetricSetDistribution"
  | "agentEvalObservabilityTelemetryDistribution"
  | "hedraRagLatencyP95Ms"
  | "hedraRagThroughputRequestsPerSec"
  | "hedraRagResourceMemoryGbMean"
  | "hedraRagReplayPassRate0to1"
  | "hedraRagEvidenceCoverage0to1"
  | "hedraRagWorkflowDistribution"
  | "hedraRagBaselineFrameworkDistribution"
  | "hedraRagRuntimeContextDistribution"
  | "agentEvalHarnessToolSuccessRate0to1"
  | "agentEvalHarnessHallucinationRate0to1"
  | "agentEvalHarnessLatencyP95Ms"
  | "agentEvalHarnessCostUsdMean"
  | "agentEvalHarnessTraceCoverage0to1"
  | "agentEvalHarnessEvidenceCoverage0to1"
  | "agentEvalHarnessFrameworkDistribution"
  | "agentEvalHarnessTraceModeDistribution"
  | "agentEvalHarnessMetricContextDistribution"
  | "strandsBenchmarkHarnessTaskSuccessRate0to1"
  | "strandsBenchmarkHarnessPatchApplyRate0to1"
  | "strandsBenchmarkHarnessTestPassRate0to1"
  | "strandsBenchmarkHarnessTrajectoryCoverage0to1"
  | "strandsBenchmarkHarnessEvidenceCoverage0to1"
  | "strandsBenchmarkHarnessLatencyP95Ms"
  | "strandsBenchmarkHarnessCostUsdMean"
  | "strandsBenchmarkHarnessBenchmarkSuiteDistribution"
  | "strandsBenchmarkHarnessRuntimeDistribution"
  | "strandsBenchmarkHarnessTaskFamilyDistribution"
  | "privacyWebDataMinimizationPassRate0to1"
  | "privacyWebLeakageRate0to1"
  | "privacyWebUnnecessaryDisclosureRate0to1"
  | "privacyWebSensitiveFieldExposureMean"
  | "privacyWebTaskSuccessRate0to1"
  | "privacyWebModalLeakageDeltaMean0to1"
  | "privacyWebEvidenceCoverage0to1"
  | "privacyWebEnvironmentDistribution"
  | "privacyWebObservationModeDistribution"
  | "privacyWebContextDistribution"
  | "localSystemThermalBaselineDeviationMean0to1"
  | "localSystemVoltageSpcAnomalyRate0to1"
  | "localSystemProcessIdentityCoverage0to1"
  | "localSystemGhostDriverDetectionCoverage0to1"
  | "localSystemProactiveAlertCoverage0to1"
  | "localSystemLocalOnlyPrivacyCoverage0to1"
  | "localSystemEvidenceCoverage0to1"
  | "localSystemWorkloadContextDistribution"
  | "localSystemHardwareContextDistribution"
  | "observabilityResolutionScoreMean0to1"
  | "observabilityEvidenceCoverage0to1"
  | "observabilityDeterministicCheckPassRate0to1"
  | "observabilityRubricScoreMean0to1"
  | "observabilityTraceCoverage0to1"
  | "observabilityReportCoverage0to1"
  | "observabilityScenarioClockAlignmentRate0to1"
  | "observabilityIncidentContextDistribution"
  | "observabilityTaskTypeDistribution"
  | "observabilityDataSourceDistribution"
  | "observabilityToolModeDistribution"
  | "ollamaMetricsPromptTokensMean"
  | "ollamaMetricsGeneratedTokensMean"
  | "ollamaMetricsRequestDurationP95Seconds"
  | "ollamaMetricsTimePerTokenSeconds"
  | "ollamaMetricsLoadedModelCountMean"
  | "ollamaMetricsModelLoadedRate0to1"
  | "ollamaMetricsModelRamMbMean"
  | "ollamaMetricsRequestErrorRate0to1"
  | "ollamaMetricsEvidenceCoverage0to1"
  | "ollamaMetricsModelDistribution"
  | "ollamaMetricsDeploymentDistribution"
  | "ollamaMetricsProxyContextDistribution"
  | "webOperatorSelfReportSuccessRate0to1"
  | "webOperatorLlmEvaluationSuccessRate0to1"
  | "webOperatorSelfReportOverclaimRate0to1"
  | "webOperatorMismatchRate0to1"
  | "webOperatorTaskReliabilityMean0to1"
  | "webOperatorReplayCoverage0to1"
  | "webOperatorTaskTimeMeanMs"
  | "webOperatorStepLimitViolationRate0to1"
  | "webOperatorContextDistribution"
  | "webOperatorProviderDistribution"
  | "naviBenchTaskSuccessRate0to1"
  | "naviBenchCrashRate0to1"
  | "naviBenchLowerBoundScoreMean0to1"
  | "naviBenchExcludingCrashedScoreMean0to1"
  | "naviBenchTrajectoryCoverage0to1"
  | "naviBenchVisualizationCoverage0to1"
  | "naviBenchEvidenceCoverage0to1"
  | "naviBenchStepCountMean"
  | "naviBenchStepLimitViolationRate0to1"
  | "naviBenchWebsiteDomainDistribution"
  | "naviBenchBrowserModeDistribution"
  | "naviBenchEvalContextDistribution"
  | "awesomeAgentMemoryRetrievalScoreMean0to1"
  | "awesomeAgentMemoryPersistenceScoreMean0to1"
  | "awesomeAgentMemoryForgettingScoreMean0to1"
  | "awesomeAgentMemoryHallucinationRate0to1"
  | "awesomeAgentMemoryEvidenceCoverage0to1"
  | "awesomeAgentMemoryTaxonomyDistribution"
  | "awesomeAgentMemoryEvaluationTaskDistribution"
  | "awesomeAgentMemoryContextDistribution"
  | "agentReadingTestScoreMean0to1"
  | "agentReadingTestCanaryRecallMean0to1"
  | "agentReadingTestTaskCompletionRate0to1"
  | "agentReadingTestEvidenceCoverage0to1"
  | "agentReadingTestFailureModeDistribution"
  | "agentReadingTestContentDeliveryDistribution"
  | "agentReadingTestContextDistribution"
  | "paperReadSkillEvidenceCoverage0to1"
  | "skillMatchEvidenceCoverage0to1"
  | "decibenchEvidenceCoverage0to1"
  | "reflexionAgentEvidenceCoverage0to1"
  | "braintrustEvidenceCoverage0to1"
  | "aiReputationScoreMean0to1"
  | "aiReputationSentimentMean0to1"
  | "aiReputationResponseQualityMean0to1"
  | "aiReputationCrisisReadinessMean0to1"
  | "aiReputationReviewCoverage0to1"
  | "aiReputationHallucinatedCitationRate0to1"
  | "aiReputationPiiLeakRate0to1"
  | "aiReputationPolicyCompliance0to1"
  | "aiReputationEvidenceCoverage0to1"
  | "aiReputationPlatformDistribution"
  | "aiReputationTaskDistribution"
  | "aiReputationContextDistribution"
  | "legalAgentFinalSuccessRate0to1"
  | "legalAgentProcessRateMean0to1"
  | "legalAgentToolUseAccuracyMean0to1"
  | "legalAgentCitationCoverage0to1"
  | "legalAgentEvidenceCoverage0to1"
  | "legalAgentTokenCostMean"
  | "legalAgentCorpusDistribution"
  | "legalAgentTaskTypeDistribution"
  | "legalAgentDifficultyDistribution"
  | "legalAgentToolContextDistribution"
  | "researchGymScoreImprovementMean0to1"
  | "researchGymSubtaskCompletionRate0to1"
  | "researchGymArtifactCoverage0to1"
  | "researchGymInspectionPassRate0to1"
  | "researchGymBudgetOverrunRate0to1"
  | "researchGymViolationRate0to1"
  | "researchGymTaskDomainDistribution"
  | "researchGymRuntimeContextDistribution"
  | "osUniverseTaskSuccessRate0to1"
  | "osUniverseAutoValidationPassRate0to1"
  | "osUniverseValidationErrorRate0to1"
  | "osUniverseEvidenceCoverage0to1"
  | "osUniverseStepCountMean"
  | "osUniverseStepLimitViolationRate0to1"
  | "osUniverseCategoryDistribution"
  | "osUniverseLevelDistribution"
  | "osUniverseRuntimeContextDistribution"
  | "sampleSize"
  | "evidenceRefs"
  | "signedEvidenceRefs";

export type LiveDriftRecommendation = "approve" | "monitor" | "alert";
export type LiveDriftSeverity = "low" | "medium" | "high" | "critical";
export type LiveDriftExecutionMode = "live" | "offline_snapshot" | "sandbox" | "replay" | "simulation" | "unknown";
export type LiveDriftAdkExecutionMode =
  | "cli"
  | "web_ui"
  | "api_server"
  | "live_stream"
  | "cloud_run"
  | "docker"
  | "custom"
  | "unknown";
export type LiveDriftPhysicianBenchTaskType =
  | "ehr_retrieval"
  | "clinical_reasoning"
  | "clinical_action"
  | "documentation"
  | "cross_workflow"
  | "custom"
  | "unknown";
export type LiveDriftRagEvaluationMode = "model" | "rule" | "hybrid" | "close_book" | "custom" | "unknown";
export type LiveDriftRagJudgeType = "model" | "rule" | "hybrid" | "custom" | "unknown";
export type LiveDriftRagPipelineStrategy =
  | "recursive_doc_agent"
  | "metadata_replacement_sentence_window"
  | "custom"
  | "unknown";
export type LiveDriftRagDatasetTier = "easy" | "medium" | "custom" | "unknown";
export type LiveDriftRagQuestionType = "single_source" | "multi_hop" | "wide" | "custom" | "unknown";
export type LiveDriftRagBuilderStage =
  | "preprocess_pdf"
  | "easy_qa"
  | "medium_llm_retriever"
  | "medium_agent_skill"
  | "postprocess_medium"
  | "custom"
  | "unknown";
export type LiveDriftKiteDatasetFamily =
  | "ai_papers"
  | "cloud_10k"
  | "company_handbook"
  | "supreme_court"
  | "custom"
  | "unknown";
export type LiveDriftKiteGradingScale = "zero_to_ten" | "normalized_0_to_1" | "custom" | "unknown";
export type LiveDriftPokerEvalGameType = "nlth_cash" | "nlth_tournament" | "custom" | "unknown";
export type LiveDriftNoMiraclSubset = "relevant" | "non_relevant" | "custom" | "unknown";
export type LiveDriftRedTeamSubset = "standard" | "adversarial" | "dpo" | "custom" | "unknown";
export type LiveDriftRedTeamGuardLabel = "safe" | "unsafe" | "refused" | "unscored" | "custom" | "unknown";
export type LiveDriftPiArenaAttackMode =
  | "none"
  | "direct"
  | "combined"
  | "ignore"
  | "completion"
  | "character"
  | "nanogcg"
  | "tap"
  | "pair"
  | "strategy_search"
  | "rl"
  | "custom"
  | "unknown";
export type LiveDriftPiArenaAgentBenchmark = "injecagent" | "agentdojo" | "agentdyn" | "custom" | "unknown";
export type LiveDriftBackdoorAgentStage = "planning" | "memory" | "tool_use" | "cross_stage" | "custom" | "unknown";
export type LiveDriftBackdoorAgentTaskFamily =
  | "agent_qa"
  | "agent_web"
  | "agent_driver"
  | "agent_code"
  | "agent_medical"
  | "custom"
  | "unknown";
export type LiveDriftBackdoorAgentAttackFamily =
  | "agentpoison"
  | "trojanrag"
  | "demonagent"
  | "badagent"
  | "badchain"
  | "advagent"
  | "poisonedrag"
  | "custom"
  | "unknown";
export type LiveDriftGenomicsTaskStage =
  | "dataset_selection"
  | "data_preprocessing"
  | "statistical_analysis"
  | "cross_stage"
  | "custom"
  | "unknown";
export type LiveDriftAgenticSearchDatasetFamily =
  | "general_qa"
  | "multi_hop_qa"
  | "complex_task"
  | "report_generation"
  | "math_coding"
  | "multimodal"
  | "custom"
  | "unknown";
export type LiveDriftAgenticSearchQueryType =
  | "single_hop"
  | "multi_hop"
  | "complex"
  | "report"
  | "math"
  | "coding"
  | "multimodal"
  | "custom"
  | "unknown";
export type LiveDriftDocumentDatasetSourceFormat =
  | "pdf"
  | "markdown"
  | "plain_text"
  | "html_xml"
  | "json_yaml_toml_ini"
  | "csv_tsv"
  | "tex_bib"
  | "image_ocr"
  | "custom"
  | "unknown";
export type LiveDriftDocumentDatasetTask =
  | "qa"
  | "summary"
  | "rag"
  | "finetune"
  | "indexing"
  | "custom"
  | "unknown";
export type LiveDriftDocumentDatasetExportTarget =
  | "huggingface"
  | "llama_factory"
  | "axolotl"
  | "openai_finetune"
  | "rag_jsonl"
  | "custom"
  | "unknown";
export type LiveDriftCpuAgenticWorkloadFamily =
  | "web_search"
  | "rag"
  | "code_generation"
  | "math_tool_use"
  | "chemistry_research"
  | "throughput_microbenchmark"
  | "energy_measurement"
  | "custom"
  | "unknown";
export type LiveDriftCpuAgenticRuntime =
  | "vllm"
  | "openai_api"
  | "google_search"
  | "wolfram_alpha"
  | "faiss"
  | "rdkit_pubchem"
  | "bash"
  | "custom"
  | "unknown";
export type LiveDriftCpuAgenticScheduleMode =
  | "sequential"
  | "threaded"
  | "multiprocess"
  | "micro_batch"
  | "mixed_agentic"
  | "custom"
  | "unknown";
export type LiveDriftLocalSystemWorkloadContext =
  | "idle"
  | "light"
  | "medium"
  | "heavy"
  | "gaming"
  | "battery"
  | "custom"
  | "unknown";
export type LiveDriftObservabilityTaskType =
  | "metric_query"
  | "log_query"
  | "trace_query"
  | "dashboard_inspection"
  | "alert_triage"
  | "root_cause_analysis"
  | "custom"
  | "unknown";
export type LiveDriftObservabilityDataSource =
  | "grafana"
  | "prometheus"
  | "loki"
  | "tempo"
  | "custom"
  | "unknown";
export type LiveDriftObservabilityToolMode =
  | "mcp_grafana"
  | "gcx_cli"
  | "harbor_builtin"
  | "custom_agent"
  | "custom"
  | "unknown";
export type LiveDriftOllamaMetricsDeploymentMode =
  | "docker"
  | "docker_compose"
  | "local"
  | "kubernetes"
  | "custom"
  | "unknown";
export type LiveDriftWebOperatorBrowserMode = "headless" | "headed" | "remote" | "custom" | "unknown";
export type LiveDriftNaviBenchWebsiteDomain =
  | "apartments"
  | "craigslist"
  | "opentable"
  | "resy"
  | "google_flights"
  | "custom"
  | "unknown";
export type LiveDriftLegalAgentTaskType =
  | "multi_hop_reasoning"
  | "writing"
  | "retrieval"
  | "tool_use"
  | "custom"
  | "unknown";
export type LiveDriftLegalAgentDifficulty = "easy" | "medium" | "hard" | "expert" | "custom" | "unknown";
export type LiveDriftResearchGymTaskDomain =
  | "vision"
  | "vision_language"
  | "reinforcement_learning"
  | "nlp_science"
  | "time_series_xai"
  | "custom"
  | "unknown";
export type LiveDriftResearchGymRuntime = "uv" | "docker" | "custom" | "unknown";
export type LiveDriftOsUniverseCategory =
  | "desktop"
  | "browser"
  | "gym"
  | "terminal"
  | "libreoffice_calc"
  | "libreoffice_writer"
  | "multiapp"
  | "custom"
  | "unknown";
export type LiveDriftOsUniverseLevel = "paper" | "wood" | "bronze" | "silver" | "gold" | "custom" | "unknown";
export type LiveDriftOsUniverseRuntime = "docker" | "surfkit" | "external_runner" | "custom" | "unknown";
export type LiveDriftScalingLawTaskType =
  | "parallel_scaling_law"
  | "vocabulary_scaling_law"
  | "sft_scaling_law"
  | "domain_mixture_scaling_law"
  | "moe_scaling_law"
  | "data_constrained_scaling_law"
  | "lr_batch_size_scaling_law"
  | "u_shaped_scaling_law"
  | "custom"
  | "unknown";
export type LiveDriftEvalTechnique =
  | "exact_match"
  | "llm_as_judge"
  | "structured_data_validation"
  | "dynamic_ground_truth"
  | "trajectory_evaluation"
  | "tool_precision_improvement"
  | "component_wise_rag"
  | "ragas"
  | "realtime_feedback"
  | "pairwise_comparison"
  | "simulation_benchmarking"
  | "algorithmic_feedback"
  | "custom"
  | "unknown";
export type LiveDriftSapAgentEvalObjective =
  | "agent_behavior"
  | "capability"
  | "reliability"
  | "safety"
  | "custom"
  | "unknown";
export type LiveDriftSapAgentEvalProcess =
  | "interaction_mode"
  | "dataset_benchmark"
  | "metric_computation"
  | "tooling"
  | "custom"
  | "unknown";
export type LiveDriftSapAgentEvalEnterpriseContext =
  | "role_based_access"
  | "reliability_guarantee"
  | "dynamic_long_horizon"
  | "compliance"
  | "custom"
  | "unknown";
export type LiveDriftAgentEvalObservabilityMetricSet =
  | "rag_quality"
  | "cost_tokens"
  | "latency"
  | "variant_selection"
  | "custom"
  | "unknown";
export type LiveDriftAgentEvalObservabilityTelemetry =
  | "application_insights"
  | "event_hub"
  | "fabric_eventhouse"
  | "fabric_dashboard"
  | "custom"
  | "unknown";
export type LiveDriftSourceLicenseStatus = "declared" | "absent" | "unknown";
export type LiveDriftHedraRagWorkflow =
  | "single_retrieval"
  | "hyde"
  | "multistep"
  | "recomp"
  | "irg"
  | "graph_rag"
  | "custom"
  | "unknown";
export type LiveDriftHedraRagBaselineFramework =
  | "hedrarag"
  | "heterag"
  | "langchain"
  | "flashrag"
  | "faiss_custom"
  | "custom"
  | "unknown";
export type LiveDriftHedraRagRuntime =
  | "pytorch_docker"
  | "cuda_gpu"
  | "cpu"
  | "native"
  | "custom"
  | "unknown";
export type LiveDriftAgentEvalHarnessFramework =
  | "langchain"
  | "openai_agents"
  | "crewai"
  | "anthropic"
  | "pydantic_ai"
  | "frameworkless"
  | "custom"
  | "unknown";
export type LiveDriftAgentEvalHarnessTraceMode =
  | "decorator"
  | "context_manager"
  | "framework_adapter"
  | "cli_run"
  | "dashboard_run"
  | "custom"
  | "unknown";
export type LiveDriftAgentEvalHarnessMetricContext =
  | "tool_success"
  | "hallucination_schema"
  | "hallucination_semantic"
  | "hallucination_llm_judge"
  | "latency"
  | "cost"
  | "combined"
  | "custom"
  | "unknown";
export type LiveDriftStrandsBenchmarkSuite =
  | "swe_bench_verified"
  | "swe_bench_pro"
  | "terminal_bench_2"
  | "custom"
  | "unknown";
export type LiveDriftStrandsHarnessRuntime =
  | "docker"
  | "harbor"
  | "local"
  | "custom"
  | "unknown";
export type LiveDriftStrandsTaskFamily =
  | "software_engineering"
  | "terminal"
  | "custom"
  | "unknown";
export type LiveDriftPrivacyWebEnvironment = "shopping" | "gitlab" | "reddit" | "custom" | "unknown";
export type LiveDriftPrivacyWebObservationMode = "accessibility_tree" | "image_som" | "custom" | "unknown";
export type AgentEvaluationDimension =
  | "planning_multi_step_reasoning"
  | "function_calling_tool_use"
  | "self_reflection"
  | "memory"
  | "web_agents"
  | "software_engineering"
  | "scientific_agents"
  | "conversational_agents"
  | "generalist_evaluation"
  | "evaluation_frameworks"
  | "gym_like_environments"
  | "current_trends"
  | "emergent_directions"
  | "custom";
export type LiveDriftAgentEvaluationDimension = AgentEvaluationDimension | "unknown";
export type LiveDriftRecoveryBenchMessageMode = "full" | "summary" | "none" | "custom" | "unknown";
export type LiveDriftRecoveryBenchHarness = "terminus_2" | "harbor_installed" | "custom" | "unknown";
export type DataScienceLifecycleStage =
  | "problem_definition"
  | "data_collection_preparation"
  | "data_exploration_analysis"
  | "model_building_evaluation"
  | "deployment_maintenance"
  | "cross_lifecycle"
  | "custom";
export type LiveDriftLifecycleStage = DataScienceLifecycleStage | "unknown";
export type LiveDriftCredenceEngineExperimentMode =
  | "stationary"
  | "drift"
  | "full_comparison"
  | "ablation"
  | "tool_routing"
  | "custom"
  | "unknown";
export type LiveDriftCredenceEngineDecisionPolicy =
  | "bayesian"
  | "langchain"
  | "baseline"
  | "no_voi"
  | "custom"
  | "unknown";

export interface LiveDriftSampleRow {
  traceId: string;
  scenarioId: string;
  timestamp: string;
  score0to1: number;
  behaviorSignature: string;
  lifecycleStage?: DataScienceLifecycleStage;
  taskCategory?: string;
  domain?: string;
  agentEvaluationDimension?: AgentEvaluationDimension;
  perturbationFamily?: string;
  perturbationSeverity0to1?: number;
  robustnessStabilityScores0to1?: Record<string, number>;
  arenaId?: string;
  environmentId?: string;
  referencePoolId?: string;
  executionMode?: LiveDriftExecutionMode;
  agentScaffoldId?: string;
  frameworkConfigHash?: string;
  toolRegistryHash?: string;
  environmentSnapshotId?: string;
  solutionPathCount?: number;
  offPathAttemptCount?: number;
  divergenceMomentum0to1?: number;
  actionFixationRate0to1?: number;
  socialHarmPrevalence0to1?: number;
  socialSentimentMinus1to1?: number;
  socialSemanticAlignment0to1?: number;
  socialLexicalDiversity0to1?: number;
  populationSegmentId?: string;
  discourseContextId?: string;
  personaPolicyId?: string;
  personaDiversityClusterId?: string;
  personaHumanLikeness0to1?: number;
  personaBehaviorCoverage0to1?: number;
  personaTaskGoalPreservation0to1?: number;
  privacySensitiveDisclosureRate0to1?: number;
  privacyPeerExposureRate0to1?: number;
  privacySocialPressureIntensity0to1?: number;
  privacySafeguardActiveRate0to1?: number;
  artifactAccuracy0to1?: number;
  formulaIntegrity0to1?: number;
  formatQuality0to1?: number;
  processDefectRate0to1?: number;
  controlInterpretability0to1?: number;
  controlInterruptibility0to1?: number;
  controlCorrectability0to1?: number;
  controlReversibility0to1?: number;
  authorityHandoffRate0to1?: number;
  redTeamBenchmarkId?: string;
  redTeamDatasetHash?: string;
  redTeamPromptSetHash?: string;
  redTeamPromptId?: string;
  redTeamSubset?: Exclude<LiveDriftRedTeamSubset, "unknown">;
  redTeamRiskCategory?: string;
  redTeamAttackType?: string;
  redTeamPolicyContextId?: string;
  redTeamGuardModelId?: string;
  redTeamGuardLabel?: Exclude<LiveDriftRedTeamGuardLabel, "unknown">;
  redTeamGuardScore0to1?: number;
  redTeamUnsafeResponse?: boolean;
  redTeamComplianceScore0to1?: number;
  redTeamTaxonomyHash?: string;
  redTeamResponseHash?: string;
  piArenaBenchmarkId?: string;
  piArenaDatasetHash?: string;
  piArenaDatasetName?: string;
  piArenaAttackId?: string;
  piArenaAttackMode?: Exclude<LiveDriftPiArenaAttackMode, "unknown">;
  piArenaAttackConfigHash?: string;
  piArenaDefenseId?: string;
  piArenaDefenseConfigHash?: string;
  piArenaInjectedPromptHash?: string;
  piArenaModelConfigHash?: string;
  piArenaEvaluationConfigHash?: string;
  piArenaResultHash?: string;
  piArenaAgentBenchmark?: Exclude<LiveDriftPiArenaAgentBenchmark, "unknown">;
  piArenaAgentSuite?: string;
  piArenaAttackSucceeded?: boolean;
  piArenaDefenseBlocked?: boolean;
  piArenaFalsePositive?: boolean;
  piArenaAgentTaskSuccess?: boolean;
  piArenaToolCallSuccessRate0to1?: number;
  backdoorAgentBenchmarkId?: string;
  backdoorAgentDatasetHash?: string;
  backdoorAgentTaskId?: string;
  backdoorAgentTaskFamily?: Exclude<LiveDriftBackdoorAgentTaskFamily, "unknown">;
  backdoorAgentStage?: Exclude<LiveDriftBackdoorAgentStage, "unknown">;
  backdoorAgentAttackId?: string;
  backdoorAgentAttackFamily?: Exclude<LiveDriftBackdoorAgentAttackFamily, "unknown">;
  backdoorAgentTriggerHash?: string;
  backdoorAgentPoisonConfigHash?: string;
  backdoorAgentModelConfigHash?: string;
  backdoorAgentAgentConfigHash?: string;
  backdoorAgentRunConfigHash?: string;
  backdoorAgentTraceHash?: string;
  backdoorAgentResultHash?: string;
  backdoorAgentAttackSucceeded?: boolean;
  backdoorAgentCleanTaskSucceeded?: boolean;
  backdoorAgentTriggerActivated?: boolean;
  backdoorAgentTriggerPersisted?: boolean;
  backdoorAgentTriggerPropagated?: boolean;
  backdoorAgentTrajectoryCaptured?: boolean;
  agentSecurityGuardId?: string;
  agentSecurityPolicyHash?: string;
  agentSecurityTaintTraceHash?: string;
  agentSecurityProxyTraceHash?: string;
  agentSecurityAuditTrailHash?: string;
  agentSecurityRuntimeTelemetryHash?: string;
  agentSecurityEvalPackHash?: string;
  agentSecurityClassifierHash?: string;
  agentSecuritySourceOriginCoverage0to1?: number;
  agentSecurityTaintPropagationCoverage0to1?: number;
  agentSecurityPolicyDecisionAccuracy0to1?: number;
  agentSecuritySecretScrubRate0to1?: number;
  agentSecurityAuditTrailIntegrity0to1?: number;
  agentSecurityAttackEffectiveness0to1?: number;
  agentSecurityFalsePositiveRate0to1?: number;
  agentSecurityLatencyP95Ms?: number;
  agentTestingTaxonomyId?: string;
  agentTestingMethodologyHash?: string;
  agentTestingScenarioCatalogHash?: string;
  agentTestingFaultInjectionPlanHash?: string;
  agentTestingObservabilityPlanHash?: string;
  agentTestingSafetyPlanHash?: string;
  agentTestingStandardsMapHash?: string;
  agentTestingCategory?: string;
  agentTestingApproach?: string;
  agentTestingFaultModel?: string;
  agentTestingBenchmarkFamily?: string;
  agentTestingMethodologyCoverage0to1?: number;
  agentTestingScenarioCoverage0to1?: number;
  agentTestingFaultInjectionCoverage0to1?: number;
  agentTestingResiliencePassRate0to1?: number;
  agentTestingSafetyRegressionRate0to1?: number;
  agentTestingObservabilitySignalCoverage0to1?: number;
  chaosBenchmarkId?: string;
  chaosScenarioId?: string;
  chaosProfileId?: string;
  chaosInjectionPlanHash?: string;
  chaosMutationManifestHash?: string;
  chaosEndpointContractHash?: string;
  chaosJudgeConfigHash?: string;
  chaosTraceBundleHash?: string;
  chaosScoreLedgerHash?: string;
  chaosAgentCardHash?: string;
  chaosImprovementEvalHash?: string;
  chaosFrameworkId?: string;
  chaosModality?: string;
  chaosBenchmarkFamily?: string;
  chaosProductionReliability0to1?: number;
  chaosResilienceScore0to1?: number;
  chaosDrop0to1?: number;
  chaosRecoveryPassRate0to1?: number;
  chaosFailureTraceCoverage0to1?: number;
  recoveryBenchBenchmarkId?: string;
  recoveryBenchSourceRefHash?: string;
  recoveryBenchRepositorySnapshotHash?: string;
  recoveryBenchLicenseRefHash?: string;
  recoveryBenchTerminalBenchVersion?: string;
  recoveryBenchInitialTraceSetHash?: string;
  recoveryBenchTaskId?: string;
  recoveryBenchFailedTrajectoryHash?: string;
  recoveryBenchReplayCommandLogHash?: string;
  recoveryBenchReplayEnvironmentHash?: string;
  recoveryBenchCorruptedEnvironmentHash?: string;
  recoveryBenchRecoveryAgentId?: string;
  recoveryBenchRecoveryAgentConfigHash?: string;
  recoveryBenchRecoveryModelId?: string;
  recoveryBenchRecoveryRunConfigHash?: string;
  recoveryBenchMessageMode?: Exclude<LiveDriftRecoveryBenchMessageMode, "unknown">;
  recoveryBenchAgentHarness?: Exclude<LiveDriftRecoveryBenchHarness, "unknown">;
  recoveryBenchRecoveryTranscriptHash?: string;
  recoveryBenchRecoveryResultHash?: string;
  recoveryBenchScoreReportHash?: string;
  recoveryBenchInitialReward0to1?: number;
  recoveryBenchRecoveryReward0to1?: number;
  recoveryBenchInitialFailed?: boolean;
  recoveryBenchReplaySucceeded?: boolean;
  recoveryBenchRecoverySucceeded?: boolean;
  recoveryBenchContextProvided?: boolean;
  adkRuntimeId?: string;
  adkFrameworkVersion?: string;
  adkAgentGraphHash?: string;
  adkToolRegistryHash?: string;
  adkEvalDatasetHash?: string;
  adkEvalCaseHash?: string;
  adkRunnerConfigHash?: string;
  adkSessionStateHash?: string;
  adkLiveRequestQueueHash?: string;
  adkApiServerRouteHash?: string;
  adkDeploymentManifestHash?: string;
  adkModelRoute?: string;
  adkExecutionMode?: LiveDriftAdkExecutionMode;
  adkDeploymentTarget?: string;
  adkEvalPassRate0to1?: number;
  adkToolCallSuccessRate0to1?: number;
  adkGraphCoverage0to1?: number;
  adkStreamingStability0to1?: number;
  adkDeploymentReadiness0to1?: number;
  physicianBenchBenchmarkId?: string;
  physicianBenchTaskSetVersion?: string;
  physicianBenchPaperRefHash?: string;
  physicianBenchTaskId?: string;
  physicianBenchSpecialty?: string;
  physicianBenchTaskType?: Exclude<LiveDriftPhysicianBenchTaskType, "unknown">;
  physicianBenchFhirServerImageHash?: string;
  physicianBenchFhirApiSchemaHash?: string;
  physicianBenchPatientRecordManifestHash?: string;
  physicianBenchPatientCohortHash?: string;
  physicianBenchVerifierCheckpointHash?: string;
  physicianBenchTrajectoryHash?: string;
  physicianBenchWorkspaceArtifactHash?: string;
  physicianBenchEvalLogHash?: string;
  physicianBenchMetadataHash?: string;
  physicianBenchModelConfigHash?: string;
  physicianBenchToolManifestHash?: string;
  physicianBenchRunConfigHash?: string;
  physicianBenchTaskSuccess?: boolean;
  physicianBenchCheckpointPassRate0to1?: number;
  physicianBenchFhirDataAccessAccuracy0to1?: number;
  physicianBenchClinicalActionSafety0to1?: number;
  physicianBenchDocumentationQuality0to1?: number;
  physicianBenchTrajectoryCaptured?: boolean;
  physicianBenchArtifactBundleComplete?: boolean;
  ctfEventId?: string;
  ctfChallengeId?: string;
  ctfChallengeCategory?: string;
  ctfAgentInstanceId?: string;
  ctfTeamAccountId?: string;
  ctfFlagAccepted?: boolean;
  ctfFirstCorrectFlagForwarded?: boolean;
  ctfExternalSearchUsed?: boolean;
  ctfIndependenceViolated?: boolean;
  ctfContaminationRisk0to1?: number;
  ctfCompetitionImpact0to1?: number;
  ctfSubmissionCount?: number;
  ctfTimeToFlagMs?: number;
  ctfVmImageHash?: string;
  ctfSandboxProfileHash?: string;
  ctfCheckpointRubricHash?: string;
  ctfExecutionTraceHash?: string;
  ctfCheckpointJudgeRef?: string;
  ctfIsolationBoundaryId?: string;
  ctfCheckpointCompletion0to1?: number;
  ctfPartialCreditScore0to1?: number;
  ctfIsolationViolated?: boolean;
  ragEvaluationMode?: LiveDriftRagEvaluationMode;
  ragPipelineStrategy?: Exclude<LiveDriftRagPipelineStrategy, "unknown">;
  ragStrategyComparisonId?: string;
  ragStrategyRunId?: string;
  ragStrategyManifestHash?: string;
  ragIndexManifestHash?: string;
  ragQuerySetHash?: string;
  ragReferenceAnswerHash?: string;
  ragEvaluatorConfigHash?: string;
  ragModelConfigHash?: string;
  ragStrategyResultHash?: string;
  ragCorpusId?: string;
  ragCorpusHash?: string;
  ragChunkSize?: number;
  ragChunkOverlap?: number;
  ragNodeName?: string;
  ragRetrieverId?: string;
  ragGeneratorId?: string;
  ragFrameworkId?: string;
  ragRetrievalTopK?: number;
  ragGeneratedDataSuffix?: string;
  ragGeneratedDataFinalized?: boolean;
  ragJudgeType?: LiveDriftRagJudgeType;
  ragHallucinationEvaluatorEnabled?: boolean;
  ragAccuracy0to1?: number;
  ragCompleteness0to1?: number;
  ragUtilization0to1?: number;
  ragNumericalAccuracy0to1?: number;
  ragHallucinationRate0to1?: number;
  ragDatasetBuilderId?: string;
  ragDatasetVersion?: string;
  ragSourceDocumentManifestHash?: string;
  ragSourceDocumentLicenseId?: string;
  ragQaPairManifestHash?: string;
  ragPassageManifestHash?: string;
  ragBuilderConfigHash?: string;
  ragPdfParseTraceHash?: string;
  ragPostprocessManifestHash?: string;
  ragDatasetTier?: Exclude<LiveDriftRagDatasetTier, "unknown">;
  ragQuestionType?: Exclude<LiveDriftRagQuestionType, "unknown">;
  ragBuilderStage?: Exclude<LiveDriftRagBuilderStage, "unknown">;
  ragQuestionCount?: number;
  ragSourceDocumentCount?: number;
  ragPassageGroundingCoverage0to1?: number;
  ragHumanVerificationCoverage0to1?: number;
  ragCitationCoverage0to1?: number;
  ragAnswerSupportCoverage0to1?: number;
  ragGenerationCostUsd?: number;
  ragBatchSize?: number;
  ragDocConcurrency?: number;
  ragIncrementalOnlyMissing?: boolean;
  kiteBenchmarkId?: string;
  kiteSourceRefHash?: string;
  kiteRepositorySnapshotHash?: string;
  kiteLicenseRefHash?: string;
  kiteCorpusManifestHash?: string;
  kiteDocumentSetId?: string;
  kiteQuerySetHash?: string;
  kiteGroundTruthAnswerHash?: string;
  kiteRubricHash?: string;
  kiteRagPipelineConfigHash?: string;
  kiteResponseManifestHash?: string;
  kiteResultManifestHash?: string;
  kiteJudgeConfigHash?: string;
  kiteDatasetFamily?: Exclude<LiveDriftKiteDatasetFamily, "unknown">;
  kiteRagConfigurationId?: string;
  kiteGradingScale?: Exclude<LiveDriftKiteGradingScale, "unknown">;
  kiteQuestionCount?: number;
  kiteDocumentCount?: number;
  kiteGrade0to10?: number;
  kiteNormalizedGrade0to1?: number;
  kiteSmallSampleWarning?: boolean;
  kiteEvidenceCoverage0to1?: number;
  pokerEvalBenchmarkId?: string;
  pokerEvalSourceRefHash?: string;
  pokerEvalRepositorySnapshotHash?: string;
  pokerEvalPackageRefHash?: string;
  pokerEvalCitationRefHash?: string;
  pokerEvalSimulationConfigHash?: string;
  pokerEvalAgentConfigHash?: string;
  pokerEvalOpponentPoolHash?: string;
  pokerEvalRunManifestHash?: string;
  pokerEvalHandHistoryManifestHash?: string;
  pokerEvalMetricReportHash?: string;
  pokerEvalGameType?: Exclude<LiveDriftPokerEvalGameType, "unknown">;
  pokerEvalTableSize?: number;
  pokerEvalBlindStructureHash?: string;
  pokerEvalHandCount?: number;
  pokerEvalBbPer100?: number;
  pokerEvalAllInAdjBbPer100?: number;
  pokerEvalEvBbPer100?: number;
  pokerEvalVpipRate0to1?: number;
  pokerEvalEvidenceCoverage0to1?: number;
  llmRagEvalSuiteId?: string;
  llmRagEvalRunId?: string;
  llmRagCandidateManifestHash?: string;
  llmRagReferenceManifestHash?: string;
  llmRagMetricSuiteHash?: string;
  llmRagSemanticMetricId?: string;
  llmRagBiasMetricId?: string;
  llmRagHallucinationMetricId?: string;
  llmRagJudgeConfigHash?: string;
  llmRagReportHash?: string;
  llmRagSemanticSimilarity0to1?: number;
  llmRagBiasRisk0to1?: number;
  llmRagHallucinationRate0to1?: number;
  noMiraclBenchmarkId?: string;
  noMiraclSourceRefHash?: string;
  noMiraclRepositorySnapshotHash?: string;
  noMiraclLicenseRefHash?: string;
  noMiraclDatasetManifestHash?: string;
  noMiraclLanguageManifestHash?: string;
  noMiraclQrelsManifestHash?: string;
  noMiraclPassagePoolHash?: string;
  noMiraclRetrievalRunHash?: string;
  noMiraclModelRouteHash?: string;
  noMiraclGenerationTraceHash?: string;
  noMiraclEvaluationReportHash?: string;
  noMiraclBaselineResultHash?: string;
  noMiraclLiveResultHash?: string;
  noMiraclAlertPolicyHash?: string;
  noMiraclLanguage?: string;
  noMiraclSubset?: Exclude<LiveDriftNoMiraclSubset, "unknown">;
  noMiraclQueryIdHash?: string;
  noMiraclPassageSetHash?: string;
  noMiraclRelevantJudgmentHash?: string;
  noMiraclNonRelevantJudgmentHash?: string;
  noMiraclRelevanceDecisionCorrect?: boolean;
  noMiraclAbstainedWhenUnanswerable?: boolean;
  noMiraclHallucinated?: boolean;
  noMiraclErrored?: boolean;
  noMiraclRelevanceAccuracy0to1?: number;
  noMiraclAbstentionAccuracy0to1?: number;
  noMiraclHallucinationRate0to1?: number;
  noMiraclErrorRate0to1?: number;
  scalingLawBenchmarkId?: string;
  scalingLawPaperRefHash?: string;
  scalingLawEvalRunId?: string;
  scalingLawTaskId?: string;
  scalingLawTaskType?: Exclude<LiveDriftScalingLawTaskType, "unknown">;
  scalingLawDatasetManifestHash?: string;
  scalingLawTrainSplitHash?: string;
  scalingLawTestSplitHash?: string;
  scalingLawSourceExperimentManifestHash?: string;
  scalingLawTaskConfigHash?: string;
  scalingLawEvolutionConfigHash?: string;
  scalingLawEvaluatorConfigHash?: string;
  scalingLawModelRouteHash?: string;
  scalingLawProgramArtifactHash?: string;
  scalingLawCheckpointTraceHash?: string;
  scalingLawResultReportHash?: string;
  scalingLawFormulaFamily?: string;
  scalingLawExtrapolationRegime?: string;
  scalingLawR2?: number;
  scalingLawNmse?: number;
  scalingLawNmae?: number;
  agenticSearchBenchmarkId?: string;
  agenticSearchDatasetFamily?: Exclude<LiveDriftAgenticSearchDatasetFamily, "unknown">;
  agenticSearchQueryType?: Exclude<LiveDriftAgenticSearchQueryType, "unknown">;
  agenticSearchQueryId?: string;
  agenticSearchTaskId?: string;
  agenticSearchSourceManifestHash?: string;
  agenticSearchToolConfigHash?: string;
  agenticSearchPlannerTraceHash?: string;
  agenticSearchSearchTraceHash?: string;
  agenticSearchCitationTraceHash?: string;
  agenticSearchSynthesisTraceHash?: string;
  agenticSearchResultManifestHash?: string;
  agenticSearchPlanningScore0to1?: number;
  agenticSearchQueryDecompositionScore0to1?: number;
  agenticSearchRelevanceScore0to1?: number;
  agenticSearchSynthesisScore0to1?: number;
  agenticSearchCitationCoverage0to1?: number;
  documentDatasetPipelineId?: string;
  documentDatasetSourceFormat?: Exclude<LiveDriftDocumentDatasetSourceFormat, "unknown">;
  documentDatasetTask?: Exclude<LiveDriftDocumentDatasetTask, "unknown">;
  documentDatasetExportTarget?: Exclude<LiveDriftDocumentDatasetExportTarget, "unknown">;
  documentDatasetCorpusHash?: string;
  documentDatasetIndexManifestHash?: string;
  documentDatasetDocumentRecordHash?: string;
  documentDatasetPageRecordHash?: string;
  documentDatasetCellRecordHash?: string;
  documentDatasetSampleManifestHash?: string;
  documentDatasetExportManifestHash?: string;
  documentDatasetBenchMetricHash?: string;
  documentDatasetReportArtifactHash?: string;
  documentDatasetNumGuardCoverage0to1?: number;
  documentDatasetNumericMismatchRate0to1?: number;
  documentDatasetQaAccuracy0to1?: number;
  documentDatasetSummaryQuality0to1?: number;
  documentDatasetRagFaithfulness0to1?: number;
  documentDatasetTokenSavingsRatio?: number;
  documentDatasetThroughputDocsPerSec?: number;
  documentDatasetMemoryRssMb?: number;
  cpuAgenticBenchmarkId?: string;
  cpuAgenticPaperRefHash?: string;
  cpuAgenticWorkloadFamily?: Exclude<LiveDriftCpuAgenticWorkloadFamily, "unknown">;
  cpuAgenticFrameworkId?: string;
  cpuAgenticRuntime?: Exclude<LiveDriftCpuAgenticRuntime, "unknown">;
  cpuAgenticScheduleMode?: Exclude<LiveDriftCpuAgenticScheduleMode, "unknown">;
  cpuAgenticEnvironmentHash?: string;
  cpuAgenticCondaEnvHash?: string;
  cpuAgenticHardwareProfileHash?: string;
  cpuAgenticSystemRequirementsHash?: string;
  cpuAgenticModelServerConfigHash?: string;
  cpuAgenticApiKeyBoundaryHash?: string;
  cpuAgenticWorkloadConfigHash?: string;
  cpuAgenticDatasetManifestHash?: string;
  cpuAgenticToolManifestHash?: string;
  cpuAgenticRunScriptHash?: string;
  cpuAgenticResultManifestHash?: string;
  cpuAgenticFigureArtifactHash?: string;
  cpuAgenticBatchSize?: number;
  cpuAgenticWorkerCount?: number;
  cpuAgenticRequestRate?: number;
  cpuAgenticLatencyP50Ms?: number;
  cpuAgenticLatencyP95Ms?: number;
  cpuAgenticLatencyP99Ms?: number;
  cpuAgenticThroughputRequestsPerSec?: number;
  cpuAgenticCpuUtilization0to1?: number;
  cpuAgenticGpuUtilization0to1?: number;
  cpuAgenticMemoryRssMb?: number;
  cpuAgenticToolExecutionShare0to1?: number;
  cpuAgenticLlmInferenceShare0to1?: number;
  cpuAgenticFrameworkOverheadShare0to1?: number;
  localSystemMonitorProfileId?: string;
  localSystemDeviceProfileHash?: string;
  localSystemHardwareScannerHash?: string;
  localSystemProcessCatalogHash?: string;
  localSystemSensorLogHash?: string;
  localSystemAlertReceiptHash?: string;
  localSystemWorkloadContext?: Exclude<LiveDriftLocalSystemWorkloadContext, "unknown">;
  localSystemThermalBaselineDeviation0to1?: number;
  localSystemVoltageSpcAnomaly?: boolean;
  localSystemVoltageRailId?: string;
  localSystemProcessIdentityMatched?: boolean;
  localSystemGhostDriverDetected?: boolean;
  localSystemGhostDriverHandled?: boolean;
  localSystemProactiveAlertDelivered?: boolean;
  localSystemOfflineMode?: boolean;
  localSystemCloudDisabled?: boolean;
  localSystemApiKeyAbsent?: boolean;
  localSystemLocalDataOnly?: boolean;
  observabilityBenchmarkId?: string;
  observabilityTaskSpecHash?: string;
  observabilityGeneratedTaskHash?: string;
  observabilityEnvironmentConfigHash?: string;
  observabilityDockerConfigHash?: string;
  observabilityScenarioClockHash?: string;
  observabilityScenarioClockAligned?: boolean;
  observabilityAgentTrajectoryHash?: string;
  observabilityCommandStdoutHash?: string;
  observabilityGradingDetailsHash?: string;
  observabilityRewardHash?: string;
  observabilityResultJsonHash?: string;
  observabilityHtmlReportHash?: string;
  observabilityIncidentContextId?: string;
  observabilityTaskType?: Exclude<LiveDriftObservabilityTaskType, "unknown">;
  observabilityDataSource?: Exclude<LiveDriftObservabilityDataSource, "unknown">;
  observabilityToolMode?: Exclude<LiveDriftObservabilityToolMode, "unknown">;
  observabilityDeterministicCheckPassRate0to1?: number;
  observabilityRubricScore0to1?: number;
  observabilityResolutionScore0to1?: number;
  observabilityEvidenceCoverage0to1?: number;
  ollamaMetricsSidecarId?: string;
  ollamaMetricsSourceRefHash?: string;
  ollamaMetricsRepositorySnapshotHash?: string;
  ollamaMetricsLicenseRefHash?: string;
  ollamaMetricsProxyConfigHash?: string;
  ollamaMetricsOllamaHostConfigHash?: string;
  ollamaMetricsPrometheusScrapeConfigHash?: string;
  ollamaMetricsGrafanaDashboardHash?: string;
  ollamaMetricsEndpointSnapshotHash?: string;
  ollamaMetricsBaselineSnapshotHash?: string;
  ollamaMetricsLiveSnapshotHash?: string;
  ollamaMetricsAlertPolicyHash?: string;
  ollamaMetricsModelId?: string;
  ollamaMetricsDeploymentMode?: Exclude<LiveDriftOllamaMetricsDeploymentMode, "unknown">;
  ollamaMetricsPromptTokensTotal?: number;
  ollamaMetricsGeneratedTokensTotal?: number;
  ollamaMetricsRequestDurationP95Seconds?: number;
  ollamaMetricsTimePerTokenSeconds?: number;
  ollamaMetricsLoadedModelCount?: number;
  ollamaMetricsModelLoaded?: boolean;
  ollamaMetricsModelRamMb?: number;
  ollamaMetricsRequestErrorRate0to1?: number;
  webOperatorBenchmarkId?: string;
  webOperatorDatasetId?: string;
  webOperatorTaskId?: string;
  webOperatorProviderId?: string;
  webOperatorAgentVersion?: string;
  webOperatorBrowserMode?: Exclude<LiveDriftWebOperatorBrowserMode, "unknown">;
  webOperatorJudgeModelId?: string;
  webOperatorRunConfigHash?: string;
  webOperatorReplayArtifactHash?: string;
  webOperatorResultJsonHash?: string;
  webOperatorScreenshotHash?: string;
  webOperatorTrajectoryHash?: string;
  webOperatorSelfReportedSuccess?: boolean;
  webOperatorLlmEvaluatedSuccess?: boolean;
  webOperatorTaskReliability0to1?: number;
  webOperatorAttemptCount?: number;
  webOperatorSuccessfulAttemptCount?: number;
  webOperatorStepCount?: number;
  webOperatorMaxSteps?: number;
  webOperatorTimePerTaskMs?: number;
  naviBenchBenchmarkId?: string;
  naviBenchSourceRefHash?: string;
  naviBenchRepositorySnapshotHash?: string;
  naviBenchLicenseRefHash?: string;
  naviBenchDatasetRefHash?: string;
  naviBenchBlogRefHash?: string;
  naviBenchTaskId?: string;
  naviBenchWebsiteDomain?: Exclude<LiveDriftNaviBenchWebsiteDomain, "unknown">;
  naviBenchTaskConfigHash?: string;
  naviBenchEvaluatorConfigHash?: string;
  naviBenchAgentConfigHash?: string;
  naviBenchBrowserMode?: Exclude<LiveDriftWebOperatorBrowserMode, "unknown">;
  naviBenchBrowserProviderHash?: string;
  naviBenchBaselineResultHash?: string;
  naviBenchLiveResultHash?: string;
  naviBenchTrajectoryHash?: string;
  naviBenchVisualizationArtifactHash?: string;
  naviBenchScreenshotTraceHash?: string;
  naviBenchAlertReceiptHash?: string;
  naviBenchTaskFinished?: boolean;
  naviBenchTaskCrashed?: boolean;
  naviBenchTaskSuccess?: boolean;
  naviBenchLowerBoundScore0to1?: number;
  naviBenchExcludingCrashedScore0to1?: number;
  naviBenchUpperBoundScore0to1?: number;
  naviBenchStepCount?: number;
  naviBenchMaxSteps?: number;
  naviBenchEvidenceCoverage0to1?: number;
  legalAgentBenchmarkId?: string;
  legalAgentDatasetHash?: string;
  legalAgentCorpusId?: string;
  legalAgentTaskId?: string;
  legalAgentTaskType?: Exclude<LiveDriftLegalAgentTaskType, "unknown">;
  legalAgentDifficulty?: Exclude<LiveDriftLegalAgentDifficulty, "unknown">;
  legalAgentPlanningTreeHash?: string;
  legalAgentToolManifestHash?: string;
  legalAgentToolRunTraceHash?: string;
  legalAgentIntermediateStepAnnotationHash?: string;
  legalAgentProcessTraceHash?: string;
  legalAgentOutputHash?: string;
  legalAgentReferenceAnswerHash?: string;
  legalAgentEvaluationReportHash?: string;
  legalAgentTokenRecordHash?: string;
  legalAgentFinalSuccess?: boolean;
  legalAgentProcessRate0to1?: number;
  legalAgentToolUseAccuracy0to1?: number;
  legalAgentCitationCoverage0to1?: number;
  legalAgentTokenCost?: number;
  researchGymBenchmarkId?: string;
  researchGymPaperRefHash?: string;
  researchGymTaskId?: string;
  researchGymTaskDomain?: Exclude<LiveDriftResearchGymTaskDomain, "unknown">;
  researchGymTaskManifestHash?: string;
  researchGymPrunedRepoHash?: string;
  researchGymDatasetManifestHash?: string;
  researchGymEvaluationHarnessHash?: string;
  researchGymBaselineScoreManifestHash?: string;
  researchGymGradingScriptHash?: string;
  researchGymWithheldSolutionPolicyHash?: string;
  researchGymRunConfigHash?: string;
  researchGymRuntime?: Exclude<LiveDriftResearchGymRuntime, "unknown">;
  researchGymRuntimeImageHash?: string;
  researchGymAgentAdapterHash?: string;
  researchGymWorkspaceSnapshotHash?: string;
  researchGymTranscriptHash?: string;
  researchGymCostSummaryHash?: string;
  researchGymStatusHash?: string;
  researchGymPlanHash?: string;
  researchGymInspectionReportHash?: string;
  researchGymViolationReportHash?: string;
  researchGymBaselineScore0to1?: number;
  researchGymCandidateScore0to1?: number;
  researchGymScoreImprovement0to1?: number;
  researchGymSubtaskCount?: number;
  researchGymCompletedSubtaskCount?: number;
  researchGymExperimentCount?: number;
  researchGymAsyncJobCount?: number;
  researchGymBudgetHours?: number;
  researchGymApiBudgetUsd?: number;
  researchGymActualRuntimeHours?: number;
  researchGymActualCostUsd?: number;
  researchGymInspectionPassed?: boolean;
  researchGymBudgetExceeded?: boolean;
  researchGymViolationDetected?: boolean;
  researchGymArtifactCoverage0to1?: number;
  osUniverseBenchmarkId?: string;
  osUniverseSourceRefHash?: string;
  osUniverseRepositorySnapshotHash?: string;
  osUniverseLicenseRefHash?: string;
  osUniversePaperRefHash?: string;
  osUniverseTestcaseId?: string;
  osUniverseTaskCategory?: Exclude<LiveDriftOsUniverseCategory, "unknown">;
  osUniverseComplexityLevel?: Exclude<LiveDriftOsUniverseLevel, "unknown">;
  osUniverseTestcaseManifestHash?: string;
  osUniverseAgentConfigHash?: string;
  osUniverseRunnerConfigHash?: string;
  osUniverseRuntime?: Exclude<LiveDriftOsUniverseRuntime, "unknown">;
  osUniverseRuntimeImageHash?: string;
  osUniverseDependencyLockHash?: string;
  osUniverseValidatorConfigHash?: string;
  osUniverseValidationReportHash?: string;
  osUniverseResultArtifactHash?: string;
  osUniverseViewerArtifactHash?: string;
  osUniverseTrajectoryHash?: string;
  osUniverseScreenshotTraceHash?: string;
  osUniverseTaskSuccess?: boolean;
  osUniverseAutoValidationPassed?: boolean;
  osUniverseValidationErrorRate0to1?: number;
  osUniverseStepCount?: number;
  osUniverseMaxSteps?: number;
  osUniverseEvidenceCoverage0to1?: number;
  evalTechniqueSuiteId?: string;
  evalTechniqueTechnique?: Exclude<LiveDriftEvalTechnique, "unknown">;
  evalTechniqueNotebookHash?: string;
  evalTechniqueDatasetHash?: string;
  evalTechniqueReferenceAnswerHash?: string;
  evalTechniqueGroundTruthCodeHash?: string;
  evalTechniqueTrajectorySpecHash?: string;
  evalTechniqueToolSchemaHash?: string;
  evalTechniqueRagSourceDocumentHash?: string;
  evalTechniqueJudgeConfigHash?: string;
  evalTechniqueCallbackConfigHash?: string;
  evalTechniqueBatchJobHash?: string;
  evalTechniqueLangsmithProjectId?: string;
  evalTechniqueLangchainConfigHash?: string;
  evalTechniqueExactMatchAccuracy0to1?: number;
  evalTechniqueLlmJudgeAgreement0to1?: number;
  evalTechniqueStructuredValidationScore0to1?: number;
  evalTechniqueDynamicGroundTruthPassRate0to1?: number;
  evalTechniqueTrajectoryMatchRate0to1?: number;
  evalTechniqueToolPrecision0to1?: number;
  evalTechniqueToolImprovementDelta0to1?: number;
  evalTechniqueRagFaithfulness0to1?: number;
  evalTechniqueRagContextRelevance0to1?: number;
  evalTechniqueRealtimeFeedbackScore0to1?: number;
  evalTechniquePairwiseWinRate0to1?: number;
  evalTechniqueSimulationGoalCompletion0to1?: number;
  evalTechniqueAlgorithmicFeedbackCoverage0to1?: number;
  sapAgentEvalTutorialId?: string;
  sapAgentEvalSourceRefHash?: string;
  sapAgentEvalRepositorySnapshotHash?: string;
  sapAgentEvalLicenseRefHash?: string;
  sapAgentEvalPaperRefHash?: string;
  sapAgentEvalNotebookHash?: string;
  sapAgentEvalDatasetManifestHash?: string;
  sapAgentEvalBaselineLogManifestHash?: string;
  sapAgentEvalLiveSampleManifestHash?: string;
  sapAgentEvalMetricConfigHash?: string;
  sapAgentEvalToolingConfigHash?: string;
  sapAgentEvalRoleAccessPolicyHash?: string;
  sapAgentEvalReliabilityPolicyHash?: string;
  sapAgentEvalCompliancePolicyHash?: string;
  sapAgentEvalAlertReceiptHash?: string;
  sapAgentEvalObjective?: Exclude<LiveDriftSapAgentEvalObjective, "unknown">;
  sapAgentEvalProcess?: Exclude<LiveDriftSapAgentEvalProcess, "unknown">;
  sapAgentEvalEnterpriseContext?: Exclude<LiveDriftSapAgentEvalEnterpriseContext, "unknown">;
  sapAgentEvalObjectiveCoverage0to1?: number;
  sapAgentEvalProcessCoverage0to1?: number;
  sapAgentEvalEnterpriseContextCoverage0to1?: number;
  sapAgentEvalEvidenceCoverage0to1?: number;
  agentEvalObservabilitySourceRefHash?: string;
  agentEvalObservabilityRepositorySnapshotHash?: string;
  agentEvalObservabilityLicenseRefHash?: string;
  agentEvalObservabilityAgentConfigHash?: string;
  agentEvalObservabilityEvalDatasetHash?: string;
  agentEvalObservabilityPromptVariantHash?: string;
  agentEvalObservabilityModelConfigHash?: string;
  agentEvalObservabilityRagIndexHash?: string;
  agentEvalObservabilityMetricConfigHash?: string;
  agentEvalObservabilityBaselineEvalResultHash?: string;
  agentEvalObservabilityLiveEvalResultHash?: string;
  agentEvalObservabilityOpenTelemetryTraceHash?: string;
  agentEvalObservabilityApplicationInsightsHash?: string;
  agentEvalObservabilityEventHubHash?: string;
  agentEvalObservabilityKustoPolicyHash?: string;
  agentEvalObservabilityFabricDashboardHash?: string;
  agentEvalObservabilityAlertReceiptHash?: string;
  agentEvalObservabilityMetricSet?: Exclude<LiveDriftAgentEvalObservabilityMetricSet, "unknown">;
  agentEvalObservabilityTelemetry?: Exclude<LiveDriftAgentEvalObservabilityTelemetry, "unknown">;
  agentEvalObservabilityConfigCoverage0to1?: number;
  agentEvalObservabilityTelemetryCoverage0to1?: number;
  agentEvalObservabilityEvidenceCoverage0to1?: number;
  hedraRagArtifactId?: string;
  hedraRagSourceRefHash?: string;
  hedraRagRepositorySnapshotHash?: string;
  hedraRagLicenseStatus?: LiveDriftSourceLicenseStatus;
  hedraRagLicenseRefHash?: string;
  hedraRagLicenseReviewHash?: string;
  hedraRagPaperRefHash?: string;
  hedraRagArtifactReadmeHash?: string;
  hedraRagWorkflow?: Exclude<LiveDriftHedraRagWorkflow, "unknown">;
  hedraRagBaselineFramework?: Exclude<LiveDriftHedraRagBaselineFramework, "unknown">;
  hedraRagRuntime?: Exclude<LiveDriftHedraRagRuntime, "unknown">;
  hedraRagDatasetManifestHash?: string;
  hedraRagCorpusManifestHash?: string;
  hedraRagIndexManifestHash?: string;
  hedraRagDependencyManifestHash?: string;
  hedraRagEnvironmentConfigHash?: string;
  hedraRagRunScriptHash?: string;
  hedraRagFigureId?: string;
  hedraRagResultCsvHash?: string;
  hedraRagPlotArtifactHash?: string;
  hedraRagBaselineResultHash?: string;
  hedraRagLiveResultHash?: string;
  hedraRagAlertPolicyHash?: string;
  hedraRagResourceProfileHash?: string;
  hedraRagGpuProfileHash?: string;
  hedraRagLatencyP95Ms?: number;
  hedraRagThroughputRequestsPerSec?: number;
  hedraRagMemoryGb?: number;
  hedraRagReplayPassed?: boolean;
  hedraRagReplayPassRate0to1?: number;
  hedraRagEvidenceCoverage0to1?: number;
  agentEvalHarnessRunId?: string;
  agentEvalHarnessSourceRefHash?: string;
  agentEvalHarnessRepositorySnapshotHash?: string;
  agentEvalHarnessLicenseRefHash?: string;
  agentEvalHarnessTraceSchemaHash?: string;
  agentEvalHarnessTraceCollectorHash?: string;
  agentEvalHarnessTraceWriterHash?: string;
  agentEvalHarnessAdapterConfigHash?: string;
  agentEvalHarnessFramework?: Exclude<LiveDriftAgentEvalHarnessFramework, "unknown">;
  agentEvalHarnessTraceMode?: Exclude<LiveDriftAgentEvalHarnessTraceMode, "unknown">;
  agentEvalHarnessMetricContext?: Exclude<LiveDriftAgentEvalHarnessMetricContext, "unknown">;
  agentEvalHarnessTraceManifestHash?: string;
  agentEvalHarnessDatasetManifestHash?: string;
  agentEvalHarnessTaskManifestHash?: string;
  agentEvalHarnessToolSchemaHash?: string;
  agentEvalHarnessHallucinationConfigHash?: string;
  agentEvalHarnessPricingConfigHash?: string;
  agentEvalHarnessMetricsConfigHash?: string;
  agentEvalHarnessBaselineRunHash?: string;
  agentEvalHarnessLiveRunHash?: string;
  agentEvalHarnessComparisonReportHash?: string;
  agentEvalHarnessDashboardSnapshotHash?: string;
  agentEvalHarnessLocalStoragePolicyHash?: string;
  agentEvalHarnessAlertPolicyHash?: string;
  agentEvalHarnessReproCommandHash?: string;
  agentEvalHarnessToolSuccessRate0to1?: number;
  agentEvalHarnessHallucinationRate0to1?: number;
  agentEvalHarnessLatencyP95Ms?: number;
  agentEvalHarnessCostUsd?: number;
  agentEvalHarnessTraceCoverage0to1?: number;
  agentEvalHarnessEvidenceCoverage0to1?: number;
  strandsBenchmarkHarnessRunId?: string;
  strandsBenchmarkHarnessSourceRefHash?: string;
  strandsBenchmarkHarnessRepositorySnapshotHash?: string;
  strandsBenchmarkHarnessLicenseRefHash?: string;
  strandsBenchmarkHarnessAgentPackageHash?: string;
  strandsBenchmarkHarnessConfigHash?: string;
  strandsBenchmarkHarnessModelRouteHash?: string;
  strandsBenchmarkHarnessPromptTemplateHash?: string;
  strandsBenchmarkHarnessBenchmarkSuite?: Exclude<LiveDriftStrandsBenchmarkSuite, "unknown">;
  strandsBenchmarkHarnessRuntime?: Exclude<LiveDriftStrandsHarnessRuntime, "unknown">;
  strandsBenchmarkHarnessTaskFamily?: Exclude<LiveDriftStrandsTaskFamily, "unknown">;
  strandsBenchmarkHarnessTaskManifestHash?: string;
  strandsBenchmarkHarnessDatasetSnapshotHash?: string;
  strandsBenchmarkHarnessDockerImageHash?: string;
  strandsBenchmarkHarnessEnvironmentSetupHash?: string;
  strandsBenchmarkHarnessToolPolicyHash?: string;
  strandsBenchmarkHarnessTrajectoryHash?: string;
  strandsBenchmarkHarnessPatchArtifactHash?: string;
  strandsBenchmarkHarnessTestReportHash?: string;
  strandsBenchmarkHarnessResultManifestHash?: string;
  strandsBenchmarkHarnessUploadManifestHash?: string;
  strandsBenchmarkHarnessSafetyIsolationPolicyHash?: string;
  strandsBenchmarkHarnessBaselineRunHash?: string;
  strandsBenchmarkHarnessLiveRunHash?: string;
  strandsBenchmarkHarnessAlertPolicyHash?: string;
  strandsBenchmarkHarnessTaskSuccessRate0to1?: number;
  strandsBenchmarkHarnessPatchApplyRate0to1?: number;
  strandsBenchmarkHarnessTestPassRate0to1?: number;
  strandsBenchmarkHarnessTrajectoryCoverage0to1?: number;
  strandsBenchmarkHarnessEvidenceCoverage0to1?: number;
  strandsBenchmarkHarnessLatencyP95Ms?: number;
  strandsBenchmarkHarnessCostUsd?: number;
  privacyWebBenchmarkId?: string;
  privacyWebDatasetHash?: string;
  privacyWebTaskConfigHash?: string;
  privacyWebEnvironment?: Exclude<LiveDriftPrivacyWebEnvironment, "unknown">;
  privacyWebObservationMode?: Exclude<LiveDriftPrivacyWebObservationMode, "unknown">;
  privacyWebActionSetTag?: string;
  privacyWebInstructionConfigHash?: string;
  privacyWebCookieStateHash?: string;
  privacyWebEnvironmentResetHash?: string;
  privacyWebDataMinimizationPolicyHash?: string;
  privacyWebAllowedInfoManifestHash?: string;
  privacyWebSensitiveInfoManifestHash?: string;
  privacyWebTrajectoryHash?: string;
  privacyWebResultArtifactHash?: string;
  privacyWebLeakageJudgeHash?: string;
  privacyWebCaptioningModelHash?: string;
  privacyWebModelRouteHash?: string;
  privacyWebDataMinimizationPassRate0to1?: number;
  privacyWebLeakageRate0to1?: number;
  privacyWebUnnecessaryDisclosureRate0to1?: number;
  privacyWebSensitiveFieldExposureCount?: number;
  privacyWebTaskSuccessRate0to1?: number;
  privacyWebModalLeakageDelta0to1?: number;
  genomicsTaskStage?: Exclude<LiveDriftGenomicsTaskStage, "unknown">;
  genomicsProblemId?: string;
  genomicsTraitId?: string;
  genomicsConditionId?: string;
  genomicsCohortId?: string;
  genomicsReferenceDatasetHash?: string;
  genomicsPredictionDatasetHash?: string;
  genomicsMetadataHash?: string;
  genomicsToolchainHash?: string;
  genomicsExpertAnnotationHash?: string;
  genomicsFormatConformant?: boolean;
  genomicsFormatErrorCount?: number;
  genomicsReferenceOutputMatched?: boolean;
  genomicsSelectionAccuracy0to1?: number;
  genomicsPreprocessingQuality0to1?: number;
  genomicsStatisticalAnalysisAccuracy0to1?: number;
  interactionTurnCount?: number;
  invalidActionRate0to1?: number;
  errorAttributionRate0to1?: number;
  passed?: boolean;
  refused?: boolean;
  errored?: boolean;
  toolCallCount?: number;
  toolUseReward0to1?: number;
  toolAnswerVerification0to1?: number;
  toolJudgeAgreement0to1?: number;
  toolCallValidity0to1?: number;
  toolRolloutDiversity0to1?: number;
  toolEvalImprovementDelta0to1?: number;
  toolRlModelId?: string;
  toolRlDatasetHash?: string;
  toolRlRewardRubricHash?: string;
  toolRlVerifierHash?: string;
  toolRlEnvironmentHash?: string;
  toolRlRolloutConfigHash?: string;
  toolRlJudgeModelId?: string;
  credenceEngineBenchmarkId?: string;
  credenceEngineSourceRefHash?: string;
  credenceEngineRepositorySnapshotHash?: string;
  credenceEngineLicenseRefHash?: string;
  credenceEngineArchivedStatusHash?: string;
  credenceEngineReadmeBlobHash?: string;
  credenceEngineSpecBlobHash?: string;
  credenceEnginePackageManifestHash?: string;
  credenceEngineLockfileHash?: string;
  credenceEngineResultsArtifactHash?: string;
  credenceEngineExperimentManifestHash?: string;
  credenceEngineBenchmarkHarnessHash?: string;
  credenceEngineTestSuiteHash?: string;
  credenceEnginePosteriorTraceHash?: string;
  credenceEngineVoiPolicyHash?: string;
  credenceEngineExpectedUtilityPolicyHash?: string;
  credenceEngineBaselineResultHash?: string;
  credenceEngineLiveResultHash?: string;
  credenceEngineDriftStatisticHash?: string;
  credenceEngineAlertReceiptHash?: string;
  credenceEngineExperimentMode?: Exclude<LiveDriftCredenceEngineExperimentMode, "unknown">;
  credenceEngineDecisionPolicy?: Exclude<LiveDriftCredenceEngineDecisionPolicy, "unknown">;
  credenceEngineDecisionQuality0to1?: number;
  credenceEnginePosteriorCalibration0to1?: number;
  credenceEngineVoiEfficiency0to1?: number;
  credenceEngineExpectedUtilityGain0to1?: number;
  tradingMarketRegimeId?: string;
  tradingStrategyId?: string;
  tradingRiskPolicyId?: string;
  tradingAiProviderRouteId?: string;
  tradingMemorySnapshotHash?: string;
  tradingChartImageHash?: string;
  tradingIndicatorSnapshotHash?: string;
  tradingClaimValidationTraceHash?: string;
  tradingNewsContextHash?: string;
  tradingPaperLedgerHash?: string;
  tradingWinRate0to1?: number;
  tradingRiskRewardRatio?: number;
  tradingMaxDrawdown0to1?: number;
  tradingRealizedPnlPct?: number;
  tradingRiskLimitViolationRate0to1?: number;
  tradingClaimValidationFailureRate0to1?: number;
  tradingVisionChartAgreement0to1?: number;
  tradingMemoryRetrievalHitRate0to1?: number;
  tradingProviderFallbackRate0to1?: number;
  latencyMs?: number;
  costUsd?: number;
  evidenceRefs: string[];
  signedEvidenceRefs?: string[];
}

export interface LiveDriftWindow {
  windowId: string;
  startedAt: string;
  endedAt: string;
  rows: LiveDriftSampleRow[];
}

export interface LiveDriftThresholds {
  minBaselineSampleSize: number;
  minLiveSampleSize: number;
  maxScoreDrop0to1: number;
  maxPassRateDrop0to1: number;
  maxRefusalRateIncrease0to1: number;
  maxErrorRateIncrease0to1: number;
  maxLatencyIncreaseRatio: number;
  maxCostIncreaseRatio: number;
  maxToolCallMeanShiftRatio: number;
  maxToolUseRewardDrop0to1: number;
  maxToolAnswerVerificationDrop0to1: number;
  maxToolJudgeAgreementDrop0to1: number;
  maxToolCallValidityDrop0to1: number;
  maxToolRolloutDiversityDrop0to1: number;
  maxToolEvalImprovementDrop0to1: number;
  maxToolRlContextDivergence0to1: number;
  minCredenceEngineEvidenceCoverage0to1: number;
  maxCredenceEngineContextDivergence0to1: number;
  maxTradingWinRateDrop0to1: number;
  maxTradingRiskRewardDropRatio: number;
  maxTradingDrawdownIncrease0to1: number;
  maxTradingPnlDropPct: number;
  maxTradingRiskLimitViolationIncrease0to1: number;
  maxTradingClaimValidationFailureIncrease0to1: number;
  maxTradingVisionChartAgreementDrop0to1: number;
  maxTradingMemoryRetrievalHitRateDrop0to1: number;
  maxTradingProviderFallbackRateIncrease0to1: number;
  maxTradingContextDivergence0to1: number;
  maxBehaviorDivergence0to1: number;
  maxLifecycleStageDivergence0to1: number;
  maxPerturbationDistributionDivergence0to1: number;
  maxArenaContextDivergence0to1: number;
  maxFrameworkExecutionContextDivergence0to1: number;
  maxAgentEvaluationDimensionDivergence0to1: number;
  maxRobustnessStabilityDrop0to1: number;
  maxRobustnessDimensionDrop0to1: number;
  maxInteractionTurnMeanShiftRatio: number;
  maxInvalidActionRateIncrease0to1: number;
  maxErrorAttributionRateIncrease0to1: number;
  maxSolutionPathMeanDropRatio: number;
  maxOffPathAttemptMeanDropRatio: number;
  maxDivergenceMomentumDrop0to1: number;
  maxActionFixationRateIncrease0to1: number;
  maxSocialHarmPrevalenceIncrease0to1: number;
  maxSocialSentimentMeanShift: number;
  maxSocialSemanticAlignmentDrop0to1: number;
  maxSocialLexicalDiversityDrop0to1: number;
  maxSocialContextDivergence0to1: number;
  maxPersonaHumanLikenessDrop0to1: number;
  maxPersonaBehaviorCoverageDrop0to1: number;
  maxPersonaTaskGoalPreservationDrop0to1: number;
  maxPersonaDistributionDivergence0to1: number;
  maxPrivacySensitiveDisclosureRateIncrease0to1: number;
  maxPrivacyPeerExposureRateIncrease0to1: number;
  maxPrivacySocialPressureIncrease0to1: number;
  maxPrivacySafeguardActiveRateDrop0to1: number;
  maxArtifactAccuracyDrop0to1: number;
  maxFormulaIntegrityDrop0to1: number;
  maxFormatQualityDrop0to1: number;
  maxProcessDefectRateIncrease0to1: number;
  maxControlInterpretabilityDrop0to1: number;
  maxControlInterruptibilityDrop0to1: number;
  maxControlCorrectabilityDrop0to1: number;
  maxControlReversibilityDrop0to1: number;
  maxAuthorityHandoffRateDrop0to1: number;
  maxRedTeamUnsafeResponseRateIncrease0to1: number;
  maxRedTeamComplianceDrop0to1: number;
  maxRedTeamGuardScoreDrop0to1: number;
  minRedTeamDatasetCoverage0to1: number;
  minRedTeamTaxonomyCoverage0to1: number;
  minRedTeamAttackCoverage0to1: number;
  minRedTeamGuardCoverage0to1: number;
  maxRedTeamRiskCategoryDivergence0to1: number;
  maxRedTeamAttackDivergence0to1: number;
  maxRedTeamSubsetDivergence0to1: number;
  maxRedTeamGuardLabelDivergence0to1: number;
  maxPiArenaAttackSuccessRateIncrease0to1: number;
  maxPiArenaDefenseBlockRateDrop0to1: number;
  maxPiArenaFalsePositiveRateIncrease0to1: number;
  maxPiArenaAgentTaskSuccessRateDrop0to1: number;
  maxPiArenaToolCallSuccessRateDrop0to1: number;
  minPiArenaEvidenceCoverage0to1: number;
  maxPiArenaAttackDivergence0to1: number;
  maxPiArenaDefenseDivergence0to1: number;
  maxPiArenaDatasetDivergence0to1: number;
  maxPiArenaAgentBenchmarkDivergence0to1: number;
  maxBackdoorAgentAttackSuccessRateIncrease0to1: number;
  maxBackdoorAgentCleanAccuracyDrop0to1: number;
  maxBackdoorAgentTriggerPersistenceIncrease0to1: number;
  maxBackdoorAgentTriggerPropagationIncrease0to1: number;
  minBackdoorAgentTrajectoryCoverage0to1: number;
  minBackdoorAgentEvidenceCoverage0to1: number;
  maxBackdoorAgentStageDivergence0to1: number;
  maxBackdoorAgentTaskFamilyDivergence0to1: number;
  maxBackdoorAgentAttackFamilyDivergence0to1: number;
  minAgentSecuritySourceOriginCoverage0to1: number;
  minAgentSecurityTaintPropagationCoverage0to1: number;
  maxAgentSecurityPolicyDecisionAccuracyDrop0to1: number;
  minAgentSecuritySecretScrubRate0to1: number;
  minAgentSecurityAuditTrailIntegrity0to1: number;
  maxAgentSecurityAttackEffectivenessIncrease0to1: number;
  maxAgentSecurityFalsePositiveRateIncrease0to1: number;
  minAgentSecurityEvidenceCoverage0to1: number;
  maxAgentSecurityLatencyP95IncreaseRatio: number;
  maxAgentSecurityContextDivergence0to1: number;
  minAgentTestingMethodologyCoverage0to1: number;
  minAgentTestingScenarioCoverage0to1: number;
  minAgentTestingFaultInjectionCoverage0to1: number;
  minAgentTestingResiliencePassRate0to1: number;
  maxAgentTestingSafetyRegressionRateIncrease0to1: number;
  minAgentTestingObservabilitySignalCoverage0to1: number;
  minAgentTestingEvidenceCoverage0to1: number;
  maxAgentTestingContextDivergence0to1: number;
  minChaosProductionReliability0to1: number;
  minChaosResilienceScore0to1: number;
  maxChaosDropIncrease0to1: number;
  minChaosRecoveryPassRate0to1: number;
  minChaosFailureTraceCoverage0to1: number;
  minChaosImprovementEvalCoverage0to1: number;
  minChaosEvidenceCoverage0to1: number;
  maxChaosContextDivergence0to1: number;
  maxRecoveryBenchRecoverySuccessRateDrop0to1: number;
  maxRecoveryBenchRecoveryRewardDrop0to1: number;
  minRecoveryBenchReplayIntegrityRate0to1: number;
  minRecoveryBenchFailureTraceCoverage0to1: number;
  minRecoveryBenchCorruptedEnvironmentCoverage0to1: number;
  minRecoveryBenchContextCoverage0to1: number;
  minRecoveryBenchEvidenceCoverage0to1: number;
  maxRecoveryBenchMessageModeDivergence0to1: number;
  maxRecoveryBenchAgentHarnessDivergence0to1: number;
  maxRecoveryBenchTaskDivergence0to1: number;
  minAdkEvalPassRate0to1: number;
  minAdkToolCallSuccessRate0to1: number;
  minAdkGraphCoverage0to1: number;
  minAdkStreamingStability0to1: number;
  minAdkDeploymentReadiness0to1: number;
  minAdkEvidenceCoverage0to1: number;
  maxAdkRuntimeContextDivergence0to1: number;
  minPhysicianBenchTaskSuccessRate0to1: number;
  minPhysicianBenchCheckpointPassRate0to1: number;
  minPhysicianBenchFhirDataAccessAccuracy0to1: number;
  minPhysicianBenchClinicalActionSafetyRate0to1: number;
  minPhysicianBenchDocumentationQuality0to1: number;
  minPhysicianBenchTrajectoryCoverage0to1: number;
  minPhysicianBenchArtifactCoverage0to1: number;
  minPhysicianBenchEvidenceCoverage0to1: number;
  maxPhysicianBenchSpecialtyDivergence0to1: number;
  maxPhysicianBenchTaskTypeDivergence0to1: number;
  maxPhysicianBenchEhrContextDivergence0to1: number;
  maxCtfFlagSolveRateDrop0to1: number;
  maxCtfExternalSearchUseRateIncrease0to1: number;
  maxCtfContaminationRiskIncrease0to1: number;
  maxCtfCompetitionImpactIncrease0to1: number;
  maxCtfIndependenceViolationRate0to1: number;
  minCtfFirstCorrectFlagForwardingRate0to1: number;
  maxCtfContextDivergence0to1: number;
  maxCtfCheckpointCompletionDrop0to1: number;
  maxCtfPartialCreditScoreDrop0to1: number;
  minCtfTraceCoverageRate0to1: number;
  maxCtfVmContextDivergence0to1: number;
  maxCtfIsolationViolationRate0to1: number;
  maxRagAccuracyDrop0to1: number;
  maxRagCompletenessDrop0to1: number;
  maxRagUtilizationDrop0to1: number;
  maxRagNumericalAccuracyDrop0to1: number;
  maxRagHallucinationRateIncrease0to1: number;
  maxRagRetrievalTopKMeanShiftRatio: number;
  minRagGeneratedDataFinalCoverage0to1: number;
  minRagPassageGroundingCoverage0to1: number;
  minRagHumanVerificationCoverage0to1: number;
  minRagCitationCoverage0to1: number;
  minRagAnswerSupportCoverage0to1: number;
  minRagDatasetBuilderEvidenceCoverage0to1: number;
  minRagStrategyEvidenceCoverage0to1: number;
  maxRagGenerationCostIncreaseRatio: number;
  maxRagQuestionCountDropRatio: number;
  maxRagSourceDocumentCountDropRatio: number;
  maxRagEvaluationModeDivergence0to1: number;
  maxRagPipelineContextDivergence0to1: number;
  maxRagStrategyDivergence0to1: number;
  maxRagDatasetTierDivergence0to1: number;
  maxRagQuestionTypeDivergence0to1: number;
  maxRagBuilderStageDivergence0to1: number;
  maxRagDatasetBuilderContextDivergence0to1: number;
  maxKiteGradeDrop0to10: number;
  maxKiteNormalizedGradeDrop0to1: number;
  minKiteEvidenceCoverage0to1: number;
  maxKiteQuestionCountDropRatio: number;
  maxKiteDocumentCountDropRatio: number;
  maxKiteDatasetFamilyDivergence0to1: number;
  maxKiteRagConfigurationDivergence0to1: number;
  maxKiteBenchmarkContextDivergence0to1: number;
  maxPokerEvalBbPer100Drop: number;
  maxPokerEvalAllInAdjBbPer100Drop: number;
  maxPokerEvalEvBbPer100Drop: number;
  maxPokerEvalVpipShift0to1: number;
  maxPokerEvalHandCountDropRatio: number;
  minPokerEvalEvidenceCoverage0to1: number;
  maxPokerEvalGameTypeDivergence0to1: number;
  maxPokerEvalTableContextDivergence0to1: number;
  maxPokerEvalOpponentPoolDivergence0to1: number;
  maxLlmRagSemanticSimilarityDrop0to1: number;
  maxLlmRagBiasRiskIncrease0to1: number;
  maxLlmRagHallucinationRateIncrease0to1: number;
  minLlmRagEvalSuiteEvidenceCoverage0to1: number;
  maxLlmRagEvalSuiteContextDivergence0to1: number;
  maxNoMiraclRelevanceAccuracyDrop0to1: number;
  maxNoMiraclAbstentionAccuracyDrop0to1: number;
  maxNoMiraclHallucinationRateIncrease0to1: number;
  maxNoMiraclErrorRateIncrease0to1: number;
  minNoMiraclLanguageCoverage0to1: number;
  minNoMiraclSubsetCoverage0to1: number;
  minNoMiraclEvidenceCoverage0to1: number;
  maxNoMiraclLanguageDivergence0to1: number;
  maxNoMiraclSubsetDivergence0to1: number;
  maxNoMiraclContextDivergence0to1: number;
  maxScalingLawR2Drop: number;
  maxScalingLawNmseIncrease: number;
  maxScalingLawNmaeIncrease: number;
  minScalingLawEvidenceCoverage0to1: number;
  maxScalingLawTaskTypeDivergence0to1: number;
  maxScalingLawContextDivergence0to1: number;
  maxGenomicsSelectionAccuracyDrop0to1: number;
  maxGenomicsPreprocessingQualityDrop0to1: number;
  maxGenomicsStatisticalAnalysisAccuracyDrop0to1: number;
  minGenomicsReferenceCoverage0to1: number;
  minGenomicsFormatConformanceRate0to1: number;
  minGenomicsExpertCurationCoverage0to1: number;
  maxGenomicsStageDivergence0to1: number;
  maxGenomicsContextDivergence0to1: number;
  maxAgenticSearchPlanningScoreDrop0to1: number;
  maxAgenticSearchQueryDecompositionDrop0to1: number;
  maxAgenticSearchRelevanceDrop0to1: number;
  maxAgenticSearchSynthesisDrop0to1: number;
  minAgenticSearchCitationCoverage0to1: number;
  minAgenticSearchTraceCoverage0to1: number;
  maxAgenticSearchDatasetFamilyDivergence0to1: number;
  maxAgenticSearchQueryTypeDivergence0to1: number;
  maxAgenticSearchToolContextDivergence0to1: number;
  maxDocumentDatasetQaAccuracyDrop0to1: number;
  maxDocumentDatasetSummaryQualityDrop0to1: number;
  maxDocumentDatasetRagFaithfulnessDrop0to1: number;
  minDocumentDatasetNumGuardCoverage0to1: number;
  maxDocumentDatasetNumericMismatchRateIncrease0to1: number;
  minDocumentDatasetEvidenceCoverage0to1: number;
  maxDocumentDatasetTokenSavingsDropRatio: number;
  maxDocumentDatasetThroughputDropRatio: number;
  maxDocumentDatasetMemoryIncreaseRatio: number;
  maxDocumentDatasetTaskDivergence0to1: number;
  maxDocumentDatasetFormatDivergence0to1: number;
  maxDocumentDatasetExportTargetDivergence0to1: number;
  maxDocumentDatasetPipelineContextDivergence0to1: number;
  maxCpuAgenticLatencyP50IncreaseRatio: number;
  maxCpuAgenticLatencyP95IncreaseRatio: number;
  maxCpuAgenticLatencyP99IncreaseRatio: number;
  maxCpuAgenticThroughputDropRatio: number;
  maxCpuAgenticCpuUtilizationIncrease0to1: number;
  maxCpuAgenticGpuUtilizationDrop0to1: number;
  maxCpuAgenticMemoryIncreaseRatio: number;
  maxCpuAgenticToolExecutionShareIncrease0to1: number;
  maxCpuAgenticLlmInferenceShareShift0to1: number;
  maxCpuAgenticFrameworkOverheadShareIncrease0to1: number;
  minCpuAgenticEvidenceCoverage0to1: number;
  maxCpuAgenticWorkloadDivergence0to1: number;
  maxCpuAgenticRuntimeDivergence0to1: number;
  maxCpuAgenticScheduleDivergence0to1: number;
  maxCpuAgenticContextDivergence0to1: number;
  maxEvalTechniqueExactMatchAccuracyDrop0to1: number;
  maxEvalTechniqueLlmJudgeAgreementDrop0to1: number;
  maxEvalTechniqueStructuredValidationDrop0to1: number;
  maxEvalTechniqueDynamicGroundTruthPassRateDrop0to1: number;
  maxEvalTechniqueTrajectoryMatchRateDrop0to1: number;
  maxEvalTechniqueToolPrecisionDrop0to1: number;
  maxEvalTechniqueToolImprovementDrop0to1: number;
  maxEvalTechniqueRagFaithfulnessDrop0to1: number;
  maxEvalTechniqueRagContextRelevanceDrop0to1: number;
  maxEvalTechniqueRealtimeFeedbackDrop0to1: number;
  maxEvalTechniquePairwiseWinRateDrop0to1: number;
  maxEvalTechniqueSimulationGoalCompletionDrop0to1: number;
  minEvalTechniqueAlgorithmicFeedbackCoverage0to1: number;
  minEvalTechniqueEvidenceCoverage0to1: number;
  maxEvalTechniqueDivergence0to1: number;
  maxEvalTechniqueContextDivergence0to1: number;
  minSapAgentEvalObjectiveCoverage0to1: number;
  minSapAgentEvalProcessCoverage0to1: number;
  minSapAgentEvalEnterpriseContextCoverage0to1: number;
  minSapAgentEvalEvidenceCoverage0to1: number;
  maxSapAgentEvalObjectiveDivergence0to1: number;
  maxSapAgentEvalProcessDivergence0to1: number;
  maxSapAgentEvalEnterpriseContextDivergence0to1: number;
  minAgentEvalObservabilityConfigCoverage0to1: number;
  minAgentEvalObservabilityTelemetryCoverage0to1: number;
  minAgentEvalObservabilityEvidenceCoverage0to1: number;
  maxAgentEvalObservabilityMetricSetDivergence0to1: number;
  maxAgentEvalObservabilityTelemetryDivergence0to1: number;
  maxHedraRagLatencyP95IncreaseRatio: number;
  maxHedraRagThroughputDropRatio: number;
  maxHedraRagMemoryIncreaseRatio: number;
  minHedraRagReplayPassRate0to1: number;
  minHedraRagEvidenceCoverage0to1: number;
  maxHedraRagWorkflowDivergence0to1: number;
  maxHedraRagBaselineFrameworkDivergence0to1: number;
  maxHedraRagRuntimeContextDivergence0to1: number;
  maxAgentEvalHarnessToolSuccessDrop0to1: number;
  maxAgentEvalHarnessHallucinationIncrease0to1: number;
  maxAgentEvalHarnessLatencyP95IncreaseRatio: number;
  maxAgentEvalHarnessCostIncreaseRatio: number;
  minAgentEvalHarnessTraceCoverage0to1: number;
  minAgentEvalHarnessEvidenceCoverage0to1: number;
  maxAgentEvalHarnessFrameworkDivergence0to1: number;
  maxAgentEvalHarnessTraceModeDivergence0to1: number;
  maxAgentEvalHarnessMetricContextDivergence0to1: number;
  maxStrandsBenchmarkHarnessTaskSuccessDrop0to1: number;
  maxStrandsBenchmarkHarnessPatchApplyRateDrop0to1: number;
  maxStrandsBenchmarkHarnessTestPassRateDrop0to1: number;
  minStrandsBenchmarkHarnessTrajectoryCoverage0to1: number;
  minStrandsBenchmarkHarnessEvidenceCoverage0to1: number;
  maxStrandsBenchmarkHarnessLatencyP95IncreaseRatio: number;
  maxStrandsBenchmarkHarnessCostIncreaseRatio: number;
  maxStrandsBenchmarkHarnessBenchmarkSuiteDivergence0to1: number;
  maxStrandsBenchmarkHarnessRuntimeDivergence0to1: number;
  maxStrandsBenchmarkHarnessTaskFamilyDivergence0to1: number;
  maxPrivacyWebDataMinimizationPassRateDrop0to1: number;
  maxPrivacyWebLeakageRateIncrease0to1: number;
  maxPrivacyWebUnnecessaryDisclosureRateIncrease0to1: number;
  maxPrivacyWebSensitiveFieldExposureIncreaseRatio: number;
  maxPrivacyWebTaskSuccessRateDrop0to1: number;
  maxPrivacyWebModalLeakageDeltaIncrease0to1: number;
  minPrivacyWebEvidenceCoverage0to1: number;
  maxPrivacyWebEnvironmentDivergence0to1: number;
  maxPrivacyWebObservationModeDivergence0to1: number;
  maxPrivacyWebContextDivergence0to1: number;
  maxLocalSystemThermalBaselineDeviationIncrease0to1: number;
  maxLocalSystemVoltageSpcAnomalyRateIncrease0to1: number;
  minLocalSystemProcessIdentityCoverage0to1: number;
  minLocalSystemGhostDriverDetectionCoverage0to1: number;
  minLocalSystemProactiveAlertCoverage0to1: number;
  minLocalSystemLocalOnlyPrivacyCoverage0to1: number;
  minLocalSystemEvidenceCoverage0to1: number;
  maxLocalSystemWorkloadContextDivergence0to1: number;
  maxLocalSystemHardwareContextDivergence0to1: number;
  maxObservabilityResolutionScoreDrop0to1: number;
  maxObservabilityDeterministicCheckDrop0to1: number;
  maxObservabilityRubricScoreDrop0to1: number;
  minObservabilityEvidenceCoverage0to1: number;
  minObservabilityTraceCoverage0to1: number;
  minObservabilityReportCoverage0to1: number;
  minObservabilityScenarioClockAlignmentRate0to1: number;
  maxObservabilityIncidentContextDivergence0to1: number;
  maxObservabilityTaskTypeDivergence0to1: number;
  maxObservabilityDataSourceDivergence0to1: number;
  maxObservabilityToolModeDivergence0to1: number;
  maxOllamaMetricsRequestDurationP95IncreaseRatio: number;
  maxOllamaMetricsTimePerTokenIncreaseRatio: number;
  maxOllamaMetricsLoadedModelCountDropRatio: number;
  minOllamaMetricsModelLoadedRate0to1: number;
  maxOllamaMetricsModelRamIncreaseRatio: number;
  maxOllamaMetricsRequestErrorRateIncrease0to1: number;
  minOllamaMetricsEvidenceCoverage0to1: number;
  maxOllamaMetricsModelDivergence0to1: number;
  maxOllamaMetricsDeploymentDivergence0to1: number;
  maxOllamaMetricsProxyContextDivergence0to1: number;
  maxWebOperatorLlmEvaluationDrop0to1: number;
  maxWebOperatorSelfReportOverclaimIncrease0to1: number;
  maxWebOperatorMismatchRateIncrease0to1: number;
  maxWebOperatorTaskReliabilityDrop0to1: number;
  minWebOperatorReplayCoverage0to1: number;
  maxWebOperatorTaskTimeIncreaseRatio: number;
  maxWebOperatorStepLimitViolationRateIncrease0to1: number;
  maxWebOperatorContextDivergence0to1: number;
  maxWebOperatorProviderDivergence0to1: number;
  maxNaviBenchTaskSuccessDrop0to1: number;
  maxNaviBenchCrashRateIncrease0to1: number;
  maxNaviBenchLowerBoundScoreDrop0to1: number;
  maxNaviBenchExcludingCrashedScoreDrop0to1: number;
  minNaviBenchTrajectoryCoverage0to1: number;
  minNaviBenchVisualizationCoverage0to1: number;
  minNaviBenchEvidenceCoverage0to1: number;
  maxNaviBenchStepCountIncreaseRatio: number;
  maxNaviBenchStepLimitViolationRateIncrease0to1: number;
  maxNaviBenchWebsiteDomainDivergence0to1: number;
  maxNaviBenchBrowserModeDivergence0to1: number;
  maxNaviBenchEvalContextDivergence0to1: number;
  maxLegalAgentFinalSuccessDrop0to1: number;
  maxLegalAgentProcessRateDrop0to1: number;
  maxLegalAgentToolUseAccuracyDrop0to1: number;
  minLegalAgentCitationCoverage0to1: number;
  minLegalAgentEvidenceCoverage0to1: number;
  maxLegalAgentTokenCostIncreaseRatio: number;
  maxLegalAgentCorpusDivergence0to1: number;
  maxLegalAgentTaskTypeDivergence0to1: number;
  maxLegalAgentDifficultyDivergence0to1: number;
  maxLegalAgentToolContextDivergence0to1: number;
  maxResearchGymScoreImprovementDrop0to1: number;
  maxResearchGymSubtaskCompletionDrop0to1: number;
  minResearchGymArtifactCoverage0to1: number;
  minResearchGymInspectionPassRate0to1: number;
  maxResearchGymBudgetOverrunRate0to1: number;
  maxResearchGymViolationRate0to1: number;
  maxResearchGymTaskDomainDivergence0to1: number;
  maxResearchGymRuntimeContextDivergence0to1: number;
  maxOsUniverseTaskSuccessDrop0to1: number;
  maxOsUniverseAutoValidationPassDrop0to1: number;
  maxOsUniverseValidationErrorRateIncrease0to1: number;
  minOsUniverseEvidenceCoverage0to1: number;
  maxOsUniverseStepCountIncreaseRatio: number;
  maxOsUniverseStepLimitViolationRateIncrease0to1: number;
  maxOsUniverseCategoryDivergence0to1: number;
  maxOsUniverseLevelDivergence0to1: number;
  maxOsUniverseRuntimeContextDivergence0to1: number;
  requireDeploymentMaintenanceCoverage: boolean;
}

export interface LiveDriftDistribution {
  sampleSize: number;
  scoreMean0to1: number;
  passRate0to1: number;
  refusalRate0to1: number;
  errorRate0to1: number;
  latencyMsP95: number;
  costUsdMean: number;
  toolCallMean: number;
  toolRlRowCount: number;
  toolUseRewardMean0to1: number;
  toolAnswerVerificationRate0to1: number;
  toolJudgeAgreementRate0to1: number;
  toolCallValidityRate0to1: number;
  toolRolloutDiversityMean0to1: number;
  toolEvalImprovementDelta0to1: number;
  toolRlContextDistribution: Record<string, number>;
  credenceEngineRowCount: number;
  credenceEngineDecisionQualityMean0to1: number;
  credenceEnginePosteriorCalibrationMean0to1: number;
  credenceEngineVoiEfficiencyMean0to1: number;
  credenceEngineExpectedUtilityGainMean0to1: number;
  credenceEngineEvidenceCoverage0to1: number;
  credenceEngineContextDistribution: Record<string, number>;
  tradingRowCount: number;
  tradingWinRate0to1: number;
  tradingRiskRewardRatio: number;
  tradingMaxDrawdown0to1: number;
  tradingRealizedPnlPct: number;
  tradingRiskLimitViolationRate0to1: number;
  tradingClaimValidationFailureRate0to1: number;
  tradingVisionChartAgreementMean0to1: number;
  tradingMemoryRetrievalHitRate0to1: number;
  tradingProviderFallbackRate0to1: number;
  tradingContextDistribution: Record<string, number>;
  behaviorDistribution: Record<string, number>;
  lifecycleStageDistribution: Record<LiveDriftLifecycleStage, number>;
  taskCategoryDistribution: Record<string, number>;
  agentEvaluationDimensionDistribution: Record<LiveDriftAgentEvaluationDimension, number>;
  perturbationDistribution: Record<string, number>;
  arenaContextDistribution: Record<string, number>;
  frameworkExecutionContextDistribution: Record<string, number>;
  perturbationSeverityMean0to1: number;
  interactionTurnMean: number;
  invalidActionRateMean0to1: number;
  errorAttributionRateMean0to1: number;
  solutionPathMean: number;
  offPathAttemptMean: number;
  divergenceMomentumMean0to1: number;
  actionFixationRateMean0to1: number;
  socialHarmPrevalenceMean0to1: number;
  socialSentimentMeanMinus1to1: number;
  socialSemanticAlignmentMean0to1: number;
  socialLexicalDiversityMean0to1: number;
  socialContextDistribution: Record<string, number>;
  personaHumanLikenessMean0to1: number;
  personaBehaviorCoverageMean0to1: number;
  personaTaskGoalPreservationMean0to1: number;
  personaDistribution: Record<string, number>;
  privacySensitiveDisclosureRateMean0to1: number;
  privacyPeerExposureRateMean0to1: number;
  privacySocialPressureMean0to1: number;
  privacySafeguardActiveRateMean0to1: number;
  artifactAccuracyMean0to1: number;
  formulaIntegrityMean0to1: number;
  formatQualityMean0to1: number;
  processDefectRateMean0to1: number;
  controlInterpretabilityMean0to1: number;
  controlInterruptibilityMean0to1: number;
  controlCorrectabilityMean0to1: number;
  controlReversibilityMean0to1: number;
  authorityHandoffRateMean0to1: number;
  redTeamRowCount: number;
  redTeamUnsafeResponseRate0to1: number;
  redTeamComplianceMean0to1: number;
  redTeamGuardScoreMean0to1: number;
  redTeamDatasetCoverage0to1: number;
  redTeamTaxonomyCoverage0to1: number;
  redTeamAttackCoverage0to1: number;
  redTeamGuardCoverage0to1: number;
  redTeamRiskCategoryDistribution: Record<string, number>;
  redTeamAttackDistribution: Record<string, number>;
  redTeamSubsetDistribution: Record<LiveDriftRedTeamSubset, number>;
  redTeamGuardLabelDistribution: Record<LiveDriftRedTeamGuardLabel, number>;
  piArenaRowCount: number;
  piArenaAttackSuccessRate0to1: number;
  piArenaDefenseBlockRate0to1: number;
  piArenaFalsePositiveRate0to1: number;
  piArenaAgentTaskSuccessRate0to1: number;
  piArenaToolCallSuccessRateMean0to1: number;
  piArenaEvidenceCoverage0to1: number;
  piArenaAttackDistribution: Record<string, number>;
  piArenaDefenseDistribution: Record<string, number>;
  piArenaDatasetDistribution: Record<string, number>;
  piArenaAgentBenchmarkDistribution: Record<LiveDriftPiArenaAgentBenchmark, number>;
  backdoorAgentRowCount: number;
  backdoorAgentAttackSuccessRate0to1: number;
  backdoorAgentCleanAccuracy0to1: number;
  backdoorAgentTriggerPersistenceRate0to1: number;
  backdoorAgentTriggerPropagationRate0to1: number;
  backdoorAgentTrajectoryCoverage0to1: number;
  backdoorAgentEvidenceCoverage0to1: number;
  backdoorAgentStageDistribution: Record<LiveDriftBackdoorAgentStage, number>;
  backdoorAgentTaskFamilyDistribution: Record<LiveDriftBackdoorAgentTaskFamily, number>;
  backdoorAgentAttackFamilyDistribution: Record<LiveDriftBackdoorAgentAttackFamily, number>;
  agentSecurityRowCount: number;
  agentSecuritySourceOriginCoverage0to1: number;
  agentSecurityTaintPropagationCoverage0to1: number;
  agentSecurityPolicyDecisionAccuracyMean0to1: number;
  agentSecuritySecretScrubRate0to1: number;
  agentSecurityAuditTrailIntegrity0to1: number;
  agentSecurityAttackEffectivenessRate0to1: number;
  agentSecurityFalsePositiveRate0to1: number;
  agentSecurityEvidenceCoverage0to1: number;
  agentSecurityLatencyP95Ms: number;
  agentSecurityContextDistribution: Record<string, number>;
  agentTestingRowCount: number;
  agentTestingMethodologyCoverage0to1: number;
  agentTestingScenarioCoverage0to1: number;
  agentTestingFaultInjectionCoverage0to1: number;
  agentTestingResiliencePassRate0to1: number;
  agentTestingSafetyRegressionRate0to1: number;
  agentTestingObservabilitySignalCoverage0to1: number;
  agentTestingEvidenceCoverage0to1: number;
  agentTestingContextDistribution: Record<string, number>;
  chaosRowCount: number;
  chaosProductionReliabilityMean0to1: number;
  chaosResilienceScoreMean0to1: number;
  chaosDropMean0to1: number;
  chaosRecoveryPassRate0to1: number;
  chaosFailureTraceCoverage0to1: number;
  chaosImprovementEvalCoverage0to1: number;
  chaosEvidenceCoverage0to1: number;
  chaosContextDistribution: Record<string, number>;
  recoveryBenchRowCount: number;
  recoveryBenchRecoverySuccessRate0to1: number;
  recoveryBenchRecoveryRewardMean0to1: number;
  recoveryBenchReplayIntegrityRate0to1: number;
  recoveryBenchFailureTraceCoverage0to1: number;
  recoveryBenchCorruptedEnvironmentCoverage0to1: number;
  recoveryBenchContextCoverage0to1: number;
  recoveryBenchEvidenceCoverage0to1: number;
  recoveryBenchMessageModeDistribution: Record<LiveDriftRecoveryBenchMessageMode, number>;
  recoveryBenchAgentHarnessDistribution: Record<LiveDriftRecoveryBenchHarness, number>;
  recoveryBenchTaskDistribution: Record<string, number>;
  adkRowCount: number;
  adkEvalPassRate0to1: number;
  adkToolCallSuccessRate0to1: number;
  adkGraphCoverage0to1: number;
  adkStreamingStability0to1: number;
  adkDeploymentReadiness0to1: number;
  adkEvidenceCoverage0to1: number;
  adkRuntimeContextDistribution: Record<string, number>;
  physicianBenchRowCount: number;
  physicianBenchTaskSuccessRate0to1: number;
  physicianBenchCheckpointPassRate0to1: number;
  physicianBenchFhirDataAccessAccuracy0to1: number;
  physicianBenchClinicalActionSafetyRate0to1: number;
  physicianBenchDocumentationQualityMean0to1: number;
  physicianBenchTrajectoryCoverage0to1: number;
  physicianBenchArtifactCoverage0to1: number;
  physicianBenchEvidenceCoverage0to1: number;
  physicianBenchSpecialtyDistribution: Record<string, number>;
  physicianBenchTaskTypeDistribution: Record<LiveDriftPhysicianBenchTaskType, number>;
  physicianBenchEhrContextDistribution: Record<string, number>;
  ctfRowCount: number;
  ctfFlagSolveRate0to1: number;
  ctfExternalSearchUseRate0to1: number;
  ctfContaminationRiskMean0to1: number;
  ctfCompetitionImpactMean0to1: number;
  ctfIndependenceViolationRate0to1: number;
  ctfFirstCorrectFlagForwardingRate0to1: number;
  ctfSubmissionMean: number;
  ctfTimeToFlagMsP95: number;
  ctfContextDistribution: Record<string, number>;
  ctfPartialCreditRowCount: number;
  ctfCheckpointCompletionMean0to1: number;
  ctfPartialCreditScoreMean0to1: number;
  ctfTraceCoverageRate0to1: number;
  ctfIsolationViolationRate0to1: number;
  ctfVmContextDistribution: Record<string, number>;
  ragRowCount: number;
  ragAccuracyMean0to1: number;
  ragCompletenessMean0to1: number;
  ragUtilizationMean0to1: number;
  ragNumericalAccuracyMean0to1: number;
  ragHallucinationRateMean0to1: number;
  ragRetrievalTopKMean: number;
  ragGeneratedDataFinalCoverage0to1: number;
  ragDatasetBuilderRowCount: number;
  ragPassageGroundingCoverage0to1: number;
  ragHumanVerificationCoverage0to1: number;
  ragCitationCoverage0to1: number;
  ragAnswerSupportCoverage0to1: number;
  ragDatasetBuilderEvidenceCoverage0to1: number;
  ragStrategyRowCount: number;
  ragStrategyEvidenceCoverage0to1: number;
  ragQuestionCountMean: number;
  ragSourceDocumentCountMean: number;
  ragGenerationCostUsdMean: number;
  ragBatchSizeMean: number;
  ragDocConcurrencyMean: number;
  ragIncrementalOnlyMissingRate0to1: number;
  ragEvaluationModeDistribution: Record<LiveDriftRagEvaluationMode, number>;
  ragPipelineContextDistribution: Record<string, number>;
  ragStrategyDistribution: Record<LiveDriftRagPipelineStrategy, number>;
  ragDatasetTierDistribution: Record<LiveDriftRagDatasetTier, number>;
  ragQuestionTypeDistribution: Record<LiveDriftRagQuestionType, number>;
  ragBuilderStageDistribution: Record<LiveDriftRagBuilderStage, number>;
  ragDatasetBuilderContextDistribution: Record<string, number>;
  kiteRowCount: number;
  kiteGradeMean0to10: number;
  kiteNormalizedGradeMean0to1: number;
  kiteEvidenceCoverage0to1: number;
  kiteQuestionCountMean: number;
  kiteDocumentCountMean: number;
  kiteSmallSampleWarningRate0to1: number;
  kiteDatasetFamilyDistribution: Record<LiveDriftKiteDatasetFamily, number>;
  kiteRagConfigurationDistribution: Record<string, number>;
  kiteBenchmarkContextDistribution: Record<string, number>;
  pokerEvalRowCount: number;
  pokerEvalBbPer100Mean: number;
  pokerEvalAllInAdjBbPer100Mean: number;
  pokerEvalEvBbPer100Mean: number;
  pokerEvalVpipRate0to1: number;
  pokerEvalHandCountMean: number;
  pokerEvalEvidenceCoverage0to1: number;
  pokerEvalGameTypeDistribution: Record<LiveDriftPokerEvalGameType, number>;
  pokerEvalTableContextDistribution: Record<string, number>;
  pokerEvalOpponentPoolDistribution: Record<string, number>;
  llmRagEvalSuiteRowCount: number;
  llmRagSemanticSimilarityMean0to1: number;
  llmRagBiasRiskMean0to1: number;
  llmRagHallucinationRateMean0to1: number;
  llmRagEvalSuiteEvidenceCoverage0to1: number;
  llmRagEvalSuiteContextDistribution: Record<string, number>;
  noMiraclRowCount: number;
  noMiraclRelevanceAccuracyMean0to1: number;
  noMiraclAbstentionAccuracyMean0to1: number;
  noMiraclHallucinationRateMean0to1: number;
  noMiraclErrorRateMean0to1: number;
  noMiraclLanguageCoverage0to1: number;
  noMiraclSubsetCoverage0to1: number;
  noMiraclEvidenceCoverage0to1: number;
  noMiraclLanguageDistribution: Record<string, number>;
  noMiraclSubsetDistribution: Record<LiveDriftNoMiraclSubset, number>;
  noMiraclContextDistribution: Record<string, number>;
  scalingLawDiscoveryRowCount: number;
  scalingLawDiscoveryR2Mean: number;
  scalingLawDiscoveryNmseMean: number;
  scalingLawDiscoveryNmaeMean: number;
  scalingLawDiscoveryEvidenceCoverage0to1: number;
  scalingLawDiscoveryTaskTypeDistribution: Record<LiveDriftScalingLawTaskType, number>;
  scalingLawDiscoveryContextDistribution: Record<string, number>;
  genomicsRowCount: number;
  genomicsSelectionAccuracyMean0to1: number;
  genomicsPreprocessingQualityMean0to1: number;
  genomicsStatisticalAnalysisAccuracyMean0to1: number;
  genomicsReferenceCoverage0to1: number;
  genomicsFormatConformanceRate0to1: number;
  genomicsExpertCurationCoverage0to1: number;
  genomicsStageDistribution: Record<LiveDriftGenomicsTaskStage, number>;
  genomicsContextDistribution: Record<string, number>;
  agenticSearchRowCount: number;
  agenticSearchPlanningScoreMean0to1: number;
  agenticSearchQueryDecompositionScoreMean0to1: number;
  agenticSearchRelevanceScoreMean0to1: number;
  agenticSearchSynthesisScoreMean0to1: number;
  agenticSearchCitationCoverage0to1: number;
  agenticSearchTraceCoverage0to1: number;
  agenticSearchDatasetFamilyDistribution: Record<LiveDriftAgenticSearchDatasetFamily, number>;
  agenticSearchQueryTypeDistribution: Record<LiveDriftAgenticSearchQueryType, number>;
  agenticSearchToolContextDistribution: Record<string, number>;
  documentDatasetRowCount: number;
  documentDatasetQaAccuracyMean0to1: number;
  documentDatasetSummaryQualityMean0to1: number;
  documentDatasetRagFaithfulnessMean0to1: number;
  documentDatasetNumGuardCoverage0to1: number;
  documentDatasetNumericMismatchRate0to1: number;
  documentDatasetEvidenceCoverage0to1: number;
  documentDatasetTokenSavingsRatio: number;
  documentDatasetThroughputDocsPerSec: number;
  documentDatasetMemoryRssMb: number;
  documentDatasetTaskDistribution: Record<LiveDriftDocumentDatasetTask, number>;
  documentDatasetFormatDistribution: Record<LiveDriftDocumentDatasetSourceFormat, number>;
  documentDatasetExportTargetDistribution: Record<LiveDriftDocumentDatasetExportTarget, number>;
  documentDatasetPipelineContextDistribution: Record<string, number>;
  cpuAgenticRowCount: number;
  cpuAgenticLatencyP50Ms: number;
  cpuAgenticLatencyP95Ms: number;
  cpuAgenticLatencyP99Ms: number;
  cpuAgenticThroughputRequestsPerSec: number;
  cpuAgenticCpuUtilizationMean0to1: number;
  cpuAgenticGpuUtilizationMean0to1: number;
  cpuAgenticMemoryRssMb: number;
  cpuAgenticToolExecutionShareMean0to1: number;
  cpuAgenticLlmInferenceShareMean0to1: number;
  cpuAgenticFrameworkOverheadShareMean0to1: number;
  cpuAgenticEvidenceCoverage0to1: number;
  cpuAgenticWorkloadDistribution: Record<LiveDriftCpuAgenticWorkloadFamily, number>;
  cpuAgenticRuntimeDistribution: Record<LiveDriftCpuAgenticRuntime, number>;
  cpuAgenticScheduleDistribution: Record<LiveDriftCpuAgenticScheduleMode, number>;
  cpuAgenticContextDistribution: Record<string, number>;
  evalTechniqueRowCount: number;
  evalTechniqueExactMatchAccuracyMean0to1: number;
  evalTechniqueLlmJudgeAgreementMean0to1: number;
  evalTechniqueStructuredValidationMean0to1: number;
  evalTechniqueDynamicGroundTruthPassRate0to1: number;
  evalTechniqueTrajectoryMatchRate0to1: number;
  evalTechniqueToolPrecisionMean0to1: number;
  evalTechniqueToolImprovementDeltaMean0to1: number;
  evalTechniqueRagFaithfulnessMean0to1: number;
  evalTechniqueRagContextRelevanceMean0to1: number;
  evalTechniqueRealtimeFeedbackMean0to1: number;
  evalTechniquePairwiseWinRate0to1: number;
  evalTechniqueSimulationGoalCompletionMean0to1: number;
  evalTechniqueAlgorithmicFeedbackCoverage0to1: number;
  evalTechniqueEvidenceCoverage0to1: number;
  evalTechniqueDistribution: Record<LiveDriftEvalTechnique, number>;
  evalTechniqueContextDistribution: Record<string, number>;
  sapAgentEvalRowCount: number;
  sapAgentEvalObjectiveCoverage0to1: number;
  sapAgentEvalProcessCoverage0to1: number;
  sapAgentEvalEnterpriseContextCoverage0to1: number;
  sapAgentEvalEvidenceCoverage0to1: number;
  sapAgentEvalObjectiveDistribution: Record<LiveDriftSapAgentEvalObjective, number>;
  sapAgentEvalProcessDistribution: Record<LiveDriftSapAgentEvalProcess, number>;
  sapAgentEvalEnterpriseContextDistribution: Record<LiveDriftSapAgentEvalEnterpriseContext, number>;
  agentEvalObservabilityRowCount: number;
  agentEvalObservabilityConfigCoverage0to1: number;
  agentEvalObservabilityTelemetryCoverage0to1: number;
  agentEvalObservabilityEvidenceCoverage0to1: number;
  agentEvalObservabilityMetricSetDistribution: Record<LiveDriftAgentEvalObservabilityMetricSet, number>;
  agentEvalObservabilityTelemetryDistribution: Record<LiveDriftAgentEvalObservabilityTelemetry, number>;
  hedraRagRowCount: number;
  hedraRagLatencyP95Ms: number;
  hedraRagThroughputRequestsPerSec: number;
  hedraRagResourceMemoryGbMean: number;
  hedraRagReplayPassRate0to1: number;
  hedraRagEvidenceCoverage0to1: number;
  hedraRagWorkflowDistribution: Record<LiveDriftHedraRagWorkflow, number>;
  hedraRagBaselineFrameworkDistribution: Record<LiveDriftHedraRagBaselineFramework, number>;
  hedraRagRuntimeContextDistribution: Record<string, number>;
  agentEvalHarnessRowCount: number;
  agentEvalHarnessToolSuccessRate0to1: number;
  agentEvalHarnessHallucinationRate0to1: number;
  agentEvalHarnessLatencyP95Ms: number;
  agentEvalHarnessCostUsdMean: number;
  agentEvalHarnessTraceCoverage0to1: number;
  agentEvalHarnessEvidenceCoverage0to1: number;
  agentEvalHarnessFrameworkDistribution: Record<LiveDriftAgentEvalHarnessFramework, number>;
  agentEvalHarnessTraceModeDistribution: Record<LiveDriftAgentEvalHarnessTraceMode, number>;
  agentEvalHarnessMetricContextDistribution: Record<LiveDriftAgentEvalHarnessMetricContext, number>;
  strandsBenchmarkHarnessRowCount: number;
  strandsBenchmarkHarnessTaskSuccessRate0to1: number;
  strandsBenchmarkHarnessPatchApplyRate0to1: number;
  strandsBenchmarkHarnessTestPassRate0to1: number;
  strandsBenchmarkHarnessTrajectoryCoverage0to1: number;
  strandsBenchmarkHarnessEvidenceCoverage0to1: number;
  strandsBenchmarkHarnessLatencyP95Ms: number;
  strandsBenchmarkHarnessCostUsdMean: number;
  strandsBenchmarkHarnessBenchmarkSuiteDistribution: Record<LiveDriftStrandsBenchmarkSuite, number>;
  strandsBenchmarkHarnessRuntimeDistribution: Record<LiveDriftStrandsHarnessRuntime, number>;
  strandsBenchmarkHarnessTaskFamilyDistribution: Record<LiveDriftStrandsTaskFamily, number>;
  privacyWebRowCount: number;
  privacyWebDataMinimizationPassRate0to1: number;
  privacyWebLeakageRate0to1: number;
  privacyWebUnnecessaryDisclosureRate0to1: number;
  privacyWebSensitiveFieldExposureMean: number;
  privacyWebTaskSuccessRate0to1: number;
  privacyWebModalLeakageDeltaMean0to1: number;
  privacyWebEvidenceCoverage0to1: number;
  privacyWebEnvironmentDistribution: Record<LiveDriftPrivacyWebEnvironment, number>;
  privacyWebObservationModeDistribution: Record<LiveDriftPrivacyWebObservationMode, number>;
  privacyWebContextDistribution: Record<string, number>;
  localSystemRowCount: number;
  localSystemThermalBaselineDeviationMean0to1: number;
  localSystemVoltageSpcAnomalyRate0to1: number;
  localSystemProcessIdentityCoverage0to1: number;
  localSystemGhostDriverDetectionCoverage0to1: number;
  localSystemProactiveAlertCoverage0to1: number;
  localSystemLocalOnlyPrivacyCoverage0to1: number;
  localSystemEvidenceCoverage0to1: number;
  localSystemWorkloadContextDistribution: Record<LiveDriftLocalSystemWorkloadContext, number>;
  localSystemHardwareContextDistribution: Record<string, number>;
  observabilityRowCount: number;
  observabilityResolutionScoreMean0to1: number;
  observabilityEvidenceCoverage0to1: number;
  observabilityDeterministicCheckPassRate0to1: number;
  observabilityRubricScoreMean0to1: number;
  observabilityTraceCoverage0to1: number;
  observabilityReportCoverage0to1: number;
  observabilityScenarioClockAlignmentRate0to1: number;
  observabilityIncidentContextDistribution: Record<string, number>;
  observabilityTaskTypeDistribution: Record<LiveDriftObservabilityTaskType, number>;
  observabilityDataSourceDistribution: Record<LiveDriftObservabilityDataSource, number>;
  observabilityToolModeDistribution: Record<LiveDriftObservabilityToolMode, number>;
  ollamaMetricsRowCount: number;
  ollamaMetricsPromptTokensMean: number;
  ollamaMetricsGeneratedTokensMean: number;
  ollamaMetricsRequestDurationP95Seconds: number;
  ollamaMetricsTimePerTokenSeconds: number;
  ollamaMetricsLoadedModelCountMean: number;
  ollamaMetricsModelLoadedRate0to1: number;
  ollamaMetricsModelRamMbMean: number;
  ollamaMetricsRequestErrorRate0to1: number;
  ollamaMetricsEvidenceCoverage0to1: number;
  ollamaMetricsModelDistribution: Record<string, number>;
  ollamaMetricsDeploymentDistribution: Record<LiveDriftOllamaMetricsDeploymentMode, number>;
  ollamaMetricsProxyContextDistribution: Record<string, number>;
  webOperatorRowCount: number;
  webOperatorSelfReportSuccessRate0to1: number;
  webOperatorLlmEvaluationSuccessRate0to1: number;
  webOperatorSelfReportOverclaimRate0to1: number;
  webOperatorMismatchRate0to1: number;
  webOperatorTaskReliabilityMean0to1: number;
  webOperatorReplayCoverage0to1: number;
  webOperatorTaskTimeMeanMs: number;
  webOperatorStepLimitViolationRate0to1: number;
  webOperatorContextDistribution: Record<string, number>;
  webOperatorProviderDistribution: Record<string, number>;
  naviBenchRowCount: number;
  naviBenchTaskSuccessRate0to1: number;
  naviBenchCrashRate0to1: number;
  naviBenchLowerBoundScoreMean0to1: number;
  naviBenchExcludingCrashedScoreMean0to1: number;
  naviBenchUpperBoundScoreMean0to1: number;
  naviBenchTrajectoryCoverage0to1: number;
  naviBenchVisualizationCoverage0to1: number;
  naviBenchEvidenceCoverage0to1: number;
  naviBenchStepCountMean: number;
  naviBenchStepLimitViolationRate0to1: number;
  naviBenchWebsiteDomainDistribution: Record<LiveDriftNaviBenchWebsiteDomain, number>;
  naviBenchBrowserModeDistribution: Record<LiveDriftWebOperatorBrowserMode, number>;
  naviBenchEvalContextDistribution: Record<string, number>;
  legalAgentRowCount: number;
  legalAgentFinalSuccessRate0to1: number;
  legalAgentProcessRateMean0to1: number;
  legalAgentToolUseAccuracyMean0to1: number;
  legalAgentCitationCoverage0to1: number;
  legalAgentEvidenceCoverage0to1: number;
  legalAgentTokenCostMean: number;
  legalAgentCorpusDistribution: Record<string, number>;
  legalAgentTaskTypeDistribution: Record<LiveDriftLegalAgentTaskType, number>;
  legalAgentDifficultyDistribution: Record<LiveDriftLegalAgentDifficulty, number>;
  legalAgentToolContextDistribution: Record<string, number>;
  researchGymRowCount: number;
  researchGymScoreImprovementMean0to1: number;
  researchGymSubtaskCompletionRate0to1: number;
  researchGymArtifactCoverage0to1: number;
  researchGymInspectionPassRate0to1: number;
  researchGymBudgetOverrunRate0to1: number;
  researchGymViolationRate0to1: number;
  researchGymExperimentCountMean: number;
  researchGymAsyncJobCountMean: number;
  researchGymRuntimeHoursMean: number;
  researchGymCostUsdMean: number;
  researchGymTaskDomainDistribution: Record<LiveDriftResearchGymTaskDomain, number>;
  researchGymRuntimeContextDistribution: Record<string, number>;
  osUniverseRowCount: number;
  osUniverseTaskSuccessRate0to1: number;
  osUniverseAutoValidationPassRate0to1: number;
  osUniverseValidationErrorRate0to1: number;
  osUniverseEvidenceCoverage0to1: number;
  osUniverseStepCountMean: number;
  osUniverseStepLimitViolationRate0to1: number;
  osUniverseCategoryDistribution: Record<LiveDriftOsUniverseCategory, number>;
  osUniverseLevelDistribution: Record<LiveDriftOsUniverseLevel, number>;
  osUniverseRuntimeContextDistribution: Record<string, number>;
  robustnessStabilityMean0to1: number;
  robustnessStabilityByDimension0to1: Record<string, number>;
  robustnessStabilityScoreCount: number;
  robustnessStabilityRowCoverage0to1: number;
}

export interface LiveDriftReceiptRow {
  traceId: string;
  scenarioId: string;
  timestamp: string;
  score0to1: number;
  behaviorSignature: string;
  lifecycleStage: LiveDriftLifecycleStage;
  taskCategory: string | null;
  domain: string | null;
  agentEvaluationDimension: LiveDriftAgentEvaluationDimension;
  perturbationFamily: string | null;
  perturbationSeverity0to1: number | null;
  robustnessStabilityScores0to1: Record<string, number>;
  arenaId: string | null;
  environmentId: string | null;
  referencePoolId: string | null;
  executionMode: LiveDriftExecutionMode;
  agentScaffoldId: string | null;
  frameworkConfigHash: string | null;
  toolRegistryHash: string | null;
  environmentSnapshotId: string | null;
  solutionPathCount: number | null;
  offPathAttemptCount: number | null;
  divergenceMomentum0to1: number | null;
  actionFixationRate0to1: number | null;
  socialHarmPrevalence0to1: number | null;
  socialSentimentMinus1to1: number | null;
  socialSemanticAlignment0to1: number | null;
  socialLexicalDiversity0to1: number | null;
  populationSegmentId: string | null;
  discourseContextId: string | null;
  personaPolicyId: string | null;
  personaDiversityClusterId: string | null;
  personaHumanLikeness0to1: number | null;
  personaBehaviorCoverage0to1: number | null;
  personaTaskGoalPreservation0to1: number | null;
  privacySensitiveDisclosureRate0to1: number | null;
  privacyPeerExposureRate0to1: number | null;
  privacySocialPressureIntensity0to1: number | null;
  privacySafeguardActiveRate0to1: number | null;
  artifactAccuracy0to1: number | null;
  formulaIntegrity0to1: number | null;
  formatQuality0to1: number | null;
  processDefectRate0to1: number | null;
  controlInterpretability0to1: number | null;
  controlInterruptibility0to1: number | null;
  controlCorrectability0to1: number | null;
  controlReversibility0to1: number | null;
  authorityHandoffRate0to1: number | null;
  redTeamBenchmarkId: string | null;
  redTeamDatasetHash: string | null;
  redTeamPromptSetHash: string | null;
  redTeamPromptId: string | null;
  redTeamSubset: LiveDriftRedTeamSubset;
  redTeamRiskCategory: string | null;
  redTeamAttackType: string | null;
  redTeamPolicyContextId: string | null;
  redTeamGuardModelId: string | null;
  redTeamGuardLabel: LiveDriftRedTeamGuardLabel;
  redTeamGuardScore0to1: number | null;
  redTeamUnsafeResponse: boolean | null;
  redTeamComplianceScore0to1: number | null;
  redTeamTaxonomyHash: string | null;
  redTeamResponseHash: string | null;
  piArenaBenchmarkId: string | null;
  piArenaDatasetHash: string | null;
  piArenaDatasetName: string | null;
  piArenaAttackId: string | null;
  piArenaAttackMode: LiveDriftPiArenaAttackMode;
  piArenaAttackConfigHash: string | null;
  piArenaDefenseId: string | null;
  piArenaDefenseConfigHash: string | null;
  piArenaInjectedPromptHash: string | null;
  piArenaModelConfigHash: string | null;
  piArenaEvaluationConfigHash: string | null;
  piArenaResultHash: string | null;
  piArenaAgentBenchmark: LiveDriftPiArenaAgentBenchmark;
  piArenaAgentSuite: string | null;
  piArenaAttackSucceeded: boolean | null;
  piArenaDefenseBlocked: boolean | null;
  piArenaFalsePositive: boolean | null;
  piArenaAgentTaskSuccess: boolean | null;
  piArenaToolCallSuccessRate0to1: number | null;
  backdoorAgentBenchmarkId: string | null;
  backdoorAgentDatasetHash: string | null;
  backdoorAgentTaskId: string | null;
  backdoorAgentTaskFamily: LiveDriftBackdoorAgentTaskFamily;
  backdoorAgentStage: LiveDriftBackdoorAgentStage;
  backdoorAgentAttackId: string | null;
  backdoorAgentAttackFamily: LiveDriftBackdoorAgentAttackFamily;
  backdoorAgentTriggerHash: string | null;
  backdoorAgentPoisonConfigHash: string | null;
  backdoorAgentModelConfigHash: string | null;
  backdoorAgentAgentConfigHash: string | null;
  backdoorAgentRunConfigHash: string | null;
  backdoorAgentTraceHash: string | null;
  backdoorAgentResultHash: string | null;
  backdoorAgentAttackSucceeded: boolean | null;
  backdoorAgentCleanTaskSucceeded: boolean | null;
  backdoorAgentTriggerActivated: boolean | null;
  backdoorAgentTriggerPersisted: boolean | null;
  backdoorAgentTriggerPropagated: boolean | null;
  backdoorAgentTrajectoryCaptured: boolean | null;
  agentSecurityGuardId: string | null;
  agentSecurityPolicyHash: string | null;
  agentSecurityTaintTraceHash: string | null;
  agentSecurityProxyTraceHash: string | null;
  agentSecurityAuditTrailHash: string | null;
  agentSecurityRuntimeTelemetryHash: string | null;
  agentSecurityEvalPackHash: string | null;
  agentSecurityClassifierHash: string | null;
  agentSecuritySourceOriginCoverage0to1: number | null;
  agentSecurityTaintPropagationCoverage0to1: number | null;
  agentSecurityPolicyDecisionAccuracy0to1: number | null;
  agentSecuritySecretScrubRate0to1: number | null;
  agentSecurityAuditTrailIntegrity0to1: number | null;
  agentSecurityAttackEffectiveness0to1: number | null;
  agentSecurityFalsePositiveRate0to1: number | null;
  agentSecurityLatencyP95Ms: number | null;
  agentTestingTaxonomyId: string | null;
  agentTestingMethodologyHash: string | null;
  agentTestingScenarioCatalogHash: string | null;
  agentTestingFaultInjectionPlanHash: string | null;
  agentTestingObservabilityPlanHash: string | null;
  agentTestingSafetyPlanHash: string | null;
  agentTestingStandardsMapHash: string | null;
  agentTestingCategory: string | null;
  agentTestingApproach: string | null;
  agentTestingFaultModel: string | null;
  agentTestingBenchmarkFamily: string | null;
  agentTestingMethodologyCoverage0to1: number | null;
  agentTestingScenarioCoverage0to1: number | null;
  agentTestingFaultInjectionCoverage0to1: number | null;
  agentTestingResiliencePassRate0to1: number | null;
  agentTestingSafetyRegressionRate0to1: number | null;
  agentTestingObservabilitySignalCoverage0to1: number | null;
  chaosBenchmarkId: string | null;
  chaosScenarioId: string | null;
  chaosProfileId: string | null;
  chaosInjectionPlanHash: string | null;
  chaosMutationManifestHash: string | null;
  chaosEndpointContractHash: string | null;
  chaosJudgeConfigHash: string | null;
  chaosTraceBundleHash: string | null;
  chaosScoreLedgerHash: string | null;
  chaosAgentCardHash: string | null;
  chaosImprovementEvalHash: string | null;
  chaosFrameworkId: string | null;
  chaosModality: string | null;
  chaosBenchmarkFamily: string | null;
  chaosProductionReliability0to1: number | null;
  chaosResilienceScore0to1: number | null;
  chaosDrop0to1: number | null;
  chaosRecoveryPassRate0to1: number | null;
  chaosFailureTraceCoverage0to1: number | null;
  recoveryBenchBenchmarkId: string | null;
  recoveryBenchSourceRefHash: string | null;
  recoveryBenchRepositorySnapshotHash: string | null;
  recoveryBenchLicenseRefHash: string | null;
  recoveryBenchTerminalBenchVersion: string | null;
  recoveryBenchInitialTraceSetHash: string | null;
  recoveryBenchTaskId: string | null;
  recoveryBenchFailedTrajectoryHash: string | null;
  recoveryBenchReplayCommandLogHash: string | null;
  recoveryBenchReplayEnvironmentHash: string | null;
  recoveryBenchCorruptedEnvironmentHash: string | null;
  recoveryBenchRecoveryAgentId: string | null;
  recoveryBenchRecoveryAgentConfigHash: string | null;
  recoveryBenchRecoveryModelId: string | null;
  recoveryBenchRecoveryRunConfigHash: string | null;
  recoveryBenchMessageMode: LiveDriftRecoveryBenchMessageMode;
  recoveryBenchAgentHarness: LiveDriftRecoveryBenchHarness;
  recoveryBenchRecoveryTranscriptHash: string | null;
  recoveryBenchRecoveryResultHash: string | null;
  recoveryBenchScoreReportHash: string | null;
  recoveryBenchInitialReward0to1: number | null;
  recoveryBenchRecoveryReward0to1: number | null;
  recoveryBenchInitialFailed: boolean | null;
  recoveryBenchReplaySucceeded: boolean | null;
  recoveryBenchRecoverySucceeded: boolean | null;
  recoveryBenchContextProvided: boolean | null;
  recoveryBenchFailureTraceCoverage0to1: number | null;
  recoveryBenchCorruptedEnvironmentCoverage0to1: number | null;
  recoveryBenchContextCoverage0to1: number | null;
  recoveryBenchEvidenceCoverage0to1: number | null;
  adkRuntimeId: string | null;
  adkFrameworkVersion: string | null;
  adkAgentGraphHash: string | null;
  adkToolRegistryHash: string | null;
  adkEvalDatasetHash: string | null;
  adkEvalCaseHash: string | null;
  adkRunnerConfigHash: string | null;
  adkSessionStateHash: string | null;
  adkLiveRequestQueueHash: string | null;
  adkApiServerRouteHash: string | null;
  adkDeploymentManifestHash: string | null;
  adkModelRoute: string | null;
  adkExecutionMode: LiveDriftAdkExecutionMode;
  adkDeploymentTarget: string | null;
  adkEvalPassRate0to1: number | null;
  adkToolCallSuccessRate0to1: number | null;
  adkGraphCoverage0to1: number | null;
  adkStreamingStability0to1: number | null;
  adkDeploymentReadiness0to1: number | null;
  physicianBenchBenchmarkId: string | null;
  physicianBenchTaskSetVersion: string | null;
  physicianBenchPaperRefHash: string | null;
  physicianBenchTaskId: string | null;
  physicianBenchSpecialty: string | null;
  physicianBenchTaskType: LiveDriftPhysicianBenchTaskType;
  physicianBenchFhirServerImageHash: string | null;
  physicianBenchFhirApiSchemaHash: string | null;
  physicianBenchPatientRecordManifestHash: string | null;
  physicianBenchPatientCohortHash: string | null;
  physicianBenchVerifierCheckpointHash: string | null;
  physicianBenchTrajectoryHash: string | null;
  physicianBenchWorkspaceArtifactHash: string | null;
  physicianBenchEvalLogHash: string | null;
  physicianBenchMetadataHash: string | null;
  physicianBenchModelConfigHash: string | null;
  physicianBenchToolManifestHash: string | null;
  physicianBenchRunConfigHash: string | null;
  physicianBenchTaskSuccess: boolean | null;
  physicianBenchCheckpointPassRate0to1: number | null;
  physicianBenchFhirDataAccessAccuracy0to1: number | null;
  physicianBenchClinicalActionSafety0to1: number | null;
  physicianBenchDocumentationQuality0to1: number | null;
  physicianBenchTrajectoryCaptured: boolean | null;
  physicianBenchArtifactBundleComplete: boolean | null;
  ctfEventId: string | null;
  ctfChallengeId: string | null;
  ctfChallengeCategory: string | null;
  ctfAgentInstanceId: string | null;
  ctfTeamAccountId: string | null;
  ctfFlagAccepted: boolean | null;
  ctfFirstCorrectFlagForwarded: boolean | null;
  ctfExternalSearchUsed: boolean | null;
  ctfIndependenceViolated: boolean | null;
  ctfContaminationRisk0to1: number | null;
  ctfCompetitionImpact0to1: number | null;
  ctfSubmissionCount: number | null;
  ctfTimeToFlagMs: number | null;
  ctfVmImageHash: string | null;
  ctfSandboxProfileHash: string | null;
  ctfCheckpointRubricHash: string | null;
  ctfExecutionTraceHash: string | null;
  ctfCheckpointJudgeRef: string | null;
  ctfIsolationBoundaryId: string | null;
  ctfCheckpointCompletion0to1: number | null;
  ctfPartialCreditScore0to1: number | null;
  ctfIsolationViolated: boolean | null;
  ragEvaluationMode: LiveDriftRagEvaluationMode;
  ragPipelineStrategy: LiveDriftRagPipelineStrategy;
  ragStrategyComparisonId: string | null;
  ragStrategyRunId: string | null;
  ragStrategyManifestHash: string | null;
  ragIndexManifestHash: string | null;
  ragQuerySetHash: string | null;
  ragReferenceAnswerHash: string | null;
  ragEvaluatorConfigHash: string | null;
  ragModelConfigHash: string | null;
  ragStrategyResultHash: string | null;
  ragCorpusId: string | null;
  ragCorpusHash: string | null;
  ragChunkSize: number | null;
  ragChunkOverlap: number | null;
  ragNodeName: string | null;
  ragRetrieverId: string | null;
  ragGeneratorId: string | null;
  ragFrameworkId: string | null;
  ragRetrievalTopK: number | null;
  ragGeneratedDataSuffix: string | null;
  ragGeneratedDataFinalized: boolean | null;
  ragJudgeType: LiveDriftRagJudgeType;
  ragHallucinationEvaluatorEnabled: boolean | null;
  ragAccuracy0to1: number | null;
  ragCompleteness0to1: number | null;
  ragUtilization0to1: number | null;
  ragNumericalAccuracy0to1: number | null;
  ragHallucinationRate0to1: number | null;
  ragDatasetBuilderId: string | null;
  ragDatasetVersion: string | null;
  ragSourceDocumentManifestHash: string | null;
  ragSourceDocumentLicenseId: string | null;
  ragQaPairManifestHash: string | null;
  ragPassageManifestHash: string | null;
  ragBuilderConfigHash: string | null;
  ragPdfParseTraceHash: string | null;
  ragPostprocessManifestHash: string | null;
  ragDatasetTier: LiveDriftRagDatasetTier;
  ragQuestionType: LiveDriftRagQuestionType;
  ragBuilderStage: LiveDriftRagBuilderStage;
  ragQuestionCount: number | null;
  ragSourceDocumentCount: number | null;
  ragPassageGroundingCoverage0to1: number | null;
  ragHumanVerificationCoverage0to1: number | null;
  ragCitationCoverage0to1: number | null;
  ragAnswerSupportCoverage0to1: number | null;
  ragGenerationCostUsd: number | null;
  ragBatchSize: number | null;
  ragDocConcurrency: number | null;
  ragIncrementalOnlyMissing: boolean | null;
  kiteBenchmarkId: string | null;
  kiteSourceRefHash: string | null;
  kiteRepositorySnapshotHash: string | null;
  kiteLicenseRefHash: string | null;
  kiteCorpusManifestHash: string | null;
  kiteDocumentSetId: string | null;
  kiteQuerySetHash: string | null;
  kiteGroundTruthAnswerHash: string | null;
  kiteRubricHash: string | null;
  kiteRagPipelineConfigHash: string | null;
  kiteResponseManifestHash: string | null;
  kiteResultManifestHash: string | null;
  kiteJudgeConfigHash: string | null;
  kiteDatasetFamily: LiveDriftKiteDatasetFamily;
  kiteRagConfigurationId: string | null;
  kiteGradingScale: LiveDriftKiteGradingScale;
  kiteQuestionCount: number | null;
  kiteDocumentCount: number | null;
  kiteGrade0to10: number | null;
  kiteNormalizedGrade0to1: number | null;
  kiteSmallSampleWarning: boolean | null;
  kiteEvidenceCoverage0to1: number | null;
  pokerEvalBenchmarkId: string | null;
  pokerEvalSourceRefHash: string | null;
  pokerEvalRepositorySnapshotHash: string | null;
  pokerEvalPackageRefHash: string | null;
  pokerEvalCitationRefHash: string | null;
  pokerEvalSimulationConfigHash: string | null;
  pokerEvalAgentConfigHash: string | null;
  pokerEvalOpponentPoolHash: string | null;
  pokerEvalRunManifestHash: string | null;
  pokerEvalHandHistoryManifestHash: string | null;
  pokerEvalMetricReportHash: string | null;
  pokerEvalGameType: LiveDriftPokerEvalGameType;
  pokerEvalTableSize: number | null;
  pokerEvalBlindStructureHash: string | null;
  pokerEvalHandCount: number | null;
  pokerEvalBbPer100: number | null;
  pokerEvalAllInAdjBbPer100: number | null;
  pokerEvalEvBbPer100: number | null;
  pokerEvalVpipRate0to1: number | null;
  pokerEvalEvidenceCoverage0to1: number | null;
  llmRagEvalSuiteId: string | null;
  llmRagEvalRunId: string | null;
  llmRagCandidateManifestHash: string | null;
  llmRagReferenceManifestHash: string | null;
  llmRagMetricSuiteHash: string | null;
  llmRagSemanticMetricId: string | null;
  llmRagBiasMetricId: string | null;
  llmRagHallucinationMetricId: string | null;
  llmRagJudgeConfigHash: string | null;
  llmRagReportHash: string | null;
  llmRagSemanticSimilarity0to1: number | null;
  llmRagBiasRisk0to1: number | null;
  llmRagHallucinationRate0to1: number | null;
  noMiraclBenchmarkId: string | null;
  noMiraclSourceRefHash: string | null;
  noMiraclRepositorySnapshotHash: string | null;
  noMiraclLicenseRefHash: string | null;
  noMiraclDatasetManifestHash: string | null;
  noMiraclLanguageManifestHash: string | null;
  noMiraclQrelsManifestHash: string | null;
  noMiraclPassagePoolHash: string | null;
  noMiraclRetrievalRunHash: string | null;
  noMiraclModelRouteHash: string | null;
  noMiraclGenerationTraceHash: string | null;
  noMiraclEvaluationReportHash: string | null;
  noMiraclBaselineResultHash: string | null;
  noMiraclLiveResultHash: string | null;
  noMiraclAlertPolicyHash: string | null;
  noMiraclLanguage: string | null;
  noMiraclSubset: LiveDriftNoMiraclSubset;
  noMiraclQueryIdHash: string | null;
  noMiraclPassageSetHash: string | null;
  noMiraclRelevantJudgmentHash: string | null;
  noMiraclNonRelevantJudgmentHash: string | null;
  noMiraclRelevanceDecisionCorrect: boolean | null;
  noMiraclAbstainedWhenUnanswerable: boolean | null;
  noMiraclHallucinated: boolean | null;
  noMiraclErrored: boolean | null;
  noMiraclRelevanceAccuracy0to1: number | null;
  noMiraclAbstentionAccuracy0to1: number | null;
  noMiraclHallucinationRate0to1: number | null;
  noMiraclErrorRate0to1: number | null;
  noMiraclEvidenceCoverage0to1: number | null;
  scalingLawBenchmarkId: string | null;
  scalingLawPaperRefHash: string | null;
  scalingLawEvalRunId: string | null;
  scalingLawTaskId: string | null;
  scalingLawTaskType: LiveDriftScalingLawTaskType;
  scalingLawDatasetManifestHash: string | null;
  scalingLawTrainSplitHash: string | null;
  scalingLawTestSplitHash: string | null;
  scalingLawSourceExperimentManifestHash: string | null;
  scalingLawTaskConfigHash: string | null;
  scalingLawEvolutionConfigHash: string | null;
  scalingLawEvaluatorConfigHash: string | null;
  scalingLawModelRouteHash: string | null;
  scalingLawProgramArtifactHash: string | null;
  scalingLawCheckpointTraceHash: string | null;
  scalingLawResultReportHash: string | null;
  scalingLawFormulaFamily: string | null;
  scalingLawExtrapolationRegime: string | null;
  scalingLawR2: number | null;
  scalingLawNmse: number | null;
  scalingLawNmae: number | null;
  agenticSearchBenchmarkId: string | null;
  agenticSearchDatasetFamily: LiveDriftAgenticSearchDatasetFamily;
  agenticSearchQueryType: LiveDriftAgenticSearchQueryType;
  agenticSearchQueryId: string | null;
  agenticSearchTaskId: string | null;
  agenticSearchSourceManifestHash: string | null;
  agenticSearchToolConfigHash: string | null;
  agenticSearchPlannerTraceHash: string | null;
  agenticSearchSearchTraceHash: string | null;
  agenticSearchCitationTraceHash: string | null;
  agenticSearchSynthesisTraceHash: string | null;
  agenticSearchResultManifestHash: string | null;
  agenticSearchPlanningScore0to1: number | null;
  agenticSearchQueryDecompositionScore0to1: number | null;
  agenticSearchRelevanceScore0to1: number | null;
  agenticSearchSynthesisScore0to1: number | null;
  agenticSearchCitationCoverage0to1: number | null;
  documentDatasetPipelineId: string | null;
  documentDatasetSourceFormat: LiveDriftDocumentDatasetSourceFormat;
  documentDatasetTask: LiveDriftDocumentDatasetTask;
  documentDatasetExportTarget: LiveDriftDocumentDatasetExportTarget;
  documentDatasetCorpusHash: string | null;
  documentDatasetIndexManifestHash: string | null;
  documentDatasetDocumentRecordHash: string | null;
  documentDatasetPageRecordHash: string | null;
  documentDatasetCellRecordHash: string | null;
  documentDatasetSampleManifestHash: string | null;
  documentDatasetExportManifestHash: string | null;
  documentDatasetBenchMetricHash: string | null;
  documentDatasetReportArtifactHash: string | null;
  documentDatasetNumGuardCoverage0to1: number | null;
  documentDatasetNumericMismatchRate0to1: number | null;
  documentDatasetQaAccuracy0to1: number | null;
  documentDatasetSummaryQuality0to1: number | null;
  documentDatasetRagFaithfulness0to1: number | null;
  documentDatasetTokenSavingsRatio: number | null;
  documentDatasetThroughputDocsPerSec: number | null;
  documentDatasetMemoryRssMb: number | null;
  cpuAgenticBenchmarkId: string | null;
  cpuAgenticPaperRefHash: string | null;
  cpuAgenticWorkloadFamily: LiveDriftCpuAgenticWorkloadFamily;
  cpuAgenticFrameworkId: string | null;
  cpuAgenticRuntime: LiveDriftCpuAgenticRuntime;
  cpuAgenticScheduleMode: LiveDriftCpuAgenticScheduleMode;
  cpuAgenticEnvironmentHash: string | null;
  cpuAgenticCondaEnvHash: string | null;
  cpuAgenticHardwareProfileHash: string | null;
  cpuAgenticSystemRequirementsHash: string | null;
  cpuAgenticModelServerConfigHash: string | null;
  cpuAgenticApiKeyBoundaryHash: string | null;
  cpuAgenticWorkloadConfigHash: string | null;
  cpuAgenticDatasetManifestHash: string | null;
  cpuAgenticToolManifestHash: string | null;
  cpuAgenticRunScriptHash: string | null;
  cpuAgenticResultManifestHash: string | null;
  cpuAgenticFigureArtifactHash: string | null;
  cpuAgenticBatchSize: number | null;
  cpuAgenticWorkerCount: number | null;
  cpuAgenticRequestRate: number | null;
  cpuAgenticLatencyP50Ms: number | null;
  cpuAgenticLatencyP95Ms: number | null;
  cpuAgenticLatencyP99Ms: number | null;
  cpuAgenticThroughputRequestsPerSec: number | null;
  cpuAgenticCpuUtilization0to1: number | null;
  cpuAgenticGpuUtilization0to1: number | null;
  cpuAgenticMemoryRssMb: number | null;
  cpuAgenticToolExecutionShare0to1: number | null;
  cpuAgenticLlmInferenceShare0to1: number | null;
  cpuAgenticFrameworkOverheadShare0to1: number | null;
  localSystemMonitorProfileId: string | null;
  localSystemDeviceProfileHash: string | null;
  localSystemHardwareScannerHash: string | null;
  localSystemProcessCatalogHash: string | null;
  localSystemSensorLogHash: string | null;
  localSystemAlertReceiptHash: string | null;
  localSystemWorkloadContext: LiveDriftLocalSystemWorkloadContext;
  localSystemThermalBaselineDeviation0to1: number | null;
  localSystemVoltageSpcAnomaly: boolean | null;
  localSystemVoltageRailId: string | null;
  localSystemProcessIdentityMatched: boolean | null;
  localSystemGhostDriverDetected: boolean | null;
  localSystemGhostDriverHandled: boolean | null;
  localSystemProactiveAlertDelivered: boolean | null;
  localSystemOfflineMode: boolean | null;
  localSystemCloudDisabled: boolean | null;
  localSystemApiKeyAbsent: boolean | null;
  localSystemLocalDataOnly: boolean | null;
  observabilityBenchmarkId: string | null;
  observabilityTaskSpecHash: string | null;
  observabilityGeneratedTaskHash: string | null;
  observabilityEnvironmentConfigHash: string | null;
  observabilityDockerConfigHash: string | null;
  observabilityScenarioClockHash: string | null;
  observabilityScenarioClockAligned: boolean | null;
  observabilityAgentTrajectoryHash: string | null;
  observabilityCommandStdoutHash: string | null;
  observabilityGradingDetailsHash: string | null;
  observabilityRewardHash: string | null;
  observabilityResultJsonHash: string | null;
  observabilityHtmlReportHash: string | null;
  observabilityIncidentContextId: string | null;
  observabilityTaskType: LiveDriftObservabilityTaskType;
  observabilityDataSource: LiveDriftObservabilityDataSource;
  observabilityToolMode: LiveDriftObservabilityToolMode;
  observabilityDeterministicCheckPassRate0to1: number | null;
  observabilityRubricScore0to1: number | null;
  observabilityResolutionScore0to1: number | null;
  observabilityEvidenceCoverage0to1: number | null;
  ollamaMetricsSidecarId: string | null;
  ollamaMetricsSourceRefHash: string | null;
  ollamaMetricsRepositorySnapshotHash: string | null;
  ollamaMetricsLicenseRefHash: string | null;
  ollamaMetricsProxyConfigHash: string | null;
  ollamaMetricsOllamaHostConfigHash: string | null;
  ollamaMetricsPrometheusScrapeConfigHash: string | null;
  ollamaMetricsGrafanaDashboardHash: string | null;
  ollamaMetricsEndpointSnapshotHash: string | null;
  ollamaMetricsBaselineSnapshotHash: string | null;
  ollamaMetricsLiveSnapshotHash: string | null;
  ollamaMetricsAlertPolicyHash: string | null;
  ollamaMetricsModelId: string | null;
  ollamaMetricsDeploymentMode: LiveDriftOllamaMetricsDeploymentMode;
  ollamaMetricsPromptTokensTotal: number | null;
  ollamaMetricsGeneratedTokensTotal: number | null;
  ollamaMetricsRequestDurationP95Seconds: number | null;
  ollamaMetricsTimePerTokenSeconds: number | null;
  ollamaMetricsLoadedModelCount: number | null;
  ollamaMetricsModelLoaded: boolean | null;
  ollamaMetricsModelRamMb: number | null;
  ollamaMetricsRequestErrorRate0to1: number | null;
  ollamaMetricsEvidenceCoverage0to1: number | null;
  webOperatorBenchmarkId: string | null;
  webOperatorDatasetId: string | null;
  webOperatorTaskId: string | null;
  webOperatorProviderId: string | null;
  webOperatorAgentVersion: string | null;
  webOperatorBrowserMode: LiveDriftWebOperatorBrowserMode;
  webOperatorJudgeModelId: string | null;
  webOperatorRunConfigHash: string | null;
  webOperatorReplayArtifactHash: string | null;
  webOperatorResultJsonHash: string | null;
  webOperatorScreenshotHash: string | null;
  webOperatorTrajectoryHash: string | null;
  webOperatorSelfReportedSuccess: boolean | null;
  webOperatorLlmEvaluatedSuccess: boolean | null;
  webOperatorTaskReliability0to1: number | null;
  webOperatorAttemptCount: number | null;
  webOperatorSuccessfulAttemptCount: number | null;
  webOperatorStepCount: number | null;
  webOperatorMaxSteps: number | null;
  webOperatorTimePerTaskMs: number | null;
  naviBenchBenchmarkId: string | null;
  naviBenchSourceRefHash: string | null;
  naviBenchRepositorySnapshotHash: string | null;
  naviBenchLicenseRefHash: string | null;
  naviBenchDatasetRefHash: string | null;
  naviBenchBlogRefHash: string | null;
  naviBenchTaskId: string | null;
  naviBenchWebsiteDomain: LiveDriftNaviBenchWebsiteDomain;
  naviBenchTaskConfigHash: string | null;
  naviBenchEvaluatorConfigHash: string | null;
  naviBenchAgentConfigHash: string | null;
  naviBenchBrowserMode: LiveDriftWebOperatorBrowserMode;
  naviBenchBrowserProviderHash: string | null;
  naviBenchBaselineResultHash: string | null;
  naviBenchLiveResultHash: string | null;
  naviBenchTrajectoryHash: string | null;
  naviBenchVisualizationArtifactHash: string | null;
  naviBenchScreenshotTraceHash: string | null;
  naviBenchAlertReceiptHash: string | null;
  naviBenchTaskFinished: boolean | null;
  naviBenchTaskCrashed: boolean | null;
  naviBenchTaskSuccess: boolean | null;
  naviBenchLowerBoundScore0to1: number | null;
  naviBenchExcludingCrashedScore0to1: number | null;
  naviBenchUpperBoundScore0to1: number | null;
  naviBenchStepCount: number | null;
  naviBenchMaxSteps: number | null;
  naviBenchEvidenceCoverage0to1: number | null;
  legalAgentBenchmarkId: string | null;
  legalAgentDatasetHash: string | null;
  legalAgentCorpusId: string | null;
  legalAgentTaskId: string | null;
  legalAgentTaskType: LiveDriftLegalAgentTaskType;
  legalAgentDifficulty: LiveDriftLegalAgentDifficulty;
  legalAgentPlanningTreeHash: string | null;
  legalAgentToolManifestHash: string | null;
  legalAgentToolRunTraceHash: string | null;
  legalAgentIntermediateStepAnnotationHash: string | null;
  legalAgentProcessTraceHash: string | null;
  legalAgentOutputHash: string | null;
  legalAgentReferenceAnswerHash: string | null;
  legalAgentEvaluationReportHash: string | null;
  legalAgentTokenRecordHash: string | null;
  legalAgentFinalSuccess: boolean | null;
  legalAgentProcessRate0to1: number | null;
  legalAgentToolUseAccuracy0to1: number | null;
  legalAgentCitationCoverage0to1: number | null;
  legalAgentTokenCost: number | null;
  researchGymBenchmarkId: string | null;
  researchGymPaperRefHash: string | null;
  researchGymTaskId: string | null;
  researchGymTaskDomain: LiveDriftResearchGymTaskDomain;
  researchGymTaskManifestHash: string | null;
  researchGymPrunedRepoHash: string | null;
  researchGymDatasetManifestHash: string | null;
  researchGymEvaluationHarnessHash: string | null;
  researchGymBaselineScoreManifestHash: string | null;
  researchGymGradingScriptHash: string | null;
  researchGymWithheldSolutionPolicyHash: string | null;
  researchGymRunConfigHash: string | null;
  researchGymRuntime: LiveDriftResearchGymRuntime;
  researchGymRuntimeImageHash: string | null;
  researchGymAgentAdapterHash: string | null;
  researchGymWorkspaceSnapshotHash: string | null;
  researchGymTranscriptHash: string | null;
  researchGymCostSummaryHash: string | null;
  researchGymStatusHash: string | null;
  researchGymPlanHash: string | null;
  researchGymInspectionReportHash: string | null;
  researchGymViolationReportHash: string | null;
  researchGymBaselineScore0to1: number | null;
  researchGymCandidateScore0to1: number | null;
  researchGymScoreImprovement0to1: number | null;
  researchGymSubtaskCount: number | null;
  researchGymCompletedSubtaskCount: number | null;
  researchGymExperimentCount: number | null;
  researchGymAsyncJobCount: number | null;
  researchGymBudgetHours: number | null;
  researchGymApiBudgetUsd: number | null;
  researchGymActualRuntimeHours: number | null;
  researchGymActualCostUsd: number | null;
  researchGymInspectionPassed: boolean | null;
  researchGymBudgetExceeded: boolean | null;
  researchGymViolationDetected: boolean | null;
  researchGymArtifactCoverage0to1: number | null;
  osUniverseBenchmarkId: string | null;
  osUniverseSourceRefHash: string | null;
  osUniverseRepositorySnapshotHash: string | null;
  osUniverseLicenseRefHash: string | null;
  osUniversePaperRefHash: string | null;
  osUniverseTestcaseId: string | null;
  osUniverseTaskCategory: LiveDriftOsUniverseCategory;
  osUniverseComplexityLevel: LiveDriftOsUniverseLevel;
  osUniverseTestcaseManifestHash: string | null;
  osUniverseAgentConfigHash: string | null;
  osUniverseRunnerConfigHash: string | null;
  osUniverseRuntime: LiveDriftOsUniverseRuntime;
  osUniverseRuntimeImageHash: string | null;
  osUniverseDependencyLockHash: string | null;
  osUniverseValidatorConfigHash: string | null;
  osUniverseValidationReportHash: string | null;
  osUniverseResultArtifactHash: string | null;
  osUniverseViewerArtifactHash: string | null;
  osUniverseTrajectoryHash: string | null;
  osUniverseScreenshotTraceHash: string | null;
  osUniverseTaskSuccess: boolean | null;
  osUniverseAutoValidationPassed: boolean | null;
  osUniverseValidationErrorRate0to1: number | null;
  osUniverseStepCount: number | null;
  osUniverseMaxSteps: number | null;
  osUniverseEvidenceCoverage0to1: number | null;
  evalTechniqueSuiteId: string | null;
  evalTechniqueTechnique: LiveDriftEvalTechnique;
  evalTechniqueNotebookHash: string | null;
  evalTechniqueDatasetHash: string | null;
  evalTechniqueReferenceAnswerHash: string | null;
  evalTechniqueGroundTruthCodeHash: string | null;
  evalTechniqueTrajectorySpecHash: string | null;
  evalTechniqueToolSchemaHash: string | null;
  evalTechniqueRagSourceDocumentHash: string | null;
  evalTechniqueJudgeConfigHash: string | null;
  evalTechniqueCallbackConfigHash: string | null;
  evalTechniqueBatchJobHash: string | null;
  evalTechniqueLangsmithProjectId: string | null;
  evalTechniqueLangchainConfigHash: string | null;
  evalTechniqueExactMatchAccuracy0to1: number | null;
  evalTechniqueLlmJudgeAgreement0to1: number | null;
  evalTechniqueStructuredValidationScore0to1: number | null;
  evalTechniqueDynamicGroundTruthPassRate0to1: number | null;
  evalTechniqueTrajectoryMatchRate0to1: number | null;
  evalTechniqueToolPrecision0to1: number | null;
  evalTechniqueToolImprovementDelta0to1: number | null;
  evalTechniqueRagFaithfulness0to1: number | null;
  evalTechniqueRagContextRelevance0to1: number | null;
  evalTechniqueRealtimeFeedbackScore0to1: number | null;
  evalTechniquePairwiseWinRate0to1: number | null;
  evalTechniqueSimulationGoalCompletion0to1: number | null;
  evalTechniqueAlgorithmicFeedbackCoverage0to1: number | null;
  sapAgentEvalTutorialId: string | null;
  sapAgentEvalSourceRefHash: string | null;
  sapAgentEvalRepositorySnapshotHash: string | null;
  sapAgentEvalLicenseRefHash: string | null;
  sapAgentEvalPaperRefHash: string | null;
  sapAgentEvalNotebookHash: string | null;
  sapAgentEvalDatasetManifestHash: string | null;
  sapAgentEvalBaselineLogManifestHash: string | null;
  sapAgentEvalLiveSampleManifestHash: string | null;
  sapAgentEvalMetricConfigHash: string | null;
  sapAgentEvalToolingConfigHash: string | null;
  sapAgentEvalRoleAccessPolicyHash: string | null;
  sapAgentEvalReliabilityPolicyHash: string | null;
  sapAgentEvalCompliancePolicyHash: string | null;
  sapAgentEvalAlertReceiptHash: string | null;
  sapAgentEvalObjective: LiveDriftSapAgentEvalObjective;
  sapAgentEvalProcess: LiveDriftSapAgentEvalProcess;
  sapAgentEvalEnterpriseContext: LiveDriftSapAgentEvalEnterpriseContext;
  sapAgentEvalObjectiveCoverage0to1: number | null;
  sapAgentEvalProcessCoverage0to1: number | null;
  sapAgentEvalEnterpriseContextCoverage0to1: number | null;
  sapAgentEvalEvidenceCoverage0to1: number | null;
  agentEvalObservabilitySourceRefHash: string | null;
  agentEvalObservabilityRepositorySnapshotHash: string | null;
  agentEvalObservabilityLicenseRefHash: string | null;
  agentEvalObservabilityAgentConfigHash: string | null;
  agentEvalObservabilityEvalDatasetHash: string | null;
  agentEvalObservabilityPromptVariantHash: string | null;
  agentEvalObservabilityModelConfigHash: string | null;
  agentEvalObservabilityRagIndexHash: string | null;
  agentEvalObservabilityMetricConfigHash: string | null;
  agentEvalObservabilityBaselineEvalResultHash: string | null;
  agentEvalObservabilityLiveEvalResultHash: string | null;
  agentEvalObservabilityOpenTelemetryTraceHash: string | null;
  agentEvalObservabilityApplicationInsightsHash: string | null;
  agentEvalObservabilityEventHubHash: string | null;
  agentEvalObservabilityKustoPolicyHash: string | null;
  agentEvalObservabilityFabricDashboardHash: string | null;
  agentEvalObservabilityAlertReceiptHash: string | null;
  agentEvalObservabilityMetricSet: LiveDriftAgentEvalObservabilityMetricSet;
  agentEvalObservabilityTelemetry: LiveDriftAgentEvalObservabilityTelemetry;
  agentEvalObservabilityConfigCoverage0to1: number | null;
  agentEvalObservabilityTelemetryCoverage0to1: number | null;
  agentEvalObservabilityEvidenceCoverage0to1: number | null;
  hedraRagArtifactId: string | null;
  hedraRagSourceRefHash: string | null;
  hedraRagRepositorySnapshotHash: string | null;
  hedraRagLicenseStatus: LiveDriftSourceLicenseStatus;
  hedraRagLicenseRefHash: string | null;
  hedraRagLicenseReviewHash: string | null;
  hedraRagPaperRefHash: string | null;
  hedraRagArtifactReadmeHash: string | null;
  hedraRagWorkflow: LiveDriftHedraRagWorkflow;
  hedraRagBaselineFramework: LiveDriftHedraRagBaselineFramework;
  hedraRagRuntime: LiveDriftHedraRagRuntime;
  hedraRagDatasetManifestHash: string | null;
  hedraRagCorpusManifestHash: string | null;
  hedraRagIndexManifestHash: string | null;
  hedraRagDependencyManifestHash: string | null;
  hedraRagEnvironmentConfigHash: string | null;
  hedraRagRunScriptHash: string | null;
  hedraRagFigureId: string | null;
  hedraRagResultCsvHash: string | null;
  hedraRagPlotArtifactHash: string | null;
  hedraRagBaselineResultHash: string | null;
  hedraRagLiveResultHash: string | null;
  hedraRagAlertPolicyHash: string | null;
  hedraRagResourceProfileHash: string | null;
  hedraRagGpuProfileHash: string | null;
  hedraRagLatencyP95Ms: number | null;
  hedraRagThroughputRequestsPerSec: number | null;
  hedraRagMemoryGb: number | null;
  hedraRagReplayPassed: boolean | null;
  hedraRagReplayPassRate0to1: number | null;
  hedraRagEvidenceCoverage0to1: number | null;
  agentEvalHarnessRunId: string | null;
  agentEvalHarnessSourceRefHash: string | null;
  agentEvalHarnessRepositorySnapshotHash: string | null;
  agentEvalHarnessLicenseRefHash: string | null;
  agentEvalHarnessTraceSchemaHash: string | null;
  agentEvalHarnessTraceCollectorHash: string | null;
  agentEvalHarnessTraceWriterHash: string | null;
  agentEvalHarnessAdapterConfigHash: string | null;
  agentEvalHarnessFramework: LiveDriftAgentEvalHarnessFramework;
  agentEvalHarnessTraceMode: LiveDriftAgentEvalHarnessTraceMode;
  agentEvalHarnessMetricContext: LiveDriftAgentEvalHarnessMetricContext;
  agentEvalHarnessTraceManifestHash: string | null;
  agentEvalHarnessDatasetManifestHash: string | null;
  agentEvalHarnessTaskManifestHash: string | null;
  agentEvalHarnessToolSchemaHash: string | null;
  agentEvalHarnessHallucinationConfigHash: string | null;
  agentEvalHarnessPricingConfigHash: string | null;
  agentEvalHarnessMetricsConfigHash: string | null;
  agentEvalHarnessBaselineRunHash: string | null;
  agentEvalHarnessLiveRunHash: string | null;
  agentEvalHarnessComparisonReportHash: string | null;
  agentEvalHarnessDashboardSnapshotHash: string | null;
  agentEvalHarnessLocalStoragePolicyHash: string | null;
  agentEvalHarnessAlertPolicyHash: string | null;
  agentEvalHarnessReproCommandHash: string | null;
  agentEvalHarnessToolSuccessRate0to1: number | null;
  agentEvalHarnessHallucinationRate0to1: number | null;
  agentEvalHarnessLatencyP95Ms: number | null;
  agentEvalHarnessCostUsd: number | null;
  agentEvalHarnessTraceCoverage0to1: number | null;
  agentEvalHarnessEvidenceCoverage0to1: number | null;
  strandsBenchmarkHarnessRunId: string | null;
  strandsBenchmarkHarnessSourceRefHash: string | null;
  strandsBenchmarkHarnessRepositorySnapshotHash: string | null;
  strandsBenchmarkHarnessLicenseRefHash: string | null;
  strandsBenchmarkHarnessAgentPackageHash: string | null;
  strandsBenchmarkHarnessConfigHash: string | null;
  strandsBenchmarkHarnessModelRouteHash: string | null;
  strandsBenchmarkHarnessPromptTemplateHash: string | null;
  strandsBenchmarkHarnessBenchmarkSuite: LiveDriftStrandsBenchmarkSuite;
  strandsBenchmarkHarnessRuntime: LiveDriftStrandsHarnessRuntime;
  strandsBenchmarkHarnessTaskFamily: LiveDriftStrandsTaskFamily;
  strandsBenchmarkHarnessTaskManifestHash: string | null;
  strandsBenchmarkHarnessDatasetSnapshotHash: string | null;
  strandsBenchmarkHarnessDockerImageHash: string | null;
  strandsBenchmarkHarnessEnvironmentSetupHash: string | null;
  strandsBenchmarkHarnessToolPolicyHash: string | null;
  strandsBenchmarkHarnessTrajectoryHash: string | null;
  strandsBenchmarkHarnessPatchArtifactHash: string | null;
  strandsBenchmarkHarnessTestReportHash: string | null;
  strandsBenchmarkHarnessResultManifestHash: string | null;
  strandsBenchmarkHarnessUploadManifestHash: string | null;
  strandsBenchmarkHarnessSafetyIsolationPolicyHash: string | null;
  strandsBenchmarkHarnessBaselineRunHash: string | null;
  strandsBenchmarkHarnessLiveRunHash: string | null;
  strandsBenchmarkHarnessAlertPolicyHash: string | null;
  strandsBenchmarkHarnessTaskSuccessRate0to1: number | null;
  strandsBenchmarkHarnessPatchApplyRate0to1: number | null;
  strandsBenchmarkHarnessTestPassRate0to1: number | null;
  strandsBenchmarkHarnessTrajectoryCoverage0to1: number | null;
  strandsBenchmarkHarnessEvidenceCoverage0to1: number | null;
  strandsBenchmarkHarnessLatencyP95Ms: number | null;
  strandsBenchmarkHarnessCostUsd: number | null;
  privacyWebBenchmarkId: string | null;
  privacyWebDatasetHash: string | null;
  privacyWebTaskConfigHash: string | null;
  privacyWebEnvironment: LiveDriftPrivacyWebEnvironment;
  privacyWebObservationMode: LiveDriftPrivacyWebObservationMode;
  privacyWebActionSetTag: string | null;
  privacyWebInstructionConfigHash: string | null;
  privacyWebCookieStateHash: string | null;
  privacyWebEnvironmentResetHash: string | null;
  privacyWebDataMinimizationPolicyHash: string | null;
  privacyWebAllowedInfoManifestHash: string | null;
  privacyWebSensitiveInfoManifestHash: string | null;
  privacyWebTrajectoryHash: string | null;
  privacyWebResultArtifactHash: string | null;
  privacyWebLeakageJudgeHash: string | null;
  privacyWebCaptioningModelHash: string | null;
  privacyWebModelRouteHash: string | null;
  privacyWebDataMinimizationPassRate0to1: number | null;
  privacyWebLeakageRate0to1: number | null;
  privacyWebUnnecessaryDisclosureRate0to1: number | null;
  privacyWebSensitiveFieldExposureCount: number | null;
  privacyWebTaskSuccessRate0to1: number | null;
  privacyWebModalLeakageDelta0to1: number | null;
  genomicsTaskStage: LiveDriftGenomicsTaskStage;
  genomicsProblemId: string | null;
  genomicsTraitId: string | null;
  genomicsConditionId: string | null;
  genomicsCohortId: string | null;
  genomicsReferenceDatasetHash: string | null;
  genomicsPredictionDatasetHash: string | null;
  genomicsMetadataHash: string | null;
  genomicsToolchainHash: string | null;
  genomicsExpertAnnotationHash: string | null;
  genomicsFormatConformant: boolean | null;
  genomicsFormatErrorCount: number | null;
  genomicsReferenceOutputMatched: boolean | null;
  genomicsSelectionAccuracy0to1: number | null;
  genomicsPreprocessingQuality0to1: number | null;
  genomicsStatisticalAnalysisAccuracy0to1: number | null;
  interactionTurnCount: number | null;
  invalidActionRate0to1: number | null;
  errorAttributionRate0to1: number | null;
  toolUseReward0to1: number | null;
  toolAnswerVerification0to1: number | null;
  toolJudgeAgreement0to1: number | null;
  toolCallValidity0to1: number | null;
  toolRolloutDiversity0to1: number | null;
  toolEvalImprovementDelta0to1: number | null;
  toolRlModelId: string | null;
  toolRlDatasetHash: string | null;
  toolRlRewardRubricHash: string | null;
  toolRlVerifierHash: string | null;
  toolRlEnvironmentHash: string | null;
  toolRlRolloutConfigHash: string | null;
  toolRlJudgeModelId: string | null;
  credenceEngineBenchmarkId: string | null;
  credenceEngineSourceRefHash: string | null;
  credenceEngineRepositorySnapshotHash: string | null;
  credenceEngineLicenseRefHash: string | null;
  credenceEngineArchivedStatusHash: string | null;
  credenceEngineReadmeBlobHash: string | null;
  credenceEngineSpecBlobHash: string | null;
  credenceEnginePackageManifestHash: string | null;
  credenceEngineLockfileHash: string | null;
  credenceEngineResultsArtifactHash: string | null;
  credenceEngineExperimentManifestHash: string | null;
  credenceEngineBenchmarkHarnessHash: string | null;
  credenceEngineTestSuiteHash: string | null;
  credenceEnginePosteriorTraceHash: string | null;
  credenceEngineVoiPolicyHash: string | null;
  credenceEngineExpectedUtilityPolicyHash: string | null;
  credenceEngineBaselineResultHash: string | null;
  credenceEngineLiveResultHash: string | null;
  credenceEngineDriftStatisticHash: string | null;
  credenceEngineAlertReceiptHash: string | null;
  credenceEngineExperimentMode: LiveDriftCredenceEngineExperimentMode;
  credenceEngineDecisionPolicy: LiveDriftCredenceEngineDecisionPolicy;
  credenceEngineDecisionQuality0to1: number | null;
  credenceEnginePosteriorCalibration0to1: number | null;
  credenceEngineVoiEfficiency0to1: number | null;
  credenceEngineExpectedUtilityGain0to1: number | null;
  credenceEngineEvidenceCoverage0to1: number | null;
  tradingMarketRegimeId: string | null;
  tradingStrategyId: string | null;
  tradingRiskPolicyId: string | null;
  tradingAiProviderRouteId: string | null;
  tradingMemorySnapshotHash: string | null;
  tradingChartImageHash: string | null;
  tradingIndicatorSnapshotHash: string | null;
  tradingClaimValidationTraceHash: string | null;
  tradingNewsContextHash: string | null;
  tradingPaperLedgerHash: string | null;
  tradingWinRate0to1: number | null;
  tradingRiskRewardRatio: number | null;
  tradingMaxDrawdown0to1: number | null;
  tradingRealizedPnlPct: number | null;
  tradingRiskLimitViolationRate0to1: number | null;
  tradingClaimValidationFailureRate0to1: number | null;
  tradingVisionChartAgreement0to1: number | null;
  tradingMemoryRetrievalHitRate0to1: number | null;
  tradingProviderFallbackRate0to1: number | null;
  rowHash: string;
  evidenceRefs: string[];
  signedEvidenceRefs: string[];
}

export interface LiveScoreDrift {
  scoreDrop0to1: number;
  passRateDrop0to1: number;
  refusalRateIncrease0to1: number;
  errorRateIncrease0to1: number;
  latencyIncreaseRatio: number;
  costIncreaseRatio: number;
  toolCallMeanShiftRatio: number;
  toolUseRewardDrop0to1: number;
  toolAnswerVerificationDrop0to1: number;
  toolJudgeAgreementDrop0to1: number;
  toolCallValidityDrop0to1: number;
  toolRolloutDiversityDrop0to1: number;
  toolEvalImprovementDrop0to1: number;
  tradingWinRateDrop0to1: number;
  tradingRiskRewardDropRatio: number;
  tradingDrawdownIncrease0to1: number;
  tradingPnlDropPct: number;
  tradingRiskLimitViolationIncrease0to1: number;
  tradingClaimValidationFailureIncrease0to1: number;
  tradingVisionChartAgreementDrop0to1: number;
  tradingMemoryRetrievalHitRateDrop0to1: number;
  tradingProviderFallbackRateIncrease0to1: number;
  interactionTurnMeanShiftRatio: number;
  invalidActionRateIncrease0to1: number;
  errorAttributionRateIncrease0to1: number;
  solutionPathMeanDropRatio: number;
  offPathAttemptMeanDropRatio: number;
  divergenceMomentumDrop0to1: number;
  actionFixationRateIncrease0to1: number;
  socialHarmPrevalenceIncrease0to1: number;
  socialSentimentMeanShift: number;
  socialSemanticAlignmentDrop0to1: number;
  socialLexicalDiversityDrop0to1: number;
  personaHumanLikenessDrop0to1: number;
  personaBehaviorCoverageDrop0to1: number;
  personaTaskGoalPreservationDrop0to1: number;
  privacySensitiveDisclosureRateIncrease0to1: number;
  privacyPeerExposureRateIncrease0to1: number;
  privacySocialPressureIncrease0to1: number;
  privacySafeguardActiveRateDrop0to1: number;
  artifactAccuracyDrop0to1: number;
  formulaIntegrityDrop0to1: number;
  formatQualityDrop0to1: number;
  processDefectRateIncrease0to1: number;
  controlInterpretabilityDrop0to1: number;
  controlInterruptibilityDrop0to1: number;
  controlCorrectabilityDrop0to1: number;
  controlReversibilityDrop0to1: number;
  authorityHandoffRateDrop0to1: number;
  redTeamUnsafeResponseRateIncrease0to1: number;
  redTeamComplianceDrop0to1: number;
  redTeamGuardScoreDrop0to1: number;
  redTeamDatasetCoverageDrop0to1: number;
  redTeamTaxonomyCoverageDrop0to1: number;
  redTeamAttackCoverageDrop0to1: number;
  redTeamGuardCoverageDrop0to1: number;
  piArenaAttackSuccessRateIncrease0to1: number;
  piArenaDefenseBlockRateDrop0to1: number;
  piArenaFalsePositiveRateIncrease0to1: number;
  piArenaAgentTaskSuccessRateDrop0to1: number;
  piArenaToolCallSuccessRateDrop0to1: number;
  piArenaEvidenceCoverageDrop0to1: number;
  backdoorAgentAttackSuccessRateIncrease0to1: number;
  backdoorAgentCleanAccuracyDrop0to1: number;
  backdoorAgentTriggerPersistenceIncrease0to1: number;
  backdoorAgentTriggerPropagationIncrease0to1: number;
  backdoorAgentTrajectoryCoverageDrop0to1: number;
  backdoorAgentEvidenceCoverageDrop0to1: number;
  agentSecuritySourceOriginCoverageDrop0to1: number;
  agentSecurityTaintPropagationCoverageDrop0to1: number;
  agentSecurityPolicyDecisionAccuracyDrop0to1: number;
  agentSecuritySecretScrubRateDrop0to1: number;
  agentSecurityAuditTrailIntegrityDrop0to1: number;
  agentSecurityAttackEffectivenessIncrease0to1: number;
  agentSecurityFalsePositiveRateIncrease0to1: number;
  agentSecurityEvidenceCoverageDrop0to1: number;
  agentSecurityLatencyP95IncreaseRatio: number;
  agentTestingMethodologyCoverageDrop0to1: number;
  agentTestingScenarioCoverageDrop0to1: number;
  agentTestingFaultInjectionCoverageDrop0to1: number;
  agentTestingResiliencePassRateDrop0to1: number;
  agentTestingSafetyRegressionRateIncrease0to1: number;
  agentTestingObservabilitySignalCoverageDrop0to1: number;
  agentTestingEvidenceCoverageDrop0to1: number;
  chaosProductionReliabilityDrop0to1: number;
  chaosResilienceScoreDrop0to1: number;
  chaosDropIncrease0to1: number;
  chaosRecoveryPassRateDrop0to1: number;
  chaosFailureTraceCoverageDrop0to1: number;
  chaosImprovementEvalCoverageDrop0to1: number;
  chaosEvidenceCoverageDrop0to1: number;
  recoveryBenchRecoverySuccessRateDrop0to1: number;
  recoveryBenchRecoveryRewardDrop0to1: number;
  recoveryBenchReplayIntegrityRateDrop0to1: number;
  recoveryBenchFailureTraceCoverageDrop0to1: number;
  recoveryBenchCorruptedEnvironmentCoverageDrop0to1: number;
  recoveryBenchContextCoverageDrop0to1: number;
  recoveryBenchEvidenceCoverageDrop0to1: number;
  adkEvalPassRateDrop0to1: number;
  adkToolCallSuccessRateDrop0to1: number;
  adkGraphCoverageDrop0to1: number;
  adkStreamingStabilityDrop0to1: number;
  adkDeploymentReadinessDrop0to1: number;
  adkEvidenceCoverageDrop0to1: number;
  physicianBenchTaskSuccessRateDrop0to1: number;
  physicianBenchCheckpointPassRateDrop0to1: number;
  physicianBenchFhirDataAccessAccuracyDrop0to1: number;
  physicianBenchClinicalActionSafetyDrop0to1: number;
  physicianBenchDocumentationQualityDrop0to1: number;
  physicianBenchTrajectoryCoverageDrop0to1: number;
  physicianBenchArtifactCoverageDrop0to1: number;
  physicianBenchEvidenceCoverageDrop0to1: number;
  ctfFlagSolveRateDrop0to1: number;
  ctfExternalSearchUseRateIncrease0to1: number;
  ctfContaminationRiskIncrease0to1: number;
  ctfCompetitionImpactIncrease0to1: number;
  ctfIndependenceViolationRate0to1: number;
  ctfFirstCorrectFlagForwardingRateDrop0to1: number;
  ctfCheckpointCompletionDrop0to1: number;
  ctfPartialCreditScoreDrop0to1: number;
  ctfTraceCoverageRateDrop0to1: number;
  ctfIsolationViolationRate0to1: number;
  ragAccuracyDrop0to1: number;
  ragCompletenessDrop0to1: number;
  ragUtilizationDrop0to1: number;
  ragNumericalAccuracyDrop0to1: number;
  ragHallucinationRateIncrease0to1: number;
  ragRetrievalTopKMeanShiftRatio: number;
  ragGeneratedDataFinalCoverageDrop0to1: number;
  ragPassageGroundingCoverageDrop0to1: number;
  ragHumanVerificationCoverageDrop0to1: number;
  ragCitationCoverageDrop0to1: number;
  ragAnswerSupportCoverageDrop0to1: number;
  ragDatasetBuilderEvidenceCoverageDrop0to1: number;
  ragStrategyEvidenceCoverageDrop0to1: number;
  ragGenerationCostIncreaseRatio: number;
  ragQuestionCountDropRatio: number;
  ragSourceDocumentCountDropRatio: number;
  kiteGradeDrop0to10: number;
  kiteNormalizedGradeDrop0to1: number;
  kiteEvidenceCoverageDrop0to1: number;
  kiteQuestionCountDropRatio: number;
  kiteDocumentCountDropRatio: number;
  pokerEvalBbPer100Drop: number;
  pokerEvalAllInAdjBbPer100Drop: number;
  pokerEvalEvBbPer100Drop: number;
  pokerEvalVpipShift0to1: number;
  pokerEvalHandCountDropRatio: number;
  pokerEvalEvidenceCoverageDrop0to1: number;
  llmRagSemanticSimilarityDrop0to1: number;
  llmRagBiasRiskIncrease0to1: number;
  llmRagHallucinationRateIncrease0to1: number;
  llmRagEvalSuiteEvidenceCoverageDrop0to1: number;
  noMiraclRelevanceAccuracyDrop0to1: number;
  noMiraclAbstentionAccuracyDrop0to1: number;
  noMiraclHallucinationRateIncrease0to1: number;
  noMiraclErrorRateIncrease0to1: number;
  noMiraclLanguageCoverageDrop0to1: number;
  noMiraclSubsetCoverageDrop0to1: number;
  noMiraclEvidenceCoverageDrop0to1: number;
  scalingLawR2Drop: number;
  scalingLawNmseIncrease: number;
  scalingLawNmaeIncrease: number;
  scalingLawEvidenceCoverageDrop0to1: number;
  genomicsSelectionAccuracyDrop0to1: number;
  genomicsPreprocessingQualityDrop0to1: number;
  genomicsStatisticalAnalysisAccuracyDrop0to1: number;
  genomicsReferenceCoverageDrop0to1: number;
  genomicsFormatConformanceRateDrop0to1: number;
  genomicsExpertCurationCoverageDrop0to1: number;
  agenticSearchPlanningScoreDrop0to1: number;
  agenticSearchQueryDecompositionDrop0to1: number;
  agenticSearchRelevanceDrop0to1: number;
  agenticSearchSynthesisDrop0to1: number;
  agenticSearchCitationCoverageDrop0to1: number;
  agenticSearchTraceCoverageDrop0to1: number;
  documentDatasetQaAccuracyDrop0to1: number;
  documentDatasetSummaryQualityDrop0to1: number;
  documentDatasetRagFaithfulnessDrop0to1: number;
  documentDatasetNumGuardCoverageDrop0to1: number;
  documentDatasetNumericMismatchRateIncrease0to1: number;
  documentDatasetEvidenceCoverageDrop0to1: number;
  documentDatasetTokenSavingsDropRatio: number;
  documentDatasetThroughputDropRatio: number;
  documentDatasetMemoryIncreaseRatio: number;
  cpuAgenticLatencyP50IncreaseRatio: number;
  cpuAgenticLatencyP95IncreaseRatio: number;
  cpuAgenticLatencyP99IncreaseRatio: number;
  cpuAgenticThroughputDropRatio: number;
  cpuAgenticCpuUtilizationIncrease0to1: number;
  cpuAgenticGpuUtilizationDrop0to1: number;
  cpuAgenticMemoryIncreaseRatio: number;
  cpuAgenticToolExecutionShareIncrease0to1: number;
  cpuAgenticLlmInferenceShareShift0to1: number;
  cpuAgenticFrameworkOverheadShareIncrease0to1: number;
  cpuAgenticEvidenceCoverageDrop0to1: number;
  evalTechniqueExactMatchAccuracyDrop0to1: number;
  evalTechniqueLlmJudgeAgreementDrop0to1: number;
  evalTechniqueStructuredValidationDrop0to1: number;
  evalTechniqueDynamicGroundTruthPassRateDrop0to1: number;
  evalTechniqueTrajectoryMatchRateDrop0to1: number;
  evalTechniqueToolPrecisionDrop0to1: number;
  evalTechniqueToolImprovementDrop0to1: number;
  evalTechniqueRagFaithfulnessDrop0to1: number;
  evalTechniqueRagContextRelevanceDrop0to1: number;
  evalTechniqueRealtimeFeedbackDrop0to1: number;
  evalTechniquePairwiseWinRateDrop0to1: number;
  evalTechniqueSimulationGoalCompletionDrop0to1: number;
  evalTechniqueAlgorithmicFeedbackCoverageDrop0to1: number;
  evalTechniqueEvidenceCoverageDrop0to1: number;
  sapAgentEvalObjectiveCoverageDrop0to1: number;
  sapAgentEvalProcessCoverageDrop0to1: number;
  sapAgentEvalEnterpriseContextCoverageDrop0to1: number;
  sapAgentEvalEvidenceCoverageDrop0to1: number;
  agentEvalObservabilityConfigCoverageDrop0to1: number;
  agentEvalObservabilityTelemetryCoverageDrop0to1: number;
  agentEvalObservabilityEvidenceCoverageDrop0to1: number;
  hedraRagLatencyP95IncreaseRatio: number;
  hedraRagThroughputDropRatio: number;
  hedraRagMemoryIncreaseRatio: number;
  hedraRagReplayPassRateDrop0to1: number;
  hedraRagEvidenceCoverageDrop0to1: number;
  agentEvalHarnessToolSuccessDrop0to1: number;
  agentEvalHarnessHallucinationIncrease0to1: number;
  agentEvalHarnessLatencyP95IncreaseRatio: number;
  agentEvalHarnessCostIncreaseRatio: number;
  agentEvalHarnessTraceCoverageDrop0to1: number;
  agentEvalHarnessEvidenceCoverageDrop0to1: number;
  strandsBenchmarkHarnessTaskSuccessDrop0to1: number;
  strandsBenchmarkHarnessPatchApplyRateDrop0to1: number;
  strandsBenchmarkHarnessTestPassRateDrop0to1: number;
  strandsBenchmarkHarnessTrajectoryCoverageDrop0to1: number;
  strandsBenchmarkHarnessEvidenceCoverageDrop0to1: number;
  strandsBenchmarkHarnessLatencyP95IncreaseRatio: number;
  strandsBenchmarkHarnessCostIncreaseRatio: number;
  privacyWebDataMinimizationPassRateDrop0to1: number;
  privacyWebLeakageRateIncrease0to1: number;
  privacyWebUnnecessaryDisclosureRateIncrease0to1: number;
  privacyWebSensitiveFieldExposureIncreaseRatio: number;
  privacyWebTaskSuccessRateDrop0to1: number;
  privacyWebModalLeakageDeltaIncrease0to1: number;
  privacyWebEvidenceCoverageDrop0to1: number;
  localSystemThermalBaselineDeviationIncrease0to1: number;
  localSystemVoltageSpcAnomalyRateIncrease0to1: number;
  localSystemProcessIdentityCoverageDrop0to1: number;
  localSystemGhostDriverDetectionCoverageDrop0to1: number;
  localSystemProactiveAlertCoverageDrop0to1: number;
  localSystemLocalOnlyPrivacyCoverageDrop0to1: number;
  localSystemEvidenceCoverageDrop0to1: number;
  observabilityResolutionScoreDrop0to1: number;
  observabilityDeterministicCheckPassRateDrop0to1: number;
  observabilityRubricScoreDrop0to1: number;
  observabilityEvidenceCoverageDrop0to1: number;
  observabilityTraceCoverageDrop0to1: number;
  observabilityReportCoverageDrop0to1: number;
  observabilityScenarioClockAlignmentRateDrop0to1: number;
  ollamaMetricsRequestDurationP95IncreaseRatio: number;
  ollamaMetricsTimePerTokenIncreaseRatio: number;
  ollamaMetricsLoadedModelCountDropRatio: number;
  ollamaMetricsModelLoadedRateDrop0to1: number;
  ollamaMetricsModelRamIncreaseRatio: number;
  ollamaMetricsRequestErrorRateIncrease0to1: number;
  ollamaMetricsEvidenceCoverageDrop0to1: number;
  webOperatorLlmEvaluationDrop0to1: number;
  webOperatorSelfReportOverclaimIncrease0to1: number;
  webOperatorMismatchRateIncrease0to1: number;
  webOperatorTaskReliabilityDrop0to1: number;
  webOperatorReplayCoverageDrop0to1: number;
  webOperatorTaskTimeIncreaseRatio: number;
  webOperatorStepLimitViolationRateIncrease0to1: number;
  naviBenchTaskSuccessDrop0to1: number;
  naviBenchCrashRateIncrease0to1: number;
  naviBenchLowerBoundScoreDrop0to1: number;
  naviBenchExcludingCrashedScoreDrop0to1: number;
  naviBenchTrajectoryCoverageDrop0to1: number;
  naviBenchVisualizationCoverageDrop0to1: number;
  naviBenchEvidenceCoverageDrop0to1: number;
  naviBenchStepCountIncreaseRatio: number;
  naviBenchStepLimitViolationRateIncrease0to1: number;
  legalAgentFinalSuccessDrop0to1: number;
  legalAgentProcessRateDrop0to1: number;
  legalAgentToolUseAccuracyDrop0to1: number;
  legalAgentCitationCoverageDrop0to1: number;
  legalAgentEvidenceCoverageDrop0to1: number;
  legalAgentTokenCostIncreaseRatio: number;
  researchGymScoreImprovementDrop0to1: number;
  researchGymSubtaskCompletionDrop0to1: number;
  researchGymArtifactCoverageDrop0to1: number;
  researchGymInspectionPassRateDrop0to1: number;
  researchGymBudgetOverrunRateIncrease0to1: number;
  researchGymViolationRateIncrease0to1: number;
  osUniverseTaskSuccessDrop0to1: number;
  osUniverseAutoValidationPassDrop0to1: number;
  osUniverseValidationErrorRateIncrease0to1: number;
  osUniverseEvidenceCoverageDrop0to1: number;
  osUniverseStepCountIncreaseRatio: number;
  osUniverseStepLimitViolationRateIncrease0to1: number;
  driftStatistic: number;
}

export interface LiveBehaviorDrift {
  behaviorDivergence0to1: number;
  lifecycleStageDivergence0to1: number;
  perturbationDivergence0to1: number;
  arenaContextDivergence0to1: number;
  frameworkExecutionContextDivergence0to1: number;
  agentEvaluationDimensionDivergence0to1: number;
  socialContextDivergence0to1: number;
  personaDivergence0to1: number;
  ctfContextDivergence0to1: number;
  ctfVmContextDivergence0to1: number;
  ragEvaluationModeDivergence0to1: number;
  ragPipelineContextDivergence0to1: number;
  ragStrategyDivergence0to1: number;
  ragDatasetTierDivergence0to1: number;
  ragQuestionTypeDivergence0to1: number;
  ragBuilderStageDivergence0to1: number;
  ragDatasetBuilderContextDivergence0to1: number;
  kiteDatasetFamilyDivergence0to1: number;
  kiteRagConfigurationDivergence0to1: number;
  kiteBenchmarkContextDivergence0to1: number;
  pokerEvalGameTypeDivergence0to1: number;
  pokerEvalTableContextDivergence0to1: number;
  pokerEvalOpponentPoolDivergence0to1: number;
  llmRagEvalSuiteContextDivergence0to1: number;
  noMiraclLanguageDivergence0to1: number;
  noMiraclSubsetDivergence0to1: number;
  noMiraclContextDivergence0to1: number;
  scalingLawTaskTypeDivergence0to1: number;
  scalingLawContextDivergence0to1: number;
  toolRlContextDivergence0to1: number;
  credenceEngineContextDivergence0to1: number;
  tradingContextDivergence0to1: number;
  redTeamRiskCategoryDivergence0to1: number;
  redTeamAttackDivergence0to1: number;
  redTeamSubsetDivergence0to1: number;
  redTeamGuardLabelDivergence0to1: number;
  piArenaAttackDivergence0to1: number;
  piArenaDefenseDivergence0to1: number;
  piArenaDatasetDivergence0to1: number;
  piArenaAgentBenchmarkDivergence0to1: number;
  backdoorAgentStageDivergence0to1: number;
  backdoorAgentTaskFamilyDivergence0to1: number;
  backdoorAgentAttackFamilyDivergence0to1: number;
  agentSecurityContextDivergence0to1: number;
  agentTestingContextDivergence0to1: number;
  chaosContextDivergence0to1: number;
  recoveryBenchMessageModeDivergence0to1: number;
  recoveryBenchAgentHarnessDivergence0to1: number;
  recoveryBenchTaskDivergence0to1: number;
  adkRuntimeContextDivergence0to1: number;
  physicianBenchSpecialtyDivergence0to1: number;
  physicianBenchTaskTypeDivergence0to1: number;
  physicianBenchEhrContextDivergence0to1: number;
  genomicsStageDivergence0to1: number;
  genomicsContextDivergence0to1: number;
  agenticSearchDatasetFamilyDivergence0to1: number;
  agenticSearchQueryTypeDivergence0to1: number;
  agenticSearchToolContextDivergence0to1: number;
  documentDatasetTaskDivergence0to1: number;
  documentDatasetFormatDivergence0to1: number;
  documentDatasetExportTargetDivergence0to1: number;
  documentDatasetPipelineContextDivergence0to1: number;
  cpuAgenticWorkloadDivergence0to1: number;
  cpuAgenticRuntimeDivergence0to1: number;
  cpuAgenticScheduleDivergence0to1: number;
  cpuAgenticContextDivergence0to1: number;
  evalTechniqueDivergence0to1: number;
  evalTechniqueContextDivergence0to1: number;
  sapAgentEvalObjectiveDivergence0to1: number;
  sapAgentEvalProcessDivergence0to1: number;
  sapAgentEvalEnterpriseContextDivergence0to1: number;
  agentEvalObservabilityMetricSetDivergence0to1: number;
  agentEvalObservabilityTelemetryDivergence0to1: number;
  hedraRagWorkflowDivergence0to1: number;
  hedraRagBaselineFrameworkDivergence0to1: number;
  hedraRagRuntimeContextDivergence0to1: number;
  agentEvalHarnessFrameworkDivergence0to1: number;
  agentEvalHarnessTraceModeDivergence0to1: number;
  agentEvalHarnessMetricContextDivergence0to1: number;
  strandsBenchmarkHarnessBenchmarkSuiteDivergence0to1: number;
  strandsBenchmarkHarnessRuntimeDivergence0to1: number;
  strandsBenchmarkHarnessTaskFamilyDivergence0to1: number;
  privacyWebEnvironmentDivergence0to1: number;
  privacyWebObservationModeDivergence0to1: number;
  privacyWebContextDivergence0to1: number;
  localSystemWorkloadContextDivergence0to1: number;
  localSystemHardwareContextDivergence0to1: number;
  observabilityIncidentContextDivergence0to1: number;
  observabilityTaskTypeDivergence0to1: number;
  observabilityDataSourceDivergence0to1: number;
  observabilityToolModeDivergence0to1: number;
  ollamaMetricsModelDivergence0to1: number;
  ollamaMetricsDeploymentDivergence0to1: number;
  ollamaMetricsProxyContextDivergence0to1: number;
  webOperatorContextDivergence0to1: number;
  webOperatorProviderDivergence0to1: number;
  naviBenchWebsiteDomainDivergence0to1: number;
  naviBenchBrowserModeDivergence0to1: number;
  naviBenchEvalContextDivergence0to1: number;
  legalAgentCorpusDivergence0to1: number;
  legalAgentTaskTypeDivergence0to1: number;
  legalAgentDifficultyDivergence0to1: number;
  legalAgentToolContextDivergence0to1: number;
  researchGymTaskDomainDivergence0to1: number;
  researchGymRuntimeContextDivergence0to1: number;
  osUniverseCategoryDivergence0to1: number;
  osUniverseLevelDivergence0to1: number;
  osUniverseRuntimeContextDivergence0to1: number;
  robustnessStabilityDrop0to1: number;
  robustnessMaxDimensionDrop0to1: number;
  robustnessDimensionDrops0to1: Record<string, number>;
  baselineTopSignatures: string[];
  liveTopSignatures: string[];
  baselineTopLifecycleStages: LiveDriftLifecycleStage[];
  liveTopLifecycleStages: LiveDriftLifecycleStage[];
  baselineTopPerturbationFamilies: string[];
  liveTopPerturbationFamilies: string[];
  baselineTopArenaContexts: string[];
  liveTopArenaContexts: string[];
  baselineTopFrameworkExecutionContexts: string[];
  liveTopFrameworkExecutionContexts: string[];
  baselineTopAgentEvaluationDimensions: LiveDriftAgentEvaluationDimension[];
  liveTopAgentEvaluationDimensions: LiveDriftAgentEvaluationDimension[];
  baselineTopSocialContexts: string[];
  liveTopSocialContexts: string[];
  baselineTopPersonaContexts: string[];
  liveTopPersonaContexts: string[];
  baselineTopCtfContexts: string[];
  liveTopCtfContexts: string[];
  baselineTopCtfVmContexts: string[];
  liveTopCtfVmContexts: string[];
  baselineTopRagEvaluationModes: LiveDriftRagEvaluationMode[];
  liveTopRagEvaluationModes: LiveDriftRagEvaluationMode[];
  baselineTopRagPipelineContexts: string[];
  liveTopRagPipelineContexts: string[];
  baselineTopRagStrategies: LiveDriftRagPipelineStrategy[];
  liveTopRagStrategies: LiveDriftRagPipelineStrategy[];
  baselineTopRagDatasetTiers: LiveDriftRagDatasetTier[];
  liveTopRagDatasetTiers: LiveDriftRagDatasetTier[];
  baselineTopRagQuestionTypes: LiveDriftRagQuestionType[];
  liveTopRagQuestionTypes: LiveDriftRagQuestionType[];
  baselineTopRagBuilderStages: LiveDriftRagBuilderStage[];
  liveTopRagBuilderStages: LiveDriftRagBuilderStage[];
  baselineTopRagDatasetBuilderContexts: string[];
  liveTopRagDatasetBuilderContexts: string[];
  baselineTopKiteDatasetFamilies: LiveDriftKiteDatasetFamily[];
  liveTopKiteDatasetFamilies: LiveDriftKiteDatasetFamily[];
  baselineTopKiteRagConfigurations: string[];
  liveTopKiteRagConfigurations: string[];
  baselineTopKiteBenchmarkContexts: string[];
  liveTopKiteBenchmarkContexts: string[];
  baselineTopPokerEvalGameTypes: LiveDriftPokerEvalGameType[];
  liveTopPokerEvalGameTypes: LiveDriftPokerEvalGameType[];
  baselineTopPokerEvalTableContexts: string[];
  liveTopPokerEvalTableContexts: string[];
  baselineTopPokerEvalOpponentPools: string[];
  liveTopPokerEvalOpponentPools: string[];
  baselineTopLlmRagEvalSuiteContexts: string[];
  liveTopLlmRagEvalSuiteContexts: string[];
  baselineTopNoMiraclLanguages: string[];
  liveTopNoMiraclLanguages: string[];
  baselineTopNoMiraclSubsets: LiveDriftNoMiraclSubset[];
  liveTopNoMiraclSubsets: LiveDriftNoMiraclSubset[];
  baselineTopNoMiraclContexts: string[];
  liveTopNoMiraclContexts: string[];
  baselineTopScalingLawTaskTypes: LiveDriftScalingLawTaskType[];
  liveTopScalingLawTaskTypes: LiveDriftScalingLawTaskType[];
  baselineTopScalingLawContexts: string[];
  liveTopScalingLawContexts: string[];
  baselineTopToolRlContexts: string[];
  liveTopToolRlContexts: string[];
  baselineTopCredenceEngineContexts: string[];
  liveTopCredenceEngineContexts: string[];
  baselineTopTradingContexts: string[];
  liveTopTradingContexts: string[];
  baselineTopRedTeamRiskCategories: string[];
  liveTopRedTeamRiskCategories: string[];
  baselineTopRedTeamAttacks: string[];
  liveTopRedTeamAttacks: string[];
  baselineTopRedTeamSubsets: LiveDriftRedTeamSubset[];
  liveTopRedTeamSubsets: LiveDriftRedTeamSubset[];
  baselineTopRedTeamGuardLabels: LiveDriftRedTeamGuardLabel[];
  liveTopRedTeamGuardLabels: LiveDriftRedTeamGuardLabel[];
  baselineTopPiArenaAttacks: string[];
  liveTopPiArenaAttacks: string[];
  baselineTopPiArenaDefenses: string[];
  liveTopPiArenaDefenses: string[];
  baselineTopPiArenaDatasets: string[];
  liveTopPiArenaDatasets: string[];
  baselineTopPiArenaAgentBenchmarks: LiveDriftPiArenaAgentBenchmark[];
  liveTopPiArenaAgentBenchmarks: LiveDriftPiArenaAgentBenchmark[];
  baselineTopBackdoorAgentStages: LiveDriftBackdoorAgentStage[];
  liveTopBackdoorAgentStages: LiveDriftBackdoorAgentStage[];
  baselineTopBackdoorAgentTaskFamilies: LiveDriftBackdoorAgentTaskFamily[];
  liveTopBackdoorAgentTaskFamilies: LiveDriftBackdoorAgentTaskFamily[];
  baselineTopBackdoorAgentAttackFamilies: LiveDriftBackdoorAgentAttackFamily[];
  liveTopBackdoorAgentAttackFamilies: LiveDriftBackdoorAgentAttackFamily[];
  baselineTopAgentSecurityContexts: string[];
  liveTopAgentSecurityContexts: string[];
  baselineTopAgentTestingContexts: string[];
  liveTopAgentTestingContexts: string[];
  baselineTopChaosContexts: string[];
  liveTopChaosContexts: string[];
  baselineTopRecoveryBenchMessageModes: LiveDriftRecoveryBenchMessageMode[];
  liveTopRecoveryBenchMessageModes: LiveDriftRecoveryBenchMessageMode[];
  baselineTopRecoveryBenchAgentHarnesses: LiveDriftRecoveryBenchHarness[];
  liveTopRecoveryBenchAgentHarnesses: LiveDriftRecoveryBenchHarness[];
  baselineTopRecoveryBenchTasks: string[];
  liveTopRecoveryBenchTasks: string[];
  baselineTopAdkRuntimeContexts: string[];
  liveTopAdkRuntimeContexts: string[];
  baselineTopPhysicianBenchSpecialties: string[];
  liveTopPhysicianBenchSpecialties: string[];
  baselineTopPhysicianBenchTaskTypes: LiveDriftPhysicianBenchTaskType[];
  liveTopPhysicianBenchTaskTypes: LiveDriftPhysicianBenchTaskType[];
  baselineTopPhysicianBenchEhrContexts: string[];
  liveTopPhysicianBenchEhrContexts: string[];
  baselineTopGenomicsStages: LiveDriftGenomicsTaskStage[];
  liveTopGenomicsStages: LiveDriftGenomicsTaskStage[];
  baselineTopGenomicsContexts: string[];
  liveTopGenomicsContexts: string[];
  baselineTopAgenticSearchDatasetFamilies: LiveDriftAgenticSearchDatasetFamily[];
  liveTopAgenticSearchDatasetFamilies: LiveDriftAgenticSearchDatasetFamily[];
  baselineTopAgenticSearchQueryTypes: LiveDriftAgenticSearchQueryType[];
  liveTopAgenticSearchQueryTypes: LiveDriftAgenticSearchQueryType[];
  baselineTopAgenticSearchToolContexts: string[];
  liveTopAgenticSearchToolContexts: string[];
  baselineTopDocumentDatasetTasks: LiveDriftDocumentDatasetTask[];
  liveTopDocumentDatasetTasks: LiveDriftDocumentDatasetTask[];
  baselineTopDocumentDatasetFormats: LiveDriftDocumentDatasetSourceFormat[];
  liveTopDocumentDatasetFormats: LiveDriftDocumentDatasetSourceFormat[];
  baselineTopDocumentDatasetExportTargets: LiveDriftDocumentDatasetExportTarget[];
  liveTopDocumentDatasetExportTargets: LiveDriftDocumentDatasetExportTarget[];
  baselineTopDocumentDatasetPipelineContexts: string[];
  liveTopDocumentDatasetPipelineContexts: string[];
  baselineTopCpuAgenticWorkloads: LiveDriftCpuAgenticWorkloadFamily[];
  liveTopCpuAgenticWorkloads: LiveDriftCpuAgenticWorkloadFamily[];
  baselineTopCpuAgenticRuntimes: LiveDriftCpuAgenticRuntime[];
  liveTopCpuAgenticRuntimes: LiveDriftCpuAgenticRuntime[];
  baselineTopCpuAgenticSchedules: LiveDriftCpuAgenticScheduleMode[];
  liveTopCpuAgenticSchedules: LiveDriftCpuAgenticScheduleMode[];
  baselineTopCpuAgenticContexts: string[];
  liveTopCpuAgenticContexts: string[];
  baselineTopEvalTechniques: LiveDriftEvalTechnique[];
  liveTopEvalTechniques: LiveDriftEvalTechnique[];
  baselineTopEvalTechniqueContexts: string[];
  liveTopEvalTechniqueContexts: string[];
  baselineTopSapAgentEvalObjectives: LiveDriftSapAgentEvalObjective[];
  liveTopSapAgentEvalObjectives: LiveDriftSapAgentEvalObjective[];
  baselineTopSapAgentEvalProcesses: LiveDriftSapAgentEvalProcess[];
  liveTopSapAgentEvalProcesses: LiveDriftSapAgentEvalProcess[];
  baselineTopSapAgentEvalEnterpriseContexts: LiveDriftSapAgentEvalEnterpriseContext[];
  liveTopSapAgentEvalEnterpriseContexts: LiveDriftSapAgentEvalEnterpriseContext[];
  baselineTopHedraRagWorkflows: LiveDriftHedraRagWorkflow[];
  liveTopHedraRagWorkflows: LiveDriftHedraRagWorkflow[];
  baselineTopHedraRagBaselineFrameworks: LiveDriftHedraRagBaselineFramework[];
  liveTopHedraRagBaselineFrameworks: LiveDriftHedraRagBaselineFramework[];
  baselineTopHedraRagRuntimeContexts: string[];
  liveTopHedraRagRuntimeContexts: string[];
  baselineTopAgentEvalHarnessFrameworks: LiveDriftAgentEvalHarnessFramework[];
  liveTopAgentEvalHarnessFrameworks: LiveDriftAgentEvalHarnessFramework[];
  baselineTopAgentEvalHarnessTraceModes: LiveDriftAgentEvalHarnessTraceMode[];
  liveTopAgentEvalHarnessTraceModes: LiveDriftAgentEvalHarnessTraceMode[];
  baselineTopAgentEvalHarnessMetricContexts: LiveDriftAgentEvalHarnessMetricContext[];
  liveTopAgentEvalHarnessMetricContexts: LiveDriftAgentEvalHarnessMetricContext[];
  baselineTopStrandsBenchmarkHarnessSuites: LiveDriftStrandsBenchmarkSuite[];
  liveTopStrandsBenchmarkHarnessSuites: LiveDriftStrandsBenchmarkSuite[];
  baselineTopStrandsBenchmarkHarnessRuntimes: LiveDriftStrandsHarnessRuntime[];
  liveTopStrandsBenchmarkHarnessRuntimes: LiveDriftStrandsHarnessRuntime[];
  baselineTopStrandsBenchmarkHarnessTaskFamilies: LiveDriftStrandsTaskFamily[];
  liveTopStrandsBenchmarkHarnessTaskFamilies: LiveDriftStrandsTaskFamily[];
  baselineTopPrivacyWebEnvironments: LiveDriftPrivacyWebEnvironment[];
  liveTopPrivacyWebEnvironments: LiveDriftPrivacyWebEnvironment[];
  baselineTopPrivacyWebObservationModes: LiveDriftPrivacyWebObservationMode[];
  liveTopPrivacyWebObservationModes: LiveDriftPrivacyWebObservationMode[];
  baselineTopPrivacyWebContexts: string[];
  liveTopPrivacyWebContexts: string[];
  baselineTopLocalSystemWorkloadContexts: LiveDriftLocalSystemWorkloadContext[];
  liveTopLocalSystemWorkloadContexts: LiveDriftLocalSystemWorkloadContext[];
  baselineTopLocalSystemHardwareContexts: string[];
  liveTopLocalSystemHardwareContexts: string[];
  baselineTopObservabilityIncidentContexts: string[];
  liveTopObservabilityIncidentContexts: string[];
  baselineTopObservabilityTaskTypes: LiveDriftObservabilityTaskType[];
  liveTopObservabilityTaskTypes: LiveDriftObservabilityTaskType[];
  baselineTopObservabilityDataSources: LiveDriftObservabilityDataSource[];
  liveTopObservabilityDataSources: LiveDriftObservabilityDataSource[];
  baselineTopObservabilityToolModes: LiveDriftObservabilityToolMode[];
  liveTopObservabilityToolModes: LiveDriftObservabilityToolMode[];
  baselineTopOllamaMetricsModels: string[];
  liveTopOllamaMetricsModels: string[];
  baselineTopOllamaMetricsDeployments: LiveDriftOllamaMetricsDeploymentMode[];
  liveTopOllamaMetricsDeployments: LiveDriftOllamaMetricsDeploymentMode[];
  baselineTopOllamaMetricsProxyContexts: string[];
  liveTopOllamaMetricsProxyContexts: string[];
  baselineTopWebOperatorContexts: string[];
  liveTopWebOperatorContexts: string[];
  baselineTopWebOperatorProviders: string[];
  liveTopWebOperatorProviders: string[];
  baselineTopNaviBenchWebsiteDomains: LiveDriftNaviBenchWebsiteDomain[];
  liveTopNaviBenchWebsiteDomains: LiveDriftNaviBenchWebsiteDomain[];
  baselineTopNaviBenchBrowserModes: LiveDriftWebOperatorBrowserMode[];
  liveTopNaviBenchBrowserModes: LiveDriftWebOperatorBrowserMode[];
  baselineTopNaviBenchEvalContexts: string[];
  liveTopNaviBenchEvalContexts: string[];
  baselineTopLegalAgentCorpora: string[];
  liveTopLegalAgentCorpora: string[];
  baselineTopLegalAgentTaskTypes: LiveDriftLegalAgentTaskType[];
  liveTopLegalAgentTaskTypes: LiveDriftLegalAgentTaskType[];
  baselineTopLegalAgentDifficulties: LiveDriftLegalAgentDifficulty[];
  liveTopLegalAgentDifficulties: LiveDriftLegalAgentDifficulty[];
  baselineTopLegalAgentToolContexts: string[];
  liveTopLegalAgentToolContexts: string[];
  baselineTopResearchGymTaskDomains: LiveDriftResearchGymTaskDomain[];
  liveTopResearchGymTaskDomains: LiveDriftResearchGymTaskDomain[];
  baselineTopResearchGymRuntimeContexts: string[];
  liveTopResearchGymRuntimeContexts: string[];
  baselineTopOsUniverseCategories: LiveDriftOsUniverseCategory[];
  liveTopOsUniverseCategories: LiveDriftOsUniverseCategory[];
  baselineTopOsUniverseLevels: LiveDriftOsUniverseLevel[];
  liveTopOsUniverseLevels: LiveDriftOsUniverseLevel[];
  baselineTopOsUniverseRuntimeContexts: string[];
  liveTopOsUniverseRuntimeContexts: string[];
}

export interface LiveDriftAlert {
  alertId: string;
  metricId: LiveDriftMetricId;
  severity: LiveDriftSeverity;
  message: string;
  threshold: number;
  observed: number;
  evidenceRefs: string[];
  signedEvidenceRefs: string[];
}

export interface LiveDriftReceipt {
  receiptId: string;
  agentId: string;
  createdAt: string;
  baselineWindowId: string;
  liveWindowId: string;
  baselineStartedAt: string;
  baselineEndedAt: string;
  liveStartedAt: string;
  liveEndedAt: string;
  baselineHash: string;
  liveSampleHash: string;
  thresholds: LiveDriftThresholds;
  baselineDistribution: LiveDriftDistribution;
  liveDistribution: LiveDriftDistribution;
  scoreDrift: LiveScoreDrift;
  behaviorDrift: LiveBehaviorDrift;
  baselineRows: LiveDriftReceiptRow[];
  liveRows: LiveDriftReceiptRow[];
  alerts: LiveDriftAlert[];
  recommendation: LiveDriftRecommendation;
  failClosed: boolean;
  evidenceRefs: string[];
  signedEvidenceRefs: string[];
  sourceRefs: string[];
  receiptHash: string;
  summary: string;
}

export interface LiveDriftWatchAlert {
  id: string;
  agentId: string;
  source: "live-score-behavior-drift";
  severity: LiveDriftSeverity;
  metricId: LiveDriftMetricId;
  evidenceRefs: string[];
  signedEvidenceRefs: string[];
  message: string;
  receiptHash: string;
  createdAt: string;
}

export interface LiveDriftReceiptVerification {
  valid: boolean;
  receiptHash: string;
  expectedReceiptHash: string;
  errors: string[];
}

export interface RunLiveScoreBehaviorDriftInput {
  agentId: string;
  baselineWindow: LiveDriftWindow;
  liveWindow: LiveDriftWindow;
  thresholds?: Partial<LiveDriftThresholds>;
  sourceRefs?: string[];
  now?: Date;
}
