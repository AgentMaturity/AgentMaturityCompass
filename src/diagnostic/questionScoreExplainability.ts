import type {
  DiagnosticQuestion,
  EvidenceEventType,
  QuestionScoreAgentTrialAdapter,
  QuestionScoreAgentTrialStatisticalLensRef,
  QuestionScoreBenchmarkCriterionRef,
  QuestionScoreBenchmarkGradingType,
  QuestionScoreBenchmarkMetricView,
  QuestionScoreBenchmarkSubmissionLensRef,
  QuestionScoreBenchmarkTaskStatus,
  QuestionScoreCodeQuestDimensionStatus,
  QuestionScoreCodeQuestLanguage,
  QuestionScoreCodeQuestQualityDimensionRef,
  QuestionScoreCodeQuestQualityLensRef,
  QuestionScoreComponentDiagnosticRef,
  QuestionScoreComponentStatus,
  QuestionScoreComponentType,
  QuestionScoreContinualLearningBenchmarkLensRef,
  QuestionScoreCriterionDiagnosticRef,
  QuestionScoreCriterionStatus,
  QuestionScoreCriterionType,
  QuestionScoreEvidenceWindow,
  QuestionScoreEvalAiLibraryMetricFamily,
  QuestionScoreEvalAiLibraryQuestionLensRef,
  QuestionScoreHermesTurboPerformanceFacet,
  QuestionScoreHermesTurboPerformanceLensRef,
  QuestionScoreIncidentTriageDifficulty,
  QuestionScoreIncidentTriageLensRef,
  QuestionScoreIncidentTriageSeverity,
  QuestionScoreIotFirmwarePlatform,
  QuestionScoreIotFirmwareQuestionLensRef,
  QuestionScoreLandscapeCategory,
  QuestionScoreLandscapeLensRef,
  QuestionScoreLandscapeUpdateCadence,
  QuestionScoreOpenModelRagQuestionLensRef,
  QuestionScoreOpenModelRagRuntime,
  QuestionScoreObsStudioDrilldownLensRef,
  QuestionScoreObsStudioEvidencePreviewState,
  QuestionScoreObsStudioSourceKind,
  QuestionScoreOpikEvaluationMetricFamily,
  QuestionScoreOpikEvaluationQuestionLensRef,
  QuestionScoreMultiUserBenchmarkLensRef,
  QuestionScoreMultiUserCapability,
  QuestionScoreMultiUserScenarioFamily,
  QuestionScoreProfessionalTaskEnvironmentMode,
  QuestionScoreProfessionalTaskFaultMode,
  QuestionScoreProfessionalTaskLensRef,
  QuestionScoreRagFlowDiagnosticRef,
  QuestionScoreRetailSalesChannel,
  QuestionScoreRetailSalesQuestionLensRef,
  QuestionScoreRagVectorSearchBackend,
  QuestionScoreRubricCheckRef,
  QuestionScoreRubricCheckStatus,
  QuestionScoreRubricLensRef,
  QuestionScoreRubricSkillType,
  QuestionScoreScorableEvidencePreviewState,
  QuestionScoreScorableStudioDrilldownLensRef,
  QuestionScoreScorableStudioSurface,
  QuestionScore,
  QuestionScoreExplainabilityReport,
  QuestionScoreExplainabilityRow,
  QuestionScoreExplainabilityStatus,
  QuestionScoreTestSuiteAdapter,
  QuestionScoreTestSuiteEvaluationLensRef,
  QuestionScoreTestSuiteFramework,
  QuestionScoreTestSuiteLanguage,
  QuestionScoreRejectedEvidenceRef,
  QuestionScoreSignedEvidenceRef,
  TrustTier
} from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export interface QuestionExplainabilityEvidenceEvent {
  id: string;
  event_hash: string;
  writer_sig: string;
  event_type: EvidenceEventType;
  session_id: string;
  ts: number;
  trustTier: TrustTier;
}

export interface QuestionRejectedEvidenceInput {
  event: QuestionExplainabilityEvidenceEvent;
  reason: string;
}

export interface QuestionExplainabilityComponentInput {
  componentId: string;
  componentType: QuestionScoreComponentType;
  status: QuestionScoreComponentStatus;
  evidenceRefs?: string[];
  rejectedEvidenceRefs?: string[];
  repairHint?: string;
}

export interface QuestionExplainabilityCriterionInput {
  criterionId: string;
  criterionType: QuestionScoreCriterionType;
  status: QuestionScoreCriterionStatus;
  evidenceRefs?: string[];
  rejectedEvidenceRefs?: string[];
  judgeRef?: string | null;
  repairHint?: string;
}

export interface QuestionExplainabilityRubricCheckInput {
  checkId: string;
  pillar: string;
  status: QuestionScoreRubricCheckStatus;
  weight?: number;
  evidenceRefs?: string[];
  rejectedEvidenceRefs?: string[];
  fixHint?: string;
}

export interface QuestionExplainabilityRubricLensInput {
  rubricId: string;
  rubricVersion: string;
  rubricSource?: string;
  skillType?: QuestionScoreRubricSkillType;
  score0to100?: number;
  grade?: string;
  deepReviewCertificateHash?: string | null;
  marketSignalRefs?: string[];
  checks: QuestionExplainabilityRubricCheckInput[];
}

export interface QuestionExplainabilityRagFlowInput {
  flowId: string;
  vectorSearchBackend?: QuestionScoreRagVectorSearchBackend;
  flowDagHash?: string | null;
  paramConfigHash?: string | null;
  evalSetHash?: string | null;
  batchRunId?: string | null;
  evaluatorFlowHash?: string | null;
  groundTruthColumn?: string | null;
  dataMappingHash?: string | null;
  variantId?: string | null;
  variantConfigHash?: string | null;
  deploymentArtifactHash?: string | null;
  metricIds?: string[];
  status: QuestionScoreCriterionStatus;
  evidenceRefs?: string[];
  rejectedEvidenceRefs?: string[];
  repairHint?: string;
}

export interface QuestionExplainabilityLandscapeInput {
  landscapeId: string;
  sourceRef: string;
  category?: QuestionScoreLandscapeCategory;
  datasetRefs?: string[];
  datasetHashes?: string[];
  updateCadence?: QuestionScoreLandscapeUpdateCadence;
  lastVerifiedAt?: string | null;
  freshnessDays?: number | null;
  maxAllowedFreshnessDays?: number | null;
  cohortRefs?: string[];
  benchmarkRefs?: string[];
  toolOrModelRefs?: string[];
  status: QuestionScoreCriterionStatus;
  evidenceRefs?: string[];
  rejectedEvidenceRefs?: string[];
  repairHint?: string;
}

export interface QuestionExplainabilityIncidentTriageInput {
  environmentId: string;
  sourceRef: string;
  taskId: string;
  scenarioId: string;
  difficulty?: QuestionScoreIncidentTriageDifficulty;
  severity?: QuestionScoreIncidentTriageSeverity;
  openEnvConfigHash?: string | null;
  scenarioManifestHash?: string | null;
  incidentReportHash?: string | null;
  rawLogBundleHash?: string | null;
  metricSnapshotHash?: string | null;
  userReportHash?: string | null;
  actionPayloadHash?: string | null;
  graderConfigHash?: string | null;
  feedbackHash?: string | null;
  reward0to1?: number | null;
  minReward0to1?: number | null;
  rootCauseScore0to1?: number | null;
  minRootCauseScore0to1?: number | null;
  redHerringFilterScore0to1?: number | null;
  minRedHerringFilterScore0to1?: number | null;
  orderedRemediationScore0to1?: number | null;
  minOrderedRemediationScore0to1?: number | null;
  maxSteps?: number | null;
  stepCount?: number | null;
  deterministicGrader?: boolean;
  status: QuestionScoreCriterionStatus;
  evidenceRefs?: string[];
  rejectedEvidenceRefs?: string[];
  repairHint?: string;
}

export interface QuestionExplainabilityBenchmarkCriterionInput {
  criterionId: string;
  criterionType: QuestionScoreCriterionType;
  score0to1?: number | null;
  weight?: number;
  status: QuestionScoreCriterionStatus;
  gradingType?: QuestionScoreBenchmarkGradingType;
  evidenceRefs?: string[];
  rejectedEvidenceRefs?: string[];
  repairHint?: string;
}

export interface QuestionExplainabilityBenchmarkSubmissionInput {
  benchmarkId: string;
  sourceRef: string;
  submissionId: string;
  submissionVersion?: string | null;
  agentVersion?: string | null;
  submittedAt?: string | null;
  taskId: string;
  taskCategory: string;
  taskStatus?: QuestionScoreBenchmarkTaskStatus;
  gradingType?: QuestionScoreBenchmarkGradingType;
  overallScore0to100?: number | null;
  categoryScore0to100?: number | null;
  speedMs?: number | null;
  costUsd?: number | null;
  leaderboardMetricViews?: QuestionScoreBenchmarkMetricView[];
  submissionMetadataHash?: string | null;
  taskBreakdownHash?: string | null;
  leaderboardSnapshotHash?: string | null;
  criterionScores?: QuestionExplainabilityBenchmarkCriterionInput[];
  status: QuestionScoreCriterionStatus;
  evidenceRefs?: string[];
  rejectedEvidenceRefs?: string[];
  repairHint?: string;
}

export interface QuestionExplainabilityTestSuiteEvaluationInput {
  suiteId: string;
  sourceRef: string;
  language?: QuestionScoreTestSuiteLanguage;
  testFramework?: QuestionScoreTestSuiteFramework;
  adapter?: QuestionScoreTestSuiteAdapter;
  datasetRef: string;
  datasetHash?: string | null;
  testCaseId: string;
  testCaseHash?: string | null;
  evaluatorIds?: string[];
  evaluatorConfigHash?: string | null;
  judgeModelRef?: string | null;
  experimentRunId?: string | null;
  experimentResultHash?: string | null;
  exportArtifactHash?: string | null;
  ciRunId?: string | null;
  ciConfigHash?: string | null;
  traceArtifactHash?: string | null;
  toolCallValidationHash?: string | null;
  agentBehaviorEvaluation?: boolean;
  passRate0to1?: number | null;
  minPassRate0to1?: number | null;
  averageScore0to1?: number | null;
  threshold0to1?: number | null;
  costUsd?: number | null;
  latencyMs?: number | null;
  tokenCount?: number | null;
  status: QuestionScoreCriterionStatus;
  evidenceRefs?: string[];
  rejectedEvidenceRefs?: string[];
  repairHint?: string;
}

export interface QuestionExplainabilityEvalAiLibraryQuestionInput {
  frameworkId: string;
  sourceRef: string;
  repositoryRef?: string;
  licenseRef?: string | null;
  licenseSpdxId?: string | null;
  defaultBranch?: string;
  sourceCommitSha?: string | null;
  sourceTreeSha?: string | null;
  sourceStatusHash?: string | null;
  readmeArtifactHash?: string | null;
  licenseArtifactHash?: string | null;
  noticeArtifactHash?: string | null;
  pyprojectArtifactHash?: string | null;
  requirementsArtifactHash?: string | null;
  evalLibTreeHash?: string | null;
  metricsTreeHash?: string | null;
  agentMetricsTreeHash?: string | null;
  securityMetricsTreeHash?: string | null;
  tracingTreeHash?: string | null;
  dashboardArtifactHash?: string | null;
  evaluationSchemaHash?: string | null;
  testcasesSchemaHash?: string | null;
  metricPatternHash?: string | null;
  llmClientHash?: string | null;
  evalPackManifestHash?: string | null;
  datasetManifestHash?: string | null;
  questionSetHash?: string | null;
  questionTraceHash?: string | null;
  evaluatorConfigHash?: string | null;
  metricResultHash?: string | null;
  scoreBreakdownHash?: string | null;
  rejectedEvidenceLedgerHash?: string | null;
  repairHintHash?: string | null;
  regressionThresholdHash?: string | null;
  ciRunId?: string | null;
  ciConfigHash?: string | null;
  noSourceCopyBoundaryHash?: string | null;
  metricFamily?: QuestionScoreEvalAiLibraryMetricFamily;
  metricIds?: string[];
  providerCount?: number | null;
  minProviderCount?: number | null;
  metricCount?: number | null;
  minMetricCount?: number | null;
  questionCount?: number | null;
  minQuestionCount?: number | null;
  evidenceCoverage0to1?: number | null;
  minEvidenceCoverage0to1?: number | null;
  rejectedEvidenceReasonCoverage0to1?: number | null;
  minRejectedEvidenceReasonCoverage0to1?: number | null;
  repairHintCoverage0to1?: number | null;
  minRepairHintCoverage0to1?: number | null;
  regressionPassRate0to1?: number | null;
  minRegressionPassRate0to1?: number | null;
  scoreConfidence0to1?: number | null;
  minScoreConfidence0to1?: number | null;
  status: QuestionScoreCriterionStatus;
  evidenceRefs?: string[];
  rejectedEvidenceRefs?: string[];
  repairHint?: string;
}

export interface QuestionExplainabilityOpenModelRagQuestionInput {
  frameworkId: string;
  sourceRef: string;
  repositoryRef?: string;
  licenseRef?: string | null;
  licenseSpdxId?: string | null;
  licenseBoundaryHash?: string | null;
  defaultBranch?: string;
  sourceCommitSha?: string | null;
  sourceTreeSha?: string | null;
  sourceStatusHash?: string | null;
  readmeArtifactHash?: string | null;
  javaSourceTreeHash?: string | null;
  buildConfigHash?: string | null;
  dependencyManifestHash?: string | null;
  langChain4jIntegrationHash?: string | null;
  ollamaRuntimeConfigHash?: string | null;
  ragPipelineHash?: string | null;
  ragCorpusManifestHash?: string | null;
  embeddingConfigHash?: string | null;
  retrievalTraceHash?: string | null;
  evaluationManifestHash?: string | null;
  questionSetHash?: string | null;
  questionTraceHash?: string | null;
  evaluatorConfigHash?: string | null;
  metricResultHash?: string | null;
  scoreBreakdownHash?: string | null;
  rejectedEvidenceLedgerHash?: string | null;
  repairHintHash?: string | null;
  regressionThresholdHash?: string | null;
  ciRunId?: string | null;
  ciConfigHash?: string | null;
  noSourceCopyBoundaryHash?: string | null;
  runtime?: QuestionScoreOpenModelRagRuntime;
  openModelIds?: string[];
  evaluationMetricIds?: string[];
  ragQueryCount?: number | null;
  minRagQueryCount?: number | null;
  retrievalGroundingScore0to1?: number | null;
  minRetrievalGroundingScore0to1?: number | null;
  answerRelevanceScore0to1?: number | null;
  minAnswerRelevanceScore0to1?: number | null;
  evidenceCoverage0to1?: number | null;
  minEvidenceCoverage0to1?: number | null;
  rejectedEvidenceReasonCoverage0to1?: number | null;
  minRejectedEvidenceReasonCoverage0to1?: number | null;
  repairHintCoverage0to1?: number | null;
  minRepairHintCoverage0to1?: number | null;
  regressionPassRate0to1?: number | null;
  minRegressionPassRate0to1?: number | null;
  status: QuestionScoreCriterionStatus;
  evidenceRefs?: string[];
  rejectedEvidenceRefs?: string[];
  repairHint?: string;
}

export interface QuestionExplainabilityOpikEvaluationQuestionInput {
  lensId: string;
  sourceRef: string;
  productUrl?: string;
  liveRelevanceCheckHash?: string | null;
  projectRef?: string | null;
  experimentRef?: string | null;
  datasetManifestHash?: string | null;
  traceExportHash?: string | null;
  evalPackManifestHash?: string | null;
  questionSetHash?: string | null;
  questionIdRef?: string;
  questionTraceHash?: string | null;
  evaluatorConfigHash?: string | null;
  metricResultHash?: string | null;
  scoreBreakdownHash?: string | null;
  acceptedEvidenceLedgerHash?: string | null;
  rejectedEvidenceLedgerHash?: string | null;
  repairHintHash?: string | null;
  thresholdPolicyHash?: string | null;
  signedEvidenceRowsHash?: string | null;
  ciRunId?: string | null;
  ciConfigHash?: string | null;
  noParityClaimHash?: string | null;
  noSourceCopyBoundaryHash?: string | null;
  metricFamily?: QuestionScoreOpikEvaluationMetricFamily;
  metricIds?: string[];
  traceCount?: number | null;
  minTraceCount?: number | null;
  questionCount?: number | null;
  minQuestionCount?: number | null;
  evidenceCoverage0to1?: number | null;
  minEvidenceCoverage0to1?: number | null;
  rejectedEvidenceReasonCoverage0to1?: number | null;
  minRejectedEvidenceReasonCoverage0to1?: number | null;
  repairHintCoverage0to1?: number | null;
  minRepairHintCoverage0to1?: number | null;
  thresholdPassRate0to1?: number | null;
  minThresholdPassRate0to1?: number | null;
  scoreConfidence0to1?: number | null;
  minScoreConfidence0to1?: number | null;
  status: QuestionScoreCriterionStatus;
  evidenceRefs?: string[];
  rejectedEvidenceRefs?: string[];
  repairHint?: string;
}

export interface QuestionExplainabilityAgentTrialStatisticalInput {
  suiteId: string;
  sourceRef: string;
  packageRef?: string | null;
  adapter?: QuestionScoreAgentTrialAdapter;
  caseId: string;
  caseName?: string;
  suiteManifestHash?: string | null;
  caseManifestHash?: string | null;
  runManifestHash?: string | null;
  trialManifestHash?: string | null;
  statisticalReportHash?: string | null;
  trajectoryBundleHash?: string | null;
  failureAttributionHash?: string | null;
  baselineResultHash?: string | null;
  candidateResultHash?: string | null;
  ciConfigHash?: string | null;
  dashboardSnapshotHash?: string | null;
  ciRunId?: string | null;
  trialCount?: number | null;
  minTrialCount?: number | null;
  passCount?: number | null;
  passRate0to1?: number | null;
  minPassRate0to1?: number | null;
  wilsonConfidenceLevel?: number | null;
  wilsonLower0to1?: number | null;
  minWilsonLower0to1?: number | null;
  wilsonUpper0to1?: number | null;
  bootstrapCostMeanUsd?: number | null;
  maxCostMeanUsd?: number | null;
  bootstrapLatencyMeanMs?: number | null;
  maxLatencyMeanMs?: number | null;
  agentReliabilityScore0to1?: number | null;
  minAgentReliabilityScore0to1?: number | null;
  failureAttributionStepId?: string | null;
  failureAttributionPValue?: number | null;
  maxFailureAttributionPValue?: number | null;
  regressionTestName?: string | null;
  regressionPValue?: number | null;
  minRegressionPValue?: number | null;
  status: QuestionScoreCriterionStatus;
  evidenceRefs?: string[];
  rejectedEvidenceRefs?: string[];
  repairHint?: string;
}

export interface QuestionExplainabilityCodeQuestDimensionInput {
  dimensionId: string;
  dimensionLabel?: string;
  baselineScore0to1?: number | null;
  candidateScore0to1?: number | null;
  minScoreDelta0to1?: number | null;
  status?: QuestionScoreCodeQuestDimensionStatus;
  evidenceRefs?: string[];
  rejectedEvidenceRefs?: string[];
  repairHint?: string;
}

export interface QuestionExplainabilityCodeQuestQualityInput {
  frameworkId: string;
  sourceRef: string;
  repositoryRef?: string;
  licenseRef?: string | null;
  sourceStatusHash?: string | null;
  archivedSource?: boolean;
  taskId: string;
  language?: QuestionScoreCodeQuestLanguage;
  codeArtifactHash?: string | null;
  evaluatorPromptHash?: string | null;
  evaluatorConfigHash?: string | null;
  optimizerPromptHash?: string | null;
  optimizerConfigHash?: string | null;
  baselineEvaluationHash?: string | null;
  candidateEvaluationHash?: string | null;
  evaluatorFeedbackHash?: string | null;
  optimizerGroundingHash?: string | null;
  improvementPatchHash?: string | null;
  actorCriticLoopTraceHash?: string | null;
  regressionSuiteHash?: string | null;
  replayCommandHash?: string | null;
  ciRunId?: string | null;
  ciConfigHash?: string | null;
  noSourceCopyBoundaryHash?: string | null;
  dimensionCount?: number | null;
  minDimensionCount?: number | null;
  baselineOverallScore0to1?: number | null;
  candidateOverallScore0to1?: number | null;
  minOverallScoreDelta0to1?: number | null;
  dimensionRegressionCount?: number | null;
  maxDimensionRegressionCount?: number | null;
  evaluatorFeedbackCoverage0to1?: number | null;
  minEvaluatorFeedbackCoverage0to1?: number | null;
  optimizerGroundingCoverage0to1?: number | null;
  minOptimizerGroundingCoverage0to1?: number | null;
  dimensions?: QuestionExplainabilityCodeQuestDimensionInput[];
  status: QuestionScoreCriterionStatus;
  evidenceRefs?: string[];
  rejectedEvidenceRefs?: string[];
  repairHint?: string;
}

export interface QuestionExplainabilityMultiUserBenchmarkInput {
  benchmarkId: string;
  sourceRef: string;
  scenarioId: string;
  scenarioFamily?: QuestionScoreMultiUserScenarioFamily;
  capability?: QuestionScoreMultiUserCapability;
  datasetManifestHash?: string | null;
  userRoleManifestHash?: string | null;
  permissionPolicyHash?: string | null;
  preferenceProfileHash?: string | null;
  resourceQueuePolicyHash?: string | null;
  instructionSetHash?: string | null;
  interactionTraceHash?: string | null;
  evaluatorConfigHash?: string | null;
  resultArtifactHash?: string | null;
  metricReportHash?: string | null;
  userRoleCount?: number | null;
  turnCount?: number | null;
  privacyPassRate0to1?: number | null;
  minPrivacyPassRate0to1?: number | null;
  coordinationSuccessRate0to1?: number | null;
  minCoordinationSuccessRate0to1?: number | null;
  queueFairnessScore0to1?: number | null;
  minQueueFairnessScore0to1?: number | null;
  instructionFollowingScore0to1?: number | null;
  minInstructionFollowingScore0to1?: number | null;
  status: QuestionScoreCriterionStatus;
  evidenceRefs?: string[];
  rejectedEvidenceRefs?: string[];
  repairHint?: string;
}

export interface QuestionExplainabilityProfessionalTaskInput {
  benchmarkId: string;
  sourceRef: string;
  taskId: string;
  scenarioId: string;
  industryCategory?: string;
  professionalDomain?: string;
  difficultyLevel?: number | null;
  datasetManifestHash?: string | null;
  scenarioManifestHash?: string | null;
  worldModelConfigHash?: string | null;
  toolSchemaHash?: string | null;
  agentConfigHash?: string | null;
  faultInjectionConfigHash?: string | null;
  verifierRubricHash?: string | null;
  verifierVoteManifestHash?: string | null;
  trajectoryHash?: string | null;
  resultArtifactHash?: string | null;
  replayConfigHash?: string | null;
  debugTraceHash?: string | null;
  environmentMode?: QuestionScoreProfessionalTaskEnvironmentMode;
  faultMode?: QuestionScoreProfessionalTaskFaultMode;
  verifierVoteCount?: number | null;
  minVerifierVoteCount?: number | null;
  passRate0to1?: number | null;
  minPassRate0to1?: number | null;
  robustnessScore0to1?: number | null;
  minRobustnessScore0to1?: number | null;
  trajectoryStepCount?: number | null;
  maxTrajectoryStepCount?: number | null;
  status: QuestionScoreCriterionStatus;
  evidenceRefs?: string[];
  rejectedEvidenceRefs?: string[];
  repairHint?: string;
}

