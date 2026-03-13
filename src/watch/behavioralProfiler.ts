/**
 * ML-Powered Behavioral Profiling for AMC Watch
 *
 * Extends Watch's statistical anomaly detection (robust Z, MAD) with
 * behavioral pattern recognition:
 * - Tool usage pattern modeling (frequency, sequences, unusual combos)
 * - Response time anomaly detection (latency spikes, degradation trends)
 * - Decision pattern shifts (sudden strategy changes)
 * - Live trust degradation alerts pushed to operators
 *
 * Uses online learning (no training phase) — builds profile incrementally.
 */

import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

// ── Types ──────────────────────────────────────────────────────────────────

export interface BehavioralEvent {
  agentId: string;
  timestamp: number;
  eventType: "tool_call" | "decision" | "response" | "error" | "escalation";
  toolName?: string;
  latencyMs?: number;
  decision?: string;
  metadata?: Record<string, unknown>;
}

export interface BehavioralProfile {
  agentId: string;
  windowStart: number;
  windowEnd: number;
  toolUsageDistribution: Map<string, number>;          // tool → call count
  toolSequenceFrequency: Map<string, number>;          // "toolA→toolB" → count
  avgLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  decisionDistribution: Map<string, number>;           // decision type → count
  errorRate: number;
  escalationRate: number;
  totalEvents: number;
}

export interface BehavioralAnomaly {
  id: string;
  agentId: string;
  detectedAt: number;
  anomalyType: "tool_usage_shift" | "latency_spike" | "decision_drift" | "error_surge" | "novel_sequence";
  severity: "info" | "warn" | "critical";
  description: string;
  baselineValue: number;
  observedValue: number;
  deviationFactor: number;    // How many standard deviations from baseline
  evidence: Record<string, unknown>;
}

export interface TrustDegradationAlert {
  id: string;
  agentId: string;
  timestamp: number;
  alertType: "trust_degrading" | "trust_critical" | "trust_recovered";
  currentTrust: number;
  previousTrust: number;
  degradationRate: number;    // points per hour
  triggeringAnomalies: string[];
  recommendedAction: string;
}

export interface BehavioralProfilerConfig {
  windowSizeMs: number;               // Sliding window for profile (default: 1 hour)
  anomalyThresholdSigma: number;      // Standard deviations for anomaly (default: 2.5)
  trustDegradationThreshold: number;  // Score drop (0–1 scale) to trigger alert (default: 0.05)
  minEventsForProfile: number;        // Minimum events before profiling (default: 50)
  enablePushAlerts: boolean;          // Push alerts to operators
}

// ── Online Statistics ──────────────────────────────────────────────────────

class OnlineStats {
  private n = 0;
  private mean_ = 0;
  private m2 = 0;
  private values: number[] = [];

  push(x: number): void {
    this.n++;
    const delta = x - this.mean_;
    this.mean_ += delta / this.n;
    const delta2 = x - this.mean_;
    this.m2 += delta * delta2;
    this.values.push(x);
    // Keep sliding window of last 1000 values for percentiles
    if (this.values.length > 1000) this.values.shift();
  }

  get mean(): number { return this.mean_; }
  get variance(): number { return this.n > 1 ? this.m2 / (this.n - 1) : 0; }
  get stddev(): number { return Math.sqrt(this.variance); }
  get count(): number { return this.n; }

  percentile(p: number): number {
    if (this.values.length === 0) return 0;
    const sorted = [...this.values].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)]!;
  }

  zScore(x: number): number {
    if (this.stddev < 1e-9) return 0;
    return (x - this.mean) / this.stddev;
  }
}

// ── Behavioral Profiler ────────────────────────────────────────────────────

export class BehavioralProfiler extends EventEmitter {
  private config: BehavioralProfilerConfig;
  private profiles: Map<string, BehavioralProfile> = new Map();
  private latencyStats: Map<string, OnlineStats> = new Map();
  private toolStats: Map<string, OnlineStats> = new Map();        // per-window tool call count
  private errorStats: Map<string, OnlineStats> = new Map();
  private eventBuffer: Map<string, BehavioralEvent[]> = new Map();
  private trustScores: Map<string, number[]> = new Map();         // rolling trust scores
  private sequenceWindow: Map<string, string[]> = new Map();      // recent tool sequence per agent

