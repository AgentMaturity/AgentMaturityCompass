/**
 * Continuous Drift Monitor — MF-02
 *
 * Extends AMC's existing drift detection from "between-run comparison" to
 * continuous real-time monitoring. Runs as a long-lived process or on-demand,
 * polling at configurable intervals.
 *
 * Capabilities:
 * 1. Periodic assessment runs at configurable intervals
 * 2. Real-time behavioral anomaly detection via ledger event streaming
 * 3. Prompt injection pattern detection in live agent behavior
 * 4. Context pollution tracking (growing adversarial content in context)
 * 5. Tool API change detection (external dependency monitoring)
 * 6. Time-series metric storage with trend analysis
 * 7. Statistical anomaly detection with configurable sensitivity
 *
 * MiroFish agent quote:
 * "Agents silently drift from prompt injection, context pollution,
 *  tool API changes — no tools detect this in real-time."
 *  — Lisa Chang, VP Engineering
 */

import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import { EventEmitter } from "node:events";
import { openLedger } from "../ledger/ledger.js";
import { parseEvidenceEvent } from "../diagnostic/gates.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { resolveAgentId, getAgentPaths } from "../fleet/paths.js";
import { runDriftCheck } from "./driftDetector.js";
import { startTrustDriftMonitor } from "../monitor/trustDriftMonitor.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export const continuousMonitorConfigSchema = z.object({
  schemaVersion: z.literal(1),
  /** Polling interval in seconds (minimum 30) */
  intervalSeconds: z.number().min(30).default(300),
  /** Enable prompt injection detection */
  detectPromptInjection: z.boolean().default(true),
  /** Enable context pollution tracking */
  trackContextPollution: z.boolean().default(true),
  /** Enable tool API change detection */
  detectToolApiChanges: z.boolean().default(true),
  /** Anomaly detection sensitivity (0-1, higher = more sensitive) */
  anomalySensitivity: z.number().min(0).max(1).default(0.5),
  /** Maximum events to analyze per tick */
  maxEventsPerTick: z.number().min(10).default(1000),
  /** Time-series retention in days */
  retentionDays: z.number().min(1).default(90),
  /** Alert on these severity levels */
  alertSeverities: z.array(z.enum(["info", "warning", "critical"])).default(["warning", "critical"]),
  /** Webhook URLs for alerts */
  webhookUrls: z.array(z.string().url()).default([]),
  /** Trust drift threshold (points out of 100) */
  trustDriftThreshold: z.number().min(0.1).max(50).default(5),
});

export type ContinuousMonitorConfig = z.infer<typeof continuousMonitorConfigSchema>;

// ---------------------------------------------------------------------------
// Time-series storage
// ---------------------------------------------------------------------------

export interface MetricPoint {
  ts: number;
  metricName: string;
  value: number;
  agentId: string;
  tags: Record<string, string>;
}

export interface TimeSeriesStore {
  schemaVersion: 1;
  agentId: string;
  points: MetricPoint[];
  lastPruneTs: number;
}

function metricsPath(workspace: string, agentId: string): string {
  return join(workspace, ".amc", "monitor", "continuous", `${agentId}-metrics.json`);
}

function loadTimeSeries(workspace: string, agentId: string): TimeSeriesStore {
  const file = metricsPath(workspace, agentId);
  if (pathExists(file)) {
    try {
      return JSON.parse(readUtf8(file)) as TimeSeriesStore;
    } catch { /* fallthrough */ }
  }
  return { schemaVersion: 1, agentId, points: [], lastPruneTs: Date.now() };
}

function saveTimeSeries(workspace: string, store: TimeSeriesStore): void {
  const file = metricsPath(workspace, store.agentId);
  ensureDir(join(workspace, ".amc", "monitor", "continuous"));
  writeFileAtomic(file, JSON.stringify(store, null, 2), 0o644);
}

function pruneTimeSeries(store: TimeSeriesStore, retentionDays: number): void {
  const cutoff = Date.now() - retentionDays * 86_400_000;
  store.points = store.points.filter((p) => p.ts >= cutoff);
  store.lastPruneTs = Date.now();
}

