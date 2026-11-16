/**
 * The event stream of `codex exec --json` (learn.chatgpt.com/docs/non-interactive-mode, read 2026-11-17).
 *
 * Documented: events `thread.started` {thread_id}, `turn.started`, `turn.completed` {usage: input_tokens,
 * cached_input_tokens, output_tokens, reasoning_output_tokens}, `turn.failed`, `item.started|updated|completed`
 * {item: {id, type, ...}}, `error`; item types agent_message {text}, reasoning, command_execution {command, status},
 * file_change, mcp_tool_call, web_search, todo_list. Taken from the source, not the page (codex-rs/exec/src/exec_events.rs
 * on openai/codex main, read 2026-11-17): command_execution `aggregated_output`, `exit_code`, status
 * in_progress|completed|failed|declined; mcp_tool_call `server`, `tool`, `arguments`, `error`, status; `turn.failed`
 * {error: {message}}. The stream names no model and no times, so both stay unknown.
 */
import { digestOf, isRecord, newSessionFormat, nonNegativeInt, plainName, storedText, type JsonRow, type SessionImportContext,
  type SessionImportFormat, type SessionStep } from "./sessionImportCommon.js";

const TOOL_ITEMS = new Set(["command_execution", "mcp_tool_call", "file_change", "web_search", "collab_tool_call"]);

export function looksLikeCodexExecJson(rows: JsonRow[]): boolean {
  const types = new Set(rows.slice(0, 50).map(({ value }) => value.type));
  return (types.has("thread.started") && rows.some(({ value }) => typeof value.thread_id === "string"))
    || ((types.has("turn.started") || types.has("turn.completed")) && rows.some(({ value }) => String(value.type).startsWith("item.") && isRecord(value.item)));
}

function toolName(item: Record<string, unknown>): string | null {
  if (item.type === "mcp_tool_call") return plainName(`${typeof item.server === "string" ? item.server : "mcp"}.${typeof item.tool === "string" ? item.tool : "tool"}`);
  return plainName(item.type);
}

function toolOutcome(item: Record<string, unknown>): SessionStep["outcome"] {
  if (item.status === "declined") return "declined";
  if (item.status === "failed" || (item.type === "command_execution" && typeof item.exit_code === "number" && item.exit_code !== 0)) return "failed";
  return item.status === "completed" ? "completed" : "unknown";
}

export function parseCodexExecJson(read: { rows: JsonRow[]; lines: number; malformed: number; overLong: number; overCap: number },
  ctx: SessionImportContext): { format: SessionImportFormat; steps: SessionStep[] } {
  const format = newSessionFormat("codex-exec-json", null, false, ctx, read);
  const steps: SessionStep[] = [];
  let sessionLabel = `session-${ctx.sourceSha256.slice(0, 12)}`;
  for (const { value, line } of read.rows) {
    const item = isRecord(value.item) ? value.item : null;
    if (value.type === "thread.started" && typeof value.thread_id === "string") {
      sessionLabel = `session-${digestOf(value.thread_id).slice(0, 12)}`;
    } else if (value.type === "item.completed" && item && TOOL_ITEMS.has(String(item.type))) {
      const outcome = toolOutcome(item);
      const tool = toolName(item);
      const input = item.type === "command_execution" ? item.command : item.arguments ?? item.changes ?? item.query ?? null;
      steps.push({ step: steps.length + 1, kind: "tool-call", time: null, sessionLabel, sourceStep: line, tool, input: storedText(input, ctx),
        output: storedText(item.aggregated_output ?? item.result ?? null, ctx), outcome, error: outcome === "failed",
        ...(outcome === "failed" ? { errorMessage: `The tool call reported an error (${tool ?? "unnamed tool"}).` } : {}),
        callDigest: digestOf({ tool, input }) });
    } else if (value.type === "item.completed" && item && item.type === "agent_message") {
      steps.push({ step: steps.length + 1, kind: "model-reply", time: null, sessionLabel, sourceStep: line, output: storedText(item.text, ctx), outcome: "completed" });
    } else if (value.type === "item.completed" && item && item.type === "error") {
      steps.push({ step: steps.length + 1, kind: "turn", time: null, sessionLabel, sourceStep: line, outcome: "failed", error: true,
        output: storedText(item.message, ctx), errorMessage: "Codex reported an error item." });
    } else if (value.type === "turn.completed" && isRecord(value.usage)) {
      const usage = value.usage;
      steps.push({ step: steps.length + 1, kind: "turn", time: null, sessionLabel, sourceStep: line, outcome: "completed",
        tokens: { input: nonNegativeInt(usage.input_tokens), output: nonNegativeInt(usage.output_tokens), cached: nonNegativeInt(usage.cached_input_tokens) } });
    } else if (value.type === "turn.failed" || value.type === "error") {
      steps.push({ step: steps.length + 1, kind: "turn", time: null, sessionLabel, sourceStep: line, outcome: "failed", error: true,
        output: storedText(isRecord(value.error) ? value.error.message : value.message, ctx),
        errorMessage: value.type === "turn.failed" ? "The Codex turn failed." : "Codex reported a stream error." });
    } else if (value.type !== "turn.started" && value.type !== "item.started" && value.type !== "item.updated" && value.type !== "item.completed") {
      format.records.skipped += 1;
      continue;
    }
    format.records.mapped += 1;
  }
  return { format, steps };
}
