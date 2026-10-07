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
import { sha256Hex } from "../utils/hash.js";
import { SourceFormatError, headerVersion } from "./sourceFormatError.js";

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
  /** AMC mapping contract; independent of the source session version. */
  mappingVersion: 2;
  sessionId: string | null;
  entries: { message: number; structural: number; total: number };
  malformedEntries: number;
  unknownTraceTimestamps: number;
  branch: {
    /** The last well-formed entry in the file — Pi's leaf on reload. */
    leafEntryId: string | null;
    currentPathLength: number;
    offPathEntries: number;
    branchPoints: string[];
    orphanedEntries: number;
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

/** Only bounded format diagnostics belong in the public import plan. */
export class PiSessionFormatError extends SourceFormatError {
  override readonly name = "PiSessionFormatError";
  constructor(message: string, detectedVersion: number | null = null) {
    super(message, { code: "PI_SESSION_REFUSED", format: "pi-session", detectedVersion,
      supported: `pi-session v${PI_SESSION_SUPPORTED_VERSION}`, sourceRevision: null });
  }
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
  const label = version === undefined ? "version 1 (no version field)"
    : typeof version === "number" && Number.isSafeInteger(version) && version >= 0
      ? `version ${version}` : "with an invalid version field";
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

/** Bad lines are counted; ambiguous identities and cyclic ancestry refuse the file. */
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

/** Pi's durable storage header (`kind: "header"` with `v`/`storageVersion`) is a different format; never import it generically. */
function refusePiDurableSession(line: string | null): void {
  let header: unknown;
  try { header = line === null ? null : JSON.parse(line); } catch { return; }
  if (!isRecord(header) || header.kind !== "header" || !(Object.hasOwn(header, "v") || Object.hasOwn(header, "storageVersion"))) return;
  const version = headerVersion(header.v);
  throw new SourceFormatError(`Pi durable session format ${version === null ? "with a missing or invalid version" : `v${version}`} is not supported; AMC imports Pi CLI session v${PI_SESSION_SUPPORTED_VERSION}.`,
    { code: "PI_DURABLE_SESSION_UNSUPPORTED", format: "pi-durable-session", detectedVersion: version, supported: `pi-session v${PI_SESSION_SUPPORTED_VERSION}`, sourceRevision: null });
}

/** Recognized Pi files never fall back to generic parsing after a format error. */
export function parseDetectedPiSession(text: string): ParsedPiSession | null {
  refusePiDurableSession(firstLine(text));
  const detected = detectPiSession(text);
  if (detected?.kind === "unsupported") throw new PiSessionFormatError(detected.reason);
  return detected ? parsePiSession(text) : null;
}

export function piSessionWarnings(session: ParsedPiSession, source: string): string[] {
  const warnings: string[] = [];
  const malformed = session.malformedLines.length;
  if (malformed > 0) warnings.push(`${malformed} malformed entr${malformed === 1 ? "y" : "ies"} in ${source} (line${malformed === 1 ? "" : "s"} ${session.malformedLines.join(", ")}) were counted and produced no evidence.`);
  if (session.format.branch.orphanedEntries) warnings.push(`${session.format.branch.orphanedEntries} Pi entries reference missing parents; affected ancestry is incomplete.`);
  if (session.format.unknownTraceTimestamps) warnings.push(`${session.format.unknownTraceTimestamps} Pi trace timestamps are unknown or invalid; no event time was inferred.`);
  return warnings;
}

/** Iterative validation is bounded even for disconnected cycles and deep trees. */
function inspectTree(entries: Entry[]) {
  const byId = new Map<string, Entry>();
  for (const entry of entries) {
    if (byId.has(entry.id)) throw new PiSessionFormatError("Pi session has duplicate entry IDs; ancestry is ambiguous.");
    byId.set(entry.id, entry);
  }
  const ancestryComplete = new Map<string, boolean>();
  for (const entry of entries) {
    const path = new Set<string>();
    let cursor: string | null = entry.id;
    while (cursor !== null && byId.has(cursor) && !ancestryComplete.has(cursor)) {
      if (path.has(cursor)) throw new PiSessionFormatError("Pi session has cyclic ancestry; import refused.");
      path.add(cursor);
      cursor = byId.get(cursor)!.parentId;
    }
    const complete = cursor === null || ancestryComplete.get(cursor) === true;
    for (const id of path) ancestryComplete.set(id, complete);
  }
  return { byId, ancestryComplete };
}

/** Preserve identities across redaction without collapsing distinct IDs to one marker. */
export function sanitizePiSession(parsed: ParsedPiSession, redactedRows: unknown[], redact: (value: string) => string): ParsedPiSession {
  const safeId = (value: unknown, namespace: "entry" | "session" | "tool"): unknown => {
    if (typeof value !== "string") return value;
    return redact(value) !== value || value.startsWith("pi-redacted-")
      ? `pi-redacted-${namespace}-${sha256Hex(`AMC_PI_ID_V1\0${namespace}\0${value}`)}`
      : value;
  };
  const rows = redactedRows.map((row, index) => {
    const source = parsed.rows[index];
    if (!isRecord(row) || !isRecord(source)) return row;
    const safe = { ...row };
    for (const key of ["id", "parentId", "fromId", "targetId", "firstKeptEntryId"]) {
      if (typeof source[key] === "string") safe[key] = safeId(source[key], source.type === "session" && key === "id" ? "session" : "entry");
    }
    if (isRecord(source.message) && isRecord(row.message)) {
      const message = { ...row.message };
      if (typeof source.message.toolCallId === "string") message.toolCallId = safeId(source.message.toolCallId, "tool");
      const sourceContent = source.message.content;
      if (Array.isArray(sourceContent) && Array.isArray(message.content)) {
        message.content = message.content.map((block, blockIndex) => {
          const original = sourceContent[blockIndex];
          return isRecord(block) && isRecord(original) && original.type === "toolCall" && typeof original.id === "string"
            ? { ...block, id: safeId(original.id, "tool") } : block;
        });
      }
      safe.message = message;
    }
    return safe;
  });
  const header = rows.find((row): row is Record<string, unknown> => isRecord(row) && row.type === "session") ?? null;
  const entries = rows.map(wellFormed).filter((entry): entry is Entry => entry !== null && entry.type !== "session");
  return { rows, format: analyseTree(header, entries, parsed.malformedLines.length), malformedLines: parsed.malformedLines };
}

function analyseTree(header: Record<string, unknown> | null, entries: Entry[], malformed: number): PiSessionFormat {
  const children = new Map<string, number>();
  const { byId } = inspectTree(entries);
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
    mappingVersion: 2,
    sessionId: typeof header?.id === "string" ? header.id : null,
    entries: { message: messages, structural: entries.length - messages, total: entries.length },
    malformedEntries: malformed,
    unknownTraceTimestamps: entries.filter((entry) => isRecord(entry.raw.message)
      && ["assistant", "toolResult"].includes(String(entry.raw.message.role))
      && entryTimestamp(entry, entry.raw.message) === null).length,
    branch: {
      leafEntryId: leaf?.id ?? null,
      currentPathLength: currentPath.size,
      offPathEntries: entries.filter((entry) => !currentPath.has(entry.id)).length,
      branchPoints: entries.filter((entry) => (children.get(entry.id) ?? 0) > 1).map((entry) => entry.id),
      orphanedEntries: entries.filter((entry) => entry.parentId !== null && !byId.has(entry.parentId)).length,
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

function entryTimestamp(entry: Entry, message: Record<string, unknown> | null): number | null {
  for (const value of [entry.timestamp, message?.timestamp]) {
    if (typeof value !== "string" && typeof value !== "number") continue;
    if (typeof value === "string") {
      // Pi writes ISO timestamps. Reject permissive Date parsing/rollover of malformed dates.
      const iso = /^((?:\d{4}|[+-]\d{6})-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
      if (!iso) continue;
      const calendar = new Date(`${iso[1]}T00:00:00.000Z`);
      if (!Number.isFinite(calendar.getTime()) || !calendar.toISOString().startsWith(`${iso[1]}T`)) continue;
    }
    // Numeric values follow the generic mapper's bounds (../importers/traceMapping.ts traceTimestamp):
    // a finite non-negative epoch up to the Date range; a pre-1970 or out-of-range number is unknown, not a time.
    if (typeof value === "number" && (value < 0 || value > 8.64e15)) continue;
    const parsed = new Date(value).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
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
  const { byId, ancestryComplete } = inspectTree(entries);
  const leaf = entries.length > 0 ? entries[entries.length - 1]! : null;
  const onPath = new Set<string>();
  for (let cursor: Entry | null = leaf; cursor !== null && !onPath.has(cursor.id); cursor = cursor.parentId === null ? null : byId.get(cursor.parentId) ?? null) {
    onPath.add(cursor.id);
  }
  const ancestorMessage = (entry: Entry, predicate: (message: Record<string, unknown>) => boolean): Record<string, unknown> | null => {
    const visited = new Set<string>();
    for (let cursor = entry.parentId === null ? null : byId.get(entry.parentId) ?? null; cursor !== null; cursor = cursor.parentId === null ? null : byId.get(cursor.parentId) ?? null) {
      if (visited.has(cursor.id)) break;
      visited.add(cursor.id);
      const message = cursor.type === "message" && isRecord(cursor.raw.message) ? cursor.raw.message : null;
      if (message && predicate(message)) return message;
    }
    return null;
  };
  const common = (entry: Entry) => ({
    entryType: entry.type,
    entryId: entry.id,
    parentId: entry.parentId,
    ancestryComplete: ancestryComplete.get(entry.id) === true,
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
