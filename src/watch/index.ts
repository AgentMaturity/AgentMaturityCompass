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
export { exportEvent, exportBatch } from "./siemExporter.js";
export type { AuditEvent, SiemExportResult, SiemBatchResult } from "./siemExporter.js";
export { exportToSiem, verifyTenantBoundary, createPolicyPack } from "./stubs.js";
export type { SiemEvent } from "./stubs.js";

// ── Behavioral Profiler (ML anomaly detection, trust degradation alerts) ──
export { BehavioralProfiler } from './behavioralProfiler.js';
export type {
  BehavioralEvent,
  BehavioralProfile,
  BehavioralAnomaly,
  TrustDegradationAlert,
  BehavioralProfilerConfig,
} from './behavioralProfiler.js';
