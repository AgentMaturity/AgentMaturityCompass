import type {
  DiagnosticReport,
  QuestionScoreBenchmarkSubmissionLensRef,
  QuestionScoreContinualLearningBenchmarkLensRef,
  QuestionScoreCriterionDiagnosticRef,
  QuestionScoreExplainabilityRow,
  QuestionScoreHermesTurboPerformanceLensRef,
  QuestionScoreIncidentTriageLensRef,
  QuestionScoreIotFirmwareQuestionLensRef,
  QuestionScoreLandscapeLensRef,
  QuestionScoreMultiUserBenchmarkLensRef,
  QuestionScoreObsStudioDrilldownLensRef,
  QuestionScoreProfessionalTaskLensRef,
  QuestionScoreRagFlowDiagnosticRef,
  QuestionScoreRetailSalesQuestionLensRef,
  QuestionScoreRejectedEvidenceRef,
  QuestionScoreRubricLensRef,
  QuestionScoreScorableStudioDrilldownLensRef,
  QuestionScoreSignedEvidenceRef,
} from "../types.js";

export type ScoreEvidenceDrilldownState = "ready" | "empty";

export interface ScoreEvidenceDrilldownArtifactLink {
  label: string;
  kind: "score-report" | "watch-explain" | "shield-receipt" | "passport-hash" | "methodology" | "methodology-versioning";
  href: string | null;
  hash?: string;
}

export interface ScoreEvidencePreviewRow {
  evidenceId: string;
  eventHash: string;
  writerSig: string;
  eventType: string;
  sessionId: string;
  ts: number;
  trustTier: string;
  reason?: string;
}

export interface ScoreCriterionPreviewRow {
  criterionId: string;
  criterionType: string;
  status: string;
  evidenceRefs: string[];
  rejectedEvidenceRefs: string[];
  judgeRef: string | null;
  repairHint: string;
}

export interface ScoreRubricLensPreviewRow {
  rubricId: string;
  rubricVersion: string;
  rubricSource: string;
  skillType: string;
  score0to100: number;
  grade: string;
  deepReviewCertificateHash: string | null;
  marketSignalRefs: string[];
  checks: Array<{
    checkId: string;
    pillar: string;
    status: string;
    weight: number;
    evidenceRefs: string[];
    rejectedEvidenceRefs: string[];
    fixHint: string;
  }>;
}

export interface ScoreRagFlowPreviewRow {
  flowId: string;
  vectorSearchBackend: string;
  flowDagHash: string | null;
  paramConfigHash: string | null;
  evalSetHash: string | null;
  batchRunId: string | null;
  evaluatorFlowHash: string | null;
  groundTruthColumn: string | null;
  dataMappingHash: string | null;
  variantId: string | null;
  variantConfigHash: string | null;
  deploymentArtifactHash: string | null;
  metricIds: string[];
  status: string;
  evidenceRefs: string[];
  rejectedEvidenceRefs: string[];
  repairHint: string;
}

export interface ScoreLandscapeLensPreviewRow {
  landscapeId: string;
  sourceRef: string;
  category: string;
  datasetRefs: string[];
  datasetHashes: string[];
  updateCadence: string;
  lastVerifiedAt: string | null;
  freshnessDays: number | null;
  maxAllowedFreshnessDays: number | null;
  cohortRefs: string[];
  benchmarkRefs: string[];
  toolOrModelRefs: string[];
  status: string;
  evidenceRefs: string[];
  rejectedEvidenceRefs: string[];
  repairHint: string;
}

export interface ScoreIncidentTriageLensPreviewRow {
  environmentId: string;
  sourceRef: string;
  taskId: string;
  scenarioId: string;
  difficulty: string;
  severity: string;
  openEnvConfigHash: string | null;
  scenarioManifestHash: string | null;
  incidentReportHash: string | null;
  rawLogBundleHash: string | null;
  metricSnapshotHash: string | null;
  userReportHash: string | null;
  actionPayloadHash: string | null;
  graderConfigHash: string | null;
  feedbackHash: string | null;
  reward0to1: number | null;
  minReward0to1: number | null;
  rootCauseScore0to1: number | null;
  minRootCauseScore0to1: number | null;
  redHerringFilterScore0to1: number | null;
  minRedHerringFilterScore0to1: number | null;
  orderedRemediationScore0to1: number | null;
  minOrderedRemediationScore0to1: number | null;
  maxSteps: number | null;
  stepCount: number | null;
  deterministicGrader: boolean;
  status: string;
  evidenceRefs: string[];
  rejectedEvidenceRefs: string[];
  repairHint: string;
  rowHash: string;
}

export interface ScoreBenchmarkSubmissionLensPreviewRow {
  benchmarkId: string;
  sourceRef: string;
  submissionId: string;
  submissionVersion: string | null;
  agentVersion: string | null;
  submittedAt: string | null;
  taskId: string;
  taskCategory: string;
  taskStatus: string;
  gradingType: string;
  overallScore0to100: number | null;
  categoryScore0to100: number | null;
  speedMs: number | null;
  costUsd: number | null;
  leaderboardMetricViews: string[];
  submissionMetadataHash: string | null;
  taskBreakdownHash: string | null;
  leaderboardSnapshotHash: string | null;
  criterionScores: Array<{
    criterionId: string;
    criterionType: string;
    score0to1: number | null;
    weight: number;
    status: string;
    gradingType: string;
    evidenceRefs: string[];
    rejectedEvidenceRefs: string[];
    repairHint: string;
  }>;
  status: string;
  evidenceRefs: string[];
  rejectedEvidenceRefs: string[];
  repairHint: string;
  rowHash: string;
}

export interface ScoreMultiUserBenchmarkLensPreviewRow {
  benchmarkId: string;
  sourceRef: string;
  scenarioId: string;
  scenarioFamily: string;
  capability: string;
  datasetManifestHash: string | null;
  userRoleManifestHash: string | null;
  permissionPolicyHash: string | null;
  preferenceProfileHash: string | null;
  resourceQueuePolicyHash: string | null;
  instructionSetHash: string | null;
  interactionTraceHash: string | null;
  evaluatorConfigHash: string | null;
  resultArtifactHash: string | null;
  metricReportHash: string | null;
  userRoleCount: number | null;
  turnCount: number | null;
  privacyPassRate0to1: number | null;
  minPrivacyPassRate0to1: number | null;
  coordinationSuccessRate0to1: number | null;
  minCoordinationSuccessRate0to1: number | null;
  queueFairnessScore0to1: number | null;
  minQueueFairnessScore0to1: number | null;
  instructionFollowingScore0to1: number | null;
  minInstructionFollowingScore0to1: number | null;
  status: string;
  evidenceRefs: string[];
  rejectedEvidenceRefs: string[];
  repairHint: string;
  rowHash: string;
}

export interface ScoreContinualLearningBenchmarkLensPreviewRow {
  benchmarkId: string;
  sourceRef: string;
  domainId: string;
  workflowId: string;
  datasetManifestHash: string | null;
  stateSchemaHash: string | null;
  initialStateHash: string | null;
  stateMutationTraceHash: string | null;
  conversationTraceHash: string | null;
  entityRelationshipGraphHash: string | null;
  toolExecutionTraceHash: string | null;
  evaluatorConfigHash: string | null;
  resultArtifactHash: string | null;
  replayCommandHash: string | null;
  memoryPolicyHash: string | null;
  adaptiveLearningTraceHash: string | null;
  scenarioCount: number | null;
  turnCount: number | null;
  stateMutationCount: number | null;
  entityCount: number | null;
  taskCompletionRate0to1: number | null;
  minTaskCompletionRate0to1: number | null;
  responseQualityScore0to1: number | null;
  minResponseQualityScore0to1: number | null;
  stateAccuracy0to1: number | null;
  minStateAccuracy0to1: number | null;
  retentionScore0to1: number | null;
  minRetentionScore0to1: number | null;
  tokenCostUsd: number | null;
  maxTokenCostUsd: number | null;
  status: string;
  evidenceRefs: string[];
  rejectedEvidenceRefs: string[];
  repairHint: string;
  rowHash: string;
}

export interface ScoreHermesTurboPerformanceLensPreviewRow {
  benchmarkId: string;
  sourceRef: string;
  repositoryRef: string;
  licenseRef: string | null;
  licenseSpdxId: string | null;
  defaultBranch: string;
  sourceCommitSha: string | null;
  sourceTreeSha: string | null;
  sourceStatusHash: string | null;
  readmeArtifactHash: string | null;
  packageManifestHash: string | null;
  benchmarkWorkflowHash: string | null;
  perfBudgetWorkflowHash: string | null;
  dailyScoreWorkflowHash: string | null;
  turboScoreScriptHash: string | null;
  performanceDashboardHash: string | null;
  benchmarkReportHash: string | null;
  baselineResultHash: string | null;
  candidateResultHash: string | null;
  latencyTraceHash: string | null;
  throughputTraceHash: string | null;
  scoreManifestHash: string | null;
  regressionThresholdHash: string | null;
  ciRunId: string | null;
  ciConfigHash: string | null;
  performanceFacet: string;
  runCount: number | null;
  minRunCount: number | null;
  latencyP50Ms: number | null;
  maxLatencyP50Ms: number | null;
  latencyP95Ms: number | null;
  maxLatencyP95Ms: number | null;
  throughputOpsPerSec: number | null;
  minThroughputOpsPerSec: number | null;
  speedupFactor: number | null;
  minSpeedupFactor: number | null;
  scoreDelta0to1: number | null;
  minScoreDelta0to1: number | null;
  dashboardCoverage0to1: number | null;
  minDashboardCoverage0to1: number | null;
  regressionPassRate0to1: number | null;
  minRegressionPassRate0to1: number | null;
  status: string;
  evidenceRefs: string[];
  rejectedEvidenceRefs: string[];
  repairHint: string;
  rowHash: string;
}

