/**
 * Cost Tracker — Gap 5
 *
 * Real cost tracking from actual observability data.
 * Not "do you track costs?" — actual dollars, per-run, per-model, per-agent.
 * Historical trends, anomaly detection, budget alerts.
 */

import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { sha256Hex } from "../utils/hash.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { estimateCost, type NormalizedTrace } from "../watch/observabilityBridge.js";

/* ── Types ───────────────────────────────────────────────────────── */

export interface CostRecord {
  id: string;
  traceId: string;
  agentId: string;
  ts: number;
  model: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  durationMs: number;
  status: "ok" | "error";
  sessionId?: string;
  tags?: string[];
}

export interface CostBucket {
  startTs: number;
  endTs: number;
  totalCostUsd: number;
  totalTokens: number;
  totalCalls: number;
  errorCount: number;
  byModel: Record<string, { costUsd: number; tokens: number; calls: number }>;
  byProvider: Record<string, { costUsd: number; tokens: number; calls: number }>;
}

export interface CostAnomaly {
  id: string;
  type: "spike" | "sustained_increase" | "budget_warning" | "budget_exceeded" | "unusual_model";
  severity: "info" | "warning" | "critical";
  message: string;
  details: Record<string, unknown>;
  ts: number;
}

export interface CostReport {
  agentId: string;
  periodStart: number;
  periodEnd: number;
  totalCostUsd: number;
  totalTokens: number;
  totalCalls: number;
  errorCount: number;
  errorRate: number;
  avgCostPerCall: number;
  avgTokensPerCall: number;
  avgCostPerDay: number;
  projectedMonthlyCostUsd: number;
  costByModel: Record<string, { costUsd: number; tokens: number; calls: number; avgCostPerCall: number; pctOfTotal: number }>;
  costByProvider: Record<string, { costUsd: number; tokens: number; calls: number }>;
  costByDay: CostBucket[];
  anomalies: CostAnomaly[];
  topExpensiveTraces: Array<{ traceId: string; costUsd: number; model: string; tokens: number }>;
  recommendations: string[];
}

export interface CostTrackerConfig {
  workspace: string;
  agentId: string;
  budgetUsd?: number;
  budgetPeriod?: "daily" | "weekly" | "monthly";
  retentionDays?: number;
}

/* ── Cost Tracker ────────────────────────────────────────────────── */

export class CostTracker {
  private config: Required<CostTrackerConfig>;
  private records: CostRecord[] = [];
  private maxRecords = 50000;
  private dirty = false;

  constructor(config: CostTrackerConfig) {
    this.config = {
      workspace: config.workspace,
      agentId: config.agentId,
      budgetUsd: config.budgetUsd ?? Infinity,
      budgetPeriod: config.budgetPeriod ?? "monthly",
      retentionDays: config.retentionDays ?? 90,
    };
    this.loadFromDisk();
  }

  /** Record cost from a normalized trace */
  recordTrace(trace: NormalizedTrace): CostRecord[] {
    const newRecords: CostRecord[] = [];

    for (const span of trace.spans) {
      if (span.kind !== "llm_call" || !span.tokenUsage) continue;

      const record: CostRecord = {
        id: randomUUID(),
        traceId: trace.traceId,
        agentId: this.config.agentId,
        ts: span.endTimeMs,
        model: span.model ?? "unknown",
        provider: span.provider ?? "unknown",
        promptTokens: span.tokenUsage.prompt,
        completionTokens: span.tokenUsage.completion,
        totalTokens: span.tokenUsage.total,
        costUsd: span.costUsd ?? estimateCost(span.model, { prompt: span.tokenUsage.prompt, completion: span.tokenUsage.completion }),
        durationMs: span.durationMs,
        status: span.status === "error" ? "error" : "ok",
        sessionId: trace.sessionId,
      };

      this.records.push(record);
      newRecords.push(record);
    }

    // If trace-level cost but no span-level breakdown
    if (newRecords.length === 0 && trace.totalCostUsd > 0) {
      const record: CostRecord = {
        id: randomUUID(),
        traceId: trace.traceId,
        agentId: this.config.agentId,
        ts: trace.endTimeMs,
        model: Object.keys(trace.modelBreakdown)[0] ?? "unknown",
        provider: "unknown",
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: trace.totalTokens,
        costUsd: trace.totalCostUsd,
        durationMs: trace.durationMs,
        status: trace.status === "error" ? "error" : "ok",
        sessionId: trace.sessionId,
      };
      this.records.push(record);
      newRecords.push(record);
    }

    // Trim old records
    if (this.records.length > this.maxRecords) {
      this.records = this.records.slice(-this.maxRecords);
    }

    this.dirty = true;
    return newRecords;
  }

