import { nearestRank } from "../experiments/stats.js";
/**
 * Per-Feature Overhead Accounting
 *
 * Tracks AMC's own overhead by feature: latency, token consumption,
 * and cost attribution. Provides "cost of trust control" vs "risk
 * reduction gained" analytics.
 *
 * Key concepts:
 * - Per-feature latency and token accounting
 * - Low-overhead mode profiles (strict, balanced, lean)
 * - Token burn anomaly alerts
 * - Monthly cost attribution by agent/action class
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OverheadFeature =
  | "GATEWAY_PROXY"
  | "BRIDGE_ROUTING"
  | "POLICY_EVALUATION"
  | "EVIDENCE_SIGNING"
  | "HASH_CHAIN"
  | "APPROVAL_ENGINE"
  | "ASSURANCE_CHECK"
  | "CANARY_PROBE"
  | "TRANSPARENCY_LOG"
  | "LEASE_VERIFY"
  | "BUDGET_EVAL"
  | "CUSTOM";

export type OverheadModeProfile = "STRICT" | "BALANCED" | "LEAN";

export interface OverheadMeasurement {
  measurementId: string;
  feature: OverheadFeature;
  agentId: string | null;
  actionClass: string | null;
  /** Latency in milliseconds */
  latencyMs: number;
  /** Tokens consumed by this feature */
  tokenCount: number;
  /** Estimated cost in micro-dollars */
  costMicroUsd: number;
  ts: number;
}

export interface OverheadBudget {
  feature: OverheadFeature;
  maxLatencyMs: number;
  maxTokensPerRequest: number;
  maxCostMicroUsdPerRequest: number;
}

export interface OverheadProfile {
  mode: OverheadModeProfile;
  budgets: OverheadBudget[];
  /** Features to disable in lean mode */
  disabledFeatures: OverheadFeature[];
  /** Sampling rate for evidence in lean mode (0.0-1.0) */
  evidenceSamplingRate: number;
}

export interface FeatureOverheadSummary {
  feature: OverheadFeature;
  measurementCount: number;
  totalLatencyMs: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  maxLatencyMs: number;
  totalTokens: number;
  avgTokens: number;
  totalCostMicroUsd: number;
  avgCostMicroUsd: number;
}

export interface OverheadAnomaly {
  anomalyId: string;
  feature: OverheadFeature;
  metric: "LATENCY" | "TOKENS" | "COST";
  observed: number;
  threshold: number;
  ts: number;
  description: string;
}

export interface AgentCostAttribution {
  agentId: string;
  totalCostMicroUsd: number;
  measurementCount: number;
  featureBreakdown: Array<{
    feature: OverheadFeature;
    costMicroUsd: number;
    latencyMs: number;
    tokenCount: number;
  }>;
}