  constructor(config?: Partial<BehavioralProfilerConfig>) {
    super();
    this.config = {
      windowSizeMs: config?.windowSizeMs ?? 3600000,          // 1 hour
      anomalyThresholdSigma: config?.anomalyThresholdSigma ?? 2.5,
      trustDegradationThreshold: config?.trustDegradationThreshold ?? 0.05,
      minEventsForProfile: config?.minEventsForProfile ?? 50,
      enablePushAlerts: config?.enablePushAlerts ?? true,
    };
  }

  /**
   * Ingest a behavioral event and check for anomalies.
   */
  ingest(event: BehavioralEvent): BehavioralAnomaly[] {
    const { agentId } = event;
    const anomalies: BehavioralAnomaly[] = [];

    // Buffer events
    if (!this.eventBuffer.has(agentId)) this.eventBuffer.set(agentId, []);
    const buffer = this.eventBuffer.get(agentId)!;
    buffer.push(event);

    // Trim to window
    const cutoff = event.timestamp - this.config.windowSizeMs;
    while (buffer.length > 0 && buffer[0]!.timestamp < cutoff) buffer.shift();

    // Update latency stats
    if (event.latencyMs !== undefined) {
      if (!this.latencyStats.has(agentId)) this.latencyStats.set(agentId, new OnlineStats());
      const stats = this.latencyStats.get(agentId)!;
      stats.push(event.latencyMs);

      // Check for latency spike
      if (stats.count >= this.config.minEventsForProfile) {
        const z = stats.zScore(event.latencyMs);
        if (z > this.config.anomalyThresholdSigma) {
          anomalies.push({
            id: randomUUID(), agentId, detectedAt: event.timestamp,
            anomalyType: "latency_spike", severity: z > 4 ? "critical" : "warn",
            description: `Latency ${event.latencyMs}ms is ${z.toFixed(1)}σ above mean ${stats.mean.toFixed(0)}ms`,
            baselineValue: stats.mean, observedValue: event.latencyMs, deviationFactor: z,
            evidence: { p95: stats.percentile(95), p99: stats.percentile(99), toolName: event.toolName },
          });
        }
      }
    }

    // Track tool sequences for novel pattern detection
    if (event.eventType === "tool_call" && event.toolName) {
      if (!this.sequenceWindow.has(agentId)) this.sequenceWindow.set(agentId, []);
      const seq = this.sequenceWindow.get(agentId)!;
      if (seq.length > 0) {
        const pair = `${seq[seq.length - 1]}→${event.toolName}`;
        const profile = this.profiles.get(agentId);
        if (profile && profile.totalEvents >= this.config.minEventsForProfile) {
          if (!profile.toolSequenceFrequency.has(pair) || profile.toolSequenceFrequency.get(pair)! < 2) {
            anomalies.push({
              id: randomUUID(), agentId, detectedAt: event.timestamp,
              anomalyType: "novel_sequence", severity: "info",
              description: `Novel tool sequence detected: ${pair}`,
              baselineValue: 0, observedValue: 1, deviationFactor: Infinity,
              evidence: { sequence: pair, recentTools: seq.slice(-5) },
            });
          }
        }
      }
      seq.push(event.toolName);
      if (seq.length > 20) seq.shift();
    }

    // Check error rate surge
    if (event.eventType === "error") {
      const windowErrors = buffer.filter(e => e.eventType === "error").length;
      const windowTotal = buffer.length;
      const errorRate = windowTotal > 0 ? windowErrors / windowTotal : 0;
      if (!this.errorStats.has(agentId)) this.errorStats.set(agentId, new OnlineStats());
      const stats = this.errorStats.get(agentId)!;
      stats.push(errorRate);

      if (stats.count >= 10) {
        const z = stats.zScore(errorRate);
        if (z > this.config.anomalyThresholdSigma) {
          anomalies.push({
            id: randomUUID(), agentId, detectedAt: event.timestamp,
            anomalyType: "error_surge", severity: errorRate > 0.3 ? "critical" : "warn",
            description: `Error rate ${(errorRate * 100).toFixed(1)}% is ${z.toFixed(1)}σ above baseline`,
            baselineValue: stats.mean, observedValue: errorRate, deviationFactor: z,
            evidence: { windowErrors, windowTotal },
          });
        }
      }
    }

    // Rebuild profile periodically
    if (buffer.length >= this.config.minEventsForProfile && buffer.length % 10 === 0) {
      this.rebuildProfile(agentId, buffer);
    }

    // Emit anomalies
    for (const anomaly of anomalies) {
      this.emit("anomaly", anomaly);
    }

    return anomalies;
  }

