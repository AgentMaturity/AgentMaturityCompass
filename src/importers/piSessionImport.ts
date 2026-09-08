/**
 * Format-aware import of Pi v3 session JSONL (AMC-1507).
 *
 * Pi (earendil-works/pi, docs/session-format.md at b2602be7) writes a header
 * `{"type":"session","version":3,...}` and then tree-linked entries with
 * `id`/`parentId`. Conversation lives INSIDE `message`: a tool failure is
 * `message.isError`, a model failure is `message.stopReason: "error"` or
 * `"aborted"`, identity is `message.model`/`message.provider`/`message.toolName`.
 * The generic importer read only top-level keys and lost all of it — a session
 * with a failed tool call and a model error produced a Watch failure index with
 * zero entries, every trace claimed a measured 0 ms, and branch structure
 * vanished.
 *
 * This module is a format extension of the universal importer, not a Pi CLI
 * adapter: it derives ProductionTrace rows from REDACTED entries and states
 * only what the file states. Structural entries (header, session_info, label,
 * compaction, branch_summary, custom, custom_message, model_change,
 * thinking_level_change) are source metadata, never executions. Timing is
 * unknown — Pi persists timestamps, not durations — and is recorded as null,
 * never as a fabricated zero.
 */
import type { ProductionTrace } from "../agents/traceIngestion.js";

export const PI_SESSION_SUPPORTED_VERSION = 3;

const STRUCTURAL_TYPES = new Set([
  "session_info", "label", "compaction", "branch_summary", "custom", "custom_message",
  "model_change", "thinking_level_change"
]);
/** stopReason values that mean the model step did not complete. */
const FAILED_STOP_REASONS = new Set(["error", "aborted"]);

export interface PiSessionFormat {
  name: "pi-session";
  version: typeof PI_SESSION_SUPPORTED_VERSION;
  sessionId: string | null;
  entries: { message: number; structural: number; total: number };
  malformedEntries: number;
  branch: {
    /** The last well-formed entry in the file — Pi's leaf on reload. */
    leafEntryId: string | null;
    currentPathLength: number;
    offPathEntries: number;
    branchPoints: string[];
    /** `parentSession` from the header: the file this one was forked from. */
    forkedFrom: string | null;
  };
}

export type PiSessionDetection =
  | { kind: "supported"; version: typeof PI_SESSION_SUPPORTED_VERSION }
  | { kind: "unsupported"; reason: string };

interface Entry { readonly type: string; readonly id: string; readonly parentId: string | null; readonly timestamp: unknown; readonly raw: Record<string, unknown> }

