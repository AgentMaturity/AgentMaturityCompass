import type {
  QuestionScoreCriterionDiagnosticRef,
  QuestionScoreIncidentTriageLensRef,
  QuestionScoreBenchmarkSubmissionLensRef,
  QuestionScoreMultiUserBenchmarkLensRef,
  QuestionScoreContinualLearningBenchmarkLensRef,
  QuestionScoreHermesTurboPerformanceLensRef,
  QuestionScoreIotFirmwareQuestionLensRef,
  QuestionScoreRetailSalesQuestionLensRef,
  QuestionScoreScorableStudioDrilldownLensRef,
  QuestionScoreObsStudioDrilldownLensRef,
} from "../types.js";

// Domain proof and threshold guards stay at their call sites.
export function replayableLensStatus(
  ref: Pick<QuestionScoreCriterionDiagnosticRef, "status" | "evidenceRefs" | "rejectedEvidenceRefs" | "repairHint">,
  satisfiedProof: () => boolean,
): boolean {
  if (ref.status === "satisfied") {
    return ref.evidenceRefs.length > 0 && satisfiedProof();
  }
  if (ref.status === "failed") {
    return ref.evidenceRefs.length > 0 || ref.rejectedEvidenceRefs.length > 0 || ref.repairHint.length > 0;
  }
  return ref.repairHint.length > 0;
}