export interface QuestionExplainabilityIotFirmwareQuestionInput {
  benchmarkId: string;
  sourceRef: string;
  taskId: string;
  platform?: QuestionScoreIotFirmwarePlatform;
  boardId?: string;
  chipFamily?: string;
  firmwareProjectHash?: string | null;
  toolchainManifestHash?: string | null;
  sdkVersionManifestHash?: string | null;
  hardwareSessionHash?: string | null;
  deviceLogBundleHash?: string | null;
  buildArtifactHash?: string | null;
  flashArtifactHash?: string | null;
  testArtifactHash?: string | null;
  knowledgePackManifestHash?: string | null;
  taskManifestHash?: string | null;
  evaluatorConfigHash?: string | null;
  resultArtifactHash?: string | null;
  privacyBoundaryHash?: string | null;
  benchmarkReportHash?: string | null;
  hardwareRunCount?: number | null;
  deviceCount?: number | null;
  bugClosureRate0to1?: number | null;
  minBugClosureRate0to1?: number | null;
  tokenEfficiencyRatio?: number | null;
  minTokenEfficiencyRatio?: number | null;
  logCaptureCoverage0to1?: number | null;
  minLogCaptureCoverage0to1?: number | null;
  status: QuestionScoreCriterionStatus;
  evidenceRefs?: string[];
  rejectedEvidenceRefs?: string[];
  repairHint?: string;
}

export interface QuestionExplainabilityRetailSalesQuestionInput {
  benchmarkId: string;
  sourceRef: string;
  taskId: string;
  salesChannel?: QuestionScoreRetailSalesChannel;
  productCatalogHash?: string | null;
  productDescriptionHash?: string | null;
  customerScenarioHash?: string | null;
  conversationTraceHash?: string | null;
  customerIntentManifestHash?: string | null;
  orderCaptureSchemaHash?: string | null;
  orderLedgerHash?: string | null;
  pricingPolicyHash?: string | null;
  discountPolicyHash?: string | null;
  modelAdapterManifestHash?: string | null;
  modelProviderMatrixHash?: string | null;
  promptPolicyHash?: string | null;
  recommendationPolicyHash?: string | null;
  safetyPolicyHash?: string | null;
  privacyBoundaryHash?: string | null;
  evaluatorConfigHash?: string | null;
  resultArtifactHash?: string | null;
  benchmarkReportHash?: string | null;
  modelProviderCount?: number | null;
  customerScenarioCount?: number | null;
  orderCount?: number | null;
  orderCaptureAccuracy0to1?: number | null;
  minOrderCaptureAccuracy0to1?: number | null;
  policyComplianceRate0to1?: number | null;
  minPolicyComplianceRate0to1?: number | null;
  recommendationGrounding0to1?: number | null;
  minRecommendationGrounding0to1?: number | null;
  piiRedactionRate0to1?: number | null;
  minPiiRedactionRate0to1?: number | null;
  status: QuestionScoreCriterionStatus;
  evidenceRefs?: string[];
  rejectedEvidenceRefs?: string[];
  repairHint?: string;
}

export interface QuestionExplainabilityContinualLearningBenchmarkInput {
  benchmarkId: string;
  sourceRef: string;
  domainId: string;
  workflowId: string;
  datasetManifestHash?: string | null;
  stateSchemaHash?: string | null;
  initialStateHash?: string | null;
  stateMutationTraceHash?: string | null;
  conversationTraceHash?: string | null;
  entityRelationshipGraphHash?: string | null;
  toolExecutionTraceHash?: string | null;
  evaluatorConfigHash?: string | null;
  resultArtifactHash?: string | null;
  replayCommandHash?: string | null;
  memoryPolicyHash?: string | null;
  adaptiveLearningTraceHash?: string | null;
  scenarioCount?: number | null;
  turnCount?: number | null;
  stateMutationCount?: number | null;
  entityCount?: number | null;
  taskCompletionRate0to1?: number | null;
  minTaskCompletionRate0to1?: number | null;
  responseQualityScore0to1?: number | null;
  minResponseQualityScore0to1?: number | null;
  stateAccuracy0to1?: number | null;
  minStateAccuracy0to1?: number | null;
  retentionScore0to1?: number | null;
  minRetentionScore0to1?: number | null;
  tokenCostUsd?: number | null;
  maxTokenCostUsd?: number | null;
  status: QuestionScoreCriterionStatus;
  evidenceRefs?: string[];
  rejectedEvidenceRefs?: string[];
  repairHint?: string;
}

export interface QuestionExplainabilityHermesTurboPerformanceInput {
  benchmarkId: string;
  sourceRef: string;
  repositoryRef?: string;
  licenseRef?: string | null;
  licenseSpdxId?: string | null;
  defaultBranch?: string;
  sourceCommitSha?: string | null;
  sourceTreeSha?: string | null;
  sourceStatusHash?: string | null;
  readmeArtifactHash?: string | null;
  packageManifestHash?: string | null;
  benchmarkWorkflowHash?: string | null;
  perfBudgetWorkflowHash?: string | null;
  dailyScoreWorkflowHash?: string | null;
  turboScoreScriptHash?: string | null;
  performanceDashboardHash?: string | null;
  benchmarkReportHash?: string | null;
  baselineResultHash?: string | null;
  candidateResultHash?: string | null;
  latencyTraceHash?: string | null;
  throughputTraceHash?: string | null;
  scoreManifestHash?: string | null;
  regressionThresholdHash?: string | null;
  ciRunId?: string | null;
  ciConfigHash?: string | null;
  performanceFacet?: QuestionScoreHermesTurboPerformanceFacet;
  runCount?: number | null;
  minRunCount?: number | null;
  latencyP50Ms?: number | null;
  maxLatencyP50Ms?: number | null;
  latencyP95Ms?: number | null;
  maxLatencyP95Ms?: number | null;
  throughputOpsPerSec?: number | null;
  minThroughputOpsPerSec?: number | null;
  speedupFactor?: number | null;
  minSpeedupFactor?: number | null;
  scoreDelta0to1?: number | null;
  minScoreDelta0to1?: number | null;
  dashboardCoverage0to1?: number | null;
  minDashboardCoverage0to1?: number | null;
  regressionPassRate0to1?: number | null;
  minRegressionPassRate0to1?: number | null;
  status: QuestionScoreCriterionStatus;
  evidenceRefs?: string[];
  rejectedEvidenceRefs?: string[];
  repairHint?: string;
}

export interface QuestionExplainabilityScorableStudioDrilldownInput {
  drilldownId: string;
  sourceRef: string;
  repositoryRef?: string;
  licenseRef?: string | null;
  licenseSpdxId?: string | null;
  defaultBranch?: string;
  sourceCommitSha?: string | null;
  sourceTreeSha?: string | null;
  readmeArtifactHash?: string | null;
  pythonPackageManifestHash?: string | null;
  pythonOpenApiHash?: string | null;
  pythonClientHash?: string | null;
  pythonExecutionLogsHash?: string | null;
  pythonEvaluatorApiHash?: string | null;
  pythonExecutionLogApiHash?: string | null;
  cliPackageManifestHash?: string | null;
  cliLockfileHash?: string | null;
  cliEvaluatorCommandHash?: string | null;
  cliJudgeCommandHash?: string | null;
  cliExecutionLogCommandHash?: string | null;
  cliOtelTraceCommandHash?: string | null;
  cliFileUploadCommandHash?: string | null;
  typescriptPackageManifestHash?: string | null;
  typescriptLockfileHash?: string | null;
  typescriptSourceTreeHash?: string | null;
  npmPackageRef?: string | null;
  npmPackageIntegrity?: string | null;
  npmCliPackageRef?: string | null;
  npmCliPackageIntegrity?: string | null;
  studioSurface?: QuestionScoreScorableStudioSurface;
  uiRoutePath?: string;
  sourceArtifactLinks?: string[];
  tracePreviewHash?: string | null;
  receiptPreviewHash?: string | null;
  policyRulePreviewHash?: string | null;
  sourceArtifactPreviewHash?: string | null;
  emptyStateHash?: string | null;
  errorStateHash?: string | null;
  evidencePreviewState?: QuestionScoreScorableEvidencePreviewState;
  evidencePreviewCount?: number | null;
  minEvidencePreviewCount?: number | null;
  sourceArtifactLinkCount?: number | null;
  minSourceArtifactLinkCount?: number | null;
  status: QuestionScoreCriterionStatus;
  evidenceRefs?: string[];
  rejectedEvidenceRefs?: string[];
  repairHint?: string;
}

export interface QuestionExplainabilityObsStudioDrilldownInput {
  drilldownId: string;
  sourceRef: string;
  sourceKind?: QuestionScoreObsStudioSourceKind;
  openAlexWorkId?: string | null;
  doi?: string | null;
  publisherRef?: string | null;
  titleRef?: string | null;
  venueRef?: string | null;
  publicationDate?: string | null;
  uiRoutePath?: string;
  sourceArtifactLinks?: string[];
  tracePreviewHash?: string | null;
  reasoningTracePreviewHash?: string | null;
  receiptPreviewHash?: string | null;
  evidencePreviewHash?: string | null;
  sourceArtifactPreviewHash?: string | null;
  emptyStateHash?: string | null;
  errorStateHash?: string | null;
  evidencePreviewState?: QuestionScoreObsStudioEvidencePreviewState;
  evidencePreviewCount?: number | null;
  minEvidencePreviewCount?: number | null;
  sourceArtifactLinkCount?: number | null;
  minSourceArtifactLinkCount?: number | null;
  status: QuestionScoreCriterionStatus;
  evidenceRefs?: string[];
  rejectedEvidenceRefs?: string[];
  repairHint?: string;
}

export interface QuestionExplainabilityInputRow {
  question: DiagnosticQuestion;
  score: QuestionScore;
  acceptedEvidence: QuestionExplainabilityEvidenceEvent[];
  rejectedEvidence: QuestionRejectedEvidenceInput[];
  componentDiagnostics?: QuestionExplainabilityComponentInput[];
  criteriaDiagnostics?: QuestionExplainabilityCriterionInput[];
  rubricLens?: QuestionExplainabilityRubricLensInput[];
  ragFlowDiagnostics?: QuestionExplainabilityRagFlowInput[];
  landscapeLens?: QuestionExplainabilityLandscapeInput[];
  incidentTriageLens?: QuestionExplainabilityIncidentTriageInput[];
  benchmarkSubmissionLens?: QuestionExplainabilityBenchmarkSubmissionInput[];
  testSuiteEvaluationLens?: QuestionExplainabilityTestSuiteEvaluationInput[];
  evalAiLibraryQuestionLens?: QuestionExplainabilityEvalAiLibraryQuestionInput[];
  openModelRagQuestionLens?: QuestionExplainabilityOpenModelRagQuestionInput[];
  opikEvaluationQuestionLens?: QuestionExplainabilityOpikEvaluationQuestionInput[];
  statisticalAgentTrialLens?: QuestionExplainabilityAgentTrialStatisticalInput[];
  codeQuestQualityLens?: QuestionExplainabilityCodeQuestQualityInput[];
  multiUserBenchmarkLens?: QuestionExplainabilityMultiUserBenchmarkInput[];
  professionalTaskLens?: QuestionExplainabilityProfessionalTaskInput[];
  iotFirmwareQuestionLens?: QuestionExplainabilityIotFirmwareQuestionInput[];
  retailSalesQuestionLens?: QuestionExplainabilityRetailSalesQuestionInput[];
  continualLearningBenchmarkLens?: QuestionExplainabilityContinualLearningBenchmarkInput[];
  hermesTurboPerformanceLens?: QuestionExplainabilityHermesTurboPerformanceInput[];
  scorableStudioDrilldownLens?: QuestionExplainabilityScorableStudioDrilldownInput[];
  obsStudioDrilldownLens?: QuestionExplainabilityObsStudioDrilldownInput[];
  missingGateReasons: string[];
}

export interface BuildQuestionExplainabilityReportInput {
  agentId: string;
  runId: string;
  generatedAt: string;
  sourceRefs?: string[];
  rows: QuestionExplainabilityInputRow[];
}

export interface EvalScoreExplainabilityThresholdRef {
  id: string;
  actual: number | null;
  threshold: number | null;
  operator: "gte" | "lte";
  passed: boolean;
}

export interface EvalScoreExplainabilityEvalPackRef {
  packId: string;
  sourceRef: string;
  kind: "test_suite_evaluation" | "eval_ai_library_question";
  manifestHashes: Record<string, string | null>;
  ciRunId: string | null;
  ciConfigHash: string | null;
  rowHash: string;
}

export interface EvalScoreExplainabilityPackRow {
  questionId: string;
  acceptedEvidenceIds: string[];
  rejectedEvidenceReasons: Array<{ evidenceId: string; reason: string }>;
  repairHint: string;
  signedEvidenceRows: QuestionScoreSignedEvidenceRef[];
  reproducibleEvalPacks: EvalScoreExplainabilityEvalPackRef[];
  failClosedThresholds: EvalScoreExplainabilityThresholdRef[];
  status: "ready" | "fail_closed";
  rowHash: string;
}

export interface EvalScoreExplainabilityPack {
  v: 1;
  generatedAt: string;
  agentId: string;
  runId: string;
  sourceRefs: string[];
  replayable: boolean;
  failClosed: boolean;
  rows: EvalScoreExplainabilityPackRow[];
  packHash: string;
}

function unique(input: string[]): string[] {
  return [...new Set(input.filter((row) => row.trim().length > 0))];
}

function firstSentence(input: string): string {
  const compact = input.replace(/\s+/g, " ").trim();
  if (!compact) {
    return "";
  }
  const match = compact.match(/^.*?[.!?](?:\s|$)/);
  return (match?.[0] ?? compact).trim();
}

function signedEvidenceRef(event: QuestionExplainabilityEvidenceEvent): QuestionScoreSignedEvidenceRef {
  return {
    evidenceId: event.id,
    eventHash: event.event_hash,
    writerSig: event.writer_sig,
    eventType: event.event_type,
    sessionId: event.session_id,
    ts: event.ts,
    trustTier: event.trustTier
  };
}

function rejectedEvidenceRef(input: QuestionRejectedEvidenceInput): QuestionScoreRejectedEvidenceRef {
  return {
    ...signedEvidenceRef(input.event),
    reason: input.reason
  };
}

function normalizeComponentDiagnostic(input: QuestionExplainabilityComponentInput): QuestionScoreComponentDiagnosticRef {
  return {
    componentId: input.componentId.trim() || "unknown-component",
    componentType: input.componentType,
    status: input.status,
    evidenceRefs: unique(input.evidenceRefs ?? []),
    rejectedEvidenceRefs: unique(input.rejectedEvidenceRefs ?? []),
    repairHint: input.repairHint?.trim() || "Inspect component evidence and attach signed proof for the failed question gate."
  };
}

function normalizeCriterionDiagnostic(input: QuestionExplainabilityCriterionInput): QuestionScoreCriterionDiagnosticRef {
  return {
    criterionId: input.criterionId.trim() || "unknown-criterion",
    criterionType: input.criterionType,
    status: input.status,
    evidenceRefs: unique(input.evidenceRefs ?? []),
    rejectedEvidenceRefs: unique(input.rejectedEvidenceRefs ?? []),
    judgeRef: input.judgeRef?.trim() || null,
    repairHint: input.repairHint?.trim() || "Attach signed evidence to the relevant evaluation criterion and rerun the question gate."
  };
}

function isSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

function isGitSha(value: string): boolean {
  return /^[a-f0-9]{40}$/i.test(value);
}

function score0to100(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
}

function nonNegativeWeight(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value * 100) / 100);
}

function normalizeRubricCheck(input: QuestionExplainabilityRubricCheckInput): QuestionScoreRubricCheckRef {
  return {
    checkId: input.checkId.trim() || "unknown-rubric-check",
    pillar: input.pillar.trim() || "general",
    status: input.status,
    weight: nonNegativeWeight(input.weight),
    evidenceRefs: unique(input.evidenceRefs ?? []),
    rejectedEvidenceRefs: unique(input.rejectedEvidenceRefs ?? []),
    fixHint: input.fixHint?.trim() || "Attach evidence and a concrete fix for this rubric check before relying on the question score."
  };
}

function normalizeRubricLens(input: QuestionExplainabilityRubricLensInput): QuestionScoreRubricLensRef {
  return {
    rubricId: input.rubricId.trim() || "unknown-rubric",
    rubricVersion: input.rubricVersion.trim() || "unknown-version",
    rubricSource: input.rubricSource?.trim() || "amc:question-explainability-rubric",
    skillType: input.skillType ?? "general",
    score0to100: score0to100(input.score0to100),
    grade: input.grade?.trim() || "ungraded",
    deepReviewCertificateHash: input.deepReviewCertificateHash?.trim().toLowerCase() || null,
    marketSignalRefs: unique(input.marketSignalRefs ?? []),
    checks: input.checks.map(normalizeRubricCheck)
  };
}

function nullableString(input: string | null | undefined): string | null {
  const value = input?.trim();
  return value && value.length > 0 ? value : null;
}

function nullableHash(input: string | null | undefined): string | null {
  return nullableString(input)?.toLowerCase() ?? null;
}

function nullableSha256Hash(input: string | null | undefined): string | null {
  const value = nullableHash(input);
  return value !== null && isSha256(value) ? value : null;
}

function nullableGitSha(input: string | null | undefined): string | null {
  const value = nullableHash(input);
  return value !== null && isGitSha(value) ? value : null;
}

function uniqueHashes(input: string[]): string[] {
  return unique(input.map((value) => value.trim().toLowerCase()));
}

const ragVectorBackends = new Set<QuestionScoreRagVectorSearchBackend>([
  "azure_search",
  "cosmos_mongo",
  "cosmos_postgresql",
  "postgresql_flex",
  "custom"
]);

function normalizeRagVectorBackend(input: QuestionScoreRagVectorSearchBackend | undefined): QuestionScoreRagVectorSearchBackend {
  return input && ragVectorBackends.has(input) ? input : "custom";
}

function normalizeRagFlowDiagnostic(input: QuestionExplainabilityRagFlowInput): QuestionScoreRagFlowDiagnosticRef {
  return {
    flowId: input.flowId.trim() || "unknown-rag-flow",
    vectorSearchBackend: normalizeRagVectorBackend(input.vectorSearchBackend),
    flowDagHash: nullableHash(input.flowDagHash),
    paramConfigHash: nullableHash(input.paramConfigHash),
    evalSetHash: nullableHash(input.evalSetHash),
    batchRunId: nullableString(input.batchRunId),
    evaluatorFlowHash: nullableHash(input.evaluatorFlowHash),
    groundTruthColumn: nullableString(input.groundTruthColumn),
    dataMappingHash: nullableHash(input.dataMappingHash),
    variantId: nullableString(input.variantId),
    variantConfigHash: nullableHash(input.variantConfigHash),
    deploymentArtifactHash: nullableHash(input.deploymentArtifactHash),
    metricIds: unique(input.metricIds ?? []),
    status: input.status,
    evidenceRefs: unique(input.evidenceRefs ?? []),
    rejectedEvidenceRefs: unique(input.rejectedEvidenceRefs ?? []),
    repairHint: input.repairHint?.trim() || "Attach Promptflow RAG flow, evalset, evaluator, data mapping, variant, and deployment evidence before relying on this question score."
  };
}

const landscapeCategories = new Set<QuestionScoreLandscapeCategory>([
  "ai_coding_agent",
  "oss_ai_coding_agent",
  "cli_tool",
  "desktop_ide",
  "ai_ide",
  "ai_app_builder",
  "mobile_app_builder",
  "oss_ai_app_builder",
  "ai_devtool",
  "ai_coding_leaderboard",
  "developer_survey",
  "ai_coding_model",
  "custom"
]);

const landscapeCadences = new Set<QuestionScoreLandscapeUpdateCadence>([
  "daily",
  "weekly",
  "bimonthly",
  "monthly",
  "quarterly",
  "ad_hoc",
  "unknown",
  "custom"
]);

function normalizeLandscapeCategory(input: QuestionScoreLandscapeCategory | undefined): QuestionScoreLandscapeCategory {
  return input && landscapeCategories.has(input) ? input : "custom";
}

function normalizeLandscapeCadence(input: QuestionScoreLandscapeUpdateCadence | undefined): QuestionScoreLandscapeUpdateCadence {
  return input && landscapeCadences.has(input) ? input : "unknown";
}

function nullableNonNegativeDays(input: number | null | undefined): number | null {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return null;
  }
  return Math.max(0, Math.round(input * 100) / 100);
}

function normalizeLandscapeLens(input: QuestionExplainabilityLandscapeInput): QuestionScoreLandscapeLensRef {
  return {
    landscapeId: input.landscapeId.trim() || "unknown-landscape",
    sourceRef: input.sourceRef.trim() || "unknown-source",
    category: normalizeLandscapeCategory(input.category),
    datasetRefs: unique(input.datasetRefs ?? []),
    datasetHashes: uniqueHashes(input.datasetHashes ?? []),
    updateCadence: normalizeLandscapeCadence(input.updateCadence),
    lastVerifiedAt: nullableString(input.lastVerifiedAt),
    freshnessDays: nullableNonNegativeDays(input.freshnessDays),
    maxAllowedFreshnessDays: nullableNonNegativeDays(input.maxAllowedFreshnessDays),
    cohortRefs: unique(input.cohortRefs ?? []),
    benchmarkRefs: unique(input.benchmarkRefs ?? []),
    toolOrModelRefs: unique(input.toolOrModelRefs ?? []),
    status: input.status,
    evidenceRefs: unique(input.evidenceRefs ?? []),
    rejectedEvidenceRefs: unique(input.rejectedEvidenceRefs ?? []),
    repairHint: input.repairHint?.trim() || "Attach AI-coding landscape source, category, dataset hashes, freshness, cohort/benchmark refs, accepted/rejected evidence, and rerun question explainability."
  };
}

const incidentTriageDifficulties = new Set<QuestionScoreIncidentTriageDifficulty>(["easy", "medium", "hard", "custom"]);
const incidentTriageSeverities = new Set<QuestionScoreIncidentTriageSeverity>(["p0", "p1", "p2", "custom"]);

function normalizeIncidentDifficulty(
  input: QuestionScoreIncidentTriageDifficulty | undefined,
): QuestionScoreIncidentTriageDifficulty {
  return input && incidentTriageDifficulties.has(input) ? input : "custom";
}

function normalizeIncidentSeverity(
  input: QuestionScoreIncidentTriageSeverity | undefined,
): QuestionScoreIncidentTriageSeverity {
  return input && incidentTriageSeverities.has(input) ? input : "custom";
}

