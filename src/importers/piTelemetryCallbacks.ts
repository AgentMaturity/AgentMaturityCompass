/**
 * Bindable listeners for Pi's pinned passive EventListener/WatchHandle contract.
 * b2602be7 still throws SliceNotImplemented from watchSession(); the binding is
 * usable with a supplied implemented handle or events.on(), not a claim otherwise.
 */
import { CallbackTelemetryCapture, type CallbackCaptureOptions } from "./callbackTelemetryCapture.js";
import type { CallbackAttributes } from "./callbackTelemetryContract.js";

const TYPES = new Set(["run_start", "run_resume", "run_suspend", "operation_abort", "run_end", "fault", "handler_error",
  "turn_start", "turn_end", "retry_scheduled", "retry_start", "retry_end", "message_start", "message_update", "message_end",
  "tool_start", "tool_update", "tool_end", "entry_added", "queue_update", "value_update", "config_update", "compaction_start",
  "compaction_end", "navigation_start", "navigation_end", "lane_created", "usage"]);
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
export interface PiCallbackWatchHandle { start(listener: (event: unknown, context: unknown) => void): void; unsubscribe(): void }
export interface PiCallbackWatchBinding { attached: boolean; readonly cleanupPending: boolean; unsubscribe(): { ok: boolean } }

export function createPiTelemetryBridge(options: CallbackCaptureOptions = {}) {
  const capture = new CallbackTelemetryCapture(options);
  const onEvent = (event: unknown, _context?: unknown): void => {
    try {
      const row = object(event);
      if (!row || typeof row.type !== "string" || !TYPES.has(row.type)) { capture.recordDroppedCall(); return; }
      const attrs: CallbackAttributes = { "pi.event.type": row.type };
      const assign = (key: string, value: unknown): void => {
        if (typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) attrs[key] = value;
      };
      assign("pi.lane.name", row.lane); assign("pi.operation.id", row.operationId ?? row.runId);
      assign("pi.turn.id", row.turnId); assign("pi.operation.recovery", row.recovery);
      assign("pi.tool.name", row.toolName); assign("pi.tool.call_id", row.toolCallId);
      assign("pi.tool.is_error", row.isError); assign("pi.step.attempt", row.attempt);
      assign("pi.operation.outcome", row.status);
      if (row.type === "operation_abort") attrs["pi.operation.outcome"] = "aborted";
      if (row.type === "run_suspend") attrs["pi.operation.outcome"] = "suspended";
      if (row.type === "retry_end") assign("pi.step.outcome", row.success === true ? "succeeded" : row.success === false ? "failed" : undefined);
      assign("amc.source.timestamp", row.startedAt ?? row.endedAt);
      // Only final message_end supplies a message's usage. Delta updates, turn
      // summaries and aggregate usage events overlap and are not summed again.
      if (row.type === "message_end") {
        const message = object(row.message);
        if (message?.role === "assistant") {
          assign("pi.ai.model", message.model); assign("pi.ai.provider", message.provider); assign("pi.ai.api", message.api);
          assign("pi.ai.response.stop_reason", message.stopReason); assign("amc.source.timestamp", message.timestamp);
          const usage = object(message.usage);
          for (const [source, target] of [["input", "input_tokens"], ["output", "output_tokens"], ["cacheRead", "cache_read_tokens"],
            ["cacheWrite", "cache_write_tokens"], ["reasoning", "reasoning_tokens"], ["totalTokens", "total_tokens"]] as const) {
            assign(`pi.ai.usage.${target}`, usage?.[source]);
          }
          assign("pi.ai.usage.cost", object(usage?.cost)?.total);
        }
      }
      void capture.startSpan({ name: `pi.event.${row.type}`, attributes: attrs }, span => {
        if (row.type === "fault" || row.type === "handler_error") span.setStatus({ status: "error" });
      }).catch(() => capture.recordDroppedCall());
    } catch { capture.recordDroppedCall(); }
  };
  const bindWatch = (handle: PiCallbackWatchHandle): PiCallbackWatchBinding => {
    let active = true, unsubscribed = false;
    const release = (): { ok: boolean } => {
      active = false;
      if (unsubscribed) return { ok: true };
      try { handle.unsubscribe(); unsubscribed = true; return { ok: true }; }
      catch { capture.recordDroppedCall(); return { ok: false }; }
    };
    const listener = (event: unknown, context: unknown): void => { if (active) onEvent(event, context); };
    try { handle.start(listener); } catch {
      active = false; capture.recordDroppedCall();
      release();
      return { attached: false, get cleanupPending() { return !unsubscribed; }, unsubscribe: release };
    }
    return { attached: true, get cleanupPending() { return !unsubscribed; }, unsubscribe: release };
  };
  return { telemetryContext: capture, capture, onEvent, bindWatch };
}