export interface ParsedPiSession {
  /** Every parsed line, header included, in file order (for redaction/normalization). */
  rows: unknown[];
  format: PiSessionFormat;
  /** 1-based line numbers that were not well-formed entries. */
  malformedLines: number[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstLine(text: string): string | null {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/** Is this a Pi session file, and can this importer read it? null = not Pi. */
export function detectPiSession(text: string): PiSessionDetection | null {
  const line = firstLine(text);
  if (!line) return null;
  let header: unknown;
  try { header = JSON.parse(line); } catch { return null; }
  if (!isRecord(header) || header.type !== "session") return null;
  const version = header.version;
  if (version === PI_SESSION_SUPPORTED_VERSION) return { kind: "supported", version: PI_SESSION_SUPPORTED_VERSION };
  const label = version === undefined ? "version 1 (no version field)" : `version ${String(version)}`;
  return {
    kind: "unsupported",
    reason: `Pi session ${label} is not supported; AMC imports Pi v${PI_SESSION_SUPPORTED_VERSION} session JSONL. Open the session in pi to migrate it, then re-import.`
  };
}

function wellFormed(value: unknown): Entry | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  if (typeof value.id !== "string" || value.id.length === 0) return null;
  if (value.parentId !== null && typeof value.parentId !== "string") return null;
  if (value.type === "message" && (!isRecord(value.message) || typeof value.message.role !== "string")) return null;
  return { type: value.type, id: value.id, parentId: value.parentId as string | null, timestamp: value.timestamp, raw: value };
}

/** Parse line by line; a bad line is counted, never fatal, never a trace. */
export function parsePiSession(text: string): ParsedPiSession {
  const rows: unknown[] = [];
  const malformedLines: number[] = [];
  const entries: Entry[] = [];
  let header: Record<string, unknown> | null = null;
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let value: unknown;
    try { value = JSON.parse(trimmed); } catch { malformedLines.push(index + 1); continue; }
    rows.push(value);
    if (header === null && isRecord(value) && value.type === "session") { header = value; continue; }
    const entry = wellFormed(value);
    if (entry === null) { malformedLines.push(index + 1); continue; }
    entries.push(entry);
  }
  const format = analyseTree(header, entries, malformedLines.length);
  return { rows, format, malformedLines };
}

function analyseTree(header: Record<string, unknown> | null, entries: Entry[], malformed: number): PiSessionFormat {
  const children = new Map<string, number>();
  const byId = new Map(entries.map((entry) => [entry.id, entry] as const));
  for (const entry of entries) {
    if (entry.parentId !== null) children.set(entry.parentId, (children.get(entry.parentId) ?? 0) + 1);
  }
  const leaf = entries.length > 0 ? entries[entries.length - 1]! : null;
  const currentPath = new Set<string>();
  for (let cursor: Entry | null = leaf; cursor !== null; cursor = cursor.parentId === null ? null : byId.get(cursor.parentId) ?? null) {
    if (currentPath.has(cursor.id)) break;
    currentPath.add(cursor.id);
  }
  const messages = entries.filter((entry) => entry.type === "message").length;
  return {
    name: "pi-session",
    version: PI_SESSION_SUPPORTED_VERSION,
    sessionId: typeof header?.id === "string" ? header.id : null,
    entries: { message: messages, structural: entries.length - messages, total: entries.length },
    malformedEntries: malformed,
    branch: {
      leafEntryId: leaf?.id ?? null,
      currentPathLength: currentPath.size,
      offPathEntries: entries.filter((entry) => !currentPath.has(entry.id)).length,
      branchPoints: entries.filter((entry) => (children.get(entry.id) ?? 0) > 1).map((entry) => entry.id),
      forkedFrom: typeof header?.parentSession === "string" ? header.parentSession : null
    }
  };
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block): block is Record<string, unknown> => isRecord(block) && block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("\n");
}

function entryTimestamp(entry: Entry, message: Record<string, unknown> | null): number {
  if (typeof entry.timestamp === "string") {
    const parsed = Date.parse(entry.timestamp);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof entry.timestamp === "number" && Number.isFinite(entry.timestamp)) return entry.timestamp;
  if (typeof message?.timestamp === "number" && Number.isFinite(message.timestamp)) return message.timestamp;
  return 0;
}

/**
 * One ProductionTrace per assistant message and per toolResult, from REDACTED
 * rows. User messages are the `input` of the assistant step that follows them
 * on the same path; structural entries produce nothing.
 */
