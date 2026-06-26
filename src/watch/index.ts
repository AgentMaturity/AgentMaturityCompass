// New: Production Monitoring (AMC-47)
export { ContinuousMonitor, createContinuousMonitor, type ContinuousMonitorConfig, type MonitoringMetrics, type MonitoringEvent } from "./continuousMonitor.js";
export { DashboardFeed, globalDashboardFeed, type DashboardMetricsSnapshot } from "./dashboardFeed.js";

// Existing watch module re-exports (named)
export { AgentBus, type AgentMessage } from "./agentBus.js";
export { attestOutput, type AttestationResult } from "./outputAttestation.js";
export { createPacket, verifyPacket, type ExplainabilityPacket, type ExplainabilityClaim } from "./explainabilityPacket.js";
export {
  listSafetyTestCategories,
  runSafetyTests,
  type SafetyScenarioResult,
  type SafetyTestResult,
  type SafetyTestRunOptions,
} from "./safetyTestkit.js";
export { checkHostHardening, runHardeningChecks } from "./hostHardening.js";
export type { Finding, HardeningResult } from "./hostHardening.js";
export { MultiTenantVerifier } from "./multiTenantVerifier.js";
export { PolicyPackRegistry, createPolicyPackCompat, validatePolicyPack } from "./policyPacks.js";
export type { PolicyPack, ApplyResult } from "./policyPacks.js";
export { exportEvent, exportBatch, exportToSiem } from "./siemExporter.js";
export type { AuditEvent, SiemExportResult, SiemBatchResult } from "./siemExporter.js";
export { verifyTenantBoundary } from "./multiTenantVerifier.js";
export { createPolicyPackCompat as createPolicyPack } from "./policyPacks.js";
// Legacy SIEM compatibility type kept inline for stable imports.
export type SiemEvent = { eventId: string; category: string; severity: string; timestamp: Date; };

// ── Observability Bridge (connect external platforms to AMC scoring) ──
export {
  ObservabilityBridge,
  createObservabilityBridge,
  createProviderAdapter,
  OTLPAdapter,
  LangfuseAdapter,
  HeliconeAdapter,
  DatadogAdapter,
  WebhookAdapter,
  estimateCost,
} from "./observabilityBridge.js";
export type {
  NormalizedTrace,
  NormalizedSpan,
  TraceStatus,
  ObservabilityProvider,
  ProviderConfig,
  ProviderAdapter,
  ObservabilityBridgeConfig,
} from "./observabilityBridge.js";

// ── Real-Time Assurance (live trace evaluation) ──
export {
  RealtimeAssuranceEngine,
  createRealtimeAssuranceEngine,
} from "./realtimeAssurance.js";
export type {
  RealtimeAssuranceCheck,
  RealtimeAssuranceResult,
  RealtimeAssuranceViolation,
  RealtimeAssuranceConfig,
  AssuranceCheckSeverity,
  CheckContext,
} from "./realtimeAssurance.js";

