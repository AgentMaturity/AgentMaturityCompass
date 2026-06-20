export type RuntimeName = "claude" | "gemini" | "openclaw" | "unknown" | "mock" | "any" | "gateway" | "sandbox";

export type EvidenceEventType =
  | "stdin"
  | "stdout"
  | "stderr"
  | "artifact"
  | "metric"
  | "test"
  | "audit"
  | "review"
  | "llm_request"
  | "llm_response"
  | "output_validated"
  | "gateway"
  | "tool_action"
  | "tool_result"
  | "outcome"
  | "agent_process_started"
  | "agent_stdout"
  | "agent_stderr"
  | "agent_process_exited"
  | "agent_handoff_sent"
  | "agent_handoff_received"
  | "agent_delegation_started"
  | "agent_delegation_completed";

export type RiskTier = "low" | "med" | "high" | "critical";

export type SystemType =
  | "task-agent"
  | "orchestrated-workflow"
  | "simulation-engine"
  | "forecast-decision-support"
  | "synthetic-social-environment"
  | "research-delegation";
export type TrustTier = "OBSERVED" | "OBSERVED_HARDENED" | "ATTESTED" | "SELF_REPORTED";
export type ExecutionMode = "SIMULATE" | "EXECUTE";
export type ActionClass =
  | "READ_ONLY"
  | "WRITE_LOW"
  | "WRITE_HIGH"
  | "DEPLOY"
  | "SECURITY"
  | "FINANCIAL"
  | "NETWORK_EXTERNAL"
  | "DATA_EXPORT"
  | "IDENTITY";

export type LayerName =
  | "Strategic Agent Operations"
  | "Leadership & Autonomy"
  | "Culture & Alignment"
  | "Resilience"
  | "Skills";

export type AMCSurfaceName = "Score" | "Shield" | "Enforce" | "Vault" | "Watch" | "Comply" | "Fleet" | "Passport";

export type AssessmentQuestionFamily =
  | "core"
  | "lifecycle-governance"
  | "harness-resources"
  | "evidence-binding"
  | "typed-multi-agent"
  | "trace-repair"
  | "proof-exports"
  | "reasoning-memory"
  | "uncertainty-controls"
  | "runtime-gateway-watch"
  | "fleet-org-operation";

export type TrustLabel = "HIGH TRUST" | "LOW TRUST" | "DEVELOPING — some evidence, needs more coverage" | "LOW — collect more evidence to increase trust" | "UNRELIABLE — DO NOT USE FOR CLAIMS";

export interface EvidenceEvent {
  id: string;
  ts: number;
  session_id: string;
  runtime: RuntimeName;
  event_type: EvidenceEventType;
  payload_path: string | null;
  payload_inline: string | null;
  payload_sha256: string;
  meta_json: string;
  prev_event_hash: string;
  event_hash: string;
  writer_sig: string;
  canonical_payload_path?: string | null;
  canonical_payload_inline?: string | null;
  blob_ref?: string | null;
  archived?: number;
  archive_segment_id?: string | null;
  archive_manifest_sha256?: string | null;
  payload_pruned?: number;
  payload_pruned_ts?: number | null;
}

export interface SessionRecord {
  session_id: string;
  started_ts: number;
  ended_ts: number | null;
  runtime: RuntimeName;
  binary_path: string;
  binary_sha256: string;
  session_final_event_hash: string | null;
  session_seal_sig: string | null;
}

export interface RunRecord {
  run_id: string;
  ts: number;
  window_start_ts: number;
  window_end_ts: number;
  target_profile_id: string | null;
  report_json_sha256: string;
  run_seal_sig: string;
  status: "VALID" | "INVALID" | "UNSIGNED";
}

export interface AssuranceRunRecord {
  assurance_run_id: string;
  agent_id: string;
  ts: number;
  window_start_ts: number;
  window_end_ts: number;
  mode: "supervise" | "sandbox";
  pack_ids_json: string;
  report_json_sha256: string;
  run_seal_sig: string;
  status: "VALID" | "INVALID" | "UNSIGNED";
}

export interface TargetProfile {
  id: string;
  name: string;
  createdTs: number;
  contextGraphHash: string;
  mapping: Record<string, number>;
  signature: string;
}

export interface OptionLevel {
  level: 0 | 1 | 2 | 3 | 4 | 5;
  label: string;
  meaning: string;
  observableSignals: string[];
  typicalEvidence: string[];
}

export interface GateConstraint {
  textRegex?: string[];
  metaKeys?: string[];
  artifactPatterns?: string[];
  metricKeys?: string[];
  auditTypes?: string[];
}

export interface Gate {
  level: 0 | 1 | 2 | 3 | 4 | 5;
  requiredEvidenceTypes: EvidenceEventType[];
  minEvents: number;
  minSessions: number;
  minDistinctDays: number;
  requiredTrustTier?: TrustTier;
  acceptedTrustTiers?: TrustTier[];
  mustInclude: GateConstraint;
  mustNotInclude: GateConstraint;
}

export interface DiagnosticQuestion {
  id: string;
  layerName: LayerName;
  title: string;
  promptTemplate: string;
  options: OptionLevel[];
  evidenceGateHints: string;
  upgradeHints: string;
  tuningKnobs: string[];
  gates: Gate[];
  questionSetVersion?: string;
  family?: AssessmentQuestionFamily;
  surfaces?: AMCSurfaceName[];
  assessmentLayers?: LayerName[];
  introducedIn?: string;
  scoringWeight?: number;
  activeByDefault?: boolean;
}

export interface DiagnosticQuestionSetDimension {
  family: AssessmentQuestionFamily;
  title: string;
  description: string;
  questionCount: number;
  surfaces: AMCSurfaceName[];
  layers: LayerName[];
}

export interface DiagnosticQuestionSetInfo {
  version: string;
  title: string;
  questionCount: number;
  default: boolean;
  includedVersions: string[];
  dimensions: DiagnosticQuestionSetDimension[];
  domainPackWeighting?: {
    requested: boolean;
    applied: boolean;
    entitlementActive: boolean;
    modifiedQuestionCount: number;
    message: string;
  };
}

export interface QuestionScore {
  questionId: string;
  claimedLevel: number;
  supportedMaxLevel: number;
  finalLevel: number;
  confidence: number;
  evidenceEventIds: string[];
  flags: string[];
  narrative: string;
  confidenceControls?: QuestionConfidenceControls;
}

export interface QuestionScoreSignedEvidenceRef {
  evidenceId: string;
  eventHash: string;
  writerSig: string;
  eventType: EvidenceEventType;
  sessionId: string;
  ts: number;
  trustTier: TrustTier;
}

export interface QuestionScoreRejectedEvidenceRef extends QuestionScoreSignedEvidenceRef {
  reason: string;
}

export type QuestionScoreExplainabilityStatus = "passed" | "needs_evidence" | "capped" | "unsupported_claim";
export type QuestionScoreComponentStatus = "accepted" | "rejected" | "missing";
export type QuestionScoreComponentType =
  | "retrieval"
  | "generation"
  | "evaluation"
  | "runtime"
  | "policy"
  | "evidence"
  | "custom";
export type QuestionScoreCriterionStatus = "satisfied" | "failed" | "missing";
export type QuestionScoreCriterionType =
  | "policy_gate"
  | "unit_test"
  | "shell_interaction"
  | "file_comparison"
  | "agent_judge"
  | "human_review"
  | "long_horizon_state"
  | "memory_continuity"
  | "delayed_outcome"
  | "adversarial_detection"
  | "prompt_artifact_alignment"
  | "subjective_quality"
  | "objective_quality"
  | "task_category_coverage"
  | "temporal_forecast_horizon"
  | "multi_source_integration"
  | "tool_use_trace"
  | "multi_agent_orchestration"
  | "session_state_trace"
  | "tool_auth_boundary"
  | "code_execution_sandbox"
  | "untrusted_tool_feedback"
  | "trajectory_trust_formation"
  | "hidden_trigger_detection"
  | "final_action_risk"
  | "safe_control_comparison"
  | "router_visible_prefix"
  | "step_level_model_choice"
  | "trajectory_membership"
  | "downstream_success_preservation"
  | "cost_accounting_trace"
  | "redteam_challenge_scope"
  | "sandboxed_execution_environment"
  | "exploit_attempt_trace"
  | "flag_submission_outcome"
  | "step_budget_termination"
  | "off_policy_evaluation_protocol"
  | "logged_dataset_trace"
  | "baseline_comparison"
  | "code_modification_trace"
  | "optimization_cycle_trace"
  | "reliability_improvement_measure"
  | "custom";

export interface QuestionScoreComponentDiagnosticRef {
  componentId: string;
  componentType: QuestionScoreComponentType;
  status: QuestionScoreComponentStatus;
  evidenceRefs: string[];
  rejectedEvidenceRefs: string[];
  repairHint: string;
}

export interface QuestionScoreCriterionDiagnosticRef {
  criterionId: string;
  criterionType: QuestionScoreCriterionType;
  status: QuestionScoreCriterionStatus;
  evidenceRefs: string[];
  rejectedEvidenceRefs: string[];
  judgeRef: string | null;
  repairHint: string;
}

export type QuestionScoreRubricCheckStatus = "pass" | "partial" | "fail" | "not_applicable";

export type QuestionScoreRubricSkillType = "atomic" | "pipeline" | "composite" | "general" | "custom";

export interface QuestionScoreRubricCheckRef {
  checkId: string;
  pillar: string;
  status: QuestionScoreRubricCheckStatus;
  weight: number;
  evidenceRefs: string[];
  rejectedEvidenceRefs: string[];
  fixHint: string;
}

export interface QuestionScoreRubricLensRef {
  rubricId: string;
  rubricVersion: string;
  rubricSource: string;
  skillType: QuestionScoreRubricSkillType;
  score0to100: number;
  grade: string;
  deepReviewCertificateHash: string | null;
  marketSignalRefs: string[];
  checks: QuestionScoreRubricCheckRef[];
}

export type QuestionScoreRagVectorSearchBackend =
  | "azure_search"
  | "cosmos_mongo"
  | "cosmos_postgresql"
  | "postgresql_flex"
  | "custom";

export interface QuestionScoreRagFlowDiagnosticRef {
  flowId: string;
  vectorSearchBackend: QuestionScoreRagVectorSearchBackend;
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
  status: QuestionScoreCriterionStatus;
  evidenceRefs: string[];
  rejectedEvidenceRefs: string[];
  repairHint: string;
}

export type QuestionScoreLandscapeCategory =
  | "ai_coding_agent"
  | "oss_ai_coding_agent"
  | "cli_tool"
  | "desktop_ide"
  | "ai_ide"
  | "ai_app_builder"
  | "mobile_app_builder"
  | "oss_ai_app_builder"
  | "ai_devtool"
  | "ai_coding_leaderboard"
  | "developer_survey"
  | "ai_coding_model"
  | "custom";

export type QuestionScoreLandscapeUpdateCadence =
  | "daily"
  | "weekly"
  | "bimonthly"
  | "monthly"
  | "quarterly"
  | "ad_hoc"
  | "unknown"
  | "custom";

export interface QuestionScoreLandscapeLensRef {
  landscapeId: string;
  sourceRef: string;
  category: QuestionScoreLandscapeCategory;
  datasetRefs: string[];
  datasetHashes: string[];
  updateCadence: QuestionScoreLandscapeUpdateCadence;
  lastVerifiedAt: string | null;
  freshnessDays: number | null;
  maxAllowedFreshnessDays: number | null;
  cohortRefs: string[];
  benchmarkRefs: string[];
  toolOrModelRefs: string[];
  status: QuestionScoreCriterionStatus;
  evidenceRefs: string[];
  rejectedEvidenceRefs: string[];
  repairHint: string;
}

export type QuestionScoreIncidentTriageDifficulty = "easy" | "medium" | "hard" | "custom";
export type QuestionScoreIncidentTriageSeverity = "p0" | "p1" | "p2" | "custom";

export interface QuestionScoreIncidentTriageLensRef {
  environmentId: string;
  sourceRef: string;
  taskId: string;
  scenarioId: string;
  difficulty: QuestionScoreIncidentTriageDifficulty;
  severity: QuestionScoreIncidentTriageSeverity;
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
  status: QuestionScoreCriterionStatus;
  evidenceRefs: string[];
  rejectedEvidenceRefs: string[];
  repairHint: string;
  rowHash: string;
}

export type QuestionScoreBenchmarkGradingType = "automated" | "llm_judge" | "hybrid" | "human" | "custom";
export type QuestionScoreBenchmarkTaskStatus = "success" | "warning" | "timeout" | "failed" | "custom";
export type QuestionScoreBenchmarkMetricView = "success_rate" | "speed" | "cost" | "category" | "custom";

export interface QuestionScoreBenchmarkCriterionRef {
  criterionId: string;
  criterionType: QuestionScoreCriterionType;
  score0to1: number | null;
  weight: number;
  status: QuestionScoreCriterionStatus;
  gradingType: QuestionScoreBenchmarkGradingType;
  evidenceRefs: string[];
  rejectedEvidenceRefs: string[];
  repairHint: string;
}

export interface QuestionScoreBenchmarkSubmissionLensRef {
  benchmarkId: string;
  sourceRef: string;
  submissionId: string;
  submissionVersion: string | null;
  agentVersion: string | null;
  submittedAt: string | null;
  taskId: string;
  taskCategory: string;
  taskStatus: QuestionScoreBenchmarkTaskStatus;
  gradingType: QuestionScoreBenchmarkGradingType;
  overallScore0to100: number | null;
  categoryScore0to100: number | null;
  speedMs: number | null;
  costUsd: number | null;
  leaderboardMetricViews: QuestionScoreBenchmarkMetricView[];
  submissionMetadataHash: string | null;
  taskBreakdownHash: string | null;
  leaderboardSnapshotHash: string | null;
  criterionScores: QuestionScoreBenchmarkCriterionRef[];
  status: QuestionScoreCriterionStatus;
  evidenceRefs: string[];
  rejectedEvidenceRefs: string[];
  repairHint: string;
  rowHash: string;
}

export type QuestionScoreTestSuiteLanguage = "java" | "kotlin" | "python" | "typescript" | "custom";
export type QuestionScoreTestSuiteFramework = "junit" | "pytest" | "vitest" | "jest" | "custom";
export type QuestionScoreTestSuiteAdapter =
  | "spring_ai"
  | "spring_ai_alibaba"
  | "langchain4j"
  | "koog"
  | "embabel"
  | "generic_llm_client"
  | "custom";

export interface QuestionScoreTestSuiteEvaluationLensRef {
  suiteId: string;
  sourceRef: string;
  language: QuestionScoreTestSuiteLanguage;
  testFramework: QuestionScoreTestSuiteFramework;
  adapter: QuestionScoreTestSuiteAdapter;
  datasetRef: string;
  datasetHash: string | null;
  testCaseId: string;
  testCaseHash: string | null;
  evaluatorIds: string[];
  evaluatorConfigHash: string | null;
  judgeModelRef: string | null;
  experimentRunId: string | null;
  experimentResultHash: string | null;
  exportArtifactHash: string | null;
  ciRunId: string | null;
  ciConfigHash: string | null;
  traceArtifactHash: string | null;
  toolCallValidationHash: string | null;
  agentBehaviorEvaluation: boolean;
  passRate0to1: number | null;
  minPassRate0to1: number | null;
  averageScore0to1: number | null;
  threshold0to1: number | null;
  costUsd: number | null;
  latencyMs: number | null;
  tokenCount: number | null;
  status: QuestionScoreCriterionStatus;
  evidenceRefs: string[];
  rejectedEvidenceRefs: string[];
  repairHint: string;
  rowHash: string;
}

export type QuestionScoreEvalAiLibraryMetricFamily = "rag" | "agent" | "security" | "mixed" | "custom";

export interface QuestionScoreEvalAiLibraryQuestionLensRef {
  frameworkId: string;
  sourceRef: string;
  repositoryRef: string;
  licenseRef: string | null;
  licenseSpdxId: string | null;
  defaultBranch: string;
  sourceCommitSha: string | null;
  sourceTreeSha: string | null;
  sourceStatusHash: string | null;
  readmeArtifactHash: string | null;
  licenseArtifactHash: string | null;
  noticeArtifactHash: string | null;
  pyprojectArtifactHash: string | null;
  requirementsArtifactHash: string | null;
  evalLibTreeHash: string | null;
  metricsTreeHash: string | null;
  agentMetricsTreeHash: string | null;
  securityMetricsTreeHash: string | null;
  tracingTreeHash: string | null;
  dashboardArtifactHash: string | null;
  evaluationSchemaHash: string | null;
  testcasesSchemaHash: string | null;
  metricPatternHash: string | null;
  llmClientHash: string | null;
  evalPackManifestHash: string | null;
  datasetManifestHash: string | null;
  questionSetHash: string | null;
  questionTraceHash: string | null;
  evaluatorConfigHash: string | null;
  metricResultHash: string | null;
  scoreBreakdownHash: string | null;
  acceptedEvidenceLedgerHash: string | null;
  rejectedEvidenceLedgerHash: string | null;
  repairHintHash: string | null;
  regressionThresholdHash: string | null;
  ciRunId: string | null;
  ciConfigHash: string | null;
  noSourceCopyBoundaryHash: string | null;
  metricFamily: QuestionScoreEvalAiLibraryMetricFamily;
  metricIds: string[];
  providerCount: number | null;
  minProviderCount: number | null;
  metricCount: number | null;
  minMetricCount: number | null;
  questionCount: number | null;
  minQuestionCount: number | null;
  evidenceCoverage0to1: number | null;
  minEvidenceCoverage0to1: number | null;
  rejectedEvidenceReasonCoverage0to1: number | null;
  minRejectedEvidenceReasonCoverage0to1: number | null;
  repairHintCoverage0to1: number | null;
  minRepairHintCoverage0to1: number | null;
  regressionPassRate0to1: number | null;
  minRegressionPassRate0to1: number | null;
  scoreConfidence0to1: number | null;
  minScoreConfidence0to1: number | null;
  status: QuestionScoreCriterionStatus;
  evidenceRefs: string[];
  rejectedEvidenceRefs: string[];
  repairHint: string;
  rowHash: string;
}

export type QuestionScoreOpenModelRagRuntime =
  | "ollama_langchain4j"
  | "ollama"
  | "langchain4j"
  | "local_jvm"
  | "mixed"
  | "custom";

export interface QuestionScoreOpenModelRagQuestionLensRef {
  frameworkId: string;
  sourceRef: string;
  repositoryRef: string;
  licenseRef: string | null;
  licenseSpdxId: string | null;
  licenseBoundaryHash: string | null;
  defaultBranch: string;
  sourceCommitSha: string | null;
  sourceTreeSha: string | null;
  sourceStatusHash: string | null;
  readmeArtifactHash: string | null;
  javaSourceTreeHash: string | null;
  buildConfigHash: string | null;
  dependencyManifestHash: string | null;
  langChain4jIntegrationHash: string | null;
  ollamaRuntimeConfigHash: string | null;
  ragPipelineHash: string | null;
  ragCorpusManifestHash: string | null;
  embeddingConfigHash: string | null;
  retrievalTraceHash: string | null;
  evaluationManifestHash: string | null;
  questionSetHash: string | null;
  questionTraceHash: string | null;
  evaluatorConfigHash: string | null;
  metricResultHash: string | null;
  scoreBreakdownHash: string | null;
  rejectedEvidenceLedgerHash: string | null;
  repairHintHash: string | null;
  regressionThresholdHash: string | null;
  ciRunId: string | null;
  ciConfigHash: string | null;
  noSourceCopyBoundaryHash: string | null;
  runtime: QuestionScoreOpenModelRagRuntime;
  openModelIds: string[];
  evaluationMetricIds: string[];
  ragQueryCount: number | null;
  minRagQueryCount: number | null;
  retrievalGroundingScore0to1: number | null;
  minRetrievalGroundingScore0to1: number | null;
  answerRelevanceScore0to1: number | null;
  minAnswerRelevanceScore0to1: number | null;
  evidenceCoverage0to1: number | null;
  minEvidenceCoverage0to1: number | null;
  rejectedEvidenceReasonCoverage0to1: number | null;
  minRejectedEvidenceReasonCoverage0to1: number | null;
  repairHintCoverage0to1: number | null;
  minRepairHintCoverage0to1: number | null;
  regressionPassRate0to1: number | null;
  minRegressionPassRate0to1: number | null;
  status: QuestionScoreCriterionStatus;
  evidenceRefs: string[];
  rejectedEvidenceRefs: string[];
  repairHint: string;
  rowHash: string;
}

