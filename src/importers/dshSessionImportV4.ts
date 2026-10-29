/** Offline DSH v4 ledger projection. Import/signing never creates observed evidence. */
import { isAbsolute, win32 } from "node:path";
import type { ProductionTrace } from "../agents/traceIngestion.js";
import { sha256Hex } from "../utils/hash.js";
import { DSH_IMPORT_LIMITS, record, summarizeDshStream } from "./dshSessionContract.js";
import { DSH_KNOWN_EVENTS_V4, DSH_SOURCE_REVISION_V4, DSH_SURFACE_EVENTS_V4, dshHeaderSchemaV4, dshEventSchemaV4,
  refuseDshV4 as refuse, requireDshV4 as requireValue, validateDshPayloadV4, type DshEventV4, type DshHeaderV4 } from "./dshSessionContractV4.js";

export interface ParsedDshSessionV4 {
  rows: unknown[]; header: DshHeaderV4; events: DshEventV4[];
  format: { name: "dsh-session"; version: 4; mappingVersion: 1; sessionId: string; sourceRevision: string;
    eventCount: number; inheritedEventCount: number; parentSession: string | null; unknownIgnorableEvents: number;
    sourceTrust: "SELF_REPORTED"; evaluationStatus: "NOT_EVALUATED";
    surfaceEventSeqs: number[]; childSessionIds: string[]; losses: string[] };
}
function bounded(value: unknown): void {
  const pending = [{ value, depth: 0 }]; let members = 0;
  while (pending.length) {
    const item = pending.pop()!;
    requireValue(++members <= DSH_IMPORT_LIMITS.expandedMembers && item.depth <= DSH_IMPORT_LIMITS.depth, "JSON structure exceeds import limits.");
    requireValue(typeof item.value !== "number" || Number.isFinite(item.value), "non-finite JSON number.");
    if (item.value !== null && typeof item.value === "object") for (const child of Object.values(item.value)) pending.push({ value: child, depth: item.depth + 1 });
  }
}
export function parseDetectedDshSessionV4(text: string): ParsedDshSessionV4 | null {
  let first: unknown;
  try { first = JSON.parse(text.trimStart().split(/\r?\n/, 1)[0] ?? ""); } catch { return null; }
  if (!record(first) || first.type !== "session" || first.version !== 4 || !["createdAt", "isSeeded", "delegationDepth"].some(key => Object.hasOwn(first, key))) return null;
  requireValue(Buffer.byteLength(text) <= DSH_IMPORT_LIMITS.bytes, "document exceeds 32 MiB.");
  const rows: unknown[] = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    requireValue(Buffer.byteLength(line) <= DSH_IMPORT_LIMITS.lineBytes, `line ${index + 1} exceeds 4 MiB.`);
    requireValue(rows.length <= DSH_IMPORT_LIMITS.events, "too many events.");
    let value: unknown;
    try { value = JSON.parse(line); } catch { refuse(`malformed JSON at line ${index + 1}; torn tails are not repaired.`); }
    bounded(value); rows.push(value);
  }
  return parseRows(rows);
}
function parseRows(rows: unknown[], sanitized = false): ParsedDshSessionV4 {
  const result = dshHeaderSchemaV4.safeParse(rows[0]);
  requireValue(result.success, "invalid v4 physical header.");
  const header = result.data;
  requireValue(sanitized || header.cwd === undefined || isAbsolute(header.cwd) || win32.isAbsolute(header.cwd), "header cwd must be absolute.");
  requireValue(header.parentSession !== header.id, "a session cannot be its own parent.");
  const events: DshEventV4[] = [], surface: number[] = [], children = new Set<string>();
  const calls = new Set<string>(), results = new Set<string>();
  let cut: number | null = null, unknown = 0, expanded = 0;
  for (const [seq, row] of rows.slice(1).entries()) {
    const parsed = dshEventSchemaV4.safeParse(row);
    requireValue(parsed.success && parsed.data.seq === seq, `invalid or noncontiguous event at seq ${seq}.`);
    const event = parsed.data;
    if (!DSH_KNOWN_EVENTS_V4.has(event.type)) {
      requireValue(event.ignorable === true, `unknown required event at seq ${seq}; upgrade the importer.`);
      unknown++; events.push(event); continue;
    }
    validateDshPayloadV4(event);
    const d = event.data as Record<string, unknown>;
    const refs: number[] = [];
    for (const member of event.sourceEventSeqs ?? []) {
      const [start, end] = Array.isArray(member) ? member : [member, member];
      requireValue(start <= end && end < seq && (expanded += end - start + 1) <= DSH_IMPORT_LIMITS.expandedMembers, `invalid or oversized source relationship at seq ${seq}.`);
      for (let ref = start; ref <= end; ref++) refs.push(ref);
    }
    requireValue(new Set(refs).size === refs.length, `duplicate source relationships at seq ${seq}.`);
    requireValue(!event.sourceEventSeqs?.some(Array.isArray) || refs.every((ref, i) => i === 0 || ref > refs[i - 1]!), `noncanonical source ranges at seq ${seq}.`);
    requireValue(event.sourceEventSeqs === undefined || refs.length > 0, `empty source relationship at seq ${seq}.`);
    if (event.sourceEventSeqs !== undefined) event.sourceEventSeqs = refs;
    if (DSH_SURFACE_EVENTS_V4.has(event.type)) {
      requireValue(event.surfaceOp !== undefined, `missing surface operation at seq ${seq}.`);
      if (record(event.surfaceOp)) {
        const start = surface.indexOf(event.surfaceOp.startSeq), end = surface.indexOf(event.surfaceOp.endSeq), referenced = new Set(refs);
        requireValue(start >= 0 && end >= start && surface.slice(start, end + 1).every(ref => referenced.has(ref)), `invalid surface replacement or missing replacement provenance at seq ${seq}.`);
        surface.splice(start, end - start + 1, seq);
      } else surface.push(seq);
    } else requireValue(event.surfaceOp === undefined && event.sourceEventSeqs === undefined, `log-only event has surface metadata at seq ${seq}.`);
    if (event.type === "session/end-seed" && d.inherited === true) cut = seq;
    if (event.type === "tool/call") {
      const key = callKey(d, d.callId);
      requireValue(!calls.has(key) && !results.has(key), `duplicate or reversed tool call at seq ${seq}.`); calls.add(key);
    }
    if (event.type === "tool/result" && event.surfaceOp === "append") {
      const key = callKey(d, (d.message as Record<string, unknown>).toolCallId);
      requireValue(!results.has(key), `duplicate tool result at seq ${seq}.`); results.add(key);
    }
    if (event.type === "subagent/catalog") { requireValue(d.childId !== header.id, "child catalog references its own session."); children.add(d.childId as string); }
    events.push(event);
  }
  requireValue(header.isSeeded === (cut !== null), "seeded header and inherited marker disagree.");
  const liveChildren = new Set<string>();
  for (const event of events) if (event.seq >= (cut ?? 0) && event.type === "subagent/catalog") {
    const childId = (event.data as Record<string, unknown>).childId as string;
    requireValue(!liveChildren.has(childId), "duplicate live child catalog relationship."); liveChildren.add(childId);
  }
  const losses = ["Tool-result surface replacements are retained as history repairs, not projected as additional tool executions.","This mapper preserves the ledger and surface/source references; it does not restore an executable session or verify complete DSH lifecycle/policy invariants.",
    "image/offload and opaque plugin payloads are retained without reconstructing model-visible content.",
    "Stream sample times do not measure full-call latency; durations remain unknown."];
  return { rows, header, events, format: { name: "dsh-session", version: 4, mappingVersion: 1, sessionId: header.id,
    sourceRevision: DSH_SOURCE_REVISION_V4, eventCount: events.length, inheritedEventCount: cut ?? 0,
    parentSession: header.parentSession ?? null, unknownIgnorableEvents: unknown, sourceTrust: "SELF_REPORTED", evaluationStatus: "NOT_EVALUATED",
    surfaceEventSeqs: surface, childSessionIds: [...children], losses } };
}
function callKey(d: Record<string, unknown>, id: unknown): string { return JSON.stringify([d.turn, d.step, id]); }