export interface OverheadReport {
  reportId: string;
  ts: number;
  windowMs: number;
  activeProfile: OverheadModeProfile;
  totalMeasurements: number;
  totalLatencyMs: number;
  totalTokens: number;
  totalCostMicroUsd: number;
  featureSummaries: FeatureOverheadSummary[];
  agentAttributions: AgentCostAttribution[];
  anomalies: OverheadAnomaly[];
  budgetViolations: Array<{
    feature: OverheadFeature;
    metric: string;
    value: number;
    budget: number;
  }>;
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const measurements: OverheadMeasurement[] = [];
const anomalies: OverheadAnomaly[] = [];
let activeProfile: OverheadProfile = defaultOverheadProfile("BALANCED");
let maxMeasurements = 50000;

// ---------------------------------------------------------------------------
// Default profiles
// ---------------------------------------------------------------------------

export function defaultOverheadProfile(mode: OverheadModeProfile): OverheadProfile {
  const baseBudgets: OverheadBudget[] = [
    { feature: "GATEWAY_PROXY", maxLatencyMs: 50, maxTokensPerRequest: 0, maxCostMicroUsdPerRequest: 10 },
    { feature: "BRIDGE_ROUTING", maxLatencyMs: 30, maxTokensPerRequest: 0, maxCostMicroUsdPerRequest: 5 },
    { feature: "POLICY_EVALUATION", maxLatencyMs: 20, maxTokensPerRequest: 0, maxCostMicroUsdPerRequest: 5 },
    { feature: "EVIDENCE_SIGNING", maxLatencyMs: 10, maxTokensPerRequest: 0, maxCostMicroUsdPerRequest: 2 },
    { feature: "HASH_CHAIN", maxLatencyMs: 5, maxTokensPerRequest: 0, maxCostMicroUsdPerRequest: 1 },
    { feature: "APPROVAL_ENGINE", maxLatencyMs: 100, maxTokensPerRequest: 500, maxCostMicroUsdPerRequest: 50 },
    { feature: "ASSURANCE_CHECK", maxLatencyMs: 200, maxTokensPerRequest: 1000, maxCostMicroUsdPerRequest: 100 },
    { feature: "CANARY_PROBE", maxLatencyMs: 500, maxTokensPerRequest: 0, maxCostMicroUsdPerRequest: 5 },
    { feature: "TRANSPARENCY_LOG", maxLatencyMs: 10, maxTokensPerRequest: 0, maxCostMicroUsdPerRequest: 1 },
    { feature: "LEASE_VERIFY", maxLatencyMs: 15, maxTokensPerRequest: 0, maxCostMicroUsdPerRequest: 2 },
    { feature: "BUDGET_EVAL", maxLatencyMs: 10, maxTokensPerRequest: 0, maxCostMicroUsdPerRequest: 2 },
  ];

  if (mode === "STRICT") {
    return {
      mode,
      budgets: baseBudgets,
      disabledFeatures: [],
      evidenceSamplingRate: 1.0,
    };
  }

  if (mode === "LEAN") {
    return {
      mode,
      budgets: baseBudgets.map((b) => ({
        ...b,
        maxLatencyMs: b.maxLatencyMs * 2,
        maxCostMicroUsdPerRequest: b.maxCostMicroUsdPerRequest * 2,
      })),
      disabledFeatures: ["CANARY_PROBE", "ASSURANCE_CHECK"],
      evidenceSamplingRate: 0.1,
    };
  }

  // BALANCED
  return {
    mode,
    budgets: baseBudgets,
    disabledFeatures: [],
    evidenceSamplingRate: 0.5,
  };
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export function setOverheadProfile(mode: OverheadModeProfile): OverheadProfile {
  activeProfile = defaultOverheadProfile(mode);
  return activeProfile;
}

export function getOverheadProfile(): OverheadProfile {
  return { ...activeProfile, budgets: [...activeProfile.budgets] };
}

// ---------------------------------------------------------------------------
// Measurement recording
// ---------------------------------------------------------------------------

/**
 * Record a feature overhead measurement.
 */
export function recordOverhead(params: {
  feature: OverheadFeature;
  latencyMs: number;
  tokenCount?: number;
  costMicroUsd?: number;
  agentId?: string;
  actionClass?: string;
}): OverheadMeasurement {
  const measurement: OverheadMeasurement = {
    measurementId: `ohm_${randomUUID().slice(0, 12)}`,
    feature: params.feature,
    agentId: params.agentId ?? null,
    actionClass: params.actionClass ?? null,
    latencyMs: params.latencyMs,
    tokenCount: params.tokenCount ?? 0,
    costMicroUsd: params.costMicroUsd ?? 0,
    ts: Date.now(),
  };

  measurements.push(measurement);

  // Trim if needed
  while (measurements.length > maxMeasurements) {
    measurements.shift();
  }

  // Check for anomalies
  const budget = activeProfile.budgets.find((b) => b.feature === params.feature);
  if (budget) {
    if (params.latencyMs > budget.maxLatencyMs * 3) {
      anomalies.push({
        anomalyId: `oha_${randomUUID().slice(0, 12)}`,
        feature: params.feature,
        metric: "LATENCY",
        observed: params.latencyMs,
        threshold: budget.maxLatencyMs * 3,
        ts: Date.now(),
        description: `${params.feature} latency ${params.latencyMs}ms exceeds 3x budget (${budget.maxLatencyMs}ms)`,
      });
    }
    if ((params.tokenCount ?? 0) > budget.maxTokensPerRequest * 3 && budget.maxTokensPerRequest > 0) {
      anomalies.push({
        anomalyId: `oha_${randomUUID().slice(0, 12)}`,
        feature: params.feature,
        metric: "TOKENS",
        observed: params.tokenCount ?? 0,
        threshold: budget.maxTokensPerRequest * 3,
        ts: Date.now(),
        description: `${params.feature} token usage ${params.tokenCount} exceeds 3x budget (${budget.maxTokensPerRequest})`,
      });
    }
  }

  return measurement;
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

function percentile(values: number[], p: number): number {
  return nearestRank(values, p / 100);
}

/**
 * Compute per-feature overhead summaries.
 */
export function computeFeatureSummaries(sinceTs?: number): FeatureOverheadSummary[] {
  const cutoff = sinceTs ?? 0;
  const recent = measurements.filter((m) => m.ts >= cutoff);

  const byFeature = new Map<OverheadFeature, OverheadMeasurement[]>();
  for (const m of recent) {
    if (!byFeature.has(m.feature)) byFeature.set(m.feature, []);
    byFeature.get(m.feature)!.push(m);
  }

  const summaries: FeatureOverheadSummary[] = [];
  for (const [feature, featureMeasurements] of byFeature) {
    const latencies = featureMeasurements.map((m) => m.latencyMs);
    const tokens = featureMeasurements.map((m) => m.tokenCount);
    const costs = featureMeasurements.map((m) => m.costMicroUsd);

    summaries.push({
      feature,
      measurementCount: featureMeasurements.length,
      totalLatencyMs: latencies.reduce((a, b) => a + b, 0),
      avgLatencyMs: Number((latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2)),
      p95LatencyMs: percentile(latencies, 95),
      maxLatencyMs: Math.max(...latencies),
      totalTokens: tokens.reduce((a, b) => a + b, 0),
      avgTokens: Number((tokens.reduce((a, b) => a + b, 0) / tokens.length).toFixed(2)),
      totalCostMicroUsd: costs.reduce((a, b) => a + b, 0),
      avgCostMicroUsd: Number((costs.reduce((a, b) => a + b, 0) / costs.length).toFixed(2)),
    });
  }

  return summaries.sort((a, b) => b.totalCostMicroUsd - a.totalCostMicroUsd);
}

/**
 * Compute cost attribution by agent.
 */
export function computeAgentCostAttribution(sinceTs?: number): AgentCostAttribution[] {
  const cutoff = sinceTs ?? 0;
  const recent = measurements.filter((m) => m.ts >= cutoff && m.agentId);

  const byAgent = new Map<string, OverheadMeasurement[]>();
  for (const m of recent) {
    const id = m.agentId!;
    if (!byAgent.has(id)) byAgent.set(id, []);
    byAgent.get(id)!.push(m);
  }

  return Array.from(byAgent.entries()).map(([agentId, agentMeasurements]) => {
    const featureMap = new Map<OverheadFeature, { cost: number; latency: number; tokens: number }>();
    for (const m of agentMeasurements) {
      if (!featureMap.has(m.feature)) featureMap.set(m.feature, { cost: 0, latency: 0, tokens: 0 });
      const entry = featureMap.get(m.feature)!;
      entry.cost += m.costMicroUsd;
      entry.latency += m.latencyMs;
      entry.tokens += m.tokenCount;
    }

    return {
      agentId,
      totalCostMicroUsd: agentMeasurements.reduce((sum, m) => sum + m.costMicroUsd, 0),
      measurementCount: agentMeasurements.length,
      featureBreakdown: Array.from(featureMap.entries()).map(([feature, data]) => ({
        feature,
        costMicroUsd: data.cost,
        latencyMs: data.latency,
        tokenCount: data.tokens,
      })),
    };
  }).sort((a, b) => b.totalCostMicroUsd - a.totalCostMicroUsd);
}

/**
 * Get anomalies.
 */
export function getOverheadAnomalies(sinceTs?: number): OverheadAnomaly[] {
  const cutoff = sinceTs ?? 0;
  return anomalies.filter((a) => a.ts >= cutoff);
}

/**
 * Check budget violations across features.
 */
export function checkBudgetViolations(sinceTs?: number): Array<{
  feature: OverheadFeature;
  metric: string;
  value: number;
  budget: number;
}> {
  const summaries = computeFeatureSummaries(sinceTs);
  const violations: Array<{ feature: OverheadFeature; metric: string; value: number; budget: number }> = [];

  for (const summary of summaries) {
    const budget = activeProfile.budgets.find((b) => b.feature === summary.feature);
    if (!budget) continue;

    if (summary.p95LatencyMs > budget.maxLatencyMs) {
      violations.push({
        feature: summary.feature,
        metric: "P95_LATENCY",
        value: summary.p95LatencyMs,
        budget: budget.maxLatencyMs,
      });
    }
    if (budget.maxTokensPerRequest > 0 && summary.avgTokens > budget.maxTokensPerRequest) {
      violations.push({
        feature: summary.feature,
        metric: "AVG_TOKENS",
        value: summary.avgTokens,
        budget: budget.maxTokensPerRequest,
      });
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

export function generateOverheadReport(windowMs?: number): OverheadReport {
  const reportId = `ohr_${randomUUID().slice(0, 12)}`;
  const now = Date.now();
  const window = windowMs ?? 3600000;
  const sinceTs = now - window;

  const recent = measurements.filter((m) => m.ts >= sinceTs);
  const featureSummaries = computeFeatureSummaries(sinceTs);
  const agentAttributions = computeAgentCostAttribution(sinceTs);
  const recentAnomalies = getOverheadAnomalies(sinceTs);
  const budgetViolations = checkBudgetViolations(sinceTs);

  const totalLatencyMs = recent.reduce((sum, m) => sum + m.latencyMs, 0);
  const totalTokens = recent.reduce((sum, m) => sum + m.tokenCount, 0);
  const totalCostMicroUsd = recent.reduce((sum, m) => sum + m.costMicroUsd, 0);

  const recommendations: string[] = [];

  if (budgetViolations.length > 0) {
    recommendations.push(
      `${budgetViolations.length} budget violation(s) detected. Review feature budgets.`,
    );
  }

  if (recentAnomalies.length > 0) {
    recommendations.push(
      `${recentAnomalies.length} anomaly(ies). Check for degraded performance.`,
    );
  }

  const topCostFeature = featureSummaries[0];
  if (topCostFeature && totalCostMicroUsd > 0) {
    const pct = (topCostFeature.totalCostMicroUsd / totalCostMicroUsd * 100).toFixed(1);
    recommendations.push(
      `${topCostFeature.feature} accounts for ${pct}% of overhead cost. Consider optimization.`,
    );
  }

  if (activeProfile.mode === "STRICT" && totalCostMicroUsd > 1000000) {
    recommendations.push(
      "High overhead in STRICT mode. Consider switching to BALANCED to reduce costs.",
    );
  }

  return {
    reportId,
    ts: now,
    windowMs: window,
    activeProfile: activeProfile.mode,
    totalMeasurements: recent.length,
    totalLatencyMs,
    totalTokens,
    totalCostMicroUsd,
    featureSummaries,
    agentAttributions,
    anomalies: recentAnomalies,
    budgetViolations,
    recommendations,
  };
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

export function renderOverheadReportMarkdown(report: OverheadReport): string {
  const lines: string[] = [
    "# Overhead Accounting Report",
    "",
    `- Report ID: ${report.reportId}`,
    `- Timestamp: ${new Date(report.ts).toISOString()}`,
    `- Window: ${(report.windowMs / 3600000).toFixed(1)} hours`,
    `- Profile: ${report.activeProfile}`,
    "",
    "## Summary",
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total measurements | ${report.totalMeasurements} |`,
    `| Total latency | ${report.totalLatencyMs}ms |`,
    `| Total tokens | ${report.totalTokens} |`,
    `| Total cost | $${(report.totalCostMicroUsd / 1000000).toFixed(4)} |`,
    "",
  ];

  if (report.featureSummaries.length > 0) {
    lines.push("## Per-Feature Overhead");
    lines.push("");
    lines.push("| Feature | Count | Avg Latency | P95 Latency | Avg Tokens | Total Cost |");
    lines.push("|---------|-------|-------------|-------------|------------|------------|");
    for (const f of report.featureSummaries) {
      lines.push(
        `| ${f.feature} | ${f.measurementCount} | ${f.avgLatencyMs}ms | ${f.p95LatencyMs}ms | ${f.avgTokens} | $${(f.totalCostMicroUsd / 1000000).toFixed(4)} |`,
      );
    }
    lines.push("");
  }

  if (report.agentAttributions.length > 0) {
    lines.push("## Cost by Agent");
    lines.push("");
    lines.push("| Agent | Measurements | Total Cost |");
    lines.push("|-------|--------------|------------|");
    for (const a of report.agentAttributions) {
      lines.push(
        `| ${a.agentId} | ${a.measurementCount} | $${(a.totalCostMicroUsd / 1000000).toFixed(4)} |`,
      );
    }
    lines.push("");
  }

  if (report.budgetViolations.length > 0) {
    lines.push("## Budget Violations");
    lines.push("");
    for (const v of report.budgetViolations) {
      lines.push(`- **${v.feature}** ${v.metric}: ${v.value} (budget: ${v.budget})`);
    }
    lines.push("");
  }

  if (report.recommendations.length > 0) {
    lines.push("## Recommendations");
    lines.push("");
    for (const r of report.recommendations) {
      lines.push(`- ${r}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Reset (for testing)
// ---------------------------------------------------------------------------

export function resetOverheadAccounting(): void {
  measurements.length = 0;
  anomalies.length = 0;
  activeProfile = defaultOverheadProfile("BALANCED");
}
