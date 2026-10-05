/** Plain JSONL at DSH c389f96b; imported histories never become OBSERVED executions. */
import { isAbsolute, win32 } from "node:path";
import type { ProductionTrace } from "../agents/traceIngestion.js";
import { sha256Hex } from "../utils/hash.js";
import {
  DSH_IMPORT_LIMITS, DSH_KNOWN_EVENTS, DSH_SOURCE_REVISION, DSH_SURFACE_EVENTS,
  dshEventSchema, dshHeaderSchema, record, summarizeDshStream, validateDshPayload,
  type DshEvent, type DshHeader
} from "./dshSessionContract.js";

export interface ParsedDshSession {
  rows: unknown[];
  header: DshHeader;
  events: DshEvent[];
  format: {
    name: "dsh-session"; version: 2; mappingVersion: 1; sessionId: string; sourceRevision: string;
    eventCount: number; inheritedEventCount: number; parentSession: string | null;
    unknownIgnorableEvents: number; sourceTrust: "SELF_REPORTED"; evaluationStatus: "NOT_EVALUATED";
  };
}

function refuse(message: string): never { throw new Error(`DSH session import refused: ${message}`); }
function boundedJson(value: unknown): void {
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let members = 0;
  while (pending.length) {
    const item = pending.pop()!;
    if (++members > DSH_IMPORT_LIMITS.expandedMembers || item.depth > DSH_IMPORT_LIMITS.depth) refuse("JSON structure exceeds import limits.");
    if (typeof item.value === "number" && !Number.isFinite(item.value)) refuse("non-finite JSON number.");
    if (item.value !== null && typeof item.value === "object") {
      for (const child of Object.values(item.value)) pending.push({ value: child, depth: item.depth + 1 });
    }
  }
}

/** Discriminate before Pi: both formats use type:session, but DSH has these native fields. */
export function parseDetectedDshSession(text: string): ParsedDshSession | null {
  const trimmed = text.trimStart();
  const newline = trimmed.indexOf("\n");
  const first = (newline < 0 ? trimmed : trimmed.slice(0, newline)).trim();
  if (!first) return null;
  let header: unknown;
  try { header = JSON.parse(first); } catch {
    if (/"(?:isSeeded|delegationDepth)"\s*:/.test(first)) refuse("malformed DSH header; no generic fallback.");
    return null;
  }
  if (!record(header) || header.type !== "session" || !["createdAt", "isSeeded", "delegationDepth"].some(key => Object.hasOwn(header, key))) return null;
  if (header.version !== 2) refuse("only pinned DSH v2 plaintext JSONL is supported; export the current v2 generation with DSH before importing. No automatic migration is performed.");
  return parseDshSession(text);
}

function parseDshSession(text: string): ParsedDshSession {
  if (Buffer.byteLength(text, "utf8") > DSH_IMPORT_LIMITS.bytes) refuse("document exceeds 32 MiB.");
  const rows: unknown[] = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    if (Buffer.byteLength(line, "utf8") > DSH_IMPORT_LIMITS.lineBytes) refuse(`line ${index + 1} exceeds 4 MiB.`);
    if (rows.length > DSH_IMPORT_LIMITS.events) refuse("too many events.");
    let row: unknown;
    try { row = JSON.parse(line); } catch { refuse(`malformed JSON at line ${index + 1}; torn tails are not silently repaired.`); }
    boundedJson(row); rows.push(row);
  }
  return parseRows(rows);
}

