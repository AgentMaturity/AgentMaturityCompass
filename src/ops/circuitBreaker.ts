/**
 * Circuit Breaker & Observability Resilience Framework
 *
 * Prevents hook/integration suffocation by enforcing timeouts, state machines,
 * backpressure signals, dead-letter handling, and auto-degrade modes.
 *
 * Inspired by ETP's "The Break" — where monitoring hooks suffocated the system.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";

// ---------------------------------------------------------------------------
// Types & schemas
// ---------------------------------------------------------------------------

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export const circuitBreakerPolicySchema = z.object({
  schemaVersion: z.literal(1),
  globalTimeoutMs: z.number().int().min(100).default(10_000),
  perHookTimeoutMs: z.number().int().min(100).default(5_000),
  failureThreshold: z.number().int().min(1).default(5),
  recoveryWindowMs: z.number().int().min(1000).default(60_000),
  halfOpenMaxAttempts: z.number().int().min(1).default(3),
  backpressure: z.object({
    maxPendingWrites: z.number().int().min(1).default(100),
    maxQueueLatencyMs: z.number().int().min(100).default(5_000),
    degradeOnExceed: z.boolean().default(true),
  }).default({}),
  deadLetter: z.object({
    enabled: z.boolean().default(true),
    maxEntries: z.number().int().min(1).default(1000),
    retryIntervalMs: z.number().int().min(1000).default(30_000),
    maxRetries: z.number().int().min(0).default(3),
  }).default({}),
  watchdog: z.object({
    enabled: z.boolean().default(true),
    checkIntervalMs: z.number().int().min(1000).default(10_000),
    stuckSessionThresholdMs: z.number().int().min(5000).default(300_000),
  }).default({}),
});

export type CircuitBreakerPolicy = z.infer<typeof circuitBreakerPolicySchema>;

export interface CircuitBreakerState {
  circuitId: string;
  name: string;
  state: CircuitState;
  consecutiveFailures: number;
  totalFailures: number;
  totalSuccesses: number;
  lastFailureTs: number | null;
  lastSuccessTs: number | null;
  openedTs: number | null;
  halfOpenAttempts: number;
}

export interface DeadLetterEntry {
  id: string;
  circuitId: string;
  ts: number;
  payload: string;
  error: string;
  retryCount: number;
  lastRetryTs: number | null;
  resolved: boolean;
}

export interface BackpressureStatus {
  pendingWrites: number;
  maxPendingWrites: number;
  currentLatencyMs: number;
  maxLatencyMs: number;
  degraded: boolean;
}

export interface WatchdogAlert {
  alertId: string;
  ts: number;
  alertType: "STUCK_SESSION" | "ORPHANED_PROCESS" | "CIRCUIT_OPEN" | "BACKPRESSURE_EXCEEDED";
  details: string;
  circuitId: string | null;
  sessionId: string | null;
}

export interface CircuitBreakerReport {
  reportId: string;
  ts: number;
  circuits: CircuitBreakerState[];
  deadLetterCount: number;
  deadLetterUnresolved: number;
  backpressure: BackpressureStatus;
  watchdogAlerts: WatchdogAlert[];
  overallHealthy: boolean;
}

// ---------------------------------------------------------------------------
// Circuit Breaker Registry (in-memory, one per process)
// ---------------------------------------------------------------------------

const circuits = new Map<string, CircuitBreakerState>();
const deadLetters: DeadLetterEntry[] = [];
const watchdogAlerts: WatchdogAlert[] = [];
let currentPolicy: CircuitBreakerPolicy = circuitBreakerPolicySchema.parse({
  schemaVersion: 1,
});
let pendingWriteCount = 0;
let currentLatencyMs = 0;

export function configureCircuitBreaker(policy: Partial<CircuitBreakerPolicy>): CircuitBreakerPolicy {
  currentPolicy = circuitBreakerPolicySchema.parse({
    schemaVersion: 1,
    ...policy,
  });
  return currentPolicy;
}

export function getCircuitBreakerPolicy(): CircuitBreakerPolicy {
  return currentPolicy;
}

// ---------------------------------------------------------------------------
// Circuit management
// ---------------------------------------------------------------------------

export function registerCircuit(name: string): CircuitBreakerState {
  const id = `cb_${sha256Hex(Buffer.from(name, "utf8")).slice(0, 12)}`;

  if (circuits.has(id)) {
    return circuits.get(id)!;
  }

  const state: CircuitBreakerState = {
    circuitId: id,
    name,
    state: "CLOSED",
    consecutiveFailures: 0,
    totalFailures: 0,
    totalSuccesses: 0,
    lastFailureTs: null,
    lastSuccessTs: null,
    openedTs: null,
    halfOpenAttempts: 0,
  };

  circuits.set(id, state);
  return state;
}

export function getCircuit(circuitId: string): CircuitBreakerState | null {
  return circuits.get(circuitId) ?? null;
}

export function listCircuits(): CircuitBreakerState[] {
  return [...circuits.values()];
}

export function resetCircuit(circuitId: string): void {
  const circuit = circuits.get(circuitId);
  if (!circuit) return;
  circuit.state = "CLOSED";
  circuit.consecutiveFailures = 0;
  circuit.halfOpenAttempts = 0;
  circuit.openedTs = null;
}

export function resetAllCircuits(): void {
  circuits.clear();
  deadLetters.length = 0;
  watchdogAlerts.length = 0;
  pendingWriteCount = 0;
  currentLatencyMs = 0;
}

// ---------------------------------------------------------------------------
// State machine transitions
// ---------------------------------------------------------------------------

function transitionToOpen(circuit: CircuitBreakerState): void {
  circuit.state = "OPEN";
  circuit.openedTs = Date.now();
  circuit.halfOpenAttempts = 0;

  watchdogAlerts.push({
    alertId: `wa_${randomUUID().slice(0, 12)}`,
    ts: Date.now(),
    alertType: "CIRCUIT_OPEN",
    details: `Circuit "${circuit.name}" opened after ${circuit.consecutiveFailures} consecutive failures`,
    circuitId: circuit.circuitId,
    sessionId: null,
  });
}

function transitionToHalfOpen(circuit: CircuitBreakerState): void {
  circuit.state = "HALF_OPEN";
  circuit.halfOpenAttempts = 0;
}

function transitionToClosed(circuit: CircuitBreakerState): void {
  circuit.state = "CLOSED";
  circuit.consecutiveFailures = 0;
  circuit.halfOpenAttempts = 0;
  circuit.openedTs = null;
}

function shouldAttemptRecovery(circuit: CircuitBreakerState): boolean {
  if (circuit.state !== "OPEN") return false;
  if (!circuit.openedTs) return false;
  return Date.now() - circuit.openedTs >= currentPolicy.recoveryWindowMs;
}

// ---------------------------------------------------------------------------
// Core execution wrapper
// ---------------------------------------------------------------------------

export class CircuitOpenError extends Error {
  constructor(
    public readonly circuitId: string,
    public readonly circuitName: string,
  ) {
    super(`Circuit "${circuitName}" is OPEN — call rejected`);
    this.name = "CircuitOpenError";
  }
}

export class TimeoutError extends Error {
  constructor(
    public readonly circuitId: string,
    public readonly timeoutMs: number,
  ) {
    super(`Circuit breaker timeout after ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

/**
 * Execute a function with circuit breaker protection.
 *
 * - If circuit is CLOSED: execute normally, track success/failure
 * - If circuit is OPEN: reject immediately (unless recovery window elapsed → HALF_OPEN)
 * - If circuit is HALF_OPEN: allow limited attempts, close on success, reopen on failure
 * - All executions are time-bounded by per-hook or global timeout
 */
