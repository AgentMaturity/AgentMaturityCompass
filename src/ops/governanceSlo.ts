/**
 * Governance SLOs
 *
 * Track governance decision performance, evaluate explicit governance SLO
 * definitions, surface compliance/alerting signals, and quantify cost-of-trust.
 */

import { randomUUID } from "node:crypto";
import { computeCostOfTrust as computeLatencyCostOfTrust } from "./latencyAccounting.js";
import { generateOverheadReport, type OverheadFeature } from "./overheadAccounting.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SloStatus = "HEALTHY" | "DEGRADED" | "VIOLATED";

export type SloMetricName =
  | "POLICY_DECISION_LATENCY"
  | "APPROVAL_TURNAROUND"
  | "FALSE_BLOCK_RATE"
  | "TICKET_ISSUANCE_TO_USE"
  | "HIGH_RISK_ACTION_REVIEW_LATENCY";

export interface SloTarget {
  metric: SloMetricName;
  targetP95: number; // ms for latency metrics, ratio for rate metrics
  degradedThreshold: number;
  riskLevel?: string; // for per-risk-level targets
}

export interface SloMeasurement {
  id: string;
  metric: SloMetricName;
  value: number;
  ts: number;
  labels: Record<string, string>;
}

export interface SloMetricSummary {
  metric: SloMetricName;
  status: SloStatus;
  count: number;
  p50: number;
  p95: number;
  p99: number;
  target: number;
  degradedThreshold: number;
}

export type GovernanceSloDefinitionMode = "P95_LTE" | "COMPLIANCE_GTE";

export interface GovernanceSloDefinition {
  id: string;
  name: string;
  objective: string;
  metric: SloMetricName;
  mode: GovernanceSloDefinitionMode;
  targetValue: number;
  degradedThreshold: number;
  percentile?: 50 | 90 | 95 | 99;
  thresholdValue?: number;
  labelFilters?: Record<string, string[]>;
}

export interface GovernanceSloDefinitionSummary {
  id: string;
  name: string;
  objective: string;
  metric: SloMetricName;
  mode: GovernanceSloDefinitionMode;
  status: SloStatus;
  sampleSize: number;
  observedValue: number;
  targetValue: number;
  degradedThreshold: number;
  percentile: 50 | 90 | 95 | 99;
  thresholdValue: number | null;
  labelFilters: Record<string, string[]>;
}

export interface SloComplianceSnapshot {
  snapshotId: string;
  ts: number;
  windowMs: number;
  overallStatus: SloStatus;
  definitionStatuses: Array<{
    id: string;
    status: SloStatus;
    sampleSize: number;
    observedValue: number;
    targetValue: number;
  }>;
}

export interface SloAlert {
  alertId: string;
  ts: number;
  severity: "WARN" | "CRITICAL" | "RECOVERY";
  sloId: string;
  previousStatus: SloStatus | null;
  status: SloStatus;
  summary: string;
}

export interface GovernanceDecisionMeasurement {
  decisionId: string;
  actionClass: string;
  riskLevel: string;
  reviewed: boolean;
  reviewLatencyMs: number;
  governanceLatencyMs: number;
  executionLatencyMs: number;
  governanceCostMicroUsd: number;
  executionCostMicroUsd: number;
  riskBeforeMicroUsd: number;
  riskAfterMicroUsd: number;
  ts: number;
}

export interface GovernanceCostOfTrustSummary {
  decisionCount: number;
  reviewedDecisionCount: number;
  governanceLatencyMs: number;
  executionLatencyMs: number;
  latencyOverheadPct: number;
  avgGovernanceLatencyMs: number;
  p95GovernanceLatencyMs: number;
  governanceCostMicroUsd: number;
  costPerDecisionMicroUsd: number;
  costPerReviewedDecisionMicroUsd: number;
  byRiskLevel: Array<{
    riskLevel: string;
    decisions: number;
    governanceLatencyMs: number;
    executionLatencyMs: number;
    latencyOverheadPct: number;
    governanceCostMicroUsd: number;
    costPerDecisionMicroUsd: number;
  }>;
  telemetry: {
    latencyAccountingGovernanceMs: number;
    latencyAccountingGovernancePct: number;
    overheadAccountingGovernanceCostMicroUsd: number;
  };
}

export interface TrustRoiInput {
  decisionCount: number;
  governanceCostMicroUsd: number;
  riskBeforeMicroUsd: number;
  riskAfterMicroUsd: number;
}

export interface TrustRoiSummary {
  decisionCount: number;
  governanceCostMicroUsd: number;
  riskBeforeMicroUsd: number;
  riskAfterMicroUsd: number;
  riskReductionValueMicroUsd: number;
  netValueMicroUsd: number;
  roiPct: number | null;
  paybackRatio: number | null;
  status: "POSITIVE" | "BREAKEVEN" | "NEGATIVE";
}

