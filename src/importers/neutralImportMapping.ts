import type { AMCTraceV1 } from "../correlation/traceSchema.js";
import { amcTraceSchema } from "../correlation/traceSchema.js";
import type { ProductionTrace } from "../agents/traceIngestion.js";
import type { NeutralImportProjection } from "./neutralImportPresentation.js";
import type { NeutralImportUnsupported } from "./neutralImporter.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";

type Trace = AMCTraceV1 | ProductionTrace;
type Disposition = "mapped" | "retained-only" | "malformed" | "unsupported";
const LIMITS = { records: 2000, detailBytes: 2_000_000, fieldsPerRecord: 80, traceLinksPerRecord: 32, textChars: 256 } as const;
export interface NeutralRecordMapping {
  source: string;
  /** JSON pointer into the retained, redacted parsed artifact; never an execution identity. */
  pointer: string | null;
  sourceLine: number | null;
  disposition: Disposition;
  reason: string;
  fields: { projected: string[]; partial: string[]; retainedOnly: string[]; redactionMarkers: string[]; omitted: number };
  traces: Array<{ index: number; traceId: string | null; sourceTime: number | null; sourceTimeStatus: string;
    durationMs: number | null; durationStatus: "source-reported" | "absent-or-invalid";
    inferredDuration: false; ingestTimeRef: "plan.detectedAt"; failure: boolean;
    outcome: "source-reported-failure" | "unknown-or-not-classified";
    cost: null; costStatus: "not-normalized" }>;
  omittedTraceLinks: number;
}
export interface NeutralRecordMappingReceipt {
  schemaVersion: "amc-record-map/2";
  digestSha256: string;
  sourceSemanticDigest: string;
  counts: { records: number; mapped: number; retainedOnly: number; malformed: number; unsupported: number;
    mappedTraceLinks: number; unlinkedTraces: number; skippedFilesWithUnknownRecordCount: number };
  /** originalSha256 is the SHA-256 of the exact bytes read (equal to digest); sourceRevision is the pinned revision AMC's parser follows, when it has one. */
  sources: Array<{ path: string; digest: string | null; originalSha256: string | null; version: string | number | null; sourceRevision: string | null;
    format: string; disposition: "recognized" | "skipped"; recordCount: number | null; reason: string | null }>;
  /** What each conversion stage dropped, named by stage; source is null when the loss applies to every source. */
  losses: Array<{ stage: "redaction" | "projection" | "external-evidence"; source: string | null; detail: string }>;
  records: NeutralRecordMapping[];
  detailCoverage: { complete: boolean; emittedRecords: number; omittedRecords: number; omittedFields: number;
    omittedTraceLinks: number; boundedTextValues: number; limits: typeof LIMITS };
  semantics: string[];
}
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
/** Positions only; raw source values are never retained by this helper. */
export function parsedJsonlLineNumbers(text: string): number[] {
  return text.split(/\r?\n/).flatMap((line, index) => {
    if (!line.trim()) return [];
    try { JSON.parse(line); return [index + 1]; } catch { return []; }
  });
}
function pointerPart(key: string): string { return key.replaceAll("~", "~0").replaceAll("/", "~1"); }
function metadata(trace: Trace): Record<string, unknown> { return "metadata" in trace && record(trace.metadata) ? trace.metadata : {}; }
function sourceUnits(candidate: NeutralImportProjection): Array<{ value: unknown; pointer: string | null; line: number | null; envelope?: boolean }> {
  const value = candidate.redacted;
  if (Array.isArray(value)) return value.map((row, index) => ({ value: row, pointer: `/${index}`, line: candidate.sourceLineNumbers?.[index] ?? null }));
  if (record(value)) {
    const traceCategory = ["trace-jsonl", "event-log", "run-directory"].includes(candidate.candidate.category);
    const keys = traceCategory ? ["traces", "events", "runs", "spans"] : ["nodes", "memories", "results", "samples", "cases", "entries"];
    const key = keys.find(key => Array.isArray(value[key]));
    if (key) {
      const rows = value[key] as unknown[];
      const envelope = Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
      return [...(Object.keys(envelope).length ? [{ value: envelope, pointer: "", line: null, envelope: true }] : []),
        ...rows.map((row, index) => ({ value: row, pointer: `/${pointerPart(key)}/${index}`, line: null }))];
    }
  }
  return [{ value, pointer: "", line: null }];
}
const GENERIC_ALIASES: Readonly<Record<string, readonly string[]>> = {
  traceId: ["traceId", "id", "request_id"], agentId: ["agentId", "agent_id"], agentType: ["agentType", "agent_type", "role"],
  input: ["input", "prompt", "request"], output: ["output", "response", "result"],
  timestamp: ["timestamp", "ts"], durationMs: ["durationMs", "duration_ms", "latencyMs"],
  sessionId: ["sessionId", "session_id"], tool: ["tool", "toolName"], model: ["model"], providerId: ["providerId", "provider"]
};
function fieldProjection(row: Record<string, unknown>, flavor: string): { projected: Set<string>; partial: Set<string> } {
  const projected = new Set<string>(), partial = new Set<string>();
  if (flavor === "amc") {
    for (const key of ["amc_trace_v", "ts", "agentId", "event", "request_id", "receipt", "providerId", "model", "note", "hashes"]) projected.add(key);
  } else if (flavor === "pi-session") {
    for (const key of ["type", "id", "parentId", "timestamp"]) projected.add(key);
    partial.add("message");
  } else if (flavor === "dsh-session") {
    for (const key of ["seq", "type", "time", "surfaceOp", "sourceEventSeqs"]) projected.add(key);
    partial.add("data");
  } else if (flavor === "callback-telemetry") {
    for (const key of ["id", "parentId", "name", "timestamp", "durationMs", "attributes", "events", "status", "explicitStatus", "settlement", "rejectionKind", "endSequence"]) projected.add(key);
  } else {
    for (const aliases of Object.values(GENERIC_ALIASES)) {
      const key = aliases.find(key => row[key] !== null && row[key] !== undefined);
      if (key) projected.add(key);
    }
    for (const key of ["spanCount", "error", "errorMessage", "status", "outcome", "message"]) if (Object.hasOwn(row, key)) partial.add(key);
    if (Object.hasOwn(row, "metadata")) partial.add("metadata"); // generated provenance/provider fields can override source metadata
  }
  return { projected, partial };
}
function traceProjection(trace: Trace, index: number): NeutralRecordMapping["traces"][number] {
  const meta = metadata(trace), provenance = record(meta.timeProvenance) ? meta.timeProvenance : {};
  const time = "timestamp" in trace ? trace.timestamp : trace.ts;
  const sourceTime = typeof time === "number" && Number.isFinite(time) ? time : null;
  const ms = "durationMs" in trace ? trace.durationMs : null;
  const durationMs = typeof ms === "number" && Number.isFinite(ms) && ms >= 0 ? ms : null;
  const failure = "error" in trace && trace.error === true;
  return { index, traceId: "traceId" in trace ? trace.traceId : null, sourceTime,
    sourceTimeStatus: sourceTime !== null ? "source" : typeof provenance.timestamp === "string" ? provenance.timestamp : "absent-or-invalid",
    durationMs, durationStatus: durationMs !== null ? "source-reported" : "absent-or-invalid", inferredDuration: false,
    ingestTimeRef: "plan.detectedAt", failure, outcome: failure ? "source-reported-failure" : "unknown-or-not-classified",
    cost: null, costStatus: "not-normalized" };
}