// ---------------------------------------------------------------------------
// Anomaly detection
// ---------------------------------------------------------------------------

export interface AnomalyResult {
  metricName: string;
  currentValue: number;
  baseline: number;
  stdDev: number;
  zScore: number;
  isAnomaly: boolean;
  direction: "up" | "down" | "stable";
  severity: "info" | "warning" | "critical";
}

function detectAnomalies(
  points: MetricPoint[],
  metricName: string,
  currentValue: number,
  sensitivity: number,
): AnomalyResult {
  const metricPoints = points
    .filter((p) => p.metricName === metricName)
    .map((p) => p.value);

  if (metricPoints.length < 5) {
    // Not enough data for baseline
    return {
      metricName,
      currentValue,
      baseline: currentValue,
      stdDev: 0,
      zScore: 0,
      isAnomaly: false,
      direction: "stable",
      severity: "info",
    };
  }

  const mean = metricPoints.reduce((s, v) => s + v, 0) / metricPoints.length;
  const variance = metricPoints.reduce((s, v) => s + (v - mean) ** 2, 0) / metricPoints.length;
  const std = Math.sqrt(variance);

  const zScore = std > 0 ? (currentValue - mean) / std : 0;
  // Threshold based on sensitivity: higher sensitivity = lower threshold
  const threshold = 3 - sensitivity * 2; // 1-3 range
  const isAnomaly = Math.abs(zScore) > threshold;

  let severity: "info" | "warning" | "critical" = "info";
  if (Math.abs(zScore) > threshold * 2) severity = "critical";
  else if (isAnomaly) severity = "warning";

  let direction: "up" | "down" | "stable" = "stable";
  if (zScore > 0.5) direction = "up";
  else if (zScore < -0.5) direction = "down";

  return {
    metricName,
    currentValue,
    baseline: Number(mean.toFixed(4)),
    stdDev: Number(std.toFixed(4)),
    zScore: Number(zScore.toFixed(4)),
    isAnomaly,
    direction,
    severity,
  };
}

// ---------------------------------------------------------------------------
// Behavioral pattern detectors
// ---------------------------------------------------------------------------

/** Detect prompt injection attempts from ledger events */
export interface InjectionDetection {
  detected: boolean;
  patterns: Array<{
    eventId: string;
    ts: number;
    pattern: string;
    confidence: number;
    payload: string;
  }>;
}

const INJECTION_PATTERNS = [
  { pattern: /ignore\s+(all\s+)?previous\s+instructions/i, name: "override_instructions", confidence: 0.95 },
  { pattern: /you\s+are\s+now\s+(a|an)\s+/i, name: "identity_override", confidence: 0.85 },
  { pattern: /\bsystem:\s*/i, name: "fake_system_prompt", confidence: 0.8 },
  { pattern: /forget\s+(everything|all|your)\s/i, name: "memory_wipe", confidence: 0.9 },
  { pattern: /\bact\s+as\s+(if|though)?\s*/i, name: "roleplay_injection", confidence: 0.7 },
  { pattern: /do\s+not\s+follow\s+(your|the)\s+(instructions|rules)/i, name: "rule_bypass", confidence: 0.95 },
  { pattern: /\[INST\]|\[\/INST\]|<\|system\|>|<\|user\|>/i, name: "token_injection", confidence: 0.9 },
  { pattern: /base64\s*[:=]\s*[A-Za-z0-9+/=]{20,}/i, name: "encoded_payload", confidence: 0.75 },
  { pattern: /\bDAN\b.*\bjailbreak\b|\bjailbreak\b.*\bDAN\b/i, name: "jailbreak_attempt", confidence: 0.85 },
  { pattern: /translate.*to.*and\s+also/i, name: "task_hijack", confidence: 0.65 },
];