export interface ScoreProfessionalTaskLensPreviewRow {
  benchmarkId: string;
  sourceRef: string;
  taskId: string;
  scenarioId: string;
  industryCategory: string;
  professionalDomain: string;
  difficultyLevel: number | null;
  datasetManifestHash: string | null;
  scenarioManifestHash: string | null;
  worldModelConfigHash: string | null;
  toolSchemaHash: string | null;
  agentConfigHash: string | null;
  faultInjectionConfigHash: string | null;
  verifierRubricHash: string | null;
  verifierVoteManifestHash: string | null;
  trajectoryHash: string | null;
  resultArtifactHash: string | null;
  replayConfigHash: string | null;
  debugTraceHash: string | null;
  environmentMode: string;
  faultMode: string;
  verifierVoteCount: number | null;
  minVerifierVoteCount: number | null;
  passRate0to1: number | null;
  minPassRate0to1: number | null;
  robustnessScore0to1: number | null;
  minRobustnessScore0to1: number | null;
  trajectoryStepCount: number | null;
  maxTrajectoryStepCount: number | null;
  status: string;
  evidenceRefs: string[];
  rejectedEvidenceRefs: string[];
  repairHint: string;
  rowHash: string;
}

export interface ScoreIotFirmwareQuestionLensPreviewRow {
  benchmarkId: string;
  sourceRef: string;
  taskId: string;
  platform: string;
  boardId: string;
  chipFamily: string;
  firmwareProjectHash: string | null;
  toolchainManifestHash: string | null;
  sdkVersionManifestHash: string | null;
  hardwareSessionHash: string | null;
  deviceLogBundleHash: string | null;
  buildArtifactHash: string | null;
  flashArtifactHash: string | null;
  testArtifactHash: string | null;
  knowledgePackManifestHash: string | null;
  taskManifestHash: string | null;
  evaluatorConfigHash: string | null;
  resultArtifactHash: string | null;
  privacyBoundaryHash: string | null;
  benchmarkReportHash: string | null;
  hardwareRunCount: number | null;
  deviceCount: number | null;
  bugClosureRate0to1: number | null;
  minBugClosureRate0to1: number | null;
  tokenEfficiencyRatio: number | null;
  minTokenEfficiencyRatio: number | null;
  logCaptureCoverage0to1: number | null;
  minLogCaptureCoverage0to1: number | null;
  status: string;
  evidenceRefs: string[];
  rejectedEvidenceRefs: string[];
  repairHint: string;
  rowHash: string;
}

export interface ScoreRetailSalesQuestionLensPreviewRow {
  benchmarkId: string;
  sourceRef: string;
  taskId: string;
  salesChannel: string;
  productCatalogHash: string | null;
  productDescriptionHash: string | null;
  customerScenarioHash: string | null;
  conversationTraceHash: string | null;
  customerIntentManifestHash: string | null;
  orderCaptureSchemaHash: string | null;
  orderLedgerHash: string | null;
  pricingPolicyHash: string | null;
  discountPolicyHash: string | null;
  modelAdapterManifestHash: string | null;
  modelProviderMatrixHash: string | null;
  promptPolicyHash: string | null;
  recommendationPolicyHash: string | null;
  safetyPolicyHash: string | null;
  privacyBoundaryHash: string | null;
  evaluatorConfigHash: string | null;
  resultArtifactHash: string | null;
  benchmarkReportHash: string | null;
  modelProviderCount: number | null;
  customerScenarioCount: number | null;
  orderCount: number | null;
  orderCaptureAccuracy0to1: number | null;
  minOrderCaptureAccuracy0to1: number | null;
  policyComplianceRate0to1: number | null;
  minPolicyComplianceRate0to1: number | null;
  recommendationGrounding0to1: number | null;
  minRecommendationGrounding0to1: number | null;
  piiRedactionRate0to1: number | null;
  minPiiRedactionRate0to1: number | null;
  status: string;
  evidenceRefs: string[];
  rejectedEvidenceRefs: string[];
  repairHint: string;
  rowHash: string;
}

export interface ScoreScorableStudioDrilldownPreviewRow {
  drilldownId: string;
  sourceRef: string;
  repositoryRef: string;
  licenseRef: string | null;
  licenseSpdxId: string | null;
  defaultBranch: string;
  sourceCommitSha: string | null;
  sourceTreeSha: string | null;
  readmeArtifactHash: string | null;
  pythonPackageManifestHash: string | null;
  pythonOpenApiHash: string | null;
  pythonClientHash: string | null;
  pythonExecutionLogsHash: string | null;
  pythonEvaluatorApiHash: string | null;
  pythonExecutionLogApiHash: string | null;
  cliPackageManifestHash: string | null;
  cliLockfileHash: string | null;
  cliEvaluatorCommandHash: string | null;
  cliJudgeCommandHash: string | null;
  cliExecutionLogCommandHash: string | null;
  cliOtelTraceCommandHash: string | null;
  cliFileUploadCommandHash: string | null;
  typescriptPackageManifestHash: string | null;
  typescriptLockfileHash: string | null;
  typescriptSourceTreeHash: string | null;
  npmPackageRef: string | null;
  npmPackageIntegrity: string | null;
  npmCliPackageRef: string | null;
  npmCliPackageIntegrity: string | null;
  studioSurface: string;
  uiRoutePath: string;
  sourceArtifactLinks: string[];
  tracePreviewHash: string | null;
  receiptPreviewHash: string | null;
  policyRulePreviewHash: string | null;
  sourceArtifactPreviewHash: string | null;
  emptyStateHash: string | null;
  errorStateHash: string | null;
  evidencePreviewState: string;
  evidencePreviewCount: number | null;
  minEvidencePreviewCount: number | null;
  sourceArtifactLinkCount: number | null;
  minSourceArtifactLinkCount: number | null;
  status: string;
  evidenceRefs: string[];
  rejectedEvidenceRefs: string[];
  repairHint: string;
  rowHash: string;
}

export interface ScoreObsStudioDrilldownPreviewRow {
  drilldownId: string;
  sourceRef: string;
  sourceKind: string;
  openAlexWorkId: string | null;
  doi: string | null;
  publisherRef: string | null;
  titleRef: string | null;
  venueRef: string | null;
  publicationDate: string | null;
  uiRoutePath: string;
  sourceArtifactLinks: string[];
  tracePreviewHash: string | null;
  reasoningTracePreviewHash: string | null;
  receiptPreviewHash: string | null;
  evidencePreviewHash: string | null;
  sourceArtifactPreviewHash: string | null;
  emptyStateHash: string | null;
  errorStateHash: string | null;
  evidencePreviewState: string;
  evidencePreviewCount: number | null;
  minEvidencePreviewCount: number | null;
  sourceArtifactLinkCount: number | null;
  minSourceArtifactLinkCount: number | null;
  status: string;
  evidenceRefs: string[];
  rejectedEvidenceRefs: string[];
  repairHint: string;
  rowHash: string;
}

export interface ScoreEvidenceDrilldown {
  state: ScoreEvidenceDrilldownState;
  message: string;
  agentId: string;
  runId: string;
  questionId: string;
  title: string | null;
  status: QuestionScoreExplainabilityRow["status"] | null;
  surfaces: string[];
  levels: {
    claimed: number | null;
    supported: number | null;
    final: number | null;
  };
  evidenceWindow: QuestionScoreExplainabilityRow["evidenceWindow"] | null;
  repairHint: string | null;
  missingGateReasons: string[];
  sourceArtifacts: ScoreEvidenceDrilldownArtifactLink[];
  evidencePreview: {
    accepted: ScoreEvidencePreviewRow[];
    rejected: ScoreEvidencePreviewRow[];
  };
  criteriaPreview: ScoreCriterionPreviewRow[];
  rubricLensPreview: ScoreRubricLensPreviewRow[];
  ragFlowPreview: ScoreRagFlowPreviewRow[];
  landscapeLensPreview: ScoreLandscapeLensPreviewRow[];
  incidentTriagePreview: ScoreIncidentTriageLensPreviewRow[];
  benchmarkSubmissionPreview: ScoreBenchmarkSubmissionLensPreviewRow[];
  multiUserBenchmarkPreview: ScoreMultiUserBenchmarkLensPreviewRow[];
  continualLearningBenchmarkPreview: ScoreContinualLearningBenchmarkLensPreviewRow[];
  hermesTurboPerformancePreview: ScoreHermesTurboPerformanceLensPreviewRow[];
  professionalTaskPreview: ScoreProfessionalTaskLensPreviewRow[];
  iotFirmwareQuestionPreview: ScoreIotFirmwareQuestionLensPreviewRow[];
  retailSalesQuestionPreview: ScoreRetailSalesQuestionLensPreviewRow[];
  scorableStudioDrilldownPreview: ScoreScorableStudioDrilldownPreviewRow[];
  obsStudioDrilldownPreview: ScoreObsStudioDrilldownPreviewRow[];
  rowHash: string | null;
  manifestHash: string | null;
  failClosed: boolean;
  replayable: boolean;
}

