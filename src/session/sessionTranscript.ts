import chalk from "chalk";
import type { EvidenceEvent } from "../types.js";
import { readEventPayload } from "./eventPayload.js";
import { foldSurfaceEntries } from "./surfaceProjection.js";
import { escapeTerminalControls } from "../tools/builtin/askUserTool.js";
import { sha256Hex } from "../utils/hash.js";
import { renderMarkdown } from "../utils/terminalMarkdown.js";

const ROLES: Readonly<Record<string, string>> = { user: "You", assistant: "Agent", tool: "Tool result", system: "System" };
const MAX_TOOL_LINES = 12;

/**
 * The model-visible conversation as text a person reads: what was asked, what the agent said, each tool call and its
 * result. Each part is read from the payload of the row that put it there and shown only when its bytes match that
 * row's signed digest. Text kept closed by a locked vault (or pruned) is named, never guessed.
 */
export function renderSessionTranscript(workspace: string, events: readonly EvidenceEvent[], width: number | null): { lines: string[]; unreadable: number } {
  const byId = new Map(events.map(event => [event.id, event]));
  const lines: string[] = [];
  let unreadable = 0;
  let role: string | null = null;
  const approvedBy = approvedCalls(events);
  for (const entry of foldSurfaceEntries(events)) {
    if (entry.role !== role) { role = entry.role; lines.push("", chalk.bold(`${ROLES[entry.role] ?? entry.role}:`)); }
    const event = byId.get(entry.sourceEventId);
    const payload = event === undefined ? null : readEventPayload(workspace, event);
    if (event === undefined || payload === null || payload.status !== "ok" || sha256Hex(payload.bytes) !== entry.part.sha256) {
      unreadable++;
      lines.push(chalk.dim(`  [${entry.part.kind}: ${payload?.status === "pruned" ? "removed by retention" : "not readable here"}]`));
      continue;
    }
    const text = payload.bytes.toString("utf8");
    // The system prompt and the runtime-context snapshots are model-visible but not the conversation: named, not printed (--json has them).
    if (entry.part.kind === "text" && (entry.role === "system" || text.startsWith("Current runtime context."))) {
      lines.push(chalk.dim(`  [${entry.role === "system" ? "system prompt" : "runtime context snapshot"}, ${text.split("\n").length} lines]`));
    } else if (entry.part.kind === "text") lines.push(...renderMarkdown(text, width === null ? null : width - 2).map(line => `  ${line}`));
    else if (entry.part.kind === "tool_use") {
      const meta = JSON.parse(event.meta_json) as { toolName?: unknown };
      const name = typeof meta.toolName === "string" ? meta.toolName : "tool";
      lines.push(`  ${chalk.cyan("→")} ${escapeTerminalControls(name)} ${chalk.dim(escapeTerminalControls(text.replace(/\s+/g, " ").slice(0, 160)))}`);
    } else if (entry.part.kind === "tool_result") {
      const meta = JSON.parse(event.meta_json) as { toolCallId?: unknown; denied?: unknown };
      const approver = meta.denied === true && typeof meta.toolCallId === "string" ? approvedBy.get(meta.toolCallId) : undefined;
      // UX-03: the guards let it through before the question and refused it after: the person's approval stands as given.
      if (approver !== undefined) lines.push(chalk.yellow(`  Approved by ${escapeTerminalControls(approver)}, then refused by an automatic check before it ran:`));
      const shown = text.split("\n");
      lines.push(...shown.slice(0, MAX_TOOL_LINES).map(line => `  ${escapeTerminalControls(line)}`));
      if (shown.length > MAX_TOOL_LINES) lines.push(chalk.dim(`  (${shown.length - MAX_TOOL_LINES} more lines)`));
    } else lines.push(chalk.dim(`  [${entry.part.kind}, ${payload.bytes.length} bytes]`));
  }
  return { lines, unreadable };
}

/** Calls a person approved, by tool call id, with who answered (from the session's own approval rows). */
function approvedCalls(events: readonly EvidenceEvent[]): Map<string, string> {
  const asked = new Map<string, string>(), approved = new Map<string, string>();
  for (const event of events) {
    if (event.event_type !== "approval/request" && event.event_type !== "approval/answer") continue;
    const meta = JSON.parse(event.meta_json) as { approvalId?: unknown; toolCallId?: unknown; answer?: unknown; answeredBy?: unknown };
    if (typeof meta.approvalId !== "string") continue;
    if (event.event_type === "approval/request" && typeof meta.toolCallId === "string") asked.set(meta.approvalId, meta.toolCallId);
    const call = asked.get(meta.approvalId);
    if (event.event_type === "approval/answer" && meta.answer === "allow" && call !== undefined) approved.set(call, typeof meta.answeredBy === "string" ? meta.answeredBy : "a person");
  }
  return approved;
}
