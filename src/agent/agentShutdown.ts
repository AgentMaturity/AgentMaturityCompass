import type { EvidenceEvent } from "../types.js";
import type { ToolOutcome } from "../session/sessionTypes.js";
import type { AgentStatus } from "./loopTypes.js";

/** One observed model or validation tool call in the turn being stopped. */
interface AgentShutdownToolResult {
  readonly source: "model" | "validation";
  readonly turn: number;
  readonly step: number | null;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly outcome: ToolOutcome;
  /** False means no result row was observed; even dispatch is then unknown. */
  readonly recorded: boolean;
}

/** Local shutdown snapshot, not a verifier verdict or proof that side effects stopped. */
export interface AgentShutdownResult {
  readonly sessionId: string;
  /** Settled means the driver stopped waiting. Unknown tools may still be running. */
  readonly state: "settled" | "incomplete";
  readonly driverStatus: AgentStatus;
  readonly turn: number | null;
  readonly timedOut: boolean;
  /** Observed OK, ERROR or DENIED outcomes, not a success count. */
  readonly settled: readonly AgentShutdownToolResult[];
  /** Tools recorded CANCELLED before execution. */
  readonly cancelled: readonly AgentShutdownToolResult[];
  readonly unknown: readonly AgentShutdownToolResult[];
  readonly cancelledMessageIds: readonly string[];
  readonly pendingMessageIds: readonly string[];
  readonly errors: readonly string[];
  readonly verification: "not-verified";
}

/** Shared driver/session input bound, checked before stopping admission. */
export function shutdownTimeoutMs(value = 10_000): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 60_000) {
    throw new Error("Native shutdown timeoutMs must be an integer from 0 through 60000.");
  }
  return value;
}

/** Read the owning writer's rows; do not create a second evidence or outcome store. */
export function shutdownToolResults(events: readonly EvidenceEvent[], turn: number | null): Pick<AgentShutdownResult, "settled" | "cancelled" | "unknown"> {
  const calls = new Map<string, Omit<AgentShutdownToolResult, "outcome" | "recorded">>();
  const results = new Map<string, ToolOutcome>();
  for (const event of events) {
    if (turn === null || !["tool/call", "tool/result", "audit"].includes(event.event_type)) continue;
    const meta = JSON.parse(event.meta_json) as Record<string, unknown>;
    if (meta.turn !== turn) continue;
    const validation = event.event_type === "audit" && meta.kind === "native-validation";
    if (event.event_type === "audit" && (!validation || !["check-start", "check-result"].includes(String(meta.phase)))) continue;
    const id = validation ? meta.callId : meta.toolCallId;
    const step = validation ? null : meta.step;
    if (typeof id !== "string" || !id || (step !== null && (!Number.isSafeInteger(step) || (step as number) < 1))) {
      throw new Error(`Unreadable shutdown tool identity in ${event.id}`);
    }
    const source = validation ? "validation" : "model";
    const key = JSON.stringify([source, turn, step, id]);
    if (event.event_type === "tool/call" || (validation && meta.phase === "check-start")) {
      if (typeof meta.toolName !== "string" || !meta.toolName || calls.has(key)) throw new Error(`Invalid shutdown tool call in ${event.id}`);
      calls.set(key, { source, turn, step: step as number | null, toolCallId: id, toolName: meta.toolName });
    } else {
      const outcome = validation ? meta.toolOutcome : meta.outcome;
      if (!["OK", "ERROR", "DENIED", "CANCELLED", "TOOL_OUTCOME_UNKNOWN"].includes(String(outcome)) || results.has(key)) {
        throw new Error(`Invalid shutdown tool outcome in ${event.id}`);
      }
      results.set(key, outcome as ToolOutcome);
    }
  }
  for (const key of results.keys()) if (!calls.has(key)) throw new Error("Shutdown tool outcome has no matching call.");
  const settled: AgentShutdownToolResult[] = [], cancelled: AgentShutdownToolResult[] = [], unknown: AgentShutdownToolResult[] = [];
  for (const [key, call] of calls) {
    const outcome = results.get(key) ?? "TOOL_OUTCOME_UNKNOWN";
    const row = Object.freeze({ ...call, outcome, recorded: results.has(key) });
    (outcome === "TOOL_OUTCOME_UNKNOWN" ? unknown : outcome === "CANCELLED" ? cancelled : settled).push(row);
  }
  return { settled: Object.freeze(settled), cancelled: Object.freeze(cancelled), unknown: Object.freeze(unknown) };
}