export async function withCircuitBreaker<T>(
  circuitName: string,
  fn: () => Promise<T>,
  options?: { timeoutMs?: number },
): Promise<T> {
  const circuit = registerCircuit(circuitName);
  const requestedTimeoutMs = options?.timeoutMs ?? currentPolicy.perHookTimeoutMs;
  const timeoutMs = Math.max(1, Math.min(requestedTimeoutMs, currentPolicy.globalTimeoutMs));

  // Check circuit state
  if (circuit.state === "OPEN") {
    if (shouldAttemptRecovery(circuit)) {
      transitionToHalfOpen(circuit);
    } else {
      throw new CircuitOpenError(circuit.circuitId, circuit.name);
    }
  }

  if (circuit.state === "HALF_OPEN") {
    if (circuit.halfOpenAttempts >= currentPolicy.halfOpenMaxAttempts) {
      transitionToOpen(circuit);
      throw new CircuitOpenError(circuit.circuitId, circuit.name);
    }
    circuit.halfOpenAttempts++;
  }

  // Execute with timeout
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  try {
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new TimeoutError(circuit.circuitId, timeoutMs)), timeoutMs);
        if (timeoutHandle && typeof timeoutHandle.unref === "function") {
          timeoutHandle.unref();
        }
      }),
    ]);

    // Success
    circuit.totalSuccesses++;
    circuit.consecutiveFailures = 0;
    circuit.lastSuccessTs = Date.now();

    if (circuit.state === "HALF_OPEN") {
      transitionToClosed(circuit);
    }

    return result;
  } catch (error) {
    // Failure
    circuit.totalFailures++;
    circuit.consecutiveFailures++;
    circuit.lastFailureTs = Date.now();

    if (circuit.state === "HALF_OPEN") {
      transitionToOpen(circuit);
    } else if (circuit.consecutiveFailures >= currentPolicy.failureThreshold) {
      transitionToOpen(circuit);
    }
    throw error;
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

/**
 * Synchronous version for non-async hooks.
 * Applies timeout via AbortController pattern — wraps sync work in a promise.
 */
export async function withCircuitBreakerSync<T>(
  circuitName: string,
  fn: () => T,
  options?: { timeoutMs?: number },
): Promise<T> {
  return withCircuitBreaker(circuitName, () => Promise.resolve(fn()), options);
}

// ---------------------------------------------------------------------------
// Dead letter queue
// ---------------------------------------------------------------------------

export function addDeadLetter(circuitId: string, payload: string, error: string): DeadLetterEntry {
  const entry: DeadLetterEntry = {
    id: `dl_${randomUUID().slice(0, 12)}`,
    circuitId,
    ts: Date.now(),
    payload: payload.slice(0, 4096), // cap payload size
    error: error.slice(0, 1024),
    retryCount: 0,
    lastRetryTs: null,
    resolved: false,
  };

  deadLetters.push(entry);

  // Enforce max entries
  while (deadLetters.length > currentPolicy.deadLetter.maxEntries) {
    deadLetters.shift();
  }

  return entry;
}

export function getDeadLetters(options?: { unresolvedOnly?: boolean }): DeadLetterEntry[] {
  if (options?.unresolvedOnly) {
    return deadLetters.filter((e) => !e.resolved);
  }
  return [...deadLetters];
}

export function resolveDeadLetter(id: string): void {
  const entry = deadLetters.find((e) => e.id === id);
  if (entry) {
    entry.resolved = true;
  }
}

export function retryDeadLetter(id: string): DeadLetterEntry | null {
  const entry = deadLetters.find((e) => e.id === id);
  if (!entry || entry.resolved) return null;

  if (entry.retryCount >= currentPolicy.deadLetter.maxRetries) {
    return null;
  }

  entry.retryCount++;
  entry.lastRetryTs = Date.now();
  return entry;
}

// ---------------------------------------------------------------------------
// Backpressure tracking
// ---------------------------------------------------------------------------

export function reportWritePending(): void {
  pendingWriteCount++;
  if (pendingWriteCount > currentPolicy.backpressure.maxPendingWrites) {
    watchdogAlerts.push({
      alertId: `wa_${randomUUID().slice(0, 12)}`,
      ts: Date.now(),
      alertType: "BACKPRESSURE_EXCEEDED",
      details: `Pending writes (${pendingWriteCount}) exceeded threshold (${currentPolicy.backpressure.maxPendingWrites})`,
      circuitId: null,
      sessionId: null,
    });
  }
}

export function reportWriteComplete(latencyMs: number): void {
  if (pendingWriteCount > 0) pendingWriteCount--;
  currentLatencyMs = latencyMs;
}

export function getBackpressureStatus(): BackpressureStatus {
  const degraded =
    currentPolicy.backpressure.degradeOnExceed &&
    (pendingWriteCount > currentPolicy.backpressure.maxPendingWrites ||
      currentLatencyMs > currentPolicy.backpressure.maxQueueLatencyMs);

  return {
    pendingWrites: pendingWriteCount,
    maxPendingWrites: currentPolicy.backpressure.maxPendingWrites,
    currentLatencyMs,
    maxLatencyMs: currentPolicy.backpressure.maxQueueLatencyMs,
    degraded,
  };
}

// ---------------------------------------------------------------------------
// Watchdog
// ---------------------------------------------------------------------------

export function reportStuckSession(sessionId: string, elapsedMs: number): void {
  watchdogAlerts.push({
    alertId: `wa_${randomUUID().slice(0, 12)}`,
    ts: Date.now(),
    alertType: "STUCK_SESSION",
    details: `Session ${sessionId} appears stuck (${Math.round(elapsedMs / 1000)}s elapsed, threshold ${Math.round(currentPolicy.watchdog.stuckSessionThresholdMs / 1000)}s)`,
    circuitId: null,
    sessionId,
  });
}

export function reportOrphanedProcess(sessionId: string, pid: number): void {
  watchdogAlerts.push({
    alertId: `wa_${randomUUID().slice(0, 12)}`,
    ts: Date.now(),
    alertType: "ORPHANED_PROCESS",
    details: `Orphaned process detected: session=${sessionId} pid=${pid}`,
    circuitId: null,
    sessionId,
  });
}

export function getWatchdogAlerts(since?: number): WatchdogAlert[] {
  if (since) {
    return watchdogAlerts.filter((a) => a.ts >= since);
  }
  return [...watchdogAlerts];
}

export function clearWatchdogAlerts(): void {
  watchdogAlerts.length = 0;
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

export function generateCircuitBreakerReport(): CircuitBreakerReport {
  const bp = getBackpressureStatus();
  const unresolvedDl = deadLetters.filter((e) => !e.resolved).length;
  const circuitList = listCircuits();
  const hasOpenCircuits = circuitList.some((c) => c.state === "OPEN");

  return {
    reportId: `cbr_${randomUUID().slice(0, 12)}`,
    ts: Date.now(),
    circuits: circuitList,
    deadLetterCount: deadLetters.length,
    deadLetterUnresolved: unresolvedDl,
    backpressure: bp,
    watchdogAlerts: getWatchdogAlerts(),
    overallHealthy: !hasOpenCircuits && !bp.degraded && unresolvedDl === 0,
  };
}

// ---------------------------------------------------------------------------
// Persistence (policy config to workspace)
// ---------------------------------------------------------------------------

export function loadCircuitBreakerPolicy(workspace: string): CircuitBreakerPolicy {
  const file = join(workspace, ".amc", "circuit-breaker-policy.yaml");
  if (!pathExists(file)) {
    return currentPolicy;
  }
  try {
    const YAML = require("yaml") as typeof import("yaml");
    const raw = YAML.parse(readFileSync(file, "utf8")) as unknown;
    const policy = circuitBreakerPolicySchema.parse(raw);
    currentPolicy = policy;
    return policy;
  } catch {
    return currentPolicy;
  }
}

export function saveCircuitBreakerPolicy(workspace: string, policy?: CircuitBreakerPolicy): void {
  const YAML = require("yaml") as typeof import("yaml");
  const toSave = policy ?? currentPolicy;
  ensureDir(join(workspace, ".amc"));
  writeFileAtomic(
    join(workspace, ".amc", "circuit-breaker-policy.yaml"),
    YAML.stringify(toSave),
    0o644,
  );
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

export function renderCircuitBreakerMarkdown(report: CircuitBreakerReport): string {
  const lines: string[] = [
    "# Circuit Breaker Report",
    "",
    `- Report ID: ${report.reportId}`,
    `- Timestamp: ${new Date(report.ts).toISOString()}`,
    `- Overall Healthy: ${report.overallHealthy ? "YES" : "NO"}`,
    "",
  ];

  lines.push("## Circuits");
  lines.push("| Name | State | Failures (total) | Successes | Last Failure |");
  lines.push("|---|---|---:|---:|---|");
  for (const c of report.circuits) {
    const lastFail = c.lastFailureTs ? new Date(c.lastFailureTs).toISOString() : "-";
    lines.push(`| ${c.name} | ${c.state} | ${c.consecutiveFailures} (${c.totalFailures}) | ${c.totalSuccesses} | ${lastFail} |`);
  }
  lines.push("");

  lines.push("## Backpressure");
  lines.push(`- Pending writes: ${report.backpressure.pendingWrites}/${report.backpressure.maxPendingWrites}`);
  lines.push(`- Current latency: ${report.backpressure.currentLatencyMs}ms (max: ${report.backpressure.maxLatencyMs}ms)`);
  lines.push(`- Degraded: ${report.backpressure.degraded ? "YES" : "NO"}`);
  lines.push("");

  lines.push("## Dead Letters");
  lines.push(`- Total: ${report.deadLetterCount}`);
  lines.push(`- Unresolved: ${report.deadLetterUnresolved}`);
  lines.push("");

  if (report.watchdogAlerts.length > 0) {
    lines.push("## Watchdog Alerts");
    for (const a of report.watchdogAlerts.slice(-20)) {
      lines.push(`- [${new Date(a.ts).toISOString()}] ${a.alertType}: ${a.details}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
