/**
 * Session Correlator — Gap 7
 *
 * Groups traces by session ID and computes per-session quality metrics.
 * Enables user-journey analysis: "across 1,000 sessions, how often
 * did the agent violate its behavioral contract?"
 */

import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { NormalizedTrace } from "../watch/observabilityBridge.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";

/* ── Types ───────────────────────────────────────────────────────── */

export interface SessionSummary {
  sessionId: string;
  agentId: string;
  firstTraceTs: number;
  lastTraceTs: number;
  durationMs: number;
  traceCount: number;
  totalTokens: number;
  totalCostUsd: number;
  errorCount: number;
  errorRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  uniqueModels: string[];
  uniqueTools: string[];
  toolCallCount: number;
  llmCallCount: number;
  qualityScore: number; // 0-100
  qualityFactors: SessionQualityFactors;
  anomalies: string[];
}

export interface SessionQualityFactors {
  errorFreeRate: number; // % of traces without errors
  latencyScore: number; // 0-100 based on p95
  costEfficiencyScore: number; // 0-100 based on cost per trace
  toolReliabilityScore: number; // 0-100 based on tool success rate
  completionRate: number; // % of traces that completed (not cancelled/timeout)
  consistencyScore: number; // 0-100 based on latency variance
}

export interface SessionAnomaly {
  sessionId: string;
  type: "degradation" | "cost_spike" | "error_burst" | "latency_drift" | "abandoned";
  message: string;
  severity: "info" | "warning" | "critical";
  ts: number;
}

export interface SessionCorrelatorConfig {
  workspace: string;
  agentId: string;
  maxSessions?: number;
}

/* ── Session Correlator ──────────────────────────────────────────── */

export class SessionCorrelator {
  private config: Required<SessionCorrelatorConfig>;
  private sessions = new Map<string, NormalizedTrace[]>();
  private summaryCache = new Map<string, SessionSummary>();

  constructor(config: SessionCorrelatorConfig) {
    this.config = {
      workspace: config.workspace,
      agentId: config.agentId,
      maxSessions: config.maxSessions ?? 10000,
    };
  }

  /** Ingest a trace into its session group */
  ingestTrace(trace: NormalizedTrace): void {
    const sessionId = trace.sessionId ?? `anonymous-${trace.traceId}`;

    if (!this.sessions.has(sessionId)) {
      if (this.sessions.size >= this.config.maxSessions) {
        // Evict oldest session
        const oldest = this.findOldestSession();
        if (oldest) {
          this.sessions.delete(oldest);
          this.summaryCache.delete(oldest);
        }
      }
      this.sessions.set(sessionId, []);
    }

    this.sessions.get(sessionId)!.push(trace);
    this.summaryCache.delete(sessionId); // Invalidate cache
  }

  /** Get summary for a specific session */
  getSession(sessionId: string): SessionSummary | null {
    const cached = this.summaryCache.get(sessionId);
    if (cached) return cached;

    const traces = this.sessions.get(sessionId);
    if (!traces || traces.length === 0) return null;

    const summary = computeSessionSummary(sessionId, this.config.agentId, traces);
    this.summaryCache.set(sessionId, summary);
    return summary;
  }

  /** List all sessions with summaries */
  listSessions(limit?: number, sortBy?: "recent" | "quality" | "cost"): SessionSummary[] {
    const summaries: SessionSummary[] = [];
    for (const [sessionId] of this.sessions) {
      const summary = this.getSession(sessionId);
      if (summary) summaries.push(summary);
    }

    switch (sortBy) {
      case "quality": summaries.sort((a, b) => a.qualityScore - b.qualityScore); break;
      case "cost": summaries.sort((a, b) => b.totalCostUsd - a.totalCostUsd); break;
      case "recent":
      default: summaries.sort((a, b) => b.lastTraceTs - a.lastTraceTs); break;
    }

    return limit ? summaries.slice(0, limit) : summaries;
  }