function signedPreview(ref: QuestionScoreSignedEvidenceRef): ScoreEvidencePreviewRow {
  return {
    evidenceId: ref.evidenceId,
    eventHash: ref.eventHash,
    writerSig: ref.writerSig,
    eventType: ref.eventType,
    sessionId: ref.sessionId,
    ts: ref.ts,
    trustTier: ref.trustTier,
  };
}

function rejectedPreview(ref: QuestionScoreRejectedEvidenceRef): ScoreEvidencePreviewRow {
  return {
    ...signedPreview(ref),
    reason: ref.reason,
  };
}

function criterionPreview(ref: QuestionScoreCriterionDiagnosticRef): ScoreCriterionPreviewRow {
  return {
    criterionId: ref.criterionId,
    criterionType: ref.criterionType,
    status: ref.status,
    evidenceRefs: ref.evidenceRefs,
    rejectedEvidenceRefs: ref.rejectedEvidenceRefs,
    judgeRef: ref.judgeRef,
    repairHint: ref.repairHint,
  };
}

function rubricLensPreview(ref: QuestionScoreRubricLensRef): ScoreRubricLensPreviewRow {
  return {
    rubricId: ref.rubricId,
    rubricVersion: ref.rubricVersion,
    rubricSource: ref.rubricSource,
    skillType: ref.skillType,
    score0to100: ref.score0to100,
    grade: ref.grade,
    deepReviewCertificateHash: ref.deepReviewCertificateHash,
    marketSignalRefs: ref.marketSignalRefs,
    checks: ref.checks.map((check) => ({
      checkId: check.checkId,
      pillar: check.pillar,
      status: check.status,
      weight: check.weight,
      evidenceRefs: check.evidenceRefs,
      rejectedEvidenceRefs: check.rejectedEvidenceRefs,
      fixHint: check.fixHint,
    })),
  };
}

function ragFlowPreview(ref: QuestionScoreRagFlowDiagnosticRef): ScoreRagFlowPreviewRow {
  return {
    flowId: ref.flowId,
    vectorSearchBackend: ref.vectorSearchBackend,
    flowDagHash: ref.flowDagHash,
    paramConfigHash: ref.paramConfigHash,
    evalSetHash: ref.evalSetHash,
    batchRunId: ref.batchRunId,
    evaluatorFlowHash: ref.evaluatorFlowHash,
    groundTruthColumn: ref.groundTruthColumn,
    dataMappingHash: ref.dataMappingHash,
    variantId: ref.variantId,
    variantConfigHash: ref.variantConfigHash,
    deploymentArtifactHash: ref.deploymentArtifactHash,
    metricIds: ref.metricIds,
    status: ref.status,
    evidenceRefs: ref.evidenceRefs,
    rejectedEvidenceRefs: ref.rejectedEvidenceRefs,
    repairHint: ref.repairHint,
  };
}

function landscapeLensPreview(ref: QuestionScoreLandscapeLensRef): ScoreLandscapeLensPreviewRow {
  return {
    landscapeId: ref.landscapeId,
    sourceRef: ref.sourceRef,
    category: ref.category,
    datasetRefs: ref.datasetRefs,
    datasetHashes: ref.datasetHashes,
    updateCadence: ref.updateCadence,
    lastVerifiedAt: ref.lastVerifiedAt,
    freshnessDays: ref.freshnessDays,
    maxAllowedFreshnessDays: ref.maxAllowedFreshnessDays,
    cohortRefs: ref.cohortRefs,
    benchmarkRefs: ref.benchmarkRefs,
    toolOrModelRefs: ref.toolOrModelRefs,
    status: ref.status,
    evidenceRefs: ref.evidenceRefs,
    rejectedEvidenceRefs: ref.rejectedEvidenceRefs,
    repairHint: ref.repairHint,
  };
}

function incidentTriageLensPreview(ref: QuestionScoreIncidentTriageLensRef): ScoreIncidentTriageLensPreviewRow {
  return {
    environmentId: ref.environmentId,
    sourceRef: ref.sourceRef,
    taskId: ref.taskId,
    scenarioId: ref.scenarioId,
    difficulty: ref.difficulty,
    severity: ref.severity,
    openEnvConfigHash: ref.openEnvConfigHash,
    scenarioManifestHash: ref.scenarioManifestHash,
    incidentReportHash: ref.incidentReportHash,
    rawLogBundleHash: ref.rawLogBundleHash,
    metricSnapshotHash: ref.metricSnapshotHash,
    userReportHash: ref.userReportHash,
    actionPayloadHash: ref.actionPayloadHash,
    graderConfigHash: ref.graderConfigHash,
    feedbackHash: ref.feedbackHash,
    reward0to1: ref.reward0to1,
    minReward0to1: ref.minReward0to1,
    rootCauseScore0to1: ref.rootCauseScore0to1,
    minRootCauseScore0to1: ref.minRootCauseScore0to1,
    redHerringFilterScore0to1: ref.redHerringFilterScore0to1,
    minRedHerringFilterScore0to1: ref.minRedHerringFilterScore0to1,
    orderedRemediationScore0to1: ref.orderedRemediationScore0to1,
    minOrderedRemediationScore0to1: ref.minOrderedRemediationScore0to1,
    maxSteps: ref.maxSteps,
    stepCount: ref.stepCount,
    deterministicGrader: ref.deterministicGrader,
    status: ref.status,
    evidenceRefs: ref.evidenceRefs,
    rejectedEvidenceRefs: ref.rejectedEvidenceRefs,
    repairHint: ref.repairHint,
    rowHash: ref.rowHash,
  };
}

function benchmarkSubmissionLensPreview(
  ref: QuestionScoreBenchmarkSubmissionLensRef,
): ScoreBenchmarkSubmissionLensPreviewRow {
  return {
    benchmarkId: ref.benchmarkId,
    sourceRef: ref.sourceRef,
    submissionId: ref.submissionId,
    submissionVersion: ref.submissionVersion,
    agentVersion: ref.agentVersion,
    submittedAt: ref.submittedAt,
    taskId: ref.taskId,
    taskCategory: ref.taskCategory,
    taskStatus: ref.taskStatus,
    gradingType: ref.gradingType,
    overallScore0to100: ref.overallScore0to100,
    categoryScore0to100: ref.categoryScore0to100,
    speedMs: ref.speedMs,
    costUsd: ref.costUsd,
    leaderboardMetricViews: ref.leaderboardMetricViews,
    submissionMetadataHash: ref.submissionMetadataHash,
    taskBreakdownHash: ref.taskBreakdownHash,
    leaderboardSnapshotHash: ref.leaderboardSnapshotHash,
    criterionScores: ref.criterionScores.map((criterion) => ({
      criterionId: criterion.criterionId,
      criterionType: criterion.criterionType,
      score0to1: criterion.score0to1,
      weight: criterion.weight,
      status: criterion.status,
      gradingType: criterion.gradingType,
      evidenceRefs: criterion.evidenceRefs,
      rejectedEvidenceRefs: criterion.rejectedEvidenceRefs,
      repairHint: criterion.repairHint,
    })),
    status: ref.status,
    evidenceRefs: ref.evidenceRefs,
    rejectedEvidenceRefs: ref.rejectedEvidenceRefs,
    repairHint: ref.repairHint,
    rowHash: ref.rowHash,
  };
}

function multiUserBenchmarkLensPreview(
  ref: QuestionScoreMultiUserBenchmarkLensRef,
): ScoreMultiUserBenchmarkLensPreviewRow {
  return {
    benchmarkId: ref.benchmarkId,
    sourceRef: ref.sourceRef,
    scenarioId: ref.scenarioId,
    scenarioFamily: ref.scenarioFamily,
    capability: ref.capability,
    datasetManifestHash: ref.datasetManifestHash,
    userRoleManifestHash: ref.userRoleManifestHash,
    permissionPolicyHash: ref.permissionPolicyHash,
    preferenceProfileHash: ref.preferenceProfileHash,
    resourceQueuePolicyHash: ref.resourceQueuePolicyHash,
    instructionSetHash: ref.instructionSetHash,
    interactionTraceHash: ref.interactionTraceHash,
    evaluatorConfigHash: ref.evaluatorConfigHash,
    resultArtifactHash: ref.resultArtifactHash,
    metricReportHash: ref.metricReportHash,
    userRoleCount: ref.userRoleCount,
    turnCount: ref.turnCount,
    privacyPassRate0to1: ref.privacyPassRate0to1,
    minPrivacyPassRate0to1: ref.minPrivacyPassRate0to1,
    coordinationSuccessRate0to1: ref.coordinationSuccessRate0to1,
    minCoordinationSuccessRate0to1: ref.minCoordinationSuccessRate0to1,
    queueFairnessScore0to1: ref.queueFairnessScore0to1,
    minQueueFairnessScore0to1: ref.minQueueFairnessScore0to1,
    instructionFollowingScore0to1: ref.instructionFollowingScore0to1,
    minInstructionFollowingScore0to1: ref.minInstructionFollowingScore0to1,
    status: ref.status,
    evidenceRefs: ref.evidenceRefs,
    rejectedEvidenceRefs: ref.rejectedEvidenceRefs,
    repairHint: ref.repairHint,
    rowHash: ref.rowHash,
  };
}