export interface SloReport {
  reportId: string;
  ts: number;
  windowMs: number;
  overallStatus: SloStatus;
  metrics: SloMetricSummary[];
  definitions: GovernanceSloDefinitionSummary[];
  activeViolations: Array<{ id: string; status: SloStatus; objective: string }>;
  complianceHistorySize: number;
  recentAlerts: SloAlert[];
  costOfTrust: GovernanceCostOfTrustSummary;
  trustRoi: TrustRoiSummary;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_TARGETS: SloTarget[] = [
  { metric: "POLICY_DECISION_LATENCY", targetP95: 100, degradedThreshold: 200 },
  { metric: "APPROVAL_TURNAROUND", targetP95: 300000, degradedThreshold: 600000 },
  { metric: "FALSE_BLOCK_RATE", targetP95: 0.05, degradedThreshold: 0.10 },
  { metric: "TICKET_ISSUANCE_TO_USE", targetP95: 60000, degradedThreshold: 120000 },
  {
    metric: "HIGH_RISK_ACTION_REVIEW_LATENCY",
    targetP95: 3600000,
    degradedThreshold: 5400000,
    riskLevel: "high,critical",
  },
];

const DEFAULT_DEFINITIONS: GovernanceSloDefinition[] = [
  {
    id: "GOV-HIGH-RISK-REVIEW-1H",
    name: "High-Risk Review Timeliness",
    objective: "95% of high-risk actions reviewed within 1 hour",
    metric: "HIGH_RISK_ACTION_REVIEW_LATENCY",
    mode: "COMPLIANCE_GTE",
    thresholdValue: 3600000,
    targetValue: 0.95,
    degradedThreshold: 0.90,
    labelFilters: { riskLevel: ["high", "critical"] },
  },
  {
    id: "GOV-APPROVAL-TURNAROUND-P95",
    name: "Approval Turnaround",
    objective: "P95 approval turnaround stays under 10 minutes",
    metric: "APPROVAL_TURNAROUND",
    mode: "P95_LTE",
    percentile: 95,
    targetValue: 600000,
    degradedThreshold: 900000,
  },
  {
    id: "GOV-POLICY-DECISION-P95",
    name: "Policy Decision Latency",
    objective: "P95 policy decision latency stays under 100ms",
    metric: "POLICY_DECISION_LATENCY",
    mode: "P95_LTE",
    percentile: 95,
    targetValue: 100,
    degradedThreshold: 200,
  },
  {
    id: "GOV-FALSE-BLOCK-RATE",
    name: "False Block Quality",
    objective: "False-block rate stays at or below 5%",
    metric: "FALSE_BLOCK_RATE",
    mode: "P95_LTE",
    percentile: 95,
    targetValue: 0.05,
    degradedThreshold: 0.08,
  },
];

const DEFAULT_WINDOW_MS = 3600000;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const measurements: SloMeasurement[] = [];
const decisions: GovernanceDecisionMeasurement[] = [];
const complianceHistory: SloComplianceSnapshot[] = [];
const alerts: SloAlert[] = [];
const lastDefinitionStatuses = new Map<string, SloStatus>();

const MAX_MEASUREMENTS = 50000;
const MAX_DECISIONS = 50000;
const MAX_COMPLIANCE_SNAPSHOTS = 5000;
const MAX_ALERTS = 5000;

const governanceOverheadFeatures = new Set<OverheadFeature>([
  "POLICY_EVALUATION",
  "APPROVAL_ENGINE",
  "ASSURANCE_CHECK",
  "TRANSPARENCY_LOG",
  "LEASE_VERIFY",
  "BUDGET_EVAL",
]);

let targets: SloTarget[] = DEFAULT_TARGETS.map((target) => normalizeTarget(target));
let definitions: GovernanceSloDefinition[] = DEFAULT_DEFINITIONS.map((definition) => normalizeDefinition(definition));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeWindowMs(windowMs: number): number {
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    return DEFAULT_WINDOW_MS;
  }
  return Math.max(60000, Math.floor(windowMs));
}