export function piSessionTraces(
  redactedRows: unknown[],
  format: PiSessionFormat,
  options: { agentId: string; source: string }
): ProductionTrace[] {
  const entries = redactedRows.map(wellFormed).filter((entry): entry is Entry => entry !== null && entry.type !== "session");
  const byId = new Map(entries.map((entry) => [entry.id, entry] as const));
  const leaf = entries.length > 0 ? entries[entries.length - 1]! : null;
  const onPath = new Set<string>();
  for (let cursor: Entry | null = leaf; cursor !== null && !onPath.has(cursor.id); cursor = cursor.parentId === null ? null : byId.get(cursor.parentId) ?? null) {
    onPath.add(cursor.id);
  }
  const ancestorMessage = (entry: Entry, predicate: (message: Record<string, unknown>) => boolean): Record<string, unknown> | null => {
    for (let cursor = entry.parentId === null ? null : byId.get(entry.parentId) ?? null; cursor !== null; cursor = cursor.parentId === null ? null : byId.get(cursor.parentId) ?? null) {
      const message = cursor.type === "message" && isRecord(cursor.raw.message) ? cursor.raw.message : null;
      if (message && predicate(message)) return message;
    }
    return null;
  };
  const common = (entry: Entry) => ({
    entryType: entry.type,
    entryId: entry.id,
    parentId: entry.parentId,
    onCurrentPath: onPath.has(entry.id),
    sessionParent: format.branch.forkedFrom,
    sourceFormat: `pi-session-v${format.version}`
  });
  const base = (entry: Entry, message: Record<string, unknown>) => ({
    traceId: `${format.sessionId ?? options.source}:${entry.id}`,
    agentId: options.agentId,
    // Pi persists timestamps, never durations. Unknown stays unknown.
    durationMs: null,
    timestamp: entryTimestamp(entry, message),
    sessionId: format.sessionId ?? undefined
  });

  const traces: ProductionTrace[] = [];
  for (const entry of entries) {
    if (entry.type === "message" && !STRUCTURAL_TYPES.has(entry.type)) {
      const message = entry.raw.message as Record<string, unknown>;
      if (message.role === "assistant") {
        const stopReason = typeof message.stopReason === "string" ? message.stopReason : null;
        const errorMessage = typeof message.errorMessage === "string" ? message.errorMessage : undefined;
        const failed = (stopReason !== null && FAILED_STOP_REASONS.has(stopReason)) || errorMessage !== undefined;
        const toolCalls = Array.isArray(message.content)
          ? message.content.filter((block): block is Record<string, unknown> => isRecord(block) && block.type === "toolCall")
              .map((block) => ({ id: block.id, name: block.name }))
          : [];
        const user = ancestorMessage(entry, (candidate) => candidate.role === "user");
        traces.push({
          ...base(entry, message),
          agentType: "pi-assistant",
          input: user ? contentText(user.content) : null,
          output: contentText(message.content),
          error: failed,
          errorMessage: errorMessage ?? (failed ? `model step ended with stopReason "${stopReason}"` : undefined),
          metadata: {
            ...common(entry),
            role: "assistant",
            model: message.model,
            providerId: message.provider,
            stopReason,
            truncated: stopReason === "length",
            toolCalls,
            usage: message.usage
          }
        });
      } else if (message.role === "toolResult") {
        const toolCallId = typeof message.toolCallId === "string" ? message.toolCallId : null;
        const call = toolCallId === null ? null : (() => {
          const caller = ancestorMessage(entry, (candidate) =>
            candidate.role === "assistant" && Array.isArray(candidate.content)
            && candidate.content.some((block) => isRecord(block) && block.type === "toolCall" && block.id === toolCallId));
          const blocks = Array.isArray(caller?.content) ? caller!.content : [];
          return blocks.find((block): block is Record<string, unknown> => isRecord(block) && block.id === toolCallId) ?? null;
        })();
        const isError = message.isError === true;
        const text = contentText(message.content);
        traces.push({
          ...base(entry, message),
          agentType: "pi-tool",
          input: call?.arguments ?? null,
          output: text,
          error: isError,
          errorMessage: isError ? (text || "tool result reported isError") : undefined,
          metadata: {
            ...common(entry),
            role: "toolResult",
            toolCallId,
            tool: typeof message.toolName === "string" ? message.toolName : typeof call?.name === "string" ? call.name : null
          }
        });
      }
    }
  }
  return traces;
}

export function piSessionSummary(format: PiSessionFormat, failures: number): string {
  const parts = [
    `Pi v${format.version} session: ${format.entries.message} conversation entr${format.entries.message === 1 ? "y" : "ies"}`,
    `${format.entries.structural} structural`,
    `${failures} failure(s)`
  ];
  if (format.malformedEntries > 0) parts.push(`${format.malformedEntries} malformed`);
  if (format.branch.offPathEntries > 0) parts.push(`${format.branch.offPathEntries} off the current path`);
  if (format.branch.forkedFrom) parts.push(`forked from ${format.branch.forkedFrom}`);
  return parts.join(", ");
}