/** Complete record accounting, with explicitly bounded presentation detail. Never copies payload excerpts. */
export function buildNeutralRecordMapping(input: {
  candidates: NeutralImportProjection[]; unsupported: NeutralImportUnsupported[];
  sourceRelative: (path: string) => string; semanticDigest: string;
}): NeutralRecordMappingReceipt {
  const counts = { records: 0, mapped: 0, retainedOnly: 0, malformed: 0, unsupported: 0, mappedTraceLinks: 0,
    unlinkedTraces: 0, skippedFilesWithUnknownRecordCount: input.unsupported.length };
  const detailCoverage = { complete: true, emittedRecords: 0, omittedRecords: 0, omittedFields: 0,
    omittedTraceLinks: 0, boundedTextValues: 0, limits: LIMITS };
  const records: NeutralRecordMapping[] = [], sources: NeutralRecordMappingReceipt["sources"] = [], losses: NeutralRecordMappingReceipt["losses"] = [];
  let detailBytes = 0;
  const text = (value: string): string => {
    if (value.length <= LIMITS.textChars) return value;
    detailCoverage.boundedTextValues++; return `${value.slice(0, LIMITS.textChars)}…`;
  };
  for (const candidate of input.candidates) {
    const source = input.sourceRelative(candidate.candidate.path), units = sourceUnits(candidate);
    const format = candidate.candidate.sourceFormat?.name ?? "generic";
    const amc = candidate.traces.some(trace => "amc_trace_v" in trace);
    const mappedByIdentity = new Map<string, number[]>();
    candidate.traces.forEach((trace, index) => {
      const meta = metadata(trace), callback = record(meta.callbackTelemetry) ? meta.callbackTelemetry : {};
      const id = format === "callback-telemetry" ? callback.spanId : meta.entryId;
      if (id !== undefined && id !== null) {
        const key = String(id); mappedByIdentity.set(key, [...(mappedByIdentity.get(key) ?? []), index]);
      }
    });
    const linked = new Set<number>(); let genericIndex = 0;
    const malformedLines = new Set(candidate.malformedSourceLines ?? []);
    const representedLines = new Set(units.map(unit => unit.line).filter(line => line !== null));
    for (const line of malformedLines) if (!representedLines.has(line)) units.push({ value: null, pointer: null, line });
    if (candidate.sourceLineNumbers) units.sort((a, b) => (a.line ?? Infinity) - (b.line ?? Infinity));
    const sourceFormat = candidate.candidate.sourceFormat;
    sources.push({ path: text(source), digest: candidate.candidate.digest, originalSha256: candidate.candidate.digest,
      version: sourceFormat?.version ?? (amc ? 1 : null), sourceRevision: sourceFormat && "sourceRevision" in sourceFormat ? sourceFormat.sourceRevision : null,
      format: format === "generic" ? amc ? "amc-trace" : candidate.candidate.format : format,
      disposition: "recognized", recordCount: units.length, reason: null });
    if (candidate.candidate.redactionCount) losses.push({ stage: "redaction", source: text(source),
      detail: `${candidate.candidate.redactionCount} sensitive-looking value(s) were replaced with [REDACTED] in every persisted projection.` });
    let unprojected = 0;
    for (const unit of units) {
      const row = record(unit.value) ? unit.value : null;
      let indices: number[] = [], disposition: Disposition = "retained-only", reason = "Retained as redacted source context; no independent trace is projected.";
      if (unit.line !== null && malformedLines.has(unit.line)) {
        disposition = "malformed"; reason = "The source parser rejected this record; no evidence was produced from it.";
      } else if (!row) {
        if (["trace-jsonl", "event-log", "run-directory"].includes(candidate.candidate.category)) {
          disposition = "unsupported"; reason = "A trace record must be an object; this value is retained without a trace.";
        }
      } else if (!unit.envelope) {
        if (format !== "generic") {
          if (format !== "pi-session" || row.type === "message") indices = mappedByIdentity.get(String(format === "dsh-session" ? row.seq : row.id)) ?? [];
        }
        else if (amc) {
          if (amcTraceSchema.safeParse(row).success) indices = [genericIndex++];
          else { disposition = "unsupported"; reason = "The recognized AMC trace stream does not project this nonconforming row."; }
        } else if (["trace-jsonl", "event-log", "run-directory"].includes(candidate.candidate.category)
          && (Array.isArray(candidate.redacted) || unit.pointer !== "")) indices = [genericIndex++];
      }
      indices = indices.filter(index => index < candidate.traces.length);
      if (indices.length) { disposition = "mapped"; reason = "Projected by the existing mapper; source claims remain self-reported and unevaluated."; }
      counts.records++; counts[disposition === "retained-only" ? "retainedOnly" : disposition]++; if (disposition !== "mapped") unprojected++;
      counts.mappedTraceLinks += indices.length; indices.forEach(index => linked.add(index));
      if (records.length >= LIMITS.records || detailBytes >= LIMITS.detailBytes) { detailCoverage.omittedRecords++; continue; }
      const keys = row ? Object.keys(row).sort() : [];
      const projection = row && indices.length ? fieldProjection(row, amc ? "amc" : format) : { projected: new Set<string>(), partial: new Set<string>() };
      const fields: NeutralRecordMapping["fields"] = { projected: [], partial: [], retainedOnly: [], redactionMarkers: [], omitted: Math.max(0, keys.length - LIMITS.fieldsPerRecord) };
      for (const key of keys.slice(0, LIMITS.fieldsPerRecord)) {
        const path = text(`${unit.pointer}/${pointerPart(key)}`);
        fields[projection.partial.has(key) ? "partial" : projection.projected.has(key) ? "projected" : "retainedOnly"].push(path);
        if (JSON.stringify(row?.[key])?.includes("[REDACTED]")) fields.redactionMarkers.push(path);
      }
      const item: NeutralRecordMapping = { source: text(source), pointer: unit.pointer === null ? null : text(unit.pointer), sourceLine: unit.line, disposition, reason, fields,
        traces: indices.slice(0, LIMITS.traceLinksPerRecord).map(index => {
          const value = traceProjection(candidate.traces[index]!, index);
          return { ...value, traceId: value.traceId === null ? null : text(value.traceId) };
        }), omittedTraceLinks: Math.max(0, indices.length - LIMITS.traceLinksPerRecord) };
      const bytes = Buffer.byteLength(JSON.stringify(item));
      if (detailBytes + bytes > LIMITS.detailBytes) { detailCoverage.omittedRecords++; continue; }
      records.push(item); detailBytes += bytes; detailCoverage.omittedFields += fields.omitted; detailCoverage.omittedTraceLinks += item.omittedTraceLinks;
    }
    counts.unlinkedTraces += candidate.traces.length - linked.size;
    if (unprojected) losses.push({ stage: "projection", source: text(source),
      detail: `${unprojected} of ${units.length} source record(s) produced no trace; they remain only as redacted context or were rejected.` });
  }
  if (input.candidates.length) losses.push({ stage: "external-evidence", source: null, detail: "Portable external-evidence profiles keep an operational trace projection only: payload contents, nested metadata, usage, cost and call/result pairing are omitted. Each profile lists its own losses." });
  for (const skipped of input.unsupported) sources.push({ path: text(input.sourceRelative(skipped.path)), digest: skipped.digest ?? null, originalSha256: skipped.digest ?? null,
    version: null, sourceRevision: null, format: skipped.format ?? "unknown", disposition: "skipped", recordCount: null, reason: skipped.reason });
  detailCoverage.emittedRecords = records.length;
  detailCoverage.complete = detailCoverage.omittedRecords + detailCoverage.omittedFields + detailCoverage.omittedTraceLinks + detailCoverage.boundedTextValues === 0;
  const body = { schemaVersion: "amc-record-map/2" as const, sourceSemanticDigest: input.semanticDigest, counts, sources, losses, records, detailCoverage,
    semantics: ["Pointers identify retained redacted parsed records; sourceLine is the original 1-based JSONL line where available. A syntax-invalid line has no parsed pointer.",
      "Trace links identify the primary source record. Cross-record context contributions (for example Pi ancestry or DSH call arguments) are not expanded into secondary links.",
      "Wrapper metadata is a separate retained context record. Record counts differ from legacy sourceItems, which can count config fields.",
      "Projected fields can be transformed; partial fields include content or metadata whose full representation is retained only in the source artifact.",
      "Field detail is top-level; redactionMarkers identify fields containing a redaction marker, including nested values. No source payload excerpts are included.",
      "Source-reported durations are not independently measured by AMC. No duration, successful outcome, total cost or maturity score is inferred.",
      "Skipped-file record counts are unknown, not zero. Detail truncation never reduces accounting counts; inspect the retained source for omitted details.",
      ...(counts.unlinkedTraces ? ["Some normalized traces lack a proven primary source-record link; no source pointer was invented for them."] : [])] };
  return { ...body, digestSha256: sha256Hex(canonicalize(body)) };
}
