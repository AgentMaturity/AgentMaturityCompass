/**
 * Graceful Degradation Modes
 *
 * FULL | REDUCED | MINIMAL operation modes with auto-trigger,
 * manual override, and recovery logic.
 */

import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DegradationMode = "FULL" | "REDUCED" | "MINIMAL";

export interface ModeChangeEvent {
  eventId: string;
  ts: number;
  fromMode: DegradationMode;
  toMode: DegradationMode;
  trigger: "AUTO_LATENCY" | "AUTO_ERROR_RATE" | "MANUAL" | "AUTO_RECOVERY";
  reason: string;
  ttlMs: number | null;
  expiresAt: number | null;
}

export interface DegradationState {
  currentMode: DegradationMode;
  since: number;
  trigger: ModeChangeEvent["trigger"];
  reason: string;
  ttlMs: number | null;
  expiresAt: number | null;
  healthyStreak: number; // consecutive healthy checks (ms since first healthy)
  history: ModeChangeEvent[];
}

export interface HealthSnapshot {
  p95LatencyMs: number;
  errorRate: number; // 0.0–1.0
}

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

const REDUCED_LATENCY_THRESHOLD_MS = 2000;
const MINIMAL_ERROR_RATE_THRESHOLD = 0.05;
const RECOVERY_HEALTHY_DURATION_MS = 10 * 60 * 1000; // 10 minutes

// ---------------------------------------------------------------------------
// State (in-memory, one per process)
// ---------------------------------------------------------------------------

let state: DegradationState = {
  currentMode: "FULL",
  since: Date.now(),
  trigger: "MANUAL",
  reason: "initial",
  ttlMs: null,
  expiresAt: null,
  healthyStreak: 0,
  history: [],
};

let healthyStartTs: number | null = null;

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

export function getDegradationState(): DegradationState {
  // Check TTL expiry
  if (state.expiresAt && Date.now() >= state.expiresAt) {
    changeMode("FULL", "AUTO_RECOVERY", "TTL expired, recovering to FULL", null);
  }
  return { ...state, history: [...state.history] };
}

export function getCurrentMode(): DegradationMode {
  if (state.expiresAt && Date.now() >= state.expiresAt) {
    changeMode("FULL", "AUTO_RECOVERY", "TTL expired, recovering to FULL", null);
  }
  return state.currentMode;
}

export function setMode(mode: DegradationMode, reason: string, ttlMs: number | null): ModeChangeEvent {
  const safeTtlMs = normalizeTtlMs(ttlMs);
  return changeMode(mode, "MANUAL", reason, safeTtlMs);
}

/**
 * Check if a feature category is active under the current mode.
 */
export function isFeatureActive(feature: "evidence" | "scoring" | "governance" | "forecasting" | "assurance" | "value_engine" | "ledger"): boolean {
  const mode = getCurrentMode();
  switch (mode) {
    case "FULL":
      return true;
    case "REDUCED":
      return feature === "evidence" || feature === "scoring" || feature === "governance" || feature === "ledger";
    case "MINIMAL":
      return feature === "ledger";
  }
}

/**
 * Feed a health snapshot to auto-trigger degradation or recovery.
 */