  /** Detect anomalies across all sessions */
  detectAnomalies(): SessionAnomaly[] {
    const anomalies: SessionAnomaly[] = [];
    const allSummaries = this.listSessions();
    if (allSummaries.length < 5) return anomalies;

    const avgQuality = allSummaries.reduce((s, ss) => s + ss.qualityScore, 0) / allSummaries.length;
    const avgCost = allSummaries.reduce((s, ss) => s + ss.totalCostUsd, 0) / allSummaries.length;

    for (const summary of allSummaries) {
      // Quality degradation
      if (summary.qualityScore < avgQuality * 0.6 && summary.traceCount >= 3) {
        anomalies.push({
          sessionId: summary.sessionId,
          type: "degradation",
          message: `Session quality ${summary.qualityScore.toFixed(0)}% is significantly below average ${avgQuality.toFixed(0)}%`,
          severity: summary.qualityScore < avgQuality * 0.3 ? "critical" : "warning",
          ts: summary.lastTraceTs,
        });
      }

      // Cost spike
      if (summary.totalCostUsd > avgCost * 5 && summary.totalCostUsd > 0.01) {
        anomalies.push({
          sessionId: summary.sessionId,
          type: "cost_spike",
          message: `Session cost $${summary.totalCostUsd.toFixed(4)} is ${(summary.totalCostUsd / avgCost).toFixed(1)}x average`,
          severity: "warning",
          ts: summary.lastTraceTs,
        });
      }

      // Error burst
      if (summary.errorRate > 0.5 && summary.traceCount >= 3) {
        anomalies.push({
          sessionId: summary.sessionId,
          type: "error_burst",
          message: `${(summary.errorRate * 100).toFixed(0)}% error rate across ${summary.traceCount} traces`,
          severity: "critical",
          ts: summary.lastTraceTs,
        });
      }

      // Abandoned session (single trace, high latency or error)
      if (summary.traceCount === 1 && (summary.errorCount > 0 || summary.avgLatencyMs > 30000)) {
        anomalies.push({
          sessionId: summary.sessionId,
          type: "abandoned",
          message: `Single-trace session ${summary.errorCount > 0 ? "with error" : "with high latency"} — likely abandoned`,
          severity: "info",
          ts: summary.lastTraceTs,
        });
      }
    }

    return anomalies;
  }

  /** Get aggregate stats across all sessions */
  getAggregateStats(): {
    totalSessions: number;
    avgTracesPerSession: number;
    avgQualityScore: number;
    avgSessionDurationMs: number;
    totalCostUsd: number;
    errorSessionPct: number;
    abandonedSessionPct: number;
  } {
    const summaries = this.listSessions();
    if (summaries.length === 0) {
      return { totalSessions: 0, avgTracesPerSession: 0, avgQualityScore: 0, avgSessionDurationMs: 0, totalCostUsd: 0, errorSessionPct: 0, abandonedSessionPct: 0 };
    }

    const totalTraces = summaries.reduce((s, ss) => s + ss.traceCount, 0);
    const totalCost = summaries.reduce((s, ss) => s + ss.totalCostUsd, 0);
    const avgQuality = summaries.reduce((s, ss) => s + ss.qualityScore, 0) / summaries.length;
    const avgDuration = summaries.reduce((s, ss) => s + ss.durationMs, 0) / summaries.length;
    const errorSessions = summaries.filter((s) => s.errorCount > 0).length;
    const abandonedSessions = summaries.filter((s) => s.traceCount === 1).length;

    return {
      totalSessions: summaries.length,
      avgTracesPerSession: totalTraces / summaries.length,
      avgQualityScore: avgQuality,
      avgSessionDurationMs: avgDuration,
      totalCostUsd: totalCost,
      errorSessionPct: (errorSessions / summaries.length) * 100,
      abandonedSessionPct: (abandonedSessions / summaries.length) * 100,
    };
  }

  /** Persist session data */
  flush(): void {
    const dir = join(this.config.workspace, ".amc", "agents", this.config.agentId, "sessions");
    ensureDir(dir);
    const summaries = this.listSessions();
    writeFileAtomic(join(dir, "session_summaries.json"), JSON.stringify(summaries, null, 2));
  }

  private findOldestSession(): string | undefined {
    let oldest: string | undefined;
    let oldestTs = Infinity;
    for (const [sessionId, traces] of this.sessions) {
      const firstTs = traces[0]?.startTimeMs ?? Infinity;
      if (firstTs < oldestTs) {
        oldest = sessionId;
        oldestTs = firstTs;
      }
    }
    return oldest;
  }
}