export function incidentTriageProofHashes(
  ref: Pick<QuestionScoreIncidentTriageLensRef,
    "openEnvConfigHash" |
    "scenarioManifestHash" |
    "incidentReportHash" |
    "rawLogBundleHash" |
    "metricSnapshotHash" |
    "userReportHash" |
    "actionPayloadHash" |
    "graderConfigHash" |
    "feedbackHash">,
): Array<string | null> {
  // Preserve eager proof reads and their order before the caller checks any hash.
  return [
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
}

export function benchmarkSubmissionProofHashes(
  ref: Pick<QuestionScoreBenchmarkSubmissionLensRef,
    "submissionMetadataHash" |
    "taskBreakdownHash" |
    "leaderboardSnapshotHash">,
): Array<string | null> {
  // Preserve eager proof reads and their order before the caller checks any hash.
  return [
    ref.submissionMetadataHash,
    ref.taskBreakdownHash,
    ref.leaderboardSnapshotHash,
  ];
}

export function multiUserBenchmarkProofHashes(
  ref: Pick<QuestionScoreMultiUserBenchmarkLensRef,
    "datasetManifestHash" |
    "userRoleManifestHash" |
    "instructionSetHash" |
    "interactionTraceHash" |
    "evaluatorConfigHash" |
    "resultArtifactHash" |
    "metricReportHash">,
): Array<string | null> {
  // Preserve eager proof reads and their order before the caller checks any hash.
  return [
    ref.datasetManifestHash,
    ref.userRoleManifestHash,
    ref.instructionSetHash,
    ref.interactionTraceHash,
    ref.evaluatorConfigHash,
    ref.resultArtifactHash,
    ref.metricReportHash,
  ];
}

export function continualLearningBenchmarkProofHashes(
  ref: Pick<QuestionScoreContinualLearningBenchmarkLensRef,
    "datasetManifestHash" |
    "stateSchemaHash" |
    "initialStateHash" |
    "stateMutationTraceHash" |
    "conversationTraceHash" |
    "entityRelationshipGraphHash" |
    "toolExecutionTraceHash" |
    "evaluatorConfigHash" |
    "resultArtifactHash" |
    "replayCommandHash">,
): Array<string | null> {
  // Preserve eager proof reads and their order before the caller checks any hash.
  return [
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
}

export function hermesTurboPerformanceProofHashes(
  ref: Pick<QuestionScoreHermesTurboPerformanceLensRef,
    "sourceStatusHash" |
    "readmeArtifactHash" |
    "packageManifestHash" |
    "benchmarkWorkflowHash" |
    "perfBudgetWorkflowHash" |
    "dailyScoreWorkflowHash" |
    "turboScoreScriptHash" |
    "performanceDashboardHash" |
    "benchmarkReportHash" |
    "baselineResultHash" |
    "candidateResultHash" |
    "latencyTraceHash" |
    "throughputTraceHash" |
    "scoreManifestHash" |
    "regressionThresholdHash" |
    "ciConfigHash">,
): Array<string | null> {
  // Preserve eager proof reads and their order before the caller checks any hash.
  return [
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
}

export function iotFirmwareQuestionProofHashes(
  ref: Pick<QuestionScoreIotFirmwareQuestionLensRef,
    "firmwareProjectHash" |
    "toolchainManifestHash" |
    "sdkVersionManifestHash" |
    "hardwareSessionHash" |
    "deviceLogBundleHash" |
    "buildArtifactHash" |
    "flashArtifactHash" |
    "testArtifactHash" |
    "knowledgePackManifestHash" |
    "taskManifestHash" |
    "evaluatorConfigHash" |
    "resultArtifactHash" |
    "privacyBoundaryHash" |
    "benchmarkReportHash">,
): Array<string | null> {
  // Preserve eager proof reads and their order before the caller checks any hash.
  return [
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
}

export function retailSalesQuestionProofHashes(
  ref: Pick<QuestionScoreRetailSalesQuestionLensRef,
    "productCatalogHash" |
    "productDescriptionHash" |
    "customerScenarioHash" |
    "conversationTraceHash" |
    "customerIntentManifestHash" |
    "orderCaptureSchemaHash" |
    "orderLedgerHash" |
    "pricingPolicyHash" |
    "discountPolicyHash" |
    "modelAdapterManifestHash" |
    "modelProviderMatrixHash" |
    "promptPolicyHash" |
    "recommendationPolicyHash" |
    "safetyPolicyHash" |
    "privacyBoundaryHash" |
    "evaluatorConfigHash" |
    "resultArtifactHash" |
    "benchmarkReportHash">,
): Array<string | null> {
  // Preserve eager proof reads and their order before the caller checks any hash.
  return [
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
}

export function scorableStudioDrilldownProofHashes(
  ref: Pick<QuestionScoreScorableStudioDrilldownLensRef,
    "readmeArtifactHash" |
    "pythonPackageManifestHash" |
    "pythonOpenApiHash" |
    "pythonClientHash" |
    "pythonExecutionLogsHash" |
    "pythonEvaluatorApiHash" |
    "pythonExecutionLogApiHash" |
    "cliPackageManifestHash" |
    "cliLockfileHash" |
    "cliEvaluatorCommandHash" |
    "cliJudgeCommandHash" |
    "cliExecutionLogCommandHash" |
    "cliOtelTraceCommandHash" |
    "cliFileUploadCommandHash" |
    "typescriptPackageManifestHash" |
    "typescriptLockfileHash" |
    "typescriptSourceTreeHash" |
    "tracePreviewHash" |
    "receiptPreviewHash" |
    "policyRulePreviewHash" |
    "sourceArtifactPreviewHash" |
    "emptyStateHash" |
    "errorStateHash">,
): Array<string | null> {
  // Preserve eager proof reads and their order before the caller checks any hash.
  return [
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
}

export function obsStudioDrilldownProofHashes(
  ref: Pick<QuestionScoreObsStudioDrilldownLensRef,
    "tracePreviewHash" |
    "reasoningTracePreviewHash" |
    "receiptPreviewHash" |
    "evidencePreviewHash" |
    "sourceArtifactPreviewHash" |
    "emptyStateHash" |
    "errorStateHash">,
): Array<string | null> {
  // Preserve eager proof reads and their order before the caller checks any hash.
  return [
    ref.tracePreviewHash,
    ref.reasoningTracePreviewHash,
    ref.receiptPreviewHash,
    ref.evidencePreviewHash,
    ref.sourceArtifactPreviewHash,
    ref.emptyStateHash,
    ref.errorStateHash,
  ];
}