export type QuestionScoreOpikEvaluationMetricFamily =
  | "trace_observability"
  | "offline_experiment"
  | "online_evaluation"
  | "dataset_evaluation"
  | "llm_judge"
  | "custom";

export interface QuestionScoreOpikEvaluationQuestionLensRef {
  lensId: string;
  sourceRef: string;
  productUrl: string;
  liveRelevanceCheckHash: string | null;
  projectRef: string | null;
  experimentRef: string | null;
  datasetManifestHash: string | null;
  traceExportHash: string | null;
  evalPackManifestHash: string | null;
  questionSetHash: string | null;
  questionIdRef: string;
  questionTraceHash: string | null;
  evaluatorConfigHash: string | null;
  metricResultHash: string | null;
  scoreBreakdownHash: string | null;
  acceptedEvidenceLedgerHash: string | null;
  rejectedEvidenceLedgerHash: string | null;
  repairHintHash: string | null;
  thresholdPolicyHash: string | null;
  signedEvidenceRowsHash: string | null;
  ciRunId: string | null;
  ciConfigHash: string | null;
  noParityClaimHash: string | null;
  noSourceCopyBoundaryHash: string | null;
  metricFamily: QuestionScoreOpikEvaluationMetricFamily;
  metricIds: string[];
  traceCount: number | null;
  minTraceCount: number | null;
  questionCount: number | null;
  minQuestionCount: number | null;
  evidenceCoverage0to1: number | null;
  minEvidenceCoverage0to1: number | null;
  rejectedEvidenceReasonCoverage0to1: number | null;
  minRejectedEvidenceReasonCoverage0to1: number | null;
  repairHintCoverage0to1: number | null;
  minRepairHintCoverage0to1: number | null;
  thresholdPassRate0to1: number | null;
  minThresholdPassRate0to1: number | null;
  scoreConfidence0to1: number | null;
  minScoreConfidence0to1: number | null;
  status: QuestionScoreCriterionStatus;
  evidenceRefs: string[];
  rejectedEvidenceRefs: string[];
  repairHint: string;
  rowHash: string;
}

export type QuestionScoreDeepEvalMetricFamily =
  | "llm_evaluation"
  | "dataset_evaluation"
  | "test_case_evaluation"
  | "red_teaming"
  | "observability"
  | "custom";

export interface QuestionScoreDeepEvalQuestionLensRef {
  lensId: string;
  sourceRef: string;
  productUrl: string;
  liveSourceMetadataHash: string | null;
  evalPackManifestHash: string | null;
  datasetManifestHash: string | null;
  testCaseManifestHash: string | null;
  questionSetHash: string | null;
  questionIdRef: string;
  questionTraceHash: string | null;
  evaluatorConfigHash: string | null;
  metricResultHash: string | null;
  scoreBreakdownHash: string | null;
  acceptedEvidenceLedgerHash: string | null;
  rejectedEvidenceLedgerHash: string | null;
  repairHintHash: string | null;
  thresholdPolicyHash: string | null;
  signedEvidenceRowsHash: string | null;
  ciRunId: string | null;
  ciConfigHash: string | null;
  noDeepEvalSubsystemHash: string | null;
  noSdkImporterHash: string | null;
  noParityClaimHash: string | null;
  noSourceCopyBoundaryHash: string | null;
  metricFamily: QuestionScoreDeepEvalMetricFamily;
  metricIds: string[];
  testCaseCount: number | null;
  minTestCaseCount: number | null;
  questionCount: number | null;
  minQuestionCount: number | null;
  evidenceCoverage0to1: number | null;
  minEvidenceCoverage0to1: number | null;
  rejectedEvidenceReasonCoverage0to1: number | null;
  minRejectedEvidenceReasonCoverage0to1: number | null;
  repairHintCoverage0to1: number | null;
  minRepairHintCoverage0to1: number | null;
  thresholdPassRate0to1: number | null;
  minThresholdPassRate0to1: number | null;
  scoreConfidence0to1: number | null;
  minScoreConfidence0to1: number | null;
  status: QuestionScoreCriterionStatus;
  evidenceRefs: string[];
  rejectedEvidenceRefs: string[];
  repairHint: string;
  rowHash: string;
}

export type QuestionScoreAgentTrialAdapter =
  | "langgraph"
  | "crewai"
  | "autogen"
  | "pydantic_ai"
  | "openai_agents_sdk"
  | "smolagents"
  | "custom";

export interface QuestionScoreAgentTrialStatisticalLensRef {
  suiteId: string;
  sourceRef: string;
  packageRef: string | null;
  adapter: QuestionScoreAgentTrialAdapter;
  caseId: string;
  caseName: string;
  suiteManifestHash: string | null;
  caseManifestHash: string | null;
  runManifestHash: string | null;
  trialManifestHash: string | null;
  statisticalReportHash: string | null;
  trajectoryBundleHash: string | null;
  failureAttributionHash: string | null;
  baselineResultHash: string | null;
  candidateResultHash: string | null;
  ciConfigHash: string | null;
  dashboardSnapshotHash: string | null;
  ciRunId: string | null;
  trialCount: number | null;
  minTrialCount: number | null;
  passCount: number | null;
  passRate0to1: number | null;
  minPassRate0to1: number | null;
  wilsonConfidenceLevel: number | null;
  wilsonLower0to1: number | null;
  minWilsonLower0to1: number | null;
  wilsonUpper0to1: number | null;
  bootstrapCostMeanUsd: number | null;
  maxCostMeanUsd: number | null;
  bootstrapLatencyMeanMs: number | null;
  maxLatencyMeanMs: number | null;
  agentReliabilityScore0to1: number | null;
  minAgentReliabilityScore0to1: number | null;
  failureAttributionStepId: string | null;
  failureAttributionPValue: number | null;
  maxFailureAttributionPValue: number | null;
  regressionTestName: string | null;
  regressionPValue: number | null;
  minRegressionPValue: number | null;
  status: QuestionScoreCriterionStatus;
  evidenceRefs: string[];
  rejectedEvidenceRefs: string[];
  repairHint: string;
  rowHash: string;
}

export type QuestionScoreCodeQuestLanguage =
  | "python"
  | "java"
  | "javascript"
  | "typescript"
  | "go"
  | "mixed"
  | "custom";

export type QuestionScoreCodeQuestDimensionStatus =
  | "improved"
  | "unchanged"
  | "regressed"
  | "not_evaluated"
  | "custom";

export interface QuestionScoreCodeQuestQualityDimensionRef {
  dimensionId: string;
  dimensionLabel: string;
  baselineScore0to1: number | null;
  candidateScore0to1: number | null;
  scoreDelta0to1: number | null;
  minScoreDelta0to1: number | null;
  status: QuestionScoreCodeQuestDimensionStatus;
  evidenceRefs: string[];
  rejectedEvidenceRefs: string[];
  repairHint: string;
  rowHash: string;
}

export interface QuestionScoreCodeQuestQualityLensRef {
  frameworkId: string;
  sourceRef: string;
  repositoryRef: string;
  licenseRef: string | null;
  sourceStatusHash: string | null;
  archivedSource: boolean;
  taskId: string;
  language: QuestionScoreCodeQuestLanguage;
  codeArtifactHash: string | null;
  evaluatorPromptHash: string | null;
  evaluatorConfigHash: string | null;
  optimizerPromptHash: string | null;
  optimizerConfigHash: string | null;
  baselineEvaluationHash: string | null;
  candidateEvaluationHash: string | null;
  evaluatorFeedbackHash: string | null;
  optimizerGroundingHash: string | null;
  improvementPatchHash: string | null;
  actorCriticLoopTraceHash: string | null;
  regressionSuiteHash: string | null;
  replayCommandHash: string | null;
  ciRunId: string | null;
  ciConfigHash: string | null;
  noSourceCopyBoundaryHash: string | null;
  dimensionCount: number | null;
  minDimensionCount: number | null;
  baselineOverallScore0to1: number | null;
  candidateOverallScore0to1: number | null;
  overallScoreDelta0to1: number | null;
  minOverallScoreDelta0to1: number | null;
  dimensionRegressionCount: number | null;
  maxDimensionRegressionCount: number | null;
  evaluatorFeedbackCoverage0to1: number | null;
  minEvaluatorFeedbackCoverage0to1: number | null;
  optimizerGroundingCoverage0to1: number | null;
  minOptimizerGroundingCoverage0to1: number | null;
  dimensions: QuestionScoreCodeQuestQualityDimensionRef[];
  status: QuestionScoreCriterionStatus;
  evidenceRefs: string[];
  rejectedEvidenceRefs: string[];
  repairHint: string;
  rowHash: string;
}

export type QuestionScoreMultiUserScenarioFamily =
  | "access_control"
  | "meeting_scheduling"
  | "shared_queue"
  | "multiuser_instruction_following"
  | "custom";

export type QuestionScoreMultiUserCapability =
  | "privacy_access_control"
  | "sequential_coordination"
  | "resource_optimization"
  | "instruction_following"
  | "custom";

export interface QuestionScoreMultiUserBenchmarkLensRef {
  benchmarkId: string;
  sourceRef: string;
  scenarioId: string;
  scenarioFamily: QuestionScoreMultiUserScenarioFamily;
  capability: QuestionScoreMultiUserCapability;
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
  status: QuestionScoreCriterionStatus;
  evidenceRefs: string[];
  rejectedEvidenceRefs: string[];
  repairHint: string;
  rowHash: string;
}

export type QuestionScoreProfessionalTaskEnvironmentMode = "E0" | "E1" | "E2" | "E3" | "custom";
export type QuestionScoreProfessionalTaskFaultMode = "none" | "explicit" | "implicit" | "mixed" | "custom";

export interface QuestionScoreProfessionalTaskLensRef {
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
  environmentMode: QuestionScoreProfessionalTaskEnvironmentMode;
  faultMode: QuestionScoreProfessionalTaskFaultMode;
  verifierVoteCount: number | null;
  minVerifierVoteCount: number | null;
  passRate0to1: number | null;
  minPassRate0to1: number | null;
  robustnessScore0to1: number | null;
  minRobustnessScore0to1: number | null;
  trajectoryStepCount: number | null;
  maxTrajectoryStepCount: number | null;
  status: QuestionScoreCriterionStatus;
  evidenceRefs: string[];
  rejectedEvidenceRefs: string[];
  repairHint: string;
  rowHash: string;
}

export type QuestionScoreIotFirmwarePlatform = "nrf" | "esp" | "zephyr" | "esp_idf" | "mixed" | "custom";

export interface QuestionScoreIotFirmwareQuestionLensRef {
  benchmarkId: string;
  sourceRef: string;
  taskId: string;
  platform: QuestionScoreIotFirmwarePlatform;
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
  status: QuestionScoreCriterionStatus;
  evidenceRefs: string[];
  rejectedEvidenceRefs: string[];
  repairHint: string;
  rowHash: string;
}

export type QuestionScoreRetailSalesChannel = "cli" | "web" | "api" | "mixed" | "custom";

export interface QuestionScoreRetailSalesQuestionLensRef {
  benchmarkId: string;
  sourceRef: string;
  taskId: string;
  salesChannel: QuestionScoreRetailSalesChannel;
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
  status: QuestionScoreCriterionStatus;
  evidenceRefs: string[];
  rejectedEvidenceRefs: string[];
  repairHint: string;
  rowHash: string;
}

export interface QuestionScoreContinualLearningBenchmarkLensRef {
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
  status: QuestionScoreCriterionStatus;
  evidenceRefs: string[];
  rejectedEvidenceRefs: string[];
  repairHint: string;
  rowHash: string;
}

export type QuestionScoreHermesTurboPerformanceFacet =
  | "startup_latency"
  | "runtime_throughput"
  | "score_dashboard"
  | "mixed"
  | "custom";

export interface QuestionScoreHermesTurboPerformanceLensRef {
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
  performanceFacet: QuestionScoreHermesTurboPerformanceFacet;
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
  status: QuestionScoreCriterionStatus;
  evidenceRefs: string[];
  rejectedEvidenceRefs: string[];
  repairHint: string;
  rowHash: string;
}

export type QuestionScoreScorableStudioSurface =
  | "python_sdk"
  | "typescript_sdk"
  | "cli"
  | "studio_api"
  | "otel_trace"
  | "execution_log"
  | "file_artifact"
  | "custom";

export type QuestionScoreScorableEvidencePreviewState = "ready" | "empty" | "error" | "custom";

export type QuestionScoreObsStudioSourceKind = "paper" | "repository" | "product" | "custom";

export type QuestionScoreObsStudioEvidencePreviewState = "ready" | "empty" | "error" | "custom";

export interface QuestionScoreObsStudioDrilldownLensRef {
  drilldownId: string;
  sourceRef: string;
  sourceKind: QuestionScoreObsStudioSourceKind;
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
  evidencePreviewState: QuestionScoreObsStudioEvidencePreviewState;
  evidencePreviewCount: number | null;
  minEvidencePreviewCount: number | null;
  sourceArtifactLinkCount: number | null;
  minSourceArtifactLinkCount: number | null;
  status: QuestionScoreCriterionStatus;
  evidenceRefs: string[];
  rejectedEvidenceRefs: string[];
  repairHint: string;
  rowHash: string;
}

export interface QuestionScoreScorableStudioDrilldownLensRef {
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
  studioSurface: QuestionScoreScorableStudioSurface;
  uiRoutePath: string;
  sourceArtifactLinks: string[];
  tracePreviewHash: string | null;
  receiptPreviewHash: string | null;
  policyRulePreviewHash: string | null;
  sourceArtifactPreviewHash: string | null;
  emptyStateHash: string | null;
  errorStateHash: string | null;
  evidencePreviewState: QuestionScoreScorableEvidencePreviewState;
  evidencePreviewCount: number | null;
  minEvidencePreviewCount: number | null;
  sourceArtifactLinkCount: number | null;
  minSourceArtifactLinkCount: number | null;
  status: QuestionScoreCriterionStatus;
  evidenceRefs: string[];
  rejectedEvidenceRefs: string[];
  repairHint: string;
  rowHash: string;
}

export interface QuestionScoreEvidenceWindow {
  eventCount: number;
  distinctSessionCount: number;
  firstTs: number | null;
  lastTs: number | null;
  durationMs: number;
}

export interface QuestionScoreExplainabilityRow {
  questionId: string;
  title: string;
  surfaces: AMCSurfaceName[];
  claimedLevel: number;
  supportedMaxLevel: number;
  finalLevel: number;
  status: QuestionScoreExplainabilityStatus;
  evidenceWindow: QuestionScoreEvidenceWindow;
  acceptedEvidenceIds: string[];
  signedEvidenceRefs: QuestionScoreSignedEvidenceRef[];
  rejectedEvidence: QuestionScoreRejectedEvidenceRef[];
  componentDiagnostics: QuestionScoreComponentDiagnosticRef[];
  criteriaDiagnostics: QuestionScoreCriterionDiagnosticRef[];
  rubricLens: QuestionScoreRubricLensRef[];
  ragFlowDiagnostics: QuestionScoreRagFlowDiagnosticRef[];
  landscapeLens: QuestionScoreLandscapeLensRef[];
  incidentTriageLens: QuestionScoreIncidentTriageLensRef[];
  benchmarkSubmissionLens: QuestionScoreBenchmarkSubmissionLensRef[];
  testSuiteEvaluationLens: QuestionScoreTestSuiteEvaluationLensRef[];
  evalAiLibraryQuestionLens: QuestionScoreEvalAiLibraryQuestionLensRef[];
  openModelRagQuestionLens: QuestionScoreOpenModelRagQuestionLensRef[];
  opikEvaluationQuestionLens: QuestionScoreOpikEvaluationQuestionLensRef[];
  deepEvalQuestionLens: QuestionScoreDeepEvalQuestionLensRef[];
  statisticalAgentTrialLens: QuestionScoreAgentTrialStatisticalLensRef[];
  codeQuestQualityLens: QuestionScoreCodeQuestQualityLensRef[];
  multiUserBenchmarkLens: QuestionScoreMultiUserBenchmarkLensRef[];
  professionalTaskLens: QuestionScoreProfessionalTaskLensRef[];
  iotFirmwareQuestionLens: QuestionScoreIotFirmwareQuestionLensRef[];
  retailSalesQuestionLens: QuestionScoreRetailSalesQuestionLensRef[];
  continualLearningBenchmarkLens: QuestionScoreContinualLearningBenchmarkLensRef[];
  hermesTurboPerformanceLens: QuestionScoreHermesTurboPerformanceLensRef[];
  scorableStudioDrilldownLens: QuestionScoreScorableStudioDrilldownLensRef[];
  obsStudioDrilldownLens?: QuestionScoreObsStudioDrilldownLensRef[];
  missingGateReasons: string[];
  repairHint: string;
  scoreReceiptRef: string;
  rowHash: string;
}

export interface QuestionScoreExplainabilityReport {
  generatedAt: string;
  agentId: string;
  runId: string;
  sourceRefs: string[];
  replayable: boolean;
  failClosed: boolean;
  rows: QuestionScoreExplainabilityRow[];
  manifestHash: string;
}

export interface QuestionConfidenceControls {
  evidenceSufficiency: number;
  contradictionRisk: number;
  judgeAgreement: number;
  decisivenessRisk: number;
  uncertaintyLevel: "low" | "medium" | "high";
  presentationStatus: "verified" | "downgraded" | "needs_review";
  downgradeReason: string | null;
  autoFixAllowed: boolean;
}

export interface RecommendationConfidenceControl {
  questionId: string;
  action: string;
  confidence: number;
  uncertaintyLevel: QuestionConfidenceControls["uncertaintyLevel"];
  autoFixAllowed: boolean;
  reason: string;
}

export interface DiagnosticConfidenceSummary {
  lowConfidenceFindings: number;
  highUncertaintyFindings: number;
  downgradedFindings: number;
  autoFixBlockedRecommendations: number;
  averageEvidenceSufficiency: number;
  averageJudgeAgreement: number;
}

export interface LayerScore {
  layerName: LayerName;
  avgFinalLevel: number;
  confidenceWeightedFinalLevel: number;
}

export interface DiagnosticMethodologyManifest {
  id: string;
  version: string;
  releaseDate: string;
  status: "public";
  amcVersion: string;
  methodologyDoc: string;
  publicUrl: string;
  defaultQuestionSetVersion: string;
  questionSet: {
    version: string;
    title: string;
    questionCount: number;
    includedVersions: string[];
    default: boolean;
  };
  hash: string;
  versioningAssuranceHash?: string;
}

export interface DiagnosticMethodologyVersioningReceipt {
  schemaVersion: 1;
  id: string;
  generatedAt: string;
  status: "ready" | "fail_closed";
  sourceRef: string;
  sourceKind: "metronous_local_telemetry_benchmark_calibration" | "methodology_versioning_assurance_bundle";
  methodology: {
    id: string;
    version: string;
    releaseDate: string;
    hash: string;
    questionSetVersion: string;
    versioningAssuranceHash: string;
  };
  requiredAuditFields: string[];
  presentAuditFields: string[];
  missingAuditFields: string[];
  badgeQueryParams: string[];
  diagnosticFields: string[];
  telemetryCalibrationProof: {
    telemetrySchemaRequired: true;
    benchmarkCorpusRequired: true;
    thresholdPolicyRequired: true;
    modelCalibrationReportRequired: true;
    costAccountingRequired: true;
    exportSanitizationRequired: true;
    localArchiveBoundaryRequired: true;
    sourceMetadataOnlyRejected: true;
    noCopyBoundary: string;
  };
  batchMethodologyProof?: {
    sourceRepositorySnapshotRequired: true;
    licenseBoundaryRequired: true;
    functionDefinitionRequired: true;
    judgeClassifierExtractorSchemaRequired: true;
    inputDataSourceRequired: true;
    inputOrderPreservationRequired: true;
    batchPriorityPolicyRequired: true;
    dryRunCostEstimateRequired: true;
    modelPoolRequired: true;
    observabilityTraceSchemaRequired: true;
    resultExportRequired: true;
    retentionPolicyRequired: true;
    multiModelComparisonRequired: true;
    embeddingJobRequired: true;
    sourceMetadataOnlyRejected: true;
    noCopyBoundary: string;
  };
  agentBeltMethodologyProof?: {
    sourceRepositorySnapshotRequired: true;
    licenseBoundaryRequired: true;
    releaseTagRequired: true;
    readmeDocsRequired: true;
    scenarioSchemaRequired: true;
    scenarioManifestRequired: true;
    agentAdapterRosterRequired: true;
    customAgentContractRequired: true;
    workspaceDiffCheckRequired: true;
    ruleCheckPolicyRequired: true;
    multiJudgeConsensusRequired: true;
    perTurnJudgeConfigRequired: true;
    passKReliabilityRequired: true;
    passPowerKReliabilityRequired: true;
    worktreeIsolationRequired: true;
    dockerSandboxRequired: true;
    exportFormatRequired: true;
    ciWorkflowRequired: true;
    packageReleaseDigestRequired: true;
    sourceMetadataOnlyRejected: true;
    noCopyBoundary: string;
  };
  evidenceRefs: string[];
  rejectedEvidenceRefs: string[];
  failClosedReasons: string[];
  warnings: string[];
  receiptHash: string;
}