function continualLearningBenchmarkLensPreview(
  ref: QuestionScoreContinualLearningBenchmarkLensRef,
): ScoreContinualLearningBenchmarkLensPreviewRow {
  return {
    benchmarkId: ref.benchmarkId,
    sourceRef: ref.sourceRef,
    domainId: ref.domainId,
    workflowId: ref.workflowId,
    datasetManifestHash: ref.datasetManifestHash,
    stateSchemaHash: ref.stateSchemaHash,
    initialStateHash: ref.initialStateHash,
    stateMutationTraceHash: ref.stateMutationTraceHash,
    conversationTraceHash: ref.conversationTraceHash,
    entityRelationshipGraphHash: ref.entityRelationshipGraphHash,
    toolExecutionTraceHash: ref.toolExecutionTraceHash,
    evaluatorConfigHash: ref.evaluatorConfigHash,
    resultArtifactHash: ref.resultArtifactHash,
    replayCommandHash: ref.replayCommandHash,
    memoryPolicyHash: ref.memoryPolicyHash,
    adaptiveLearningTraceHash: ref.adaptiveLearningTraceHash,
    scenarioCount: ref.scenarioCount,
    turnCount: ref.turnCount,
    stateMutationCount: ref.stateMutationCount,
    entityCount: ref.entityCount,
    taskCompletionRate0to1: ref.taskCompletionRate0to1,
    minTaskCompletionRate0to1: ref.minTaskCompletionRate0to1,
    responseQualityScore0to1: ref.responseQualityScore0to1,
    minResponseQualityScore0to1: ref.minResponseQualityScore0to1,
    stateAccuracy0to1: ref.stateAccuracy0to1,
    minStateAccuracy0to1: ref.minStateAccuracy0to1,
    retentionScore0to1: ref.retentionScore0to1,
    minRetentionScore0to1: ref.minRetentionScore0to1,
    tokenCostUsd: ref.tokenCostUsd,
    maxTokenCostUsd: ref.maxTokenCostUsd,
    status: ref.status,
    evidenceRefs: ref.evidenceRefs,
    rejectedEvidenceRefs: ref.rejectedEvidenceRefs,
    repairHint: ref.repairHint,
    rowHash: ref.rowHash,
  };
}

function hermesTurboPerformanceLensPreview(
  ref: QuestionScoreHermesTurboPerformanceLensRef,
): ScoreHermesTurboPerformanceLensPreviewRow {
  return {
    benchmarkId: ref.benchmarkId,
    sourceRef: ref.sourceRef,
    repositoryRef: ref.repositoryRef,
    licenseRef: ref.licenseRef,
    licenseSpdxId: ref.licenseSpdxId,
    defaultBranch: ref.defaultBranch,
    sourceCommitSha: ref.sourceCommitSha,
    sourceTreeSha: ref.sourceTreeSha,
    sourceStatusHash: ref.sourceStatusHash,
    readmeArtifactHash: ref.readmeArtifactHash,
    packageManifestHash: ref.packageManifestHash,
    benchmarkWorkflowHash: ref.benchmarkWorkflowHash,
    perfBudgetWorkflowHash: ref.perfBudgetWorkflowHash,
    dailyScoreWorkflowHash: ref.dailyScoreWorkflowHash,
    turboScoreScriptHash: ref.turboScoreScriptHash,
    performanceDashboardHash: ref.performanceDashboardHash,
    benchmarkReportHash: ref.benchmarkReportHash,
    baselineResultHash: ref.baselineResultHash,
    candidateResultHash: ref.candidateResultHash,
    latencyTraceHash: ref.latencyTraceHash,
    throughputTraceHash: ref.throughputTraceHash,
    scoreManifestHash: ref.scoreManifestHash,
    regressionThresholdHash: ref.regressionThresholdHash,
    ciRunId: ref.ciRunId,
    ciConfigHash: ref.ciConfigHash,
    performanceFacet: ref.performanceFacet,
    runCount: ref.runCount,
    minRunCount: ref.minRunCount,
    latencyP50Ms: ref.latencyP50Ms,
    maxLatencyP50Ms: ref.maxLatencyP50Ms,
    latencyP95Ms: ref.latencyP95Ms,
    maxLatencyP95Ms: ref.maxLatencyP95Ms,
    throughputOpsPerSec: ref.throughputOpsPerSec,
    minThroughputOpsPerSec: ref.minThroughputOpsPerSec,
    speedupFactor: ref.speedupFactor,
    minSpeedupFactor: ref.minSpeedupFactor,
    scoreDelta0to1: ref.scoreDelta0to1,
    minScoreDelta0to1: ref.minScoreDelta0to1,
    dashboardCoverage0to1: ref.dashboardCoverage0to1,
    minDashboardCoverage0to1: ref.minDashboardCoverage0to1,
    regressionPassRate0to1: ref.regressionPassRate0to1,
    minRegressionPassRate0to1: ref.minRegressionPassRate0to1,
    status: ref.status,
    evidenceRefs: ref.evidenceRefs,
    rejectedEvidenceRefs: ref.rejectedEvidenceRefs,
    repairHint: ref.repairHint,
    rowHash: ref.rowHash,
  };
}

function professionalTaskLensPreview(
  ref: QuestionScoreProfessionalTaskLensRef,
): ScoreProfessionalTaskLensPreviewRow {
  return {
    benchmarkId: ref.benchmarkId,
    sourceRef: ref.sourceRef,
    taskId: ref.taskId,
    scenarioId: ref.scenarioId,
    industryCategory: ref.industryCategory,
    professionalDomain: ref.professionalDomain,
    difficultyLevel: ref.difficultyLevel,
    datasetManifestHash: ref.datasetManifestHash,
    scenarioManifestHash: ref.scenarioManifestHash,
    worldModelConfigHash: ref.worldModelConfigHash,
    toolSchemaHash: ref.toolSchemaHash,
    agentConfigHash: ref.agentConfigHash,
    faultInjectionConfigHash: ref.faultInjectionConfigHash,
    verifierRubricHash: ref.verifierRubricHash,
    verifierVoteManifestHash: ref.verifierVoteManifestHash,
    trajectoryHash: ref.trajectoryHash,
    resultArtifactHash: ref.resultArtifactHash,
    replayConfigHash: ref.replayConfigHash,
    debugTraceHash: ref.debugTraceHash,
    environmentMode: ref.environmentMode,
    faultMode: ref.faultMode,
    verifierVoteCount: ref.verifierVoteCount,
    minVerifierVoteCount: ref.minVerifierVoteCount,
    passRate0to1: ref.passRate0to1,
    minPassRate0to1: ref.minPassRate0to1,
    robustnessScore0to1: ref.robustnessScore0to1,
    minRobustnessScore0to1: ref.minRobustnessScore0to1,
    trajectoryStepCount: ref.trajectoryStepCount,
    maxTrajectoryStepCount: ref.maxTrajectoryStepCount,
    status: ref.status,
    evidenceRefs: ref.evidenceRefs,
    rejectedEvidenceRefs: ref.rejectedEvidenceRefs,
    repairHint: ref.repairHint,
    rowHash: ref.rowHash,
  };
}

function iotFirmwareQuestionLensPreview(
  ref: QuestionScoreIotFirmwareQuestionLensRef,
): ScoreIotFirmwareQuestionLensPreviewRow {
  return {
    benchmarkId: ref.benchmarkId,
    sourceRef: ref.sourceRef,
    taskId: ref.taskId,
    platform: ref.platform,
    boardId: ref.boardId,
    chipFamily: ref.chipFamily,
    firmwareProjectHash: ref.firmwareProjectHash,
    toolchainManifestHash: ref.toolchainManifestHash,
    sdkVersionManifestHash: ref.sdkVersionManifestHash,
    hardwareSessionHash: ref.hardwareSessionHash,
    deviceLogBundleHash: ref.deviceLogBundleHash,
    buildArtifactHash: ref.buildArtifactHash,
    flashArtifactHash: ref.flashArtifactHash,
    testArtifactHash: ref.testArtifactHash,
    knowledgePackManifestHash: ref.knowledgePackManifestHash,
    taskManifestHash: ref.taskManifestHash,
    evaluatorConfigHash: ref.evaluatorConfigHash,
    resultArtifactHash: ref.resultArtifactHash,
    privacyBoundaryHash: ref.privacyBoundaryHash,
    benchmarkReportHash: ref.benchmarkReportHash,
    hardwareRunCount: ref.hardwareRunCount,
    deviceCount: ref.deviceCount,
    bugClosureRate0to1: ref.bugClosureRate0to1,
    minBugClosureRate0to1: ref.minBugClosureRate0to1,
    tokenEfficiencyRatio: ref.tokenEfficiencyRatio,
    minTokenEfficiencyRatio: ref.minTokenEfficiencyRatio,
    logCaptureCoverage0to1: ref.logCaptureCoverage0to1,
    minLogCaptureCoverage0to1: ref.minLogCaptureCoverage0to1,
    status: ref.status,
    evidenceRefs: ref.evidenceRefs,
    rejectedEvidenceRefs: ref.rejectedEvidenceRefs,
    repairHint: ref.repairHint,
    rowHash: ref.rowHash,
  };
}