function detectInjections(events: Array<{ id: string; ts: number; payload: string }>): InjectionDetection {
  const patterns: InjectionDetection["patterns"] = [];

  for (const event of events) {
    for (const { pattern, name, confidence } of INJECTION_PATTERNS) {
      if (pattern.test(event.payload)) {
        patterns.push({
          eventId: event.id,
          ts: event.ts,
          pattern: name,
          confidence,
          payload: event.payload.slice(0, 200),
        });
      }
    }
  }

  return { detected: patterns.length > 0, patterns };
}

/** Track context pollution — adversarial content accumulating in context */
export interface ContextPollutionResult {
  pollutionScore: number; // 0-1
  totalEvents: number;
  suspiciousEvents: number;
  growthRate: number; // suspicious events per hour
  trending: "increasing" | "stable" | "decreasing";
}

function trackContextPollution(
  events: Array<{ id: string; ts: number; payload: string }>,
  historicalScore?: number,
): ContextPollutionResult {
  let suspiciousCount = 0;
  const SUSPICIOUS_RE = /\b(ignore|forget|override|bypass|jailbreak|pretend|roleplay|system:)\b/i;

  for (const event of events) {
    if (SUSPICIOUS_RE.test(event.payload)) suspiciousCount++;
  }

  const score = events.length > 0 ? suspiciousCount / events.length : 0;

  // Calculate growth rate (suspicious events per hour)
  let growthRate = 0;
  if (events.length >= 2) {
    const timeSpan = events[events.length - 1]!.ts - events[0]!.ts;
    const hours = timeSpan / 3_600_000;
    growthRate = hours > 0 ? suspiciousCount / hours : 0;
  }

  let trending: "increasing" | "stable" | "decreasing" = "stable";
  if (historicalScore !== undefined) {
    if (score > historicalScore + 0.1) trending = "increasing";
    else if (score < historicalScore - 0.1) trending = "decreasing";
  }

  return {
    pollutionScore: Number(score.toFixed(4)),
    totalEvents: events.length,
    suspiciousEvents: suspiciousCount,
    growthRate: Number(growthRate.toFixed(2)),
    trending,
  };
}

/** Detect tool API changes by comparing tool call patterns */
export interface ToolApiChangeResult {
  changesDetected: boolean;
  changes: Array<{
    toolName: string;
    changeType: "new_tool" | "removed_tool" | "signature_change" | "error_rate_spike";
    details: string;
  }>;
}