export interface MetricValidationConfidenceInterval {
  level: number;
  lower: number;
  upper: number;
  marginOfError: number;
}

export type MetricValidationRagEvaluationPipelineSignal =
  | "ground_truth_questions"
  | "ground_truth_answers"
  | "rag_pipeline_config"
  | "document_corpus"
  | "metric_definition"
  | "query_result_trace"
  | "retrieval_trace"
  | "generation_trace"
  | "evaluator_config"
  | "evaluation_report"
  | "metric_owner"
  | "sample_size_confidence_interval";

export type MetricValidationRagasNotebookSignal =
  | "source_repository_boundary"
  | "notebook_manifest"
  | "dependency_manifest"
  | "document_corpus"
  | "chunking_config"
  | "testset_generator_config"
  | "evolution_mix"
  | "generated_testset_manifest"
  | "rag_chain_config"
  | "retriever_vectorstore_config"
  | "model_embedding_config"
  | "answer_context_trace"
  | "ragas_metric_suite"
  | "ragas_evaluation_result"
  | "langfuse_trace_score_export"
  | "visualization_artifact"
  | "metric_owner"
  | "sample_size_confidence_interval";

export type MetricValidationMirageRagSignal =
  | "benchmark_identity"
  | "dataset_manifest"
  | "qa_pair_manifest"
  | "context_pool_manifest"
  | "retrieval_pool_manifest"
  | "base_oracle_mixed_protocol"
  | "retriever_config"
  | "model_config"
  | "llm_result_report"
  | "retriever_result_report"
  | "mirage_metrics_report"
  | "overall_score_formula"
  | "metric_owner"
  | "sample_size_confidence_interval";

export type MetricValidationLegalCodeRagSignal =
  | "legal_corpus_manifest"
  | "legifrance_source_boundary"
  | "retriever_config"
  | "vector_database_config"
  | "embedding_model_config"
  | "windowing_config"
  | "hybrid_search_config"
  | "query_rewrite_config"
  | "routing_policy_config"
  | "evaluation_dataset"
  | "reference_answer_manifest"
  | "metric_definition"
  | "evaluator_config"
  | "evaluation_report"
  | "metric_owner"
  | "sample_size_confidence_interval";

export type MetricValidationGuardbenchSignal =
  | "benchmark_identity"
  | "dataset_manifest"
  | "dataset_access_policy"
  | "standardized_format"
  | "moderation_function_contract"
  | "guardrail_model_config"
  | "threshold_config"
  | "prediction_score_manifest"
  | "metric_suite_report"
  | "confusion_matrix_report"
  | "language_coverage"
  | "leaderboard_or_export_report"
  | "metric_owner"
  | "sample_size_confidence_interval";

export type MetricValidationArchitectureRealitySignal =
  | "wrapper_agent_baseline"
  | "marketing_agent_baseline"
  | "real_agent_baseline"
  | "planning_hierarchy"
  | "memory_context_retention"
  | "recovery_strategy"
  | "stress_tool_failure"
  | "network_resilience"
  | "cost_per_success"
  | "ensemble_coordination"
  | "statistical_confidence";

export type MetricValidationContinualLearningSignal =
  | "task_sequence_version"
  | "dataset_version"
  | "retention_score"
  | "adaptation_score"
  | "forgetting_rate"
  | "environment_config"
  | "controller_log"
  | "longitudinal_run_trace"
  | "game_build_config"
  | "mod_manifest"
  | "llm_config"
  | "prompt_language"
  | "memory_artifact"
  | "conversation_log"
  | "run_summary_json"
  | "gameplay_log"
  | "decision_trace"
  | "run_outcome_metric"
  | "improvement_trend"
  | "fallback_mode_control"
  | "sample_size_confidence_interval";

export type MetricValidationEmbodiedAgentSignal =
  | "task_type_coverage"
  | "simulator_environment_config"
  | "scene_dataset_package"
  | "random_baseline"
  | "human_baseline"
  | "model_baseline"
  | "action_observation_trajectory"
  | "result_folder"
  | "overall_metric_report"
  | "task_type_metric_report"
  | "metric_owner"
  | "sample_size_confidence_interval";

export type MetricValidationEvaluatorSuiteSignal =
  | "deterministic_assertion"
  | "llm_judge_criterion"
  | "safety_assertion"
  | "red_team_attack"
  | "dataset_eval_manifest"
  | "custom_judge_definition"
  | "reporter_output"
  | "framework_integration"
  | "threshold_config"
  | "metric_owner"
  | "sample_size_confidence_interval";

export type MetricValidationPentestBenchmarkSignal =
  | "source_repository_license"
  | "benchmark_release_manifest"
  | "task_id_manifest"
  | "target_image_manifest"
  | "runtime_controller_manifest"
  | "firewall_isolation_config"
  | "llm_proxy_config"
  | "smart_contract_dataset_manifest"
  | "historical_fork_manifest"
  | "problem_metadata_manifest"
  | "flaw_verifier_contract_manifest"
  | "forge_grader_result"
  | "profit_threshold_metric"
  | "anti_cheat_reset_proof"
  | "dataset_cutoff_split"
  | "dockerized_app_manifest"
  | "language_stack_coverage"
  | "vulnerability_class_coverage"
  | "difficulty_distribution"
  | "multi_step_chain_coverage"
  | "flag_ground_truth"
  | "threat_model_ground_truth"
  | "false_positive_trap"
  | "security_control_effectiveness"
  | "exploit_execution_trace"
  | "exploit_success_metric"
  | "threat_model_report"
  | "metric_owner"
  | "sample_size_confidence_interval";

export type MetricValidationTraceEvaluationSignal =
  | "bedrock_converse_model_config"
  | "agent_parameter_manifest"
  | "tool_registry_manifest"
  | "trace_manifest"
  | "repeatable_case_manifest"
  | "dynamic_expectation_validator"
  | "bulk_case_run_manifest"
  | "run_permutation_manifest"
  | "mock_llm_backend_control"
  | "metric_definition_manifest"
  | "measurement_export_manifest"
  | "production_monitor_binding"
  | "threshold_alarm_config"
  | "metric_owner"
  | "sample_size_confidence_interval";

export type MetricValidationLivingEnvironmentSignal =
  | "task_program_manifest"
  | "living_environment_manifest"
  | "environment_mutation_trace"
  | "capability_manifest"
  | "sandbox_provider_config"
  | "agent_adapter_manifest"
  | "multi_turn_trajectory"
  | "stage_checker_manifest"
  | "checker_result_artifact"
  | "trial_result_artifact"
  | "aggregate_metric_report"
  | "pass_at_k_metric"
  | "proactive_trigger_trace"
  | "metric_owner"
  | "sample_size_confidence_interval";

export type MetricValidationMobileAgentSignal =
  | "benchmark_manifest"
  | "paper_or_source_reference"
  | "mobile_environment_manifest"
  | "app_inventory_manifest"
  | "api_catalog_manifest"
  | "ui_automation_trace"
  | "task_dataset_manifest"
  | "task_complexity_manifest"
  | "multi_app_task_manifest"
  | "checkpoint_metric_rubric"
  | "checkpoint_result_artifact"
  | "environment_reset_policy"
  | "device_state_fixture"
  | "result_report_artifact"
  | "dataset_license_boundary"
  | "metric_owner"
  | "sample_size_confidence_interval";

export type MetricValidationPersonaAgentSignal =
  | "persona_manifest"
  | "static_environment_manifest"
  | "benchmark_question_set"
  | "persona_agent_config"
  | "model_provider_config"
  | "response_trace"
  | "rubric_manifest"
  | "personascore_metric_definition"
  | "human_alignment_calibration"
  | "evaluation_output_artifact"
  | "benchmark_result_manifest"
  | "metric_owner"
  | "sample_size_confidence_interval";

export type MetricValidationScientificLiteratureSignal =
  | "benchmark_manifest"
  | "deep_research_task_manifest"
  | "wide_research_task_manifest"
  | "released_dataset_manifest"
  | "dataset_obfuscation_manifest"
  | "literature_corpus_manifest"
  | "search_backend_config"
  | "deepxiv_tool_config"
  | "web_search_tool_config"
  | "agent_config_manifest"
  | "inference_run_manifest"
  | "evaluation_pipeline_config"
  | "deep_search_accuracy_metric"
  | "wide_search_iou_metric"
  | "result_report_artifact"
  | "metric_owner"
  | "sample_size_confidence_interval";

export type MetricValidationBioinformaticsAgentSignal =
  | "benchmark_manifest"
  | "paper_or_source_reference"
  | "bioinformatics_task_manifest"
  | "dataset_input_manifest"
  | "truth_reference_manifest"
  | "workflow_reproduction_manifest"
  | "docker_or_environment_manifest"
  | "tool_version_manifest"
  | "agent_harness_manifest"
  | "grader_config_manifest"
  | "result_artifact_manifest"
  | "perturbation_suite_manifest"
  | "privacy_boundary_manifest"
  | "metric_owner"
  | "sample_size_confidence_interval";

export type MetricValidationMirageDrugRepositioningSignal =
  | "benchmark_identity"
  | "dataset_release_manifest"
  | "train_test_split_manifest"
  | "drug_disease_mapping_manifest"
  | "drug_feature_manifest"
  | "disease_feature_manifest"
  | "similarity_matrix_manifest"
  | "negative_sampling_protocol"
  | "classifier_config"
  | "feature_selection_report"
  | "score_calculation_manifest"
  | "evaluation_report"
  | "case_study_validation"
  | "metric_owner"
  | "sample_size_confidence_interval";

export type MetricValidationNetworkTroubleshootingSignal =
  | "benchmark_manifest"
  | "paper_or_source_reference"
  | "network_scenario_manifest"
  | "topology_tier_manifest"
  | "incident_catalog_manifest"
  | "fault_injection_manifest"
  | "session_trace_manifest"
  | "agent_interface_manifest"
  | "mcp_tool_manifest"
  | "environment_runtime_manifest"
  | "evaluation_metric_manifest"
  | "judge_config_manifest"
  | "batch_summary_artifact"
  | "root_cause_ground_truth"
  | "localization_ground_truth"
  | "traffic_workload_manifest"
  | "metric_owner"
  | "sample_size_confidence_interval";

export type MetricValidationInferenceOptimizationSignal =
  | "benchmark_manifest"
  | "paper_or_source_reference"
  | "scenario_objective_manifest"
  | "hardware_budget_manifest"
  | "server_contract_manifest"
  | "runtime_backend_manifest"
  | "search_space_manifest"
  | "baseline_comparison_manifest"
  | "quality_gate_result"
  | "integrity_gate_result"
  | "supervised_relaunch_result"
  | "latency_throughput_metrics"
  | "tail_latency_metrics"
  | "exploration_trace_manifest"
  | "metric_owner"
  | "sample_size_confidence_interval";

export type MetricValidationJavaCodingAgentSignal =
  | "benchmark_manifest"
  | "source_repository_license"
  | "java_task_manifest"
  | "yaml_benchmark_manifest"
  | "workspace_template_manifest"
  | "isolated_sandbox_manifest"
  | "provide_lifecycle_trace"
  | "setup_post_script_manifest"
  | "cli_agent_config"
  | "cascaded_jury_manifest"
  | "judge_tier_policy"
  | "maven_build_check"
  | "junit_test_result"
  | "jacoco_coverage_report"
  | "result_json_manifest"
  | "accuracy_pass_at_k_metric"
  | "metric_owner"
  | "sample_size_confidence_interval";

export type MetricValidationWebEvalDatasetSignal =
  | "benchmark_manifest"
  | "source_repository_reference"
  | "subject_manifest"
  | "generated_query_manifest"
  | "search_provider_config"
  | "retrieved_document_manifest"
  | "document_filter_manifest"
  | "qa_generation_manifest"
  | "reference_answer_manifest"
  | "dataset_export_manifest"
  | "output_target_manifest"
  | "validation_report_artifact"
  | "freshness_snapshot"
  | "provider_diversity_metric"
  | "source_coverage_metric"
  | "answer_grounding_metric"
  | "metric_owner"
  | "sample_size_confidence_interval";

export type MetricValidationParallelResearchSkillSignal =
  | "source_repository_reference"
  | "license_boundary"
  | "skill_manifest"
  | "api_surface_manifest"
  | "search_mode_manifest"
  | "deep_research_task_manifest"
  | "chat_grounding_manifest"
  | "extract_content_manifest"
  | "citation_provenance_report"
  | "source_policy_manifest"
  | "batch_execution_manifest"
  | "monitoring_manifest"
  | "security_boundary"
  | "dependency_lock"
  | "benchmark_claim_validation_report"
  | "metric_owner"
  | "sample_size_confidence_interval";

export type MetricValidationResumeRagEvaluatorSignal =
  | "source_repository_reference"
  | "license_boundary"
  | "resume_upload_manifest"
  | "resume_parser_manifest"
  | "job_description_manifest"
  | "rag_strategy_manifest"
  | "query_expansion_manifest"
  | "retrieval_config_manifest"
  | "vector_store_manifest"
  | "ollama_model_manifest"
  | "embedding_model_manifest"
  | "evaluation_endpoint_manifest"
  | "candidate_rating_report"
  | "batch_evaluation_manifest"
  | "privacy_boundary"
  | "dependency_lock"
  | "metric_owner"
  | "sample_size_confidence_interval";

export type MetricValidationChipBenchmarkSignal =
  | "source_repository_reference"
  | "license_boundary"
  | "benchmark_manifest"
  | "hardware_profile_manifest"
  | "model_family_manifest"
  | "precision_mode_manifest"
  | "environment_setup_script"
  | "benchmark_runner_script"
  | "serving_backend_script"
  | "benchmark_result_dataset"
  | "frontend_synced_dataset"
  | "pricing_dataset"
  | "throughput_metric"
  | "latency_metric"
  | "cost_metric"
  | "regression_threshold"
  | "metric_owner"
  | "sample_size_confidence_interval";

export type MetricValidationHermesBenchSignal =
  | "source_repository_license"
  | "default_branch_snapshot"
  | "readme_build_spec_manifest"
  | "backend_runner_manifest"
  | "judge_calibration_manifest"
  | "task_registry_manifest"
  | "model_server_config_manifest"
  | "adapter_coverage_manifest"
  | "result_schema_manifest"
  | "frontend_result_review_manifest"
  | "backend_regression_manifest"
  | "frontend_regression_manifest"
  | "docker_runtime_manifest"
  | "metric_owner"
  | "sample_size_confidence_interval";

export type MetricValidationCooperBenchSignal =
  | "source_repository_license_release"
  | "default_branch_snapshot"
  | "readme_changelog_manifest"
  | "dataset_task_manifest"
  | "feature_conflict_manifest"
  | "runner_coop_manifest"
  | "eval_backend_manifest"
  | "team_harness_manifest"
  | "agent_adapter_manifest"
  | "ci_workflow_manifest"
  | "package_lock_manifest"
  | "report_publication_manifest"
  | "metric_owner"
  | "sample_size_confidence_interval";

export type MetricValidationCoderCupSignal =
  | "source_repository_license_homepage"
  | "default_branch_snapshot"
  | "readme_contributing_manifest"
  | "ci_workflow_manifest"
  | "package_lock_manifest"
  | "task_spec_manifest"
  | "testsuite_manifest"
  | "runner_contract_manifest"
  | "score_ledger_manifest"
  | "live_artifact_manifest"
  | "methodology_reference_manifest"
  | "cost_accounting_manifest"
  | "metric_owner"
  | "sample_size_confidence_interval";

export type MetricValidationAgenticGraphRagSignal =
  | "source_repository_no_license"
  | "default_branch_snapshot"
  | "readme_project_manifest"
  | "graph_orchestrator_manifest"
  | "rag_pipeline_manifest"
  | "database_vector_store_manifest"
  | "evaluation_metric_manifest"
  | "experiment_tracking_manifest"
  | "ui_question_manifest"
  | "dependency_lock_manifest"
  | "metric_owner"
  | "sample_size_confidence_interval";

export type MetricValidationAgentScenarioTestSignal =
  | "benchmark_manifest"
  | "source_repository_license"
  | "agent_endpoint_contract"
  | "scenario_manifest"
  | "simulated_user_persona_manifest"
  | "goal_knowledge_manifest"
  | "tool_mock_manifest"
  | "scripted_turn_manifest"
  | "trajectory_assertion_manifest"
  | "llm_judge_metric_manifest"
  | "comparison_run_manifest"
  | "ci_reporter_manifest"
  | "result_artifact_manifest"
  | "metric_owner"
  | "sample_size_confidence_interval";

export type MetricValidationOpenCodeLabSignal =
  | "source_repository_reference"
  | "lab_benchmark_manifest"
  | "agent_context_manifest"
  | "prompt_variant_manifest"
  | "tool_description_manifest"
  | "agents_policy_manifest"
  | "repeated_run_trace"
  | "fork_agreement_report"
  | "model_variance_report"
  | "ground_truth_correction_manifest"
  | "metric_definition_manifest"
  | "ci_reporter_manifest"
  | "result_artifact_manifest"
  | "metric_owner"
  | "sample_size_confidence_interval";

export type MetricValidationCcPluginEvalSignal =
  | "source_repository_license"
  | "plugin_manifest"
  | "component_inventory"
  | "trigger_phrase_manifest"
  | "scenario_generation_manifest"
  | "scenario_type_coverage"
  | "execution_transcript_bundle"
  | "programmatic_detection_report"
  | "llm_judge_calibration"
  | "conflict_detection_report"
  | "checkpoint_resume_state"
  | "cost_estimate_report"
  | "ci_reporter_manifest"
  | "result_artifact_manifest"
  | "metric_owner"
  | "sample_size_confidence_interval";

export type MetricValidationCcPluginEvalComponentType =
  | "skill"
  | "agent"
  | "command"
  | "hook"
  | "mcp_server"
  | "custom";

export type MetricValidationCcPluginEvalScenarioType =
  | "direct"
  | "paraphrased"
  | "edge_case"
  | "negative"
  | "semantic"
  | "custom";

export type MetricValidationCcPluginEvalDetectionMode =
  | "programmatic_first"
  | "llm_only"
  | "hybrid"
  | "custom";

export type MetricValidationRealignSimulationSignal =
  | "source_repository_license"
  | "yaml_config_manifest"
  | "app_under_test_manifest"
  | "dataset_manifest"
  | "scenario_manifest"
  | "synthetic_user_persona_manifest"
  | "evaluator_registry_manifest"
  | "evaluator_target_manifest"
  | "simulation_run_trace"
  | "repeated_run_trace"
  | "judge_calibration_report"
  | "statistical_rigor_report"
  | "ci_regression_manifest"
  | "experiment_tracking_manifest"
  | "result_artifact_manifest"
  | "metric_owner"
  | "sample_size_confidence_interval";

export type MetricValidationAcademiClawSignal =
  | "source_repository_license"
  | "default_branch_snapshot"
  | "readme_citation_manifest"
  | "task_corpus_manifest"
  | "bilingual_task_manifest"
  | "workspace_query_manifest"
  | "docker_environment_manifest"
  | "evaluation_rubric_manifest"
  | "eval_task_runner_manifest"
  | "openclaw_result_manifest"
  | "conversation_trace_manifest"
  | "meta_eval_manifest"
  | "model_roster_manifest"
  | "metric_definition_manifest"
  | "ci_regression_manifest"
  | "metric_owner"
  | "sample_size_confidence_interval";