function retailSalesQuestionLensPreview(
  ref: QuestionScoreRetailSalesQuestionLensRef,
): ScoreRetailSalesQuestionLensPreviewRow {
  return {
    benchmarkId: ref.benchmarkId,
    sourceRef: ref.sourceRef,
    taskId: ref.taskId,
    salesChannel: ref.salesChannel,
    productCatalogHash: ref.productCatalogHash,
    productDescriptionHash: ref.productDescriptionHash,
    customerScenarioHash: ref.customerScenarioHash,
    conversationTraceHash: ref.conversationTraceHash,
    customerIntentManifestHash: ref.customerIntentManifestHash,
    orderCaptureSchemaHash: ref.orderCaptureSchemaHash,
    orderLedgerHash: ref.orderLedgerHash,
    pricingPolicyHash: ref.pricingPolicyHash,
    discountPolicyHash: ref.discountPolicyHash,
    modelAdapterManifestHash: ref.modelAdapterManifestHash,
    modelProviderMatrixHash: ref.modelProviderMatrixHash,
    promptPolicyHash: ref.promptPolicyHash,
    recommendationPolicyHash: ref.recommendationPolicyHash,
    safetyPolicyHash: ref.safetyPolicyHash,
    privacyBoundaryHash: ref.privacyBoundaryHash,
    evaluatorConfigHash: ref.evaluatorConfigHash,
    resultArtifactHash: ref.resultArtifactHash,
    benchmarkReportHash: ref.benchmarkReportHash,
    modelProviderCount: ref.modelProviderCount,
    customerScenarioCount: ref.customerScenarioCount,
    orderCount: ref.orderCount,
    orderCaptureAccuracy0to1: ref.orderCaptureAccuracy0to1,
    minOrderCaptureAccuracy0to1: ref.minOrderCaptureAccuracy0to1,
    policyComplianceRate0to1: ref.policyComplianceRate0to1,
    minPolicyComplianceRate0to1: ref.minPolicyComplianceRate0to1,
    recommendationGrounding0to1: ref.recommendationGrounding0to1,
    minRecommendationGrounding0to1: ref.minRecommendationGrounding0to1,
    piiRedactionRate0to1: ref.piiRedactionRate0to1,
    minPiiRedactionRate0to1: ref.minPiiRedactionRate0to1,
    status: ref.status,
    evidenceRefs: ref.evidenceRefs,
    rejectedEvidenceRefs: ref.rejectedEvidenceRefs,
    repairHint: ref.repairHint,
    rowHash: ref.rowHash,
  };
}

function scorableStudioDrilldownLensPreview(
  ref: QuestionScoreScorableStudioDrilldownLensRef,
): ScoreScorableStudioDrilldownPreviewRow {
  return {
    drilldownId: ref.drilldownId,
    sourceRef: ref.sourceRef,
    repositoryRef: ref.repositoryRef,
    licenseRef: ref.licenseRef,
    licenseSpdxId: ref.licenseSpdxId,
    defaultBranch: ref.defaultBranch,
    sourceCommitSha: ref.sourceCommitSha,
    sourceTreeSha: ref.sourceTreeSha,
    readmeArtifactHash: ref.readmeArtifactHash,
    pythonPackageManifestHash: ref.pythonPackageManifestHash,
    pythonOpenApiHash: ref.pythonOpenApiHash,
    pythonClientHash: ref.pythonClientHash,
    pythonExecutionLogsHash: ref.pythonExecutionLogsHash,
    pythonEvaluatorApiHash: ref.pythonEvaluatorApiHash,
    pythonExecutionLogApiHash: ref.pythonExecutionLogApiHash,
    cliPackageManifestHash: ref.cliPackageManifestHash,
    cliLockfileHash: ref.cliLockfileHash,
    cliEvaluatorCommandHash: ref.cliEvaluatorCommandHash,
    cliJudgeCommandHash: ref.cliJudgeCommandHash,
    cliExecutionLogCommandHash: ref.cliExecutionLogCommandHash,
    cliOtelTraceCommandHash: ref.cliOtelTraceCommandHash,
    cliFileUploadCommandHash: ref.cliFileUploadCommandHash,
    typescriptPackageManifestHash: ref.typescriptPackageManifestHash,
    typescriptLockfileHash: ref.typescriptLockfileHash,
    typescriptSourceTreeHash: ref.typescriptSourceTreeHash,
    npmPackageRef: ref.npmPackageRef,
    npmPackageIntegrity: ref.npmPackageIntegrity,
    npmCliPackageRef: ref.npmCliPackageRef,
    npmCliPackageIntegrity: ref.npmCliPackageIntegrity,
    studioSurface: ref.studioSurface,
    uiRoutePath: ref.uiRoutePath,
    sourceArtifactLinks: ref.sourceArtifactLinks,
    tracePreviewHash: ref.tracePreviewHash,
    receiptPreviewHash: ref.receiptPreviewHash,
    policyRulePreviewHash: ref.policyRulePreviewHash,
    sourceArtifactPreviewHash: ref.sourceArtifactPreviewHash,
    emptyStateHash: ref.emptyStateHash,
    errorStateHash: ref.errorStateHash,
    evidencePreviewState: ref.evidencePreviewState,
    evidencePreviewCount: ref.evidencePreviewCount,
    minEvidencePreviewCount: ref.minEvidencePreviewCount,
    sourceArtifactLinkCount: ref.sourceArtifactLinkCount,
    minSourceArtifactLinkCount: ref.minSourceArtifactLinkCount,
    status: ref.status,
    evidenceRefs: ref.evidenceRefs,
    rejectedEvidenceRefs: ref.rejectedEvidenceRefs,
    repairHint: ref.repairHint,
    rowHash: ref.rowHash,
  };
}

function obsStudioDrilldownLensPreview(
  ref: QuestionScoreObsStudioDrilldownLensRef,
): ScoreObsStudioDrilldownPreviewRow {
  return {
    drilldownId: ref.drilldownId,
    sourceRef: ref.sourceRef,
    sourceKind: ref.sourceKind,
    openAlexWorkId: ref.openAlexWorkId,
    doi: ref.doi,
    publisherRef: ref.publisherRef,
    titleRef: ref.titleRef,
    venueRef: ref.venueRef,
    publicationDate: ref.publicationDate,
    uiRoutePath: ref.uiRoutePath,
    sourceArtifactLinks: ref.sourceArtifactLinks,
    tracePreviewHash: ref.tracePreviewHash,
    reasoningTracePreviewHash: ref.reasoningTracePreviewHash,
    receiptPreviewHash: ref.receiptPreviewHash,
    evidencePreviewHash: ref.evidencePreviewHash,
    sourceArtifactPreviewHash: ref.sourceArtifactPreviewHash,
    emptyStateHash: ref.emptyStateHash,
    errorStateHash: ref.errorStateHash,
    evidencePreviewState: ref.evidencePreviewState,
    evidencePreviewCount: ref.evidencePreviewCount,
    minEvidencePreviewCount: ref.minEvidencePreviewCount,
    sourceArtifactLinkCount: ref.sourceArtifactLinkCount,
    minSourceArtifactLinkCount: ref.minSourceArtifactLinkCount,
    status: ref.status,
    evidenceRefs: ref.evidenceRefs,
    rejectedEvidenceRefs: ref.rejectedEvidenceRefs,
    repairHint: ref.repairHint,
    rowHash: ref.rowHash,
  };
}

function isSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

function isGitSha(value: string): boolean {
  return /^[a-f0-9]{40}$/i.test(value);
}

function isPresentSha256(value: string | null): boolean {
  return typeof value === "string" && isSha256(value);
}

function scoreMeetsMinimum(value: number | null, minimum: number | null): boolean {
  return typeof value === "number" && typeof minimum === "number" && value >= minimum;
}

function costMeetsMaximum(value: number | null, maximum: number | null): boolean {
  return maximum === null || (typeof value === "number" && value <= maximum);
}

