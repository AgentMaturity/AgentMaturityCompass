/**
 * Backpressure Management
 *
 * Monitors write queue depth, signals backpressure to gateway,
 * and integrates with circuit breaker for cascading protection.
 */

import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BackpressureConfig {
  maxQueueDepth: number;
  warningThresholdPct: number; // 0.0–1.0, default 0.8
  retryAfterSeconds: number;
}

export interface BackpressureMetrics {
  eventsTotal: number;
  eventsDropped: number;
  currentQueueDepth: number;
  maxQueueDepth: number;
  signalActive: boolean;
  lastSignalTs: number | null;
  retryAfterSeconds: number;
}

export interface BackpressureEvent {
  eventId: string;
  ts: number;
  type: "SIGNAL_ON" | "SIGNAL_OFF" | "EVENT_DROPPED";
  queueDepth: number;
  detail: string;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let config: BackpressureConfig = {
  maxQueueDepth: 1000,
  warningThresholdPct: 0.8,
  retryAfterSeconds: 5,
};

let queueDepth = 0;
let eventsTotal = 0;
let eventsDropped = 0;
let signalActive = false;
let lastSignalTs: number | null = null;
const eventLog: BackpressureEvent[] = [];

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export function configureBackpressure(partial: Partial<BackpressureConfig>): BackpressureConfig {
  config = { ...config, ...partial };
  return { ...config };
}

export function getBackpressureConfig(): BackpressureConfig {
  return { ...config };
}

// ---------------------------------------------------------------------------
// Queue operations
// ---------------------------------------------------------------------------

export function enqueue(): { accepted: boolean; retryAfter: number | null } {
  eventsTotal++;

  if (queueDepth >= config.maxQueueDepth) {
    eventsDropped++;
    logEvent("EVENT_DROPPED", `Queue full at ${queueDepth}/${config.maxQueueDepth}`);
    return { accepted: false, retryAfter: config.retryAfterSeconds };
  }

  queueDepth++;
  checkThreshold();
  return { accepted: true, retryAfter: null };
}

export function dequeue(count = 1): void {
  queueDepth = Math.max(0, queueDepth - count);
  checkThreshold();
}

export function setQueueDepth(depth: number): void {
  queueDepth = Math.max(0, depth);
  checkThreshold();
}

// ---------------------------------------------------------------------------
// Signal management
// ---------------------------------------------------------------------------

function checkThreshold(): void {
  const threshold = Math.floor(config.maxQueueDepth * config.warningThresholdPct);
  const shouldSignal = queueDepth >= threshold;

  if (shouldSignal && !signalActive) {
    signalActive = true;
    lastSignalTs = Date.now();
    logEvent("SIGNAL_ON", `Queue depth ${queueDepth} >= ${threshold} (${(config.warningThresholdPct * 100).toFixed(0)}% of ${config.maxQueueDepth})`);
  } else if (!shouldSignal && signalActive) {
    signalActive = false;
    logEvent("SIGNAL_OFF", `Queue depth ${queueDepth} < ${threshold}`);
  }
}

/**
 * Check if the gateway should respond with 429.
 */
export function shouldReject(): { reject: boolean; retryAfter: number } {
  return {
    reject: signalActive,
    retryAfter: config.retryAfterSeconds,
  };
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export function getBackpressureMetrics(): BackpressureMetrics {
  return {
    eventsTotal,
    eventsDropped,
    currentQueueDepth: queueDepth,
    maxQueueDepth: config.maxQueueDepth,
    signalActive,
    lastSignalTs,
    retryAfterSeconds: config.retryAfterSeconds,
  };
}

/**
 * Prometheus-style metrics output.
 */
export function renderBackpressurePrometheus(): string {
  const m = getBackpressureMetrics();
  return [
    `# HELP amc_backpressure_events_total Total backpressure events processed`,
    `# TYPE amc_backpressure_events_total counter`,
    `amc_backpressure_events_total ${m.eventsTotal}`,
    `# HELP amc_backpressure_events_dropped_total Events dropped due to full queue`,
    `# TYPE amc_backpressure_events_dropped_total counter`,
    `amc_backpressure_events_dropped_total ${m.eventsDropped}`,
    `# HELP amc_write_queue_depth Current write queue depth`,
    `# TYPE amc_write_queue_depth gauge`,
    `amc_write_queue_depth ${m.currentQueueDepth}`,
    `# HELP amc_backpressure_signal_active Whether backpressure signal is active`,
    `# TYPE amc_backpressure_signal_active gauge`,
    `amc_backpressure_signal_active ${m.signalActive ? 1 : 0}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export function renderBackpressureStatus(): string {
  const m = getBackpressureMetrics();
  const pct = m.maxQueueDepth > 0 ? ((m.currentQueueDepth / m.maxQueueDepth) * 100).toFixed(1) : "0";
  const lines = [
    "# Backpressure Status",
    "",
    `- Queue depth: ${m.currentQueueDepth}/${m.maxQueueDepth} (${pct}%)`,
    `- Signal active: ${m.signalActive ? "YES ⚠️" : "NO ✓"}`,
    `- Events total: ${m.eventsTotal}`,
    `- Events dropped: ${m.eventsDropped}`,
    `- Retry-After: ${m.retryAfterSeconds}s`,
  ];

  if (m.lastSignalTs) {
    lines.push(`- Last signal: ${new Date(m.lastSignalTs).toISOString()}`);
  }

  if (eventLog.length > 0) {
    lines.push("");
    lines.push("## Recent Events");
    for (const e of eventLog.slice(-10)) {
      lines.push(`- [${new Date(e.ts).toISOString()}] ${e.type}: ${e.detail}`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function logEvent(type: BackpressureEvent["type"], detail: string): void {
  eventLog.push({
    eventId: `bp_${randomUUID().slice(0, 12)}`,
    ts: Date.now(),
    type,
    queueDepth,
    detail,
  });
  if (eventLog.length > 200) eventLog.splice(0, eventLog.length - 200);
}

// ---------------------------------------------------------------------------
// Reset (testing)
// ---------------------------------------------------------------------------

export function resetBackpressure(): void {
  queueDepth = 0;
  eventsTotal = 0;
  eventsDropped = 0;
  signalActive = false;
  lastSignalTs = null;
  eventLog.length = 0;
  config = { maxQueueDepth: 1000, warningThresholdPct: 0.8, retryAfterSeconds: 5 };
}