export type MetricValidationRagChunkingTechniqueSignal =
  | "source_repository_license"
  | "default_branch_snapshot"
  | "readme_manifest"
  | "policy_corpus_manifest"
  | "simple_rag_notebook_manifest"
  | "smart_chunking_notebook_manifest"
  | "rag_evaluation_notebook_manifest"
  | "chunking_strategy_manifest"
  | "retrieval_pipeline_manifest"
  | "embedding_vectorstore_manifest"
  | "evaluation_dataset_manifest"
  | "metric_definition_manifest"
  | "ci_regression_manifest"
  | "metric_owner"
  | "sample_size_confidence_interval";

export type MetricValidationKubernetesOperationalAgentSignal =
  | "source_repository_license"
  | "default_branch_snapshot"
  | "readme_manifest"
  | "release_asset_manifest"
  | "build_workflow_manifest"
  | "agent_module_manifest"
  | "mcp_server_manifest"
  | "kubernetes_tool_inventory"
  | "diagnostic_capability_manifest"
  | "resource_monitoring_manifest"
  | "log_analysis_manifest"
  | "metric_definition_manifest"
  | "ci_regression_manifest"
  | "metric_owner"
  | "sample_size_confidence_interval";

export type MetricValidationSecureVibeBenchSignal =
  | "source_repository_license_homepage"
  | "default_branch_snapshot"
  | "readme_manifest"
  | "results_manifest"
  | "dataset_manifest"
  | "format_example_manifest"
  | "evaluation_runner_manifest"
  | "agent_adapter_roster"
  | "vulnerability_scenario_manifest"
  | "test_script_manifest"
  | "parser_utility_manifest"
  | "patch_diff_utility_manifest"
  | "metric_definition_manifest"
  | "ci_regression_manifest"
  | "metric_owner"
  | "sample_size_confidence_interval";

export type MetricValidationRavigBenchSignal =
  | "source_repository_license"
  | "default_branch_snapshot"
  | "readme_legal_manifest"
  | "environment_dependency_manifest"
  | "configuration_manifest"
  | "content_evaluation_manifest"
  | "design_evaluation_manifest"
  | "execution_evaluation_manifest"
  | "function_scoring_manifest"
  | "dataset_manifest"
  | "test_case_manifest"
  | "model_result_manifest"
  | "visual_rich_generation_taxonomy"
  | "rag_retrieval_context_manifest"
  | "multi_modal_evaluator_manifest"
  | "screenshot_evaluation_manifest"
  | "run_script_manifest"
  | "metric_definition_manifest"
  | "ci_regression_manifest"
  | "metric_owner"
  | "sample_size_confidence_interval";

export type MetricValidationHumanStudyBenchSignal =
  | "source_repository_license"
  | "default_branch_snapshot"
  | "study_config_manifest"
  | "participant_background_manifest"
  | "human_response_manifest"
  | "agent_response_manifest"
  | "evaluator_registry_manifest"
  | "metric_definition_manifest"
  | "response_validator_manifest"
  | "scorer_standardizer_manifest"
  | "inter_rater_agreement_report"
  | "test_retest_reliability_report"
  | "validation_pipeline_manifest"
  | "result_artifact_manifest"
  | "ci_regression_manifest"
  | "metric_owner"
  | "sample_size_confidence_interval";

export type MetricValidationLegacyBenchSignal =
  | "source_repository_license"
  | "default_branch_snapshot"
  | "readme_manifest"
  | "task_corpus_manifest"
  | "legacy_language_manifest"
  | "environment_manifest"
  | "harness_runner_manifest"
  | "agent_task_manifest"
  | "patch_submission_manifest"
  | "test_oracle_manifest"
  | "evaluator_registry_manifest"
  | "scoring_metric_manifest"
  | "regression_ci_manifest"
  | "result_artifact_manifest"
  | "replay_command_manifest"
  | "metric_owner"
  | "sample_size_confidence_interval";

export type MetricValidationSubtleMemorySignal =
  | "source_repository_license"
  | "default_branch_snapshot"
  | "arxiv_paper_version"
  | "huggingface_dataset_release"
  | "persona_split_manifest"
  | "bench_instance_manifest"
  | "history_session_manifest"
  | "relation_taxonomy_manifest"
  | "construction_pipeline_manifest"
  | "staged_evaluation_protocol"
  | "adapter_roster_manifest"
  | "judge_evaluator_config"
  | "score_summary_report"
  | "diagnostic_protocol_report"
  | "ci_validation_manifest"
  | "metric_owner"
  | "sample_size_confidence_interval";