  /** Generate a cost report for a time window */
  generateReport(windowDays?: number): CostReport {
    const days = windowDays ?? 30;
    const cutoff = Date.now() - days * 86400_000;
    const filtered = this.records.filter((r) => r.ts >= cutoff);

    if (filtered.length === 0) {
      return emptyReport(this.config.agentId, cutoff, Date.now());
    }

    const totalCost = filtered.reduce((s, r) => s + r.costUsd, 0);
    const totalTokens = filtered.reduce((s, r) => s + r.totalTokens, 0);
    const errorCount = filtered.filter((r) => r.status === "error").length;

    // By model
    const byModel: Record<string, { costUsd: number; tokens: number; calls: number }> = {};
    for (const r of filtered) {
      if (!byModel[r.model]) byModel[r.model] = { costUsd: 0, tokens: 0, calls: 0 };
      byModel[r.model]!.costUsd += r.costUsd;
      byModel[r.model]!.tokens += r.totalTokens;
      byModel[r.model]!.calls += 1;
    }

    // By provider
    const byProvider: Record<string, { costUsd: number; tokens: number; calls: number }> = {};
    for (const r of filtered) {
      if (!byProvider[r.provider]) byProvider[r.provider] = { costUsd: 0, tokens: 0, calls: 0 };
      byProvider[r.provider]!.costUsd += r.costUsd;
      byProvider[r.provider]!.tokens += r.totalTokens;
      byProvider[r.provider]!.calls += 1;
    }

    // By day
    const byDay = bucketByDay(filtered);

    // Top expensive
    const traceAgg = new Map<string, { costUsd: number; model: string; tokens: number }>();
    for (const r of filtered) {
      const existing = traceAgg.get(r.traceId);
      if (!existing || r.costUsd > existing.costUsd) {
        traceAgg.set(r.traceId, { costUsd: (existing?.costUsd ?? 0) + r.costUsd, model: r.model, tokens: (existing?.tokens ?? 0) + r.totalTokens });
      }
    }
    const topExpensive = Array.from(traceAgg.entries())
      .map(([traceId, v]) => ({ traceId, ...v }))
      .sort((a, b) => b.costUsd - a.costUsd)
      .slice(0, 10);

    // Anomaly detection
    const anomalies = this.detectAnomalies(filtered, byDay);

    // Recommendations
    const recommendations = this.generateRecommendations(filtered, byModel, totalCost, days);

    const modelReport: CostReport["costByModel"] = {};
    for (const [model, data] of Object.entries(byModel)) {
      modelReport[model] = {
        ...data,
        avgCostPerCall: data.calls > 0 ? data.costUsd / data.calls : 0,
        pctOfTotal: totalCost > 0 ? (data.costUsd / totalCost) * 100 : 0,
      };
    }

    const avgCostPerDay = days > 0 ? totalCost / Math.min(days, byDay.length || 1) : 0;

    return {
      agentId: this.config.agentId,
      periodStart: cutoff,
      periodEnd: Date.now(),
      totalCostUsd: totalCost,
      totalTokens,
      totalCalls: filtered.length,
      errorCount,
      errorRate: filtered.length > 0 ? errorCount / filtered.length : 0,
      avgCostPerCall: filtered.length > 0 ? totalCost / filtered.length : 0,
      avgTokensPerCall: filtered.length > 0 ? totalTokens / filtered.length : 0,
      avgCostPerDay,
      projectedMonthlyCostUsd: avgCostPerDay * 30,
      costByModel: modelReport,
      costByProvider: byProvider,
      costByDay: byDay,
      anomalies,
      topExpensiveTraces: topExpensive,
      recommendations,
    };
  }