export function createSessionCorrelator(config: SessionCorrelatorConfig): SessionCorrelator {
  return new SessionCorrelator(config);
}

/* ── Session quality computation ─────────────────────────────────── */

function computeSessionSummary(sessionId: string, agentId: string, traces: NormalizedTrace[]): SessionSummary {
  const sorted = [...traces].sort((a, b) => a.startTimeMs - b.startTimeMs);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;

  const latencies = traces.map((t) => t.durationMs).sort((a, b) => a - b);
  const errorCount = traces.filter((t) => t.status === "error").length;
  const totalTokens = traces.reduce((s, t) => s + t.totalTokens, 0);
  const totalCost = traces.reduce((s, t) => s + t.totalCostUsd, 0);

  const allSpans = traces.flatMap((t) => t.spans);
  const toolSpans = allSpans.filter((s) => s.kind === "tool_call");
  const toolSuccess = toolSpans.filter((s) => s.status === "ok" || s.toolSuccess === true);

  const models = new Set<string>();
  const tools = new Set<string>();
  for (const s of allSpans) {
    if (s.model) models.add(s.model);
    if (s.toolName) tools.add(s.toolName);
  }

  // Quality factors
  const errorFreeRate = traces.length > 0 ? (traces.length - errorCount) / traces.length : 1;
  const p95 = percentile(latencies, 0.95);
  const latencyScore = p95 < 3000 ? 100 : p95 < 10000 ? 80 : p95 < 30000 ? 50 : p95 < 60000 ? 25 : 10;
  const avgCost = traces.length > 0 ? totalCost / traces.length : 0;
  const costEfficiencyScore = avgCost < 0.005 ? 100 : avgCost < 0.02 ? 80 : avgCost < 0.10 ? 60 : avgCost < 0.50 ? 30 : 10;
  const toolReliabilityScore = toolSpans.length > 0 ? (toolSuccess.length / toolSpans.length) * 100 : 100;
  const completedTraces = traces.filter((t) => t.status !== "cancelled" && t.status !== "timeout");
  const completionRate = traces.length > 0 ? completedTraces.length / traces.length : 1;

  // Consistency: low variance in latency = high consistency
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const variance = latencies.reduce((s, l) => s + Math.pow(l - avgLatency, 2), 0) / latencies.length;
  const cv = avgLatency > 0 ? Math.sqrt(variance) / avgLatency : 0;
  const consistencyScore = cv < 0.3 ? 100 : cv < 0.6 ? 75 : cv < 1.0 ? 50 : 25;

  const qualityFactors: SessionQualityFactors = {
    errorFreeRate,
    latencyScore,
    costEfficiencyScore,
    toolReliabilityScore,
    completionRate,
    consistencyScore,
  };

  // Weighted quality score
  const qualityScore = Math.round(
    errorFreeRate * 30 +
    (latencyScore / 100) * 20 +
    (costEfficiencyScore / 100) * 10 +
    (toolReliabilityScore / 100) * 15 +
    completionRate * 15 +
    (consistencyScore / 100) * 10
  );

  // Anomalies
  const anomalies: string[] = [];
  if (errorFreeRate < 0.5) anomalies.push("High error rate");
  if (p95 > 30000) anomalies.push("High latency");
  if (toolReliabilityScore < 50) anomalies.push("Tool failures");
  if (cv > 1.0) anomalies.push("Inconsistent performance");

  return {
    sessionId,
    agentId,
    firstTraceTs: first.startTimeMs,
    lastTraceTs: last.endTimeMs,
    durationMs: last.endTimeMs - first.startTimeMs,
    traceCount: traces.length,
    totalTokens,
    totalCostUsd: totalCost,
    errorCount,
    errorRate: traces.length > 0 ? errorCount / traces.length : 0,
    avgLatencyMs: avgLatency,
    p95LatencyMs: p95,
    uniqueModels: Array.from(models),
    uniqueTools: Array.from(tools),
    toolCallCount: toolSpans.length,
    llmCallCount: allSpans.filter((s) => s.kind === "llm_call").length,
    qualityScore,
    qualityFactors,
    anomalies,
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(sorted.length * p) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))]!;
}