function detectToolApiChanges(
  recentEvents: Array<{ id: string; ts: number; eventType: string; payload: string; meta: Record<string, unknown> }>,
  baselineToolHashes: Map<string, string>,
): ToolApiChangeResult {
  const toolCalls = recentEvents.filter((e) => e.eventType === "tool_action" || e.eventType === "tool_result");
  const toolErrors = recentEvents.filter(
    (e) => e.eventType === "tool_result" && (e.payload.includes('"error"') || e.payload.includes('"status":"failed"')),
  );

  const currentTools = new Set<string>();
  const currentToolHashes = new Map<string, string>();
  for (const tc of toolCalls) {
    const toolName = (tc.meta?.toolName as string) ?? "unknown";
    currentTools.add(toolName);
    // Hash the payload shape as a proxy for API signature
    const shape = tc.payload.replace(/["\d]/g, "").slice(0, 100);
    currentToolHashes.set(toolName, sha256Hex(shape).slice(0, 16));
  }

  const changes: ToolApiChangeResult["changes"] = [];

  // Detect new tools
  for (const tool of currentTools) {
    if (!baselineToolHashes.has(tool)) {
      changes.push({
        toolName: tool,
        changeType: "new_tool",
        details: `New tool "${tool}" appeared in agent interactions`,
      });
    }
  }

  // Detect removed tools
  for (const [tool] of baselineToolHashes) {
    if (!currentTools.has(tool)) {
      changes.push({
        toolName: tool,
        changeType: "removed_tool",
        details: `Tool "${tool}" no longer being called`,
      });
    }
  }

  // Detect signature changes
  for (const [tool, hash] of currentToolHashes) {
    const baselineHash = baselineToolHashes.get(tool);
    if (baselineHash && baselineHash !== hash) {
      changes.push({
        toolName: tool,
        changeType: "signature_change",
        details: `Tool "${tool}" payload shape changed (hash ${baselineHash} → ${hash})`,
      });
    }
  }

  // Detect error rate spikes
  const errorRate = toolCalls.length > 0 ? toolErrors.length / toolCalls.length : 0;
  if (errorRate > 0.2 && toolErrors.length >= 3) {
    changes.push({
      toolName: "_aggregate",
      changeType: "error_rate_spike",
      details: `Tool error rate ${(errorRate * 100).toFixed(0)}% (${toolErrors.length}/${toolCalls.length} calls failed)`,
    });
  }

  return { changesDetected: changes.length > 0, changes };
}

// ---------------------------------------------------------------------------
// Monitor tick — single monitoring cycle
// ---------------------------------------------------------------------------

export interface MonitorTickResult {
  tickId: string;
  ts: number;
  agentId: string;
  durationMs: number;
  eventsAnalyzed: number;
  anomalies: AnomalyResult[];
  injections: InjectionDetection;
  contextPollution: ContextPollutionResult;
  toolApiChanges: ToolApiChangeResult;
  trustDriftAlerts: number;
  overallSeverity: "ok" | "info" | "warning" | "critical";
  summary: string;
}

export function runMonitorTick(params: {
  workspace: string;
  agentId?: string;
  config: ContinuousMonitorConfig;
  /** Baseline tool hashes from previous ticks */
  baselineToolHashes?: Map<string, string>;
  /** Historical pollution score for trend */
  historicalPollutionScore?: number;
}): MonitorTickResult {
  const startTs = Date.now();
  const workspace = params.workspace;
  const agentId = resolveAgentId(workspace, params.agentId);
  const config = params.config;

  // 1. Collect recent ledger events
  const windowMs = config.intervalSeconds * 1000 * 2; // Look back 2x the interval
  const windowStart = startTs - windowMs;
  let events: Array<{ id: string; ts: number; eventType: string; payload: string; meta: Record<string, unknown> }> = [];

  try {
    const ledger = openLedger(workspace);
    const rawEvents = ledger.getEventsBetween(windowStart, startTs);
    events = rawEvents
      .map((e) => {
        try {
          const parsed = parseEvidenceEvent(e);
          return {
            id: parsed.id ?? e.id ?? randomUUID().slice(0, 8),
            ts: parsed.ts ?? startTs,
            eventType: parsed.event_type ?? "unknown",
            payload: parsed.text ?? parsed.payload_inline ?? "",
            meta: (parsed.meta ?? {}) as Record<string, unknown>,
          };
        } catch {
          return null;
        }
      })
      .filter((e): e is NonNullable<typeof e> => e !== null)
      .slice(0, config.maxEventsPerTick);
    ledger.close();
  } catch {
    // Ledger might not exist yet
  }

  // 2. Load time-series for anomaly baselines
  const store = loadTimeSeries(workspace, agentId);

  // 3. Detect prompt injection
  const injections = config.detectPromptInjection
    ? detectInjections(events)
    : { detected: false, patterns: [] };

  // 4. Track context pollution
  const contextPollution = config.trackContextPollution
    ? trackContextPollution(events, params.historicalPollutionScore)
    : { pollutionScore: 0, totalEvents: 0, suspiciousEvents: 0, growthRate: 0, trending: "stable" as const };

  // 5. Detect tool API changes
  const toolApiChanges = config.detectToolApiChanges
    ? detectToolApiChanges(events, params.baselineToolHashes ?? new Map())
    : { changesDetected: false, changes: [] };

  // 6. Run trust drift monitor
  let trustDriftAlerts = 0;
  try {
    const driftResult = startTrustDriftMonitor({
      workspace,
      agentId,
      alertThreshold: config.trustDriftThreshold,
    });
    trustDriftAlerts = driftResult.alerts.length;
  } catch {
    // Trust drift monitor may fail if no runs exist
  }

  // 7. Compute anomaly metrics
  const anomalies: AnomalyResult[] = [];

  // Event volume anomaly
  const eventVolume = events.length;
  anomalies.push(
    detectAnomalies(store.points, "event_volume", eventVolume, config.anomalySensitivity),
  );

  // Injection rate anomaly
  const injectionRate = events.length > 0 ? injections.patterns.length / events.length : 0;
  anomalies.push(
    detectAnomalies(store.points, "injection_rate", injectionRate, config.anomalySensitivity),
  );

  // Error rate anomaly
  const errorEvents = events.filter((e) => e.eventType === "error" || e.payload.includes('"error"'));
  const errorRate = events.length > 0 ? errorEvents.length / events.length : 0;
  anomalies.push(
    detectAnomalies(store.points, "error_rate", errorRate, config.anomalySensitivity),
  );

  // Tool call volume anomaly
  const toolCallCount = events.filter((e) => e.eventType === "tool_action").length;
  anomalies.push(
    detectAnomalies(store.points, "tool_call_volume", toolCallCount, config.anomalySensitivity),
  );

  // Pollution score anomaly
  anomalies.push(
    detectAnomalies(store.points, "pollution_score", contextPollution.pollutionScore, config.anomalySensitivity),
  );

  // 8. Store new metrics
  const newPoints: MetricPoint[] = [
    { ts: startTs, metricName: "event_volume", value: eventVolume, agentId, tags: {} },
    { ts: startTs, metricName: "injection_rate", value: injectionRate, agentId, tags: {} },
    { ts: startTs, metricName: "error_rate", value: errorRate, agentId, tags: {} },
    { ts: startTs, metricName: "tool_call_volume", value: toolCallCount, agentId, tags: {} },
    { ts: startTs, metricName: "pollution_score", value: contextPollution.pollutionScore, agentId, tags: {} },
  ];
  store.points.push(...newPoints);

  // Prune old data
  if (startTs - store.lastPruneTs > 86_400_000) {
    pruneTimeSeries(store, config.retentionDays);
  }
  saveTimeSeries(workspace, store);

  // 9. Determine overall severity
  let overallSeverity: "ok" | "info" | "warning" | "critical" = "ok";
  if (injections.detected && injections.patterns.some((p) => p.confidence > 0.8)) {
    overallSeverity = "critical";
  } else if (trustDriftAlerts > 0 || toolApiChanges.changesDetected) {
    overallSeverity = "warning";
  } else if (anomalies.some((a) => a.isAnomaly)) {
    overallSeverity = overallSeverity === "ok" ? "warning" : overallSeverity;
  } else if (contextPollution.pollutionScore > 0.3) {
    overallSeverity = overallSeverity === "ok" ? "info" : overallSeverity;
  }

  // 10. Build summary
  const summaryParts: string[] = [];
  if (injections.detected) summaryParts.push(`${injections.patterns.length} injection pattern(s) detected`);
  if (trustDriftAlerts > 0) summaryParts.push(`${trustDriftAlerts} trust drift alert(s)`);
  if (toolApiChanges.changesDetected) summaryParts.push(`${toolApiChanges.changes.length} tool API change(s)`);
  if (contextPollution.pollutionScore > 0.1) summaryParts.push(`context pollution ${(contextPollution.pollutionScore * 100).toFixed(0)}%`);
  const anomalyCount = anomalies.filter((a) => a.isAnomaly).length;
  if (anomalyCount > 0) summaryParts.push(`${anomalyCount} metric anomaly/ies`);
  if (summaryParts.length === 0) summaryParts.push("All clear");

  const durationMs = Date.now() - startTs;

  return {
    tickId: `tick_${randomUUID().slice(0, 12)}`,
    ts: startTs,
    agentId,
    durationMs,
    eventsAnalyzed: events.length,
    anomalies,
    injections,
    contextPollution,
    toolApiChanges,
    trustDriftAlerts,
    overallSeverity,
    summary: summaryParts.join("; "),
  };
}

// ---------------------------------------------------------------------------
// Monitor session — manages state across ticks
// ---------------------------------------------------------------------------

export interface MonitorSession {
  sessionId: string;
  agentId: string;
  config: ContinuousMonitorConfig;
  startedTs: number;
  tickCount: number;
  lastTickTs: number;
  toolHashes: Map<string, string>;
  lastPollutionScore: number;
  ticks: MonitorTickResult[];
  /** Max stored ticks for in-memory history */
  maxTicks: number;
}

export function createMonitorSession(params: {
  workspace: string;
  agentId?: string;
  config?: Partial<ContinuousMonitorConfig>;
  maxTicks?: number;
}): MonitorSession {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const config = continuousMonitorConfigSchema.parse({
    schemaVersion: 1,
    ...params.config,
  });

  return {
    sessionId: `msess_${randomUUID().slice(0, 12)}`,
    agentId,
    config,
    startedTs: Date.now(),
    tickCount: 0,
    lastTickTs: 0,
    toolHashes: new Map(),
    lastPollutionScore: 0,
    ticks: [],
    maxTicks: params.maxTicks ?? 100,
  };
}

/** Execute one monitoring tick within a session */
export function executeSessionTick(
  workspace: string,
  session: MonitorSession,
): MonitorTickResult {
  const result = runMonitorTick({
    workspace,
    agentId: session.agentId,
    config: session.config,
    baselineToolHashes: session.toolHashes,
    historicalPollutionScore: session.lastPollutionScore,
  });

  // Update session state
  session.tickCount++;
  session.lastTickTs = result.ts;
  session.lastPollutionScore = result.contextPollution.pollutionScore;

  // Update tool hashes baseline from this tick's events
  if (result.toolApiChanges.changesDetected) {
    for (const change of result.toolApiChanges.changes) {
      if (change.changeType === "new_tool" || change.changeType === "signature_change") {
        session.toolHashes.set(change.toolName, randomUUID().slice(0, 16));
      } else if (change.changeType === "removed_tool") {
        session.toolHashes.delete(change.toolName);
      }
    }
  }

  // Store tick (capped)
  session.ticks.push(result);
  if (session.ticks.length > session.maxTicks) {
    session.ticks = session.ticks.slice(-session.maxTicks);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Report rendering
// ---------------------------------------------------------------------------

export function renderMonitorTickMarkdown(tick: MonitorTickResult): string {
  const severityIcon = {
    ok: "🟢",
    info: "🔵",
    warning: "🟡",
    critical: "🔴",
  }[tick.overallSeverity];

  const lines: string[] = [
    `# ${severityIcon} Continuous Monitor — Tick Report`,
    "",
    `- **Tick ID:** ${tick.tickId}`,
    `- **Timestamp:** ${new Date(tick.ts).toISOString()}`,
    `- **Agent:** ${tick.agentId}`,
    `- **Duration:** ${tick.durationMs}ms`,
    `- **Events analyzed:** ${tick.eventsAnalyzed}`,
    `- **Overall:** ${tick.overallSeverity.toUpperCase()}`,
    `- **Summary:** ${tick.summary}`,
    "",
  ];

  // Injection detection
  if (tick.injections.detected) {
    lines.push("## 🚨 Prompt Injection Detection");
    lines.push(`Detected ${tick.injections.patterns.length} pattern(s):`);
    lines.push("| Pattern | Confidence | Timestamp | Preview |");
    lines.push("|---------|----------:|-----------|---------|");
    for (const p of tick.injections.patterns) {
      lines.push(`| ${p.pattern} | ${(p.confidence * 100).toFixed(0)}% | ${new Date(p.ts).toISOString()} | \`${p.payload.slice(0, 50)}…\` |`);
    }
    lines.push("");
  }

  // Context pollution
  if (tick.contextPollution.pollutionScore > 0) {
    lines.push("## 🧪 Context Pollution");
    lines.push(`- Score: ${(tick.contextPollution.pollutionScore * 100).toFixed(1)}%`);
    lines.push(`- Suspicious events: ${tick.contextPollution.suspiciousEvents}/${tick.contextPollution.totalEvents}`);
    lines.push(`- Growth rate: ${tick.contextPollution.growthRate}/hour`);
    lines.push(`- Trend: ${tick.contextPollution.trending}`);
    lines.push("");
  }

  // Tool API changes
  if (tick.toolApiChanges.changesDetected) {
    lines.push("## 🔧 Tool API Changes");
    for (const change of tick.toolApiChanges.changes) {
      lines.push(`- **${change.changeType}:** ${change.details}`);
    }
    lines.push("");
  }

  // Anomalies
  const actualAnomalies = tick.anomalies.filter((a) => a.isAnomaly);
  if (actualAnomalies.length > 0) {
    lines.push("## 📊 Metric Anomalies");
    lines.push("| Metric | Current | Baseline | Z-Score | Direction | Severity |");
    lines.push("|--------|--------:|---------:|--------:|-----------|----------|");
    for (const a of actualAnomalies) {
      lines.push(`| ${a.metricName} | ${a.currentValue.toFixed(4)} | ${a.baseline} | ${a.zScore} | ${a.direction} | ${a.severity} |`);
    }
    lines.push("");
  }

  // Trust drift
  if (tick.trustDriftAlerts > 0) {
    lines.push(`## ⚠️ Trust Drift: ${tick.trustDriftAlerts} alert(s)`);
    lines.push("");
  }

  return lines.join("\n");
}

export function renderMonitorSessionMarkdown(session: MonitorSession): string {
  const lines: string[] = [
    "# 📡 Continuous Monitor Session Report",
    "",
    `- **Session ID:** ${session.sessionId}`,
    `- **Agent:** ${session.agentId}`,
    `- **Started:** ${new Date(session.startedTs).toISOString()}`,
    `- **Ticks:** ${session.tickCount}`,
    `- **Interval:** ${session.config.intervalSeconds}s`,
    "",
  ];

  // Summary across ticks
  const criticalTicks = session.ticks.filter((t) => t.overallSeverity === "critical").length;
  const warningTicks = session.ticks.filter((t) => t.overallSeverity === "warning").length;
  const totalInjections = session.ticks.reduce((s, t) => s + t.injections.patterns.length, 0);
  const totalToolChanges = session.ticks.reduce((s, t) => s + t.toolApiChanges.changes.length, 0);

  lines.push("## Summary");
  lines.push(`- Critical ticks: ${criticalTicks}`);
  lines.push(`- Warning ticks: ${warningTicks}`);
  lines.push(`- Total injection patterns: ${totalInjections}`);
  lines.push(`- Total tool API changes: ${totalToolChanges}`);
  lines.push("");

  // Recent ticks
  lines.push("## Recent Ticks");
  lines.push("| Tick | Timestamp | Severity | Events | Summary |");
  lines.push("|------|-----------|----------|-------:|---------|");
  for (const tick of session.ticks.slice(-20)) {
    const icon = { ok: "🟢", info: "🔵", warning: "🟡", critical: "🔴" }[tick.overallSeverity];
    lines.push(`| ${tick.tickId.slice(0, 12)} | ${new Date(tick.ts).toISOString()} | ${icon} ${tick.overallSeverity} | ${tick.eventsAnalyzed} | ${tick.summary} |`);
  }
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export function saveMonitorTickReport(workspace: string, tick: MonitorTickResult): string {
  const dir = join(workspace, ".amc", "monitor", "continuous", "ticks");
  ensureDir(dir);
  const file = join(dir, `${tick.tickId}.json`);
  writeFileAtomic(file, JSON.stringify(tick, null, 2), 0o644);
  return file;
}

export function defaultMonitorConfig(): ContinuousMonitorConfig {
  return continuousMonitorConfigSchema.parse({ schemaVersion: 1 });
}