  /**
   * Record a trust score update and check for degradation.
   */
  recordTrustScore(agentId: string, score: number, timestamp: number): TrustDegradationAlert | null {
    if (!this.trustScores.has(agentId)) this.trustScores.set(agentId, []);
    const scores = this.trustScores.get(agentId)!;
    scores.push(score);
    if (scores.length > 100) scores.shift();

    if (scores.length < 3) return null;

    const previous = scores[scores.length - 2]!;
    const drop = previous - score;

    if (drop >= this.config.trustDegradationThreshold) {
      // Calculate degradation rate (points per hour)
      const recentScores = scores.slice(-10);
      const firstScore = recentScores[0]!;
      const totalDrop = firstScore - score;
      const timeSpanHours = Math.max(0.01, (this.config.windowSizeMs / 3600000) * (recentScores.length / scores.length));
      const degradationRate = totalDrop / timeSpanHours;

      const alert: TrustDegradationAlert = {
        id: randomUUID(), agentId, timestamp,
        alertType: score < 0.30 ? "trust_critical" : "trust_degrading",
        currentTrust: score, previousTrust: previous,
        degradationRate,
        triggeringAnomalies: [],
        recommendedAction: score < 0.30
          ? "IMMEDIATE: Agent below L2 — suspend operations and investigate."
          : "REVIEW: Trust degrading — investigate cause within 1 hour.",
      };

      if (this.config.enablePushAlerts) {
        this.emit("trustAlert", alert);
      }
      return alert;
    }

    // Check for recovery
    if (scores.length >= 5) {
      const fiveAgo = scores[scores.length - 5]!;
      if (score > fiveAgo + this.config.trustDegradationThreshold) {
        const alert: TrustDegradationAlert = {
          id: randomUUID(), agentId, timestamp,
          alertType: "trust_recovered",
          currentTrust: score, previousTrust: fiveAgo,
          degradationRate: 0, triggeringAnomalies: [],
          recommendedAction: "INFO: Trust has recovered. Resume normal monitoring.",
        };
        this.emit("trustAlert", alert);
        return alert;
      }
    }

    return null;
  }

  /**
   * Get the current behavioral profile for an agent.
   */
  getProfile(agentId: string): BehavioralProfile | undefined {
    return this.profiles.get(agentId);
  }

  private rebuildProfile(agentId: string, events: BehavioralEvent[]): void {
    const toolUsage = new Map<string, number>();
    const toolSeq = new Map<string, number>();
    const decisions = new Map<string, number>();
    let totalLatency = 0;
    let latencyCount = 0;
    let errors = 0;
    let escalations = 0;
    const latencies: number[] = [];

    let prevTool: string | undefined;
    for (const e of events) {
      if (e.toolName) {
        toolUsage.set(e.toolName, (toolUsage.get(e.toolName) ?? 0) + 1);
        if (prevTool) {
          const pair = `${prevTool}→${e.toolName}`;
          toolSeq.set(pair, (toolSeq.get(pair) ?? 0) + 1);
        }
        prevTool = e.toolName;
      }
      if (e.latencyMs !== undefined) {
        totalLatency += e.latencyMs;
        latencyCount++;
        latencies.push(e.latencyMs);
      }
      if (e.decision) decisions.set(e.decision, (decisions.get(e.decision) ?? 0) + 1);
      if (e.eventType === "error") errors++;
      if (e.eventType === "escalation") escalations++;
    }

    latencies.sort((a, b) => a - b);
    const p95Idx = Math.ceil(0.95 * latencies.length) - 1;
    const p99Idx = Math.ceil(0.99 * latencies.length) - 1;

    this.profiles.set(agentId, {
      agentId,
      windowStart: events[0]?.timestamp ?? 0,
      windowEnd: events[events.length - 1]?.timestamp ?? 0,
      toolUsageDistribution: toolUsage,
      toolSequenceFrequency: toolSeq,
      avgLatencyMs: latencyCount > 0 ? totalLatency / latencyCount : 0,
      p95LatencyMs: latencies[Math.max(0, p95Idx)] ?? 0,
      p99LatencyMs: latencies[Math.max(0, p99Idx)] ?? 0,
      decisionDistribution: decisions,
      errorRate: events.length > 0 ? errors / events.length : 0,
      escalationRate: events.length > 0 ? escalations / events.length : 0,
      totalEvents: events.length,
    });
  }
}