/** Preserve all string identities touched by redaction; never collapse distinct relations. */
export function sanitizeDshSessionV4(parsed: ParsedDshSessionV4, redactedRows: unknown[], redact: (value: string) => string): ParsedDshSessionV4 {
  requireValue(redactedRows.length === parsed.rows.length, "redaction changed source row count.");
  const rows = structuredClone(redactedRows), stack = parsed.rows.map((source, i) => ({ source, target: rows[i] }));
  const keys = new Set(["id", "parentSession", "callId", "toolCallId", "childId", "sessionId"]);
  while (stack.length) {
    const { source, target } = stack.pop()!;
    if (Array.isArray(source) && Array.isArray(target)) source.forEach((value, i) => stack.push({ source: value, target: target[i] }));
    else if (record(source) && record(target)) for (const [key, value] of Object.entries(source)) {
      if (keys.has(key) && typeof value === "string") target[key] = redact(value) !== value || value.startsWith("dsh-v4-redacted-") ? `dsh-v4-redacted-${sha256Hex(`AMC_DSH_V4_ID\0${value}`)}` : value;
      else if (value !== null && typeof value === "object") stack.push({ source: value, target: target[key] });
    }
  }
  return parseRows(rows, true);
}
export function dshSessionWarningsV4(parsed: ParsedDshSessionV4): string[] {
  return ["DSH v4 file events are SELF_REPORTED and NOT_EVALUATED; import/signing supplies no independent observation.", ...parsed.format.losses,
    ...(parsed.format.inheritedEventCount ? [`${parsed.format.inheritedEventCount} inherited events are lineage only, excluded from child execution traces.`] : []),
    ...(parsed.format.parentSession || parsed.format.childSessionIds.length ? ["Parent and child session references do not include or independently verify the referenced sessions."] : []),
    ...(parsed.format.unknownIgnorableEvents ? [`${parsed.format.unknownIgnorableEvents} unknown ignorable events retained without interpretation.`] : []),
    ...(parsed.events.some(event => event.type === "session-log-deepseek/delivery-accepted") ? ["Source reports uploaded session-log delivery; this does not establish deployment-wide locality or independent delivery verification."] : [])];
}
export function dshSessionTracesV4(parsed: ParsedDshSessionV4, options: { agentId: string; source: string }): ProductionTrace[] {
  const traces: ProductionTrace[] = [], calls = new Map<string, DshEventV4>(), results = new Set<string>();
  const surface = new Set(parsed.format.surfaceEventSeqs);
  const base = (event: DshEventV4) => ({ traceId: `${parsed.header.id}:${event.seq}`, agentId: options.agentId, timestamp: event.time, durationMs: null, sessionId: parsed.header.id });
  const meta = (event: DshEventV4) => ({ sourceFormat: "dsh-session-v4", sourceRevision: DSH_SOURCE_REVISION_V4, entryId: event.seq,
    eventType: event.type, source: options.source, sourceTrust: "SELF_REPORTED", evaluationStatus: "NOT_EVALUATED", parentSession: parsed.format.parentSession,
    origin: parsed.header.origin ?? null, delegationDepth: parsed.header.delegationDepth, sourceEventSeqs: event.sourceEventSeqs ?? [],
    surfaceOp: event.surfaceOp ?? null, onCurrentSurface: surface.has(event.seq), inheritedEventCount: parsed.format.inheritedEventCount,
    durationMeasured: false, normalizationLosses: parsed.format.losses });
  for (const event of parsed.events) {
    if (!DSH_KNOWN_EVENTS_V4.has(event.type)) continue;
    const d = event.data as Record<string, unknown>;
    if (event.type === "tool/call") calls.set(callKey(d, d.callId), event);
    if (event.type === "tool/result" && event.surfaceOp === "append") results.add(callKey(d, (d.message as Record<string, unknown>).toolCallId));
    if (event.seq < parsed.format.inheritedEventCount || (event.type === "tool/result" && event.surfaceOp !== "append")) continue;
    if (event.type === "tool/result") {
      const msg = d.message as Record<string, unknown>, call = calls.get(callKey(d, msg.toolCallId));
      const failed = msg.isError === true;
      traces.push({ ...base(event), agentType: "dsh-tool", input: record(call?.data) ? call.data.arguments : null, output: msg.content,
        ...(failed ? { error: true, errorMessage: "DSH v4 source reports a tool error" } : {}), metadata: { ...meta(event),
          tool: record(call?.data) ? call.data.name : null, toolCallId: msg.toolCallId, callEventSeq: call?.seq ?? null, missingCall: !call,
          outcome: failed ? "error" : "result", sourceError: d.error ?? null, turn: d.turn, step: d.step } });
    } else if (["assistant/message", "assistant/attempt"].includes(event.type)) {
      const stream = summarizeDshStream(d.stream), msg = record(d.message) ? d.message : null;
      const outcome = d.interrupted === true ? "aborted" : stream.finish?.kind ?? "unknown";
      const failed = ["error", "aborted"].includes(outcome as string);
      traces.push({ ...base(event), agentType: "dsh-assistant", input: null, output: msg?.content ?? null,
        ...(failed ? { error: true, errorMessage: `DSH v4 source reports ${outcome}` } : {}), metadata: { ...meta(event), outcome,
          turn: d.turn, step: d.step, messageSource: msg?.source ?? null, usage: d.usage ?? stream.usage, stream, attemptWithoutMessage: !msg,
          inputProjection: "not-reconstructed" } });
    } else if (event.type === "turn/end") {
      const reason = d.reason as Record<string, unknown>, failed = ["error", "aborted", "interrupted"].includes(reason.kind as string);
      traces.push({ ...base(event), agentType: "dsh-turn", input: null, output: null,
        ...(failed ? { error: true, errorMessage: `DSH v4 turn ended ${reason.kind}` } : {}), metadata: { ...meta(event), turn: d.turn,
          outcome: reason.kind, sourceReason: reason, cancelled: reason.kind === "aborted", crashRecoveryMarker: reason.kind === "interrupted" } });
    }
  }
  for (const [key, call] of calls) if (!results.has(key) && call.seq >= parsed.format.inheritedEventCount) {
    const d = call.data as Record<string, unknown>;
    traces.push({ ...base(call), agentType: "dsh-tool", input: d.arguments, output: null, metadata: { ...meta(call), tool: d.name, toolCallId: d.callId,
      turn: d.turn, step: d.step, outcome: "unknown", missingResult: true } });
  }
  return traces.sort((a, b) => Number(a.metadata.entryId) - Number(b.metadata.entryId));
}