function landscapeLensFailClosed(ref: QuestionScoreLandscapeLensRef): boolean {
  if (ref.status !== "satisfied") {
    return true;
  }
  if (ref.datasetRefs.length === 0 || ref.datasetHashes.length === 0 || !ref.datasetHashes.every(isSha256)) {
    return true;
  }
  if (ref.lastVerifiedAt === null || ref.freshnessDays === null || ref.maxAllowedFreshnessDays === null) {
    return true;
  }
  return ref.freshnessDays > ref.maxAllowedFreshnessDays ||
    ref.cohortRefs.length === 0 ||
    (ref.benchmarkRefs.length === 0 && ref.toolOrModelRefs.length === 0);
}

function incidentTriageLensFailClosed(ref: QuestionScoreIncidentTriageLensRef): boolean {
  if (ref.status !== "satisfied") {
    return true;
  }
  if (!ref.environmentId || !ref.sourceRef || !ref.taskId || !ref.scenarioId || !isSha256(ref.rowHash)) {
    return true;
  }

  const proofHashes = [
    ref.openEnvConfigHash,
    ref.scenarioManifestHash,
    ref.incidentReportHash,
    ref.rawLogBundleHash,
    ref.metricSnapshotHash,
    ref.userReportHash,
    ref.actionPayloadHash,
    ref.graderConfigHash,
    ref.feedbackHash,
  ];
  if (!proofHashes.every(isPresentSha256)) {
    return true;
  }

  if (!ref.deterministicGrader || ref.evidenceRefs.length === 0 || ref.repairHint.length === 0) {
    return true;
  }
  if (ref.maxSteps === null || ref.stepCount === null || ref.stepCount > ref.maxSteps) {
    return true;
  }

  return !scoreMeetsMinimum(ref.reward0to1, ref.minReward0to1) ||
    !scoreMeetsMinimum(ref.rootCauseScore0to1, ref.minRootCauseScore0to1) ||
    !scoreMeetsMinimum(ref.redHerringFilterScore0to1, ref.minRedHerringFilterScore0to1) ||
    !scoreMeetsMinimum(ref.orderedRemediationScore0to1, ref.minOrderedRemediationScore0to1);
}

function benchmarkSubmissionLensFailClosed(ref: QuestionScoreBenchmarkSubmissionLensRef): boolean {
  if (ref.status !== "satisfied") {
    return true;
  }
  if (
    !ref.benchmarkId ||
    !ref.sourceRef ||
    !ref.submissionId ||
    !ref.submissionVersion ||
    !ref.agentVersion ||
    !ref.submittedAt ||
    !ref.taskId ||
    !ref.taskCategory ||
    !isSha256(ref.rowHash)
  ) {
    return true;
  }

  const proofHashes = [
    ref.submissionMetadataHash,
    ref.taskBreakdownHash,
    ref.leaderboardSnapshotHash,
  ];
  if (!proofHashes.every(isPresentSha256)) {
    return true;
  }
  if (
    ref.evidenceRefs.length === 0 ||
    ref.criterionScores.length === 0 ||
    ref.overallScore0to100 === null ||
    ref.categoryScore0to100 === null ||
    ref.speedMs === null ||
    ref.costUsd === null ||
    ref.leaderboardMetricViews.length === 0 ||
    (ref.taskStatus !== "success" && ref.taskStatus !== "warning")
  ) {
    return true;
  }
  return ref.criterionScores.some((criterion) =>
    criterion.criterionId.length === 0 ||
    criterion.score0to1 === null ||
    criterion.repairHint.length === 0 ||
    (criterion.status === "satisfied" && criterion.evidenceRefs.length === 0) ||
    (criterion.status === "failed" && criterion.evidenceRefs.length === 0 && criterion.rejectedEvidenceRefs.length === 0)
  );
}

function multiUserMetricMeetsThreshold(ref: QuestionScoreMultiUserBenchmarkLensRef): boolean {
  if (ref.scenarioFamily === "access_control") {
    return scoreMeetsMinimum(ref.privacyPassRate0to1, ref.minPrivacyPassRate0to1);
  }
  if (ref.scenarioFamily === "meeting_scheduling") {
    return scoreMeetsMinimum(ref.coordinationSuccessRate0to1, ref.minCoordinationSuccessRate0to1);
  }
  if (ref.scenarioFamily === "shared_queue") {
    return scoreMeetsMinimum(ref.queueFairnessScore0to1, ref.minQueueFairnessScore0to1);
  }
  if (ref.scenarioFamily === "multiuser_instruction_following") {
    return scoreMeetsMinimum(ref.instructionFollowingScore0to1, ref.minInstructionFollowingScore0to1);
  }
  return scoreMeetsMinimum(ref.privacyPassRate0to1, ref.minPrivacyPassRate0to1) ||
    scoreMeetsMinimum(ref.coordinationSuccessRate0to1, ref.minCoordinationSuccessRate0to1) ||
    scoreMeetsMinimum(ref.queueFairnessScore0to1, ref.minQueueFairnessScore0to1) ||
    scoreMeetsMinimum(ref.instructionFollowingScore0to1, ref.minInstructionFollowingScore0to1);
}

function multiUserScenarioProofPresent(ref: QuestionScoreMultiUserBenchmarkLensRef): boolean {
  if (ref.scenarioFamily === "access_control") return isPresentSha256(ref.permissionPolicyHash);
  if (ref.scenarioFamily === "meeting_scheduling") return isPresentSha256(ref.preferenceProfileHash);
  if (ref.scenarioFamily === "shared_queue") return isPresentSha256(ref.resourceQueuePolicyHash);
  if (ref.scenarioFamily === "multiuser_instruction_following") return isPresentSha256(ref.instructionSetHash);
  return isPresentSha256(ref.permissionPolicyHash) ||
    isPresentSha256(ref.preferenceProfileHash) ||
    isPresentSha256(ref.resourceQueuePolicyHash) ||
    isPresentSha256(ref.instructionSetHash);
}

function multiUserBenchmarkLensFailClosed(ref: QuestionScoreMultiUserBenchmarkLensRef): boolean {
  if (ref.status !== "satisfied") {
    return true;
  }
  if (!ref.benchmarkId || !ref.sourceRef || !ref.scenarioId || !isSha256(ref.rowHash)) {
    return true;
  }
  const proofHashes = [
    ref.datasetManifestHash,
    ref.userRoleManifestHash,
    ref.instructionSetHash,
    ref.interactionTraceHash,
    ref.evaluatorConfigHash,
    ref.resultArtifactHash,
    ref.metricReportHash,
  ];
  if (!proofHashes.every(isPresentSha256) || !multiUserScenarioProofPresent(ref)) {
    return true;
  }
  return ref.evidenceRefs.length === 0 ||
    ref.userRoleCount === null ||
    ref.userRoleCount < 2 ||
    ref.turnCount === null ||
    ref.turnCount <= 0 ||
    !multiUserMetricMeetsThreshold(ref);
}

function continualLearningBenchmarkLensFailClosed(
  ref: QuestionScoreContinualLearningBenchmarkLensRef,
): boolean {
  if (ref.status !== "satisfied") {
    return true;
  }
  if (!ref.benchmarkId || !ref.sourceRef || !ref.domainId || !ref.workflowId || !isSha256(ref.rowHash)) {
    return true;
  }
  const proofHashes = [
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
  ];
  if (!proofHashes.every(isPresentSha256)) {
    return true;
  }
  if (
    ref.evidenceRefs.length === 0 ||
    ref.scenarioCount === null ||
    ref.scenarioCount <= 0 ||
    ref.turnCount === null ||
    ref.turnCount <= 0 ||
    ref.stateMutationCount === null ||
    ref.stateMutationCount <= 0 ||
    ref.entityCount === null ||
    ref.entityCount <= 0
  ) {
    return true;
  }
  return !scoreMeetsMinimum(ref.taskCompletionRate0to1, ref.minTaskCompletionRate0to1) ||
    !scoreMeetsMinimum(ref.responseQualityScore0to1, ref.minResponseQualityScore0to1) ||
    !scoreMeetsMinimum(ref.stateAccuracy0to1, ref.minStateAccuracy0to1) ||
    !scoreMeetsMinimum(ref.retentionScore0to1, ref.minRetentionScore0to1) ||
    !costMeetsMaximum(ref.tokenCostUsd, ref.maxTokenCostUsd);
}

