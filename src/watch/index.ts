// New: Production Monitoring (AMC-47)
export { ContinuousMonitor, createContinuousMonitor, type ContinuousMonitorConfig, type MonitoringMetrics, type MonitoringEvent } from "./continuousMonitor.js";
export { DashboardFeed, globalDashboardFeed, type DashboardMetricsSnapshot } from "./dashboardFeed.js";

// Existing watch module re-exports (named)
export { AgentBus, type AgentMessage } from "./agentBus.js";
export { attestOutput, type AttestationResult } from "./outputAttestation.js";
export { createPacket, verifyPacket, type ExplainabilityPacket, type ExplainabilityClaim } from "./explainabilityPacket.js";
export { runSafetyTests, type SafetyTestResult } from "./safetyTestkit.js";
export { checkHostHardening, runHardeningChecks } from "./hostHardening.js";
export type { Finding, HardeningResult } from "./hostHardening.js";
export { MultiTenantVerifier } from "./multiTenantVerifier.js";
export { PolicyPackRegistry, createPolicyPackCompat, validatePolicyPack } from "./policyPacks.js";
export type { PolicyPack, ApplyResult } from "./policyPacks.js";
export { exportEvent, exportBatch, exportToSiem } from "./siemExporter.js";
export type { AuditEvent, SiemExportResult, SiemBatchResult } from "./siemExporter.js";
export { verifyTenantBoundary } from "./multiTenantVerifier.js";
export { createPolicyPackCompat as createPolicyPack } from "./policyPacks.js";
export type { SiemEvent } from "./stubs.js";

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