export interface MetricValidationRow {
  metricId: string;
  owner: string;
  sampleSize: number;
  constructValidity: number;
  interRaterAgreement: number | null;
  testRetestStability: number | null;
  counterfactualResponsiveness: number | null;
  counterfactualSampleSize: number;
  validationFacetCoverage: number | null;
  validationFacetSampleSize: number;
  confounderControlCoverage: number | null;
  confounderControlSampleSize: number;
  outcomeAlignment: number | null;
  outcomeAlignmentSampleSize: number;
  processEvidenceCoverage: number | null;
  processEvidenceSampleSize: number;
  safetyUtilityCoverage: number | null;
  safetyUtilitySampleSize: number;
  modalityTransformationCoverage: number | null;
  modalityTransformationSampleSize: number;
  lifecycleObservabilityCoverage: number | null;
  lifecycleObservabilitySampleSize: number;
  rankingStabilityCoverage: number | null;
  rankingStabilitySampleSize: number;
  toolSandboxCoverage: number | null;
  toolSandboxSampleSize: number;
  continualLearningCoverage: number | null;
  continualLearningSampleSize: number;
  continualLearningRunCount: number | null;
  continualLearningMissingSignals: MetricValidationContinualLearningSignal[];
  continualLearningMemoryArtifactHashes: string[];
  continualLearningRunSummaryArtifactHashes: string[];
  continualLearningGameplayLogArtifactHashes: string[];
  continualLearningMetricNames: string[];
  strategicInteractionCoverage: number | null;
  strategicInteractionSampleSize: number;
  architectureRealityCoverage: number | null;
  architectureRealitySampleSize: number;
  architectureRealityStressScenarioCount: number | null;
  architectureRealityNetworkScenarioCount: number | null;
  architectureRealityEnsemblePatternCount: number | null;
  architectureRealityMissingSignals: MetricValidationArchitectureRealitySignal[];
  ragPipelineCoverage: number | null;
  ragPipelineSampleSize: number;
  ragEvaluationPipelineCoverage: number | null;
  ragEvaluationPipelineSampleSize: number;
  ragEvaluationPipelineCaseSampleSizeMin: number | null;
  ragEvaluationPipelineMissingSignals: MetricValidationRagEvaluationPipelineSignal[];
  ragEvaluationPipelineMetricOwners: string[];
  ragEvaluationPipelineReportArtifactHashes: string[];
  ragasNotebookCoverage: number | null;
  ragasNotebookSampleSize: number;
  ragasNotebookMissingSignals: MetricValidationRagasNotebookSignal[];
  ragasNotebookMetricNames: string[];
  ragasNotebookQuestionCount: number | null;
  ragasNotebookReportArtifactHashes: string[];
  mirageRagMetricCoverage: number | null;
  mirageRagMetricSampleSize: number;
  mirageRagMetricMissingSignals: MetricValidationMirageRagSignal[];
  mirageRagMetricDatasetIds: string[];
  mirageRagMetricEvaluationModes: string[];
  mirageRagMetricRetrieverIds: string[];
  mirageRagMetricModelIds: string[];
  mirageRagMetricNames: string[];
  mirageRagMetricQaPairCount: number | null;
  mirageRagMetricContextPoolCount: number | null;
  mirageRagMetricReportArtifactHashes: string[];
  legalCodeRagCoverage: number | null;
  legalCodeRagSampleSize: number;
  legalCodeRagMissingSignals: MetricValidationLegalCodeRagSignal[];
  legalCodeRagLegalCodeIds: string[];
  legalCodeRagJurisdictionIds: string[];
  legalCodeRagRetrievalTechniqueIds: string[];
  legalCodeRagVectorStoreIds: string[];
  legalCodeRagEmbeddingModelIds: string[];
  legalCodeRagEvaluationDatasetIds: string[];
  legalCodeRagMetricNames: string[];
  legalCodeRagQuestionCount: number | null;
  legalCodeRagMetricOwners: string[];
  legalCodeRagReportArtifactHashes: string[];
  guardbenchMetricCoverage: number | null;
  guardbenchMetricSampleSize: number;
  guardbenchMetricMissingSignals: MetricValidationGuardbenchSignal[];
  guardbenchDatasetIds: string[];
  guardbenchLanguageIds: string[];
  guardbenchModelIds: string[];
  guardbenchThresholdIds: string[];
  guardbenchMetricNames: string[];
  guardbenchExportFormats: string[];
  guardbenchReportArtifactHashes: string[];
  businessWorkflowCoverage: number | null;
  businessWorkflowSampleSize: number;
  dataAgentAnalyticalCoverage: number | null;
  dataAgentAnalyticalSampleSize: number;
  embodiedAgentCoverage: number | null;
  embodiedAgentSampleSize: number;
  embodiedAgentMissingSignals: MetricValidationEmbodiedAgentSignal[];
  embodiedAgentTaskTypes: string[];
  embodiedAgentBaselineIds: string[];
  embodiedAgentReportArtifactHashes: string[];
  evaluatorSuiteCoverage: number | null;
  evaluatorSuiteSampleSize: number;
  evaluatorSuiteMissingSignals: MetricValidationEvaluatorSuiteSignal[];
  evaluatorSuiteAssertionTypes: string[];
  evaluatorSuiteReporterFormats: string[];
  evaluatorSuiteJudgeNames: string[];
  evaluatorSuiteReportArtifactHashes: string[];
  pentestBenchmarkCoverage: number | null;
  pentestBenchmarkSampleSize: number;
  pentestBenchmarkMissingSignals: MetricValidationPentestBenchmarkSignal[];
  pentestBenchmarkLanguageStacks: string[];
  pentestBenchmarkVulnerabilityClasses: string[];
  pentestBenchmarkDifficultyLevels: string[];
  pentestBenchmarkSuiteIds: string[];
  pentestBenchmarkMetricNames: string[];
  pentestBenchmarkReportArtifactHashes: string[];
  traceEvaluationCoverage: number | null;
  traceEvaluationSampleSize: number;
  traceEvaluationMissingSignals: MetricValidationTraceEvaluationSignal[];
  traceEvaluationModelIds: string[];
  traceEvaluationAgentParameterKeys: string[];
  traceEvaluationToolNames: string[];
  traceEvaluationMetricNames: string[];
  traceEvaluationCaseSuiteIds: string[];
  traceEvaluationBackendModes: string[];
  traceEvaluationRunPermutationCount: number | null;
  traceEvaluationReportArtifactHashes: string[];
  livingEnvironmentCoverage: number | null;
  livingEnvironmentSampleSize: number;
  livingEnvironmentMissingSignals: MetricValidationLivingEnvironmentSignal[];
  livingEnvironmentCapabilityNames: string[];
  livingEnvironmentSandboxProviders: string[];
  livingEnvironmentAgentAdapters: string[];
  livingEnvironmentMetricNames: string[];
  livingEnvironmentTrialCount: number | null;
  livingEnvironmentReportArtifactHashes: string[];
  mobileAgentCoverage: number | null;
  mobileAgentSampleSize: number;
  mobileAgentMissingSignals: MetricValidationMobileAgentSignal[];
  mobileAgentBenchmarkIds: string[];
  mobileAgentEnvironmentIds: string[];
  mobileAgentAppIds: string[];
  mobileAgentApiCatalogIds: string[];
  mobileAgentUiTraceIds: string[];
  mobileAgentTaskSetIds: string[];
  mobileAgentTaskComplexityGroups: string[];
  mobileAgentCheckpointMetricNames: string[];
  mobileAgentLicenseBoundaryRefs: string[];
  mobileAgentTrialCount: number | null;
  mobileAgentReportArtifactHashes: string[];
  personaAgentCoverage: number | null;
  personaAgentSampleSize: number;
  personaAgentMissingSignals: MetricValidationPersonaAgentSignal[];
  personaAgentPersonaIds: string[];
  personaAgentEnvironmentIds: string[];
  personaAgentQuestionSetIds: string[];
  personaAgentModelIds: string[];
  personaAgentProviderIds: string[];
  personaAgentMetricNames: string[];
  personaAgentQuestionCount: number | null;
  personaAgentReportArtifactHashes: string[];
  scientificLiteratureCoverage: number | null;
  scientificLiteratureSampleSize: number;
  scientificLiteratureMissingSignals: MetricValidationScientificLiteratureSignal[];
  scientificLiteratureBenchmarkIds: string[];
  scientificLiteratureTaskTypes: string[];
  scientificLiteratureDatasetIds: string[];
  scientificLiteratureSearchBackendIds: string[];
  scientificLiteratureToolIds: string[];
  scientificLiteratureMetricNames: string[];
  scientificLiteratureTaskCount: number | null;
  scientificLiteratureReportArtifactHashes: string[];
  bioinformaticsAgentCoverage: number | null;
  bioinformaticsAgentSampleSize: number;
  bioinformaticsAgentMissingSignals: MetricValidationBioinformaticsAgentSignal[];
  bioinformaticsAgentBenchmarkIds: string[];
  bioinformaticsAgentTaskTypes: string[];
  bioinformaticsAgentDatasetIds: string[];
  bioinformaticsAgentWorkflowIds: string[];
  bioinformaticsAgentToolNames: string[];
  bioinformaticsAgentMetricNames: string[];
  bioinformaticsAgentPerturbationIds: string[];
  bioinformaticsAgentPrivacyBoundaryRefs: string[];
  bioinformaticsAgentTaskCount: number | null;
  bioinformaticsAgentReportArtifactHashes: string[];
  mirageDrugRepositioningCoverage: number | null;
  mirageDrugRepositioningSampleSize: number;
  mirageDrugRepositioningMissingSignals: MetricValidationMirageDrugRepositioningSignal[];
  mirageDrugRepositioningBenchmarkIds: string[];
  mirageDrugRepositioningDatasetIds: string[];
  mirageDrugRepositioningSplitIds: string[];
  mirageDrugRepositioningMappingIds: string[];
  mirageDrugRepositioningFeatureSetIds: string[];
  mirageDrugRepositioningSimilarityMatrixIds: string[];
  mirageDrugRepositioningNegativeSamplingIds: string[];
  mirageDrugRepositioningClassifierConfigIds: string[];
  mirageDrugRepositioningFeatureSelectionReportIds: string[];
  mirageDrugRepositioningScoreCalculationIds: string[];
  mirageDrugRepositioningCaseStudyIds: string[];
  mirageDrugRepositioningMetricNames: string[];
  mirageDrugRepositioningDrugCount: number | null;
  mirageDrugRepositioningDiseaseCount: number | null;
  mirageDrugRepositioningMappingCount: number | null;
  mirageDrugRepositioningFeatureSetCount: number | null;
  mirageDrugRepositioningSimilarityMatrixCount: number | null;
  mirageDrugRepositioningReportArtifactHashes: string[];
  networkTroubleshootingCoverage: number | null;
  networkTroubleshootingSampleSize: number;
  networkTroubleshootingMissingSignals: MetricValidationNetworkTroubleshootingSignal[];
  networkTroubleshootingBenchmarkIds: string[];
  networkTroubleshootingScenarioIds: string[];
  networkTroubleshootingTopologyTiers: string[];
  networkTroubleshootingIssueTypes: string[];
  networkTroubleshootingAgentIds: string[];
  networkTroubleshootingToolNames: string[];
  networkTroubleshootingMetricNames: string[];
  networkTroubleshootingIncidentCount: number | null;
  networkTroubleshootingReportArtifactHashes: string[];
  inferenceOptimizationCoverage: number | null;
  inferenceOptimizationSampleSize: number;
  inferenceOptimizationMissingSignals: MetricValidationInferenceOptimizationSignal[];
  inferenceOptimizationBenchmarkIds: string[];
  inferenceOptimizationScenarioIds: string[];
  inferenceOptimizationHardwareProfileIds: string[];
  inferenceOptimizationBackendIds: string[];
  inferenceOptimizationSearchSpaceIds: string[];
  inferenceOptimizationGateIds: string[];
  inferenceOptimizationAgentIds: string[];
  inferenceOptimizationMetricNames: string[];
  inferenceOptimizationRunCount: number | null;
  inferenceOptimizationReportArtifactHashes: string[];
  javaCodingAgentCoverage: number | null;
  javaCodingAgentSampleSize: number;
  javaCodingAgentMissingSignals: MetricValidationJavaCodingAgentSignal[];
  javaCodingAgentBenchmarkIds: string[];
  javaCodingAgentTaskIds: string[];
  javaCodingAgentTaskTypes: string[];
  javaCodingAgentJavaProjectIds: string[];
  javaCodingAgentSandboxIds: string[];
  javaCodingAgentAgentConfigIds: string[];
  javaCodingAgentJudgeTierIds: string[];
  javaCodingAgentCheckTypes: string[];
  javaCodingAgentMetricNames: string[];
  javaCodingAgentTrialCount: number | null;
  javaCodingAgentReportArtifactHashes: string[];
  webEvalDatasetCoverage: number | null;
  webEvalDatasetSampleSize: number;
  webEvalDatasetMissingSignals: MetricValidationWebEvalDatasetSignal[];
  webEvalDatasetBenchmarkIds: string[];
  webEvalDatasetRepositoryRefs: string[];
  webEvalDatasetSubjectIds: string[];
  webEvalDatasetQuerySetIds: string[];
  webEvalDatasetSearchProviderIds: string[];
  webEvalDatasetDocumentSetIds: string[];
  webEvalDatasetFilterPolicyIds: string[];
  webEvalDatasetQaGenerationIds: string[];
  webEvalDatasetReferenceAnswerSetIds: string[];
  webEvalDatasetExportIds: string[];
  webEvalDatasetOutputTargets: string[];
  webEvalDatasetMetricNames: string[];
  webEvalDatasetQuestionCount: number | null;
  webEvalDatasetDocumentCount: number | null;
  webEvalDatasetProviderDiversityCount: number | null;
  webEvalDatasetFreshnessHours: number | null;
  webEvalDatasetSourceCoverage: number | null;
  webEvalDatasetAnswerGrounding: number | null;
  webEvalDatasetReportArtifactHashes: string[];
  parallelResearchSkillCoverage: number | null;
  parallelResearchSkillSampleSize: number;
  parallelResearchSkillMissingSignals: MetricValidationParallelResearchSkillSignal[];
  parallelResearchSkillRepositoryRefs: string[];
  parallelResearchSkillLicenseRefs: string[];
  parallelResearchSkillManifestIds: string[];
  parallelResearchSkillApiSurfaceIds: string[];
  parallelResearchSkillSearchModeIds: string[];
  parallelResearchSkillProcessorTiers: string[];
  parallelResearchSkillSecurityBoundaryRefs: string[];
  parallelResearchSkillDependencyLockIds: string[];
  parallelResearchSkillMetricNames: string[];
  parallelResearchSkillCitationCoverage0to1: number | null;
  parallelResearchSkillSourcePolicyCoverage0to1: number | null;
  parallelResearchSkillBatchTaskLimit: number | null;
  parallelResearchSkillMonitoringCoverage0to1: number | null;
  parallelResearchSkillReportArtifactHashes: string[];
  resumeRagEvaluatorCoverage: number | null;
  resumeRagEvaluatorSampleSize: number;
  resumeRagEvaluatorMissingSignals: MetricValidationResumeRagEvaluatorSignal[];
  resumeRagEvaluatorRepositoryRefs: string[];
  resumeRagEvaluatorLicenseRefs: string[];
  resumeRagEvaluatorResumeInputFormats: string[];
  resumeRagEvaluatorRagStrategyIds: string[];
  resumeRagEvaluatorQueryExpansionIds: string[];
  resumeRagEvaluatorRetrievalKMin: number | null;
  resumeRagEvaluatorRetrievalKMax: number | null;
  resumeRagEvaluatorVectorStoreIds: string[];
  resumeRagEvaluatorOllamaModelIds: string[];
  resumeRagEvaluatorEmbeddingModelIds: string[];
  resumeRagEvaluatorEvaluationEndpointIds: string[];
  resumeRagEvaluatorCandidateRatingScale: string | null;
  resumeRagEvaluatorBatchModeIds: string[];
  resumeRagEvaluatorPrivacyBoundaryRefs: string[];
  resumeRagEvaluatorDependencyLockIds: string[];
  resumeRagEvaluatorMetricNames: string[];
  resumeRagEvaluatorParserCoverage0to1: number | null;
  resumeRagEvaluatorEvaluationGrounding0to1: number | null;
  resumeRagEvaluatorReportArtifactHashes: string[];
  chipBenchmarkCoverage: number | null;
  chipBenchmarkSampleSize: number;
  chipBenchmarkMissingSignals: MetricValidationChipBenchmarkSignal[];
  chipBenchmarkRepositoryRefs: string[];
  chipBenchmarkLicenseRefs: string[];
  chipBenchmarkBenchmarkIds: string[];
  chipBenchmarkHardwareProfileIds: string[];
  chipBenchmarkModelFamilyIds: string[];
  chipBenchmarkPrecisionModeIds: string[];
  chipBenchmarkEnvironmentIds: string[];
  chipBenchmarkRunnerScriptIds: string[];
  chipBenchmarkServingBackendIds: string[];
  chipBenchmarkDatasetIds: string[];
  chipBenchmarkFrontendDatasetIds: string[];
  chipBenchmarkPricingRefs: string[];
  chipBenchmarkMetricNames: string[];
  chipBenchmarkRegressionThresholdIds: string[];
  chipBenchmarkResultRowCount: number | null;
  chipBenchmarkThroughputCoverage0to1: number | null;
  chipBenchmarkLatencyCoverage0to1: number | null;
  chipBenchmarkCostCoverage0to1: number | null;
  chipBenchmarkReportArtifactHashes: string[];
  hermesBenchCoverage: number | null;
  hermesBenchSampleSize: number;
  hermesBenchMissingSignals: MetricValidationHermesBenchSignal[];
  hermesBenchRepositoryRefs: string[];
  hermesBenchLicenseRefs: string[];
  hermesBenchBranchRefs: string[];
  hermesBenchCommitRefs: string[];
  hermesBenchTreeRefs: string[];
  hermesBenchReadmeBlobRefs: string[];
  hermesBenchBuildSpecRefs: string[];
  hermesBenchBackendTreeRefs: string[];
  hermesBenchFrontendTreeRefs: string[];
  hermesBenchRunnerIds: string[];
  hermesBenchJudgeIds: string[];
  hermesBenchTaskRegistryIds: string[];
  hermesBenchServerConfigIds: string[];
  hermesBenchAdapterIds: string[];
  hermesBenchResultSchemaIds: string[];
  hermesBenchFrontendComponentIds: string[];
  hermesBenchBackendTestIds: string[];
  hermesBenchFrontendTestIds: string[];
  hermesBenchDockerRuntimeIds: string[];
  hermesBenchMetricNames: string[];
  hermesBenchTaskCount: number | null;
  hermesBenchAdapterCount: number | null;
  hermesBenchBackendTestCount: number | null;
  hermesBenchFrontendTestCount: number | null;
  hermesBenchJudgeAgreement0to1: number | null;
  hermesBenchRegressionPassRate0to1: number | null;
  hermesBenchReportArtifactHashes: string[];
  cooperBenchCoverage: number | null;
  cooperBenchSampleSize: number;
  cooperBenchMissingSignals: MetricValidationCooperBenchSignal[];
  cooperBenchRepositoryRefs: string[];
  cooperBenchLicenseRefs: string[];
  cooperBenchReleaseRefs: string[];
  cooperBenchBranchRefs: string[];
  cooperBenchCommitRefs: string[];
  cooperBenchTreeRefs: string[];
  cooperBenchReadmeBlobRefs: string[];
  cooperBenchChangelogRefs: string[];
  cooperBenchDatasetTreeRefs: string[];
  cooperBenchDatasetReadmeRefs: string[];
  cooperBenchRunnerIds: string[];
  cooperBenchEvalBackendIds: string[];
  cooperBenchTeamHarnessIds: string[];
  cooperBenchAgentAdapterIds: string[];
  cooperBenchCiWorkflowIds: string[];
  cooperBenchPackageLockRefs: string[];
  cooperBenchReportPublicationRefs: string[];
  cooperBenchMetricNames: string[];
  cooperBenchTaskCount: number | null;
  cooperBenchFeatureCount: number | null;
  cooperBenchAgentAdapterCount: number | null;
  cooperBenchTestCount: number | null;
  cooperBenchCooperationScore0to1: number | null;
  cooperBenchConflictResolutionRate0to1: number | null;
  cooperBenchRegressionPassRate0to1: number | null;
  cooperBenchReportArtifactHashes: string[];
  coderCupCoverage: number | null;
  coderCupSampleSize: number;
  coderCupMissingSignals: MetricValidationCoderCupSignal[];
  coderCupRepositoryRefs: string[];
  coderCupLicenseRefs: string[];
  coderCupHomepageRefs: string[];
  coderCupBranchRefs: string[];
  coderCupCommitRefs: string[];
  coderCupTreeRefs: string[];
  coderCupReadmeBlobRefs: string[];
  coderCupContributingRefs: string[];
  coderCupCiWorkflowIds: string[];
  coderCupPackageManifestRefs: string[];
  coderCupPackageLockRefs: string[];
  coderCupTaskSpecRefs: string[];
  coderCupTestSuiteRefs: string[];
  coderCupSuiteIndexRefs: string[];
  coderCupRunnerIds: string[];
  coderCupRunnerContractRefs: string[];
  coderCupScoreLedgerRefs: string[];
  coderCupLiveArtifactRefs: string[];
  coderCupMethodologyRefs: string[];
  coderCupReferenceRefs: string[];
  coderCupCostMethodologyRefs: string[];
  coderCupPublicFixtureRefs: string[];
  coderCupMetricNames: string[];
  coderCupPhaseCount: number | null;
  coderCupTestPlanCount: number | null;
  coderCupRunnerCount: number | null;
  coderCupScoreLedgerCount: number | null;
  coderCupLiveSurfaceCount: number | null;
  coderCupInterRaterAgreement0to1: number | null;
  coderCupTestRetestReliability0to1: number | null;
  coderCupRegressionPassRate0to1: number | null;
  coderCupReportArtifactHashes: string[];
  agenticGraphRagCoverage: number | null;
  agenticGraphRagSampleSize: number;
  agenticGraphRagMissingSignals: MetricValidationAgenticGraphRagSignal[];
  agenticGraphRagRepositoryRefs: string[];
  agenticGraphRagLicenseRefs: string[];
  agenticGraphRagBranchRefs: string[];
  agenticGraphRagCommitRefs: string[];
  agenticGraphRagTreeRefs: string[];
  agenticGraphRagReadmeBlobRefs: string[];
  agenticGraphRagGraphWorkflowIds: string[];
  agenticGraphRagOrchestratorIds: string[];
  agenticGraphRagRagPipelineIds: string[];
  agenticGraphRagDatabaseIds: string[];
  agenticGraphRagVectorStoreIds: string[];
  agenticGraphRagEvaluationIds: string[];
  agenticGraphRagExperimentTrackerIds: string[];
  agenticGraphRagUiComponentIds: string[];
  agenticGraphRagDependencyLockRefs: string[];
  agenticGraphRagMetricNames: string[];
  agenticGraphRagGraphNodeCount: number | null;
  agenticGraphRagGraphEdgeCount: number | null;
  agenticGraphRagEvaluationMetricCount: number | null;
  agenticGraphRagExperimentCount: number | null;
  agenticGraphRagRetrievalGroundingScore0to1: number | null;
  agenticGraphRagRegressionPassRate0to1: number | null;
  agenticGraphRagReportArtifactHashes: string[];
  agentScenarioTestCoverage: number | null;
  agentScenarioTestSampleSize: number;
  agentScenarioTestMissingSignals: MetricValidationAgentScenarioTestSignal[];
  agentScenarioTestBenchmarkIds: string[];
  agentScenarioTestRepositoryRefs: string[];
  agentScenarioTestLicenseRefs: string[];
  agentScenarioTestScenarioIds: string[];
  agentScenarioTestPersonaIds: string[];
  agentScenarioTestGoalIds: string[];
  agentScenarioTestKnowledgeSetIds: string[];
  agentScenarioTestToolMockIds: string[];
  agentScenarioTestTrajectoryAssertionIds: string[];
  agentScenarioTestJudgeIds: string[];
  agentScenarioTestMetricNames: string[];
  agentScenarioTestReporterFormats: string[];
  agentScenarioTestAgentIds: string[];
  agentScenarioTestComparisonIds: string[];
  agentScenarioTestScenarioCount: number | null;
  agentScenarioTestTurnCount: number | null;
  agentScenarioTestToolCallCount: number | null;
  agentScenarioTestReportArtifactHashes: string[];
  openCodeLabCoverage: number | null;
  openCodeLabSampleSize: number;
  openCodeLabMissingSignals: MetricValidationOpenCodeLabSignal[];
  openCodeLabBenchmarkIds: string[];
  openCodeLabRepositoryRefs: string[];
  openCodeLabAgentContextIds: string[];
  openCodeLabPromptVariantIds: string[];
  openCodeLabToolDescriptionIds: string[];
  openCodeLabPolicyIds: string[];
  openCodeLabRunTraceIds: string[];
  openCodeLabForkIds: string[];
  openCodeLabModelIds: string[];
  openCodeLabGroundTruthIds: string[];
  openCodeLabMetricNames: string[];
  openCodeLabReporterFormats: string[];
  openCodeLabResultArtifactIds: string[];
  openCodeLabRunCount: number | null;
  openCodeLabForkAgreement0to1: number | null;
  openCodeLabModelVariance0to1: number | null;
  openCodeLabReportArtifactHashes: string[];
  ccPluginEvalCoverage: number | null;
  ccPluginEvalSampleSize: number;
  ccPluginEvalMissingSignals: MetricValidationCcPluginEvalSignal[];
  ccPluginEvalRepositoryRefs: string[];
  ccPluginEvalLicenseRefs: string[];
  ccPluginEvalPluginManifestIds: string[];
  ccPluginEvalComponentTypes: MetricValidationCcPluginEvalComponentType[];
  ccPluginEvalTriggerManifestIds: string[];
  ccPluginEvalScenarioManifestIds: string[];
  ccPluginEvalScenarioTypes: MetricValidationCcPluginEvalScenarioType[];
  ccPluginEvalTranscriptIds: string[];
  ccPluginEvalDetectionReportIds: string[];
  ccPluginEvalDetectionModes: MetricValidationCcPluginEvalDetectionMode[];
  ccPluginEvalJudgeIds: string[];
  ccPluginEvalCalibrationIds: string[];
  ccPluginEvalConflictReportIds: string[];
  ccPluginEvalCheckpointStateIds: string[];
  ccPluginEvalCostEstimateIds: string[];
  ccPluginEvalReporterFormats: string[];
  ccPluginEvalResultArtifactIds: string[];
  ccPluginEvalMetricNames: string[];
  ccPluginEvalTriggerAccuracy0to1: number | null;
  ccPluginEvalFalsePositiveRate0to1: number | null;
  ccPluginEvalFalseNegativeRate0to1: number | null;
  ccPluginEvalComponentCount: number | null;
  ccPluginEvalScenarioCount: number | null;
  ccPluginEvalReportArtifactHashes: string[];
  realignSimulationCoverage: number | null;
  realignSimulationSampleSize: number;
  realignSimulationMissingSignals: MetricValidationRealignSimulationSignal[];
  realignSimulationRepositoryRefs: string[];
  realignSimulationLicenseRefs: string[];
  realignSimulationConfigIds: string[];
  realignSimulationAppIds: string[];
  realignSimulationDatasetIds: string[];
  realignSimulationScenarioIds: string[];
  realignSimulationPersonaIds: string[];
  realignSimulationEvaluatorIds: string[];
  realignSimulationTargetIds: string[];
  realignSimulationRunTraceIds: string[];
  realignSimulationRepeatedRunTraceIds: string[];
  realignSimulationJudgeIds: string[];
  realignSimulationCalibrationIds: string[];
  realignSimulationStatisticsReportIds: string[];
  realignSimulationCiReporterIds: string[];
  realignSimulationReporterFormats: string[];
  realignSimulationExperimentIds: string[];
  realignSimulationResultArtifactIds: string[];
  realignSimulationMetricNames: string[];
  realignSimulationJudgeAgreement0to1: number | null;
  realignSimulationRegressionPassRate0to1: number | null;
  realignSimulationScenarioCount: number | null;
  realignSimulationEvaluatorCount: number | null;
  realignSimulationRepeatCount: number | null;
  realignSimulationReportArtifactHashes: string[];
  academiClawCoverage: number | null;
  academiClawSampleSize: number;
  academiClawMissingSignals: MetricValidationAcademiClawSignal[];
  academiClawRepositoryRefs: string[];
  academiClawLicenseRefs: string[];
  academiClawBranchRefs: string[];
  academiClawCommitRefs: string[];
  academiClawTreeRefs: string[];
  academiClawReadmeBlobRefs: string[];
  academiClawCitationRefs: string[];
  academiClawTaskCorpusRefs: string[];
  academiClawLanguageIds: string[];
  academiClawWorkspaceQueryIds: string[];
  academiClawDockerImageIds: string[];
  academiClawRubricIds: string[];
  academiClawEvalTaskRunnerIds: string[];
  academiClawResultManifestIds: string[];
  academiClawConversationTraceIds: string[];
  academiClawMetaEvalIds: string[];
  academiClawModelIds: string[];
  academiClawMetricNames: string[];
  academiClawCiReporterIds: string[];
  academiClawReporterFormats: string[];
  academiClawTaskCount: number | null;
  academiClawLanguageCount: number | null;
  academiClawRubricCount: number | null;
  academiClawTraceCount: number | null;
  academiClawMetaEvalCount: number | null;
  academiClawModelCount: number | null;
  academiClawRegressionPassRate0to1: number | null;
  academiClawReportArtifactHashes: string[];
  ragChunkingTechniqueCoverage: number | null;
  ragChunkingTechniqueSampleSize: number;
  ragChunkingTechniqueMissingSignals: MetricValidationRagChunkingTechniqueSignal[];
  ragChunkingTechniqueRepositoryRefs: string[];
  ragChunkingTechniqueLicenseRefs: string[];
  ragChunkingTechniqueBranchRefs: string[];
  ragChunkingTechniqueCommitRefs: string[];
  ragChunkingTechniqueTreeRefs: string[];
  ragChunkingTechniqueReadmeBlobRefs: string[];
  ragChunkingTechniquePolicyCorpusRefs: string[];
  ragChunkingTechniqueNotebookIds: string[];
  ragChunkingTechniqueChunkingStrategyIds: string[];
  ragChunkingTechniqueRetrievalPipelineIds: string[];
  ragChunkingTechniqueEmbeddingVectorstoreIds: string[];
  ragChunkingTechniqueEvaluationDatasetIds: string[];
  ragChunkingTechniqueMetricNames: string[];
  ragChunkingTechniqueCiReporterIds: string[];
  ragChunkingTechniqueReporterFormats: string[];
  ragChunkingTechniquePolicyDocumentCount: number | null;
  ragChunkingTechniqueNotebookCount: number | null;
  ragChunkingTechniqueChunkingStrategyCount: number | null;
  ragChunkingTechniqueEvaluationQuestionCount: number | null;
  ragChunkingTechniqueMetricCount: number | null;
  ragChunkingTechniqueRegressionPassRate0to1: number | null;
  ragChunkingTechniqueReportArtifactHashes: string[];
  kubernetesOperationalAgentCoverage: number | null;
  kubernetesOperationalAgentSampleSize: number;
  kubernetesOperationalAgentMissingSignals: MetricValidationKubernetesOperationalAgentSignal[];
  kubernetesOperationalAgentRepositoryRefs: string[];
  kubernetesOperationalAgentLicenseRefs: string[];
  kubernetesOperationalAgentReleaseRefs: string[];
  kubernetesOperationalAgentBranchRefs: string[];
  kubernetesOperationalAgentCommitRefs: string[];
  kubernetesOperationalAgentTreeRefs: string[];
  kubernetesOperationalAgentReadmeBlobRefs: string[];
  kubernetesOperationalAgentBuildWorkflowRefs: string[];
  kubernetesOperationalAgentAgentModuleRefs: string[];
  kubernetesOperationalAgentMcpServerModuleRefs: string[];
  kubernetesOperationalAgentToolModuleRefs: string[];
  kubernetesOperationalAgentToolCategoryIds: string[];
  kubernetesOperationalAgentDiagnosticCapabilityIds: string[];
  kubernetesOperationalAgentResourceMetricIds: string[];
  kubernetesOperationalAgentLogAnalysisIds: string[];
  kubernetesOperationalAgentMetricNames: string[];
  kubernetesOperationalAgentCiReporterIds: string[];
  kubernetesOperationalAgentReporterFormats: string[];
  kubernetesOperationalAgentToolCategoryCount: number | null;
  kubernetesOperationalAgentDiagnosticCapabilityCount: number | null;
  kubernetesOperationalAgentResourceMetricCount: number | null;
  kubernetesOperationalAgentLogAnalysisCount: number | null;
  kubernetesOperationalAgentRegressionPassRate0to1: number | null;
  kubernetesOperationalAgentReportArtifactHashes: string[];
  secureVibeBenchCoverage: number | null;
  secureVibeBenchSampleSize: number;
  secureVibeBenchMissingSignals: MetricValidationSecureVibeBenchSignal[];
  secureVibeBenchRepositoryRefs: string[];
  secureVibeBenchLicenseRefs: string[];
  secureVibeBenchHomepageRefs: string[];
  secureVibeBenchArxivRefs: string[];
  secureVibeBenchBranchRefs: string[];
  secureVibeBenchCommitRefs: string[];
  secureVibeBenchTreeRefs: string[];
  secureVibeBenchReadmeBlobRefs: string[];
  secureVibeBenchResultsBlobRefs: string[];
  secureVibeBenchDatasetRefs: string[];
  secureVibeBenchFormatExampleRefs: string[];
  secureVibeBenchEvaluationRunnerRefs: string[];
  secureVibeBenchAgentAdapterIds: string[];
  secureVibeBenchVulnerabilityScenarioIds: string[];
  secureVibeBenchTestScriptIds: string[];
  secureVibeBenchParserUtilityRefs: string[];
  secureVibeBenchPatchDiffUtilityRefs: string[];
  secureVibeBenchMetricNames: string[];
  secureVibeBenchCiReporterIds: string[];
  secureVibeBenchReporterFormats: string[];
  secureVibeBenchAgentAdapterCount: number | null;
  secureVibeBenchScenarioCount: number | null;
  secureVibeBenchTestScriptCount: number | null;
  secureVibeBenchRegressionPassRate0to1: number | null;
  secureVibeBenchReportArtifactHashes: string[];
  ravigBenchCoverage: number | null;
  ravigBenchSampleSize: number;
  ravigBenchMissingSignals: MetricValidationRavigBenchSignal[];
  ravigBenchRepositoryRefs: string[];
  ravigBenchLicenseRefs: string[];
  ravigBenchBranchRefs: string[];
  ravigBenchCommitRefs: string[];
  ravigBenchTreeRefs: string[];
  ravigBenchReadmeBlobRefs: string[];
  ravigBenchLegalBlobRefs: string[];
  ravigBenchEnvironmentRefs: string[];
  ravigBenchConfigurationRefs: string[];
  ravigBenchContentEvaluationRefs: string[];
  ravigBenchDesignEvaluationRefs: string[];
  ravigBenchExecutionEvaluationRefs: string[];
  ravigBenchFunctionScoringRefs: string[];
  ravigBenchDatasetRefs: string[];
  ravigBenchTestCaseRefs: string[];
  ravigBenchModelResultRefs: string[];
  ravigBenchTaxonomyIds: string[];
  ravigBenchRetrievalContextIds: string[];
  ravigBenchMultiModalEvaluatorIds: string[];
  ravigBenchScreenshotEvaluationRefs: string[];
  ravigBenchRunScriptRefs: string[];
  ravigBenchMetricNames: string[];
  ravigBenchCiReporterIds: string[];
  ravigBenchReporterFormats: string[];
  ravigBenchDatasetCaseCount: number | null;
  ravigBenchVisualDesignCheckCount: number | null;
  ravigBenchEvaluatorCount: number | null;
  ravigBenchValidationPassRate0to1: number | null;
  ravigBenchReportArtifactHashes: string[];
  humanStudyBenchCoverage: number | null;
  humanStudyBenchSampleSize: number;
  humanStudyBenchMissingSignals: MetricValidationHumanStudyBenchSignal[];
  humanStudyBenchRepositoryRefs: string[];
  humanStudyBenchLicenseRefs: string[];
  humanStudyBenchBranchRefs: string[];
  humanStudyBenchCommitRefs: string[];
  humanStudyBenchStudyConfigIds: string[];
  humanStudyBenchBackgroundDatasetIds: string[];
  humanStudyBenchHumanResponseDatasetIds: string[];
  humanStudyBenchAgentResponseDatasetIds: string[];
  humanStudyBenchEvaluatorIds: string[];
  humanStudyBenchMetricNames: string[];
  humanStudyBenchValidatorIds: string[];
  humanStudyBenchScorerIds: string[];
  humanStudyBenchStandardizerIds: string[];
  humanStudyBenchReliabilityReportIds: string[];
  humanStudyBenchValidationPipelineIds: string[];
  humanStudyBenchResultArtifactIds: string[];
  humanStudyBenchCiReporterIds: string[];
  humanStudyBenchReporterFormats: string[];
  humanStudyBenchStudyCount: number | null;
  humanStudyBenchParticipantCount: number | null;
  humanStudyBenchResponseCount: number | null;
  humanStudyBenchEvaluatorCount: number | null;
  humanStudyBenchInterRaterAgreement0to1: number | null;
  humanStudyBenchTestRetestReliability0to1: number | null;
  humanStudyBenchValidationPassRate0to1: number | null;
  humanStudyBenchReportArtifactHashes: string[];
  legacyBenchCoverage: number | null;
  legacyBenchSampleSize: number;
  legacyBenchMissingSignals: MetricValidationLegacyBenchSignal[];
  legacyBenchRepositoryRefs: string[];
  legacyBenchLicenseRefs: string[];
  legacyBenchBranchRefs: string[];
  legacyBenchCommitRefs: string[];
  legacyBenchTreeRefs: string[];
  legacyBenchReadmeBlobRefs: string[];
  legacyBenchTaskCorpusRefs: string[];
  legacyBenchLegacyLanguageIds: string[];
  legacyBenchEnvironmentIds: string[];
  legacyBenchHarnessRunnerIds: string[];
  legacyBenchAgentTaskIds: string[];
  legacyBenchPatchSubmissionIds: string[];
  legacyBenchTestOracleIds: string[];
  legacyBenchEvaluatorIds: string[];
  legacyBenchMetricNames: string[];
  legacyBenchCiReporterIds: string[];
  legacyBenchReporterFormats: string[];
  legacyBenchResultArtifactIds: string[];
  legacyBenchReplayCommandIds: string[];
  legacyBenchTaskCount: number | null;
  legacyBenchLanguageCount: number | null;
  legacyBenchEnvironmentCount: number | null;
  legacyBenchTestOracleCount: number | null;
  legacyBenchEvaluatorCount: number | null;
  legacyBenchRegressionPassRate0to1: number | null;
  legacyBenchReplayPassRate0to1: number | null;
  legacyBenchReportArtifactHashes: string[];
  subtleMemoryCoverage: number | null;
  subtleMemorySampleSize: number;
  subtleMemoryMissingSignals: MetricValidationSubtleMemorySignal[];
  subtleMemoryRepositoryRefs: string[];
  subtleMemoryLicenseRefs: string[];
  subtleMemoryBranchRefs: string[];
  subtleMemoryCommitRefs: string[];
  subtleMemoryTreeRefs: string[];
  subtleMemoryArxivRefs: string[];
  subtleMemoryDatasetRefs: string[];
  subtleMemoryPersonaIds: string[];
  subtleMemoryBenchInstanceManifestIds: string[];
  subtleMemoryHistorySessionManifestIds: string[];
  subtleMemoryRelationTypes: string[];
  subtleMemoryConstructionPipelineIds: string[];
  subtleMemoryEvaluationStageIds: string[];
  subtleMemoryAdapterIds: string[];
  subtleMemoryJudgeIds: string[];
  subtleMemoryEvaluatorIds: string[];
  subtleMemoryMetricNames: string[];
  subtleMemoryScoreSummaryIds: string[];
  subtleMemoryDiagnosticProtocolIds: string[];
  subtleMemoryCiReporterIds: string[];
  subtleMemoryReporterFormats: string[];
  subtleMemoryPersonaCount: number | null;
  subtleMemoryBenchInstanceCount: number | null;
  subtleMemoryHistoryCount: number | null;
  subtleMemoryMemoryVariantSetCount: number | null;
  subtleMemoryRelationTypeCount: number | null;
  subtleMemoryEvaluationStageCount: number | null;
  subtleMemoryAdapterCount: number | null;
  subtleMemoryJudgeAgreement0to1: number | null;
  subtleMemoryValidationPassRate0to1: number | null;
  subtleMemoryReportArtifactHashes: string[];
  confidenceInterval: MetricValidationConfidenceInterval;
  status: "pass" | "attention" | "fail";
  evidenceRefs: string[];
  warnings: string[];
}