function hermesTurboPerformanceLensFailClosed(
  ref: QuestionScoreHermesTurboPerformanceLensRef,
): boolean {
  if (ref.status !== "satisfied") {
    return true;
  }
  if (
    !ref.benchmarkId ||
    ref.benchmarkId.startsWith("unknown-") ||
    !ref.sourceRef ||
    ref.sourceRef === "unknown-source" ||
    !ref.repositoryRef ||
    ref.repositoryRef === "unknown-repository" ||
    !ref.defaultBranch ||
    ref.defaultBranch === "unknown-branch" ||
    ref.licenseRef === null ||
    ref.licenseSpdxId === null ||
    ref.sourceCommitSha === null ||
    ref.sourceTreeSha === null ||
    !isGitSha(ref.sourceCommitSha) ||
    !isGitSha(ref.sourceTreeSha) ||
    !isSha256(ref.rowHash)
  ) {
    return true;
  }
  const proofHashes = [
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
  ];
  if (!proofHashes.every(isPresentSha256)) {
    return true;
  }
  if (
    ref.evidenceRefs.length === 0 ||
    ref.performanceFacet === "custom" ||
    ref.ciRunId === null ||
    ref.runCount === null ||
    ref.minRunCount === null ||
    ref.runCount < ref.minRunCount
  ) {
    return true;
  }
  return !costMeetsMaximum(ref.latencyP50Ms, ref.maxLatencyP50Ms) ||
    !costMeetsMaximum(ref.latencyP95Ms, ref.maxLatencyP95Ms) ||
    !scoreMeetsMinimum(ref.throughputOpsPerSec, ref.minThroughputOpsPerSec) ||
    !scoreMeetsMinimum(ref.speedupFactor, ref.minSpeedupFactor) ||
    !scoreMeetsMinimum(ref.scoreDelta0to1, ref.minScoreDelta0to1) ||
    !scoreMeetsMinimum(ref.dashboardCoverage0to1, ref.minDashboardCoverage0to1) ||
    !scoreMeetsMinimum(ref.regressionPassRate0to1, ref.minRegressionPassRate0to1);
}

function professionalTaskLensFailClosed(ref: QuestionScoreProfessionalTaskLensRef): boolean {
  if (ref.status !== "satisfied") {
    return true;
  }
  if (!ref.benchmarkId || !ref.sourceRef || !ref.taskId || !ref.scenarioId || !isSha256(ref.rowHash)) {
    return true;
  }
  const proofHashes = [
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
    ref.debugTraceHash,
  ];
  if (!proofHashes.every(isPresentSha256)) {
    return true;
  }
  if (
    ref.evidenceRefs.length === 0 ||
    ref.verifierVoteCount === null ||
    ref.minVerifierVoteCount === null ||
    ref.verifierVoteCount < ref.minVerifierVoteCount ||
    ref.trajectoryStepCount === null ||
    ref.maxTrajectoryStepCount === null ||
    ref.trajectoryStepCount > ref.maxTrajectoryStepCount
  ) {
    return true;
  }
  return !scoreMeetsMinimum(ref.passRate0to1, ref.minPassRate0to1) ||
    !scoreMeetsMinimum(ref.robustnessScore0to1, ref.minRobustnessScore0to1);
}

function iotFirmwareQuestionLensFailClosed(ref: QuestionScoreIotFirmwareQuestionLensRef): boolean {
  if (ref.status !== "satisfied") {
    return true;
  }
  if (
    !ref.benchmarkId ||
    ref.benchmarkId.startsWith("unknown-") ||
    !ref.sourceRef ||
    ref.sourceRef === "unknown-source" ||
    !ref.taskId ||
    ref.taskId === "unknown-task" ||
    !ref.boardId ||
    ref.boardId === "unknown-board" ||
    !ref.chipFamily ||
    ref.chipFamily === "unknown-chip" ||
    !isSha256(ref.rowHash)
  ) {
    return true;
  }
  const proofHashes = [
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
  ];
  if (!proofHashes.every(isPresentSha256)) {
    return true;
  }
  if (
    ref.evidenceRefs.length === 0 ||
    ref.platform === "custom" ||
    ref.hardwareRunCount === null ||
    ref.hardwareRunCount <= 0 ||
    ref.deviceCount === null ||
    ref.deviceCount <= 0
  ) {
    return true;
  }
  return !scoreMeetsMinimum(ref.bugClosureRate0to1, ref.minBugClosureRate0to1) ||
    !scoreMeetsMinimum(ref.tokenEfficiencyRatio, ref.minTokenEfficiencyRatio) ||
    !scoreMeetsMinimum(ref.logCaptureCoverage0to1, ref.minLogCaptureCoverage0to1);
}

function retailSalesQuestionLensFailClosed(ref: QuestionScoreRetailSalesQuestionLensRef): boolean {
  if (ref.status !== "satisfied") {
    return true;
  }
  if (
    !ref.benchmarkId ||
    ref.benchmarkId.startsWith("unknown-") ||
    !ref.sourceRef ||
    ref.sourceRef === "unknown-source" ||
    !ref.taskId ||
    ref.taskId === "unknown-task" ||
    !isSha256(ref.rowHash)
  ) {
    return true;
  }
  const proofHashes = [
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
  ];
  if (!proofHashes.every(isPresentSha256)) {
    return true;
  }
  if (
    ref.evidenceRefs.length === 0 ||
    ref.salesChannel === "custom" ||
    ref.modelProviderCount === null ||
    ref.modelProviderCount < 2 ||
    ref.customerScenarioCount === null ||
    ref.customerScenarioCount <= 0 ||
    ref.orderCount === null ||
    ref.orderCount <= 0
  ) {
    return true;
  }
  return !scoreMeetsMinimum(ref.orderCaptureAccuracy0to1, ref.minOrderCaptureAccuracy0to1) ||
    !scoreMeetsMinimum(ref.policyComplianceRate0to1, ref.minPolicyComplianceRate0to1) ||
    !scoreMeetsMinimum(ref.recommendationGrounding0to1, ref.minRecommendationGrounding0to1) ||
    !scoreMeetsMinimum(ref.piiRedactionRate0to1, ref.minPiiRedactionRate0to1);
}

function scorableStudioDrilldownLensFailClosed(ref: QuestionScoreScorableStudioDrilldownLensRef): boolean {
  if (ref.status !== "satisfied") {
    return true;
  }
  if (
    !ref.drilldownId ||
    ref.drilldownId.startsWith("unknown-") ||
    !ref.sourceRef ||
    ref.sourceRef === "unknown-source" ||
    !ref.repositoryRef ||
    ref.repositoryRef === "unknown-repository" ||
    !ref.defaultBranch ||
    ref.defaultBranch === "unknown-branch" ||
    ref.licenseRef === null ||
    ref.licenseSpdxId === null ||
    ref.sourceCommitSha === null ||
    ref.sourceTreeSha === null ||
    !isGitSha(ref.sourceCommitSha) ||
    !isGitSha(ref.sourceTreeSha) ||
    ref.npmPackageRef === null ||
    ref.npmPackageIntegrity === null ||
    ref.npmCliPackageRef === null ||
    ref.npmCliPackageIntegrity === null ||
    !isSha256(ref.rowHash)
  ) {
    return true;
  }
  const proofHashes = [
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
  ];
  if (!proofHashes.every(isPresentSha256)) {
    return true;
  }
  const routePresent = ref.uiRoutePath.startsWith("/api/v1/score/evidence-drilldown/") ||
    ref.uiRoutePath.includes("evidenceDrilldown");
  if (
    ref.evidenceRefs.length === 0 ||
    ref.studioSurface === "custom" ||
    ref.evidencePreviewState !== "ready" ||
    !routePresent ||
    ref.evidencePreviewCount === null ||
    ref.minEvidencePreviewCount === null ||
    ref.evidencePreviewCount < ref.minEvidencePreviewCount ||
    ref.sourceArtifactLinkCount === null ||
    ref.minSourceArtifactLinkCount === null ||
    ref.sourceArtifactLinkCount < ref.minSourceArtifactLinkCount ||
    ref.sourceArtifactLinks.length < ref.minSourceArtifactLinkCount
  ) {
    return true;
  }
  return false;
}

function obsStudioDrilldownLensFailClosed(ref: QuestionScoreObsStudioDrilldownLensRef): boolean {
  if (ref.status !== "satisfied") {
    return true;
  }
  const routePresent = ref.uiRoutePath.startsWith("/api/v1/score/evidence-drilldown/") ||
    ref.uiRoutePath.includes("evidenceDrilldown");
  const openAlexWorkId = typeof ref.openAlexWorkId === "string" ? ref.openAlexWorkId : "";
  const doi = typeof ref.doi === "string" ? ref.doi : "";
  const publisherRef = typeof ref.publisherRef === "string" ? ref.publisherRef : "";
  const titleRef = typeof ref.titleRef === "string" ? ref.titleRef : "";
  const venueRef = typeof ref.venueRef === "string" ? ref.venueRef : "";
  const publicationDate = typeof ref.publicationDate === "string" ? ref.publicationDate : "";
  const paperMetadataPresent = ref.sourceKind !== "paper" || (
    openAlexWorkId.startsWith("https://openalex.org/W") &&
    doi.startsWith("https://doi.org/") &&
    publisherRef.trim().length > 0 &&
    titleRef.trim().length > 0 &&
    venueRef.trim().length > 0 &&
    publicationDate.trim().length > 0
  );
  if (
    !ref.drilldownId ||
    ref.drilldownId.startsWith("unknown-") ||
    !ref.sourceRef ||
    ref.sourceRef === "unknown-source" ||
    ref.sourceKind === "custom" ||
    !routePresent ||
    !paperMetadataPresent ||
    !isSha256(ref.rowHash)
  ) {
    return true;
  }
  const proofHashes = [
    ref.tracePreviewHash,
    ref.reasoningTracePreviewHash,
    ref.receiptPreviewHash,
    ref.evidencePreviewHash,
    ref.sourceArtifactPreviewHash,
    ref.emptyStateHash,
    ref.errorStateHash,
  ];
  if (!proofHashes.every(isPresentSha256)) {
    return true;
  }
  return ref.evidenceRefs.length === 0 ||
    ref.evidencePreviewState !== "ready" ||
    ref.evidencePreviewCount === null ||
    ref.minEvidencePreviewCount === null ||
    ref.evidencePreviewCount < ref.minEvidencePreviewCount ||
    ref.sourceArtifactLinkCount === null ||
    ref.minSourceArtifactLinkCount === null ||
    ref.sourceArtifactLinkCount < ref.minSourceArtifactLinkCount ||
    ref.sourceArtifactLinks.length < ref.minSourceArtifactLinkCount;
}