function parseRows(rows: unknown[], sanitized = false): ParsedDshSession {
  const headerResult = dshHeaderSchema.safeParse(rows[0]);
  if (!headerResult.success) refuse("invalid or unsupported v2 physical header.");
  const header = headerResult.data;
  if (!sanitized && header.cwd !== undefined && !isAbsolute(header.cwd) && !win32.isAbsolute(header.cwd)) refuse("header cwd must be absolute.");
  if (header.parentSession === header.id) refuse("a session cannot be its own parent.");
  const events: DshEvent[] = [];
  let inheritedCut: number | null = null;
  let unknownIgnorableEvents = 0;
  let expanded = 0;
  const callIds = new Set<string>();
  const resultIds = new Set<string>();
  for (const [index, row] of rows.slice(1).entries()) {
    const result = dshEventSchema.safeParse(row);
    if (!result.success || result.data.seq !== index) refuse(`invalid or noncontiguous event at seq ${index}.`);
    const event = result.data;
    if (!DSH_KNOWN_EVENTS.has(event.type)) {
      if (event.ignorable !== true) refuse(`unknown required event at seq ${index}; upgrade the importer rather than skipping it.`);
      unknownIgnorableEvents++;
    }
    if (!DSH_SURFACE_EVENTS.has(event.type) && (event.surfaceOp !== undefined || event.sourceEventSeqs !== undefined)) refuse(`non-surface event has reconstruction metadata at seq ${index}.`);
    const refs: number[] = [];
    for (const member of event.sourceEventSeqs ?? []) {
      const [start, end] = Array.isArray(member) ? member : [member, member];
      if (start > end || end >= index || (expanded += end - start + 1) > DSH_IMPORT_LIMITS.expandedMembers) refuse(`invalid or oversized provenance range at seq ${index}.`);
      for (let seq = start; seq <= end; seq++) refs.push(seq);
    }
    if (new Set(refs).size !== refs.length) refuse(`duplicate provenance reference at seq ${index}.`);
    if (event.sourceEventSeqs?.some(Array.isArray) && refs.some((seq, i) => i > 0 && seq <= refs[i - 1]!)) refuse(`noncanonical provenance ranges at seq ${index}.`);
    if (event.sourceEventSeqs !== undefined) event.sourceEventSeqs = refs;
    if (record(event.surfaceOp) && (event.surfaceOp.start >= index || event.surfaceOp.end >= index)) refuse(`surface replacement references the future at seq ${index}.`);
    validateDshPayload(event);
    if (event.type === "tool/call") {
      const key = callKey(event, event.data.callId);
      if (callIds.has(key) || resultIds.has(key)) refuse(`duplicate or reversed tool call identity at seq ${index}.`);
      callIds.add(key);
    }
    if (event.type === "tool/result") {
      const resultMessage = event.data.message as Record<string, unknown>;
      const block = (resultMessage.content as Record<string, unknown>[])[0]!;
      const key = callKey(event, block.toolCallId);
      if (resultIds.has(key)) refuse(`duplicate tool result at seq ${index}.`);
      resultIds.add(key);
    }
    if (event.type === "session/end-seed" && event.data.inherited === true) inheritedCut = index;
    events.push(event);
  }
  if (header.isSeeded !== (inheritedCut !== null)) refuse("seeded header and final inherited marker disagree.");
  return { rows, header, events, format: {
    name: "dsh-session", version: 2, mappingVersion: 1, sessionId: header.id, sourceRevision: DSH_SOURCE_REVISION,
    eventCount: events.length, inheritedEventCount: inheritedCut ?? 0, parentSession: header.parentSession ?? null,
    unknownIgnorableEvents, sourceTrust: "SELF_REPORTED", evaluationStatus: "NOT_EVALUATED"
  } };
}

/** Preserve correlation when the neutral import redactor changes identity strings. */
export function sanitizeDshSession(parsed: ParsedDshSession, redactedRows: unknown[], redact: (value: string) => string): ParsedDshSession {
  if (redactedRows.length !== parsed.rows.length) refuse("redaction changed the number of source rows.");
  const rows = structuredClone(redactedRows);
  const stack = parsed.rows.map((source, i) => ({ source, target: rows[i] }));
  while (stack.length) {
    const { source, target } = stack.pop()!;
    if (Array.isArray(source) && Array.isArray(target)) {
      source.forEach((item, index) => stack.push({ source: item, target: target[index] }));
    } else if (record(source) && record(target)) {
      for (const [key, value] of Object.entries(source)) {
        if (["id", "parentSession", "callId", "toolCallId"].includes(key) && typeof value === "string") {
          target[key] = redact(value) !== value || value.startsWith("dsh-redacted-") ? `dsh-redacted-${sha256Hex(`AMC_DSH_ID_V1\0${value}`)}` : value;
        } else if (value !== null && typeof value === "object") stack.push({ source: value, target: target[key] });
      }
    }
  }
  return parseRows(rows, true);
}

export function dshSessionWarnings(parsed: ParsedDshSession): string[] {
  return [
    "DSH file events are SELF_REPORTED and NOT_EVALUATED; local import/signing supplies no independent observation.",
    "Only settled assistant streams are durable. A process loss before settlement may leave no attempt stream; no missing deltas are invented.",
    "Trace durations are unknown. Stream sample times are retained as source metadata, not measured full-call latency.",
    "This importer preserves the event log; it does not reconstruct an executable DSH session or certify its complete surface/policy invariants.",
    ...(parsed.format.inheritedEventCount ? [`${parsed.format.inheritedEventCount} inherited events are preserved as lineage, excluded from new child execution traces.`] : []),
    ...(parsed.format.parentSession ? ["Parent session content is not included or independently verified by the parentSession reference."] : []),
    ...(parsed.format.unknownIgnorableEvents ? [`${parsed.format.unknownIgnorableEvents} unknown ignorable events are retained without interpretation.`] : [])
  ];
}

function contentText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value.filter(record).filter(block => block.type === "text" && typeof block.text === "string").map(block => block.text).join("\n");
}
function callKey(event: DshEvent, id: unknown): string { return JSON.stringify([event.data.turn, event.data.step, id]); }