function nullableRate(input: number | null | undefined): number | null {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return null;
  }
  return Math.max(0, Math.min(1, Math.round(input * 10000) / 10000));
}

function positiveInteger(input: number | null | undefined): number | null {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return null;
  }
  const value = Math.trunc(input);
  return value > 0 ? value : null;
}

function normalizeIncidentTriageLens(input: QuestionExplainabilityIncidentTriageInput): QuestionScoreIncidentTriageLensRef {
  const withoutHash: Omit<QuestionScoreIncidentTriageLensRef, "rowHash"> = {
    environmentId: input.environmentId.trim() || "unknown-incident-environment",
    sourceRef: input.sourceRef.trim() || "unknown-source",
    taskId: input.taskId.trim() || "unknown-task",
    scenarioId: input.scenarioId.trim() || "unknown-scenario",
    difficulty: normalizeIncidentDifficulty(input.difficulty),
    severity: normalizeIncidentSeverity(input.severity),
    openEnvConfigHash: nullableHash(input.openEnvConfigHash),
    scenarioManifestHash: nullableHash(input.scenarioManifestHash),
    incidentReportHash: nullableHash(input.incidentReportHash),
    rawLogBundleHash: nullableHash(input.rawLogBundleHash),
    metricSnapshotHash: nullableHash(input.metricSnapshotHash),
    userReportHash: nullableHash(input.userReportHash),
    actionPayloadHash: nullableHash(input.actionPayloadHash),
    graderConfigHash: nullableHash(input.graderConfigHash),
    feedbackHash: nullableHash(input.feedbackHash),
    reward0to1: nullableRate(input.reward0to1),
    minReward0to1: nullableRate(input.minReward0to1),
    rootCauseScore0to1: nullableRate(input.rootCauseScore0to1),
    minRootCauseScore0to1: nullableRate(input.minRootCauseScore0to1),
    redHerringFilterScore0to1: nullableRate(input.redHerringFilterScore0to1),
    minRedHerringFilterScore0to1: nullableRate(input.minRedHerringFilterScore0to1),
    orderedRemediationScore0to1: nullableRate(input.orderedRemediationScore0to1),
    minOrderedRemediationScore0to1: nullableRate(input.minOrderedRemediationScore0to1),
    maxSteps: positiveInteger(input.maxSteps),
    stepCount: positiveInteger(input.stepCount),
    deterministicGrader: input.deterministicGrader === true,
    status: input.status,
    evidenceRefs: unique(input.evidenceRefs ?? []),
    rejectedEvidenceRefs: unique(input.rejectedEvidenceRefs ?? []),
    repairHint: input.repairHint?.trim() || "Attach SRE incident triage task, log, metric, user report, deterministic grader, reward, feedback, and remediation-order evidence before relying on this question score."
  };
  return {
    ...withoutHash,
    rowHash: sha256Hex(canonicalize(withoutHash))
  };
}

const benchmarkGradingTypes = new Set<QuestionScoreBenchmarkGradingType>([
  "automated",
  "llm_judge",
  "hybrid",
  "human",
  "custom"
]);

const benchmarkTaskStatuses = new Set<QuestionScoreBenchmarkTaskStatus>([
  "success",
  "warning",
  "timeout",
  "failed",
  "custom"
]);

const benchmarkMetricViews = new Set<QuestionScoreBenchmarkMetricView>([
  "success_rate",
  "speed",
  "cost",
  "category",
  "custom"
]);

function normalizeBenchmarkGradingType(
  input: QuestionScoreBenchmarkGradingType | undefined,
): QuestionScoreBenchmarkGradingType {
  return input && benchmarkGradingTypes.has(input) ? input : "custom";
}

function normalizeBenchmarkTaskStatus(
  input: QuestionScoreBenchmarkTaskStatus | undefined,
): QuestionScoreBenchmarkTaskStatus {
  return input && benchmarkTaskStatuses.has(input) ? input : "custom";
}

function normalizeBenchmarkMetricViews(input: QuestionScoreBenchmarkMetricView[] | undefined): QuestionScoreBenchmarkMetricView[] {
  return unique(input ?? []).filter((view): view is QuestionScoreBenchmarkMetricView =>
    benchmarkMetricViews.has(view as QuestionScoreBenchmarkMetricView)
  );
}

function normalizeNullableScore0to100(input: number | null | undefined): number | null {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return null;
  }
  return score0to100(input);
}

function nullableNonNegativeNumber(input: number | null | undefined): number | null {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return null;
  }
  return Math.max(0, Math.round(input * 10000) / 10000);
}

function normalizeBenchmarkCriterion(
  input: QuestionExplainabilityBenchmarkCriterionInput,
): QuestionScoreBenchmarkCriterionRef {
  return {
    criterionId: input.criterionId.trim() || "unknown-benchmark-criterion",
    criterionType: input.criterionType,
    score0to1: nullableRate(input.score0to1),
    weight: nonNegativeWeight(input.weight),
    status: input.status,
    gradingType: normalizeBenchmarkGradingType(input.gradingType),
    evidenceRefs: unique(input.evidenceRefs ?? []),
    rejectedEvidenceRefs: unique(input.rejectedEvidenceRefs ?? []),
    repairHint: input.repairHint?.trim() || "Attach benchmark task criterion evidence, grading context, and repair details before relying on this question score."
  };
}

function normalizeBenchmarkSubmissionLens(input: QuestionExplainabilityBenchmarkSubmissionInput): QuestionScoreBenchmarkSubmissionLensRef {
  const withoutHash: Omit<QuestionScoreBenchmarkSubmissionLensRef, "rowHash"> = {
    benchmarkId: input.benchmarkId.trim() || "unknown-benchmark",
    sourceRef: input.sourceRef.trim() || "unknown-source",
    submissionId: input.submissionId.trim() || "unknown-submission",
    submissionVersion: nullableString(input.submissionVersion),
    agentVersion: nullableString(input.agentVersion),
    submittedAt: nullableString(input.submittedAt),
    taskId: input.taskId.trim() || "unknown-task",
    taskCategory: input.taskCategory.trim() || "custom",
    taskStatus: normalizeBenchmarkTaskStatus(input.taskStatus),
    gradingType: normalizeBenchmarkGradingType(input.gradingType),
    overallScore0to100: normalizeNullableScore0to100(input.overallScore0to100),
    categoryScore0to100: normalizeNullableScore0to100(input.categoryScore0to100),
    speedMs: nullableNonNegativeNumber(input.speedMs),
    costUsd: nullableNonNegativeNumber(input.costUsd),
    leaderboardMetricViews: normalizeBenchmarkMetricViews(input.leaderboardMetricViews),
    submissionMetadataHash: nullableHash(input.submissionMetadataHash),
    taskBreakdownHash: nullableHash(input.taskBreakdownHash),
    leaderboardSnapshotHash: nullableHash(input.leaderboardSnapshotHash),
    criterionScores: (input.criterionScores ?? []).map(normalizeBenchmarkCriterion),
    status: input.status,
    evidenceRefs: unique(input.evidenceRefs ?? []),
    rejectedEvidenceRefs: unique(input.rejectedEvidenceRefs ?? []),
    repairHint: input.repairHint?.trim() || "Attach benchmark submission metadata, task breakdown, criterion scoring, status indicators, leaderboard snapshot, accepted/rejected evidence, and rerun question explainability."
  };
  return {
    ...withoutHash,
    rowHash: sha256Hex(canonicalize(withoutHash))
  };
}

const testSuiteLanguages = new Set<QuestionScoreTestSuiteLanguage>(["java", "kotlin", "python", "typescript", "custom"]);
const testSuiteFrameworks = new Set<QuestionScoreTestSuiteFramework>(["junit", "pytest", "vitest", "jest", "custom"]);
const testSuiteAdapters = new Set<QuestionScoreTestSuiteAdapter>([
  "spring_ai",
  "spring_ai_alibaba",
  "langchain4j",
  "koog",
  "embabel",
  "generic_llm_client",
  "custom"
]);

function normalizeTestSuiteLanguage(input: QuestionScoreTestSuiteLanguage | undefined): QuestionScoreTestSuiteLanguage {
  return input && testSuiteLanguages.has(input) ? input : "custom";
}

function normalizeTestSuiteFramework(input: QuestionScoreTestSuiteFramework | undefined): QuestionScoreTestSuiteFramework {
  return input && testSuiteFrameworks.has(input) ? input : "custom";
}

function normalizeTestSuiteAdapter(input: QuestionScoreTestSuiteAdapter | undefined): QuestionScoreTestSuiteAdapter {
  return input && testSuiteAdapters.has(input) ? input : "custom";
}

function normalizeTokenCount(input: number | null | undefined): number | null {
  return positiveInteger(input);
}

function nullableNonNegativeInteger(input: number | null | undefined): number | null {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return null;
  }
  const value = Math.trunc(input);
  return value >= 0 ? value : null;
}

function normalizeTestSuiteEvaluationLens(
  input: QuestionExplainabilityTestSuiteEvaluationInput,
): QuestionScoreTestSuiteEvaluationLensRef {
  const withoutHash: Omit<QuestionScoreTestSuiteEvaluationLensRef, "rowHash"> = {
    suiteId: input.suiteId.trim() || "unknown-test-suite",
    sourceRef: input.sourceRef.trim() || "unknown-source",
    language: normalizeTestSuiteLanguage(input.language),
    testFramework: normalizeTestSuiteFramework(input.testFramework),
    adapter: normalizeTestSuiteAdapter(input.adapter),
    datasetRef: input.datasetRef.trim() || "unknown-dataset",
    datasetHash: nullableHash(input.datasetHash),
    testCaseId: input.testCaseId.trim() || "unknown-test-case",
    testCaseHash: nullableHash(input.testCaseHash),
    evaluatorIds: unique(input.evaluatorIds ?? []),
    evaluatorConfigHash: nullableHash(input.evaluatorConfigHash),
    judgeModelRef: nullableString(input.judgeModelRef),
    experimentRunId: nullableString(input.experimentRunId),
    experimentResultHash: nullableHash(input.experimentResultHash),
    exportArtifactHash: nullableHash(input.exportArtifactHash),
    ciRunId: nullableString(input.ciRunId),
    ciConfigHash: nullableHash(input.ciConfigHash),
    traceArtifactHash: nullableHash(input.traceArtifactHash),
    toolCallValidationHash: nullableHash(input.toolCallValidationHash),
    agentBehaviorEvaluation: input.agentBehaviorEvaluation === true,
    passRate0to1: nullableRate(input.passRate0to1),
    minPassRate0to1: nullableRate(input.minPassRate0to1),
    averageScore0to1: nullableRate(input.averageScore0to1),
    threshold0to1: nullableRate(input.threshold0to1),
    costUsd: nullableNonNegativeNumber(input.costUsd),
    latencyMs: nullableNonNegativeNumber(input.latencyMs),
    tokenCount: normalizeTokenCount(input.tokenCount),
    status: input.status,
    evidenceRefs: unique(input.evidenceRefs ?? []),
    rejectedEvidenceRefs: unique(input.rejectedEvidenceRefs ?? []),
    repairHint: input.repairHint?.trim() || "Attach test-suite, dataset, test-case, evaluator, CI run, experiment export, trace, and repair evidence before relying on this question score."
  };
  return {
    ...withoutHash,
    rowHash: sha256Hex(canonicalize(withoutHash))
  };
}

const evalAiLibraryMetricFamilies = new Set<QuestionScoreEvalAiLibraryMetricFamily>([
  "rag",
  "agent",
  "security",
  "mixed",
  "custom"
]);

function normalizeEvalAiLibraryMetricFamily(
  input: QuestionScoreEvalAiLibraryMetricFamily | undefined,
): QuestionScoreEvalAiLibraryMetricFamily {
  return input && evalAiLibraryMetricFamilies.has(input) ? input : "custom";
}

function nullableSourceHash(input: string | null | undefined): string | null {
  const value = nullableHash(input);
  return value !== null && (isSha256(value) || isGitSha(value)) ? value : null;
}

function normalizeEvalAiLibraryQuestionLens(
  input: QuestionExplainabilityEvalAiLibraryQuestionInput,
): QuestionScoreEvalAiLibraryQuestionLensRef {
  const metricIds = unique(input.metricIds ?? []);
  const metricCount = positiveInteger(input.metricCount) ?? (metricIds.length > 0 ? metricIds.length : null);
  const withoutHash: Omit<QuestionScoreEvalAiLibraryQuestionLensRef, "rowHash"> = {
    frameworkId: input.frameworkId.trim() || "unknown-eval-ai-library-framework",
    sourceRef: input.sourceRef.trim() || "unknown-source",
    repositoryRef: input.repositoryRef?.trim() || "unknown-repository",
    licenseRef: nullableString(input.licenseRef),
    licenseSpdxId: nullableString(input.licenseSpdxId),
    defaultBranch: input.defaultBranch?.trim() || "unknown-branch",
    sourceCommitSha: nullableGitSha(input.sourceCommitSha),
    sourceTreeSha: nullableGitSha(input.sourceTreeSha),
    sourceStatusHash: nullableSha256Hash(input.sourceStatusHash),
    readmeArtifactHash: nullableSourceHash(input.readmeArtifactHash),
    licenseArtifactHash: nullableSourceHash(input.licenseArtifactHash),
    noticeArtifactHash: nullableSourceHash(input.noticeArtifactHash),
    pyprojectArtifactHash: nullableSourceHash(input.pyprojectArtifactHash),
    requirementsArtifactHash: nullableSourceHash(input.requirementsArtifactHash),
    evalLibTreeHash: nullableSourceHash(input.evalLibTreeHash),
    metricsTreeHash: nullableSourceHash(input.metricsTreeHash),
    agentMetricsTreeHash: nullableSourceHash(input.agentMetricsTreeHash),
    securityMetricsTreeHash: nullableSourceHash(input.securityMetricsTreeHash),
    tracingTreeHash: nullableSourceHash(input.tracingTreeHash),
    dashboardArtifactHash: nullableSourceHash(input.dashboardArtifactHash),
    evaluationSchemaHash: nullableSourceHash(input.evaluationSchemaHash),
    testcasesSchemaHash: nullableSourceHash(input.testcasesSchemaHash),
    metricPatternHash: nullableSourceHash(input.metricPatternHash),
    llmClientHash: nullableSourceHash(input.llmClientHash),
    evalPackManifestHash: nullableSha256Hash(input.evalPackManifestHash),
    datasetManifestHash: nullableSha256Hash(input.datasetManifestHash),
    questionSetHash: nullableSha256Hash(input.questionSetHash),
    questionTraceHash: nullableSha256Hash(input.questionTraceHash),
    evaluatorConfigHash: nullableSha256Hash(input.evaluatorConfigHash),
    metricResultHash: nullableSha256Hash(input.metricResultHash),
    scoreBreakdownHash: nullableSha256Hash(input.scoreBreakdownHash),
    rejectedEvidenceLedgerHash: nullableSha256Hash(input.rejectedEvidenceLedgerHash),
    repairHintHash: nullableSha256Hash(input.repairHintHash),
    regressionThresholdHash: nullableSha256Hash(input.regressionThresholdHash),
    ciRunId: nullableString(input.ciRunId),
    ciConfigHash: nullableSha256Hash(input.ciConfigHash),
    noSourceCopyBoundaryHash: nullableSha256Hash(input.noSourceCopyBoundaryHash),
    metricFamily: normalizeEvalAiLibraryMetricFamily(input.metricFamily),
    metricIds,
    providerCount: positiveInteger(input.providerCount),
    minProviderCount: positiveInteger(input.minProviderCount),
    metricCount,
    minMetricCount: positiveInteger(input.minMetricCount),
    questionCount: positiveInteger(input.questionCount),
    minQuestionCount: positiveInteger(input.minQuestionCount),
    evidenceCoverage0to1: nullableRate(input.evidenceCoverage0to1),
    minEvidenceCoverage0to1: nullableRate(input.minEvidenceCoverage0to1),
    rejectedEvidenceReasonCoverage0to1: nullableRate(input.rejectedEvidenceReasonCoverage0to1),
    minRejectedEvidenceReasonCoverage0to1: nullableRate(input.minRejectedEvidenceReasonCoverage0to1),
    repairHintCoverage0to1: nullableRate(input.repairHintCoverage0to1),
    minRepairHintCoverage0to1: nullableRate(input.minRepairHintCoverage0to1),
    regressionPassRate0to1: nullableRate(input.regressionPassRate0to1),
    minRegressionPassRate0to1: nullableRate(input.minRegressionPassRate0to1),
    scoreConfidence0to1: nullableRate(input.scoreConfidence0to1),
    minScoreConfidence0to1: nullableRate(input.minScoreConfidence0to1),
    status: input.status,
    evidenceRefs: unique(input.evidenceRefs ?? []),
    rejectedEvidenceRefs: unique(input.rejectedEvidenceRefs ?? []),
    repairHint: input.repairHint?.trim() || "Attach eval-ai-library source, metric catalog, question id, accepted evidence ids, rejected evidence reasons, repair hint, score breakdown, CI threshold, and no-copy proof before relying on this question score."
  };
  return {
    ...withoutHash,
    rowHash: sha256Hex(canonicalize(withoutHash))
  };
}

const openModelRagRuntimes = new Set<QuestionScoreOpenModelRagRuntime>([
  "ollama_langchain4j",
  "ollama",
  "langchain4j",
  "local_jvm",
  "mixed",
  "custom"
]);

function normalizeOpenModelRagRuntime(
  input: QuestionScoreOpenModelRagRuntime | undefined,
): QuestionScoreOpenModelRagRuntime {
  return input && openModelRagRuntimes.has(input) ? input : "custom";
}

function normalizeOpenModelRagQuestionLens(
  input: QuestionExplainabilityOpenModelRagQuestionInput,
): QuestionScoreOpenModelRagQuestionLensRef {
  const withoutHash: Omit<QuestionScoreOpenModelRagQuestionLensRef, "rowHash"> = {
    frameworkId: input.frameworkId.trim() || "unknown-open-model-rag-framework",
    sourceRef: input.sourceRef.trim() || "unknown-source",
    repositoryRef: input.repositoryRef?.trim() || "unknown-repository",
    licenseRef: nullableString(input.licenseRef),
    licenseSpdxId: nullableString(input.licenseSpdxId),
    licenseBoundaryHash: nullableSha256Hash(input.licenseBoundaryHash),
    defaultBranch: input.defaultBranch?.trim() || "unknown-branch",
    sourceCommitSha: nullableGitSha(input.sourceCommitSha),
    sourceTreeSha: nullableGitSha(input.sourceTreeSha),
    sourceStatusHash: nullableSha256Hash(input.sourceStatusHash),
    readmeArtifactHash: nullableSourceHash(input.readmeArtifactHash),
    javaSourceTreeHash: nullableSourceHash(input.javaSourceTreeHash),
    buildConfigHash: nullableSourceHash(input.buildConfigHash),
    dependencyManifestHash: nullableSourceHash(input.dependencyManifestHash),
    langChain4jIntegrationHash: nullableSourceHash(input.langChain4jIntegrationHash),
    ollamaRuntimeConfigHash: nullableSourceHash(input.ollamaRuntimeConfigHash),
    ragPipelineHash: nullableSourceHash(input.ragPipelineHash),
    ragCorpusManifestHash: nullableSourceHash(input.ragCorpusManifestHash),
    embeddingConfigHash: nullableSourceHash(input.embeddingConfigHash),
    retrievalTraceHash: nullableSha256Hash(input.retrievalTraceHash),
    evaluationManifestHash: nullableSourceHash(input.evaluationManifestHash),
    questionSetHash: nullableSha256Hash(input.questionSetHash),
    questionTraceHash: nullableSha256Hash(input.questionTraceHash),
    evaluatorConfigHash: nullableSha256Hash(input.evaluatorConfigHash),
    metricResultHash: nullableSha256Hash(input.metricResultHash),
    scoreBreakdownHash: nullableSha256Hash(input.scoreBreakdownHash),
    rejectedEvidenceLedgerHash: nullableSha256Hash(input.rejectedEvidenceLedgerHash),
    repairHintHash: nullableSha256Hash(input.repairHintHash),
    regressionThresholdHash: nullableSha256Hash(input.regressionThresholdHash),
    ciRunId: nullableString(input.ciRunId),
    ciConfigHash: nullableSha256Hash(input.ciConfigHash),
    noSourceCopyBoundaryHash: nullableSha256Hash(input.noSourceCopyBoundaryHash),
    runtime: normalizeOpenModelRagRuntime(input.runtime),
    openModelIds: unique(input.openModelIds ?? []),
    evaluationMetricIds: unique(input.evaluationMetricIds ?? []),
    ragQueryCount: positiveInteger(input.ragQueryCount),
    minRagQueryCount: positiveInteger(input.minRagQueryCount),
    retrievalGroundingScore0to1: nullableRate(input.retrievalGroundingScore0to1),
    minRetrievalGroundingScore0to1: nullableRate(input.minRetrievalGroundingScore0to1),
    answerRelevanceScore0to1: nullableRate(input.answerRelevanceScore0to1),
    minAnswerRelevanceScore0to1: nullableRate(input.minAnswerRelevanceScore0to1),
    evidenceCoverage0to1: nullableRate(input.evidenceCoverage0to1),
    minEvidenceCoverage0to1: nullableRate(input.minEvidenceCoverage0to1),
    rejectedEvidenceReasonCoverage0to1: nullableRate(input.rejectedEvidenceReasonCoverage0to1),
    minRejectedEvidenceReasonCoverage0to1: nullableRate(input.minRejectedEvidenceReasonCoverage0to1),
    repairHintCoverage0to1: nullableRate(input.repairHintCoverage0to1),
    minRepairHintCoverage0to1: nullableRate(input.minRepairHintCoverage0to1),
    regressionPassRate0to1: nullableRate(input.regressionPassRate0to1),
    minRegressionPassRate0to1: nullableRate(input.minRegressionPassRate0to1),
    status: input.status,
    evidenceRefs: unique(input.evidenceRefs ?? []),
    rejectedEvidenceRefs: unique(input.rejectedEvidenceRefs ?? []),
    repairHint: input.repairHint?.trim() || "Attach open-model RAG source snapshot, license/no-license boundary, Java/LangChain4j/Ollama/RAG proof, local model ids, evaluation manifest, question trace, score breakdown, rejected evidence, repair hints, CI threshold, no-source-copy proof, signed evidence, and row hash before relying on this question score."
  };
  return {
    ...withoutHash,
    rowHash: sha256Hex(canonicalize(withoutHash))
  };
}

const opikEvaluationMetricFamilies = new Set<QuestionScoreOpikEvaluationMetricFamily>([
  "trace_observability",
  "offline_experiment",
  "online_evaluation",
  "dataset_evaluation",
  "llm_judge",
  "custom"
]);

function normalizeOpikEvaluationMetricFamily(
  input: QuestionScoreOpikEvaluationMetricFamily | undefined,
): QuestionScoreOpikEvaluationMetricFamily {
  return input && opikEvaluationMetricFamilies.has(input) ? input : "custom";
}