export function evaluateHealth(snapshot: HealthSnapshot): ModeChangeEvent | null {
  const mode = state.currentMode;
  const safeLatencyMs = Number.isFinite(snapshot.p95LatencyMs) ? Math.max(0, snapshot.p95LatencyMs) : 0;
  const safeErrorRate = Number.isFinite(snapshot.errorRate) ? Math.min(1, Math.max(0, snapshot.errorRate)) : 0;

  // Check for auto-degrade
  if (safeErrorRate > MINIMAL_ERROR_RATE_THRESHOLD && mode !== "MINIMAL") {
    healthyStartTs = null;
    return changeMode("MINIMAL", "AUTO_ERROR_RATE", `Error rate ${(safeErrorRate * 100).toFixed(1)}% exceeds ${MINIMAL_ERROR_RATE_THRESHOLD * 100}% threshold`, null);
  }

  if (safeLatencyMs > REDUCED_LATENCY_THRESHOLD_MS && mode === "FULL") {
    healthyStartTs = null;
    return changeMode("REDUCED", "AUTO_LATENCY", `P95 latency ${safeLatencyMs}ms exceeds ${REDUCED_LATENCY_THRESHOLD_MS}ms threshold`, null);
  }

  // Check for auto-recovery
  if (mode !== "FULL" && state.trigger !== "MANUAL") {
    const isHealthy = safeLatencyMs <= REDUCED_LATENCY_THRESHOLD_MS && safeErrorRate <= MINIMAL_ERROR_RATE_THRESHOLD;

    if (isHealthy) {
      if (!healthyStartTs) {
        healthyStartTs = Date.now();
      }
      const healthyDuration = Date.now() - healthyStartTs;
      state.healthyStreak = healthyDuration;

      if (healthyDuration >= RECOVERY_HEALTHY_DURATION_MS) {
        healthyStartTs = null;
        const targetMode: DegradationMode = mode === "MINIMAL" ? "REDUCED" : "FULL";
        return changeMode(targetMode, "AUTO_RECOVERY", `Health recovered for ${Math.round(healthyDuration / 60000)}min`, null);
      }
    } else {
      healthyStartTs = null;
      state.healthyStreak = 0;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function changeMode(to: DegradationMode, trigger: ModeChangeEvent["trigger"], reason: string, ttlMs: number | null): ModeChangeEvent {
  const safeTtlMs = normalizeTtlMs(ttlMs);

  if (state.currentMode === to && state.trigger === trigger && state.reason === reason && state.ttlMs === safeTtlMs) {
    return {
      eventId: `dm_${randomUUID().slice(0, 12)}`,
      ts: Date.now(),
      fromMode: state.currentMode,
      toMode: to,
      trigger,
      reason,
      ttlMs: safeTtlMs,
      expiresAt: safeTtlMs !== null ? Date.now() + safeTtlMs : null,
    };
  }

  const event: ModeChangeEvent = {
    eventId: `dm_${randomUUID().slice(0, 12)}`,
    ts: Date.now(),
    fromMode: state.currentMode,
    toMode: to,
    trigger,
    reason,
    ttlMs: safeTtlMs,
    expiresAt: safeTtlMs !== null ? Date.now() + safeTtlMs : null,
  };

  state.history.push(event);
  // Keep last 100 events
  if (state.history.length > 100) state.history.splice(0, state.history.length - 100);

  state.currentMode = to;
  state.since = Date.now();
  state.trigger = trigger;
  state.reason = reason;
  state.ttlMs = safeTtlMs;
  state.expiresAt = event.expiresAt;

  if (to === "FULL") {
    state.healthyStreak = 0;
    healthyStartTs = null;
  }

  return event;
}

function normalizeTtlMs(ttlMs: number | null): number | null {
  if (ttlMs === null) return null;
  if (!Number.isFinite(ttlMs)) return null;
  const normalized = Math.floor(ttlMs);
  return normalized > 0 ? normalized : null;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export function renderDegradationStatus(): string {
  const s = getDegradationState();
  const lines: string[] = [
    "# Degradation Mode",
    "",
    `- Current Mode: **${s.currentMode}**`,
    `- Since: ${new Date(s.since).toISOString()}`,
    `- Trigger: ${s.trigger}`,
    `- Reason: ${s.reason}`,
  ];

  if (s.expiresAt) {
    const remaining = Math.max(0, s.expiresAt - Date.now());
    lines.push(`- TTL remaining: ${Math.round(remaining / 60000)}min`);
  }

  if (s.healthyStreak > 0) {
    lines.push(`- Healthy streak: ${Math.round(s.healthyStreak / 1000)}s`);
  }

  lines.push("");
  lines.push("## Mode Capabilities");
  lines.push("| Feature | FULL | REDUCED | MINIMAL |");
  lines.push("|---------|------|---------|---------|");
  lines.push("| Ledger writes | ✓ | ✓ | ✓ |");
  lines.push("| Evidence capture | ✓ | ✓ | ✗ |");
  lines.push("| Core scoring | ✓ | ✓ | ✗ |");
  lines.push("| Governance | ✓ | ✓ | ✗ |");
  lines.push("| Forecasting | ✓ | ✗ | ✗ |");
  lines.push("| Assurance | ✓ | ✗ | ✗ |");
  lines.push("| Value engine | ✓ | ✗ | ✗ |");

  if (s.history.length > 0) {
    lines.push("");
    lines.push("## Recent Mode Changes");
    for (const e of s.history.slice(-10)) {
      lines.push(`- [${new Date(e.ts).toISOString()}] ${e.fromMode} → ${e.toMode} (${e.trigger}): ${e.reason}`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Reset (testing)
// ---------------------------------------------------------------------------

export function resetDegradationState(): void {
  state = {
    currentMode: "FULL",
    since: Date.now(),
    trigger: "MANUAL",
    reason: "reset",
    ttlMs: null,
    expiresAt: null,
    healthyStreak: 0,
    history: [],
  };
  healthyStartTs = null;
}
