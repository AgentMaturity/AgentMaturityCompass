import type { EvidenceOutcome } from "../types.js";

export interface MetricEvidence {
  outcome: EvidenceOutcome;
  sampleSize: number;
  metricOutcomes: Record<string, EvidenceOutcome>;
}

export type ExternalDependencyKind =
  | "llm_api"
  | "database"
  | "vector_store"
  | "storage"
  | "queue"
  | "webhook"
  | "automation_platform"
  | "identity"
  | "payment"
  | "observability"
  | "unknown";

export interface ExternalDependencyInventoryEntry {
  dependencyId: string;
  kind: ExternalDependencyKind;
  providers: string[];
  versions: string[];
  usageEvents: number;
  failureEvents: number;
  failureRate: number; // 0-1
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  supportsFallback: boolean;
  lastSeenAt: string;
}

export interface ExternalDependencyInventory extends MetricEvidence {
  totalDependencies: number;
  externalEventCount: number;
  dependencyCoverage: number | null; // 0-1 share of guard events tied to external deps
  singlePointsOfFailure: string[];
  dependencies: ExternalDependencyInventoryEntry[];
}

export interface DependencyDriftSignal {
  dependencyId: string;
  driftType: "version" | "error_rate" | "sla_latency";
  severity: "low" | "medium" | "high" | "critical";
  summary: string;
  baseline: number | string | null;
  current: number | string | null;
  delta: number | null;
}

export interface DependencyDriftReport extends MetricEvidence {
  score: number | null; // 0-100 (higher = more stable)
  status: "stable" | "watch" | "degrading" | "critical" | "not_evaluated";
  driftEvents: number;
  versionDriftCount: number;
  slaDegradationCount: number;
  signals: DependencyDriftSignal[];
}

export interface GracefulDegradationScore extends MetricEvidence {
  score: number | null; // 0-100
  failureEvents: number;
  recoveredWithFallback: number;
  degradedModeActivations: number;
  hardFailures: number;
  recoveryRate: number | null; // 0-1
  notes: string[];
}

export interface VendorLockInRiskScore extends MetricEvidence {
  score: number | null; // 0-100 (higher = higher lock-in risk)
  riskLevel: "low" | "medium" | "high" | "critical" | "not_evaluated";
  primaryVendors: string[];
  multiVendorCoverage: number | null; // 0-1
  portableDependencies: number;
  nonPortableDependencies: number;
  lockInDrivers: string[];
  recommendations: string[];
}

export type OperationalIndependenceDomainContext = "generic" | "logistics";

export interface LogisticsReliabilityMetric extends MetricEvidence {
  score: number | null;
  evidenceEvents: number;
  notes: string[];
}

export interface LogisticsReliabilityScore extends MetricEvidence {
  score: number | null;
  status: "ready" | "watch" | "degrading" | "critical" | "not_evaluated";
  logisticsEventCount: number;
  telemetryConfidence: number;
  carriers: string[];
  carrierReliability: LogisticsReliabilityMetric & {
    shipmentEvents: number;
    failedShipmentEvents: number;
    onTimeRate: number | null;
  };
  exceptionManagement: LogisticsReliabilityMetric & {
    exceptionEvents: number;
    resolvedExceptions: number;
    unresolvedExceptions: number;
    avgResolutionHours: number | null;
    exceptionResolutionRate: number | null;
  };
  warehouseIntegrity: LogisticsReliabilityMetric & {
    warehouseEvents: number;
    errorEvents: number;
    inventoryAccuracy: number | null;
  };
  slaPerformance: LogisticsReliabilityMetric & {
    slaEvents: number;
    breachEvents: number;
    breachRate: number | null;
  };
  traceabilityCoverage: LogisticsReliabilityMetric & {
    traceableEvents: number;
    coverage: number | null;
  };
  coldChainIntegrity: LogisticsReliabilityMetric & {
    monitoredEvents: number;
    excursionEvents: number;
    excursionRate: number | null;
  };
  gaps: string[];
  recommendedActions: string[];
}

export interface OperationalIndependenceOptions {
  domain?: string;
}

export interface OperationalIndependenceScore extends MetricEvidence {
  score: number | null; // 0-100
  context: OperationalIndependenceDomainContext;
  longestRunDays: number;
  escalationRate: number | null; // percent
  driftEvents: number;
  qualityHeld: boolean;
  telemetryConfidence: number; // 0-1
  reducedExternalAccessScore: number | null; // 0-100
  externalDependencyInventory: ExternalDependencyInventory;
  dependencyDrift: DependencyDriftReport;
  gracefulDegradation: GracefulDegradationScore;
  vendorLockInRisk: VendorLockInRiskScore;
  logisticsReliability?: LogisticsReliabilityScore;
}

export interface GuardEventLike {
  created_at: string;
  module_code: string;
  decision: string;
  reason: string;
  severity: string;
  meta_json: string | null;
}