export interface MetricValidationEvalPackRow {
  metricId: string;
  owner: string;
  sampleSize: number;
  counterfactualResponsiveness: number | null;
  counterfactualSampleSize: number;
  validationFacetCoverage: number | null;
  validationFacetSampleSize: number;
  confounderControlCoverage: number | null;
  confounderControlSampleSize: number;
  outcomeAlignment: number | null;
  outcomeAlignmentSampleSize: number;
  processEvidenceCoverage: number | null;
  processEvidenceSampleSize: number;
  safetyUtilityCoverage: number | null;
  safetyUtilitySampleSize: number;
  modalityTransformationCoverage: number | null;
  modalityTransformationSampleSize: number;
  lifecycleObservabilityCoverage: number | null;
  lifecycleObservabilitySampleSize: number;
  rankingStabilityCoverage: number | null;
  rankingStabilitySampleSize: number;
  toolSandboxCoverage: number | null;
  toolSandboxSampleSize: number;
  continualLearningCoverage: number | null;
  continualLearningSampleSize: number;
  continualLearningRunCount: number | null;
  continualLearningMissingSignals: MetricValidationContinualLearningSignal[];
  continualLearningMemoryArtifactHashes: string[];
  continualLearningRunSummaryArtifactHashes: string[];
  continualLearningGameplayLogArtifactHashes: string[];
  continualLearningMetricNames: string[];
  strategicInteractionCoverage: number | null;
  strategicInteractionSampleSize: number;
  architectureRealityCoverage: number | null;
  architectureRealitySampleSize: number;
  architectureRealityStressScenarioCount: number | null;
  architectureRealityNetworkScenarioCount: number | null;
  architectureRealityEnsemblePatternCount: number | null;
  architectureRealityMissingSignals: MetricValidationArchitectureRealitySignal[];
  ragPipelineCoverage: number | null;
  ragPipelineSampleSize: number;
  ragEvaluationPipelineCoverage: number | null;
  ragEvaluationPipelineSampleSize: number;
  ragEvaluationPipelineCaseSampleSizeMin: number | null;
  ragEvaluationPipelineMissingSignals: MetricValidationRagEvaluationPipelineSignal[];
  ragEvaluationPipelineMetricOwners: string[];
  ragEvaluationPipelineReportArtifactHashes: string[];
  ragasNotebookCoverage: number | null;
  ragasNotebookSampleSize: number;
  ragasNotebookMissingSignals: MetricValidationRagasNotebookSignal[];
  ragasNotebookMetricNames: string[];
  ragasNotebookQuestionCount: number | null;
  ragasNotebookReportArtifactHashes: string[];
  mirageRagMetricCoverage: number | null;
  mirageRagMetricSampleSize: number;
  mirageRagMetricMissingSignals: MetricValidationMirageRagSignal[];
  mirageRagMetricDatasetIds: string[];
  mirageRagMetricEvaluationModes: string[];
  mirageRagMetricRetrieverIds: string[];
  mirageRagMetricModelIds: string[];
  mirageRagMetricNames: string[];
  mirageRagMetricQaPairCount: number | null;
  mirageRagMetricContextPoolCount: number | null;
  mirageRagMetricReportArtifactHashes: string[];
  legalCodeRagCoverage: number | null;
  legalCodeRagSampleSize: number;
  legalCodeRagMissingSignals: MetricValidationLegalCodeRagSignal[];
  legalCodeRagLegalCodeIds: string[];
  legalCodeRagJurisdictionIds: string[];
  legalCodeRagRetrievalTechniqueIds: string[];
  legalCodeRagVectorStoreIds: string[];
  legalCodeRagEmbeddingModelIds: string[];
  legalCodeRagEvaluationDatasetIds: string[];
  legalCodeRagMetricNames: string[];
  legalCodeRagQuestionCount: number | null;
  legalCodeRagMetricOwners: string[];
  legalCodeRagReportArtifactHashes: string[];
  guardbenchMetricCoverage: number | null;
  guardbenchMetricSampleSize: number;
  guardbenchMetricMissingSignals: MetricValidationGuardbenchSignal[];
  guardbenchDatasetIds: string[];
  guardbenchLanguageIds: string[];
  guardbenchModelIds: string[];
  guardbenchThresholdIds: string[];
  guardbenchMetricNames: string[];
  guardbenchExportFormats: string[];
  guardbenchReportArtifactHashes: string[];
  businessWorkflowCoverage: number | null;
  businessWorkflowSampleSize: number;
  dataAgentAnalyticalCoverage: number | null;
  dataAgentAnalyticalSampleSize: number;
  embodiedAgentCoverage: number | null;
  embodiedAgentSampleSize: number;
  embodiedAgentMissingSignals: MetricValidationEmbodiedAgentSignal[];
  embodiedAgentTaskTypes: string[];
  embodiedAgentBaselineIds: string[];
  embodiedAgentReportArtifactHashes: string[];
  evaluatorSuiteCoverage: number | null;
  evaluatorSuiteSampleSize: number;
  evaluatorSuiteMissingSignals: MetricValidationEvaluatorSuiteSignal[];
  evaluatorSuiteAssertionTypes: string[];
  evaluatorSuiteReporterFormats: string[];
  evaluatorSuiteJudgeNames: string[];
  evaluatorSuiteReportArtifactHashes: string[];
  pentestBenchmarkCoverage: number | null;
  pentestBenchmarkSampleSize: number;
  pentestBenchmarkMissingSignals: MetricValidationPentestBenchmarkSignal[];
  pentestBenchmarkLanguageStacks: string[];
  pentestBenchmarkVulnerabilityClasses: string[];
  pentestBenchmarkDifficultyLevels: string[];
  pentestBenchmarkSuiteIds: string[];
  pentestBenchmarkMetricNames: string[];
  pentestBenchmarkReportArtifactHashes: string[];
  traceEvaluationCoverage: number | null;
  traceEvaluationSampleSize: number;
  traceEvaluationMissingSignals: MetricValidationTraceEvaluationSignal[];
  traceEvaluationModelIds: string[];
  traceEvaluationAgentParameterKeys: string[];
  traceEvaluationToolNames: string[];
  traceEvaluationMetricNames: string[];
  traceEvaluationCaseSuiteIds: string[];
  traceEvaluationBackendModes: string[];
  traceEvaluationRunPermutationCount: number | null;
  traceEvaluationReportArtifactHashes: string[];
  livingEnvironmentCoverage: number | null;
  livingEnvironmentSampleSize: number;
  livingEnvironmentMissingSignals: MetricValidationLivingEnvironmentSignal[];
  livingEnvironmentCapabilityNames: string[];
  livingEnvironmentSandboxProviders: string[];
  livingEnvironmentAgentAdapters: string[];
  livingEnvironmentMetricNames: string[];
  livingEnvironmentTrialCount: number | null;
  livingEnvironmentReportArtifactHashes: string[];
  mobileAgentCoverage: number | null;
  mobileAgentSampleSize: number;
  mobileAgentMissingSignals: MetricValidationMobileAgentSignal[];
  mobileAgentBenchmarkIds: string[];
  mobileAgentEnvironmentIds: string[];
  mobileAgentAppIds: string[];
  mobileAgentApiCatalogIds: string[];
  mobileAgentUiTraceIds: string[];
  mobileAgentTaskSetIds: string[];
  mobileAgentTaskComplexityGroups: string[];
  mobileAgentCheckpointMetricNames: string[];
  mobileAgentLicenseBoundaryRefs: string[];
  mobileAgentTrialCount: number | null;
  mobileAgentReportArtifactHashes: string[];
  personaAgentCoverage: number | null;
  personaAgentSampleSize: number;
  personaAgentMissingSignals: MetricValidationPersonaAgentSignal[];
  personaAgentPersonaIds: string[];
  personaAgentEnvironmentIds: string[];
  personaAgentQuestionSetIds: string[];
  personaAgentModelIds: string[];
  personaAgentProviderIds: string[];
  personaAgentMetricNames: string[];
  personaAgentQuestionCount: number | null;
  personaAgentReportArtifactHashes: string[];
  scientificLiteratureCoverage: number | null;
  scientificLiteratureSampleSize: number;
  scientificLiteratureMissingSignals: MetricValidationScientificLiteratureSignal[];
  scientificLiteratureBenchmarkIds: string[];
  scientificLiteratureTaskTypes: string[];
  scientificLiteratureDatasetIds: string[];
  scientificLiteratureSearchBackendIds: string[];
  scientificLiteratureToolIds: string[];
  scientificLiteratureMetricNames: string[];
  scientificLiteratureTaskCount: number | null;
  scientificLiteratureReportArtifactHashes: string[];
  bioinformaticsAgentCoverage: number | null;
  bioinformaticsAgentSampleSize: number;
  bioinformaticsAgentMissingSignals: MetricValidationBioinformaticsAgentSignal[];
  bioinformaticsAgentBenchmarkIds: string[];
  bioinformaticsAgentTaskTypes: string[];
  bioinformaticsAgentDatasetIds: string[];
  bioinformaticsAgentWorkflowIds: string[];
  bioinformaticsAgentToolNames: string[];
  bioinformaticsAgentMetricNames: string[];
  bioinformaticsAgentPerturbationIds: string[];
  bioinformaticsAgentPrivacyBoundaryRefs: string[];
  bioinformaticsAgentTaskCount: number | null;
  bioinformaticsAgentReportArtifactHashes: string[];
  mirageDrugRepositioningCoverage: number | null;
  mirageDrugRepositioningSampleSize: number;
  mirageDrugRepositioningMissingSignals: MetricValidationMirageDrugRepositioningSignal[];
  mirageDrugRepositioningBenchmarkIds: string[];
  mirageDrugRepositioningDatasetIds: string[];
  mirageDrugRepositioningSplitIds: string[];
  mirageDrugRepositioningMappingIds: string[];
  mirageDrugRepositioningFeatureSetIds: string[];
  mirageDrugRepositioningSimilarityMatrixIds: string[];
  mirageDrugRepositioningNegativeSamplingIds: string[];
  mirageDrugRepositioningClassifierConfigIds: string[];
  mirageDrugRepositioningFeatureSelectionReportIds: string[];
  mirageDrugRepositioningScoreCalculationIds: string[];
  mirageDrugRepositioningCaseStudyIds: string[];
  mirageDrugRepositioningMetricNames: string[];
  mirageDrugRepositioningDrugCount: number | null;
  mirageDrugRepositioningDiseaseCount: number | null;
  mirageDrugRepositioningMappingCount: number | null;
  mirageDrugRepositioningFeatureSetCount: number | null;
  mirageDrugRepositioningSimilarityMatrixCount: number | null;
  mirageDrugRepositioningReportArtifactHashes: string[];
  networkTroubleshootingCoverage: number | null;
  networkTroubleshootingSampleSize: number;
  networkTroubleshootingMissingSignals: MetricValidationNetworkTroubleshootingSignal[];
  networkTroubleshootingBenchmarkIds: string[];
  networkTroubleshootingScenarioIds: string[];
  networkTroubleshootingTopologyTiers: string[];
  networkTroubleshootingIssueTypes: string[];
  networkTroubleshootingAgentIds: string[];
  networkTroubleshootingToolNames: string[];
  networkTroubleshootingMetricNames: string[];
  networkTroubleshootingIncidentCount: number | null;
  networkTroubleshootingReportArtifactHashes: string[];
  inferenceOptimizationCoverage: number | null;
  inferenceOptimizationSampleSize: number;
  inferenceOptimizationMissingSignals: MetricValidationInferenceOptimizationSignal[];
  inferenceOptimizationBenchmarkIds: string[];
  inferenceOptimizationScenarioIds: string[];
  inferenceOptimizationHardwareProfileIds: string[];
  inferenceOptimizationBackendIds: string[];
  inferenceOptimizationSearchSpaceIds: string[];
  inferenceOptimizationGateIds: string[];
  inferenceOptimizationAgentIds: string[];
  inferenceOptimizationMetricNames: string[];
  inferenceOptimizationRunCount: number | null;
  inferenceOptimizationReportArtifactHashes: string[];
  javaCodingAgentCoverage: number | null;
  javaCodingAgentSampleSize: number;
  javaCodingAgentMissingSignals: MetricValidationJavaCodingAgentSignal[];
  javaCodingAgentBenchmarkIds: string[];
  javaCodingAgentTaskIds: string[];
  javaCodingAgentTaskTypes: string[];
  javaCodingAgentJavaProjectIds: string[];
  javaCodingAgentSandboxIds: string[];
  javaCodingAgentAgentConfigIds: string[];
  javaCodingAgentJudgeTierIds: string[];
  javaCodingAgentCheckTypes: string[];
  javaCodingAgentMetricNames: string[];
  javaCodingAgentTrialCount: number | null;
  javaCodingAgentReportArtifactHashes: string[];
  webEvalDatasetCoverage: number | null;
  webEvalDatasetSampleSize: number;
  webEvalDatasetMissingSignals: MetricValidationWebEvalDatasetSignal[];
  webEvalDatasetBenchmarkIds: string[];
  webEvalDatasetRepositoryRefs: string[];
  webEvalDatasetSubjectIds: string[];
  webEvalDatasetQuerySetIds: string[];
  webEvalDatasetSearchProviderIds: string[];
  webEvalDatasetDocumentSetIds: string[];
  webEvalDatasetFilterPolicyIds: string[];
  webEvalDatasetQaGenerationIds: string[];
  webEvalDatasetReferenceAnswerSetIds: string[];
  webEvalDatasetExportIds: string[];
  webEvalDatasetOutputTargets: string[];
  webEvalDatasetMetricNames: string[];
  webEvalDatasetQuestionCount: number | null;
  webEvalDatasetDocumentCount: number | null;
  webEvalDatasetProviderDiversityCount: number | null;
  webEvalDatasetFreshnessHours: number | null;
  webEvalDatasetSourceCoverage: number | null;
  webEvalDatasetAnswerGrounding: number | null;
  webEvalDatasetReportArtifactHashes: string[];
  parallelResearchSkillCoverage: number | null;
  parallelResearchSkillSampleSize: number;
  parallelResearchSkillMissingSignals: MetricValidationParallelResearchSkillSignal[];
  parallelResearchSkillRepositoryRefs: string[];
  parallelResearchSkillLicenseRefs: string[];
  parallelResearchSkillManifestIds: string[];
  parallelResearchSkillApiSurfaceIds: string[];
  parallelResearchSkillSearchModeIds: string[];
  parallelResearchSkillProcessorTiers: string[];
  parallelResearchSkillSecurityBoundaryRefs: string[];
  parallelResearchSkillDependencyLockIds: string[];
  parallelResearchSkillMetricNames: string[];
  parallelResearchSkillCitationCoverage0to1: number | null;
  parallelResearchSkillSourcePolicyCoverage0to1: number | null;
  parallelResearchSkillBatchTaskLimit: number | null;
  parallelResearchSkillMonitoringCoverage0to1: number | null;
  parallelResearchSkillReportArtifactHashes: string[];
  resumeRagEvaluatorCoverage: number | null;
  resumeRagEvaluatorSampleSize: number;
  resumeRagEvaluatorMissingSignals: MetricValidationResumeRagEvaluatorSignal[];
  resumeRagEvaluatorRepositoryRefs: string[];
  resumeRagEvaluatorLicenseRefs: string[];
  resumeRagEvaluatorResumeInputFormats: string[];
  resumeRagEvaluatorRagStrategyIds: string[];
  resumeRagEvaluatorQueryExpansionIds: string[];
  resumeRagEvaluatorRetrievalKMin: number | null;
  resumeRagEvaluatorRetrievalKMax: number | null;
  resumeRagEvaluatorVectorStoreIds: string[];
  resumeRagEvaluatorOllamaModelIds: string[];
  resumeRagEvaluatorEmbeddingModelIds: string[];
  resumeRagEvaluatorEvaluationEndpointIds: string[];
  resumeRagEvaluatorCandidateRatingScale: string | null;
  resumeRagEvaluatorBatchModeIds: string[];
  resumeRagEvaluatorPrivacyBoundaryRefs: string[];
  resumeRagEvaluatorDependencyLockIds: string[];
  resumeRagEvaluatorMetricNames: string[];
  resumeRagEvaluatorParserCoverage0to1: number | null;
  resumeRagEvaluatorEvaluationGrounding0to1: number | null;
  resumeRagEvaluatorReportArtifactHashes: string[];
  chipBenchmarkCoverage: number | null;
  chipBenchmarkSampleSize: number;
  chipBenchmarkMissingSignals: MetricValidationChipBenchmarkSignal[];
  chipBenchmarkRepositoryRefs: string[];
  chipBenchmarkLicenseRefs: string[];
  chipBenchmarkBenchmarkIds: string[];
  chipBenchmarkHardwareProfileIds: string[];
  chipBenchmarkModelFamilyIds: string[];
  chipBenchmarkPrecisionModeIds: string[];
  chipBenchmarkEnvironmentIds: string[];
  chipBenchmarkRunnerScriptIds: string[];
  chipBenchmarkServingBackendIds: string[];
  chipBenchmarkDatasetIds: string[];
  chipBenchmarkFrontendDatasetIds: string[];
  chipBenchmarkPricingRefs: string[];
  chipBenchmarkMetricNames: string[];
  chipBenchmarkRegressionThresholdIds: string[];
  chipBenchmarkResultRowCount: number | null;
  chipBenchmarkThroughputCoverage0to1: number | null;
  chipBenchmarkLatencyCoverage0to1: number | null;
  chipBenchmarkCostCoverage0to1: number | null;
  chipBenchmarkReportArtifactHashes: string[];
  hermesBenchCoverage: number | null;
  hermesBenchSampleSize: number;
  hermesBenchMissingSignals: MetricValidationHermesBenchSignal[];
  hermesBenchRepositoryRefs: string[];
  hermesBenchLicenseRefs: string[];
  hermesBenchBranchRefs: string[];
  hermesBenchCommitRefs: string[];
  hermesBenchTreeRefs: string[];
  hermesBenchReadmeBlobRefs: string[];
  hermesBenchBuildSpecRefs: string[];
  hermesBenchBackendTreeRefs: string[];
  hermesBenchFrontendTreeRefs: string[];
  hermesBenchRunnerIds: string[];
  hermesBenchJudgeIds: string[];
  hermesBenchTaskRegistryIds: string[];
  hermesBenchServerConfigIds: string[];
  hermesBenchAdapterIds: string[];
  hermesBenchResultSchemaIds: string[];
  hermesBenchFrontendComponentIds: string[];
  hermesBenchBackendTestIds: string[];
  hermesBenchFrontendTestIds: string[];
  hermesBenchDockerRuntimeIds: string[];
  hermesBenchMetricNames: string[];
  hermesBenchTaskCount: number | null;
  hermesBenchAdapterCount: number | null;
  hermesBenchBackendTestCount: number | null;
  hermesBenchFrontendTestCount: number | null;
  hermesBenchJudgeAgreement0to1: number | null;
  hermesBenchRegressionPassRate0to1: number | null;
  hermesBenchReportArtifactHashes: string[];
  cooperBenchCoverage: number | null;
  cooperBenchSampleSize: number;
  cooperBenchMissingSignals: MetricValidationCooperBenchSignal[];
  cooperBenchRepositoryRefs: string[];
  cooperBenchLicenseRefs: string[];
  cooperBenchReleaseRefs: string[];
  cooperBenchBranchRefs: string[];
  cooperBenchCommitRefs: string[];
  cooperBenchTreeRefs: string[];
  cooperBenchReadmeBlobRefs: string[];
  cooperBenchChangelogRefs: string[];
  cooperBenchDatasetTreeRefs: string[];
  cooperBenchDatasetReadmeRefs: string[];
  cooperBenchRunnerIds: string[];
  cooperBenchEvalBackendIds: string[];
  cooperBenchTeamHarnessIds: string[];
  cooperBenchAgentAdapterIds: string[];
  cooperBenchCiWorkflowIds: string[];
  cooperBenchPackageLockRefs: string[];
  cooperBenchReportPublicationRefs: string[];
  cooperBenchMetricNames: string[];
  cooperBenchTaskCount: number | null;
  cooperBenchFeatureCount: number | null;
  cooperBenchAgentAdapterCount: number | null;
  cooperBenchTestCount: number | null;
  cooperBenchCooperationScore0to1: number | null;
  cooperBenchConflictResolutionRate0to1: number | null;
  cooperBenchRegressionPassRate0to1: number | null;
  cooperBenchReportArtifactHashes: string[];
  coderCupCoverage: number | null;
  coderCupSampleSize: number;
  coderCupMissingSignals: MetricValidationCoderCupSignal[];
  coderCupRepositoryRefs: string[];
  coderCupLicenseRefs: string[];
  coderCupHomepageRefs: string[];
  coderCupBranchRefs: string[];
  coderCupCommitRefs: string[];
  coderCupTreeRefs: string[];
  coderCupReadmeBlobRefs: string[];
  coderCupContributingRefs: string[];
  coderCupCiWorkflowIds: string[];
  coderCupPackageManifestRefs: string[];
  coderCupPackageLockRefs: string[];
  coderCupTaskSpecRefs: string[];
  coderCupTestSuiteRefs: string[];
  coderCupSuiteIndexRefs: string[];
  coderCupRunnerIds: string[];
  coderCupRunnerContractRefs: string[];
  coderCupScoreLedgerRefs: string[];
  coderCupLiveArtifactRefs: string[];
  coderCupMethodologyRefs: string[];
  coderCupReferenceRefs: string[];
  coderCupCostMethodologyRefs: string[];
  coderCupPublicFixtureRefs: string[];
  coderCupMetricNames: string[];
  coderCupPhaseCount: number | null;
  coderCupTestPlanCount: number | null;
  coderCupRunnerCount: number | null;
  coderCupScoreLedgerCount: number | null;
  coderCupLiveSurfaceCount: number | null;
  coderCupInterRaterAgreement0to1: number | null;
  coderCupTestRetestReliability0to1: number | null;
  coderCupRegressionPassRate0to1: number | null;
  coderCupReportArtifactHashes: string[];
  agenticGraphRagCoverage: number | null;
  agenticGraphRagSampleSize: number;
  agenticGraphRagMissingSignals: MetricValidationAgenticGraphRagSignal[];
  agenticGraphRagRepositoryRefs: string[];
  agenticGraphRagLicenseRefs: string[];
  agenticGraphRagBranchRefs: string[];
  agenticGraphRagCommitRefs: string[];
  agenticGraphRagTreeRefs: string[];
  agenticGraphRagReadmeBlobRefs: string[];
  agenticGraphRagGraphWorkflowIds: string[];
  agenticGraphRagOrchestratorIds: string[];
  agenticGraphRagRagPipelineIds: string[];
  agenticGraphRagDatabaseIds: string[];
  agenticGraphRagVectorStoreIds: string[];
  agenticGraphRagEvaluationIds: string[];
  agenticGraphRagExperimentTrackerIds: string[];
  agenticGraphRagUiComponentIds: string[];
  agenticGraphRagDependencyLockRefs: string[];
  agenticGraphRagMetricNames: string[];
  agenticGraphRagGraphNodeCount: number | null;
  agenticGraphRagGraphEdgeCount: number | null;
  agenticGraphRagEvaluationMetricCount: number | null;
  agenticGraphRagExperimentCount: number | null;
  agenticGraphRagRetrievalGroundingScore0to1: number | null;
  agenticGraphRagRegressionPassRate0to1: number | null;
  agenticGraphRagReportArtifactHashes: string[];
  agentScenarioTestCoverage: number | null;
  agentScenarioTestSampleSize: number;
  agentScenarioTestMissingSignals: MetricValidationAgentScenarioTestSignal[];
  agentScenarioTestBenchmarkIds: string[];
  agentScenarioTestRepositoryRefs: string[];
  agentScenarioTestLicenseRefs: string[];
  agentScenarioTestScenarioIds: string[];
  agentScenarioTestPersonaIds: string[];
  agentScenarioTestGoalIds: string[];
  agentScenarioTestKnowledgeSetIds: string[];
  agentScenarioTestToolMockIds: string[];
  agentScenarioTestTrajectoryAssertionIds: string[];
  agentScenarioTestJudgeIds: string[];
  agentScenarioTestMetricNames: string[];
  agentScenarioTestReporterFormats: string[];
  agentScenarioTestAgentIds: string[];
  agentScenarioTestComparisonIds: string[];
  agentScenarioTestScenarioCount: number | null;
  agentScenarioTestTurnCount: number | null;
  agentScenarioTestToolCallCount: number | null;
  agentScenarioTestReportArtifactHashes: string[];
  openCodeLabCoverage: number | null;
  openCodeLabSampleSize: number;
  openCodeLabMissingSignals: MetricValidationOpenCodeLabSignal[];
  openCodeLabBenchmarkIds: string[];
  openCodeLabRepositoryRefs: string[];
  openCodeLabAgentContextIds: string[];
  openCodeLabPromptVariantIds: string[];
  openCodeLabToolDescriptionIds: string[];
  openCodeLabPolicyIds: string[];
  openCodeLabRunTraceIds: string[];
  openCodeLabForkIds: string[];
  openCodeLabModelIds: string[];
  openCodeLabGroundTruthIds: string[];
  openCodeLabMetricNames: string[];
  openCodeLabReporterFormats: string[];
  openCodeLabResultArtifactIds: string[];
  openCodeLabRunCount: number | null;
  openCodeLabForkAgreement0to1: number | null;
  openCodeLabModelVariance0to1: number | null;
  openCodeLabReportArtifactHashes: string[];
  ccPluginEvalCoverage: number | null;
  ccPluginEvalSampleSize: number;
  ccPluginEvalMissingSignals: MetricValidationCcPluginEvalSignal[];
  ccPluginEvalRepositoryRefs: string[];
  ccPluginEvalLicenseRefs: string[];
  ccPluginEvalPluginManifestIds: string[];
  ccPluginEvalComponentTypes: MetricValidationCcPluginEvalComponentType[];
  ccPluginEvalTriggerManifestIds: string[];
  ccPluginEvalScenarioManifestIds: string[];
  ccPluginEvalScenarioTypes: MetricValidationCcPluginEvalScenarioType[];
  ccPluginEvalTranscriptIds: string[];
  ccPluginEvalDetectionReportIds: string[];
  ccPluginEvalDetectionModes: MetricValidationCcPluginEvalDetectionMode[];
  ccPluginEvalJudgeIds: string[];
  ccPluginEvalCalibrationIds: string[];
  ccPluginEvalConflictReportIds: string[];
  ccPluginEvalCheckpointStateIds: string[];
  ccPluginEvalCostEstimateIds: string[];
  ccPluginEvalReporterFormats: string[];
  ccPluginEvalResultArtifactIds: string[];
  ccPluginEvalMetricNames: string[];
  ccPluginEvalTriggerAccuracy0to1: number | null;
  ccPluginEvalFalsePositiveRate0to1: number | null;
  ccPluginEvalFalseNegativeRate0to1: number | null;
  ccPluginEvalComponentCount: number | null;
  ccPluginEvalScenarioCount: number | null;
  ccPluginEvalReportArtifactHashes: string[];
  realignSimulationCoverage: number | null;
  realignSimulationSampleSize: number;
  realignSimulationMissingSignals: MetricValidationRealignSimulationSignal[];
  realignSimulationRepositoryRefs: string[];
  realignSimulationLicenseRefs: string[];
  realignSimulationConfigIds: string[];
  realignSimulationAppIds: string[];
  realignSimulationDatasetIds: string[];
  realignSimulationScenarioIds: string[];
  realignSimulationPersonaIds: string[];
  realignSimulationEvaluatorIds: string[];
  realignSimulationTargetIds: string[];
  realignSimulationRunTraceIds: string[];
  realignSimulationRepeatedRunTraceIds: string[];
  realignSimulationJudgeIds: string[];
  realignSimulationCalibrationIds: string[];
  realignSimulationStatisticsReportIds: string[];
  realignSimulationCiReporterIds: string[];
  realignSimulationReporterFormats: string[];
  realignSimulationExperimentIds: string[];
  realignSimulationResultArtifactIds: string[];
  realignSimulationMetricNames: string[];
  realignSimulationJudgeAgreement0to1: number | null;
  realignSimulationRegressionPassRate0to1: number | null;
  realignSimulationScenarioCount: number | null;
  realignSimulationEvaluatorCount: number | null;
  realignSimulationRepeatCount: number | null;
  realignSimulationReportArtifactHashes: string[];
  academiClawCoverage: number | null;
  academiClawSampleSize: number;
  academiClawMissingSignals: MetricValidationAcademiClawSignal[];
  academiClawRepositoryRefs: string[];
  academiClawLicenseRefs: string[];
  academiClawBranchRefs: string[];
  academiClawCommitRefs: string[];
  academiClawTreeRefs: string[];
  academiClawReadmeBlobRefs: string[];
  academiClawCitationRefs: string[];
  academiClawTaskCorpusRefs: string[];
  academiClawLanguageIds: string[];
  academiClawWorkspaceQueryIds: string[];
  academiClawDockerImageIds: string[];
  academiClawRubricIds: string[];
  academiClawEvalTaskRunnerIds: string[];
  academiClawResultManifestIds: string[];
  academiClawConversationTraceIds: string[];
  academiClawMetaEvalIds: string[];
  academiClawModelIds: string[];
  academiClawMetricNames: string[];
  academiClawCiReporterIds: string[];
  academiClawReporterFormats: string[];
  academiClawTaskCount: number | null;
  academiClawLanguageCount: number | null;
  academiClawRubricCount: number | null;
  academiClawTraceCount: number | null;
  academiClawMetaEvalCount: number | null;
  academiClawModelCount: number | null;
  academiClawRegressionPassRate0to1: number | null;
  academiClawReportArtifactHashes: string[];
  ragChunkingTechniqueCoverage: number | null;
  ragChunkingTechniqueSampleSize: number;
  ragChunkingTechniqueMissingSignals: MetricValidationRagChunkingTechniqueSignal[];
  ragChunkingTechniqueRepositoryRefs: string[];
  ragChunkingTechniqueLicenseRefs: string[];
  ragChunkingTechniqueBranchRefs: string[];
  ragChunkingTechniqueCommitRefs: string[];
  ragChunkingTechniqueTreeRefs: string[];
  ragChunkingTechniqueReadmeBlobRefs: string[];
  ragChunkingTechniquePolicyCorpusRefs: string[];
  ragChunkingTechniqueNotebookIds: string[];
  ragChunkingTechniqueChunkingStrategyIds: string[];
  ragChunkingTechniqueRetrievalPipelineIds: string[];
  ragChunkingTechniqueEmbeddingVectorstoreIds: string[];
  ragChunkingTechniqueEvaluationDatasetIds: string[];
  ragChunkingTechniqueMetricNames: string[];
  ragChunkingTechniqueCiReporterIds: string[];
  ragChunkingTechniqueReporterFormats: string[];
  ragChunkingTechniquePolicyDocumentCount: number | null;
  ragChunkingTechniqueNotebookCount: number | null;
  ragChunkingTechniqueChunkingStrategyCount: number | null;
  ragChunkingTechniqueEvaluationQuestionCount: number | null;
  ragChunkingTechniqueMetricCount: number | null;
  ragChunkingTechniqueRegressionPassRate0to1: number | null;
  ragChunkingTechniqueReportArtifactHashes: string[];
  kubernetesOperationalAgentCoverage: number | null;
  kubernetesOperationalAgentSampleSize: number;
  kubernetesOperationalAgentMissingSignals: MetricValidationKubernetesOperationalAgentSignal[];
  kubernetesOperationalAgentRepositoryRefs: string[];
  kubernetesOperationalAgentLicenseRefs: string[];
  kubernetesOperationalAgentReleaseRefs: string[];
  kubernetesOperationalAgentBranchRefs: string[];
  kubernetesOperationalAgentCommitRefs: string[];
  kubernetesOperationalAgentTreeRefs: string[];
  kubernetesOperationalAgentReadmeBlobRefs: string[];
  kubernetesOperationalAgentBuildWorkflowRefs: string[];
  kubernetesOperationalAgentAgentModuleRefs: string[];
  kubernetesOperationalAgentMcpServerModuleRefs: string[];
  kubernetesOperationalAgentToolModuleRefs: string[];
  kubernetesOperationalAgentToolCategoryIds: string[];
  kubernetesOperationalAgentDiagnosticCapabilityIds: string[];
  kubernetesOperationalAgentResourceMetricIds: string[];
  kubernetesOperationalAgentLogAnalysisIds: string[];
  kubernetesOperationalAgentMetricNames: string[];
  kubernetesOperationalAgentCiReporterIds: string[];
  kubernetesOperationalAgentReporterFormats: string[];
  kubernetesOperationalAgentToolCategoryCount: number | null;
  kubernetesOperationalAgentDiagnosticCapabilityCount: number | null;
  kubernetesOperationalAgentResourceMetricCount: number | null;
  kubernetesOperationalAgentLogAnalysisCount: number | null;
  kubernetesOperationalAgentRegressionPassRate0to1: number | null;
  kubernetesOperationalAgentReportArtifactHashes: string[];
  secureVibeBenchCoverage: number | null;
  secureVibeBenchSampleSize: number;
  secureVibeBenchMissingSignals: MetricValidationSecureVibeBenchSignal[];
  secureVibeBenchRepositoryRefs: string[];
  secureVibeBenchLicenseRefs: string[];
  secureVibeBenchHomepageRefs: string[];
  secureVibeBenchArxivRefs: string[];
  secureVibeBenchBranchRefs: string[];
  secureVibeBenchCommitRefs: string[];
  secureVibeBenchTreeRefs: string[];
  secureVibeBenchReadmeBlobRefs: string[];
  secureVibeBenchResultsBlobRefs: string[];
  secureVibeBenchDatasetRefs: string[];
  secureVibeBenchFormatExampleRefs: string[];
  secureVibeBenchEvaluationRunnerRefs: string[];
  secureVibeBenchAgentAdapterIds: string[];
  secureVibeBenchVulnerabilityScenarioIds: string[];
  secureVibeBenchTestScriptIds: string[];
  secureVibeBenchParserUtilityRefs: string[];
  secureVibeBenchPatchDiffUtilityRefs: string[];
  secureVibeBenchMetricNames: string[];
  secureVibeBenchCiReporterIds: string[];
  secureVibeBenchReporterFormats: string[];
  secureVibeBenchAgentAdapterCount: number | null;
  secureVibeBenchScenarioCount: number | null;
  secureVibeBenchTestScriptCount: number | null;
  secureVibeBenchRegressionPassRate0to1: number | null;
  secureVibeBenchReportArtifactHashes: string[];
  ravigBenchCoverage: number | null;
  ravigBenchSampleSize: number;
  ravigBenchMissingSignals: MetricValidationRavigBenchSignal[];
  ravigBenchRepositoryRefs: string[];
  ravigBenchLicenseRefs: string[];
  ravigBenchBranchRefs: string[];
  ravigBenchCommitRefs: string[];
  ravigBenchTreeRefs: string[];
  ravigBenchReadmeBlobRefs: string[];
  ravigBenchLegalBlobRefs: string[];
  ravigBenchEnvironmentRefs: string[];
  ravigBenchConfigurationRefs: string[];
  ravigBenchContentEvaluationRefs: string[];
  ravigBenchDesignEvaluationRefs: string[];
  ravigBenchExecutionEvaluationRefs: string[];
  ravigBenchFunctionScoringRefs: string[];
  ravigBenchDatasetRefs: string[];
  ravigBenchTestCaseRefs: string[];
  ravigBenchModelResultRefs: string[];
  ravigBenchTaxonomyIds: string[];
  ravigBenchRetrievalContextIds: string[];
  ravigBenchMultiModalEvaluatorIds: string[];
  ravigBenchScreenshotEvaluationRefs: string[];
  ravigBenchRunScriptRefs: string[];
  ravigBenchMetricNames: string[];
  ravigBenchCiReporterIds: string[];
  ravigBenchReporterFormats: string[];
  ravigBenchDatasetCaseCount: number | null;
  ravigBenchVisualDesignCheckCount: number | null;
  ravigBenchEvaluatorCount: number | null;
  ravigBenchValidationPassRate0to1: number | null;
  ravigBenchReportArtifactHashes: string[];
  humanStudyBenchCoverage: number | null;
  humanStudyBenchSampleSize: number;
  humanStudyBenchMissingSignals: MetricValidationHumanStudyBenchSignal[];
  humanStudyBenchRepositoryRefs: string[];
  humanStudyBenchLicenseRefs: string[];
  humanStudyBenchBranchRefs: string[];
  humanStudyBenchCommitRefs: string[];
  humanStudyBenchStudyConfigIds: string[];
  humanStudyBenchBackgroundDatasetIds: string[];
  humanStudyBenchHumanResponseDatasetIds: string[];
  humanStudyBenchAgentResponseDatasetIds: string[];
  humanStudyBenchEvaluatorIds: string[];
  humanStudyBenchMetricNames: string[];
  humanStudyBenchValidatorIds: string[];
  humanStudyBenchScorerIds: string[];
  humanStudyBenchStandardizerIds: string[];
  humanStudyBenchReliabilityReportIds: string[];
  humanStudyBenchValidationPipelineIds: string[];
  humanStudyBenchResultArtifactIds: string[];
  humanStudyBenchCiReporterIds: string[];
  humanStudyBenchReporterFormats: string[];
  humanStudyBenchStudyCount: number | null;
  humanStudyBenchParticipantCount: number | null;
  humanStudyBenchResponseCount: number | null;
  humanStudyBenchEvaluatorCount: number | null;
  humanStudyBenchInterRaterAgreement0to1: number | null;
  humanStudyBenchTestRetestReliability0to1: number | null;
  humanStudyBenchValidationPassRate0to1: number | null;
  humanStudyBenchReportArtifactHashes: string[];
  legacyBenchCoverage: number | null;
  legacyBenchSampleSize: number;
  legacyBenchMissingSignals: MetricValidationLegacyBenchSignal[];
  legacyBenchRepositoryRefs: string[];
  legacyBenchLicenseRefs: string[];
  legacyBenchBranchRefs: string[];
  legacyBenchCommitRefs: string[];
  legacyBenchTreeRefs: string[];
  legacyBenchReadmeBlobRefs: string[];
  legacyBenchTaskCorpusRefs: string[];
  legacyBenchLegacyLanguageIds: string[];
  legacyBenchEnvironmentIds: string[];
  legacyBenchHarnessRunnerIds: string[];
  legacyBenchAgentTaskIds: string[];
  legacyBenchPatchSubmissionIds: string[];
  legacyBenchTestOracleIds: string[];
  legacyBenchEvaluatorIds: string[];
  legacyBenchMetricNames: string[];
  legacyBenchCiReporterIds: string[];
  legacyBenchReporterFormats: string[];
  legacyBenchResultArtifactIds: string[];
  legacyBenchReplayCommandIds: string[];
  legacyBenchTaskCount: number | null;
  legacyBenchLanguageCount: number | null;
  legacyBenchEnvironmentCount: number | null;
  legacyBenchTestOracleCount: number | null;
  legacyBenchEvaluatorCount: number | null;
  legacyBenchRegressionPassRate0to1: number | null;
  legacyBenchReplayPassRate0to1: number | null;
  legacyBenchReportArtifactHashes: string[];
  subtleMemoryCoverage: number | null;
  subtleMemorySampleSize: number;
  subtleMemoryMissingSignals: MetricValidationSubtleMemorySignal[];
  subtleMemoryRepositoryRefs: string[];
  subtleMemoryLicenseRefs: string[];
  subtleMemoryBranchRefs: string[];
  subtleMemoryCommitRefs: string[];
  subtleMemoryTreeRefs: string[];
  subtleMemoryArxivRefs: string[];
  subtleMemoryDatasetRefs: string[];
  subtleMemoryPersonaIds: string[];
  subtleMemoryBenchInstanceManifestIds: string[];
  subtleMemoryHistorySessionManifestIds: string[];
  subtleMemoryRelationTypes: string[];
  subtleMemoryConstructionPipelineIds: string[];
  subtleMemoryEvaluationStageIds: string[];
  subtleMemoryAdapterIds: string[];
  subtleMemoryJudgeIds: string[];
  subtleMemoryEvaluatorIds: string[];
  subtleMemoryMetricNames: string[];
  subtleMemoryScoreSummaryIds: string[];
  subtleMemoryDiagnosticProtocolIds: string[];
  subtleMemoryCiReporterIds: string[];
  subtleMemoryReporterFormats: string[];
  subtleMemoryPersonaCount: number | null;
  subtleMemoryBenchInstanceCount: number | null;
  subtleMemoryHistoryCount: number | null;
  subtleMemoryMemoryVariantSetCount: number | null;
  subtleMemoryRelationTypeCount: number | null;
  subtleMemoryEvaluationStageCount: number | null;
  subtleMemoryAdapterCount: number | null;
  subtleMemoryJudgeAgreement0to1: number | null;
  subtleMemoryValidationPassRate0to1: number | null;
  subtleMemoryReportArtifactHashes: string[];
  status: MetricValidationRow["status"];
  confidenceInterval: MetricValidationConfidenceInterval;
  evidenceRefs: string[];
  signedEvidenceRefs: QuestionScoreSignedEvidenceRef[];
  warnings: string[];
  rowHash: string;
}

