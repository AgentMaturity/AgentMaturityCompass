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
}

export interface LayerScore {
  layerName: LayerName;
  avgFinalLevel: number;
  confidenceWeightedFinalLevel: number;
}

export interface RunDiagnosticInput {
  workspace: string;
  window: string;
  targetName?: string;
  claimMode?: "auto" | "owner" | "harness";
  runtimeForHarness?: RuntimeName;
  agentId?: string;
  noSign?: boolean; // Skip vault/artifact signing — report still generates, just unsigned
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