function normalizeOpikEvaluationQuestionLens(
  input: QuestionExplainabilityOpikEvaluationQuestionInput,
): QuestionScoreOpikEvaluationQuestionLensRef {
  const withoutHash: Omit<QuestionScoreOpikEvaluationQuestionLensRef, "rowHash"> = {
    lensId: input.lensId.trim() || "unknown-opik-evaluation-lens",
    sourceRef: input.sourceRef.trim() || "unknown-source",
    productUrl: input.productUrl?.trim() || "https://www.comet.com/site/products/opik/",
    liveRelevanceCheckHash: nullableSha256Hash(input.liveRelevanceCheckHash),
    projectRef: nullableString(input.projectRef),
    experimentRef: nullableString(input.experimentRef),
    datasetManifestHash: nullableSha256Hash(input.datasetManifestHash),
    traceExportHash: nullableSha256Hash(input.traceExportHash),
    evalPackManifestHash: nullableSha256Hash(input.evalPackManifestHash),
    questionSetHash: nullableSha256Hash(input.questionSetHash),
    questionIdRef: input.questionIdRef?.trim() || "unknown-question-id",
    questionTraceHash: nullableSha256Hash(input.questionTraceHash),
    evaluatorConfigHash: nullableSha256Hash(input.evaluatorConfigHash),
    metricResultHash: nullableSha256Hash(input.metricResultHash),
    scoreBreakdownHash: nullableSha256Hash(input.scoreBreakdownHash),
    acceptedEvidenceLedgerHash: nullableSha256Hash(input.acceptedEvidenceLedgerHash),
    rejectedEvidenceLedgerHash: nullableSha256Hash(input.rejectedEvidenceLedgerHash),
    repairHintHash: nullableSha256Hash(input.repairHintHash),
    thresholdPolicyHash: nullableSha256Hash(input.thresholdPolicyHash),
    signedEvidenceRowsHash: nullableSha256Hash(input.signedEvidenceRowsHash),
    ciRunId: nullableString(input.ciRunId),
    ciConfigHash: nullableSha256Hash(input.ciConfigHash),
    noParityClaimHash: nullableSha256Hash(input.noParityClaimHash),
    noSourceCopyBoundaryHash: nullableSha256Hash(input.noSourceCopyBoundaryHash),
    metricFamily: normalizeOpikEvaluationMetricFamily(input.metricFamily),
    metricIds: unique(input.metricIds ?? []),
    traceCount: positiveInteger(input.traceCount),
    minTraceCount: positiveInteger(input.minTraceCount),
    questionCount: positiveInteger(input.questionCount),
    minQuestionCount: positiveInteger(input.minQuestionCount),
    evidenceCoverage0to1: nullableRate(input.evidenceCoverage0to1),
    minEvidenceCoverage0to1: nullableRate(input.minEvidenceCoverage0to1),
    rejectedEvidenceReasonCoverage0to1: nullableRate(input.rejectedEvidenceReasonCoverage0to1),
    minRejectedEvidenceReasonCoverage0to1: nullableRate(input.minRejectedEvidenceReasonCoverage0to1),
    repairHintCoverage0to1: nullableRate(input.repairHintCoverage0to1),
    minRepairHintCoverage0to1: nullableRate(input.minRepairHintCoverage0to1),
    thresholdPassRate0to1: nullableRate(input.thresholdPassRate0to1),
    minThresholdPassRate0to1: nullableRate(input.minThresholdPassRate0to1),
    scoreConfidence0to1: nullableRate(input.scoreConfidence0to1),
    minScoreConfidence0to1: nullableRate(input.minScoreConfidence0to1),
    status: input.status,
    evidenceRefs: unique(input.evidenceRefs ?? []),
    rejectedEvidenceRefs: unique(input.rejectedEvidenceRefs ?? []),
    repairHint: input.repairHint?.trim() || "Attach AMC-owned Opik-style evaluation proof with question id, accepted evidence ids, rejected evidence reasons, repair hint, reproducible eval pack, signed evidence rows, fail-closed thresholds, no-parity/no-copy proof, and row hash before relying on this question score."
  };
  return {
    ...withoutHash,
    rowHash: sha256Hex(canonicalize(withoutHash))
  };
}

const agentTrialAdapters = new Set<QuestionScoreAgentTrialAdapter>([
  "langgraph",
  "crewai",
  "autogen",
  "pydantic_ai",
  "openai_agents_sdk",
  "smolagents",
  "custom"
]);

function normalizeAgentTrialAdapter(input: QuestionScoreAgentTrialAdapter | undefined): QuestionScoreAgentTrialAdapter {
  return input && agentTrialAdapters.has(input) ? input : "custom";
}

function normalizeAgentTrialStatisticalLens(
  input: QuestionExplainabilityAgentTrialStatisticalInput,
): QuestionScoreAgentTrialStatisticalLensRef {
  const withoutHash: Omit<QuestionScoreAgentTrialStatisticalLensRef, "rowHash"> = {
    suiteId: input.suiteId.trim() || "unknown-statistical-agent-suite",
    sourceRef: input.sourceRef.trim() || "unknown-source",
    packageRef: nullableString(input.packageRef),
    adapter: normalizeAgentTrialAdapter(input.adapter),
    caseId: input.caseId.trim() || "unknown-test-case",
    caseName: input.caseName?.trim() || "unknown-test-case",
    suiteManifestHash: nullableHash(input.suiteManifestHash),
    caseManifestHash: nullableHash(input.caseManifestHash),
    runManifestHash: nullableHash(input.runManifestHash),
    trialManifestHash: nullableHash(input.trialManifestHash),
    statisticalReportHash: nullableHash(input.statisticalReportHash),
    trajectoryBundleHash: nullableHash(input.trajectoryBundleHash),
    failureAttributionHash: nullableHash(input.failureAttributionHash),
    baselineResultHash: nullableHash(input.baselineResultHash),
    candidateResultHash: nullableHash(input.candidateResultHash),
    ciConfigHash: nullableHash(input.ciConfigHash),
    dashboardSnapshotHash: nullableHash(input.dashboardSnapshotHash),
    ciRunId: nullableString(input.ciRunId),
    trialCount: positiveInteger(input.trialCount),
    minTrialCount: positiveInteger(input.minTrialCount),
    passCount: nullableNonNegativeInteger(input.passCount),
    passRate0to1: nullableRate(input.passRate0to1),
    minPassRate0to1: nullableRate(input.minPassRate0to1),
    wilsonConfidenceLevel: nullableRate(input.wilsonConfidenceLevel),
    wilsonLower0to1: nullableRate(input.wilsonLower0to1),
    minWilsonLower0to1: nullableRate(input.minWilsonLower0to1),
    wilsonUpper0to1: nullableRate(input.wilsonUpper0to1),
    bootstrapCostMeanUsd: nullableNonNegativeNumber(input.bootstrapCostMeanUsd),
    maxCostMeanUsd: nullableNonNegativeNumber(input.maxCostMeanUsd),
    bootstrapLatencyMeanMs: nullableNonNegativeNumber(input.bootstrapLatencyMeanMs),
    maxLatencyMeanMs: nullableNonNegativeNumber(input.maxLatencyMeanMs),
    agentReliabilityScore0to1: nullableRate(input.agentReliabilityScore0to1),
    minAgentReliabilityScore0to1: nullableRate(input.minAgentReliabilityScore0to1),
    failureAttributionStepId: nullableString(input.failureAttributionStepId),
    failureAttributionPValue: nullableRate(input.failureAttributionPValue),
    maxFailureAttributionPValue: nullableRate(input.maxFailureAttributionPValue),
    regressionTestName: nullableString(input.regressionTestName),
    regressionPValue: nullableRate(input.regressionPValue),
    minRegressionPValue: nullableRate(input.minRegressionPValue),
    status: input.status,
    evidenceRefs: unique(input.evidenceRefs ?? []),
    rejectedEvidenceRefs: unique(input.rejectedEvidenceRefs ?? []),
    repairHint: input.repairHint?.trim() || "Attach repeated statistical trials, confidence intervals, regression comparison, CI proof, trajectory bundle, failure-attribution proof, accepted/rejected evidence, and repair proof before relying on this question score."
  };
  return {
    ...withoutHash,
    rowHash: sha256Hex(canonicalize(withoutHash))
  };
}

const codeQuestLanguages = new Set<QuestionScoreCodeQuestLanguage>([
  "python",
  "java",
  "javascript",
  "typescript",
  "go",
  "mixed",
  "custom"
]);

const codeQuestDimensionStatuses = new Set<QuestionScoreCodeQuestDimensionStatus>([
  "improved",
  "unchanged",
  "regressed",
  "not_evaluated",
  "custom"
]);

function normalizeCodeQuestLanguage(input: QuestionScoreCodeQuestLanguage | undefined): QuestionScoreCodeQuestLanguage {
  return input && codeQuestLanguages.has(input) ? input : "custom";
}

function normalizeCodeQuestDimensionStatus(
  input: QuestionScoreCodeQuestDimensionStatus | undefined,
): QuestionScoreCodeQuestDimensionStatus {
  return input && codeQuestDimensionStatuses.has(input) ? input : "custom";
}

function nullableUnitDelta(input: number | null | undefined): number | null {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return null;
  }
  return Math.max(-1, Math.min(1, Math.round(input * 10000) / 10000));
}

function computedScoreDelta0to1(baseline: number | null, candidate: number | null): number | null {
  return baseline !== null && candidate !== null ? nullableUnitDelta(candidate - baseline) : null;
}

function normalizeCodeQuestDimension(
  input: QuestionExplainabilityCodeQuestDimensionInput,
): QuestionScoreCodeQuestQualityDimensionRef {
  const baselineScore0to1 = nullableRate(input.baselineScore0to1);
  const candidateScore0to1 = nullableRate(input.candidateScore0to1);
  const withoutHash: Omit<QuestionScoreCodeQuestQualityDimensionRef, "rowHash"> = {
    dimensionId: input.dimensionId.trim() || "unknown-code-quality-dimension",
    dimensionLabel: input.dimensionLabel?.trim() || input.dimensionId.trim() || "Unknown code-quality dimension",
    baselineScore0to1,
    candidateScore0to1,
    scoreDelta0to1: computedScoreDelta0to1(baselineScore0to1, candidateScore0to1),
    minScoreDelta0to1: nullableUnitDelta(input.minScoreDelta0to1),
    status: normalizeCodeQuestDimensionStatus(input.status),
    evidenceRefs: unique(input.evidenceRefs ?? []),
    rejectedEvidenceRefs: unique(input.rejectedEvidenceRefs ?? []),
    repairHint: input.repairHint?.trim() || "Attach evaluator feedback, optimizer grounding, and before/after code-quality evidence for this dimension."
  };
  return {
    ...withoutHash,
    rowHash: sha256Hex(canonicalize(withoutHash))
  };
}

function normalizeCodeQuestQualityLens(
  input: QuestionExplainabilityCodeQuestQualityInput,
): QuestionScoreCodeQuestQualityLensRef {
  const baselineOverallScore0to1 = nullableRate(input.baselineOverallScore0to1);
  const candidateOverallScore0to1 = nullableRate(input.candidateOverallScore0to1);
  const dimensions = (input.dimensions ?? []).map(normalizeCodeQuestDimension);
  const withoutHash: Omit<QuestionScoreCodeQuestQualityLensRef, "rowHash"> = {
    frameworkId: input.frameworkId.trim() || "unknown-codequest-framework",
    sourceRef: input.sourceRef.trim() || "unknown-source",
    repositoryRef: input.repositoryRef?.trim() || "unknown-repository",
    licenseRef: nullableString(input.licenseRef),
    sourceStatusHash: nullableHash(input.sourceStatusHash),
    archivedSource: input.archivedSource === true,
    taskId: input.taskId.trim() || "unknown-code-quality-task",
    language: normalizeCodeQuestLanguage(input.language),
    codeArtifactHash: nullableHash(input.codeArtifactHash),
    evaluatorPromptHash: nullableHash(input.evaluatorPromptHash),
    evaluatorConfigHash: nullableHash(input.evaluatorConfigHash),
    optimizerPromptHash: nullableHash(input.optimizerPromptHash),
    optimizerConfigHash: nullableHash(input.optimizerConfigHash),
    baselineEvaluationHash: nullableHash(input.baselineEvaluationHash),
    candidateEvaluationHash: nullableHash(input.candidateEvaluationHash),
    evaluatorFeedbackHash: nullableHash(input.evaluatorFeedbackHash),
    optimizerGroundingHash: nullableHash(input.optimizerGroundingHash),
    improvementPatchHash: nullableHash(input.improvementPatchHash),
    actorCriticLoopTraceHash: nullableHash(input.actorCriticLoopTraceHash),
    regressionSuiteHash: nullableHash(input.regressionSuiteHash),
    replayCommandHash: nullableHash(input.replayCommandHash),
    ciRunId: nullableString(input.ciRunId),
    ciConfigHash: nullableHash(input.ciConfigHash),
    noSourceCopyBoundaryHash: nullableHash(input.noSourceCopyBoundaryHash),
    dimensionCount: positiveInteger(input.dimensionCount),
    minDimensionCount: positiveInteger(input.minDimensionCount),
    baselineOverallScore0to1,
    candidateOverallScore0to1,
    overallScoreDelta0to1: computedScoreDelta0to1(baselineOverallScore0to1, candidateOverallScore0to1),
    minOverallScoreDelta0to1: nullableUnitDelta(input.minOverallScoreDelta0to1),
    dimensionRegressionCount: nullableNonNegativeInteger(input.dimensionRegressionCount),
    maxDimensionRegressionCount: nullableNonNegativeInteger(input.maxDimensionRegressionCount),
    evaluatorFeedbackCoverage0to1: nullableRate(input.evaluatorFeedbackCoverage0to1),
    minEvaluatorFeedbackCoverage0to1: nullableRate(input.minEvaluatorFeedbackCoverage0to1),
    optimizerGroundingCoverage0to1: nullableRate(input.optimizerGroundingCoverage0to1),
    minOptimizerGroundingCoverage0to1: nullableRate(input.minOptimizerGroundingCoverage0to1),
    dimensions,
    status: input.status,
    evidenceRefs: unique(input.evidenceRefs ?? []),
    rejectedEvidenceRefs: unique(input.rejectedEvidenceRefs ?? []),
    repairHint: input.repairHint?.trim() || "Attach source status, evaluator, optimizer, code artifact, dimension deltas, replay, CI, no-copy proof, accepted/rejected evidence, and repair proof before relying on this question score."
  };
  return {
    ...withoutHash,
    rowHash: sha256Hex(canonicalize(withoutHash))
  };
}

const multiUserScenarioFamilies = new Set<QuestionScoreMultiUserScenarioFamily>([
  "access_control",
  "meeting_scheduling",
  "shared_queue",
  "multiuser_instruction_following",
  "custom"
]);

const multiUserCapabilities = new Set<QuestionScoreMultiUserCapability>([
  "privacy_access_control",
  "sequential_coordination",
  "resource_optimization",
  "instruction_following",
  "custom"
]);

const professionalTaskEnvironmentModes = new Set<QuestionScoreProfessionalTaskEnvironmentMode>([
  "E0",
  "E1",
  "E2",
  "E3",
  "custom"
]);

const professionalTaskFaultModes = new Set<QuestionScoreProfessionalTaskFaultMode>([
  "none",
  "explicit",
  "implicit",
  "mixed",
  "custom"
]);

const iotFirmwarePlatforms = new Set<QuestionScoreIotFirmwarePlatform>([
  "nrf",
  "esp",
  "zephyr",
  "esp_idf",
  "mixed",
  "custom"
]);

const retailSalesChannels = new Set<QuestionScoreRetailSalesChannel>([
  "cli",
  "web",
  "api",
  "mixed",
  "custom"
]);

const hermesTurboPerformanceFacets = new Set<QuestionScoreHermesTurboPerformanceFacet>([
  "startup_latency",
  "runtime_throughput",
  "score_dashboard",
  "mixed",
  "custom"
]);

function normalizeMultiUserScenarioFamily(
  input: QuestionScoreMultiUserScenarioFamily | undefined,
): QuestionScoreMultiUserScenarioFamily {
  return input && multiUserScenarioFamilies.has(input) ? input : "custom";
}

function normalizeMultiUserCapability(
  input: QuestionScoreMultiUserCapability | undefined,
): QuestionScoreMultiUserCapability {
  return input && multiUserCapabilities.has(input) ? input : "custom";
}

function normalizeMultiUserBenchmarkLens(
  input: QuestionExplainabilityMultiUserBenchmarkInput,
): QuestionScoreMultiUserBenchmarkLensRef {
  const withoutHash: Omit<QuestionScoreMultiUserBenchmarkLensRef, "rowHash"> = {
    benchmarkId: input.benchmarkId.trim() || "unknown-multi-user-benchmark",
    sourceRef: input.sourceRef.trim() || "unknown-source",
    scenarioId: input.scenarioId.trim() || "unknown-scenario",
    scenarioFamily: normalizeMultiUserScenarioFamily(input.scenarioFamily),
    capability: normalizeMultiUserCapability(input.capability),
    datasetManifestHash: nullableHash(input.datasetManifestHash),
    userRoleManifestHash: nullableHash(input.userRoleManifestHash),
    permissionPolicyHash: nullableHash(input.permissionPolicyHash),
    preferenceProfileHash: nullableHash(input.preferenceProfileHash),
    resourceQueuePolicyHash: nullableHash(input.resourceQueuePolicyHash),
    instructionSetHash: nullableHash(input.instructionSetHash),
    interactionTraceHash: nullableHash(input.interactionTraceHash),
    evaluatorConfigHash: nullableHash(input.evaluatorConfigHash),
    resultArtifactHash: nullableHash(input.resultArtifactHash),
    metricReportHash: nullableHash(input.metricReportHash),
    userRoleCount: positiveInteger(input.userRoleCount),
    turnCount: positiveInteger(input.turnCount),
    privacyPassRate0to1: nullableRate(input.privacyPassRate0to1),
    minPrivacyPassRate0to1: nullableRate(input.minPrivacyPassRate0to1),
    coordinationSuccessRate0to1: nullableRate(input.coordinationSuccessRate0to1),
    minCoordinationSuccessRate0to1: nullableRate(input.minCoordinationSuccessRate0to1),
    queueFairnessScore0to1: nullableRate(input.queueFairnessScore0to1),
    minQueueFairnessScore0to1: nullableRate(input.minQueueFairnessScore0to1),
    instructionFollowingScore0to1: nullableRate(input.instructionFollowingScore0to1),
    minInstructionFollowingScore0to1: nullableRate(input.minInstructionFollowingScore0to1),
    status: input.status,
    evidenceRefs: unique(input.evidenceRefs ?? []),
    rejectedEvidenceRefs: unique(input.rejectedEvidenceRefs ?? []),
    repairHint: input.repairHint?.trim() || "Attach multi-user benchmark scenario, user-role, policy/preference/queue, instruction, interaction trace, evaluator, result, metric, accepted/rejected evidence, and repair proof before relying on this question score."
  };
  return {
    ...withoutHash,
    rowHash: sha256Hex(canonicalize(withoutHash))
  };
}

function normalizeProfessionalTaskEnvironmentMode(
  input: QuestionScoreProfessionalTaskEnvironmentMode | undefined,
): QuestionScoreProfessionalTaskEnvironmentMode {
  return input && professionalTaskEnvironmentModes.has(input) ? input : "custom";
}

function normalizeProfessionalTaskFaultMode(
  input: QuestionScoreProfessionalTaskFaultMode | undefined,
): QuestionScoreProfessionalTaskFaultMode {
  return input && professionalTaskFaultModes.has(input) ? input : "custom";
}

function normalizeIotFirmwarePlatform(
  input: QuestionScoreIotFirmwarePlatform | undefined,
): QuestionScoreIotFirmwarePlatform {
  return input && iotFirmwarePlatforms.has(input) ? input : "custom";
}

function normalizeRetailSalesChannel(
  input: QuestionScoreRetailSalesChannel | undefined,
): QuestionScoreRetailSalesChannel {
  return input && retailSalesChannels.has(input) ? input : "custom";
}

function normalizeHermesTurboPerformanceFacet(
  input: QuestionScoreHermesTurboPerformanceFacet | undefined,
): QuestionScoreHermesTurboPerformanceFacet {
  return input && hermesTurboPerformanceFacets.has(input) ? input : "custom";
}

function normalizeProfessionalTaskLens(
  input: QuestionExplainabilityProfessionalTaskInput,
): QuestionScoreProfessionalTaskLensRef {
  const withoutHash: Omit<QuestionScoreProfessionalTaskLensRef, "rowHash"> = {
    benchmarkId: input.benchmarkId.trim() || "unknown-professional-task-benchmark",
    sourceRef: input.sourceRef.trim() || "unknown-source",
    taskId: input.taskId.trim() || "unknown-task",
    scenarioId: input.scenarioId.trim() || "unknown-scenario",
    industryCategory: input.industryCategory?.trim() || "unknown-industry",
    professionalDomain: input.professionalDomain?.trim() || "unknown-domain",
    difficultyLevel: positiveInteger(input.difficultyLevel),
    datasetManifestHash: nullableSha256Hash(input.datasetManifestHash),
    scenarioManifestHash: nullableSha256Hash(input.scenarioManifestHash),
    worldModelConfigHash: nullableSha256Hash(input.worldModelConfigHash),
    toolSchemaHash: nullableSha256Hash(input.toolSchemaHash),
    agentConfigHash: nullableSha256Hash(input.agentConfigHash),
    faultInjectionConfigHash: nullableSha256Hash(input.faultInjectionConfigHash),
    verifierRubricHash: nullableSha256Hash(input.verifierRubricHash),
    verifierVoteManifestHash: nullableSha256Hash(input.verifierVoteManifestHash),
    trajectoryHash: nullableSha256Hash(input.trajectoryHash),
    resultArtifactHash: nullableSha256Hash(input.resultArtifactHash),
    replayConfigHash: nullableSha256Hash(input.replayConfigHash),
    debugTraceHash: nullableSha256Hash(input.debugTraceHash),
    environmentMode: normalizeProfessionalTaskEnvironmentMode(input.environmentMode),
    faultMode: normalizeProfessionalTaskFaultMode(input.faultMode),
    verifierVoteCount: positiveInteger(input.verifierVoteCount),
    minVerifierVoteCount: positiveInteger(input.minVerifierVoteCount),
    passRate0to1: nullableRate(input.passRate0to1),
    minPassRate0to1: nullableRate(input.minPassRate0to1),
    robustnessScore0to1: nullableRate(input.robustnessScore0to1),
    minRobustnessScore0to1: nullableRate(input.minRobustnessScore0to1),
    trajectoryStepCount: positiveInteger(input.trajectoryStepCount),
    maxTrajectoryStepCount: positiveInteger(input.maxTrajectoryStepCount),
    status: input.status,
    evidenceRefs: unique(input.evidenceRefs ?? []),
    rejectedEvidenceRefs: unique(input.rejectedEvidenceRefs ?? []),
    repairHint: input.repairHint?.trim() || "Attach professional task scenario, LWM environment, tool schema, fault injection, verifier vote, trajectory, result, replay config, accepted/rejected evidence, and repair proof before relying on this question score."
  };
  return {
    ...withoutHash,
    rowHash: sha256Hex(canonicalize(withoutHash))
  };
}

