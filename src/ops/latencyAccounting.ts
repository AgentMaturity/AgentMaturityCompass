/**
 * Latency Accounting
 *
 * Per-operation response time tracking with P50/P95/P99 by
 * provider/model, tool, action class. "Cost of Trust" analytics.
 */

import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LatencyCategory = "LLM" | "TOOL" | "GOVERNANCE";

export interface LatencyMeasurement {
  id: string;
  category: LatencyCategory;
  label: string; // provider:model, tool name, or action class
  latencyMs: number;
  governanceOverheadMs: number; // governance overhead portion
  ts: number;
}

export interface LatencyBucket {
  category: LatencyCategory;
  label: string;
  count: number;
  p50: number;
  p95: number;
  p99: number;
  avg: number;
  min: number;
  max: number;
}

export interface CostOfTrustSummary {
  totalExecutionMs: number;
  totalGovernanceMs: number;
  governancePct: number; // governance / (execution + governance)
  byCategory: Array<{
    category: LatencyCategory;
    executionMs: number;
    governanceMs: number;
    pct: number;
  }>;
}

export interface LatencyReport {
  reportId: string;
  ts: number;
  windowMs: number;
  totalMeasurements: number;
  droppedInvalidMeasurements: number;
  buckets: LatencyBucket[];
  costOfTrust: CostOfTrustSummary;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const measurements: LatencyMeasurement[] = [];
const MAX_MEASUREMENTS = 100000;
let droppedInvalidMeasurements = 0;

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

export function recordLatency(params: {
  category: LatencyCategory;
  label: string;
  latencyMs: number;
  governanceOverheadMs?: number;
}): LatencyMeasurement {
  const safeLabel = params.label?.trim() || "unknown";
  const safeLatencyMs = Number.isFinite(params.latencyMs) ? Math.max(0, params.latencyMs) : Number.NaN;
  const requestedGovOverhead = params.governanceOverheadMs ?? 0;
  const safeGovernanceOverheadMs = Number.isFinite(requestedGovOverhead)
    ? Math.max(0, requestedGovOverhead)
    : Number.NaN;

  if (!Number.isFinite(safeLatencyMs) || !Number.isFinite(safeGovernanceOverheadMs)) {
    droppedInvalidMeasurements++;
    const fallback: LatencyMeasurement = {
      id: `lat_${randomUUID().slice(0, 12)}`,
      category: params.category,
      label: safeLabel,
      latencyMs: 0,
      governanceOverheadMs: 0,
      ts: Date.now(),
    };
    return fallback;
  }

  const m: LatencyMeasurement = {
    id: `lat_${randomUUID().slice(0, 12)}`,
    category: params.category,
    label: safeLabel,
    latencyMs: safeLatencyMs,
    governanceOverheadMs: safeGovernanceOverheadMs,
    ts: Date.now(),
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

export function computeLatencyBuckets(windowMs = 86400000): LatencyBucket[] {
  const cutoff = Date.now() - windowMs;
  const recent = measurements.filter((m) => m.ts >= cutoff);

  const groups = new Map<string, LatencyMeasurement[]>();
  for (const m of recent) {
    const key = `${m.category}::${m.label}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(m);
  }

  const buckets: LatencyBucket[] = [];
  for (const [key, items] of groups) {
    const [category, label] = key.split("::", 2) as [LatencyCategory, string];
    const values = items.map((m) => m.latencyMs);

    buckets.push({
      category,
      label,
      count: values.length,
      p50: percentile(values, 50),
      p95: percentile(values, 95),
      p99: percentile(values, 99),
      avg: Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)),
      min: Math.min(...values),
      max: Math.max(...values),
    });
  }

  return buckets.sort((a, b) => b.p95 - a.p95);
}

export function computeCostOfTrust(windowMs = 86400000): CostOfTrustSummary {
  const cutoff = Date.now() - windowMs;
  const recent = measurements.filter((m) => m.ts >= cutoff);

  const totalExecutionMs = recent.reduce((sum, m) => sum + m.latencyMs, 0);
  const totalGovernanceMs = recent.reduce((sum, m) => sum + m.governanceOverheadMs, 0);
  const total = totalExecutionMs + totalGovernanceMs;

  const byCat = new Map<LatencyCategory, { exec: number; gov: number }>();
  for (const m of recent) {
    if (!byCat.has(m.category)) byCat.set(m.category, { exec: 0, gov: 0 });
    const entry = byCat.get(m.category)!;
    entry.exec += m.latencyMs;
    entry.gov += m.governanceOverheadMs;
  }

  return {
    totalExecutionMs,
    totalGovernanceMs,
    governancePct: total > 0 ? Number(((totalGovernanceMs / total) * 100).toFixed(2)) : 0,
    byCategory: Array.from(byCat.entries()).map(([category, data]) => ({
      category,
      executionMs: data.exec,
      governanceMs: data.gov,
      pct: (data.exec + data.gov) > 0 ? Number(((data.gov / (data.exec + data.gov)) * 100).toFixed(2)) : 0,
    })),
  };
}

export function generateLatencyReport(windowMs = 86400000): LatencyReport {
  const cutoff = Date.now() - windowMs;
  const recent = measurements.filter((m) => m.ts >= cutoff);

  return {
    reportId: `latr_${randomUUID().slice(0, 12)}`,
    ts: Date.now(),
    windowMs,
    totalMeasurements: recent.length,
    droppedInvalidMeasurements,
    buckets: computeLatencyBuckets(windowMs),
    costOfTrust: computeCostOfTrust(windowMs),
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export function renderLatencyReport(windowMs = 86400000): string {
  const report = generateLatencyReport(windowMs);
  const lines = [
    "# Latency Accounting Report",
    "",
    `- Window: ${(report.windowMs / 3600000).toFixed(1)}h`,
    `- Total measurements: ${report.totalMeasurements}`,
    `- Dropped invalid measurements: ${report.droppedInvalidMeasurements}`,
    "", 
    "## Cost of Trust",
    "",
    `- Raw execution: ${report.costOfTrust.totalExecutionMs.toFixed(0)}ms`,
    `- Governance overhead: ${report.costOfTrust.totalGovernanceMs.toFixed(0)}ms`,
    `- Governance %: ${report.costOfTrust.governancePct}%`,
    "",
  ];

  if (report.costOfTrust.byCategory.length > 0) {
    lines.push("| Category | Execution | Governance | Gov % |");
    lines.push("|----------|----------:|----------:|------:|");
    for (const c of report.costOfTrust.byCategory) {
      lines.push(`| ${c.category} | ${c.executionMs.toFixed(0)}ms | ${c.governanceMs.toFixed(0)}ms | ${c.pct}% |`);
    }
    lines.push("");
  }

  if (report.buckets.length > 0) {
    lines.push("## Latency Buckets");
    lines.push("");
    lines.push("| Category | Label | Count | P50 | P95 | P99 | Avg |");
    lines.push("|----------|-------|------:|----:|----:|----:|----:|");
    for (const b of report.buckets) {
      lines.push(`| ${b.category} | ${b.label} | ${b.count} | ${b.p50.toFixed(0)}ms | ${b.p95.toFixed(0)}ms | ${b.p99.toFixed(0)}ms | ${b.avg.toFixed(0)}ms |`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Reset (testing)
// ---------------------------------------------------------------------------

export function resetLatencyAccounting(): void {
  measurements.length = 0;
  droppedInvalidMeasurements = 0;
}