function sanitizeRate(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function normalizeSloValue(metric: SloMetricName, value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (metric.includes("RATE")) return sanitizeRate(value);
  return Math.max(0, value);
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

function computeMetricStatus(p95: number, target: SloTarget): SloStatus {
  if (p95 <= target.targetP95) return "HEALTHY";
  if (p95 <= target.degradedThreshold) return "DEGRADED";
  return "VIOLATED";
}

function statusOrder(status: SloStatus): number {
  if (status === "HEALTHY") return 0;
  if (status === "DEGRADED") return 1;
  return 2;
}

function computeOverallStatus(statuses: SloStatus[]): SloStatus {
  if (statuses.length === 0) return "HEALTHY";
  let worst: SloStatus = "HEALTHY";
  for (const status of statuses) {
    if (statusOrder(status) > statusOrder(worst)) {
      worst = status;
    }
  }
  return worst;
}

function normalizeTarget(target: SloTarget): SloTarget {
  const isRate = target.metric.includes("RATE");
  const safeTarget = Number.isFinite(target.targetP95)
    ? (isRate ? sanitizeRate(target.targetP95) : Math.max(0, target.targetP95))
    : 0;
  const safeDegraded = Number.isFinite(target.degradedThreshold)
    ? (isRate ? sanitizeRate(target.degradedThreshold) : Math.max(0, target.degradedThreshold))
    : safeTarget;

  return {
    ...target,
    targetP95: Math.min(safeTarget, safeDegraded),
    degradedThreshold: Math.max(safeTarget, safeDegraded),
  };
}

function normalizeLabelFilters(
  filters: Record<string, string[]> | undefined,
): Record<string, string[]> | undefined {
  if (!filters) return undefined;
  const normalized: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(filters)) {
    if (!key || !Array.isArray(values)) continue;
    const cleaned = values
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0);
    if (cleaned.length > 0) {
      normalized[key] = Array.from(new Set(cleaned));
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeDefinition(definition: GovernanceSloDefinition): GovernanceSloDefinition {
  const isRateMetric = definition.metric.includes("RATE");

  if (definition.mode === "COMPLIANCE_GTE") {
    const healthyTarget = sanitizeRate(definition.targetValue);
    const degradedTarget = sanitizeRate(definition.degradedThreshold);
    const thresholdRaw = definition.thresholdValue ?? (isRateMetric ? healthyTarget : 0);

    return {
      ...definition,
      targetValue: Math.max(healthyTarget, degradedTarget),
      degradedThreshold: Math.min(healthyTarget, degradedTarget),
      percentile: 95,
      thresholdValue: normalizeSloValue(definition.metric, thresholdRaw),
      labelFilters: normalizeLabelFilters(definition.labelFilters),
    };
  }

  const safeTarget = normalizeSloValue(definition.metric, definition.targetValue);
  const safeDegraded = normalizeSloValue(definition.metric, definition.degradedThreshold);
  return {
    ...definition,
    targetValue: Math.min(safeTarget, safeDegraded),
    degradedThreshold: Math.max(safeTarget, safeDegraded),
    percentile: definition.percentile ?? 95,
    thresholdValue:
      definition.thresholdValue === undefined ? undefined : normalizeSloValue(definition.metric, definition.thresholdValue),
    labelFilters: normalizeLabelFilters(definition.labelFilters),
  };
}

function labelMatchesFilter(
  labels: Record<string, string>,
  labelFilters: Record<string, string[]> | undefined,
): boolean {
  if (!labelFilters) return true;
  for (const [key, acceptedValues] of Object.entries(labelFilters)) {
    if (acceptedValues.length === 0) continue;
    const raw = labels[key];
    if (!raw) return false;
    if (!acceptedValues.includes(raw.toLowerCase())) {
      return false;
    }
  }
  return true;
}

function recentMeasurements(windowMs: number): SloMeasurement[] {
  const safeWindowMs = normalizeWindowMs(windowMs);
  const cutoff = Date.now() - safeWindowMs;
  return measurements.filter((measurement) => measurement.ts >= cutoff);
}

function recentDecisions(windowMs: number): GovernanceDecisionMeasurement[] {
  const safeWindowMs = normalizeWindowMs(windowMs);
  const cutoff = Date.now() - safeWindowMs;
  return decisions.filter((decision) => decision.ts >= cutoff);
}

function pushBounded<T>(arr: T[], value: T, max: number): void {
  arr.push(value);
  while (arr.length > max) {
    arr.shift();
  }
}

function buildMetricSummaries(recent: SloMeasurement[]): SloMetricSummary[] {
  const summaries: SloMetricSummary[] = [];

  for (const target of targets) {
    const values = recent.filter((measurement) => measurement.metric === target.metric).map((measurement) => measurement.value);
    const p50 = percentile(values, 50);
    const p95 = percentile(values, 95);
    const p99 = percentile(values, 99);
    const status = values.length > 0 ? computeMetricStatus(p95, target) : "HEALTHY";

    summaries.push({
      metric: target.metric,
      status,
      count: values.length,
      p50,
      p95,
      p99,
      target: target.targetP95,
      degradedThreshold: target.degradedThreshold,
    });
  }

  return summaries;
}

function buildDefinitionSummary(
  definition: GovernanceSloDefinition,
  recent: SloMeasurement[],
): GovernanceSloDefinitionSummary {
  const filtered = recent.filter(
    (measurement) =>
      measurement.metric === definition.metric &&
      labelMatchesFilter(measurement.labels, definition.labelFilters),
  );
  const values = filtered.map((measurement) => measurement.value);

  let observedValue = 0;
  let status: SloStatus = "HEALTHY";

  if (definition.mode === "P95_LTE") {
    observedValue = percentile(values, definition.percentile ?? 95);
    status =
      values.length === 0
        ? "HEALTHY"
        : observedValue <= definition.targetValue
          ? "HEALTHY"
          : observedValue <= definition.degradedThreshold
            ? "DEGRADED"
            : "VIOLATED";
  } else {
    const threshold = definition.thresholdValue ?? 0;
    const compliantCount = values.filter((value) => value <= threshold).length;
    observedValue = values.length === 0 ? 1 : compliantCount / values.length;
    status =
      values.length === 0
        ? "HEALTHY"
        : observedValue >= definition.targetValue
          ? "HEALTHY"
          : observedValue >= definition.degradedThreshold
            ? "DEGRADED"
            : "VIOLATED";
  }

  return {
    id: definition.id,
    name: definition.name,
    objective: definition.objective,
    metric: definition.metric,
    mode: definition.mode,
    status,
    sampleSize: values.length,
    observedValue,
    targetValue: definition.targetValue,
    degradedThreshold: definition.degradedThreshold,
    percentile: definition.percentile ?? 95,
    thresholdValue: definition.thresholdValue ?? null,
    labelFilters: definition.labelFilters ?? {},
  };
}

function buildDefinitionSummaries(recent: SloMeasurement[]): GovernanceSloDefinitionSummary[] {
  return definitions.map((definition) => buildDefinitionSummary(definition, recent));
}

function appendComplianceSnapshot(report: SloReport): SloComplianceSnapshot {
  const snapshot: SloComplianceSnapshot = {
    snapshotId: `sloc_${randomUUID().slice(0, 12)}`,
    ts: Date.now(),
    windowMs: report.windowMs,
    overallStatus: report.overallStatus,
    definitionStatuses: report.definitions.map((definition) => ({
      id: definition.id,
      status: definition.status,
      sampleSize: definition.sampleSize,
      observedValue: definition.observedValue,
      targetValue: definition.targetValue,
    })),
  };

  pushBounded(complianceHistory, snapshot, MAX_COMPLIANCE_SNAPSHOTS);
  return snapshot;
}

function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(2));
}

function microUsdToUsd(valueMicroUsd: number): number {
  return valueMicroUsd / 1000000;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export function configureSloTargets(newTargets: SloTarget[]): void {
  targets = newTargets.map((target) => normalizeTarget(target));
}

export function getSloTargets(): SloTarget[] {
  return targets.map((target) => ({ ...target }));
}

export function configureSloDefinitions(newDefinitions: GovernanceSloDefinition[]): void {
  definitions = newDefinitions.map((definition) => normalizeDefinition(definition));
}

export function getSloDefinitions(): GovernanceSloDefinition[] {
  return definitions.map((definition) => ({
    ...definition,
    labelFilters: definition.labelFilters ? { ...definition.labelFilters } : undefined,
  }));
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

export function recordSloMeasurement(
  metric: SloMetricName,
  value: number,
  labels: Record<string, string> = {},
): SloMeasurement {
  const safeValue = normalizeSloValue(metric, value);
  const safeLabels: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(labels)) {
    if (typeof key === "string" && typeof rawValue === "string" && key.length > 0) {
      safeLabels[key] = rawValue.trim();
    }
  }

  const measurement: SloMeasurement = {
    id: `slo_${randomUUID().slice(0, 12)}`,
    metric,
    value: safeValue,
    ts: Date.now(),
    labels: safeLabels,
  };

  pushBounded(measurements, measurement, MAX_MEASUREMENTS);
  return measurement;
}

export function recordGovernanceDecision(params: {
  actionClass: string;
  riskLevel?: string;
  reviewed?: boolean;
  reviewLatencyMs?: number;
  governanceLatencyMs: number;
  executionLatencyMs: number;
  governanceCostMicroUsd?: number;
  executionCostMicroUsd?: number;
  riskBeforeMicroUsd?: number;
  riskAfterMicroUsd?: number;
}): GovernanceDecisionMeasurement {
  const riskLevel = (params.riskLevel ?? "unknown").trim().toLowerCase() || "unknown";
  const reviewed = Boolean(params.reviewed);
  const reviewLatencyMs = reviewed ? Math.max(0, params.reviewLatencyMs ?? 0) : 0;
  const governanceLatencyMs = Math.max(0, params.governanceLatencyMs);
  const executionLatencyMs = Math.max(0, params.executionLatencyMs);
  const governanceCostMicroUsd = Math.max(0, params.governanceCostMicroUsd ?? 0);
  const executionCostMicroUsd = Math.max(0, params.executionCostMicroUsd ?? 0);
  const riskBeforeMicroUsd = Math.max(0, params.riskBeforeMicroUsd ?? 0);
  const riskAfterMicroUsd = Math.max(0, params.riskAfterMicroUsd ?? 0);

  const decision: GovernanceDecisionMeasurement = {
    decisionId: `govd_${randomUUID().slice(0, 12)}`,
    actionClass: params.actionClass.trim() || "unknown",
    riskLevel,
    reviewed,
    reviewLatencyMs,
    governanceLatencyMs,
    executionLatencyMs,
    governanceCostMicroUsd,
    executionCostMicroUsd,
    riskBeforeMicroUsd,
    riskAfterMicroUsd,
    ts: Date.now(),
  };

  pushBounded(decisions, decision, MAX_DECISIONS);

  recordSloMeasurement("POLICY_DECISION_LATENCY", governanceLatencyMs, {
    actionClass: decision.actionClass,
    riskLevel,
  });

  if (reviewed) {
    recordSloMeasurement("APPROVAL_TURNAROUND", reviewLatencyMs, {
      actionClass: decision.actionClass,
      riskLevel,
    });

    if (riskLevel === "high" || riskLevel === "critical") {
      recordSloMeasurement("HIGH_RISK_ACTION_REVIEW_LATENCY", reviewLatencyMs, {
        actionClass: decision.actionClass,
        riskLevel,
      });
    }
  }

  return decision;
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export function computeGovernanceCostOfTrust(windowMs = DEFAULT_WINDOW_MS): GovernanceCostOfTrustSummary {
  const recent = recentDecisions(windowMs);
  const governanceLatencyMs = recent.reduce((sum, decision) => sum + decision.governanceLatencyMs, 0);
  const executionLatencyMs = recent.reduce((sum, decision) => sum + decision.executionLatencyMs, 0);
  const governanceCostMicroUsd = recent.reduce((sum, decision) => sum + decision.governanceCostMicroUsd, 0);
  const reviewedDecisionCount = recent.filter((decision) => decision.reviewed).length;

  const totalLatency = governanceLatencyMs + executionLatencyMs;
  const latencyOverheadPct = totalLatency > 0 ? round2((governanceLatencyMs / totalLatency) * 100) : 0;

  const governanceLatencies = recent.map((decision) => decision.governanceLatencyMs);

  const byRisk = new Map<
    string,
    {
      decisions: number;
      governanceLatencyMs: number;
      executionLatencyMs: number;
      governanceCostMicroUsd: number;
    }
  >();

  for (const decision of recent) {
    const key = decision.riskLevel;
    const current = byRisk.get(key) ?? {
      decisions: 0,
      governanceLatencyMs: 0,
      executionLatencyMs: 0,
      governanceCostMicroUsd: 0,
    };
    current.decisions += 1;
    current.governanceLatencyMs += decision.governanceLatencyMs;
    current.executionLatencyMs += decision.executionLatencyMs;
    current.governanceCostMicroUsd += decision.governanceCostMicroUsd;
    byRisk.set(key, current);
  }

  const latencyTelemetry = computeLatencyCostOfTrust(windowMs);
  const overheadReport = generateOverheadReport(windowMs);
  const overheadGovernanceCostMicroUsd = overheadReport.featureSummaries
    .filter((summary) => governanceOverheadFeatures.has(summary.feature))
    .reduce((sum, summary) => sum + summary.totalCostMicroUsd, 0);

  return {
    decisionCount: recent.length,
    reviewedDecisionCount,
    governanceLatencyMs,
    executionLatencyMs,
    latencyOverheadPct,
    avgGovernanceLatencyMs:
      recent.length > 0 ? round2(governanceLatencyMs / recent.length) : 0,
    p95GovernanceLatencyMs: percentile(governanceLatencies, 95),
    governanceCostMicroUsd,
    costPerDecisionMicroUsd:
      recent.length > 0 ? round2(governanceCostMicroUsd / recent.length) : 0,
    costPerReviewedDecisionMicroUsd:
      reviewedDecisionCount > 0 ? round2(governanceCostMicroUsd / reviewedDecisionCount) : 0,
    byRiskLevel: Array.from(byRisk.entries())
      .map(([riskLevel, bucket]) => {
        const totalBucketLatency = bucket.governanceLatencyMs + bucket.executionLatencyMs;
        return {
          riskLevel,
          decisions: bucket.decisions,
          governanceLatencyMs: bucket.governanceLatencyMs,
          executionLatencyMs: bucket.executionLatencyMs,
          latencyOverheadPct:
            totalBucketLatency > 0 ? round2((bucket.governanceLatencyMs / totalBucketLatency) * 100) : 0,
          governanceCostMicroUsd: bucket.governanceCostMicroUsd,
          costPerDecisionMicroUsd:
            bucket.decisions > 0 ? round2(bucket.governanceCostMicroUsd / bucket.decisions) : 0,
        };
      })
      .sort((a, b) => b.decisions - a.decisions || a.riskLevel.localeCompare(b.riskLevel)),
    telemetry: {
      latencyAccountingGovernanceMs: latencyTelemetry.totalGovernanceMs,
      latencyAccountingGovernancePct: latencyTelemetry.governancePct,
      overheadAccountingGovernanceCostMicroUsd: overheadGovernanceCostMicroUsd,
    },
  };
}

export function calculateTrustRoi(input: TrustRoiInput): TrustRoiSummary {
  const governanceCostMicroUsd = Math.max(0, input.governanceCostMicroUsd);
  const riskBeforeMicroUsd = Math.max(0, input.riskBeforeMicroUsd);
  const riskAfterMicroUsd = Math.max(0, input.riskAfterMicroUsd);
  const riskReductionValueMicroUsd = Math.max(0, riskBeforeMicroUsd - riskAfterMicroUsd);
  const netValueMicroUsd = riskReductionValueMicroUsd - governanceCostMicroUsd;

  const status: "POSITIVE" | "BREAKEVEN" | "NEGATIVE" =
    netValueMicroUsd > 0 ? "POSITIVE" : netValueMicroUsd < 0 ? "NEGATIVE" : "BREAKEVEN";

  return {
    decisionCount: Math.max(0, input.decisionCount),
    governanceCostMicroUsd,
    riskBeforeMicroUsd,
    riskAfterMicroUsd,
    riskReductionValueMicroUsd,
    netValueMicroUsd,
    roiPct:
      governanceCostMicroUsd > 0
        ? round2((netValueMicroUsd / governanceCostMicroUsd) * 100)
        : null,
    paybackRatio:
      governanceCostMicroUsd > 0
        ? round2(riskReductionValueMicroUsd / governanceCostMicroUsd)
        : null,
    status,
  };
}

export function computeTrustRoi(
  windowMs = DEFAULT_WINDOW_MS,
  precomputedCost?: GovernanceCostOfTrustSummary,
): TrustRoiSummary {
  const recent = recentDecisions(windowMs);
  const decisionCostMicroUsd = recent.reduce((sum, decision) => sum + decision.governanceCostMicroUsd, 0);
  const fallbackCost = precomputedCost?.telemetry.overheadAccountingGovernanceCostMicroUsd ?? 0;
  const governanceCostMicroUsd = decisionCostMicroUsd > 0 ? decisionCostMicroUsd : fallbackCost;

  return calculateTrustRoi({
    decisionCount: recent.length,
    governanceCostMicroUsd,
    riskBeforeMicroUsd: recent.reduce((sum, decision) => sum + decision.riskBeforeMicroUsd, 0),
    riskAfterMicroUsd: recent.reduce((sum, decision) => sum + decision.riskAfterMicroUsd, 0),
  });
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

export function generateSloReport(windowMs = DEFAULT_WINDOW_MS): SloReport {
  const safeWindowMs = normalizeWindowMs(windowMs);
  const recent = recentMeasurements(safeWindowMs);

  const metricSummaries = buildMetricSummaries(recent);
  const definitionSummaries = buildDefinitionSummaries(recent);
  const costOfTrust = computeGovernanceCostOfTrust(safeWindowMs);
  const trustRoi = computeTrustRoi(safeWindowMs, costOfTrust);

  const overallStatus = computeOverallStatus([
    ...metricSummaries.map((metric) => metric.status),
    ...definitionSummaries.map((definition) => definition.status),
  ]);

  return {
    reportId: `slor_${randomUUID().slice(0, 12)}`,
    ts: Date.now(),
    windowMs: safeWindowMs,
    overallStatus,
    metrics: metricSummaries,
    definitions: definitionSummaries,
    activeViolations: definitionSummaries
      .filter((definition) => definition.status !== "HEALTHY")
      .map((definition) => ({
        id: definition.id,
        status: definition.status,
        objective: definition.objective,
      })),
    complianceHistorySize: complianceHistory.length,
    recentAlerts: listSloAlerts(10),
    costOfTrust,
    trustRoi,
  };
}

export function getSloDashboardData(windowMs = DEFAULT_WINDOW_MS): SloReport {
  return generateSloReport(windowMs);
}

export function trackSloCompliance(windowMs = DEFAULT_WINDOW_MS): SloComplianceSnapshot {
  const report = generateSloReport(windowMs);
  return appendComplianceSnapshot(report);
}

export function listSloComplianceHistory(limit = 25): SloComplianceSnapshot[] {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 25;
  return complianceHistory.slice(-safeLimit);
}

export function evaluateSloAlerts(windowMs = DEFAULT_WINDOW_MS): SloAlert[] {
  const report = generateSloReport(windowMs);
  appendComplianceSnapshot(report);

  const emitted: SloAlert[] = [];
  for (const definition of report.definitions) {
    const previousStatus = lastDefinitionStatuses.get(definition.id) ?? null;
    if (previousStatus !== definition.status) {
      if (definition.status === "DEGRADED" || definition.status === "VIOLATED") {
        const severity = definition.status === "VIOLATED" ? "CRITICAL" : "WARN";
        emitted.push({
          alertId: `sloa_${randomUUID().slice(0, 12)}`,
          ts: Date.now(),
          severity,
          sloId: definition.id,
          previousStatus,
          status: definition.status,
          summary: `${definition.id} changed ${previousStatus ?? "n/a"} -> ${definition.status}`,
        });
      } else if (previousStatus && previousStatus !== "HEALTHY") {
        emitted.push({
          alertId: `sloa_${randomUUID().slice(0, 12)}`,
          ts: Date.now(),
          severity: "RECOVERY",
          sloId: definition.id,
          previousStatus,
          status: definition.status,
          summary: `${definition.id} recovered to HEALTHY`,
        });
      }
    }

    lastDefinitionStatuses.set(definition.id, definition.status);
  }

  for (const alert of emitted) {
    pushBounded(alerts, alert, MAX_ALERTS);
  }

  return emitted;
}

export function listSloAlerts(limit = 25): SloAlert[] {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 25;
  return alerts.slice(-safeLimit);
}

// ---------------------------------------------------------------------------
// Prometheus
// ---------------------------------------------------------------------------

function prometheusSafe(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9_]+/g, "_");
}

export function renderSloPrometheus(windowMs = DEFAULT_WINDOW_MS): string {
  const report = generateSloReport(windowMs);
  const lines: string[] = [];

  for (const metric of report.metrics) {
    const name = metric.metric.toLowerCase();
    lines.push(`# HELP amc_governance_slo_${name}_p95 P95 for ${metric.metric}`);
    lines.push(`# TYPE amc_governance_slo_${name}_p95 gauge`);
    lines.push(`amc_governance_slo_${name}_p95 ${metric.p95}`);
    lines.push(`# HELP amc_governance_slo_${name}_status SLO status (0=healthy,1=degraded,2=violated)`);
    lines.push(`# TYPE amc_governance_slo_${name}_status gauge`);
    lines.push(
      `amc_governance_slo_${name}_status ${metric.status === "HEALTHY" ? 0 : metric.status === "DEGRADED" ? 1 : 2}`,
    );
  }

  for (const definition of report.definitions) {
    const safeId = prometheusSafe(definition.id);
    lines.push(
      `# HELP amc_governance_slo_definition_${safeId}_status Governance definition status (0=healthy,1=degraded,2=violated)`,
    );
    lines.push(`# TYPE amc_governance_slo_definition_${safeId}_status gauge`);
    lines.push(
      `amc_governance_slo_definition_${safeId}_status ${
        definition.status === "HEALTHY" ? 0 : definition.status === "DEGRADED" ? 1 : 2
      }`,
    );
    lines.push(`# HELP amc_governance_slo_definition_${safeId}_observed Observed value`);
    lines.push(`# TYPE amc_governance_slo_definition_${safeId}_observed gauge`);
    lines.push(`amc_governance_slo_definition_${safeId}_observed ${definition.observedValue}`);
    lines.push(`# HELP amc_governance_slo_definition_${safeId}_target Target value`);
    lines.push(`# TYPE amc_governance_slo_definition_${safeId}_target gauge`);
    lines.push(`amc_governance_slo_definition_${safeId}_target ${definition.targetValue}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function formatMetricValue(metric: SloMetricName, value: number): string {
  if (metric.includes("RATE")) {
    return `${(value * 100).toFixed(1)}%`;
  }
  return `${value.toFixed(0)}ms`;
}

function formatDefinitionObserved(definition: GovernanceSloDefinitionSummary): string {
  if (definition.mode === "COMPLIANCE_GTE") {
    return `${(definition.observedValue * 100).toFixed(1)}%`;
  }
  return formatMetricValue(definition.metric, definition.observedValue);
}

function formatDefinitionTarget(definition: GovernanceSloDefinitionSummary): string {
  if (definition.mode === "COMPLIANCE_GTE") {
    return `${(definition.targetValue * 100).toFixed(1)}%`;
  }
  return formatMetricValue(definition.metric, definition.targetValue);
}

function formatUsdFromMicroUsd(valueMicroUsd: number): string {
  return `$${microUsdToUsd(valueMicroUsd).toFixed(4)}`;
}

function formatRoiPct(roiPct: number | null): string {
  if (roiPct === null) return "n/a";
  return `${roiPct.toFixed(2)}%`;
}

function formatPaybackRatio(paybackRatio: number | null): string {
  if (paybackRatio === null) return "n/a";
  return `${paybackRatio.toFixed(2)}x`;
}

export function renderSloStatus(windowMs = DEFAULT_WINDOW_MS): string {
  const report = generateSloReport(windowMs);
  const lines = [
    "# Governance SLO Dashboard",
    "",
    `- Overall: **${report.overallStatus}**`,
    `- Window: ${(report.windowMs / 3600000).toFixed(1)}h`,
    `- Generated: ${new Date(report.ts).toISOString()}`,
    `- Compliance snapshots: ${report.complianceHistorySize}`,
    `- Recent alerts: ${report.recentAlerts.length}`,
    "",
    "## Metric SLOs",
    "",
    "| Metric | Status | Count | P50 | P95 | P99 | Target |",
    "|--------|--------|------:|----:|----:|----:|-------:|",
  ];

  for (const metric of report.metrics) {
    lines.push(
      `| ${metric.metric} | ${metric.status} | ${metric.count} | ${formatMetricValue(metric.metric, metric.p50)} | ${formatMetricValue(metric.metric, metric.p95)} | ${formatMetricValue(metric.metric, metric.p99)} | ${formatMetricValue(metric.metric, metric.target)} |`,
    );
  }

  lines.push("", "## Governance SLO Definitions", "");
  lines.push("| SLO | Objective | Status | Samples | Observed | Target |", "|-----|-----------|--------|--------:|---------:|-------:|");
  for (const definition of report.definitions) {
    lines.push(
      `| ${definition.id} | ${definition.objective} | ${definition.status} | ${definition.sampleSize} | ${formatDefinitionObserved(definition)} | ${formatDefinitionTarget(definition)} |`,
    );
  }

  lines.push("", "## Cost of Trust", "");
  lines.push(`- Decisions: ${report.costOfTrust.decisionCount}`);
  lines.push(`- Reviewed decisions: ${report.costOfTrust.reviewedDecisionCount}`);
  lines.push(`- Governance latency overhead: ${report.costOfTrust.latencyOverheadPct.toFixed(2)}%`);
  lines.push(`- Avg governance latency per decision: ${report.costOfTrust.avgGovernanceLatencyMs.toFixed(2)}ms`);
  lines.push(`- Governance cost: ${formatUsdFromMicroUsd(report.costOfTrust.governanceCostMicroUsd)}`);
  lines.push(`- Cost per decision: ${formatUsdFromMicroUsd(report.costOfTrust.costPerDecisionMicroUsd)}`);
  lines.push(
    `- Latency telemetry (ops/latency): ${report.costOfTrust.telemetry.latencyAccountingGovernancePct.toFixed(2)}% governance share`,
  );
  lines.push(
    `- Cost telemetry (ops/overhead): ${formatUsdFromMicroUsd(report.costOfTrust.telemetry.overheadAccountingGovernanceCostMicroUsd)}`,
  );

  lines.push("", "## Trust ROI", "");
  lines.push(`- Status: **${report.trustRoi.status}**`);
  lines.push(`- Governance cost: ${formatUsdFromMicroUsd(report.trustRoi.governanceCostMicroUsd)}`);
  lines.push(`- Risk reduction value: ${formatUsdFromMicroUsd(report.trustRoi.riskReductionValueMicroUsd)}`);
  lines.push(`- Net trust value: ${formatUsdFromMicroUsd(report.trustRoi.netValueMicroUsd)}`);
  lines.push(`- ROI: ${formatRoiPct(report.trustRoi.roiPct)}`);
  lines.push(`- Payback ratio: ${formatPaybackRatio(report.trustRoi.paybackRatio)}`);

  if (report.activeViolations.length > 0) {
    lines.push("", "## Active Violations", "");
    for (const violation of report.activeViolations) {
      lines.push(`- [${violation.status}] ${violation.id}: ${violation.objective}`);
    }
  }

  if (report.recentAlerts.length > 0) {
    lines.push("", "## Recent Alerts", "");
    for (const alert of report.recentAlerts) {
      lines.push(`- ${new Date(alert.ts).toISOString()} ${alert.severity} ${alert.sloId}: ${alert.summary}`);
    }
  }

  lines.push("", "Hint: `amc slo status --window 1` for this dashboard.");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Reset (testing)
// ---------------------------------------------------------------------------

export function resetGovernanceSlo(): void {
  measurements.length = 0;
  decisions.length = 0;
  complianceHistory.length = 0;
  alerts.length = 0;
  lastDefinitionStatuses.clear();
  targets = DEFAULT_TARGETS.map((target) => normalizeTarget(target));
  definitions = DEFAULT_DEFINITIONS.map((definition) => normalizeDefinition(definition));
}