  /** Get current period spend vs budget */
  getBudgetStatus(): { spent: number; budget: number; remaining: number; pctUsed: number; periodStart: number } {
    const now = Date.now();
    let periodStart: number;
    switch (this.config.budgetPeriod) {
      case "daily": periodStart = now - 86400_000; break;
      case "weekly": periodStart = now - 7 * 86400_000; break;
      case "monthly": periodStart = now - 30 * 86400_000; break;
    }

    const spent = this.records.filter((r) => r.ts >= periodStart).reduce((s, r) => s + r.costUsd, 0);
    const remaining = Math.max(0, this.config.budgetUsd - spent);
    const pctUsed = this.config.budgetUsd !== Infinity ? (spent / this.config.budgetUsd) * 100 : 0;

    return { spent, budget: this.config.budgetUsd, remaining, pctUsed, periodStart };
  }

  /** Persist to disk */
  flush(): void {
    if (!this.dirty) return;
    const dir = join(this.config.workspace, ".amc", "agents", this.config.agentId, "costs");
    ensureDir(dir);

    // Prune old records
    const retentionCutoff = Date.now() - this.config.retentionDays * 86400_000;
    this.records = this.records.filter((r) => r.ts >= retentionCutoff);

    writeFileAtomic(join(dir, "cost_records.json"), JSON.stringify(this.records, null, 2));
    this.dirty = false;
  }

  getRecords(since?: number, limit?: number): CostRecord[] {
    let filtered = this.records;
    if (since) filtered = filtered.filter((r) => r.ts >= since);
    if (limit) filtered = filtered.slice(-limit);
    return filtered;
  }

  private loadFromDisk(): void {
    const filePath = join(this.config.workspace, ".amc", "agents", this.config.agentId, "costs", "cost_records.json");
    if (pathExists(filePath)) {
      try {
        this.records = JSON.parse(readUtf8(filePath)) as CostRecord[];
      } catch {
        this.records = [];
      }
    }
  }

  private detectAnomalies(records: CostRecord[], daily: CostBucket[]): CostAnomaly[] {
    const anomalies: CostAnomaly[] = [];

    // Budget warnings
    const budget = this.getBudgetStatus();
    if (budget.pctUsed >= 100) {
      anomalies.push({
        id: randomUUID(),
        type: "budget_exceeded",
        severity: "critical",
        message: `Budget exceeded: $${budget.spent.toFixed(4)} / $${budget.budget.toFixed(2)} (${budget.pctUsed.toFixed(0)}%)`,
        details: { spent: budget.spent, budget: budget.budget },
        ts: Date.now(),
      });
    } else if (budget.pctUsed >= 80) {
      anomalies.push({
        id: randomUUID(),
        type: "budget_warning",
        severity: "warning",
        message: `Budget warning: $${budget.spent.toFixed(4)} / $${budget.budget.toFixed(2)} (${budget.pctUsed.toFixed(0)}% used)`,
        details: { spent: budget.spent, budget: budget.budget },
        ts: Date.now(),
      });
    }

    // Daily cost spikes
    if (daily.length >= 3) {
      const costs = daily.map((d) => d.totalCostUsd);
      const avg = costs.reduce((a, b) => a + b, 0) / costs.length;
      const latest = costs[costs.length - 1]!;
      if (latest > avg * 3 && latest > 0.01) {
        anomalies.push({
          id: randomUUID(),
          type: "spike",
          severity: "warning",
          message: `Daily cost spike: $${latest.toFixed(4)} is ${(latest / avg).toFixed(1)}x the average ($${avg.toFixed(4)})`,
          details: { todayCost: latest, avgCost: avg, ratio: latest / avg },
          ts: Date.now(),
        });
      }

      // Sustained increase (3+ consecutive days of increase)
      if (costs.length >= 4) {
        const recent = costs.slice(-4);
        const isIncreasing = recent.every((v, i) => i === 0 || v > recent[i - 1]!);
        if (isIncreasing && recent[recent.length - 1]! > recent[0]! * 1.5) {
          anomalies.push({
            id: randomUUID(),
            type: "sustained_increase",
            severity: "warning",
            message: `Sustained cost increase over ${recent.length} days: $${recent[0]!.toFixed(4)} → $${recent[recent.length - 1]!.toFixed(4)}`,
            details: { trend: recent },
            ts: Date.now(),
          });
        }
      }
    }

    return anomalies;
  }

