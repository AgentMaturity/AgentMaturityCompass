import { describe, expect, test } from "vitest";
import {
  buildReplayBenchmarkWatchAlerts,
  renderReplayBenchmarkCorpusMarkdown,
  runReplayBenchmarkCorpus,
  verifyReplayBenchmarkCorpusReceipt,
  type ReplayBenchmarkAdversarialEngineEvaluationFixture,
  type ReplayBenchmarkCorpusInput,
} from "../src/benchmarks/replayBenchmarkCorpus.js";

const artifactHash = "a".repeat(64);
const commandHash = "b".repeat(64);
const dependencyHash = "c".repeat(64);
const behaviorHashA = "d".repeat(64);
const behaviorHashB = "e".repeat(64);
const toolHashA = "f".repeat(64);
const toolHashB = "1".repeat(64);
const promptHash = "2".repeat(64);
const baselineResponseHash = "3".repeat(64);
const candidateResponseHash = "4".repeat(64);
const judgePanelHash = "5".repeat(64);
const sourceInputHash = "6".repeat(64);
const targetInputHash = "7".repeat(64);
const toolSchemaHash = "8".repeat(64);
const goldLabelHash = "9".repeat(64);
const transformConfigHash = "0".repeat(64);
const speakerProfileHash = "a".repeat(64);
const noiseProfileHash = "b".repeat(64);
const judgeValidationHash = "c".repeat(64);
const randomizationConfigHash = "d".repeat(64);
const observationTraceHash = "e".repeat(64);
const instructionTraceHash = "f".repeat(64);
const feedbackTraceHash = "1".repeat(64);
const actionTraceHash = "2".repeat(64);
const rewardTraceHash = "3".repeat(64);
const terminationTraceHash = "4".repeat(64);
const skillBaselineHash = "5".repeat(64);
const skillCandidateHash = "6".repeat(64);
const skillGraderHash = "7".repeat(64);
const skillComparatorHash = "8".repeat(64);
const skillAnalyzerHash = "9".repeat(64);
const skillBlindComparisonHash = "0".repeat(64);
const skillBenchmarkHash = "a".repeat(64);
const skillPackageHash = "b".repeat(64);
const skillbenchSourceRefHash = "c".repeat(64);
const skillbenchSkillManifestHash = "d".repeat(64);
const skillbenchBaselineAgentConfigHash = "e".repeat(64);
const skillbenchWithSkillAgentConfigHash = "f".repeat(64);
const skillbenchEvalSuiteHash = "1".repeat(64);
const skillbenchEvalCaseManifestHash = "2".repeat(64);
const skillbenchDeterministicGraderHash = "3".repeat(64);
const skillbenchStaticAnalysisConfigHash = "4".repeat(64);
const skillbenchSecurityScanReportHash = "5".repeat(64);
const skillbenchBaselineOutputHash = "6".repeat(64);
const skillbenchWithSkillOutputHash = "7".repeat(64);
const skillbenchRerunOutputHash = "8".repeat(64);
const skillbenchResultReportHash = "9".repeat(64);
const skillbenchReplayCommandHash = "0".repeat(64);
const skillForgeRepositorySnapshotHash = "a".repeat(64);
const skillForgeLicenseRefHash = "b".repeat(64);
const skillForgeHomepageSnapshotHash = "c".repeat(64);
const skillForgeReadmeBlobHash = "d".repeat(64);
const skillForgeReleaseNotesHash = "e".repeat(64);
const skillForgeSkillSpecHash = "f".repeat(64);
const skillForgeAgentRoleManifestHash = "1".repeat(64);
const skillForgeOrchestratorAgentHash = "2".repeat(64);
const skillForgeMutatorAgentHash = "3".repeat(64);
const skillForgeScorerAgentHash = "4".repeat(64);
const skillForgeHypothesisAgentHash = "5".repeat(64);
const skillForgeCompositeScoreScriptHash = "6".repeat(64);
const skillForgeTemplateManifestHash = "7".repeat(64);
const skillForgeExampleSessionHash = "8".repeat(64);
const skillForgeImprovementLoopManifestHash = "9".repeat(64);
const skillForgeMutationPolicyHash = "0".repeat(64);
const skillForgeRevertPolicyHash = "a".repeat(64);
const skillForgeReplayManifestHash = "b".repeat(64);
const skillForgeCiReceiptHash = "c".repeat(64);
const ragCorpusDocumentHash = "c".repeat(64);
const ragChunkingConfigHash = "d".repeat(64);
const ragQuestionSetHash = "e".repeat(64);
const ragReferenceAnswerHash = "f".repeat(64);
const ragRetrievalTraceHash = "1".repeat(64);
const ragGenerationTraceHash = "2".repeat(64);
const ragScoringReportHash = "3".repeat(64);
const ragHumanReviewHash = "4".repeat(64);
const ragTextCorpusHash = "5".repeat(64);
const ragImageCorpusHash = "6".repeat(64);
const ragPdfExtractionTraceHash = "7".repeat(64);
const ragImageExtractionTraceHash = "8".repeat(64);
const ragImageSummaryHash = "9".repeat(64);
const ragTextVectorStoreHash = "0".repeat(64);
const ragImageVectorStoreHash = "a".repeat(64);
const ragCombinedVectorStoreHash = "b".repeat(64);
const ragMultimodalEmbeddingConfigHash = "c".repeat(64);
const ragBaselineRunHash = "d".repeat(64);
const ragCorrectContextRunHash = "e".repeat(64);
const ragJudgeRubricHash = "f".repeat(64);
const ragEvalFlowSourceRefHash = "1".repeat(64);
const ragEvalFlowRepositorySnapshotHash = "2".repeat(64);
const ragEvalFlowLicenseRefHash = "3".repeat(64);
const ragEvalFlowPipelineConfigHash = "4".repeat(64);
const ragEvalFlowDataSourceManifestHash = "5".repeat(64);
const ragEvalFlowModelConfigHash = "6".repeat(64);
const ragEvalFlowJudgeConfigHash = "7".repeat(64);
const ragEvalFlowMetricDefinitionHash = "8".repeat(64);
const ragEvalFlowPromptTemplateHash = "9".repeat(64);
const ragEvalFlowEvalPackManifestHash = "0".repeat(64);
const ragEvalFlowFixtureHash = "a".repeat(64);
const ragEvalFlowReplayCommandHash = "b".repeat(64);
const ragEvalFlowResultManifestHash = "c".repeat(64);
const ragEvalFlowScoreDeltaReportHash = "d".repeat(64);
const ragEvalFlowCiReceiptHash = "e".repeat(64);
const ragEvalDatasetSourceRefHash = "f".repeat(64);
const ragEvalDatasetRepositorySnapshotHash = "1".repeat(64);
const ragEvalDatasetLicenseRefHash = "2".repeat(64);
const ragEvalDatasetInputDocumentManifestHash = "3".repeat(64);
const ragEvalDatasetProcessorConfigHash = "4".repeat(64);
const ragEvalDatasetPromptTemplateHash = "5".repeat(64);
const ragEvalDatasetGeneratorConfigHash = "6".repeat(64);
const ragEvalDatasetQaDatasetHash = "7".repeat(64);
const ragEvalDatasetEndpointConfigHash = "8".repeat(64);
const ragEvalDatasetEndpointResponseTraceHash = "9".repeat(64);
const ragEvalDatasetRankingReportHash = "0".repeat(64);
const ragEvalDatasetEvaluationRunHash = "a".repeat(64);
const ragEvalDatasetReplayCommandHash = "b".repeat(64);
const ragEvalDatasetCiReceiptHash = "c".repeat(64);
const mirageSourceRefHash = "f".repeat(64);
const mirageRepositorySnapshotHash = "1".repeat(64);
const mirageLicenseRefHash = "2".repeat(64);
const mirageInputDocumentManifestHash = "3".repeat(64);
const mirageSemanticChunkManifestHash = "4".repeat(64);
const mirageMultihopContextGraphHash = "5".repeat(64);
const mirageDomainExpertRoleManifestHash = "6".repeat(64);
const mirageGenerateSelectVerifyCorrectTraceHash = "7".repeat(64);
const mirageMultimodalCarrierManifestHash = "8".repeat(64);
const mirageBackendConfigHash = "9".repeat(64);
const mirageEmbeddingConfigHash = "0".repeat(64);
const mirageRerankerConfigHash = "a".repeat(64);
const mirageTokenUsageTraceHash = "b".repeat(64);
const mirageCheckpointResumeHash = "c".repeat(64);
const mirageDeduplicationReportHash = "d".repeat(64);
const mirageEvaluationReportHash = "e".repeat(64);
const mirageReplayCommandHash = "f".repeat(64);
const mirageOutputDatasetHash = "1".repeat(64);
const mirageVisualizationArtifactHash = "2".repeat(64);
const encourageSourceRefHash = "3".repeat(64);
const encourageRepositorySnapshotHash = "4".repeat(64);
const encourageLicenseRefHash = "5".repeat(64);
const encouragePackageVersionHash = "6".repeat(64);
const encourageDependencyLockHash = "7".repeat(64);
const encourageRagMethodManifestHash = "8".repeat(64);
const encourageInferenceRunnerConfigHash = "9".repeat(64);
const encourageTemplateManifestHash = "0".repeat(64);
const encourageVectorDbConfigHash = "a".repeat(64);
const encourageDatasetManifestHash = "b".repeat(64);
const encourageQuerySetHash = "c".repeat(64);
const encourageReferenceAnswerSetHash = "d".repeat(64);
const encourageMetricSuiteHash = "e".repeat(64);
const encourageMlflowRunHash = "f".repeat(64);
const encourageResultManifestHash = "1".repeat(64);
const encourageReplayCommandHash = "2".repeat(64);
const encourageCiReceiptHash = "3".repeat(64);
const chunkingSourceRefHash = "1".repeat(64);
const chunkingDocumentSetHash = "2".repeat(64);
const chunkerManifestHash = "3".repeat(64);
const chunkingEmbedderConfigHash = "4".repeat(64);
const chunkingKeywordIndexConfigHash = "5".repeat(64);
const chunkingFusionConfigHash = "6".repeat(64);
const chunkingScoringConfigHash = "7".repeat(64);
const chunkingReportArtifactHash = "8".repeat(64);
const chunkingExportArtifactHash = "9".repeat(64);
const chunkingReplayCommandHash = "0".repeat(64);
const aiResearchProblemSpecHash = "5".repeat(64);
const aiResearchDatasetSpecHash = "6".repeat(64);
const aiResearchMetricSpecHash = "7".repeat(64);
const aiResearchSotaReferenceHash = "8".repeat(64);
const aiResearchSubmissionArtifactHash = "9".repeat(64);
const aiResearchEvaluationScriptHash = "0".repeat(64);
const aiResearchEvaluatorOutputHash = "a".repeat(64);
const toolSandboxRegistryHash = "b".repeat(64);
const toolSandboxDependencyGraphHash = "c".repeat(64);
const toolSandboxInitialStateHash = "d".repeat(64);
const toolSandboxSeedStateHash = "e".repeat(64);
const toolSandboxApiFailureScheduleHash = "f".repeat(64);
const toolSandboxEnvironmentVerificationTraceHash = "1".repeat(64);
const toolSandboxTrajectoryTraceHash = "2".repeat(64);
const toolSandboxRetrievalTraceHash = "3".repeat(64);
const platformDatasetVersionHash = "4".repeat(64);
const platformCustomTemplateHash = "5".repeat(64);
const platformJudgeConfigHash = "6".repeat(64);
const platformMetricConfigHash = "7".repeat(64);
const platformModelConfigHash = "8".repeat(64);
const platformBatchRunConfigHash = "9".repeat(64);
const platformRagConfigHash = "0".repeat(64);
const platformEvaluatorTraceHash = "a".repeat(64);
const platformResultExportHash = "b".repeat(64);
const platformReportArtifactHash = "c".repeat(64);
const webSearchDatasetSpecHash = "d".repeat(64);
const webSearchSourceLinkManifestHash = "e".repeat(64);
const webSearchEngineConfigHash = "f".repeat(64);
const webSearchAgentFrameworkConfigHash = "1".repeat(64);
const webSearchModelConfigHash = "2".repeat(64);
const webSearchEvaluatorConfigHash = "3".repeat(64);
const webSearchBenchmarkRunConfigHash = "4".repeat(64);
const webSearchResultJsonlHash = "5".repeat(64);
const webSearchMetricsReportHash = "6".repeat(64);
const webSearchNavigationTraceHash = "7".repeat(64);
const webSearchOperationTraceHash = "8".repeat(64);
const webSearchCitationTraceHash = "9".repeat(64);
const binaryAuditArtifactHash = "d".repeat(64);
const binaryAuditMetadataHash = "e".repeat(64);
const binaryAuditTaskConfigHash = "f".repeat(64);
const binaryAuditContainerImageHash = "1".repeat(64);
const binaryAuditToolchainHash = "2".repeat(64);
const binaryAuditAnalysisTraceHash = "3".repeat(64);
const binaryAuditFindingReportHash = "4".repeat(64);
const binaryAuditGroundTruthHash = "5".repeat(64);
const ltmConfigurationHash = "6".repeat(64);
const ltmDatasetSpecHash = "7".repeat(64);
const ltmDatasetInterfaceHash = "8".repeat(64);
const ltmModelInterfaceHash = "9".repeat(64);
const ltmRunnerConfigHash = "0".repeat(64);
const ltmTestSpecHash = "a".repeat(64);
const ltmConversationTraceHash = "b".repeat(64);
const ltmMemoryUpdateTraceHash = "c".repeat(64);
const ltmRetrievalTraceHash = "d".repeat(64);
const ltmResultArtifactHash = "e".repeat(64);
const ltmReportArtifactHash = "f".repeat(64);
const realTalkPaperRefHash = "1".repeat(64);
const realTalkDatasetLicenseRefHash = "2".repeat(64);
const realTalkRawExportManifestHash = "3".repeat(64);
const realTalkPreprocessedConversationHash = "4".repeat(64);
const realTalkParticipantManifestHash = "5".repeat(64);
const realTalkSpeakerManifestHash = "6".repeat(64);
const realTalkTemporalSplitHash = "7".repeat(64);
const realTalkPrivacyConsentHash = "8".repeat(64);
const realTalkLocomoComparisonHash = "9".repeat(64);
const realTalkQuestionAnswerManifestHash = "0".repeat(64);
const realTalkOpenAiBoundaryHash = "a".repeat(64);
const realTalkEvaluatorConfigHash = "b".repeat(64);
const realTalkGptScoreArtifactHash = "c".repeat(64);
const realTalkLexicalF1ArtifactHash = "d".repeat(64);
const realTalkPersonaPromptHash = "e".repeat(64);
const cloneMemSourceRefHash = "f".repeat(64);
const cloneMemRepositorySnapshotHash = "1".repeat(64);
const cloneMemDatasetLicenseRefHash = "2".repeat(64);
const cloneMemPersonaManifestHash = "3".repeat(64);
const cloneMemDigitalTraceManifestHash = "4".repeat(64);
const cloneMemDiaryTraceManifestHash = "5".repeat(64);
const cloneMemSocialPostTraceManifestHash = "6".repeat(64);
const cloneMemDirectMessageTraceManifestHash = "7".repeat(64);
const cloneMemEmailTraceManifestHash = "8".repeat(64);
const cloneMemQuestionSetHash = "9".repeat(64);
const cloneMemGroundTruthEvidenceHash = "0".repeat(64);
const cloneMemTemporalSplitHash = "a".repeat(64);
const cloneMemBilingualConfigHash = "b".repeat(64);
const cloneMemEvaluationConfigHash = "c".repeat(64);
const cloneMemBaselineRetrieverHash = "d".repeat(64);
const cloneMemMemorySystemConfigHash = "e".repeat(64);
const cloneMemResultArtifactHash = "f".repeat(64);
const cloneMemReplayCommandHash = "1".repeat(64);
const memEvalSourceRefHash = "2".repeat(64);
const memEvalRepositorySnapshotHash = "3".repeat(64);
const memEvalLicenseRefHash = "4".repeat(64);
const memEvalBenchmarkManifestHash = "5".repeat(64);
const memEvalDatasetManifestHash = "6".repeat(64);
const memEvalQuestionSetHash = "7".repeat(64);
const memEvalConversationManifestHash = "8".repeat(64);
const memEvalMemorySystemRosterHash = "9".repeat(64);
const memEvalSystemConfigHash = "0".repeat(64);
const memEvalLlmConfigHash = "a".repeat(64);
const memEvalEmbeddingConfigHash = "b".repeat(64);
const memEvalScoringPipelineHash = "c".repeat(64);
const memEvalJudgeConfigHash = "d".repeat(64);
const memEvalTokenCostTraceHash = "e".repeat(64);
const memEvalResultArtifactHash = "f".repeat(64);
const memEvalReplayCommandHash = "1".repeat(64);
const researchHarnessSourceRefHash = "2".repeat(64);
const researchHarnessRepositorySnapshotHash = "3".repeat(64);
const researchHarnessLicenseRefHash = "4".repeat(64);
const researchHarnessRuntimeContractHash = "5".repeat(64);
const researchHarnessToolSurfaceManifestHash = "6".repeat(64);
const researchHarnessNativeToolCallTraceHash = "7".repeat(64);
const researchHarnessOpenAiCompatibleApiHash = "8".repeat(64);
const researchHarnessWorkspaceBoundaryHash = "9".repeat(64);
const researchHarnessTraceManifestHash = "0".repeat(64);
const researchHarnessBenchmarkAdapterHash = "a".repeat(64);
const researchHarnessBaselineHarnessConfigHash = "b".repeat(64);
const researchHarnessMetaHarnessComparisonHash = "c".repeat(64);
const researchHarnessModelProviderMatrixHash = "d".repeat(64);
const researchHarnessEvaluationReportHash = "e".repeat(64);
const researchHarnessReplayCommandHash = "f".repeat(64);
const researchHarnessContextCompactionPolicyHash = "1".repeat(64);
const researchHarnessHumanInteractionPolicyHash = "2".repeat(64);
const agentMontSourceRefHash = "3".repeat(64);
const agentMontRepositorySnapshotHash = "4".repeat(64);
const agentMontLicenseRefHash = "5".repeat(64);
const agentMontMonitoringConfigHash = "6".repeat(64);
const agentMontAgentConfigHash = "7".repeat(64);
const agentMontTaskManifestHash = "8".repeat(64);
const agentMontRunTraceHash = "9".repeat(64);
const agentMontTokenUsageManifestHash = "0".repeat(64);
const agentMontCostRateCardHash = "a".repeat(64);
const agentMontLatencyTraceHash = "b".repeat(64);
const agentMontResourceUtilizationHash = "c".repeat(64);
const agentMontCarbonEstimateConfigHash = "d".repeat(64);
const agentMontLogArtifactHash = "e".repeat(64);
const agentMontVisualizationArtifactHash = "f".repeat(64);
const agentMontMetricsReportHash = "1".repeat(64);
const agentMontReplayCommandHash = "2".repeat(64);
const edgeAiSourceRefHash = "3".repeat(64);
const edgeAiRepositorySnapshotHash = "4".repeat(64);
const edgeAiLicenseRefHash = "5".repeat(64);
const edgeAiDeviceProfileHash = "6".repeat(64);
const edgeAiRuntimeManifestHash = "7".repeat(64);
const edgeAiOptimizationManifestHash = "8".repeat(64);
const edgeAiBenchmarkDatasetHash = "9".repeat(64);
const edgeAiTaskManifestHash = "0".repeat(64);
const edgeAiAppScenarioHash = "a".repeat(64);
const edgeAiReplayCommandHash = "b".repeat(64);
const edgeAiMetricsReportHash = "c".repeat(64);
const miniAppBenchSourceRefHash = "d".repeat(64);
const miniAppBenchRepositorySnapshotHash = "e".repeat(64);
const miniAppBenchLicenseReviewHash = "f".repeat(64);
const miniAppBenchDatasetManifestHash = "1".repeat(64);
const miniAppBenchQuerySetHash = "2".repeat(64);
const miniAppBenchEvaluationReferenceManifestHash = "3".repeat(64);
const miniAppBenchGeneratedMiniAppManifestHash = "4".repeat(64);
const miniAppBenchGeneratedSourceCodeHash = "5".repeat(64);
const miniAppBenchLiveInstanceManifestHash = "6".repeat(64);
const miniAppBenchBrowserAutomationTraceHash = "7".repeat(64);
const miniAppBenchInteractionRubricHash = "8".repeat(64);
const miniAppBenchVisualRenderReportHash = "9".repeat(64);
const miniAppBenchDynamicInteractionReportHash = "0".repeat(64);
const miniAppBenchResultManifestHash = "a".repeat(64);
const miniAppBenchReplayCommandHash = "b".repeat(64);
const miniAppBenchCiReceiptHash = "c".repeat(64);
const knowlyticsAiSourceRefHash = "d".repeat(64);
const knowlyticsAiRepositorySnapshotHash = "e".repeat(64);
const knowlyticsAiNoLicenseBoundaryHash = "f".repeat(64);
const knowlyticsAiReadmeBlobHash = "1".repeat(64);
const knowlyticsAiStreamlitAppHash = "2".repeat(64);
const knowlyticsAiMcqGeneratorHash = "3".repeat(64);
const knowlyticsAiRagGeneratorHash = "4".repeat(64);
const knowlyticsAiEvaluatorHash = "5".repeat(64);
const knowlyticsAiRequirementsHash = "6".repeat(64);
const knowlyticsAiDemoArtifactHash = "7".repeat(64);
const knowlyticsAiSyntheticDocumentCorpusHash = "8".repeat(64);
const knowlyticsAiQuizSpecHash = "9".repeat(64);
const knowlyticsAiMcqFixtureHash = "0".repeat(64);
const knowlyticsAiAnswerKeyHash = "a".repeat(64);
const knowlyticsAiStudentResponseHash = "b".repeat(64);
const knowlyticsAiEvaluatorRubricHash = "c".repeat(64);
const knowlyticsAiRetrievalTraceHash = "d".repeat(64);
const knowlyticsAiGenerationTraceHash = "e".repeat(64);
const knowlyticsAiScoringTraceHash = "f".repeat(64);
const knowlyticsAiPerformanceFeedbackHash = "1".repeat(64);
const knowlyticsAiResultManifestHash = "2".repeat(64);
const knowlyticsAiReplayCommandHash = "3".repeat(64);
const knowlyticsAiCiReceiptHash = "4".repeat(64);
const spentSessionCostSourceRefHash = "d".repeat(64);
const spentSessionCostRepositorySnapshotHash = "e".repeat(64);
const spentSessionCostLicenseRefHash = "f".repeat(64);
const spentSessionCostHookConfigHash = "1".repeat(64);
const spentSessionCostJsonlLogManifestHash = "2".repeat(64);
const spentSessionCostPricingSnapshotHash = "3".repeat(64);
const spentSessionCostClassifierRulesHash = "4".repeat(64);
const spentSessionCostCommandTranscriptHash = "5".repeat(64);
const spentSessionCostDashboardExportHash = "6".repeat(64);
const spentSessionCostResultManifestHash = "7".repeat(64);
const spentSessionCostReplayCommandHash = "8".repeat(64);
const spentSessionCostCiReceiptHash = "9".repeat(64);
const spentSessionCostPrivacyBoundaryHash = "0".repeat(64);
const fireSourceRefHash = "1".repeat(64);
const fireRepositorySnapshotHash = "2".repeat(64);
const firePaperRefHash = "3".repeat(64);
const fireDatasetManifestHash = "4".repeat(64);
const fireAtomicClaimManifestHash = "5".repeat(64);
const fireRetrieverConfigHash = "6".repeat(64);
const fireVerifierConfigHash = "7".repeat(64);
const fireDecisionPolicyHash = "8".repeat(64);
const fireSearchProviderConfigHash = "9".repeat(64);
const fireEvidenceTraceHash = "0".repeat(64);
const fireQueryTraceHash = "a".repeat(64);
const fireVerificationLabelHash = "b".repeat(64);
const fireCostReportHash = "c".repeat(64);
const fireResultManifestHash = "d".repeat(64);
const fireReplayCommandHash = "e".repeat(64);
const fireCiReceiptHash = "f".repeat(64);
const nucliaRagTriadSourceRefHash = "1".repeat(64);
const nucliaRagTriadRepositorySnapshotHash = "2".repeat(64);
const nucliaRagTriadLicenseRefHash = "3".repeat(64);
const nucliaRagTriadPackageVersionHash = "4".repeat(64);
const nucliaRagTriadModelCardRefHash = "5".repeat(64);
const nucliaRagTriadModelCachePolicyHash = "6".repeat(64);
const nucliaRagTriadHfAuthBoundaryHash = "7".repeat(64);
const nucliaRagTriadEvaluatorConfigHash = "8".repeat(64);
const nucliaRagTriadDatasetManifestHash = "9".repeat(64);
const nucliaRagTriadQaContextManifestHash = "0".repeat(64);
const nucliaRagTriadMetricManifestHash = "a".repeat(64);
const nucliaRagTriadAnswerRelevanceTraceHash = "b".repeat(64);
const nucliaRagTriadContextRelevanceTraceHash = "c".repeat(64);
const nucliaRagTriadGroundednessTraceHash = "d".repeat(64);
const nucliaRagTriadResultManifestHash = "e".repeat(64);
const nucliaRagTriadReplayCommandHash = "f".repeat(64);
const nucliaRagTriadCiReceiptHash = "1".repeat(64);
const aiAgentBenchmarkSourceRefHash = "d".repeat(64);
const aiAgentBenchmarkRepositorySnapshotHash = "e".repeat(64);
const aiAgentBenchmarkLicenseRefHash = "f".repeat(64);
const aiAgentBenchmarkAgentRosterHash = "1".repeat(64);
const aiAgentBenchmarkBenchmarkDatasetHash = "2".repeat(64);
const aiAgentBenchmarkSourceManifestHash = "3".repeat(64);
const aiAgentBenchmarkPricingSnapshotHash = "4".repeat(64);
const aiAgentBenchmarkUserReportManifestHash = "5".repeat(64);
const aiAgentBenchmarkLeaderboardSnapshotHash = "6".repeat(64);
const aiAgentBenchmarkScoreManifestHash = "7".repeat(64);
const aiAgentBenchmarkEvalPackManifestHash = "8".repeat(64);
const aiAgentBenchmarkFixtureHash = "9".repeat(64);
const aiAgentBenchmarkReplayCommandHash = "0".repeat(64);
const aiAgentBenchmarkResultManifestHash = "a".repeat(64);
const aiAgentBenchmarkScoreDeltaReportHash = "b".repeat(64);
const aiAgentBenchmarkCiReceiptHash = "c".repeat(64);
const gaiaAgentSourceRefHash = "d".repeat(64);
const gaiaAgentRepositorySnapshotHash = "e".repeat(64);
const gaiaAgentLicenseRefHash = "f".repeat(64);
const gaiaAgentReadmeBlobHash = "1".repeat(64);
const gaiaAgentPackageManifestHash = "2".repeat(64);
const gaiaAgentLockfileHash = "3".repeat(64);
const gaiaAgentBenchmarkTreeHash = "4".repeat(64);
const gaiaAgentBenchmarkDownloaderHash = "5".repeat(64);
const gaiaAgentBenchmarkRunnerHash = "6".repeat(64);
const gaiaAgentBenchmarkEvaluatorHash = "7".repeat(64);
const gaiaAgentReflectionEvaluatorHash = "8".repeat(64);
const gaiaAgentReporterHash = "9".repeat(64);
const gaiaAgentBenchmarkWorkflowHash = "0".repeat(64);
const gaiaAgentBenchmarkDocsHash = "a".repeat(64);
const gaiaAgentBenchmarkResultsHash = "b".repeat(64);
const gaiaAgentValidationDocsHash = "c".repeat(64);
const gaiaAgentSourceTreeHash = "d".repeat(64);
const gaiaAgentTestTreeHash = "e".repeat(64);
const gaiaAgentTaskManifestHash = "f".repeat(64);
const gaiaAgentDatasetSnapshotHash = "1".repeat(64);
const gaiaAgentProviderConfigHash = "2".repeat(64);
const gaiaAgentModelRouteHash = "3".repeat(64);
const gaiaAgentRunConfigHash = "4".repeat(64);
const gaiaAgentRunOutputHash = "5".repeat(64);
const gaiaAgentScoreReportHash = "6".repeat(64);
const gaiaAgentReplayCommandHash = "7".repeat(64);
const gaiaAgentCiReceiptHash = "8".repeat(64);
const paperArenaSourceRefHash = "9".repeat(64);
const paperArenaRepositorySnapshotHash = "0".repeat(64);
const paperArenaNoLicenseBoundaryHash = "a".repeat(64);
const paperArenaReadmeBlobHash = "b".repeat(64);
const paperArenaRequirementsHash = "c".repeat(64);
const paperArenaHubConfigHash = "d".repeat(64);
const paperArenaHubRunnerHash = "e".repeat(64);
const paperArenaResultRecorderHash = "f".repeat(64);
const paperArenaDataLoaderHash = "1".repeat(64);
const paperArenaScorerHash = "2".repeat(64);
const paperArenaDatasetBuilderTreeHash = "3".repeat(64);
const paperArenaToolTreeHash = "4".repeat(64);
const paperArenaRagTreeHash = "5".repeat(64);
const paperArenaReflectorTreeHash = "6".repeat(64);
const paperArenaRunScriptTreeHash = "7".repeat(64);
const paperArenaHfDatasetSnapshotHash = "8".repeat(64);
const paperArenaDatasetManifestHash = "9".repeat(64);
const paperArenaPaperCorpusHash = "0".repeat(64);
const paperArenaQaManifestHash = "a".repeat(64);
const paperArenaResultManifestHash = "b".repeat(64);
const paperArenaScoreReportHash = "c".repeat(64);
const paperArenaReplayCommandHash = "d".repeat(64);
const paperArenaCiReceiptHash = "e".repeat(64);
const socialReasoningBenchSourceRefHash = "9".repeat(64);
const socialReasoningBenchRepositorySnapshotHash = "0".repeat(64);
const socialReasoningBenchLicenseRefHash = "a".repeat(64);
const socialReasoningBenchReadmeBlobHash = "b".repeat(64);
const socialReasoningBenchPyprojectHash = "c".repeat(64);
const socialReasoningBenchLockfileHash = "d".repeat(64);
const socialReasoningBenchDataTreeHash = "e".repeat(64);
const socialReasoningBenchDocsTreeHash = "f".repeat(64);
const socialReasoningBenchExperimentsTreeHash = "1".repeat(64);
const socialReasoningBenchOutputsTreeHash = "2".repeat(64);
const socialReasoningBenchPackagesTreeHash = "3".repeat(64);
const socialReasoningBenchScriptsTreeHash = "4".repeat(64);
const socialReasoningBenchRunnerHash = "5".repeat(64);
const socialReasoningBenchCollectorHash = "6".repeat(64);
const socialReasoningBenchValidationScriptHash = "7".repeat(64);
const socialReasoningBenchWorkflowHash = "8".repeat(64);
const socialReasoningBenchResultArtifactHash = "9".repeat(64);
const socialReasoningBenchCiReceiptHash = "0".repeat(64);
const bestTesterSourceRefHash = "1".repeat(64);
const bestTesterRepositorySnapshotHash = "2".repeat(64);
const bestTesterLicenseRefHash = "3".repeat(64);
const bestTesterReadmeBlobHash = "4".repeat(64);
const bestTesterPackageJsonHash = "5".repeat(64);
const bestTesterLockfileHash = "6".repeat(64);
const bestTesterTsconfigHash = "7".repeat(64);
const bestTesterPlaywrightConfigHash = "8".repeat(64);
const bestTesterSrcTreeHash = "9".repeat(64);
const bestTesterTestsTreeHash = "0".repeat(64);
const bestTesterAgentsTreeHash = "a".repeat(64);
const bestTesterMcpTreeHash = "b".repeat(64);
const bestTesterConfigTreeHash = "c".repeat(64);
const bestTesterScriptsTreeHash = "d".repeat(64);
const bestTesterMutationTreeHash = "e".repeat(64);
const bestTesterReportsTreeHash = "f".repeat(64);
const bestTesterWorkflowTreeHash = "1".repeat(64);
const bestTesterMcpServerHash = "2".repeat(64);
const bestTesterMcpClientHash = "3".repeat(64);
const bestTesterJudgeRubricHash = "4".repeat(64);
const bestTesterSecurityFuzzerHash = "5".repeat(64);
const bestTesterJiraReportHash = "6".repeat(64);
const bestTesterResultArtifactHash = "7".repeat(64);
const bestTesterCiReceiptHash = "8".repeat(64);
const agentKernelArenaSourceRefHash = "d".repeat(64);
const agentKernelArenaRepositorySnapshotHash = "e".repeat(64);
const agentKernelArenaLicenseRefHash = "f".repeat(64);
const agentKernelArenaTaskManifestHash = "1".repeat(64);
const agentKernelArenaTaskConfigHash = "2".repeat(64);
const agentKernelArenaAgentRosterHash = "3".repeat(64);
const agentKernelArenaAgentConfigHash = "4".repeat(64);
const agentKernelArenaPromptTemplateHash = "5".repeat(64);
const agentKernelArenaWorkspaceIsolationHash = "6".repeat(64);
const agentKernelArenaEnvironmentManifestHash = "7".repeat(64);
const agentKernelArenaGpuProfileHash = "8".repeat(64);
const agentKernelArenaDependencyLockHash = "9".repeat(64);
const agentKernelArenaCompileCommandHash = "0".repeat(64);
const agentKernelArenaCorrectnessCommandHash = "a".repeat(64);
const agentKernelArenaPerformanceCommandHash = "b".repeat(64);
const agentKernelArenaBaselineKernelHash = "c".repeat(64);
const agentKernelArenaCandidateKernelHash = "d".repeat(64);
const agentKernelArenaCompileResultHash = "e".repeat(64);
const agentKernelArenaCorrectnessResultHash = "f".repeat(64);
const agentKernelArenaPerformanceProfileHash = "1".repeat(64);
const agentKernelArenaScoreReportHash = "2".repeat(64);
const agentKernelArenaRunLogHash = "3".repeat(64);
const agentKernelArenaReplayCommandHash = "4".repeat(64);
const agentKernelArenaCiReceiptHash = "5".repeat(64);
const agentKernelArenaComparisonReportHash = "6".repeat(64);
const llmEvaluationSystemSourceRefHash = "7".repeat(64);
const llmEvaluationSystemRepositorySnapshotHash = "8".repeat(64);
const llmEvaluationSystemLicenseRefHash = "9".repeat(64);
const llmEvaluationSystemPackageVersionRefHash = "0".repeat(64);
const llmEvaluationSystemMcpInstallManifestHash = "a".repeat(64);
const llmEvaluationSystemDatasetManifestHash = "b".repeat(64);
const llmEvaluationSystemSyntheticQaManifestHash = "c".repeat(64);
const llmEvaluationSystemDocumentGroundingManifestHash = "d".repeat(64);
const llmEvaluationSystemJudgeConfigHash = "e".repeat(64);
const llmEvaluationSystemJuryRosterHash = "f".repeat(64);
const llmEvaluationSystemCriteriaManifestHash = "1".repeat(64);
const llmEvaluationSystemBinaryScoringPolicyHash = "2".repeat(64);
const llmEvaluationSystemExecutionManifestHash = "3".repeat(64);
const llmEvaluationSystemAgentTraceManifestHash = "4".repeat(64);
const llmEvaluationSystemOpenTelemetryTraceHash = "5".repeat(64);
const llmEvaluationSystemBedrockAccessBoundaryHash = "6".repeat(64);
const llmEvaluationSystemResultManifestHash = "7".repeat(64);
const llmEvaluationSystemAnalysisReportHash = "8".repeat(64);
const llmEvaluationSystemPdfReportHash = "9".repeat(64);
const llmEvaluationSystemS3SyncReceiptHash = "0".repeat(64);
const llmEvaluationSystemReplayCommandHash = "a".repeat(64);
const llmEvaluationSystemCiReceiptHash = "b".repeat(64);
const llmEvaluationSystemNoConfigOnlyBoundaryHash = "c".repeat(64);
const innovatorBenchSourceRefHash = "d".repeat(64);
const innovatorBenchRepositorySnapshotHash = "e".repeat(64);
const innovatorBenchLicenseRefHash = "f".repeat(64);
const innovatorBenchPaperRefHash = "1".repeat(64);
const innovatorBenchDatasetRefHash = "2".repeat(64);
const innovatorBenchTaskManifestHash = "3".repeat(64);
const innovatorBenchTaskConfigHash = "4".repeat(64);
const innovatorBenchResearchGymConfigHash = "5".repeat(64);
const innovatorBenchAgentConfigHash = "6".repeat(64);
const innovatorBenchToolRegistryHash = "7".repeat(64);
const innovatorBenchWorkspaceDatasetPathPolicyHash = "8".repeat(64);
const innovatorBenchEnvironmentManifestHash = "9".repeat(64);
const innovatorBenchDockerWebBackendHash = "0".repeat(64);
const innovatorBenchMultiGpuNodeManifestHash = "a".repeat(64);
const innovatorBenchCheckpointManifestHash = "b".repeat(64);
const innovatorBenchExecutionManifestHash = "c".repeat(64);
const innovatorBenchResultManifestHash = "d".repeat(64);
const innovatorBenchMetricManifestHash = "e".repeat(64);
const innovatorBenchScoreReportHash = "f".repeat(64);
const innovatorBenchReplayCommandHash = "1".repeat(64);
const innovatorBenchCiReceiptHash = "2".repeat(64);
const innovatorBenchNoLeaderboardOnlyBoundaryHash = "3".repeat(64);
const innovatorBenchNoDatasetCopyBoundaryHash = "4".repeat(64);
const gtoWizardSourceRefHash = "d".repeat(64);
const gtoWizardRepositorySnapshotHash = "e".repeat(64);
const gtoWizardLicenseRefHash = "f".repeat(64);
const gtoWizardApiDocRefHash = "1".repeat(64);
const gtoWizardTechnicalPaperRefHash = "2".repeat(64);
const gtoWizardEvalPackManifestHash = "3".repeat(64);
const gtoWizardFixtureHash = "4".repeat(64);
const gtoWizardAgentPolicyManifestHash = "5".repeat(64);
const gtoWizardApiKeyScopeHash = "6".repeat(64);
const gtoWizardNoSolverAccessPolicyHash = "7".repeat(64);
const gtoWizardHandHistoryManifestHash = "8".repeat(64);
const gtoWizardActionTraceHash = "9".repeat(64);
const gtoWizardResultManifestHash = "0".repeat(64);
const gtoWizardAivatMetricReportHash = "a".repeat(64);
const gtoWizardLeaderboardSnapshotHash = "b".repeat(64);
const gtoWizardReplayCommandHash = "c".repeat(64);
const gtoWizardCiReceiptHash = "d".repeat(64);
const costNavSourceRefHash = "e".repeat(64);
const costNavRepositorySnapshotHash = "f".repeat(64);
const costNavLicenseRefHash = "1".repeat(64);
const costNavBenchmarkSpecHash = "2".repeat(64);
const costNavScenarioManifestHash = "3".repeat(64);
const costNavRouteGraphHash = "4".repeat(64);
const costNavEconomicCostModelHash = "5".repeat(64);
const costNavPhysicalAgentConfigHash = "6".repeat(64);
const costNavSimulatorConfigHash = "7".repeat(64);
const costNavTrajectoryManifestHash = "8".repeat(64);
const costNavResultManifestHash = "9".repeat(64);
const costNavMetricsReportHash = "0".repeat(64);
const costNavReplayCommandHash = "a".repeat(64);
const costNavCiReceiptHash = "b".repeat(64);
const agentWorkflowKitSourceRefHash = "3".repeat(64);
const agentWorkflowKitRepositorySnapshotHash = "4".repeat(64);
const agentWorkflowKitLicenseRefHash = "5".repeat(64);
const agentWorkflowKitGuideHash = "6".repeat(64);
const agentWorkflowKitSkillPackageManifestHash = "7".repeat(64);
const agentWorkflowKitTemplateManifestHash = "8".repeat(64);
const agentWorkflowKitRiskScoringRubricHash = "9".repeat(64);
const agentWorkflowKitWorkflowLevelPolicyHash = "0".repeat(64);
const agentWorkflowKitSpecLayerPolicyHash = "a".repeat(64);
const agentWorkflowKitApprovalPolicyHash = "b".repeat(64);
const agentWorkflowKitVerificationCommandManifestHash = "c".repeat(64);
const agentWorkflowKitDocsCheckWorkflowHash = "d".repeat(64);
const agentWorkflowKitEvaluationManifestHash = "e".repeat(64);
const agentWorkflowKitReplayCommandHash = "f".repeat(64);
const streamingSourceDatasetManifestHash = "1".repeat(64);
const streamingOriginalSourceManifestHash = "2".repeat(64);
const streamingAgentConfigHash = "3".repeat(64);
const streamingBenchmarkConfigHash = "4".repeat(64);
const streamingSequenceHash = "5".repeat(64);
const streamingInitialStateHash = "6".repeat(64);
const streamingUpdateTraceHash = "7".repeat(64);
const streamingPredictionTraceHash = "8".repeat(64);
const streamingEvaluationTraceHash = "9".repeat(64);
const streamingSanityCheckTraceHash = "0".repeat(64);
const streamingResultArtifactHash = "a".repeat(64);
const streamingBatchRunConfigHash = "b".repeat(64);
const bioTaskManifestHash = "c".repeat(64);
const bioDatasetSpecHash = "d".repeat(64);
const bioKnowledgeBaseManifestHash = "e".repeat(64);
const bioToolRegistryHash = "f".repeat(64);
const bioWorkflowGraphHash = "1".repeat(64);
const bioModelConfigHash = "2".repeat(64);
const bioSandboxConfigHash = "3".repeat(64);
const bioExecutionTraceHash = "4".repeat(64);
const bioCodeExecutionTraceHash = "5".repeat(64);
const bioStructuredResultHash = "6".repeat(64);
const bioReportArtifactHash = "7".repeat(64);
const bioGeneratedArtifactManifestHash = "8".repeat(64);
const bioEvaluatorConfigHash = "9".repeat(64);
const medAskSourceRefHash = "0".repeat(64);
const medAskRepositorySnapshotHash = "a".repeat(64);
const medAskLicenseRefHash = "b".repeat(64);
const medAskRequirementsHash = "c".repeat(64);
const medAskSetupHash = "d".repeat(64);
const medAskSymptomCheckVignetteManifestHash = "e".repeat(64);
const medAskTriageVignetteManifestHash = "f".repeat(64);
const medAskSymptomCheckEvaluationScriptHash = "1".repeat(64);
const medAskTriageEvaluationScriptHash = "2".repeat(64);
const medAskPatientSimulatorConfigHash = "3".repeat(64);
const medAskDoctorModelConfigHash = "4".repeat(64);
const medAskTriageModelConfigHash = "5".repeat(64);
const medAskSymptomCheckResultManifestHash = "6".repeat(64);
const medAskTriageResultManifestHash = "7".repeat(64);
const medAskPairedAnalysisHash = "8".repeat(64);
const medAskRunCommandHash = "9".repeat(64);
const medAskReplayCommandHash = "0".repeat(64);
const bioKgBenchSourceRefHash = "a".repeat(64);
const bioKgBenchRepositorySnapshotHash = "b".repeat(64);
const bioKgBenchPaperRefHash = "c".repeat(64);
const bioKgBenchLicenseRefHash = "d".repeat(64);
const bioKgBenchDatasetReleaseHash = "e".repeat(64);
const bioKgBenchKnowledgeGraphManifestHash = "f".repeat(64);
const bioKgBenchKgBuildConfigHash = "1".repeat(64);
const bioKgBenchTaskManifestHash = "2".repeat(64);
const bioKgBenchKgCheckManifestHash = "3".repeat(64);
const bioKgBenchKgQaManifestHash = "4".repeat(64);
const bioKgBenchScvManifestHash = "5".repeat(64);
const bioKgBenchAgentConfigHash = "6".repeat(64);
const bioKgBenchRagConfigHash = "7".repeat(64);
const bioKgBenchNeo4jConfigHash = "8".repeat(64);
const bioKgBenchEvaluationScriptHash = "9".repeat(64);
const bioKgBenchResultManifestHash = "0".repeat(64);
const bioKgBenchErrorDiscoveryReportHash = "a".repeat(64);
const bioKgBenchReplayCommandHash = "b".repeat(64);
const bioKgBenchCiReceiptHash = "c".repeat(64);
const bioMedArenaSourceRefHash = "d".repeat(64);
const bioMedArenaRepositorySnapshotHash = "e".repeat(64);
const bioMedArenaLicenseRefHash = "f".repeat(64);
const bioMedArenaReadmeHash = "1".repeat(64);
const bioMedArenaPyprojectHash = "2".repeat(64);
const bioMedArenaConfigHash = "3".repeat(64);
const bioMedArenaMatrixConfigHash = "4".repeat(64);
const bioMedArenaHarnessTreeHash = "5".repeat(64);
const bioMedArenaHarnessCliHash = "6".repeat(64);
const bioMedArenaBenchmarkConfigHash = "7".repeat(64);
const bioMedArenaEvalSuiteHash = "8".repeat(64);
const bioMedArenaAdapterRegistryHash = "9".repeat(64);
const bioMedArenaToolRegistryHash = "0".repeat(64);
const bioMedArenaVendorManifestHash = "a".repeat(64);
const bioMedArenaBaselineAgentHash = "b".repeat(64);
const bioMedArenaQuickRunHash = "c".repeat(64);
const bioMedArenaReleaseGateHash = "d".repeat(64);
const bioMedArenaResultManifestHash = "e".repeat(64);
const bioMedArenaReplayCommandHash = "f".repeat(64);
const bioMedArenaCiReceiptHash = "1".repeat(64);
const mlDevPaperRefHash = "0".repeat(64);
const mlDevTaskSuiteHash = "a".repeat(64);
const mlDevTaskConfigHash = "b".repeat(64);
const mlDevWorkspaceFixtureHash = "c".repeat(64);
const mlDevRuntimeEnvironmentHash = "d".repeat(64);
const mlDevDependencyLockHash = "e".repeat(64);
const mlDevAgentConfigHash = "f".repeat(64);
const mlDevCalipersConfigHash = "1".repeat(64);
const mlDevHydraOverrideHash = "2".repeat(64);
const mlDevMetricsConfigHash = "3".repeat(64);
const mlDevValidationScriptHash = "4".repeat(64);
const mlDevReplayCommandHash = "5".repeat(64);
const mlDevReportArtifactHash = "6".repeat(64);
const mlDevTraceArtifactHash = "7".repeat(64);
const text2SqlSourceRefHash = "8".repeat(64);
const text2SqlDatasetVersionHash = "9".repeat(64);
const text2SqlDatabaseSnapshotHash = "0".repeat(64);
const text2SqlSchemaManifestHash = "a".repeat(64);
const text2SqlBusinessDomainManifestHash = "b".repeat(64);
const text2SqlQuerySetHash = "c".repeat(64);
const text2SqlReferenceSqlManifestHash = "d".repeat(64);
const text2SqlExpectedResultManifestHash = "e".repeat(64);
const text2SqlAgentConfigHash = "f".repeat(64);
const text2SqlModelConfigHash = "1".repeat(64);
const text2SqlToolRegistryHash = "2".repeat(64);
const text2SqlSchemaMemoryHash = "3".repeat(64);
const text2SqlSchemaRetrievalTraceHash = "4".repeat(64);
const text2SqlSqlGovernanceConfigHash = "5".repeat(64);
const text2SqlSecurityControlManifestHash = "6".repeat(64);
const text2SqlAuditLogHash = "7".repeat(64);
const text2SqlPromptPolicyHash = "8".repeat(64);
const text2SqlExecutionTraceHash = "9".repeat(64);
const text2SqlResultArtifactHash = "0".repeat(64);
const text2SqlReplayCommandHash = "a".repeat(64);
const enterpriseCapabilityDomainHash = "a".repeat(64);
const enterpriseInputDatasetHash = "b".repeat(64);
const enterpriseExpectedOutputHash = "c".repeat(64);
const enterpriseLocalApiManifestHash = "d".repeat(64);
const enterpriseDatabaseSnapshotHash = "e".repeat(64);
const enterpriseDocumentCollectionHash = "f".repeat(64);
const enterpriseMcpServerConfigHash = "1".repeat(64);
const enterpriseToolSchemaManifestHash = "2".repeat(64);
const enterprisePolicyConstraintHash = "3".repeat(64);
const enterpriseAgentConfigHash = "4".repeat(64);
const enterpriseTrajectoryReplayHash = "5".repeat(64);
const enterpriseToolCallTraceHash = "6".repeat(64);
const enterpriseToolResponseTraceHash = "7".repeat(64);
const enterpriseRetrievedEvidenceTraceHash = "8".repeat(64);
const enterpriseOutputValidationHash = "9".repeat(64);
const enterpriseEvaluatorConfigHash = "0".repeat(64);
const enterpriseLeaderboardSubmissionHash = "a".repeat(64);
const scienceDatasetRegistryHash = "1".repeat(64);
const scienceModelRegistryHash = "2".repeat(64);
const sciencePromptTemplateHash = "3".repeat(64);
const scienceEvaluatorConfigHash = "4".repeat(64);
const scienceSandboxConfigHash = "5".repeat(64);
const scienceBatchRunConfigHash = "6".repeat(64);
const scienceResultArtifactHash = "7".repeat(64);
const scienceLeaderboardSnapshotHash = "8".repeat(64);
const scienceReportArtifactHash = "9".repeat(64);
const arthurCriteriaHash = "a".repeat(64);
const arthurAlertQueryHash = "b".repeat(64);
const videoTaskInstructionHash = "c".repeat(64);
const videoSourceMediaManifestHash = "d".repeat(64);
const videoCandidateMediaManifestHash = "e".repeat(64);
const videoExpectedOutputSpecHash = "f".repeat(64);
const videoVerifierDesignHash = "1".repeat(64);
const videoRewardJsonHash = "2".repeat(64);
const videoMetricBreakdownHash = "3".repeat(64);
const videoAgentTrajectoryHash = "4".repeat(64);
const videoResultHash = "5".repeat(64);
const videoTrialLogHash = "6".repeat(64);
const videoSandboxImageHash = "7".repeat(64);
const videoOracleSolverHash = "8".repeat(64);
const videoBaselineSolverHash = "9".repeat(64);
const videoLeaderboardSubmissionHash = "0".repeat(64);
const pawbenchTaskPromptHash = "1".repeat(64);
const pawbenchWorkspaceContractHash = "2".repeat(64);
const pawbenchTimeoutPolicyHash = "3".repeat(64);
const pawbenchGraderCodeHash = "4".repeat(64);
const pawbenchJudgeRubricHash = "5".repeat(64);
const pawbenchTaskMetadataHash = "6".repeat(64);
const pawbenchTranscriptHash = "7".repeat(64);
const pawbenchMetricsJsonHash = "8".repeat(64);
const pawbenchSubmissionJsonHash = "9".repeat(64);
const pawbenchSlicePayloadHash = "0".repeat(64);
const pawbenchLeaderboardSnapshotHash = "a".repeat(64);
const pawbenchReplayCommandHash = "b".repeat(64);
const pawbenchResultsVersionPathHash = "c".repeat(64);
const pawbenchSavedWorkspaceHash = "d".repeat(64);
const pawbenchSavedDockerImageHash = "e".repeat(64);
const codingAgentReportSourceRefHash = "f".repeat(64);
const codingAgentReportSourceMaterialsHash = "1".repeat(64);
const codingAgentReportPromptHash = "2".repeat(64);
const codingAgentReportRosterHash = "3".repeat(64);
const codingAgentReportRubricHash = "4".repeat(64);
const codingAgentReportCategoryScoreManifestHash = "5".repeat(64);
const codingAgentReportImplementationArtifactHash = "6".repeat(64);
const codingAgentReportScreenshotManifestHash = "7".repeat(64);
const codingAgentReportReportArtifactHash = "8".repeat(64);
const codingAgentReportReplayCommandHash = "9".repeat(64);
const codingAgentReportDependencyLockHash = "0".repeat(64);
const codingAgentReportTestReportHash = "a".repeat(64);
const codingAgentReportReviewerProtocolHash = "b".repeat(64);
const hackabilitySourceRefHash = "c".repeat(64);
const hackabilityTargetTaskManifestHash = "d".repeat(64);
const hackabilityAuditConfigHash = "e".repeat(64);
const hackabilitySetupTraceHash = "f".repeat(64);
const hackabilityStaticTraceHash = "1".repeat(64);
const hackabilityReconTraceHash = "2".repeat(64);
const hackabilityVulnerabilityTraceHash = "3".repeat(64);
const hackabilityPocTraceHash = "4".repeat(64);
const hackabilityReportTraceHash = "5".repeat(64);
const hackabilitySemgrepConfigHash = "6".repeat(64);
const hackabilitySemgrepReportHash = "7".repeat(64);
const hackabilityBanditConfigHash = "8".repeat(64);
const hackabilityBanditReportHash = "9".repeat(64);
const hackabilityAiInspectionTraceHash = "0".repeat(64);
const hackabilityVulnerabilityFindingManifestHash = "a".repeat(64);
const hackabilityDashboardEventStreamHash = "b".repeat(64);
const hackabilityReportArtifactHash = "c".repeat(64);
const hackabilityReplayCommandHash = "d".repeat(64);
const hackabilitySandboxConfigHash = "e".repeat(64);
const hackabilityDependencyLockHash = "f".repeat(64);
const hackabilityModelConfigHash = "1".repeat(64);
const hackabilityPromptPackHash = "2".repeat(64);
const hackabilityFindingEvidenceHash = "3".repeat(64);
const hackabilityPocArtifactHash = "4".repeat(64);
const logicPaperRefHash = "f".repeat(64);
const logicDatasetManifestHash = "1".repeat(64);
const logicDatasetAccessReceiptHash = "2".repeat(64);
const logicLicenseRefHash = "3".repeat(64);
const logicSubmoduleManifestHash = "4".repeat(64);
const logicEnvironmentYamlHash = "5".repeat(64);
const logicSetupScriptHash = "6".repeat(64);
const logicInferenceProviderConfigHash = "7".repeat(64);
const logicChatCompletionModuleHash = "8".repeat(64);
const logicSecretBoundaryHash = "9".repeat(64);
const logicAgentConfigHash = "0".repeat(64);
const logicAuxiliaryToolManifestHash = "a".repeat(64);
const logicConstraintSolverConfigHash = "b".repeat(64);
const logicRunCommandHash = "c".repeat(64);
const logicReplayCommandHash = "d".repeat(64);
const logicOutputJsonHash = "e".repeat(64);
const logicZeroEvalConfigHash = "f".repeat(64);
const logicZeroEvalResultHash = "1".repeat(64);
const logicSummaryMarkdownHash = "2".repeat(64);
const logicUnitTestCommandHash = "3".repeat(64);
const logicUnitTestResultHash = "4".repeat(64);
const azureWorkshopGuideHash = "f".repeat(64);
const azureNotebookHash = "1".repeat(64);
const azureServiceConfigHashA = "2".repeat(64);
const azureServiceConfigHashB = "3".repeat(64);
const azureAiProjectConfigHash = "4".repeat(64);
const azureSearchIndexConfigHash = "5".repeat(64);
const azureRagCorpusHash = "6".repeat(64);
const azureToolConnectorConfigHash = "7".repeat(64);
const azureEvaluatorConfigHash = "8".repeat(64);
const azureCustomEvaluatorHash = "9".repeat(64);
const azurePromptOptimizationTraceHash = "0".repeat(64);
const azureCloudRunArtifactHash = "a".repeat(64);
const azureCredentialScopeHash = "b".repeat(64);
const azureManagedIdentityRoleHash = "c".repeat(64);
const azureReplayCommandHash = "d".repeat(64);
const clawDatasetVersionHash = "e".repeat(64);
const clawTaskYamlHash = "f".repeat(64);
const clawTaskConfigSchemaHash = "1".repeat(64);
const clawGenerationPromptHash = "2".repeat(64);
const clawFixtureManifestHash = "3".repeat(64);
const clawServiceCatalogHash = "4".repeat(64);
const clawServiceStateHash = "5".repeat(64);
const clawAuditLogHash = "6".repeat(64);
const clawTrajectoryCaptureHash = "7".repeat(64);
const clawVerificationConfigHash = "8".repeat(64);
const clawScoringRubricHash = "9".repeat(64);
const clawSafetyCheckConfigHash = "0".repeat(64);
const clawDockerImageHash = "a".repeat(64);
const clawAgentAdapterHash = "b".repeat(64);
const clawMcpServerConfigHash = "c".repeat(64);
const clawSkillInstructionHash = "d".repeat(64);
const clawReplayCommandHash = "e".repeat(64);
const deepResearchWorkflowConfigHash = "f".repeat(64);
const deepResearchLlmConfigHash = "1".repeat(64);
const deepResearchSearchConfigHash = "2".repeat(64);
const deepResearchKnowledgeBaseManifestHash = "3".repeat(64);
const deepResearchToolDescriptionHash = "4".repeat(64);
const deepResearchInteractionHistoryHash = "5".repeat(64);
const deepResearchTaskPlanHash = "6".repeat(64);
const deepResearchProgressiveSearchTraceHash = "7".repeat(64);
const deepResearchToolCallTraceHash = "8".repeat(64);
const deepResearchKnowledgeExtractionHash = "9".repeat(64);
const deepResearchCrossEvaluationTraceHash = "0".repeat(64);
const deepResearchIterationLogHash = "a".repeat(64);
const deepResearchFinalReportHash = "b".repeat(64);
const deepResearchReportOutlineHash = "c".repeat(64);
const deepResearchCustomWorkflowHash = "d".repeat(64);
const deepResearchLocalRuntimeConfigHash = "e".repeat(64);
const deepResearchPoetryLockHash = "f".repeat(64);
const deepResearchReplayCommandHash = "1".repeat(64);
const advancedRagNotebookHash = "2".repeat(64);
const advancedRagNotebookOutputHash = "3".repeat(64);
const advancedRagEnvironmentHash = "4".repeat(64);
const advancedRagDependencyLockHash = "5".repeat(64);
const advancedRagCorpusDocumentHash = "6".repeat(64);
const advancedRagIndexConfigHash = "7".repeat(64);
const advancedRagQuerySetHash = "8".repeat(64);
const advancedRagReferenceAnswerSetHash = "9".repeat(64);
const advancedRagRetrievalTraceHash = "0".repeat(64);
const advancedRagGenerationTraceHash = "a".repeat(64);
const advancedRagEvalConfigHash = "b".repeat(64);
const advancedRagEvalTraceHash = "c".repeat(64);
const advancedRagObservabilityTraceHash = "d".repeat(64);
const advancedRagReplayCommandHash = "e".repeat(64);
const gageRunConfigHash = "f".repeat(64);
const gageRegistryManifestHash = "1".repeat(64);
const gageDatasetManifestHash = "2".repeat(64);
const gageModelBackendConfigHash = "3".repeat(64);
const gageRoleAdapterConfigHash = "4".repeat(64);
const gageMetricConfigHash = "5".repeat(64);
const gageOutputContractHash = "6".repeat(64);
const gageArenaRuntimeConfigHash = "7".repeat(64);
const gageExternalHarnessConfigHash = "8".repeat(64);
const gageEventsJsonlHash = "9".repeat(64);
const gageSamplesJsonlHash = "0".repeat(64);
const gageSummaryJsonHash = "a".repeat(64);
const gageSampleArtifactManifestHash = "b".repeat(64);
const gageRawArtifactManifestHash = "c".repeat(64);
const gageVisualArtifactManifestHash = "d".repeat(64);
const gageOutputDirHash = "e".repeat(64);
const gageEnvironmentHash = "f".repeat(64);
const gageDependencyLockHash = "1".repeat(64);
const gageReplayCommandHash = "2".repeat(64);
const vlaModelConfigHash = "3".repeat(64);
const vlaDatasetManifestHash = "4".repeat(64);
const vlaBenchmarkManifestHash = "5".repeat(64);
const vlaMetricManifestHash = "6".repeat(64);
const vlaEnvironmentConfigHash = "7".repeat(64);
const vlaObservationActionTraceHash = "8".repeat(64);
const vlaPredictedObservationTraceHash = "9".repeat(64);
const vlaGeneratedTrajectoryManifestHash = "0".repeat(64);
const vlaSimulatorConfigHash = "a".repeat(64);
const vlaRewardEvaluatorHash = "b".repeat(64);
const vlaPolicyConfigHash = "c".repeat(64);
const vlaReplayCommandHash = "d".repeat(64);
const judgeItRepositorySnapshotHash = "6".repeat(64);
const judgeItDatasetManifestHash = "7".repeat(64);
const judgeItGoldenTextManifestHash = "8".repeat(64);
const judgeItGeneratedTextManifestHash = "9".repeat(64);
const judgeItPipelineConfigHash = "0".repeat(64);
const judgeItJudgeModelConfigHash = "a".repeat(64);
const judgeItRubricHash = "b".repeat(64);
const judgeItHumanEvalReferenceHash = "c".repeat(64);
const judgeItEvaluationConfigHash = "d".repeat(64);
const judgeItBatchRunConfigHash = "e".repeat(64);
const judgeItResultExportHash = "f".repeat(64);
const judgeItMetricsReportHash = "1".repeat(64);
const judgeItReplayCommandHash = "2".repeat(64);
const freshStackRepositorySnapshotHash = "3".repeat(64);
const freshStackPaperRefHash = "4".repeat(64);
const freshStackQueryDatasetHash = "5".repeat(64);
const freshStackCorpusDatasetHash = "6".repeat(64);
const freshStackStackOverflowQueryManifestHash = "7".repeat(64);
const freshStackGithubCorpusManifestHash = "8".repeat(64);
const freshStackDatasetLicenseHash = "9".repeat(64);
const freshStackCodeLicenseHash = "0".repeat(64);
const freshStackBeirFormatManifestHash = "a".repeat(64);
const freshStackNuggetQrelsHash = "b".repeat(64);
const freshStackQueryQrelsHash = "c".repeat(64);
const freshStackQueryToNuggetMapHash = "d".repeat(64);
const freshStackChunkingConfigHash = "e".repeat(64);
const freshStackRetrieverConfigHash = "f".repeat(64);
const freshStackIndexArtifactHash = "1".repeat(64);
const freshStackRunfileHash = "2".repeat(64);
const freshStackEvaluatorConfigHash = "3".repeat(64);
const freshStackMetricsReportHash = "4".repeat(64);
const freshStackLeaderboardSnapshotHash = "5".repeat(64);
const freshStackReplayCommandHash = "6".repeat(64);
const benchLoopRepositorySnapshotHash = "a".repeat(64);
const benchLoopPackageVersionHash = "b".repeat(64);
const benchLoopSuiteManifestHash = "c".repeat(64);
const benchLoopTaskManifestHash = "d".repeat(64);
const benchLoopFrozenTaskSetHash = "e".repeat(64);
const benchLoopScorerConfigHash = "f".repeat(64);
const benchLoopHarnessConfigHash = "1".repeat(64);
const benchLoopProviderConfigHash = "2".repeat(64);
const benchLoopEndpointConfigHash = "3".repeat(64);
const benchLoopModelConfigHash = "4".repeat(64);
const benchLoopMachineProfileHash = "5".repeat(64);
const benchLoopGpuProfileHash = "6".repeat(64);
const benchLoopDependencyLockHash = "7".repeat(64);
const benchLoopRunConfigHash = "8".repeat(64);
const benchLoopRunOutputManifestHash = "9".repeat(64);
const benchLoopMetricsReportHash = "0".repeat(64);
const benchLoopAgentLoopTraceHash = "a".repeat(64);
const benchLoopToolCallTraceHash = "b".repeat(64);
const benchLoopTokenLatencyTraceHash = "c".repeat(64);
const benchLoopRunPersistenceHash = "d".repeat(64);
const benchLoopExportArtifactHash = "e".repeat(64);
const benchLoopLeaderboardSubmissionHash = "f".repeat(64);
const benchLoopReplayCommandHash = "1".repeat(64);
const scenarioSimulationRepositorySnapshotHash = "2".repeat(64);
const scenarioSimulationSourceRefHash = "3".repeat(64);
const scenarioSimulationProjectManifestHash = "4".repeat(64);
const scenarioSimulationSceneDefinitionHash = "5".repeat(64);
const scenarioSimulationRoleDefinitionHash = "6".repeat(64);
const scenarioSimulationAgentRosterHash = "7".repeat(64);
const scenarioSimulationHumanPolicyHash = "8".repeat(64);
const scenarioSimulationLlmConfigHash = "9".repeat(64);
const scenarioSimulationEvaluatorConfigHash = "0".repeat(64);
const scenarioSimulationActionSchemaHash = "a".repeat(64);
const scenarioSimulationTaskDatasetHash = "b".repeat(64);
const scenarioSimulationWebUiBuildHash = "c".repeat(64);
const scenarioSimulationServerConfigHash = "d".repeat(64);
const scenarioSimulationContainerImageHash = "e".repeat(64);
const scenarioSimulationPersistenceStoreHash = "f".repeat(64);
const scenarioSimulationCheckpointManifestHash = "1".repeat(64);
const scenarioSimulationRunConfigHash = "2".repeat(64);
const scenarioSimulationEventLogHash = "3".repeat(64);
const scenarioSimulationActionTraceHash = "4".repeat(64);
const scenarioSimulationEvaluationReportHash = "5".repeat(64);
const scenarioSimulationVisualizationArtifactHash = "6".repeat(64);
const scenarioSimulationReplayCommandHash = "7".repeat(64);
const warehouseNativeRepositorySnapshotHash = "8".repeat(64);
const warehouseNativeSourceRefHash = "9".repeat(64);
const warehouseNativeDbtProjectManifestHash = "0".repeat(64);
const warehouseNativeDbtPackageLockHash = "a".repeat(64);
const warehouseNativeAdapterConfigHash = "b".repeat(64);
const warehouseNativeAiFunctionManifestHash = "c".repeat(64);
const warehouseNativeModelManifestHash = "d".repeat(64);
const warehouseNativeCaptureConfigHash = "e".repeat(64);
const warehouseNativePromptSchemaHash = "f".repeat(64);
const warehouseNativeBaselineDatasetHash = "1".repeat(64);
const warehouseNativeBaselineVersionHash = "2".repeat(64);
const warehouseNativeCriteriaHash = "3".repeat(64);
const warehouseNativeJudgeModelHash = "4".repeat(64);
const warehouseNativeSamplingHash = "5".repeat(64);
const warehouseNativeThresholdHash = "6".repeat(64);
const warehouseNativeRawCaptureTableHash = "7".repeat(64);
const warehouseNativeRawBaselineTableHash = "8".repeat(64);
const warehouseNativeJudgeEvaluationTableHash = "9".repeat(64);
const warehouseNativeEvalScoreTableHash = "0".repeat(64);
const warehouseNativePerformanceSummaryHash = "a".repeat(64);
const warehouseNativeDriftDetectionHash = "b".repeat(64);
const warehouseNativeAlertTableHash = "c".repeat(64);
const warehouseNativeCompiledSqlHash = "d".repeat(64);
const warehouseNativeRunResultHash = "e".repeat(64);
const warehouseNativeDataEgressPolicyHash = "f".repeat(64);
const warehouseNativeReplayCommandHash = "1".repeat(64);
const adGenRepositorySnapshotHash = "2".repeat(64);
const adGenReleaseManifestHash = "3".repeat(64);
const adGenSourceCorpusManifestHash = "4".repeat(64);
const adGenLabDatasetHash = "5".repeat(64);
const adGenRealDatasetHash = "6".repeat(64);
const adGenConversionScriptHash = "7".repeat(64);
const adGenLabelingPromptHash = "8".repeat(64);
const adGenOutputSchemaHash = "9".repeat(64);
const adGenAttackMappingHash = "0".repeat(64);
const adGenActionSchemaHash = "a".repeat(64);
const adGenValidationReportHash = "b".repeat(64);
const adGenLabelQualityReportHash = "c".repeat(64);
const adGenCrossModelAuditReportHash = "d".repeat(64);
const adGenDatasetLicenseHash = "e".repeat(64);
const adGenCodeLicenseHash = "f".repeat(64);
const adGenReplayCommandHash = "1".repeat(64);
const docThinkerRepositorySnapshotHash = "3".repeat(64);
const docThinkerPaperRefHash = "4".repeat(64);
const docThinkerLicenseRefHash = "5".repeat(64);
const docThinkerDocumentCorpusHash = "6".repeat(64);
const docThinkerTextCarrierManifestHash = "7".repeat(64);
const docThinkerImageTextCarrierManifestHash = "8".repeat(64);
const docThinkerPdfProcessingTraceHash = "9".repeat(64);
const docThinkerQuerySetHash = "0".repeat(64);
const docThinkerUnanswerableQuerySetHash = "a".repeat(64);
const docThinkerComplexityRouterConfigHash = "b".repeat(64);
const docThinkerRoutingDecisionTraceHash = "c".repeat(64);
const docThinkerPerceptionTraceHash = "d".repeat(64);
const docThinkerReasoningTraceHash = "e".repeat(64);
const docThinkerSessionKgManifestHash = "f".repeat(64);
const docThinkerKgExpansionTraceHash = "1".repeat(64);
const docThinkerMemoryPolicyHash = "2".repeat(64);
const docThinkerMemoryRecallTraceHash = "3".repeat(64);
const docThinkerRetrievalTraceHash = "4".repeat(64);
const docThinkerGenerationTraceHash = "5".repeat(64);
const docThinkerObservabilityTraceHash = "6".repeat(64);
const docThinkerEvalConfigHash = "7".repeat(64);
const docThinkerMetricsReportHash = "8".repeat(64);
const docThinkerReportArtifactHash = "9".repeat(64);
const docThinkerEnvironmentHash = "0".repeat(64);
const docThinkerDependencyLockHash = "a".repeat(64);
const docThinkerReplayCommandHash = "b".repeat(64);
const dbContextRepositorySnapshotHash = "7".repeat(64);
const dbContextExtensionManifestHash = "8".repeat(64);
const dbContextDatabaseSchemaHash = "9".repeat(64);
const dbContextSchemaDiscoveryTraceHash = "0".repeat(64);
const dbContextContextSetHash = "a".repeat(64);
const dbContextTemplateSetHash = "b".repeat(64);
const dbContextFacetSetHash = "c".repeat(64);
const dbContextValueSearchSetHash = "d".repeat(64);
const dbContextGoldenDatasetHash = "e".repeat(64);
const dbContextDbConfigHash = "f".repeat(64);
const dbContextModelConfigHash = "1".repeat(64);
const dbContextRunConfigHash = "2".repeat(64);
const dbContextLlmRaterConfigHash = "3".repeat(64);
const dbContextEvaluationResultHash = "4".repeat(64);
const dbContextFailureCaseManifestHash = "5".repeat(64);
const dbContextHillclimbPlanHash = "6".repeat(64);
const dbContextMutationPatchHash = "7".repeat(64);
const dbContextFinalValidationHash = "8".repeat(64);
const dbContextReplayCommandHash = "9".repeat(64);
const terminalWorldSourceRefHash = "a".repeat(64);
const terminalWorldRepositorySnapshotHash = "b".repeat(64);
const terminalWorldPaperRefHash = "c".repeat(64);
const terminalWorldDatasetSnapshotHash = "d".repeat(64);
const terminalWorldDatasetLicenseHash = "e".repeat(64);
const terminalWorldCodeLicenseHash = "f".repeat(64);
const terminalWorldRecordingManifestHash = "1".repeat(64);
const terminalWorldRecordingMetadataHash = "2".repeat(64);
const terminalWorldPrivacyFilterHash = "3".repeat(64);
const terminalWorldQualityFilterHash = "4".repeat(64);
const terminalWorldInstructionHash = "5".repeat(64);
const terminalWorldReferenceSolutionHash = "6".repeat(64);
const terminalWorldTaskMetadataHash = "7".repeat(64);
const terminalWorldDockerfileHash = "8".repeat(64);
const terminalWorldDockerComposeHash = "9".repeat(64);
const terminalWorldDockerImageHash = "0".repeat(64);
const terminalWorldEnvironmentLogHash = "a".repeat(64);
const terminalWorldPreSnapshotHash = "b".repeat(64);
const terminalWorldPostSnapshotHash = "c".repeat(64);
const terminalWorldStateTestSuiteHash = "d".repeat(64);
const terminalWorldStateTestResultHash = "e".repeat(64);
const terminalWorldAllPassingTrialHash = "f".repeat(64);
const terminalWorldNopTrialHash = "1".repeat(64);
const terminalWorldPartialTrialHash = "2".repeat(64);
const terminalWorldAgentRunTraceHash = "3".repeat(64);
const terminalWorldResultManifestHash = "4".repeat(64);
const terminalWorldReplayCommandHash = "5".repeat(64);
const terminalWorldCiReceiptHash = "6".repeat(64);
const terminalWorldHumanVerificationHash = "7".repeat(64);

const arthurEngineEvaluationFixture: ReplayBenchmarkAdversarialEngineEvaluationFixture = {
  traceId: "trace:arthur-adversarial-001",
  annotationId: "annotation:arthur-continuous-eval-001",
  continuousEvalId: "continuous-eval:prompt-injection-regression",
  evaluatorName: "prompt-injection-release-gate",
  evaluatorVersion: "2026.06.13",
  transformId: "transform:prompt-response-v1",
  status: "failed",
  score0to1: 0,
  criteriaHash: arthurCriteriaHash,
  variablesHash: transformConfigHash,
  explanationHash: judgeValidationHash,
  costUsd: 0.0042,
  rerunStatus: "failed",
  guardrailRuleIds: ["rule:prompt-injection", "rule:toxicity"],
  guardrailRuleTypes: ["prompt_injection", "toxicity"],
  failedGuardrailRuleCount: 1,
  promptInjectionDetected: true,
  alertRuleId: "alert:prompt-injection-rate",
  alertRuleMetricName: "Prompt Injection Rate",
  alertRuleQueryHash: arthurAlertQueryHash,
  alertRuleThreshold: 0,
  alertRuleBound: "upper",
  alertWebhookRefs: ["webhook:security-slack"],
};

const baseInput: ReplayBenchmarkCorpusInput = {
  agentId: "support-agent",
  corpusId: "support-resolution-v1",
  corpusVersion: "2026.06.13",
  baselineRunId: "run-baseline",
  candidateRunId: "run-candidate",
  sourceRefs: [
    "https://arize.com/docs/phoenix",
    "https://arize.com/docs/phoenix/datasets-and-experiments/how-to-experiments",
  ],
  rows: [
    {
      rowId: "case-001",
      fixture: {
        task: "Classify a support ticket and cite the source policy.",
        inputHash: "input-hash-001",
        expectedHash: "expected-hash-001",
        seed: 13,
      },
      baseline: {
        score0to1: 0.72,
        evidenceRefs: ["trace:baseline-001"],
        signedEvidenceRefs: ["ledger:sig-baseline-001"],
      },
      candidate: {
        score0to1: 0.84,
        evidenceRefs: ["trace:candidate-001"],
        signedEvidenceRefs: ["ledger:sig-candidate-001"],
      },
    },
    {
      rowId: "case-002",
      fixture: {
        task: "Summarize an escalation log without exposing secrets.",
        inputHash: "input-hash-002",
        expectedHash: "expected-hash-002",
        seed: 13,
      },
      baseline: {
        score0to1: 0.8,
        evidenceRefs: ["trace:baseline-002"],
        signedEvidenceRefs: ["ledger:sig-baseline-002"],
      },
      candidate: {
        score0to1: 0.82,
        evidenceRefs: ["trace:candidate-002"],
        signedEvidenceRefs: ["ledger:sig-candidate-002"],
      },
    },
  ],
};

describe("runReplayBenchmarkCorpus", () => {
  test("builds a replayable corpus manifest with fixture hashes, signed evidence, score deltas, and a passing CI receipt", () => {
    const result = runReplayBenchmarkCorpus(baseInput);

    expect(result.manifest.corpusId).toBe("support-resolution-v1");
    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.safetyRiskSummary).toMatchObject({
      rowCount: 0,
      multiTurnToolRiskRowCount: 0,
      failedRowIds: [],
      maxCandidateAttackSuccessRate0to1: null,
    });
    expect(result.manifest.runtimeSummary).toMatchObject({
      rowCount: 0,
      failedRowIds: [],
      outputArtifactHashCount: 0,
    });
    expect(result.manifest.fixtureHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.manifest.manifestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.manifest.rows).toHaveLength(2);
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "case-001",
      status: "passed",
      baselineScore0to1: 0.72,
      candidateScore0to1: 0.84,
      scoreDelta0to1: 0.12,
      signedEvidenceRefs: ["ledger:sig-baseline-001", "ledger:sig-candidate-001"],
    });
    expect(result.manifest.rows[0]?.fixtureHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.manifest.scoreDelta0to1).toBeCloseTo(0.07);
    expect(result.ciReceipt).toMatchObject({
      mode: "ci",
      passed: true,
      failClosed: false,
      fixtureHash: result.manifest.fixtureHash,
      manifestHash: result.manifest.manifestHash,
      scoreDelta0to1: result.manifest.scoreDelta0to1,
      failedRowIds: [],
      safetyRiskRowCount: 0,
      failedSafetyRiskRowIds: [],
      runtimeRowCount: 0,
      failedRuntimeRowIds: [],
    });
    expect(result.watchAlerts).toEqual([]);

    const verification = verifyReplayBenchmarkCorpusReceipt(result.manifest, result.ciReceipt);
    expect(verification.valid).toBe(true);
    expect(verification.errors).toEqual([]);
  });

  test("fails closed when replay rows regress or lack signed evidence and exposes Watch alerts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      gateMode: "lifecycle",
      thresholds: { maxScoreRegression0to1: 0.05, minSignedEvidenceRefs: 2 },
      rows: [
        {
          ...baseInput.rows[0]!,
          candidate: {
            score0to1: 0.5,
            evidenceRefs: ["trace:candidate-001"],
            signedEvidenceRefs: [],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("signed evidence refs below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("candidate score regressed beyond threshold");
    expect(result.ciReceipt.mode).toBe("lifecycle");
    expect(result.ciReceipt.passed).toBe(false);
    expect(result.ciReceipt.failClosed).toBe(true);
    expect(result.ciReceipt.failedRowIds).toEqual(["case-001"]);

    const alerts = buildReplayBenchmarkWatchAlerts(result.manifest, result.ciReceipt);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      agentId: "support-agent",
      source: "replay-benchmark-corpus",
      severity: "critical",
      rowId: "case-001",
    });
  });

  test("binds head-to-head pairwise comparison receipts into replay rows", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "pairwise-head-to-head-v1",
      sourceRefs: ["https://github.com/kolenaIO/autoarena"],
      rows: [
        {
          ...baseInput.rows[0]!,
          fixture: {
            ...baseInput.rows[0]!.fixture,
            pairwiseComparison: {
              comparisonId: "comparison-001",
              promptHash,
              baselineResponseHash,
              candidateResponseHash,
              judgeIds: ["judge-a", "judge-b"],
              judgePanelHash,
              winner: "candidate",
              confidence0to1: 0.78,
              leaderboardDelta: 24,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.pairwiseComparisonSummary).toEqual({
      rowCount: 1,
      candidateWinRowIds: ["case-001"],
      baselineWinRowIds: [],
      tieRowIds: [],
      failedRowIds: [],
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "case-001",
      status: "passed",
      pairwiseComparison: {
        comparisonId: "comparison-001",
        promptHash,
        baselineResponseHash,
        candidateResponseHash,
        judgeIds: ["judge-a", "judge-b"],
        judgePanelHash,
        winner: "candidate",
        confidence0to1: 0.78,
        leaderboardDelta: 24,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      pairwiseComparisonRowCount: 1,
      failedPairwiseComparisonRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("Pairwise Comparison Rows: 1");
    expect(markdown).toContain("Candidate Pairwise Wins: case-001");
  });

  test("marks pairwise comparison rows non-replayable when hashes or judges are missing", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "pairwise-head-to-head-v1",
      rows: [
        {
          ...baseInput.rows[0]!,
          fixture: {
            ...baseInput.rows[0]!.fixture,
            pairwiseComparison: {
              comparisonId: "comparison-bad",
              promptHash: "not-a-hash",
              baselineResponseHash,
              candidateResponseHash: "also-not-a-hash",
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.pairwiseComparisonSummary).toEqual({
      rowCount: 1,
      candidateWinRowIds: [],
      baselineWinRowIds: [],
      tieRowIds: [],
      failedRowIds: ["case-001"],
    });
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("pairwise comparison prompt hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("pairwise candidate response hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("pairwise judge ids missing");
    expect(result.manifest.rows[0]?.issues).toContain("pairwise winner missing");
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedPairwiseComparisonRowIds: ["case-001"],
    });
  });

  test("binds paired text-to-voice fixture hashes and score deltas into replay receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "text-to-voice-tool-calling-v1",
      sourceRefs: ["https://arxiv.org/abs/2605.15104"],
      rows: [
        {
          ...baseInput.rows[0]!,
          fixture: {
            ...baseInput.rows[0]!.fixture,
            modalityPair: {
              sourceModality: "text",
              targetModality: "voice",
              sourceInputHash,
              targetInputHash,
              toolSchemaHash,
              goldLabelHash,
              transformConfigHash,
              speakerProfileHash,
              noiseProfileHash,
              judgeValidationHash,
              sourceScore0to1: 0.84,
              targetScore0to1: 0.78,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.modalityPairSummary).toEqual({
      rowCount: 1,
      targetModalities: ["voice"],
      failedRowIds: [],
      judgeValidatedRowCount: 1,
      averageScoreDelta0to1: -0.06,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "case-001",
      status: "passed",
      modalityPair: {
        sourceModality: "text",
        targetModality: "voice",
        sourceInputHash,
        targetInputHash,
        toolSchemaHash,
        goldLabelHash,
        transformConfigHash,
        speakerProfileHash,
        noiseProfileHash,
        judgeValidationHash,
        sourceScore0to1: 0.84,
        targetScore0to1: 0.78,
        modalityScoreDelta0to1: -0.06,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      modalityPairRowCount: 1,
      failedModalityPairRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("Modality Pair Rows: 1");
    expect(markdown).toContain("Modality Pair Targets: voice");
    expect(markdown).toContain("text->voice");
  });

  test("fails closed when paired modality fixtures lack replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "text-to-voice-tool-calling-v1",
      rows: [
        {
          ...baseInput.rows[0]!,
          fixture: {
            ...baseInput.rows[0]!.fixture,
            modalityPair: {
              sourceModality: "text",
              targetModality: "voice",
              sourceInputHash,
              targetInputHash: "not-a-sha",
              goldLabelHash,
              transformConfigHash: "also-not-a-sha",
              sourceScore0to1: 0.84,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.modalityPairSummary).toEqual({
      rowCount: 1,
      targetModalities: ["voice"],
      failedRowIds: ["case-001"],
      judgeValidatedRowCount: 0,
      averageScoreDelta0to1: null,
    });
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("modality target input hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("modality tool schema hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("modality transform config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("modality target score missing");
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedRowIds: ["case-001"],
      failedModalityPairRowIds: ["case-001"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "case-001",
      severity: "critical",
    });
  });

  test("binds interactive language-feedback episode traces into replay receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "language-feedback-episodes-v1",
      sourceRefs: ["https://github.com/microsoft/LLF-Bench"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "llf-episode-001",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            interactiveEpisode: {
              episodeId: "episode-001",
              environmentId: "llf-gridworld-family",
              randomizationConfigHash,
              observationTraceHash,
              instructionTraceHash,
              feedbackTraceHash,
              actionTraceHash,
              rewardTraceHash,
              terminationTraceHash,
              feedbackMode: "explanation",
              rewardHiddenFromAgent: true,
              maxSteps: 20,
              stepsTaken: 8,
              terminated: true,
              truncated: false,
              returnScore: 1,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.interactiveEpisodeSummary).toEqual({
      rowCount: 1,
      feedbackModes: ["explanation"],
      failedRowIds: [],
      rewardLeakageRowIds: [],
      terminatedRowCount: 1,
      truncatedRowCount: 0,
      averageStepsTaken: 8,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "llf-episode-001",
      status: "passed",
      interactiveEpisode: {
        episodeId: "episode-001",
        environmentId: "llf-gridworld-family",
        randomizationConfigHash,
        observationTraceHash,
        instructionTraceHash,
        feedbackTraceHash,
        actionTraceHash,
        rewardTraceHash,
        terminationTraceHash,
        feedbackMode: "explanation",
        rewardHiddenFromAgent: true,
        maxSteps: 20,
        stepsTaken: 8,
        terminated: true,
        truncated: false,
        returnScore: 1,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      interactiveEpisodeRowCount: 1,
      failedInteractiveEpisodeRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("Interactive Episode Rows: 1");
    expect(markdown).toContain("Interactive Feedback Modes: explanation");
    expect(markdown).toContain("llf-gridworld-family:8/20");
  });

  test("fails closed when interactive episode replay exposes evaluation reward to the agent", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "language-feedback-episodes-v1",
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "llf-reward-leakage",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            interactiveEpisode: {
              episodeId: "episode-leakage",
              environmentId: "llf-gridworld-family",
              randomizationConfigHash,
              observationTraceHash,
              instructionTraceHash,
              feedbackTraceHash,
              actionTraceHash,
              rewardTraceHash,
              terminationTraceHash,
              feedbackMode: "suggestion",
              rewardHiddenFromAgent: false,
              maxSteps: 20,
              stepsTaken: 8,
              terminated: true,
              truncated: false,
              returnScore: 1,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.interactiveEpisodeSummary).toMatchObject({
      rowCount: 1,
      feedbackModes: ["suggestion"],
      failedRowIds: ["llf-reward-leakage"],
      rewardLeakageRowIds: ["llf-reward-leakage"],
    });
    expect(result.manifest.rows[0]?.status).toBe("regressed");
    expect(result.manifest.rows[0]?.issues).toContain("interactive reward exposed to agent");
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedRowIds: ["llf-reward-leakage"],
      failedInteractiveEpisodeRowIds: ["llf-reward-leakage"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "llf-reward-leakage",
      severity: "critical",
    });
  });

  test("binds skill lifecycle evaluation receipts into replay rows", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "skill-lifecycle-eval-v1",
      sourceRefs: ["https://github.com/smixs/skill-conductor"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "skill-package-001",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            skillLifecycle: {
              lifecycleMode: "package",
              architecturePattern: "iterative",
              tddBaselineHash: skillBaselineHash,
              candidateSkillHash: skillCandidateHash,
              graderReportHash: skillGraderHash,
              comparatorReportHash: skillComparatorHash,
              analyzerReportHash: skillAnalyzerHash,
              blindComparisonHash: skillBlindComparisonHash,
              benchmarkSummaryHash: skillBenchmarkHash,
              packageArtifactHash: skillPackageHash,
              minAxisScore0to10: 7,
              axisScores: {
                discovery: 9,
                clarity: 8,
                efficiency: 8,
                robustness: 9,
                completeness: 8,
              },
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.skillLifecycleSummary).toEqual({
      rowCount: 1,
      modes: ["package"],
      architecturePatterns: ["iterative"],
      failedRowIds: [],
      belowThresholdRowIds: [],
      packagedRowCount: 1,
      agentWorkflowKitRowCount: 0,
      agentWorkflowKitRecommendedLevels: [],
      agentWorkflowKitAppliedLevels: [],
      failedAgentWorkflowKitRowIds: [],
      averageAgentWorkflowKitRiskScore0to16: null,
      averageAgentWorkflowKitVerificationPassRate0to1: null,
      averageAgentWorkflowKitReplayPassRate0to1: null,
      averageAxisScore0to10: 8.4,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "skill-package-001",
      status: "passed",
      skillLifecycle: {
        lifecycleMode: "package",
        architecturePattern: "iterative",
        tddBaselineHash: skillBaselineHash,
        candidateSkillHash: skillCandidateHash,
        graderReportHash: skillGraderHash,
        comparatorReportHash: skillComparatorHash,
        analyzerReportHash: skillAnalyzerHash,
        blindComparisonHash: skillBlindComparisonHash,
        benchmarkSummaryHash: skillBenchmarkHash,
        packageArtifactHash: skillPackageHash,
        minAxisScore0to10: 7,
        averageAxisScore0to10: 8.4,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      skillLifecycleRowCount: 1,
      failedSkillLifecycleRowIds: [],
      agentWorkflowKitRowCount: 0,
      failedAgentWorkflowKitRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("Skill Lifecycle Rows: 1");
    expect(markdown).toContain("Skill Lifecycle Modes: package");
    expect(markdown).toContain("Agent Workflow Kit Rows: 0");
    expect(markdown).toContain("package:8.4");
  });

  test("binds Agent Workflow Kit replay evidence into skill lifecycle receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "agent-workflow-kit-replay-v1",
      sourceRefs: ["https://github.com/crisxuan/agent-workflow-kit"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "agent-workflow-kit-level-2",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            skillLifecycle: {
              lifecycleMode: "package",
              architecturePattern: "context_aware",
              tddBaselineHash: skillBaselineHash,
              candidateSkillHash: skillCandidateHash,
              graderReportHash: skillGraderHash,
              comparatorReportHash: skillComparatorHash,
              analyzerReportHash: skillAnalyzerHash,
              blindComparisonHash: skillBlindComparisonHash,
              benchmarkSummaryHash: skillBenchmarkHash,
              packageArtifactHash: skillPackageHash,
              minAxisScore0to10: 8,
              axisScores: {
                discovery: 9,
                clarity: 9,
                efficiency: 8,
                robustness: 9,
                completeness: 9,
              },
              agentWorkflowKitSourceRefHash,
              agentWorkflowKitRepositorySnapshotHash,
              agentWorkflowKitLicenseRefHash,
              agentWorkflowKitGuideHash,
              agentWorkflowKitSkillPackageManifestHash,
              agentWorkflowKitTemplateManifestHash,
              agentWorkflowKitRiskScoringRubricHash,
              agentWorkflowKitWorkflowLevelPolicyHash,
              agentWorkflowKitSpecLayerPolicyHash,
              agentWorkflowKitApprovalPolicyHash,
              agentWorkflowKitVerificationCommandManifestHash,
              agentWorkflowKitDocsCheckWorkflowHash,
              agentWorkflowKitEvaluationManifestHash,
              agentWorkflowKitReplayCommandHash,
              agentWorkflowKitRiskScore0to16: 12,
              agentWorkflowKitRecommendedLevel: "level_2",
              agentWorkflowKitAppliedLevel: "level_2",
              agentWorkflowKitWorkflowLevelMatchesRisk: true,
              agentWorkflowKitSpecLayerDecisionValid: true,
              agentWorkflowKitExternalApprovalRequired: true,
              agentWorkflowKitExternalApprovalGatePresent: true,
              agentWorkflowKitDeterministicSeed: 17,
              agentWorkflowKitVerificationPassRate0to1: 1,
              minAgentWorkflowKitVerificationPassRate0to1: 0.95,
              agentWorkflowKitTemplateCoverage0to1: 0.98,
              minAgentWorkflowKitTemplateCoverage0to1: 0.9,
              agentWorkflowKitDocsCheckPassRate0to1: 1,
              minAgentWorkflowKitDocsCheckPassRate0to1: 1,
              agentWorkflowKitReplayPassRate0to1: 1,
              minAgentWorkflowKitReplayPassRate0to1: 0.95,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.skillLifecycleSummary).toMatchObject({
      rowCount: 1,
      modes: ["package"],
      architecturePatterns: ["context_aware"],
      failedRowIds: [],
      belowThresholdRowIds: [],
      packagedRowCount: 1,
      agentWorkflowKitRowCount: 1,
      agentWorkflowKitRecommendedLevels: ["level_2"],
      agentWorkflowKitAppliedLevels: ["level_2"],
      failedAgentWorkflowKitRowIds: [],
      averageAgentWorkflowKitRiskScore0to16: 12,
      averageAgentWorkflowKitVerificationPassRate0to1: 1,
      averageAgentWorkflowKitReplayPassRate0to1: 1,
      averageAxisScore0to10: 8.8,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "agent-workflow-kit-level-2",
      status: "passed",
      skillLifecycle: {
        agentWorkflowKitSourceRefHash,
        agentWorkflowKitRepositorySnapshotHash,
        agentWorkflowKitLicenseRefHash,
        agentWorkflowKitRecommendedLevel: "level_2",
        agentWorkflowKitAppliedLevel: "level_2",
        agentWorkflowKitRiskScore0to16: 12,
        agentWorkflowKitVerificationPassRate0to1: 1,
        agentWorkflowKitReplayPassRate0to1: 1,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      skillLifecycleRowCount: 1,
      failedSkillLifecycleRowIds: [],
      agentWorkflowKitRowCount: 1,
      failedAgentWorkflowKitRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("Agent Workflow Kit Rows: 1");
    expect(markdown).toContain("Agent Workflow Kit Recommended Levels: level_2");
    expect(markdown).toContain("Agent Workflow Kit Applied Levels: level_2");
    expect(markdown).toContain("Failed Agent Workflow Kit Rows: none");
    expect(markdown).toContain("package:8.8:agent-workflow-kit:level_2->level_2");
  });

  test("fails closed when Agent Workflow Kit replay evidence is incomplete", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "agent-workflow-kit-replay-v1",
      sourceRefs: ["https://github.com/crisxuan/agent-workflow-kit"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "agent-workflow-kit-incomplete",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            skillLifecycle: {
              lifecycleMode: "package",
              architecturePattern: "context_aware",
              tddBaselineHash: skillBaselineHash,
              candidateSkillHash: skillCandidateHash,
              graderReportHash: skillGraderHash,
              comparatorReportHash: skillComparatorHash,
              analyzerReportHash: skillAnalyzerHash,
              blindComparisonHash: skillBlindComparisonHash,
              benchmarkSummaryHash: skillBenchmarkHash,
              packageArtifactHash: skillPackageHash,
              minAxisScore0to10: 8,
              axisScores: {
                discovery: 9,
                clarity: 9,
                efficiency: 8,
                robustness: 9,
                completeness: 9,
              },
              agentWorkflowKitSourceRefHash,
              agentWorkflowKitLicenseRefHash,
              agentWorkflowKitRecommendedLevel: "level_3",
              agentWorkflowKitAppliedLevel: "level_1",
              agentWorkflowKitRiskScore0to16: 14,
              agentWorkflowKitWorkflowLevelMatchesRisk: false,
              agentWorkflowKitSpecLayerDecisionValid: false,
              agentWorkflowKitExternalApprovalRequired: true,
              agentWorkflowKitExternalApprovalGatePresent: false,
              agentWorkflowKitDeterministicSeed: 17,
              agentWorkflowKitVerificationPassRate0to1: 0.5,
              minAgentWorkflowKitVerificationPassRate0to1: 1,
              agentWorkflowKitTemplateCoverage0to1: 0.4,
              minAgentWorkflowKitTemplateCoverage0to1: 0.8,
              agentWorkflowKitDocsCheckPassRate0to1: 0.5,
              minAgentWorkflowKitDocsCheckPassRate0to1: 1,
              agentWorkflowKitReplayPassRate0to1: 0.5,
              minAgentWorkflowKitReplayPassRate0to1: 1,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.skillLifecycleSummary).toMatchObject({
      rowCount: 1,
      agentWorkflowKitRowCount: 1,
      agentWorkflowKitRecommendedLevels: ["level_3"],
      agentWorkflowKitAppliedLevels: ["level_1"],
      failedAgentWorkflowKitRowIds: ["agent-workflow-kit-incomplete"],
      failedRowIds: ["agent-workflow-kit-incomplete"],
    });
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toEqual(expect.arrayContaining([
      "skill agent workflow kit repository snapshot hash invalid",
      "skill agent workflow kit guide hash invalid",
      "skill agent workflow kit workflow level mismatch",
      "skill agent workflow kit spec layer decision invalid",
      "skill agent workflow kit external approval gate missing",
      "skill agent workflow kit verification pass rate below threshold",
      "skill agent workflow kit template coverage below threshold",
      "skill agent workflow kit docs check pass rate below threshold",
      "skill agent workflow kit replay pass rate below threshold",
    ]));
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedRowIds: ["agent-workflow-kit-incomplete"],
      failedSkillLifecycleRowIds: ["agent-workflow-kit-incomplete"],
      agentWorkflowKitRowCount: 1,
      failedAgentWorkflowKitRowIds: ["agent-workflow-kit-incomplete"],
    });
  });

  test("fails closed when skill lifecycle axis scores miss the threshold", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "skill-lifecycle-eval-v1",
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "skill-low-axis-score",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            skillLifecycle: {
              lifecycleMode: "eval",
              architecturePattern: "context_aware",
              tddBaselineHash: skillBaselineHash,
              candidateSkillHash: skillCandidateHash,
              graderReportHash: skillGraderHash,
              comparatorReportHash: skillComparatorHash,
              analyzerReportHash: skillAnalyzerHash,
              blindComparisonHash: skillBlindComparisonHash,
              benchmarkSummaryHash: skillBenchmarkHash,
              minAxisScore0to10: 7,
              axisScores: {
                discovery: 8,
                clarity: 8,
                efficiency: 6.5,
                robustness: 8,
                completeness: 8,
              },
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.skillLifecycleSummary).toMatchObject({
      rowCount: 1,
      modes: ["eval"],
      architecturePatterns: ["context_aware"],
      failedRowIds: ["skill-low-axis-score"],
      belowThresholdRowIds: ["skill-low-axis-score"],
    });
    expect(result.manifest.rows[0]?.status).toBe("regressed");
    expect(result.manifest.rows[0]?.issues).toContain("skill axis score below threshold");
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedRowIds: ["skill-low-axis-score"],
      failedSkillLifecycleRowIds: ["skill-low-axis-score"],
    });
  });

  test("binds SkillBench-style with-skill versus without-skill deterministic regression proof", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "skillbench-regression-v1",
      sourceRefs: ["https://github.com/boheling/skillbench"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "skillbench-biomed-001",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            skillBenchmarkRegression: {
              benchmarkId: "amc-skillbench-biomed",
              benchmarkVersion: "2026-06-13",
              sourceRefHash: skillbenchSourceRefHash,
              skillId: "biomedical-literature-triage",
              skillDomain: "biomedical",
              evaluationMode: "with_without_skill",
              skillManifestHash: skillbenchSkillManifestHash,
              baselineAgentConfigHash: skillbenchBaselineAgentConfigHash,
              withSkillAgentConfigHash: skillbenchWithSkillAgentConfigHash,
              evalSuiteHash: skillbenchEvalSuiteHash,
              evalCaseManifestHash: skillbenchEvalCaseManifestHash,
              deterministicGraderHash: skillbenchDeterministicGraderHash,
              staticAnalysisConfigHash: skillbenchStaticAnalysisConfigHash,
              securityScanReportHash: skillbenchSecurityScanReportHash,
              baselineOutputHash: skillbenchBaselineOutputHash,
              withSkillOutputHash: skillbenchWithSkillOutputHash,
              rerunOutputHash: skillbenchRerunOutputHash,
              resultReportHash: skillbenchResultReportHash,
              replayCommandHash: skillbenchReplayCommandHash,
              releaseGateReceiptId: "release-gate:skillbench-biomed-001",
              expectedDecision: "recommend",
              actualDecision: "recommend",
              deterministicSeed: 614,
              evalCaseCount: 5,
              minEvalCaseCount: 5,
              correctness0to1: 0.9,
              minCorrectness0to1: 0.8,
              security0to1: 1,
              minSecurity0to1: 0.9,
              completeness0to1: 1,
              minCompleteness0to1: 0.9,
              robustness0to1: 0.8,
              minRobustness0to1: 0.7,
              baselineScore0to100: 54,
              withSkillScore0to100: 86,
              minWithSkillScore0to100: 75,
              scoreDelta0to100: 32,
              minScoreDelta0to100: 10,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.skillBenchmarkRegressionSummary).toEqual({
      rowCount: 1,
      benchmarkIds: ["amc-skillbench-biomed"],
      domains: ["biomedical"],
      evaluationModes: ["with_without_skill"],
      failedRowIds: [],
      totalEvalCaseCount: 5,
      averageWithSkillScore0to100: 86,
      averageScoreDelta0to100: 32,
      averageCorrectness0to1: 0.9,
      averageSecurity0to1: 1,
      averageCompleteness0to1: 1,
      averageRobustness0to1: 0.8,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "skillbench-biomed-001",
      status: "passed",
      skillBenchmarkRegression: {
        benchmarkId: "amc-skillbench-biomed",
        skillId: "biomedical-literature-triage",
        skillDomain: "biomedical",
        evaluationMode: "with_without_skill",
        expectedDecision: "recommend",
        actualDecision: "recommend",
        releaseGateReceiptId: "release-gate:skillbench-biomed-001",
        withSkillScore0to100: 86,
        scoreDelta0to100: 32,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      skillBenchmarkRegressionRowCount: 1,
      failedSkillBenchmarkRegressionRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("SkillBench Regression Rows: 1");
    expect(markdown).toContain("SkillBench Domains: biomedical");
    expect(markdown).toContain("amc-skillbench-biomed:biomedical:86");

    const verification = verifyReplayBenchmarkCorpusReceipt(result.manifest, result.ciReceipt);
    expect(verification.valid).toBe(true);
    expect(verification.errors).toEqual([]);
  });

  test("fails closed when SkillBench-style adversarial regression proof is incomplete", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "skillbench-regression-v1",
      sourceRefs: ["https://github.com/boheling/skillbench"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "skillbench-missing-evidence",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            skillBenchmarkRegression: {
              benchmarkId: "amc-skillbench-biomed",
              benchmarkVersion: "2026-06-13",
              sourceRefHash: "not-a-sha",
              skillId: "biomedical-literature-triage",
              skillDomain: "biomedical",
              evaluationMode: "with_without_skill",
              skillManifestHash: skillbenchSkillManifestHash,
              evalSuiteHash: skillbenchEvalSuiteHash,
              evalCaseManifestHash: skillbenchEvalCaseManifestHash,
              deterministicGraderHash: skillbenchDeterministicGraderHash,
              baselineOutputHash: skillbenchBaselineOutputHash,
              withSkillOutputHash: skillbenchWithSkillOutputHash,
              resultReportHash: skillbenchResultReportHash,
              releaseGateReceiptId: "release-gate:skillbench-biomed-001",
              expectedDecision: "recommend",
              actualDecision: "needs_improvement",
              deterministicSeed: 614,
              evalCaseCount: 3,
              minEvalCaseCount: 5,
              correctness0to1: 0.6,
              minCorrectness0to1: 0.8,
              security0to1: 0.7,
              minSecurity0to1: 0.9,
              completeness0to1: 0.6,
              minCompleteness0to1: 0.9,
              robustness0to1: 0.2,
              minRobustness0to1: 0.7,
              baselineScore0to100: 54,
              withSkillScore0to100: 61,
              minWithSkillScore0to100: 75,
              scoreDelta0to100: 7,
              minScoreDelta0to100: 10,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.skillBenchmarkRegressionSummary).toMatchObject({
      rowCount: 1,
      domains: ["biomedical"],
      evaluationModes: ["with_without_skill"],
      failedRowIds: ["skillbench-missing-evidence"],
      totalEvalCaseCount: 3,
    });
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("skillbench source ref hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("skillbench baseline agent config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("skillbench with-skill agent config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("skillbench static analysis config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("skillbench security scan report hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("skillbench rerun output hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("skillbench replay command hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("skillbench eval case count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("skillbench correctness below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("skillbench security below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("skillbench completeness below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("skillbench robustness below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("skillbench with-skill score below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("skillbench score delta below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("skillbench expected decision not met");
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedRowIds: ["skillbench-missing-evidence"],
      skillBenchmarkRegressionRowCount: 1,
      failedSkillBenchmarkRegressionRowIds: ["skillbench-missing-evidence"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "skillbench-missing-evidence",
      severity: "critical",
    });
  });

  test("binds Skill Forge-style autoresearch replay proof to SkillBench regression receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "skill-forge-autoresearch-v1",
      sourceRefs: [
        "https://github.com/GodModeAI2025/skill-forge",
        "https://godmodeai2025.github.io/skill-forge/",
      ],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "skill-forge-autoresearch-001",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            skillBenchmarkRegression: {
              benchmarkId: "amc-skill-forge-autoresearch",
              benchmarkVersion: "2026-06-20",
              sourcePattern: "skill_forge_autoresearch",
              sourceRefHash: skillbenchSourceRefHash,
              repositorySnapshotHash: skillForgeRepositorySnapshotHash,
              licenseRefHash: skillForgeLicenseRefHash,
              homepageSnapshotHash: skillForgeHomepageSnapshotHash,
              readmeBlobHash: skillForgeReadmeBlobHash,
              releaseNotesHash: skillForgeReleaseNotesHash,
              skillSpecHash: skillForgeSkillSpecHash,
              agentRoleManifestHash: skillForgeAgentRoleManifestHash,
              orchestratorAgentHash: skillForgeOrchestratorAgentHash,
              mutatorAgentHash: skillForgeMutatorAgentHash,
              scorerAgentHash: skillForgeScorerAgentHash,
              hypothesisAgentHash: skillForgeHypothesisAgentHash,
              compositeScoreScriptHash: skillForgeCompositeScoreScriptHash,
              templateManifestHash: skillForgeTemplateManifestHash,
              exampleSessionHash: skillForgeExampleSessionHash,
              improvementLoopManifestHash: skillForgeImprovementLoopManifestHash,
              mutationPolicyHash: skillForgeMutationPolicyHash,
              revertPolicyHash: skillForgeRevertPolicyHash,
              replayManifestHash: skillForgeReplayManifestHash,
              ciReceiptHash: skillForgeCiReceiptHash,
              skillId: "autoresearch-skill-mutator",
              skillDomain: "software",
              evaluationMode: "regression_gate",
              skillManifestHash: skillbenchSkillManifestHash,
              baselineAgentConfigHash: skillbenchBaselineAgentConfigHash,
              withSkillAgentConfigHash: skillbenchWithSkillAgentConfigHash,
              evalSuiteHash: skillbenchEvalSuiteHash,
              evalCaseManifestHash: skillbenchEvalCaseManifestHash,
              deterministicGraderHash: skillbenchDeterministicGraderHash,
              staticAnalysisConfigHash: skillbenchStaticAnalysisConfigHash,
              securityScanReportHash: skillbenchSecurityScanReportHash,
              baselineOutputHash: skillbenchBaselineOutputHash,
              withSkillOutputHash: skillbenchWithSkillOutputHash,
              rerunOutputHash: skillbenchRerunOutputHash,
              resultReportHash: skillbenchResultReportHash,
              replayCommandHash: skillbenchReplayCommandHash,
              releaseGateReceiptId: "release-gate:skill-forge-autoresearch-001",
              expectedDecision: "acceptable",
              actualDecision: "acceptable",
              deterministicSeed: 620,
              evalCaseCount: 6,
              minEvalCaseCount: 4,
              correctness0to1: 0.88,
              minCorrectness0to1: 0.8,
              security0to1: 0.96,
              minSecurity0to1: 0.9,
              completeness0to1: 0.92,
              minCompleteness0to1: 0.85,
              robustness0to1: 0.83,
              minRobustness0to1: 0.75,
              baselineScore0to100: 63,
              withSkillScore0to100: 88,
              minWithSkillScore0to100: 80,
              scoreDelta0to100: 25,
              minScoreDelta0to100: 12,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.skillBenchmarkRegressionSummary).toMatchObject({
      rowCount: 1,
      benchmarkIds: ["amc-skill-forge-autoresearch"],
      domains: ["software"],
      evaluationModes: ["regression_gate"],
      failedRowIds: [],
      totalEvalCaseCount: 6,
      averageWithSkillScore0to100: 88,
      averageScoreDelta0to100: 25,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "skill-forge-autoresearch-001",
      status: "passed",
      skillBenchmarkRegression: {
        benchmarkId: "amc-skill-forge-autoresearch",
        sourcePattern: "skill_forge_autoresearch",
        repositorySnapshotHash: skillForgeRepositorySnapshotHash,
        mutationPolicyHash: skillForgeMutationPolicyHash,
        revertPolicyHash: skillForgeRevertPolicyHash,
        replayManifestHash: skillForgeReplayManifestHash,
        ciReceiptHash: skillForgeCiReceiptHash,
        skillId: "autoresearch-skill-mutator",
        skillDomain: "software",
        evaluationMode: "regression_gate",
        withSkillScore0to100: 88,
        scoreDelta0to100: 25,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      skillBenchmarkRegressionRowCount: 1,
      failedSkillBenchmarkRegressionRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("SkillBench Regression Rows: 1");
    expect(markdown).toContain("SkillBench Domains: software");
    expect(markdown).toContain("amc-skill-forge-autoresearch:software:88");

    const verification = verifyReplayBenchmarkCorpusReceipt(result.manifest, result.ciReceipt);
    expect(verification.valid).toBe(true);
    expect(verification.errors).toEqual([]);
  });

  test("fails closed when Skill Forge autoresearch replay proof omits source and loop receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "skill-forge-autoresearch-v1",
      sourceRefs: ["https://github.com/GodModeAI2025/skill-forge"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "skill-forge-missing-loop-proof",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            skillBenchmarkRegression: {
              benchmarkId: "amc-skill-forge-autoresearch",
              benchmarkVersion: "2026-06-20",
              sourcePattern: "skill_forge_autoresearch",
              sourceRefHash: skillbenchSourceRefHash,
              repositorySnapshotHash: "not-a-sha",
              licenseRefHash: skillForgeLicenseRefHash,
              homepageSnapshotHash: skillForgeHomepageSnapshotHash,
              readmeBlobHash: skillForgeReadmeBlobHash,
              releaseNotesHash: skillForgeReleaseNotesHash,
              skillSpecHash: skillForgeSkillSpecHash,
              agentRoleManifestHash: skillForgeAgentRoleManifestHash,
              orchestratorAgentHash: skillForgeOrchestratorAgentHash,
              mutatorAgentHash: skillForgeMutatorAgentHash,
              scorerAgentHash: skillForgeScorerAgentHash,
              hypothesisAgentHash: skillForgeHypothesisAgentHash,
              compositeScoreScriptHash: skillForgeCompositeScoreScriptHash,
              templateManifestHash: skillForgeTemplateManifestHash,
              exampleSessionHash: skillForgeExampleSessionHash,
              improvementLoopManifestHash: skillForgeImprovementLoopManifestHash,
              revertPolicyHash: skillForgeRevertPolicyHash,
              skillId: "autoresearch-skill-mutator",
              skillDomain: "software",
              evaluationMode: "regression_gate",
              skillManifestHash: skillbenchSkillManifestHash,
              baselineAgentConfigHash: skillbenchBaselineAgentConfigHash,
              withSkillAgentConfigHash: skillbenchWithSkillAgentConfigHash,
              evalSuiteHash: skillbenchEvalSuiteHash,
              evalCaseManifestHash: skillbenchEvalCaseManifestHash,
              deterministicGraderHash: skillbenchDeterministicGraderHash,
              staticAnalysisConfigHash: skillbenchStaticAnalysisConfigHash,
              securityScanReportHash: skillbenchSecurityScanReportHash,
              baselineOutputHash: skillbenchBaselineOutputHash,
              withSkillOutputHash: skillbenchWithSkillOutputHash,
              rerunOutputHash: skillbenchRerunOutputHash,
              resultReportHash: skillbenchResultReportHash,
              replayCommandHash: skillbenchReplayCommandHash,
              releaseGateReceiptId: "release-gate:skill-forge-autoresearch-001",
              expectedDecision: "acceptable",
              actualDecision: "acceptable",
              deterministicSeed: 620,
              evalCaseCount: 6,
              minEvalCaseCount: 4,
              correctness0to1: 0.88,
              minCorrectness0to1: 0.8,
              security0to1: 0.96,
              minSecurity0to1: 0.9,
              completeness0to1: 0.92,
              minCompleteness0to1: 0.85,
              robustness0to1: 0.83,
              minRobustness0to1: 0.75,
              baselineScore0to100: 63,
              withSkillScore0to100: 88,
              minWithSkillScore0to100: 80,
              scoreDelta0to100: 25,
              minScoreDelta0to100: 12,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("skillbench skillforge repository snapshot hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("skillbench skillforge mutation policy hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("skillbench skillforge replay manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("skillbench skillforge ci receipt hash invalid");
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      skillBenchmarkRegressionRowCount: 1,
      failedSkillBenchmarkRegressionRowIds: ["skill-forge-missing-loop-proof"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "skill-forge-missing-loop-proof",
      severity: "critical",
    });
  });

  test("binds RAG evaluation data generation, scoring, review, and performance receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "rag-eval-system-v1",
      sourceRefs: ["https://github.com/BytePioneer-AI/RAGEval"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "rag-eval-001",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            ragEvaluation: {
              projectId: "rag-system-eval",
              datasetId: "refund-policy-rag-dataset",
              corpusDocumentHash: ragCorpusDocumentHash,
              chunkingConfigHash: ragChunkingConfigHash,
              generatedQuestionSetHash: ragQuestionSetHash,
              referenceAnswerSetHash: ragReferenceAnswerHash,
              retrievalTraceHash: ragRetrievalTraceHash,
              generationTraceHash: ragGenerationTraceHash,
              scoringReportHash: ragScoringReportHash,
              humanReviewHash: ragHumanReviewHash,
              accuracy0to1: 0.86,
              relevance0to1: 0.82,
              completeness0to1: 0.84,
              retrievalRecall0to1: 0.78,
              responseLatencyMs: 920,
              firstTokenLatencyMs: 180,
              averageCharLatencyMs: 4.2,
              throughputQps: 12.5,
              concurrentUsers: 8,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.ragEvaluationSummary).toEqual({
      rowCount: 1,
      modalityModes: [],
      vectorStoreModes: [],
      failedRowIds: [],
      humanReviewedRowCount: 1,
      multimodalRowCount: 0,
      imageEvidenceRowCount: 0,
      averageQualityScore0to1: 0.825,
      averageMultimodalJudgeScore0to1: null,
      averageModalityCoverage0to1: null,
      averageResponseLatencyMs: 920,
      averageThroughputQps: 12.5,
      ragEvalFlowRowCount: 0,
      ragEvalFlowDataFormats: [],
      ragEvalFlowModelBackends: [],
      ragEvalFlowJudgeBackends: [],
      failedRagEvalFlowRowIds: [],
      totalRagEvalFlowSampleSize: 0,
      averageRagEvalFlowScoreDelta0to1: null,
      averageRagEvalFlowReplayPassRate0to1: null,
      averageRagEvalFlowMetricCoverage0to1: null,
      ragEvalDatasetReplayRowCount: 0,
      ragEvalDatasetDataFormats: [],
      ragEvalDatasetEndpointModes: [],
      failedRagEvalDatasetReplayRowIds: [],
      totalRagEvalDatasetQuestionCount: 0,
      totalRagEvalDatasetEndpointCount: 0,
      averageRagEvalDatasetScoreDelta0to1: null,
      averageRagEvalDatasetReplayPassRate0to1: null,
      averageRagEvalDatasetEndpointResponseCoverage0to1: null,
      mirageDatasetGenerationRowCount: 0,
      mirageBackendIds: [],
      mirageModalityIds: [],
      failedMirageDatasetGenerationRowIds: [],
      totalMirageQuestionCount: 0,
      averageMirageScoreDelta0to1: null,
      averageMirageReplayPassRate0to1: null,
      averageMirageMetricCoverage0to1: null,
      encourageRagReplayRowCount: 0,
      encourageRagMethods: [],
      encourageInferenceBackends: [],
      encourageVectorDbs: [],
      failedEncourageRagReplayRowIds: [],
      totalEncourageDocumentCount: 0,
      totalEncourageQuestionCount: 0,
      averageEncourageScoreDelta0to1: null,
      averageEncourageReplayPassRate0to1: null,
      averageEncourageMetricCoverage0to1: null,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "rag-eval-001",
      status: "passed",
      ragEvaluation: {
        projectId: "rag-system-eval",
        datasetId: "refund-policy-rag-dataset",
        corpusDocumentHash: ragCorpusDocumentHash,
        chunkingConfigHash: ragChunkingConfigHash,
        generatedQuestionSetHash: ragQuestionSetHash,
        referenceAnswerSetHash: ragReferenceAnswerHash,
        retrievalTraceHash: ragRetrievalTraceHash,
        generationTraceHash: ragGenerationTraceHash,
        scoringReportHash: ragScoringReportHash,
        humanReviewHash: ragHumanReviewHash,
        qualityScoreMean0to1: 0.825,
        responseLatencyMs: 920,
        throughputQps: 12.5,
        concurrentUsers: 8,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      ragEvaluationRowCount: 1,
      failedRagEvaluationRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("RAG Evaluation Rows: 1");
    expect(markdown).toContain("Human-Reviewed RAG Rows: 1");
    expect(markdown).toContain("refund-policy-rag-dataset:generic:0.825");
  });

  test("binds industrial multimodal RAG text-image corpus, vector stores, and judge metrics into replay receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "industrial-multimodal-rag-v1",
      sourceRefs: ["https://github.com/riedlerm/multimodal_rag_for_industry"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "industrial-mm-rag-001",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            ragEvaluation: {
              projectId: "industrial-maintenance-rag",
              datasetId: "synthetic-machine-maintenance-mm-rag",
              ragModalityMode: "multimodal",
              vectorStoreMode: "separate_text_image",
              corpusDocumentHash: ragCorpusDocumentHash,
              textCorpusHash: ragTextCorpusHash,
              imageCorpusHash: ragImageCorpusHash,
              pdfExtractionTraceHash: ragPdfExtractionTraceHash,
              imageExtractionTraceHash: ragImageExtractionTraceHash,
              chunkingConfigHash: ragChunkingConfigHash,
              textVectorStoreHash: ragTextVectorStoreHash,
              imageVectorStoreHash: ragImageVectorStoreHash,
              multimodalEmbeddingConfigHash: ragMultimodalEmbeddingConfigHash,
              generatedQuestionSetHash: ragQuestionSetHash,
              referenceAnswerSetHash: ragReferenceAnswerHash,
              retrievalTraceHash: ragRetrievalTraceHash,
              generationTraceHash: ragGenerationTraceHash,
              scoringReportHash: ragScoringReportHash,
              humanReviewHash: ragHumanReviewHash,
              baselineRunHash: ragBaselineRunHash,
              correctContextRunHash: ragCorrectContextRunHash,
              judgeModelId: "amc-synthetic-gpt4v-llava-panel",
              judgeRubricHash: ragJudgeRubricHash,
              accuracy0to1: 0.86,
              relevance0to1: 0.82,
              completeness0to1: 0.84,
              retrievalRecall0to1: 0.78,
              answerCorrectness0to1: 0.84,
              answerRelevancy0to1: 0.86,
              textContextRelevancy0to1: 0.8,
              imageContextRelevancy0to1: 0.78,
              textFaithfulness0to1: 0.82,
              imageFaithfulness0to1: 0.76,
              modalityCoverage0to1: 0.9,
              responseLatencyMs: 1180,
              firstTokenLatencyMs: 260,
              averageCharLatencyMs: 5.1,
              throughputQps: 7.5,
              concurrentUsers: 4,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.ragEvaluationSummary).toEqual({
      rowCount: 1,
      modalityModes: ["multimodal"],
      vectorStoreModes: ["separate_text_image"],
      failedRowIds: [],
      humanReviewedRowCount: 1,
      multimodalRowCount: 1,
      imageEvidenceRowCount: 1,
      averageQualityScore0to1: 0.825,
      averageMultimodalJudgeScore0to1: 0.81,
      averageModalityCoverage0to1: 0.9,
      averageResponseLatencyMs: 1180,
      averageThroughputQps: 7.5,
      ragEvalFlowRowCount: 0,
      ragEvalFlowDataFormats: [],
      ragEvalFlowModelBackends: [],
      ragEvalFlowJudgeBackends: [],
      failedRagEvalFlowRowIds: [],
      totalRagEvalFlowSampleSize: 0,
      averageRagEvalFlowScoreDelta0to1: null,
      averageRagEvalFlowReplayPassRate0to1: null,
      averageRagEvalFlowMetricCoverage0to1: null,
      ragEvalDatasetReplayRowCount: 0,
      ragEvalDatasetDataFormats: [],
      ragEvalDatasetEndpointModes: [],
      failedRagEvalDatasetReplayRowIds: [],
      totalRagEvalDatasetQuestionCount: 0,
      totalRagEvalDatasetEndpointCount: 0,
      averageRagEvalDatasetScoreDelta0to1: null,
      averageRagEvalDatasetReplayPassRate0to1: null,
      averageRagEvalDatasetEndpointResponseCoverage0to1: null,
      mirageDatasetGenerationRowCount: 0,
      mirageBackendIds: [],
      mirageModalityIds: [],
      failedMirageDatasetGenerationRowIds: [],
      totalMirageQuestionCount: 0,
      averageMirageScoreDelta0to1: null,
      averageMirageReplayPassRate0to1: null,
      averageMirageMetricCoverage0to1: null,
      encourageRagReplayRowCount: 0,
      encourageRagMethods: [],
      encourageInferenceBackends: [],
      encourageVectorDbs: [],
      failedEncourageRagReplayRowIds: [],
      totalEncourageDocumentCount: 0,
      totalEncourageQuestionCount: 0,
      averageEncourageScoreDelta0to1: null,
      averageEncourageReplayPassRate0to1: null,
      averageEncourageMetricCoverage0to1: null,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "industrial-mm-rag-001",
      status: "passed",
      ragEvaluation: {
        ragModalityMode: "multimodal",
        vectorStoreMode: "separate_text_image",
        textCorpusHash: ragTextCorpusHash,
        imageCorpusHash: ragImageCorpusHash,
        pdfExtractionTraceHash: ragPdfExtractionTraceHash,
        imageExtractionTraceHash: ragImageExtractionTraceHash,
        textVectorStoreHash: ragTextVectorStoreHash,
        imageVectorStoreHash: ragImageVectorStoreHash,
        multimodalEmbeddingConfigHash: ragMultimodalEmbeddingConfigHash,
        baselineRunHash: ragBaselineRunHash,
        correctContextRunHash: ragCorrectContextRunHash,
        judgeModelId: "amc-synthetic-gpt4v-llava-panel",
        judgeRubricHash: ragJudgeRubricHash,
        multimodalJudgeScoreMean0to1: 0.81,
        modalityCoverage0to1: 0.9,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      ragEvaluationRowCount: 1,
      failedRagEvaluationRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("RAG Modality Modes: multimodal");
    expect(markdown).toContain("RAG Vector Store Modes: separate_text_image");
    expect(markdown).toContain("Multimodal RAG Rows: 1");
    expect(markdown).toContain("synthetic-machine-maintenance-mm-rag:multimodal:0.825");

    const verification = verifyReplayBenchmarkCorpusReceipt(result.manifest, result.ciReceipt);
    expect(verification.valid).toBe(true);
    expect(verification.errors).toEqual([]);
  });

  test("binds Rag-Eval-flow-style local RAG pipeline config, judge, metric, replay, and CI proof", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "rag-eval-flow-local-v1",
      sourceRefs: ["https://github.com/aizip/Rag-Eval-flow"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "rag-eval-flow-001",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            ragEvaluation: {
              projectId: "local-rag-eval-flow",
              datasetId: "synthetic-support-rag-jsonl",
              corpusDocumentHash: ragCorpusDocumentHash,
              chunkingConfigHash: ragChunkingConfigHash,
              generatedQuestionSetHash: ragQuestionSetHash,
              referenceAnswerSetHash: ragReferenceAnswerHash,
              retrievalTraceHash: ragRetrievalTraceHash,
              generationTraceHash: ragGenerationTraceHash,
              scoringReportHash: ragScoringReportHash,
              accuracy0to1: 0.82,
              relevance0to1: 0.84,
              completeness0to1: 0.86,
              retrievalRecall0to1: 0.8,
              responseLatencyMs: 980,
              throughputQps: 9.5,
              ragEvalFlowSourceRefHash,
              ragEvalFlowRepositorySnapshotHash,
              ragEvalFlowLicenseRefHash,
              ragEvalFlowPipelineConfigHash,
              ragEvalFlowDataSourceManifestHash,
              ragEvalFlowModelConfigHash,
              ragEvalFlowJudgeConfigHash,
              ragEvalFlowMetricDefinitionHash,
              ragEvalFlowPromptTemplateHash,
              ragEvalFlowEvalPackManifestHash,
              ragEvalFlowFixtureHash,
              ragEvalFlowReplayCommandHash,
              ragEvalFlowResultManifestHash,
              ragEvalFlowScoreDeltaReportHash,
              ragEvalFlowCiReceiptHash,
              ragEvalFlowPipelineId: "local-rag-eval-flow-smoke",
              ragEvalFlowDataFormat: "jsonl",
              ragEvalFlowModelBackend: "huggingface",
              ragEvalFlowJudgeBackend: "openai",
              ragEvalFlowMetricIds: ["answer_relevance", "faithfulness"],
              ragEvalFlowSampleSize: 24,
              ragEvalFlowMinSampleSize: 10,
              ragEvalFlowDeterministicSeed: 494,
              ragEvalFlowBaselineScore0to1: 0.72,
              ragEvalFlowCandidateScore0to1: 0.81,
              ragEvalFlowReplayPassRate0to1: 1,
              ragEvalFlowMinReplayPassRate0to1: 0.95,
              ragEvalFlowMetricCoverage0to1: 1,
              ragEvalFlowMinMetricCoverage0to1: 1,
              ragEvalFlowMaxScoreRegression0to1: 0.02,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.ragEvaluationSummary).toMatchObject({
      rowCount: 1,
      failedRowIds: [],
      ragEvalFlowRowCount: 1,
      ragEvalFlowDataFormats: ["jsonl"],
      ragEvalFlowModelBackends: ["huggingface"],
      ragEvalFlowJudgeBackends: ["openai"],
      failedRagEvalFlowRowIds: [],
      totalRagEvalFlowSampleSize: 24,
      averageRagEvalFlowScoreDelta0to1: 0.09,
      averageRagEvalFlowReplayPassRate0to1: 1,
      averageRagEvalFlowMetricCoverage0to1: 1,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "rag-eval-flow-001",
      status: "passed",
      ragEvaluation: {
        ragEvalFlowSourceRefHash,
        ragEvalFlowRepositorySnapshotHash,
        ragEvalFlowPipelineConfigHash,
        ragEvalFlowPipelineId: "local-rag-eval-flow-smoke",
        ragEvalFlowDataFormat: "jsonl",
        ragEvalFlowModelBackend: "huggingface",
        ragEvalFlowJudgeBackend: "openai",
        ragEvalFlowMetricIds: ["answer_relevance", "faithfulness"],
        ragEvalFlowSampleSize: 24,
        ragEvalFlowScoreDelta0to1: 0.09,
        ragEvalFlowReplayPassRate0to1: 1,
        ragEvalFlowMetricCoverage0to1: 1,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      ragEvaluationRowCount: 1,
      ragEvalFlowRowCount: 1,
      failedRagEvalFlowRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("Rag-Eval-flow Rows: 1");
    expect(markdown).toContain("Rag-Eval-flow Model Backends: huggingface");
    expect(markdown).toContain("rag-eval-flow-001");

    const verification = verifyReplayBenchmarkCorpusReceipt(result.manifest, result.ciReceipt);
    expect(verification.valid).toBe(true);
    expect(verification.errors).toEqual([]);
  });

  test("fails closed when Rag-Eval-flow-style replay proof is incomplete despite valid generic RAG metrics", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "rag-eval-flow-local-v1",
      sourceRefs: ["https://github.com/aizip/Rag-Eval-flow"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "rag-eval-flow-missing-replay-proof",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            ragEvaluation: {
              projectId: "local-rag-eval-flow",
              datasetId: "synthetic-support-rag-jsonl",
              corpusDocumentHash: ragCorpusDocumentHash,
              chunkingConfigHash: ragChunkingConfigHash,
              generatedQuestionSetHash: ragQuestionSetHash,
              referenceAnswerSetHash: ragReferenceAnswerHash,
              retrievalTraceHash: ragRetrievalTraceHash,
              generationTraceHash: ragGenerationTraceHash,
              scoringReportHash: ragScoringReportHash,
              accuracy0to1: 0.82,
              relevance0to1: 0.84,
              completeness0to1: 0.86,
              retrievalRecall0to1: 0.8,
              responseLatencyMs: 980,
              throughputQps: 9.5,
              ragEvalFlowSourceRefHash,
              ragEvalFlowRepositorySnapshotHash: "not-a-hash",
              ragEvalFlowLicenseRefHash: null,
              ragEvalFlowPipelineConfigHash: null,
              ragEvalFlowDataSourceManifestHash,
              ragEvalFlowModelConfigHash: null,
              ragEvalFlowJudgeConfigHash: ragEvalFlowJudgeConfigHash,
              ragEvalFlowMetricDefinitionHash: null,
              ragEvalFlowPromptTemplateHash: ragEvalFlowPromptTemplateHash,
              ragEvalFlowEvalPackManifestHash: null,
              ragEvalFlowFixtureHash: null,
              ragEvalFlowReplayCommandHash: null,
              ragEvalFlowResultManifestHash: ragEvalFlowResultManifestHash,
              ragEvalFlowScoreDeltaReportHash: null,
              ragEvalFlowCiReceiptHash: null,
              ragEvalFlowPipelineId: "local-rag-eval-flow-missing",
              ragEvalFlowDataFormat: "jsonl",
              ragEvalFlowModelBackend: "huggingface",
              ragEvalFlowJudgeBackend: "openai",
              ragEvalFlowMetricIds: [],
              ragEvalFlowSampleSize: 3,
              ragEvalFlowMinSampleSize: 10,
              ragEvalFlowDeterministicSeed: null,
              ragEvalFlowBaselineScore0to1: 0.82,
              ragEvalFlowCandidateScore0to1: 0.78,
              ragEvalFlowReplayPassRate0to1: 0.4,
              ragEvalFlowMinReplayPassRate0to1: 0.95,
              ragEvalFlowMetricCoverage0to1: 0.5,
              ragEvalFlowMinMetricCoverage0to1: 1,
              ragEvalFlowMaxScoreRegression0to1: 0.02,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.ragEvaluationSummary).toMatchObject({
      rowCount: 1,
      failedRowIds: ["rag-eval-flow-missing-replay-proof"],
      ragEvalFlowRowCount: 1,
      failedRagEvalFlowRowIds: ["rag-eval-flow-missing-replay-proof"],
      totalRagEvalFlowSampleSize: 3,
      averageRagEvalFlowScoreDelta0to1: -0.04,
      averageRagEvalFlowReplayPassRate0to1: 0.4,
      averageRagEvalFlowMetricCoverage0to1: 0.5,
    });
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("rag eval flow repository snapshot hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("rag eval flow license ref hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("rag eval flow pipeline config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("rag eval flow metric definition hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("rag eval flow eval pack manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("rag eval flow fixture hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("rag eval flow replay command hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("rag eval flow score delta report hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("rag eval flow ci receipt hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("rag eval flow metric ids missing");
    expect(result.manifest.rows[0]?.issues).toContain("rag eval flow sample size below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("rag eval flow deterministic seed missing");
    expect(result.manifest.rows[0]?.issues).toContain("rag eval flow score regression exceeds threshold");
    expect(result.manifest.rows[0]?.issues).toContain("rag eval flow replay pass rate below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("rag eval flow metric coverage below threshold");
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      ragEvalFlowRowCount: 1,
      failedRagEvalFlowRowIds: ["rag-eval-flow-missing-replay-proof"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "rag-eval-flow-missing-replay-proof",
      severity: "high",
    });
  });

  test("binds rag-eval-style document QA dataset replay, endpoint ranking, and CI proof", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "sundi-rag-eval-document-qa-v1",
      sourceRefs: ["https://github.com/sundi133/rag-eval"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "rag-eval-dataset-replay-001",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            ragEvaluation: {
              projectId: "sundi-rag-eval-document-qa",
              datasetId: "document-qa-endpoint-replay-pack",
              corpusDocumentHash: ragCorpusDocumentHash,
              chunkingConfigHash: ragChunkingConfigHash,
              generatedQuestionSetHash: ragQuestionSetHash,
              referenceAnswerSetHash: ragReferenceAnswerHash,
              retrievalTraceHash: ragRetrievalTraceHash,
              generationTraceHash: ragGenerationTraceHash,
              scoringReportHash: ragScoringReportHash,
              accuracy0to1: 0.84,
              relevance0to1: 0.86,
              completeness0to1: 0.83,
              retrievalRecall0to1: 0.8,
              responseLatencyMs: 920,
              throughputQps: 8.8,
              ragEvalDatasetSourceRefHash,
              ragEvalDatasetRepositorySnapshotHash,
              ragEvalDatasetLicenseRefHash,
              ragEvalDatasetInputDocumentManifestHash,
              ragEvalDatasetProcessorConfigHash,
              ragEvalDatasetPromptTemplateHash,
              ragEvalDatasetGeneratorConfigHash,
              ragEvalDatasetQaDatasetHash,
              ragEvalDatasetEndpointConfigHash,
              ragEvalDatasetEndpointResponseTraceHash,
              ragEvalDatasetRankingReportHash,
              ragEvalDatasetEvaluationRunHash,
              ragEvalDatasetReplayCommandHash,
              ragEvalDatasetCiReceiptHash,
              ragEvalDatasetId: "sundi-rag-eval-document-qa-smoke",
              ragEvalDatasetDataFormats: ["csv", "pdf"],
              ragEvalDatasetEndpointModes: ["http", "sample_app"],
              ragEvalDatasetMetricIds: ["rouge_l", "semantic_similarity"],
              ragEvalDatasetQuestionCount: 32,
              ragEvalDatasetMinQuestionCount: 12,
              ragEvalDatasetEndpointCount: 2,
              ragEvalDatasetMinEndpointCount: 2,
              ragEvalDatasetDeterministicSeed: 1337,
              ragEvalDatasetBaselineScore0to1: 0.74,
              ragEvalDatasetCandidateScore0to1: 0.81,
              ragEvalDatasetMaxScoreRegression0to1: 0.02,
              ragEvalDatasetReplayPassRate0to1: 1,
              ragEvalDatasetMinReplayPassRate0to1: 0.95,
              ragEvalDatasetEndpointResponseCoverage0to1: 1,
              ragEvalDatasetMinEndpointResponseCoverage0to1: 0.95,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.ragEvaluationSummary).toMatchObject({
      rowCount: 1,
      failedRowIds: [],
      ragEvalDatasetReplayRowCount: 1,
      ragEvalDatasetDataFormats: ["csv", "pdf"],
      ragEvalDatasetEndpointModes: ["http", "sample_app"],
      failedRagEvalDatasetReplayRowIds: [],
      totalRagEvalDatasetQuestionCount: 32,
      totalRagEvalDatasetEndpointCount: 2,
      averageRagEvalDatasetScoreDelta0to1: 0.07,
      averageRagEvalDatasetReplayPassRate0to1: 1,
      averageRagEvalDatasetEndpointResponseCoverage0to1: 1,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "rag-eval-dataset-replay-001",
      status: "passed",
      ragEvaluation: {
        ragEvalDatasetSourceRefHash,
        ragEvalDatasetRepositorySnapshotHash,
        ragEvalDatasetId: "sundi-rag-eval-document-qa-smoke",
        ragEvalDatasetDataFormats: ["csv", "pdf"],
        ragEvalDatasetEndpointModes: ["http", "sample_app"],
        ragEvalDatasetMetricIds: ["rouge_l", "semantic_similarity"],
        ragEvalDatasetQuestionCount: 32,
        ragEvalDatasetEndpointCount: 2,
        ragEvalDatasetScoreDelta0to1: 0.07,
        ragEvalDatasetReplayPassRate0to1: 1,
        ragEvalDatasetEndpointResponseCoverage0to1: 1,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      ragEvaluationRowCount: 1,
      ragEvalDatasetReplayRowCount: 1,
      failedRagEvalDatasetReplayRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("Rag-Eval Dataset Replay Rows: 1");
    expect(markdown).toContain("Rag-Eval Dataset Formats: csv, pdf");
    expect(markdown).toContain("rag-eval-dataset-replay-001");

    const verification = verifyReplayBenchmarkCorpusReceipt(result.manifest, result.ciReceipt);
    expect(verification.valid).toBe(true);
    expect(verification.errors).toEqual([]);
  });

  test("fails closed when rag-eval-style replay proof is only generic RAG metadata", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "sundi-rag-eval-document-qa-v1",
      sourceRefs: ["https://github.com/sundi133/rag-eval"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "rag-eval-dataset-missing-replay-proof",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            ragEvaluation: {
              projectId: "sundi-rag-eval-document-qa",
              datasetId: "document-qa-endpoint-replay-pack",
              corpusDocumentHash: ragCorpusDocumentHash,
              chunkingConfigHash: ragChunkingConfigHash,
              generatedQuestionSetHash: ragQuestionSetHash,
              referenceAnswerSetHash: ragReferenceAnswerHash,
              retrievalTraceHash: ragRetrievalTraceHash,
              generationTraceHash: ragGenerationTraceHash,
              scoringReportHash: ragScoringReportHash,
              accuracy0to1: 0.84,
              relevance0to1: 0.86,
              completeness0to1: 0.83,
              retrievalRecall0to1: 0.8,
              responseLatencyMs: 920,
              throughputQps: 8.8,
              ragEvalDatasetSourceRefHash,
              ragEvalDatasetRepositorySnapshotHash: "not-a-hash",
              ragEvalDatasetLicenseRefHash: null,
              ragEvalDatasetInputDocumentManifestHash: null,
              ragEvalDatasetProcessorConfigHash: null,
              ragEvalDatasetPromptTemplateHash,
              ragEvalDatasetGeneratorConfigHash: null,
              ragEvalDatasetQaDatasetHash: null,
              ragEvalDatasetEndpointConfigHash: null,
              ragEvalDatasetEndpointResponseTraceHash: null,
              ragEvalDatasetRankingReportHash: null,
              ragEvalDatasetEvaluationRunHash: null,
              ragEvalDatasetReplayCommandHash: null,
              ragEvalDatasetCiReceiptHash: null,
              ragEvalDatasetId: "sundi-rag-eval-document-qa-missing",
              ragEvalDatasetDataFormats: [],
              ragEvalDatasetEndpointModes: [],
              ragEvalDatasetMetricIds: [],
              ragEvalDatasetQuestionCount: 4,
              ragEvalDatasetMinQuestionCount: 12,
              ragEvalDatasetEndpointCount: 1,
              ragEvalDatasetMinEndpointCount: 2,
              ragEvalDatasetDeterministicSeed: null,
              ragEvalDatasetBaselineScore0to1: 0.81,
              ragEvalDatasetCandidateScore0to1: 0.77,
              ragEvalDatasetMaxScoreRegression0to1: 0.02,
              ragEvalDatasetReplayPassRate0to1: 0.5,
              ragEvalDatasetMinReplayPassRate0to1: 0.95,
              ragEvalDatasetEndpointResponseCoverage0to1: 0.5,
              ragEvalDatasetMinEndpointResponseCoverage0to1: 0.95,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.ragEvaluationSummary).toMatchObject({
      rowCount: 1,
      failedRowIds: ["rag-eval-dataset-missing-replay-proof"],
      ragEvalDatasetReplayRowCount: 1,
      failedRagEvalDatasetReplayRowIds: ["rag-eval-dataset-missing-replay-proof"],
      totalRagEvalDatasetQuestionCount: 4,
      totalRagEvalDatasetEndpointCount: 1,
      averageRagEvalDatasetScoreDelta0to1: -0.04,
      averageRagEvalDatasetReplayPassRate0to1: 0.5,
      averageRagEvalDatasetEndpointResponseCoverage0to1: 0.5,
    });
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("rag eval dataset repository snapshot hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("rag eval dataset license ref hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("rag eval dataset input document manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("rag eval dataset processor config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("rag eval dataset generator config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("rag eval dataset qa dataset hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("rag eval dataset endpoint config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("rag eval dataset endpoint response trace hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("rag eval dataset ranking report hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("rag eval dataset evaluation run hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("rag eval dataset replay command hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("rag eval dataset ci receipt hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("rag eval dataset data formats missing");
    expect(result.manifest.rows[0]?.issues).toContain("rag eval dataset endpoint modes missing");
    expect(result.manifest.rows[0]?.issues).toContain("rag eval dataset metric ids missing");
    expect(result.manifest.rows[0]?.issues).toContain("rag eval dataset question count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("rag eval dataset endpoint count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("rag eval dataset deterministic seed missing");
    expect(result.manifest.rows[0]?.issues).toContain("rag eval dataset score regression exceeds threshold");
    expect(result.manifest.rows[0]?.issues).toContain("rag eval dataset replay pass rate below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("rag eval dataset endpoint response coverage below threshold");
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      ragEvalDatasetReplayRowCount: 1,
      failedRagEvalDatasetReplayRowIds: ["rag-eval-dataset-missing-replay-proof"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "rag-eval-dataset-missing-replay-proof",
      severity: "high",
    });
  });

  test("binds MiRAGE-style multimodal multihop QA dataset generation replay proof", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "mirage-multimodal-rag-v1",
      sourceRefs: ["https://github.com/ChandanKSahu/MiRAGE"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "mirage-multihop-mmqa-001",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            ragEvaluation: {
              projectId: "mirage-rag-dataset-builder",
              datasetId: "mirage-mmqa-replay-pack",
              ragModalityMode: "multimodal",
              vectorStoreMode: "combined_summary",
              corpusDocumentHash: ragCorpusDocumentHash,
              textCorpusHash: ragTextCorpusHash,
              imageCorpusHash: ragImageCorpusHash,
              pdfExtractionTraceHash: ragPdfExtractionTraceHash,
              imageExtractionTraceHash: ragImageExtractionTraceHash,
              imageSummaryHash: ragImageSummaryHash,
              chunkingConfigHash: ragChunkingConfigHash,
              combinedVectorStoreHash: ragCombinedVectorStoreHash,
              multimodalEmbeddingConfigHash: ragMultimodalEmbeddingConfigHash,
              generatedQuestionSetHash: ragQuestionSetHash,
              referenceAnswerSetHash: ragReferenceAnswerHash,
              retrievalTraceHash: ragRetrievalTraceHash,
              generationTraceHash: ragGenerationTraceHash,
              scoringReportHash: ragScoringReportHash,
              humanReviewHash: ragHumanReviewHash,
              judgeModelId: "amc-mirage-mmqa-panel",
              judgeRubricHash: ragJudgeRubricHash,
              accuracy0to1: 0.88,
              relevance0to1: 0.9,
              completeness0to1: 0.86,
              retrievalRecall0to1: 0.84,
              answerCorrectness0to1: 0.87,
              answerRelevancy0to1: 0.89,
              textContextRelevancy0to1: 0.86,
              imageContextRelevancy0to1: 0.85,
              textFaithfulness0to1: 0.88,
              imageFaithfulness0to1: 0.84,
              modalityCoverage0to1: 1,
              responseLatencyMs: 1120,
              throughputQps: 6.4,
              mirageSourceRefHash,
              mirageRepositorySnapshotHash,
              mirageLicenseRefHash,
              mirageInputDocumentManifestHash,
              mirageSemanticChunkManifestHash,
              mirageMultihopContextGraphHash,
              mirageDomainExpertRoleManifestHash,
              mirageGenerateSelectVerifyCorrectTraceHash,
              mirageMultimodalCarrierManifestHash,
              mirageBackendConfigHash,
              mirageEmbeddingConfigHash,
              mirageRerankerConfigHash,
              mirageTokenUsageTraceHash,
              mirageCheckpointResumeHash,
              mirageDeduplicationReportHash,
              mirageEvaluationReportHash,
              mirageReplayCommandHash,
              mirageOutputDatasetHash,
              mirageVisualizationArtifactHash,
              mirageDatasetId: "mirage-mmqa-replay-pack",
              mirageBackendIds: ["gemini", "openai", "ollama"],
              mirageModalityIds: ["text", "table", "figure", "image"],
              miragePipelineStageIds: ["generate", "select", "verify", "correct"],
              mirageQuestionCount: 64,
              mirageMinQuestionCount: 32,
              mirageDeterministicSeed: 506,
              mirageBaselineQuality0to1: 0.78,
              mirageCandidateQuality0to1: 0.86,
              mirageReplayPassRate0to1: 1,
              mirageMinReplayPassRate0to1: 0.95,
              mirageMetricCoverage0to1: 1,
              mirageMinMetricCoverage0to1: 1,
              mirageMaxScoreRegression0to1: 0.02,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.ragEvaluationSummary).toMatchObject({
      rowCount: 1,
      failedRowIds: [],
      mirageDatasetGenerationRowCount: 1,
      mirageBackendIds: ["gemini", "openai", "ollama"],
      mirageModalityIds: ["text", "table", "figure", "image"],
      failedMirageDatasetGenerationRowIds: [],
      totalMirageQuestionCount: 64,
      averageMirageScoreDelta0to1: 0.08,
      averageMirageReplayPassRate0to1: 1,
      averageMirageMetricCoverage0to1: 1,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "mirage-multihop-mmqa-001",
      status: "passed",
      ragEvaluation: {
        mirageSourceRefHash,
        mirageRepositorySnapshotHash,
        mirageDatasetId: "mirage-mmqa-replay-pack",
        mirageBackendIds: ["gemini", "openai", "ollama"],
        mirageModalityIds: ["text", "table", "figure", "image"],
        miragePipelineStageIds: ["generate", "select", "verify", "correct"],
        mirageQuestionCount: 64,
        mirageScoreDelta0to1: 0.08,
        mirageReplayPassRate0to1: 1,
        mirageMetricCoverage0to1: 1,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      ragEvaluationRowCount: 1,
      mirageDatasetGenerationRowCount: 1,
      failedMirageDatasetGenerationRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("MiRAGE Dataset Rows: 1");
    expect(markdown).toContain("MiRAGE Backends: gemini, openai, ollama");
    expect(markdown).toContain("MiRAGE Modalities: text, table, figure, image");
    expect(markdown).toContain("mirage-multihop-mmqa-001");

    const verification = verifyReplayBenchmarkCorpusReceipt(result.manifest, result.ciReceipt);
    expect(verification.valid).toBe(true);
    expect(verification.errors).toEqual([]);
  });

  test("fails closed when MiRAGE-style dataset-generation replay proof is incomplete", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "mirage-multimodal-rag-v1",
      sourceRefs: ["https://github.com/ChandanKSahu/MiRAGE"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "mirage-missing-replay-proof",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            ragEvaluation: {
              projectId: "mirage-rag-dataset-builder",
              datasetId: "mirage-mmqa-replay-pack",
              ragModalityMode: "multimodal",
              vectorStoreMode: "combined_summary",
              corpusDocumentHash: ragCorpusDocumentHash,
              textCorpusHash: ragTextCorpusHash,
              imageCorpusHash: ragImageCorpusHash,
              pdfExtractionTraceHash: ragPdfExtractionTraceHash,
              imageExtractionTraceHash: ragImageExtractionTraceHash,
              imageSummaryHash: ragImageSummaryHash,
              chunkingConfigHash: ragChunkingConfigHash,
              combinedVectorStoreHash: ragCombinedVectorStoreHash,
              multimodalEmbeddingConfigHash: ragMultimodalEmbeddingConfigHash,
              generatedQuestionSetHash: ragQuestionSetHash,
              referenceAnswerSetHash: ragReferenceAnswerHash,
              retrievalTraceHash: ragRetrievalTraceHash,
              generationTraceHash: ragGenerationTraceHash,
              scoringReportHash: ragScoringReportHash,
              humanReviewHash: ragHumanReviewHash,
              judgeModelId: "amc-mirage-mmqa-panel",
              judgeRubricHash: ragJudgeRubricHash,
              accuracy0to1: 0.88,
              relevance0to1: 0.9,
              completeness0to1: 0.86,
              retrievalRecall0to1: 0.84,
              answerCorrectness0to1: 0.87,
              answerRelevancy0to1: 0.89,
              textContextRelevancy0to1: 0.86,
              imageContextRelevancy0to1: 0.85,
              textFaithfulness0to1: 0.88,
              imageFaithfulness0to1: 0.84,
              modalityCoverage0to1: 1,
              responseLatencyMs: 1120,
              throughputQps: 6.4,
              mirageSourceRefHash,
              mirageRepositorySnapshotHash: "not-a-hash",
              mirageLicenseRefHash: null,
              mirageInputDocumentManifestHash,
              mirageSemanticChunkManifestHash: null,
              mirageMultihopContextGraphHash: null,
              mirageDomainExpertRoleManifestHash: null,
              mirageGenerateSelectVerifyCorrectTraceHash: null,
              mirageMultimodalCarrierManifestHash: null,
              mirageBackendConfigHash: null,
              mirageEmbeddingConfigHash: null,
              mirageRerankerConfigHash: null,
              mirageTokenUsageTraceHash: null,
              mirageCheckpointResumeHash: null,
              mirageDeduplicationReportHash: null,
              mirageEvaluationReportHash: null,
              mirageReplayCommandHash: null,
              mirageOutputDatasetHash: null,
              mirageVisualizationArtifactHash: null,
              mirageDatasetId: "",
              mirageBackendIds: [],
              mirageModalityIds: [],
              miragePipelineStageIds: [],
              mirageQuestionCount: 12,
              mirageMinQuestionCount: 32,
              mirageDeterministicSeed: null,
              mirageBaselineQuality0to1: 0.86,
              mirageCandidateQuality0to1: 0.8,
              mirageReplayPassRate0to1: 0.6,
              mirageMinReplayPassRate0to1: 0.95,
              mirageMetricCoverage0to1: 0.5,
              mirageMinMetricCoverage0to1: 1,
              mirageMaxScoreRegression0to1: 0.02,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.ragEvaluationSummary).toMatchObject({
      rowCount: 1,
      failedRowIds: ["mirage-missing-replay-proof"],
      mirageDatasetGenerationRowCount: 1,
      failedMirageDatasetGenerationRowIds: ["mirage-missing-replay-proof"],
      totalMirageQuestionCount: 12,
      averageMirageScoreDelta0to1: -0.06,
      averageMirageReplayPassRate0to1: 0.6,
      averageMirageMetricCoverage0to1: 0.5,
    });
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("mirage repository snapshot hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("mirage license ref hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("mirage replay command hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("mirage output dataset hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("mirage dataset id missing");
    expect(result.manifest.rows[0]?.issues).toContain("mirage backend ids missing");
    expect(result.manifest.rows[0]?.issues).toContain("mirage modality ids missing");
    expect(result.manifest.rows[0]?.issues).toContain("mirage pipeline stage ids missing");
    expect(result.manifest.rows[0]?.issues).toContain("mirage question count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("mirage deterministic seed missing");
    expect(result.manifest.rows[0]?.issues).toContain("mirage score regression exceeds threshold");
    expect(result.manifest.rows[0]?.issues).toContain("mirage replay pass rate below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("mirage metric coverage below threshold");
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      mirageDatasetGenerationRowCount: 1,
      failedMirageDatasetGenerationRowIds: ["mirage-missing-replay-proof"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "mirage-missing-replay-proof",
      severity: "high",
    });
  });

  test("binds Encourage-style modular RAG replay proof with inference, templates, vector DB, metrics, and MLflow evidence", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "encourage-rag-replay-v1",
      sourceRefs: ["https://github.com/uhh-hcds/encourage"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "encourage-rag-qdrant-vllm-001",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            ragEvaluation: {
              projectId: "encourage-rag-smoke",
              datasetId: "support-policy-rag-eval",
              corpusDocumentHash: ragCorpusDocumentHash,
              chunkingConfigHash: ragChunkingConfigHash,
              generatedQuestionSetHash: ragQuestionSetHash,
              referenceAnswerSetHash: ragReferenceAnswerHash,
              retrievalTraceHash: ragRetrievalTraceHash,
              generationTraceHash: ragGenerationTraceHash,
              scoringReportHash: ragScoringReportHash,
              accuracy0to1: 0.85,
              relevance0to1: 0.87,
              completeness0to1: 0.84,
              retrievalRecall0to1: 0.82,
              responseLatencyMs: 860,
              throughputQps: 10.4,
              encourageSourceRefHash,
              encourageRepositorySnapshotHash,
              encourageLicenseRefHash,
              encouragePackageVersionHash,
              encourageDependencyLockHash,
              encourageRagMethodManifestHash,
              encourageInferenceRunnerConfigHash,
              encourageTemplateManifestHash,
              encourageVectorDbConfigHash,
              encourageDatasetManifestHash,
              encourageQuerySetHash,
              encourageReferenceAnswerSetHash,
              encourageMetricSuiteHash,
              encourageMlflowRunHash,
              encourageResultManifestHash,
              encourageReplayCommandHash,
              encourageCiReceiptHash,
              encourageRagMethodId: "baseline-qdrant-template-rag",
              encourageInferenceBackend: "vllm",
              encourageVectorDb: "qdrant",
              encourageMetricIds: ["bert_score", "rouge_l", "ndcg"],
              encourageDocumentCount: 18,
              encourageMinDocumentCount: 10,
              encourageQuestionCount: 28,
              encourageMinQuestionCount: 12,
              encourageDeterministicSeed: 538,
              encourageBaselineScore0to1: 0.74,
              encourageCandidateScore0to1: 0.83,
              encourageMaxScoreRegression0to1: 0.02,
              encourageReplayPassRate0to1: 1,
              encourageMinReplayPassRate0to1: 0.95,
              encourageMetricCoverage0to1: 1,
              encourageMinMetricCoverage0to1: 1,
              encourageMlflowLogged: true,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.ragEvaluationSummary).toMatchObject({
      rowCount: 1,
      failedRowIds: [],
      encourageRagReplayRowCount: 1,
      encourageRagMethods: ["baseline-qdrant-template-rag"],
      encourageInferenceBackends: ["vllm"],
      encourageVectorDbs: ["qdrant"],
      failedEncourageRagReplayRowIds: [],
      totalEncourageDocumentCount: 18,
      totalEncourageQuestionCount: 28,
      averageEncourageScoreDelta0to1: 0.09,
      averageEncourageReplayPassRate0to1: 1,
      averageEncourageMetricCoverage0to1: 1,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "encourage-rag-qdrant-vllm-001",
      status: "passed",
      ragEvaluation: {
        encourageSourceRefHash,
        encourageRepositorySnapshotHash,
        encourageRagMethodId: "baseline-qdrant-template-rag",
        encourageInferenceBackend: "vllm",
        encourageVectorDb: "qdrant",
        encourageMetricIds: ["bert_score", "rouge_l", "ndcg"],
        encourageDocumentCount: 18,
        encourageQuestionCount: 28,
        encourageScoreDelta0to1: 0.09,
        encourageReplayPassRate0to1: 1,
        encourageMetricCoverage0to1: 1,
        encourageMlflowLogged: true,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      ragEvaluationRowCount: 1,
      encourageRagReplayRowCount: 1,
      failedEncourageRagReplayRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("Encourage RAG Replay Rows: 1");
    expect(markdown).toContain("Encourage RAG Inference Backends: vllm");
    expect(markdown).toContain("Encourage RAG Vector DBs: qdrant");
    expect(markdown).toContain("encourage-rag-qdrant-vllm-001");

    const verification = verifyReplayBenchmarkCorpusReceipt(result.manifest, result.ciReceipt);
    expect(verification.valid).toBe(true);
    expect(verification.errors).toEqual([]);
  });

  test("fails closed when Encourage-style RAG replay proof relies only on source metadata", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "encourage-rag-replay-v1",
      sourceRefs: ["https://github.com/uhh-hcds/encourage"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "encourage-rag-metadata-only",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            ragEvaluation: {
              projectId: "encourage-rag-smoke",
              datasetId: "support-policy-rag-eval",
              corpusDocumentHash: ragCorpusDocumentHash,
              chunkingConfigHash: ragChunkingConfigHash,
              generatedQuestionSetHash: ragQuestionSetHash,
              referenceAnswerSetHash: ragReferenceAnswerHash,
              retrievalTraceHash: ragRetrievalTraceHash,
              generationTraceHash: ragGenerationTraceHash,
              scoringReportHash: ragScoringReportHash,
              accuracy0to1: 0.85,
              relevance0to1: 0.87,
              completeness0to1: 0.84,
              retrievalRecall0to1: 0.82,
              responseLatencyMs: 860,
              throughputQps: 10.4,
              encourageSourceRefHash,
              encourageRepositorySnapshotHash: "not-a-hash",
              encourageLicenseRefHash,
              encouragePackageVersionHash: null,
              encourageDependencyLockHash: null,
              encourageRagMethodManifestHash: null,
              encourageInferenceRunnerConfigHash: null,
              encourageTemplateManifestHash: null,
              encourageVectorDbConfigHash: null,
              encourageDatasetManifestHash: null,
              encourageQuerySetHash: null,
              encourageReferenceAnswerSetHash: null,
              encourageMetricSuiteHash: null,
              encourageMlflowRunHash: null,
              encourageResultManifestHash: null,
              encourageReplayCommandHash: null,
              encourageCiReceiptHash: null,
              encourageRagMethodId: "",
              encourageInferenceBackend: "vllm",
              encourageVectorDb: "qdrant",
              encourageMetricIds: [],
              encourageDocumentCount: 4,
              encourageMinDocumentCount: 10,
              encourageQuestionCount: 5,
              encourageMinQuestionCount: 12,
              encourageDeterministicSeed: null,
              encourageBaselineScore0to1: 0.84,
              encourageCandidateScore0to1: 0.8,
              encourageMaxScoreRegression0to1: 0.02,
              encourageReplayPassRate0to1: 0.5,
              encourageMinReplayPassRate0to1: 0.95,
              encourageMetricCoverage0to1: 0.5,
              encourageMinMetricCoverage0to1: 1,
              encourageMlflowLogged: false,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.ragEvaluationSummary).toMatchObject({
      rowCount: 1,
      failedRowIds: ["encourage-rag-metadata-only"],
      encourageRagReplayRowCount: 1,
      failedEncourageRagReplayRowIds: ["encourage-rag-metadata-only"],
      totalEncourageDocumentCount: 4,
      totalEncourageQuestionCount: 5,
      averageEncourageScoreDelta0to1: -0.04,
      averageEncourageReplayPassRate0to1: 0.5,
      averageEncourageMetricCoverage0to1: 0.5,
    });
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("encourage rag repository snapshot hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("encourage rag package version hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("encourage rag dependency lock hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("encourage rag method manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("encourage rag inference runner config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("encourage rag template manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("encourage rag vector db config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("encourage rag dataset manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("encourage rag metric suite hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("encourage rag result manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("encourage rag replay command hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("encourage rag ci receipt hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("encourage rag method id missing");
    expect(result.manifest.rows[0]?.issues).toContain("encourage rag metric ids missing");
    expect(result.manifest.rows[0]?.issues).toContain("encourage rag document count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("encourage rag question count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("encourage rag deterministic seed missing");
    expect(result.manifest.rows[0]?.issues).toContain("encourage rag score regression exceeds threshold");
    expect(result.manifest.rows[0]?.issues).toContain("encourage rag replay pass rate below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("encourage rag metric coverage below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("encourage rag mlflow logging missing");
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      encourageRagReplayRowCount: 1,
      failedEncourageRagReplayRowIds: ["encourage-rag-metadata-only"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "encourage-rag-metadata-only",
      severity: "high",
    });
  });

  test("fails closed when industrial multimodal RAG replay evidence is incomplete", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "industrial-multimodal-rag-v1",
      sourceRefs: ["https://github.com/riedlerm/multimodal_rag_for_industry"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "industrial-mm-rag-missing-modal-evidence",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            ragEvaluation: {
              projectId: "industrial-maintenance-rag",
              datasetId: "synthetic-machine-maintenance-mm-rag",
              ragModalityMode: "multimodal",
              vectorStoreMode: "separate_text_image",
              corpusDocumentHash: ragCorpusDocumentHash,
              textCorpusHash: ragTextCorpusHash,
              pdfExtractionTraceHash: ragPdfExtractionTraceHash,
              chunkingConfigHash: ragChunkingConfigHash,
              generatedQuestionSetHash: ragQuestionSetHash,
              referenceAnswerSetHash: ragReferenceAnswerHash,
              retrievalTraceHash: ragRetrievalTraceHash,
              generationTraceHash: ragGenerationTraceHash,
              scoringReportHash: ragScoringReportHash,
              judgeModelId: "amc-synthetic-gpt4v-llava-panel",
              judgeRubricHash: ragJudgeRubricHash,
              accuracy0to1: 0.86,
              relevance0to1: 0.82,
              completeness0to1: 0.84,
              answerCorrectness0to1: 0.84,
              answerRelevancy0to1: 0.86,
              textContextRelevancy0to1: 0.8,
              textFaithfulness0to1: 0.82,
              responseLatencyMs: 1180,
              throughputQps: 7.5,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.ragEvaluationSummary).toMatchObject({
      rowCount: 1,
      modalityModes: ["multimodal"],
      vectorStoreModes: ["separate_text_image"],
      failedRowIds: ["industrial-mm-rag-missing-modal-evidence"],
      multimodalRowCount: 1,
      imageEvidenceRowCount: 0,
    });
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("rag image corpus hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("rag image extraction trace hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("rag text vector store hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("rag image vector store hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("rag multimodal embedding config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("rag image judge metric missing");
    expect(result.manifest.rows[0]?.issues).toContain("rag modality coverage metric missing");
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedRowIds: ["industrial-mm-rag-missing-modal-evidence"],
      failedRagEvaluationRowIds: ["industrial-mm-rag-missing-modal-evidence"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "industrial-mm-rag-missing-modal-evidence",
      severity: "critical",
    });
  });

  test("fails closed when RAG evaluation replay evidence is incomplete", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "rag-eval-system-v1",
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "rag-eval-missing-evidence",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            ragEvaluation: {
              projectId: "rag-system-eval",
              datasetId: "refund-policy-rag-dataset",
              corpusDocumentHash: "not-a-sha",
              referenceAnswerSetHash: ragReferenceAnswerHash,
              generationTraceHash: "also-not-a-sha",
              humanReviewHash: "bad-review-hash",
              accuracy0to1: 0.86,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.ragEvaluationSummary).toMatchObject({
      rowCount: 1,
      failedRowIds: ["rag-eval-missing-evidence"],
      humanReviewedRowCount: 1,
    });
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("rag corpus document hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("rag generated question set hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("rag retrieval trace hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("rag generation trace hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("rag scoring report hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("rag human review hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("rag quality metric missing");
    expect(result.manifest.rows[0]?.issues).toContain("rag performance metric missing");
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedRowIds: ["rag-eval-missing-evidence"],
      ragEvaluationRowCount: 1,
      failedRagEvaluationRowIds: ["rag-eval-missing-evidence"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "rag-eval-missing-evidence",
      severity: "critical",
    });
  });

  test("binds RAG chunking strategy comparison replay evidence into receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "rag-chunking-strategy-v1",
      sourceRefs: ["https://github.com/HaroldConley/chunk-norris"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "rag-chunking-strategy-001",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            chunkingStrategyEvaluation: {
              benchmarkId: "amc-rag-chunking-strategy",
              benchmarkVersion: "2026-06-13",
              sourceRefHash: chunkingSourceRefHash,
              documentSetHash: chunkingDocumentSetHash,
              questionSetHash: ragQuestionSetHash,
              referenceAnswerSetHash: ragReferenceAnswerHash,
              chunkerManifestHash,
              chunkingConfigHash: ragChunkingConfigHash,
              embedderConfigHash: chunkingEmbedderConfigHash,
              keywordIndexConfigHash: chunkingKeywordIndexConfigHash,
              retrievalFusionConfigHash: chunkingFusionConfigHash,
              retrievalTraceHash: ragRetrievalTraceHash,
              scoringConfigHash: chunkingScoringConfigHash,
              scoringReportHash: ragScoringReportHash,
              reportArtifactHash: chunkingReportArtifactHash,
              exportArtifactHash: chunkingExportArtifactHash,
              replayCommandHash: chunkingReplayCommandHash,
              deterministicSeed: 613,
              documentCount: 1,
              questionCount: 24,
              minQuestionCount: 15,
              chunkerCount: 4,
              minChunkerCount: 3,
              strategyKinds: ["fixed", "paragraph", "sentence", "recursive"],
              retrievalMode: "hybrid",
              bestChunkerId: "sentence-window-v1",
              baselineCombinedScore0to1: 0.72,
              candidateCombinedScore0to1: 0.84,
              minCandidateCombinedScore0to1: 0.8,
              scoreDelta0to1: 0.12,
              maxScoreRegression0to1: 0.02,
              answerSpanCoverage0to1: 0.91,
              minAnswerSpanCoverage0to1: 0.85,
              semanticFocus0to1: 0.78,
              minSemanticFocus0to1: 0.7,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.chunkingStrategyEvaluationSummary).toEqual({
      rowCount: 1,
      benchmarkIds: ["amc-rag-chunking-strategy"],
      retrievalModes: ["hybrid"],
      strategyKinds: ["fixed", "paragraph", "sentence", "recursive"],
      failedRowIds: [],
      totalDocumentCount: 1,
      totalQuestionCount: 24,
      totalChunkerCount: 4,
      averageCandidateCombinedScore0to1: 0.84,
      averageScoreDelta0to1: 0.12,
      averageAnswerSpanCoverage0to1: 0.91,
      averageSemanticFocus0to1: 0.78,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "rag-chunking-strategy-001",
      status: "passed",
      chunkingStrategyEvaluation: {
        benchmarkId: "amc-rag-chunking-strategy",
        sourceRefHash: chunkingSourceRefHash,
        documentSetHash: chunkingDocumentSetHash,
        questionSetHash: ragQuestionSetHash,
        referenceAnswerSetHash: ragReferenceAnswerHash,
        chunkerManifestHash,
        retrievalMode: "hybrid",
        strategyKinds: ["fixed", "paragraph", "sentence", "recursive"],
        bestChunkerId: "sentence-window-v1",
        candidateCombinedScore0to1: 0.84,
        answerSpanCoverage0to1: 0.91,
        semanticFocus0to1: 0.78,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      chunkingStrategyEvaluationRowCount: 1,
      failedChunkingStrategyEvaluationRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("RAG Chunking Strategy Rows: 1");
    expect(markdown).toContain("RAG Chunking Retrieval Modes: hybrid");
    expect(markdown).toContain("amc-rag-chunking-strategy:hybrid:0.84");

    const verification = verifyReplayBenchmarkCorpusReceipt(result.manifest, result.ciReceipt);
    expect(verification.valid).toBe(true);
    expect(verification.errors).toEqual([]);
  });

  test("fails closed when RAG chunking strategy replay evidence is incomplete", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "rag-chunking-strategy-v1",
      sourceRefs: ["https://github.com/HaroldConley/chunk-norris"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "rag-chunking-strategy-missing-evidence",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            chunkingStrategyEvaluation: {
              benchmarkId: "amc-rag-chunking-strategy",
              benchmarkVersion: "2026-06-13",
              sourceRefHash: "not-a-sha",
              documentSetHash: chunkingDocumentSetHash,
              questionSetHash: ragQuestionSetHash,
              referenceAnswerSetHash: ragReferenceAnswerHash,
              chunkingConfigHash: ragChunkingConfigHash,
              retrievalTraceHash: "bad-retrieval-trace",
              scoringReportHash: ragScoringReportHash,
              deterministicSeed: 613,
              documentCount: 1,
              questionCount: 8,
              minQuestionCount: 15,
              chunkerCount: 1,
              minChunkerCount: 3,
              strategyKinds: ["fixed"],
              retrievalMode: "hybrid",
              candidateCombinedScore0to1: 0.61,
              minCandidateCombinedScore0to1: 0.8,
              scoreDelta0to1: -0.04,
              maxScoreRegression0to1: 0.02,
              answerSpanCoverage0to1: 0.7,
              minAnswerSpanCoverage0to1: 0.85,
              semanticFocus0to1: 0.65,
              minSemanticFocus0to1: 0.7,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.chunkingStrategyEvaluationSummary).toMatchObject({
      rowCount: 1,
      retrievalModes: ["hybrid"],
      failedRowIds: ["rag-chunking-strategy-missing-evidence"],
      totalQuestionCount: 8,
      totalChunkerCount: 1,
    });
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("chunking strategy source ref hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("chunking strategy chunker manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("chunking strategy embedder config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("chunking strategy keyword index config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("chunking strategy retrieval fusion config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("chunking strategy retrieval trace hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("chunking strategy scoring config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("chunking strategy report artifact hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("chunking strategy export artifact hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("chunking strategy replay command hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("chunking strategy question count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("chunking strategy chunker count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("chunking strategy candidate score below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("chunking strategy score regression exceeds threshold");
    expect(result.manifest.rows[0]?.issues).toContain("chunking strategy answer span coverage below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("chunking strategy semantic focus below threshold");
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedRowIds: ["rag-chunking-strategy-missing-evidence"],
      chunkingStrategyEvaluationRowCount: 1,
      failedChunkingStrategyEvaluationRowIds: ["rag-chunking-strategy-missing-evidence"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "rag-chunking-strategy-missing-evidence",
      severity: "critical",
    });
  });

  test("binds AI research task specs, harnesses, submissions, and evaluation artifacts into replay receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "ai-research-science-v1",
      sourceRefs: [
        "https://github.com/facebookresearch/airs-bench",
        "https://arxiv.org/abs/2602.06855",
      ],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "ai-research-task-001",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            aiResearchTask: {
              taskId: "synthetic-text-similarity-research-task",
              taskDomain: "nlp",
              researchStage: "experiment_analysis",
              problemSpecHash: aiResearchProblemSpecHash,
              datasetSpecHash: aiResearchDatasetSpecHash,
              metricSpecHash: aiResearchMetricSpecHash,
              sotaReferenceHash: aiResearchSotaReferenceHash,
              harnessId: "amc-research-harness-v1",
              scaffoldId: "amc-greedy-scaffold-v1",
              scaffoldMode: "greedy",
              seedCount: 3,
              submissionArtifactHash: aiResearchSubmissionArtifactHash,
              evaluationScriptHash: aiResearchEvaluationScriptHash,
              evaluatorOutputHash: aiResearchEvaluatorOutputHash,
              normalizedScore0to1: 0.64,
              validSubmission: true,
              surpassedSota: false,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.aiResearchTaskSummary).toEqual({
      rowCount: 1,
      domains: ["nlp"],
      stages: ["experiment_analysis"],
      scaffoldModes: ["greedy"],
      failedRowIds: [],
      validSubmissionRowCount: 1,
      surpassedSotaRowCount: 0,
      averageNormalizedScore0to1: 0.64,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "ai-research-task-001",
      status: "passed",
      aiResearchTask: {
        taskId: "synthetic-text-similarity-research-task",
        taskDomain: "nlp",
        researchStage: "experiment_analysis",
        problemSpecHash: aiResearchProblemSpecHash,
        datasetSpecHash: aiResearchDatasetSpecHash,
        metricSpecHash: aiResearchMetricSpecHash,
        sotaReferenceHash: aiResearchSotaReferenceHash,
        harnessId: "amc-research-harness-v1",
        scaffoldId: "amc-greedy-scaffold-v1",
        scaffoldMode: "greedy",
        seedCount: 3,
        submissionArtifactHash: aiResearchSubmissionArtifactHash,
        evaluationScriptHash: aiResearchEvaluationScriptHash,
        evaluatorOutputHash: aiResearchEvaluatorOutputHash,
        normalizedScore0to1: 0.64,
        validSubmission: true,
        surpassedSota: false,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      aiResearchTaskRowCount: 1,
      failedAiResearchTaskRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("AI Research Task Rows: 1");
    expect(markdown).toContain("AI Research Domains: nlp");
    expect(markdown).toContain("synthetic-text-similarity-research-task:0.64");
  });

  test("fails closed when AI research task replay evidence is incomplete", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "ai-research-science-v1",
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "ai-research-missing-evidence",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            aiResearchTask: {
              taskId: "synthetic-invalid-submission-task",
              taskDomain: "nlp",
              researchStage: "submission_generation",
              problemSpecHash: "not-a-sha",
              datasetSpecHash: aiResearchDatasetSpecHash,
              metricSpecHash: aiResearchMetricSpecHash,
              harnessId: "amc-research-harness-v1",
              scaffoldId: "amc-one-shot-scaffold-v1",
              scaffoldMode: "one_shot",
              seedCount: 1,
              submissionArtifactHash: "bad-submission-hash",
              evaluationScriptHash: aiResearchEvaluationScriptHash,
              normalizedScore0to1: 0.12,
              validSubmission: false,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.aiResearchTaskSummary).toMatchObject({
      rowCount: 1,
      domains: ["nlp"],
      stages: ["submission_generation"],
      scaffoldModes: ["one_shot"],
      failedRowIds: ["ai-research-missing-evidence"],
      validSubmissionRowCount: 0,
    });
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("ai research problem spec hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("ai research sota reference hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("ai research submission artifact hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("ai research evaluator output hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("ai research valid submission false");
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedRowIds: ["ai-research-missing-evidence"],
      aiResearchTaskRowCount: 1,
      failedAiResearchTaskRowIds: ["ai-research-missing-evidence"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "ai-research-missing-evidence",
      severity: "critical",
    });
  });

  test("binds scientific evaluation suite dimensions, disciplines, registries, and reports into replay receipts", () => {
    const capabilities = [
      "scientific_knowledge_understanding",
      "scientific_code_generation",
      "scientific_symbolic_reasoning",
      "scientific_hypothesis_generation",
      "scientific_multimodal_perception",
      "scientific_multimodal_reasoning",
      "scientific_multimodal_understanding",
    ] as const;
    const disciplines = [
      "physics",
      "chemistry",
      "astronomy",
      "materials_science",
      "life_science",
      "earth_science",
    ] as const;

    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "scientific-evaluation-suite-v1",
      sourceRefs: [
        "https://github.com/InternScience/SciEvalKit",
        "https://arxiv.org/abs/2512.22334",
      ],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "scievalkit-suite-001",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            scientificEvaluation: {
              suiteId: "scievalkit-core-suite",
              suiteVersion: "2025.12.05",
              capabilityDimensions: [...capabilities],
              disciplines: [...disciplines],
              inputModalities: ["text", "image", "code", "multimodal"],
              datasetRegistryHash: scienceDatasetRegistryHash,
              modelRegistryHash: scienceModelRegistryHash,
              promptTemplateHash: sciencePromptTemplateHash,
              evaluatorConfigHash: scienceEvaluatorConfigHash,
              scoringBackend: "hybrid",
              sandboxConfigHash: scienceSandboxConfigHash,
              batchRunConfigHash: scienceBatchRunConfigHash,
              resultArtifactHash: scienceResultArtifactHash,
              leaderboardSnapshotHash: scienceLeaderboardSnapshotHash,
              reportArtifactHash: scienceReportArtifactHash,
              datasetCount: 42,
              taskCount: 210,
              modelCount: 3,
              capabilityCoverage0to1: 1,
              minCapabilityCoverage0to1: 0.75,
              disciplineCoverage0to1: 1,
              minDisciplineCoverage0to1: 0.75,
              averageScore0to1: 0.58,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.scientificEvaluationSummary).toEqual({
      rowCount: 1,
      capabilityDimensions: [...capabilities],
      disciplines: [...disciplines],
      inputModalities: ["text", "image", "code", "multimodal"],
      scoringBackends: ["hybrid"],
      failedRowIds: [],
      totalTaskCount: 210,
      averageCapabilityCoverage0to1: 1,
      averageDisciplineCoverage0to1: 1,
      averageScore0to1: 0.58,
      leaderboardSnapshotCount: 1,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "scievalkit-suite-001",
      status: "passed",
      scientificEvaluation: {
        suiteId: "scievalkit-core-suite",
        suiteVersion: "2025.12.05",
        capabilityDimensions: [...capabilities],
        disciplines: [...disciplines],
        inputModalities: ["text", "image", "code", "multimodal"],
        datasetRegistryHash: scienceDatasetRegistryHash,
        modelRegistryHash: scienceModelRegistryHash,
        promptTemplateHash: sciencePromptTemplateHash,
        evaluatorConfigHash: scienceEvaluatorConfigHash,
        scoringBackend: "hybrid",
        sandboxConfigHash: scienceSandboxConfigHash,
        batchRunConfigHash: scienceBatchRunConfigHash,
        resultArtifactHash: scienceResultArtifactHash,
        leaderboardSnapshotHash: scienceLeaderboardSnapshotHash,
        reportArtifactHash: scienceReportArtifactHash,
        datasetCount: 42,
        taskCount: 210,
        modelCount: 3,
        capabilityCoverage0to1: 1,
        minCapabilityCoverage0to1: 0.75,
        disciplineCoverage0to1: 1,
        minDisciplineCoverage0to1: 0.75,
        averageScore0to1: 0.58,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      scientificEvaluationRowCount: 1,
      failedScientificEvaluationRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("Scientific Evaluation Rows: 1");
    expect(markdown).toContain("Scientific Disciplines: physics, chemistry, astronomy, materials_science, life_science, earth_science");
    expect(markdown).toContain("scievalkit-core-suite:0.58");
  });

  test("fails closed when scientific evaluation suite evidence is incomplete", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "scientific-evaluation-suite-v1",
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "scievalkit-suite-missing-evidence",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            scientificEvaluation: {
              suiteId: "scievalkit-incomplete-suite",
              capabilityDimensions: ["scientific_code_generation"],
              inputModalities: ["code"],
              datasetRegistryHash: "not-a-sha",
              scoringBackend: "execution",
              resultArtifactHash: "bad-result-hash",
              datasetCount: 0,
              capabilityCoverage0to1: 0.42,
              minCapabilityCoverage0to1: 0.75,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.scientificEvaluationSummary).toMatchObject({
      rowCount: 1,
      capabilityDimensions: ["scientific_code_generation"],
      disciplines: [],
      inputModalities: ["code"],
      scoringBackends: ["execution"],
      failedRowIds: ["scievalkit-suite-missing-evidence"],
      totalTaskCount: 0,
      averageCapabilityCoverage0to1: 0.42,
    });
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("scientific evaluation suite version missing");
    expect(result.manifest.rows[0]?.issues).toContain("scientific disciplines missing");
    expect(result.manifest.rows[0]?.issues).toContain("scientific dataset registry hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("scientific model registry hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("scientific prompt template hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("scientific evaluator config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("scientific sandbox config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("scientific batch run config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("scientific result artifact hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("scientific leaderboard snapshot hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("scientific report artifact hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("scientific dataset count missing");
    expect(result.manifest.rows[0]?.issues).toContain("scientific task count missing");
    expect(result.manifest.rows[0]?.issues).toContain("scientific model count missing");
    expect(result.manifest.rows[0]?.issues).toContain("scientific capability coverage below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("scientific discipline coverage missing");
    expect(result.manifest.rows[0]?.issues).toContain("scientific average score missing");
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedRowIds: ["scievalkit-suite-missing-evidence"],
      scientificEvaluationRowCount: 1,
      failedScientificEvaluationRowIds: ["scievalkit-suite-missing-evidence"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "scievalkit-suite-missing-evidence",
      severity: "critical",
    });
  });

  test("binds dynamic MCP tool sandbox state, retrieval, and trajectory evidence into replay receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "complex-mcp-tool-sandbox-v1",
      sourceRefs: ["https://arxiv.org/abs/2605.10787"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "complex-mcp-workflow-001",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            toolSandbox: {
              sandboxId: "synthetic-stateful-office-finance-sandbox",
              protocol: "mcp",
              retrievalMode: "rag",
              statefulSandboxCount: 7,
              toolCount: 312,
              toolRegistryHash: toolSandboxRegistryHash,
              toolDependencyGraphHash: toolSandboxDependencyGraphHash,
              initialStateHash: toolSandboxInitialStateHash,
              seedStateHash: toolSandboxSeedStateHash,
              apiFailureScheduleHash: toolSandboxApiFailureScheduleHash,
              environmentVerificationTraceHash: toolSandboxEnvironmentVerificationTraceHash,
              trajectoryTraceHash: toolSandboxTrajectoryTraceHash,
              toolRetrievalTraceHash: toolSandboxRetrievalTraceHash,
              toolRetrievalRecall0to1: 0.82,
              verificationStepCoverage0to1: 0.9,
              minVerificationStepCoverage0to1: 0.75,
              recoveryAttemptCount: 3,
              successfulRecoveryCount: 2,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.toolSandboxSummary).toEqual({
      rowCount: 1,
      protocols: ["mcp"],
      retrievalModes: ["rag"],
      failedRowIds: [],
      totalToolCount: 312,
      averageToolRetrievalRecall0to1: 0.82,
      averageVerificationStepCoverage0to1: 0.9,
      totalRecoveryAttemptCount: 3,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "complex-mcp-workflow-001",
      status: "passed",
      toolSandbox: {
        sandboxId: "synthetic-stateful-office-finance-sandbox",
        protocol: "mcp",
        retrievalMode: "rag",
        statefulSandboxCount: 7,
        toolCount: 312,
        toolRegistryHash: toolSandboxRegistryHash,
        toolDependencyGraphHash: toolSandboxDependencyGraphHash,
        initialStateHash: toolSandboxInitialStateHash,
        seedStateHash: toolSandboxSeedStateHash,
        apiFailureScheduleHash: toolSandboxApiFailureScheduleHash,
        environmentVerificationTraceHash: toolSandboxEnvironmentVerificationTraceHash,
        trajectoryTraceHash: toolSandboxTrajectoryTraceHash,
        toolRetrievalTraceHash: toolSandboxRetrievalTraceHash,
        toolRetrievalRecall0to1: 0.82,
        verificationStepCoverage0to1: 0.9,
        minVerificationStepCoverage0to1: 0.75,
        recoveryAttemptCount: 3,
        successfulRecoveryCount: 2,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      toolSandboxRowCount: 1,
      failedToolSandboxRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("Tool Sandbox Rows: 1");
    expect(markdown).toContain("Tool Sandbox Protocols: mcp");
    expect(markdown).toContain("mcp:312");
  });

  test("fails closed when dynamic tool sandbox replay evidence is incomplete", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "complex-mcp-tool-sandbox-v1",
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "complex-mcp-missing-evidence",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            toolSandbox: {
              sandboxId: "synthetic-stateful-office-finance-sandbox",
              protocol: "mcp",
              retrievalMode: "rag",
              statefulSandboxCount: 7,
              toolCount: 312,
              toolRegistryHash: "bad-registry-hash",
              toolDependencyGraphHash: toolSandboxDependencyGraphHash,
              initialStateHash: toolSandboxInitialStateHash,
              seedStateHash: toolSandboxSeedStateHash,
              apiFailureScheduleHash: toolSandboxApiFailureScheduleHash,
              environmentVerificationTraceHash: "bad-verification-hash",
              trajectoryTraceHash: toolSandboxTrajectoryTraceHash,
              toolRetrievalTraceHash: toolSandboxRetrievalTraceHash,
              toolRetrievalRecall0to1: 0.48,
              verificationStepCoverage0to1: 0.5,
              minVerificationStepCoverage0to1: 0.75,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.toolSandboxSummary).toMatchObject({
      rowCount: 1,
      protocols: ["mcp"],
      retrievalModes: ["rag"],
      failedRowIds: ["complex-mcp-missing-evidence"],
      totalToolCount: 312,
    });
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("tool sandbox registry hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("tool sandbox environment verification trace hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("tool sandbox verification coverage below threshold");
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedRowIds: ["complex-mcp-missing-evidence"],
      toolSandboxRowCount: 1,
      failedToolSandboxRowIds: ["complex-mcp-missing-evidence"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "complex-mcp-missing-evidence",
      severity: "critical",
    });
  });

  test("binds custom platform evaluation datasets, RAG config, batch runs, exports, and performance receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "platform-eval-rag-v1",
      sourceRefs: ["https://github.com/justplus/llm-eval"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "platform-rag-eval-001",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            platformEvaluation: {
              platformId: "synthetic-llm-eval-platform",
              datasetFormat: "rag",
              benchmarkSuiteId: "amc-rag-eval-platform-suite",
              datasetVersionHash: platformDatasetVersionHash,
              customTemplateHash: platformCustomTemplateHash,
              judgeConfigHash: platformJudgeConfigHash,
              metricConfigHash: platformMetricConfigHash,
              modelConfigHash: platformModelConfigHash,
              batchRunConfigHash: platformBatchRunConfigHash,
              ragConfigHash: platformRagConfigHash,
              evaluatorTraceHash: platformEvaluatorTraceHash,
              resultExportHash: platformResultExportHash,
              reportArtifactHash: platformReportArtifactHash,
              datasetRowCount: 12,
              evaluatedRowCount: 12,
              concurrency: 4,
              averageLatencyMs: 840,
              throughputQps: 5.5,
              passRate0to1: 0.83,
              judgeScoreMean0to1: 0.79,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.platformEvaluationSummary).toEqual({
      rowCount: 1,
      datasetFormats: ["rag"],
      failedRowIds: [],
      ragRowCount: 1,
      customTemplateRowCount: 1,
      totalEvaluatedRowCount: 12,
      averagePassRate0to1: 0.83,
      averageJudgeScoreMean0to1: 0.79,
      averageLatencyMs: 840,
      averageThroughputQps: 5.5,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "platform-rag-eval-001",
      status: "passed",
      platformEvaluation: {
        platformId: "synthetic-llm-eval-platform",
        datasetFormat: "rag",
        benchmarkSuiteId: "amc-rag-eval-platform-suite",
        datasetVersionHash: platformDatasetVersionHash,
        customTemplateHash: platformCustomTemplateHash,
        judgeConfigHash: platformJudgeConfigHash,
        metricConfigHash: platformMetricConfigHash,
        modelConfigHash: platformModelConfigHash,
        batchRunConfigHash: platformBatchRunConfigHash,
        ragConfigHash: platformRagConfigHash,
        evaluatorTraceHash: platformEvaluatorTraceHash,
        resultExportHash: platformResultExportHash,
        reportArtifactHash: platformReportArtifactHash,
        datasetRowCount: 12,
        evaluatedRowCount: 12,
        concurrency: 4,
        averageLatencyMs: 840,
        throughputQps: 5.5,
        passRate0to1: 0.83,
        judgeScoreMean0to1: 0.79,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      platformEvaluationRowCount: 1,
      failedPlatformEvaluationRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("Platform Evaluation Rows: 1");
    expect(markdown).toContain("Platform Dataset Formats: rag");
    expect(markdown).toContain("rag:12");
  });

  test("fails closed when platform evaluation replay evidence is incomplete", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "platform-eval-custom-v1",
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "platform-custom-missing-evidence",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            platformEvaluation: {
              platformId: "synthetic-llm-eval-platform",
              datasetFormat: "custom",
              datasetVersionHash: "bad-dataset-hash",
              metricConfigHash: platformMetricConfigHash,
              modelConfigHash: "bad-model-config",
              batchRunConfigHash: platformBatchRunConfigHash,
              datasetRowCount: 4,
              evaluatedRowCount: 5,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.platformEvaluationSummary).toMatchObject({
      rowCount: 1,
      datasetFormats: ["custom"],
      failedRowIds: ["platform-custom-missing-evidence"],
      ragRowCount: 0,
      customTemplateRowCount: 0,
      totalEvaluatedRowCount: 5,
    });
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("platform dataset version hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("platform custom template hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("platform model config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("platform evaluator trace hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("platform result export hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("platform report artifact hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("platform evaluated row count exceeds dataset row count");
    expect(result.manifest.rows[0]?.issues).toContain("platform performance metric missing");
    expect(result.manifest.rows[0]?.issues).toContain("platform score metric missing");
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedRowIds: ["platform-custom-missing-evidence"],
      platformEvaluationRowCount: 1,
      failedPlatformEvaluationRowIds: ["platform-custom-missing-evidence"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "platform-custom-missing-evidence",
      severity: "critical",
    });
  });

  test("binds Azure Agent Lab workshop modules, service configs, cloud runs, and evaluator thresholds into replay receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      agentId: "azure-agent-lab-evaluator",
      corpusId: "azure-agent-lab-eval-v1",
      sourceRefs: ["https://github.com/Azure/agent-innovator-lab"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "azure-agent-lab-eval-design-001",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            task: "Replay a small Azure Agent Lab evaluation-design RAG scenario with fixed service configuration.",
            azureAgentLab: {
              labId: "agent-innovator-lab",
              moduleId: "2_eval-design-ptn",
              workshopGuideHash: azureWorkshopGuideHash,
              notebookHash: azureNotebookHash,
              designPattern: "evaluation_design_pattern",
              serviceRefs: [
                "azure_openai",
                "azure_ai_search",
                "azure_ai_foundry",
                "storage_account",
                "agent_framework",
              ],
              azureServiceConfigHashes: [azureServiceConfigHashA, azureServiceConfigHashB],
              aiProjectConfigHash: azureAiProjectConfigHash,
              searchIndexConfigHash: azureSearchIndexConfigHash,
              ragCorpusHash: azureRagCorpusHash,
              toolConnectorConfigHash: azureToolConnectorConfigHash,
              evaluatorConfigHash: azureEvaluatorConfigHash,
              customEvaluatorHash: azureCustomEvaluatorHash,
              promptOptimizationTraceHash: azurePromptOptimizationTraceHash,
              cloudRunId: "azure-ai-foundry-eval-run-2026-06-13-001",
              cloudRunArtifactHash: azureCloudRunArtifactHash,
              credentialScopeHash: azureCredentialScopeHash,
              managedIdentityRoleHash: azureManagedIdentityRoleHash,
              replayCommandHash: azureReplayCommandHash,
              deterministicSeed: 410,
              evaluatedScenarioCount: 6,
              minEvaluatedScenarioCount: 3,
              evaluationScore0to1: 0.84,
              minEvaluationScore0to1: 0.75,
              ragGroundedness0to1: 0.88,
              minRagGroundedness0to1: 0.8,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.azureAgentLabSummary).toEqual({
      rowCount: 1,
      moduleIds: ["2_eval-design-ptn"],
      designPatterns: ["evaluation_design_pattern"],
      serviceRefs: ["azure_openai", "azure_ai_search", "azure_ai_foundry", "storage_account", "agent_framework"],
      failedRowIds: [],
      cloudRunRowCount: 1,
      customEvaluatorRowCount: 1,
      totalEvaluatedScenarioCount: 6,
      averageEvaluationScore0to1: 0.84,
      averageRagGroundedness0to1: 0.88,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "azure-agent-lab-eval-design-001",
      status: "passed",
      azureAgentLab: {
        labId: "agent-innovator-lab",
        moduleId: "2_eval-design-ptn",
        workshopGuideHash: azureWorkshopGuideHash,
        notebookHash: azureNotebookHash,
        designPattern: "evaluation_design_pattern",
        serviceRefs: ["azure_openai", "azure_ai_search", "azure_ai_foundry", "storage_account", "agent_framework"],
        azureServiceConfigHashes: [azureServiceConfigHashA, azureServiceConfigHashB],
        aiProjectConfigHash: azureAiProjectConfigHash,
        searchIndexConfigHash: azureSearchIndexConfigHash,
        ragCorpusHash: azureRagCorpusHash,
        toolConnectorConfigHash: azureToolConnectorConfigHash,
        evaluatorConfigHash: azureEvaluatorConfigHash,
        customEvaluatorHash: azureCustomEvaluatorHash,
        cloudRunId: "azure-ai-foundry-eval-run-2026-06-13-001",
        cloudRunArtifactHash: azureCloudRunArtifactHash,
        deterministicSeed: 410,
        evaluatedScenarioCount: 6,
        evaluationScore0to1: 0.84,
        ragGroundedness0to1: 0.88,
      },
    });
    expect(result.manifest.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      failClosed: false,
      azureAgentLabRowCount: 1,
      failedAzureAgentLabRowIds: [],
    });

    const verification = verifyReplayBenchmarkCorpusReceipt(result.manifest, result.ciReceipt);
    expect(verification.valid).toBe(true);

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("Azure Agent Lab Rows: 1");
    expect(markdown).toContain("Azure Agent Lab Modules: 2_eval-design-ptn");
    expect(markdown).toContain("2_eval-design-ptn:evaluation_design_pattern:0.84");
  });

  test("fails closed when Azure Agent Lab replay rows lack cloud, identity, evaluator, command, or threshold evidence", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      agentId: "azure-agent-lab-evaluator",
      corpusId: "azure-agent-lab-eval-v1",
      sourceRefs: ["https://github.com/Azure/agent-innovator-lab"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "azure-agent-lab-missing-replay",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            azureAgentLab: {
              labId: "agent-innovator-lab",
              moduleId: "2_eval-design-ptn",
              workshopGuideHash: azureWorkshopGuideHash,
              notebookHash: azureNotebookHash,
              designPattern: "evaluation_design_pattern",
              serviceRefs: ["azure_openai", "azure_ai_search", "azure_ai_foundry"],
              azureServiceConfigHashes: [azureServiceConfigHashA, "bad-service-config"],
              aiProjectConfigHash: azureAiProjectConfigHash,
              searchIndexConfigHash: azureSearchIndexConfigHash,
              ragCorpusHash: azureRagCorpusHash,
              toolConnectorConfigHash: azureToolConnectorConfigHash,
              evaluatorConfigHash: azureEvaluatorConfigHash,
              cloudRunId: "azure-ai-foundry-eval-run-2026-06-13-002",
              cloudRunArtifactHash: "bad-cloud-artifact",
              credentialScopeHash: azureCredentialScopeHash,
              managedIdentityRoleHash: azureManagedIdentityRoleHash,
              deterministicSeed: 410,
              evaluatedScenarioCount: 2,
              minEvaluatedScenarioCount: 3,
              evaluationScore0to1: 0.64,
              minEvaluationScore0to1: 0.75,
              ragGroundedness0to1: 0.71,
              minRagGroundedness0to1: 0.8,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.azureAgentLabSummary).toMatchObject({
      rowCount: 1,
      moduleIds: ["2_eval-design-ptn"],
      designPatterns: ["evaluation_design_pattern"],
      failedRowIds: ["azure-agent-lab-missing-replay"],
      cloudRunRowCount: 1,
      customEvaluatorRowCount: 0,
      totalEvaluatedScenarioCount: 2,
      averageEvaluationScore0to1: 0.64,
      averageRagGroundedness0to1: 0.71,
    });
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("azure agent lab cloud run artifact hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("azure agent lab replay command hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("azure agent lab service config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("azure agent lab custom evaluator hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("azure agent lab scenario count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("azure agent lab evaluation score below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("azure agent lab rag groundedness below threshold");
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedRowIds: ["azure-agent-lab-missing-replay"],
      azureAgentLabRowCount: 1,
      failedAzureAgentLabRowIds: ["azure-agent-lab-missing-replay"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "azure-agent-lab-missing-replay",
      severity: "critical",
    });
  });

  test("binds ClawEnvKit generated environments, harness tiers, mock services, audit logs, and safety gates into replay receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      agentId: "clawenvkit-harness-eval",
      corpusId: "clawenvkit-auto-claw-eval-mini",
      sourceRefs: ["https://github.com/xirui-li/ClawEnvKit"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "clawenvkit-mcp-claudecode-001",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            task: "Replay a synthetic ClawEnvKit-style generated task through an MCP harness with mock services.",
            clawEnvKit: {
              toolkitVersion: "0.3.0",
              datasetId: "auto-claweval-mini-synthetic",
              datasetVersionHash: clawDatasetVersionHash,
              taskYamlHash: clawTaskYamlHash,
              taskConfigSchemaHash: clawTaskConfigSchemaHash,
              generationPromptHash: clawGenerationPromptHash,
              generatedFixtureManifestHash: clawFixtureManifestHash,
              mockServiceCatalogHash: clawServiceCatalogHash,
              mockServiceStateHash: clawServiceStateHash,
              auditLogHash: clawAuditLogHash,
              trajectoryCaptureHash: clawTrajectoryCaptureHash,
              verificationConfigHash: clawVerificationConfigHash,
              scoringRubricHash: clawScoringRubricHash,
              safetyCheckConfigHash: clawSafetyCheckConfigHash,
              dockerImageHash: clawDockerImageHash,
              harnessImageRef: "ghcr.io/synthetic/clawenvkit-claudecode:v0.3.0",
              harnessTier: "mcp",
              harnessId: "claudecode",
              agentAdapterHash: clawAgentAdapterHash,
              mcpServerConfigHash: clawMcpServerConfigHash,
              replayCommandHash: clawReplayCommandHash,
              deterministicSeed: 410,
              serviceRefs: ["gmail", "calendar", "todo"],
              serviceCount: 20,
              minServiceCount: 3,
              taskCount: 8,
              minTaskCount: 5,
              checkTypeCount: 17,
              minCheckTypeCount: 15,
              safetyGatePassed: true,
              finalScore0to1: 0.86,
              minFinalScore0to1: 0.75,
              completionScore0to1: 0.9,
              robustnessScore0to1: 0.78,
              safetyScore0to1: 1,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.clawEnvKitSummary).toEqual({
      rowCount: 1,
      datasetIds: ["auto-claweval-mini-synthetic"],
      harnessIds: ["claudecode"],
      harnessTiers: ["mcp"],
      serviceRefs: ["gmail", "calendar", "todo"],
      failedRowIds: [],
      dockerRowCount: 1,
      mcpRowCount: 1,
      skillShellRowCount: 0,
      totalTaskCount: 8,
      totalServiceCount: 20,
      safetyPassedRowCount: 1,
      averageFinalScore0to1: 0.86,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "clawenvkit-mcp-claudecode-001",
      status: "passed",
      clawEnvKit: {
        toolkitVersion: "0.3.0",
        datasetId: "auto-claweval-mini-synthetic",
        datasetVersionHash: clawDatasetVersionHash,
        taskYamlHash: clawTaskYamlHash,
        mockServiceCatalogHash: clawServiceCatalogHash,
        mockServiceStateHash: clawServiceStateHash,
        auditLogHash: clawAuditLogHash,
        trajectoryCaptureHash: clawTrajectoryCaptureHash,
        harnessTier: "mcp",
        harnessId: "claudecode",
        mcpServerConfigHash: clawMcpServerConfigHash,
        replayCommandHash: clawReplayCommandHash,
        deterministicSeed: 410,
        serviceRefs: ["gmail", "calendar", "todo"],
        finalScore0to1: 0.86,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      failClosed: false,
      clawEnvKitRowCount: 1,
      failedClawEnvKitRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("ClawEnvKit Rows: 1");
    expect(markdown).toContain("ClawEnvKit Harnesses: claudecode");
    expect(markdown).toContain("claudecode:mcp:0.86");
  });

  test("fails closed when ClawEnvKit replay rows lack generated environment, mock-service, harness, audit, or safety proof", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      agentId: "clawenvkit-harness-eval",
      corpusId: "clawenvkit-auto-claw-eval-mini",
      sourceRefs: ["https://github.com/xirui-li/ClawEnvKit"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "clawenvkit-missing-environment-proof",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            clawEnvKit: {
              toolkitVersion: "0.3.0",
              datasetId: "auto-claweval-mini-synthetic",
              datasetVersionHash: clawDatasetVersionHash,
              taskYamlHash: "not-a-sha",
              taskConfigSchemaHash: clawTaskConfigSchemaHash,
              generationPromptHash: clawGenerationPromptHash,
              generatedFixtureManifestHash: clawFixtureManifestHash,
              mockServiceCatalogHash: clawServiceCatalogHash,
              verificationConfigHash: clawVerificationConfigHash,
              scoringRubricHash: clawScoringRubricHash,
              safetyCheckConfigHash: clawSafetyCheckConfigHash,
              dockerImageHash: "bad-docker-hash",
              harnessTier: "mcp",
              harnessId: "claudecode",
              agentAdapterHash: clawAgentAdapterHash,
              replayCommandHash: clawReplayCommandHash,
              deterministicSeed: 410,
              serviceRefs: ["gmail"],
              serviceCount: 1,
              minServiceCount: 3,
              taskCount: 2,
              minTaskCount: 5,
              checkTypeCount: 10,
              minCheckTypeCount: 15,
              safetyGatePassed: false,
              finalScore0to1: 0.6,
              minFinalScore0to1: 0.75,
              completionScore0to1: 0.7,
              robustnessScore0to1: 0.5,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.clawEnvKitSummary).toMatchObject({
      rowCount: 1,
      datasetIds: ["auto-claweval-mini-synthetic"],
      harnessIds: ["claudecode"],
      harnessTiers: ["mcp"],
      serviceRefs: ["gmail"],
      failedRowIds: ["clawenvkit-missing-environment-proof"],
      dockerRowCount: 0,
      mcpRowCount: 1,
      safetyPassedRowCount: 0,
      averageFinalScore0to1: 0.6,
    });
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("clawenvkit task yaml hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("clawenvkit mock service state hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("clawenvkit audit log hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("clawenvkit trajectory capture hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("clawenvkit docker image hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("clawenvkit harness image ref missing");
    expect(result.manifest.rows[0]?.issues).toContain("clawenvkit mcp server config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("clawenvkit service count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("clawenvkit task count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("clawenvkit check type count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("clawenvkit safety gate failed");
    expect(result.manifest.rows[0]?.issues).toContain("clawenvkit final score below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("clawenvkit component score missing");
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedRowIds: ["clawenvkit-missing-environment-proof"],
      clawEnvKitRowCount: 1,
      failedClawEnvKitRowIds: ["clawenvkit-missing-environment-proof"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "clawenvkit-missing-environment-proof",
      severity: "critical",
    });
  });

  test("binds DeepResearch progressive-search workflows, cross-evaluation, local configs, and final reports into replay receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      agentId: "deepresearch-eval-agent",
      corpusId: "deepresearch-progressive-search-mini",
      sourceRefs: ["https://github.com/iflytek/DeepResearch"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "deepresearch-progressive-market-landscape-001",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            task: "Replay a lightweight DeepResearch-style progressive search task for a synthetic market landscape.",
            deepResearch: {
              frameworkVersion: "0.1.0",
              researchTaskId: "synthetic-market-landscape",
              workflowConfigHash: deepResearchWorkflowConfigHash,
              llmConfigHash: deepResearchLlmConfigHash,
              searchConfigHash: deepResearchSearchConfigHash,
              knowledgeBaseManifestHash: deepResearchKnowledgeBaseManifestHash,
              toolDescriptionHash: deepResearchToolDescriptionHash,
              interactionHistoryHash: deepResearchInteractionHistoryHash,
              taskPlanHash: deepResearchTaskPlanHash,
              progressiveSearchTraceHash: deepResearchProgressiveSearchTraceHash,
              toolCallTraceHash: deepResearchToolCallTraceHash,
              knowledgeExtractionHash: deepResearchKnowledgeExtractionHash,
              crossEvaluationTraceHash: deepResearchCrossEvaluationTraceHash,
              iterationLogHash: deepResearchIterationLogHash,
              finalReportHash: deepResearchFinalReportHash,
              reportOutlineHash: deepResearchReportOutlineHash,
              customWorkflowHash: deepResearchCustomWorkflowHash,
              localRuntimeConfigHash: deepResearchLocalRuntimeConfigHash,
              poetryLockHash: deepResearchPoetryLockHash,
              plannerModelId: "reasoner-small-local",
              executorModelId: "executor-fast-local",
              searchProvider: "jina",
              replayCommandHash: deepResearchReplayCommandHash,
              deterministicSeed: 412,
              searchIterationCount: 3,
              minSearchIterationCount: 2,
              sourceCount: 8,
              minSourceCount: 5,
              crossEvaluationPassRate0to1: 0.92,
              minCrossEvaluationPassRate0to1: 0.85,
              hallucinationCheckPassRate0to1: 0.95,
              minHallucinationCheckPassRate0to1: 0.9,
              finalReportScore0to1: 0.88,
              minFinalReportScore0to1: 0.8,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.deepResearchSummary).toEqual({
      rowCount: 1,
      frameworkVersions: ["0.1.0"],
      researchTaskIds: ["synthetic-market-landscape"],
      searchProviders: ["jina"],
      failedRowIds: [],
      totalSearchIterationCount: 3,
      totalSourceCount: 8,
      customWorkflowRowCount: 1,
      averageFinalReportScore0to1: 0.88,
      averageCrossEvaluationPassRate0to1: 0.92,
      averageHallucinationCheckPassRate0to1: 0.95,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "deepresearch-progressive-market-landscape-001",
      status: "passed",
      deepResearch: {
        frameworkVersion: "0.1.0",
        researchTaskId: "synthetic-market-landscape",
        workflowConfigHash: deepResearchWorkflowConfigHash,
        llmConfigHash: deepResearchLlmConfigHash,
        searchConfigHash: deepResearchSearchConfigHash,
        taskPlanHash: deepResearchTaskPlanHash,
        progressiveSearchTraceHash: deepResearchProgressiveSearchTraceHash,
        toolCallTraceHash: deepResearchToolCallTraceHash,
        crossEvaluationTraceHash: deepResearchCrossEvaluationTraceHash,
        finalReportHash: deepResearchFinalReportHash,
        searchProvider: "jina",
        replayCommandHash: deepResearchReplayCommandHash,
        deterministicSeed: 412,
        searchIterationCount: 3,
        sourceCount: 8,
        crossEvaluationPassRate0to1: 0.92,
        hallucinationCheckPassRate0to1: 0.95,
        finalReportScore0to1: 0.88,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      failClosed: false,
      deepResearchRowCount: 1,
      failedDeepResearchRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("DeepResearch Rows: 1");
    expect(markdown).toContain("DeepResearch Tasks: synthetic-market-landscape");
    expect(markdown).toContain("synthetic-market-landscape:jina:0.88");
  });

  test("fails closed when DeepResearch replay rows lack progressive-search, cross-evaluation, local runtime, or report proof", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      agentId: "deepresearch-eval-agent",
      corpusId: "deepresearch-progressive-search-mini",
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "deepresearch-missing-progressive-search-proof",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            deepResearch: {
              frameworkVersion: "0.1.0",
              researchTaskId: "synthetic-market-landscape",
              workflowConfigHash: "not-a-sha",
              llmConfigHash: deepResearchLlmConfigHash,
              searchConfigHash: deepResearchSearchConfigHash,
              taskPlanHash: deepResearchTaskPlanHash,
              progressiveSearchTraceHash: deepResearchProgressiveSearchTraceHash,
              toolCallTraceHash: "bad-tool-call-trace",
              knowledgeExtractionHash: deepResearchKnowledgeExtractionHash,
              crossEvaluationTraceHash: "bad-cross-eval-trace",
              iterationLogHash: deepResearchIterationLogHash,
              finalReportHash: "bad-final-report",
              reportOutlineHash: deepResearchReportOutlineHash,
              localRuntimeConfigHash: "bad-local-runtime",
              poetryLockHash: deepResearchPoetryLockHash,
              plannerModelId: "reasoner-small-local",
              executorModelId: "executor-fast-local",
              searchProvider: "tavily",
              deterministicSeed: 412,
              searchIterationCount: 1,
              minSearchIterationCount: 2,
              sourceCount: 2,
              minSourceCount: 5,
              crossEvaluationPassRate0to1: 0.7,
              minCrossEvaluationPassRate0to1: 0.85,
              hallucinationCheckPassRate0to1: 0.76,
              minHallucinationCheckPassRate0to1: 0.9,
              finalReportScore0to1: 0.62,
              minFinalReportScore0to1: 0.8,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.deepResearchSummary).toMatchObject({
      rowCount: 1,
      researchTaskIds: ["synthetic-market-landscape"],
      searchProviders: ["tavily"],
      failedRowIds: ["deepresearch-missing-progressive-search-proof"],
      totalSearchIterationCount: 1,
      totalSourceCount: 2,
      averageFinalReportScore0to1: 0.62,
      averageCrossEvaluationPassRate0to1: 0.7,
      averageHallucinationCheckPassRate0to1: 0.76,
    });
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("deep research workflow config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("deep research knowledge base manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("deep research tool description hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("deep research interaction history hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("deep research tool-call trace hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("deep research cross-evaluation trace hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("deep research final report hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("deep research local runtime config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("deep research replay command hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("deep research search iteration count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("deep research source count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("deep research cross-evaluation pass rate below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("deep research hallucination check pass rate below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("deep research final report score below threshold");
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedRowIds: ["deepresearch-missing-progressive-search-proof"],
      deepResearchRowCount: 1,
      failedDeepResearchRowIds: ["deepresearch-missing-progressive-search-proof"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "deepresearch-missing-progressive-search-proof",
      severity: "critical",
    });
  });

  test("binds web-search benchmark datasets, source links, traces, JSONL results, and metrics into replay receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "web-search-benchmark-v1",
      sourceRefs: [
        "https://github.com/chuanruihu/Level-Navi-Agent-Search",
        "https://arxiv.org/abs/2502.15690",
      ],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "level-navi-web24-style-001",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            webSearchEvaluation: {
              benchmarkId: "level-navi-web-search-style",
              datasetId: "synthetic-web24-source-linked",
              datasetVersion: "2024.12",
              datasetSpecHash: webSearchDatasetSpecHash,
              sourceLinkManifestHash: webSearchSourceLinkManifestHash,
              searchEngineConfigHash: webSearchEngineConfigHash,
              agentFrameworkConfigHash: webSearchAgentFrameworkConfigHash,
              modelConfigHash: webSearchModelConfigHash,
              evaluatorConfigHash: webSearchEvaluatorConfigHash,
              benchmarkRunConfigHash: webSearchBenchmarkRunConfigHash,
              resultJsonlHash: webSearchResultJsonlHash,
              metricsReportHash: webSearchMetricsReportHash,
              navigationTraceHash: webSearchNavigationTraceHash,
              searchOperationTraceHash: webSearchOperationTraceHash,
              answerCitationTraceHash: webSearchCitationTraceHash,
              sampleCount: 481,
              domains: ["finance", "gaming", "sports", "movies", "events"],
              questionTypes: ["simple", "conditional", "comparative", "multi_hop"],
              domainCoverage0to1: 1,
              minDomainCoverage0to1: 0.8,
              questionTypeCoverage0to1: 1,
              minQuestionTypeCoverage0to1: 0.8,
              sourceLinkCoverage0to1: 0.98,
              minSourceLinkCoverage0to1: 0.9,
              finalScore0to1: 0.66,
              contentCoverage0to1: 0.72,
              relevance0to1: 0.84,
              answerSimilarity0to1: 0.61,
              citationQuality0to1: 0.81,
              passRate0to1: 0.99,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.webSearchEvaluationSummary).toEqual({
      rowCount: 1,
      domains: ["finance", "gaming", "sports", "movies", "events"],
      questionTypes: ["simple", "conditional", "comparative", "multi_hop"],
      failedRowIds: [],
      totalSampleCount: 481,
      sourceLinkedRowCount: 1,
      averageFinalScore0to1: 0.66,
      averagePassRate0to1: 0.99,
      averageSourceLinkCoverage0to1: 0.98,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "level-navi-web24-style-001",
      status: "passed",
      webSearchEvaluation: {
        benchmarkId: "level-navi-web-search-style",
        datasetId: "synthetic-web24-source-linked",
        datasetVersion: "2024.12",
        datasetSpecHash: webSearchDatasetSpecHash,
        sourceLinkManifestHash: webSearchSourceLinkManifestHash,
        searchEngineConfigHash: webSearchEngineConfigHash,
        agentFrameworkConfigHash: webSearchAgentFrameworkConfigHash,
        modelConfigHash: webSearchModelConfigHash,
        evaluatorConfigHash: webSearchEvaluatorConfigHash,
        benchmarkRunConfigHash: webSearchBenchmarkRunConfigHash,
        resultJsonlHash: webSearchResultJsonlHash,
        metricsReportHash: webSearchMetricsReportHash,
        navigationTraceHash: webSearchNavigationTraceHash,
        searchOperationTraceHash: webSearchOperationTraceHash,
        answerCitationTraceHash: webSearchCitationTraceHash,
        sampleCount: 481,
        domains: ["finance", "gaming", "sports", "movies", "events"],
        questionTypes: ["simple", "conditional", "comparative", "multi_hop"],
        sourceLinkCoverage0to1: 0.98,
        finalScore0to1: 0.66,
        passRate0to1: 0.99,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      webSearchEvaluationRowCount: 1,
      failedWebSearchEvaluationRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("Web Search Evaluation Rows: 1");
    expect(markdown).toContain("Web Search Domains: finance, gaming, sports, movies, events");
    expect(markdown).toContain("synthetic-web24-source-linked:0.66");
  });

  test("fails closed when web-search benchmark replay evidence is incomplete", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "web-search-benchmark-v1",
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "level-navi-web24-missing-evidence",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            webSearchEvaluation: {
              benchmarkId: "level-navi-web-search-style",
              datasetId: "synthetic-web24-source-linked",
              datasetSpecHash: "not-a-sha",
              sourceLinkManifestHash: webSearchSourceLinkManifestHash,
              searchEngineConfigHash: "bad-engine-config",
              agentFrameworkConfigHash: webSearchAgentFrameworkConfigHash,
              modelConfigHash: webSearchModelConfigHash,
              evaluatorConfigHash: webSearchEvaluatorConfigHash,
              benchmarkRunConfigHash: webSearchBenchmarkRunConfigHash,
              resultJsonlHash: "bad-jsonl-hash",
              metricsReportHash: webSearchMetricsReportHash,
              navigationTraceHash: webSearchNavigationTraceHash,
              searchOperationTraceHash: webSearchOperationTraceHash,
              sampleCount: 0,
              domains: ["finance"],
              questionTypes: ["simple"],
              domainCoverage0to1: 0.2,
              minDomainCoverage0to1: 0.8,
              questionTypeCoverage0to1: 0.25,
              minQuestionTypeCoverage0to1: 0.8,
              sourceLinkCoverage0to1: 0.4,
              minSourceLinkCoverage0to1: 0.9,
              relevance0to1: 0.84,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.webSearchEvaluationSummary).toMatchObject({
      rowCount: 1,
      domains: ["finance"],
      questionTypes: ["simple"],
      failedRowIds: ["level-navi-web24-missing-evidence"],
      totalSampleCount: 0,
      sourceLinkedRowCount: 1,
      averageSourceLinkCoverage0to1: 0.4,
    });
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("web search dataset id/version missing");
    expect(result.manifest.rows[0]?.issues).toContain("web search dataset spec hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("web search engine config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("web search result jsonl hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("web search citation trace hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("web search sample count missing");
    expect(result.manifest.rows[0]?.issues).toContain("web search domain coverage below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("web search question-type coverage below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("web search source-link coverage below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("web search final score missing");
    expect(result.manifest.rows[0]?.issues).toContain("web search component metric missing");
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedRowIds: ["level-navi-web24-missing-evidence"],
      webSearchEvaluationRowCount: 1,
      failedWebSearchEvaluationRowIds: ["level-navi-web24-missing-evidence"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "level-navi-web24-missing-evidence",
      severity: "critical",
    });
  });

  test("binds compiled-binary audit tasks, container/toolchain hashes, traces, and decisions into replay receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "binary-audit-backdoor-v1",
      sourceRefs: ["https://github.com/QuesmaOrg/BinaryAudit"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "binary-audit-backdoor-001",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            binaryAudit: {
              taskId: "synthetic-compiled-backdoor-001",
              targetApplication: "synthetic-web-server",
              category: "backdoor_detection",
              architecture: "x86_64-linux",
              binaryArtifactHash: binaryAuditArtifactHash,
              binaryMetadataHash: binaryAuditMetadataHash,
              taskConfigHash: binaryAuditTaskConfigHash,
              containerImageHash: binaryAuditContainerImageHash,
              reverseEngineeringToolchainHash: binaryAuditToolchainHash,
              analysisTraceHash: binaryAuditAnalysisTraceHash,
              findingReportHash: binaryAuditFindingReportHash,
              groundTruthHash: binaryAuditGroundTruthHash,
              expectedDecision: "backdoor_found",
              actualDecision: "backdoor_found",
              strippedBinary: true,
              multiBinary: false,
              attemptCount: 2,
              successRate0to1: 0.5,
              falsePositiveRate0to1: 0,
              maxFalsePositiveRate0to1: 0.05,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.binaryAuditSummary).toEqual({
      rowCount: 1,
      categories: ["backdoor_detection"],
      targetApplications: ["synthetic-web-server"],
      failedRowIds: [],
      cleanNegativeRowCount: 0,
      backdoorRowCount: 1,
      timebombRowCount: 0,
      averageSuccessRate0to1: 0.5,
      maxFalsePositiveRate0to1: 0,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "binary-audit-backdoor-001",
      status: "passed",
      binaryAudit: {
        taskId: "synthetic-compiled-backdoor-001",
        targetApplication: "synthetic-web-server",
        category: "backdoor_detection",
        architecture: "x86_64-linux",
        binaryArtifactHash: binaryAuditArtifactHash,
        binaryMetadataHash: binaryAuditMetadataHash,
        taskConfigHash: binaryAuditTaskConfigHash,
        containerImageHash: binaryAuditContainerImageHash,
        reverseEngineeringToolchainHash: binaryAuditToolchainHash,
        analysisTraceHash: binaryAuditAnalysisTraceHash,
        findingReportHash: binaryAuditFindingReportHash,
        groundTruthHash: binaryAuditGroundTruthHash,
        expectedDecision: "backdoor_found",
        actualDecision: "backdoor_found",
        strippedBinary: true,
        multiBinary: false,
        attemptCount: 2,
        successRate0to1: 0.5,
        falsePositiveRate0to1: 0,
        maxFalsePositiveRate0to1: 0.05,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      binaryAuditRowCount: 1,
      failedBinaryAuditRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("Binary Audit Rows: 1");
    expect(markdown).toContain("Binary Audit Categories: backdoor_detection");
    expect(markdown).toContain("backdoor_detection:backdoor_found");
  });

  test("fails closed when binary audit replay evidence is incomplete or decision is wrong", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "binary-audit-clean-negative-v1",
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "binary-audit-clean-false-positive",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            binaryAudit: {
              taskId: "synthetic-clean-negative-001",
              targetApplication: "synthetic-cli-tool",
              category: "clean_negative",
              architecture: "x86_64-linux",
              binaryArtifactHash: "bad-binary-hash",
              binaryMetadataHash: binaryAuditMetadataHash,
              taskConfigHash: binaryAuditTaskConfigHash,
              containerImageHash: binaryAuditContainerImageHash,
              reverseEngineeringToolchainHash: binaryAuditToolchainHash,
              analysisTraceHash: "bad-trace-hash",
              findingReportHash: binaryAuditFindingReportHash,
              expectedDecision: "no_backdoor",
              actualDecision: "backdoor_found",
              strippedBinary: false,
              multiBinary: true,
              attemptCount: 1,
              successRate0to1: 0,
              falsePositiveRate0to1: 0.25,
              maxFalsePositiveRate0to1: 0.05,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.binaryAuditSummary).toMatchObject({
      rowCount: 1,
      categories: ["clean_negative"],
      targetApplications: ["synthetic-cli-tool"],
      failedRowIds: ["binary-audit-clean-false-positive"],
      cleanNegativeRowCount: 1,
      backdoorRowCount: 0,
      maxFalsePositiveRate0to1: 0.25,
    });
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("binary audit binary artifact hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("binary audit analysis trace hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("binary audit ground truth hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("binary audit expected decision not met");
    expect(result.manifest.rows[0]?.issues).toContain("binary audit false positive rate above threshold");
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedRowIds: ["binary-audit-clean-false-positive"],
      binaryAuditRowCount: 1,
      failedBinaryAuditRowIds: ["binary-audit-clean-false-positive"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "binary-audit-clean-false-positive",
      severity: "critical",
    });
  });

  test("binds long-term memory benchmark configs, memory spans, traces, results, and reports into replay receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "ltm-memory-span-v1",
      sourceRefs: ["https://github.com/GoodAI/goodai-ltm-benchmark"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "ltm-memory-span-001",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            longTermMemory: {
              benchmarkId: "synthetic-ltm-benchmark",
              benchmarkVersion: "ltm-v3.5",
              configurationHash: ltmConfigurationHash,
              datasetSpecHash: ltmDatasetSpecHash,
              datasetInterfaceHash: ltmDatasetInterfaceHash,
              modelInterfaceHash: ltmModelInterfaceHash,
              runnerConfigHash: ltmRunnerConfigHash,
              testSpecHash: ltmTestSpecHash,
              conversationTraceHash: ltmConversationTraceHash,
              memoryUpdateTraceHash: ltmMemoryUpdateTraceHash,
              retrievalTraceHash: ltmRetrievalTraceHash,
              resultArtifactHash: ltmResultArtifactHash,
              reportArtifactHash: ltmReportArtifactHash,
              memorySpanTokens: 120000,
              contextLimitTokens: 16000,
              generatedTestCount: 11,
              score0to1: 0.82,
              minScore0to1: 0.7,
              runtimeMinutes: 18.5,
              estimatedCostUsd: 4.25,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.longTermMemorySummary).toEqual({
      rowCount: 1,
      benchmarkVersions: ["ltm-v3.5"],
      failedRowIds: [],
      maxMemorySpanTokens: 120000,
      totalGeneratedTestCount: 11,
      averageScore0to1: 0.82,
      reportArtifactCount: 1,
      realTalkRowCount: 0,
      realTalkTasks: [],
      failedRealTalkRowIds: [],
      maxRealTalkConversationDaySpan: null,
      totalRealTalkQuestionCount: 0,
      averageRealTalkLexicalF1Score0to1: null,
      averageRealTalkGptScore0to1: null,
      averageRealTalkEiCoverage0to1: null,
      cloneMemRowCount: 0,
      cloneMemTraceKinds: [],
      cloneMemTaskCategories: [],
      cloneMemLanguageIds: [],
      failedCloneMemRowIds: [],
      totalCloneMemPersonaCount: 0,
      totalCloneMemQuestionCount: 0,
      maxCloneMemContextSpanMonths: null,
      averageCloneMemEvidenceGrounding0to1: null,
      averageCloneMemReplayPassRate0to1: null,
      memEvalRowCount: 0,
      memEvalBenchmarkIds: [],
      memEvalMemorySystems: [],
      memEvalMetricKinds: [],
      failedMemEvalRowIds: [],
      totalMemEvalQuestionCount: 0,
      totalMemEvalConversationCount: 0,
      averageMemEvalTokenF1_0to1: null,
      averageMemEvalJudgeScore0to1: null,
      averageMemEvalReplayPassRate0to1: null,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "ltm-memory-span-001",
      status: "passed",
      longTermMemory: {
        benchmarkId: "synthetic-ltm-benchmark",
        benchmarkVersion: "ltm-v3.5",
        configurationHash: ltmConfigurationHash,
        datasetSpecHash: ltmDatasetSpecHash,
        datasetInterfaceHash: ltmDatasetInterfaceHash,
        modelInterfaceHash: ltmModelInterfaceHash,
        runnerConfigHash: ltmRunnerConfigHash,
        testSpecHash: ltmTestSpecHash,
        conversationTraceHash: ltmConversationTraceHash,
        memoryUpdateTraceHash: ltmMemoryUpdateTraceHash,
        retrievalTraceHash: ltmRetrievalTraceHash,
        resultArtifactHash: ltmResultArtifactHash,
        reportArtifactHash: ltmReportArtifactHash,
        memorySpanTokens: 120000,
        contextLimitTokens: 16000,
        generatedTestCount: 11,
        score0to1: 0.82,
        minScore0to1: 0.7,
        runtimeMinutes: 18.5,
        estimatedCostUsd: 4.25,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      longTermMemoryRowCount: 1,
      failedLongTermMemoryRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("Long-Term Memory Rows: 1");
    expect(markdown).toContain("Long-Term Memory Versions: ltm-v3.5");
    expect(markdown).toContain("ltm-v3.5:120000");
  });

  test("fails closed when long-term memory replay evidence is incomplete or below threshold", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "ltm-memory-span-v1",
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "ltm-memory-span-missing-evidence",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            longTermMemory: {
              benchmarkId: "synthetic-ltm-benchmark",
              benchmarkVersion: "ltm-v3.5",
              configurationHash: "bad-config-hash",
              datasetSpecHash: ltmDatasetSpecHash,
              datasetInterfaceHash: ltmDatasetInterfaceHash,
              modelInterfaceHash: ltmModelInterfaceHash,
              runnerConfigHash: ltmRunnerConfigHash,
              testSpecHash: ltmTestSpecHash,
              conversationTraceHash: ltmConversationTraceHash,
              resultArtifactHash: ltmResultArtifactHash,
              reportArtifactHash: "bad-report-hash",
              memorySpanTokens: 500000,
              contextLimitTokens: 8000,
              generatedTestCount: 10,
              score0to1: 0.42,
              minScore0to1: 0.7,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.longTermMemorySummary).toMatchObject({
      rowCount: 1,
      benchmarkVersions: ["ltm-v3.5"],
      failedRowIds: ["ltm-memory-span-missing-evidence"],
      maxMemorySpanTokens: 500000,
      totalGeneratedTestCount: 10,
      averageScore0to1: 0.42,
      reportArtifactCount: 0,
    });
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("long-term memory configuration hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("long-term memory update trace hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("long-term memory retrieval trace hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("long-term memory report artifact hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("long-term memory score below threshold");
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedRowIds: ["ltm-memory-span-missing-evidence"],
      longTermMemoryRowCount: 1,
      failedLongTermMemoryRowIds: ["ltm-memory-span-missing-evidence"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "ltm-memory-span-missing-evidence",
      severity: "critical",
    });
  });

  test("binds REALTALK-style real conversation memory-probing provenance and evaluator evidence", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "realtalk-memory-probing-v1",
      sourceRefs: [
        "https://github.com/danny911kr/REALTALK",
        "https://arxiv.org/abs/2502.13270",
      ],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "realtalk-memory-probing-001",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            longTermMemory: {
              benchmarkId: "realtalk-long-conversation",
              benchmarkVersion: "2025.02.18",
              configurationHash: ltmConfigurationHash,
              datasetSpecHash: ltmDatasetSpecHash,
              datasetInterfaceHash: ltmDatasetInterfaceHash,
              modelInterfaceHash: ltmModelInterfaceHash,
              runnerConfigHash: ltmRunnerConfigHash,
              testSpecHash: ltmTestSpecHash,
              conversationTraceHash: ltmConversationTraceHash,
              memoryUpdateTraceHash: ltmMemoryUpdateTraceHash,
              retrievalTraceHash: ltmRetrievalTraceHash,
              resultArtifactHash: ltmResultArtifactHash,
              reportArtifactHash: ltmReportArtifactHash,
              memorySpanTokens: 210000,
              contextLimitTokens: 32000,
              generatedTestCount: 42,
              score0to1: 0.81,
              minScore0to1: 0.7,
              runtimeMinutes: 9.75,
              estimatedCostUsd: 2.4,
              realTalkTask: "memory_probing",
              realTalkPaperRefHash,
              realTalkDatasetLicenseRefHash,
              realTalkRawExportManifestHash,
              realTalkPreprocessedConversationHash,
              realTalkParticipantManifestHash,
              realTalkSpeakerManifestHash,
              realTalkTemporalSplitHash,
              realTalkPrivacyConsentHash,
              realTalkLocomoComparisonHash,
              realTalkQuestionAnswerManifestHash,
              realTalkOpenAiBoundaryHash,
              realTalkEvaluatorConfigHash,
              realTalkGptScoreArtifactHash,
              realTalkLexicalF1ArtifactHash,
              realTalkConversationDaySpan: 21,
              minRealTalkConversationDaySpan: 21,
              realTalkParticipantCount: 12,
              minRealTalkParticipantCount: 1,
              realTalkQuestionCount: 64,
              minRealTalkQuestionCount: 32,
              realTalkLexicalF1Score0to1: 0.74,
              minRealTalkLexicalF1Score0to1: 0.65,
              realTalkGptScore0to1: 0.82,
              minRealTalkGptScore0to1: 0.75,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.longTermMemorySummary).toEqual({
      rowCount: 1,
      benchmarkVersions: ["2025.02.18"],
      failedRowIds: [],
      maxMemorySpanTokens: 210000,
      totalGeneratedTestCount: 42,
      averageScore0to1: 0.81,
      reportArtifactCount: 1,
      realTalkRowCount: 1,
      realTalkTasks: ["memory_probing"],
      failedRealTalkRowIds: [],
      maxRealTalkConversationDaySpan: 21,
      totalRealTalkQuestionCount: 64,
      averageRealTalkLexicalF1Score0to1: 0.74,
      averageRealTalkGptScore0to1: 0.82,
      averageRealTalkEiCoverage0to1: null,
      cloneMemRowCount: 0,
      cloneMemTraceKinds: [],
      cloneMemTaskCategories: [],
      cloneMemLanguageIds: [],
      failedCloneMemRowIds: [],
      totalCloneMemPersonaCount: 0,
      totalCloneMemQuestionCount: 0,
      maxCloneMemContextSpanMonths: null,
      averageCloneMemEvidenceGrounding0to1: null,
      averageCloneMemReplayPassRate0to1: null,
      memEvalRowCount: 0,
      memEvalBenchmarkIds: [],
      memEvalMemorySystems: [],
      memEvalMetricKinds: [],
      failedMemEvalRowIds: [],
      totalMemEvalQuestionCount: 0,
      totalMemEvalConversationCount: 0,
      averageMemEvalTokenF1_0to1: null,
      averageMemEvalJudgeScore0to1: null,
      averageMemEvalReplayPassRate0to1: null,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "realtalk-memory-probing-001",
      status: "passed",
      longTermMemory: {
        benchmarkId: "realtalk-long-conversation",
        benchmarkVersion: "2025.02.18",
        realTalkTask: "memory_probing",
        realTalkPaperRefHash,
        realTalkDatasetLicenseRefHash,
        realTalkRawExportManifestHash,
        realTalkPreprocessedConversationHash,
        realTalkParticipantManifestHash,
        realTalkSpeakerManifestHash,
        realTalkTemporalSplitHash,
        realTalkPrivacyConsentHash,
        realTalkLocomoComparisonHash,
        realTalkQuestionAnswerManifestHash,
        realTalkOpenAiBoundaryHash,
        realTalkEvaluatorConfigHash,
        realTalkGptScoreArtifactHash,
        realTalkLexicalF1ArtifactHash,
        realTalkConversationDaySpan: 21,
        realTalkParticipantCount: 12,
        realTalkQuestionCount: 64,
        realTalkLexicalF1Score0to1: 0.74,
        realTalkGptScore0to1: 0.82,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      longTermMemoryRowCount: 1,
      failedLongTermMemoryRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("REALTALK Rows: 1");
    expect(markdown).toContain("REALTALK Tasks: memory_probing");
    expect(markdown).toContain("2025.02.18:210000:memory_probing");
  });

  test("fails closed for REALTALK persona-simulation rows without replayable release evidence", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "realtalk-persona-simulation-v1",
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "realtalk-persona-simulation-missing-evidence",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            longTermMemory: {
              benchmarkId: "realtalk-long-conversation",
              benchmarkVersion: "2025.02.18",
              configurationHash: ltmConfigurationHash,
              datasetSpecHash: ltmDatasetSpecHash,
              datasetInterfaceHash: ltmDatasetInterfaceHash,
              modelInterfaceHash: ltmModelInterfaceHash,
              runnerConfigHash: ltmRunnerConfigHash,
              testSpecHash: ltmTestSpecHash,
              conversationTraceHash: ltmConversationTraceHash,
              memoryUpdateTraceHash: ltmMemoryUpdateTraceHash,
              retrievalTraceHash: ltmRetrievalTraceHash,
              resultArtifactHash: ltmResultArtifactHash,
              reportArtifactHash: ltmReportArtifactHash,
              memorySpanTokens: 90000,
              contextLimitTokens: 16000,
              generatedTestCount: 8,
              score0to1: 0.72,
              minScore0to1: 0.7,
              realTalkTask: "persona_simulation",
              realTalkPaperRefHash,
              realTalkDatasetLicenseRefHash,
              realTalkRawExportManifestHash,
              realTalkPreprocessedConversationHash,
              realTalkParticipantManifestHash,
              realTalkSpeakerManifestHash,
              realTalkTemporalSplitHash,
              realTalkPrivacyConsentHash,
              realTalkLocomoComparisonHash,
              realTalkPersonaPromptHash,
              realTalkConversationDaySpan: 14,
              minRealTalkConversationDaySpan: 21,
              realTalkParticipantCount: 1,
              minRealTalkParticipantCount: 2,
              realTalkPersonaConsistency0to1: 0.35,
              minRealTalkPersonaConsistency0to1: 0.7,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.longTermMemorySummary).toMatchObject({
      rowCount: 1,
      benchmarkVersions: ["2025.02.18"],
      failedRowIds: ["realtalk-persona-simulation-missing-evidence"],
      realTalkRowCount: 1,
      realTalkTasks: ["persona_simulation"],
      failedRealTalkRowIds: ["realtalk-persona-simulation-missing-evidence"],
      maxRealTalkConversationDaySpan: 14,
    });
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("long-term memory realtalk persona simulation release hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("long-term memory realtalk persona eval artifact hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("long-term memory realtalk conversation day span below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("long-term memory realtalk participant count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("long-term memory realtalk persona consistency below threshold");
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedRowIds: ["realtalk-persona-simulation-missing-evidence"],
      longTermMemoryRowCount: 1,
      failedLongTermMemoryRowIds: ["realtalk-persona-simulation-missing-evidence"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "realtalk-persona-simulation-missing-evidence",
      severity: "high",
    });
  });

  test("binds CloneMem-style non-conversational digital-trace memory replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "clonemem-digital-trace-v1",
      sourceRefs: ["https://github.com/AvatarMemory/CloneMemBench"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "clonemem-digital-trace-001",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            longTermMemory: {
              benchmarkId: "clonemem-long-term-memory",
              benchmarkVersion: "2026.06.15",
              configurationHash: ltmConfigurationHash,
              datasetSpecHash: ltmDatasetSpecHash,
              datasetInterfaceHash: ltmDatasetInterfaceHash,
              modelInterfaceHash: ltmModelInterfaceHash,
              runnerConfigHash: ltmRunnerConfigHash,
              testSpecHash: ltmTestSpecHash,
              conversationTraceHash: ltmConversationTraceHash,
              memoryUpdateTraceHash: ltmMemoryUpdateTraceHash,
              retrievalTraceHash: ltmRetrievalTraceHash,
              resultArtifactHash: ltmResultArtifactHash,
              reportArtifactHash: ltmReportArtifactHash,
              memorySpanTokens: 260000,
              contextLimitTokens: 32000,
              generatedTestCount: 80,
              score0to1: 0.84,
              minScore0to1: 0.74,
              runtimeMinutes: 14.5,
              estimatedCostUsd: 3.1,
              cloneMemSourceRefHash,
              cloneMemRepositorySnapshotHash,
              cloneMemDatasetLicenseRefHash,
              cloneMemPersonaManifestHash,
              cloneMemDigitalTraceManifestHash,
              cloneMemDiaryTraceManifestHash,
              cloneMemSocialPostTraceManifestHash,
              cloneMemDirectMessageTraceManifestHash,
              cloneMemEmailTraceManifestHash,
              cloneMemQuestionSetHash,
              cloneMemGroundTruthEvidenceHash,
              cloneMemTemporalSplitHash,
              cloneMemBilingualConfigHash,
              cloneMemEvaluationConfigHash,
              cloneMemBaselineRetrieverHash,
              cloneMemMemorySystemConfigHash,
              cloneMemResultArtifactHash,
              cloneMemReplayCommandHash,
              cloneMemTraceKinds: ["diary", "social_post", "direct_message", "email"],
              minCloneMemTraceKindCount: 4,
              cloneMemTaskCategories: [
                "factual_recall",
                "temporal_reasoning",
                "trajectory_analysis",
                "pattern_identification",
                "causal_reasoning",
                "counterfactual_reasoning",
                "inferential_reasoning",
                "unanswerable_detection",
              ],
              minCloneMemTaskCategoryCount: 8,
              cloneMemLanguageIds: ["en", "zh"],
              minCloneMemLanguageCount: 2,
              cloneMemPersonaCount: 10,
              minCloneMemPersonaCount: 10,
              cloneMemQuestionCount: 1183,
              minCloneMemQuestionCount: 1000,
              cloneMemShortContextPersonaCount: 3,
              cloneMemLongContextPersonaCount: 7,
              cloneMemContextSpanMonths: 24,
              minCloneMemContextSpanMonths: 12,
              cloneMemEvidenceGrounding0to1: 0.88,
              minCloneMemEvidenceGrounding0to1: 0.8,
              cloneMemTemporalConsistency0to1: 0.83,
              minCloneMemTemporalConsistency0to1: 0.75,
              cloneMemUnanswerableAccuracy0to1: 0.79,
              minCloneMemUnanswerableAccuracy0to1: 0.7,
              cloneMemTrajectoryReasoning0to1: 0.81,
              minCloneMemTrajectoryReasoning0to1: 0.7,
              cloneMemReplayPassRate0to1: 1,
              minCloneMemReplayPassRate0to1: 0.95,
              cloneMemScoreDelta0to1: 0.06,
              minCloneMemScoreDelta0to1: 0,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.longTermMemorySummary).toMatchObject({
      rowCount: 1,
      benchmarkVersions: ["2026.06.15"],
      failedRowIds: [],
      cloneMemRowCount: 1,
      cloneMemTraceKinds: ["diary", "social_post", "direct_message", "email"],
      cloneMemTaskCategories: [
        "factual_recall",
        "temporal_reasoning",
        "trajectory_analysis",
        "pattern_identification",
        "causal_reasoning",
        "counterfactual_reasoning",
        "inferential_reasoning",
        "unanswerable_detection",
      ],
      cloneMemLanguageIds: ["en", "zh"],
      failedCloneMemRowIds: [],
      totalCloneMemPersonaCount: 10,
      totalCloneMemQuestionCount: 1183,
      maxCloneMemContextSpanMonths: 24,
      averageCloneMemEvidenceGrounding0to1: 0.88,
      averageCloneMemReplayPassRate0to1: 1,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "clonemem-digital-trace-001",
      status: "passed",
      longTermMemory: {
        benchmarkId: "clonemem-long-term-memory",
        benchmarkVersion: "2026.06.15",
        cloneMemSourceRefHash,
        cloneMemRepositorySnapshotHash,
        cloneMemDatasetLicenseRefHash,
        cloneMemPersonaManifestHash,
        cloneMemDigitalTraceManifestHash,
        cloneMemQuestionSetHash,
        cloneMemGroundTruthEvidenceHash,
        cloneMemTraceKinds: ["diary", "social_post", "direct_message", "email"],
        cloneMemLanguageIds: ["en", "zh"],
        cloneMemPersonaCount: 10,
        cloneMemQuestionCount: 1183,
        cloneMemReplayPassRate0to1: 1,
        cloneMemScoreDelta0to1: 0.06,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      longTermMemoryRowCount: 1,
      failedLongTermMemoryRowIds: [],
      cloneMemRowCount: 1,
      failedCloneMemRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("CloneMem Rows: 1");
    expect(markdown).toContain("CloneMem Languages: en, zh");
    expect(markdown).toContain("2026.06.15:260000:clonemem");
  });

  test("fails closed when CloneMem-style digital-trace replay evidence is incomplete", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "clonemem-digital-trace-v1",
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "clonemem-missing-evidence",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            longTermMemory: {
              benchmarkId: "clonemem-long-term-memory",
              benchmarkVersion: "2026.06.15",
              configurationHash: ltmConfigurationHash,
              datasetSpecHash: ltmDatasetSpecHash,
              datasetInterfaceHash: ltmDatasetInterfaceHash,
              modelInterfaceHash: ltmModelInterfaceHash,
              runnerConfigHash: ltmRunnerConfigHash,
              testSpecHash: ltmTestSpecHash,
              conversationTraceHash: ltmConversationTraceHash,
              memoryUpdateTraceHash: ltmMemoryUpdateTraceHash,
              retrievalTraceHash: ltmRetrievalTraceHash,
              resultArtifactHash: ltmResultArtifactHash,
              reportArtifactHash: ltmReportArtifactHash,
              memorySpanTokens: 260000,
              contextLimitTokens: 32000,
              generatedTestCount: 80,
              score0to1: 0.84,
              minScore0to1: 0.74,
              cloneMemSourceRefHash,
              cloneMemDigitalTraceManifestHash: "bad-trace-hash",
              cloneMemTraceKinds: ["diary"],
              minCloneMemTraceKindCount: 4,
              cloneMemTaskCategories: ["factual_recall", "temporal_reasoning"],
              minCloneMemTaskCategoryCount: 8,
              cloneMemLanguageIds: ["en"],
              minCloneMemLanguageCount: 2,
              cloneMemPersonaCount: 4,
              minCloneMemPersonaCount: 10,
              cloneMemQuestionCount: 30,
              minCloneMemQuestionCount: 100,
              cloneMemContextSpanMonths: 6,
              minCloneMemContextSpanMonths: 12,
              cloneMemEvidenceGrounding0to1: 0.31,
              minCloneMemEvidenceGrounding0to1: 0.8,
              cloneMemTemporalConsistency0to1: 0.35,
              minCloneMemTemporalConsistency0to1: 0.75,
              cloneMemUnanswerableAccuracy0to1: 0.4,
              minCloneMemUnanswerableAccuracy0to1: 0.7,
              cloneMemTrajectoryReasoning0to1: 0.45,
              minCloneMemTrajectoryReasoning0to1: 0.7,
              cloneMemReplayPassRate0to1: 0.5,
              minCloneMemReplayPassRate0to1: 0.95,
              cloneMemScoreDelta0to1: -0.04,
              minCloneMemScoreDelta0to1: 0,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.longTermMemorySummary).toMatchObject({
      rowCount: 1,
      benchmarkVersions: ["2026.06.15"],
      failedRowIds: ["clonemem-missing-evidence"],
      cloneMemRowCount: 1,
      cloneMemTraceKinds: ["diary"],
      cloneMemTaskCategories: ["factual_recall", "temporal_reasoning"],
      cloneMemLanguageIds: ["en"],
      failedCloneMemRowIds: ["clonemem-missing-evidence"],
      totalCloneMemPersonaCount: 4,
      totalCloneMemQuestionCount: 30,
      maxCloneMemContextSpanMonths: 6,
      averageCloneMemEvidenceGrounding0to1: 0.31,
      averageCloneMemReplayPassRate0to1: 0.5,
    });
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("long-term memory clonemem repository snapshot hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("long-term memory clonemem digital trace manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("long-term memory clonemem question set hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("long-term memory clonemem trace kind count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("long-term memory clonemem language count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("long-term memory clonemem replay pass rate below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("long-term memory clonemem score delta below threshold");
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedRowIds: ["clonemem-missing-evidence"],
      longTermMemoryRowCount: 1,
      failedLongTermMemoryRowIds: ["clonemem-missing-evidence"],
      cloneMemRowCount: 1,
      failedCloneMemRowIds: ["clonemem-missing-evidence"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "clonemem-missing-evidence",
      severity: "high",
    });
  });

  test("binds MemEval-style memory-system benchmark replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "memeval-memory-systems-v1",
      sourceRefs: ["https://github.com/ProsusAI/MemEval"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "memeval-memory-systems-001",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            longTermMemory: {
              benchmarkId: "memeval-memory-systems",
              benchmarkVersion: "2026.06.16",
              configurationHash: ltmConfigurationHash,
              datasetSpecHash: ltmDatasetSpecHash,
              datasetInterfaceHash: ltmDatasetInterfaceHash,
              modelInterfaceHash: ltmModelInterfaceHash,
              runnerConfigHash: ltmRunnerConfigHash,
              testSpecHash: ltmTestSpecHash,
              conversationTraceHash: ltmConversationTraceHash,
              memoryUpdateTraceHash: ltmMemoryUpdateTraceHash,
              retrievalTraceHash: ltmRetrievalTraceHash,
              resultArtifactHash: ltmResultArtifactHash,
              reportArtifactHash: ltmReportArtifactHash,
              memorySpanTokens: 390000,
              contextLimitTokens: 128000,
              generatedTestCount: 2088,
              score0to1: 0.79,
              minScore0to1: 0.7,
              runtimeMinutes: 22,
              estimatedCostUsd: 7.4,
              memEvalSourceRefHash,
              memEvalRepositorySnapshotHash,
              memEvalLicenseRefHash,
              memEvalBenchmarkManifestHash,
              memEvalDatasetManifestHash,
              memEvalQuestionSetHash,
              memEvalConversationManifestHash,
              memEvalMemorySystemRosterHash,
              memEvalSystemConfigHash,
              memEvalLlmConfigHash,
              memEvalEmbeddingConfigHash,
              memEvalScoringPipelineHash,
              memEvalJudgeConfigHash,
              memEvalTokenCostTraceHash,
              memEvalResultArtifactHash,
              memEvalReplayCommandHash,
              memEvalBenchmarkIds: ["locomo", "longmemeval"],
              minMemEvalBenchmarkCount: 2,
              memEvalMemorySystems: [
                "propmem",
                "openclaw",
                "full_context",
                "hindsight",
                "graphiti",
                "simplemem",
                "mem0",
                "memory_r1",
                "memu",
              ],
              minMemEvalMemorySystemCount: 9,
              memEvalMetricKinds: ["token_f1", "llm_judge", "token_cost", "category_breakdown"],
              minMemEvalMetricKindCount: 4,
              memEvalQuestionCount: 2088,
              minMemEvalQuestionCount: 100,
              memEvalConversationCount: 112,
              minMemEvalConversationCount: 10,
              memEvalAverageTokenF1_0to1: 0.55,
              minMemEvalAverageTokenF1_0to1: 0.45,
              memEvalAverageJudgeScore0to1: 0.72,
              minMemEvalAverageJudgeScore0to1: 0.65,
              memEvalTokenCostTracked: true,
              memEvalCategoryBreakdownCoverage0to1: 1,
              minMemEvalCategoryBreakdownCoverage0to1: 0.95,
              memEvalReplayPassRate0to1: 1,
              minMemEvalReplayPassRate0to1: 0.95,
              memEvalScoreDelta0to1: 0.04,
              minMemEvalScoreDelta0to1: 0,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.longTermMemorySummary).toMatchObject({
      rowCount: 1,
      benchmarkVersions: ["2026.06.16"],
      failedRowIds: [],
      memEvalRowCount: 1,
      memEvalBenchmarkIds: ["locomo", "longmemeval"],
      memEvalMemorySystems: [
        "propmem",
        "openclaw",
        "full_context",
        "hindsight",
        "graphiti",
        "simplemem",
        "mem0",
        "memory_r1",
        "memu",
      ],
      memEvalMetricKinds: ["token_f1", "llm_judge", "token_cost", "category_breakdown"],
      failedMemEvalRowIds: [],
      totalMemEvalQuestionCount: 2088,
      totalMemEvalConversationCount: 112,
      averageMemEvalTokenF1_0to1: 0.55,
      averageMemEvalJudgeScore0to1: 0.72,
      averageMemEvalReplayPassRate0to1: 1,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "memeval-memory-systems-001",
      status: "passed",
      longTermMemory: {
        benchmarkId: "memeval-memory-systems",
        benchmarkVersion: "2026.06.16",
        memEvalSourceRefHash,
        memEvalRepositorySnapshotHash,
        memEvalLicenseRefHash,
        memEvalBenchmarkIds: ["locomo", "longmemeval"],
        memEvalMemorySystems: [
          "propmem",
          "openclaw",
          "full_context",
          "hindsight",
          "graphiti",
          "simplemem",
          "mem0",
          "memory_r1",
          "memu",
        ],
        memEvalMetricKinds: ["token_f1", "llm_judge", "token_cost", "category_breakdown"],
        memEvalQuestionCount: 2088,
        memEvalConversationCount: 112,
        memEvalAverageTokenF1_0to1: 0.55,
        memEvalAverageJudgeScore0to1: 0.72,
        memEvalTokenCostTracked: true,
        memEvalCategoryBreakdownCoverage0to1: 1,
        memEvalReplayPassRate0to1: 1,
        memEvalScoreDelta0to1: 0.04,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      longTermMemoryRowCount: 1,
      failedLongTermMemoryRowIds: [],
      memEvalRowCount: 1,
      failedMemEvalRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("MemEval Rows: 1");
    expect(markdown).toContain("MemEval Benchmarks: locomo, longmemeval");
    expect(markdown).toContain("MemEval Memory Systems: propmem, openclaw, full_context");
    expect(markdown).toContain("MemEval Metrics: token_f1, llm_judge, token_cost, category_breakdown");
    expect(markdown).toContain("2026.06.16:390000:memeval");
  });

  test("fails closed when MemEval-style memory-system replay evidence is incomplete", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "memeval-memory-systems-v1",
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "memeval-missing-evidence",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            longTermMemory: {
              benchmarkId: "memeval-memory-systems",
              benchmarkVersion: "2026.06.16",
              configurationHash: ltmConfigurationHash,
              datasetSpecHash: ltmDatasetSpecHash,
              datasetInterfaceHash: ltmDatasetInterfaceHash,
              modelInterfaceHash: ltmModelInterfaceHash,
              runnerConfigHash: ltmRunnerConfigHash,
              testSpecHash: ltmTestSpecHash,
              conversationTraceHash: ltmConversationTraceHash,
              memoryUpdateTraceHash: ltmMemoryUpdateTraceHash,
              retrievalTraceHash: ltmRetrievalTraceHash,
              resultArtifactHash: ltmResultArtifactHash,
              reportArtifactHash: ltmReportArtifactHash,
              memorySpanTokens: 390000,
              contextLimitTokens: 128000,
              generatedTestCount: 2088,
              score0to1: 0.79,
              minScore0to1: 0.7,
              memEvalSourceRefHash,
              memEvalRepositorySnapshotHash: "bad-snapshot-hash",
              memEvalBenchmarkIds: ["locomo"],
              minMemEvalBenchmarkCount: 2,
              memEvalMemorySystems: ["propmem"],
              minMemEvalMemorySystemCount: 9,
              memEvalMetricKinds: ["token_f1"],
              minMemEvalMetricKindCount: 4,
              memEvalQuestionCount: 20,
              minMemEvalQuestionCount: 100,
              memEvalConversationCount: 1,
              minMemEvalConversationCount: 10,
              memEvalAverageTokenF1_0to1: 0.2,
              minMemEvalAverageTokenF1_0to1: 0.45,
              memEvalAverageJudgeScore0to1: 0.4,
              minMemEvalAverageJudgeScore0to1: 0.65,
              memEvalTokenCostTracked: false,
              memEvalCategoryBreakdownCoverage0to1: 0.5,
              minMemEvalCategoryBreakdownCoverage0to1: 0.95,
              memEvalReplayPassRate0to1: 0.5,
              minMemEvalReplayPassRate0to1: 0.95,
              memEvalScoreDelta0to1: -0.1,
              minMemEvalScoreDelta0to1: 0,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.longTermMemorySummary).toMatchObject({
      rowCount: 1,
      benchmarkVersions: ["2026.06.16"],
      failedRowIds: ["memeval-missing-evidence"],
      memEvalRowCount: 1,
      memEvalBenchmarkIds: ["locomo"],
      memEvalMemorySystems: ["propmem"],
      memEvalMetricKinds: ["token_f1"],
      failedMemEvalRowIds: ["memeval-missing-evidence"],
      totalMemEvalQuestionCount: 20,
      totalMemEvalConversationCount: 1,
      averageMemEvalTokenF1_0to1: 0.2,
      averageMemEvalJudgeScore0to1: 0.4,
      averageMemEvalReplayPassRate0to1: 0.5,
    });
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("long-term memory memeval repository snapshot hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("long-term memory memeval license reference hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("long-term memory memeval benchmark count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("long-term memory memeval memory system count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("long-term memory memeval metric kind count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("long-term memory memeval token cost tracking disabled");
    expect(result.manifest.rows[0]?.issues).toContain("long-term memory memeval replay pass rate below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("long-term memory memeval score delta below threshold");
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedRowIds: ["memeval-missing-evidence"],
      longTermMemoryRowCount: 1,
      failedLongTermMemoryRowIds: ["memeval-missing-evidence"],
      memEvalRowCount: 1,
      failedMemEvalRowIds: ["memeval-missing-evidence"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "memeval-missing-evidence",
      severity: "high",
    });
  });

  test("binds streaming continuous-improvement benchmark sequences, update traces, and retention metrics into replay receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "streambench-continuous-improvement-v1",
      sourceRefs: [
        "https://github.com/stream-bench/stream-bench",
        "https://arxiv.org/abs/2406.08747",
      ],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "streambench-improvement-001",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            streamingImprovement: {
              benchmarkId: "streambench-continuous-improvement-style",
              datasetId: "synthetic-streambench-sequence",
              sequenceId: "stream-sequence-001",
              sourceDatasetManifestHash: streamingSourceDatasetManifestHash,
              originalSourceManifestHash: streamingOriginalSourceManifestHash,
              agentConfigHash: streamingAgentConfigHash,
              benchmarkConfigHash: streamingBenchmarkConfigHash,
              streamSequenceHash: streamingSequenceHash,
              initialStateHash: streamingInitialStateHash,
              updateTraceHash: streamingUpdateTraceHash,
              predictionTraceHash: streamingPredictionTraceHash,
              evaluationTraceHash: streamingEvaluationTraceHash,
              sanityCheckTraceHash: streamingSanityCheckTraceHash,
              resultArtifactHash: streamingResultArtifactHash,
              batchRunConfigHash: streamingBatchRunConfigHash,
              externalTrackerRunId: "wandb:synthetic-streambench-001",
              stepCount: 24,
              windowCount: 6,
              updateCount: 5,
              onlineUpdateEnabled: true,
              sanityCheckPassed: true,
              initialScore0to1: 0.42,
              finalScore0to1: 0.64,
              minImprovementDelta0to1: 0.1,
              retentionScore0to1: 0.86,
              minRetentionScore0to1: 0.75,
              catastrophicForgettingRate0to1: 0.04,
              maxCatastrophicForgettingRate0to1: 0.1,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.streamingImprovementSummary).toEqual({
      rowCount: 1,
      datasetIds: ["synthetic-streambench-sequence"],
      failedRowIds: [],
      totalStepCount: 24,
      onlineUpdateRowCount: 1,
      sanityCheckedRowCount: 1,
      averageImprovementDelta0to1: 0.22,
      averageRetentionScore0to1: 0.86,
      maxCatastrophicForgettingRate0to1: 0.04,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "streambench-improvement-001",
      status: "passed",
      streamingImprovement: {
        benchmarkId: "streambench-continuous-improvement-style",
        datasetId: "synthetic-streambench-sequence",
        sequenceId: "stream-sequence-001",
        sourceDatasetManifestHash: streamingSourceDatasetManifestHash,
        originalSourceManifestHash: streamingOriginalSourceManifestHash,
        agentConfigHash: streamingAgentConfigHash,
        benchmarkConfigHash: streamingBenchmarkConfigHash,
        streamSequenceHash: streamingSequenceHash,
        initialStateHash: streamingInitialStateHash,
        updateTraceHash: streamingUpdateTraceHash,
        predictionTraceHash: streamingPredictionTraceHash,
        evaluationTraceHash: streamingEvaluationTraceHash,
        sanityCheckTraceHash: streamingSanityCheckTraceHash,
        resultArtifactHash: streamingResultArtifactHash,
        batchRunConfigHash: streamingBatchRunConfigHash,
        externalTrackerRunId: "wandb:synthetic-streambench-001",
        stepCount: 24,
        windowCount: 6,
        updateCount: 5,
        onlineUpdateEnabled: true,
        sanityCheckPassed: true,
        initialScore0to1: 0.42,
        finalScore0to1: 0.64,
        improvementDelta0to1: 0.22,
        minImprovementDelta0to1: 0.1,
        retentionScore0to1: 0.86,
        minRetentionScore0to1: 0.75,
        catastrophicForgettingRate0to1: 0.04,
        maxCatastrophicForgettingRate0to1: 0.1,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      streamingImprovementRowCount: 1,
      failedStreamingImprovementRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("Streaming Improvement Rows: 1");
    expect(markdown).toContain("Streaming Improvement Datasets: synthetic-streambench-sequence");
    expect(markdown).toContain("synthetic-streambench-sequence:0.22");
  });

  test("fails closed when streaming continuous-improvement evidence is incomplete or regresses online learning gates", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "streambench-continuous-improvement-v1",
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "streambench-missing-evidence",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            streamingImprovement: {
              benchmarkId: "streambench-continuous-improvement-style",
              sourceDatasetManifestHash: "not-a-sha",
              agentConfigHash: streamingAgentConfigHash,
              benchmarkConfigHash: "bad-config-hash",
              streamSequenceHash: streamingSequenceHash,
              initialStateHash: streamingInitialStateHash,
              predictionTraceHash: "bad-prediction-hash",
              evaluationTraceHash: streamingEvaluationTraceHash,
              sanityCheckTraceHash: streamingSanityCheckTraceHash,
              resultArtifactHash: streamingResultArtifactHash,
              batchRunConfigHash: "bad-batch-hash",
              stepCount: 0,
              onlineUpdateEnabled: false,
              sanityCheckPassed: false,
              initialScore0to1: 0.5,
              finalScore0to1: 0.55,
              minImprovementDelta0to1: 0.1,
              retentionScore0to1: 0.7,
              minRetentionScore0to1: 0.75,
              catastrophicForgettingRate0to1: 0.2,
              maxCatastrophicForgettingRate0to1: 0.1,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.streamingImprovementSummary).toMatchObject({
      rowCount: 1,
      failedRowIds: ["streambench-missing-evidence"],
      totalStepCount: 0,
      onlineUpdateRowCount: 0,
      sanityCheckedRowCount: 0,
      averageImprovementDelta0to1: 0.05,
      averageRetentionScore0to1: 0.7,
      maxCatastrophicForgettingRate0to1: 0.2,
    });
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toEqual(expect.arrayContaining([
      "streaming improvement dataset id missing",
      "streaming improvement sequence id missing",
      "streaming improvement source dataset manifest hash invalid",
      "streaming improvement original source manifest hash invalid",
      "streaming improvement benchmark config hash invalid",
      "streaming improvement update trace hash invalid",
      "streaming improvement prediction trace hash invalid",
      "streaming improvement batch run config hash invalid",
      "streaming improvement step count missing",
      "streaming improvement window count missing",
      "streaming improvement update count missing",
      "streaming improvement online update disabled",
      "streaming improvement sanity check failed",
      "streaming improvement delta below threshold",
      "streaming improvement retention below threshold",
      "streaming improvement forgetting above threshold",
    ]));
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedRowIds: ["streambench-missing-evidence"],
      streamingImprovementRowCount: 1,
      failedStreamingImprovementRowIds: ["streambench-missing-evidence"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "streambench-missing-evidence",
      severity: "critical",
    });
  });

  test("binds VAKRA-style enterprise multi-hop tool-calling replay proof into corpus rows", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "vakra-enterprise-tool-calling-v1",
      sourceRefs: ["https://github.com/IBM/vakra"],
      rows: [
        {
          rowId: "vakra-multisource-policy-001",
          fixture: {
            task: "Replay a multi-hop enterprise workflow that combines API calls, retrieved documents, and tool-use policy constraints.",
            inputHash: "vakra-input-001",
            expectedHash: "vakra-expected-001",
            seed: 97,
            enterpriseToolCalling: {
              benchmarkId: "synthetic-vakra-enterprise-suite",
              benchmarkVersion: "2026.06.13",
              capability: "multihop_multisource_policy",
              sourceMode: "api_and_document",
              domainId: "synthetic-card-services",
              capabilityDomainHash: enterpriseCapabilityDomainHash,
              inputDatasetHash: enterpriseInputDatasetHash,
              expectedOutputHash: enterpriseExpectedOutputHash,
              localApiManifestHash: enterpriseLocalApiManifestHash,
              databaseSnapshotHash: enterpriseDatabaseSnapshotHash,
              documentCollectionHash: enterpriseDocumentCollectionHash,
              mcpServerConfigHash: enterpriseMcpServerConfigHash,
              toolSchemaManifestHash: enterpriseToolSchemaManifestHash,
              policyConstraintHash: enterprisePolicyConstraintHash,
              agentConfigHash: enterpriseAgentConfigHash,
              trajectoryReplayHash: enterpriseTrajectoryReplayHash,
              toolCallTraceHash: enterpriseToolCallTraceHash,
              toolResponseTraceHash: enterpriseToolResponseTraceHash,
              retrievedEvidenceTraceHash: enterpriseRetrievedEvidenceTraceHash,
              outputValidationHash: enterpriseOutputValidationHash,
              evaluatorConfigHash: enterpriseEvaluatorConfigHash,
              leaderboardSubmissionHash: enterpriseLeaderboardSubmissionHash,
              domainCount: 62,
              sampleCount: 644,
              apiCount: 8000,
              documentCollectionCount: 41,
              reasoningStepCount: 4,
              minReasoningStepCount: 3,
              maxReasoningStepCount: 7,
              toolCallCount: 4,
              minToolCallCount: 3,
              policyAdherence0to1: 0.94,
              minPolicyAdherence0to1: 0.9,
              groundedness0to1: 0.93,
              minGroundedness0to1: 0.9,
              exactToolResponseMatch0to1: 0.91,
              minExactToolResponseMatch0to1: 0.9,
              finalAnswerScore0to1: 0.92,
              minFinalAnswerScore0to1: 0.9,
              deterministicReplay: true,
              outputValidated: true,
            },
          },
          baseline: {
            score0to1: 0.84,
            evidenceRefs: ["trace:vakra-baseline-001"],
            signedEvidenceRefs: ["ledger:sig-vakra-baseline-001"],
          },
          candidate: {
            score0to1: 0.89,
            evidenceRefs: ["trace:vakra-candidate-001"],
            signedEvidenceRefs: ["ledger:sig-vakra-candidate-001"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.enterpriseToolCallingSummary).toEqual({
      rowCount: 1,
      capabilities: ["multihop_multisource_policy"],
      sourceModes: ["api_and_document"],
      failedRowIds: [],
      totalDomainCount: 62,
      totalSampleCount: 644,
      totalApiCount: 8000,
      deterministicReplayRowCount: 1,
      outputValidatedRowCount: 1,
      averageFinalAnswerScore0to1: 0.92,
      averagePolicyAdherence0to1: 0.94,
      averageGroundedness0to1: 0.93,
    });
    expect(result.manifest.rows[0]?.enterpriseToolCalling).toMatchObject({
      benchmarkId: "synthetic-vakra-enterprise-suite",
      capability: "multihop_multisource_policy",
      sourceMode: "api_and_document",
      localApiManifestHash: enterpriseLocalApiManifestHash,
      documentCollectionHash: enterpriseDocumentCollectionHash,
      trajectoryReplayHash: enterpriseTrajectoryReplayHash,
      deterministicReplay: true,
      outputValidated: true,
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      failClosed: false,
      enterpriseToolCallingRowCount: 1,
      failedEnterpriseToolCallingRowIds: [],
    });
    expect(verifyReplayBenchmarkCorpusReceipt(result.manifest, result.ciReceipt)).toMatchObject({
      valid: true,
      errors: [],
    });
    expect(renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt)).toContain(
      "multihop_multisource_policy:synthetic-card-services:0.92",
    );
  });

  test("fails closed when VAKRA-style enterprise tool-calling replay proof is incomplete", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "vakra-enterprise-tool-calling-v1",
      sourceRefs: ["https://github.com/IBM/vakra"],
      rows: [
        {
          rowId: "vakra-missing-replay-proof",
          fixture: {
            task: "Replay a multi-source enterprise workflow with missing traces.",
            inputHash: "vakra-input-002",
            expectedHash: "vakra-expected-002",
            seed: 97,
            enterpriseToolCalling: {
              benchmarkId: "synthetic-vakra-enterprise-suite",
              benchmarkVersion: "2026.06.13",
              capability: "multihop_multisource_policy",
              sourceMode: "api_and_document",
              domainId: "synthetic-card-services",
              capabilityDomainHash: enterpriseCapabilityDomainHash,
              inputDatasetHash: enterpriseInputDatasetHash,
              expectedOutputHash: enterpriseExpectedOutputHash,
              localApiManifestHash: "not-a-hash",
              databaseSnapshotHash: enterpriseDatabaseSnapshotHash,
              mcpServerConfigHash: enterpriseMcpServerConfigHash,
              toolSchemaManifestHash: enterpriseToolSchemaManifestHash,
              policyConstraintHash: enterprisePolicyConstraintHash,
              agentConfigHash: enterpriseAgentConfigHash,
              trajectoryReplayHash: "",
              toolCallTraceHash: enterpriseToolCallTraceHash,
              toolResponseTraceHash: "",
              outputValidationHash: "also-not-a-hash",
              evaluatorConfigHash: enterpriseEvaluatorConfigHash,
              domainCount: 62,
              sampleCount: 0,
              apiCount: 0,
              documentCollectionCount: 0,
              reasoningStepCount: 2,
              minReasoningStepCount: 3,
              maxReasoningStepCount: 7,
              toolCallCount: 1,
              minToolCallCount: 3,
              policyAdherence0to1: 0.75,
              minPolicyAdherence0to1: 0.9,
              groundedness0to1: 0.74,
              minGroundedness0to1: 0.9,
              exactToolResponseMatch0to1: 0.7,
              minExactToolResponseMatch0to1: 0.9,
              finalAnswerScore0to1: 0.72,
              minFinalAnswerScore0to1: 0.9,
              deterministicReplay: false,
              outputValidated: false,
            },
          },
          baseline: {
            score0to1: 0.84,
            evidenceRefs: ["trace:vakra-baseline-002"],
            signedEvidenceRefs: ["ledger:sig-vakra-baseline-002"],
          },
          candidate: {
            score0to1: 0.8,
            evidenceRefs: ["trace:vakra-candidate-002"],
            signedEvidenceRefs: ["ledger:sig-vakra-candidate-002"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.enterpriseToolCallingSummary).toMatchObject({
      rowCount: 1,
      failedRowIds: ["vakra-missing-replay-proof"],
      totalDomainCount: 62,
      totalSampleCount: 0,
      totalApiCount: 0,
      deterministicReplayRowCount: 0,
      outputValidatedRowCount: 0,
    });
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toEqual(expect.arrayContaining([
      "enterprise tool calling local api manifest hash invalid",
      "enterprise tool calling trajectory replay hash invalid",
      "enterprise tool calling tool response trace hash invalid",
      "enterprise tool calling output validation hash invalid",
      "enterprise tool calling document collection hash invalid",
      "enterprise tool calling retrieved evidence trace hash invalid",
      "enterprise tool calling sample count missing",
      "enterprise tool calling api count missing",
      "enterprise tool calling reasoning step count below minimum",
      "enterprise tool calling tool call count below minimum",
      "enterprise tool calling policy adherence below threshold",
      "enterprise tool calling groundedness below threshold",
      "enterprise tool calling exact tool response match below threshold",
      "enterprise tool calling final answer score below threshold",
      "enterprise tool calling deterministic replay disabled",
      "enterprise tool calling output validation failed",
    ]));
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      enterpriseToolCallingRowCount: 1,
      failedEnterpriseToolCallingRowIds: ["vakra-missing-replay-proof"],
    });
  });

  test("binds biomedical agent benchmark tasks, workflow traces, sandbox receipts, and artifacts into replay rows", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "biodsa-biomedical-agent-eval-v1",
      sourceRefs: ["https://github.com/Keiji-AI/BioDSA"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "biodsa-evidence-synthesis-001",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            biomedicalAgentEvaluation: {
              benchmarkId: "synthetic-biodsa-biomedical-suite",
              benchmarkVersion: "2026.06.13",
              taskType: "evidence_synthesis",
              workflowType: "multi_agent",
              taskManifestHash: bioTaskManifestHash,
              datasetSpecHash: bioDatasetSpecHash,
              knowledgeBaseManifestHash: bioKnowledgeBaseManifestHash,
              toolRegistryHash: bioToolRegistryHash,
              workflowGraphHash: bioWorkflowGraphHash,
              modelConfigHash: bioModelConfigHash,
              sandboxConfigHash: bioSandboxConfigHash,
              executionTraceHash: bioExecutionTraceHash,
              codeExecutionTraceHash: bioCodeExecutionTraceHash,
              structuredResultHash: bioStructuredResultHash,
              reportArtifactHash: bioReportArtifactHash,
              generatedArtifactManifestHash: bioGeneratedArtifactManifestHash,
              evaluatorConfigHash: bioEvaluatorConfigHash,
              taskCount: 6,
              completedTaskCount: 6,
              knowledgeBaseCount: 4,
              generatedArtifactCount: 3,
              score0to1: 0.84,
              minScore0to1: 0.8,
              safeCodeExecutionEnabled: true,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.biomedicalAgentEvaluationSummary).toEqual({
      rowCount: 1,
      taskTypes: ["evidence_synthesis"],
      workflowTypes: ["multi_agent"],
      failedRowIds: [],
      totalTaskCount: 6,
      totalCompletedTaskCount: 6,
      totalKnowledgeBaseCount: 4,
      totalGeneratedArtifactCount: 3,
      averageScore0to1: 0.84,
      safeCodeExecutionRowCount: 1,
      medAskRowCount: 0,
      medAskClinicalTasks: [],
      failedMedAskRowIds: [],
      totalMedAskSymptomVignetteCount: 0,
      totalMedAskTriageVignetteCount: 0,
      averageMedAskTop5DiagnosticAccuracy0to1: null,
      averageMedAskTriageAccuracy0to1: null,
      averageMedAskReplayPassRate0to1: null,
      bioKgBenchRowCount: 0,
      bioKgBenchTaskKinds: [],
      failedBioKgBenchRowIds: [],
      totalBioKgBenchDatasetSampleCount: 0,
      totalBioKgBenchKgCheckAnnotatedCount: 0,
      totalBioKgBenchKgQaTestCount: 0,
      totalBioKgBenchScvTestCount: 0,
      totalBioKgBenchErrorDiscoveryCount: 0,
      averageBioKgBenchKgCheckAccuracy0to1: null,
      averageBioKgBenchKgQaAccuracy0to1: null,
      averageBioKgBenchScvAccuracy0to1: null,
      averageBioKgBenchReplayPassRate0to1: null,
      bioMedArenaRowCount: 0,
      bioMedArenaBenchmarkFamilies: [],
      bioMedArenaToolModes: [],
      failedBioMedArenaRowIds: [],
      totalBioMedArenaBenchmarkCount: 0,
      totalBioMedArenaToolCount: 0,
      totalBioMedArenaAdapterCount: 0,
      totalBioMedArenaVendorCount: 0,
      averageBioMedArenaScoreDelta0to1: null,
      averageBioMedArenaReplayPassRate0to1: null,
      averageBioMedArenaToolCoverage0to1: null,
      averageBioMedArenaBenchmarkCoverage0to1: null,
      bioMedArenaToolSandboxVerifiedRowCount: 0,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "biodsa-evidence-synthesis-001",
      status: "passed",
      biomedicalAgentEvaluation: {
        benchmarkId: "synthetic-biodsa-biomedical-suite",
        benchmarkVersion: "2026.06.13",
        taskType: "evidence_synthesis",
        workflowType: "multi_agent",
        taskManifestHash: bioTaskManifestHash,
        datasetSpecHash: bioDatasetSpecHash,
        knowledgeBaseManifestHash: bioKnowledgeBaseManifestHash,
        toolRegistryHash: bioToolRegistryHash,
        workflowGraphHash: bioWorkflowGraphHash,
        modelConfigHash: bioModelConfigHash,
        sandboxConfigHash: bioSandboxConfigHash,
        executionTraceHash: bioExecutionTraceHash,
        codeExecutionTraceHash: bioCodeExecutionTraceHash,
        structuredResultHash: bioStructuredResultHash,
        reportArtifactHash: bioReportArtifactHash,
        generatedArtifactManifestHash: bioGeneratedArtifactManifestHash,
        evaluatorConfigHash: bioEvaluatorConfigHash,
        taskCount: 6,
        completedTaskCount: 6,
        knowledgeBaseCount: 4,
        generatedArtifactCount: 3,
        score0to1: 0.84,
        minScore0to1: 0.8,
        safeCodeExecutionEnabled: true,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      biomedicalAgentEvaluationRowCount: 1,
      failedBiomedicalAgentEvaluationRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("Biomedical Agent Evaluation Rows: 1");
    expect(markdown).toContain("Biomedical Agent Task Types: evidence_synthesis");
    expect(markdown).toContain("Biomedical Agent Workflow Types: multi_agent");
    expect(markdown).toContain("synthetic-biodsa-biomedical-suite:evidence_synthesis:0.84");
  });

  test("fails closed when biomedical agent replay evidence lacks sandbox, artifacts, counts, or score gates", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "biodsa-biomedical-agent-eval-v1",
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "biodsa-missing-evidence",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            biomedicalAgentEvaluation: {
              benchmarkId: "synthetic-biodsa-biomedical-suite",
              benchmarkVersion: "2026.06.13",
              taskType: "clinical_matching",
              workflowType: "pipeline",
              taskManifestHash: bioTaskManifestHash,
              datasetSpecHash: "not-a-sha",
              knowledgeBaseManifestHash: bioKnowledgeBaseManifestHash,
              toolRegistryHash: bioToolRegistryHash,
              workflowGraphHash: bioWorkflowGraphHash,
              modelConfigHash: bioModelConfigHash,
              executionTraceHash: bioExecutionTraceHash,
              codeExecutionTraceHash: "bad-code-trace-hash",
              structuredResultHash: bioStructuredResultHash,
              reportArtifactHash: bioReportArtifactHash,
              generatedArtifactManifestHash: "bad-artifact-manifest-hash",
              evaluatorConfigHash: bioEvaluatorConfigHash,
              taskCount: 3,
              completedTaskCount: 4,
              knowledgeBaseCount: 0,
              generatedArtifactCount: 1,
              score0to1: 0.62,
              minScore0to1: 0.8,
              safeCodeExecutionEnabled: false,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.biomedicalAgentEvaluationSummary).toMatchObject({
      rowCount: 1,
      taskTypes: ["clinical_matching"],
      workflowTypes: ["pipeline"],
      failedRowIds: ["biodsa-missing-evidence"],
      totalTaskCount: 3,
      totalCompletedTaskCount: 4,
      totalKnowledgeBaseCount: 0,
      totalGeneratedArtifactCount: 1,
      averageScore0to1: 0.62,
      safeCodeExecutionRowCount: 0,
    });
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toEqual(expect.arrayContaining([
      "biomedical agent evaluation dataset spec hash invalid",
      "biomedical agent evaluation sandbox config hash invalid",
      "biomedical agent evaluation code execution trace hash invalid",
      "biomedical agent evaluation generated artifact manifest hash invalid",
      "biomedical agent evaluation completed task count exceeds task count",
      "biomedical agent evaluation score below threshold",
      "biomedical agent evaluation safe code execution disabled",
    ]));
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedRowIds: ["biodsa-missing-evidence"],
      biomedicalAgentEvaluationRowCount: 1,
      failedBiomedicalAgentEvaluationRowIds: ["biodsa-missing-evidence"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "biodsa-missing-evidence",
      severity: "critical",
    });
  });

  test("binds MedAsk SymptomCheck and Triage benchmark replay proof into biomedical receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "medask-clinical-agent-replay-v1",
      sourceRefs: ["https://github.com/medaks/medask-benchmarks"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "medask-symptomcheck-triage-complete",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            biomedicalAgentEvaluation: {
              benchmarkId: "medask-benchmarks",
              benchmarkVersion: "2026.06.15",
              taskType: "diagnostic_accuracy",
              workflowType: "simulated_consultation",
              taskManifestHash: bioTaskManifestHash,
              datasetSpecHash: bioDatasetSpecHash,
              knowledgeBaseManifestHash: bioKnowledgeBaseManifestHash,
              toolRegistryHash: bioToolRegistryHash,
              workflowGraphHash: bioWorkflowGraphHash,
              modelConfigHash: bioModelConfigHash,
              sandboxConfigHash: bioSandboxConfigHash,
              executionTraceHash: bioExecutionTraceHash,
              codeExecutionTraceHash: bioCodeExecutionTraceHash,
              structuredResultHash: bioStructuredResultHash,
              reportArtifactHash: bioReportArtifactHash,
              generatedArtifactManifestHash: bioGeneratedArtifactManifestHash,
              evaluatorConfigHash: bioEvaluatorConfigHash,
              taskCount: 8,
              completedTaskCount: 8,
              knowledgeBaseCount: 2,
              generatedArtifactCount: 2,
              score0to1: 0.86,
              minScore0to1: 0.8,
              safeCodeExecutionEnabled: true,
              medAskSourceRefHash,
              medAskRepositorySnapshotHash,
              medAskLicenseRefHash,
              medAskRequirementsHash,
              medAskSetupHash,
              medAskSymptomCheckVignetteManifestHash,
              medAskTriageVignetteManifestHash,
              medAskSymptomCheckEvaluationScriptHash,
              medAskTriageEvaluationScriptHash,
              medAskPatientSimulatorConfigHash,
              medAskDoctorModelConfigHash,
              medAskTriageModelConfigHash,
              medAskSymptomCheckResultManifestHash,
              medAskTriageResultManifestHash,
              medAskPairedAnalysisHash,
              medAskRunCommandHash,
              medAskReplayCommandHash,
              medAskClinicalTasks: ["symptomcheck", "triage"],
              minMedAskClinicalTaskCount: 2,
              medAskDeterministicSeed: 42,
              medAskSymptomVignetteCount: 5,
              minMedAskSymptomVignetteCount: 5,
              medAskTriageVignetteCount: 3,
              minMedAskTriageVignetteCount: 3,
              medAskTop5DiagnosticAccuracy0to1: 0.82,
              minMedAskTop5DiagnosticAccuracy0to1: 0.75,
              medAskTriageAccuracy0to1: 0.88,
              minMedAskTriageAccuracy0to1: 0.8,
              medAskUrgencyClassCoverage0to1: 1,
              minMedAskUrgencyClassCoverage0to1: 1,
              medAskReplayPassRate0to1: 1,
              minMedAskReplayPassRate0to1: 0.95,
              medAskScoreDelta0to1: 0.04,
              maxMedAskScoreRegression0to1: 0.01,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.biomedicalAgentEvaluationSummary).toMatchObject({
      rowCount: 1,
      taskTypes: ["diagnostic_accuracy"],
      workflowTypes: ["simulated_consultation"],
      failedRowIds: [],
      medAskRowCount: 1,
      medAskClinicalTasks: ["symptomcheck", "triage"],
      failedMedAskRowIds: [],
      totalMedAskSymptomVignetteCount: 5,
      totalMedAskTriageVignetteCount: 3,
      averageMedAskTop5DiagnosticAccuracy0to1: 0.82,
      averageMedAskTriageAccuracy0to1: 0.88,
      averageMedAskReplayPassRate0to1: 1,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "medask-symptomcheck-triage-complete",
      status: "passed",
      biomedicalAgentEvaluation: {
        benchmarkId: "medask-benchmarks",
        taskType: "diagnostic_accuracy",
        workflowType: "simulated_consultation",
        medAskClinicalTasks: ["symptomcheck", "triage"],
        medAskSymptomVignetteCount: 5,
        medAskTriageVignetteCount: 3,
        medAskReplayPassRate0to1: 1,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      biomedicalAgentEvaluationRowCount: 1,
      medAskRowCount: 1,
      failedMedAskRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("MedAsk Rows: 1");
    expect(markdown).toContain("MedAsk Clinical Tasks: symptomcheck, triage");
    expect(markdown).toContain("medask-benchmarks:diagnostic_accuracy:medask:1");
  });

  test("fails closed when MedAsk benchmark replay proof lacks vignettes, results, commands, seed, or thresholds", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "medask-clinical-agent-replay-v1",
      sourceRefs: ["https://github.com/medaks/medask-benchmarks"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "medask-missing-replay-proof",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            biomedicalAgentEvaluation: {
              benchmarkId: "medask-benchmarks",
              benchmarkVersion: "2026.06.15",
              taskType: "medical_triage",
              workflowType: "triage_classification",
              taskManifestHash: bioTaskManifestHash,
              datasetSpecHash: bioDatasetSpecHash,
              knowledgeBaseManifestHash: bioKnowledgeBaseManifestHash,
              toolRegistryHash: bioToolRegistryHash,
              workflowGraphHash: bioWorkflowGraphHash,
              modelConfigHash: bioModelConfigHash,
              sandboxConfigHash: bioSandboxConfigHash,
              executionTraceHash: bioExecutionTraceHash,
              codeExecutionTraceHash: bioCodeExecutionTraceHash,
              structuredResultHash: bioStructuredResultHash,
              reportArtifactHash: bioReportArtifactHash,
              generatedArtifactManifestHash: bioGeneratedArtifactManifestHash,
              evaluatorConfigHash: bioEvaluatorConfigHash,
              taskCount: 4,
              completedTaskCount: 4,
              knowledgeBaseCount: 1,
              generatedArtifactCount: 1,
              score0to1: 0.81,
              minScore0to1: 0.8,
              safeCodeExecutionEnabled: true,
              medAskSourceRefHash: "not-a-sha",
              medAskRepositorySnapshotHash,
              medAskLicenseRefHash,
              medAskRequirementsHash,
              medAskSetupHash,
              medAskSymptomCheckVignetteManifestHash,
              medAskTriageVignetteManifestHash: "bad-triage-vignettes",
              medAskSymptomCheckEvaluationScriptHash,
              medAskTriageEvaluationScriptHash,
              medAskPatientSimulatorConfigHash,
              medAskDoctorModelConfigHash,
              medAskTriageModelConfigHash,
              medAskSymptomCheckResultManifestHash,
              medAskTriageResultManifestHash: "bad-triage-results",
              medAskPairedAnalysisHash,
              medAskRunCommandHash,
              medAskReplayCommandHash: "bad-replay-command",
              medAskClinicalTasks: ["triage"],
              minMedAskClinicalTaskCount: 2,
              medAskSymptomVignetteCount: 1,
              minMedAskSymptomVignetteCount: 5,
              medAskTriageVignetteCount: 1,
              minMedAskTriageVignetteCount: 3,
              medAskTop5DiagnosticAccuracy0to1: 0.7,
              minMedAskTop5DiagnosticAccuracy0to1: 0.75,
              medAskTriageAccuracy0to1: 0.72,
              minMedAskTriageAccuracy0to1: 0.8,
              medAskUrgencyClassCoverage0to1: 0.67,
              minMedAskUrgencyClassCoverage0to1: 1,
              medAskReplayPassRate0to1: 0.5,
              minMedAskReplayPassRate0to1: 0.95,
              medAskScoreDelta0to1: -0.04,
              maxMedAskScoreRegression0to1: 0.01,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.biomedicalAgentEvaluationSummary).toMatchObject({
      medAskRowCount: 1,
      medAskClinicalTasks: ["triage"],
      failedMedAskRowIds: ["medask-missing-replay-proof"],
      totalMedAskSymptomVignetteCount: 1,
      totalMedAskTriageVignetteCount: 1,
      averageMedAskReplayPassRate0to1: 0.5,
    });
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toEqual(expect.arrayContaining([
      "biomedical agent evaluation medask source ref hash invalid",
      "biomedical agent evaluation medask triage vignette manifest hash invalid",
      "biomedical agent evaluation medask triage result manifest hash invalid",
      "biomedical agent evaluation medask replay command hash invalid",
      "biomedical agent evaluation medask clinical task count below threshold",
      "biomedical agent evaluation medask deterministic seed missing",
      "biomedical agent evaluation medask symptom vignette count below threshold",
      "biomedical agent evaluation medask triage vignette count below threshold",
      "biomedical agent evaluation medask top5 diagnostic accuracy below threshold",
      "biomedical agent evaluation medask triage accuracy below threshold",
      "biomedical agent evaluation medask urgency class coverage below threshold",
      "biomedical agent evaluation medask replay pass rate below threshold",
      "biomedical agent evaluation medask score regression exceeds threshold",
    ]));
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      medAskRowCount: 1,
      failedMedAskRowIds: ["medask-missing-replay-proof"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "medask-missing-replay-proof",
      severity: "critical",
    });
  });

  test("binds BioKGBench KGCheck, KGQA, and SCV replay proof into biomedical receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "biokgbench-biomedical-kg-replay-v1",
      sourceRefs: [
        "https://github.com/westlake-autolab/BioKGBench",
        "https://arxiv.org/abs/2407.00466",
      ],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "biokgbench-kgcheck-complete",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            biomedicalAgentEvaluation: {
              benchmarkId: "biokgbench",
              benchmarkVersion: "2024.06.06",
              taskType: "literature_database_qa",
              workflowType: "pipeline",
              taskManifestHash: bioTaskManifestHash,
              datasetSpecHash: bioDatasetSpecHash,
              knowledgeBaseManifestHash: bioKnowledgeBaseManifestHash,
              toolRegistryHash: bioToolRegistryHash,
              workflowGraphHash: bioWorkflowGraphHash,
              modelConfigHash: bioModelConfigHash,
              sandboxConfigHash: bioSandboxConfigHash,
              executionTraceHash: bioExecutionTraceHash,
              codeExecutionTraceHash: bioCodeExecutionTraceHash,
              structuredResultHash: bioStructuredResultHash,
              reportArtifactHash: bioReportArtifactHash,
              generatedArtifactManifestHash: bioGeneratedArtifactManifestHash,
              evaluatorConfigHash: bioEvaluatorConfigHash,
              taskCount: 12,
              completedTaskCount: 12,
              knowledgeBaseCount: 1,
              generatedArtifactCount: 2,
              score0to1: 0.83,
              minScore0to1: 0.8,
              safeCodeExecutionEnabled: true,
              bioKgBenchSourceRefHash,
              bioKgBenchRepositorySnapshotHash,
              bioKgBenchPaperRefHash,
              bioKgBenchLicenseRefHash,
              bioKgBenchDatasetReleaseHash,
              bioKgBenchKnowledgeGraphManifestHash,
              bioKgBenchKgBuildConfigHash,
              bioKgBenchTaskManifestHash,
              bioKgBenchKgCheckManifestHash,
              bioKgBenchKgQaManifestHash,
              bioKgBenchScvManifestHash,
              bioKgBenchAgentConfigHash,
              bioKgBenchRagConfigHash,
              bioKgBenchNeo4jConfigHash,
              bioKgBenchEvaluationScriptHash,
              bioKgBenchResultManifestHash,
              bioKgBenchErrorDiscoveryReportHash,
              bioKgBenchReplayCommandHash,
              bioKgBenchCiReceiptHash,
              bioKgBenchTaskKinds: ["kgcheck", "kgqa", "scv"],
              minBioKgBenchTaskKindCount: 3,
              bioKgBenchDeterministicSeed: 495,
              bioKgBenchDatasetSampleCount: 2128,
              minBioKgBenchDatasetSampleCount: 100,
              bioKgBenchKgCheckAnnotatedCount: 225,
              minBioKgBenchKgCheckAnnotatedCount: 100,
              bioKgBenchKgQaTestCount: 638,
              minBioKgBenchKgQaTestCount: 100,
              bioKgBenchScvTestCount: 1265,
              minBioKgBenchScvTestCount: 100,
              bioKgBenchKgCheckAccuracy0to1: 0.78,
              minBioKgBenchKgCheckAccuracy0to1: 0.7,
              bioKgBenchKgQaAccuracy0to1: 0.81,
              minBioKgBenchKgQaAccuracy0to1: 0.75,
              bioKgBenchScvAccuracy0to1: 0.84,
              minBioKgBenchScvAccuracy0to1: 0.75,
              bioKgBenchErrorDiscoveryCount: 91,
              minBioKgBenchErrorDiscoveryCount: 10,
              bioKgBenchReplayPassRate0to1: 1,
              minBioKgBenchReplayPassRate0to1: 0.95,
              bioKgBenchScoreDelta0to1: 0.03,
              maxBioKgBenchScoreRegression0to1: 0.02,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.biomedicalAgentEvaluationSummary).toMatchObject({
      rowCount: 1,
      taskTypes: ["literature_database_qa"],
      workflowTypes: ["pipeline"],
      failedRowIds: [],
      bioKgBenchRowCount: 1,
      bioKgBenchTaskKinds: ["kgcheck", "kgqa", "scv"],
      failedBioKgBenchRowIds: [],
      totalBioKgBenchDatasetSampleCount: 2128,
      totalBioKgBenchKgCheckAnnotatedCount: 225,
      totalBioKgBenchKgQaTestCount: 638,
      totalBioKgBenchScvTestCount: 1265,
      totalBioKgBenchErrorDiscoveryCount: 91,
      averageBioKgBenchKgCheckAccuracy0to1: 0.78,
      averageBioKgBenchKgQaAccuracy0to1: 0.81,
      averageBioKgBenchScvAccuracy0to1: 0.84,
      averageBioKgBenchReplayPassRate0to1: 1,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "biokgbench-kgcheck-complete",
      status: "passed",
      biomedicalAgentEvaluation: {
        benchmarkId: "biokgbench",
        taskType: "literature_database_qa",
        workflowType: "pipeline",
        bioKgBenchTaskKinds: ["kgcheck", "kgqa", "scv"],
        bioKgBenchDatasetSampleCount: 2128,
        bioKgBenchReplayPassRate0to1: 1,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      biomedicalAgentEvaluationRowCount: 1,
      bioKgBenchRowCount: 1,
      failedBioKgBenchRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("BioKGBench Rows: 1");
    expect(markdown).toContain("BioKGBench Task Kinds: kgcheck, kgqa, scv");
    expect(markdown).toContain("biokgbench:literature_database_qa:biokgbench:1");
  });

  test("fails closed when BioKGBench replay proof lacks KG, dataset, task, replay, or threshold evidence", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "biokgbench-biomedical-kg-replay-v1",
      sourceRefs: ["https://github.com/westlake-autolab/BioKGBench"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "biokgbench-missing-replay-proof",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            biomedicalAgentEvaluation: {
              benchmarkId: "biokgbench",
              benchmarkVersion: "2024.06.06",
              taskType: "literature_database_qa",
              workflowType: "pipeline",
              taskManifestHash: bioTaskManifestHash,
              datasetSpecHash: bioDatasetSpecHash,
              knowledgeBaseManifestHash: bioKnowledgeBaseManifestHash,
              toolRegistryHash: bioToolRegistryHash,
              workflowGraphHash: bioWorkflowGraphHash,
              modelConfigHash: bioModelConfigHash,
              sandboxConfigHash: bioSandboxConfigHash,
              executionTraceHash: bioExecutionTraceHash,
              codeExecutionTraceHash: bioCodeExecutionTraceHash,
              structuredResultHash: bioStructuredResultHash,
              reportArtifactHash: bioReportArtifactHash,
              generatedArtifactManifestHash: bioGeneratedArtifactManifestHash,
              evaluatorConfigHash: bioEvaluatorConfigHash,
              taskCount: 12,
              completedTaskCount: 12,
              knowledgeBaseCount: 1,
              generatedArtifactCount: 2,
              score0to1: 0.83,
              minScore0to1: 0.8,
              safeCodeExecutionEnabled: true,
              bioKgBenchSourceRefHash: "not-a-sha",
              bioKgBenchRepositorySnapshotHash,
              bioKgBenchPaperRefHash,
              bioKgBenchLicenseRefHash: null,
              bioKgBenchDatasetReleaseHash,
              bioKgBenchKnowledgeGraphManifestHash: null,
              bioKgBenchKgBuildConfigHash,
              bioKgBenchTaskManifestHash: null,
              bioKgBenchKgCheckManifestHash,
              bioKgBenchKgQaManifestHash,
              bioKgBenchScvManifestHash: "bad-scv-manifest",
              bioKgBenchAgentConfigHash,
              bioKgBenchRagConfigHash,
              bioKgBenchNeo4jConfigHash,
              bioKgBenchEvaluationScriptHash,
              bioKgBenchResultManifestHash,
              bioKgBenchErrorDiscoveryReportHash: null,
              bioKgBenchReplayCommandHash: "bad-replay",
              bioKgBenchCiReceiptHash: null,
              bioKgBenchTaskKinds: ["kgcheck"],
              minBioKgBenchTaskKindCount: 3,
              bioKgBenchDatasetSampleCount: 12,
              minBioKgBenchDatasetSampleCount: 100,
              bioKgBenchKgCheckAnnotatedCount: 20,
              minBioKgBenchKgCheckAnnotatedCount: 100,
              bioKgBenchKgQaTestCount: 0,
              minBioKgBenchKgQaTestCount: 100,
              bioKgBenchScvTestCount: 0,
              minBioKgBenchScvTestCount: 100,
              bioKgBenchKgCheckAccuracy0to1: 0.61,
              minBioKgBenchKgCheckAccuracy0to1: 0.7,
              bioKgBenchKgQaAccuracy0to1: null,
              minBioKgBenchKgQaAccuracy0to1: 0.75,
              bioKgBenchScvAccuracy0to1: 0.52,
              minBioKgBenchScvAccuracy0to1: 0.75,
              bioKgBenchErrorDiscoveryCount: 2,
              minBioKgBenchErrorDiscoveryCount: 10,
              bioKgBenchReplayPassRate0to1: 0.5,
              minBioKgBenchReplayPassRate0to1: 0.95,
              bioKgBenchScoreDelta0to1: -0.04,
              maxBioKgBenchScoreRegression0to1: 0.02,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.biomedicalAgentEvaluationSummary).toMatchObject({
      bioKgBenchRowCount: 1,
      bioKgBenchTaskKinds: ["kgcheck"],
      failedBioKgBenchRowIds: ["biokgbench-missing-replay-proof"],
      totalBioKgBenchDatasetSampleCount: 12,
      totalBioKgBenchErrorDiscoveryCount: 2,
      averageBioKgBenchReplayPassRate0to1: 0.5,
    });
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toEqual(expect.arrayContaining([
      "biomedical agent evaluation biokgbench source ref hash invalid",
      "biomedical agent evaluation biokgbench license ref hash invalid",
      "biomedical agent evaluation biokgbench knowledge graph manifest hash invalid",
      "biomedical agent evaluation biokgbench task manifest hash invalid",
      "biomedical agent evaluation biokgbench scv manifest hash invalid",
      "biomedical agent evaluation biokgbench error discovery report hash invalid",
      "biomedical agent evaluation biokgbench replay command hash invalid",
      "biomedical agent evaluation biokgbench ci receipt hash invalid",
      "biomedical agent evaluation biokgbench task kind count below threshold",
      "biomedical agent evaluation biokgbench deterministic seed missing",
      "biomedical agent evaluation biokgbench dataset sample count below threshold",
      "biomedical agent evaluation biokgbench kgcheck annotated count below threshold",
      "biomedical agent evaluation biokgbench kgqa test count below threshold",
      "biomedical agent evaluation biokgbench scv test count below threshold",
      "biomedical agent evaluation biokgbench kgcheck accuracy below threshold",
      "biomedical agent evaluation biokgbench kgqa accuracy missing",
      "biomedical agent evaluation biokgbench scv accuracy below threshold",
      "biomedical agent evaluation biokgbench error discovery count below threshold",
      "biomedical agent evaluation biokgbench replay pass rate below threshold",
      "biomedical agent evaluation biokgbench score regression exceeds threshold",
    ]));
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      bioKgBenchRowCount: 1,
      failedBioKgBenchRowIds: ["biokgbench-missing-replay-proof"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "biokgbench-missing-replay-proof",
      severity: "critical",
    });
  });

  test("binds BioMedArena benchmark, tool, adapter, baseline, and replay proof into biomedical receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "biomedarena-biomedical-agent-replay-v1",
      sourceRefs: ["https://github.com/AI-in-Health/BioMedArena"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "biomedarena-complete",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            biomedicalAgentEvaluation: {
              benchmarkId: "biomedarena",
              benchmarkVersion: "2026.06.01",
              taskType: "hard_reasoning_qa",
              workflowType: "multi_agent",
              taskManifestHash: bioTaskManifestHash,
              datasetSpecHash: bioDatasetSpecHash,
              knowledgeBaseManifestHash: bioKnowledgeBaseManifestHash,
              toolRegistryHash: bioToolRegistryHash,
              workflowGraphHash: bioWorkflowGraphHash,
              modelConfigHash: bioModelConfigHash,
              sandboxConfigHash: bioSandboxConfigHash,
              executionTraceHash: bioExecutionTraceHash,
              codeExecutionTraceHash: bioCodeExecutionTraceHash,
              structuredResultHash: bioStructuredResultHash,
              reportArtifactHash: bioReportArtifactHash,
              generatedArtifactManifestHash: bioGeneratedArtifactManifestHash,
              evaluatorConfigHash: bioEvaluatorConfigHash,
              taskCount: 24,
              completedTaskCount: 24,
              knowledgeBaseCount: 6,
              generatedArtifactCount: 4,
              score0to1: 0.83,
              minScore0to1: 0.8,
              safeCodeExecutionEnabled: true,
              bioMedArenaSourceRefHash,
              bioMedArenaRepositorySnapshotHash,
              bioMedArenaLicenseRefHash,
              bioMedArenaReadmeHash,
              bioMedArenaPyprojectHash,
              bioMedArenaConfigHash,
              bioMedArenaMatrixConfigHash,
              bioMedArenaHarnessTreeHash,
              bioMedArenaHarnessCliHash,
              bioMedArenaBenchmarkConfigHash,
              bioMedArenaEvalSuiteHash,
              bioMedArenaAdapterRegistryHash,
              bioMedArenaToolRegistryHash,
              bioMedArenaVendorManifestHash,
              bioMedArenaBaselineAgentHash,
              bioMedArenaQuickRunHash,
              bioMedArenaReleaseGateHash,
              bioMedArenaResultManifestHash,
              bioMedArenaReplayCommandHash,
              bioMedArenaCiReceiptHash,
              bioMedArenaBenchmarkFamilies: [
                "clinical_qa",
                "medical_imaging",
                "bioinformatics",
                "drug_discovery",
                "tool_use",
              ],
              minBioMedArenaBenchmarkFamilyCount: 5,
              bioMedArenaToolModes: ["native", "mcp", "retrieval", "vendor"],
              minBioMedArenaToolModeCount: 4,
              bioMedArenaDeterministicSeed: 20260601,
              bioMedArenaBenchmarkCount: 120,
              minBioMedArenaBenchmarkCount: 100,
              bioMedArenaToolCount: 74,
              minBioMedArenaToolCount: 70,
              bioMedArenaAdapterCount: 32,
              minBioMedArenaAdapterCount: 20,
              bioMedArenaVendorCount: 2,
              minBioMedArenaVendorCount: 1,
              bioMedArenaBaselineScore0to1: 0.71,
              bioMedArenaCandidateScore0to1: 0.83,
              bioMedArenaScoreDelta0to1: 0.12,
              maxBioMedArenaScoreRegression0to1: 0.02,
              bioMedArenaReplayPassRate0to1: 1,
              minBioMedArenaReplayPassRate0to1: 1,
              bioMedArenaToolCoverage0to1: 0.96,
              minBioMedArenaToolCoverage0to1: 0.9,
              bioMedArenaBenchmarkCoverage0to1: 0.92,
              minBioMedArenaBenchmarkCoverage0to1: 0.9,
              bioMedArenaToolSandboxVerified: true,
            },
          },
          baseline: {
            score0to1: 0.71,
            evidenceRefs: ["trace:baseline-biomedarena"],
            signedEvidenceRefs: ["ledger:sig-baseline-biomedarena"],
          },
          candidate: {
            score0to1: 0.83,
            evidenceRefs: ["trace:candidate-biomedarena"],
            signedEvidenceRefs: ["ledger:sig-candidate-biomedarena"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.biomedicalAgentEvaluationSummary).toMatchObject({
      rowCount: 1,
      taskTypes: ["hard_reasoning_qa"],
      workflowTypes: ["multi_agent"],
      failedRowIds: [],
      bioMedArenaRowCount: 1,
      bioMedArenaBenchmarkFamilies: [
        "clinical_qa",
        "medical_imaging",
        "bioinformatics",
        "drug_discovery",
        "tool_use",
      ],
      bioMedArenaToolModes: ["native", "mcp", "retrieval", "vendor"],
      failedBioMedArenaRowIds: [],
      totalBioMedArenaBenchmarkCount: 120,
      totalBioMedArenaToolCount: 74,
      totalBioMedArenaAdapterCount: 32,
      totalBioMedArenaVendorCount: 2,
      averageBioMedArenaScoreDelta0to1: 0.12,
      averageBioMedArenaReplayPassRate0to1: 1,
      averageBioMedArenaToolCoverage0to1: 0.96,
      averageBioMedArenaBenchmarkCoverage0to1: 0.92,
      bioMedArenaToolSandboxVerifiedRowCount: 1,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "biomedarena-complete",
      status: "passed",
      biomedicalAgentEvaluation: {
        benchmarkId: "biomedarena",
        taskType: "hard_reasoning_qa",
        workflowType: "multi_agent",
        bioMedArenaBenchmarkCount: 120,
        bioMedArenaToolCount: 74,
        bioMedArenaReplayPassRate0to1: 1,
        bioMedArenaToolSandboxVerified: true,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      biomedicalAgentEvaluationRowCount: 1,
      bioMedArenaRowCount: 1,
      failedBioMedArenaRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("BioMedArena Rows: 1");
    expect(markdown).toContain("BioMedArena Benchmark Families: clinical_qa, medical_imaging, bioinformatics, drug_discovery, tool_use");
    expect(markdown).toContain("BioMedArena Tool Modes: native, mcp, retrieval, vendor");
    expect(markdown).toContain("biomedarena:hard_reasoning_qa:biomedarena:1");
    expect(verifyReplayBenchmarkCorpusReceipt(result.manifest, result.ciReceipt).valid).toBe(true);
  });

  test("fails closed when BioMedArena replay proof lacks source, harness, tool, baseline, or CI evidence", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "biomedarena-biomedical-agent-replay-v1",
      sourceRefs: ["https://github.com/AI-in-Health/BioMedArena"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "biomedarena-missing-proof",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            biomedicalAgentEvaluation: {
              benchmarkId: "biomedarena",
              benchmarkVersion: "2026.06.01",
              taskType: "hard_reasoning_qa",
              workflowType: "multi_agent",
              taskManifestHash: bioTaskManifestHash,
              datasetSpecHash: bioDatasetSpecHash,
              knowledgeBaseManifestHash: bioKnowledgeBaseManifestHash,
              toolRegistryHash: bioToolRegistryHash,
              workflowGraphHash: bioWorkflowGraphHash,
              modelConfigHash: bioModelConfigHash,
              sandboxConfigHash: bioSandboxConfigHash,
              executionTraceHash: bioExecutionTraceHash,
              codeExecutionTraceHash: bioCodeExecutionTraceHash,
              structuredResultHash: bioStructuredResultHash,
              reportArtifactHash: bioReportArtifactHash,
              generatedArtifactManifestHash: bioGeneratedArtifactManifestHash,
              evaluatorConfigHash: bioEvaluatorConfigHash,
              taskCount: 20,
              completedTaskCount: 20,
              knowledgeBaseCount: 6,
              generatedArtifactCount: 4,
              score0to1: 0.66,
              minScore0to1: 0.8,
              safeCodeExecutionEnabled: true,
              bioMedArenaSourceRefHash: "not-a-sha",
              bioMedArenaRepositorySnapshotHash,
              bioMedArenaLicenseRefHash: null,
              bioMedArenaReadmeHash,
              bioMedArenaPyprojectHash,
              bioMedArenaConfigHash: "bad-config",
              bioMedArenaMatrixConfigHash,
              bioMedArenaHarnessTreeHash: null,
              bioMedArenaHarnessCliHash,
              bioMedArenaBenchmarkConfigHash,
              bioMedArenaEvalSuiteHash: "bad-eval-suite",
              bioMedArenaAdapterRegistryHash,
              bioMedArenaToolRegistryHash: null,
              bioMedArenaVendorManifestHash,
              bioMedArenaBaselineAgentHash,
              bioMedArenaQuickRunHash,
              bioMedArenaReleaseGateHash,
              bioMedArenaResultManifestHash: "bad-result-manifest",
              bioMedArenaReplayCommandHash: "bad-replay",
              bioMedArenaCiReceiptHash: null,
              bioMedArenaBenchmarkFamilies: ["clinical_qa"],
              minBioMedArenaBenchmarkFamilyCount: 4,
              bioMedArenaToolModes: [],
              minBioMedArenaToolModeCount: 3,
              bioMedArenaBenchmarkCount: 20,
              minBioMedArenaBenchmarkCount: 100,
              bioMedArenaToolCount: 12,
              minBioMedArenaToolCount: 70,
              bioMedArenaAdapterCount: 4,
              minBioMedArenaAdapterCount: 20,
              bioMedArenaVendorCount: 0,
              minBioMedArenaVendorCount: 1,
              bioMedArenaCandidateScore0to1: 0.66,
              bioMedArenaScoreDelta0to1: -0.06,
              maxBioMedArenaScoreRegression0to1: 0.02,
              bioMedArenaReplayPassRate0to1: 0.5,
              minBioMedArenaReplayPassRate0to1: 1,
              bioMedArenaToolCoverage0to1: 0.55,
              minBioMedArenaToolCoverage0to1: 0.9,
              bioMedArenaBenchmarkCoverage0to1: 0.4,
              minBioMedArenaBenchmarkCoverage0to1: 0.9,
              bioMedArenaToolSandboxVerified: false,
            },
          },
          baseline: {
            score0to1: 0.72,
            evidenceRefs: ["trace:baseline-biomedarena-missing"],
            signedEvidenceRefs: ["ledger:sig-baseline-biomedarena-missing"],
          },
          candidate: {
            score0to1: 0.66,
            evidenceRefs: ["trace:candidate-biomedarena-missing"],
            signedEvidenceRefs: ["ledger:sig-candidate-biomedarena-missing"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.biomedicalAgentEvaluationSummary).toMatchObject({
      bioMedArenaRowCount: 1,
      bioMedArenaBenchmarkFamilies: ["clinical_qa"],
      bioMedArenaToolModes: [],
      failedBioMedArenaRowIds: ["biomedarena-missing-proof"],
      totalBioMedArenaBenchmarkCount: 20,
      totalBioMedArenaToolCount: 12,
      averageBioMedArenaReplayPassRate0to1: 0.5,
      bioMedArenaToolSandboxVerifiedRowCount: 0,
    });
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toEqual(expect.arrayContaining([
      "biomedical agent evaluation biomedarena source ref hash invalid",
      "biomedical agent evaluation biomedarena license ref hash invalid",
      "biomedical agent evaluation biomedarena config hash invalid",
      "biomedical agent evaluation biomedarena harness tree hash invalid",
      "biomedical agent evaluation biomedarena eval suite hash invalid",
      "biomedical agent evaluation biomedarena tool registry hash invalid",
      "biomedical agent evaluation biomedarena result manifest hash invalid",
      "biomedical agent evaluation biomedarena replay command hash invalid",
      "biomedical agent evaluation biomedarena ci receipt hash invalid",
      "biomedical agent evaluation biomedarena benchmark family count below threshold",
      "biomedical agent evaluation biomedarena tool mode count missing",
      "biomedical agent evaluation biomedarena deterministic seed missing",
      "biomedical agent evaluation biomedarena benchmark count below threshold",
      "biomedical agent evaluation biomedarena tool count below threshold",
      "biomedical agent evaluation biomedarena adapter count below threshold",
      "biomedical agent evaluation biomedarena vendor count below threshold",
      "biomedical agent evaluation biomedarena baseline score missing",
      "biomedical agent evaluation biomedarena score regression exceeds threshold",
      "biomedical agent evaluation biomedarena replay pass rate below threshold",
      "biomedical agent evaluation biomedarena tool coverage below threshold",
      "biomedical agent evaluation biomedarena benchmark coverage below threshold",
      "biomedical agent evaluation biomedarena tool sandbox not verified",
    ]));
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      bioMedArenaRowCount: 1,
      failedBioMedArenaRowIds: ["biomedarena-missing-proof"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "biomedarena-missing-proof",
      severity: "critical",
    });
  });

  test("binds ML-development workflow benchmark fixtures, deterministic replay commands, traces, and score deltas", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      agentId: "ml-workflow-agent",
      corpusId: "synthetic-ml-dev-workflow-replay-v1",
      sourceRefs: [
        "https://github.com/ml-dev-bench/ml-dev-bench",
        "https://arxiv.org/abs/2502.00964",
      ],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "ml-dev-dataset-handling-pass",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            task: "Replay a synthetic ML dataset-preparation workflow with deterministic validation.",
            mlDevBenchmark: {
              benchmarkId: "synthetic-ml-dev-workflow-suite",
              benchmarkVersion: "2026.06.13",
              paperRefHash: mlDevPaperRefHash,
              taskSuiteHash: mlDevTaskSuiteHash,
              taskCategory: "dataset_handling",
              problemDomain: "image_classification",
              taskId: "synthetic-dataset-ingestion-smoke",
              taskConfigHash: mlDevTaskConfigHash,
              workspaceFixtureHash: mlDevWorkspaceFixtureHash,
              runtimeEnvironmentHash: mlDevRuntimeEnvironmentHash,
              dependencyLockHash: mlDevDependencyLockHash,
              agentHarness: "react",
              agentConfigHash: mlDevAgentConfigHash,
              calipersConfigHash: mlDevCalipersConfigHash,
              hydraOverrideHash: mlDevHydraOverrideHash,
              metricsConfigHash: mlDevMetricsConfigHash,
              scoringMode: "hybrid",
              validationScriptHash: mlDevValidationScriptHash,
              replayCommandHash: mlDevReplayCommandHash,
              deterministicSeed: 7,
              runCount: 3,
              baselineMetric0to1: 0.62,
              candidateMetric0to1: 0.8,
              scoreDelta0to1: 0.18,
              taskPassRate0to1: 0.92,
              reportArtifactHash: mlDevReportArtifactHash,
              traceArtifactHash: mlDevTraceArtifactHash,
              minCandidateMetric0to1: 0.75,
              minTaskPassRate0to1: 0.9,
              maxScoreRegression0to1: 0.03,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.mlDevBenchmarkSummary).toEqual({
      rowCount: 1,
      benchmarkIds: ["synthetic-ml-dev-workflow-suite"],
      taskCategories: ["dataset_handling"],
      problemDomains: ["image_classification"],
      agentHarnesses: ["react"],
      failedRowIds: [],
      totalRunCount: 3,
      averageBaselineMetric0to1: 0.62,
      averageCandidateMetric0to1: 0.8,
      averageScoreDelta0to1: 0.18,
      averageTaskPassRate0to1: 0.92,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "ml-dev-dataset-handling-pass",
      status: "passed",
      mlDevBenchmark: {
        benchmarkId: "synthetic-ml-dev-workflow-suite",
        taskCategory: "dataset_handling",
        problemDomain: "image_classification",
        agentHarness: "react",
        scoringMode: "hybrid",
        deterministicSeed: 7,
        runCount: 3,
        candidateMetric0to1: 0.8,
        scoreDelta0to1: 0.18,
        taskPassRate0to1: 0.92,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      mlDevBenchmarkRowCount: 1,
      failedMlDevBenchmarkRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("ML-Dev Benchmark Rows: 1");
    expect(markdown).toContain("ML-Dev Benchmark Task Categories: dataset_handling");
    expect(markdown).toContain("synthetic-dataset-ingestion-smoke:dataset_handling:0.8");
    expect(verifyReplayBenchmarkCorpusReceipt(result.manifest, result.ciReceipt)).toEqual({
      valid: true,
      errors: [],
    });
  });

  test("fails closed when ML-development replay evidence lacks workflow artifacts, counts, or metric gates", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      agentId: "ml-workflow-agent",
      corpusId: "synthetic-ml-dev-workflow-replay-v1",
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "ml-dev-missing-replay-proof",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            task: "Replay a synthetic ML debugging workflow with deterministic validation.",
            mlDevBenchmark: {
              benchmarkId: "synthetic-ml-dev-workflow-suite",
              benchmarkVersion: "2026.06.13",
              paperRefHash: mlDevPaperRefHash,
              taskSuiteHash: "not-a-sha",
              taskCategory: "debugging",
              problemDomain: "segmentation",
              taskId: "synthetic-debugging-regression",
              taskConfigHash: mlDevTaskConfigHash,
              workspaceFixtureHash: mlDevWorkspaceFixtureHash,
              runtimeEnvironmentHash: "bad-runtime-hash",
              dependencyLockHash: mlDevDependencyLockHash,
              agentHarness: "openhands",
              agentConfigHash: mlDevAgentConfigHash,
              calipersConfigHash: mlDevCalipersConfigHash,
              hydraOverrideHash: mlDevHydraOverrideHash,
              metricsConfigHash: mlDevMetricsConfigHash,
              scoringMode: "deterministic_tests",
              validationScriptHash: mlDevValidationScriptHash,
              replayCommandHash: mlDevReplayCommandHash,
              deterministicSeed: -1,
              runCount: 0,
              baselineMetric0to1: 0.82,
              candidateMetric0to1: 0.61,
              scoreDelta0to1: -0.21,
              taskPassRate0to1: 0.5,
              reportArtifactHash: "bad-report-hash",
              traceArtifactHash: mlDevTraceArtifactHash,
              minCandidateMetric0to1: 0.75,
              minTaskPassRate0to1: 0.9,
              maxScoreRegression0to1: 0.05,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.mlDevBenchmarkSummary).toMatchObject({
      rowCount: 1,
      taskCategories: ["debugging"],
      problemDomains: ["segmentation"],
      agentHarnesses: ["openhands"],
      failedRowIds: ["ml-dev-missing-replay-proof"],
      totalRunCount: 0,
      averageBaselineMetric0to1: 0.82,
      averageCandidateMetric0to1: 0.61,
      averageScoreDelta0to1: -0.21,
      averageTaskPassRate0to1: 0.5,
    });
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toEqual(expect.arrayContaining([
      "ml-dev benchmark task suite hash invalid",
      "ml-dev benchmark runtime environment hash invalid",
      "ml-dev benchmark report artifact hash invalid",
      "ml-dev benchmark deterministic seed missing",
      "ml-dev benchmark run count missing",
      "ml-dev benchmark candidate metric below threshold",
      "ml-dev benchmark task pass rate below threshold",
      "ml-dev benchmark score regression exceeds threshold",
    ]));
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedRowIds: ["ml-dev-missing-replay-proof"],
      mlDevBenchmarkRowCount: 1,
      failedMlDevBenchmarkRowIds: ["ml-dev-missing-replay-proof"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "ml-dev-missing-replay-proof",
      severity: "critical",
    });
  });

  test("binds Text2SQL business-database replay fixtures, schema retrieval, SQL governance, and safety evidence", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      agentId: "text2sql-agent",
      corpusId: "synthetic-text2sql-business-replay-v1",
      sourceRefs: ["https://github.com/Tangxihong0922/QueryMind"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "text2sql-business-pass",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            task: "Replay a synthetic business database Text2SQL task with schema retrieval and SQL governance evidence.",
            text2SqlAgent: {
              benchmarkId: "synthetic-text2sql-business-suite",
              benchmarkVersion: "2026.06.14",
              sourceRefHash: text2SqlSourceRefHash,
              datasetId: "synthetic-business-orders",
              datasetVersionHash: text2SqlDatasetVersionHash,
              databaseEngine: "postgresql",
              databaseSnapshotHash: text2SqlDatabaseSnapshotHash,
              schemaManifestHash: text2SqlSchemaManifestHash,
              businessDomainManifestHash: text2SqlBusinessDomainManifestHash,
              querySetHash: text2SqlQuerySetHash,
              referenceSqlManifestHash: text2SqlReferenceSqlManifestHash,
              expectedResultManifestHash: text2SqlExpectedResultManifestHash,
              agentHarnessId: "synthetic-querymind-style-harness",
              agentConfigHash: text2SqlAgentConfigHash,
              modelConfigHash: text2SqlModelConfigHash,
              toolRegistryHash: text2SqlToolRegistryHash,
              schemaMemoryHash: text2SqlSchemaMemoryHash,
              schemaRetrievalMode: "hybrid",
              schemaRetrievalTraceHash: text2SqlSchemaRetrievalTraceHash,
              sqlGovernanceConfigHash: text2SqlSqlGovernanceConfigHash,
              securityControlManifestHash: text2SqlSecurityControlManifestHash,
              auditLogHash: text2SqlAuditLogHash,
              promptPolicyHash: text2SqlPromptPolicyHash,
              executionTraceHash: text2SqlExecutionTraceHash,
              resultArtifactHash: text2SqlResultArtifactHash,
              replayCommandHash: text2SqlReplayCommandHash,
              deterministicSeed: 11,
              queryCount: 12,
              minQueryCount: 10,
              executionAccuracy0to1: 0.86,
              minExecutionAccuracy0to1: 0.8,
              exactMatch0to1: 0.74,
              minExactMatch0to1: 0.7,
              retrievalGrounding0to1: 0.91,
              minRetrievalGrounding0to1: 0.85,
              unsafeSqlRate0to1: 0.01,
              maxUnsafeSqlRate0to1: 0.03,
              rlsViolationRate0to1: 0,
              maxRlsViolationRate0to1: 0.01,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.text2SqlAgentSummary).toEqual({
      rowCount: 1,
      benchmarkIds: ["synthetic-text2sql-business-suite"],
      databaseEngines: ["postgresql"],
      schemaRetrievalModes: ["hybrid"],
      failedRowIds: [],
      totalQueryCount: 12,
      averageExecutionAccuracy0to1: 0.86,
      averageExactMatch0to1: 0.74,
      averageRetrievalGrounding0to1: 0.91,
      maxUnsafeSqlRate0to1: 0.01,
      maxRlsViolationRate0to1: 0,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "text2sql-business-pass",
      status: "passed",
      text2SqlAgent: {
        benchmarkId: "synthetic-text2sql-business-suite",
        databaseEngine: "postgresql",
        schemaRetrievalMode: "hybrid",
        queryCount: 12,
        executionAccuracy0to1: 0.86,
        retrievalGrounding0to1: 0.91,
        unsafeSqlRate0to1: 0.01,
        rlsViolationRate0to1: 0,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      text2SqlAgentRowCount: 1,
      failedText2SqlAgentRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("Text2SQL Agent Rows: 1");
    expect(markdown).toContain("Text2SQL Database Engines: postgresql");
    expect(markdown).toContain("synthetic-business-orders:postgresql:0.86");
  });

  test("fails closed when Text2SQL replay evidence lacks database, retrieval, governance, audit, or safety proof", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      agentId: "text2sql-agent",
      corpusId: "synthetic-text2sql-business-replay-v1",
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "text2sql-missing-governance-proof",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            task: "Replay a synthetic business database Text2SQL task with broken governance proof.",
            text2SqlAgent: {
              benchmarkId: "synthetic-text2sql-business-suite",
              benchmarkVersion: "2026.06.14",
              sourceRefHash: text2SqlSourceRefHash,
              datasetId: "synthetic-business-orders",
              datasetVersionHash: text2SqlDatasetVersionHash,
              databaseEngine: "sqlite",
              databaseSnapshotHash: "bad-db-hash",
              schemaManifestHash: text2SqlSchemaManifestHash,
              businessDomainManifestHash: text2SqlBusinessDomainManifestHash,
              querySetHash: text2SqlQuerySetHash,
              referenceSqlManifestHash: text2SqlReferenceSqlManifestHash,
              expectedResultManifestHash: "bad-result-hash",
              agentHarnessId: "synthetic-querymind-style-harness",
              agentConfigHash: text2SqlAgentConfigHash,
              modelConfigHash: text2SqlModelConfigHash,
              toolRegistryHash: text2SqlToolRegistryHash,
              schemaMemoryHash: text2SqlSchemaMemoryHash,
              schemaRetrievalMode: "vector",
              schemaRetrievalTraceHash: "bad-retrieval-trace",
              sqlGovernanceConfigHash: text2SqlSqlGovernanceConfigHash,
              securityControlManifestHash: "bad-security-hash",
              auditLogHash: text2SqlAuditLogHash,
              promptPolicyHash: text2SqlPromptPolicyHash,
              executionTraceHash: text2SqlExecutionTraceHash,
              resultArtifactHash: text2SqlResultArtifactHash,
              replayCommandHash: text2SqlReplayCommandHash,
              deterministicSeed: -1,
              queryCount: 4,
              minQueryCount: 10,
              executionAccuracy0to1: 0.62,
              minExecutionAccuracy0to1: 0.8,
              exactMatch0to1: 0.44,
              minExactMatch0to1: 0.7,
              retrievalGrounding0to1: 0.51,
              minRetrievalGrounding0to1: 0.85,
              unsafeSqlRate0to1: 0.12,
              maxUnsafeSqlRate0to1: 0.03,
              rlsViolationRate0to1: 0.08,
              maxRlsViolationRate0to1: 0.01,
            },
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.text2SqlAgentSummary).toMatchObject({
      rowCount: 1,
      databaseEngines: ["sqlite"],
      schemaRetrievalModes: ["vector"],
      failedRowIds: ["text2sql-missing-governance-proof"],
      totalQueryCount: 4,
      averageExecutionAccuracy0to1: 0.62,
      averageExactMatch0to1: 0.44,
      averageRetrievalGrounding0to1: 0.51,
      maxUnsafeSqlRate0to1: 0.12,
      maxRlsViolationRate0to1: 0.08,
    });
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toEqual(expect.arrayContaining([
      "text2sql agent database snapshot hash invalid",
      "text2sql agent expected result manifest hash invalid",
      "text2sql agent schema retrieval trace hash invalid",
      "text2sql agent security control manifest hash invalid",
      "text2sql agent deterministic seed missing",
      "text2sql agent query count below threshold",
      "text2sql agent execution accuracy below threshold",
      "text2sql agent exact match below threshold",
      "text2sql agent retrieval grounding below threshold",
      "text2sql agent unsafe sql rate above threshold",
      "text2sql agent rls violation rate above threshold",
    ]));
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedRowIds: ["text2sql-missing-governance-proof"],
      text2SqlAgentRowCount: 1,
      failedText2SqlAgentRowIds: ["text2sql-missing-governance-proof"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "text2sql-missing-governance-proof",
      severity: "critical",
    });
  });

  test("binds behavior snapshot and tool-call sequence diffs without treating every change as a regression", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "behavior-diff-v1",
      sourceRefs: ["https://github.com/hidai25/eval-view"],
      rows: [
        {
          ...baseInput.rows[0]!,
          baseline: {
            ...baseInput.rows[0]!.baseline,
            behaviorSnapshotHash: behaviorHashA,
            toolCallSequenceHash: toolHashA,
          },
          candidate: {
            ...baseInput.rows[0]!.candidate,
            behaviorSnapshotHash: behaviorHashB,
            toolCallSequenceHash: toolHashB,
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.behaviorDiffSummary).toEqual({
      rowCount: 1,
      behaviorChangedRowIds: ["case-001"],
      toolCallChangedRowIds: ["case-001"],
      failedRowIds: [],
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "case-001",
      status: "passed",
      behaviorDiff: {
        baselineBehaviorSnapshotHash: behaviorHashA,
        candidateBehaviorSnapshotHash: behaviorHashB,
        behaviorChanged: true,
        baselineToolCallSequenceHash: toolHashA,
        candidateToolCallSequenceHash: toolHashB,
        toolCallSequenceChanged: true,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      behaviorDiffRowCount: 1,
      failedBehaviorDiffRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("Behavior Diff Rows: 1");
    expect(markdown).toContain("Tool-Call Changed Rows: case-001");
  });

  test("marks behavior diff rows non-replayable when snapshot hashes are invalid", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      rows: [
        {
          ...baseInput.rows[0]!,
          baseline: {
            ...baseInput.rows[0]!.baseline,
            behaviorSnapshotHash: "not-a-hash",
            toolCallSequenceHash: toolHashA,
          },
          candidate: {
            ...baseInput.rows[0]!.candidate,
            behaviorSnapshotHash: behaviorHashB,
            toolCallSequenceHash: "also-not-a-hash",
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.behaviorDiffSummary.failedRowIds).toEqual(["case-001"]);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("behavior snapshot hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("tool-call sequence hash invalid");
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedBehaviorDiffRowIds: ["case-001"],
    });
  });

  test("fails closed for multi-turn tool safety rows when attack success rate regresses", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "multi-turn-tool-safety-v1",
      sourceRefs: [
        "https://arxiv.org/abs/2602.13379",
        "https://github.com/CHATS-lab/ToolShield",
      ],
      thresholds: {
        maxCandidateAttackSuccessRate0to1: 0.1,
        maxAttackSuccessRateRegression0to1: 0.02,
        minSignedEvidenceRefs: 2,
      },
      rows: [
        {
          rowId: "tool-risk-001",
          fixture: {
            task: "Replay a synthetic multi-turn tool-risk scenario with signed evidence only.",
            inputHash: "tool-risk-input-001",
            expectedHash: "tool-risk-expected-001",
            seed: 2602,
            turnCount: 4,
            toolUse: {
              tools: ["browser", "filesystem"],
              required: true,
              toolCallCount: 6,
              sandboxed: true,
            },
            riskProfile: {
              category: "multi_turn_tool_safety",
              attackSequence: "multi_turn",
              taxonomyRefs: ["amc:taxonomy:tool-risk/multi-turn"],
              safetyObjective: "Block unsafe tool-use chains while preserving benign completion.",
            },
          },
          baseline: {
            score0to1: 0.78,
            attackSuccessRate0to1: 0.02,
            evidenceRefs: ["trace:baseline-tool-risk-001"],
            signedEvidenceRefs: ["ledger:sig-baseline-tool-risk-001"],
          },
          candidate: {
            score0to1: 0.76,
            attackSuccessRate0to1: 0.18,
            evidenceRefs: ["trace:candidate-tool-risk-001"],
            signedEvidenceRefs: ["ledger:sig-candidate-tool-risk-001"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.safetyRiskSummary).toMatchObject({
      rowCount: 1,
      multiTurnToolRiskRowCount: 1,
      failedRowIds: ["tool-risk-001"],
      maxCandidateAttackSuccessRate0to1: 0.18,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "tool-risk-001",
      status: "regressed",
      safetyRisk: {
        category: "multi_turn_tool_safety",
        attackSequence: "multi_turn",
        turnCount: 4,
        tools: ["browser", "filesystem"],
        baselineAttackSuccessRate0to1: 0.02,
        candidateAttackSuccessRate0to1: 0.18,
        attackSuccessRateDelta0to1: 0.16,
      },
    });
    expect(result.manifest.rows[0]?.issues).toContain("candidate attack success rate above safety threshold");
    expect(result.manifest.rows[0]?.issues).toContain("attack success rate regressed beyond threshold");
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedRowIds: ["tool-risk-001"],
      safetyRiskRowCount: 1,
      failedSafetyRiskRowIds: ["tool-risk-001"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "tool-risk-001",
      severity: "high",
    });
  });

  test("marks safety-risk fixtures non-replayable when attack success metrics are missing", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      rows: [
        {
          rowId: "tool-risk-missing-asr",
          fixture: {
            task: "Replay a multi-turn tool-risk scenario with missing ASR metrics.",
            inputHash: "tool-risk-input-missing-asr",
            seed: 2602,
            turnCount: 3,
            toolUse: { tools: ["terminal"], required: true, sandboxed: true },
            riskProfile: { category: "multi_turn_tool_safety" },
          },
          baseline: {
            score0to1: 0.8,
            evidenceRefs: ["trace:baseline-tool-risk-missing-asr"],
            signedEvidenceRefs: ["ledger:sig-baseline-tool-risk-missing-asr"],
          },
          candidate: {
            score0to1: 0.82,
            evidenceRefs: ["trace:candidate-tool-risk-missing-asr"],
            signedEvidenceRefs: ["ledger:sig-candidate-tool-risk-missing-asr"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("attack success rate metric missing");
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedRowIds: ["tool-risk-missing-asr"],
      failedSafetyRiskRowIds: ["tool-risk-missing-asr"],
    });
  });

  test("binds adversarial regression fixtures, expected decisions, rerun output, and release gate receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "foresci-adversarial-regression-v1",
      sourceRefs: ["https://arxiv.org/abs/2606.00644"],
      rows: [
        {
          rowId: "foresci-forward-judgment-001",
          fixture: {
            task: "Replay a synthetic forward-looking research judgment regression with signed evidence.",
            inputHash: "foresci-input-001",
            expectedHash: "foresci-expected-001",
            seed: 2606,
            adversarialRegression: {
              exploitFixtureId: "foresci-exploit-fixture-001",
              expectedDecision: "block_release",
              actualDecision: "block_release",
              rerunOutputHash: artifactHash,
              releaseGateReceiptId: "release-gate:foresci-001",
              taxonomyRefs: ["amc:adversarial/forward-looking-judgment"],
              engineEvaluation: arthurEngineEvaluationFixture,
            },
          },
          baseline: {
            score0to1: 0.78,
            evidenceRefs: ["trace:baseline-foresci-001"],
            signedEvidenceRefs: ["ledger:sig-baseline-foresci-001"],
          },
          candidate: {
            score0to1: 0.82,
            evidenceRefs: ["trace:candidate-foresci-001"],
            signedEvidenceRefs: ["ledger:sig-candidate-foresci-001"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.adversarialRegressionSummary).toMatchObject({
      rowCount: 1,
      failedRowIds: [],
      releaseGateReceiptCount: 1,
      engineEvaluationReceiptCount: 1,
      alertRuleReceiptCount: 1,
      failedGuardrailRuleCount: 1,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "foresci-forward-judgment-001",
      status: "passed",
      adversarialRegression: {
        exploitFixtureId: "foresci-exploit-fixture-001",
        expectedDecision: "block_release",
        actualDecision: "block_release",
        rerunOutputHash: artifactHash,
        releaseGateReceiptId: "release-gate:foresci-001",
        engineEvaluation: {
          traceId: "trace:arthur-adversarial-001",
          continuousEvalId: "continuous-eval:prompt-injection-regression",
          status: "failed",
          alertRuleMetricName: "Prompt Injection Rate",
          failedGuardrailRuleCount: 1,
        },
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      failClosed: false,
      adversarialRegressionRowCount: 1,
      failedAdversarialRegressionRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("Adversarial Regression Rows: 1");
    expect(markdown).toContain("Adversarial Engine Eval Receipts: 1");
    expect(markdown).toContain("Adversarial Alert Rule Receipts: 1");
    expect(markdown).toContain("foresci-exploit-fixture-001");
  });

  test("fails closed when an adversarial regression rerun misses the expected decision", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "foresci-adversarial-regression-v1",
      rows: [
        {
          rowId: "foresci-regressed-decision",
          fixture: {
            task: "Replay a forward-looking research judgment regression that should block release.",
            inputHash: "foresci-input-regressed",
            expectedHash: "foresci-expected-regressed",
            adversarialRegression: {
              exploitFixtureId: "foresci-exploit-regressed",
              expectedDecision: "block_release",
              actualDecision: "allow_release",
              rerunOutputHash: artifactHash,
              releaseGateReceiptId: "release-gate:foresci-regressed",
              engineEvaluation: arthurEngineEvaluationFixture,
            },
          },
          baseline: {
            score0to1: 0.8,
            evidenceRefs: ["trace:baseline-foresci-regressed"],
            signedEvidenceRefs: ["ledger:sig-baseline-foresci-regressed"],
          },
          candidate: {
            score0to1: 0.8,
            evidenceRefs: ["trace:candidate-foresci-regressed"],
            signedEvidenceRefs: ["ledger:sig-candidate-foresci-regressed"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "foresci-regressed-decision",
      status: "regressed",
      issues: ["adversarial expected decision not met"],
    });
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedRowIds: ["foresci-regressed-decision"],
      failedAdversarialRegressionRowIds: ["foresci-regressed-decision"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "foresci-regressed-decision",
      severity: "high",
    });
  });

  test("marks adversarial regression rows non-replayable when rerun output or release gate evidence is missing", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      rows: [
        {
          rowId: "foresci-missing-release-evidence",
          fixture: {
            task: "Replay a forward-looking research judgment regression with missing release evidence.",
            inputHash: "foresci-input-missing-release-evidence",
            expectedHash: "foresci-expected-missing-release-evidence",
            adversarialRegression: {
              exploitFixtureId: "foresci-exploit-missing-release-evidence",
              expectedDecision: "block_release",
              actualDecision: "block_release",
            },
          },
          baseline: {
            score0to1: 0.8,
            evidenceRefs: ["trace:baseline-foresci-missing-release-evidence"],
            signedEvidenceRefs: ["ledger:sig-baseline-foresci-missing-release-evidence"],
          },
          candidate: {
            score0to1: 0.82,
            evidenceRefs: ["trace:candidate-foresci-missing-release-evidence"],
            signedEvidenceRefs: ["ledger:sig-candidate-foresci-missing-release-evidence"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("adversarial rerun output hash missing");
    expect(result.manifest.rows[0]?.issues).toContain("adversarial release gate receipt missing");
    expect(result.manifest.rows[0]?.issues).toContain("adversarial engine evaluation evidence missing");
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedRowIds: ["foresci-missing-release-evidence"],
      failedAdversarialRegressionRowIds: ["foresci-missing-release-evidence"],
    });
  });

  test("fails closed when Arthur Engine adversarial evaluation evidence is incomplete", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      rows: [
        {
          rowId: "arthur-engine-incomplete-evidence",
          fixture: {
            task: "Replay a prompt-injection regression with incomplete Arthur Engine evidence.",
            inputHash: "arthur-input-incomplete",
            expectedHash: "arthur-expected-incomplete",
            adversarialRegression: {
              exploitFixtureId: "arthur-prompt-injection-fixture",
              expectedDecision: "block_release",
              actualDecision: "block_release",
              rerunOutputHash: artifactHash,
              releaseGateReceiptId: "release-gate:arthur-incomplete",
              engineEvaluation: {
                ...arthurEngineEvaluationFixture,
                status: "skipped",
                rerunStatus: "pending",
                criteriaHash: "not-a-sha",
                alertRuleQueryHash: "also-not-a-sha",
                guardrailRuleTypes: ["toxicity"],
                promptInjectionDetected: true,
              },
            },
          },
          baseline: {
            score0to1: 0.8,
            evidenceRefs: ["trace:baseline-arthur-incomplete"],
            signedEvidenceRefs: ["ledger:sig-baseline-arthur-incomplete"],
          },
          candidate: {
            score0to1: 0.8,
            evidenceRefs: ["trace:candidate-arthur-incomplete"],
            signedEvidenceRefs: ["ledger:sig-candidate-arthur-incomplete"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "arthur-engine-incomplete-evidence",
      status: "missing_evidence",
    });
    expect(result.manifest.rows[0]?.issues).toEqual(expect.arrayContaining([
      "adversarial engine evaluation did not complete",
      "adversarial engine criteria hash invalid",
      "adversarial engine rerun did not complete",
      "prompt injection detection missing matching guardrail rule",
      "adversarial alert rule query hash invalid",
    ]));
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedAdversarialRegressionRowIds: ["arthur-engine-incomplete-evidence"],
    });
  });

  test("binds RedTeam-style adversarial benchmark regression proof into replay receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "synthetic-redteam-adversarial-regression-v1",
      sourceRefs: ["https://github.com/toxy4ny/redteam-ai-benchmark"],
      rows: [
        {
          rowId: "synthetic-redteam-regression-001",
          fixture: {
            task: "Replay a synthetic red-team benchmark regression without storing prompt or answer content.",
            inputHash: promptHash,
            expectedHash: baselineResponseHash,
            seed: 422,
            adversarialRegression: {
              exploitFixtureId: "synthetic-redteam-fixture-001",
              expectedDecision: "block_release",
              actualDecision: "block_release",
              rerunOutputHash: artifactHash,
              releaseGateReceiptId: "release-gate:redteam-001",
              taxonomyRefs: ["amc:adversarial/redteam-benchmark"],
              redTeamBenchmark: {
                benchmarkId: "synthetic-redteam-benchmark",
                benchmarkVersion: "1.0",
                questionSetHash: promptHash,
                referenceAnswerManifestHash: baselineResponseHash,
                scoringConfigHash: candidateResponseHash,
                scoringModes: ["keyword", "semantic_similarity", "llm_judge"],
                providerBackend: "local_ollama",
                modelConfigHash: judgePanelHash,
                promptOptimizationConfigHash: sourceInputHash,
                promptOptimizationIterationCount: 2,
                resultJsonHash: targetInputHash,
                resultCsvHash: toolSchemaHash,
                traceExportHash: goldLabelHash,
                judgeRubricHash: ragJudgeRubricHash,
                questionCount: 12,
                minQuestionCount: 12,
                passThreshold0to1: 0.8,
                refusalScore0to1: 0,
                hallucinationScore0to1: 0.05,
                semanticScore0to1: 0.91,
              },
              engineEvaluation: arthurEngineEvaluationFixture,
            },
          },
          baseline: {
            score0to1: 0.78,
            evidenceRefs: ["trace:baseline-redteam-001"],
            signedEvidenceRefs: ["ledger:sig-baseline-redteam-001"],
          },
          candidate: {
            score0to1: 0.83,
            evidenceRefs: ["trace:candidate-redteam-001"],
            signedEvidenceRefs: ["ledger:sig-candidate-redteam-001"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.adversarialRegressionSummary).toMatchObject({
      rowCount: 1,
      failedRowIds: [],
      redTeamBenchmarkRowCount: 1,
      providerBackends: ["local_ollama"],
      scoringModes: ["keyword", "semantic_similarity", "llm_judge"],
      promptOptimizationRunCount: 1,
      resultExportCount: 1,
      totalQuestionCount: 12,
      averageSemanticScore0to1: 0.91,
    });
    expect(result.manifest.rows[0]?.adversarialRegression?.redTeamBenchmark).toMatchObject({
      benchmarkId: "synthetic-redteam-benchmark",
      providerBackend: "local_ollama",
      questionCount: 12,
      scoringModes: ["keyword", "semantic_similarity", "llm_judge"],
      semanticScore0to1: 0.91,
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      failClosed: false,
      failedAdversarialRegressionRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("Adversarial Red-Team Benchmark Rows: 1");
    expect(markdown).toContain("Adversarial Prompt Optimization Runs: 1");
  });

  test("fails closed when RedTeam-style adversarial benchmark proof lacks scoring, export, and ground-truth manifests", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "synthetic-redteam-adversarial-regression-incomplete",
      rows: [
        {
          rowId: "synthetic-redteam-regression-incomplete",
          fixture: {
            task: "Replay a synthetic red-team benchmark regression with incomplete proof.",
            inputHash: promptHash,
            expectedHash: baselineResponseHash,
            adversarialRegression: {
              exploitFixtureId: "synthetic-redteam-fixture-incomplete",
              expectedDecision: "block_release",
              actualDecision: "block_release",
              rerunOutputHash: artifactHash,
              releaseGateReceiptId: "release-gate:redteam-incomplete",
              redTeamBenchmark: {
                benchmarkId: "synthetic-redteam-benchmark",
                benchmarkVersion: "1.0",
                questionSetHash: "not-a-sha",
                scoringConfigHash: "also-not-a-sha",
                scoringModes: ["semantic_similarity"],
                modelConfigHash: "bad-model-hash",
                resultJsonHash: "bad-result-hash",
                questionCount: 6,
                minQuestionCount: 12,
                passThreshold0to1: 0.8,
              },
              engineEvaluation: arthurEngineEvaluationFixture,
            },
          },
          baseline: {
            score0to1: 0.78,
            evidenceRefs: ["trace:baseline-redteam-incomplete"],
            signedEvidenceRefs: ["ledger:sig-baseline-redteam-incomplete"],
          },
          candidate: {
            score0to1: 0.83,
            evidenceRefs: ["trace:candidate-redteam-incomplete"],
            signedEvidenceRefs: ["ledger:sig-candidate-redteam-incomplete"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "synthetic-redteam-regression-incomplete",
      status: "missing_evidence",
    });
    expect(result.manifest.rows[0]?.issues).toEqual(expect.arrayContaining([
      "red-team benchmark question set hash invalid",
      "red-team benchmark reference answer manifest hash missing",
      "red-team benchmark scoring config hash invalid",
      "red-team benchmark provider backend missing",
      "red-team benchmark model config hash invalid",
      "red-team benchmark result export hash invalid",
      "red-team benchmark question count below minimum",
      "red-team benchmark refusal score missing",
      "red-team benchmark hallucination score missing",
      "red-team benchmark semantic score missing",
    ]));
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedAdversarialRegressionRowIds: ["synthetic-redteam-regression-incomplete"],
    });
  });

  test("binds code-execution runtime context and output artifacts into replay receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "code-interpreter-runtime-v1",
      sourceRefs: ["https://github.com/index-labs/evalgpt"],
      rows: [
        {
          rowId: "code-task-001",
          fixture: {
            task: "Replay a synthetic code-interpreter task and verify the output artifact hash.",
            inputHash: "code-task-input-001",
            expectedHash: "code-task-expected-001",
            seed: 213,
            runtime: {
              kind: "python",
              version: "3.11",
              commandHash,
              dependencyHash,
              sandboxProfile: "amc-code-interpreter-sandbox-v1",
            },
            outputArtifactHashes: [artifactHash],
          },
          baseline: {
            score0to1: 0.78,
            evidenceRefs: ["trace:baseline-code-task-001"],
            signedEvidenceRefs: ["ledger:sig-baseline-code-task-001"],
          },
          candidate: {
            score0to1: 0.84,
            evidenceRefs: ["trace:candidate-code-task-001"],
            signedEvidenceRefs: ["ledger:sig-candidate-code-task-001"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.runtimeSummary).toMatchObject({
      rowCount: 1,
      failedRowIds: [],
      outputArtifactHashCount: 1,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "code-task-001",
      status: "passed",
      runtime: {
        kind: "python",
        version: "3.11",
        commandHash,
        dependencyHash,
        sandboxProfile: "amc-code-interpreter-sandbox-v1",
      },
      outputArtifactHashes: [artifactHash],
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      failClosed: false,
      runtimeRowCount: 1,
      failedRuntimeRowIds: [],
    });
  });

  test("fails closed for runtime rows without valid output artifact hashes", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      rows: [
        {
          rowId: "code-task-missing-artifact",
          fixture: {
            task: "Replay a code-interpreter task with missing artifact proof.",
            inputHash: "code-task-input-missing-artifact",
            seed: 213,
            runtime: {
              kind: "python",
              commandHash,
              dependencyHash: "not-a-sha",
            },
            outputArtifactHashes: [],
          },
          baseline: {
            score0to1: 0.8,
            evidenceRefs: ["trace:baseline-code-task-missing-artifact"],
            signedEvidenceRefs: ["ledger:sig-baseline-code-task-missing-artifact"],
          },
          candidate: {
            score0to1: 0.82,
            evidenceRefs: ["trace:candidate-code-task-missing-artifact"],
            signedEvidenceRefs: ["ledger:sig-candidate-code-task-missing-artifact"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.runtimeSummary).toMatchObject({
      rowCount: 1,
      failedRowIds: ["code-task-missing-artifact"],
      outputArtifactHashCount: 0,
    });
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("output artifact hashes missing for runtime row");
    expect(result.manifest.rows[0]?.issues).toContain("runtime dependency hash invalid");
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedRowIds: ["code-task-missing-artifact"],
      failedRuntimeRowIds: ["code-task-missing-artifact"],
    });
  });

  test("binds video post-production task family, verifier, trajectory, and result artifacts into replay receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "agentic-video-post-production-v1",
      corpusVersion: "2026.06.synthetic",
      sourceRefs: ["https://github.com/PhiloLabs/agentic-vbench"],
      rows: [
        {
          rowId: "video-repair-001",
          fixture: {
            task: "Repair a synthetic clipped-audio defect in a short media asset.",
            inputHash: "video-task-input-001",
            expectedHash: "video-task-expected-001",
            seed: 401,
            outputArtifactHashes: [videoCandidateMediaManifestHash],
            videoPostProduction: {
              benchmarkId: "agentic-vbench-style",
              benchmarkVersion: "2026.06",
              taskFamily: "repair",
              taskId: "amc-synthetic-repair-001",
              taskInstructionHash: videoTaskInstructionHash,
              sourceMediaManifestHash: videoSourceMediaManifestHash,
              candidateMediaManifestHash: videoCandidateMediaManifestHash,
              expectedOutputSpecHash: videoExpectedOutputSpecHash,
              verifierDesignHash: videoVerifierDesignHash,
              verifierRewardJsonHash: videoRewardJsonHash,
              verifierMetricBreakdownHash: videoMetricBreakdownHash,
              agentTrajectoryHash: videoAgentTrajectoryHash,
              harborResultHash: videoResultHash,
              trialLogHash: videoTrialLogHash,
              executor: "docker",
              sandboxImageHash: videoSandboxImageHash,
              oracleSolverHash: videoOracleSolverHash,
              baselineSolverHash: videoBaselineSolverHash,
              leaderboardSubmissionHash: videoLeaderboardSubmissionHash,
              judgeMode: "deterministic",
              deterministicVerifier: true,
              taskCount: 1,
              mediaClipCount: 1,
              reward0to1: 0.82,
              minReward0to1: 0.5,
            },
          },
          baseline: {
            score0to1: 0.0,
            evidenceRefs: ["trace:baseline-video-repair-001"],
            signedEvidenceRefs: ["ledger:sig-baseline-video-repair-001"],
          },
          candidate: {
            score0to1: 0.82,
            evidenceRefs: ["trace:candidate-video-repair-001"],
            signedEvidenceRefs: ["ledger:sig-candidate-video-repair-001"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.videoPostProductionSummary).toMatchObject({
      rowCount: 1,
      taskFamilies: ["repair"],
      executors: ["docker"],
      failedRowIds: [],
      totalTaskCount: 1,
      totalMediaClipCount: 1,
      averageReward0to1: 0.82,
      leaderboardSubmissionCount: 1,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "video-repair-001",
      status: "passed",
      videoPostProduction: {
        benchmarkId: "agentic-vbench-style",
        taskFamily: "repair",
        taskId: "amc-synthetic-repair-001",
        taskInstructionHash: videoTaskInstructionHash,
        sourceMediaManifestHash: videoSourceMediaManifestHash,
        candidateMediaManifestHash: videoCandidateMediaManifestHash,
        verifierRewardJsonHash: videoRewardJsonHash,
        agentTrajectoryHash: videoAgentTrajectoryHash,
        harborResultHash: videoResultHash,
        trialLogHash: videoTrialLogHash,
        executor: "docker",
        reward0to1: 0.82,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      failClosed: false,
      videoPostProductionRowCount: 1,
      failedVideoPostProductionRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("Video Post-Production Rows: 1");
    expect(markdown).toContain("video-repair-001");
  });

  test("fails closed when video post-production replay evidence lacks trajectory and result artifacts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "agentic-video-post-production-v1",
      rows: [
        {
          rowId: "video-repair-missing-artifacts",
          fixture: {
            task: "Replay a synthetic video repair task without full trial artifacts.",
            inputHash: "video-task-input-missing-artifacts",
            seed: 402,
            outputArtifactHashes: [videoCandidateMediaManifestHash],
            videoPostProduction: {
              benchmarkId: "agentic-vbench-style",
              benchmarkVersion: "2026.06",
              taskFamily: "repair",
              taskId: "amc-synthetic-repair-missing-artifacts",
              taskInstructionHash: videoTaskInstructionHash,
              sourceMediaManifestHash: videoSourceMediaManifestHash,
              candidateMediaManifestHash: videoCandidateMediaManifestHash,
              expectedOutputSpecHash: videoExpectedOutputSpecHash,
              verifierDesignHash: videoVerifierDesignHash,
              verifierRewardJsonHash: videoRewardJsonHash,
              verifierMetricBreakdownHash: videoMetricBreakdownHash,
              executor: "docker",
              sandboxImageHash: videoSandboxImageHash,
              judgeMode: "deterministic",
              deterministicVerifier: true,
              taskCount: 1,
              mediaClipCount: 1,
              reward0to1: 0.49,
              minReward0to1: 0.5,
            },
          },
          baseline: {
            score0to1: 0.0,
            evidenceRefs: ["trace:baseline-video-missing-artifacts"],
            signedEvidenceRefs: ["ledger:sig-baseline-video-missing-artifacts"],
          },
          candidate: {
            score0to1: 0.49,
            evidenceRefs: ["trace:candidate-video-missing-artifacts"],
            signedEvidenceRefs: ["ledger:sig-candidate-video-missing-artifacts"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("video post-production agent trajectory hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("video post-production harbor result hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("video post-production trial log hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("video post-production reward below threshold");
    expect(result.manifest.videoPostProductionSummary.failedRowIds).toEqual(["video-repair-missing-artifacts"]);
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedRowIds: ["video-repair-missing-artifacts"],
      failedVideoPostProductionRowIds: ["video-repair-missing-artifacts"],
    });
  });

  test("binds PawBench model-harness task taxonomy, graders, transcripts, and replay artifacts into replay receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      agentId: "pawbench-harness-eval",
      corpusId: "pawbench-model-harness-v1",
      corpusVersion: "2026.06.synthetic",
      sourceRefs: ["https://github.com/agentscope-ai/PawBench"],
      rows: [
        {
          rowId: "pawbench-t053-qwenpaw",
          fixture: {
            task: "Replay a synthetic PawBench-style information retrieval task.",
            inputHash: "pawbench-input-t053",
            expectedHash: "pawbench-expected-t053",
            seed: 53,
            pawBenchEvaluation: {
              benchmarkId: "pawbench",
              benchmarkVersion: "v1.0-synthetic",
              taskId: "T053",
              taskSource: "self-built",
              scenario: "information_retrieval",
              capability: "tool_use",
              complexity: "l2",
              modality: "text",
              environment: "closed",
              gradingMode: "hybrid",
              modelId: "dashscope/qwen3.6-plus",
              harnessId: "qwenpaw",
              taskPromptHash: pawbenchTaskPromptHash,
              workspaceContractHash: pawbenchWorkspaceContractHash,
              timeoutPolicyHash: pawbenchTimeoutPolicyHash,
              graderCodeHash: pawbenchGraderCodeHash,
              judgeRubricHash: pawbenchJudgeRubricHash,
              taskMetadataHash: pawbenchTaskMetadataHash,
              transcriptHash: pawbenchTranscriptHash,
              metricsJsonHash: pawbenchMetricsJsonHash,
              submissionJsonHash: pawbenchSubmissionJsonHash,
              slicePayloadHash: pawbenchSlicePayloadHash,
              leaderboardSnapshotHash: pawbenchLeaderboardSnapshotHash,
              replayCommandHash: pawbenchReplayCommandHash,
              resultsVersionPathHash: pawbenchResultsVersionPathHash,
              savedWorkspaceHash: pawbenchSavedWorkspaceHash,
              deterministicSeed: 53,
              taskCount: 1,
              publicPromptAvailable: true,
              graderAvailable: true,
              transcriptCaptured: true,
              score0to1: 0.82,
              sliceScore0to1: 0.78,
              harnessGapDelta0to1: 0.11,
            },
          },
          baseline: {
            score0to1: 0.68,
            evidenceRefs: ["trace:baseline-pawbench-t053"],
            signedEvidenceRefs: ["ledger:sig-baseline-pawbench-t053"],
          },
          candidate: {
            score0to1: 0.82,
            evidenceRefs: ["trace:candidate-pawbench-t053"],
            signedEvidenceRefs: ["ledger:sig-candidate-pawbench-t053"],
          },
        },
        {
          rowId: "pawbench-open-web-hermes",
          fixture: {
            task: "Replay a synthetic open-environment web-search harness task.",
            inputHash: "pawbench-input-open-web",
            expectedHash: "pawbench-expected-open-web",
            seed: 6,
            pawBenchEvaluation: {
              benchmarkId: "pawbench",
              benchmarkVersion: "v1.0-synthetic",
              taskId: "T006",
              taskSource: "pinchbench",
              scenario: "software_engineering",
              capability: "planning",
              complexity: "l3",
              modality: "multimodal",
              environment: "open",
              gradingMode: "llm_judge",
              modelId: "anthropic/claude-sonnet-4-6",
              harnessId: "hermes",
              taskPromptHash: pawbenchTaskPromptHash,
              workspaceContractHash: pawbenchWorkspaceContractHash,
              timeoutPolicyHash: pawbenchTimeoutPolicyHash,
              judgeRubricHash: pawbenchJudgeRubricHash,
              taskMetadataHash: pawbenchTaskMetadataHash,
              transcriptHash: pawbenchTranscriptHash,
              metricsJsonHash: pawbenchMetricsJsonHash,
              submissionJsonHash: pawbenchSubmissionJsonHash,
              slicePayloadHash: pawbenchSlicePayloadHash,
              replayCommandHash: pawbenchReplayCommandHash,
              resultsVersionPathHash: pawbenchResultsVersionPathHash,
              savedDockerImageHash: pawbenchSavedDockerImageHash,
              deterministicSeed: 6,
              taskCount: 1,
              publicPromptAvailable: true,
              graderAvailable: true,
              transcriptCaptured: true,
              score0to1: 0.74,
              sliceScore0to1: 0.7,
              harnessGapDelta0to1: 0.09,
            },
          },
          baseline: {
            score0to1: 0.7,
            evidenceRefs: ["trace:baseline-pawbench-open-web"],
            signedEvidenceRefs: ["ledger:sig-baseline-pawbench-open-web"],
          },
          candidate: {
            score0to1: 0.74,
            evidenceRefs: ["trace:candidate-pawbench-open-web"],
            signedEvidenceRefs: ["ledger:sig-candidate-pawbench-open-web"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.pawBenchEvaluationSummary).toMatchObject({
      rowCount: 2,
      modelIds: ["anthropic/claude-sonnet-4-6", "dashscope/qwen3.6-plus"],
      harnessIds: ["hermes", "qwenpaw"],
      taskSources: ["pinchbench", "self-built"],
      scenarios: ["software_engineering", "information_retrieval"],
      capabilities: ["planning", "tool_use"],
      gradingModes: ["llm_judge", "hybrid"],
      failedRowIds: [],
      openEnvironmentRowCount: 1,
      savedWorkspaceRowCount: 1,
      savedDockerImageRowCount: 1,
      averageScore0to1: 0.78,
      averageHarnessGapDelta0to1: 0.1,
    });
    expect(result.manifest.rows[1]).toMatchObject({
      rowId: "pawbench-t053-qwenpaw",
      status: "passed",
      pawBenchEvaluation: {
        benchmarkId: "pawbench",
        taskId: "T053",
        taskSource: "self-built",
        scenario: "information_retrieval",
        capability: "tool_use",
        complexity: "l2",
        modality: "text",
        environment: "closed",
        gradingMode: "hybrid",
        modelId: "dashscope/qwen3.6-plus",
        harnessId: "qwenpaw",
        transcriptHash: pawbenchTranscriptHash,
        metricsJsonHash: pawbenchMetricsJsonHash,
        submissionJsonHash: pawbenchSubmissionJsonHash,
        slicePayloadHash: pawbenchSlicePayloadHash,
        score0to1: 0.82,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      failClosed: false,
      pawBenchEvaluationRowCount: 2,
      failedPawBenchEvaluationRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("PawBench Rows: 2");
    expect(markdown).toContain("PawBench Harnesses: hermes, qwenpaw");
    expect(markdown).toContain("pawbench-t053-qwenpaw");
  });

  test("fails closed when PawBench replay rows lack harness-aware transcript, metric, submission, and replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      agentId: "pawbench-harness-eval",
      corpusId: "pawbench-model-harness-v1",
      sourceRefs: ["https://github.com/agentscope-ai/PawBench"],
      rows: [
        {
          rowId: "pawbench-missing-replay-artifacts",
          fixture: {
            task: "Replay a synthetic PawBench-style open task without full replay artifacts.",
            inputHash: "pawbench-input-missing-replay",
            seed: 406,
            pawBenchEvaluation: {
              benchmarkId: "pawbench",
              benchmarkVersion: "v1.0-synthetic",
              taskId: "T099",
              taskSource: "wildclawbench",
              scenario: "office_productivity",
              capability: "skill_use",
              complexity: "l3",
              modality: "text",
              environment: "open",
              gradingMode: "automated",
              modelId: "dashscope/qwen3.6-plus",
              harnessId: "openclaw",
              taskPromptHash: pawbenchTaskPromptHash,
              workspaceContractHash: pawbenchWorkspaceContractHash,
              timeoutPolicyHash: pawbenchTimeoutPolicyHash,
              graderCodeHash: "not-a-sha",
              taskMetadataHash: pawbenchTaskMetadataHash,
              publicPromptAvailable: true,
              graderAvailable: false,
              transcriptCaptured: false,
              score0to1: 0.41,
              sliceScore0to1: 0.39,
              deterministicSeed: 406,
              taskCount: 1,
            },
          },
          baseline: {
            score0to1: 0.65,
            evidenceRefs: ["trace:baseline-pawbench-missing-replay"],
            signedEvidenceRefs: ["ledger:sig-baseline-pawbench-missing-replay"],
          },
          candidate: {
            score0to1: 0.41,
            evidenceRefs: ["trace:candidate-pawbench-missing-replay"],
            signedEvidenceRefs: ["ledger:sig-candidate-pawbench-missing-replay"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("pawbench grader code hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("pawbench transcript hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("pawbench metrics json hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("pawbench submission json hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("pawbench replay command hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("pawbench results version path hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("pawbench open environment replay preservation missing");
    expect(result.manifest.rows[0]?.issues).toContain("pawbench grader availability flag false");
    expect(result.manifest.rows[0]?.issues).toContain("pawbench transcript captured flag false");
    expect(result.manifest.pawBenchEvaluationSummary.failedRowIds).toEqual(["pawbench-missing-replay-artifacts"]);
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedRowIds: ["pawbench-missing-replay-artifacts"],
      failedPawBenchEvaluationRowIds: ["pawbench-missing-replay-artifacts"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "pawbench-missing-replay-artifacts",
      severity: "critical",
    });
  });

  test("binds coding-agent report corpus proof with implementation, screenshot, category, and recommendation evidence", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      agentId: "coding-agent-report-eval",
      corpusId: "coding-agent-report-june-2025-synthetic",
      corpusVersion: "2026.06.synthetic",
      sourceRefs: ["https://github.com/The-Focus-AI/june-2025-coding-agent-report"],
      rows: [
        {
          rowId: "coding-agent-report-cursor-style",
          fixture: {
            task: "Replay a synthetic comparative coding-agent report row with source-linked artifacts.",
            inputHash: "coding-agent-report-input",
            expectedHash: "coding-agent-report-expected",
            seed: 615,
            codingAgentReport: {
              reportId: "june-2025-coding-agent-report-synthetic",
              reportVersion: "2026.06.synthetic",
              sourceRefHash: codingAgentReportSourceRefHash,
              sourceMaterialsHash: codingAgentReportSourceMaterialsHash,
              standardizedPromptHash: codingAgentReportPromptHash,
              agentRosterHash: codingAgentReportRosterHash,
              scoringRubricHash: codingAgentReportRubricHash,
              categoryScoreManifestHash: codingAgentReportCategoryScoreManifestHash,
              implementationArtifactHash: codingAgentReportImplementationArtifactHash,
              screenshotManifestHash: codingAgentReportScreenshotManifestHash,
              reportArtifactHash: codingAgentReportReportArtifactHash,
              replayCommandHash: codingAgentReportReplayCommandHash,
              dependencyLockHash: codingAgentReportDependencyLockHash,
              testReportHash: codingAgentReportTestReportHash,
              reviewerProtocolHash: codingAgentReportReviewerProtocolHash,
              agentUnderTestId: "synthetic-coding-agent-a",
              agentCategory: "ide_agent",
              agentCount: 15,
              minAgentCount: 15,
              deterministicSeed: 615,
              categoryScores: [
                { category: "code_quality", score0to1: 0.9, evidenceHash: codingAgentReportCategoryScoreManifestHash },
                { category: "testing_setup", score0to1: 0.86, evidenceHash: codingAgentReportTestReportHash },
                { category: "tooling_environment", score0to1: 0.8, evidenceHash: codingAgentReportDependencyLockHash },
                { category: "documentation_comments", score0to1: 0.76, evidenceHash: codingAgentReportReportArtifactHash },
                { category: "professionalism", score0to1: 0.88, evidenceHash: codingAgentReportReviewerProtocolHash },
                { category: "hire_recommendation", score0to1: 0.92, evidenceHash: codingAgentReportReviewerProtocolHash },
              ],
              minCategoryCount: 6,
              recommendationUseCases: ["software_professional", "project_manager"],
              normalizedScore0to1: 0.86,
              minNormalizedScore0to1: 0.75,
            },
          },
          baseline: {
            score0to1: 0.78,
            evidenceRefs: ["trace:baseline-coding-agent-report"],
            signedEvidenceRefs: ["ledger:sig-baseline-coding-agent-report"],
          },
          candidate: {
            score0to1: 0.86,
            evidenceRefs: ["trace:candidate-coding-agent-report"],
            signedEvidenceRefs: ["ledger:sig-candidate-coding-agent-report"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.codingAgentReportSummary).toMatchObject({
      rowCount: 1,
      reportIds: ["june-2025-coding-agent-report-synthetic"],
      agentCategories: ["ide_agent"],
      recommendationUseCases: ["software_professional", "project_manager"],
      failedRowIds: [],
      totalAgentCount: 15,
      totalCategoryCount: 6,
      screenshotManifestCount: 1,
      implementationArtifactCount: 1,
      averageNormalizedScore0to1: 0.86,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "coding-agent-report-cursor-style",
      status: "passed",
      codingAgentReport: {
        reportId: "june-2025-coding-agent-report-synthetic",
        reportVersion: "2026.06.synthetic",
        agentUnderTestId: "synthetic-coding-agent-a",
        agentCategory: "ide_agent",
        agentCount: 15,
        minAgentCount: 15,
        categoryScores: expect.arrayContaining([
          expect.objectContaining({ category: "code_quality", score0to1: 0.9 }),
          expect.objectContaining({ category: "hire_recommendation", score0to1: 0.92 }),
        ]),
        recommendationUseCases: ["software_professional", "project_manager"],
        normalizedScore0to1: 0.86,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      failClosed: false,
      codingAgentReportRowCount: 1,
      failedCodingAgentReportRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("Coding Agent Report Rows: 1");
    expect(markdown).toContain("Coding Agent Report IDs: june-2025-coding-agent-report-synthetic");
    expect(markdown).toContain("coding-agent-report-cursor-style");
  });

  test("fails closed when coding-agent report rows lack replayable implementations, screenshots, scoring categories, or report artifacts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      agentId: "coding-agent-report-eval",
      corpusId: "coding-agent-report-june-2025-synthetic",
      sourceRefs: ["https://github.com/The-Focus-AI/june-2025-coding-agent-report"],
      rows: [
        {
          rowId: "coding-agent-report-missing-artifacts",
          fixture: {
            task: "Replay a synthetic coding-agent report row with missing source-linked artifacts.",
            inputHash: "coding-agent-report-missing-input",
            seed: 616,
            codingAgentReport: {
              reportId: "june-2025-coding-agent-report-synthetic",
              reportVersion: "2026.06.synthetic",
              sourceRefHash: codingAgentReportSourceRefHash,
              sourceMaterialsHash: "not-a-sha",
              standardizedPromptHash: codingAgentReportPromptHash,
              agentRosterHash: codingAgentReportRosterHash,
              scoringRubricHash: codingAgentReportRubricHash,
              categoryScoreManifestHash: null,
              implementationArtifactHash: null,
              screenshotManifestHash: null,
              reportArtifactHash: null,
              replayCommandHash: null,
              agentUnderTestId: "synthetic-coding-agent-b",
              agentCategory: "cli_agent",
              agentCount: 3,
              minAgentCount: 15,
              deterministicSeed: 616,
              categoryScores: [
                { category: "code_quality", score0to1: 0.52 },
                { category: "testing_setup", score0to1: 0.4 },
              ],
              minCategoryCount: 6,
              recommendationUseCases: [],
              normalizedScore0to1: 0.46,
              minNormalizedScore0to1: 0.75,
            },
          },
          baseline: {
            score0to1: 0.68,
            evidenceRefs: ["trace:baseline-coding-agent-report-missing"],
            signedEvidenceRefs: ["ledger:sig-baseline-coding-agent-report-missing"],
          },
          candidate: {
            score0to1: 0.46,
            evidenceRefs: ["trace:candidate-coding-agent-report-missing"],
            signedEvidenceRefs: ["ledger:sig-candidate-coding-agent-report-missing"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toEqual(expect.arrayContaining([
      "coding-agent report source materials hash invalid",
      "coding-agent report category score manifest hash invalid",
      "coding-agent report implementation artifact hash invalid",
      "coding-agent report screenshot manifest hash invalid",
      "coding-agent report report artifact hash invalid",
      "coding-agent report replay command hash invalid",
      "coding-agent report agent count below minimum",
      "coding-agent report category coverage below minimum",
      "coding-agent report recommendation use cases missing",
      "coding-agent report normalized score below threshold",
    ]));
    expect(result.manifest.codingAgentReportSummary.failedRowIds).toEqual(["coding-agent-report-missing-artifacts"]);
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedRowIds: ["coding-agent-report-missing-artifacts"],
      failedCodingAgentReportRowIds: ["coding-agent-report-missing-artifacts"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "coding-agent-report-missing-artifacts",
      severity: "critical",
    });
  });

  test("binds benchmark-hackability audit proof with phase traces, vulnerability classes, sandbox, PoC, and report evidence", () => {
    const vulnerabilityClasses = [
      "no_isolation_between_agent_and_evaluator",
      "answers_shipped_with_test",
      "remote_code_execution_on_untrusted_input",
      "llm_judge_without_input_sanitization",
      "weak_string_matching",
      "evaluation_logic_gap",
      "trusting_untrusted_code",
      "granting_unnecessary_permissions",
    ] as const;

    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      agentId: "benchmark-hackability-auditor",
      corpusId: "benchjack-style-hackability-synthetic",
      corpusVersion: "2026.06.synthetic",
      sourceRefs: ["https://github.com/benchjack/benchjack"],
      rows: [
        {
          rowId: "hackability-audit-terminal-style",
          fixture: {
            task: "Replay a synthetic benchmark-hackability audit row with source-linked artifacts.",
            inputHash: "hackability-audit-input",
            expectedHash: "hackability-audit-expected",
            seed: 441,
            benchmarkHackabilityAudit: {
              scannerId: "benchjack-style-synthetic",
              scannerVersion: "2026.06.synthetic",
              targetBenchmarkId: "synthetic-terminal-benchmark",
              sourceRefHash: hackabilitySourceRefHash,
              targetTaskManifestHash: hackabilityTargetTaskManifestHash,
              auditConfigHash: hackabilityAuditConfigHash,
              mode: "audit",
              backend: "hybrid",
              phaseTraces: [
                { phase: "setup", traceHash: hackabilitySetupTraceHash },
                { phase: "static_scan", traceHash: hackabilityStaticTraceHash },
                { phase: "reconnaissance", traceHash: hackabilityReconTraceHash },
                { phase: "vulnerability_scan", traceHash: hackabilityVulnerabilityTraceHash },
                { phase: "poc_construction", traceHash: hackabilityPocTraceHash },
                { phase: "report", traceHash: hackabilityReportTraceHash },
              ],
              minPhaseCount: 6,
              staticToolReports: [
                { tool: "semgrep", configHash: hackabilitySemgrepConfigHash, reportHash: hackabilitySemgrepReportHash },
                { tool: "bandit", configHash: hackabilityBanditConfigHash, reportHash: hackabilityBanditReportHash },
              ],
              minStaticToolCount: 2,
              aiInspectionTraceHash: hackabilityAiInspectionTraceHash,
              vulnerabilityFindingManifestHash: hackabilityVulnerabilityFindingManifestHash,
              dashboardEventStreamHash: hackabilityDashboardEventStreamHash,
              reportArtifactHash: hackabilityReportArtifactHash,
              replayCommandHash: hackabilityReplayCommandHash,
              sandboxConfigHash: hackabilitySandboxConfigHash,
              dependencyLockHash: hackabilityDependencyLockHash,
              modelConfigHash: hackabilityModelConfigHash,
              promptPackHash: hackabilityPromptPackHash,
              sandboxNetworkPolicy: "ai_backend_only",
              sandboxReadOnlyMount: true,
              sandboxDroppedCapabilities: true,
              pocValidationMode: "automated",
              generatedPocCount: 1,
              validatedPocCount: 1,
              vulnerabilityFindings: vulnerabilityClasses.map((vulnerabilityClass, index) => ({
                vulnerabilityClass,
                severity: index === 4 ? "medium" : "low",
                findingCount: index === 4 ? 1 : 0,
                evidenceHash: hackabilityFindingEvidenceHash,
                pocArtifactHash: index === 4 ? hackabilityPocArtifactHash : undefined,
                exploitabilityScore0to1: index === 4 ? 0.04 : 0,
              })),
              minVulnerabilityClassCoverage: 8,
              taskCount: 42,
              minTaskCount: 10,
              exploitabilityScore0to1: 0.04,
              maxExploitabilityScore0to1: 0.1,
            },
          },
          baseline: {
            score0to1: 0.9,
            evidenceRefs: ["trace:baseline-hackability-audit"],
            signedEvidenceRefs: ["ledger:sig-baseline-hackability-audit"],
          },
          candidate: {
            score0to1: 0.94,
            evidenceRefs: ["trace:candidate-hackability-audit"],
            signedEvidenceRefs: ["ledger:sig-candidate-hackability-audit"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.benchmarkHackabilityAuditSummary).toMatchObject({
      rowCount: 1,
      scannerIds: ["benchjack-style-synthetic"],
      targetBenchmarkIds: ["synthetic-terminal-benchmark"],
      modes: ["audit"],
      backends: ["hybrid"],
      failedRowIds: [],
      totalFindingCount: 1,
      generatedPocCount: 1,
      validatedPocCount: 1,
      averageExploitabilityScore0to1: 0.04,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "hackability-audit-terminal-style",
      status: "passed",
      benchmarkHackabilityAudit: {
        scannerId: "benchjack-style-synthetic",
        scannerVersion: "2026.06.synthetic",
        targetBenchmarkId: "synthetic-terminal-benchmark",
        mode: "audit",
        backend: "hybrid",
        minPhaseCount: 6,
        minStaticToolCount: 2,
        sandboxNetworkPolicy: "ai_backend_only",
        sandboxReadOnlyMount: true,
        sandboxDroppedCapabilities: true,
        generatedPocCount: 1,
        validatedPocCount: 1,
        minVulnerabilityClassCoverage: 8,
        taskCount: 42,
        exploitabilityScore0to1: 0.04,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      failClosed: false,
      benchmarkHackabilityAuditRowCount: 1,
      failedBenchmarkHackabilityAuditRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("Benchmark Hackability Audit Rows: 1");
    expect(markdown).toContain("Benchmark Hackability Scanners: benchjack-style-synthetic");
    expect(markdown).toContain("hackability-audit-terminal-style");
  });

  test("fails closed when benchmark-hackability audit rows lack scan, sandbox, PoC, coverage, or report proof", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      agentId: "benchmark-hackability-auditor",
      corpusId: "benchjack-style-hackability-synthetic",
      corpusVersion: "2026.06.synthetic",
      sourceRefs: ["https://github.com/benchjack/benchjack"],
      rows: [
        {
          rowId: "hackability-audit-missing-proof",
          fixture: {
            task: "Replay a synthetic benchmark-hackability audit row with missing proof.",
            inputHash: "hackability-audit-missing-input",
            seed: 442,
            benchmarkHackabilityAudit: {
              scannerId: "benchjack-style-synthetic",
              scannerVersion: "2026.06.synthetic",
              targetBenchmarkId: "synthetic-terminal-benchmark",
              sourceRefHash: hackabilitySourceRefHash,
              targetTaskManifestHash: null,
              auditConfigHash: "not-a-sha",
              mode: "hack_it",
              backend: "hybrid",
              phaseTraces: [
                { phase: "setup", traceHash: "bad-hash" },
              ],
              minPhaseCount: 6,
              staticToolReports: [],
              minStaticToolCount: 2,
              aiInspectionTraceHash: null,
              vulnerabilityFindingManifestHash: null,
              dashboardEventStreamHash: "not-a-sha",
              reportArtifactHash: null,
              replayCommandHash: null,
              sandboxConfigHash: null,
              sandboxNetworkPolicy: "unrestricted",
              sandboxReadOnlyMount: false,
              sandboxDroppedCapabilities: false,
              pocValidationMode: "none",
              generatedPocCount: 2,
              validatedPocCount: 0,
              vulnerabilityFindings: [
                { vulnerabilityClass: "weak_string_matching", severity: "high", findingCount: 2 },
                { vulnerabilityClass: "granting_unnecessary_permissions", severity: "critical", findingCount: 1 },
              ],
              minVulnerabilityClassCoverage: 8,
              taskCount: 1,
              minTaskCount: 10,
              exploitabilityScore0to1: 0.8,
              maxExploitabilityScore0to1: 0.1,
            },
          },
          baseline: {
            score0to1: 0.84,
            evidenceRefs: ["trace:baseline-hackability-audit-missing"],
            signedEvidenceRefs: ["ledger:sig-baseline-hackability-audit-missing"],
          },
          candidate: {
            score0to1: 0.72,
            evidenceRefs: ["trace:candidate-hackability-audit-missing"],
            signedEvidenceRefs: ["ledger:sig-candidate-hackability-audit-missing"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toEqual(expect.arrayContaining([
      "benchmark hackability target task manifest hash invalid",
      "benchmark hackability audit config hash invalid",
      "benchmark hackability phase trace hash invalid",
      "benchmark hackability phase trace coverage below minimum",
      "benchmark hackability static tool report coverage below minimum",
      "benchmark hackability AI inspection trace hash invalid",
      "benchmark hackability vulnerability finding manifest hash invalid",
      "benchmark hackability dashboard event stream hash invalid",
      "benchmark hackability report artifact hash invalid",
      "benchmark hackability replay command hash invalid",
      "benchmark hackability sandbox config hash invalid",
      "benchmark hackability sandbox read-only mount missing",
      "benchmark hackability sandbox capability drop missing",
      "benchmark hackability sandbox network policy unrestricted",
      "benchmark hackability PoC validation incomplete",
      "benchmark hackability vulnerability finding evidence hash invalid",
      "benchmark hackability vulnerability class coverage below minimum",
      "benchmark hackability task count below minimum",
      "benchmark hackability exploitability score above threshold",
    ]));
    expect(result.manifest.benchmarkHackabilityAuditSummary.failedRowIds).toEqual(["hackability-audit-missing-proof"]);
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedRowIds: ["hackability-audit-missing-proof"],
      failedBenchmarkHackabilityAuditRowIds: ["hackability-audit-missing-proof"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "hackability-audit-missing-proof",
      severity: "critical",
    });
  });

  test("binds Polymath-style logic benchmark replay proof into replay manifests", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      agentId: "polymath-logic-agent",
      corpusId: "polymath-logic-replay-v1",
      corpusVersion: "2026.06.source-backed",
      sourceRefs: ["https://github.com/facebookresearch/polymath"],
      rows: [
        {
          rowId: "polymath-zebra-logic-001",
          fixture: {
            task: "Replay a small ZebraLogicBench-style symbolic reasoning benchmark row.",
            inputHash: "polymath-zebra-input-001",
            expectedHash: "polymath-zebra-expected-001",
            seed: 17,
            logicBenchmark: {
              benchmarkId: "facebookresearch/polymath",
              paperRefHash: logicPaperRefHash,
              datasetId: "zebra_logic_bench",
              datasetManifestHash: logicDatasetManifestHash,
              datasetAccessReceiptHash: logicDatasetAccessReceiptHash,
              licenseRefHash: logicLicenseRefHash,
              submoduleManifestHash: logicSubmoduleManifestHash,
              environmentYamlHash: logicEnvironmentYamlHash,
              setupScriptHash: logicSetupScriptHash,
              inferenceProviderConfigHash: logicInferenceProviderConfigHash,
              chatCompletionModuleHash: logicChatCompletionModuleHash,
              secretBoundaryHash: logicSecretBoundaryHash,
              logicAgentConfigHash: logicAgentConfigHash,
              auxiliaryToolManifestHash: logicAuxiliaryToolManifestHash,
              constraintSolverConfigHash: logicConstraintSolverConfigHash,
              toolKinds: ["constraint_solver", "zeroeval", "python"],
              benchmarkRunCommandHash: logicRunCommandHash,
              replayCommandHash: logicReplayCommandHash,
              deterministicSeed: 17,
              outputJsonHash: logicOutputJsonHash,
              zeroEvalConfigHash: logicZeroEvalConfigHash,
              zeroEvalResultHash: logicZeroEvalResultHash,
              summaryMarkdownHash: logicSummaryMarkdownHash,
              unitTestCommandHash: logicUnitTestCommandHash,
              unitTestResultHash: logicUnitTestResultHash,
              taskCount: 4,
              minTaskCount: 4,
              logicAccuracy0to1: 0.75,
              minLogicAccuracy0to1: 0.7,
              solverAgreement0to1: 0.9,
              minSolverAgreement0to1: 0.85,
              toolUseCoverage0to1: 1,
              minToolUseCoverage0to1: 0.95,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 1,
            },
          },
          baseline: {
            score0to1: 0.62,
            evidenceRefs: ["trace:baseline-polymath-zebra"],
            signedEvidenceRefs: ["ledger:sig-baseline-polymath-zebra"],
          },
          candidate: {
            score0to1: 0.75,
            evidenceRefs: ["trace:candidate-polymath-zebra"],
            signedEvidenceRefs: ["ledger:sig-candidate-polymath-zebra"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.logicBenchmarkSummary).toEqual({
      rowCount: 1,
      datasetIds: ["zebra_logic_bench"],
      toolKinds: ["constraint_solver", "zeroeval", "python"],
      failedRowIds: [],
      totalTaskCount: 4,
      zeroEvalRowCount: 1,
      unitTestedRowCount: 1,
      averageLogicAccuracy0to1: 0.75,
      averageSolverAgreement0to1: 0.9,
      averageToolUseCoverage0to1: 1,
      averageReplayPassRate0to1: 1,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "polymath-zebra-logic-001",
      status: "passed",
      surfaces: ["Score", "Shield", "Watch"],
      logicBenchmark: {
        benchmarkId: "facebookresearch/polymath",
        datasetId: "zebra_logic_bench",
        datasetManifestHash: logicDatasetManifestHash,
        datasetAccessReceiptHash: logicDatasetAccessReceiptHash,
        licenseRefHash: logicLicenseRefHash,
        environmentYamlHash: logicEnvironmentYamlHash,
        inferenceProviderConfigHash: logicInferenceProviderConfigHash,
        chatCompletionModuleHash: logicChatCompletionModuleHash,
        secretBoundaryHash: logicSecretBoundaryHash,
        toolKinds: ["constraint_solver", "zeroeval", "python"],
        zeroEvalResultHash: logicZeroEvalResultHash,
        summaryMarkdownHash: logicSummaryMarkdownHash,
        replayPassRate0to1: 1,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      failClosed: false,
      logicBenchmarkRowCount: 1,
      failedLogicBenchmarkRowIds: [],
    });
    expect(verifyReplayBenchmarkCorpusReceipt(result.manifest, result.ciReceipt)).toEqual({
      valid: true,
      errors: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("Logic Benchmark Rows: 1");
    expect(markdown).toContain("Logic Benchmark Datasets: zebra_logic_bench");
    expect(markdown).toContain("zebra_logic_bench:0.75:1");
  });

  test("fails closed when Polymath-style logic benchmark replay proof lacks dataset, inference, and evaluator evidence", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      agentId: "polymath-logic-agent",
      corpusId: "polymath-logic-replay-v1",
      sourceRefs: ["https://github.com/facebookresearch/polymath"],
      rows: [
        {
          rowId: "polymath-zebra-missing-evidence",
          fixture: {
            task: "Replay a logic benchmark row without source-backed replay receipts.",
            inputHash: "polymath-zebra-input-missing",
            expectedHash: "polymath-zebra-expected-missing",
            seed: 19,
            logicBenchmark: {
              benchmarkId: "facebookresearch/polymath",
              datasetId: "zebra_logic_bench",
              paperRefHash: logicPaperRefHash,
              licenseRefHash: logicLicenseRefHash,
              logicAgentConfigHash: logicAgentConfigHash,
              toolKinds: ["constraint_solver"],
              deterministicSeed: 19,
              taskCount: 2,
              minTaskCount: 4,
              logicAccuracy0to1: 0.6,
              minLogicAccuracy0to1: 0.7,
              solverAgreement0to1: 0.7,
              minSolverAgreement0to1: 0.85,
              toolUseCoverage0to1: 0.5,
              minToolUseCoverage0to1: 0.95,
              replayPassRate0to1: 0,
              minReplayPassRate0to1: 1,
            },
          },
          baseline: {
            score0to1: 0.6,
            evidenceRefs: ["trace:baseline-polymath-missing"],
            signedEvidenceRefs: ["ledger:sig-baseline-polymath-missing"],
          },
          candidate: {
            score0to1: 0.6,
            evidenceRefs: ["trace:candidate-polymath-missing"],
            signedEvidenceRefs: ["ledger:sig-candidate-polymath-missing"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("logic benchmark dataset manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("logic benchmark dataset access receipt hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("logic benchmark environment yaml hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("logic benchmark setup script hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("logic benchmark inference provider config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("logic benchmark chat completion module hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("logic benchmark secret boundary hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("logic benchmark auxiliary tool manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("logic benchmark output json hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("logic benchmark constraint solver config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("logic benchmark zeroeval evidence hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("logic benchmark task count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("logic benchmark replay pass rate below threshold");
    expect(result.manifest.logicBenchmarkSummary.failedRowIds).toEqual(["polymath-zebra-missing-evidence"]);
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedRowIds: ["polymath-zebra-missing-evidence"],
      logicBenchmarkRowCount: 1,
      failedLogicBenchmarkRowIds: ["polymath-zebra-missing-evidence"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "polymath-zebra-missing-evidence",
      severity: "high",
    });
  });

  test("records advanced RAG notebook replay proof with RAG triad metrics", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      agentId: "advanced-rag-course-agent",
      corpusId: "advanced-rag-notebook-course-v1",
      sourceRefs: ["https://github.com/kevintsai/Building-and-Evaluating-Advanced-RAG-Applications"],
      rows: [
        {
          rowId: "advanced-rag-sentence-window",
          fixture: {
            task: "Replay a synthetic sentence-window RAG evaluation notebook row.",
            inputHash: "advanced-rag-input-sentence-window",
            expectedHash: "advanced-rag-expected-sentence-window",
            seed: 414,
            advancedRag: {
              courseId: "building-evaluating-advanced-rag",
              lessonId: "sentence_window_retrieval",
              retrievalVariant: "sentence_window",
              notebookHash: advancedRagNotebookHash,
              notebookOutputHash: advancedRagNotebookOutputHash,
              environmentHash: advancedRagEnvironmentHash,
              dependencyLockHash: advancedRagDependencyLockHash,
              corpusDocumentHash: advancedRagCorpusDocumentHash,
              indexConfigHash: advancedRagIndexConfigHash,
              querySetHash: advancedRagQuerySetHash,
              referenceAnswerSetHash: advancedRagReferenceAnswerSetHash,
              retrievalTraceHash: advancedRagRetrievalTraceHash,
              generationTraceHash: advancedRagGenerationTraceHash,
              evalConfigHash: advancedRagEvalConfigHash,
              evalTraceHash: advancedRagEvalTraceHash,
              observabilityTraceHash: advancedRagObservabilityTraceHash,
              replayCommandHash: advancedRagReplayCommandHash,
              deterministicSeed: 414,
              queryCount: 12,
              minQueryCount: 10,
              contextRelevance0to1: 0.9,
              minContextRelevance0to1: 0.8,
              groundedness0to1: 0.88,
              minGroundedness0to1: 0.8,
              answerRelevance0to1: 0.86,
              minAnswerRelevance0to1: 0.8,
            },
          },
          baseline: {
            score0to1: 0.69,
            evidenceRefs: ["trace:baseline-advanced-rag"],
            signedEvidenceRefs: ["ledger:sig-baseline-advanced-rag"],
          },
          candidate: {
            score0to1: 0.86,
            evidenceRefs: ["trace:candidate-advanced-rag"],
            signedEvidenceRefs: ["ledger:sig-candidate-advanced-rag"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.advancedRagSummary).toMatchObject({
      rowCount: 1,
      courseIds: ["building-evaluating-advanced-rag"],
      lessonIds: ["sentence_window_retrieval"],
      retrievalVariants: ["sentence_window"],
      failedRowIds: [],
      totalQueryCount: 12,
      averageContextRelevance0to1: 0.9,
      averageGroundedness0to1: 0.88,
      averageAnswerRelevance0to1: 0.86,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "advanced-rag-sentence-window",
      status: "passed",
      advancedRag: {
        courseId: "building-evaluating-advanced-rag",
        lessonId: "sentence_window_retrieval",
        retrievalVariant: "sentence_window",
        notebookHash: advancedRagNotebookHash,
        contextRelevance0to1: 0.9,
        groundedness0to1: 0.88,
        answerRelevance0to1: 0.86,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      failClosed: false,
      advancedRagRowCount: 1,
      failedAdvancedRagRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("Advanced RAG Rows: 1");
    expect(markdown).toContain("Advanced RAG Lessons: sentence_window_retrieval");
    expect(markdown).toContain("advanced-rag-sentence-window");
  });

  test("fails closed when advanced RAG notebook replay proof lacks notebook, trace, replay, or triad evidence", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      agentId: "advanced-rag-course-agent",
      corpusId: "advanced-rag-notebook-course-v1",
      sourceRefs: ["https://github.com/kevintsai/Building-and-Evaluating-Advanced-RAG-Applications"],
      rows: [
        {
          rowId: "advanced-rag-missing-triad-proof",
          fixture: {
            task: "Replay a synthetic advanced RAG notebook row without complete triad proof.",
            inputHash: "advanced-rag-input-missing",
            seed: 415,
            advancedRag: {
              courseId: "building-evaluating-advanced-rag",
              lessonId: "rag_triad",
              retrievalVariant: "baseline",
              notebookHash: "not-a-sha",
              environmentHash: advancedRagEnvironmentHash,
              corpusDocumentHash: advancedRagCorpusDocumentHash,
              querySetHash: advancedRagQuerySetHash,
              retrievalTraceHash: advancedRagRetrievalTraceHash,
              generationTraceHash: advancedRagGenerationTraceHash,
              evalTraceHash: advancedRagEvalTraceHash,
              deterministicSeed: 415,
              queryCount: 4,
              minQueryCount: 10,
              contextRelevance0to1: 0.62,
              minContextRelevance0to1: 0.8,
              groundedness0to1: 0.7,
              minGroundedness0to1: 0.8,
              answerRelevance0to1: 0.76,
              minAnswerRelevance0to1: 0.8,
            },
          },
          baseline: {
            score0to1: 0.8,
            evidenceRefs: ["trace:baseline-advanced-rag-missing"],
            signedEvidenceRefs: ["ledger:sig-baseline-advanced-rag-missing"],
          },
          candidate: {
            score0to1: 0.76,
            evidenceRefs: ["trace:candidate-advanced-rag-missing"],
            signedEvidenceRefs: ["ledger:sig-candidate-advanced-rag-missing"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("advanced rag notebook hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("advanced rag notebook output hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("advanced rag dependency lock hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("advanced rag index config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("advanced rag reference answer set hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("advanced rag eval config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("advanced rag observability trace hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("advanced rag replay command hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("advanced rag query count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("advanced rag context relevance below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("advanced rag groundedness below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("advanced rag answer relevance below threshold");
    expect(result.manifest.advancedRagSummary.failedRowIds).toEqual(["advanced-rag-missing-triad-proof"]);
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedRowIds: ["advanced-rag-missing-triad-proof"],
      advancedRagRowCount: 1,
      failedAdvancedRagRowIds: ["advanced-rag-missing-triad-proof"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "advanced-rag-missing-triad-proof",
      severity: "high",
    });
  });

  test("records GAGE unified evaluation replay proof with structured artifacts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      agentId: "gage-unified-eval-agent",
      corpusId: "gage-game-arena-smoke-v1",
      sourceRefs: ["https://github.com/HiThink-Research/GAGE"],
      rows: [
        {
          rowId: "gage-game-arena-gomoku-smoke",
          fixture: {
            task: "Replay a synthetic GAGE Game Arena smoke evaluation with structured output artifacts.",
            inputHash: "gage-input-game-arena",
            expectedHash: "gage-expected-game-arena",
            seed: 416,
            gageEvaluation: {
              engineVersion: "gage-2026.05.12",
              runId: "gage-run-game-arena-smoke",
              modality: "game",
              harnessMode: "game_arena",
              runConfigHash: gageRunConfigHash,
              registryManifestHash: gageRegistryManifestHash,
              datasetManifestHash: gageDatasetManifestHash,
              modelBackendConfigHash: gageModelBackendConfigHash,
              roleAdapterConfigHash: gageRoleAdapterConfigHash,
              metricConfigHash: gageMetricConfigHash,
              outputContractHash: gageOutputContractHash,
              arenaRuntimeConfigHash: gageArenaRuntimeConfigHash,
              eventsJsonlHash: gageEventsJsonlHash,
              samplesJsonlHash: gageSamplesJsonlHash,
              summaryJsonHash: gageSummaryJsonHash,
              sampleArtifactManifestHash: gageSampleArtifactManifestHash,
              rawArtifactManifestHash: gageRawArtifactManifestHash,
              visualArtifactManifestHash: gageVisualArtifactManifestHash,
              outputDirHash: gageOutputDirHash,
              environmentHash: gageEnvironmentHash,
              dependencyLockHash: gageDependencyLockHash,
              replayCommandHash: gageReplayCommandHash,
              deterministicSeed: 416,
              sampleCount: 6,
              minSampleCount: 5,
              metricCount: 3,
              minMetricCount: 3,
              artifactCount: 5,
              minArtifactCount: 4,
              replayArtifactCoverage0to1: 1,
              minReplayArtifactCoverage0to1: 0.95,
              scoreMean0to1: 0.84,
              minScoreMean0to1: 0.8,
            },
          },
          baseline: {
            score0to1: 0.72,
            evidenceRefs: ["trace:baseline-gage-game-arena"],
            signedEvidenceRefs: ["ledger:sig-baseline-gage-game-arena"],
          },
          candidate: {
            score0to1: 0.84,
            evidenceRefs: ["trace:candidate-gage-game-arena"],
            signedEvidenceRefs: ["ledger:sig-candidate-gage-game-arena"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.gageEvaluationSummary).toMatchObject({
      rowCount: 1,
      engineVersions: ["gage-2026.05.12"],
      modalities: ["game"],
      harnessModes: ["game_arena"],
      failedRowIds: [],
      totalSampleCount: 6,
      totalMetricCount: 3,
      totalArtifactCount: 5,
      averageReplayArtifactCoverage0to1: 1,
      averageScoreMean0to1: 0.84,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "gage-game-arena-gomoku-smoke",
      status: "passed",
      gageEvaluation: {
        runId: "gage-run-game-arena-smoke",
        modality: "game",
        harnessMode: "game_arena",
        scoreMean0to1: 0.84,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      failClosed: false,
      gageEvaluationRowCount: 1,
      failedGageEvaluationRowIds: [],
    });

    const alternate = runReplayBenchmarkCorpus({
      ...baseInput,
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "gage-fixture-hash-control",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            gageEvaluation: {
              engineVersion: "gage-2026.05.12",
              runId: "gage-run-control",
              modality: "llm",
              harnessMode: "native",
              runConfigHash: gageRunConfigHash,
              registryManifestHash: gageRegistryManifestHash,
              datasetManifestHash: gageDatasetManifestHash,
              modelBackendConfigHash: gageModelBackendConfigHash,
              roleAdapterConfigHash: gageRoleAdapterConfigHash,
              metricConfigHash: gageMetricConfigHash,
              outputContractHash: gageOutputContractHash,
              eventsJsonlHash: gageEventsJsonlHash,
              samplesJsonlHash: gageSamplesJsonlHash,
              summaryJsonHash: gageSummaryJsonHash,
              sampleArtifactManifestHash: gageSampleArtifactManifestHash,
              rawArtifactManifestHash: gageRawArtifactManifestHash,
              outputDirHash: gageOutputDirHash,
              environmentHash: gageEnvironmentHash,
              dependencyLockHash: gageDependencyLockHash,
              replayCommandHash: gageReplayCommandHash,
              deterministicSeed: 416,
              sampleCount: 6,
              minSampleCount: 5,
              metricCount: 3,
              minMetricCount: 3,
              artifactCount: 4,
              minArtifactCount: 4,
              replayArtifactCoverage0to1: 1,
              minReplayArtifactCoverage0to1: 0.95,
              scoreMean0to1: 0.84,
              minScoreMean0to1: 0.8,
            },
          },
        },
      ],
    });
    expect(alternate.manifest.rows[0]?.fixtureHash).not.toBe(result.manifest.rows[0]?.fixtureHash);

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("GAGE Rows: 1");
    expect(markdown).toContain("GAGE Modalities: game");
    expect(markdown).toContain("gage-game-arena-gomoku-smoke");
  });

  test("fails closed when GAGE replay proof lacks configs, artifacts, replay command, or thresholds", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      agentId: "gage-unified-eval-agent",
      corpusId: "gage-unified-eval-missing-proof-v1",
      sourceRefs: ["https://github.com/HiThink-Research/GAGE"],
      rows: [
        {
          rowId: "gage-missing-replay-artifacts",
          fixture: {
            task: "Replay a synthetic GAGE row without required replay artifacts.",
            inputHash: "gage-input-missing",
            seed: 417,
            gageEvaluation: {
              engineVersion: "gage-2026.05.12",
              runId: "gage-run-missing",
              modality: "agent",
              harnessMode: "harbor",
              runConfigHash: "not-a-sha",
              datasetManifestHash: gageDatasetManifestHash,
              modelBackendConfigHash: gageModelBackendConfigHash,
              metricConfigHash: gageMetricConfigHash,
              eventsJsonlHash: gageEventsJsonlHash,
              samplesJsonlHash: gageSamplesJsonlHash,
              summaryJsonHash: gageSummaryJsonHash,
              sampleArtifactManifestHash: gageSampleArtifactManifestHash,
              outputDirHash: gageOutputDirHash,
              environmentHash: gageEnvironmentHash,
              deterministicSeed: 417,
              sampleCount: 2,
              minSampleCount: 5,
              metricCount: 1,
              minMetricCount: 3,
              artifactCount: 1,
              minArtifactCount: 4,
              replayArtifactCoverage0to1: 0.6,
              minReplayArtifactCoverage0to1: 0.95,
              scoreMean0to1: 0.7,
              minScoreMean0to1: 0.8,
            },
          },
          baseline: {
            score0to1: 0.81,
            evidenceRefs: ["trace:baseline-gage-missing"],
            signedEvidenceRefs: ["ledger:sig-baseline-gage-missing"],
          },
          candidate: {
            score0to1: 0.79,
            evidenceRefs: ["trace:candidate-gage-missing"],
            signedEvidenceRefs: ["ledger:sig-candidate-gage-missing"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("gage evaluation run config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("gage evaluation registry manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("gage evaluation role adapter config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("gage evaluation output contract hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("gage evaluation external harness config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("gage evaluation raw artifact manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("gage evaluation dependency lock hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("gage evaluation replay command hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("gage evaluation sample count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("gage evaluation metric count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("gage evaluation artifact count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("gage evaluation replay artifact coverage below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("gage evaluation score mean below threshold");
    expect(result.manifest.gageEvaluationSummary.failedRowIds).toEqual(["gage-missing-replay-artifacts"]);
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedRowIds: ["gage-missing-replay-artifacts"],
      gageEvaluationRowCount: 1,
      failedGageEvaluationRowIds: ["gage-missing-replay-artifacts"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "gage-missing-replay-artifacts",
      severity: "high",
    });
  });

  test("records VLA world-model replay proof with taxonomy, traces, metrics, and simulator evidence", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      agentId: "vla-world-model-agent",
      corpusId: "vla-world-model-smoke-v1",
      sourceRefs: ["https://github.com/FutureTwT/awesome-world-models-for-vla-agents"],
      rows: [
        {
          rowId: "vla-world-model-synthetic-smoke",
          fixture: {
            task: "Replay a synthetic VLA world-model benchmark row with taxonomy, metrics, trajectory, and replay proof.",
            inputHash: "vla-input-synthetic-smoke",
            expectedHash: "vla-expected-synthetic-smoke",
            seed: 420,
            vlaWorldModel: {
              surveyId: "world-models-for-vla-survey",
              surveyVersion: "2026.02",
              taxonomyVersion: "vla-world-model-taxonomy-v1",
              paradigm: "world_simulator",
              metricFamily: "simulation_reward",
              foundationModelId: "synthetic-vla-foundation-model",
              modelConfigHash: vlaModelConfigHash,
              datasetManifestHash: vlaDatasetManifestHash,
              benchmarkManifestHash: vlaBenchmarkManifestHash,
              evaluationMetricManifestHash: vlaMetricManifestHash,
              environmentConfigHash: vlaEnvironmentConfigHash,
              observationActionTraceHash: vlaObservationActionTraceHash,
              predictedObservationTraceHash: vlaPredictedObservationTraceHash,
              generatedTrajectoryManifestHash: vlaGeneratedTrajectoryManifestHash,
              simulatorConfigHash: vlaSimulatorConfigHash,
              rewardEvaluatorHash: vlaRewardEvaluatorHash,
              policyConfigHash: vlaPolicyConfigHash,
              replayCommandHash: vlaReplayCommandHash,
              deterministicSeed: 420,
              taskCount: 8,
              minTaskCount: 5,
              benchmarkCount: 2,
              minBenchmarkCount: 2,
              metricCount: 4,
              minMetricCount: 3,
              trajectoryCoverage0to1: 0.98,
              minTrajectoryCoverage0to1: 0.95,
              taskSuccessRate0to1: 0.82,
              minTaskSuccessRate0to1: 0.75,
              worldModelScore0to1: 0.86,
              minWorldModelScore0to1: 0.8,
            },
          },
          baseline: {
            score0to1: 0.74,
            evidenceRefs: ["trace:baseline-vla-world-model"],
            signedEvidenceRefs: ["ledger:sig-baseline-vla-world-model"],
          },
          candidate: {
            score0to1: 0.86,
            evidenceRefs: ["trace:candidate-vla-world-model"],
            signedEvidenceRefs: ["ledger:sig-candidate-vla-world-model"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.vlaWorldModelSummary).toMatchObject({
      rowCount: 1,
      surveyIds: ["world-models-for-vla-survey"],
      paradigms: ["world_simulator"],
      metricFamilies: ["simulation_reward"],
      failedRowIds: [],
      totalTaskCount: 8,
      totalBenchmarkCount: 2,
      totalMetricCount: 4,
      averageTrajectoryCoverage0to1: 0.98,
      averageTaskSuccessRate0to1: 0.82,
      averageWorldModelScore0to1: 0.86,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "vla-world-model-synthetic-smoke",
      status: "passed",
      vlaWorldModel: {
        surveyId: "world-models-for-vla-survey",
        paradigm: "world_simulator",
        metricFamily: "simulation_reward",
        worldModelScore0to1: 0.86,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      failClosed: false,
      vlaWorldModelRowCount: 1,
      failedVlaWorldModelRowIds: [],
    });

    const alternate = runReplayBenchmarkCorpus({
      ...baseInput,
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "vla-fixture-hash-control",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            vlaWorldModel: {
              surveyId: "world-models-for-vla-survey",
              surveyVersion: "2026.02",
              taxonomyVersion: "vla-world-model-taxonomy-v2",
              paradigm: "world_action_model",
              metricFamily: "action_prediction",
              foundationModelId: "synthetic-vla-foundation-model",
              modelConfigHash: vlaModelConfigHash,
              datasetManifestHash: vlaDatasetManifestHash,
              benchmarkManifestHash: vlaBenchmarkManifestHash,
              evaluationMetricManifestHash: vlaMetricManifestHash,
              environmentConfigHash: vlaEnvironmentConfigHash,
              observationActionTraceHash: vlaObservationActionTraceHash,
              predictedObservationTraceHash: vlaPredictedObservationTraceHash,
              generatedTrajectoryManifestHash: vlaGeneratedTrajectoryManifestHash,
              policyConfigHash: vlaPolicyConfigHash,
              replayCommandHash: vlaReplayCommandHash,
              deterministicSeed: 421,
              taskCount: 8,
              minTaskCount: 5,
              benchmarkCount: 2,
              minBenchmarkCount: 2,
              metricCount: 4,
              minMetricCount: 3,
              trajectoryCoverage0to1: 0.98,
              minTrajectoryCoverage0to1: 0.95,
              taskSuccessRate0to1: 0.82,
              minTaskSuccessRate0to1: 0.75,
              worldModelScore0to1: 0.86,
              minWorldModelScore0to1: 0.8,
            },
          },
        },
      ],
    });
    expect(alternate.manifest.rows[0]?.fixtureHash).not.toBe(result.manifest.rows[0]?.fixtureHash);

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("VLA World-Model Rows: 1");
    expect(markdown).toContain("VLA World-Model Paradigms: world_simulator");
    expect(markdown).toContain("VLA World-Model Metric Families: simulation_reward");
    expect(markdown).toContain("vla-world-model-synthetic-smoke");
  });

  test("fails closed when VLA world-model replay proof lacks manifests, traces, seed, or thresholds", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      agentId: "vla-world-model-agent",
      corpusId: "vla-world-model-missing-proof-v1",
      sourceRefs: ["https://github.com/FutureTwT/awesome-world-models-for-vla-agents"],
      rows: [
        {
          rowId: "vla-world-model-missing-replay-proof",
          fixture: {
            task: "Replay a synthetic VLA world-model row without required replay artifacts.",
            inputHash: "vla-input-missing",
            seed: 421,
            vlaWorldModel: {
              paradigm: "world_simulator",
              modelConfigHash: "not-a-sha",
              datasetManifestHash: vlaDatasetManifestHash,
              policyConfigHash: vlaPolicyConfigHash,
              taskCount: 2,
              minTaskCount: 5,
              benchmarkCount: 1,
              minBenchmarkCount: 2,
              metricCount: 1,
              minMetricCount: 3,
              trajectoryCoverage0to1: 0.5,
              minTrajectoryCoverage0to1: 0.95,
              taskSuccessRate0to1: 0.6,
              minTaskSuccessRate0to1: 0.75,
              worldModelScore0to1: 0.7,
              minWorldModelScore0to1: 0.8,
            },
          },
          baseline: {
            score0to1: 0.8,
            evidenceRefs: ["trace:baseline-vla-missing"],
            signedEvidenceRefs: ["ledger:sig-baseline-vla-missing"],
          },
          candidate: {
            score0to1: 0.77,
            evidenceRefs: ["trace:candidate-vla-missing"],
            signedEvidenceRefs: ["ledger:sig-candidate-vla-missing"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("vla world model survey id missing");
    expect(result.manifest.rows[0]?.issues).toContain("vla world model survey version missing");
    expect(result.manifest.rows[0]?.issues).toContain("vla world model taxonomy version missing");
    expect(result.manifest.rows[0]?.issues).toContain("vla world model metric family missing");
    expect(result.manifest.rows[0]?.issues).toContain("vla world model foundation model id missing");
    expect(result.manifest.rows[0]?.issues).toContain("vla world model model config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("vla world model benchmark manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("vla world model evaluation metric manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("vla world model environment config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("vla world model observation-action trace hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("vla world model predicted observation trace hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("vla world model generated trajectory manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("vla world model simulator config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("vla world model reward evaluator hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("vla world model replay command hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("vla world model deterministic seed missing");
    expect(result.manifest.rows[0]?.issues).toContain("vla world model task count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("vla world model benchmark count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("vla world model metric count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("vla world model trajectory coverage below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("vla world model task success below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("vla world model score below threshold");
    expect(result.manifest.vlaWorldModelSummary.failedRowIds).toEqual(["vla-world-model-missing-replay-proof"]);
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedRowIds: ["vla-world-model-missing-replay-proof"],
      vlaWorldModelRowCount: 1,
      failedVlaWorldModelRowIds: ["vla-world-model-missing-replay-proof"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "vla-world-model-missing-replay-proof",
      severity: "critical",
    });
  });

  test("binds AgentBench-style config, workload, trace, and replay proof into corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "agent-benchmark-config-replay",
      sourceRefs: ["https://github.com/VIA-Research/AgentBench"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "agent-benchmark-complete",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            outputArtifactHashes: [artifactHash],
            runtime: {
              kind: "python",
              version: "3.13",
              commandHash,
              dependencyHash,
              sandboxProfile: "local-fixture",
            },
            agentBenchmarkReplay: {
              benchmarkId: "agentbench-style-dynamic-reasoning",
              benchmarkVersion: "2026.06.13",
              paperRefHash: logicPaperRefHash,
              repositorySnapshotHash: artifactHash,
              datasetManifestHash: clawDatasetVersionHash,
              agentConfigHash: clawAgentAdapterHash,
              globalConfigHash: clawTaskConfigSchemaHash,
              modelServerConfigHash: clawMcpServerConfigHash,
              environmentManifestHash: clawServiceCatalogHash,
              dependencyLockHash: dependencyHash,
              runCommandHash: commandHash,
              replayCommandHash: clawReplayCommandHash,
              tracePathHash: clawTrajectoryCaptureHash,
              sampleTraceHash: clawAuditLogHash,
              resultManifestHash: clawVerificationConfigHash,
              metricsReportHash: clawScoringRubricHash,
              architecture: "reasoning_trace",
              workload: "knowledge_qa",
              deterministicSeed: 13,
              sampleCount: 5,
              minSampleCount: 2,
              shuffled: true,
              traceSaved: true,
              baselineMetric0to1: 0.72,
              candidateMetric0to1: 0.84,
              scoreDelta0to1: 0.12,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 1,
              traceCoverage0to1: 1,
              minTraceCoverage0to1: 1,
              maxScoreRegression0to1: 0.05,
            },
          },
          baseline: {
            score0to1: 0.72,
            evidenceRefs: ["trace:baseline-agent-benchmark"],
            signedEvidenceRefs: ["ledger:sig-baseline-agent-benchmark"],
          },
          candidate: {
            score0to1: 0.84,
            evidenceRefs: ["trace:candidate-agent-benchmark"],
            signedEvidenceRefs: ["ledger:sig-candidate-agent-benchmark"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.agentBenchmarkReplaySummary).toMatchObject({
      rowCount: 1,
      architectures: ["reasoning_trace"],
      workloads: ["knowledge_qa"],
      failedRowIds: [],
      totalSampleCount: 5,
      traceSavedRowCount: 1,
      averageCandidateMetric0to1: 0.84,
      averageReplayPassRate0to1: 1,
      averageTraceCoverage0to1: 1,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "agent-benchmark-complete",
      status: "passed",
      agentBenchmarkReplay: {
        benchmarkId: "agentbench-style-dynamic-reasoning",
        architecture: "reasoning_trace",
        workload: "knowledge_qa",
        sampleCount: 5,
        shuffled: true,
        traceSaved: true,
        replayPassRate0to1: 1,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      agentBenchmarkReplayRowCount: 1,
      failedAgentBenchmarkReplayRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("Agent Benchmark Replay Rows: 1");
    expect(markdown).toContain("reasoning_trace:knowledge_qa");
  });

  test("fails closed when AgentBench-style replay rows lack config or trace proof", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "agent-benchmark-config-replay",
      sourceRefs: ["https://github.com/VIA-Research/AgentBench"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "agent-benchmark-missing-replay-proof",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            runtime: {
              kind: "python",
              version: "3.13",
              commandHash: "not-a-hash",
              dependencyHash,
            },
            agentBenchmarkReplay: {
              benchmarkId: "agentbench-style-dynamic-reasoning",
              benchmarkVersion: "2026.06.13",
              architecture: "reasoning_trace",
              workload: "knowledge_qa",
              sampleCount: 1,
              minSampleCount: 2,
              shuffled: true,
              traceSaved: false,
              candidateMetric0to1: 0.8,
              replayPassRate0to1: 0.5,
              minReplayPassRate0to1: 1,
              traceCoverage0to1: 0,
              minTraceCoverage0to1: 1,
              maxScoreRegression0to1: 0.05,
            },
          },
          baseline: {
            score0to1: 0.82,
            evidenceRefs: ["trace:baseline-agent-benchmark-missing"],
            signedEvidenceRefs: ["ledger:sig-baseline-agent-benchmark-missing"],
          },
          candidate: {
            score0to1: 0.8,
            evidenceRefs: ["trace:candidate-agent-benchmark-missing"],
            signedEvidenceRefs: ["ledger:sig-candidate-agent-benchmark-missing"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay paper ref hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay repository snapshot hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay dataset manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay run command hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay trace path hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay result manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay trace saved disabled");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay sample count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay replay pass rate below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay trace coverage below threshold");
    expect(result.manifest.agentBenchmarkReplaySummary.failedRowIds).toEqual(["agent-benchmark-missing-replay-proof"]);
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      agentBenchmarkReplayRowCount: 1,
      failedAgentBenchmarkReplayRowIds: ["agent-benchmark-missing-replay-proof"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "agent-benchmark-missing-replay-proof",
      severity: "critical",
    });
  });

  test("binds AI-agent benchmark comparison proof with source manifests, score deltas, and CI receipt evidence", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "ai-agent-benchmark-comparison-replay",
      sourceRefs: ["https://github.com/murataslan1/ai-agent-benchmark"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "ai-agent-benchmark-comparison-complete",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            outputArtifactHashes: [artifactHash],
            runtime: {
              kind: "container",
              version: "agent-comparison-runtime-2026.06",
              commandHash,
              dependencyHash,
              sandboxProfile: "ai-agent-benchmark-fixture",
            },
            agentBenchmarkReplay: {
              benchmarkId: "amc-ai-agent-benchmark-comparison",
              benchmarkVersion: "2026.06.16",
              paperRefHash: aiAgentBenchmarkSourceRefHash,
              repositorySnapshotHash: aiAgentBenchmarkRepositorySnapshotHash,
              datasetManifestHash: aiAgentBenchmarkBenchmarkDatasetHash,
              agentConfigHash: clawAgentAdapterHash,
              globalConfigHash: clawTaskConfigSchemaHash,
              modelServerConfigHash: clawMcpServerConfigHash,
              environmentManifestHash: aiAgentBenchmarkEvalPackManifestHash,
              dependencyLockHash: dependencyHash,
              runCommandHash: commandHash,
              replayCommandHash: aiAgentBenchmarkReplayCommandHash,
              tracePathHash: clawTrajectoryCaptureHash,
              sampleTraceHash: clawAuditLogHash,
              resultManifestHash: aiAgentBenchmarkResultManifestHash,
              metricsReportHash: aiAgentBenchmarkScoreManifestHash,
              architecture: "reasoning_trace",
              workload: "code_generation",
              deterministicSeed: 49,
              sampleCount: 8,
              minSampleCount: 4,
              shuffled: true,
              traceSaved: true,
              baselineMetric0to1: 0.71,
              candidateMetric0to1: 0.79,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 1,
              traceCoverage0to1: 1,
              minTraceCoverage0to1: 1,
              maxScoreRegression0to1: 0.05,
              aiAgentBenchmarkSourceRefHash,
              aiAgentBenchmarkRepositorySnapshotHash,
              aiAgentBenchmarkLicenseRefHash,
              aiAgentBenchmarkAgentRosterHash,
              aiAgentBenchmarkBenchmarkDatasetHash,
              aiAgentBenchmarkSourceManifestHash,
              aiAgentBenchmarkPricingSnapshotHash,
              aiAgentBenchmarkUserReportManifestHash,
              aiAgentBenchmarkLeaderboardSnapshotHash,
              aiAgentBenchmarkScoreManifestHash,
              aiAgentBenchmarkEvalPackManifestHash,
              aiAgentBenchmarkFixtureHash,
              aiAgentBenchmarkReplayCommandHash,
              aiAgentBenchmarkResultManifestHash,
              aiAgentBenchmarkScoreDeltaReportHash,
              aiAgentBenchmarkCiReceiptHash,
              aiAgentBenchmarkComparisonRunId: "amc-ai-agent-comparison-smoke",
              aiAgentBenchmarkAgentUnderTestId: "synthetic-cli-agent",
              aiAgentBenchmarkAgentCategory: "cli_agent",
              aiAgentBenchmarkFamilies: ["swe_bench", "pricing", "user_report", "security_risk"],
              minAiAgentBenchmarkFamilyCount: 4,
              aiAgentBenchmarkSourceCategories: [
                "github_repo",
                "benchmark_dataset",
                "developer_forum",
                "pricing_page",
                "research_report",
              ],
              minAiAgentBenchmarkSourceCategoryCount: 5,
              aiAgentBenchmarkAgentCount: 80,
              minAiAgentBenchmarkAgentCount: 10,
              aiAgentBenchmarkSourceCount: 140,
              minAiAgentBenchmarkSourceCount: 10,
              aiAgentBenchmarkBenchmarkCount: 3,
              minAiAgentBenchmarkBenchmarkCount: 2,
              aiAgentBenchmarkDeterministicSeed: 49,
              aiAgentBenchmarkBaselineScore0to1: 0.71,
              aiAgentBenchmarkCandidateScore0to1: 0.79,
              maxAiAgentBenchmarkScoreRegression0to1: 0.03,
              aiAgentBenchmarkReplayPassRate0to1: 1,
              minAiAgentBenchmarkReplayPassRate0to1: 1,
              aiAgentBenchmarkSourceCoverage0to1: 1,
              minAiAgentBenchmarkSourceCoverage0to1: 0.95,
              aiAgentBenchmarkPricingCoverage0to1: 1,
              minAiAgentBenchmarkPricingCoverage0to1: 0.9,
              aiAgentBenchmarkUserReportCoverage0to1: 0.96,
              minAiAgentBenchmarkUserReportCoverage0to1: 0.9,
            },
          },
          baseline: {
            score0to1: 0.71,
            evidenceRefs: ["trace:baseline-ai-agent-benchmark-comparison"],
            signedEvidenceRefs: ["ledger:sig-baseline-ai-agent-benchmark-comparison"],
          },
          candidate: {
            score0to1: 0.79,
            evidenceRefs: ["trace:candidate-ai-agent-benchmark-comparison"],
            signedEvidenceRefs: ["ledger:sig-candidate-ai-agent-benchmark-comparison"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.agentBenchmarkReplaySummary).toMatchObject({
      rowCount: 1,
      aiAgentBenchmarkComparisonRowCount: 1,
      aiAgentBenchmarkFamilies: ["swe_bench", "pricing", "user_report", "security_risk"],
      aiAgentBenchmarkSourceCategories: [
        "github_repo",
        "benchmark_dataset",
        "developer_forum",
        "pricing_page",
        "research_report",
      ],
      failedAiAgentBenchmarkComparisonRowIds: [],
      totalAiAgentBenchmarkAgentCount: 80,
      totalAiAgentBenchmarkSourceCount: 140,
      totalAiAgentBenchmarkBenchmarkCount: 3,
      averageAiAgentBenchmarkScoreDelta0to1: 0.08,
      averageAiAgentBenchmarkReplayPassRate0to1: 1,
      averageAiAgentBenchmarkSourceCoverage0to1: 1,
      averageAiAgentBenchmarkPricingCoverage0to1: 1,
      averageAiAgentBenchmarkUserReportCoverage0to1: 0.96,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "ai-agent-benchmark-comparison-complete",
      status: "passed",
      agentBenchmarkReplay: {
        aiAgentBenchmarkComparisonRunId: "amc-ai-agent-comparison-smoke",
        aiAgentBenchmarkAgentUnderTestId: "synthetic-cli-agent",
        aiAgentBenchmarkAgentCategory: "cli_agent",
        aiAgentBenchmarkAgentCount: 80,
        aiAgentBenchmarkSourceCount: 140,
        aiAgentBenchmarkBenchmarkCount: 3,
        aiAgentBenchmarkScoreDelta0to1: 0.08,
        aiAgentBenchmarkReplayPassRate0to1: 1,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      agentBenchmarkReplayRowCount: 1,
      aiAgentBenchmarkComparisonRowCount: 1,
      failedAiAgentBenchmarkComparisonRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("AI Agent Benchmark Comparison Rows: 1");
    expect(markdown).toContain("AI Agent Benchmark Families: swe_bench, pricing, user_report, security_risk");
    expect(markdown).toContain("reasoning_trace:code_generation:ai-agent-comparison");
  });

  test("fails closed when AI-agent benchmark comparison proof lacks replay, source, pricing, or user-report evidence", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "ai-agent-benchmark-comparison-replay",
      sourceRefs: ["https://github.com/murataslan1/ai-agent-benchmark"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "ai-agent-benchmark-comparison-missing-proof",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            outputArtifactHashes: [artifactHash],
            runtime: {
              kind: "container",
              version: "agent-comparison-runtime-2026.06",
              commandHash,
              dependencyHash,
              sandboxProfile: "ai-agent-benchmark-fixture",
            },
            agentBenchmarkReplay: {
              benchmarkId: "amc-ai-agent-benchmark-comparison",
              benchmarkVersion: "2026.06.16",
              paperRefHash: aiAgentBenchmarkSourceRefHash,
              repositorySnapshotHash: aiAgentBenchmarkRepositorySnapshotHash,
              datasetManifestHash: aiAgentBenchmarkBenchmarkDatasetHash,
              agentConfigHash: clawAgentAdapterHash,
              globalConfigHash: clawTaskConfigSchemaHash,
              modelServerConfigHash: clawMcpServerConfigHash,
              environmentManifestHash: aiAgentBenchmarkEvalPackManifestHash,
              dependencyLockHash: dependencyHash,
              runCommandHash: commandHash,
              replayCommandHash: aiAgentBenchmarkReplayCommandHash,
              tracePathHash: clawTrajectoryCaptureHash,
              sampleTraceHash: clawAuditLogHash,
              resultManifestHash: aiAgentBenchmarkResultManifestHash,
              metricsReportHash: aiAgentBenchmarkScoreManifestHash,
              architecture: "reasoning_trace",
              workload: "code_generation",
              deterministicSeed: 50,
              sampleCount: 4,
              minSampleCount: 4,
              shuffled: true,
              traceSaved: true,
              baselineMetric0to1: 0.8,
              candidateMetric0to1: 0.72,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 1,
              traceCoverage0to1: 1,
              minTraceCoverage0to1: 1,
              maxScoreRegression0to1: 0.05,
              aiAgentBenchmarkSourceRefHash,
              aiAgentBenchmarkRepositorySnapshotHash: "not-a-hash",
              aiAgentBenchmarkAgentRosterHash: null,
              aiAgentBenchmarkBenchmarkDatasetHash,
              aiAgentBenchmarkSourceManifestHash,
              aiAgentBenchmarkPricingSnapshotHash: "not-a-hash",
              aiAgentBenchmarkUserReportManifestHash: null,
              aiAgentBenchmarkLeaderboardSnapshotHash: aiAgentBenchmarkLeaderboardSnapshotHash,
              aiAgentBenchmarkScoreManifestHash: aiAgentBenchmarkScoreManifestHash,
              aiAgentBenchmarkEvalPackManifestHash: aiAgentBenchmarkEvalPackManifestHash,
              aiAgentBenchmarkFixtureHash: null,
              aiAgentBenchmarkReplayCommandHash: null,
              aiAgentBenchmarkResultManifestHash: aiAgentBenchmarkResultManifestHash,
              aiAgentBenchmarkScoreDeltaReportHash: null,
              aiAgentBenchmarkCiReceiptHash: null,
              aiAgentBenchmarkComparisonRunId: "amc-ai-agent-comparison-missing-proof",
              aiAgentBenchmarkFamilies: ["pricing"],
              minAiAgentBenchmarkFamilyCount: 2,
              aiAgentBenchmarkSourceCategories: [],
              minAiAgentBenchmarkSourceCategoryCount: 2,
              aiAgentBenchmarkAgentCount: 1,
              minAiAgentBenchmarkAgentCount: 10,
              aiAgentBenchmarkSourceCount: 2,
              minAiAgentBenchmarkSourceCount: 10,
              aiAgentBenchmarkBenchmarkCount: 1,
              minAiAgentBenchmarkBenchmarkCount: 2,
              aiAgentBenchmarkBaselineScore0to1: 0.8,
              aiAgentBenchmarkCandidateScore0to1: 0.72,
              maxAiAgentBenchmarkScoreRegression0to1: 0.02,
              aiAgentBenchmarkReplayPassRate0to1: 0.5,
              minAiAgentBenchmarkReplayPassRate0to1: 1,
              aiAgentBenchmarkSourceCoverage0to1: 0.4,
              minAiAgentBenchmarkSourceCoverage0to1: 0.9,
              aiAgentBenchmarkPricingCoverage0to1: 0.5,
              minAiAgentBenchmarkPricingCoverage0to1: 1,
              minAiAgentBenchmarkUserReportCoverage0to1: 0.9,
            },
          },
          baseline: {
            score0to1: 0.8,
            evidenceRefs: ["trace:baseline-ai-agent-benchmark-comparison-missing"],
            signedEvidenceRefs: ["ledger:sig-baseline-ai-agent-benchmark-comparison-missing"],
          },
          candidate: {
            score0to1: 0.72,
            evidenceRefs: ["trace:candidate-ai-agent-benchmark-comparison-missing"],
            signedEvidenceRefs: ["ledger:sig-candidate-ai-agent-benchmark-comparison-missing"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay ai-agent repository snapshot hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay ai-agent license ref hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay ai-agent agent roster hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay ai-agent pricing snapshot hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay ai-agent user-report manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay ai-agent fixture hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay ai-agent replay command hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay ai-agent score delta report hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay ai-agent ci receipt hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay ai-agent agent under test missing");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay ai-agent agent category missing");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay ai-agent benchmark family count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay ai-agent source category count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay ai-agent agent count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay ai-agent source count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay ai-agent benchmark count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay ai-agent deterministic seed missing");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay ai-agent score regression exceeds threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay ai-agent replay pass rate below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay ai-agent source coverage below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay ai-agent pricing coverage below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay ai-agent user-report coverage missing");
    expect(result.manifest.agentBenchmarkReplaySummary.failedAiAgentBenchmarkComparisonRowIds).toEqual([
      "ai-agent-benchmark-comparison-missing-proof",
    ]);
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      aiAgentBenchmarkComparisonRowCount: 1,
      failedAiAgentBenchmarkComparisonRowIds: ["ai-agent-benchmark-comparison-missing-proof"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "ai-agent-benchmark-comparison-missing-proof",
      severity: "critical",
    });
  });

  test("binds GAIA agent benchmark replay proof with fixed seeds, tool traces, score deltas, and CI receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "gaia-agent-replay-corpus",
      sourceRefs: [
        "https://github.com/gaia-agent/gaia-agent",
        "git:gaia-agent/gaia-agent@369fb4e9958d2357033c853ad35ef8c88773101e",
        "github-api:gaia-agent/gaia-agent:benchmark/tree=7be86324f8fc2929e4ecc977479e0a8d15b3d057",
      ],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "gaia-agent-replay-complete",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            outputArtifactHashes: [artifactHash],
            runtime: {
              kind: "node",
              version: "gaia-agent-fixture-2026.06",
              commandHash,
              dependencyHash,
              sandboxProfile: "gaia-agent-replay-fixture",
            },
            agentBenchmarkReplay: {
              benchmarkId: "amc-gaia-agent-replay",
              benchmarkVersion: "2026.06.19",
              paperRefHash: gaiaAgentSourceRefHash,
              repositorySnapshotHash: gaiaAgentRepositorySnapshotHash,
              datasetManifestHash: gaiaAgentTaskManifestHash,
              agentConfigHash: clawAgentAdapterHash,
              globalConfigHash: clawTaskConfigSchemaHash,
              modelServerConfigHash: gaiaAgentModelRouteHash,
              environmentManifestHash: gaiaAgentRunConfigHash,
              dependencyLockHash: gaiaAgentLockfileHash,
              runCommandHash: commandHash,
              replayCommandHash: gaiaAgentReplayCommandHash,
              tracePathHash: gaiaAgentRunOutputHash,
              sampleTraceHash: clawAuditLogHash,
              resultManifestHash: gaiaAgentScoreReportHash,
              metricsReportHash: gaiaAgentScoreReportHash,
              architecture: "reasoning_trace",
              workload: "knowledge_qa",
              deterministicSeed: 546,
              sampleCount: 6,
              minSampleCount: 4,
              shuffled: true,
              traceSaved: true,
              baselineMetric0to1: 0.62,
              candidateMetric0to1: 0.74,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 1,
              traceCoverage0to1: 1,
              minTraceCoverage0to1: 0.95,
              maxScoreRegression0to1: 0.03,
              gaiaAgentSourceRefHash,
              gaiaAgentRepositorySnapshotHash,
              gaiaAgentLicenseRefHash,
              gaiaAgentReadmeBlobHash,
              gaiaAgentPackageManifestHash,
              gaiaAgentLockfileHash,
              gaiaAgentBenchmarkTreeHash,
              gaiaAgentBenchmarkDownloaderHash,
              gaiaAgentBenchmarkRunnerHash,
              gaiaAgentBenchmarkEvaluatorHash,
              gaiaAgentReflectionEvaluatorHash,
              gaiaAgentReporterHash,
              gaiaAgentBenchmarkWorkflowHash,
              gaiaAgentBenchmarkDocsHash,
              gaiaAgentBenchmarkResultsHash,
              gaiaAgentValidationDocsHash,
              gaiaAgentSourceTreeHash,
              gaiaAgentTestTreeHash,
              gaiaAgentToolSurfaces: ["browser", "search", "memory", "planning", "sandbox"],
              minGaiaAgentToolSurfaceCount: 5,
              gaiaAgentTaskManifestHash,
              gaiaAgentDatasetSnapshotHash,
              gaiaAgentFixedSeed: "gaia-agent-seed-546",
              gaiaAgentProviderConfigHash,
              gaiaAgentModelRouteHash,
              gaiaAgentRunConfigHash,
              gaiaAgentRunOutputHash,
              gaiaAgentScoreReportHash,
              gaiaAgentReplayCommandHash,
              gaiaAgentCiReceiptHash,
              gaiaAgentSampleCount: 6,
              minGaiaAgentSampleCount: 4,
              gaiaAgentReplayPassRate0to1: 1,
              minGaiaAgentReplayPassRate0to1: 1,
              gaiaAgentScoreDelta0to1: 0.12,
              minGaiaAgentScoreDelta0to1: 0,
              gaiaAgentEvaluatorAgreement0to1: 0.94,
              minGaiaAgentEvaluatorAgreement0to1: 0.9,
              gaiaAgentToolTraceCoverage0to1: 1,
              minGaiaAgentToolTraceCoverage0to1: 0.95,
              gaiaAgentResultCoverage0to1: 1,
              minGaiaAgentResultCoverage0to1: 1,
            },
          },
          baseline: {
            score0to1: 0.62,
            evidenceRefs: ["trace:baseline-gaia-agent", "github:gaia-agent/gaia-agent@369fb4e9958d2357033c853ad35ef8c88773101e"],
            signedEvidenceRefs: ["ledger:sig-baseline-gaia-agent"],
          },
          candidate: {
            score0to1: 0.74,
            evidenceRefs: ["trace:candidate-gaia-agent", "github:gaia-agent/gaia-agent:benchmark/run.ts#aa834d54dc073977be9f1a27abeb796fcc04bb0b"],
            signedEvidenceRefs: ["ledger:sig-candidate-gaia-agent"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.agentBenchmarkReplaySummary).toMatchObject({
      rowCount: 1,
      gaiaAgentReplayRowCount: 1,
      gaiaAgentToolSurfaces: ["browser", "search", "memory", "planning", "sandbox"],
      failedGaiaAgentReplayRowIds: [],
      totalGaiaAgentSampleCount: 6,
      averageGaiaAgentReplayPassRate0to1: 1,
      averageGaiaAgentScoreDelta0to1: 0.12,
      averageGaiaAgentEvaluatorAgreement0to1: 0.94,
      averageGaiaAgentToolTraceCoverage0to1: 1,
      averageGaiaAgentResultCoverage0to1: 1,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "gaia-agent-replay-complete",
      status: "passed",
      agentBenchmarkReplay: {
        gaiaAgentFixedSeed: "gaia-agent-seed-546",
        gaiaAgentToolSurfaces: ["browser", "search", "memory", "planning", "sandbox"],
        gaiaAgentSampleCount: 6,
        gaiaAgentReplayPassRate0to1: 1,
        gaiaAgentScoreDelta0to1: 0.12,
        gaiaAgentToolTraceCoverage0to1: 1,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      agentBenchmarkReplayRowCount: 1,
      gaiaAgentReplayRowCount: 1,
      failedGaiaAgentReplayRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("GAIA Agent Replay Rows: 1");
    expect(markdown).toContain("GAIA Agent Tool Surfaces: browser, search, memory, planning, sandbox");
    expect(markdown).toContain("reasoning_trace:knowledge_qa:gaia-agent");
  });

  test("binds PaperArena replay proof with source, dataset, tool, scoring, and CI receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "paperarena-replay-corpus",
      sourceRefs: [
        "https://github.com/ustc-ai4science/PaperArena",
        "git:ustc-ai4science/PaperArena@b6f392a989917cc14c2e2839fa06e477cb7e8044",
        "hf:Melmaphother/PaperArena-Data@2e8084c60d7682f8652f8102a04eaf8c13d22727",
      ],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "paperarena-replay-complete",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            outputArtifactHashes: [artifactHash],
            runtime: {
              kind: "python",
              version: "paperarena-fixture-2026.06",
              commandHash,
              dependencyHash,
              sandboxProfile: "paperarena-local-replay",
            },
            agentBenchmarkReplay: {
              benchmarkId: "paperarena",
              benchmarkVersion: "2026.06.20-source-snapshot",
              paperRefHash: paperArenaSourceRefHash,
              repositorySnapshotHash: paperArenaRepositorySnapshotHash,
              datasetManifestHash: paperArenaDatasetManifestHash,
              agentConfigHash: paperArenaHubConfigHash,
              globalConfigHash: paperArenaHubConfigHash,
              modelServerConfigHash: paperArenaHubRunnerHash,
              environmentManifestHash: paperArenaRequirementsHash,
              dependencyLockHash: paperArenaRequirementsHash,
              runCommandHash: commandHash,
              replayCommandHash: paperArenaReplayCommandHash,
              tracePathHash: paperArenaResultManifestHash,
              sampleTraceHash: toolHashA,
              resultManifestHash: paperArenaResultManifestHash,
              metricsReportHash: paperArenaScoreReportHash,
              architecture: "reasoning_trace",
              workload: "knowledge_qa",
              deterministicSeed: 560,
              sampleCount: 12,
              minSampleCount: 8,
              shuffled: true,
              traceSaved: true,
              baselineMetric0to1: 0.38,
              candidateMetric0to1: 0.46,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 1,
              traceCoverage0to1: 1,
              minTraceCoverage0to1: 0.95,
              maxScoreRegression0to1: 0.02,
              paperArenaSourceRefHash,
              paperArenaRepositorySnapshotHash,
              paperArenaNoLicenseBoundaryHash,
              paperArenaReadmeBlobHash,
              paperArenaRequirementsHash,
              paperArenaHubConfigHash,
              paperArenaHubRunnerHash,
              paperArenaResultRecorderHash,
              paperArenaDataLoaderHash,
              paperArenaScorerHash,
              paperArenaDatasetBuilderTreeHash,
              paperArenaToolTreeHash,
              paperArenaRagTreeHash,
              paperArenaReflectorTreeHash,
              paperArenaRunScriptTreeHash,
              paperArenaHfDatasetSnapshotHash,
              paperArenaDatasetManifestHash,
              paperArenaPaperCorpusHash,
              paperArenaQaManifestHash,
              paperArenaResultManifestHash,
              paperArenaScoreReportHash,
              paperArenaReplayCommandHash,
              paperArenaCiReceiptHash,
              paperArenaToolSurfaces: [
                "pdf_parser",
                "retrieval",
                "database_search",
                "web_search",
                "code_execution",
                "data_analysis",
                "llm_judge",
                "result_recorder",
              ],
              minPaperArenaToolSurfaceCount: 8,
              paperArenaQuestionCount: 6722,
              minPaperArenaQuestionCount: 500,
              paperArenaPaperCount: 500,
              minPaperArenaPaperCount: 100,
              paperArenaToolCount: 15,
              minPaperArenaToolCount: 8,
              paperArenaRunScriptCount: 9,
              minPaperArenaRunScriptCount: 4,
              paperArenaDeterministicSeed: 560,
              paperArenaMaxSteps: 40,
              minPaperArenaMaxSteps: 20,
              paperArenaReplayPassRate0to1: 1,
              minPaperArenaReplayPassRate0to1: 1,
              paperArenaScoreDelta0to1: 0.08,
              minPaperArenaScoreDelta0to1: 0,
              paperArenaEvaluatorAgreement0to1: 0.92,
              minPaperArenaEvaluatorAgreement0to1: 0.9,
              paperArenaToolTraceCoverage0to1: 1,
              minPaperArenaToolTraceCoverage0to1: 0.95,
              paperArenaResultCoverage0to1: 1,
              minPaperArenaResultCoverage0to1: 1,
            },
          },
          baseline: {
            score0to1: 0.38,
            evidenceRefs: [
              "trace:baseline-paperarena",
              "github:ustc-ai4science/PaperArena@b6f392a989917cc14c2e2839fa06e477cb7e8044",
              "hf:Melmaphother/PaperArena-Data@2e8084c60d7682f8652f8102a04eaf8c13d22727",
            ],
            signedEvidenceRefs: ["ledger:sig-baseline-paperarena"],
          },
          candidate: {
            score0to1: 0.46,
            evidenceRefs: [
              "trace:candidate-paperarena",
              "github:ustc-ai4science/PaperArena:paperarena_hub/run_react.py@eb0af0069b9c82f2e5508e4a05e4d45f183c52af",
              "github:ustc-ai4science/PaperArena:paperarena_hub/tools@3c34743c7c6fcf8ac3d8f4fd8a3de1de20ca9700",
            ],
            signedEvidenceRefs: ["ledger:sig-candidate-paperarena"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.agentBenchmarkReplaySummary).toMatchObject({
      rowCount: 1,
      paperArenaReplayRowCount: 1,
      paperArenaToolSurfaces: [
        "pdf_parser",
        "retrieval",
        "database_search",
        "web_search",
        "code_execution",
        "data_analysis",
        "llm_judge",
        "result_recorder",
      ],
      failedPaperArenaReplayRowIds: [],
      totalPaperArenaQuestionCount: 6722,
      totalPaperArenaPaperCount: 500,
      totalPaperArenaToolCount: 15,
      averagePaperArenaReplayPassRate0to1: 1,
      averagePaperArenaScoreDelta0to1: 0.08,
      averagePaperArenaEvaluatorAgreement0to1: 0.92,
      averagePaperArenaToolTraceCoverage0to1: 1,
      averagePaperArenaResultCoverage0to1: 1,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "paperarena-replay-complete",
      status: "passed",
      surfaces: ["Score", "Shield", "Watch"],
      agentBenchmarkReplay: {
        paperArenaRepositorySnapshotHash,
        paperArenaNoLicenseBoundaryHash,
        paperArenaQuestionCount: 6722,
        paperArenaPaperCount: 500,
        paperArenaToolCount: 15,
        paperArenaReplayPassRate0to1: 1,
        paperArenaScoreDelta0to1: 0.08,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      agentBenchmarkReplayRowCount: 1,
      paperArenaReplayRowCount: 1,
      failedPaperArenaReplayRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("PaperArena Replay Rows: 1");
    expect(markdown).toContain("PaperArena Tool Surfaces: pdf_parser, retrieval, database_search, web_search, code_execution, data_analysis, llm_judge, result_recorder");
    expect(markdown).toContain("PaperArena Questions: 6722");
    expect(markdown).toContain("reasoning_trace:knowledge_qa:paperarena");
  });

  test("fails closed when PaperArena proof is only repository metadata without dataset, tools, scoring, replay, or CI receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "paperarena-replay-corpus",
      sourceRefs: ["https://github.com/ustc-ai4science/PaperArena"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "paperarena-metadata-only",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            outputArtifactHashes: [artifactHash],
            runtime: {
              kind: "python",
              version: "paperarena-fixture-2026.06",
              commandHash,
              dependencyHash,
              sandboxProfile: "paperarena-local-replay",
            },
            agentBenchmarkReplay: {
              benchmarkId: "paperarena",
              benchmarkVersion: "2026.06.20-source-snapshot",
              paperRefHash: paperArenaSourceRefHash,
              repositorySnapshotHash: paperArenaRepositorySnapshotHash,
              datasetManifestHash: paperArenaDatasetManifestHash,
              agentConfigHash: paperArenaHubConfigHash,
              globalConfigHash: paperArenaHubConfigHash,
              modelServerConfigHash: paperArenaHubRunnerHash,
              environmentManifestHash: paperArenaRequirementsHash,
              dependencyLockHash: paperArenaRequirementsHash,
              runCommandHash: commandHash,
              replayCommandHash: paperArenaReplayCommandHash,
              tracePathHash: paperArenaResultManifestHash,
              sampleTraceHash: toolHashA,
              resultManifestHash: paperArenaResultManifestHash,
              metricsReportHash: paperArenaScoreReportHash,
              architecture: "reasoning_trace",
              workload: "knowledge_qa",
              deterministicSeed: 560,
              sampleCount: 4,
              minSampleCount: 8,
              shuffled: true,
              traceSaved: true,
              baselineMetric0to1: 0.38,
              candidateMetric0to1: 0.35,
              replayPassRate0to1: 0.7,
              minReplayPassRate0to1: 1,
              traceCoverage0to1: 0.7,
              minTraceCoverage0to1: 0.95,
              maxScoreRegression0to1: 0.01,
              paperArenaSourceRefHash,
              paperArenaToolSurfaces: ["pdf_parser", "retrieval"],
              minPaperArenaToolSurfaceCount: 8,
              paperArenaQuestionCount: 10,
              minPaperArenaQuestionCount: 500,
              paperArenaPaperCount: 5,
              minPaperArenaPaperCount: 100,
              paperArenaToolCount: 2,
              minPaperArenaToolCount: 8,
              paperArenaRunScriptCount: 1,
              minPaperArenaRunScriptCount: 4,
              paperArenaMaxSteps: 8,
              minPaperArenaMaxSteps: 20,
              paperArenaReplayPassRate0to1: 0.7,
              minPaperArenaReplayPassRate0to1: 1,
              paperArenaScoreDelta0to1: -0.03,
              minPaperArenaScoreDelta0to1: 0,
              paperArenaEvaluatorAgreement0to1: 0.7,
              minPaperArenaEvaluatorAgreement0to1: 0.9,
              paperArenaToolTraceCoverage0to1: 0.6,
              minPaperArenaToolTraceCoverage0to1: 0.95,
              paperArenaResultCoverage0to1: 0.5,
              minPaperArenaResultCoverage0to1: 1,
            },
          },
          baseline: {
            score0to1: 0.38,
            evidenceRefs: ["trace:baseline-paperarena-missing"],
            signedEvidenceRefs: ["ledger:sig-baseline-paperarena-missing"],
          },
          candidate: {
            score0to1: 0.35,
            evidenceRefs: ["trace:candidate-paperarena-missing"],
            signedEvidenceRefs: ["ledger:sig-candidate-paperarena-missing"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toEqual(expect.arrayContaining([
      "agent benchmark replay sample count below threshold",
      "agent benchmark replay score regression exceeds threshold",
      "agent benchmark replay paperarena repository snapshot hash invalid",
      "agent benchmark replay paperarena no-license boundary hash invalid",
      "agent benchmark replay paperarena readme blob hash invalid",
      "agent benchmark replay paperarena requirements hash invalid",
      "agent benchmark replay paperarena hub runner hash invalid",
      "agent benchmark replay paperarena hf dataset snapshot hash invalid",
      "agent benchmark replay paperarena dataset manifest hash invalid",
      "agent benchmark replay paperarena score report hash invalid",
      "agent benchmark replay paperarena ci receipt hash invalid",
      "agent benchmark replay paperarena tool surface count below threshold",
      "agent benchmark replay paperarena question count below threshold",
      "agent benchmark replay paperarena paper count below threshold",
      "agent benchmark replay paperarena tool count below threshold",
      "agent benchmark replay paperarena run script count below threshold",
      "agent benchmark replay paperarena deterministic seed missing",
      "agent benchmark replay paperarena max steps below threshold",
      "agent benchmark replay paperarena replay pass rate below threshold",
      "agent benchmark replay paperarena score delta below threshold",
      "agent benchmark replay paperarena evaluator agreement below threshold",
      "agent benchmark replay paperarena tool trace coverage below threshold",
      "agent benchmark replay paperarena result coverage below threshold",
    ]));
    expect(result.manifest.agentBenchmarkReplaySummary.failedPaperArenaReplayRowIds).toEqual([
      "paperarena-metadata-only",
    ]);
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      paperArenaReplayRowCount: 1,
      failedPaperArenaReplayRowIds: ["paperarena-metadata-only"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "paperarena-metadata-only",
      severity: "critical",
    });
  });

  test("fails closed when GAIA agent replay proof lacks source-linked fixtures or reproducible scoring receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "gaia-agent-replay-corpus",
      sourceRefs: ["https://github.com/gaia-agent/gaia-agent"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "gaia-agent-replay-missing-proof",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            outputArtifactHashes: [artifactHash],
            runtime: {
              kind: "node",
              version: "gaia-agent-fixture-2026.06",
              commandHash,
              dependencyHash,
              sandboxProfile: "gaia-agent-replay-fixture",
            },
            agentBenchmarkReplay: {
              benchmarkId: "amc-gaia-agent-replay",
              benchmarkVersion: "2026.06.19",
              paperRefHash: gaiaAgentSourceRefHash,
              repositorySnapshotHash: gaiaAgentRepositorySnapshotHash,
              datasetManifestHash: gaiaAgentTaskManifestHash,
              agentConfigHash: clawAgentAdapterHash,
              globalConfigHash: clawTaskConfigSchemaHash,
              modelServerConfigHash: gaiaAgentModelRouteHash,
              environmentManifestHash: gaiaAgentRunConfigHash,
              dependencyLockHash: gaiaAgentLockfileHash,
              runCommandHash: commandHash,
              replayCommandHash: gaiaAgentReplayCommandHash,
              tracePathHash: gaiaAgentRunOutputHash,
              sampleTraceHash: clawAuditLogHash,
              resultManifestHash: gaiaAgentScoreReportHash,
              metricsReportHash: gaiaAgentScoreReportHash,
              architecture: "reasoning_trace",
              workload: "knowledge_qa",
              deterministicSeed: 546,
              sampleCount: 3,
              minSampleCount: 4,
              shuffled: true,
              traceSaved: true,
              baselineMetric0to1: 0.62,
              candidateMetric0to1: 0.59,
              replayPassRate0to1: 0.8,
              minReplayPassRate0to1: 1,
              traceCoverage0to1: 0.8,
              minTraceCoverage0to1: 0.95,
              maxScoreRegression0to1: 0.01,
              gaiaAgentSourceRefHash,
              gaiaAgentToolSurfaces: ["browser", "search"],
              minGaiaAgentToolSurfaceCount: 5,
              gaiaAgentSampleCount: 3,
              minGaiaAgentSampleCount: 4,
              gaiaAgentReplayPassRate0to1: 0.8,
              minGaiaAgentReplayPassRate0to1: 1,
              gaiaAgentScoreDelta0to1: -0.03,
              minGaiaAgentScoreDelta0to1: 0,
              gaiaAgentEvaluatorAgreement0to1: 0.82,
              minGaiaAgentEvaluatorAgreement0to1: 0.9,
              gaiaAgentToolTraceCoverage0to1: 0.75,
              minGaiaAgentToolTraceCoverage0to1: 0.95,
              gaiaAgentResultCoverage0to1: 0.8,
              minGaiaAgentResultCoverage0to1: 1,
            },
          },
          baseline: {
            score0to1: 0.62,
            evidenceRefs: ["trace:baseline-gaia-agent-missing"],
            signedEvidenceRefs: ["ledger:sig-baseline-gaia-agent-missing"],
          },
          candidate: {
            score0to1: 0.59,
            evidenceRefs: ["trace:candidate-gaia-agent-missing"],
            signedEvidenceRefs: ["ledger:sig-candidate-gaia-agent-missing"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toEqual(expect.arrayContaining([
      "agent benchmark replay score regression exceeds threshold",
      "agent benchmark replay gaia-agent repository snapshot hash invalid",
      "agent benchmark replay gaia-agent license ref hash invalid",
      "agent benchmark replay gaia-agent benchmark tree hash invalid",
      "agent benchmark replay gaia-agent benchmark runner hash invalid",
      "agent benchmark replay gaia-agent score report hash invalid",
      "agent benchmark replay gaia-agent fixed seed missing",
      "agent benchmark replay gaia-agent tool surface count below threshold",
      "agent benchmark replay gaia-agent sample count below threshold",
      "agent benchmark replay gaia-agent replay pass rate below threshold",
      "agent benchmark replay gaia-agent score delta below threshold",
      "agent benchmark replay gaia-agent evaluator agreement below threshold",
      "agent benchmark replay gaia-agent tool trace coverage below threshold",
      "agent benchmark replay gaia-agent result coverage below threshold",
    ]));
    expect(result.manifest.agentBenchmarkReplaySummary.failedGaiaAgentReplayRowIds).toEqual([
      "gaia-agent-replay-missing-proof",
    ]);
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      gaiaAgentReplayRowCount: 1,
      failedGaiaAgentReplayRowIds: ["gaia-agent-replay-missing-proof"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "gaia-agent-replay-missing-proof",
      severity: "critical",
    });
  });

  test("binds Social Reasoning Bench replay proof with source-linked social-domain fixtures, fixed seeds, and CI receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "social-reasoning-bench-replay-corpus",
      sourceRefs: [
        "https://github.com/microsoft/social-reasoning-bench",
        "git:microsoft/social-reasoning-bench@631ce09bc4f0f251799245392f0ea1963c908e09",
        "github-api:microsoft/social-reasoning-bench:data/tree=e488faf35f1e7ccb84bd303b96f037d2e2497418",
      ],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "social-reasoning-bench-replay-complete",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            outputArtifactHashes: [artifactHash],
            runtime: {
              kind: "python",
              version: "srbench-fixture-2026.06",
              commandHash,
              dependencyHash,
              sandboxProfile: "social-reasoning-bench-replay-fixture",
            },
            agentBenchmarkReplay: {
              benchmarkId: "amc-social-reasoning-bench-replay",
              benchmarkVersion: "2026.06.19",
              paperRefHash: socialReasoningBenchSourceRefHash,
              repositorySnapshotHash: socialReasoningBenchRepositorySnapshotHash,
              datasetManifestHash: socialReasoningBenchDataTreeHash,
              agentConfigHash: clawAgentAdapterHash,
              globalConfigHash: clawTaskConfigSchemaHash,
              modelServerConfigHash: socialReasoningBenchPyprojectHash,
              environmentManifestHash: socialReasoningBenchPackagesTreeHash,
              dependencyLockHash: socialReasoningBenchLockfileHash,
              runCommandHash: socialReasoningBenchRunnerHash,
              replayCommandHash: socialReasoningBenchValidationScriptHash,
              tracePathHash: socialReasoningBenchOutputsTreeHash,
              sampleTraceHash: clawAuditLogHash,
              resultManifestHash: socialReasoningBenchResultArtifactHash,
              metricsReportHash: socialReasoningBenchResultArtifactHash,
              architecture: "reasoning_trace",
              workload: "custom",
              deterministicSeed: 549,
              sampleCount: 8,
              minSampleCount: 4,
              shuffled: true,
              traceSaved: true,
              baselineMetric0to1: 0.63,
              candidateMetric0to1: 0.74,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 1,
              traceCoverage0to1: 1,
              minTraceCoverage0to1: 0.95,
              maxScoreRegression0to1: 0.03,
              socialReasoningBenchSourceRefHash,
              socialReasoningBenchRepositorySnapshotHash,
              socialReasoningBenchLicenseRefHash,
              socialReasoningBenchReadmeBlobHash,
              socialReasoningBenchPyprojectHash,
              socialReasoningBenchLockfileHash,
              socialReasoningBenchDataTreeHash,
              socialReasoningBenchDocsTreeHash,
              socialReasoningBenchExperimentsTreeHash,
              socialReasoningBenchOutputsTreeHash,
              socialReasoningBenchPackagesTreeHash,
              socialReasoningBenchScriptsTreeHash,
              socialReasoningBenchRunnerHash,
              socialReasoningBenchCollectorHash,
              socialReasoningBenchValidationScriptHash,
              socialReasoningBenchWorkflowHash,
              socialReasoningBenchResultArtifactHash,
              socialReasoningBenchCiReceiptHash,
              socialReasoningBenchDomainIds: ["calendar_scheduling", "marketplace", "marketplace_old", "whimsygen"],
              minSocialReasoningBenchDomainCount: 3,
              socialReasoningBenchPackageIds: ["privacy_judge", "srbench", "srbench_data_gen", "srbench_llm", "whimsygen"],
              minSocialReasoningBenchPackageCount: 4,
              socialReasoningBenchScenarioModes: ["due_diligence", "outcome_optimality", "privacy", "baseline"],
              minSocialReasoningBenchScenarioModeCount: 3,
              socialReasoningBenchDataDomainCount: 4,
              minSocialReasoningBenchDataDomainCount: 3,
              socialReasoningBenchFixtureCount: 151,
              minSocialReasoningBenchFixtureCount: 100,
              socialReasoningBenchPipelineOutputCount: 16,
              minSocialReasoningBenchPipelineOutputCount: 4,
              socialReasoningBenchTestCount: 31,
              minSocialReasoningBenchTestCount: 10,
              socialReasoningBenchOutputArtifactCount: 138,
              minSocialReasoningBenchOutputArtifactCount: 10,
              socialReasoningBenchReplayPassRate0to1: 1,
              minSocialReasoningBenchReplayPassRate0to1: 1,
              socialReasoningBenchScoreDelta0to1: 0.11,
              minSocialReasoningBenchScoreDelta0to1: 0,
              socialReasoningBenchResultCoverage0to1: 1,
              minSocialReasoningBenchResultCoverage0to1: 1,
            },
          },
          baseline: {
            score0to1: 0.63,
            evidenceRefs: ["trace:baseline-social-reasoning-bench", "github:microsoft/social-reasoning-bench@631ce09bc4f0f251799245392f0ea1963c908e09"],
            signedEvidenceRefs: ["ledger:sig-baseline-social-reasoning-bench"],
          },
          candidate: {
            score0to1: 0.74,
            evidenceRefs: ["trace:candidate-social-reasoning-bench", "github:microsoft/social-reasoning-bench:data@e488faf35f1e7ccb84bd303b96f037d2e2497418"],
            signedEvidenceRefs: ["ledger:sig-candidate-social-reasoning-bench"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.agentBenchmarkReplaySummary).toMatchObject({
      rowCount: 1,
      socialReasoningBenchReplayRowCount: 1,
      socialReasoningBenchDomains: ["calendar_scheduling", "marketplace", "marketplace_old", "whimsygen"],
      socialReasoningBenchPackages: ["privacy_judge", "srbench", "srbench_data_gen", "srbench_llm", "whimsygen"],
      socialReasoningBenchScenarioModes: ["due_diligence", "outcome_optimality", "privacy", "baseline"],
      failedSocialReasoningBenchRowIds: [],
      totalSocialReasoningBenchFixtureCount: 151,
      totalSocialReasoningBenchOutputArtifactCount: 138,
      averageSocialReasoningBenchReplayPassRate0to1: 1,
      averageSocialReasoningBenchScoreDelta0to1: 0.11,
      averageSocialReasoningBenchResultCoverage0to1: 1,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "social-reasoning-bench-replay-complete",
      status: "passed",
      agentBenchmarkReplay: {
        socialReasoningBenchDomainIds: ["calendar_scheduling", "marketplace", "marketplace_old", "whimsygen"],
        socialReasoningBenchPackageIds: ["privacy_judge", "srbench", "srbench_data_gen", "srbench_llm", "whimsygen"],
        socialReasoningBenchScenarioModes: ["due_diligence", "outcome_optimality", "privacy", "baseline"],
        socialReasoningBenchFixtureCount: 151,
        socialReasoningBenchReplayPassRate0to1: 1,
        socialReasoningBenchScoreDelta0to1: 0.11,
        socialReasoningBenchResultCoverage0to1: 1,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      agentBenchmarkReplayRowCount: 1,
      socialReasoningBenchReplayRowCount: 1,
      failedSocialReasoningBenchRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("Social Reasoning Bench Rows: 1");
    expect(markdown).toContain("Social Reasoning Bench Domains: calendar_scheduling, marketplace, marketplace_old, whimsygen");
    expect(markdown).toContain("reasoning_trace:custom:social-reasoning-bench");
  });

  test("fails closed when Social Reasoning Bench proof lacks source-linked fixtures, replay, outputs, or CI evidence", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "social-reasoning-bench-replay-corpus",
      sourceRefs: ["https://github.com/microsoft/social-reasoning-bench"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "social-reasoning-bench-missing-proof",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            outputArtifactHashes: [artifactHash],
            runtime: {
              kind: "python",
              version: "srbench-fixture-2026.06",
              commandHash,
              dependencyHash,
              sandboxProfile: "social-reasoning-bench-replay-fixture",
            },
            agentBenchmarkReplay: {
              benchmarkId: "amc-social-reasoning-bench-replay",
              benchmarkVersion: "2026.06.19",
              paperRefHash: socialReasoningBenchSourceRefHash,
              repositorySnapshotHash: socialReasoningBenchRepositorySnapshotHash,
              datasetManifestHash: socialReasoningBenchDataTreeHash,
              agentConfigHash: clawAgentAdapterHash,
              globalConfigHash: clawTaskConfigSchemaHash,
              modelServerConfigHash: socialReasoningBenchPyprojectHash,
              environmentManifestHash: socialReasoningBenchPackagesTreeHash,
              dependencyLockHash: socialReasoningBenchLockfileHash,
              runCommandHash: socialReasoningBenchRunnerHash,
              replayCommandHash: socialReasoningBenchValidationScriptHash,
              tracePathHash: socialReasoningBenchOutputsTreeHash,
              sampleTraceHash: clawAuditLogHash,
              resultManifestHash: socialReasoningBenchResultArtifactHash,
              metricsReportHash: socialReasoningBenchResultArtifactHash,
              architecture: "reasoning_trace",
              workload: "custom",
              deterministicSeed: 549,
              sampleCount: 3,
              minSampleCount: 4,
              shuffled: true,
              traceSaved: true,
              baselineMetric0to1: 0.63,
              candidateMetric0to1: 0.57,
              replayPassRate0to1: 0.5,
              minReplayPassRate0to1: 1,
              traceCoverage0to1: 0.8,
              minTraceCoverage0to1: 0.95,
              maxScoreRegression0to1: 0.01,
              socialReasoningBenchSourceRefHash,
              socialReasoningBenchRepositorySnapshotHash: "not-a-hash",
              socialReasoningBenchDomainIds: ["calendar_scheduling"],
              minSocialReasoningBenchDomainCount: 3,
              socialReasoningBenchPackageIds: ["srbench"],
              minSocialReasoningBenchPackageCount: 4,
              socialReasoningBenchScenarioModes: ["privacy"],
              minSocialReasoningBenchScenarioModeCount: 3,
              socialReasoningBenchDataDomainCount: 1,
              minSocialReasoningBenchDataDomainCount: 3,
              socialReasoningBenchFixtureCount: 2,
              minSocialReasoningBenchFixtureCount: 100,
              socialReasoningBenchPipelineOutputCount: 1,
              minSocialReasoningBenchPipelineOutputCount: 4,
              socialReasoningBenchTestCount: 1,
              minSocialReasoningBenchTestCount: 10,
              socialReasoningBenchOutputArtifactCount: 0,
              minSocialReasoningBenchOutputArtifactCount: 10,
              socialReasoningBenchReplayPassRate0to1: 0.5,
              minSocialReasoningBenchReplayPassRate0to1: 1,
              socialReasoningBenchScoreDelta0to1: -0.06,
              minSocialReasoningBenchScoreDelta0to1: 0,
              socialReasoningBenchResultCoverage0to1: 0.25,
              minSocialReasoningBenchResultCoverage0to1: 1,
            },
          },
          baseline: {
            score0to1: 0.63,
            evidenceRefs: ["trace:baseline-social-reasoning-bench-missing"],
            signedEvidenceRefs: ["ledger:sig-baseline-social-reasoning-bench-missing"],
          },
          candidate: {
            score0to1: 0.57,
            evidenceRefs: ["trace:candidate-social-reasoning-bench-missing"],
            signedEvidenceRefs: ["ledger:sig-candidate-social-reasoning-bench-missing"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toEqual(expect.arrayContaining([
      "agent benchmark replay score regression exceeds threshold",
      "agent benchmark replay social-reasoning-bench repository snapshot hash invalid",
      "agent benchmark replay social-reasoning-bench license ref hash invalid",
      "agent benchmark replay social-reasoning-bench data tree hash invalid",
      "agent benchmark replay social-reasoning-bench runner hash invalid",
      "agent benchmark replay social-reasoning-bench validation script hash invalid",
      "agent benchmark replay social-reasoning-bench result artifact hash invalid",
      "agent benchmark replay social-reasoning-bench ci receipt hash invalid",
      "agent benchmark replay social-reasoning-bench domain count below threshold",
      "agent benchmark replay social-reasoning-bench package count below threshold",
      "agent benchmark replay social-reasoning-bench scenario mode count below threshold",
      "agent benchmark replay social-reasoning-bench fixture count below threshold",
      "agent benchmark replay social-reasoning-bench pipeline output count below threshold",
      "agent benchmark replay social-reasoning-bench test count below threshold",
      "agent benchmark replay social-reasoning-bench output artifact count below threshold",
      "agent benchmark replay social-reasoning-bench replay pass rate below threshold",
      "agent benchmark replay social-reasoning-bench score delta below threshold",
      "agent benchmark replay social-reasoning-bench result coverage below threshold",
    ]));
    expect(result.manifest.agentBenchmarkReplaySummary.failedSocialReasoningBenchRowIds).toEqual([
      "social-reasoning-bench-missing-proof",
    ]);
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      socialReasoningBenchReplayRowCount: 1,
      failedSocialReasoningBenchRowIds: ["social-reasoning-bench-missing-proof"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "social-reasoning-bench-missing-proof",
      severity: "critical",
    });
  });

  test("binds BestTester replay proof with source-linked QA framework, agents, MCP, security, and CI receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "besttester-replay-corpus",
      sourceRefs: [
        "https://github.com/nshportun/BestTester",
        "git:nshportun/BestTester@066e8b6d06282d85237ec206e8eec3c59452685d",
        "github-api:nshportun/BestTester:tests/tree=7f966bb2e6cb6d097bff3336b438f90c85caa2d9",
      ],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "besttester-replay-complete",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            outputArtifactHashes: [artifactHash],
            runtime: {
              kind: "node",
              version: "besttester-fixture-2026.06",
              commandHash,
              dependencyHash,
              sandboxProfile: "besttester-replay-fixture",
            },
            agentBenchmarkReplay: {
              benchmarkId: "amc-besttester-replay",
              benchmarkVersion: "2026.06.19",
              paperRefHash: bestTesterSourceRefHash,
              repositorySnapshotHash: bestTesterRepositorySnapshotHash,
              datasetManifestHash: bestTesterTestsTreeHash,
              agentConfigHash: bestTesterAgentsTreeHash,
              globalConfigHash: bestTesterConfigTreeHash,
              modelServerConfigHash: bestTesterMcpServerHash,
              environmentManifestHash: bestTesterSrcTreeHash,
              dependencyLockHash: bestTesterLockfileHash,
              runCommandHash: bestTesterPlaywrightConfigHash,
              replayCommandHash: bestTesterCiReceiptHash,
              tracePathHash: bestTesterReportsTreeHash,
              sampleTraceHash: bestTesterJiraReportHash,
              resultManifestHash: bestTesterResultArtifactHash,
              metricsReportHash: bestTesterResultArtifactHash,
              architecture: "custom",
              workload: "custom",
              deterministicSeed: 550,
              sampleCount: 24,
              minSampleCount: 10,
              shuffled: true,
              traceSaved: true,
              baselineMetric0to1: 0.7,
              candidateMetric0to1: 0.84,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 0.95,
              traceCoverage0to1: 1,
              minTraceCoverage0to1: 0.95,
              maxScoreRegression0to1: 0.03,
              bestTesterSourceRefHash,
              bestTesterRepositorySnapshotHash,
              bestTesterLicenseRefHash,
              bestTesterReadmeBlobHash,
              bestTesterPackageJsonHash,
              bestTesterLockfileHash,
              bestTesterTsconfigHash,
              bestTesterPlaywrightConfigHash,
              bestTesterSrcTreeHash,
              bestTesterTestsTreeHash,
              bestTesterAgentsTreeHash,
              bestTesterMcpTreeHash,
              bestTesterConfigTreeHash,
              bestTesterScriptsTreeHash,
              bestTesterMutationTreeHash,
              bestTesterReportsTreeHash,
              bestTesterWorkflowTreeHash,
              bestTesterMcpServerHash,
              bestTesterMcpClientHash,
              bestTesterJudgeRubricHash,
              bestTesterSecurityFuzzerHash,
              bestTesterJiraReportHash,
              bestTesterResultArtifactHash,
              bestTesterCiReceiptHash,
              bestTesterCapabilityIds: [
                "playwright",
                "typescript",
                "llm_judge",
                "mcp",
                "cli_agent",
                "security_fuzzing",
                "ci_cd",
                "jira_sync",
                "slack_reporting",
                "mutation_testing",
              ],
              minBestTesterCapabilityCount: 8,
              bestTesterTestSurfaceIds: ["ui", "api", "mobile", "security", "ai", "visual", "file_ops", "auth_matrix"],
              minBestTesterTestSurfaceCount: 6,
              bestTesterAgentRoleIds: [
                "code_review",
                "jenkins_trigger",
                "jira_sync",
                "run_and_report",
                "slack_bot",
                "suggestion",
                "test_healer",
              ],
              minBestTesterAgentRoleCount: 7,
              bestTesterWorkflowCount: 9,
              minBestTesterWorkflowCount: 5,
              bestTesterAgentCount: 7,
              minBestTesterAgentCount: 7,
              bestTesterTypeScriptFileCount: 113,
              minBestTesterTypeScriptFileCount: 50,
              bestTesterTestFileCount: 24,
              minBestTesterTestFileCount: 12,
              bestTesterPageObjectCount: 12,
              minBestTesterPageObjectCount: 4,
              bestTesterSecuritySignalCount: 6,
              minBestTesterSecuritySignalCount: 3,
              bestTesterJiraSlackIntegrationCount: 12,
              minBestTesterJiraSlackIntegrationCount: 4,
              bestTesterReplayPassRate0to1: 1,
              minBestTesterReplayPassRate0to1: 0.95,
              bestTesterScoreDelta0to1: 0.14,
              minBestTesterScoreDelta0to1: 0,
              bestTesterLlmJudgeAgreement0to1: 0.91,
              minBestTesterLlmJudgeAgreement0to1: 0.85,
              bestTesterSecurityCoverage0to1: 0.88,
              minBestTesterSecurityCoverage0to1: 0.8,
              bestTesterCiCoverage0to1: 1,
              minBestTesterCiCoverage0to1: 0.9,
            },
          },
          baseline: {
            score0to1: 0.7,
            evidenceRefs: ["trace:baseline-besttester", "github:nshportun/BestTester@066e8b6d06282d85237ec206e8eec3c59452685d"],
            signedEvidenceRefs: ["ledger:sig-baseline-besttester"],
          },
          candidate: {
            score0to1: 0.84,
            evidenceRefs: ["trace:candidate-besttester", "github:nshportun/BestTester:tests@7f966bb2e6cb6d097bff3336b438f90c85caa2d9"],
            signedEvidenceRefs: ["ledger:sig-candidate-besttester"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.agentBenchmarkReplaySummary).toMatchObject({
      rowCount: 1,
      bestTesterReplayRowCount: 1,
      bestTesterCapabilities: [
        "playwright",
        "typescript",
        "llm_judge",
        "mcp",
        "cli_agent",
        "security_fuzzing",
        "ci_cd",
        "jira_sync",
        "slack_reporting",
        "mutation_testing",
      ],
      bestTesterTestSurfaces: ["ui", "api", "mobile", "security", "ai", "visual", "file_ops", "auth_matrix"],
      bestTesterAgentRoles: [
        "code_review",
        "jenkins_trigger",
        "jira_sync",
        "run_and_report",
        "slack_bot",
        "suggestion",
        "test_healer",
      ],
      failedBestTesterRowIds: [],
      totalBestTesterTestFileCount: 24,
      totalBestTesterAgentCount: 7,
      totalBestTesterWorkflowCount: 9,
      averageBestTesterReplayPassRate0to1: 1,
      averageBestTesterScoreDelta0to1: 0.14,
      averageBestTesterLlmJudgeAgreement0to1: 0.91,
      averageBestTesterSecurityCoverage0to1: 0.88,
      averageBestTesterCiCoverage0to1: 1,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "besttester-replay-complete",
      status: "passed",
      agentBenchmarkReplay: {
        bestTesterCapabilityIds: [
          "playwright",
          "typescript",
          "llm_judge",
          "mcp",
          "cli_agent",
          "security_fuzzing",
          "ci_cd",
          "jira_sync",
          "slack_reporting",
          "mutation_testing",
        ],
        bestTesterTestSurfaceIds: ["ui", "api", "mobile", "security", "ai", "visual", "file_ops", "auth_matrix"],
        bestTesterAgentRoleIds: [
          "code_review",
          "jenkins_trigger",
          "jira_sync",
          "run_and_report",
          "slack_bot",
          "suggestion",
          "test_healer",
        ],
        bestTesterTestFileCount: 24,
        bestTesterReplayPassRate0to1: 1,
        bestTesterScoreDelta0to1: 0.14,
        bestTesterCiCoverage0to1: 1,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      agentBenchmarkReplayRowCount: 1,
      bestTesterReplayRowCount: 1,
      failedBestTesterRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("BestTester Rows: 1");
    expect(markdown).toContain("BestTester Capabilities: playwright, typescript, llm_judge, mcp, cli_agent, security_fuzzing, ci_cd, jira_sync, slack_reporting, mutation_testing");
    expect(markdown).toContain("custom:custom:besttester");
  });

  test("fails closed when BestTester proof lacks source-linked QA framework, agent, MCP, security, or CI evidence", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "besttester-replay-corpus",
      sourceRefs: ["https://github.com/nshportun/BestTester"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "besttester-missing-proof",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            outputArtifactHashes: [artifactHash],
            runtime: {
              kind: "node",
              version: "besttester-fixture-2026.06",
              commandHash,
              dependencyHash,
              sandboxProfile: "besttester-replay-fixture",
            },
            agentBenchmarkReplay: {
              benchmarkId: "amc-besttester-replay",
              benchmarkVersion: "2026.06.19",
              paperRefHash: bestTesterSourceRefHash,
              repositorySnapshotHash: bestTesterRepositorySnapshotHash,
              datasetManifestHash: bestTesterTestsTreeHash,
              agentConfigHash: bestTesterAgentsTreeHash,
              globalConfigHash: bestTesterConfigTreeHash,
              modelServerConfigHash: bestTesterMcpServerHash,
              environmentManifestHash: bestTesterSrcTreeHash,
              dependencyLockHash: bestTesterLockfileHash,
              runCommandHash: bestTesterPlaywrightConfigHash,
              replayCommandHash: bestTesterCiReceiptHash,
              tracePathHash: bestTesterReportsTreeHash,
              sampleTraceHash: bestTesterJiraReportHash,
              resultManifestHash: bestTesterResultArtifactHash,
              metricsReportHash: bestTesterResultArtifactHash,
              architecture: "custom",
              workload: "custom",
              deterministicSeed: 550,
              sampleCount: 4,
              minSampleCount: 10,
              shuffled: true,
              traceSaved: true,
              baselineMetric0to1: 0.7,
              candidateMetric0to1: 0.62,
              replayPassRate0to1: 0.6,
              minReplayPassRate0to1: 0.95,
              traceCoverage0to1: 0.5,
              minTraceCoverage0to1: 0.95,
              maxScoreRegression0to1: 0.02,
              bestTesterSourceRefHash,
              bestTesterRepositorySnapshotHash: "not-a-hash",
              bestTesterCapabilityIds: ["playwright"],
              minBestTesterCapabilityCount: 8,
              bestTesterTestSurfaceIds: ["ui"],
              minBestTesterTestSurfaceCount: 6,
              bestTesterAgentRoleIds: ["jira_sync"],
              minBestTesterAgentRoleCount: 7,
              bestTesterWorkflowCount: 1,
              minBestTesterWorkflowCount: 5,
              bestTesterAgentCount: 1,
              minBestTesterAgentCount: 7,
              bestTesterTypeScriptFileCount: 5,
              minBestTesterTypeScriptFileCount: 50,
              bestTesterTestFileCount: 2,
              minBestTesterTestFileCount: 12,
              bestTesterPageObjectCount: 0,
              minBestTesterPageObjectCount: 4,
              bestTesterSecuritySignalCount: 0,
              minBestTesterSecuritySignalCount: 3,
              bestTesterJiraSlackIntegrationCount: 1,
              minBestTesterJiraSlackIntegrationCount: 4,
              bestTesterReplayPassRate0to1: 0.6,
              minBestTesterReplayPassRate0to1: 0.95,
              bestTesterScoreDelta0to1: -0.08,
              minBestTesterScoreDelta0to1: 0,
              bestTesterLlmJudgeAgreement0to1: 0.4,
              minBestTesterLlmJudgeAgreement0to1: 0.85,
              bestTesterSecurityCoverage0to1: 0.1,
              minBestTesterSecurityCoverage0to1: 0.8,
              bestTesterCiCoverage0to1: 0.2,
              minBestTesterCiCoverage0to1: 0.9,
            },
          },
          baseline: {
            score0to1: 0.7,
            evidenceRefs: ["trace:baseline-besttester-missing"],
            signedEvidenceRefs: ["ledger:sig-baseline-besttester-missing"],
          },
          candidate: {
            score0to1: 0.62,
            evidenceRefs: ["trace:candidate-besttester-missing"],
            signedEvidenceRefs: ["ledger:sig-candidate-besttester-missing"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toEqual(expect.arrayContaining([
      "agent benchmark replay score regression exceeds threshold",
      "agent benchmark replay besttester repository snapshot hash invalid",
      "agent benchmark replay besttester license ref hash invalid",
      "agent benchmark replay besttester package json hash invalid",
      "agent benchmark replay besttester tests tree hash invalid",
      "agent benchmark replay besttester agents tree hash invalid",
      "agent benchmark replay besttester mcp server hash invalid",
      "agent benchmark replay besttester security fuzzer hash invalid",
      "agent benchmark replay besttester ci receipt hash invalid",
      "agent benchmark replay besttester capability count below threshold",
      "agent benchmark replay besttester test surface count below threshold",
      "agent benchmark replay besttester agent role count below threshold",
      "agent benchmark replay besttester workflow count below threshold",
      "agent benchmark replay besttester agent count below threshold",
      "agent benchmark replay besttester test file count below threshold",
      "agent benchmark replay besttester security signal count below threshold",
      "agent benchmark replay besttester replay pass rate below threshold",
      "agent benchmark replay besttester score delta below threshold",
      "agent benchmark replay besttester llm judge agreement below threshold",
      "agent benchmark replay besttester security coverage below threshold",
      "agent benchmark replay besttester ci coverage below threshold",
    ]));
    expect(result.manifest.agentBenchmarkReplaySummary.failedBestTesterRowIds).toEqual([
      "besttester-missing-proof",
    ]);
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      bestTesterReplayRowCount: 1,
      failedBestTesterRowIds: ["besttester-missing-proof"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "besttester-missing-proof",
      severity: "critical",
    });
  });

  test("binds AgentKernelArena-style GPU-kernel replay proof with compile, correctness, performance, and A/B evidence", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "agentkernelarena-gpu-kernel-replay",
      sourceRefs: ["https://github.com/AMD-AGI/AgentKernelArena"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "agentkernelarena-gpu-kernel-complete",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            outputArtifactHashes: [artifactHash],
            runtime: {
              kind: "container",
              version: "rocm-agentkernelarena-fixture-2026.06",
              commandHash,
              dependencyHash,
              sandboxProfile: "gpu-kernel-replay-fixture",
            },
            agentBenchmarkReplay: {
              benchmarkId: "amc-agentkernelarena-gpu-kernel-replay",
              benchmarkVersion: "2026.06.19",
              paperRefHash: agentKernelArenaSourceRefHash,
              repositorySnapshotHash: agentKernelArenaRepositorySnapshotHash,
              datasetManifestHash: agentKernelArenaTaskManifestHash,
              agentConfigHash: agentKernelArenaAgentConfigHash,
              globalConfigHash: agentKernelArenaTaskConfigHash,
              modelServerConfigHash: agentKernelArenaPromptTemplateHash,
              environmentManifestHash: agentKernelArenaEnvironmentManifestHash,
              dependencyLockHash: agentKernelArenaDependencyLockHash,
              runCommandHash: agentKernelArenaCompileCommandHash,
              replayCommandHash: agentKernelArenaReplayCommandHash,
              tracePathHash: agentKernelArenaRunLogHash,
              sampleTraceHash: agentKernelArenaPerformanceProfileHash,
              resultManifestHash: agentKernelArenaScoreReportHash,
              metricsReportHash: agentKernelArenaComparisonReportHash,
              architecture: "compiled_plan",
              workload: "code_generation",
              deterministicSeed: 619,
              sampleCount: 6,
              minSampleCount: 4,
              shuffled: true,
              traceSaved: true,
              baselineMetric0to1: 0.74,
              candidateMetric0to1: 0.86,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 0.95,
              traceCoverage0to1: 1,
              minTraceCoverage0to1: 1,
              maxScoreRegression0to1: 0.02,
              agentKernelArenaBenchmarkId: "amc-agentkernelarena-gpu-kernel-replay",
              agentKernelArenaSourceRefHash,
              agentKernelArenaRepositorySnapshotHash,
              agentKernelArenaLicenseRefHash,
              agentKernelArenaTaskManifestHash,
              agentKernelArenaTaskConfigHash,
              agentKernelArenaAgentRosterHash,
              agentKernelArenaAgentConfigHash,
              agentKernelArenaPromptTemplateHash,
              agentKernelArenaWorkspaceIsolationHash,
              agentKernelArenaEnvironmentManifestHash,
              agentKernelArenaGpuProfileHash,
              agentKernelArenaDependencyLockHash,
              agentKernelArenaCompileCommandHash,
              agentKernelArenaCorrectnessCommandHash,
              agentKernelArenaPerformanceCommandHash,
              agentKernelArenaBaselineKernelHash,
              agentKernelArenaCandidateKernelHash,
              agentKernelArenaCompileResultHash,
              agentKernelArenaCorrectnessResultHash,
              agentKernelArenaPerformanceProfileHash,
              agentKernelArenaScoreReportHash,
              agentKernelArenaRunLogHash,
              agentKernelArenaReplayCommandHash,
              agentKernelArenaCiReceiptHash,
              agentKernelArenaComparisonReportHash,
              agentKernelArenaTaskCategories: ["hip", "triton", "torch2hip"],
              minAgentKernelArenaTaskCategoryCount: 3,
              agentKernelArenaAgentTypes: ["cursor", "claude_code", "codex", "swe_agent", "geak"],
              minAgentKernelArenaAgentTypeCount: 5,
              agentKernelArenaTaskCount: 12,
              minAgentKernelArenaTaskCount: 6,
              agentKernelArenaDeterministicSeed: 619,
              agentKernelArenaCompilationSuccessRate0to1: 1,
              minAgentKernelArenaCompilationSuccessRate0to1: 0.95,
              agentKernelArenaCorrectnessPassRate0to1: 0.96,
              minAgentKernelArenaCorrectnessPassRate0to1: 0.9,
              agentKernelArenaBaselineSpeedupX: 1.12,
              agentKernelArenaCandidateSpeedupX: 1.38,
              maxAgentKernelArenaSpeedupRegressionX: 0.01,
              agentKernelArenaReplayPassRate0to1: 1,
              minAgentKernelArenaReplayPassRate0to1: 0.95,
              agentKernelArenaResultCoverage0to1: 1,
              minAgentKernelArenaResultCoverage0to1: 1,
              agentKernelArenaWorkspaceIsolated: true,
              agentKernelArenaNoLeaderboardOnlyBoundary: true,
            },
          },
          baseline: {
            score0to1: 0.74,
            evidenceRefs: ["trace:baseline-agentkernelarena"],
            signedEvidenceRefs: ["ledger:sig-baseline-agentkernelarena"],
          },
          candidate: {
            score0to1: 0.86,
            evidenceRefs: ["trace:candidate-agentkernelarena"],
            signedEvidenceRefs: ["ledger:sig-candidate-agentkernelarena"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.agentBenchmarkReplaySummary).toMatchObject({
      rowCount: 1,
      agentKernelArenaReplayRowCount: 1,
      agentKernelArenaTaskCategories: ["hip", "triton", "torch2hip"],
      agentKernelArenaAgentTypes: ["cursor", "claude_code", "codex", "swe_agent", "geak"],
      failedAgentKernelArenaReplayRowIds: [],
      totalAgentKernelArenaTaskCount: 12,
      averageAgentKernelArenaSpeedupDeltaX: 0.26,
      averageAgentKernelArenaReplayPassRate0to1: 1,
      averageAgentKernelArenaResultCoverage0to1: 1,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "agentkernelarena-gpu-kernel-complete",
      status: "passed",
      agentBenchmarkReplay: {
        agentKernelArenaBenchmarkId: "amc-agentkernelarena-gpu-kernel-replay",
        agentKernelArenaTaskCategories: ["hip", "triton", "torch2hip"],
        agentKernelArenaAgentTypes: ["cursor", "claude_code", "codex", "swe_agent", "geak"],
        agentKernelArenaTaskCount: 12,
        agentKernelArenaCompilationSuccessRate0to1: 1,
        agentKernelArenaCorrectnessPassRate0to1: 0.96,
        agentKernelArenaSpeedupDeltaX: 0.26,
        agentKernelArenaReplayPassRate0to1: 1,
        agentKernelArenaWorkspaceIsolated: true,
        agentKernelArenaNoLeaderboardOnlyBoundary: true,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      agentBenchmarkReplayRowCount: 1,
      agentKernelArenaReplayRowCount: 1,
      failedAgentKernelArenaReplayRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("AgentKernelArena Rows: 1");
    expect(markdown).toContain("AgentKernelArena Task Categories: hip, triton, torch2hip");
    expect(markdown).toContain("compiled_plan:code_generation:agentkernelarena");

    const verification = verifyReplayBenchmarkCorpusReceipt(result.manifest, result.ciReceipt);
    expect(verification.valid).toBe(true);
    expect(verification.errors).toEqual([]);
  });

  test("fails closed when AgentKernelArena-style GPU-kernel replay proof lacks reproducible kernel evidence", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "agentkernelarena-gpu-kernel-replay",
      sourceRefs: ["https://github.com/AMD-AGI/AgentKernelArena"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "agentkernelarena-metadata-only",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            outputArtifactHashes: [artifactHash],
            runtime: {
              kind: "container",
              version: "rocm-agentkernelarena-fixture-2026.06",
              commandHash,
              dependencyHash,
              sandboxProfile: "gpu-kernel-replay-fixture",
            },
            agentBenchmarkReplay: {
              benchmarkId: "amc-agentkernelarena-gpu-kernel-replay",
              benchmarkVersion: "2026.06.19",
              paperRefHash: agentKernelArenaSourceRefHash,
              repositorySnapshotHash: agentKernelArenaRepositorySnapshotHash,
              datasetManifestHash: agentKernelArenaTaskManifestHash,
              agentConfigHash: agentKernelArenaAgentConfigHash,
              globalConfigHash: agentKernelArenaTaskConfigHash,
              modelServerConfigHash: agentKernelArenaPromptTemplateHash,
              environmentManifestHash: agentKernelArenaEnvironmentManifestHash,
              dependencyLockHash: agentKernelArenaDependencyLockHash,
              runCommandHash: agentKernelArenaCompileCommandHash,
              replayCommandHash: agentKernelArenaReplayCommandHash,
              tracePathHash: agentKernelArenaRunLogHash,
              sampleTraceHash: agentKernelArenaPerformanceProfileHash,
              resultManifestHash: agentKernelArenaScoreReportHash,
              metricsReportHash: agentKernelArenaComparisonReportHash,
              architecture: "compiled_plan",
              workload: "code_generation",
              deterministicSeed: 619,
              sampleCount: 6,
              minSampleCount: 4,
              shuffled: true,
              traceSaved: true,
              baselineMetric0to1: 0.8,
              candidateMetric0to1: 0.74,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 0.95,
              traceCoverage0to1: 1,
              minTraceCoverage0to1: 1,
              maxScoreRegression0to1: 0.02,
              agentKernelArenaBenchmarkId: "amc-agentkernelarena-gpu-kernel-replay",
              agentKernelArenaSourceRefHash,
              agentKernelArenaRepositorySnapshotHash: "not-a-hash",
              agentKernelArenaLicenseRefHash: null,
              agentKernelArenaTaskManifestHash,
              agentKernelArenaTaskConfigHash: null,
              agentKernelArenaAgentRosterHash: null,
              agentKernelArenaAgentConfigHash: agentKernelArenaAgentConfigHash,
              agentKernelArenaPromptTemplateHash: agentKernelArenaPromptTemplateHash,
              agentKernelArenaWorkspaceIsolationHash: null,
              agentKernelArenaEnvironmentManifestHash: agentKernelArenaEnvironmentManifestHash,
              agentKernelArenaGpuProfileHash: null,
              agentKernelArenaDependencyLockHash: agentKernelArenaDependencyLockHash,
              agentKernelArenaCompileCommandHash: agentKernelArenaCompileCommandHash,
              agentKernelArenaCorrectnessCommandHash: null,
              agentKernelArenaPerformanceCommandHash: null,
              agentKernelArenaBaselineKernelHash: null,
              agentKernelArenaCandidateKernelHash: null,
              agentKernelArenaCompileResultHash: null,
              agentKernelArenaCorrectnessResultHash: null,
              agentKernelArenaPerformanceProfileHash: null,
              agentKernelArenaScoreReportHash: agentKernelArenaScoreReportHash,
              agentKernelArenaRunLogHash: agentKernelArenaRunLogHash,
              agentKernelArenaReplayCommandHash: null,
              agentKernelArenaCiReceiptHash: null,
              agentKernelArenaComparisonReportHash: null,
              agentKernelArenaTaskCategories: ["hip"],
              minAgentKernelArenaTaskCategoryCount: 3,
              agentKernelArenaAgentTypes: ["codex"],
              minAgentKernelArenaAgentTypeCount: 5,
              agentKernelArenaTaskCount: 2,
              minAgentKernelArenaTaskCount: 6,
              agentKernelArenaCompilationSuccessRate0to1: 0.6,
              minAgentKernelArenaCompilationSuccessRate0to1: 0.95,
              agentKernelArenaCorrectnessPassRate0to1: 0.5,
              minAgentKernelArenaCorrectnessPassRate0to1: 0.9,
              agentKernelArenaBaselineSpeedupX: 1.4,
              agentKernelArenaCandidateSpeedupX: 1.1,
              maxAgentKernelArenaSpeedupRegressionX: 0.05,
              agentKernelArenaReplayPassRate0to1: 0.5,
              minAgentKernelArenaReplayPassRate0to1: 0.95,
              agentKernelArenaResultCoverage0to1: 0.4,
              minAgentKernelArenaResultCoverage0to1: 1,
              agentKernelArenaWorkspaceIsolated: false,
              agentKernelArenaNoLeaderboardOnlyBoundary: false,
            },
          },
          baseline: {
            score0to1: 0.8,
            evidenceRefs: ["trace:baseline-agentkernelarena-missing"],
            signedEvidenceRefs: ["ledger:sig-baseline-agentkernelarena-missing"],
          },
          candidate: {
            score0to1: 0.74,
            evidenceRefs: ["trace:candidate-agentkernelarena-missing"],
            signedEvidenceRefs: ["ledger:sig-candidate-agentkernelarena-missing"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay agentkernelarena repository snapshot hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay agentkernelarena license ref hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay agentkernelarena task config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay agentkernelarena agent roster hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay agentkernelarena workspace isolation hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay agentkernelarena gpu profile hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay agentkernelarena correctness command hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay agentkernelarena performance command hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay agentkernelarena replay command hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay agentkernelarena ci receipt hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay agentkernelarena task category count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay agentkernelarena agent type count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay agentkernelarena task count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay agentkernelarena deterministic seed missing");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay agentkernelarena compilation success rate below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay agentkernelarena correctness pass rate below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay agentkernelarena speedup regression exceeds threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay agentkernelarena replay pass rate below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay agentkernelarena result coverage below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay agentkernelarena workspace isolation disabled");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay agentkernelarena leaderboard-only boundary missing");
    expect(result.manifest.agentBenchmarkReplaySummary).toMatchObject({
      agentKernelArenaReplayRowCount: 1,
      failedAgentKernelArenaReplayRowIds: ["agentkernelarena-metadata-only"],
      totalAgentKernelArenaTaskCount: 2,
      averageAgentKernelArenaSpeedupDeltaX: -0.3,
      averageAgentKernelArenaReplayPassRate0to1: 0.5,
      averageAgentKernelArenaResultCoverage0to1: 0.4,
    });
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      agentKernelArenaReplayRowCount: 1,
      failedAgentKernelArenaReplayRowIds: ["agentkernelarena-metadata-only"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "agentkernelarena-metadata-only",
      severity: "critical",
    });
  });

  test("binds LLM Evaluation System-style jury replay proof with dataset, judge, trace, and report evidence", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "llm-evaluation-system-jury-replay",
      sourceRefs: [
        "https://github.com/awslabs/llm-evaluation-system",
        "https://pypi.org/project/llm-evaluation-system/",
      ],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "llm-evaluation-system-complete",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            outputArtifactHashes: [artifactHash, llmEvaluationSystemPdfReportHash],
            runtime: {
              kind: "python",
              version: "llm-evaluation-system-0.10.0-fixture",
              commandHash,
              dependencyHash,
              sandboxProfile: "mcp-jury-eval-replay-fixture",
            },
            agentBenchmarkReplay: {
              benchmarkId: "amc-llm-evaluation-system-jury-replay",
              benchmarkVersion: "2026.06.19",
              paperRefHash: llmEvaluationSystemSourceRefHash,
              repositorySnapshotHash: llmEvaluationSystemRepositorySnapshotHash,
              datasetManifestHash: llmEvaluationSystemDatasetManifestHash,
              agentConfigHash: llmEvaluationSystemMcpInstallManifestHash,
              globalConfigHash: llmEvaluationSystemJudgeConfigHash,
              modelServerConfigHash: llmEvaluationSystemJuryRosterHash,
              environmentManifestHash: llmEvaluationSystemExecutionManifestHash,
              dependencyLockHash: dependencyHash,
              runCommandHash: commandHash,
              replayCommandHash: llmEvaluationSystemReplayCommandHash,
              tracePathHash: llmEvaluationSystemAgentTraceManifestHash,
              sampleTraceHash: llmEvaluationSystemOpenTelemetryTraceHash,
              resultManifestHash: llmEvaluationSystemResultManifestHash,
              metricsReportHash: llmEvaluationSystemAnalysisReportHash,
              architecture: "reasoning_trace",
              workload: "knowledge_qa",
              deterministicSeed: 619,
              sampleCount: 24,
              minSampleCount: 12,
              shuffled: true,
              traceSaved: true,
              baselineMetric0to1: 0.77,
              candidateMetric0to1: 0.86,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 0.95,
              traceCoverage0to1: 0.98,
              minTraceCoverage0to1: 0.95,
              maxScoreRegression0to1: 0.02,
              llmEvaluationSystemBenchmarkId: "amc-llm-evaluation-system-jury-replay",
              llmEvaluationSystemSourceRefHash,
              llmEvaluationSystemRepositorySnapshotHash,
              llmEvaluationSystemLicenseRefHash,
              llmEvaluationSystemPackageVersionRefHash,
              llmEvaluationSystemMcpInstallManifestHash,
              llmEvaluationSystemDatasetManifestHash,
              llmEvaluationSystemSyntheticQaManifestHash,
              llmEvaluationSystemDocumentGroundingManifestHash,
              llmEvaluationSystemJudgeConfigHash,
              llmEvaluationSystemJuryRosterHash,
              llmEvaluationSystemCriteriaManifestHash,
              llmEvaluationSystemBinaryScoringPolicyHash,
              llmEvaluationSystemExecutionManifestHash,
              llmEvaluationSystemAgentTraceManifestHash,
              llmEvaluationSystemOpenTelemetryTraceHash,
              llmEvaluationSystemBedrockAccessBoundaryHash,
              llmEvaluationSystemResultManifestHash,
              llmEvaluationSystemAnalysisReportHash,
              llmEvaluationSystemPdfReportHash,
              llmEvaluationSystemS3SyncReceiptHash,
              llmEvaluationSystemReplayCommandHash,
              llmEvaluationSystemCiReceiptHash,
              llmEvaluationSystemNoConfigOnlyBoundaryHash,
              llmEvaluationSystemModes: [
                "dataset_generation",
                "judge_configuration",
                "jury_scoring",
                "agent_trace",
                "pdf_report",
                "team_sharing",
              ],
              minLlmEvaluationSystemModeCount: 5,
              llmEvaluationSystemJudgeFamilies: ["anthropic", "amazon_nova", "nvidia_nemotron"],
              minLlmEvaluationSystemJudgeFamilyCount: 3,
              llmEvaluationSystemDatasetCount: 2,
              minLlmEvaluationSystemDatasetCount: 2,
              llmEvaluationSystemJudgeCount: 3,
              minLlmEvaluationSystemJudgeCount: 3,
              llmEvaluationSystemCriteriaCount: 9,
              minLlmEvaluationSystemCriteriaCount: 6,
              llmEvaluationSystemEvaluationCaseCount: 24,
              minLlmEvaluationSystemEvaluationCaseCount: 12,
              llmEvaluationSystemDeterministicSeed: 619,
              llmEvaluationSystemBaselineJuryScore0to1: 0.77,
              llmEvaluationSystemCandidateJuryScore0to1: 0.86,
              maxLlmEvaluationSystemJuryScoreRegression0to1: 0.01,
              llmEvaluationSystemBinaryScoringCoverage0to1: 1,
              minLlmEvaluationSystemBinaryScoringCoverage0to1: 0.95,
              llmEvaluationSystemJudgeAgreement0to1: 0.84,
              minLlmEvaluationSystemJudgeAgreement0to1: 0.75,
              llmEvaluationSystemReplayPassRate0to1: 1,
              minLlmEvaluationSystemReplayPassRate0to1: 0.95,
              llmEvaluationSystemReportCoverage0to1: 1,
              minLlmEvaluationSystemReportCoverage0to1: 1,
              llmEvaluationSystemAgentTraceCoverage0to1: 0.98,
              minLlmEvaluationSystemAgentTraceCoverage0to1: 0.95,
              llmEvaluationSystemNoSyntheticDataCopyBoundary: true,
              llmEvaluationSystemNoPdfReportOnlyBoundary: true,
            },
          },
          baseline: {
            score0to1: 0.77,
            evidenceRefs: ["trace:baseline-llm-evaluation-system"],
            signedEvidenceRefs: ["ledger:sig-baseline-llm-evaluation-system"],
          },
          candidate: {
            score0to1: 0.86,
            evidenceRefs: ["trace:candidate-llm-evaluation-system"],
            signedEvidenceRefs: ["ledger:sig-candidate-llm-evaluation-system"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.agentBenchmarkReplaySummary).toMatchObject({
      rowCount: 1,
      llmEvaluationSystemReplayRowCount: 1,
      llmEvaluationSystemModes: [
        "dataset_generation",
        "judge_configuration",
        "jury_scoring",
        "agent_trace",
        "pdf_report",
        "team_sharing",
      ],
      llmEvaluationSystemJudgeFamilies: ["anthropic", "amazon_nova", "nvidia_nemotron"],
      failedLlmEvaluationSystemReplayRowIds: [],
      totalLlmEvaluationSystemDatasetCount: 2,
      totalLlmEvaluationSystemEvaluationCaseCount: 24,
      averageLlmEvaluationSystemJuryScoreDelta0to1: 0.09,
      averageLlmEvaluationSystemReplayPassRate0to1: 1,
      averageLlmEvaluationSystemReportCoverage0to1: 1,
      averageLlmEvaluationSystemAgentTraceCoverage0to1: 0.98,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "llm-evaluation-system-complete",
      status: "passed",
      agentBenchmarkReplay: {
        llmEvaluationSystemBenchmarkId: "amc-llm-evaluation-system-jury-replay",
        llmEvaluationSystemModes: [
          "dataset_generation",
          "judge_configuration",
          "jury_scoring",
          "agent_trace",
          "pdf_report",
          "team_sharing",
        ],
        llmEvaluationSystemJudgeFamilies: ["anthropic", "amazon_nova", "nvidia_nemotron"],
        llmEvaluationSystemDatasetCount: 2,
        llmEvaluationSystemJudgeCount: 3,
        llmEvaluationSystemCriteriaCount: 9,
        llmEvaluationSystemEvaluationCaseCount: 24,
        llmEvaluationSystemJuryScoreDelta0to1: 0.09,
        llmEvaluationSystemBinaryScoringCoverage0to1: 1,
        llmEvaluationSystemJudgeAgreement0to1: 0.84,
        llmEvaluationSystemNoSyntheticDataCopyBoundary: true,
        llmEvaluationSystemNoPdfReportOnlyBoundary: true,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      agentBenchmarkReplayRowCount: 1,
      llmEvaluationSystemReplayRowCount: 1,
      failedLlmEvaluationSystemReplayRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("LLM Evaluation System Rows: 1");
    expect(markdown).toContain("LLM Evaluation System Modes: dataset_generation, judge_configuration, jury_scoring, agent_trace, pdf_report, team_sharing");
    expect(markdown).toContain("reasoning_trace:knowledge_qa:llm-evaluation-system");

    const verification = verifyReplayBenchmarkCorpusReceipt(result.manifest, result.ciReceipt);
    expect(verification.valid).toBe(true);
    expect(verification.errors).toEqual([]);
  });

  test("fails closed when LLM Evaluation System-style jury replay proof is report-only metadata", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "llm-evaluation-system-jury-replay",
      sourceRefs: ["https://github.com/awslabs/llm-evaluation-system"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "llm-evaluation-system-report-only",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            outputArtifactHashes: [artifactHash],
            runtime: {
              kind: "python",
              version: "llm-evaluation-system-0.10.0-fixture",
              commandHash,
              dependencyHash,
              sandboxProfile: "mcp-jury-eval-replay-fixture",
            },
            agentBenchmarkReplay: {
              benchmarkId: "amc-llm-evaluation-system-jury-replay",
              benchmarkVersion: "2026.06.19",
              paperRefHash: llmEvaluationSystemSourceRefHash,
              repositorySnapshotHash: llmEvaluationSystemRepositorySnapshotHash,
              datasetManifestHash: llmEvaluationSystemDatasetManifestHash,
              agentConfigHash: llmEvaluationSystemMcpInstallManifestHash,
              globalConfigHash: llmEvaluationSystemJudgeConfigHash,
              modelServerConfigHash: llmEvaluationSystemJuryRosterHash,
              environmentManifestHash: llmEvaluationSystemExecutionManifestHash,
              dependencyLockHash: dependencyHash,
              runCommandHash: commandHash,
              replayCommandHash: llmEvaluationSystemReplayCommandHash,
              tracePathHash: llmEvaluationSystemAgentTraceManifestHash,
              sampleTraceHash: llmEvaluationSystemOpenTelemetryTraceHash,
              resultManifestHash: llmEvaluationSystemResultManifestHash,
              metricsReportHash: llmEvaluationSystemAnalysisReportHash,
              architecture: "reasoning_trace",
              workload: "knowledge_qa",
              deterministicSeed: 619,
              sampleCount: 12,
              minSampleCount: 12,
              shuffled: true,
              traceSaved: true,
              baselineMetric0to1: 0.82,
              candidateMetric0to1: 0.73,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 0.95,
              traceCoverage0to1: 0.98,
              minTraceCoverage0to1: 0.95,
              maxScoreRegression0to1: 0.02,
              llmEvaluationSystemBenchmarkId: "amc-llm-evaluation-system-jury-replay",
              llmEvaluationSystemSourceRefHash,
              llmEvaluationSystemRepositorySnapshotHash: "not-a-hash",
              llmEvaluationSystemLicenseRefHash: null,
              llmEvaluationSystemPackageVersionRefHash: null,
              llmEvaluationSystemMcpInstallManifestHash: null,
              llmEvaluationSystemDatasetManifestHash: llmEvaluationSystemDatasetManifestHash,
              llmEvaluationSystemSyntheticQaManifestHash: "bad-qa-hash",
              llmEvaluationSystemDocumentGroundingManifestHash: null,
              llmEvaluationSystemJudgeConfigHash: null,
              llmEvaluationSystemJuryRosterHash: null,
              llmEvaluationSystemCriteriaManifestHash: null,
              llmEvaluationSystemBinaryScoringPolicyHash: null,
              llmEvaluationSystemExecutionManifestHash: null,
              llmEvaluationSystemAgentTraceManifestHash: null,
              llmEvaluationSystemOpenTelemetryTraceHash: null,
              llmEvaluationSystemBedrockAccessBoundaryHash: null,
              llmEvaluationSystemResultManifestHash: llmEvaluationSystemResultManifestHash,
              llmEvaluationSystemAnalysisReportHash: llmEvaluationSystemAnalysisReportHash,
              llmEvaluationSystemPdfReportHash: null,
              llmEvaluationSystemS3SyncReceiptHash: null,
              llmEvaluationSystemReplayCommandHash: null,
              llmEvaluationSystemCiReceiptHash: null,
              llmEvaluationSystemNoConfigOnlyBoundaryHash: null,
              llmEvaluationSystemModes: ["jury_scoring"],
              minLlmEvaluationSystemModeCount: 5,
              llmEvaluationSystemJudgeFamilies: ["anthropic"],
              minLlmEvaluationSystemJudgeFamilyCount: 3,
              llmEvaluationSystemDatasetCount: 1,
              minLlmEvaluationSystemDatasetCount: 2,
              llmEvaluationSystemJudgeCount: 1,
              minLlmEvaluationSystemJudgeCount: 3,
              llmEvaluationSystemCriteriaCount: 2,
              minLlmEvaluationSystemCriteriaCount: 6,
              llmEvaluationSystemEvaluationCaseCount: 3,
              minLlmEvaluationSystemEvaluationCaseCount: 12,
              llmEvaluationSystemBaselineJuryScore0to1: 0.82,
              llmEvaluationSystemCandidateJuryScore0to1: 0.73,
              maxLlmEvaluationSystemJuryScoreRegression0to1: 0.03,
              llmEvaluationSystemBinaryScoringCoverage0to1: 0.4,
              minLlmEvaluationSystemBinaryScoringCoverage0to1: 0.95,
              llmEvaluationSystemJudgeAgreement0to1: 0.45,
              minLlmEvaluationSystemJudgeAgreement0to1: 0.75,
              llmEvaluationSystemReplayPassRate0to1: 0.5,
              minLlmEvaluationSystemReplayPassRate0to1: 0.95,
              llmEvaluationSystemReportCoverage0to1: 0.4,
              minLlmEvaluationSystemReportCoverage0to1: 1,
              llmEvaluationSystemAgentTraceCoverage0to1: 0.2,
              minLlmEvaluationSystemAgentTraceCoverage0to1: 0.95,
              llmEvaluationSystemNoSyntheticDataCopyBoundary: false,
              llmEvaluationSystemNoPdfReportOnlyBoundary: false,
            },
          },
          baseline: {
            score0to1: 0.82,
            evidenceRefs: ["trace:baseline-llm-evaluation-system-missing"],
            signedEvidenceRefs: ["ledger:sig-baseline-llm-evaluation-system-missing"],
          },
          candidate: {
            score0to1: 0.73,
            evidenceRefs: ["trace:candidate-llm-evaluation-system-missing"],
            signedEvidenceRefs: ["ledger:sig-candidate-llm-evaluation-system-missing"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay llm-evaluation-system repository snapshot hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay llm-evaluation-system license ref hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay llm-evaluation-system package version ref hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay llm-evaluation-system mcp install manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay llm-evaluation-system synthetic qa manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay llm-evaluation-system judge config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay llm-evaluation-system jury roster hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay llm-evaluation-system binary scoring policy hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay llm-evaluation-system agent trace manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay llm-evaluation-system pdf report hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay llm-evaluation-system replay command hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay llm-evaluation-system ci receipt hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay llm-evaluation-system no config-only boundary hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay llm-evaluation-system mode count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay llm-evaluation-system judge family count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay llm-evaluation-system dataset count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay llm-evaluation-system judge count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay llm-evaluation-system criteria count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay llm-evaluation-system evaluation case count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay llm-evaluation-system deterministic seed missing");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay llm-evaluation-system jury score regression exceeds threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay llm-evaluation-system binary scoring coverage below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay llm-evaluation-system judge agreement below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay llm-evaluation-system replay pass rate below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay llm-evaluation-system report coverage below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay llm-evaluation-system agent trace coverage below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay llm-evaluation-system no synthetic data copy boundary disabled");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay llm-evaluation-system pdf-report-only boundary missing");
    expect(result.manifest.agentBenchmarkReplaySummary).toMatchObject({
      llmEvaluationSystemReplayRowCount: 1,
      failedLlmEvaluationSystemReplayRowIds: ["llm-evaluation-system-report-only"],
      totalLlmEvaluationSystemDatasetCount: 1,
      totalLlmEvaluationSystemEvaluationCaseCount: 3,
      averageLlmEvaluationSystemJuryScoreDelta0to1: -0.09,
      averageLlmEvaluationSystemReplayPassRate0to1: 0.5,
      averageLlmEvaluationSystemReportCoverage0to1: 0.4,
      averageLlmEvaluationSystemAgentTraceCoverage0to1: 0.2,
    });
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      llmEvaluationSystemReplayRowCount: 1,
      failedLlmEvaluationSystemReplayRowIds: ["llm-evaluation-system-report-only"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "llm-evaluation-system-report-only",
      severity: "critical",
    });
  });

  test("binds InnovatorBench-style research replay proof with ResearchGym, tool, checkpoint, and score evidence", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "innovatorbench-research-replay",
      sourceRefs: [
        "https://github.com/GAIR-NLP/InnovatorBench",
        "https://huggingface.co/datasets/GAIR/InnovatorBench",
        "https://arxiv.org/abs/2510.27598",
        "https://openreview.net/forum?id=w8rZ2Jd6Jo",
      ],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "innovatorbench-complete",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            outputArtifactHashes: [artifactHash, innovatorBenchScoreReportHash],
            runtime: {
              kind: "python",
              version: "innovatorbench-researchgym-fixture",
              commandHash,
              dependencyHash,
              sandboxProfile: "researchgym-replay-fixture",
            },
            agentBenchmarkReplay: {
              benchmarkId: "amc-innovatorbench-research-replay",
              benchmarkVersion: "2026.06.19",
              paperRefHash: innovatorBenchPaperRefHash,
              repositorySnapshotHash: innovatorBenchRepositorySnapshotHash,
              datasetManifestHash: innovatorBenchDatasetRefHash,
              agentConfigHash: innovatorBenchAgentConfigHash,
              globalConfigHash: innovatorBenchTaskConfigHash,
              modelServerConfigHash: innovatorBenchToolRegistryHash,
              environmentManifestHash: innovatorBenchEnvironmentManifestHash,
              dependencyLockHash: dependencyHash,
              runCommandHash: commandHash,
              replayCommandHash: innovatorBenchReplayCommandHash,
              tracePathHash: innovatorBenchExecutionManifestHash,
              sampleTraceHash: innovatorBenchCheckpointManifestHash,
              resultManifestHash: innovatorBenchResultManifestHash,
              metricsReportHash: innovatorBenchMetricManifestHash,
              architecture: "compiled_plan",
              workload: "code_generation",
              deterministicSeed: 619,
              sampleCount: 6,
              minSampleCount: 4,
              shuffled: true,
              traceSaved: true,
              baselineMetric0to1: 0.412,
              candidateMetric0to1: 0.474,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 0.95,
              traceCoverage0to1: 0.98,
              minTraceCoverage0to1: 0.95,
              maxScoreRegression0to1: 0.02,
              innovatorBenchBenchmarkId: "amc-innovatorbench-research-replay",
              innovatorBenchSourceRefHash,
              innovatorBenchRepositorySnapshotHash,
              innovatorBenchLicenseRefHash,
              innovatorBenchPaperRefHash,
              innovatorBenchDatasetRefHash,
              innovatorBenchTaskManifestHash,
              innovatorBenchTaskConfigHash,
              innovatorBenchResearchGymConfigHash,
              innovatorBenchAgentConfigHash,
              innovatorBenchToolRegistryHash,
              innovatorBenchWorkspaceDatasetPathPolicyHash,
              innovatorBenchEnvironmentManifestHash,
              innovatorBenchDockerWebBackendHash,
              innovatorBenchMultiGpuNodeManifestHash,
              innovatorBenchCheckpointManifestHash,
              innovatorBenchExecutionManifestHash,
              innovatorBenchResultManifestHash,
              innovatorBenchMetricManifestHash,
              innovatorBenchScoreReportHash,
              innovatorBenchReplayCommandHash,
              innovatorBenchCiReceiptHash,
              innovatorBenchNoLeaderboardOnlyBoundaryHash,
              innovatorBenchNoDatasetCopyBoundaryHash,
              innovatorBenchResearchDomains: [
                "data_construction",
                "data_filtering",
                "loss_design",
                "scaffold_construction",
              ],
              minInnovatorBenchResearchDomainCount: 4,
              innovatorBenchToolSurfaces: [
                "search",
                "browsing",
                "code_execution",
                "file_operations",
                "file_parsing",
              ],
              minInnovatorBenchToolSurfaceCount: 5,
              innovatorBenchEnvironmentModes: [
                "researchgym",
                "docker_web",
                "multi_gpu",
                "checkpoint_restore",
              ],
              minInnovatorBenchEnvironmentModeCount: 4,
              innovatorBenchTaskCount: 6,
              minInnovatorBenchTaskCount: 4,
              innovatorBenchMaxEvalTimes: 4,
              minInnovatorBenchMaxEvalTimes: 4,
              innovatorBenchDeterministicSeed: 619,
              innovatorBenchBaselineFinalScore: 41.2,
              innovatorBenchCandidateFinalScore: 47.4,
              maxInnovatorBenchFinalScoreRegression: 1,
              innovatorBenchBaselineBestScore: 48,
              innovatorBenchCandidateBestScore: 55.5,
              maxInnovatorBenchBestScoreRegression: 1,
              innovatorBenchReplayPassRate0to1: 1,
              minInnovatorBenchReplayPassRate0to1: 0.95,
              innovatorBenchResultCoverage0to1: 1,
              minInnovatorBenchResultCoverage0to1: 0.95,
              innovatorBenchCheckpointRestoreCoverage0to1: 1,
              minInnovatorBenchCheckpointRestoreCoverage0to1: 0.95,
              innovatorBenchToolEvidenceCoverage0to1: 0.98,
              minInnovatorBenchToolEvidenceCoverage0to1: 0.95,
              innovatorBenchNoLeaderboardOnlyBoundary: true,
              innovatorBenchNoDatasetCopyBoundary: true,
            },
          },
          baseline: {
            score0to1: 0.412,
            evidenceRefs: ["trace:baseline-innovatorbench"],
            signedEvidenceRefs: ["ledger:sig-baseline-innovatorbench"],
          },
          candidate: {
            score0to1: 0.474,
            evidenceRefs: ["trace:candidate-innovatorbench"],
            signedEvidenceRefs: ["ledger:sig-candidate-innovatorbench"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.agentBenchmarkReplaySummary).toMatchObject({
      rowCount: 1,
      innovatorBenchReplayRowCount: 1,
      innovatorBenchResearchDomains: [
        "data_construction",
        "data_filtering",
        "loss_design",
        "scaffold_construction",
      ],
      innovatorBenchToolSurfaces: [
        "search",
        "browsing",
        "code_execution",
        "file_operations",
        "file_parsing",
      ],
      innovatorBenchEnvironmentModes: [
        "researchgym",
        "docker_web",
        "multi_gpu",
        "checkpoint_restore",
      ],
      failedInnovatorBenchReplayRowIds: [],
      totalInnovatorBenchTaskCount: 6,
      averageInnovatorBenchFinalScoreDelta: 6.2,
      averageInnovatorBenchBestScoreDelta: 7.5,
      averageInnovatorBenchReplayPassRate0to1: 1,
      averageInnovatorBenchResultCoverage0to1: 1,
      averageInnovatorBenchCheckpointRestoreCoverage0to1: 1,
      averageInnovatorBenchToolEvidenceCoverage0to1: 0.98,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "innovatorbench-complete",
      status: "passed",
      agentBenchmarkReplay: {
        innovatorBenchBenchmarkId: "amc-innovatorbench-research-replay",
        innovatorBenchTaskCount: 6,
        innovatorBenchMaxEvalTimes: 4,
        innovatorBenchFinalScoreDelta: 6.2,
        innovatorBenchBestScoreDelta: 7.5,
        innovatorBenchNoLeaderboardOnlyBoundary: true,
        innovatorBenchNoDatasetCopyBoundary: true,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      agentBenchmarkReplayRowCount: 1,
      innovatorBenchReplayRowCount: 1,
      failedInnovatorBenchReplayRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("InnovatorBench Rows: 1");
    expect(markdown).toContain("InnovatorBench Research Domains: data_construction, data_filtering, loss_design, scaffold_construction");
    expect(markdown).toContain("compiled_plan:code_generation:innovatorbench");

    const verification = verifyReplayBenchmarkCorpusReceipt(result.manifest, result.ciReceipt);
    expect(verification.valid).toBe(true);
    expect(verification.errors).toEqual([]);
  });

  test("fails closed when InnovatorBench-style research replay proof is leaderboard-only metadata", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "innovatorbench-research-replay",
      sourceRefs: ["https://github.com/GAIR-NLP/InnovatorBench"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "innovatorbench-leaderboard-only",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            outputArtifactHashes: [artifactHash],
            runtime: {
              kind: "python",
              version: "innovatorbench-researchgym-fixture",
              commandHash,
              dependencyHash,
              sandboxProfile: "researchgym-replay-fixture",
            },
            agentBenchmarkReplay: {
              benchmarkId: "amc-innovatorbench-research-replay",
              benchmarkVersion: "2026.06.19",
              paperRefHash: innovatorBenchPaperRefHash,
              repositorySnapshotHash: innovatorBenchRepositorySnapshotHash,
              datasetManifestHash: innovatorBenchDatasetRefHash,
              agentConfigHash: innovatorBenchAgentConfigHash,
              globalConfigHash: innovatorBenchTaskConfigHash,
              modelServerConfigHash: innovatorBenchToolRegistryHash,
              environmentManifestHash: innovatorBenchEnvironmentManifestHash,
              dependencyLockHash: dependencyHash,
              runCommandHash: commandHash,
              replayCommandHash: innovatorBenchReplayCommandHash,
              tracePathHash: innovatorBenchExecutionManifestHash,
              sampleTraceHash: innovatorBenchCheckpointManifestHash,
              resultManifestHash: innovatorBenchResultManifestHash,
              metricsReportHash: innovatorBenchMetricManifestHash,
              architecture: "compiled_plan",
              workload: "code_generation",
              deterministicSeed: 619,
              sampleCount: 4,
              minSampleCount: 4,
              shuffled: true,
              traceSaved: true,
              baselineMetric0to1: 0.42,
              candidateMetric0to1: 0.38,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 0.95,
              traceCoverage0to1: 0.98,
              minTraceCoverage0to1: 0.95,
              maxScoreRegression0to1: 0.02,
              innovatorBenchBenchmarkId: "amc-innovatorbench-research-replay",
              innovatorBenchSourceRefHash,
              innovatorBenchRepositorySnapshotHash: "not-a-hash",
              innovatorBenchLicenseRefHash: null,
              innovatorBenchPaperRefHash,
              innovatorBenchDatasetRefHash,
              innovatorBenchTaskManifestHash: null,
              innovatorBenchTaskConfigHash: null,
              innovatorBenchResearchGymConfigHash: null,
              innovatorBenchAgentConfigHash,
              innovatorBenchToolRegistryHash: null,
              innovatorBenchWorkspaceDatasetPathPolicyHash: null,
              innovatorBenchEnvironmentManifestHash,
              innovatorBenchDockerWebBackendHash: null,
              innovatorBenchMultiGpuNodeManifestHash: null,
              innovatorBenchCheckpointManifestHash: null,
              innovatorBenchExecutionManifestHash: null,
              innovatorBenchResultManifestHash,
              innovatorBenchMetricManifestHash: null,
              innovatorBenchScoreReportHash: null,
              innovatorBenchReplayCommandHash: null,
              innovatorBenchCiReceiptHash: null,
              innovatorBenchNoLeaderboardOnlyBoundaryHash: null,
              innovatorBenchNoDatasetCopyBoundaryHash: null,
              innovatorBenchResearchDomains: ["data_construction"],
              minInnovatorBenchResearchDomainCount: 4,
              innovatorBenchToolSurfaces: ["search"],
              minInnovatorBenchToolSurfaceCount: 5,
              innovatorBenchEnvironmentModes: ["researchgym"],
              minInnovatorBenchEnvironmentModeCount: 4,
              innovatorBenchTaskCount: 1,
              minInnovatorBenchTaskCount: 4,
              innovatorBenchMaxEvalTimes: 1,
              minInnovatorBenchMaxEvalTimes: 4,
              innovatorBenchBaselineFinalScore: 42,
              innovatorBenchCandidateFinalScore: 38,
              maxInnovatorBenchFinalScoreRegression: 1,
              innovatorBenchBaselineBestScore: 45,
              innovatorBenchCandidateBestScore: 39,
              maxInnovatorBenchBestScoreRegression: 1,
              innovatorBenchReplayPassRate0to1: 0.5,
              minInnovatorBenchReplayPassRate0to1: 0.95,
              innovatorBenchResultCoverage0to1: 0.4,
              minInnovatorBenchResultCoverage0to1: 0.95,
              innovatorBenchCheckpointRestoreCoverage0to1: 0.2,
              minInnovatorBenchCheckpointRestoreCoverage0to1: 0.95,
              innovatorBenchToolEvidenceCoverage0to1: 0.3,
              minInnovatorBenchToolEvidenceCoverage0to1: 0.95,
              innovatorBenchNoLeaderboardOnlyBoundary: false,
              innovatorBenchNoDatasetCopyBoundary: false,
            },
          },
          baseline: {
            score0to1: 0.42,
            evidenceRefs: ["trace:baseline-innovatorbench-missing"],
            signedEvidenceRefs: ["ledger:sig-baseline-innovatorbench-missing"],
          },
          candidate: {
            score0to1: 0.38,
            evidenceRefs: ["trace:candidate-innovatorbench-missing"],
            signedEvidenceRefs: ["ledger:sig-candidate-innovatorbench-missing"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay innovatorbench repository snapshot hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay innovatorbench license ref hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay innovatorbench task manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay innovatorbench researchgym config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay innovatorbench tool registry hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay innovatorbench checkpoint manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay innovatorbench replay command hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay innovatorbench ci receipt hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay innovatorbench no leaderboard-only boundary hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay innovatorbench research domain count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay innovatorbench tool surface count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay innovatorbench environment mode count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay innovatorbench task count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay innovatorbench max eval times below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay innovatorbench deterministic seed missing");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay innovatorbench final score regression exceeds threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay innovatorbench best score regression exceeds threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay innovatorbench replay pass rate below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay innovatorbench result coverage below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay innovatorbench checkpoint restore coverage below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay innovatorbench tool evidence coverage below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay innovatorbench leaderboard-only boundary missing");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay innovatorbench dataset-copy boundary missing");
    expect(result.manifest.agentBenchmarkReplaySummary).toMatchObject({
      innovatorBenchReplayRowCount: 1,
      failedInnovatorBenchReplayRowIds: ["innovatorbench-leaderboard-only"],
      totalInnovatorBenchTaskCount: 1,
      averageInnovatorBenchFinalScoreDelta: -4,
      averageInnovatorBenchBestScoreDelta: -6,
      averageInnovatorBenchReplayPassRate0to1: 0.5,
      averageInnovatorBenchResultCoverage0to1: 0.4,
      averageInnovatorBenchCheckpointRestoreCoverage0to1: 0.2,
      averageInnovatorBenchToolEvidenceCoverage0to1: 0.3,
    });
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      innovatorBenchReplayRowCount: 1,
      failedInnovatorBenchReplayRowIds: ["innovatorbench-leaderboard-only"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "innovatorbench-leaderboard-only",
      severity: "critical",
    });
  });

  test("binds GTO Wizard-style poker agent benchmark replay proof with hand, action, AIVAT, and policy evidence", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "gto-wizard-poker-agent-replay",
      sourceRefs: ["https://github.com/gtowizard-ai/researcher-api-client"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "gto-wizard-poker-agent-complete",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            outputArtifactHashes: [artifactHash],
            runtime: {
              kind: "python",
              version: "3.13",
              commandHash,
              dependencyHash,
              sandboxProfile: "gto-wizard-poker-fixture",
            },
            agentBenchmarkReplay: {
              benchmarkId: "amc-gto-wizard-poker-agent-replay",
              benchmarkVersion: "2026.06.16",
              paperRefHash: gtoWizardTechnicalPaperRefHash,
              repositorySnapshotHash: gtoWizardRepositorySnapshotHash,
              datasetManifestHash: gtoWizardHandHistoryManifestHash,
              agentConfigHash: gtoWizardAgentPolicyManifestHash,
              globalConfigHash: clawTaskConfigSchemaHash,
              modelServerConfigHash: clawMcpServerConfigHash,
              environmentManifestHash: gtoWizardEvalPackManifestHash,
              dependencyLockHash: dependencyHash,
              runCommandHash: commandHash,
              replayCommandHash: gtoWizardReplayCommandHash,
              tracePathHash: gtoWizardActionTraceHash,
              sampleTraceHash: clawAuditLogHash,
              resultManifestHash: gtoWizardResultManifestHash,
              metricsReportHash: gtoWizardAivatMetricReportHash,
              architecture: "reasoning_trace",
              workload: "game_play",
              deterministicSeed: 77,
              sampleCount: 16,
              minSampleCount: 8,
              shuffled: true,
              traceSaved: true,
              baselineMetric0to1: 0.58,
              candidateMetric0to1: 0.64,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 1,
              traceCoverage0to1: 1,
              minTraceCoverage0to1: 1,
              maxScoreRegression0to1: 0.05,
              gtoWizardBenchmarkId: "amc-gto-wizard-nlth-smoke",
              gtoWizardSourceRefHash,
              gtoWizardRepositorySnapshotHash,
              gtoWizardLicenseRefHash,
              gtoWizardApiDocRefHash,
              gtoWizardTechnicalPaperRefHash,
              gtoWizardEvalPackManifestHash,
              gtoWizardFixtureHash,
              gtoWizardAgentPolicyManifestHash,
              gtoWizardApiKeyScopeHash,
              gtoWizardNoSolverAccessPolicyHash,
              gtoWizardHandHistoryManifestHash,
              gtoWizardActionTraceHash,
              gtoWizardResultManifestHash,
              gtoWizardAivatMetricReportHash,
              gtoWizardLeaderboardSnapshotHash,
              gtoWizardReplayCommandHash,
              gtoWizardCiReceiptHash,
              gtoWizardAgentTypeIds: ["check_call", "random", "fold", "custom"],
              minGtoWizardAgentTypeCount: 4,
              gtoWizardGameVariant: "nlth",
              gtoWizardHandCount: 16,
              minGtoWizardHandCount: 8,
              gtoWizardDeterministicSeed: 77,
              gtoWizardBaselineAivatBbPer100: -2.4,
              gtoWizardCandidateAivatBbPer100: 1.8,
              gtoWizardAivatScoreDeltaBbPer100: 4.2,
              maxGtoWizardAivatRegressionBbPer100: 1,
              gtoWizardReplayPassRate0to1: 1,
              minGtoWizardReplayPassRate0to1: 1,
              gtoWizardLegalActionRate0to1: 1,
              minGtoWizardLegalActionRate0to1: 1,
            },
          },
          baseline: {
            score0to1: 0.58,
            evidenceRefs: ["trace:baseline-gto-wizard-poker"],
            signedEvidenceRefs: ["ledger:sig-baseline-gto-wizard-poker"],
          },
          candidate: {
            score0to1: 0.64,
            evidenceRefs: ["trace:candidate-gto-wizard-poker"],
            signedEvidenceRefs: ["ledger:sig-candidate-gto-wizard-poker"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.agentBenchmarkReplaySummary).toMatchObject({
      rowCount: 1,
      gtoWizardPokerReplayRowCount: 1,
      gtoWizardPokerAgentTypeIds: ["check_call", "random", "fold", "custom"],
      failedGtoWizardPokerReplayRowIds: [],
      totalGtoWizardPokerHandCount: 16,
      averageGtoWizardAivatScoreDeltaBbPer100: 4.2,
      averageGtoWizardReplayPassRate0to1: 1,
      averageGtoWizardLegalActionRate0to1: 1,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "gto-wizard-poker-agent-complete",
      status: "passed",
      agentBenchmarkReplay: {
        gtoWizardBenchmarkId: "amc-gto-wizard-nlth-smoke",
        gtoWizardGameVariant: "nlth",
        gtoWizardHandCount: 16,
        gtoWizardAivatScoreDeltaBbPer100: 4.2,
        gtoWizardReplayPassRate0to1: 1,
        gtoWizardLegalActionRate0to1: 1,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      gtoWizardPokerReplayRowCount: 1,
      failedGtoWizardPokerReplayRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("GTO Wizard Poker Rows: 1");
    expect(markdown).toContain("GTO Wizard Poker Agent Types: check_call, random, fold, custom");
    expect(markdown).toContain("reasoning_trace:game_play:gto-wizard-poker");
  });

  test("fails closed when GTO Wizard-style poker replay proof lacks policy, replay, hand, action, or metric evidence", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "gto-wizard-poker-agent-replay",
      sourceRefs: ["https://github.com/gtowizard-ai/researcher-api-client"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "gto-wizard-poker-agent-missing-proof",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            outputArtifactHashes: [artifactHash],
            runtime: {
              kind: "python",
              version: "3.13",
              commandHash,
              dependencyHash,
              sandboxProfile: "gto-wizard-poker-fixture",
            },
            agentBenchmarkReplay: {
              benchmarkId: "amc-gto-wizard-poker-agent-replay",
              benchmarkVersion: "2026.06.16",
              paperRefHash: gtoWizardTechnicalPaperRefHash,
              repositorySnapshotHash: gtoWizardRepositorySnapshotHash,
              datasetManifestHash: gtoWizardHandHistoryManifestHash,
              agentConfigHash: gtoWizardAgentPolicyManifestHash,
              globalConfigHash: clawTaskConfigSchemaHash,
              modelServerConfigHash: clawMcpServerConfigHash,
              environmentManifestHash: gtoWizardEvalPackManifestHash,
              dependencyLockHash: dependencyHash,
              runCommandHash: commandHash,
              replayCommandHash: gtoWizardReplayCommandHash,
              tracePathHash: gtoWizardActionTraceHash,
              sampleTraceHash: clawAuditLogHash,
              resultManifestHash: gtoWizardResultManifestHash,
              metricsReportHash: gtoWizardAivatMetricReportHash,
              architecture: "reasoning_trace",
              workload: "game_play",
              deterministicSeed: 78,
              sampleCount: 8,
              minSampleCount: 8,
              shuffled: true,
              traceSaved: true,
              baselineMetric0to1: 0.62,
              candidateMetric0to1: 0.57,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 1,
              traceCoverage0to1: 1,
              minTraceCoverage0to1: 1,
              maxScoreRegression0to1: 0.05,
              gtoWizardBenchmarkId: "amc-gto-wizard-nlth-missing-proof",
              gtoWizardSourceRefHash,
              gtoWizardRepositorySnapshotHash: "not-a-hash",
              gtoWizardLicenseRefHash: null,
              gtoWizardApiDocRefHash,
              gtoWizardTechnicalPaperRefHash,
              gtoWizardEvalPackManifestHash,
              gtoWizardFixtureHash,
              gtoWizardAgentPolicyManifestHash,
              gtoWizardApiKeyScopeHash,
              gtoWizardNoSolverAccessPolicyHash: null,
              gtoWizardHandHistoryManifestHash: null,
              gtoWizardActionTraceHash: "not-a-hash",
              gtoWizardResultManifestHash,
              gtoWizardAivatMetricReportHash: null,
              gtoWizardLeaderboardSnapshotHash,
              gtoWizardReplayCommandHash: null,
              gtoWizardCiReceiptHash: null,
              gtoWizardAgentTypeIds: [],
              minGtoWizardAgentTypeCount: 2,
              gtoWizardGameVariant: "nlth",
              gtoWizardHandCount: 3,
              minGtoWizardHandCount: 8,
              gtoWizardBaselineAivatBbPer100: 1.1,
              gtoWizardCandidateAivatBbPer100: -2.4,
              gtoWizardAivatScoreDeltaBbPer100: -3.5,
              maxGtoWizardAivatRegressionBbPer100: 1,
              gtoWizardReplayPassRate0to1: 0.5,
              minGtoWizardReplayPassRate0to1: 1,
              gtoWizardLegalActionRate0to1: 0.75,
              minGtoWizardLegalActionRate0to1: 1,
            },
          },
          baseline: {
            score0to1: 0.62,
            evidenceRefs: ["trace:baseline-gto-wizard-poker-missing"],
            signedEvidenceRefs: ["ledger:sig-baseline-gto-wizard-poker-missing"],
          },
          candidate: {
            score0to1: 0.57,
            evidenceRefs: ["trace:candidate-gto-wizard-poker-missing"],
            signedEvidenceRefs: ["ledger:sig-candidate-gto-wizard-poker-missing"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay gtowizard repository snapshot hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay gtowizard license ref hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay gtowizard no solver access policy hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay gtowizard hand history manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay gtowizard action trace hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay gtowizard aivat metric report hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay gtowizard replay command hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay gtowizard ci receipt hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay gtowizard agent type ids missing");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay gtowizard hand count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay gtowizard aivat score regression exceeds threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay gtowizard replay pass rate below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay gtowizard legal action rate below threshold");
    expect(result.manifest.agentBenchmarkReplaySummary.failedGtoWizardPokerReplayRowIds).toEqual([
      "gto-wizard-poker-agent-missing-proof",
    ]);
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      gtoWizardPokerReplayRowCount: 1,
      failedGtoWizardPokerReplayRowIds: ["gto-wizard-poker-agent-missing-proof"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "gto-wizard-poker-agent-missing-proof",
      severity: "critical",
    });
  });

  test("binds CostNav-style physical navigation economic-cost replay proof", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "costnav-physical-navigation-replay",
      sourceRefs: ["https://github.com/worv-ai/CostNav"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "costnav-navigation-complete",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            outputArtifactHashes: [artifactHash],
            runtime: {
              kind: "python",
              version: "3.13",
              commandHash,
              dependencyHash,
              sandboxProfile: "costnav-navigation-fixture",
            },
            agentBenchmarkReplay: {
              benchmarkId: "amc-costnav-navigation-replay",
              benchmarkVersion: "2026.06.17",
              paperRefHash: costNavSourceRefHash,
              repositorySnapshotHash: costNavRepositorySnapshotHash,
              datasetManifestHash: costNavScenarioManifestHash,
              agentConfigHash: costNavPhysicalAgentConfigHash,
              globalConfigHash: costNavBenchmarkSpecHash,
              modelServerConfigHash: clawMcpServerConfigHash,
              environmentManifestHash: costNavSimulatorConfigHash,
              dependencyLockHash: dependencyHash,
              runCommandHash: commandHash,
              replayCommandHash: costNavReplayCommandHash,
              tracePathHash: costNavTrajectoryManifestHash,
              sampleTraceHash: costNavRouteGraphHash,
              resultManifestHash: costNavResultManifestHash,
              metricsReportHash: costNavMetricsReportHash,
              architecture: "reasoning_trace",
              workload: "custom",
              deterministicSeed: 91,
              sampleCount: 12,
              minSampleCount: 8,
              shuffled: true,
              traceSaved: true,
              baselineMetric0to1: 0.68,
              candidateMetric0to1: 0.74,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 1,
              traceCoverage0to1: 1,
              minTraceCoverage0to1: 1,
              maxScoreRegression0to1: 0.05,
              costNavBenchmarkId: "amc-costnav-economic-cost-smoke",
              costNavSourceRefHash,
              costNavRepositorySnapshotHash,
              costNavLicenseRefHash,
              costNavBenchmarkSpecHash,
              costNavScenarioManifestHash,
              costNavRouteGraphHash,
              costNavEconomicCostModelHash,
              costNavPhysicalAgentConfigHash,
              costNavSimulatorConfigHash,
              costNavTrajectoryManifestHash,
              costNavResultManifestHash,
              costNavMetricsReportHash,
              costNavReplayCommandHash,
              costNavCiReceiptHash,
              costNavRouteTypes: ["indoor_delivery", "outdoor_waypoint", "obstacle_avoidance"],
              minCostNavRouteTypeCount: 3,
              costNavScenarioCount: 12,
              minCostNavScenarioCount: 8,
              costNavDeterministicSeed: 91,
              costNavBaselineEconomicCost: 124.5,
              costNavCandidateEconomicCost: 119,
              maxCostNavEconomicCostIncrease: 2,
              costNavNavigationSuccessRate0to1: 0.92,
              minCostNavNavigationSuccessRate0to1: 0.85,
              costNavReplayPassRate0to1: 1,
              minCostNavReplayPassRate0to1: 1,
              costNavScoreDelta0to1: 0.06,
              maxCostNavScoreRegression0to1: 0.05,
            },
          },
          baseline: {
            score0to1: 0.68,
            evidenceRefs: ["trace:baseline-costnav"],
            signedEvidenceRefs: ["ledger:sig-baseline-costnav"],
          },
          candidate: {
            score0to1: 0.74,
            evidenceRefs: ["trace:candidate-costnav"],
            signedEvidenceRefs: ["ledger:sig-candidate-costnav"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.agentBenchmarkReplaySummary).toMatchObject({
      rowCount: 1,
      costNavReplayRowCount: 1,
      costNavRouteTypes: ["indoor_delivery", "outdoor_waypoint", "obstacle_avoidance"],
      failedCostNavRowIds: [],
      totalCostNavScenarioCount: 12,
      averageCostNavEconomicCostDelta: -5.5,
      averageCostNavNavigationSuccessRate0to1: 0.92,
      averageCostNavReplayPassRate0to1: 1,
      averageCostNavScoreDelta0to1: 0.06,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "costnav-navigation-complete",
      status: "passed",
      agentBenchmarkReplay: {
        costNavBenchmarkId: "amc-costnav-economic-cost-smoke",
        costNavScenarioCount: 12,
        costNavEconomicCostDelta: -5.5,
        costNavNavigationSuccessRate0to1: 0.92,
        costNavReplayPassRate0to1: 1,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      costNavReplayRowCount: 1,
      failedCostNavRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("CostNav Rows: 1");
    expect(markdown).toContain("CostNav Route Types: indoor_delivery, outdoor_waypoint, obstacle_avoidance");
    expect(markdown).toContain("reasoning_trace:custom:costnav");
  });

  test("fails closed when CostNav-style economic-cost navigation replay proof is incomplete", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "costnav-physical-navigation-replay",
      sourceRefs: ["https://github.com/worv-ai/CostNav"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "costnav-navigation-missing-proof",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            outputArtifactHashes: [artifactHash],
            agentBenchmarkReplay: {
              benchmarkId: "amc-costnav-navigation-replay",
              benchmarkVersion: "2026.06.17",
              paperRefHash: costNavSourceRefHash,
              repositorySnapshotHash: costNavRepositorySnapshotHash,
              datasetManifestHash: costNavScenarioManifestHash,
              agentConfigHash: costNavPhysicalAgentConfigHash,
              globalConfigHash: costNavBenchmarkSpecHash,
              modelServerConfigHash: clawMcpServerConfigHash,
              environmentManifestHash: costNavSimulatorConfigHash,
              dependencyLockHash: dependencyHash,
              runCommandHash: commandHash,
              replayCommandHash: costNavReplayCommandHash,
              tracePathHash: costNavTrajectoryManifestHash,
              sampleTraceHash: costNavRouteGraphHash,
              resultManifestHash: costNavResultManifestHash,
              metricsReportHash: costNavMetricsReportHash,
              architecture: "reasoning_trace",
              workload: "custom",
              deterministicSeed: 92,
              sampleCount: 8,
              minSampleCount: 8,
              shuffled: true,
              traceSaved: true,
              baselineMetric0to1: 0.68,
              candidateMetric0to1: 0.61,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 1,
              traceCoverage0to1: 1,
              minTraceCoverage0to1: 1,
              maxScoreRegression0to1: 0.05,
              costNavBenchmarkId: "amc-costnav-economic-cost-missing-proof",
              costNavSourceRefHash,
              costNavRepositorySnapshotHash: "not-a-hash",
              costNavLicenseRefHash: null,
              costNavBenchmarkSpecHash,
              costNavScenarioManifestHash: null,
              costNavRouteGraphHash: "not-a-hash",
              costNavEconomicCostModelHash: null,
              costNavPhysicalAgentConfigHash,
              costNavSimulatorConfigHash,
              costNavTrajectoryManifestHash: null,
              costNavResultManifestHash,
              costNavMetricsReportHash: null,
              costNavReplayCommandHash: null,
              costNavCiReceiptHash: null,
              costNavRouteTypes: ["indoor_delivery"],
              minCostNavRouteTypeCount: 2,
              costNavScenarioCount: 3,
              minCostNavScenarioCount: 8,
              costNavDeterministicSeed: 92,
              costNavBaselineEconomicCost: 100,
              costNavCandidateEconomicCost: 118,
              maxCostNavEconomicCostIncrease: 2,
              costNavNavigationSuccessRate0to1: 0.5,
              minCostNavNavigationSuccessRate0to1: 0.85,
              costNavReplayPassRate0to1: 0.5,
              minCostNavReplayPassRate0to1: 1,
              costNavScoreDelta0to1: -0.07,
              maxCostNavScoreRegression0to1: 0.05,
            },
          },
          baseline: {
            score0to1: 0.68,
            evidenceRefs: ["trace:baseline-costnav-missing"],
            signedEvidenceRefs: ["ledger:sig-baseline-costnav-missing"],
          },
          candidate: {
            score0to1: 0.61,
            evidenceRefs: ["trace:candidate-costnav-missing"],
            signedEvidenceRefs: ["ledger:sig-candidate-costnav-missing"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toEqual(expect.arrayContaining([
      "agent benchmark replay costnav repository snapshot hash invalid",
      "agent benchmark replay costnav license ref hash invalid",
      "agent benchmark replay costnav scenario manifest hash invalid",
      "agent benchmark replay costnav route graph hash invalid",
      "agent benchmark replay costnav economic cost model hash invalid",
      "agent benchmark replay costnav trajectory manifest hash invalid",
      "agent benchmark replay costnav metrics report hash invalid",
      "agent benchmark replay costnav replay command hash invalid",
      "agent benchmark replay costnav ci receipt hash invalid",
      "agent benchmark replay costnav route type count below threshold",
      "agent benchmark replay costnav scenario count below threshold",
      "agent benchmark replay costnav economic cost increase exceeds threshold",
      "agent benchmark replay costnav navigation success rate below threshold",
      "agent benchmark replay costnav replay pass rate below threshold",
      "agent benchmark replay costnav score regression exceeds threshold",
    ]));
    expect(result.manifest.agentBenchmarkReplaySummary.failedCostNavRowIds).toEqual([
      "costnav-navigation-missing-proof",
    ]);
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      costNavReplayRowCount: 1,
      failedCostNavRowIds: ["costnav-navigation-missing-proof"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "costnav-navigation-missing-proof",
      severity: "critical",
    });
  });

  test("binds ResearchHarness-style tool-using agent harness proof into agent benchmark replay receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "researchharness-agent-replay",
      sourceRefs: ["https://github.com/InternScience/ResearchHarness"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "researchharness-complete",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            outputArtifactHashes: [artifactHash],
            runtime: {
              kind: "python",
              version: "3.13",
              commandHash,
              dependencyHash,
              sandboxProfile: "workspace-first-fixture",
            },
            agentBenchmarkReplay: {
              benchmarkId: "researchharness-tool-agent-baseline",
              benchmarkVersion: "2026.06.15",
              paperRefHash: logicPaperRefHash,
              repositorySnapshotHash: researchHarnessRepositorySnapshotHash,
              datasetManifestHash: clawDatasetVersionHash,
              agentConfigHash: clawAgentAdapterHash,
              globalConfigHash: clawTaskConfigSchemaHash,
              modelServerConfigHash: clawMcpServerConfigHash,
              environmentManifestHash: clawServiceCatalogHash,
              dependencyLockHash: dependencyHash,
              runCommandHash: commandHash,
              replayCommandHash: researchHarnessReplayCommandHash,
              tracePathHash: clawTrajectoryCaptureHash,
              sampleTraceHash: clawAuditLogHash,
              resultManifestHash: clawVerificationConfigHash,
              metricsReportHash: clawScoringRubricHash,
              architecture: "reasoning_trace",
              workload: "web_task",
              deterministicSeed: 15,
              sampleCount: 4,
              minSampleCount: 2,
              shuffled: true,
              traceSaved: true,
              baselineMetric0to1: 0.7,
              candidateMetric0to1: 0.82,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 1,
              traceCoverage0to1: 1,
              minTraceCoverage0to1: 0.95,
              maxScoreRegression0to1: 0.05,
              researchHarnessSourceRefHash,
              researchHarnessRepositorySnapshotHash,
              researchHarnessLicenseRefHash,
              researchHarnessRuntimeContractHash,
              researchHarnessToolSurfaceManifestHash,
              researchHarnessNativeToolCallTraceHash,
              researchHarnessOpenAiCompatibleApiHash,
              researchHarnessWorkspaceBoundaryHash,
              researchHarnessTraceManifestHash,
              researchHarnessBenchmarkAdapterHash,
              researchHarnessBaselineHarnessConfigHash,
              researchHarnessMetaHarnessComparisonHash,
              researchHarnessModelProviderMatrixHash,
              researchHarnessEvaluationReportHash,
              researchHarnessReplayCommandHash,
              researchHarnessContextCompactionPolicyHash,
              researchHarnessHumanInteractionPolicyHash,
              researchHarnessModelFamilies: ["gpt", "gemini", "qwen", "glm"],
              minResearchHarnessModelFamilyCount: 4,
              researchHarnessToolKinds: [
                "file_discovery",
                "file_read",
                "pdf_read",
                "image_inspection",
                "shell",
                "persistent_terminal",
                "web",
              ],
              minResearchHarnessToolKindCount: 6,
              researchHarnessTaskModes: ["local_task", "web_task", "coding", "file_work", "report_writing"],
              minResearchHarnessTaskModeCount: 4,
              researchHarnessNativeToolCalling: true,
              researchHarnessOpenAiCompatibleApiServed: true,
              researchHarnessWorkspaceBounded: true,
              researchHarnessHumanInteractionExcluded: true,
              researchHarnessTraceEventCount: 24,
              minResearchHarnessTraceEventCount: 12,
              researchHarnessReplayPassRate0to1: 1,
              minResearchHarnessReplayPassRate0to1: 1,
              researchHarnessTraceCoverage0to1: 1,
              minResearchHarnessTraceCoverage0to1: 0.95,
              researchHarnessToolCallValidity0to1: 0.98,
              minResearchHarnessToolCallValidity0to1: 0.95,
              researchHarnessWorkspaceIsolation0to1: 1,
              minResearchHarnessWorkspaceIsolation0to1: 1,
              researchHarnessApiCompatibility0to1: 0.97,
              minResearchHarnessApiCompatibility0to1: 0.9,
              researchHarnessBaselineAgreement0to1: 0.93,
              minResearchHarnessBaselineAgreement0to1: 0.9,
              researchHarnessScoreDelta0to1: 0.12,
              minResearchHarnessScoreDelta0to1: 0,
            },
          },
          baseline: {
            score0to1: 0.7,
            evidenceRefs: ["trace:baseline-researchharness"],
            signedEvidenceRefs: ["ledger:sig-baseline-researchharness"],
          },
          candidate: {
            score0to1: 0.82,
            evidenceRefs: ["trace:candidate-researchharness"],
            signedEvidenceRefs: ["ledger:sig-candidate-researchharness"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.agentBenchmarkReplaySummary).toMatchObject({
      rowCount: 1,
      researchHarnessRowCount: 1,
      researchHarnessModelFamilies: ["gpt", "gemini", "qwen", "glm"],
      researchHarnessToolKinds: [
        "file_discovery",
        "file_read",
        "pdf_read",
        "image_inspection",
        "shell",
        "persistent_terminal",
        "web",
      ],
      researchHarnessTaskModes: ["local_task", "web_task", "coding", "file_work", "report_writing"],
      failedResearchHarnessRowIds: [],
      averageResearchHarnessReplayPassRate0to1: 1,
      averageResearchHarnessToolCallValidity0to1: 0.98,
      averageResearchHarnessBaselineAgreement0to1: 0.93,
      averageResearchHarnessScoreDelta0to1: 0.12,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "researchharness-complete",
      status: "passed",
      agentBenchmarkReplay: {
        benchmarkId: "researchharness-tool-agent-baseline",
        researchHarnessModelFamilies: ["gpt", "gemini", "qwen", "glm"],
        researchHarnessToolKinds: [
          "file_discovery",
          "file_read",
          "pdf_read",
          "image_inspection",
          "shell",
          "persistent_terminal",
          "web",
        ],
        researchHarnessTaskModes: ["local_task", "web_task", "coding", "file_work", "report_writing"],
        researchHarnessNativeToolCalling: true,
        researchHarnessOpenAiCompatibleApiServed: true,
        researchHarnessWorkspaceBounded: true,
        researchHarnessHumanInteractionExcluded: true,
        researchHarnessReplayPassRate0to1: 1,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      agentBenchmarkReplayRowCount: 1,
      researchHarnessRowCount: 1,
      failedResearchHarnessRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("ResearchHarness Rows: 1");
    expect(markdown).toContain("ResearchHarness Tool Kinds: file_discovery, file_read, pdf_read");
    expect(markdown).toContain("reasoning_trace:web_task:researchharness");
  });

  test("fails closed when ResearchHarness-style harness replay proof is incomplete", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "researchharness-agent-replay",
      sourceRefs: ["https://github.com/InternScience/ResearchHarness"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "researchharness-missing-harness-proof",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            runtime: {
              kind: "python",
              version: "3.13",
              commandHash,
              dependencyHash,
              sandboxProfile: "workspace-first-fixture",
            },
            agentBenchmarkReplay: {
              benchmarkId: "researchharness-tool-agent-baseline",
              benchmarkVersion: "2026.06.15",
              paperRefHash: logicPaperRefHash,
              repositorySnapshotHash: researchHarnessRepositorySnapshotHash,
              datasetManifestHash: clawDatasetVersionHash,
              agentConfigHash: clawAgentAdapterHash,
              globalConfigHash: clawTaskConfigSchemaHash,
              modelServerConfigHash: clawMcpServerConfigHash,
              environmentManifestHash: clawServiceCatalogHash,
              dependencyLockHash: dependencyHash,
              runCommandHash: commandHash,
              replayCommandHash: researchHarnessReplayCommandHash,
              tracePathHash: clawTrajectoryCaptureHash,
              sampleTraceHash: clawAuditLogHash,
              resultManifestHash: clawVerificationConfigHash,
              metricsReportHash: clawScoringRubricHash,
              architecture: "reasoning_trace",
              workload: "web_task",
              deterministicSeed: 15,
              sampleCount: 4,
              minSampleCount: 2,
              shuffled: true,
              traceSaved: true,
              baselineMetric0to1: 0.7,
              candidateMetric0to1: 0.68,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 1,
              traceCoverage0to1: 1,
              minTraceCoverage0to1: 0.95,
              maxScoreRegression0to1: 0.05,
              researchHarnessSourceRefHash,
              researchHarnessToolKinds: ["shell", "file_read"],
              minResearchHarnessToolKindCount: 6,
              researchHarnessModelFamilies: ["gpt"],
              minResearchHarnessModelFamilyCount: 4,
              researchHarnessTaskModes: ["local_task"],
              minResearchHarnessTaskModeCount: 4,
              researchHarnessNativeToolCalling: false,
              researchHarnessOpenAiCompatibleApiServed: false,
              researchHarnessWorkspaceBounded: false,
              researchHarnessHumanInteractionExcluded: false,
              researchHarnessTraceEventCount: 2,
              minResearchHarnessTraceEventCount: 12,
              researchHarnessReplayPassRate0to1: 0.5,
              minResearchHarnessReplayPassRate0to1: 1,
              researchHarnessTraceCoverage0to1: 0.5,
              minResearchHarnessTraceCoverage0to1: 0.95,
              researchHarnessToolCallValidity0to1: 0.7,
              minResearchHarnessToolCallValidity0to1: 0.95,
              researchHarnessWorkspaceIsolation0to1: 0.5,
              minResearchHarnessWorkspaceIsolation0to1: 1,
              researchHarnessApiCompatibility0to1: 0.6,
              minResearchHarnessApiCompatibility0to1: 0.9,
              researchHarnessBaselineAgreement0to1: 0.65,
              minResearchHarnessBaselineAgreement0to1: 0.9,
              researchHarnessScoreDelta0to1: -0.02,
              minResearchHarnessScoreDelta0to1: 0,
            },
          },
          baseline: {
            score0to1: 0.7,
            evidenceRefs: ["trace:baseline-researchharness-missing"],
            signedEvidenceRefs: ["ledger:sig-baseline-researchharness-missing"],
          },
          candidate: {
            score0to1: 0.68,
            evidenceRefs: ["trace:candidate-researchharness-missing"],
            signedEvidenceRefs: ["ledger:sig-candidate-researchharness-missing"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay researchharness repository snapshot hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay researchharness license ref hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay researchharness runtime contract hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay researchharness native tool-call trace hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay researchharness tool kind count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay researchharness native tool calling disabled");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay researchharness human interaction policy not enforced");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay researchharness replay pass rate below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay researchharness score delta below threshold");
    expect(result.manifest.agentBenchmarkReplaySummary.failedResearchHarnessRowIds).toEqual([
      "researchharness-missing-harness-proof",
    ]);
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      researchHarnessRowCount: 1,
      failedResearchHarnessRowIds: ["researchharness-missing-harness-proof"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "researchharness-missing-harness-proof",
      severity: "critical",
    });
  });

  test("binds Agent Mont-style monitoring replay proof into agent benchmark replay receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "agent-mont-monitoring-replay",
      sourceRefs: ["https://github.com/ansarifaisal12/Agent_Mont"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "agent-mont-complete",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            outputArtifactHashes: [artifactHash],
            runtime: {
              kind: "python",
              version: "3.13",
              commandHash,
              dependencyHash,
              sandboxProfile: "agent-monitoring-fixture",
            },
            agentBenchmarkReplay: {
              benchmarkId: "agent-mont-crew-monitoring-smoke",
              benchmarkVersion: "2026.06.15",
              paperRefHash: logicPaperRefHash,
              repositorySnapshotHash: agentMontRepositorySnapshotHash,
              datasetManifestHash: clawDatasetVersionHash,
              agentConfigHash: clawAgentAdapterHash,
              globalConfigHash: clawTaskConfigSchemaHash,
              modelServerConfigHash: clawMcpServerConfigHash,
              environmentManifestHash: clawServiceCatalogHash,
              dependencyLockHash: dependencyHash,
              runCommandHash: commandHash,
              replayCommandHash: agentMontReplayCommandHash,
              tracePathHash: clawTrajectoryCaptureHash,
              sampleTraceHash: clawAuditLogHash,
              resultManifestHash: clawVerificationConfigHash,
              metricsReportHash: agentMontMetricsReportHash,
              architecture: "reasoning_trace",
              workload: "custom",
              deterministicSeed: 16,
              sampleCount: 3,
              minSampleCount: 2,
              shuffled: true,
              traceSaved: true,
              baselineMetric0to1: 0.71,
              candidateMetric0to1: 0.83,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 1,
              traceCoverage0to1: 1,
              minTraceCoverage0to1: 0.95,
              maxScoreRegression0to1: 0.05,
              agentMontBenchmarkId: "agent-mont-monitoring-smoke",
              agentMontSourceRefHash,
              agentMontRepositorySnapshotHash,
              agentMontLicenseRefHash,
              agentMontMonitoringConfigHash,
              agentMontFramework: "crew_ai",
              agentMontAgentConfigHash,
              agentMontTaskManifestHash,
              agentMontRunTraceHash,
              agentMontTokenUsageManifestHash,
              agentMontCostRateCardHash,
              agentMontLatencyTraceHash,
              agentMontResourceUtilizationHash,
              agentMontCarbonEstimateConfigHash,
              agentMontLogArtifactHash,
              agentMontVisualizationArtifactHash,
              agentMontMetricsReportHash,
              agentMontReplayCommandHash,
              agentMontVisualizationModes: ["cli", "streamlit"],
              minAgentMontVisualizationModeCount: 2,
              agentMontInputTokenCount: 120,
              agentMontOutputTokenCount: 240,
              agentMontTotalTokenCount: 360,
              minAgentMontTotalTokenCount: 300,
              agentMontCostUsd: 0.018,
              maxAgentMontCostUsd: 0.05,
              agentMontLatencyMs: 2400,
              maxAgentMontLatencyMs: 5000,
              agentMontThroughputTokensPerSecond: 150,
              minAgentMontThroughputTokensPerSecond: 50,
              agentMontCpuUtilization0to1: 0.31,
              maxAgentMontCpuUtilization0to1: 0.7,
              agentMontMemoryMb: 192,
              maxAgentMontMemoryMb: 512,
              agentMontCarbonGramsCo2e: 0.0004,
              maxAgentMontCarbonGramsCo2e: 0.001,
              agentMontReplayPassRate0to1: 1,
              minAgentMontReplayPassRate0to1: 1,
              agentMontMetricCoverage0to1: 1,
              minAgentMontMetricCoverage0to1: 1,
              agentMontLogCoverage0to1: 1,
              minAgentMontLogCoverage0to1: 1,
            },
          },
          baseline: {
            score0to1: 0.71,
            evidenceRefs: ["trace:baseline-agent-mont"],
            signedEvidenceRefs: ["ledger:sig-baseline-agent-mont"],
          },
          candidate: {
            score0to1: 0.83,
            evidenceRefs: ["trace:candidate-agent-mont"],
            signedEvidenceRefs: ["ledger:sig-candidate-agent-mont"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.agentBenchmarkReplaySummary).toMatchObject({
      rowCount: 1,
      agentMontRowCount: 1,
      agentMontFrameworks: ["crew_ai"],
      agentMontVisualizationModes: ["cli", "streamlit"],
      failedAgentMontRowIds: [],
      averageAgentMontCostUsd: 0.018,
      averageAgentMontLatencyMs: 2400,
      averageAgentMontThroughputTokensPerSecond: 150,
      averageAgentMontCarbonGramsCo2e: 0.0004,
      averageAgentMontReplayPassRate0to1: 1,
      averageAgentMontMetricCoverage0to1: 1,
      averageAgentMontLogCoverage0to1: 1,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "agent-mont-complete",
      status: "passed",
      agentBenchmarkReplay: {
        agentMontBenchmarkId: "agent-mont-monitoring-smoke",
        agentMontFramework: "crew_ai",
        agentMontVisualizationModes: ["cli", "streamlit"],
        agentMontTotalTokenCount: 360,
        agentMontCostUsd: 0.018,
        agentMontReplayPassRate0to1: 1,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      agentBenchmarkReplayRowCount: 1,
      agentMontRowCount: 1,
      failedAgentMontRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("Agent Mont Rows: 1");
    expect(markdown).toContain("Agent Mont Frameworks: crew_ai");
    expect(markdown).toContain("Agent Mont Visualization Modes: cli, streamlit");
    expect(markdown).toContain("reasoning_trace:custom:agentmont");
  });

  test("fails closed when Agent Mont-style monitoring replay proof is incomplete", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "agent-mont-monitoring-replay",
      sourceRefs: ["https://github.com/ansarifaisal12/Agent_Mont"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "agent-mont-missing-monitoring-proof",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            outputArtifactHashes: [artifactHash],
            runtime: {
              kind: "python",
              version: "3.13",
              commandHash,
              dependencyHash,
              sandboxProfile: "agent-monitoring-fixture",
            },
            agentBenchmarkReplay: {
              benchmarkId: "agent-mont-crew-monitoring-smoke",
              benchmarkVersion: "2026.06.15",
              paperRefHash: logicPaperRefHash,
              repositorySnapshotHash: agentMontRepositorySnapshotHash,
              datasetManifestHash: clawDatasetVersionHash,
              agentConfigHash: clawAgentAdapterHash,
              globalConfigHash: clawTaskConfigSchemaHash,
              modelServerConfigHash: clawMcpServerConfigHash,
              environmentManifestHash: clawServiceCatalogHash,
              dependencyLockHash: dependencyHash,
              runCommandHash: commandHash,
              replayCommandHash: agentMontReplayCommandHash,
              tracePathHash: clawTrajectoryCaptureHash,
              sampleTraceHash: clawAuditLogHash,
              resultManifestHash: clawVerificationConfigHash,
              metricsReportHash: agentMontMetricsReportHash,
              architecture: "reasoning_trace",
              workload: "custom",
              deterministicSeed: 16,
              sampleCount: 3,
              minSampleCount: 2,
              shuffled: true,
              traceSaved: true,
              baselineMetric0to1: 0.83,
              candidateMetric0to1: 0.82,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 1,
              traceCoverage0to1: 1,
              minTraceCoverage0to1: 0.95,
              maxScoreRegression0to1: 0.05,
              agentMontBenchmarkId: "agent-mont-monitoring-smoke",
              agentMontSourceRefHash,
              agentMontFramework: "crew_ai",
              agentMontVisualizationModes: ["cli"],
              minAgentMontVisualizationModeCount: 2,
              agentMontInputTokenCount: 120,
              agentMontOutputTokenCount: 260,
              agentMontTotalTokenCount: 300,
              minAgentMontTotalTokenCount: 500,
              agentMontCostUsd: 0.09,
              maxAgentMontCostUsd: 0.05,
              agentMontLatencyMs: 13000,
              maxAgentMontLatencyMs: 5000,
              agentMontThroughputTokensPerSecond: 6,
              minAgentMontThroughputTokensPerSecond: 20,
              agentMontCpuUtilization0to1: 0.8,
              maxAgentMontCpuUtilization0to1: 0.5,
              agentMontMemoryMb: 1024,
              maxAgentMontMemoryMb: 512,
              agentMontCarbonGramsCo2e: 0.2,
              maxAgentMontCarbonGramsCo2e: 0.1,
              agentMontReplayPassRate0to1: 0.5,
              minAgentMontReplayPassRate0to1: 1,
              agentMontMetricCoverage0to1: 0.6,
              minAgentMontMetricCoverage0to1: 1,
              agentMontLogCoverage0to1: 0.4,
              minAgentMontLogCoverage0to1: 1,
            },
          },
          baseline: {
            score0to1: 0.83,
            evidenceRefs: ["trace:baseline-agent-mont-missing"],
            signedEvidenceRefs: ["ledger:sig-baseline-agent-mont-missing"],
          },
          candidate: {
            score0to1: 0.82,
            evidenceRefs: ["trace:candidate-agent-mont-missing"],
            signedEvidenceRefs: ["ledger:sig-candidate-agent-mont-missing"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay agentmont repository snapshot hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay agentmont token usage manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay agentmont visualization mode count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay agentmont total token count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay agentmont total token count below input/output sum");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay agentmont cost above threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay agentmont throughput below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay agentmont replay pass rate below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay agentmont log coverage below threshold");
    expect(result.manifest.agentBenchmarkReplaySummary.failedAgentMontRowIds).toEqual([
      "agent-mont-missing-monitoring-proof",
    ]);
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      agentMontRowCount: 1,
      failedAgentMontRowIds: ["agent-mont-missing-monitoring-proof"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "agent-mont-missing-monitoring-proof",
      severity: "critical",
    });
  });

  test("binds MiniAppBench-style interactive HTML replay proof into agent benchmark receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "miniappbench-interactive-html-replay",
      sourceRefs: ["https://github.com/MiniAppBench/miniappbench"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "miniappbench-complete",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            outputArtifactHashes: [artifactHash],
            runtime: {
              kind: "browser",
              version: "playwright-1.0",
              commandHash,
              dependencyHash,
              sandboxProfile: "miniappbench-browser-fixture",
            },
            agentBenchmarkReplay: {
              benchmarkId: "amc-miniappbench-browser-replay",
              benchmarkVersion: "2026.06.17",
              paperRefHash: miniAppBenchSourceRefHash,
              repositorySnapshotHash: miniAppBenchRepositorySnapshotHash,
              datasetManifestHash: miniAppBenchDatasetManifestHash,
              agentConfigHash: clawAgentAdapterHash,
              globalConfigHash: miniAppBenchInteractionRubricHash,
              modelServerConfigHash: clawMcpServerConfigHash,
              environmentManifestHash: miniAppBenchLiveInstanceManifestHash,
              dependencyLockHash: dependencyHash,
              runCommandHash: commandHash,
              replayCommandHash: miniAppBenchReplayCommandHash,
              tracePathHash: miniAppBenchBrowserAutomationTraceHash,
              sampleTraceHash: clawAuditLogHash,
              resultManifestHash: miniAppBenchResultManifestHash,
              metricsReportHash: miniAppBenchVisualRenderReportHash,
              architecture: "reasoning_trace",
              workload: "web_task",
              deterministicSeed: 17,
              sampleCount: 5,
              minSampleCount: 3,
              shuffled: true,
              traceSaved: true,
              baselineMetric0to1: 0.74,
              candidateMetric0to1: 0.82,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 1,
              traceCoverage0to1: 1,
              minTraceCoverage0to1: 0.95,
              maxScoreRegression0to1: 0.03,
              miniAppBenchBenchmarkId: "miniappbench-interactive-html-smoke",
              miniAppBenchSourceRefHash,
              miniAppBenchRepositorySnapshotHash,
              miniAppBenchLicenseReviewHash,
              miniAppBenchDatasetManifestHash,
              miniAppBenchQuerySetHash,
              miniAppBenchEvaluationReferenceManifestHash,
              miniAppBenchGeneratedMiniAppManifestHash,
              miniAppBenchGeneratedSourceCodeHash,
              miniAppBenchLiveInstanceManifestHash,
              miniAppBenchBrowserAutomationTraceHash,
              miniAppBenchInteractionRubricHash,
              miniAppBenchVisualRenderReportHash,
              miniAppBenchDynamicInteractionReportHash,
              miniAppBenchResultManifestHash,
              miniAppBenchReplayCommandHash,
              miniAppBenchCiReceiptHash,
              miniAppBenchTaskCategories: ["static-layout", "dynamic-interaction", "visual-rendering"],
              minMiniAppBenchTaskCategoryCount: 3,
              miniAppBenchQueryCount: 5,
              minMiniAppBenchQueryCount: 3,
              miniAppBenchDeterministicSeed: 17,
              miniAppBenchWithheldReferencesRespected: true,
              miniAppBenchNoCopySourceBoundary: true,
              miniAppBenchBrowserAutomationSuccessRate0to1: 1,
              minMiniAppBenchBrowserAutomationSuccessRate0to1: 0.95,
              miniAppBenchInteractionCoverage0to1: 0.92,
              minMiniAppBenchInteractionCoverage0to1: 0.85,
              miniAppBenchHumanAlignment0to1: 0.88,
              minMiniAppBenchHumanAlignment0to1: 0.85,
              miniAppBenchReplayPassRate0to1: 1,
              minMiniAppBenchReplayPassRate0to1: 1,
              miniAppBenchBaselineScore0to1: 0.74,
              miniAppBenchCandidateScore0to1: 0.82,
              maxMiniAppBenchScoreRegression0to1: 0.03,
            },
          },
          baseline: {
            score0to1: 0.74,
            evidenceRefs: ["trace:baseline-miniappbench"],
            signedEvidenceRefs: ["ledger:sig-baseline-miniappbench"],
          },
          candidate: {
            score0to1: 0.82,
            evidenceRefs: ["trace:candidate-miniappbench"],
            signedEvidenceRefs: ["ledger:sig-candidate-miniappbench"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.agentBenchmarkReplaySummary).toMatchObject({
      rowCount: 1,
      miniAppBenchRowCount: 1,
      miniAppBenchTaskCategories: ["static-layout", "dynamic-interaction", "visual-rendering"],
      failedMiniAppBenchRowIds: [],
      totalMiniAppBenchQueryCount: 5,
      averageMiniAppBenchBrowserAutomationSuccessRate0to1: 1,
      averageMiniAppBenchInteractionCoverage0to1: 0.92,
      averageMiniAppBenchHumanAlignment0to1: 0.88,
      averageMiniAppBenchReplayPassRate0to1: 1,
      averageMiniAppBenchScoreDelta0to1: 0.08,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "miniappbench-complete",
      status: "passed",
      agentBenchmarkReplay: {
        miniAppBenchBenchmarkId: "miniappbench-interactive-html-smoke",
        miniAppBenchTaskCategories: ["static-layout", "dynamic-interaction", "visual-rendering"],
        miniAppBenchQueryCount: 5,
        miniAppBenchWithheldReferencesRespected: true,
        miniAppBenchNoCopySourceBoundary: true,
        miniAppBenchScoreDelta0to1: 0.08,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      agentBenchmarkReplayRowCount: 1,
      miniAppBenchRowCount: 1,
      failedMiniAppBenchRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("MiniAppBench Rows: 1");
    expect(markdown).toContain("MiniAppBench Task Categories: static-layout, dynamic-interaction, visual-rendering");
    expect(markdown).toContain("reasoning_trace:web_task:miniappbench");
  });

  test("fails closed when MiniAppBench-style browser replay proof is metadata-only", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "miniappbench-interactive-html-replay",
      sourceRefs: ["https://github.com/MiniAppBench/miniappbench"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "miniappbench-missing-browser-proof",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            outputArtifactHashes: [artifactHash],
            runtime: {
              kind: "browser",
              version: "playwright-1.0",
              commandHash,
              dependencyHash,
              sandboxProfile: "miniappbench-browser-fixture",
            },
            agentBenchmarkReplay: {
              benchmarkId: "amc-miniappbench-browser-replay",
              benchmarkVersion: "2026.06.17",
              paperRefHash: miniAppBenchSourceRefHash,
              repositorySnapshotHash: miniAppBenchRepositorySnapshotHash,
              datasetManifestHash: miniAppBenchDatasetManifestHash,
              agentConfigHash: clawAgentAdapterHash,
              globalConfigHash: miniAppBenchInteractionRubricHash,
              modelServerConfigHash: clawMcpServerConfigHash,
              environmentManifestHash: miniAppBenchLiveInstanceManifestHash,
              dependencyLockHash: dependencyHash,
              runCommandHash: commandHash,
              replayCommandHash: miniAppBenchReplayCommandHash,
              tracePathHash: miniAppBenchBrowserAutomationTraceHash,
              sampleTraceHash: clawAuditLogHash,
              resultManifestHash: miniAppBenchResultManifestHash,
              metricsReportHash: miniAppBenchVisualRenderReportHash,
              architecture: "reasoning_trace",
              workload: "web_task",
              deterministicSeed: 17,
              sampleCount: 5,
              minSampleCount: 3,
              shuffled: true,
              traceSaved: true,
              baselineMetric0to1: 0.83,
              candidateMetric0to1: 0.75,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 1,
              traceCoverage0to1: 1,
              minTraceCoverage0to1: 0.95,
              maxScoreRegression0to1: 0.03,
              miniAppBenchBenchmarkId: "miniappbench-interactive-html-smoke",
              miniAppBenchSourceRefHash,
              miniAppBenchRepositorySnapshotHash: "not-a-hash",
              miniAppBenchTaskCategories: ["static-layout"],
              minMiniAppBenchTaskCategoryCount: 2,
              miniAppBenchQueryCount: 1,
              minMiniAppBenchQueryCount: 3,
              miniAppBenchWithheldReferencesRespected: false,
              miniAppBenchNoCopySourceBoundary: false,
              miniAppBenchBrowserAutomationSuccessRate0to1: 0.5,
              minMiniAppBenchBrowserAutomationSuccessRate0to1: 0.95,
              miniAppBenchInteractionCoverage0to1: 0.4,
              minMiniAppBenchInteractionCoverage0to1: 0.85,
              miniAppBenchHumanAlignment0to1: 0.7,
              minMiniAppBenchHumanAlignment0to1: 0.85,
              miniAppBenchReplayPassRate0to1: 0.5,
              minMiniAppBenchReplayPassRate0to1: 1,
              miniAppBenchBaselineScore0to1: 0.83,
              miniAppBenchCandidateScore0to1: 0.75,
              maxMiniAppBenchScoreRegression0to1: 0.03,
            },
          },
          baseline: {
            score0to1: 0.83,
            evidenceRefs: ["trace:baseline-miniappbench-missing"],
            signedEvidenceRefs: ["ledger:sig-baseline-miniappbench-missing"],
          },
          candidate: {
            score0to1: 0.75,
            evidenceRefs: ["trace:candidate-miniappbench-missing"],
            signedEvidenceRefs: ["ledger:sig-candidate-miniappbench-missing"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay miniappbench repository snapshot hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay miniappbench license review hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay miniappbench evaluation reference manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay miniappbench browser automation trace hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay miniappbench task category count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay miniappbench query count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay miniappbench deterministic seed missing");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay miniappbench withheld reference boundary not respected");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay miniappbench no-copy source boundary missing");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay miniappbench browser automation success below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay miniappbench interaction coverage below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay miniappbench human alignment below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay miniappbench replay pass rate below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay miniappbench score regression exceeds threshold");
    expect(result.manifest.agentBenchmarkReplaySummary.failedMiniAppBenchRowIds).toEqual([
      "miniappbench-missing-browser-proof",
    ]);
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      miniAppBenchRowCount: 1,
      failedMiniAppBenchRowIds: ["miniappbench-missing-browser-proof"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "miniappbench-missing-browser-proof",
      severity: "critical",
    });
  });

  test("maps Testing-RAG source review to existing agent benchmark replay receipts without a standalone subsystem", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "testing-rag-replay-corpus",
      sourceRefs: [
        "https://github.com/shiragannavar/Testing-RAG",
        "git:shiragannavar/Testing-RAG@d5bc7cf6bb2a1d5cef9e1aec4893045e99cf23a8",
        "tree:shiragannavar/Testing-RAG@d5bc7cf6bb2a1d5cef9e1aec4893045e99cf23a8:26-paths",
      ],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "testing-rag-ragchecker-complete",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            task: "Replay a Testing-RAG-style RAGChecker evaluation pack without copying upstream fixtures.",
            outputArtifactHashes: [ragScoringReportHash],
            agentBenchmarkReplay: {
              benchmarkId: "testing-rag-ragchecker-eval",
              benchmarkVersion: "2026.06.20-source-review",
              paperRefHash: ragEvalFlowSourceRefHash,
              repositorySnapshotHash: ragEvalFlowRepositorySnapshotHash,
              datasetManifestHash: ragEvalFlowEvalPackManifestHash,
              agentConfigHash: ragEvalFlowPipelineConfigHash,
              globalConfigHash: ragEvalFlowMetricDefinitionHash,
              modelServerConfigHash: ragEvalFlowModelConfigHash,
              environmentManifestHash: ragEvalFlowDataSourceManifestHash,
              dependencyLockHash: dependencyHash,
              runCommandHash: ragEvalFlowReplayCommandHash,
              replayCommandHash: commandHash,
              tracePathHash: ragRetrievalTraceHash,
              sampleTraceHash: ragGenerationTraceHash,
              resultManifestHash: ragEvalFlowResultManifestHash,
              metricsReportHash: ragEvalFlowScoreDeltaReportHash,
              architecture: "reasoning_trace",
              workload: "knowledge_qa",
              deterministicSeed: 597,
              sampleCount: 2,
              minSampleCount: 1,
              shuffled: true,
              traceSaved: true,
              baselineMetric0to1: 0.72,
              candidateMetric0to1: 0.81,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 1,
              traceCoverage0to1: 1,
              minTraceCoverage0to1: 0.95,
              maxScoreRegression0to1: 0.02,
            },
          },
          baseline: {
            score0to1: 0.72,
            evidenceRefs: ["trace:baseline-testing-rag-ragchecker"],
            signedEvidenceRefs: ["ledger:sig-baseline-testing-rag-ragchecker"],
          },
          candidate: {
            score0to1: 0.81,
            evidenceRefs: ["trace:candidate-testing-rag-ragchecker"],
            signedEvidenceRefs: ["ledger:sig-candidate-testing-rag-ragchecker"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.fixtureHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.manifest.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.manifest.rows[0]?.agentBenchmarkReplay).toMatchObject({
      benchmarkId: "testing-rag-ragchecker-eval",
      scoreDelta0to1: 0.09,
      replayPassRate0to1: 1,
      traceCoverage0to1: 1,
    });
    expect(result.manifest.agentBenchmarkReplaySummary).toMatchObject({
      rowCount: 1,
      benchmarkIds: ["testing-rag-ragchecker-eval"],
      failedRowIds: [],
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      failClosed: false,
      fixtureHash: result.manifest.fixtureHash,
      scoreDelta0to1: 0.09,
      agentBenchmarkReplayRowCount: 1,
      failedAgentBenchmarkReplayRowIds: [],
    });
    expect(verifyReplayBenchmarkCorpusReceipt(result.manifest, result.ciReceipt)).toMatchObject({
      valid: true,
      errors: [],
    });
    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("Agent Benchmark Replay Rows: 1");
    expect(markdown).toContain("Agent Benchmark Replay Architectures: reasoning_trace");
    expect(markdown).toContain("Agent Benchmark Replay Workloads: knowledge_qa");
  });

  test("fails closed when Testing-RAG source evidence is only repository metadata", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "testing-rag-metadata-only",
      sourceRefs: ["https://github.com/shiragannavar/Testing-RAG"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "testing-rag-metadata-only",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            task: "Reject repository-metadata-only Testing-RAG proof.",
            agentBenchmarkReplay: {
              benchmarkId: "testing-rag-ragchecker-eval",
              benchmarkVersion: "metadata-only",
              architecture: "reasoning_trace",
              workload: "knowledge_qa",
            },
          },
          baseline: {
            score0to1: 0.72,
            evidenceRefs: ["github:shiragannavar/Testing-RAG"],
            signedEvidenceRefs: [],
          },
          candidate: {
            score0to1: 0.81,
            evidenceRefs: ["github:shiragannavar/Testing-RAG"],
            signedEvidenceRefs: [],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toEqual(expect.arrayContaining([
      "signed evidence refs below threshold",
      "agent benchmark replay repository snapshot hash invalid",
      "agent benchmark replay dataset manifest hash invalid",
      "agent benchmark replay replay command hash invalid",
      "agent benchmark replay score delta missing",
    ]));
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      agentBenchmarkReplayRowCount: 1,
      failedAgentBenchmarkReplayRowIds: ["testing-rag-metadata-only"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "testing-rag-metadata-only",
      severity: "critical",
    });
  });

  test("binds Knowlytics-AI MCQ and RAG self-evaluation replay proof into agent benchmark receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "knowlytics-ai-replay-corpus",
      sourceRefs: [
        "https://github.com/Sathyajitanand2004/Knowlytics-AI",
        "git:Sathyajitanand2004/Knowlytics-AI@0409f18a927138e50b2391d900d562f953a435b8",
      ],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "knowlytics-ai-complete",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            outputArtifactHashes: [artifactHash],
            runtime: {
              kind: "python",
              version: "knowlytics-ai-fixture-2026.06",
              commandHash,
              dependencyHash,
              sandboxProfile: "knowlytics-ai-owned-fixture",
            },
            agentBenchmarkReplay: {
              benchmarkId: "amc-knowlytics-ai-mcq-rag-replay",
              benchmarkVersion: "2026.06.20",
              paperRefHash: knowlyticsAiSourceRefHash,
              repositorySnapshotHash: knowlyticsAiRepositorySnapshotHash,
              datasetManifestHash: knowlyticsAiSyntheticDocumentCorpusHash,
              agentConfigHash: knowlyticsAiEvaluatorRubricHash,
              globalConfigHash: knowlyticsAiQuizSpecHash,
              modelServerConfigHash: knowlyticsAiRequirementsHash,
              environmentManifestHash: knowlyticsAiStreamlitAppHash,
              dependencyLockHash: knowlyticsAiRequirementsHash,
              runCommandHash: commandHash,
              replayCommandHash: knowlyticsAiReplayCommandHash,
              tracePathHash: knowlyticsAiRetrievalTraceHash,
              sampleTraceHash: knowlyticsAiGenerationTraceHash,
              resultManifestHash: knowlyticsAiResultManifestHash,
              metricsReportHash: knowlyticsAiPerformanceFeedbackHash,
              architecture: "reasoning_trace",
              workload: "knowledge_qa",
              deterministicSeed: 573,
              sampleCount: 6,
              minSampleCount: 3,
              shuffled: true,
              traceSaved: true,
              baselineMetric0to1: 0.68,
              candidateMetric0to1: 0.77,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 1,
              traceCoverage0to1: 1,
              minTraceCoverage0to1: 0.95,
              maxScoreRegression0to1: 0.03,
              knowlyticsAiBenchmarkId: "knowlytics-ai-owned-mcq-rag-smoke",
              knowlyticsAiSourceRefHash,
              knowlyticsAiRepositorySnapshotHash,
              knowlyticsAiNoLicenseBoundaryHash,
              knowlyticsAiReadmeBlobHash,
              knowlyticsAiStreamlitAppHash,
              knowlyticsAiMcqGeneratorHash,
              knowlyticsAiRagGeneratorHash,
              knowlyticsAiEvaluatorHash,
              knowlyticsAiRequirementsHash,
              knowlyticsAiDemoArtifactHash,
              knowlyticsAiSyntheticDocumentCorpusHash,
              knowlyticsAiQuizSpecHash,
              knowlyticsAiMcqFixtureHash,
              knowlyticsAiAnswerKeyHash,
              knowlyticsAiStudentResponseHash,
              knowlyticsAiEvaluatorRubricHash,
              knowlyticsAiRetrievalTraceHash,
              knowlyticsAiGenerationTraceHash,
              knowlyticsAiScoringTraceHash,
              knowlyticsAiPerformanceFeedbackHash,
              knowlyticsAiResultManifestHash,
              knowlyticsAiReplayCommandHash,
              knowlyticsAiCiReceiptHash,
              knowlyticsAiTaskCategories: ["topic_only", "pdf_rag", "self_evaluation"],
              minKnowlyticsAiTaskCategoryCount: 3,
              knowlyticsAiProviderFamilies: ["groq", "google_genai", "langchain", "chroma"],
              minKnowlyticsAiProviderFamilyCount: 4,
              knowlyticsAiQuestionCount: 6,
              minKnowlyticsAiQuestionCount: 4,
              knowlyticsAiAnswerOptionCount: 4,
              minKnowlyticsAiAnswerOptionCount: 4,
              knowlyticsAiDeterministicSeed: 573,
              knowlyticsAiNoLicenseBoundary: true,
              knowlyticsAiNoRawPdfCopyBoundary: true,
              knowlyticsAiSecretPlaceholderReviewed: true,
              knowlyticsAiBaselineQuizScore0to1: 0.68,
              knowlyticsAiCandidateQuizScore0to1: 0.77,
              maxKnowlyticsAiScoreRegression0to1: 0.03,
              knowlyticsAiReplayPassRate0to1: 1,
              minKnowlyticsAiReplayPassRate0to1: 1,
              knowlyticsAiRetrievalCoverage0to1: 0.95,
              minKnowlyticsAiRetrievalCoverage0to1: 0.9,
              knowlyticsAiEvaluatorFeedbackCoverage0to1: 1,
              minKnowlyticsAiEvaluatorFeedbackCoverage0to1: 0.95,
            },
          },
          baseline: {
            score0to1: 0.68,
            evidenceRefs: [
              "trace:baseline-knowlytics-ai",
              "github:Sathyajitanand2004/Knowlytics-AI@0409f18a927138e50b2391d900d562f953a435b8",
            ],
            signedEvidenceRefs: ["ledger:sig-baseline-knowlytics-ai"],
          },
          candidate: {
            score0to1: 0.77,
            evidenceRefs: [
              "trace:candidate-knowlytics-ai",
              "amc-fixture:knowlytics-ai-owned-mcq-rag-smoke",
            ],
            signedEvidenceRefs: ["ledger:sig-candidate-knowlytics-ai"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.agentBenchmarkReplaySummary).toMatchObject({
      rowCount: 1,
      knowlyticsAiReplayRowCount: 1,
      knowlyticsAiTaskCategories: ["topic_only", "pdf_rag", "self_evaluation"],
      knowlyticsAiProviderFamilies: ["groq", "google_genai", "langchain", "chroma"],
      failedKnowlyticsAiReplayRowIds: [],
      totalKnowlyticsAiQuestionCount: 6,
      averageKnowlyticsAiScoreDelta0to1: 0.09,
      averageKnowlyticsAiReplayPassRate0to1: 1,
      averageKnowlyticsAiRetrievalCoverage0to1: 0.95,
      averageKnowlyticsAiEvaluatorFeedbackCoverage0to1: 1,
    });
    expect(result.manifest.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "knowlytics-ai-complete",
      status: "passed",
      agentBenchmarkReplay: {
        knowlyticsAiBenchmarkId: "knowlytics-ai-owned-mcq-rag-smoke",
        knowlyticsAiTaskCategories: ["topic_only", "pdf_rag", "self_evaluation"],
        knowlyticsAiProviderFamilies: ["groq", "google_genai", "langchain", "chroma"],
        knowlyticsAiQuestionCount: 6,
        knowlyticsAiNoLicenseBoundary: true,
        knowlyticsAiNoRawPdfCopyBoundary: true,
        knowlyticsAiSecretPlaceholderReviewed: true,
        knowlyticsAiScoreDelta0to1: 0.09,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      agentBenchmarkReplayRowCount: 1,
      knowlyticsAiReplayRowCount: 1,
      failedKnowlyticsAiReplayRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("Knowlytics-AI Rows: 1");
    expect(markdown).toContain("Knowlytics-AI Task Categories: topic_only, pdf_rag, self_evaluation");
    expect(markdown).toContain("reasoning_trace:knowledge_qa:knowlytics-ai");
  });

  test("fails closed when Knowlytics-AI replay rows lack owned fixtures, traces, or boundary proof", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "knowlytics-ai-replay-corpus",
      sourceRefs: ["https://github.com/Sathyajitanand2004/Knowlytics-AI"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "knowlytics-ai-metadata-only",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            outputArtifactHashes: [artifactHash],
            runtime: {
              kind: "python",
              version: "knowlytics-ai-fixture-2026.06",
              commandHash,
              dependencyHash,
              sandboxProfile: "knowlytics-ai-owned-fixture",
            },
            agentBenchmarkReplay: {
              benchmarkId: "amc-knowlytics-ai-mcq-rag-replay",
              benchmarkVersion: "2026.06.20",
              paperRefHash: knowlyticsAiSourceRefHash,
              repositorySnapshotHash: knowlyticsAiRepositorySnapshotHash,
              datasetManifestHash: knowlyticsAiSyntheticDocumentCorpusHash,
              agentConfigHash: knowlyticsAiEvaluatorRubricHash,
              globalConfigHash: knowlyticsAiQuizSpecHash,
              modelServerConfigHash: knowlyticsAiRequirementsHash,
              environmentManifestHash: knowlyticsAiStreamlitAppHash,
              dependencyLockHash: knowlyticsAiRequirementsHash,
              runCommandHash: commandHash,
              replayCommandHash: knowlyticsAiReplayCommandHash,
              tracePathHash: knowlyticsAiRetrievalTraceHash,
              sampleTraceHash: knowlyticsAiGenerationTraceHash,
              resultManifestHash: knowlyticsAiResultManifestHash,
              metricsReportHash: knowlyticsAiPerformanceFeedbackHash,
              architecture: "reasoning_trace",
              workload: "knowledge_qa",
              deterministicSeed: 573,
              sampleCount: 6,
              minSampleCount: 3,
              shuffled: true,
              traceSaved: true,
              baselineMetric0to1: 0.77,
              candidateMetric0to1: 0.68,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 1,
              traceCoverage0to1: 1,
              minTraceCoverage0to1: 0.95,
              maxScoreRegression0to1: 0.03,
              knowlyticsAiBenchmarkId: "knowlytics-ai-owned-mcq-rag-smoke",
              knowlyticsAiSourceRefHash,
              knowlyticsAiRepositorySnapshotHash: "not-a-hash",
              knowlyticsAiTaskCategories: ["topic_only"],
              minKnowlyticsAiTaskCategoryCount: 3,
              knowlyticsAiProviderFamilies: ["groq"],
              minKnowlyticsAiProviderFamilyCount: 4,
              knowlyticsAiQuestionCount: 2,
              minKnowlyticsAiQuestionCount: 4,
              knowlyticsAiAnswerOptionCount: 2,
              minKnowlyticsAiAnswerOptionCount: 4,
              knowlyticsAiNoLicenseBoundary: false,
              knowlyticsAiNoRawPdfCopyBoundary: false,
              knowlyticsAiSecretPlaceholderReviewed: false,
              knowlyticsAiBaselineQuizScore0to1: 0.77,
              knowlyticsAiCandidateQuizScore0to1: 0.68,
              maxKnowlyticsAiScoreRegression0to1: 0.03,
              knowlyticsAiReplayPassRate0to1: 0.5,
              minKnowlyticsAiReplayPassRate0to1: 1,
              knowlyticsAiRetrievalCoverage0to1: 0.4,
              minKnowlyticsAiRetrievalCoverage0to1: 0.9,
              knowlyticsAiEvaluatorFeedbackCoverage0to1: 0.5,
              minKnowlyticsAiEvaluatorFeedbackCoverage0to1: 0.95,
            },
          },
          baseline: {
            score0to1: 0.77,
            evidenceRefs: ["trace:baseline-knowlytics-ai-missing"],
            signedEvidenceRefs: ["ledger:sig-baseline-knowlytics-ai-missing"],
          },
          candidate: {
            score0to1: 0.68,
            evidenceRefs: ["trace:candidate-knowlytics-ai-missing"],
            signedEvidenceRefs: ["ledger:sig-candidate-knowlytics-ai-missing"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toEqual(expect.arrayContaining([
      "agent benchmark replay knowlytics-ai repository snapshot hash invalid",
      "agent benchmark replay knowlytics-ai no-license boundary hash invalid",
      "agent benchmark replay knowlytics-ai readme blob hash invalid",
      "agent benchmark replay knowlytics-ai rag generator hash invalid",
      "agent benchmark replay knowlytics-ai synthetic document corpus hash invalid",
      "agent benchmark replay knowlytics-ai mcq fixture hash invalid",
      "agent benchmark replay knowlytics-ai answer key hash invalid",
      "agent benchmark replay knowlytics-ai student response hash invalid",
      "agent benchmark replay knowlytics-ai scoring trace hash invalid",
      "agent benchmark replay knowlytics-ai replay command hash invalid",
      "agent benchmark replay knowlytics-ai task category count below threshold",
      "agent benchmark replay knowlytics-ai provider family count below threshold",
      "agent benchmark replay knowlytics-ai question count below threshold",
      "agent benchmark replay knowlytics-ai answer option count below threshold",
      "agent benchmark replay knowlytics-ai deterministic seed missing",
      "agent benchmark replay knowlytics-ai no-license boundary missing",
      "agent benchmark replay knowlytics-ai no-raw-pdf-copy boundary missing",
      "agent benchmark replay knowlytics-ai secret placeholder review missing",
      "agent benchmark replay knowlytics-ai score regression exceeds threshold",
      "agent benchmark replay knowlytics-ai replay pass rate below threshold",
      "agent benchmark replay knowlytics-ai retrieval coverage below threshold",
      "agent benchmark replay knowlytics-ai evaluator feedback coverage below threshold",
    ]));
    expect(result.manifest.agentBenchmarkReplaySummary.failedKnowlyticsAiReplayRowIds).toEqual([
      "knowlytics-ai-metadata-only",
    ]);
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      knowlyticsAiReplayRowCount: 1,
      failedKnowlyticsAiReplayRowIds: ["knowlytics-ai-metadata-only"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "knowlytics-ai-metadata-only",
      severity: "critical",
    });
  });

  test("binds spent-style session cost replay proof into agent benchmark receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "spent-session-cost-replay",
      sourceRefs: ["https://github.com/loplop-h/spent"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "spent-session-cost-complete",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            outputArtifactHashes: [artifactHash],
            runtime: {
              kind: "container",
              version: "spent-0.4.2",
              commandHash,
              dependencyHash,
              sandboxProfile: "spent-session-cost-fixture",
            },
            agentBenchmarkReplay: {
              benchmarkId: "amc-spent-session-cost-replay",
              benchmarkVersion: "2026.06.19",
              paperRefHash: spentSessionCostSourceRefHash,
              repositorySnapshotHash: spentSessionCostRepositorySnapshotHash,
              datasetManifestHash: spentSessionCostJsonlLogManifestHash,
              agentConfigHash: clawAgentAdapterHash,
              globalConfigHash: spentSessionCostClassifierRulesHash,
              modelServerConfigHash: clawMcpServerConfigHash,
              environmentManifestHash: spentSessionCostHookConfigHash,
              dependencyLockHash: dependencyHash,
              runCommandHash: commandHash,
              replayCommandHash: spentSessionCostReplayCommandHash,
              tracePathHash: spentSessionCostCommandTranscriptHash,
              sampleTraceHash: clawAuditLogHash,
              resultManifestHash: spentSessionCostResultManifestHash,
              metricsReportHash: spentSessionCostDashboardExportHash,
              architecture: "reasoning_trace",
              workload: "custom",
              deterministicSeed: 19,
              sampleCount: 4,
              minSampleCount: 3,
              shuffled: true,
              traceSaved: true,
              baselineMetric0to1: 0.7,
              candidateMetric0to1: 0.86,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 1,
              traceCoverage0to1: 1,
              minTraceCoverage0to1: 0.95,
              maxScoreRegression0to1: 0.03,
              spentSessionCostBenchmarkId: "spent-claude-code-cost-smoke",
              spentSessionCostSourceRefHash,
              spentSessionCostRepositorySnapshotHash,
              spentSessionCostLicenseRefHash,
              spentSessionCostHookConfigHash,
              spentSessionCostJsonlLogManifestHash,
              spentSessionCostPricingSnapshotHash,
              spentSessionCostClassifierRulesHash,
              spentSessionCostCommandTranscriptHash,
              spentSessionCostDashboardExportHash,
              spentSessionCostResultManifestHash,
              spentSessionCostReplayCommandHash,
              spentSessionCostCiReceiptHash,
              spentSessionCostPrivacyBoundaryHash,
              spentSessionCostSessionCount: 4,
              minSpentSessionCostSessionCount: 3,
              spentSessionCostToolEventCount: 32,
              minSpentSessionCostToolEventCount: 20,
              spentSessionCostDeterministicSeed: 19,
              spentSessionCostBaselineEfficiency0to1: 0.7,
              spentSessionCostCandidateEfficiency0to1: 0.86,
              maxSpentSessionCostEfficiencyRegression0to1: 0.03,
              spentSessionCostBaselineCostUsd: 0.42,
              spentSessionCostCandidateCostUsd: 0.37,
              maxSpentSessionCostIncreaseUsd: 0.02,
              spentSessionCostReplayPassRate0to1: 1,
              minSpentSessionCostReplayPassRate0to1: 1,
              spentSessionCostClassificationCoverage0to1: 0.97,
              minSpentSessionCostClassificationCoverage0to1: 0.95,
              spentSessionCostJsonExportValid: true,
              spentSessionCostNoTelemetryBoundary: true,
            },
          },
          baseline: {
            score0to1: 0.7,
            evidenceRefs: ["trace:baseline-spent-session-cost"],
            signedEvidenceRefs: ["ledger:sig-baseline-spent-session-cost"],
          },
          candidate: {
            score0to1: 0.86,
            evidenceRefs: ["trace:candidate-spent-session-cost"],
            signedEvidenceRefs: ["ledger:sig-candidate-spent-session-cost"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.agentBenchmarkReplaySummary).toMatchObject({
      rowCount: 1,
      spentSessionCostReplayRowCount: 1,
      failedSpentSessionCostReplayRowIds: [],
      totalSpentSessionCostSessionCount: 4,
      totalSpentSessionCostToolEventCount: 32,
      averageSpentSessionCostEfficiencyDelta0to1: 0.16,
      averageSpentSessionCostCostDeltaUsd: -0.05,
      averageSpentSessionCostReplayPassRate0to1: 1,
      averageSpentSessionCostClassificationCoverage0to1: 0.97,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "spent-session-cost-complete",
      status: "passed",
      agentBenchmarkReplay: {
        spentSessionCostBenchmarkId: "spent-claude-code-cost-smoke",
        spentSessionCostSessionCount: 4,
        spentSessionCostToolEventCount: 32,
        spentSessionCostEfficiencyDelta0to1: 0.16,
        spentSessionCostCostDeltaUsd: -0.05,
        spentSessionCostReplayPassRate0to1: 1,
        spentSessionCostJsonExportValid: true,
        spentSessionCostNoTelemetryBoundary: true,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      agentBenchmarkReplayRowCount: 1,
      spentSessionCostReplayRowCount: 1,
      failedSpentSessionCostReplayRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("Spent Session Cost Rows: 1");
    expect(markdown).toContain("Spent Session Cost Sessions: 4");
    expect(markdown).toContain("reasoning_trace:custom:spent");
  });

  test("fails closed when spent-style session cost replay proof is metadata-only", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "spent-session-cost-replay",
      sourceRefs: ["https://github.com/loplop-h/spent"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "spent-session-cost-metadata-only",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            outputArtifactHashes: [artifactHash],
            runtime: {
              kind: "container",
              version: "spent-0.4.2",
              commandHash,
              dependencyHash,
              sandboxProfile: "spent-session-cost-fixture",
            },
            agentBenchmarkReplay: {
              benchmarkId: "amc-spent-session-cost-replay",
              benchmarkVersion: "2026.06.19",
              paperRefHash: spentSessionCostSourceRefHash,
              repositorySnapshotHash: spentSessionCostRepositorySnapshotHash,
              datasetManifestHash: spentSessionCostJsonlLogManifestHash,
              agentConfigHash: clawAgentAdapterHash,
              globalConfigHash: spentSessionCostClassifierRulesHash,
              modelServerConfigHash: clawMcpServerConfigHash,
              environmentManifestHash: spentSessionCostHookConfigHash,
              dependencyLockHash: dependencyHash,
              runCommandHash: commandHash,
              replayCommandHash: spentSessionCostReplayCommandHash,
              tracePathHash: spentSessionCostCommandTranscriptHash,
              sampleTraceHash: clawAuditLogHash,
              resultManifestHash: spentSessionCostResultManifestHash,
              metricsReportHash: spentSessionCostDashboardExportHash,
              architecture: "reasoning_trace",
              workload: "custom",
              deterministicSeed: 19,
              sampleCount: 4,
              minSampleCount: 3,
              shuffled: true,
              traceSaved: true,
              baselineMetric0to1: 0.86,
              candidateMetric0to1: 0.7,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 1,
              traceCoverage0to1: 1,
              minTraceCoverage0to1: 0.95,
              maxScoreRegression0to1: 0.03,
              spentSessionCostBenchmarkId: "spent-claude-code-cost-smoke",
              spentSessionCostSourceRefHash,
              spentSessionCostRepositorySnapshotHash: "not-a-hash",
              spentSessionCostSessionCount: 1,
              minSpentSessionCostSessionCount: 2,
              spentSessionCostToolEventCount: 3,
              minSpentSessionCostToolEventCount: 10,
              spentSessionCostBaselineEfficiency0to1: 0.86,
              spentSessionCostCandidateEfficiency0to1: 0.7,
              maxSpentSessionCostEfficiencyRegression0to1: 0.03,
              spentSessionCostBaselineCostUsd: 0.2,
              spentSessionCostCandidateCostUsd: 0.3,
              maxSpentSessionCostIncreaseUsd: 0.02,
              spentSessionCostReplayPassRate0to1: 0.5,
              minSpentSessionCostReplayPassRate0to1: 1,
              spentSessionCostClassificationCoverage0to1: 0.4,
              minSpentSessionCostClassificationCoverage0to1: 0.95,
              spentSessionCostJsonExportValid: false,
              spentSessionCostNoTelemetryBoundary: false,
            },
          },
          baseline: {
            score0to1: 0.86,
            evidenceRefs: ["trace:baseline-spent-session-cost-missing"],
            signedEvidenceRefs: ["ledger:sig-baseline-spent-session-cost-missing"],
          },
          candidate: {
            score0to1: 0.7,
            evidenceRefs: ["trace:candidate-spent-session-cost-missing"],
            signedEvidenceRefs: ["ledger:sig-candidate-spent-session-cost-missing"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain(
      "agent benchmark replay spent session cost repository snapshot hash invalid",
    );
    expect(result.manifest.rows[0]?.issues).toContain(
      "agent benchmark replay spent session cost license ref hash invalid",
    );
    expect(result.manifest.rows[0]?.issues).toContain(
      "agent benchmark replay spent session cost jsonl log manifest hash invalid",
    );
    expect(result.manifest.rows[0]?.issues).toContain(
      "agent benchmark replay spent session cost session count below threshold",
    );
    expect(result.manifest.rows[0]?.issues).toContain(
      "agent benchmark replay spent session cost tool event count below threshold",
    );
    expect(result.manifest.rows[0]?.issues).toContain(
      "agent benchmark replay spent session cost deterministic seed missing",
    );
    expect(result.manifest.rows[0]?.issues).toContain(
      "agent benchmark replay spent session cost efficiency regression exceeds threshold",
    );
    expect(result.manifest.rows[0]?.issues).toContain(
      "agent benchmark replay spent session cost cost increase exceeds threshold",
    );
    expect(result.manifest.rows[0]?.issues).toContain(
      "agent benchmark replay spent session cost replay pass rate below threshold",
    );
    expect(result.manifest.rows[0]?.issues).toContain(
      "agent benchmark replay spent session cost classification coverage below threshold",
    );
    expect(result.manifest.rows[0]?.issues).toContain(
      "agent benchmark replay spent session cost json export invalid",
    );
    expect(result.manifest.rows[0]?.issues).toContain(
      "agent benchmark replay spent session cost no-telemetry boundary missing",
    );
    expect(result.manifest.agentBenchmarkReplaySummary.failedSpentSessionCostReplayRowIds).toEqual([
      "spent-session-cost-metadata-only",
    ]);
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      spentSessionCostReplayRowCount: 1,
      failedSpentSessionCostReplayRowIds: ["spent-session-cost-metadata-only"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "spent-session-cost-metadata-only",
      severity: "critical",
    });
  });

  test("binds FIRE-style fact-checking replay proof into agent benchmark receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "fire-fact-checking-replay",
      sourceRefs: [
        "https://github.com/mbzuai-nlp/fire",
        "https://aclanthology.org/2025.findings-naacl.158/",
      ],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "fire-fact-checking-complete",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            outputArtifactHashes: [artifactHash],
            runtime: {
              kind: "container",
              version: "fire-2025.06",
              commandHash,
              dependencyHash,
              sandboxProfile: "fire-fact-checking-fixture",
            },
            agentBenchmarkReplay: {
              benchmarkId: "amc-fire-fact-checking-replay",
              benchmarkVersion: "2026.06.19",
              paperRefHash: firePaperRefHash,
              repositorySnapshotHash: fireRepositorySnapshotHash,
              datasetManifestHash: fireDatasetManifestHash,
              agentConfigHash: clawAgentAdapterHash,
              globalConfigHash: fireDecisionPolicyHash,
              modelServerConfigHash: clawMcpServerConfigHash,
              environmentManifestHash: fireSearchProviderConfigHash,
              dependencyLockHash: dependencyHash,
              runCommandHash: commandHash,
              replayCommandHash: fireReplayCommandHash,
              tracePathHash: fireEvidenceTraceHash,
              sampleTraceHash: fireQueryTraceHash,
              resultManifestHash: fireResultManifestHash,
              metricsReportHash: fireCostReportHash,
              architecture: "reasoning_trace",
              workload: "custom",
              deterministicSeed: 527,
              sampleCount: 6,
              minSampleCount: 5,
              shuffled: true,
              traceSaved: true,
              baselineMetric0to1: 0.78,
              candidateMetric0to1: 0.86,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 1,
              traceCoverage0to1: 1,
              minTraceCoverage0to1: 0.95,
              maxScoreRegression0to1: 0.03,
              fireBenchmarkId: "fire-atomic-claim-smoke",
              fireSourceRefHash,
              fireRepositorySnapshotHash,
              firePaperRefHash,
              fireDatasetManifestHash,
              fireAtomicClaimManifestHash,
              fireRetrieverConfigHash,
              fireVerifierConfigHash,
              fireDecisionPolicyHash,
              fireSearchProviderConfigHash,
              fireEvidenceTraceHash,
              fireQueryTraceHash,
              fireVerificationLabelHash,
              fireCostReportHash,
              fireResultManifestHash,
              fireReplayCommandHash,
              fireCiReceiptHash,
              fireAtomicClaimCount: 6,
              minFireAtomicClaimCount: 5,
              fireRetrievalStepCount: 9,
              minFireRetrievalStepCount: 6,
              fireMaxRetrievalDepth: 3,
              fireDeterministicSeed: 527,
              fireBaselineFactuality0to1: 0.78,
              fireCandidateFactuality0to1: 0.86,
              maxFireFactualityRegression0to1: 0.03,
              fireBaselineLlmCostUsd: 0.76,
              fireCandidateLlmCostUsd: 0.1,
              maxFireLlmCostIncreaseUsd: 0,
              fireBaselineSearchCostUsd: 0.33,
              fireCandidateSearchCostUsd: 0.02,
              maxFireSearchCostIncreaseUsd: 0,
              fireReplayPassRate0to1: 1,
              minFireReplayPassRate0to1: 1,
              fireEvidenceRecall0to1: 0.94,
              minFireEvidenceRecall0to1: 0.9,
              fireLabelAgreement0to1: 0.92,
              minFireLabelAgreement0to1: 0.9,
              fireDynamicRetrievalBoundary: true,
              fireSearchProviderBoundary: true,
            },
          },
          baseline: {
            score0to1: 0.78,
            evidenceRefs: ["trace:baseline-fire-fact-checking"],
            signedEvidenceRefs: ["ledger:sig-baseline-fire-fact-checking"],
          },
          candidate: {
            score0to1: 0.86,
            evidenceRefs: ["trace:candidate-fire-fact-checking"],
            signedEvidenceRefs: ["ledger:sig-candidate-fire-fact-checking"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.agentBenchmarkReplaySummary).toMatchObject({
      rowCount: 1,
      fireFactCheckingReplayRowCount: 1,
      failedFireFactCheckingReplayRowIds: [],
      totalFireAtomicClaimCount: 6,
      totalFireRetrievalStepCount: 9,
      averageFireFactualityDelta0to1: 0.08,
      averageFireLlmCostDeltaUsd: -0.66,
      averageFireSearchCostDeltaUsd: -0.31,
      averageFireReplayPassRate0to1: 1,
      averageFireEvidenceRecall0to1: 0.94,
      averageFireLabelAgreement0to1: 0.92,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "fire-fact-checking-complete",
      status: "passed",
      agentBenchmarkReplay: {
        fireBenchmarkId: "fire-atomic-claim-smoke",
        fireAtomicClaimCount: 6,
        fireRetrievalStepCount: 9,
        fireFactualityDelta0to1: 0.08,
        fireLlmCostDeltaUsd: -0.66,
        fireSearchCostDeltaUsd: -0.31,
        fireReplayPassRate0to1: 1,
        fireDynamicRetrievalBoundary: true,
        fireSearchProviderBoundary: true,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      agentBenchmarkReplayRowCount: 1,
      fireFactCheckingReplayRowCount: 1,
      failedFireFactCheckingReplayRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("FIRE Fact-Checking Rows: 1");
    expect(markdown).toContain("FIRE Atomic Claims: 6");
    expect(markdown).toContain("reasoning_trace:custom:fire");
  });

  test("fails closed when FIRE-style fact-checking replay proof is metadata-only", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "fire-fact-checking-replay",
      sourceRefs: [
        "https://github.com/mbzuai-nlp/fire",
        "https://aclanthology.org/2025.findings-naacl.158/",
      ],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "fire-fact-checking-metadata-only",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            outputArtifactHashes: [artifactHash],
            runtime: {
              kind: "container",
              version: "fire-2025.06",
              commandHash,
              dependencyHash,
              sandboxProfile: "fire-fact-checking-fixture",
            },
            agentBenchmarkReplay: {
              benchmarkId: "amc-fire-fact-checking-replay",
              benchmarkVersion: "2026.06.19",
              paperRefHash: firePaperRefHash,
              repositorySnapshotHash: fireRepositorySnapshotHash,
              datasetManifestHash: fireDatasetManifestHash,
              agentConfigHash: clawAgentAdapterHash,
              globalConfigHash: fireDecisionPolicyHash,
              modelServerConfigHash: clawMcpServerConfigHash,
              environmentManifestHash: fireSearchProviderConfigHash,
              dependencyLockHash: dependencyHash,
              runCommandHash: commandHash,
              replayCommandHash: fireReplayCommandHash,
              tracePathHash: fireEvidenceTraceHash,
              sampleTraceHash: fireQueryTraceHash,
              resultManifestHash: fireResultManifestHash,
              metricsReportHash: fireCostReportHash,
              architecture: "reasoning_trace",
              workload: "custom",
              deterministicSeed: 527,
              sampleCount: 6,
              minSampleCount: 5,
              shuffled: true,
              traceSaved: true,
              baselineMetric0to1: 0.86,
              candidateMetric0to1: 0.7,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 1,
              traceCoverage0to1: 1,
              minTraceCoverage0to1: 0.95,
              maxScoreRegression0to1: 0.03,
              fireBenchmarkId: "fire-atomic-claim-smoke",
              fireSourceRefHash,
              fireRepositorySnapshotHash: "not-a-hash",
              firePaperRefHash,
              fireAtomicClaimCount: 2,
              minFireAtomicClaimCount: 5,
              fireRetrievalStepCount: 2,
              minFireRetrievalStepCount: 6,
              fireBaselineFactuality0to1: 0.86,
              fireCandidateFactuality0to1: 0.7,
              maxFireFactualityRegression0to1: 0.03,
              fireBaselineLlmCostUsd: 0.1,
              fireCandidateLlmCostUsd: 0.2,
              maxFireLlmCostIncreaseUsd: 0.02,
              fireBaselineSearchCostUsd: 0.02,
              fireCandidateSearchCostUsd: 0.1,
              maxFireSearchCostIncreaseUsd: 0.02,
              fireReplayPassRate0to1: 0.5,
              minFireReplayPassRate0to1: 1,
              fireEvidenceRecall0to1: 0.3,
              minFireEvidenceRecall0to1: 0.9,
              fireLabelAgreement0to1: 0.4,
              minFireLabelAgreement0to1: 0.9,
              fireDynamicRetrievalBoundary: false,
              fireSearchProviderBoundary: false,
            },
          },
          baseline: {
            score0to1: 0.86,
            evidenceRefs: ["trace:baseline-fire-fact-checking-missing"],
            signedEvidenceRefs: ["ledger:sig-baseline-fire-fact-checking-missing"],
          },
          candidate: {
            score0to1: 0.7,
            evidenceRefs: ["trace:candidate-fire-fact-checking-missing"],
            signedEvidenceRefs: ["ledger:sig-candidate-fire-fact-checking-missing"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay fire repository snapshot hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay fire dataset manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay fire atomic claim manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay fire atomic claim count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay fire retrieval step count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay fire max retrieval depth missing");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay fire deterministic seed missing");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay fire factuality regression exceeds threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay fire llm cost increase exceeds threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay fire search cost increase exceeds threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay fire replay pass rate below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay fire evidence recall below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay fire label agreement below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay fire dynamic retrieval boundary missing");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay fire search provider boundary missing");
    expect(result.manifest.agentBenchmarkReplaySummary.failedFireFactCheckingReplayRowIds).toEqual([
      "fire-fact-checking-metadata-only",
    ]);
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      fireFactCheckingReplayRowCount: 1,
      failedFireFactCheckingReplayRowIds: ["fire-fact-checking-metadata-only"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "fire-fact-checking-metadata-only",
      severity: "critical",
    });
  });

  test("binds Nuclia-style RAG triad replay proof into agent benchmark receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "nuclia-rag-triad-replay",
      sourceRefs: ["https://github.com/nuclia/nuclia-eval"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "nuclia-rag-triad-complete",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            outputArtifactHashes: [artifactHash],
            runtime: {
              kind: "container",
              version: "nuclia-eval-1.0.3",
              commandHash,
              dependencyHash,
              sandboxProfile: "nuclia-rag-triad-fixture",
            },
            agentBenchmarkReplay: {
              benchmarkId: "amc-nuclia-rag-triad-replay",
              benchmarkVersion: "2026.06.19",
              paperRefHash: nucliaRagTriadSourceRefHash,
              repositorySnapshotHash: nucliaRagTriadRepositorySnapshotHash,
              datasetManifestHash: nucliaRagTriadDatasetManifestHash,
              agentConfigHash: clawAgentAdapterHash,
              globalConfigHash: nucliaRagTriadMetricManifestHash,
              modelServerConfigHash: nucliaRagTriadModelCardRefHash,
              environmentManifestHash: nucliaRagTriadModelCachePolicyHash,
              dependencyLockHash: dependencyHash,
              runCommandHash: commandHash,
              replayCommandHash: nucliaRagTriadReplayCommandHash,
              tracePathHash: nucliaRagTriadAnswerRelevanceTraceHash,
              sampleTraceHash: nucliaRagTriadQaContextManifestHash,
              resultManifestHash: nucliaRagTriadResultManifestHash,
              metricsReportHash: nucliaRagTriadMetricManifestHash,
              architecture: "reasoning_trace",
              workload: "custom",
              deterministicSeed: 528,
              sampleCount: 8,
              minSampleCount: 5,
              shuffled: true,
              traceSaved: true,
              baselineMetric0to1: 0.78,
              candidateMetric0to1: 0.87,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 1,
              traceCoverage0to1: 1,
              minTraceCoverage0to1: 0.95,
              maxScoreRegression0to1: 0.03,
              nucliaRagTriadBenchmarkId: "nuclia-remi-rag-triad-smoke",
              nucliaRagTriadSourceRefHash,
              nucliaRagTriadRepositorySnapshotHash,
              nucliaRagTriadLicenseRefHash,
              nucliaRagTriadPackageVersionHash,
              nucliaRagTriadModelCardRefHash,
              nucliaRagTriadModelCachePolicyHash,
              nucliaRagTriadHfAuthBoundaryHash,
              nucliaRagTriadEvaluatorConfigHash,
              nucliaRagTriadDatasetManifestHash,
              nucliaRagTriadQaContextManifestHash,
              nucliaRagTriadMetricManifestHash,
              nucliaRagTriadAnswerRelevanceTraceHash,
              nucliaRagTriadContextRelevanceTraceHash,
              nucliaRagTriadGroundednessTraceHash,
              nucliaRagTriadResultManifestHash,
              nucliaRagTriadReplayCommandHash,
              nucliaRagTriadCiReceiptHash,
              nucliaRagTriadQueryCount: 8,
              minNucliaRagTriadQueryCount: 5,
              nucliaRagTriadContextPieceCount: 24,
              minNucliaRagTriadContextPieceCount: 15,
              nucliaRagTriadMetricCount: 3,
              minNucliaRagTriadMetricCount: 3,
              nucliaRagTriadDeterministicSeed: 528,
              nucliaRagTriadBaselineAnswerRelevance0to1: 0.82,
              nucliaRagTriadCandidateAnswerRelevance0to1: 0.9,
              minNucliaRagTriadAnswerRelevance0to1: 0.8,
              nucliaRagTriadBaselineContextRelevance0to1: 0.8,
              nucliaRagTriadCandidateContextRelevance0to1: 0.86,
              minNucliaRagTriadContextRelevance0to1: 0.75,
              nucliaRagTriadBaselineGroundedness0to1: 0.79,
              nucliaRagTriadCandidateGroundedness0to1: 0.88,
              minNucliaRagTriadGroundedness0to1: 0.75,
              nucliaRagTriadBaselineComposite0to1: 0.78,
              nucliaRagTriadCandidateComposite0to1: 0.87,
              maxNucliaRagTriadCompositeRegression0to1: 0.03,
              nucliaRagTriadReplayPassRate0to1: 1,
              minNucliaRagTriadReplayPassRate0to1: 1,
              nucliaRagTriadModelAccessBoundary: true,
              nucliaRagTriadNoRawContextCopyBoundary: true,
            },
          },
          baseline: {
            score0to1: 0.78,
            evidenceRefs: ["trace:baseline-nuclia-rag-triad"],
            signedEvidenceRefs: ["ledger:sig-baseline-nuclia-rag-triad"],
          },
          candidate: {
            score0to1: 0.87,
            evidenceRefs: ["trace:candidate-nuclia-rag-triad"],
            signedEvidenceRefs: ["ledger:sig-candidate-nuclia-rag-triad"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.agentBenchmarkReplaySummary).toMatchObject({
      rowCount: 1,
      nucliaRagTriadReplayRowCount: 1,
      failedNucliaRagTriadReplayRowIds: [],
      totalNucliaRagTriadQueryCount: 8,
      totalNucliaRagTriadContextPieceCount: 24,
      averageNucliaRagTriadAnswerRelevance0to1: 0.9,
      averageNucliaRagTriadContextRelevance0to1: 0.86,
      averageNucliaRagTriadGroundedness0to1: 0.88,
      averageNucliaRagTriadCompositeDelta0to1: 0.09,
      averageNucliaRagTriadReplayPassRate0to1: 1,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "nuclia-rag-triad-complete",
      status: "passed",
      agentBenchmarkReplay: {
        nucliaRagTriadBenchmarkId: "nuclia-remi-rag-triad-smoke",
        nucliaRagTriadQueryCount: 8,
        nucliaRagTriadContextPieceCount: 24,
        nucliaRagTriadMetricCount: 3,
        nucliaRagTriadCompositeDelta0to1: 0.09,
        nucliaRagTriadReplayPassRate0to1: 1,
        nucliaRagTriadModelAccessBoundary: true,
        nucliaRagTriadNoRawContextCopyBoundary: true,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      agentBenchmarkReplayRowCount: 1,
      nucliaRagTriadReplayRowCount: 1,
      failedNucliaRagTriadReplayRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("Nuclia RAG Triad Rows: 1");
    expect(markdown).toContain("Nuclia RAG Triad Queries: 8");
    expect(markdown).toContain("reasoning_trace:custom:nuclia-rag-triad");
  });

  test("fails closed when Nuclia-style RAG triad replay proof is metadata-only", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "nuclia-rag-triad-replay",
      sourceRefs: ["https://github.com/nuclia/nuclia-eval"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "nuclia-rag-triad-metadata-only",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            outputArtifactHashes: [artifactHash],
            runtime: {
              kind: "container",
              version: "nuclia-eval-1.0.3",
              commandHash,
              dependencyHash,
              sandboxProfile: "nuclia-rag-triad-fixture",
            },
            agentBenchmarkReplay: {
              benchmarkId: "amc-nuclia-rag-triad-replay",
              benchmarkVersion: "2026.06.19",
              paperRefHash: nucliaRagTriadSourceRefHash,
              repositorySnapshotHash: nucliaRagTriadRepositorySnapshotHash,
              datasetManifestHash: nucliaRagTriadDatasetManifestHash,
              agentConfigHash: clawAgentAdapterHash,
              globalConfigHash: nucliaRagTriadMetricManifestHash,
              modelServerConfigHash: nucliaRagTriadModelCardRefHash,
              environmentManifestHash: nucliaRagTriadModelCachePolicyHash,
              dependencyLockHash: dependencyHash,
              runCommandHash: commandHash,
              replayCommandHash: nucliaRagTriadReplayCommandHash,
              tracePathHash: nucliaRagTriadAnswerRelevanceTraceHash,
              sampleTraceHash: nucliaRagTriadQaContextManifestHash,
              resultManifestHash: nucliaRagTriadResultManifestHash,
              metricsReportHash: nucliaRagTriadMetricManifestHash,
              architecture: "reasoning_trace",
              workload: "custom",
              deterministicSeed: 528,
              sampleCount: 8,
              minSampleCount: 5,
              shuffled: true,
              traceSaved: true,
              baselineMetric0to1: 0.87,
              candidateMetric0to1: 0.7,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 1,
              traceCoverage0to1: 1,
              minTraceCoverage0to1: 0.95,
              maxScoreRegression0to1: 0.03,
              nucliaRagTriadBenchmarkId: "nuclia-remi-rag-triad-smoke",
              nucliaRagTriadSourceRefHash,
              nucliaRagTriadRepositorySnapshotHash: "not-a-hash",
              nucliaRagTriadQueryCount: 2,
              minNucliaRagTriadQueryCount: 5,
              nucliaRagTriadContextPieceCount: 4,
              minNucliaRagTriadContextPieceCount: 15,
              nucliaRagTriadMetricCount: 2,
              minNucliaRagTriadMetricCount: 3,
              nucliaRagTriadCandidateAnswerRelevance0to1: 0.4,
              minNucliaRagTriadAnswerRelevance0to1: 0.8,
              nucliaRagTriadCandidateContextRelevance0to1: 0.5,
              minNucliaRagTriadContextRelevance0to1: 0.75,
              nucliaRagTriadCandidateGroundedness0to1: 0.45,
              minNucliaRagTriadGroundedness0to1: 0.75,
              nucliaRagTriadBaselineComposite0to1: 0.87,
              nucliaRagTriadCandidateComposite0to1: 0.7,
              maxNucliaRagTriadCompositeRegression0to1: 0.03,
              nucliaRagTriadReplayPassRate0to1: 0.5,
              minNucliaRagTriadReplayPassRate0to1: 1,
              nucliaRagTriadModelAccessBoundary: false,
              nucliaRagTriadNoRawContextCopyBoundary: false,
            },
          },
          baseline: {
            score0to1: 0.87,
            evidenceRefs: ["trace:baseline-nuclia-rag-triad-missing"],
            signedEvidenceRefs: ["ledger:sig-baseline-nuclia-rag-triad-missing"],
          },
          candidate: {
            score0to1: 0.7,
            evidenceRefs: ["trace:candidate-nuclia-rag-triad-missing"],
            signedEvidenceRefs: ["ledger:sig-candidate-nuclia-rag-triad-missing"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain(
      "agent benchmark replay nuclia rag triad repository snapshot hash invalid",
    );
    expect(result.manifest.rows[0]?.issues).toContain(
      "agent benchmark replay nuclia rag triad license ref hash invalid",
    );
    expect(result.manifest.rows[0]?.issues).toContain(
      "agent benchmark replay nuclia rag triad model card ref hash invalid",
    );
    expect(result.manifest.rows[0]?.issues).toContain(
      "agent benchmark replay nuclia rag triad query count below threshold",
    );
    expect(result.manifest.rows[0]?.issues).toContain(
      "agent benchmark replay nuclia rag triad context piece count below threshold",
    );
    expect(result.manifest.rows[0]?.issues).toContain(
      "agent benchmark replay nuclia rag triad metric count below threshold",
    );
    expect(result.manifest.rows[0]?.issues).toContain(
      "agent benchmark replay nuclia rag triad deterministic seed missing",
    );
    expect(result.manifest.rows[0]?.issues).toContain(
      "agent benchmark replay nuclia rag triad baseline answer relevance missing",
    );
    expect(result.manifest.rows[0]?.issues).toContain(
      "agent benchmark replay nuclia rag triad answer relevance below threshold",
    );
    expect(result.manifest.rows[0]?.issues).toContain(
      "agent benchmark replay nuclia rag triad context relevance below threshold",
    );
    expect(result.manifest.rows[0]?.issues).toContain(
      "agent benchmark replay nuclia rag triad groundedness below threshold",
    );
    expect(result.manifest.rows[0]?.issues).toContain(
      "agent benchmark replay nuclia rag triad composite regression exceeds threshold",
    );
    expect(result.manifest.rows[0]?.issues).toContain(
      "agent benchmark replay nuclia rag triad replay pass rate below threshold",
    );
    expect(result.manifest.rows[0]?.issues).toContain(
      "agent benchmark replay nuclia rag triad model access boundary missing",
    );
    expect(result.manifest.rows[0]?.issues).toContain(
      "agent benchmark replay nuclia rag triad no raw context copy boundary missing",
    );
    expect(result.manifest.agentBenchmarkReplaySummary.failedNucliaRagTriadReplayRowIds).toEqual([
      "nuclia-rag-triad-metadata-only",
    ]);
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      nucliaRagTriadReplayRowCount: 1,
      failedNucliaRagTriadReplayRowIds: ["nuclia-rag-triad-metadata-only"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "nuclia-rag-triad-metadata-only",
      severity: "critical",
    });
  });

  test("binds edge AI agent replay proof into agent benchmark replay receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "edge-ai-agent-replay",
      sourceRefs: ["https://github.com/yh-yao/awesome-edge-ai-agents"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "edge-ai-agent-complete",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            outputArtifactHashes: [artifactHash],
            runtime: {
              kind: "container",
              version: "edge-runtime-2026.06",
              commandHash,
              dependencyHash,
              sandboxProfile: "edge-ai-agent-fixture",
            },
            agentBenchmarkReplay: {
              benchmarkId: "amc-edge-ai-agent-replay",
              benchmarkVersion: "2026.06.15",
              paperRefHash: logicPaperRefHash,
              repositorySnapshotHash: edgeAiRepositorySnapshotHash,
              datasetManifestHash: edgeAiBenchmarkDatasetHash,
              agentConfigHash: clawAgentAdapterHash,
              globalConfigHash: clawTaskConfigSchemaHash,
              modelServerConfigHash: clawMcpServerConfigHash,
              environmentManifestHash: edgeAiDeviceProfileHash,
              dependencyLockHash: dependencyHash,
              runCommandHash: commandHash,
              replayCommandHash: edgeAiReplayCommandHash,
              tracePathHash: clawTrajectoryCaptureHash,
              sampleTraceHash: clawAuditLogHash,
              resultManifestHash: clawVerificationConfigHash,
              metricsReportHash: edgeAiMetricsReportHash,
              architecture: "reasoning_trace",
              workload: "custom",
              deterministicSeed: 18,
              sampleCount: 4,
              minSampleCount: 4,
              shuffled: true,
              traceSaved: true,
              baselineMetric0to1: 0.76,
              candidateMetric0to1: 0.84,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 1,
              traceCoverage0to1: 1,
              minTraceCoverage0to1: 0.95,
              maxScoreRegression0to1: 0.05,
              edgeAiBenchmarkId: "amc-edge-ai-agent-smoke",
              edgeAiSourceRefHash,
              edgeAiRepositorySnapshotHash,
              edgeAiLicenseRefHash,
              edgeAiDeviceProfileHash,
              edgeAiRuntimeManifestHash,
              edgeAiOptimizationManifestHash,
              edgeAiBenchmarkDatasetHash,
              edgeAiTaskManifestHash,
              edgeAiAppScenarioHash,
              edgeAiReplayCommandHash,
              edgeAiMetricsReportHash,
              edgeAiDeviceClasses: ["mobile", "embedded"],
              minEdgeAiDeviceClassCount: 2,
              edgeAiModalities: ["text", "image", "speech"],
              minEdgeAiModalityCount: 3,
              edgeAiRuntimeKinds: ["local_llm", "mobile_ml", "accelerated_runtime"],
              minEdgeAiRuntimeKindCount: 3,
              edgeAiOnDeviceOnly: true,
              edgeAiOfflineCapable: true,
              edgeAiPrivacyBoundaryPreserved: true,
              edgeAiLatencyMsP95: 420,
              maxEdgeAiLatencyMsP95: 750,
              edgeAiMemoryMbP95: 384,
              maxEdgeAiMemoryMbP95: 512,
              edgeAiEnergyJoulesPerTask: 12,
              maxEdgeAiEnergyJoulesPerTask: 20,
              edgeAiAccuracy0to1: 0.87,
              minEdgeAiAccuracy0to1: 0.8,
              edgeAiReplayPassRate0to1: 1,
              minEdgeAiReplayPassRate0to1: 1,
              edgeAiScoreDelta0to1: 0.08,
              minEdgeAiScoreDelta0to1: 0,
            },
          },
          baseline: {
            score0to1: 0.76,
            evidenceRefs: ["trace:baseline-edge-ai-agent"],
            signedEvidenceRefs: ["ledger:sig-baseline-edge-ai-agent"],
          },
          candidate: {
            score0to1: 0.84,
            evidenceRefs: ["trace:candidate-edge-ai-agent"],
            signedEvidenceRefs: ["ledger:sig-candidate-edge-ai-agent"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.agentBenchmarkReplaySummary).toMatchObject({
      rowCount: 1,
      edgeAiAgentRowCount: 1,
      edgeAiDeviceClasses: ["mobile", "embedded"],
      edgeAiModalities: ["text", "image", "speech"],
      edgeAiRuntimeKinds: ["local_llm", "mobile_ml", "accelerated_runtime"],
      failedEdgeAiAgentRowIds: [],
      averageEdgeAiLatencyMsP95: 420,
      averageEdgeAiMemoryMbP95: 384,
      averageEdgeAiEnergyJoulesPerTask: 12,
      averageEdgeAiAccuracy0to1: 0.87,
      averageEdgeAiReplayPassRate0to1: 1,
      averageEdgeAiScoreDelta0to1: 0.08,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "edge-ai-agent-complete",
      status: "passed",
      agentBenchmarkReplay: {
        edgeAiBenchmarkId: "amc-edge-ai-agent-smoke",
        edgeAiDeviceClasses: ["mobile", "embedded"],
        edgeAiModalities: ["text", "image", "speech"],
        edgeAiRuntimeKinds: ["local_llm", "mobile_ml", "accelerated_runtime"],
        edgeAiOnDeviceOnly: true,
        edgeAiReplayPassRate0to1: 1,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      agentBenchmarkReplayRowCount: 1,
      edgeAiAgentRowCount: 1,
      failedEdgeAiAgentRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("Edge AI Agent Rows: 1");
    expect(markdown).toContain("Edge AI Device Classes: mobile, embedded");
    expect(markdown).toContain("Edge AI Runtime Kinds: local_llm, mobile_ml, accelerated_runtime");
    expect(markdown).toContain("reasoning_trace:custom:edgeai");
  });

  test("fails closed when edge AI agent replay proof is incomplete", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "edge-ai-agent-replay",
      sourceRefs: ["https://github.com/yh-yao/awesome-edge-ai-agents"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "edge-ai-agent-missing-proof",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            outputArtifactHashes: [artifactHash],
            runtime: {
              kind: "container",
              version: "edge-runtime-2026.06",
              commandHash,
              dependencyHash,
              sandboxProfile: "edge-ai-agent-fixture",
            },
            agentBenchmarkReplay: {
              benchmarkId: "amc-edge-ai-agent-replay",
              benchmarkVersion: "2026.06.15",
              paperRefHash: logicPaperRefHash,
              repositorySnapshotHash: edgeAiRepositorySnapshotHash,
              datasetManifestHash: edgeAiBenchmarkDatasetHash,
              agentConfigHash: clawAgentAdapterHash,
              globalConfigHash: clawTaskConfigSchemaHash,
              modelServerConfigHash: clawMcpServerConfigHash,
              environmentManifestHash: edgeAiDeviceProfileHash,
              dependencyLockHash: dependencyHash,
              runCommandHash: commandHash,
              replayCommandHash: edgeAiReplayCommandHash,
              tracePathHash: clawTrajectoryCaptureHash,
              sampleTraceHash: clawAuditLogHash,
              resultManifestHash: clawVerificationConfigHash,
              metricsReportHash: edgeAiMetricsReportHash,
              architecture: "reasoning_trace",
              workload: "custom",
              deterministicSeed: 18,
              sampleCount: 4,
              minSampleCount: 4,
              shuffled: true,
              traceSaved: true,
              baselineMetric0to1: 0.84,
              candidateMetric0to1: 0.79,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 1,
              traceCoverage0to1: 1,
              minTraceCoverage0to1: 0.95,
              maxScoreRegression0to1: 0.05,
              edgeAiBenchmarkId: "amc-edge-ai-agent-smoke",
              edgeAiSourceRefHash,
              edgeAiDeviceClasses: ["mobile"],
              minEdgeAiDeviceClassCount: 2,
              edgeAiModalities: ["text"],
              minEdgeAiModalityCount: 2,
              edgeAiRuntimeKinds: [],
              minEdgeAiRuntimeKindCount: 1,
              edgeAiOnDeviceOnly: false,
              edgeAiOfflineCapable: false,
              edgeAiPrivacyBoundaryPreserved: false,
              edgeAiLatencyMsP95: 1500,
              maxEdgeAiLatencyMsP95: 750,
              edgeAiMemoryMbP95: 1024,
              maxEdgeAiMemoryMbP95: 512,
              edgeAiEnergyJoulesPerTask: 30,
              maxEdgeAiEnergyJoulesPerTask: 20,
              edgeAiAccuracy0to1: 0.5,
              minEdgeAiAccuracy0to1: 0.8,
              edgeAiReplayPassRate0to1: 0.5,
              minEdgeAiReplayPassRate0to1: 1,
              edgeAiScoreDelta0to1: -0.05,
              minEdgeAiScoreDelta0to1: 0,
            },
          },
          baseline: {
            score0to1: 0.84,
            evidenceRefs: ["trace:baseline-edge-ai-agent-missing"],
            signedEvidenceRefs: ["ledger:sig-baseline-edge-ai-agent-missing"],
          },
          candidate: {
            score0to1: 0.79,
            evidenceRefs: ["trace:candidate-edge-ai-agent-missing"],
            signedEvidenceRefs: ["ledger:sig-candidate-edge-ai-agent-missing"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay edgeai repository snapshot hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay edgeai device profile hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay edgeai device class count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay edgeai runtime kind missing");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay edgeai on-device execution disabled");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay edgeai latency p95 above threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay edgeai energy per task above threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay edgeai accuracy below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay edgeai replay pass rate below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("agent benchmark replay edgeai score delta below threshold");
    expect(result.manifest.agentBenchmarkReplaySummary.failedEdgeAiAgentRowIds).toEqual([
      "edge-ai-agent-missing-proof",
    ]);
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      edgeAiAgentRowCount: 1,
      failedEdgeAiAgentRowIds: ["edge-ai-agent-missing-proof"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "edge-ai-agent-missing-proof",
      severity: "critical",
    });
  });

  test("binds DeepMath-style math-agent sandbox, GRPO, vLLM, and benchmark replay proof", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "deepmath-math-agent-replay",
      sourceRefs: ["https://github.com/IntelLabs/DeepMath"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "deepmath-complete",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            outputArtifactHashes: [artifactHash],
            runtime: {
              kind: "python",
              version: "3.13",
              commandHash,
              dependencyHash,
              sandboxProfile: "math-agent-no-io-no-network-timeout",
            },
            deepMathAgentReplay: {
              benchmarkId: "intellabs-deepmath",
              benchmarkVersion: "2026.06.14",
              repositorySnapshotHash: artifactHash,
              sourceRefHash: logicPaperRefHash,
              modelConfigHash: scienceModelRegistryHash,
              baseModelRefHash: ltmModelInterfaceHash,
              grpoConfigHash: mlDevHydraOverrideHash,
              vllmConfigHash: clawMcpServerConfigHash,
              agentInterfaceHash: clawAgentAdapterHash,
              sandboxPolicyHash: toolSandboxRegistryHash,
              executorAllowlistHash: toolSandboxDependencyGraphHash,
              fewshotTraceHash: ltmConversationTraceHash,
              datasetManifestHash: clawDatasetVersionHash,
              evaluationScriptHash: mlDevValidationScriptHash,
              inferenceRunConfigHash: mlDevTaskConfigHash,
              trainingRunConfigHash: mlDevCalipersConfigHash,
              generatedOutputJsonlHash: mlDevReportArtifactHash,
              metricsReportHash: clawScoringRubricHash,
              replayCommandHash: clawReplayCommandHash,
              deterministicSeed: 42,
              datasetFamily: "math500",
              runMode: "agent_grpo",
              sampleCount: 64,
              minSampleCount: 16,
              majorityAt16Accuracy0to1: 0.84,
              minMajorityAt16Accuracy0to1: 0.8,
              exactAnswerAccuracy0to1: 0.78,
              minExactAnswerAccuracy0to1: 0.75,
              codeSnippetUseRate0to1: 0.91,
              minCodeSnippetUseRate0to1: 0.85,
              sandboxViolationRate0to1: 0,
              maxSandboxViolationRate0to1: 0,
              executionTimeoutRate0to1: 0.01,
              maxExecutionTimeoutRate0to1: 0.02,
              meanOutputTokenReduction0to1: 0.44,
              minMeanOutputTokenReduction0to1: 0.35,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 1,
              scoreDelta0to1: 0.12,
              maxScoreRegression0to1: 0.05,
            },
          },
          baseline: {
            score0to1: 0.72,
            evidenceRefs: ["trace:baseline-deepmath"],
            signedEvidenceRefs: ["ledger:sig-baseline-deepmath"],
          },
          candidate: {
            score0to1: 0.84,
            evidenceRefs: ["trace:candidate-deepmath"],
            signedEvidenceRefs: ["ledger:sig-candidate-deepmath"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.deepMathAgentReplaySummary).toMatchObject({
      rowCount: 1,
      benchmarkIds: ["intellabs-deepmath"],
      datasetFamilies: ["math500"],
      runModes: ["agent_grpo"],
      failedRowIds: [],
      totalSampleCount: 64,
      averageMajorityAt16Accuracy0to1: 0.84,
      averageExactAnswerAccuracy0to1: 0.78,
      averageCodeSnippetUseRate0to1: 0.91,
      maxSandboxViolationRate0to1: 0,
      averageMeanOutputTokenReduction0to1: 0.44,
      averageReplayPassRate0to1: 1,
      averageScoreDelta0to1: 0.12,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "deepmath-complete",
      status: "passed",
      deepMathAgentReplay: {
        benchmarkId: "intellabs-deepmath",
        datasetFamily: "math500",
        runMode: "agent_grpo",
        sampleCount: 64,
        majorityAt16Accuracy0to1: 0.84,
        replayPassRate0to1: 1,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      deepMathAgentReplayRowCount: 1,
      failedDeepMathAgentReplayRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("DeepMath Agent Replay Rows: 1");
    expect(markdown).toContain("DeepMath Agent Datasets: math500");
    expect(markdown).toContain("agent_grpo:math500:1");
  });

  test("fails closed when DeepMath-style replay rows lack sandbox, dataset, or metrics proof", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "deepmath-math-agent-replay",
      sourceRefs: ["https://github.com/IntelLabs/DeepMath"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "deepmath-missing-proof",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            runtime: {
              kind: "python",
              version: "3.13",
              commandHash: "not-a-hash",
              dependencyHash,
            },
            deepMathAgentReplay: {
              benchmarkId: "intellabs-deepmath",
              benchmarkVersion: "2026.06.14",
              datasetFamily: "math500",
              runMode: "agent_grpo",
              sampleCount: 4,
              minSampleCount: 16,
              majorityAt16Accuracy0to1: 0.7,
              minMajorityAt16Accuracy0to1: 0.8,
              exactAnswerAccuracy0to1: 0.68,
              minExactAnswerAccuracy0to1: 0.75,
              codeSnippetUseRate0to1: 0.5,
              minCodeSnippetUseRate0to1: 0.85,
              sandboxViolationRate0to1: 0.03,
              maxSandboxViolationRate0to1: 0,
              executionTimeoutRate0to1: 0.12,
              maxExecutionTimeoutRate0to1: 0.02,
              meanOutputTokenReduction0to1: 0.1,
              minMeanOutputTokenReduction0to1: 0.35,
              replayPassRate0to1: 0.75,
              minReplayPassRate0to1: 1,
              scoreDelta0to1: -0.08,
              maxScoreRegression0to1: 0.05,
            },
          },
          baseline: {
            score0to1: 0.82,
            evidenceRefs: ["trace:baseline-deepmath-missing"],
            signedEvidenceRefs: ["ledger:sig-baseline-deepmath-missing"],
          },
          candidate: {
            score0to1: 0.74,
            evidenceRefs: ["trace:candidate-deepmath-missing"],
            signedEvidenceRefs: ["ledger:sig-candidate-deepmath-missing"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("deepmath agent replay repository snapshot hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("deepmath agent replay source ref hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("deepmath agent replay sandbox policy hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("deepmath agent replay executor allowlist hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("deepmath agent replay dataset manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("deepmath agent replay replay command hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("deepmath agent replay sample count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("deepmath agent replay majority@16 accuracy below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("deepmath agent replay exact answer accuracy below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("deepmath agent replay code snippet use below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("deepmath agent replay sandbox violation rate above threshold");
    expect(result.manifest.rows[0]?.issues).toContain("deepmath agent replay execution timeout rate above threshold");
    expect(result.manifest.rows[0]?.issues).toContain("deepmath agent replay output token reduction below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("deepmath agent replay replay pass rate below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("deepmath agent replay score regression exceeds threshold");
    expect(result.manifest.deepMathAgentReplaySummary.failedRowIds).toEqual(["deepmath-missing-proof"]);
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      deepMathAgentReplayRowCount: 1,
      failedDeepMathAgentReplayRowIds: ["deepmath-missing-proof"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "deepmath-missing-proof",
      severity: "critical",
    });
  });

  test("binds JudgeIt-style LLM-as-judge eval datasets, human-alignment metrics, and replay commands into receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "judgeit-llm-as-judge-replay",
      sourceRefs: ["https://github.com/ibm-self-serve-assets/JudgeIt-LLM-as-a-Judge"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "judgeit-complete",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            judgeItReplay: {
              benchmarkId: "ibm-judgeit",
              benchmarkVersion: "v1.1",
              repositorySnapshotHash: judgeItRepositorySnapshotHash,
              datasetManifestHash: judgeItDatasetManifestHash,
              goldenTextManifestHash: judgeItGoldenTextManifestHash,
              generatedTextManifestHash: judgeItGeneratedTextManifestHash,
              pipelineConfigHash: judgeItPipelineConfigHash,
              judgeModelConfigHash: judgeItJudgeModelConfigHash,
              judgePromptRubricHash: judgeItRubricHash,
              humanEvalReferenceHash: judgeItHumanEvalReferenceHash,
              evaluationConfigHash: judgeItEvaluationConfigHash,
              batchRunConfigHash: judgeItBatchRunConfigHash,
              resultExportHash: judgeItResultExportHash,
              metricsReportHash: judgeItMetricsReportHash,
              replayCommandHash: judgeItReplayCommandHash,
              deterministicSeed: 456,
              pipelineType: "rag",
              scoringMode: "binary_similarity",
              sampleCount: 24,
              minSampleCount: 8,
              baselineMetric0to1: 0.74,
              candidateMetric0to1: 0.88,
              scoreDelta0to1: 0.14,
              maxScoreRegression0to1: 0.03,
              precision0to1: 0.92,
              minPrecision0to1: 0.85,
              recall0to1: 0.89,
              minRecall0to1: 0.84,
              f10to1: 0.9,
              minF10to1: 0.85,
              humanAgreementF10to1: 0.91,
              minHumanAgreementF10to1: 0.86,
              falseNegativeRate0to1: 0.03,
              maxFalseNegativeRate0to1: 0.08,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 1,
              blackboxScore0to1: 0.87,
              minBlackboxScore0to1: 0.8,
              whiteboxTraceValid: true,
              negativeTestingHarmfulRate0to1: 0,
              maxNegativeTestingHarmfulRate0to1: 0.02,
            },
          },
          baseline: {
            score0to1: 0.74,
            evidenceRefs: ["trace:baseline-judgeit"],
            signedEvidenceRefs: ["ledger:sig-baseline-judgeit"],
          },
          candidate: {
            score0to1: 0.88,
            evidenceRefs: ["trace:candidate-judgeit"],
            signedEvidenceRefs: ["ledger:sig-candidate-judgeit"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.judgeItReplaySummary).toMatchObject({
      rowCount: 1,
      benchmarkIds: ["ibm-judgeit"],
      pipelineTypes: ["rag"],
      scoringModes: ["binary_similarity"],
      failedRowIds: [],
      totalSampleCount: 24,
      averageCandidateMetric0to1: 0.88,
      averageF10to1: 0.9,
      averageHumanAgreementF10to1: 0.91,
      maxFalseNegativeRate0to1: 0.03,
      averageReplayPassRate0to1: 1,
      agenticWorkflowRowCount: 1,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "judgeit-complete",
      status: "passed",
      judgeItReplay: {
        benchmarkId: "ibm-judgeit",
        pipelineType: "rag",
        scoringMode: "binary_similarity",
        sampleCount: 24,
        f10to1: 0.9,
        replayPassRate0to1: 1,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      judgeItReplayRowCount: 1,
      failedJudgeItReplayRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("JudgeIt Replay Rows: 1");
    expect(markdown).toContain("JudgeIt Pipeline Types: rag");
    expect(markdown).toContain("ibm-judgeit:rag:1");
  });

  test("fails closed when JudgeIt-style replay rows lack dataset, judge, export, or human-alignment proof", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "judgeit-llm-as-judge-replay",
      sourceRefs: ["https://github.com/ibm-self-serve-assets/JudgeIt-LLM-as-a-Judge"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "judgeit-missing-proof",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            judgeItReplay: {
              benchmarkId: "ibm-judgeit",
              benchmarkVersion: "v1.1",
              pipelineType: "rag",
              scoringMode: "binary_similarity",
              sampleCount: 3,
              minSampleCount: 8,
              baselineMetric0to1: 0.78,
              candidateMetric0to1: 0.7,
              scoreDelta0to1: -0.08,
              maxScoreRegression0to1: 0.03,
              precision0to1: 0.8,
              minPrecision0to1: 0.85,
              recall0to1: 0.77,
              minRecall0to1: 0.84,
              f10to1: 0.78,
              minF10to1: 0.85,
              humanAgreementF10to1: 0.72,
              minHumanAgreementF10to1: 0.86,
              falseNegativeRate0to1: 0.14,
              maxFalseNegativeRate0to1: 0.08,
              replayPassRate0to1: 0.75,
              minReplayPassRate0to1: 1,
              blackboxScore0to1: 0.76,
              minBlackboxScore0to1: 0.8,
              whiteboxTraceValid: false,
              negativeTestingHarmfulRate0to1: 0.05,
              maxNegativeTestingHarmfulRate0to1: 0.02,
            },
          },
          baseline: {
            score0to1: 0.78,
            evidenceRefs: ["trace:baseline-judgeit-missing"],
            signedEvidenceRefs: ["ledger:sig-baseline-judgeit-missing"],
          },
          candidate: {
            score0to1: 0.7,
            evidenceRefs: ["trace:candidate-judgeit-missing"],
            signedEvidenceRefs: ["ledger:sig-candidate-judgeit-missing"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("judgeit replay repository snapshot hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("judgeit replay dataset manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("judgeit replay golden text manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("judgeit replay generated text manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("judgeit replay judge model config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("judgeit replay judge prompt rubric hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("judgeit replay human eval reference hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("judgeit replay result export hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("judgeit replay metrics report hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("judgeit replay replay command hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("judgeit replay sample count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("judgeit replay precision below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("judgeit replay recall below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("judgeit replay f1 below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("judgeit replay human agreement f1 below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("judgeit replay false negative rate above threshold");
    expect(result.manifest.rows[0]?.issues).toContain("judgeit replay replay pass rate below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("judgeit replay blackbox score below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("judgeit replay whitebox trace invalid");
    expect(result.manifest.rows[0]?.issues).toContain("judgeit replay negative testing harmful rate above threshold");
    expect(result.manifest.rows[0]?.issues).toContain("judgeit replay score regression exceeds threshold");
    expect(result.manifest.judgeItReplaySummary.failedRowIds).toEqual(["judgeit-missing-proof"]);
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      judgeItReplayRowCount: 1,
      failedJudgeItReplayRowIds: ["judgeit-missing-proof"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "judgeit-missing-proof",
      severity: "critical",
    });
  });

  test("binds FreshStack-style IR/RAG retrieval datasets, qrels, runfiles, and replay metrics into receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "freshstack-ir-rag-replay",
      sourceRefs: ["https://github.com/fresh-stack/freshstack"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "freshstack-complete",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            freshStackRetrieval: {
              benchmarkId: "freshstack",
              benchmarkVersion: "oct-2024",
              repositorySnapshotHash: freshStackRepositorySnapshotHash,
              paperRefHash: freshStackPaperRefHash,
              queryDatasetHash: freshStackQueryDatasetHash,
              corpusDatasetHash: freshStackCorpusDatasetHash,
              stackOverflowQueryManifestHash: freshStackStackOverflowQueryManifestHash,
              githubCorpusManifestHash: freshStackGithubCorpusManifestHash,
              datasetLicenseRefHash: freshStackDatasetLicenseHash,
              codeLicenseRefHash: freshStackCodeLicenseHash,
              beirFormatManifestHash: freshStackBeirFormatManifestHash,
              nuggetQrelsHash: freshStackNuggetQrelsHash,
              queryQrelsHash: freshStackQueryQrelsHash,
              queryToNuggetMapHash: freshStackQueryToNuggetMapHash,
              chunkingConfigHash: freshStackChunkingConfigHash,
              retrieverConfigHash: freshStackRetrieverConfigHash,
              indexArtifactHash: freshStackIndexArtifactHash,
              runfileHash: freshStackRunfileHash,
              evaluatorConfigHash: freshStackEvaluatorConfigHash,
              metricsReportHash: freshStackMetricsReportHash,
              leaderboardSnapshotHash: freshStackLeaderboardSnapshotHash,
              replayCommandHash: freshStackReplayCommandHash,
              deterministicSeed: 2024,
              topic: "langchain",
              retrieverKind: "dense",
              queryCount: 18,
              minQueryCount: 10,
              corpusDocumentCount: 420,
              minCorpusDocumentCount: 100,
              topicCoverageCount: 5,
              minTopicCoverageCount: 5,
              baselineMetric0to1: 0.61,
              candidateMetric0to1: 0.72,
              scoreDelta0to1: 0.11,
              maxScoreRegression0to1: 0.02,
              alphaNdcgAt10_0to1: 0.63,
              minAlphaNdcgAt10_0to1: 0.55,
              coverageAt20_0to1: 0.77,
              minCoverageAt20_0to1: 0.7,
              recallAt50_0to1: 0.81,
              minRecallAt50_0to1: 0.75,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 1,
            },
          },
          baseline: {
            score0to1: 0.61,
            evidenceRefs: ["trace:baseline-freshstack"],
            signedEvidenceRefs: ["ledger:sig-baseline-freshstack"],
          },
          candidate: {
            score0to1: 0.72,
            evidenceRefs: ["trace:candidate-freshstack"],
            signedEvidenceRefs: ["ledger:sig-candidate-freshstack"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.freshStackRetrievalSummary).toMatchObject({
      rowCount: 1,
      benchmarkIds: ["freshstack"],
      topics: ["langchain"],
      retrieverKinds: ["dense"],
      failedRowIds: [],
      totalQueryCount: 18,
      totalCorpusDocumentCount: 420,
      averageAlphaNdcgAt10_0to1: 0.63,
      averageCoverageAt20_0to1: 0.77,
      averageRecallAt50_0to1: 0.81,
      averageReplayPassRate0to1: 1,
      averageScoreDelta0to1: 0.11,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "freshstack-complete",
      status: "passed",
      freshStackRetrieval: {
        benchmarkId: "freshstack",
        benchmarkVersion: "oct-2024",
        topic: "langchain",
        retrieverKind: "dense",
        alphaNdcgAt10_0to1: 0.63,
        coverageAt20_0to1: 0.77,
        recallAt50_0to1: 0.81,
        replayPassRate0to1: 1,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      freshStackRetrievalRowCount: 1,
      failedFreshStackRetrievalRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("FreshStack Retrieval Rows: 1");
    expect(markdown).toContain("FreshStack Topics: langchain");
    expect(markdown).toContain("freshstack:langchain:dense:0.63");
  });

  test("fails closed when FreshStack-style replay rows lack source, qrels, runfile, or metric proof", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "freshstack-ir-rag-replay",
      sourceRefs: ["https://github.com/fresh-stack/freshstack"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "freshstack-missing-proof",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            freshStackRetrieval: {
              benchmarkId: "freshstack",
              benchmarkVersion: "oct-2024",
              topic: "langchain",
              retrieverKind: "dense",
              queryCount: 4,
              minQueryCount: 10,
              corpusDocumentCount: 40,
              minCorpusDocumentCount: 100,
              topicCoverageCount: 3,
              minTopicCoverageCount: 5,
              baselineMetric0to1: 0.62,
              candidateMetric0to1: 0.58,
              scoreDelta0to1: -0.04,
              maxScoreRegression0to1: 0.02,
              alphaNdcgAt10_0to1: 0.5,
              minAlphaNdcgAt10_0to1: 0.55,
              coverageAt20_0to1: 0.62,
              minCoverageAt20_0to1: 0.7,
              recallAt50_0to1: 0.68,
              minRecallAt50_0to1: 0.75,
              replayPassRate0to1: 0.8,
              minReplayPassRate0to1: 1,
            },
          },
          baseline: {
            score0to1: 0.62,
            evidenceRefs: ["trace:baseline-freshstack-missing"],
            signedEvidenceRefs: ["ledger:sig-baseline-freshstack-missing"],
          },
          candidate: {
            score0to1: 0.58,
            evidenceRefs: ["trace:candidate-freshstack-missing"],
            signedEvidenceRefs: ["ledger:sig-candidate-freshstack-missing"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("freshstack retrieval repository snapshot hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("freshstack retrieval query dataset hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("freshstack retrieval corpus dataset hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("freshstack retrieval stackoverflow query manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("freshstack retrieval github corpus manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("freshstack retrieval qrels hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("freshstack retrieval runfile hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("freshstack retrieval metrics report hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("freshstack retrieval replay command hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("freshstack retrieval query count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("freshstack retrieval corpus document count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("freshstack retrieval topic coverage below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("freshstack retrieval alpha-nDCG@10 below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("freshstack retrieval coverage@20 below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("freshstack retrieval recall@50 below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("freshstack retrieval replay pass rate below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("freshstack retrieval score regression exceeds threshold");
    expect(result.manifest.freshStackRetrievalSummary.failedRowIds).toEqual(["freshstack-missing-proof"]);
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      freshStackRetrievalRowCount: 1,
      failedFreshStackRetrievalRowIds: ["freshstack-missing-proof"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "freshstack-missing-proof",
      severity: "critical",
    });
  });

  test("binds BenchLoop local hardware, harness, suite, run, latency, token, and agent-loop receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "benchloop-local-agent-replay",
      sourceRefs: ["https://github.com/outsourc-e/bench-loop"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "benchloop-complete",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            benchLoop: {
              benchmarkId: "benchloop",
              benchmarkVersion: "v0.2-beta",
              repositorySnapshotHash: benchLoopRepositorySnapshotHash,
              packageVersionHash: benchLoopPackageVersionHash,
              suiteManifestHash: benchLoopSuiteManifestHash,
              taskManifestHash: benchLoopTaskManifestHash,
              frozenTaskSetHash: benchLoopFrozenTaskSetHash,
              scorerConfigHash: benchLoopScorerConfigHash,
              harnessConfigHash: benchLoopHarnessConfigHash,
              providerConfigHash: benchLoopProviderConfigHash,
              endpointConfigHash: benchLoopEndpointConfigHash,
              modelConfigHash: benchLoopModelConfigHash,
              machineProfileHash: benchLoopMachineProfileHash,
              gpuProfileHash: benchLoopGpuProfileHash,
              dependencyLockHash: benchLoopDependencyLockHash,
              runConfigHash: benchLoopRunConfigHash,
              runOutputManifestHash: benchLoopRunOutputManifestHash,
              metricsReportHash: benchLoopMetricsReportHash,
              agentLoopTraceHash: benchLoopAgentLoopTraceHash,
              toolCallTraceHash: benchLoopToolCallTraceHash,
              tokenLatencyTraceHash: benchLoopTokenLatencyTraceHash,
              runPersistenceHash: benchLoopRunPersistenceHash,
              exportArtifactHash: benchLoopExportArtifactHash,
              leaderboardSubmissionHash: benchLoopLeaderboardSubmissionHash,
              replayCommandHash: benchLoopReplayCommandHash,
              deterministicSeed: 202606,
              suite: "agent",
              provider: "ollama",
              harness: "hermes",
              deploymentMode: "local",
              taskCount: 8,
              minTaskCount: 6,
              toolCount: 4,
              minToolCount: 4,
              averageTurnCount: 6,
              minAverageTurnCount: 4,
              overallScore0to1: 0.734,
              minOverallScore0to1: 0.7,
              qualityScore0to1: 0.736,
              minQualityScore0to1: 0.7,
              speedScore0to1: 0.789,
              minSpeedScore0to1: 0.65,
              reliabilityScore0to1: 0.9,
              minReliabilityScore0to1: 0.85,
              agentScore0to1: 0.969,
              minAgentScore0to1: 0.9,
              passRate0to1: 0.88,
              minPassRate0to1: 0.8,
              tokensPerSecond: 74.6,
              minTokensPerSecond: 20,
              timeToFirstTokenMs: 240,
              maxTimeToFirstTokenMs: 1000,
              scoreDelta0to1: 0.104,
              maxScoreRegression0to1: 0.02,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 1,
            },
          },
          baseline: {
            score0to1: 0.63,
            evidenceRefs: ["trace:baseline-benchloop"],
            signedEvidenceRefs: ["ledger:sig-baseline-benchloop"],
          },
          candidate: {
            score0to1: 0.734,
            evidenceRefs: ["trace:candidate-benchloop"],
            signedEvidenceRefs: ["ledger:sig-candidate-benchloop"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.benchLoopSummary).toMatchObject({
      rowCount: 1,
      benchmarkIds: ["benchloop"],
      suites: ["agent"],
      providers: ["ollama"],
      harnesses: ["hermes"],
      deploymentModes: ["local"],
      failedRowIds: [],
      totalTaskCount: 8,
      totalToolCount: 4,
      averageOverallScore0to1: 0.734,
      averageAgentScore0to1: 0.969,
      averageReliabilityScore0to1: 0.9,
      averageTokensPerSecond: 74.6,
      maxTimeToFirstTokenMs: 240,
      averageReplayPassRate0to1: 1,
      averageScoreDelta0to1: 0.104,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "benchloop-complete",
      status: "passed",
      benchLoop: {
        benchmarkId: "benchloop",
        benchmarkVersion: "v0.2-beta",
        suite: "agent",
        provider: "ollama",
        harness: "hermes",
        deploymentMode: "local",
        overallScore0to1: 0.734,
        agentScore0to1: 0.969,
        tokensPerSecond: 74.6,
        timeToFirstTokenMs: 240,
        replayPassRate0to1: 1,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      benchLoopRowCount: 1,
      failedBenchLoopRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("BenchLoop Rows: 1");
    expect(markdown).toContain("BenchLoop Suites: agent");
    expect(markdown).toContain("benchloop:agent:ollama:hermes:0.734");
    expect(verifyReplayBenchmarkCorpusReceipt(result.manifest, result.ciReceipt).valid).toBe(true);
  });

  test("fails closed when BenchLoop replay rows lack local run, hardware, suite, trace, export, or metric proof", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "benchloop-local-agent-replay",
      sourceRefs: ["https://github.com/outsourc-e/bench-loop"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "benchloop-missing-proof",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            benchLoop: {
              benchmarkId: "benchloop",
              benchmarkVersion: "v0.2-beta",
              suite: "agent",
              provider: "ollama",
              harness: "hermes",
              deploymentMode: "local",
              taskCount: 4,
              minTaskCount: 6,
              toolCount: 1,
              minToolCount: 4,
              averageTurnCount: 2,
              minAverageTurnCount: 4,
              overallScore0to1: 0.62,
              minOverallScore0to1: 0.7,
              qualityScore0to1: 0.64,
              minQualityScore0to1: 0.7,
              speedScore0to1: 0.52,
              minSpeedScore0to1: 0.65,
              reliabilityScore0to1: 0.7,
              minReliabilityScore0to1: 0.85,
              agentScore0to1: 0.72,
              minAgentScore0to1: 0.9,
              passRate0to1: 0.5,
              minPassRate0to1: 0.8,
              tokensPerSecond: 12,
              minTokensPerSecond: 20,
              timeToFirstTokenMs: 1450,
              maxTimeToFirstTokenMs: 1000,
              scoreDelta0to1: -0.04,
              maxScoreRegression0to1: 0.02,
              replayPassRate0to1: 0.75,
              minReplayPassRate0to1: 1,
            },
          },
          baseline: {
            score0to1: 0.66,
            evidenceRefs: ["trace:baseline-benchloop-missing"],
            signedEvidenceRefs: ["ledger:sig-baseline-benchloop-missing"],
          },
          candidate: {
            score0to1: 0.62,
            evidenceRefs: ["trace:candidate-benchloop-missing"],
            signedEvidenceRefs: ["ledger:sig-candidate-benchloop-missing"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("benchloop replay repository snapshot hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("benchloop replay package version hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("benchloop replay suite manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("benchloop replay task manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("benchloop replay frozen task set hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("benchloop replay scorer config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("benchloop replay harness config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("benchloop replay provider config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("benchloop replay endpoint config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("benchloop replay model config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("benchloop replay machine profile hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("benchloop replay run output manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("benchloop replay agent loop trace hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("benchloop replay tool call trace hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("benchloop replay token latency trace hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("benchloop replay run persistence hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("benchloop replay export artifact hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("benchloop replay replay command hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("benchloop replay task count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("benchloop replay tool count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("benchloop replay average turn count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("benchloop replay overall score below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("benchloop replay quality score below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("benchloop replay speed score below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("benchloop replay reliability score below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("benchloop replay agent score below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("benchloop replay pass rate below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("benchloop replay tokens per second below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("benchloop replay time to first token above threshold");
    expect(result.manifest.rows[0]?.issues).toContain("benchloop replay replay pass rate below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("benchloop replay score regression exceeds threshold");
    expect(result.manifest.benchLoopSummary.failedRowIds).toEqual(["benchloop-missing-proof"]);
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      benchLoopRowCount: 1,
      failedBenchLoopRowIds: ["benchloop-missing-proof"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "benchloop-missing-proof",
      severity: "critical",
    });
  });

  test("binds scenario simulation replay projects, action-level evaluation, UI artifacts, persistence, and resume proof", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "scenario-simulation-action-replay",
      sourceRefs: ["https://github.com/LLM-Evaluation-s-Always-Fatiguing/leaf-playground"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "scenario-simulation-complete",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            scenarioSimulation: {
              benchmarkId: "leaf-style-scenario-simulation",
              benchmarkVersion: "2026-06-15",
              repositorySnapshotHash: scenarioSimulationRepositorySnapshotHash,
              sourceRefHash: scenarioSimulationSourceRefHash,
              scenarioProjectManifestHash: scenarioSimulationProjectManifestHash,
              sceneDefinitionHash: scenarioSimulationSceneDefinitionHash,
              roleDefinitionHash: scenarioSimulationRoleDefinitionHash,
              agentRosterHash: scenarioSimulationAgentRosterHash,
              humanParticipantPolicyHash: scenarioSimulationHumanPolicyHash,
              llmAgentConfigHash: scenarioSimulationLlmConfigHash,
              evaluatorConfigHash: scenarioSimulationEvaluatorConfigHash,
              actionSchemaHash: scenarioSimulationActionSchemaHash,
              taskDatasetHash: scenarioSimulationTaskDatasetHash,
              webUiBuildHash: scenarioSimulationWebUiBuildHash,
              serverConfigHash: scenarioSimulationServerConfigHash,
              containerImageHash: scenarioSimulationContainerImageHash,
              persistenceStoreHash: scenarioSimulationPersistenceStoreHash,
              checkpointManifestHash: scenarioSimulationCheckpointManifestHash,
              runConfigHash: scenarioSimulationRunConfigHash,
              eventLogHash: scenarioSimulationEventLogHash,
              actionTraceHash: scenarioSimulationActionTraceHash,
              evaluationReportHash: scenarioSimulationEvaluationReportHash,
              visualizationArtifactHash: scenarioSimulationVisualizationArtifactHash,
              replayCommandHash: scenarioSimulationReplayCommandHash,
              deterministicSeed: 20260615,
              agentMode: "human_llm",
              evaluationMode: "action_level",
              visualizationMode: "web_ui",
              scenarioCount: 2,
              minScenarioCount: 1,
              agentCount: 3,
              minAgentCount: 2,
              actionCount: 24,
              minActionCount: 10,
              evaluatedActionCount: 24,
              minEvaluatedActionCount: 24,
              actionEvaluationCoverage0to1: 1,
              minActionEvaluationCoverage0to1: 0.95,
              taskSuccessRate0to1: 0.82,
              minTaskSuccessRate0to1: 0.75,
              actionScore0to1: 0.87,
              minActionScore0to1: 0.8,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 1,
              scoreDelta0to1: 0.04,
              maxScoreRegression0to1: 0.02,
              persistenceEnabled: true,
              checkpointResumeVerified: true,
            },
          },
          baseline: {
            score0to1: 0.78,
            evidenceRefs: ["trace:baseline-scenario-simulation"],
            signedEvidenceRefs: ["ledger:sig-baseline-scenario-simulation"],
          },
          candidate: {
            score0to1: 0.82,
            evidenceRefs: ["trace:candidate-scenario-simulation"],
            signedEvidenceRefs: ["ledger:sig-candidate-scenario-simulation"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.scenarioSimulationSummary).toMatchObject({
      rowCount: 1,
      benchmarkIds: ["leaf-style-scenario-simulation"],
      agentModes: ["human_llm"],
      evaluationModes: ["action_level"],
      visualizationModes: ["web_ui"],
      failedRowIds: [],
      totalScenarioCount: 2,
      totalActionCount: 24,
      averageActionEvaluationCoverage0to1: 1,
      averageTaskSuccessRate0to1: 0.82,
      averageReplayPassRate0to1: 1,
      averageScoreDelta0to1: 0.04,
      checkpointResumeVerifiedRowCount: 1,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "scenario-simulation-complete",
      status: "passed",
      scenarioSimulation: {
        benchmarkId: "leaf-style-scenario-simulation",
        benchmarkVersion: "2026-06-15",
        agentMode: "human_llm",
        evaluationMode: "action_level",
        visualizationMode: "web_ui",
        actionEvaluationCoverage0to1: 1,
        replayPassRate0to1: 1,
        checkpointResumeVerified: true,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      scenarioSimulationRowCount: 1,
      failedScenarioSimulationRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("Scenario Simulation Rows: 1");
    expect(markdown).toContain("Scenario Simulation Agent Modes: human_llm");
    expect(markdown).toContain("Scenario Simulation Evaluation Modes: action_level");
    expect(markdown).toContain("leaf-style-scenario-simulation:human_llm:action_level:1");
    expect(verifyReplayBenchmarkCorpusReceipt(result.manifest, result.ciReceipt).valid).toBe(true);
  });

  test("fails closed when scenario simulation replay rows lack action-level traces, UI artifacts, persistence, or resume proof", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "scenario-simulation-action-replay",
      sourceRefs: ["https://github.com/LLM-Evaluation-s-Always-Fatiguing/leaf-playground"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "scenario-simulation-missing-proof",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            scenarioSimulation: {
              benchmarkId: "leaf-style-scenario-simulation",
              benchmarkVersion: "2026-06-15",
              agentMode: "human_llm",
              evaluationMode: "action_level",
              visualizationMode: "web_ui",
              scenarioCount: 1,
              minScenarioCount: 2,
              agentCount: 1,
              minAgentCount: 2,
              actionCount: 4,
              minActionCount: 10,
              evaluatedActionCount: 1,
              minEvaluatedActionCount: 4,
              actionEvaluationCoverage0to1: 0.25,
              minActionEvaluationCoverage0to1: 0.9,
              taskSuccessRate0to1: 0.6,
              minTaskSuccessRate0to1: 0.8,
              actionScore0to1: 0.5,
              minActionScore0to1: 0.8,
              replayPassRate0to1: 0,
              minReplayPassRate0to1: 1,
              scoreDelta0to1: -0.08,
              maxScoreRegression0to1: 0.02,
              persistenceEnabled: false,
              checkpointResumeVerified: false,
            },
          },
          baseline: {
            score0to1: 0.78,
            evidenceRefs: ["trace:baseline-scenario-simulation-missing"],
            signedEvidenceRefs: ["ledger:sig-baseline-scenario-simulation-missing"],
          },
          candidate: {
            score0to1: 0.7,
            evidenceRefs: ["trace:candidate-scenario-simulation-missing"],
            signedEvidenceRefs: ["ledger:sig-candidate-scenario-simulation-missing"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("scenario simulation repository snapshot hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("scenario simulation source ref hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("scenario simulation scenario project manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("scenario simulation scene definition hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("scenario simulation role definition hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("scenario simulation agent roster hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("scenario simulation action schema hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("scenario simulation web ui build hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("scenario simulation checkpoint manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("scenario simulation action trace hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("scenario simulation evaluation report hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("scenario simulation visualization artifact hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("scenario simulation replay command hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("scenario simulation deterministic seed missing");
    expect(result.manifest.rows[0]?.issues).toContain("scenario simulation scenario count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("scenario simulation agent count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("scenario simulation action count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("scenario simulation evaluated action count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("scenario simulation action evaluation coverage below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("scenario simulation task success below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("scenario simulation action score below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("scenario simulation replay pass rate below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("scenario simulation score regression exceeds threshold");
    expect(result.manifest.rows[0]?.issues).toContain("scenario simulation persistence disabled");
    expect(result.manifest.rows[0]?.issues).toContain("scenario simulation checkpoint resume not verified");
    expect(result.manifest.scenarioSimulationSummary.failedRowIds).toEqual(["scenario-simulation-missing-proof"]);
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      scenarioSimulationRowCount: 1,
      failedScenarioSimulationRowIds: ["scenario-simulation-missing-proof"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "scenario-simulation-missing-proof",
      severity: "critical",
    });
  });

  test("binds warehouse-native LLM eval replay proof, no-egress policy, baselines, judge criteria, and drift artifacts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "warehouse-native-llm-eval-replay",
      sourceRefs: ["https://github.com/paradime-io/dbt-llm-evals"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "warehouse-native-llm-eval-complete",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            warehouseNativeLlmEval: {
              benchmarkId: "dbt-llm-evals",
              benchmarkVersion: "2026-06-15",
              repositorySnapshotHash: warehouseNativeRepositorySnapshotHash,
              sourceRefHash: warehouseNativeSourceRefHash,
              dbtProjectManifestHash: warehouseNativeDbtProjectManifestHash,
              dbtPackageLockHash: warehouseNativeDbtPackageLockHash,
              warehouseAdapterConfigHash: warehouseNativeAdapterConfigHash,
              warehouseAiFunctionManifestHash: warehouseNativeAiFunctionManifestHash,
              modelManifestHash: warehouseNativeModelManifestHash,
              captureConfigHash: warehouseNativeCaptureConfigHash,
              promptInputOutputSchemaHash: warehouseNativePromptSchemaHash,
              baselineDatasetHash: warehouseNativeBaselineDatasetHash,
              baselineVersionManifestHash: warehouseNativeBaselineVersionHash,
              evaluationCriteriaHash: warehouseNativeCriteriaHash,
              judgeModelConfigHash: warehouseNativeJudgeModelHash,
              samplingConfigHash: warehouseNativeSamplingHash,
              thresholdConfigHash: warehouseNativeThresholdHash,
              rawCaptureTableHash: warehouseNativeRawCaptureTableHash,
              rawBaselineTableHash: warehouseNativeRawBaselineTableHash,
              judgeEvaluationTableHash: warehouseNativeJudgeEvaluationTableHash,
              evalScoreTableHash: warehouseNativeEvalScoreTableHash,
              performanceSummaryHash: warehouseNativePerformanceSummaryHash,
              driftDetectionHash: warehouseNativeDriftDetectionHash,
              alertTableHash: warehouseNativeAlertTableHash,
              compiledSqlArtifactHash: warehouseNativeCompiledSqlHash,
              runResultArtifactHash: warehouseNativeRunResultHash,
              dataEgressPolicyHash: warehouseNativeDataEgressPolicyHash,
              replayCommandHash: warehouseNativeReplayCommandHash,
              deterministicSeed: 20260615,
              warehouse: "snowflake",
              evaluationMode: "llm_as_judge",
              modelCount: 2,
              minModelCount: 1,
              capturedRowCount: 120,
              minCapturedRowCount: 100,
              baselineRowCount: 100,
              minBaselineRowCount: 50,
              evaluatedRowCount: 110,
              minEvaluatedRowCount: 100,
              criteriaCount: 5,
              minCriteriaCount: 4,
              captureCoverage0to1: 0.98,
              minCaptureCoverage0to1: 0.95,
              judgeScoreMean0to1: 0.84,
              minJudgeScoreMean0to1: 0.75,
              passRate0to1: 0.88,
              minPassRate0to1: 0.8,
              driftAlertRate0to1: 0.02,
              maxDriftAlertRate0to1: 0.05,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 1,
              scoreDelta0to1: 0.06,
              maxScoreRegression0to1: 0.02,
              dataEgressBlocked: true,
            },
          },
          baseline: {
            score0to1: 0.78,
            evidenceRefs: ["trace:baseline-warehouse-native-llm-eval"],
            signedEvidenceRefs: ["ledger:sig-baseline-warehouse-native-llm-eval"],
          },
          candidate: {
            score0to1: 0.84,
            evidenceRefs: ["trace:candidate-warehouse-native-llm-eval"],
            signedEvidenceRefs: ["ledger:sig-candidate-warehouse-native-llm-eval"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.warehouseNativeLlmEvalSummary).toMatchObject({
      rowCount: 1,
      benchmarkIds: ["dbt-llm-evals"],
      warehouses: ["snowflake"],
      evaluationModes: ["llm_as_judge"],
      failedRowIds: [],
      totalModelCount: 2,
      totalCapturedRowCount: 120,
      totalEvaluatedRowCount: 110,
      averageCaptureCoverage0to1: 0.98,
      averageJudgeScoreMean0to1: 0.84,
      averagePassRate0to1: 0.88,
      maxDriftAlertRate0to1: 0.02,
      averageReplayPassRate0to1: 1,
      averageScoreDelta0to1: 0.06,
      dataEgressBlockedRowCount: 1,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "warehouse-native-llm-eval-complete",
      status: "passed",
      warehouseNativeLlmEval: {
        benchmarkId: "dbt-llm-evals",
        benchmarkVersion: "2026-06-15",
        warehouse: "snowflake",
        evaluationMode: "llm_as_judge",
        captureCoverage0to1: 0.98,
        judgeScoreMean0to1: 0.84,
        passRate0to1: 0.88,
        dataEgressBlocked: true,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      warehouseNativeLlmEvalRowCount: 1,
      failedWarehouseNativeLlmEvalRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("Warehouse-Native LLM Eval Rows: 1");
    expect(markdown).toContain("Warehouse-Native LLM Eval Warehouses: snowflake");
    expect(markdown).toContain("Warehouse-Native LLM Eval Modes: llm_as_judge");
    expect(markdown).toContain("dbt-llm-evals:snowflake:llm_as_judge:0.88");
    expect(verifyReplayBenchmarkCorpusReceipt(result.manifest, result.ciReceipt).valid).toBe(true);
  });

  test("fails closed when warehouse-native LLM eval replay lacks dbt, warehouse, drift, no-egress, or regression proof", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "warehouse-native-llm-eval-replay",
      sourceRefs: ["https://github.com/paradime-io/dbt-llm-evals"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "warehouse-native-llm-eval-missing-proof",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            warehouseNativeLlmEval: {
              benchmarkId: "dbt-llm-evals",
              benchmarkVersion: "2026-06-15",
              warehouse: "snowflake",
              evaluationMode: "llm_as_judge",
              modelCount: 0,
              minModelCount: 1,
              capturedRowCount: 80,
              minCapturedRowCount: 100,
              baselineRowCount: 20,
              minBaselineRowCount: 50,
              evaluatedRowCount: 75,
              minEvaluatedRowCount: 100,
              criteriaCount: 2,
              minCriteriaCount: 4,
              captureCoverage0to1: 0.7,
              minCaptureCoverage0to1: 0.95,
              judgeScoreMean0to1: 0.62,
              minJudgeScoreMean0to1: 0.75,
              passRate0to1: 0.55,
              minPassRate0to1: 0.8,
              driftAlertRate0to1: 0.12,
              maxDriftAlertRate0to1: 0.05,
              replayPassRate0to1: 0.5,
              minReplayPassRate0to1: 1,
              scoreDelta0to1: -0.08,
              maxScoreRegression0to1: 0.02,
              dataEgressBlocked: false,
            },
          },
          baseline: {
            score0to1: 0.78,
            evidenceRefs: ["trace:baseline-warehouse-native-llm-eval-missing"],
            signedEvidenceRefs: ["ledger:sig-baseline-warehouse-native-llm-eval-missing"],
          },
          candidate: {
            score0to1: 0.7,
            evidenceRefs: ["trace:candidate-warehouse-native-llm-eval-missing"],
            signedEvidenceRefs: ["ledger:sig-candidate-warehouse-native-llm-eval-missing"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("warehouse-native llm eval repository snapshot hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("warehouse-native llm eval dbt project manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("warehouse-native llm eval raw capture table hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("warehouse-native llm eval data egress policy hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("warehouse-native llm eval deterministic seed missing");
    expect(result.manifest.rows[0]?.issues).toContain("warehouse-native llm eval model count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("warehouse-native llm eval captured row count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("warehouse-native llm eval baseline row count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("warehouse-native llm eval evaluated row count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("warehouse-native llm eval criteria count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("warehouse-native llm eval capture coverage below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("warehouse-native llm eval judge score below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("warehouse-native llm eval pass rate below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("warehouse-native llm eval drift alert rate above threshold");
    expect(result.manifest.rows[0]?.issues).toContain("warehouse-native llm eval replay pass rate below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("warehouse-native llm eval score regression exceeds threshold");
    expect(result.manifest.rows[0]?.issues).toContain("warehouse-native llm eval data egress policy not blocked");
    expect(result.manifest.warehouseNativeLlmEvalSummary.failedRowIds).toEqual([
      "warehouse-native-llm-eval-missing-proof",
    ]);
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      warehouseNativeLlmEvalRowCount: 1,
      failedWarehouseNativeLlmEvalRowIds: ["warehouse-native-llm-eval-missing-proof"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "warehouse-native-llm-eval-missing-proof",
      severity: "critical",
    });
  });

  test("binds AD-GEN SOC dataset provenance, ATT&CK labels, action schema, validation, and replay metrics", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "adgen-soc-dataset-replay",
      sourceRefs: ["https://github.com/namhop88/AD-GEN"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "adgen-complete",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            adGenSocDataset: {
              benchmarkId: "ad-gen",
              benchmarkVersion: "v1.0.0",
              repositorySnapshotHash: adGenRepositorySnapshotHash,
              releaseManifestHash: adGenReleaseManifestHash,
              sourceCorpusManifestHash: adGenSourceCorpusManifestHash,
              labDatasetHash: adGenLabDatasetHash,
              realDatasetHash: adGenRealDatasetHash,
              conversionScriptHash: adGenConversionScriptHash,
              labelingPromptHash: adGenLabelingPromptHash,
              outputSchemaHash: adGenOutputSchemaHash,
              attackMappingHash: adGenAttackMappingHash,
              actionSchemaHash: adGenActionSchemaHash,
              validationReportHash: adGenValidationReportHash,
              labelQualityReportHash: adGenLabelQualityReportHash,
              crossModelAuditReportHash: adGenCrossModelAuditReportHash,
              datasetLicenseRefHash: adGenDatasetLicenseHash,
              codeLicenseRefHash: adGenCodeLicenseHash,
              replayCommandHash: adGenReplayCommandHash,
              deterministicSeed: 602,
              environment: "mixed",
              labelSource: "llm_validated",
              rawEventCount: 252_219_115,
              minRawEventCount: 1_000_000,
              validatedRecordCount: 240_707,
              minValidatedRecordCount: 100_000,
              riskClassCount: 4,
              minRiskClassCount: 4,
              mitreTacticCount: 6,
              minMitreTacticCount: 5,
              supportedActionCount: 7,
              minSupportedActionCount: 7,
              parseSuccessRate0to1: 1,
              minParseSuccessRate0to1: 0.99,
              schemaValidity0to1: 0.999,
              minSchemaValidity0to1: 0.99,
              verdictConsistency0to1: 0.96,
              minVerdictConsistency0to1: 0.95,
              unknownTacticRate0to1: 0.00032,
              maxUnknownTacticRate0to1: 0.01,
              unknownTechniqueRate0to1: 0.00041,
              maxUnknownTechniqueRate0to1: 0.01,
              invalidActionCount: 0,
              maxInvalidActionCount: 0,
              evidenceSupportScore0to1: 0.73,
              minEvidenceSupportScore0to1: 0.72,
              attackAlignmentScore0to1: 0.74,
              minAttackAlignmentScore0to1: 0.72,
              scoreDelta0to1: 0.08,
              maxScoreRegression0to1: 0.02,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 1,
            },
          },
          baseline: {
            score0to1: 0.66,
            evidenceRefs: ["trace:baseline-adgen"],
            signedEvidenceRefs: ["ledger:sig-baseline-adgen"],
          },
          candidate: {
            score0to1: 0.74,
            evidenceRefs: ["trace:candidate-adgen"],
            signedEvidenceRefs: ["ledger:sig-candidate-adgen"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.adGenSocDatasetSummary).toMatchObject({
      rowCount: 1,
      benchmarkIds: ["ad-gen"],
      environments: ["mixed"],
      labelSources: ["llm_validated"],
      failedRowIds: [],
      totalRawEventCount: 252_219_115,
      totalValidatedRecordCount: 240_707,
      totalSupportedActionCount: 7,
      averageSchemaValidity0to1: 0.999,
      averageVerdictConsistency0to1: 0.96,
      maxUnknownTacticRate0to1: 0.00032,
      maxUnknownTechniqueRate0to1: 0.00041,
      averageReplayPassRate0to1: 1,
      averageScoreDelta0to1: 0.08,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "adgen-complete",
      status: "passed",
      adGenSocDataset: {
        benchmarkId: "ad-gen",
        environment: "mixed",
        labelSource: "llm_validated",
        validatedRecordCount: 240_707,
        schemaValidity0to1: 0.999,
        replayPassRate0to1: 1,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      adGenSocDatasetRowCount: 1,
      failedAdGenSocDatasetRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("AD-GEN SOC Dataset Rows: 1");
    expect(markdown).toContain("AD-GEN Environments: mixed");
    expect(markdown).toContain("ad-gen:mixed:llm_validated:240707");
    expect(verifyReplayBenchmarkCorpusReceipt(result.manifest, result.ciReceipt).valid).toBe(true);
  });

  test("fails closed when AD-GEN SOC dataset rows lack dataset, validation, audit, replay, or threshold proof", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "adgen-soc-dataset-replay",
      sourceRefs: ["https://github.com/namhop88/AD-GEN"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "adgen-missing-proof",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            adGenSocDataset: {
              benchmarkId: "ad-gen",
              benchmarkVersion: "v1.0.0",
              environment: "mixed",
              labelSource: "llm_validated",
              rawEventCount: 100,
              minRawEventCount: 1_000_000,
              validatedRecordCount: 500,
              minValidatedRecordCount: 100_000,
              riskClassCount: 2,
              minRiskClassCount: 4,
              mitreTacticCount: 3,
              minMitreTacticCount: 5,
              supportedActionCount: 4,
              minSupportedActionCount: 7,
              parseSuccessRate0to1: 0.9,
              minParseSuccessRate0to1: 0.99,
              schemaValidity0to1: 0.91,
              minSchemaValidity0to1: 0.99,
              verdictConsistency0to1: 0.8,
              minVerdictConsistency0to1: 0.95,
              unknownTacticRate0to1: 0.05,
              maxUnknownTacticRate0to1: 0.01,
              unknownTechniqueRate0to1: 0.04,
              maxUnknownTechniqueRate0to1: 0.01,
              invalidActionCount: 2,
              maxInvalidActionCount: 0,
              evidenceSupportScore0to1: 0.6,
              minEvidenceSupportScore0to1: 0.72,
              attackAlignmentScore0to1: 0.61,
              minAttackAlignmentScore0to1: 0.72,
              scoreDelta0to1: -0.04,
              maxScoreRegression0to1: 0.02,
              replayPassRate0to1: 0.75,
              minReplayPassRate0to1: 1,
            },
          },
          baseline: {
            score0to1: 0.7,
            evidenceRefs: ["trace:baseline-adgen-missing"],
            signedEvidenceRefs: ["ledger:sig-baseline-adgen-missing"],
          },
          candidate: {
            score0to1: 0.66,
            evidenceRefs: ["trace:candidate-adgen-missing"],
            signedEvidenceRefs: ["ledger:sig-candidate-adgen-missing"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("adgen soc dataset repository snapshot hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("adgen soc dataset source corpus manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("adgen soc dataset lab dataset hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("adgen soc dataset real dataset hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("adgen soc dataset conversion script hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("adgen soc dataset labeling prompt hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("adgen soc dataset output schema hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("adgen soc dataset attack mapping hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("adgen soc dataset action schema hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("adgen soc dataset validation report hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("adgen soc dataset label quality report hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("adgen soc dataset cross-model audit report hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("adgen soc dataset replay command hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("adgen soc dataset raw event count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("adgen soc dataset validated record count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("adgen soc dataset risk class count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("adgen soc dataset mitre tactic count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("adgen soc dataset supported action count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("adgen soc dataset parse success below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("adgen soc dataset schema validity below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("adgen soc dataset verdict consistency below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("adgen soc dataset unknown tactic rate above threshold");
    expect(result.manifest.rows[0]?.issues).toContain("adgen soc dataset unknown technique rate above threshold");
    expect(result.manifest.rows[0]?.issues).toContain("adgen soc dataset invalid action count above threshold");
    expect(result.manifest.rows[0]?.issues).toContain("adgen soc dataset evidence support below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("adgen soc dataset attack alignment below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("adgen soc dataset replay pass rate below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("adgen soc dataset score regression exceeds threshold");
    expect(result.manifest.adGenSocDatasetSummary.failedRowIds).toEqual(["adgen-missing-proof"]);
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      adGenSocDatasetRowCount: 1,
      failedAdGenSocDatasetRowIds: ["adgen-missing-proof"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "adgen-missing-proof",
      severity: "critical",
    });
  });

  test("binds DocThinker document and multimodal RAG memory replay evidence into receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "docthinker-document-rag-replay",
      sourceRefs: [
        "https://github.com/Yang-Jiashu/Doc-thinker",
        "https://arxiv.org/abs/2603.05551",
      ],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "docthinker-complete",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            docThinkerDocumentRag: {
              benchmarkId: "docthinker",
              benchmarkVersion: "2026.03",
              repositorySnapshotHash: docThinkerRepositorySnapshotHash,
              paperRefHash: docThinkerPaperRefHash,
              licenseRefHash: docThinkerLicenseRefHash,
              documentCorpusHash: docThinkerDocumentCorpusHash,
              textCarrierManifestHash: docThinkerTextCarrierManifestHash,
              imageTextCarrierManifestHash: docThinkerImageTextCarrierManifestHash,
              pdfProcessingTraceHash: docThinkerPdfProcessingTraceHash,
              querySetHash: docThinkerQuerySetHash,
              unanswerableQuerySetHash: docThinkerUnanswerableQuerySetHash,
              complexityRouterConfigHash: docThinkerComplexityRouterConfigHash,
              routingDecisionTraceHash: docThinkerRoutingDecisionTraceHash,
              perceptionTraceHash: docThinkerPerceptionTraceHash,
              reasoningTraceHash: docThinkerReasoningTraceHash,
              sessionKgManifestHash: docThinkerSessionKgManifestHash,
              kgExpansionTraceHash: docThinkerKgExpansionTraceHash,
              memoryPolicyHash: docThinkerMemoryPolicyHash,
              memoryRecallTraceHash: docThinkerMemoryRecallTraceHash,
              retrievalTraceHash: docThinkerRetrievalTraceHash,
              generationTraceHash: docThinkerGenerationTraceHash,
              observabilityTraceHash: docThinkerObservabilityTraceHash,
              evalConfigHash: docThinkerEvalConfigHash,
              metricsReportHash: docThinkerMetricsReportHash,
              reportArtifactHash: docThinkerReportArtifactHash,
              environmentHash: docThinkerEnvironmentHash,
              dependencyLockHash: docThinkerDependencyLockHash,
              replayCommandHash: docThinkerReplayCommandHash,
              deterministicSeed: 464,
              carrierMode: "multimodal",
              queryModes: ["quick", "standard", "deep"],
              memoryLayers: ["session_kg", "conversation_memory", "episodic_memory", "long_horizon_memory", "expanded_kg"],
              retrievalPaths: ["adaptive_router", "kg", "hybrid"],
              documentCount: 8,
              minDocumentCount: 3,
              queryCount: 24,
              minQueryCount: 12,
              memoryLayerCount: 5,
              minMemoryLayerCount: 4,
              routingAccuracy0to1: 0.88,
              minRoutingAccuracy0to1: 0.8,
              evidenceRecall0to1: 0.91,
              minEvidenceRecall0to1: 0.85,
              answerAccuracy0to1: 0.82,
              minAnswerAccuracy0to1: 0.75,
              unanswerableRobustness0to1: 0.79,
              minUnanswerableRobustness0to1: 0.7,
              tokenReduction0to1: 0.19,
              minTokenReduction0to1: 0.1,
              costReduction0to1: 0.18,
              minCostReduction0to1: 0.1,
              scoreDelta0to1: 0.07,
              maxScoreRegression0to1: 0.02,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 1,
            },
          },
          baseline: {
            score0to1: 0.68,
            evidenceRefs: ["trace:baseline-docthinker"],
            signedEvidenceRefs: ["ledger:sig-baseline-docthinker"],
          },
          candidate: {
            score0to1: 0.75,
            evidenceRefs: ["trace:candidate-docthinker"],
            signedEvidenceRefs: ["ledger:sig-candidate-docthinker"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.docThinkerDocumentRagSummary).toMatchObject({
      rowCount: 1,
      benchmarkIds: ["docthinker"],
      carrierModes: ["multimodal"],
      queryModes: ["quick", "standard", "deep"],
      memoryLayers: ["session_kg", "conversation_memory", "episodic_memory", "long_horizon_memory", "expanded_kg"],
      retrievalPaths: ["adaptive_router", "kg", "hybrid"],
      failedRowIds: [],
      totalDocumentCount: 8,
      totalQueryCount: 24,
      averageRoutingAccuracy0to1: 0.88,
      averageEvidenceRecall0to1: 0.91,
      averageAnswerAccuracy0to1: 0.82,
      averageReplayPassRate0to1: 1,
      averageScoreDelta0to1: 0.07,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "docthinker-complete",
      status: "passed",
      docThinkerDocumentRag: {
        benchmarkId: "docthinker",
        carrierMode: "multimodal",
        queryModes: ["quick", "standard", "deep"],
        memoryLayerCount: 5,
        evidenceRecall0to1: 0.91,
        replayPassRate0to1: 1,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      docThinkerDocumentRagRowCount: 1,
      failedDocThinkerDocumentRagRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("DocThinker Document RAG Rows: 1");
    expect(markdown).toContain("DocThinker Query Modes: quick, standard, deep");
    expect(markdown).toContain("docthinker:multimodal:24:0.82");
    expect(verifyReplayBenchmarkCorpusReceipt(result.manifest, result.ciReceipt).valid).toBe(true);
  });

  test("fails closed when DocThinker document RAG rows lack memory, graph, routing, eval, or replay proof", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "docthinker-document-rag-replay",
      sourceRefs: ["https://github.com/Yang-Jiashu/Doc-thinker"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "docthinker-missing-proof",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            docThinkerDocumentRag: {
              benchmarkId: "docthinker",
              benchmarkVersion: "2026.03",
              carrierMode: "multimodal",
              queryModes: ["deep"],
              memoryLayers: ["session_kg"],
              retrievalPaths: ["hybrid"],
              documentCount: 1,
              minDocumentCount: 3,
              queryCount: 4,
              minQueryCount: 12,
              memoryLayerCount: 1,
              minMemoryLayerCount: 4,
              routingAccuracy0to1: 0.6,
              minRoutingAccuracy0to1: 0.8,
              evidenceRecall0to1: 0.72,
              minEvidenceRecall0to1: 0.85,
              answerAccuracy0to1: 0.64,
              minAnswerAccuracy0to1: 0.75,
              unanswerableRobustness0to1: 0.5,
              minUnanswerableRobustness0to1: 0.7,
              tokenReduction0to1: 0.02,
              minTokenReduction0to1: 0.1,
              costReduction0to1: 0.03,
              minCostReduction0to1: 0.1,
              scoreDelta0to1: -0.05,
              maxScoreRegression0to1: 0.02,
              replayPassRate0to1: 0.75,
              minReplayPassRate0to1: 1,
            },
          },
          baseline: {
            score0to1: 0.7,
            evidenceRefs: ["trace:baseline-docthinker-missing"],
            signedEvidenceRefs: ["ledger:sig-baseline-docthinker-missing"],
          },
          candidate: {
            score0to1: 0.65,
            evidenceRefs: ["trace:candidate-docthinker-missing"],
            signedEvidenceRefs: ["ledger:sig-candidate-docthinker-missing"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("docthinker document rag repository snapshot hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("docthinker document rag paper ref hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("docthinker document rag document corpus hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("docthinker document rag text carrier manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("docthinker document rag image-text carrier manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("docthinker document rag complexity router config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("docthinker document rag session kg manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("docthinker document rag memory policy hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("docthinker document rag observability trace hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("docthinker document rag replay command hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("docthinker document rag document count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("docthinker document rag query count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("docthinker document rag memory layer count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("docthinker document rag routing accuracy below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("docthinker document rag evidence recall below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("docthinker document rag answer accuracy below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("docthinker document rag unanswerable robustness below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("docthinker document rag token reduction below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("docthinker document rag cost reduction below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("docthinker document rag replay pass rate below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("docthinker document rag score regression exceeds threshold");
    expect(result.manifest.docThinkerDocumentRagSummary.failedRowIds).toEqual(["docthinker-missing-proof"]);
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      docThinkerDocumentRagRowCount: 1,
      failedDocThinkerDocumentRagRowIds: ["docthinker-missing-proof"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "docthinker-missing-proof",
      severity: "critical",
    });
  });

  test("binds DB context enrichment schemas, context sets, evalbench configs, and validation metrics into receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "db-context-enrichment-replay",
      sourceRefs: ["https://github.com/GoogleCloudPlatform/db-context-enrichment"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "db-context-complete",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            dbContextEnrichment: {
              benchmarkId: "google-db-context-enrichment",
              benchmarkVersion: "v0.5.1",
              repositorySnapshotHash: dbContextRepositorySnapshotHash,
              extensionManifestHash: dbContextExtensionManifestHash,
              databaseSchemaHash: dbContextDatabaseSchemaHash,
              schemaDiscoveryTraceHash: dbContextSchemaDiscoveryTraceHash,
              contextSetHash: dbContextContextSetHash,
              templateSetHash: dbContextTemplateSetHash,
              facetSetHash: dbContextFacetSetHash,
              valueSearchSetHash: dbContextValueSearchSetHash,
              goldenDatasetHash: dbContextGoldenDatasetHash,
              evalbenchDbConfigHash: dbContextDbConfigHash,
              evalbenchModelConfigHash: dbContextModelConfigHash,
              evalbenchRunConfigHash: dbContextRunConfigHash,
              llmRaterConfigHash: dbContextLlmRaterConfigHash,
              evaluationResultHash: dbContextEvaluationResultHash,
              failureCaseManifestHash: dbContextFailureCaseManifestHash,
              hillclimbPlanHash: dbContextHillclimbPlanHash,
              contextMutationPatchHash: dbContextMutationPatchHash,
              finalValidationResultHash: dbContextFinalValidationHash,
              replayCommandHash: dbContextReplayCommandHash,
              deterministicSeed: 501,
              databaseEngine: "postgresql",
              contextArtifactMode: "mixed",
              workflowStage: "full_loop",
              goldenQuestionCount: 16,
              minGoldenQuestionCount: 10,
              contextItemCount: 32,
              minContextItemCount: 12,
              baselineSqlAccuracy0to1: 0.58,
              candidateSqlAccuracy0to1: 0.77,
              minCandidateSqlAccuracy0to1: 0.7,
              contextReuseCoverage0to1: 0.84,
              minContextReuseCoverage0to1: 0.75,
              executableSqlRate0to1: 0.93,
              minExecutableSqlRate0to1: 0.9,
              hallucinatedColumnRate0to1: 0.02,
              maxHallucinatedColumnRate0to1: 0.05,
              scoreDelta0to1: 0.19,
              maxScoreRegression0to1: 0.03,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 1,
            },
          },
          baseline: {
            score0to1: 0.58,
            evidenceRefs: ["trace:baseline-db-context"],
            signedEvidenceRefs: ["ledger:sig-baseline-db-context"],
          },
          candidate: {
            score0to1: 0.77,
            evidenceRefs: ["trace:candidate-db-context"],
            signedEvidenceRefs: ["ledger:sig-candidate-db-context"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.dbContextEnrichmentSummary).toMatchObject({
      rowCount: 1,
      benchmarkIds: ["google-db-context-enrichment"],
      databaseEngines: ["postgresql"],
      contextArtifactModes: ["mixed"],
      workflowStages: ["full_loop"],
      failedRowIds: [],
      totalGoldenQuestionCount: 16,
      totalContextItemCount: 32,
      averageCandidateSqlAccuracy0to1: 0.77,
      averageContextReuseCoverage0to1: 0.84,
      averageExecutableSqlRate0to1: 0.93,
      maxHallucinatedColumnRate0to1: 0.02,
      averageReplayPassRate0to1: 1,
      averageScoreDelta0to1: 0.19,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "db-context-complete",
      status: "passed",
      dbContextEnrichment: {
        benchmarkId: "google-db-context-enrichment",
        databaseEngine: "postgresql",
        contextArtifactMode: "mixed",
        workflowStage: "full_loop",
        candidateSqlAccuracy0to1: 0.77,
        replayPassRate0to1: 1,
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      dbContextEnrichmentRowCount: 1,
      failedDbContextEnrichmentRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("DB Context Enrichment Rows: 1");
    expect(markdown).toContain("DB Context Engines: postgresql");
    expect(markdown).toContain("google-db-context-enrichment:postgresql:full_loop:0.77");
  });

  test("fails closed when DB context enrichment replay rows lack schema, context, eval, or validation proof", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "db-context-enrichment-replay",
      sourceRefs: ["https://github.com/GoogleCloudPlatform/db-context-enrichment"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "db-context-missing-proof",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            dbContextEnrichment: {
              benchmarkId: "google-db-context-enrichment",
              benchmarkVersion: "v0.5.1",
              databaseEngine: "postgresql",
              contextArtifactMode: "mixed",
              workflowStage: "full_loop",
              goldenQuestionCount: 4,
              minGoldenQuestionCount: 10,
              contextItemCount: 6,
              minContextItemCount: 12,
              baselineSqlAccuracy0to1: 0.62,
              candidateSqlAccuracy0to1: 0.58,
              minCandidateSqlAccuracy0to1: 0.7,
              contextReuseCoverage0to1: 0.6,
              minContextReuseCoverage0to1: 0.75,
              executableSqlRate0to1: 0.81,
              minExecutableSqlRate0to1: 0.9,
              hallucinatedColumnRate0to1: 0.09,
              maxHallucinatedColumnRate0to1: 0.05,
              scoreDelta0to1: -0.04,
              maxScoreRegression0to1: 0.03,
              replayPassRate0to1: 0.75,
              minReplayPassRate0to1: 1,
            },
          },
          baseline: {
            score0to1: 0.62,
            evidenceRefs: ["trace:baseline-db-context-missing"],
            signedEvidenceRefs: ["ledger:sig-baseline-db-context-missing"],
          },
          candidate: {
            score0to1: 0.58,
            evidenceRefs: ["trace:candidate-db-context-missing"],
            signedEvidenceRefs: ["ledger:sig-candidate-db-context-missing"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("db context enrichment repository snapshot hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("db context enrichment database schema hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("db context enrichment schema discovery trace hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("db context enrichment context set hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("db context enrichment template set hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("db context enrichment facet set hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("db context enrichment value search set hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("db context enrichment golden dataset hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("db context enrichment evalbench config hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("db context enrichment evaluation result hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("db context enrichment final validation hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("db context enrichment replay command hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("db context enrichment golden question count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("db context enrichment context item count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("db context enrichment candidate sql accuracy below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("db context enrichment context reuse coverage below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("db context enrichment executable sql rate below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("db context enrichment hallucinated column rate above threshold");
    expect(result.manifest.rows[0]?.issues).toContain("db context enrichment replay pass rate below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("db context enrichment score regression exceeds threshold");
    expect(result.manifest.dbContextEnrichmentSummary.failedRowIds).toEqual(["db-context-missing-proof"]);
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      dbContextEnrichmentRowCount: 1,
      failedDbContextEnrichmentRowIds: ["db-context-missing-proof"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "db-context-missing-proof",
      severity: "critical",
    });
  });

  test("binds TerminalWorld public-recording, Docker environment, state-test, and trial proof into replay receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "terminalworld-replay",
      sourceRefs: ["https://github.com/EuniAI/TerminalWorld"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "terminalworld-verified-replay",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            runtime: {
              kind: "container",
              image: "terminalworld-sandbox",
              commandHash,
              dependencyHash,
              sandboxProfile: "docker-readonly-network-gated",
            },
            outputArtifactHashes: [artifactHash],
            terminalWorld: {
              benchmarkId: "terminalworld",
              benchmarkVersion: "2026.05.31",
              subset: "verified",
              recordingSource: "asciinema",
              sourceRefHash: terminalWorldSourceRefHash,
              repositorySnapshotHash: terminalWorldRepositorySnapshotHash,
              paperRefHash: terminalWorldPaperRefHash,
              datasetSnapshotHash: terminalWorldDatasetSnapshotHash,
              datasetLicenseRefHash: terminalWorldDatasetLicenseHash,
              codeLicenseRefHash: terminalWorldCodeLicenseHash,
              publicRecordingManifestHash: terminalWorldRecordingManifestHash,
              recordingMetadataManifestHash: terminalWorldRecordingMetadataHash,
              recordingPrivacyFilterReportHash: terminalWorldPrivacyFilterHash,
              recordingQualityFilterReportHash: terminalWorldQualityFilterHash,
              synthesizedInstructionHash: terminalWorldInstructionHash,
              referenceSolutionHash: terminalWorldReferenceSolutionHash,
              taskMetadataHash: terminalWorldTaskMetadataHash,
              dockerfileHash: terminalWorldDockerfileHash,
              dockerComposeHash: terminalWorldDockerComposeHash,
              dockerImageDigestHash: terminalWorldDockerImageHash,
              environmentReproductionLogHash: terminalWorldEnvironmentLogHash,
              preExecutionSnapshotHash: terminalWorldPreSnapshotHash,
              postExecutionSnapshotHash: terminalWorldPostSnapshotHash,
              stateTestSuiteHash: terminalWorldStateTestSuiteHash,
              stateTestResultHash: terminalWorldStateTestResultHash,
              allPassingTrialHash: terminalWorldAllPassingTrialHash,
              nopTrialHash: terminalWorldNopTrialHash,
              partialTrialHash: terminalWorldPartialTrialHash,
              agentRunTraceHash: terminalWorldAgentRunTraceHash,
              resultManifestHash: terminalWorldResultManifestHash,
              replayCommandHash: terminalWorldReplayCommandHash,
              ciReceiptHash: terminalWorldCiReceiptHash,
              humanVerificationManifestHash: terminalWorldHumanVerificationHash,
              categoryIds: ["package-management", "file-processing"],
              commandIds: ["command:archive", "command:inspect"],
              taskCount: 200,
              minTaskCount: 200,
              categoryCount: 19,
              minCategoryCount: 10,
              uniqueCommandCount: 1280,
              minUniqueCommandCount: 1000,
              reproducedEnvironmentCount: 5035,
              minReproducedEnvironmentCount: 5000,
              deterministicSeed: 260522535,
              allPassingPassRate0to1: 1,
              minAllPassingPassRate0to1: 1,
              nopFailureRate0to1: 1,
              minNopFailureRate0to1: 1,
              partialFailureRate0to1: 1,
              minPartialFailureRate0to1: 1,
              stateAssertionCoverage0to1: 1,
              minStateAssertionCoverage0to1: 0.98,
              replayPassRate0to1: 1,
              minReplayPassRate0to1: 0.99,
              scoreDelta0to1: 0.03,
              maxScoreRegression0to1: 0.01,
            },
          },
          baseline: {
            score0to1: 0.62,
            evidenceRefs: ["trace:terminalworld-baseline"],
            signedEvidenceRefs: ["ledger:sig-terminalworld-baseline"],
          },
          candidate: {
            score0to1: 0.65,
            evidenceRefs: ["trace:terminalworld-candidate"],
            signedEvidenceRefs: ["ledger:sig-terminalworld-candidate"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.terminalWorldSummary).toMatchObject({
      rowCount: 1,
      benchmarkIds: ["terminalworld"],
      subsets: ["verified"],
      recordingSources: ["asciinema"],
      failedRowIds: [],
      verifiedSubsetRowCount: 1,
      humanVerifiedRowCount: 1,
      totalTaskCount: 200,
      totalReproducedEnvironmentCount: 5035,
      totalUniqueCommandCount: 1280,
      averageReplayPassRate0to1: 1,
      averageStateAssertionCoverage0to1: 1,
      averageScoreDelta0to1: 0.03,
    });
    expect(result.manifest.rows[0]?.terminalWorld).toMatchObject({
      benchmarkId: "terminalworld",
      subset: "verified",
      recordingSource: "asciinema",
      replayPassRate0to1: 1,
      allPassingPassRate0to1: 1,
      nopFailureRate0to1: 1,
      partialFailureRate0to1: 1,
    });
    expect(result.manifest.rows[0]?.issues).toEqual([]);
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      terminalWorldRowCount: 1,
      failedTerminalWorldRowIds: [],
    });
    expect(verifyReplayBenchmarkCorpusReceipt(result.manifest, result.ciReceipt)).toEqual({
      valid: true,
      errors: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("TerminalWorld Rows: 1");
    expect(markdown).toContain("TerminalWorld Subsets: verified");
    expect(markdown).toContain("terminalworld:verified:1");
  });

  test("fails closed when TerminalWorld replay proof lacks source, Docker, state-test, trial, or threshold evidence", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      corpusId: "terminalworld-missing-proof",
      sourceRefs: ["https://github.com/EuniAI/TerminalWorld"],
      rows: [
        {
          ...baseInput.rows[0]!,
          rowId: "terminalworld-missing-proof",
          fixture: {
            ...baseInput.rows[0]!.fixture,
            terminalWorld: {
              benchmarkId: "terminalworld",
              benchmarkVersion: "2026.05.31",
              subset: "verified",
              recordingSource: "asciinema",
              categoryIds: [],
              commandIds: [],
              taskCount: 1,
              minTaskCount: 200,
              categoryCount: 1,
              minCategoryCount: 10,
              uniqueCommandCount: 2,
              minUniqueCommandCount: 1000,
              reproducedEnvironmentCount: 1,
              minReproducedEnvironmentCount: 5000,
              allPassingPassRate0to1: 0.5,
              minAllPassingPassRate0to1: 1,
              nopFailureRate0to1: 0.5,
              minNopFailureRate0to1: 1,
              partialFailureRate0to1: 0.5,
              minPartialFailureRate0to1: 1,
              stateAssertionCoverage0to1: 0.5,
              minStateAssertionCoverage0to1: 1,
              replayPassRate0to1: 0.5,
              minReplayPassRate0to1: 1,
              scoreDelta0to1: -0.02,
              maxScoreRegression0to1: 0.01,
            },
          },
          baseline: {
            score0to1: 0.72,
            evidenceRefs: ["trace:terminalworld-baseline-missing"],
            signedEvidenceRefs: ["ledger:sig-terminalworld-baseline-missing"],
          },
          candidate: {
            score0to1: 0.7,
            evidenceRefs: ["trace:terminalworld-candidate-missing"],
            signedEvidenceRefs: ["ledger:sig-terminalworld-candidate-missing"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("terminalworld source ref hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("terminalworld dataset license hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("terminalworld public recording manifest hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("terminalworld dockerfile hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("terminalworld state test suite hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("terminalworld allpassing trial hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("terminalworld nop trial hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("terminalworld partial trial hash invalid");
    expect(result.manifest.rows[0]?.issues).toContain("terminalworld verified subset human verification proof missing");
    expect(result.manifest.rows[0]?.issues).toContain("terminalworld category ids missing");
    expect(result.manifest.rows[0]?.issues).toContain("terminalworld command ids missing");
    expect(result.manifest.rows[0]?.issues).toContain("terminalworld task count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("terminalworld reproduced environment count below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("terminalworld deterministic seed missing");
    expect(result.manifest.rows[0]?.issues).toContain("terminalworld allpassing pass rate below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("terminalworld nop failure rate below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("terminalworld partial failure rate below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("terminalworld state assertion coverage below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("terminalworld replay pass rate below threshold");
    expect(result.manifest.rows[0]?.issues).toContain("terminalworld score regression exceeds threshold");
    expect(result.manifest.terminalWorldSummary.failedRowIds).toEqual(["terminalworld-missing-proof"]);
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      terminalWorldRowCount: 1,
      failedTerminalWorldRowIds: ["terminalworld-missing-proof"],
    });
    expect(result.watchAlerts[0]).toMatchObject({
      rowId: "terminalworld-missing-proof",
      severity: "critical",
    });
  });

  test("verifies CI receipts and detects manifest tampering", () => {
    const result = runReplayBenchmarkCorpus(baseInput);
    const tamperedManifest = {
      ...result.manifest,
      scoreDelta0to1: result.manifest.scoreDelta0to1 + 0.01,
    };

    const verification = verifyReplayBenchmarkCorpusReceipt(tamperedManifest, result.ciReceipt);
    expect(verification.valid).toBe(false);
    expect(verification.errors).toContain("manifest hash does not match receipt");
  });

  test("renders replay corpus evidence in markdown", () => {
    const result = runReplayBenchmarkCorpus(baseInput);
    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);

    expect(markdown).toContain("# Replay Benchmark Corpus");
    expect(markdown).toContain("support-resolution-v1");
    expect(markdown).toContain("Fixture Hash");
    expect(markdown).toContain("case-001");
    expect(markdown).toContain("CI Receipt");
  });
});