export interface MetricValidationEvalPackManifest {
  packId: string;
  reportId: string;
  agentId: string;
  createdAt: string;
  datasetHash: string;
  sourceRefs: string[];
  rowCount: number;
  replayable: boolean;
  rows: MetricValidationEvalPackRow[];
  manifestHash: string;
}

export interface MetricValidationCiGate {
  mode: "ci" | "lifecycle";
  passed: boolean;
  failClosed: boolean;
  failedMetricIds: string[];
  attentionMetricIds: string[];
  summary: string;
}

export interface MetricValidationReport {
  generatedAt: string;
  agentId: string;
  runId: string;
  thresholdPolicy: {
    minSampleSize: number;
    minConstructValidity: number;
    minCounterfactualResponsiveness: number;
    minValidationFacetCoverage: number;
    minConfounderControlCoverage: number;
    minOutcomeAlignment: number;
    minProcessEvidenceCoverage: number;
    minSafetyUtilityCoverage: number;
    minModalityTransformationCoverage: number;
    minLifecycleObservabilityCoverage: number;
    minRankingStabilityCoverage: number;
    minToolSandboxCoverage: number;
    minContinualLearningCoverage: number;
    minStrategicInteractionCoverage: number;
    minArchitectureRealityCoverage: number;
    minRagPipelineCoverage: number;
    minRagEvaluationPipelineCoverage: number;
    minRagasNotebookCoverage: number;
    minMirageRagMetricCoverage: number;
    minGuardbenchMetricCoverage: number;
    minBusinessWorkflowCoverage: number;
    minDataAgentAnalyticalCoverage: number;
    minLivingEnvironmentCoverage: number;
    minMobileAgentCoverage: number;
    minPersonaAgentCoverage: number;
    minBioinformaticsAgentCoverage: number;
    minMirageDrugRepositioningCoverage: number;
    minWebEvalDatasetCoverage: number;
    minChipBenchmarkCoverage: number;
    minHermesBenchCoverage: number;
    minHermesBenchTaskCount: number;
    minHermesBenchAdapterCount: number;
    minHermesBenchBackendTestCount: number;
    minHermesBenchFrontendTestCount: number;
    minHermesBenchJudgeAgreement0to1: number;
    minHermesBenchRegressionPassRate0to1: number;
    minCooperBenchCoverage: number;
    minCooperBenchTaskCount: number;
    minCooperBenchFeatureCount: number;
    minCooperBenchAgentAdapterCount: number;
    minCooperBenchTestCount: number;
    minCooperBenchCooperationScore0to1: number;
    minCooperBenchConflictResolutionRate0to1: number;
    minCooperBenchRegressionPassRate0to1: number;
    minAgenticGraphRagCoverage: number;
    minAgenticGraphRagGraphNodeCount: number;
    minAgenticGraphRagEvaluationMetricCount: number;
    minAgenticGraphRagExperimentCount: number;
    minAgenticGraphRagRetrievalGroundingScore0to1: number;
    minAgenticGraphRagRegressionPassRate0to1: number;
    minAgentScenarioTestCoverage: number;
    minOpenCodeLabCoverage: number;
    minCcPluginEvalCoverage: number;
    minCcPluginEvalTriggerAccuracy0to1: number;
    maxCcPluginEvalFalsePositiveRate0to1: number;
    maxCcPluginEvalFalseNegativeRate0to1: number;
    minRealignSimulationCoverage: number;
    minRealignSimulationJudgeAgreement0to1: number;
    minRealignSimulationRegressionPassRate0to1: number;
    minAcademiClawCoverage: number;
    minAcademiClawTaskCount: number;
    minAcademiClawLanguageCount: number;
    minAcademiClawRubricCount: number;
    minAcademiClawTraceCount: number;
    minAcademiClawMetaEvalCount: number;
    minAcademiClawModelCount: number;
    minAcademiClawRegressionPassRate0to1: number;
    minRagChunkingTechniqueCoverage: number;
    minRagChunkingTechniquePolicyDocumentCount: number;
    minRagChunkingTechniqueNotebookCount: number;
    minRagChunkingTechniqueChunkingStrategyCount: number;
    minRagChunkingTechniqueEvaluationQuestionCount: number;
    minRagChunkingTechniqueMetricCount: number;
    minRagChunkingTechniqueRegressionPassRate0to1: number;
    minSubtleMemoryCoverage: number;
    minSubtleMemoryPersonaCount: number;
    minSubtleMemoryBenchInstanceCount: number;
    minSubtleMemoryMemoryVariantSetCount: number;
    minSubtleMemoryRelationTypeCount: number;
    minSubtleMemoryEvaluationStageCount: number;
    minSubtleMemoryAdapterCount: number;
    minSubtleMemoryJudgeAgreement0to1: number;
    minSubtleMemoryValidationPassRate0to1: number;
    maxConfidenceIntervalWidth: number;
  };
  failClosed: boolean;
  rows: MetricValidationRow[];
  warnings: string[];
  evalPack: MetricValidationEvalPackManifest;
  ciGate: MetricValidationCiGate;
}