function normalizeIotFirmwareQuestionLens(
  input: QuestionExplainabilityIotFirmwareQuestionInput,
): QuestionScoreIotFirmwareQuestionLensRef {
  const withoutHash: Omit<QuestionScoreIotFirmwareQuestionLensRef, "rowHash"> = {
    benchmarkId: input.benchmarkId.trim() || "unknown-iot-firmware-benchmark",
    sourceRef: input.sourceRef.trim() || "unknown-source",
    taskId: input.taskId.trim() || "unknown-task",
    platform: normalizeIotFirmwarePlatform(input.platform),
    boardId: input.boardId?.trim() || "unknown-board",
    chipFamily: input.chipFamily?.trim() || "unknown-chip",
    firmwareProjectHash: nullableSha256Hash(input.firmwareProjectHash),
    toolchainManifestHash: nullableSha256Hash(input.toolchainManifestHash),
    sdkVersionManifestHash: nullableSha256Hash(input.sdkVersionManifestHash),
    hardwareSessionHash: nullableSha256Hash(input.hardwareSessionHash),
    deviceLogBundleHash: nullableSha256Hash(input.deviceLogBundleHash),
    buildArtifactHash: nullableSha256Hash(input.buildArtifactHash),
    flashArtifactHash: nullableSha256Hash(input.flashArtifactHash),
    testArtifactHash: nullableSha256Hash(input.testArtifactHash),
    knowledgePackManifestHash: nullableSha256Hash(input.knowledgePackManifestHash),
    taskManifestHash: nullableSha256Hash(input.taskManifestHash),
    evaluatorConfigHash: nullableSha256Hash(input.evaluatorConfigHash),
    resultArtifactHash: nullableSha256Hash(input.resultArtifactHash),
    privacyBoundaryHash: nullableSha256Hash(input.privacyBoundaryHash),
    benchmarkReportHash: nullableSha256Hash(input.benchmarkReportHash),
    hardwareRunCount: positiveInteger(input.hardwareRunCount),
    deviceCount: positiveInteger(input.deviceCount),
    bugClosureRate0to1: nullableRate(input.bugClosureRate0to1),
    minBugClosureRate0to1: nullableRate(input.minBugClosureRate0to1),
    tokenEfficiencyRatio: nullableNonNegativeNumber(input.tokenEfficiencyRatio),
    minTokenEfficiencyRatio: nullableNonNegativeNumber(input.minTokenEfficiencyRatio),
    logCaptureCoverage0to1: nullableRate(input.logCaptureCoverage0to1),
    minLogCaptureCoverage0to1: nullableRate(input.minLogCaptureCoverage0to1),
    status: input.status,
    evidenceRefs: unique(input.evidenceRefs ?? []),
    rejectedEvidenceRefs: unique(input.rejectedEvidenceRefs ?? []),
    repairHint: input.repairHint?.trim() || "Attach IoT firmware benchmark task, platform, board, chip, project, toolchain, SDK, hardware session, device logs, build/flash/test artifacts, knowledge pack, evaluator, result, privacy boundary, benchmark report, accepted/rejected evidence, and repair proof before relying on this question score."
  };
  return {
    ...withoutHash,
    rowHash: sha256Hex(canonicalize(withoutHash))
  };
}

function normalizeRetailSalesQuestionLens(
  input: QuestionExplainabilityRetailSalesQuestionInput,
): QuestionScoreRetailSalesQuestionLensRef {
  const withoutHash: Omit<QuestionScoreRetailSalesQuestionLensRef, "rowHash"> = {
    benchmarkId: input.benchmarkId.trim() || "unknown-retail-sales-benchmark",
    sourceRef: input.sourceRef.trim() || "unknown-source",
    taskId: input.taskId.trim() || "unknown-task",
    salesChannel: normalizeRetailSalesChannel(input.salesChannel),
    productCatalogHash: nullableSha256Hash(input.productCatalogHash),
    productDescriptionHash: nullableSha256Hash(input.productDescriptionHash),
    customerScenarioHash: nullableSha256Hash(input.customerScenarioHash),
    conversationTraceHash: nullableSha256Hash(input.conversationTraceHash),
    customerIntentManifestHash: nullableSha256Hash(input.customerIntentManifestHash),
    orderCaptureSchemaHash: nullableSha256Hash(input.orderCaptureSchemaHash),
    orderLedgerHash: nullableSha256Hash(input.orderLedgerHash),
    pricingPolicyHash: nullableSha256Hash(input.pricingPolicyHash),
    discountPolicyHash: nullableSha256Hash(input.discountPolicyHash),
    modelAdapterManifestHash: nullableSha256Hash(input.modelAdapterManifestHash),
    modelProviderMatrixHash: nullableSha256Hash(input.modelProviderMatrixHash),
    promptPolicyHash: nullableSha256Hash(input.promptPolicyHash),
    recommendationPolicyHash: nullableSha256Hash(input.recommendationPolicyHash),
    safetyPolicyHash: nullableSha256Hash(input.safetyPolicyHash),
    privacyBoundaryHash: nullableSha256Hash(input.privacyBoundaryHash),
    evaluatorConfigHash: nullableSha256Hash(input.evaluatorConfigHash),
    resultArtifactHash: nullableSha256Hash(input.resultArtifactHash),
    benchmarkReportHash: nullableSha256Hash(input.benchmarkReportHash),
    modelProviderCount: positiveInteger(input.modelProviderCount),
    customerScenarioCount: positiveInteger(input.customerScenarioCount),
    orderCount: positiveInteger(input.orderCount),
    orderCaptureAccuracy0to1: nullableRate(input.orderCaptureAccuracy0to1),
    minOrderCaptureAccuracy0to1: nullableRate(input.minOrderCaptureAccuracy0to1),
    policyComplianceRate0to1: nullableRate(input.policyComplianceRate0to1),
    minPolicyComplianceRate0to1: nullableRate(input.minPolicyComplianceRate0to1),
    recommendationGrounding0to1: nullableRate(input.recommendationGrounding0to1),
    minRecommendationGrounding0to1: nullableRate(input.minRecommendationGrounding0to1),
    piiRedactionRate0to1: nullableRate(input.piiRedactionRate0to1),
    minPiiRedactionRate0to1: nullableRate(input.minPiiRedactionRate0to1),
    status: input.status,
    evidenceRefs: unique(input.evidenceRefs ?? []),
    rejectedEvidenceRefs: unique(input.rejectedEvidenceRefs ?? []),
    repairHint: input.repairHint?.trim() || "Attach retail sales benchmark task, product/catalog proof, customer scenario, conversation trace, order-capture schema and ledger, pricing/discount policies, model adapter/provider matrix, prompt/recommendation/safety/privacy policies, evaluator, result, benchmark report, accepted/rejected evidence, and repair proof before relying on this question score."
  };
  return {
    ...withoutHash,
    rowHash: sha256Hex(canonicalize(withoutHash))
  };
}

function normalizeContinualLearningBenchmarkLens(
  input: QuestionExplainabilityContinualLearningBenchmarkInput,
): QuestionScoreContinualLearningBenchmarkLensRef {
  const withoutHash: Omit<QuestionScoreContinualLearningBenchmarkLensRef, "rowHash"> = {
    benchmarkId: input.benchmarkId.trim() || "unknown-continual-learning-benchmark",
    sourceRef: input.sourceRef.trim() || "unknown-source",
    domainId: input.domainId.trim() || "unknown-domain",
    workflowId: input.workflowId.trim() || "unknown-workflow",
    datasetManifestHash: nullableSha256Hash(input.datasetManifestHash),
    stateSchemaHash: nullableSha256Hash(input.stateSchemaHash),
    initialStateHash: nullableSha256Hash(input.initialStateHash),
    stateMutationTraceHash: nullableSha256Hash(input.stateMutationTraceHash),
    conversationTraceHash: nullableSha256Hash(input.conversationTraceHash),
    entityRelationshipGraphHash: nullableSha256Hash(input.entityRelationshipGraphHash),
    toolExecutionTraceHash: nullableSha256Hash(input.toolExecutionTraceHash),
    evaluatorConfigHash: nullableSha256Hash(input.evaluatorConfigHash),
    resultArtifactHash: nullableSha256Hash(input.resultArtifactHash),
    replayCommandHash: nullableSha256Hash(input.replayCommandHash),
    memoryPolicyHash: nullableSha256Hash(input.memoryPolicyHash),
    adaptiveLearningTraceHash: nullableSha256Hash(input.adaptiveLearningTraceHash),
    scenarioCount: positiveInteger(input.scenarioCount),
    turnCount: positiveInteger(input.turnCount),
    stateMutationCount: positiveInteger(input.stateMutationCount),
    entityCount: positiveInteger(input.entityCount),
    taskCompletionRate0to1: nullableRate(input.taskCompletionRate0to1),
    minTaskCompletionRate0to1: nullableRate(input.minTaskCompletionRate0to1),
    responseQualityScore0to1: nullableRate(input.responseQualityScore0to1),
    minResponseQualityScore0to1: nullableRate(input.minResponseQualityScore0to1),
    stateAccuracy0to1: nullableRate(input.stateAccuracy0to1),
    minStateAccuracy0to1: nullableRate(input.minStateAccuracy0to1),
    retentionScore0to1: nullableRate(input.retentionScore0to1),
    minRetentionScore0to1: nullableRate(input.minRetentionScore0to1),
    tokenCostUsd: nullableNonNegativeNumber(input.tokenCostUsd),
    maxTokenCostUsd: nullableNonNegativeNumber(input.maxTokenCostUsd),
    status: input.status,
    evidenceRefs: unique(input.evidenceRefs ?? []),
    rejectedEvidenceRefs: unique(input.rejectedEvidenceRefs ?? []),
    repairHint: input.repairHint?.trim() || "Attach continual-learning benchmark dataset, state schema, initial state, state mutations, conversation trace, entity graph, tool execution, evaluator, result, replay command, accepted/rejected evidence, and repair proof before relying on this question score."
  };
  return {
    ...withoutHash,
    rowHash: sha256Hex(canonicalize(withoutHash))
  };
}

function normalizeHermesTurboPerformanceLens(
  input: QuestionExplainabilityHermesTurboPerformanceInput,
): QuestionScoreHermesTurboPerformanceLensRef {
  const withoutHash: Omit<QuestionScoreHermesTurboPerformanceLensRef, "rowHash"> = {
    benchmarkId: input.benchmarkId.trim() || "unknown-hermes-turbo-benchmark",
    sourceRef: input.sourceRef.trim() || "unknown-source",
    repositoryRef: input.repositoryRef?.trim() || "unknown-repository",
    licenseRef: nullableString(input.licenseRef),
    licenseSpdxId: nullableString(input.licenseSpdxId),
    defaultBranch: input.defaultBranch?.trim() || "unknown-branch",
    sourceCommitSha: nullableGitSha(input.sourceCommitSha),
    sourceTreeSha: nullableGitSha(input.sourceTreeSha),
    sourceStatusHash: nullableSha256Hash(input.sourceStatusHash),
    readmeArtifactHash: nullableSha256Hash(input.readmeArtifactHash),
    packageManifestHash: nullableSha256Hash(input.packageManifestHash),
    benchmarkWorkflowHash: nullableSha256Hash(input.benchmarkWorkflowHash),
    perfBudgetWorkflowHash: nullableSha256Hash(input.perfBudgetWorkflowHash),
    dailyScoreWorkflowHash: nullableSha256Hash(input.dailyScoreWorkflowHash),
    turboScoreScriptHash: nullableSha256Hash(input.turboScoreScriptHash),
    performanceDashboardHash: nullableSha256Hash(input.performanceDashboardHash),
    benchmarkReportHash: nullableSha256Hash(input.benchmarkReportHash),
    baselineResultHash: nullableSha256Hash(input.baselineResultHash),
    candidateResultHash: nullableSha256Hash(input.candidateResultHash),
    latencyTraceHash: nullableSha256Hash(input.latencyTraceHash),
    throughputTraceHash: nullableSha256Hash(input.throughputTraceHash),
    scoreManifestHash: nullableSha256Hash(input.scoreManifestHash),
    regressionThresholdHash: nullableSha256Hash(input.regressionThresholdHash),
    ciRunId: nullableString(input.ciRunId),
    ciConfigHash: nullableSha256Hash(input.ciConfigHash),
    performanceFacet: normalizeHermesTurboPerformanceFacet(input.performanceFacet),
    runCount: positiveInteger(input.runCount),
    minRunCount: positiveInteger(input.minRunCount),
    latencyP50Ms: nullableNonNegativeNumber(input.latencyP50Ms),
    maxLatencyP50Ms: nullableNonNegativeNumber(input.maxLatencyP50Ms),
    latencyP95Ms: nullableNonNegativeNumber(input.latencyP95Ms),
    maxLatencyP95Ms: nullableNonNegativeNumber(input.maxLatencyP95Ms),
    throughputOpsPerSec: nullableNonNegativeNumber(input.throughputOpsPerSec),
    minThroughputOpsPerSec: nullableNonNegativeNumber(input.minThroughputOpsPerSec),
    speedupFactor: nullableNonNegativeNumber(input.speedupFactor),
    minSpeedupFactor: nullableNonNegativeNumber(input.minSpeedupFactor),
    scoreDelta0to1: nullableUnitDelta(input.scoreDelta0to1),
    minScoreDelta0to1: nullableUnitDelta(input.minScoreDelta0to1),
    dashboardCoverage0to1: nullableRate(input.dashboardCoverage0to1),
    minDashboardCoverage0to1: nullableRate(input.minDashboardCoverage0to1),
    regressionPassRate0to1: nullableRate(input.regressionPassRate0to1),
    minRegressionPassRate0to1: nullableRate(input.minRegressionPassRate0to1),
    status: input.status,
    evidenceRefs: unique(input.evidenceRefs ?? []),
    rejectedEvidenceRefs: unique(input.rejectedEvidenceRefs ?? []),
    repairHint: input.repairHint?.trim() || "Attach Hermes Turbo source, benchmark workflow, performance trace, dashboard, score manifest, CI, threshold, accepted/rejected evidence, and repair proof before relying on this question score."
  };
  return {
    ...withoutHash,
    rowHash: sha256Hex(canonicalize(withoutHash))
  };
}

const scorableStudioSurfaces = new Set<QuestionScoreScorableStudioSurface>([
  "python_sdk",
  "typescript_sdk",
  "cli",
  "studio_api",
  "otel_trace",
  "execution_log",
  "file_artifact",
  "custom"
]);

const scorableEvidencePreviewStates = new Set<QuestionScoreScorableEvidencePreviewState>([
  "ready",
  "empty",
  "error",
  "custom"
]);

function normalizeScorableStudioSurface(
  input: QuestionScoreScorableStudioSurface | undefined,
): QuestionScoreScorableStudioSurface {
  return input && scorableStudioSurfaces.has(input) ? input : "custom";
}

function normalizeScorableEvidencePreviewState(
  input: QuestionScoreScorableEvidencePreviewState | undefined,
): QuestionScoreScorableEvidencePreviewState {
  return input && scorableEvidencePreviewStates.has(input) ? input : "custom";
}

function normalizeScorableStudioDrilldownLens(
  input: QuestionExplainabilityScorableStudioDrilldownInput,
): QuestionScoreScorableStudioDrilldownLensRef {
  const sourceArtifactLinks = unique(input.sourceArtifactLinks ?? []);
  const sourceArtifactLinkCount = positiveInteger(input.sourceArtifactLinkCount) ??
    (sourceArtifactLinks.length > 0 ? sourceArtifactLinks.length : null);
  const withoutHash: Omit<QuestionScoreScorableStudioDrilldownLensRef, "rowHash"> = {
    drilldownId: input.drilldownId.trim() || "unknown-scorable-drilldown",
    sourceRef: input.sourceRef.trim() || "unknown-source",
    repositoryRef: input.repositoryRef?.trim() || "unknown-repository",
    licenseRef: nullableString(input.licenseRef),
    licenseSpdxId: nullableString(input.licenseSpdxId),
    defaultBranch: input.defaultBranch?.trim() || "unknown-branch",
    sourceCommitSha: nullableGitSha(input.sourceCommitSha),
    sourceTreeSha: nullableGitSha(input.sourceTreeSha),
    readmeArtifactHash: nullableSha256Hash(input.readmeArtifactHash),
    pythonPackageManifestHash: nullableSha256Hash(input.pythonPackageManifestHash),
    pythonOpenApiHash: nullableSha256Hash(input.pythonOpenApiHash),
    pythonClientHash: nullableSha256Hash(input.pythonClientHash),
    pythonExecutionLogsHash: nullableSha256Hash(input.pythonExecutionLogsHash),
    pythonEvaluatorApiHash: nullableSha256Hash(input.pythonEvaluatorApiHash),
    pythonExecutionLogApiHash: nullableSha256Hash(input.pythonExecutionLogApiHash),
    cliPackageManifestHash: nullableSha256Hash(input.cliPackageManifestHash),
    cliLockfileHash: nullableSha256Hash(input.cliLockfileHash),
    cliEvaluatorCommandHash: nullableSha256Hash(input.cliEvaluatorCommandHash),
    cliJudgeCommandHash: nullableSha256Hash(input.cliJudgeCommandHash),
    cliExecutionLogCommandHash: nullableSha256Hash(input.cliExecutionLogCommandHash),
    cliOtelTraceCommandHash: nullableSha256Hash(input.cliOtelTraceCommandHash),
    cliFileUploadCommandHash: nullableSha256Hash(input.cliFileUploadCommandHash),
    typescriptPackageManifestHash: nullableSha256Hash(input.typescriptPackageManifestHash),
    typescriptLockfileHash: nullableSha256Hash(input.typescriptLockfileHash),
    typescriptSourceTreeHash: nullableSha256Hash(input.typescriptSourceTreeHash),
    npmPackageRef: nullableString(input.npmPackageRef),
    npmPackageIntegrity: nullableString(input.npmPackageIntegrity),
    npmCliPackageRef: nullableString(input.npmCliPackageRef),
    npmCliPackageIntegrity: nullableString(input.npmCliPackageIntegrity),
    studioSurface: normalizeScorableStudioSurface(input.studioSurface),
    uiRoutePath: input.uiRoutePath?.trim() || "unknown-studio-route",
    sourceArtifactLinks,
    tracePreviewHash: nullableSha256Hash(input.tracePreviewHash),
    receiptPreviewHash: nullableSha256Hash(input.receiptPreviewHash),
    policyRulePreviewHash: nullableSha256Hash(input.policyRulePreviewHash),
    sourceArtifactPreviewHash: nullableSha256Hash(input.sourceArtifactPreviewHash),
    emptyStateHash: nullableSha256Hash(input.emptyStateHash),
    errorStateHash: nullableSha256Hash(input.errorStateHash),
    evidencePreviewState: normalizeScorableEvidencePreviewState(input.evidencePreviewState),
    evidencePreviewCount: positiveInteger(input.evidencePreviewCount),
    minEvidencePreviewCount: positiveInteger(input.minEvidencePreviewCount),
    sourceArtifactLinkCount,
    minSourceArtifactLinkCount: positiveInteger(input.minSourceArtifactLinkCount),
    status: input.status,
    evidenceRefs: unique(input.evidenceRefs ?? []),
    rejectedEvidenceRefs: unique(input.rejectedEvidenceRefs ?? []),
    repairHint: input.repairHint?.trim() || "Attach Scorable SDK source, Studio drilldown route, execution trace, receipt, policy rule, source artifact links, preview count, empty state, error state, accepted/rejected evidence, and repair proof before relying on this question score."
  };
  return {
    ...withoutHash,
    rowHash: sha256Hex(canonicalize(withoutHash))
  };
}

const obsStudioSourceKinds = new Set<QuestionScoreObsStudioSourceKind>([
  "paper",
  "repository",
  "product",
  "custom"
]);

const obsStudioEvidencePreviewStates = new Set<QuestionScoreObsStudioEvidencePreviewState>([
  "ready",
  "empty",
  "error",
  "custom"
]);

function normalizeObsStudioSourceKind(
  input: QuestionScoreObsStudioSourceKind | undefined,
): QuestionScoreObsStudioSourceKind {
  return input && obsStudioSourceKinds.has(input) ? input : "custom";
}

function normalizeObsStudioEvidencePreviewState(
  input: QuestionScoreObsStudioEvidencePreviewState | undefined,
): QuestionScoreObsStudioEvidencePreviewState {
  return input && obsStudioEvidencePreviewStates.has(input) ? input : "custom";
}

function normalizeObsStudioDrilldownLens(
  input: QuestionExplainabilityObsStudioDrilldownInput,
): QuestionScoreObsStudioDrilldownLensRef {
  const sourceArtifactLinks = unique(input.sourceArtifactLinks ?? []);
  const sourceArtifactLinkCount = positiveInteger(input.sourceArtifactLinkCount) ??
    (sourceArtifactLinks.length > 0 ? sourceArtifactLinks.length : null);
  const withoutHash: Omit<QuestionScoreObsStudioDrilldownLensRef, "rowHash"> = {
    drilldownId: input.drilldownId.trim() || "unknown-obs-studio-drilldown",
    sourceRef: input.sourceRef.trim() || "unknown-source",
    sourceKind: normalizeObsStudioSourceKind(input.sourceKind),
    openAlexWorkId: nullableString(input.openAlexWorkId),
    doi: nullableString(input.doi),
    publisherRef: nullableString(input.publisherRef),
    titleRef: nullableString(input.titleRef),
    venueRef: nullableString(input.venueRef),
    publicationDate: nullableString(input.publicationDate),
    uiRoutePath: input.uiRoutePath?.trim() || "unknown-studio-route",
    sourceArtifactLinks,
    tracePreviewHash: nullableSha256Hash(input.tracePreviewHash),
    reasoningTracePreviewHash: nullableSha256Hash(input.reasoningTracePreviewHash),
    receiptPreviewHash: nullableSha256Hash(input.receiptPreviewHash),
    evidencePreviewHash: nullableSha256Hash(input.evidencePreviewHash),
    sourceArtifactPreviewHash: nullableSha256Hash(input.sourceArtifactPreviewHash),
    emptyStateHash: nullableSha256Hash(input.emptyStateHash),
    errorStateHash: nullableSha256Hash(input.errorStateHash),
    evidencePreviewState: normalizeObsStudioEvidencePreviewState(input.evidencePreviewState),
    evidencePreviewCount: positiveInteger(input.evidencePreviewCount),
    minEvidencePreviewCount: positiveInteger(input.minEvidencePreviewCount),
    sourceArtifactLinkCount,
    minSourceArtifactLinkCount: positiveInteger(input.minSourceArtifactLinkCount),
    status: input.status,
    evidenceRefs: unique(input.evidenceRefs ?? []),
    rejectedEvidenceRefs: unique(input.rejectedEvidenceRefs ?? []),
    repairHint: input.repairHint?.trim() || "Attach AMC-owned observability drilldown route proof, source artifact links, trace/reasoning/receipt previews, empty and error states, signed evidence refs, and repair proof before relying on this question score."
  };
  return {
    ...withoutHash,
    rowHash: sha256Hex(canonicalize(withoutHash))
  };
}