  private generateRecommendations(
    records: CostRecord[],
    byModel: Record<string, { costUsd: number; tokens: number; calls: number }>,
    totalCost: number,
    _days: number,
  ): string[] {
    const recs: string[] = [];

    // Single model dominance
    const models = Object.entries(byModel).sort((a, b) => b[1].costUsd - a[1].costUsd);
    if (models.length === 1 && records.length > 20) {
      recs.push(`Only using ${models[0]![0]}. Consider routing simple tasks to a cheaper model to reduce costs.`);
    }

    // Expensive model for small tasks
    for (const [model, data] of models) {
      const avgTokens = data.calls > 0 ? data.tokens / data.calls : 0;
      if (/opus|gpt-4(?!o-mini)|gpt-4-turbo/i.test(model) && avgTokens < 300 && data.calls > 10) {
        recs.push(`${model} used for ${data.calls} calls averaging ${avgTokens.toFixed(0)} tokens. Switch trivial tasks to a smaller model.`);
      }
    }

    // High error cost
    const errorCost = records.filter((r) => r.status === "error").reduce((s, r) => s + r.costUsd, 0);
    if (errorCost > totalCost * 0.1 && errorCost > 0.01) {
      recs.push(`$${errorCost.toFixed(4)} (${((errorCost / totalCost) * 100).toFixed(1)}%) spent on failed calls. Fix error sources to save money.`);
    }

    // Prompt caching opportunity
    const highPromptModels = models.filter(([_, d]) => {
      const avgPrompt = d.calls > 0 ? records.filter((r) => r.model === _).reduce((s, r) => s + r.promptTokens, 0) / d.calls : 0;
      return avgPrompt > 2000 && d.calls > 20;
    });
    if (highPromptModels.length > 0) {
      recs.push(`High prompt token usage detected. Enable prompt caching for ${highPromptModels.map(([m]) => m).join(", ")} to reduce input costs.`);
    }

    return recs;
  }
}

export function createCostTracker(config: CostTrackerConfig): CostTracker {
  return new CostTracker(config);
}

/* ── Helpers ──────────────────────────────────────────────────────── */

function bucketByDay(records: CostRecord[]): CostBucket[] {
  const dayMap = new Map<string, CostRecord[]>();
  for (const r of records) {
    const dayKey = new Date(r.ts).toISOString().slice(0, 10);
    if (!dayMap.has(dayKey)) dayMap.set(dayKey, []);
    dayMap.get(dayKey)!.push(r);
  }

  return Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([_dayKey, recs]) => {
      const byModel: CostBucket["byModel"] = {};
      const byProvider: CostBucket["byProvider"] = {};
      for (const r of recs) {
        if (!byModel[r.model]) byModel[r.model] = { costUsd: 0, tokens: 0, calls: 0 };
        byModel[r.model]!.costUsd += r.costUsd;
        byModel[r.model]!.tokens += r.totalTokens;
        byModel[r.model]!.calls += 1;

        if (!byProvider[r.provider]) byProvider[r.provider] = { costUsd: 0, tokens: 0, calls: 0 };
        byProvider[r.provider]!.costUsd += r.costUsd;
        byProvider[r.provider]!.tokens += r.totalTokens;
        byProvider[r.provider]!.calls += 1;
      }
      return {
        startTs: Math.min(...recs.map((r) => r.ts)),
        endTs: Math.max(...recs.map((r) => r.ts)),
        totalCostUsd: recs.reduce((s, r) => s + r.costUsd, 0),
        totalTokens: recs.reduce((s, r) => s + r.totalTokens, 0),
        totalCalls: recs.length,
        errorCount: recs.filter((r) => r.status === "error").length,
        byModel,
        byProvider,
      };
    });
}

function emptyReport(agentId: string, start: number, end: number): CostReport {
  return {
    agentId, periodStart: start, periodEnd: end,
    totalCostUsd: 0, totalTokens: 0, totalCalls: 0, errorCount: 0, errorRate: 0,
    avgCostPerCall: 0, avgTokensPerCall: 0, avgCostPerDay: 0, projectedMonthlyCostUsd: 0,
    costByModel: {}, costByProvider: {}, costByDay: [], anomalies: [],
    topExpensiveTraces: [], recommendations: ["No cost data available. Connect an observability provider with `amc watch connect`."],
  };
}