/** Project only source-owned settlements and unfulfilled calls, retaining source sequence identities. */
export function dshSessionTraces(parsed: ParsedDshSession, options: { agentId: string; source: string }): ProductionTrace[] {
  const traces: ProductionTrace[] = [];
  const calls = new Map<string, DshEvent>();
  const results = new Set<string>();
  const users = new Map<number, unknown>();
  let activeTurn: number | null = null;
  let context: Record<string, unknown> | null = null;
  const base = (event: DshEvent) => ({ traceId: `${parsed.header.id}:${event.seq}`, agentId: options.agentId,
    durationMs: null, timestamp: event.time, sessionId: parsed.header.id });
  const meta = (event: DshEvent) => ({ sourceFormat: "dsh-session-v2", sourceRevision: DSH_SOURCE_REVISION,
    entryId: event.seq, eventType: event.type, turn: event.data.turn ?? null, step: event.data.step ?? null,
    sourceTrust: "SELF_REPORTED", evaluationStatus: "NOT_EVALUATED", source: options.source,
    parentSession: parsed.header.parentSession ?? null, inherited: event.seq < parsed.format.inheritedEventCount,
    inheritedEventCount: parsed.format.inheritedEventCount, surfaceOp: event.surfaceOp ?? null,
    sourceEventSeqs: event.sourceEventSeqs ?? [], durationMeasured: false });
  for (const event of parsed.events) {
    const d = event.data;
    if (event.type === "turn/start") activeTurn = d.turn as number;
    if (event.type === "user/message" && activeTurn !== null && record(d.source) && d.source.kind === "user") users.set(activeTurn, d);
    if (event.type === "request/context") context = d;
    if (event.type === "request/header" && record(d.header) && record(d.header.config)) context = d.header.config;
    if (event.type === "tool/call") {
      const key = callKey(event, d.callId);
      if (calls.has(key)) refuse(`ambiguous tool call identity at seq ${event.seq}.`);
      calls.set(key, event);
    }
    if (event.type === "tool/result") {
      const msg = d.message as Record<string, unknown>;
      const block = (msg.content as Record<string, unknown>[])[0]!;
      const key = callKey(event, block.toolCallId);
      if (results.has(key)) refuse(`duplicate tool result at seq ${event.seq}.`);
      results.add(key);
      const call = calls.get(key);
      if (event.seq < parsed.format.inheritedEventCount) continue;
      const failed = block.isError === true || d.error !== undefined;
      traces.push({ ...base(event), agentType: "dsh-tool", input: call?.data.arguments ?? null, output: block.content,
        error: failed, ...(failed ? { errorMessage: "DSH source reports a tool error" } : {}),
        metadata: { ...meta(event), tool: call?.data.name ?? null, toolCallId: block.toolCallId,
          callEventSeq: call?.seq ?? null, missingCall: !call, outcome: failed ? "error" : "result", sourceError: d.error ?? null } });
    } else if (event.type === "assistant/message" || event.type === "assistant/attempt") {
      if (event.seq < parsed.format.inheritedEventCount) continue;
      const stream = summarizeDshStream(d.stream);
      const msg = record(d.message) ? d.message : null;
      const provenance = msg && record(msg.source) ? msg.source : context;
      const outcome = d.interrupted === true ? "aborted" : stream.finish?.kind ?? "unknown";
      const failed = outcome === "aborted" || outcome === "error";
      const user = users.get(d.turn as number);
      traces.push({ ...base(event), agentType: "dsh-assistant", input: record(user) ? contentText(user.content) : null,
        output: msg ? contentText(msg.content) : null,
        ...(failed ? { error: true, errorMessage: `DSH source reports ${outcome}` } : {}),
        metadata: { ...meta(event), providerId: provenance?.provider ?? null, model: provenance?.model ?? null,
          outcome, interrupted: d.interrupted === true, attemptWithoutMessage: !msg, usage: d.usage ?? stream.usage,
          inputProjection: "latest_source_user_message_in_turn_not_reconstructed_full_request",
          stream: { ...stream, usage: undefined }, toolCalls: msg && Array.isArray(msg.content)
            ? msg.content.filter(record).filter(block => block.type === "tool-call").map(block => ({ id: block.id, name: block.name })) : [] } });
    } else if (event.type === "turn/end") {
      activeTurn = null;
      if (event.seq < parsed.format.inheritedEventCount) continue;
      const reason = d.reason as Record<string, unknown>;
      const failed = ["error", "aborted", "interrupted"].includes(reason.kind as string);
      traces.push({ ...base(event), agentType: "dsh-turn", input: null, output: null,
        ...(failed ? { error: true, errorMessage: `DSH turn ended ${reason.kind}` } : {}),
        metadata: { ...meta(event), outcome: reason.kind, sourceReason: reason, cancelled: reason.kind === "aborted",
          crashRecoveryMarker: reason.kind === "interrupted" } });
    }
  }
  for (const [key, call] of calls) if (!results.has(key) && call.seq >= parsed.format.inheritedEventCount) {
    traces.push({ ...base(call), agentType: "dsh-tool", input: call.data.arguments, output: null,
      metadata: { ...meta(call), tool: call.data.name, toolCallId: call.data.callId, outcome: "unknown", missingResult: true } });
  }
  return traces.sort((a, b) => Number(a.metadata.entryId) - Number(b.metadata.entryId));
}