function defaultComponentDiagnostics(params: {
  acceptedEvidenceIds: string[];
  rejectedEvidenceIds: string[];
  missingGateReasons: string[];
}): QuestionScoreComponentDiagnosticRef[] {
  const diagnostics: QuestionScoreComponentDiagnosticRef[] = [];
  if (params.acceptedEvidenceIds.length > 0) {
    diagnostics.push(normalizeComponentDiagnostic({
      componentId: "evidence-ledger",
      componentType: "evidence",
      status: "accepted",
      evidenceRefs: params.acceptedEvidenceIds,
      repairHint: "Preserve signed evidence refs and rerun the diagnostic after adding any missing gate evidence."
    }));
  }
  if (params.rejectedEvidenceIds.length > 0) {
    diagnostics.push(normalizeComponentDiagnostic({
      componentId: "evidence-filter",
      componentType: "evaluation",
      status: "rejected",
      rejectedEvidenceRefs: params.rejectedEvidenceIds,
      repairHint: "Replace rejected evidence with question-tagged evidence that matches the selected maturity gate."
    }));
  }
  if (params.missingGateReasons.length > 0) {
    diagnostics.push(normalizeComponentDiagnostic({
      componentId: "maturity-gates",
      componentType: "evaluation",
      status: "missing",
      repairHint: "Satisfy the missing L-level gate counts before treating this question as external proof."
    }));
  }
  return diagnostics;
}

function defaultCriterionDiagnostics(params: {
  acceptedEvidenceIds: string[];
  rejectedEvidenceIds: string[];
  missingGateReasons: string[];
}): QuestionScoreCriterionDiagnosticRef[] {
  const diagnostics: QuestionScoreCriterionDiagnosticRef[] = [];
  if (params.acceptedEvidenceIds.length > 0) {
    diagnostics.push(normalizeCriterionDiagnostic({
      criterionId: "signed-evidence-policy-gate",
      criterionType: "policy_gate",
      status: "satisfied",
      evidenceRefs: params.acceptedEvidenceIds,
      judgeRef: "amc:evidence-ledger",
      repairHint: "Keep the signed evidence set stable so the question-level score can be replayed."
    }));
  }
  if (params.rejectedEvidenceIds.length > 0) {
    diagnostics.push(normalizeCriterionDiagnostic({
      criterionId: "rejected-evidence-review",
      criterionType: "human_review",
      status: "failed",
      rejectedEvidenceRefs: params.rejectedEvidenceIds,
      judgeRef: "amc:evidence-filter",
      repairHint: "Replace rejected evidence with criterion-tagged evidence accepted by the maturity gate."
    }));
  }
  if (params.missingGateReasons.length > 0) {
    diagnostics.push(normalizeCriterionDiagnostic({
      criterionId: "maturity-level-gate",
      criterionType: "policy_gate",
      status: "missing",
      judgeRef: "amc:maturity-gate",
      repairHint: "Collect the missing gate evidence before using this question as external score proof."
    }));
  }
  return diagnostics;
}

function statusFor(score: QuestionScore, acceptedEvidenceIds: string[], missingGateReasons: string[]): QuestionScoreExplainabilityStatus {
  if (score.flags.includes("FLAG_UNSUPPORTED_CLAIM")) {
    return "unsupported_claim";
  }
  if (acceptedEvidenceIds.length === 0 || score.supportedMaxLevel === 0 || score.finalLevel === 0) {
    return "needs_evidence";
  }
  if (score.finalLevel < score.claimedLevel || score.flags.length > 0 || missingGateReasons.length > 0) {
    return "capped";
  }
  return "passed";
}

function repairHintFor(question: DiagnosticQuestion, score: QuestionScore): string {
  const nextLevel = Math.min(score.finalLevel + 1, 5);
  const upgrade = firstSentence(question.upgradeHints);
  const gateHint = firstSentence(question.evidenceGateHints);
  if (upgrade && gateHint) {
    return `${upgrade} Target L${nextLevel}: ${gateHint}`;
  }
  if (upgrade) {
    return `${upgrade} Target L${nextLevel}: collect signed evidence that satisfies the next maturity gate.`;
  }
  if (gateHint) {
    return `Target L${nextLevel}: ${gateHint}`;
  }
  return `Target L${nextLevel}: collect signed, question-tagged evidence and rerun the diagnostic.`;
}

function rowHashFor(row: Omit<QuestionScoreExplainabilityRow, "rowHash">): string {
  return sha256Hex(canonicalize(row));
}

function evidenceWindowFor(refs: QuestionScoreSignedEvidenceRef[]): QuestionScoreEvidenceWindow {
  const timestamps = refs.map((ref) => ref.ts).filter((ts) => Number.isFinite(ts));
  const firstTs = timestamps.length > 0 ? Math.min(...timestamps) : null;
  const lastTs = timestamps.length > 0 ? Math.max(...timestamps) : null;
  return {
    eventCount: refs.length,
    distinctSessionCount: new Set(refs.map((ref) => ref.sessionId).filter((id) => id.length > 0)).size,
    firstTs,
    lastTs,
    durationMs: firstTs === null || lastTs === null ? 0 : Math.max(0, lastTs - firstTs)
  };
}

function hasSignedEvidence(ref: QuestionScoreSignedEvidenceRef): boolean {
  return ref.evidenceId.length > 0 && ref.eventHash.length > 0 && ref.writerSig.length > 0;
}

function hasReplayableCriterion(ref: QuestionScoreCriterionDiagnosticRef): boolean {
  if (ref.criterionId.length === 0) {
    return false;
  }
  if (ref.status === "satisfied") {
    return ref.evidenceRefs.length > 0;
  }
  if (ref.status === "failed") {
    return ref.evidenceRefs.length > 0 || ref.rejectedEvidenceRefs.length > 0;
  }
  return true;
}

function hasReplayableRubricLens(ref: QuestionScoreRubricLensRef): boolean {
  if (ref.rubricId.length === 0 || ref.rubricVersion.length === 0 || ref.checks.length === 0) {
    return false;
  }
  if (ref.deepReviewCertificateHash !== null && !isSha256(ref.deepReviewCertificateHash)) {
    return false;
  }
  return ref.checks.every((check) => {
    if (check.checkId.length === 0 || check.pillar.length === 0) {
      return false;
    }
    if (check.status === "pass" || check.status === "partial") {
      return check.evidenceRefs.length > 0;
    }
    if (check.status === "fail") {
      return check.evidenceRefs.length > 0 || check.rejectedEvidenceRefs.length > 0 || check.fixHint.length > 0;
    }
    return true;
  });
}

function validOptionalHash(value: string | null): boolean {
  return value === null || isSha256(value);
}

function hasReplayableRagFlowDiagnostic(ref: QuestionScoreRagFlowDiagnosticRef): boolean {
  if (ref.flowId.length === 0) {
    return false;
  }
  if (![
    ref.flowDagHash,
    ref.paramConfigHash,
    ref.evalSetHash,
    ref.evaluatorFlowHash,
    ref.dataMappingHash,
    ref.variantConfigHash,
    ref.deploymentArtifactHash
  ].every(validOptionalHash)) {
    return false;
  }
  if (ref.status === "satisfied") {
    return ref.evidenceRefs.length > 0 &&
      ref.flowDagHash !== null &&
      ref.paramConfigHash !== null &&
      ref.evalSetHash !== null &&
      ref.batchRunId !== null &&
      ref.evaluatorFlowHash !== null &&
      ref.groundTruthColumn !== null &&
      ref.dataMappingHash !== null &&
      ref.metricIds.length > 0;
  }
  if (ref.status === "failed") {
    return ref.evidenceRefs.length > 0 || ref.rejectedEvidenceRefs.length > 0 || ref.repairHint.length > 0;
  }
  return ref.repairHint.length > 0;
}

function hasReplayableLandscapeLens(ref: QuestionScoreLandscapeLensRef): boolean {
  if (ref.landscapeId.length === 0 || ref.sourceRef.length === 0) {
    return false;
  }
  if (!ref.datasetHashes.every(isSha256)) {
    return false;
  }
  if (ref.status === "satisfied") {
    const freshnessWithinLimit =
      ref.freshnessDays !== null &&
      ref.maxAllowedFreshnessDays !== null &&
      ref.freshnessDays <= ref.maxAllowedFreshnessDays;
    return ref.evidenceRefs.length > 0 &&
      ref.datasetRefs.length > 0 &&
      ref.datasetHashes.length > 0 &&
      ref.lastVerifiedAt !== null &&
      freshnessWithinLimit &&
      ref.cohortRefs.length > 0 &&
      (ref.benchmarkRefs.length > 0 || ref.toolOrModelRefs.length > 0);
  }
  if (ref.status === "failed") {
    return ref.evidenceRefs.length > 0 || ref.rejectedEvidenceRefs.length > 0 || ref.repairHint.length > 0;
  }
  return ref.repairHint.length > 0;
}

function hashPresent(value: string | null): boolean {
  return value !== null && isSha256(value);
}

function meetsMinimum(value: number | null, minimum: number | null): boolean {
  return value !== null && minimum !== null && value >= minimum;
}

function hasReplayableIncidentTriageLens(ref: QuestionScoreIncidentTriageLensRef): boolean {
  if (
    ref.environmentId.length === 0 ||
    ref.sourceRef.length === 0 ||
    ref.taskId.length === 0 ||
    ref.scenarioId.length === 0 ||
    !isSha256(ref.rowHash)
  ) {
    return false;
  }
  if (![
    ref.openEnvConfigHash,
    ref.scenarioManifestHash,
    ref.incidentReportHash,
    ref.rawLogBundleHash,
    ref.metricSnapshotHash,
    ref.userReportHash,
    ref.actionPayloadHash,
    ref.graderConfigHash,
    ref.feedbackHash,
  ].every(hashPresent)) {
    return false;
  }
  if (ref.status === "satisfied") {
    return ref.evidenceRefs.length > 0 &&
      ref.deterministicGrader &&
      meetsMinimum(ref.reward0to1, ref.minReward0to1) &&
      meetsMinimum(ref.rootCauseScore0to1, ref.minRootCauseScore0to1) &&
      meetsMinimum(ref.redHerringFilterScore0to1, ref.minRedHerringFilterScore0to1) &&
      meetsMinimum(ref.orderedRemediationScore0to1, ref.minOrderedRemediationScore0to1) &&
      ref.maxSteps !== null &&
      ref.stepCount !== null &&
      ref.stepCount <= ref.maxSteps;
  }
  if (ref.status === "failed") {
    return ref.evidenceRefs.length > 0 || ref.rejectedEvidenceRefs.length > 0 || ref.repairHint.length > 0;
  }
  return ref.repairHint.length > 0;
}

function hasReplayableBenchmarkCriterion(ref: QuestionScoreBenchmarkCriterionRef): boolean {
  if (ref.criterionId.length === 0 || ref.repairHint.length === 0) {
    return false;
  }
  if (ref.score0to1 === null) {
    return false;
  }
  if (ref.status === "satisfied") {
    return ref.evidenceRefs.length > 0;
  }
  if (ref.status === "failed") {
    return ref.evidenceRefs.length > 0 || ref.rejectedEvidenceRefs.length > 0;
  }
  return ref.repairHint.length > 0;
}

function hasReplayableBenchmarkSubmissionLens(ref: QuestionScoreBenchmarkSubmissionLensRef): boolean {
  if (
    ref.benchmarkId.length === 0 ||
    ref.sourceRef.length === 0 ||
    ref.submissionId.length === 0 ||
    ref.taskId.length === 0 ||
    ref.taskCategory.length === 0 ||
    !isSha256(ref.rowHash)
  ) {
    return false;
  }
  if (![
    ref.submissionMetadataHash,
    ref.taskBreakdownHash,
    ref.leaderboardSnapshotHash,
  ].every(hashPresent)) {
    return false;
  }
  if (ref.status === "satisfied") {
    return ref.evidenceRefs.length > 0 &&
      ref.submissionVersion !== null &&
      ref.agentVersion !== null &&
      ref.submittedAt !== null &&
      (ref.taskStatus === "success" || ref.taskStatus === "warning") &&
      ref.overallScore0to100 !== null &&
      ref.categoryScore0to100 !== null &&
      ref.speedMs !== null &&
      ref.costUsd !== null &&
      ref.leaderboardMetricViews.length > 0 &&
      ref.criterionScores.length > 0 &&
      ref.criterionScores.every(hasReplayableBenchmarkCriterion);
  }
  if (ref.status === "failed") {
    return ref.evidenceRefs.length > 0 || ref.rejectedEvidenceRefs.length > 0 || ref.repairHint.length > 0;
  }
  return ref.repairHint.length > 0;
}

function hasReplayableTestSuiteEvaluationLens(ref: QuestionScoreTestSuiteEvaluationLensRef): boolean {
  if (
    ref.suiteId.length === 0 ||
    ref.sourceRef.length === 0 ||
    ref.datasetRef.length === 0 ||
    ref.testCaseId.length === 0 ||
    !isSha256(ref.rowHash)
  ) {
    return false;
  }
  if (![
    ref.datasetHash,
    ref.testCaseHash,
    ref.evaluatorConfigHash,
    ref.experimentResultHash,
    ref.exportArtifactHash,
    ref.ciConfigHash,
  ].every(hashPresent)) {
    return false;
  }
  if (ref.agentBehaviorEvaluation && ![
    ref.traceArtifactHash,
    ref.toolCallValidationHash,
  ].every(hashPresent)) {
    return false;
  }
  if (ref.status === "satisfied") {
    return ref.evidenceRefs.length > 0 &&
      ref.evaluatorIds.length > 0 &&
      ref.experimentRunId !== null &&
      ref.ciRunId !== null &&
      meetsMinimum(ref.passRate0to1, ref.minPassRate0to1) &&
      meetsMinimum(ref.averageScore0to1, ref.threshold0to1);
  }
  if (ref.status === "failed") {
    return ref.evidenceRefs.length > 0 || ref.rejectedEvidenceRefs.length > 0 || ref.repairHint.length > 0;
  }
  return ref.repairHint.length > 0;
}

function sourceHashPresent(value: string | null): boolean {
  return value !== null && (isSha256(value) || isGitSha(value));
}

function evalAiLibraryMetricsMeetThreshold(ref: QuestionScoreEvalAiLibraryQuestionLensRef): boolean {
  return ref.providerCount !== null &&
    ref.minProviderCount !== null &&
    ref.providerCount >= ref.minProviderCount &&
    ref.metricCount !== null &&
    ref.minMetricCount !== null &&
    ref.metricCount >= ref.minMetricCount &&
    ref.questionCount !== null &&
    ref.minQuestionCount !== null &&
    ref.questionCount >= ref.minQuestionCount &&
    meetsMinimum(ref.evidenceCoverage0to1, ref.minEvidenceCoverage0to1) &&
    meetsMinimum(ref.rejectedEvidenceReasonCoverage0to1, ref.minRejectedEvidenceReasonCoverage0to1) &&
    meetsMinimum(ref.repairHintCoverage0to1, ref.minRepairHintCoverage0to1) &&
    meetsMinimum(ref.regressionPassRate0to1, ref.minRegressionPassRate0to1) &&
    meetsMinimum(ref.scoreConfidence0to1, ref.minScoreConfidence0to1);
}

function hasReplayableEvalAiLibraryQuestionLens(ref: QuestionScoreEvalAiLibraryQuestionLensRef): boolean {
  if (
    ref.frameworkId.length === 0 ||
    ref.frameworkId.startsWith("unknown-") ||
    ref.sourceRef.length === 0 ||
    ref.sourceRef === "unknown-source" ||
    ref.repositoryRef.length === 0 ||
    ref.repositoryRef === "unknown-repository" ||
    ref.defaultBranch.length === 0 ||
    ref.defaultBranch === "unknown-branch" ||
    !isSha256(ref.rowHash)
  ) {
    return false;
  }
  if (
    ref.licenseRef === null ||
    ref.licenseSpdxId === null ||
    ref.sourceCommitSha === null ||
    ref.sourceTreeSha === null
  ) {
    return false;
  }
  if (![
    ref.readmeArtifactHash,
    ref.licenseArtifactHash,
    ref.noticeArtifactHash,
    ref.pyprojectArtifactHash,
    ref.requirementsArtifactHash,
    ref.evalLibTreeHash,
    ref.metricsTreeHash,
    ref.agentMetricsTreeHash,
    ref.securityMetricsTreeHash,
    ref.tracingTreeHash,
    ref.dashboardArtifactHash,
    ref.evaluationSchemaHash,
    ref.testcasesSchemaHash,
    ref.metricPatternHash,
    ref.llmClientHash,
  ].every(sourceHashPresent)) {
    return false;
  }
  if (![
    ref.sourceStatusHash,
    ref.evalPackManifestHash,
    ref.datasetManifestHash,
    ref.questionSetHash,
    ref.questionTraceHash,
    ref.evaluatorConfigHash,
    ref.metricResultHash,
    ref.scoreBreakdownHash,
    ref.rejectedEvidenceLedgerHash,
    ref.repairHintHash,
    ref.regressionThresholdHash,
    ref.ciConfigHash,
    ref.noSourceCopyBoundaryHash,
  ].every(hashPresent)) {
    return false;
  }
  if (ref.status === "satisfied") {
    return ref.evidenceRefs.length > 0 &&
      ref.metricFamily !== "custom" &&
      ref.metricIds.length > 0 &&
      ref.ciRunId !== null &&
      evalAiLibraryMetricsMeetThreshold(ref);
  }
  if (ref.status === "failed") {
    return ref.evidenceRefs.length > 0 || ref.rejectedEvidenceRefs.length > 0 || ref.repairHint.length > 0;
  }
  return ref.repairHint.length > 0;
}

function openModelRagMetricsMeetThreshold(ref: QuestionScoreOpenModelRagQuestionLensRef): boolean {
  return ref.ragQueryCount !== null &&
    ref.minRagQueryCount !== null &&
    ref.ragQueryCount >= ref.minRagQueryCount &&
    meetsMinimum(ref.retrievalGroundingScore0to1, ref.minRetrievalGroundingScore0to1) &&
    meetsMinimum(ref.answerRelevanceScore0to1, ref.minAnswerRelevanceScore0to1) &&
    meetsMinimum(ref.evidenceCoverage0to1, ref.minEvidenceCoverage0to1) &&
    meetsMinimum(ref.rejectedEvidenceReasonCoverage0to1, ref.minRejectedEvidenceReasonCoverage0to1) &&
    meetsMinimum(ref.repairHintCoverage0to1, ref.minRepairHintCoverage0to1) &&
    meetsMinimum(ref.regressionPassRate0to1, ref.minRegressionPassRate0to1);
}

function hasReplayableOpenModelRagQuestionLens(ref: QuestionScoreOpenModelRagQuestionLensRef): boolean {
  if (
    ref.frameworkId.length === 0 ||
    ref.frameworkId.startsWith("unknown-") ||
    ref.sourceRef.length === 0 ||
    ref.sourceRef === "unknown-source" ||
    ref.repositoryRef.length === 0 ||
    ref.repositoryRef === "unknown-repository" ||
    ref.defaultBranch.length === 0 ||
    ref.defaultBranch === "unknown-branch" ||
    !isSha256(ref.rowHash)
  ) {
    return false;
  }
  if (ref.sourceCommitSha === null || ref.sourceTreeSha === null) {
    return false;
  }
  if (![
    ref.licenseBoundaryHash,
    ref.sourceStatusHash,
    ref.retrievalTraceHash,
    ref.questionSetHash,
    ref.questionTraceHash,
    ref.evaluatorConfigHash,
    ref.metricResultHash,
    ref.scoreBreakdownHash,
    ref.rejectedEvidenceLedgerHash,
    ref.repairHintHash,
    ref.regressionThresholdHash,
    ref.ciConfigHash,
    ref.noSourceCopyBoundaryHash,
  ].every(hashPresent)) {
    return false;
  }
  if (![
    ref.readmeArtifactHash,
    ref.javaSourceTreeHash,
    ref.buildConfigHash,
    ref.dependencyManifestHash,
    ref.langChain4jIntegrationHash,
    ref.ollamaRuntimeConfigHash,
    ref.ragPipelineHash,
    ref.ragCorpusManifestHash,
    ref.embeddingConfigHash,
    ref.evaluationManifestHash,
  ].every(sourceHashPresent)) {
    return false;
  }
  if (ref.status === "satisfied") {
    return ref.evidenceRefs.length > 0 &&
      ref.ciRunId !== null &&
      ref.runtime !== "custom" &&
      ref.openModelIds.length > 0 &&
      ref.evaluationMetricIds.length > 0 &&
      openModelRagMetricsMeetThreshold(ref);
  }
  if (ref.status === "failed") {
    return ref.evidenceRefs.length > 0 || ref.rejectedEvidenceRefs.length > 0 || ref.repairHint.length > 0;
  }
  return ref.repairHint.length > 0;
}

function opikEvaluationMetricsMeetThreshold(ref: QuestionScoreOpikEvaluationQuestionLensRef): boolean {
  return ref.traceCount !== null &&
    ref.minTraceCount !== null &&
    ref.traceCount >= ref.minTraceCount &&
    ref.questionCount !== null &&
    ref.minQuestionCount !== null &&
    ref.questionCount >= ref.minQuestionCount &&
    meetsMinimum(ref.evidenceCoverage0to1, ref.minEvidenceCoverage0to1) &&
    meetsMinimum(ref.rejectedEvidenceReasonCoverage0to1, ref.minRejectedEvidenceReasonCoverage0to1) &&
    meetsMinimum(ref.repairHintCoverage0to1, ref.minRepairHintCoverage0to1) &&
    meetsMinimum(ref.thresholdPassRate0to1, ref.minThresholdPassRate0to1) &&
    meetsMinimum(ref.scoreConfidence0to1, ref.minScoreConfidence0to1);
}

function hasReplayableOpikEvaluationQuestionLens(ref: QuestionScoreOpikEvaluationQuestionLensRef): boolean {
  if (
    ref.lensId.length === 0 ||
    ref.lensId.startsWith("unknown-") ||
    ref.sourceRef.length === 0 ||
    ref.sourceRef === "unknown-source" ||
    ref.productUrl.length === 0 ||
    ref.questionIdRef.length === 0 ||
    ref.questionIdRef === "unknown-question-id" ||
    !isSha256(ref.rowHash)
  ) {
    return false;
  }
  if (![
    ref.liveRelevanceCheckHash,
    ref.datasetManifestHash,
    ref.traceExportHash,
    ref.evalPackManifestHash,
    ref.questionSetHash,
    ref.questionTraceHash,
    ref.evaluatorConfigHash,
    ref.metricResultHash,
    ref.scoreBreakdownHash,
    ref.acceptedEvidenceLedgerHash,
    ref.rejectedEvidenceLedgerHash,
    ref.repairHintHash,
    ref.thresholdPolicyHash,
    ref.signedEvidenceRowsHash,
    ref.ciConfigHash,
    ref.noParityClaimHash,
    ref.noSourceCopyBoundaryHash,
  ].every(hashPresent)) {
    return false;
  }
  if (ref.status === "satisfied") {
    return ref.evidenceRefs.length > 0 &&
      ref.metricFamily !== "custom" &&
      ref.metricIds.length > 0 &&
      ref.projectRef !== null &&
      ref.experimentRef !== null &&
      ref.ciRunId !== null &&
      opikEvaluationMetricsMeetThreshold(ref);
  }
  if (ref.status === "failed") {
    return ref.evidenceRefs.length > 0 || ref.rejectedEvidenceRefs.length > 0 || ref.repairHint.length > 0;
  }
  return ref.repairHint.length > 0;
}

