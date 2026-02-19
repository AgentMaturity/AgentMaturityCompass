/**
 * Governance SLOs
 *
 * Track governance decision performance: policy decision latency,
 * approval turnaround, false block rate, ticket issuance-to-use latency.
 */

import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SloStatus = "HEALTHY" | "DEGRADED" | "VIOLATED";

export type SloMetricName =
  | "POLICY_DECISION_LATENCY"
  | "APPROVAL_TURNAROUND"
  | "FALSE_BLOCK_RATE"
  | "TICKET_ISSUANCE_TO_USE";

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

export interface SloReport {
  reportId: string;
  ts: number;
  windowMs: number;
  overallStatus: SloStatus;
  metrics: SloMetricSummary[];
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const measurements: SloMeasurement[] = [];
const MAX_MEASUREMENTS = 50000;

let targets: SloTarget[] = [
  { metric: "POLICY_DECISION_LATENCY", targetP95: 100, degradedThreshold: 200 },
  { metric: "APPROVAL_TURNAROUND", targetP95: 300000, degradedThreshold: 600000 }, // 5min/10min default
  { metric: "FALSE_BLOCK_RATE", targetP95: 0.05, degradedThreshold: 0.10 },
  { metric: "TICKET_ISSUANCE_TO_USE", targetP95: 60000, degradedThreshold: 120000 }, // 1min/2min
];

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export function configureSloTargets(newTargets: SloTarget[]): void {
  targets = newTargets.map((t) => normalizeTarget(t));
}

export function getSloTargets(): SloTarget[] {
  return [...targets];
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

export function recordSloMeasurement(metric: SloMetricName, value: number, labels: Record<string, string> = {}): SloMeasurement {
  const safeValue = normalizeSloValue(metric, value);
  const safeLabels: Record<string, string> = {};
  for (const [k, v] of Object.entries(labels)) {
    if (typeof k === "string" && typeof v === "string" && k.length > 0) {
      safeLabels[k] = v;
    }
  }

  const m: SloMeasurement = {
    id: `slo_${randomUUID().slice(0, 12)}`,
    metric,
    value: safeValue,
    ts: Date.now(),
    labels: safeLabels,
  };
  measurements.push(m);
  while (measurements.length > MAX_MEASUREMENTS) measurements.shift();
  return m;
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

function computeStatus(p95: number, target: SloTarget): SloStatus {
  if (p95 <= target.targetP95) return "HEALTHY";
  if (p95 <= target.degradedThreshold) return "DEGRADED";
  return "VIOLATED";
}

function normalizeSloValue(metric: SloMetricName, value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (metric.includes("RATE")) return Math.min(1, Math.max(0, value));
  return Math.max(0, value);
}

function normalizeTarget(target: SloTarget): SloTarget {
  const isRate = target.metric.includes("RATE");
  const safeTarget = Number.isFinite(target.targetP95)
    ? (isRate ? Math.min(1, Math.max(0, target.targetP95)) : Math.max(0, target.targetP95))
    : 0;
  const safeDegraded = Number.isFinite(target.degradedThreshold)
    ? (isRate ? Math.min(1, Math.max(0, target.degradedThreshold)) : Math.max(0, target.degradedThreshold))
    : safeTarget;

  return {
    ...target,
    targetP95: Math.min(safeTarget, safeDegraded),
    degradedThreshold: Math.max(safeTarget, safeDegraded),
  };
}

export function generateSloReport(windowMs = 3600000): SloReport {
  const cutoff = Date.now() - windowMs;
  const recent = measurements.filter((m) => m.ts >= cutoff);

  const metricSummaries: SloMetricSummary[] = [];

  for (const target of targets) {
    const values = recent.filter((m) => m.metric === target.metric).map((m) => m.value);
    const p50 = percentile(values, 50);
    const p95 = percentile(values, 95);
    const p99 = percentile(values, 99);
    const status = values.length > 0 ? computeStatus(p95, target) : "HEALTHY";

    metricSummaries.push({
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

  const worstStatus: SloStatus = metricSummaries.some((m) => m.status === "VIOLATED")
    ? "VIOLATED"
    : metricSummaries.some((m) => m.status === "DEGRADED")
      ? "DEGRADED"
      : "HEALTHY";

  return {
    reportId: `slor_${randomUUID().slice(0, 12)}`,
    ts: Date.now(),
    windowMs,
    overallStatus: worstStatus,
    metrics: metricSummaries,
  };
}

// ---------------------------------------------------------------------------
// Prometheus
// ---------------------------------------------------------------------------

export function renderSloPrometheus(windowMs = 3600000): string {
  const report = generateSloReport(windowMs);
  const lines: string[] = [];

  for (const m of report.metrics) {
    const name = m.metric.toLowerCase();
    lines.push(`# HELP amc_governance_slo_${name}_p95 P95 for ${m.metric}`);
    lines.push(`# TYPE amc_governance_slo_${name}_p95 gauge`);
    lines.push(`amc_governance_slo_${name}_p95 ${m.p95}`);
    lines.push(`# HELP amc_governance_slo_${name}_status SLO status (0=healthy,1=degraded,2=violated)`);
    lines.push(`# TYPE amc_governance_slo_${name}_status gauge`);
    lines.push(`amc_governance_slo_${name}_status ${m.status === "HEALTHY" ? 0 : m.status === "DEGRADED" ? 1 : 2}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export function renderSloStatus(windowMs = 3600000): string {
  const report = generateSloReport(windowMs);
  const lines = [
    "# Governance SLO Dashboard",
    "",
    `- Overall: **${report.overallStatus}**`,
    `- Window: ${(report.windowMs / 3600000).toFixed(1)}h`,
    `- Generated: ${new Date(report.ts).toISOString()}`,
    "",
    "| Metric | Status | Count | P50 | P95 | P99 | Target |",
    "|--------|--------|------:|----:|----:|----:|-------:|",
  ];

  for (const m of report.metrics) {
    const fmt = m.metric.includes("RATE")
      ? (v: number) => `${(v * 100).toFixed(1)}%`
      : (v: number) => `${v.toFixed(0)}ms`;
    lines.push(`| ${m.metric} | ${m.status} | ${m.count} | ${fmt(m.p50)} | ${fmt(m.p95)} | ${fmt(m.p99)} | ${fmt(m.target)} |`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Reset (testing)
// ---------------------------------------------------------------------------

export function resetGovernanceSlo(): void {
  measurements.length = 0;
  targets = [
    { metric: "POLICY_DECISION_LATENCY", targetP95: 100, degradedThreshold: 200 },
    { metric: "APPROVAL_TURNAROUND", targetP95: 300000, degradedThreshold: 600000 },
    { metric: "FALSE_BLOCK_RATE", targetP95: 0.05, degradedThreshold: 0.10 },
    { metric: "TICKET_ISSUANCE_TO_USE", targetP95: 60000, degradedThreshold: 120000 },
  ];
}