// ── Behavioral Profiler (ML anomaly detection, trust degradation alerts) ──
export { BehavioralProfiler } from './behavioralProfiler.js';
export type {
  BehavioralEvent,
  BehavioralProfile,
  BehavioralAnomaly,
  TrustDegradationAlert,
  BehavioralProfilerConfig,
} from './behavioralProfiler.js';
export {
  buildProviderDriftWatchAlerts,
  type ProviderDriftWatchAlert,
} from './providerDriftAlerts.js';
export {
  buildOverrideNearMissAnalyticsReceipt,
  buildOverrideNearMissWatchAlerts,
  type BuildOverrideNearMissAnalyticsReceiptInput,
  type OverrideNearMissAlertSeverity,
  type OverrideNearMissAnalyticsReceipt,
  type OverrideNearMissEvent,
  type OverrideNearMissEventType,
  type OverrideNearMissFailureCluster,
  type OverrideNearMissLiveTrends,
  type OverrideNearMissReceiptStatus,
  type OverrideNearMissTraceIndex,
  type OverrideNearMissTraceIndexEntry,
  type OverrideNearMissTrendWindow,
  type OverrideNearMissWatchAlert,
  type RepeatedApprovalPattern,
} from './overrideNearMissAnalytics.js';
export {
  runPromptLayerProviderDrift,
  type PromptLayerProviderDriftMetadata,
  type PromptLayerProviderDriftProof,
  type PromptLayerProviderDriftResult,
  type PromptLayerProviderDriftSide,
  type RunPromptLayerProviderDriftInput,
} from './promptLayerProviderDrift.js';
export {
  HUMANLOOP_PROVIDER_DRIFT_SOURCE_REFS,
  runHumanloopProviderDrift,
  type HumanloopProviderDriftMetadata,
  type HumanloopProviderDriftProof,
  type HumanloopProviderDriftResult,
  type HumanloopProviderDriftScoreSurface,
  type HumanloopProviderDriftShieldSurface,
  type HumanloopProviderDriftSide,
  type HumanloopProviderDriftWatchSurface,
  type RunHumanloopProviderDriftInput,
} from './humanloopProviderDrift.js';
export {
  runPromptfooProviderDrift,
  type PromptfooProviderDriftMetadata,
  type PromptfooProviderDriftProof,
  type PromptfooProviderDriftResult,
  type PromptfooProviderDriftSide,
  type RunPromptfooProviderDriftInput,
} from './promptfooProviderDrift.js';
export {
  PATRONUS_PROVIDER_DRIFT_SOURCE_REFS,
  runPatronusProviderDrift,
  type PatronusProviderDriftMetadata,
  type PatronusProviderDriftProof,
  type PatronusProviderDriftResult,
  type PatronusProviderDriftScoreSurface,
  type PatronusProviderDriftShieldSurface,
  type PatronusProviderDriftSide,
  type PatronusProviderDriftWatchSurface,
  type RunPatronusProviderDriftInput,
} from './patronusProviderDrift.js';
export {
  INSPECT_PROVIDER_DRIFT_SOURCE_REFS,
  runInspectProviderDrift,
  type InspectProviderDriftMetadata,
  type InspectProviderDriftProof,
  type InspectProviderDriftResult,
  type InspectProviderDriftScoreSurface,
  type InspectProviderDriftShieldSurface,
  type InspectProviderDriftSide,
  type InspectProviderDriftWatchSurface,
  type RunInspectProviderDriftInput,
} from './inspectProviderDrift.js';
export {
  TENSORZERO_PROVIDER_DRIFT_SOURCE_REFS,
  runTensorZeroProviderDrift,
  type RunTensorZeroProviderDriftInput,
  type TensorZeroProviderDriftMetadata,
  type TensorZeroProviderDriftProof,
  type TensorZeroProviderDriftResult,
  type TensorZeroProviderDriftScoreSurface,
  type TensorZeroProviderDriftShieldSurface,
  type TensorZeroProviderDriftSide,
  type TensorZeroProviderDriftWatchSurface,
} from './tensorZeroProviderDrift.js';
export {
  HELM_PROVIDER_DRIFT_SOURCE_REFS,
  runHelmProviderDrift,
  type HelmProviderDriftMetadata,
  type HelmProviderDriftProof,
  type HelmProviderDriftResult,
  type HelmProviderDriftScoreSurface,
  type HelmProviderDriftShieldSurface,
  type HelmProviderDriftSide,
  type HelmProviderDriftWatchSurface,
  type RunHelmProviderDriftInput,
} from './helmProviderDrift.js';
export {
  LMNR_OBSERVABILITY_METADATA,
  runLmnrObservabilityLiveDrift,
  type LmnrObservabilityDriftStatistic,
  type LmnrObservabilityLiveDriftResult,
  type LmnrObservabilityLiveDriftRow,
  type LmnrObservabilityMetadataProof,
  type LmnrObservabilitySignal,
  type LmnrObservabilityRowProof,
  type LmnrObservabilitySurface,
  type RunLmnrObservabilityLiveDriftInput,
} from './lmnrObservabilityLiveDrift.js';
export {
  BISHENG_OBSERVABILITY_METADATA,
  buildBishengObservabilityScoreSurface,
  buildBishengObservabilityShieldSurface,
  buildBishengObservabilityWatchSurface,
  runBishengObservabilityLiveDrift,
  type BishengObservabilityDriftStatistic,
  type BishengObservabilityLiveDriftResult,
  type BishengObservabilityLiveDriftRow,
  type BishengObservabilityMetadataProof,
  type BishengObservabilityRowProof,
  type BishengObservabilityScoreSurface,
  type BishengObservabilityShieldSurface,
  type BishengObservabilitySignal,
  type BishengObservabilitySurface,
  type BishengObservabilityWatchSurface,
  type RunBishengObservabilityLiveDriftInput,
} from './bishengObservabilityLiveDrift.js';
export {
  buildLiveDriftWatchAlerts,
  defaultLiveDriftThresholds,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveBehaviorDrift,
  type LiveDriftAlert,
  type LiveDriftDistribution,
  type LiveDriftReceipt,
  type LiveDriftReceiptVerification,
  type LiveDriftGenomicsTaskStage,
  type LiveDriftRagEvaluationMode,
  type LiveDriftRagJudgeType,
  type LiveDriftResearchGymRuntime,
  type LiveDriftResearchGymTaskDomain,
  type LiveDriftSampleRow,
  type LiveDriftThresholds,
  type LiveDriftWatchAlert,
  type LiveDriftWindow,
  type LiveScoreDrift,
  type RunLiveScoreBehaviorDriftInput,
} from './liveDriftAlerts.js';
export {
  defaultAwesomeAgentMemoryLiveDriftThresholds,
  runAwesomeAgentMemoryLiveDrift,
  type AwesomeAgentMemoryBehaviorDrift,
  type AwesomeAgentMemoryCategory,
  type AwesomeAgentMemoryDistribution,
  type AwesomeAgentMemoryEvaluationTask,
  type AwesomeAgentMemoryLiveDriftResult,
  type AwesomeAgentMemoryLiveDriftRow,
  type AwesomeAgentMemoryLiveDriftThresholds,
  type AwesomeAgentMemoryReceiptRow,
  type AwesomeAgentMemoryScoreDrift,
  type AwesomeAgentMemoryWindow,
  type RunAwesomeAgentMemoryLiveDriftInput,
} from './awesomeAgentMemoryLiveDrift.js';
export {
  defaultAgentReadingTestLiveDriftThresholds,
  runAgentReadingTestLiveDrift,
  type AgentReadingTestBehaviorDrift,
  type AgentReadingTestContentDeliveryMode,
  type AgentReadingTestDistribution,
  type AgentReadingTestFailureMode,
  type AgentReadingTestLiveDriftResult,
  type AgentReadingTestLiveDriftRow,
  type AgentReadingTestLiveDriftThresholds,
  type AgentReadingTestReceiptRow,
  type AgentReadingTestScoreDrift,
  type AgentReadingTestWindow,
  type RunAgentReadingTestLiveDriftInput,
} from './agentReadingTestLiveDrift.js';
export {
  runPaperReadSkillLiveDrift,
  type PaperReadSkillLiveDriftResult,
  type PaperReadSkillLiveDriftRow,
  type PaperReadSkillRoute,
  type PaperReadSkillRowProof,
  type PaperReadSkillSourceProof,
  type RunPaperReadSkillLiveDriftInput,
} from './paperReadSkillLiveDrift.js';
export {
  runSkillMatchResumeLiveDrift,
  type RunSkillMatchResumeLiveDriftInput,
  type SkillMatchResumeFormat,
  type SkillMatchResumeLiveDriftResult,
  type SkillMatchResumeLiveDriftRow,
  type SkillMatchResumeRowProof,
  type SkillMatchResumeSourceProof,
  type SkillMatchResumeTaskType,
} from './skillMatchLiveDrift.js';
export {
  runDecibenchVoiceLiveDrift,
  type DecibenchVoiceChannel,
  type DecibenchVoiceLiveDriftResult,
  type DecibenchVoiceLiveDriftRow,
  type DecibenchVoiceRowProof,
  type DecibenchVoiceSourceProof,
  type DecibenchVoiceTaskType,
  type RunDecibenchVoiceLiveDriftInput,
} from './decibenchVoiceLiveDrift.js';
export {
  runReflexionAgentLiveDrift,
  type ReflexionAgentLiveDriftResult,
  type ReflexionAgentLiveDriftRow,
  type ReflexionAgentRowProof,
  type ReflexionAgentSourceProof,
  type ReflexionAgentTaskType,
  type RunReflexionAgentLiveDriftInput,
} from './reflexionAgentLiveDrift.js';
export {
  TRISM_AGENTIC_AI_METADATA,
  runTrismAgenticLiveDrift,
  type RunTrismAgenticLiveDriftInput,
  type TrismAgenticDriftStatistic,
  type TrismAgenticLiveDriftResult,
  type TrismAgenticLiveDriftRow,
  type TrismAgenticMetadataProof,
  type TrismAgenticRiskSignal,
  type TrismAgenticRowProof,
  type TrismAgenticSurface,
} from './trismAgenticLiveDrift.js';
export {
  NARROW_TASK_BROAD_MISALIGNMENT_METADATA,
  runNarrowTaskBroadMisalignmentLiveDrift,
  type NarrowTaskBroadMisalignmentDriftStatistic,
  type NarrowTaskBroadMisalignmentLiveDriftResult,
  type NarrowTaskBroadMisalignmentLiveDriftRow,
  type NarrowTaskBroadMisalignmentMetadataProof,
  type NarrowTaskBroadMisalignmentRiskSignal,
  type NarrowTaskBroadMisalignmentRowProof,
  type NarrowTaskBroadMisalignmentSurface,
  type RunNarrowTaskBroadMisalignmentLiveDriftInput,
} from './narrowTaskBroadMisalignmentLiveDrift.js';
export {
  runBraintrustLiveDrift,
  type BraintrustLiveDriftResult,
  type BraintrustLiveDriftRow,
  type BraintrustRowProof,
  type BraintrustSignalSurface,
  type BraintrustSourceProof,
  type RunBraintrustLiveDriftInput,
} from './braintrustLiveDrift.js';
export {
  defaultCtfAgentBenchmarkLiveDriftThresholds,
  runCtfAgentBenchmarkLiveDrift,
  type CtfAgentBenchmarkBehaviorDrift,
  type CtfAgentBenchmarkChallengeCategory,
  type CtfAgentBenchmarkDistribution,
  type CtfAgentBenchmarkLiveDriftResult,
  type CtfAgentBenchmarkLiveDriftRow,
  type CtfAgentBenchmarkLiveDriftThresholds,
  type CtfAgentBenchmarkReceiptRow,
  type CtfAgentBenchmarkRuntimeMode,
  type CtfAgentBenchmarkScoreDrift,
  type CtfAgentBenchmarkWindow,
  type RunCtfAgentBenchmarkLiveDriftInput,
} from './ctfAgentBenchmarkLiveDrift.js';
export {
  defaultLlmFighterLiveDriftThresholds,
  runLlmFighterLiveDrift,
  type LlmFighterBehaviorDrift,
  type LlmFighterDistribution,
  type LlmFighterLiveDriftResult,
  type LlmFighterLiveDriftRow,
  type LlmFighterLiveDriftThresholds,
  type LlmFighterReceiptRow,
  type LlmFighterScoreDrift,
  type LlmFighterWindow,
  type LlmFighterWinner,
  type RunLlmFighterLiveDriftInput,
} from './llmFighterLiveDrift.js';
export {
  defaultDarwinGodelMachineLiveDriftThresholds,
  runDarwinGodelMachineLiveDrift,
  type DarwinGodelMachineBehaviorDrift,
  type DarwinGodelMachineBenchmarkFamily,
  type DarwinGodelMachineDistribution,
  type DarwinGodelMachineLiveDriftResult,
  type DarwinGodelMachineLiveDriftRow,
  type DarwinGodelMachineLiveDriftThresholds,
  type DarwinGodelMachineReceiptRow,
  type DarwinGodelMachineSandboxMode,
  type DarwinGodelMachineScoreDrift,
  type DarwinGodelMachineWindow,
  type RunDarwinGodelMachineLiveDriftInput,
} from './darwinGodelMachineLiveDrift.js';
export {
  defaultRailScoreLiveDriftThresholds,
  runRailScoreLiveDrift,
  type RailScoreBehaviorDrift,
  type RailScoreComplianceFramework,
  type RailScoreDistribution,
  type RailScoreEvaluationDimension,
  type RailScoreGuardrailMode,
  type RailScoreLiveDriftResult,
  type RailScoreLiveDriftRow,
  type RailScoreLiveDriftThresholds,
  type RailScoreReceiptRow,
  type RailScoreScoreDrift,
  type RailScoreWindow,
  type RunRailScoreLiveDriftInput,
} from './railScoreLiveDrift.js';
export {
  defaultGarageLiveDriftThresholds,
  runGarageLiveDrift,
  type GarageBehaviorDrift,
  type GarageDistribution,
  type GarageLiveDriftResult,
  type GarageLiveDriftRow,
  type GarageLiveDriftThresholds,
  type GarageQuestionComplexity,
  type GarageQuestionSource,
  type GarageQuestionType,
  type GarageReceiptRow,
  type GarageScoreDrift,
  type GarageWindow,
  type RunGarageLiveDriftInput,
} from './garageLiveDrift.js';
export {
  defaultAiReputationClaudeLiveDriftThresholds,
  runAiReputationClaudeLiveDrift,
  type AiReputationClaudeBehaviorDrift,
  type AiReputationClaudeDistribution,
  type AiReputationClaudeLiveDriftResult,
  type AiReputationClaudeLiveDriftRow,
  type AiReputationClaudeLiveDriftThresholds,
  type AiReputationClaudeReceiptRow,
  type AiReputationClaudeScoreDrift,
  type AiReputationClaudeWindow,
  type AiReputationPlatform,
  type AiReputationTask,
  type RunAiReputationClaudeLiveDriftInput,
} from './aiReputationClaudeLiveDrift.js';
export {
  runRagTextGenerationLiveDrift,
  type RagTextGenerationLiveDriftResult,
  type RagTextGenerationLiveDriftRow,
  type RagTextGenerationSourceProof,
  type RagTextGenerationWindow,
  type RunRagTextGenerationLiveDriftInput,
} from './ragTextGenerationLiveDrift.js';