function meetsMaximum(value: number | null, maximum: number | null): boolean {
  return value !== null && maximum !== null && value <= maximum;
}

function trialCountsConsistent(ref: QuestionScoreAgentTrialStatisticalLensRef): boolean {
  return ref.trialCount !== null &&
    ref.minTrialCount !== null &&
    ref.passCount !== null &&
    ref.trialCount >= ref.minTrialCount &&
    ref.passCount <= ref.trialCount;
}

function agentTrialMetricsMeetThreshold(ref: QuestionScoreAgentTrialStatisticalLensRef): boolean {
  return trialCountsConsistent(ref) &&
    meetsMinimum(ref.passRate0to1, ref.minPassRate0to1) &&
    meetsMinimum(ref.wilsonLower0to1, ref.minWilsonLower0to1) &&
    ref.wilsonConfidenceLevel !== null &&
    ref.wilsonUpper0to1 !== null &&
    ref.wilsonLower0to1 !== null &&
    ref.wilsonUpper0to1 >= ref.wilsonLower0to1 &&
    meetsMaximum(ref.bootstrapCostMeanUsd, ref.maxCostMeanUsd) &&
    meetsMaximum(ref.bootstrapLatencyMeanMs, ref.maxLatencyMeanMs) &&
    meetsMinimum(ref.agentReliabilityScore0to1, ref.minAgentReliabilityScore0to1) &&
    ref.failureAttributionStepId !== null &&
    meetsMaximum(ref.failureAttributionPValue, ref.maxFailureAttributionPValue) &&
    ref.regressionTestName !== null &&
    meetsMinimum(ref.regressionPValue, ref.minRegressionPValue);
}

function hasReplayableAgentTrialStatisticalLens(ref: QuestionScoreAgentTrialStatisticalLensRef): boolean {
  if (
    ref.suiteId.length === 0 ||
    ref.sourceRef.length === 0 ||
    ref.caseId.length === 0 ||
    ref.caseName.length === 0 ||
    !isSha256(ref.rowHash)
  ) {
    return false;
  }
  if (![
    ref.suiteManifestHash,
    ref.caseManifestHash,
    ref.runManifestHash,
    ref.trialManifestHash,
    ref.statisticalReportHash,
    ref.trajectoryBundleHash,
    ref.failureAttributionHash,
    ref.baselineResultHash,
    ref.candidateResultHash,
    ref.ciConfigHash,
    ref.dashboardSnapshotHash,
  ].every(hashPresent)) {
    return false;
  }
  if (ref.status === "satisfied") {
    return ref.evidenceRefs.length > 0 &&
      ref.packageRef !== null &&
      ref.adapter !== "custom" &&
      ref.ciRunId !== null &&
      agentTrialMetricsMeetThreshold(ref);
  }
  if (ref.status === "failed") {
    return ref.evidenceRefs.length > 0 || ref.rejectedEvidenceRefs.length > 0 || ref.repairHint.length > 0;
  }
  return ref.repairHint.length > 0;
}

function hasReplayableCodeQuestDimension(ref: QuestionScoreCodeQuestQualityDimensionRef): boolean {
  if (
    ref.dimensionId.length === 0 ||
    ref.dimensionLabel.length === 0 ||
    !isSha256(ref.rowHash) ||
    ref.baselineScore0to1 === null ||
    ref.candidateScore0to1 === null ||
    ref.scoreDelta0to1 === null
  ) {
    return false;
  }
  if (ref.status === "improved") {
    return ref.evidenceRefs.length > 0 && meetsMinimum(ref.scoreDelta0to1, ref.minScoreDelta0to1);
  }
  if (ref.status === "unchanged") {
    return ref.evidenceRefs.length > 0 && ref.scoreDelta0to1 >= 0;
  }
  if (ref.status === "regressed") {
    return ref.rejectedEvidenceRefs.length > 0 || ref.repairHint.length > 0;
  }
  return ref.repairHint.length > 0;
}

function codeQuestDimensionCountsMeetThreshold(ref: QuestionScoreCodeQuestQualityLensRef): boolean {
  return ref.dimensionCount !== null &&
    ref.minDimensionCount !== null &&
    ref.dimensionCount >= ref.minDimensionCount &&
    ref.dimensions.length >= ref.minDimensionCount;
}

function codeQuestMetricsMeetThreshold(ref: QuestionScoreCodeQuestQualityLensRef): boolean {
  return codeQuestDimensionCountsMeetThreshold(ref) &&
    meetsMinimum(ref.overallScoreDelta0to1, ref.minOverallScoreDelta0to1) &&
    meetsMaximum(ref.dimensionRegressionCount, ref.maxDimensionRegressionCount) &&
    meetsMinimum(ref.evaluatorFeedbackCoverage0to1, ref.minEvaluatorFeedbackCoverage0to1) &&
    meetsMinimum(ref.optimizerGroundingCoverage0to1, ref.minOptimizerGroundingCoverage0to1) &&
    ref.dimensions.every(hasReplayableCodeQuestDimension) &&
    ref.dimensions.every((dimension) => dimension.status !== "regressed" && dimension.status !== "not_evaluated");
}

function hasReplayableCodeQuestQualityLens(ref: QuestionScoreCodeQuestQualityLensRef): boolean {
  if (
    ref.frameworkId.length === 0 ||
    ref.sourceRef.length === 0 ||
    ref.repositoryRef.length === 0 ||
    ref.repositoryRef === "unknown-repository" ||
    ref.taskId.length === 0 ||
    !isSha256(ref.rowHash)
  ) {
    return false;
  }
  if (ref.licenseRef === null) {
    return false;
  }
  if (![
    ref.sourceStatusHash,
    ref.codeArtifactHash,
    ref.evaluatorPromptHash,
    ref.evaluatorConfigHash,
    ref.optimizerPromptHash,
    ref.optimizerConfigHash,
    ref.baselineEvaluationHash,
    ref.candidateEvaluationHash,
    ref.evaluatorFeedbackHash,
    ref.optimizerGroundingHash,
    ref.improvementPatchHash,
    ref.actorCriticLoopTraceHash,
    ref.regressionSuiteHash,
    ref.replayCommandHash,
    ref.ciConfigHash,
    ref.noSourceCopyBoundaryHash,
  ].every(hashPresent)) {
    return false;
  }
  if (ref.status === "satisfied") {
    return ref.evidenceRefs.length > 0 &&
      ref.ciRunId !== null &&
      codeQuestMetricsMeetThreshold(ref);
  }
  if (ref.status === "failed") {
    return ref.evidenceRefs.length > 0 || ref.rejectedEvidenceRefs.length > 0 || ref.repairHint.length > 0;
  }
  return ref.repairHint.length > 0;
}

function multiUserScenarioMetricMeetsThreshold(ref: QuestionScoreMultiUserBenchmarkLensRef): boolean {
  if (ref.scenarioFamily === "access_control") {
    return meetsMinimum(ref.privacyPassRate0to1, ref.minPrivacyPassRate0to1);
  }
  if (ref.scenarioFamily === "meeting_scheduling") {
    return meetsMinimum(ref.coordinationSuccessRate0to1, ref.minCoordinationSuccessRate0to1);
  }
  if (ref.scenarioFamily === "shared_queue") {
    return meetsMinimum(ref.queueFairnessScore0to1, ref.minQueueFairnessScore0to1);
  }
  if (ref.scenarioFamily === "multiuser_instruction_following") {
    return meetsMinimum(ref.instructionFollowingScore0to1, ref.minInstructionFollowingScore0to1);
  }
  return meetsMinimum(ref.privacyPassRate0to1, ref.minPrivacyPassRate0to1) ||
    meetsMinimum(ref.coordinationSuccessRate0to1, ref.minCoordinationSuccessRate0to1) ||
    meetsMinimum(ref.queueFairnessScore0to1, ref.minQueueFairnessScore0to1) ||
    meetsMinimum(ref.instructionFollowingScore0to1, ref.minInstructionFollowingScore0to1);
}

function multiUserScenarioProofPresent(ref: QuestionScoreMultiUserBenchmarkLensRef): boolean {
  if (ref.scenarioFamily === "access_control") {
    return hashPresent(ref.permissionPolicyHash);
  }
  if (ref.scenarioFamily === "meeting_scheduling") {
    return hashPresent(ref.preferenceProfileHash);
  }
  if (ref.scenarioFamily === "shared_queue") {
    return hashPresent(ref.resourceQueuePolicyHash);
  }
  if (ref.scenarioFamily === "multiuser_instruction_following") {
    return hashPresent(ref.instructionSetHash);
  }
  return hashPresent(ref.permissionPolicyHash) ||
    hashPresent(ref.preferenceProfileHash) ||
    hashPresent(ref.resourceQueuePolicyHash) ||
    hashPresent(ref.instructionSetHash);
}

function hasReplayableMultiUserBenchmarkLens(ref: QuestionScoreMultiUserBenchmarkLensRef): boolean {
  if (
    ref.benchmarkId.length === 0 ||
    ref.sourceRef.length === 0 ||
    ref.scenarioId.length === 0 ||
    !isSha256(ref.rowHash)
  ) {
    return false;
  }
  if (![
    ref.datasetManifestHash,
    ref.userRoleManifestHash,
    ref.instructionSetHash,
    ref.interactionTraceHash,
    ref.evaluatorConfigHash,
    ref.resultArtifactHash,
    ref.metricReportHash,
  ].every(hashPresent)) {
    return false;
  }
  if (!multiUserScenarioProofPresent(ref)) {
    return false;
  }
  if (ref.status === "satisfied") {
    return ref.evidenceRefs.length > 0 &&
      ref.userRoleCount !== null &&
      ref.userRoleCount >= 2 &&
      ref.turnCount !== null &&
      ref.turnCount > 0 &&
      multiUserScenarioMetricMeetsThreshold(ref);
  }
  if (ref.status === "failed") {
    return ref.evidenceRefs.length > 0 || ref.rejectedEvidenceRefs.length > 0 || ref.repairHint.length > 0;
  }
  return ref.repairHint.length > 0;
}

function professionalTaskMetricsMeetThreshold(ref: QuestionScoreProfessionalTaskLensRef): boolean {
  return meetsMinimum(ref.passRate0to1, ref.minPassRate0to1) &&
    meetsMinimum(ref.robustnessScore0to1, ref.minRobustnessScore0to1) &&
    ref.verifierVoteCount !== null &&
    ref.minVerifierVoteCount !== null &&
    ref.verifierVoteCount >= ref.minVerifierVoteCount &&
    ref.trajectoryStepCount !== null &&
    ref.maxTrajectoryStepCount !== null &&
    ref.trajectoryStepCount <= ref.maxTrajectoryStepCount;
}

function hasReplayableProfessionalTaskLens(ref: QuestionScoreProfessionalTaskLensRef): boolean {
  if (
    ref.benchmarkId.length === 0 ||
    ref.sourceRef.length === 0 ||
    ref.taskId.length === 0 ||
    ref.scenarioId.length === 0 ||
    ref.industryCategory.length === 0 ||
    ref.professionalDomain.length === 0 ||
    !isSha256(ref.rowHash)
  ) {
    return false;
  }
  if (![
    ref.datasetManifestHash,
    ref.scenarioManifestHash,
    ref.worldModelConfigHash,
    ref.toolSchemaHash,
    ref.agentConfigHash,
    ref.faultInjectionConfigHash,
    ref.verifierRubricHash,
    ref.verifierVoteManifestHash,
    ref.trajectoryHash,
    ref.resultArtifactHash,
    ref.replayConfigHash,
  ].every(hashPresent)) {
    return false;
  }
  if (ref.status === "satisfied") {
    return ref.evidenceRefs.length > 0 &&
      ref.environmentMode !== "custom" &&
      ref.faultMode !== "custom" &&
      ref.difficultyLevel !== null &&
      professionalTaskMetricsMeetThreshold(ref);
  }
  if (ref.status === "failed") {
    return ref.evidenceRefs.length > 0 || ref.rejectedEvidenceRefs.length > 0 || ref.repairHint.length > 0;
  }
  return ref.repairHint.length > 0;
}

function iotFirmwareMetricsMeetThreshold(ref: QuestionScoreIotFirmwareQuestionLensRef): boolean {
  return meetsMinimum(ref.bugClosureRate0to1, ref.minBugClosureRate0to1) &&
    meetsMinimum(ref.tokenEfficiencyRatio, ref.minTokenEfficiencyRatio) &&
    meetsMinimum(ref.logCaptureCoverage0to1, ref.minLogCaptureCoverage0to1);
}

function hasReplayableIotFirmwareQuestionLens(ref: QuestionScoreIotFirmwareQuestionLensRef): boolean {
  if (
    ref.benchmarkId.length === 0 ||
    ref.benchmarkId.startsWith("unknown-") ||
    ref.sourceRef.length === 0 ||
    ref.sourceRef === "unknown-source" ||
    ref.taskId.length === 0 ||
    ref.taskId === "unknown-task" ||
    ref.boardId.length === 0 ||
    ref.boardId === "unknown-board" ||
    ref.chipFamily.length === 0 ||
    ref.chipFamily === "unknown-chip" ||
    !isSha256(ref.rowHash)
  ) {
    return false;
  }
  if (![
    ref.firmwareProjectHash,
    ref.toolchainManifestHash,
    ref.sdkVersionManifestHash,
    ref.hardwareSessionHash,
    ref.deviceLogBundleHash,
    ref.buildArtifactHash,
    ref.flashArtifactHash,
    ref.testArtifactHash,
    ref.knowledgePackManifestHash,
    ref.taskManifestHash,
    ref.evaluatorConfigHash,
    ref.resultArtifactHash,
    ref.privacyBoundaryHash,
    ref.benchmarkReportHash,
  ].every(hashPresent)) {
    return false;
  }
  if (ref.status === "satisfied") {
    return ref.evidenceRefs.length > 0 &&
      ref.platform !== "custom" &&
      ref.hardwareRunCount !== null &&
      ref.hardwareRunCount > 0 &&
      ref.deviceCount !== null &&
      ref.deviceCount > 0 &&
      iotFirmwareMetricsMeetThreshold(ref);
  }
  if (ref.status === "failed") {
    return ref.evidenceRefs.length > 0 || ref.rejectedEvidenceRefs.length > 0 || ref.repairHint.length > 0;
  }
  return ref.repairHint.length > 0;
}

function retailSalesMetricsMeetThreshold(ref: QuestionScoreRetailSalesQuestionLensRef): boolean {
  return meetsMinimum(ref.orderCaptureAccuracy0to1, ref.minOrderCaptureAccuracy0to1) &&
    meetsMinimum(ref.policyComplianceRate0to1, ref.minPolicyComplianceRate0to1) &&
    meetsMinimum(ref.recommendationGrounding0to1, ref.minRecommendationGrounding0to1) &&
    meetsMinimum(ref.piiRedactionRate0to1, ref.minPiiRedactionRate0to1);
}

function hasReplayableRetailSalesQuestionLens(ref: QuestionScoreRetailSalesQuestionLensRef): boolean {
  if (
    ref.benchmarkId.length === 0 ||
    ref.benchmarkId.startsWith("unknown-") ||
    ref.sourceRef.length === 0 ||
    ref.sourceRef === "unknown-source" ||
    ref.taskId.length === 0 ||
    ref.taskId === "unknown-task" ||
    !isSha256(ref.rowHash)
  ) {
    return false;
  }
  if (![
    ref.productCatalogHash,
    ref.productDescriptionHash,
    ref.customerScenarioHash,
    ref.conversationTraceHash,
    ref.customerIntentManifestHash,
    ref.orderCaptureSchemaHash,
    ref.orderLedgerHash,
    ref.pricingPolicyHash,
    ref.discountPolicyHash,
    ref.modelAdapterManifestHash,
    ref.modelProviderMatrixHash,
    ref.promptPolicyHash,
    ref.recommendationPolicyHash,
    ref.safetyPolicyHash,
    ref.privacyBoundaryHash,
    ref.evaluatorConfigHash,
    ref.resultArtifactHash,
    ref.benchmarkReportHash,
  ].every(hashPresent)) {
    return false;
  }
  if (ref.status === "satisfied") {
    return ref.evidenceRefs.length > 0 &&
      ref.salesChannel !== "custom" &&
      ref.modelProviderCount !== null &&
      ref.modelProviderCount >= 2 &&
      ref.customerScenarioCount !== null &&
      ref.customerScenarioCount > 0 &&
      ref.orderCount !== null &&
      ref.orderCount > 0 &&
      retailSalesMetricsMeetThreshold(ref);
  }
  if (ref.status === "failed") {
    return ref.evidenceRefs.length > 0 || ref.rejectedEvidenceRefs.length > 0 || ref.repairHint.length > 0;
  }
  return ref.repairHint.length > 0;
}

function continualLearningMetricsMeetThreshold(ref: QuestionScoreContinualLearningBenchmarkLensRef): boolean {
  return meetsMinimum(ref.taskCompletionRate0to1, ref.minTaskCompletionRate0to1) &&
    meetsMinimum(ref.responseQualityScore0to1, ref.minResponseQualityScore0to1) &&
    meetsMinimum(ref.stateAccuracy0to1, ref.minStateAccuracy0to1) &&
    meetsMinimum(ref.retentionScore0to1, ref.minRetentionScore0to1) &&
    (
      ref.maxTokenCostUsd === null ||
      (ref.tokenCostUsd !== null && ref.tokenCostUsd <= ref.maxTokenCostUsd)
    );
}

function hasReplayableContinualLearningBenchmarkLens(
  ref: QuestionScoreContinualLearningBenchmarkLensRef,
): boolean {
  if (
    ref.benchmarkId.length === 0 ||
    ref.sourceRef.length === 0 ||
    ref.domainId.length === 0 ||
    ref.workflowId.length === 0 ||
    !isSha256(ref.rowHash)
  ) {
    return false;
  }
  if (![
    ref.datasetManifestHash,
    ref.stateSchemaHash,
    ref.initialStateHash,
    ref.stateMutationTraceHash,
    ref.conversationTraceHash,
    ref.entityRelationshipGraphHash,
    ref.toolExecutionTraceHash,
    ref.evaluatorConfigHash,
    ref.resultArtifactHash,
    ref.replayCommandHash,
  ].every(hashPresent)) {
    return false;
  }
  if (ref.status === "satisfied") {
    return ref.evidenceRefs.length > 0 &&
      ref.scenarioCount !== null &&
      ref.scenarioCount > 0 &&
      ref.turnCount !== null &&
      ref.turnCount > 0 &&
      ref.stateMutationCount !== null &&
      ref.stateMutationCount > 0 &&
      ref.entityCount !== null &&
      ref.entityCount > 0 &&
      continualLearningMetricsMeetThreshold(ref);
  }
  if (ref.status === "failed") {
    return ref.evidenceRefs.length > 0 || ref.rejectedEvidenceRefs.length > 0 || ref.repairHint.length > 0;
  }
  return ref.repairHint.length > 0;
}

function hermesTurboPerformanceMetricsMeetThreshold(ref: QuestionScoreHermesTurboPerformanceLensRef): boolean {
  return ref.runCount !== null &&
    ref.minRunCount !== null &&
    ref.runCount >= ref.minRunCount &&
    meetsMaximum(ref.latencyP50Ms, ref.maxLatencyP50Ms) &&
    meetsMaximum(ref.latencyP95Ms, ref.maxLatencyP95Ms) &&
    meetsMinimum(ref.throughputOpsPerSec, ref.minThroughputOpsPerSec) &&
    meetsMinimum(ref.speedupFactor, ref.minSpeedupFactor) &&
    meetsMinimum(ref.scoreDelta0to1, ref.minScoreDelta0to1) &&
    meetsMinimum(ref.dashboardCoverage0to1, ref.minDashboardCoverage0to1) &&
    meetsMinimum(ref.regressionPassRate0to1, ref.minRegressionPassRate0to1);
}

function hasReplayableHermesTurboPerformanceLens(ref: QuestionScoreHermesTurboPerformanceLensRef): boolean {
  if (
    ref.benchmarkId.length === 0 ||
    ref.benchmarkId.startsWith("unknown-") ||
    ref.sourceRef.length === 0 ||
    ref.sourceRef === "unknown-source" ||
    ref.repositoryRef.length === 0 ||
    ref.repositoryRef === "unknown-repository" ||
    ref.defaultBranch.length === 0 ||
    ref.defaultBranch === "unknown-branch" ||
    !isSha256(ref.rowHash)
  ) {
    return false;
  }
  if (
    ref.licenseRef === null ||
    ref.licenseSpdxId === null ||
    ref.sourceCommitSha === null ||
    ref.sourceTreeSha === null
  ) {
    return false;
  }
  if (![
    ref.sourceStatusHash,
    ref.readmeArtifactHash,
    ref.packageManifestHash,
    ref.benchmarkWorkflowHash,
    ref.perfBudgetWorkflowHash,
    ref.dailyScoreWorkflowHash,
    ref.turboScoreScriptHash,
    ref.performanceDashboardHash,
    ref.benchmarkReportHash,
    ref.baselineResultHash,
    ref.candidateResultHash,
    ref.latencyTraceHash,
    ref.throughputTraceHash,
    ref.scoreManifestHash,
    ref.regressionThresholdHash,
    ref.ciConfigHash,
  ].every(hashPresent)) {
    return false;
  }
  if (ref.status === "satisfied") {
    return ref.evidenceRefs.length > 0 &&
      ref.performanceFacet !== "custom" &&
      ref.ciRunId !== null &&
      hermesTurboPerformanceMetricsMeetThreshold(ref);
  }
  if (ref.status === "failed") {
    return ref.evidenceRefs.length > 0 || ref.rejectedEvidenceRefs.length > 0 || ref.repairHint.length > 0;
  }
  return ref.repairHint.length > 0;
}

function scorableStudioRoutePresent(ref: QuestionScoreScorableStudioDrilldownLensRef): boolean {
  return ref.uiRoutePath.startsWith("/api/v1/score/evidence-drilldown/") ||
    ref.uiRoutePath.includes("evidenceDrilldown");
}

function obsStudioRoutePresent(ref: QuestionScoreObsStudioDrilldownLensRef): boolean {
  return ref.uiRoutePath.startsWith("/api/v1/score/evidence-drilldown/") ||
    ref.uiRoutePath.includes("evidenceDrilldown");
}

function obsStudioCountsMeetThreshold(ref: QuestionScoreObsStudioDrilldownLensRef): boolean {
  return ref.evidencePreviewCount !== null &&
    ref.minEvidencePreviewCount !== null &&
    ref.evidencePreviewCount >= ref.minEvidencePreviewCount &&
    ref.sourceArtifactLinkCount !== null &&
    ref.minSourceArtifactLinkCount !== null &&
    ref.sourceArtifactLinkCount >= ref.minSourceArtifactLinkCount &&
    ref.sourceArtifactLinks.length >= ref.minSourceArtifactLinkCount;
}