export interface RunDiagnosticInput {
  workspace: string;
  window: string;
  targetName?: string;
  claimMode?: "auto" | "owner" | "harness";
  runtimeForHarness?: RuntimeName;
  agentId?: string;
  noSign?: boolean; // Skip vault/artifact signing — report still generates, just unsigned
  questionSetVersion?: string;
  applyIndustryPackWeights?: boolean;
}

export interface DiagnosticReport {
  agentId: string;
  runId: string;
  ts: number;
  windowStartTs: number;
  windowEndTs: number;
  status: "VALID" | "INVALID" | "UNSIGNED";
  verificationPassed: boolean;
  trustBoundaryViolated: boolean;
  trustBoundaryMessage: string | null;
  integrityIndex: number;
  trustLabel: TrustLabel;
  targetProfileId: string | null;
  layerScores: LayerScore[];
  questionScores: QuestionScore[];
  inflationAttempts: { questionId: string; claimed: number; supported: number }[];
  unsupportedClaimCount: number;
  contradictionCount: number;
  correlationRatio: number;
  invalidReceiptsCount: number;
  correlationWarnings: string[];
  evidenceCoverage: number;
  evidenceTrustCoverage: {
    observed: number;
    attested: number;
    selfReported: number;
  };
  autonomyAllowanceIndex?: number;
  dualityCompliance?: {
    executeWithValidTicket: number;
    executeAttempted: number;
    ratio: number;
  };
  toolHubUsage?: {
    toolActionCount: number;
    toolResultCount: number;
    deniedActionCount: number;
  };
  approvalHygiene?: {
    requested: number;
    approved: number;
    denied: number;
    expired: number;
    consumed: number;
    replayAttempts: number;
  };
  whatIfReadiness?: {
    activeTargetProfileId: string | null;
    lastTargetUpdatedTs: number | null;
    signerFingerprint: string | null;
  };
  targetDiff: { questionId: string; current: number; target: number; gap: number }[];
  prioritizedUpgradeActions: string[];
  recommendationControls?: RecommendationConfidenceControl[];
  confidenceSummary?: DiagnosticConfidenceSummary;
  questionSet?: DiagnosticQuestionSetInfo;
  methodology?: DiagnosticMethodologyManifest;
  methodologyVersioning?: DiagnosticMethodologyVersioningReceipt;
  metricValidation?: MetricValidationReport;
  questionExplainability?: QuestionScoreExplainabilityReport;
  evidenceToCollectNext: string[];
  runSealSig: string;
  reportJsonSha256: string;
}

export interface GuardCheckResult {
  pass: boolean;
  requiredRemediations: string[];
  requiredEscalations: string[];
  requiredVerificationSteps: string[];
  requiredEvidenceToProceed: string[];
}

export interface UpgradeTask {
  questionId: string;
  current: number;
  target: number;
  gap: number;
  reason: string;
  implementation: string[];
  acceptanceCriteria: string[];
  requiredEvidence: string[];
}

export interface UpgradePlan {
  mode: "target" | "excellence";
  targetProfileId: string;
  phases: {
    phase: string;
    tasks: UpgradeTask[];
  }[];
  ownerTasks: string[];
  agentTasks: string[];
  guardrailsPatch: string;
  promptAddendumPatch: string;
  evalHarnessPatch: string;
}

export interface RuntimeConfig {
  command: string;
  argsTemplate: string[];
}

export type AMCConfigProfileName = "dev" | "ci" | "prod";

export interface AMCConfig {
  profile?: AMCConfigProfileName;
  runtimes: {
    claude: RuntimeConfig;
    gemini: RuntimeConfig;
    openclaw: RuntimeConfig;
    mock: RuntimeConfig;
    any: RuntimeConfig;
  };
  security: {
    trustBoundaryMode: "isolated" | "shared";
  };
  supervise: {
    extraEnv: Record<string, string>;
    includeProxyEnv: boolean;
    customBaseUrlEnvKeys: string[];
  };
}

export interface GatePolicy {
  minIntegrityIndex: number;
  minOverall: number;
  minLayer: Record<LayerName, number>;
  requireObservedForLevel5: boolean;
  denyIfLowTrust: boolean;
  minValueScore?: number;
  minEconomicSignificanceIndex?: number;
  denyIfValueRegression?: boolean;
  maxCostIncreaseRatio?: number;
  requireExperimentPass?: {
    enabled: boolean;
    experimentId: string;
    minUpliftSuccessRate: number;
    minUpliftValuePoints: number;
  };
}

export interface AssuranceScenarioResult {
  scenarioId: string;
  title: string;
  category: string;
  riskTier: RiskTier | "all";
  prompt: string;
  response: string;
  pass: boolean;
  score0to5: number;
  score0to100: number;
  reasons: string[];
  correlatedRequestIds: string[];
  evidenceEventIds: string[];
  auditEventTypes: string[];
}

export interface AssurancePackResult {
  packId: string;
  title: string;
  scenarioCount: number;
  passCount: number;
  failCount: number;
  score0to100: number;
  trustTier: TrustTier;
  scenarioResults: AssuranceScenarioResult[];
}

export interface AssuranceReport {
  assuranceRunId: string;
  agentId: string;
  ts: number;
  mode: "supervise" | "sandbox";
  windowStartTs: number;
  windowEndTs: number;
  trustTier: TrustTier;
  status: "VALID" | "INVALID" | "UNSIGNED";
  verificationPassed: boolean;
  packResults: AssurancePackResult[];
  overallScore0to100: number;
  integrityIndex: number;
  trustLabel: TrustLabel;
  reportJsonSha256: string;
  runSealSig: string;
}

export interface BundleManifestFile {
  path: string;
  sha256: string;
  size: number;
}

export interface BundleManifest {
  schemaVersion: 1;
  runId: string;
  agentId: string;
  windowStartTs: number;
  windowEndTs: number;
  publicKeyFingerprints: {
    monitor: string[];
    auditor: string[];
  };
  files: BundleManifestFile[];
}

export type OutcomeCategory = "Emotional" | "Functional" | "Economic" | "Brand" | "Lifetime";

export type OutcomeSignalTrustTier = "OBSERVED" | "ATTESTED" | "SELF_REPORTED";

export interface OutcomeEvent {
  outcome_event_id: string;
  ts: number;
  agent_id: string;
  work_order_id: string | null;
  category: OutcomeCategory;
  metric_id: string;
  value: string;
  unit: string | null;
  trust_tier: OutcomeSignalTrustTier;
  source: "toolhub" | "webhook" | "manual" | "import";
  meta_json: string;
  prev_event_hash: string;
  event_hash: string;
  signature: string;
  receipt_id: string;
  receipt: string;
  payload_sha256: string;
}

export interface OutcomeContractRecord {
  contract_id: string;
  agent_id: string;
  file_path: string;
  sha256: string;
  sig_valid: number;
  created_ts: number;
  signer_fpr: string;
}

export interface OutcomeMetricResult {
  metricId: string;
  category: OutcomeCategory;
  measuredValue: number | string | boolean | null;
  sampleSize: number;
  trustCoverage: {
    observed: number;
    attested: number;
    selfReported: number;
  };
  status: "SATISFIED" | "PARTIAL" | "MISSING" | "UNKNOWN";
  reasons: string[];
  evidenceRefs: string[];
  checklist: string[];
}

export interface OutcomeReport {
  reportId: string;
  agentId: string;
  ts: number;
  windowStartTs: number;
  windowEndTs: number;
  contractId: string | null;
  contractSignatureValid: boolean;
  trustLabel: "TRUSTED" | "UNTRUSTED CONFIG";
  valueScore: number;
  categoryScores: Record<OutcomeCategory, number>;
  economicSignificanceIndex: number;
  valueRegressionRisk: number;
  observedCoverageRatio: number;
  metrics: OutcomeMetricResult[];
  nonClaims: string[];
  reportJsonSha256: string;
  reportSealSig: string;
}

export interface CasebookRunCaseResult {
  caseId: string;
  title: string;
  baselineSuccess: boolean;
  candidateSuccess: boolean;
  baselineValuePoints: number;
  candidateValuePoints: number;
  baselineCost: number;
  candidateCost: number;
  reasons: string[];
}

export interface ExperimentReport {
  experimentId: string;
  agentId: string;
  ts: number;
  mode: "supervise" | "sandbox";
  casebookId: string;
  baselineConfigId: string;
  candidateConfigId: string;
  runId: string;
  cases: CasebookRunCaseResult[];
  baselineSuccessRate: number;
  candidateSuccessRate: number;
  upliftSuccessRate: number;
  baselineValuePointsAvg: number;
  candidateValuePointsAvg: number;
  upliftValuePoints: number;
  baselineCostPerSuccess: number;
  candidateCostPerSuccess: number;
  confidenceInterval95: [number, number];
  effectSize: number;
  reportJsonSha256: string;
  reportSealSig: string;
}

export interface CalibrationBin {
  binIndex: number;
  binLowerBound: number;
  binUpperBound: number;
  avgConfidence: number;
  avgAccuracy: number;
  sampleCount: number;
}

export interface CalibrationReport {
  agentId: string;
  windowRunIds: string[];
  numRuns: number;
  numQuestionScorePairs: number;
  expectedCalibrationError: number;
  maxCalibrationError: number;
  brierScore: number;
  bins: CalibrationBin[];
  overconfidentQuestions: string[];
  underconfidentQuestions: string[];
  ts: number;
}

export interface ConfidenceDriftEntry {
  questionId: string;
  runId: string;
  ts: number;
  confidence: number;
  finalLevel: number;
  calibratedConfidence: number | null;
}

export interface ConfidenceDriftReport {
  agentId: string;
  questionId: string;
  entries: ConfidenceDriftEntry[];
  trendDirection: "IMPROVING" | "DEGRADING" | "STABLE" | "INSUFFICIENT_DATA";
  avgConfidenceFirst5: number | null;
  avgConfidenceLast5: number | null;
  confidenceDelta: number | null;
}

// Re-export Claim types for public API
export type {
  ClaimProvenanceTag,
  ClaimLifecycleState,
  Claim,
  ClaimTransition
} from "./claims/claimTypes.js";

// Re-export Incident types for public API
export type {
  IncidentSeverity,
  IncidentState,
  CausalRelationship,
  CausalEdge,
  Incident,
  IncidentTransition
} from "./incidents/incidentTypes.js";