function artifactLinks(report: DiagnosticReport, agentId: string, runId: string): ScoreEvidenceDrilldownArtifactLink[] {
  const query = `agentId=${encodeURIComponent(agentId)}`;
  return [
    {
      label: "Score report JSON",
      kind: "score-report",
      href: `/api/v1/score/report/${encodeURIComponent(runId)}?${query}&format=json`,
      hash: report.reportJsonSha256,
    },
    {
      label: "Watch explain packet",
      kind: "watch-explain",
      href: null,
    },
    {
      label: "Shield score receipt",
      kind: "shield-receipt",
      href: `/api/v1/shield/score-explainability/${encodeURIComponent(runId)}?${query}`,
      hash: report.questionExplainability?.manifestHash,
    },
    {
      label: "Passport receipt hash",
      kind: "passport-hash",
      href: null,
      hash: report.questionExplainability?.manifestHash,
    },
    {
      label: "Scoring methodology",
      kind: "methodology",
      href: report.methodology?.publicUrl ?? "/docs/SCORING_METHODOLOGY.md",
      hash: report.methodology?.hash,
    },
    {
      label: "Methodology versioning receipt",
      kind: "methodology-versioning",
      href: report.methodology?.publicUrl ?? "/docs/SCORING_METHODOLOGY.md",
      hash: report.methodologyVersioning?.receiptHash ?? report.methodology?.versioningAssuranceHash,
    },
  ];
}

export function buildScoreEvidenceDrilldown(
  report: DiagnosticReport,
  questionId: string,
): ScoreEvidenceDrilldown {
  const agentId = report.agentId || "default";
  const runId = report.runId;
  const pack = report.questionExplainability;
  const sourceArtifacts = artifactLinks(report, agentId, runId);

  if (!pack) {
    return {
      state: "empty",
      message: "This run does not include question-level explainability receipts. Rerun scoring with a current AMC version.",
      agentId,
      runId,
      questionId,
      title: null,
      status: null,
      surfaces: ["Score", "Shield", "Watch"],
      levels: { claimed: null, supported: null, final: null },
      evidenceWindow: null,
      repairHint: null,
      missingGateReasons: [],
      sourceArtifacts,
      evidencePreview: { accepted: [], rejected: [] },
      criteriaPreview: [],
      rubricLensPreview: [],
      ragFlowPreview: [],
      landscapeLensPreview: [],
      incidentTriagePreview: [],
      benchmarkSubmissionPreview: [],
      multiUserBenchmarkPreview: [],
      continualLearningBenchmarkPreview: [],
      hermesTurboPerformancePreview: [],
      professionalTaskPreview: [],
      iotFirmwareQuestionPreview: [],
      retailSalesQuestionPreview: [],
      scorableStudioDrilldownPreview: [],
      obsStudioDrilldownPreview: [],
      rowHash: null,
      manifestHash: null,
      failClosed: true,
      replayable: false,
    };
  }

  const row = pack.rows.find((item) => item.questionId === questionId);
  if (!row) {
    return {
      state: "empty",
      message: `No question-level receipt found for ${questionId}.`,
      agentId,
      runId,
      questionId,
      title: null,
      status: null,
      surfaces: ["Score", "Shield", "Watch"],
      levels: { claimed: null, supported: null, final: null },
      evidenceWindow: null,
      repairHint: null,
      missingGateReasons: [],
      sourceArtifacts,
      evidencePreview: { accepted: [], rejected: [] },
      criteriaPreview: [],
      rubricLensPreview: [],
      ragFlowPreview: [],
      landscapeLensPreview: [],
      incidentTriagePreview: [],
      benchmarkSubmissionPreview: [],
      multiUserBenchmarkPreview: [],
      continualLearningBenchmarkPreview: [],
      hermesTurboPerformancePreview: [],
      professionalTaskPreview: [],
      iotFirmwareQuestionPreview: [],
      retailSalesQuestionPreview: [],
      scorableStudioDrilldownPreview: [],
      obsStudioDrilldownPreview: [],
      rowHash: null,
      manifestHash: pack.manifestHash,
      failClosed: true,
      replayable: pack.replayable,
    };
  }

  const incidentTriageLens = row.incidentTriageLens ?? [];
  const benchmarkSubmissionLens = row.benchmarkSubmissionLens ?? [];
  const multiUserBenchmarkLens = row.multiUserBenchmarkLens ?? [];
  const continualLearningBenchmarkLens = row.continualLearningBenchmarkLens ?? [];
  const hermesTurboPerformanceLens = row.hermesTurboPerformanceLens ?? [];
  const professionalTaskLens = row.professionalTaskLens ?? [];
  const iotFirmwareQuestionLens = row.iotFirmwareQuestionLens ?? [];
  const retailSalesQuestionLens = row.retailSalesQuestionLens ?? [];
  const scorableStudioDrilldownLens = row.scorableStudioDrilldownLens ?? [];
  const obsStudioDrilldownLens = row.obsStudioDrilldownLens ?? [];

  return {
    state: "ready",
    message: "Question receipt loaded.",
    agentId,
    runId,
    questionId,
    title: row.title,
    status: row.status,
    surfaces: row.surfaces,
    levels: {
      claimed: row.claimedLevel,
      supported: row.supportedMaxLevel,
      final: row.finalLevel,
    },
    evidenceWindow: row.evidenceWindow,
    repairHint: row.repairHint,
    missingGateReasons: row.missingGateReasons,
    sourceArtifacts,
    evidencePreview: {
      accepted: row.signedEvidenceRefs.map(signedPreview),
      rejected: row.rejectedEvidence.map(rejectedPreview),
    },
    criteriaPreview: row.criteriaDiagnostics.map(criterionPreview),
    rubricLensPreview: row.rubricLens.map(rubricLensPreview),
    ragFlowPreview: row.ragFlowDiagnostics.map(ragFlowPreview),
    landscapeLensPreview: row.landscapeLens.map(landscapeLensPreview),
    incidentTriagePreview: incidentTriageLens.map(incidentTriageLensPreview),
    benchmarkSubmissionPreview: benchmarkSubmissionLens.map(benchmarkSubmissionLensPreview),
    multiUserBenchmarkPreview: multiUserBenchmarkLens.map(multiUserBenchmarkLensPreview),
    continualLearningBenchmarkPreview: continualLearningBenchmarkLens.map(continualLearningBenchmarkLensPreview),
    hermesTurboPerformancePreview: hermesTurboPerformanceLens.map(hermesTurboPerformanceLensPreview),
    professionalTaskPreview: professionalTaskLens.map(professionalTaskLensPreview),
    iotFirmwareQuestionPreview: iotFirmwareQuestionLens.map(iotFirmwareQuestionLensPreview),
    retailSalesQuestionPreview: retailSalesQuestionLens.map(retailSalesQuestionLensPreview),
    scorableStudioDrilldownPreview: scorableStudioDrilldownLens.map(scorableStudioDrilldownLensPreview),
    obsStudioDrilldownPreview: obsStudioDrilldownLens.map(obsStudioDrilldownLensPreview),
    rowHash: row.rowHash,
    manifestHash: pack.manifestHash,
    failClosed: row.status !== "passed"
      || row.missingGateReasons.length > 0
      || row.criteriaDiagnostics.some((criterion) => criterion.status !== "satisfied")
      || row.ragFlowDiagnostics.some((diagnostic) => diagnostic.status !== "satisfied")
      || row.landscapeLens.some(landscapeLensFailClosed)
      || incidentTriageLens.some(incidentTriageLensFailClosed)
      || benchmarkSubmissionLens.some(benchmarkSubmissionLensFailClosed)
      || multiUserBenchmarkLens.some(multiUserBenchmarkLensFailClosed)
      || continualLearningBenchmarkLens.some(continualLearningBenchmarkLensFailClosed)
      || hermesTurboPerformanceLens.some(hermesTurboPerformanceLensFailClosed)
      || professionalTaskLens.some(professionalTaskLensFailClosed)
      || iotFirmwareQuestionLens.some(iotFirmwareQuestionLensFailClosed)
      || retailSalesQuestionLens.some(retailSalesQuestionLensFailClosed)
      || scorableStudioDrilldownLens.some(scorableStudioDrilldownLensFailClosed)
      || obsStudioDrilldownLens.some(obsStudioDrilldownLensFailClosed)
      || row.rubricLens.some((lens) => lens.checks.some((check) => check.status === "partial" || check.status === "fail")),
    replayable: pack.replayable,
  };
}