function obsStudioPaperMetadataPresent(ref: QuestionScoreObsStudioDrilldownLensRef): boolean {
  if (ref.sourceKind !== "paper") {
    return true;
  }
  return ref.openAlexWorkId !== null &&
    ref.openAlexWorkId.startsWith("https://openalex.org/W") &&
    ref.doi !== null &&
    ref.doi.startsWith("https://doi.org/") &&
    ref.publisherRef !== null &&
    ref.titleRef !== null &&
    ref.venueRef !== null &&
    ref.publicationDate !== null;
}

function hasReplayableObsStudioDrilldownLens(
  ref: QuestionScoreObsStudioDrilldownLensRef,
): boolean {
  if (
    ref.drilldownId.length === 0 ||
    ref.drilldownId.startsWith("unknown-") ||
    ref.sourceRef.length === 0 ||
    ref.sourceRef === "unknown-source" ||
    ref.sourceKind === "custom" ||
    !obsStudioRoutePresent(ref) ||
    !obsStudioPaperMetadataPresent(ref) ||
    !isSha256(ref.rowHash)
  ) {
    return false;
  }
  if (![
    ref.tracePreviewHash,
    ref.reasoningTracePreviewHash,
    ref.receiptPreviewHash,
    ref.evidencePreviewHash,
    ref.sourceArtifactPreviewHash,
    ref.emptyStateHash,
    ref.errorStateHash,
  ].every(hashPresent)) {
    return false;
  }
  if (ref.status === "satisfied") {
    return ref.evidenceRefs.length > 0 &&
      ref.evidencePreviewState === "ready" &&
      obsStudioCountsMeetThreshold(ref);
  }
  if (ref.status === "failed") {
    return ref.evidenceRefs.length > 0 || ref.rejectedEvidenceRefs.length > 0 || ref.repairHint.length > 0;
  }
  return ref.repairHint.length > 0;
}

function scorableStudioCountsMeetThreshold(ref: QuestionScoreScorableStudioDrilldownLensRef): boolean {
  return ref.evidencePreviewCount !== null &&
    ref.minEvidencePreviewCount !== null &&
    ref.evidencePreviewCount >= ref.minEvidencePreviewCount &&
    ref.sourceArtifactLinkCount !== null &&
    ref.minSourceArtifactLinkCount !== null &&
    ref.sourceArtifactLinkCount >= ref.minSourceArtifactLinkCount &&
    ref.sourceArtifactLinks.length >= ref.minSourceArtifactLinkCount;
}

function hasReplayableScorableStudioDrilldownLens(
  ref: QuestionScoreScorableStudioDrilldownLensRef,
): boolean {
  if (
    ref.drilldownId.length === 0 ||
    ref.drilldownId.startsWith("unknown-") ||
    ref.sourceRef.length === 0 ||
    ref.sourceRef === "unknown-source" ||
    ref.repositoryRef.length === 0 ||
    ref.repositoryRef === "unknown-repository" ||
    ref.defaultBranch.length === 0 ||
    ref.defaultBranch === "unknown-branch" ||
    !isSha256(ref.rowHash)
  ) {
    return false;
  }
  if (
    ref.licenseRef === null ||
    ref.licenseSpdxId === null ||
    ref.sourceCommitSha === null ||
    ref.sourceTreeSha === null ||
    ref.npmPackageRef === null ||
    ref.npmPackageIntegrity === null ||
    ref.npmCliPackageRef === null ||
    ref.npmCliPackageIntegrity === null ||
    !scorableStudioRoutePresent(ref)
  ) {
    return false;
  }
  if (![
    ref.readmeArtifactHash,
    ref.pythonPackageManifestHash,
    ref.pythonOpenApiHash,
    ref.pythonClientHash,
    ref.pythonExecutionLogsHash,
    ref.pythonEvaluatorApiHash,
    ref.pythonExecutionLogApiHash,
    ref.cliPackageManifestHash,
    ref.cliLockfileHash,
    ref.cliEvaluatorCommandHash,
    ref.cliJudgeCommandHash,
    ref.cliExecutionLogCommandHash,
    ref.cliOtelTraceCommandHash,
    ref.cliFileUploadCommandHash,
    ref.typescriptPackageManifestHash,
    ref.typescriptLockfileHash,
    ref.typescriptSourceTreeHash,
    ref.tracePreviewHash,
    ref.receiptPreviewHash,
    ref.policyRulePreviewHash,
    ref.sourceArtifactPreviewHash,
    ref.emptyStateHash,
    ref.errorStateHash,
  ].every(hashPresent)) {
    return false;
  }
  if (ref.status === "satisfied") {
    return ref.evidenceRefs.length > 0 &&
      ref.studioSurface !== "custom" &&
      ref.evidencePreviewState === "ready" &&
      scorableStudioCountsMeetThreshold(ref);
  }
  if (ref.status === "failed") {
    return ref.evidenceRefs.length > 0 || ref.rejectedEvidenceRefs.length > 0 || ref.repairHint.length > 0;
  }
  return ref.repairHint.length > 0;
}

export function buildQuestionExplainabilityReport(
  input: BuildQuestionExplainabilityReportInput
): QuestionScoreExplainabilityReport {
  const rows = input.rows.map<QuestionScoreExplainabilityRow>((item) => {
    const acceptedEvidenceIds = unique(item.acceptedEvidence.map((event) => event.id));
    const signedEvidenceRefs = item.acceptedEvidence.map(signedEvidenceRef);
    const rejectedEvidence = item.rejectedEvidence.map(rejectedEvidenceRef);
    const rejectedEvidenceIds = unique(rejectedEvidence.map((event) => event.evidenceId));
    const missingGateReasons = unique(item.missingGateReasons).slice(0, 12);
    const componentDiagnostics = (item.componentDiagnostics && item.componentDiagnostics.length > 0)
      ? item.componentDiagnostics.map(normalizeComponentDiagnostic)
      : defaultComponentDiagnostics({ acceptedEvidenceIds, rejectedEvidenceIds, missingGateReasons });
    const criteriaDiagnostics = (item.criteriaDiagnostics && item.criteriaDiagnostics.length > 0)
      ? item.criteriaDiagnostics.map(normalizeCriterionDiagnostic)
      : defaultCriterionDiagnostics({ acceptedEvidenceIds, rejectedEvidenceIds, missingGateReasons });
    const rubricLens = (item.rubricLens ?? []).map(normalizeRubricLens);
    const ragFlowDiagnostics = (item.ragFlowDiagnostics ?? []).map(normalizeRagFlowDiagnostic);
    const landscapeLens = (item.landscapeLens ?? []).map(normalizeLandscapeLens);
    const incidentTriageLens = (item.incidentTriageLens ?? []).map(normalizeIncidentTriageLens);
    const benchmarkSubmissionLens = (item.benchmarkSubmissionLens ?? []).map(normalizeBenchmarkSubmissionLens);
    const testSuiteEvaluationLens = (item.testSuiteEvaluationLens ?? []).map(normalizeTestSuiteEvaluationLens);
    const evalAiLibraryQuestionLens = (
      item.evalAiLibraryQuestionLens ?? []
    ).map(normalizeEvalAiLibraryQuestionLens);
    const openModelRagQuestionLens = (
      item.openModelRagQuestionLens ?? []
    ).map(normalizeOpenModelRagQuestionLens);
    const opikEvaluationQuestionLens = (
      item.opikEvaluationQuestionLens ?? []
    ).map(normalizeOpikEvaluationQuestionLens);
    const statisticalAgentTrialLens = (
      item.statisticalAgentTrialLens ?? []
    ).map(normalizeAgentTrialStatisticalLens);
    const codeQuestQualityLens = (item.codeQuestQualityLens ?? []).map(normalizeCodeQuestQualityLens);
    const multiUserBenchmarkLens = (item.multiUserBenchmarkLens ?? []).map(normalizeMultiUserBenchmarkLens);
    const professionalTaskLens = (item.professionalTaskLens ?? []).map(normalizeProfessionalTaskLens);
    const iotFirmwareQuestionLens = (item.iotFirmwareQuestionLens ?? []).map(normalizeIotFirmwareQuestionLens);
    const retailSalesQuestionLens = (item.retailSalesQuestionLens ?? []).map(normalizeRetailSalesQuestionLens);
    const continualLearningBenchmarkLens = (
      item.continualLearningBenchmarkLens ?? []
    ).map(normalizeContinualLearningBenchmarkLens);
    const hermesTurboPerformanceLens = (
      item.hermesTurboPerformanceLens ?? []
    ).map(normalizeHermesTurboPerformanceLens);
    const scorableStudioDrilldownLens = (
      item.scorableStudioDrilldownLens ?? []
    ).map(normalizeScorableStudioDrilldownLens);
    const obsStudioDrilldownLens = (
      item.obsStudioDrilldownLens ?? []
    ).map(normalizeObsStudioDrilldownLens);
    const status = statusFor(item.score, acceptedEvidenceIds, missingGateReasons);
    const rowWithoutHash: Omit<QuestionScoreExplainabilityRow, "rowHash"> = {
      questionId: item.question.id,
      title: item.question.title,
      surfaces: unique([...(item.question.surfaces ?? ["Score"]), "Shield", "Watch"]) as QuestionScoreExplainabilityRow["surfaces"],
      claimedLevel: item.score.claimedLevel,
      supportedMaxLevel: item.score.supportedMaxLevel,
      finalLevel: item.score.finalLevel,
      status,
      evidenceWindow: evidenceWindowFor(signedEvidenceRefs),
      acceptedEvidenceIds,
      signedEvidenceRefs,
      rejectedEvidence,
      componentDiagnostics,
      criteriaDiagnostics,
      rubricLens,
      ragFlowDiagnostics,
      landscapeLens,
      incidentTriageLens,
      benchmarkSubmissionLens,
      testSuiteEvaluationLens,
      evalAiLibraryQuestionLens,
      openModelRagQuestionLens,
      opikEvaluationQuestionLens,
      statisticalAgentTrialLens,
      codeQuestQualityLens,
      multiUserBenchmarkLens,
      professionalTaskLens,
      iotFirmwareQuestionLens,
      retailSalesQuestionLens,
      continualLearningBenchmarkLens,
      hermesTurboPerformanceLens,
      scorableStudioDrilldownLens,
      obsStudioDrilldownLens,
      missingGateReasons,
      repairHint: repairHintFor(item.question, item.score),
      scoreReceiptRef: `diagnostic://${input.runId}/question/${item.question.id}`
    };
    return {
      ...rowWithoutHash,
      rowHash: rowHashFor(rowWithoutHash)
    };
  });

  const replayable = rows.every((row) =>
    isSha256(row.rowHash) &&
    row.acceptedEvidenceIds.length > 0 &&
    row.signedEvidenceRefs.length === row.acceptedEvidenceIds.length &&
    row.evidenceWindow.eventCount === row.acceptedEvidenceIds.length &&
    row.evidenceWindow.distinctSessionCount > 0 &&
    row.signedEvidenceRefs.every(hasSignedEvidence) &&
    row.rejectedEvidence.every(hasSignedEvidence) &&
    row.criteriaDiagnostics.length > 0 &&
    row.criteriaDiagnostics.every(hasReplayableCriterion) &&
    row.rubricLens.every(hasReplayableRubricLens) &&
    row.ragFlowDiagnostics.every(hasReplayableRagFlowDiagnostic) &&
    row.landscapeLens.every(hasReplayableLandscapeLens) &&
    row.incidentTriageLens.every(hasReplayableIncidentTriageLens) &&
    row.benchmarkSubmissionLens.every(hasReplayableBenchmarkSubmissionLens) &&
    row.testSuiteEvaluationLens.every(hasReplayableTestSuiteEvaluationLens) &&
    row.evalAiLibraryQuestionLens.every(hasReplayableEvalAiLibraryQuestionLens) &&
    row.openModelRagQuestionLens.every(hasReplayableOpenModelRagQuestionLens) &&
    row.opikEvaluationQuestionLens.every(hasReplayableOpikEvaluationQuestionLens) &&
    row.statisticalAgentTrialLens.every(hasReplayableAgentTrialStatisticalLens) &&
    row.codeQuestQualityLens.every(hasReplayableCodeQuestQualityLens) &&
    row.multiUserBenchmarkLens.every(hasReplayableMultiUserBenchmarkLens) &&
    row.professionalTaskLens.every(hasReplayableProfessionalTaskLens) &&
    row.iotFirmwareQuestionLens.every(hasReplayableIotFirmwareQuestionLens) &&
    row.retailSalesQuestionLens.every(hasReplayableRetailSalesQuestionLens) &&
    row.continualLearningBenchmarkLens.every(hasReplayableContinualLearningBenchmarkLens) &&
    row.hermesTurboPerformanceLens.every(hasReplayableHermesTurboPerformanceLens) &&
    row.scorableStudioDrilldownLens.every(hasReplayableScorableStudioDrilldownLens) &&
    (row.obsStudioDrilldownLens ?? []).every(hasReplayableObsStudioDrilldownLens)
  );
  const failClosed = rows.some((row) =>
    row.status !== "passed" ||
    row.missingGateReasons.length > 0 ||
    row.criteriaDiagnostics.some((criterion) => criterion.status !== "satisfied") ||
    row.ragFlowDiagnostics.some((diagnostic) => diagnostic.status !== "satisfied") ||
    row.landscapeLens.some((lens) => lens.status !== "satisfied" || !hasReplayableLandscapeLens(lens)) ||
    row.incidentTriageLens.some((lens) => lens.status !== "satisfied" || !hasReplayableIncidentTriageLens(lens)) ||
    row.benchmarkSubmissionLens.some((lens) => lens.status !== "satisfied" || !hasReplayableBenchmarkSubmissionLens(lens)) ||
    row.testSuiteEvaluationLens.some((lens) => lens.status !== "satisfied" || !hasReplayableTestSuiteEvaluationLens(lens)) ||
    row.evalAiLibraryQuestionLens.some(
      (lens) => lens.status !== "satisfied" || !hasReplayableEvalAiLibraryQuestionLens(lens)
    ) ||
    row.openModelRagQuestionLens.some(
      (lens) => lens.status !== "satisfied" || !hasReplayableOpenModelRagQuestionLens(lens)
    ) ||
    row.opikEvaluationQuestionLens.some(
      (lens) => lens.status !== "satisfied" || !hasReplayableOpikEvaluationQuestionLens(lens)
    ) ||
    row.statisticalAgentTrialLens.some(
      (lens) => lens.status !== "satisfied" || !hasReplayableAgentTrialStatisticalLens(lens)
    ) ||
    row.codeQuestQualityLens.some((lens) => lens.status !== "satisfied" || !hasReplayableCodeQuestQualityLens(lens)) ||
    row.multiUserBenchmarkLens.some((lens) => lens.status !== "satisfied" || !hasReplayableMultiUserBenchmarkLens(lens)) ||
    row.professionalTaskLens.some((lens) => lens.status !== "satisfied" || !hasReplayableProfessionalTaskLens(lens)) ||
    row.iotFirmwareQuestionLens.some((lens) => lens.status !== "satisfied" || !hasReplayableIotFirmwareQuestionLens(lens)) ||
    row.retailSalesQuestionLens.some((lens) => lens.status !== "satisfied" || !hasReplayableRetailSalesQuestionLens(lens)) ||
    row.continualLearningBenchmarkLens.some(
      (lens) => lens.status !== "satisfied" || !hasReplayableContinualLearningBenchmarkLens(lens)
    ) ||
    row.hermesTurboPerformanceLens.some(
      (lens) => lens.status !== "satisfied" || !hasReplayableHermesTurboPerformanceLens(lens)
    ) ||
    row.scorableStudioDrilldownLens.some(
      (lens) => lens.status !== "satisfied" || !hasReplayableScorableStudioDrilldownLens(lens)
    ) ||
    (row.obsStudioDrilldownLens ?? []).some(
      (lens) => lens.status !== "satisfied" || !hasReplayableObsStudioDrilldownLens(lens)
    ) ||
    row.rubricLens.some((lens) => (
      lens.checks.some((check) => check.status === "partial" || check.status === "fail")
    ))
  );
  const reportWithoutHash = {
    generatedAt: input.generatedAt,
    agentId: input.agentId,
    runId: input.runId,
    sourceRefs: input.sourceRefs ?? ["amc:diagnostic-ledger", "amc:public-methodology"],
    replayable,
    failClosed,
    rows
  };
  return {
    ...reportWithoutHash,
    manifestHash: sha256Hex(canonicalize(reportWithoutHash))
  };
}

function thresholdRef(
  id: string,
  actual: number | null,
  threshold: number | null,
  operator: "gte" | "lte" = "gte",
): EvalScoreExplainabilityThresholdRef {
  const passed = operator === "gte" ? meetsMinimum(actual, threshold) : meetsMaximum(actual, threshold);
  return { id, actual, threshold, operator, passed };
}

function compactThresholds(input: EvalScoreExplainabilityThresholdRef[]): EvalScoreExplainabilityThresholdRef[] {
  return input.filter((row) => row.actual !== null || row.threshold !== null);
}

function evalScorePackRefs(row: QuestionScoreExplainabilityRow): EvalScoreExplainabilityEvalPackRef[] {
  const testSuitePacks = row.testSuiteEvaluationLens.map<EvalScoreExplainabilityEvalPackRef>((lens) => ({
    packId: lens.suiteId,
    sourceRef: lens.sourceRef,
    kind: "test_suite_evaluation",
    manifestHashes: {
      datasetHash: lens.datasetHash,
      testCaseHash: lens.testCaseHash,
      evaluatorConfigHash: lens.evaluatorConfigHash,
      experimentResultHash: lens.experimentResultHash,
      exportArtifactHash: lens.exportArtifactHash,
      traceArtifactHash: lens.traceArtifactHash,
      toolCallValidationHash: lens.toolCallValidationHash,
    },
    ciRunId: lens.ciRunId,
    ciConfigHash: lens.ciConfigHash,
    rowHash: lens.rowHash,
  }));
  const evalLibraryPacks = row.evalAiLibraryQuestionLens.map<EvalScoreExplainabilityEvalPackRef>((lens) => ({
    packId: lens.frameworkId,
    sourceRef: lens.sourceRef,
    kind: "eval_ai_library_question",
    manifestHashes: {
      evalPackManifestHash: lens.evalPackManifestHash,
      datasetManifestHash: lens.datasetManifestHash,
      questionSetHash: lens.questionSetHash,
      questionTraceHash: lens.questionTraceHash,
      evaluatorConfigHash: lens.evaluatorConfigHash,
      metricResultHash: lens.metricResultHash,
      scoreBreakdownHash: lens.scoreBreakdownHash,
      rejectedEvidenceLedgerHash: lens.rejectedEvidenceLedgerHash,
      repairHintHash: lens.repairHintHash,
      regressionThresholdHash: lens.regressionThresholdHash,
    },
    ciRunId: lens.ciRunId,
    ciConfigHash: lens.ciConfigHash,
    rowHash: lens.rowHash,
  }));
  return [...testSuitePacks, ...evalLibraryPacks];
}

function evalScoreThresholds(row: QuestionScoreExplainabilityRow): EvalScoreExplainabilityThresholdRef[] {
  const testSuiteThresholds = row.testSuiteEvaluationLens.flatMap((lens) => compactThresholds([
    thresholdRef(`${lens.suiteId}:pass_rate`, lens.passRate0to1, lens.minPassRate0to1),
    thresholdRef(`${lens.suiteId}:average_score`, lens.averageScore0to1, lens.threshold0to1),
  ]));
  const evalLibraryThresholds = row.evalAiLibraryQuestionLens.flatMap((lens) => compactThresholds([
    thresholdRef(`${lens.frameworkId}:provider_count`, lens.providerCount, lens.minProviderCount),
    thresholdRef(`${lens.frameworkId}:metric_count`, lens.metricCount, lens.minMetricCount),
    thresholdRef(`${lens.frameworkId}:question_count`, lens.questionCount, lens.minQuestionCount),
    thresholdRef(`${lens.frameworkId}:evidence_coverage`, lens.evidenceCoverage0to1, lens.minEvidenceCoverage0to1),
    thresholdRef(`${lens.frameworkId}:rejected_reason_coverage`, lens.rejectedEvidenceReasonCoverage0to1, lens.minRejectedEvidenceReasonCoverage0to1),
    thresholdRef(`${lens.frameworkId}:repair_hint_coverage`, lens.repairHintCoverage0to1, lens.minRepairHintCoverage0to1),
    thresholdRef(`${lens.frameworkId}:regression_pass_rate`, lens.regressionPassRate0to1, lens.minRegressionPassRate0to1),
    thresholdRef(`${lens.frameworkId}:score_confidence`, lens.scoreConfidence0to1, lens.minScoreConfidence0to1),
  ]));
  return [...testSuiteThresholds, ...evalLibraryThresholds];
}

function evalPackComplete(pack: EvalScoreExplainabilityEvalPackRef): boolean {
  return pack.rowHash.length === 64 &&
    pack.ciRunId !== null &&
    pack.ciConfigHash !== null &&
    Object.values(pack.manifestHashes).every((value) => value !== null && value.length > 0);
}

export function buildEvalScoreExplainabilityPack(
  report: QuestionScoreExplainabilityReport,
): EvalScoreExplainabilityPack {
  const rows = report.rows.map<EvalScoreExplainabilityPackRow>((row) => {
    const reproducibleEvalPacks = evalScorePackRefs(row);
    const failClosedThresholds = evalScoreThresholds(row);
    const rejectedEvidenceReasons = row.rejectedEvidence.map((evidence) => ({
      evidenceId: evidence.evidenceId,
      reason: evidence.reason,
    }));
    const rowReady = row.status === "passed" &&
      row.acceptedEvidenceIds.length > 0 &&
      row.signedEvidenceRefs.length === row.acceptedEvidenceIds.length &&
      row.signedEvidenceRefs.every(hasSignedEvidence) &&
      row.rejectedEvidence.every((evidence) => hasSignedEvidence(evidence) && evidence.reason.trim().length > 0) &&
      row.repairHint.trim().length > 0 &&
      reproducibleEvalPacks.length > 0 &&
      reproducibleEvalPacks.every(evalPackComplete) &&
      failClosedThresholds.length > 0 &&
      failClosedThresholds.every((threshold) => threshold.passed);
    return {
      questionId: row.questionId,
      acceptedEvidenceIds: row.acceptedEvidenceIds,
      rejectedEvidenceReasons,
      repairHint: row.repairHint,
      signedEvidenceRows: row.signedEvidenceRefs,
      reproducibleEvalPacks,
      failClosedThresholds,
      status: rowReady ? "ready" : "fail_closed",
      rowHash: row.rowHash,
    };
  });
  const withoutHash = {
    v: 1 as const,
    generatedAt: report.generatedAt,
    agentId: report.agentId,
    runId: report.runId,
    sourceRefs: report.sourceRefs,
    replayable: report.replayable,
    failClosed: report.failClosed || !report.replayable || rows.some((row) => row.status === "fail_closed"),
    rows,
  };
  return {
    ...withoutHash,
    packHash: sha256Hex(canonicalize(withoutHash)),
  };
}
