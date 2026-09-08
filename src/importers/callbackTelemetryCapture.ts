/** Passive Pi-compatible callback admission; source contract pinned in the exported document. */
import { randomUUID } from "node:crypto";
import { sha256Hex } from "../utils/hash.js";
import { traceTimestamp } from "./traceMapping.js";
import { DEFAULT_CALLBACK_ATTRIBUTES, type CallbackAttributes, type CallbackSpanOptions, type CallbackSpanRecord,
  type CallbackSpanStatus, type CallbackTelemetryContext, type CallbackTelemetryDocument, type CallbackTelemetrySpan } from "./callbackTelemetryContract.js";

export interface CallbackCaptureOptions {
  maxSpans?: number; maxBytes?: number; maxEventsPerSpan?: number;
  /** Explicitly extend the default operational allowlist; credential/content keys still refuse. */
  allowedAttributes?: readonly string[];
  /** Free-form error details are excluded by default. Explicit opt-in still redacts credential patterns. */
  includeErrorDetails?: boolean;
}
export interface CallbackFlushResult { ok: boolean; exported: number; remaining: number; reason?: "sink-failed" }
interface Entry { record: CallbackSpanRecord; bytes: number; ended: boolean }
const NOOP: CallbackTelemetrySpan = Object.freeze({
  startSpan<T>(_options: CallbackSpanOptions, callback: (span: CallbackTelemetrySpan) => T | Promise<T>): Promise<T> {
    try { return Promise.resolve(callback(NOOP)); } catch (error) { return Promise.reject(error); }
  }, setAttributes() {}, addEvent() {}, setStatus() {}
});
const SENSITIVE_KEY = /(?:^|[._-])(?:prompt|completion|arguments|input|output|headers?|authorization|cookies?|password|secret|credential|api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key)(?:$|[._-])/i;
const SECRET_VALUE = /(?:sk-[A-Za-z0-9_-]{8,}|bearer\s+[A-Za-z0-9._-]{8,}|(?:api[_-]?key|secret|token|password)\s*[:=]\s*["']?[A-Za-z0-9._-]{8,})/gi;
function text(value: unknown): string {
  if (typeof value !== "string" || value.length > 4096) throw new Error("unsupported telemetry string");
  return value.replace(SECRET_VALUE, "[REDACTED]");
}
function bounded(value: number | undefined, fallback: number, max: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new Error("invalid callback capture bound");
  return value;
}
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

export class CallbackTelemetryCapture implements CallbackTelemetryContext {
  readonly captureId = randomUUID();
  private readonly entries = new Map<string, Entry>();
  private readonly allowed: Set<string>;
  private readonly maxSpans: number;
  private readonly maxBytes: number;
  private readonly maxEvents: number;
  private readonly includeErrorDetails: boolean;
  private usedBytes = 0;
  private nextId = 1;
  private nextEnd = 1;
  private closed = false;
  private flushTail: Promise<unknown> = Promise.resolve();
  private readonly stats = { admittedSpans: 0, droppedSpans: 0, droppedRecordingCalls: 0,
    filteredAttributes: 0, flushFailures: 0, exportedSpans: 0 };

  constructor(options: CallbackCaptureOptions = {}) {
    this.maxSpans = bounded(options.maxSpans, 512, 4096);
    this.maxBytes = bounded(options.maxBytes, 1_000_000, 16_000_000);
    this.maxEvents = bounded(options.maxEventsPerSpan, 128, 256);
    this.allowed = new Set([...DEFAULT_CALLBACK_ATTRIBUTES, ...(options.allowedAttributes ?? [])]);
    this.includeErrorDetails = options.includeErrorDetails === true;
  }
  private attributes(input?: CallbackAttributes): { value: CallbackSpanRecord["attributes"]; filtered: number } {
    const value: CallbackSpanRecord["attributes"] = Object.create(null); let filtered = 0;
    if (input === undefined) return { value, filtered };
    const entries = Object.entries(input); if (entries.length > 128) throw new Error("too many attributes");
    for (const [key, raw] of entries) {
      if (raw === undefined) continue;
      if (key.length > 256 || ["__proto__", "constructor", "prototype"].includes(key)) throw new Error("unsupported attribute key");
      // The known input/output token COUNTS are operational fields, not content.
      if (!this.allowed.has(key) || (SENSITIVE_KEY.test(key) && !DEFAULT_CALLBACK_ATTRIBUTES.includes(key))) { filtered++; continue; }
      const scalar = (part: unknown): string | number | boolean => {
        if (typeof part === "string") return text(part);
        if (typeof part === "boolean" || (typeof part === "number" && Number.isFinite(part))) return part;
        throw new Error("unsupported telemetry attribute");
      };
      if (Array.isArray(raw)) {
        if (raw.length > 64) throw new Error("oversized attribute array");
        const array = [...raw].map(scalar);
        if (array.some(part => typeof part !== typeof array[0])) throw new Error("mixed attribute array");
        value[key] = array as string[] | number[] | boolean[];
      } else value[key] = scalar(raw);
      if (typeof raw === "string" && /(?:\.id|\.call_id|\.registration_id)$/.test(key) && value[key] !== raw) {
        value[key] = `callback-id-${sha256Hex(`${key}\0${raw}`)}`;
      }
    }
    return { value, filtered };
  }
  private status(value: CallbackSpanStatus): CallbackSpanStatus {
    if (value.status === "ok") return { status: "ok" };
    if (value.status !== "error") throw new Error("unsupported status");
    if (value.error === undefined || !this.includeErrorDetails) return { status: "error" };
    return { status: "error", error: { name: text(value.error.name), message: text(value.error.message) } };
  }
  private commit(entry: Entry, record: CallbackSpanRecord, ended = entry.ended): void {
    // Reserve settlement room at admission so filling the event budget cannot
    // prevent recording a minimal final outcome.
    const bytes = Buffer.byteLength(JSON.stringify(record)) + (ended ? 0 : 256);
    if (this.usedBytes - entry.bytes + bytes > this.maxBytes) throw new Error("capture byte budget exceeded");
    this.usedBytes += bytes - entry.bytes; entry.bytes = bytes; entry.record = record; entry.ended = ended;
  }
  private start<T>(parent: Entry | null, options: CallbackSpanOptions, callback: (span: CallbackTelemetrySpan) => T | Promise<T>): Promise<T> {
    if (this.closed || parent?.ended) return NOOP.startSpan(options, callback);
    let entry: Entry;
    try {
      if (this.entries.size >= this.maxSpans) throw new Error("capture span budget exceeded");
      const name = text(options.name); if (!name) throw new Error("empty span name");
      const attrs = this.attributes(options.attributes);
      const record: CallbackSpanRecord = { id: `${this.captureId}:${this.nextId++}`, parentId: parent?.record.id ?? null,
        name, attributes: attrs.value, events: [], status: { status: "ok" }, explicitStatus: false,
        settlement: "pending", rejectionKind: null, endSequence: null, timestamp: traceTimestamp(attrs.value["amc.source.timestamp"]),
        durationMs: typeof attrs.value["amc.source.duration_ms"] === "number" && attrs.value["amc.source.duration_ms"] >= 0
          ? attrs.value["amc.source.duration_ms"] : null };
      entry = { record, bytes: 0, ended: false }; this.commit(entry, record);
      this.entries.set(record.id, entry); this.stats.admittedSpans++; this.stats.filteredAttributes += attrs.filtered;
    } catch { this.stats.droppedSpans++; return NOOP.startSpan(options, callback); }
    const recordCall = (operation: () => void): void => {
      if (this.closed || entry.ended) return;
      try { operation(); } catch { this.stats.droppedRecordingCalls++; }
    };
    const span: CallbackTelemetrySpan = Object.freeze({
      startSpan: <Result>(childOptions: CallbackSpanOptions, childCallback: (child: CallbackTelemetrySpan) => Result | Promise<Result>) => this.start(entry, childOptions, childCallback),
      setAttributes: (attributes: CallbackAttributes) => recordCall(() => {
        const next = this.attributes(attributes);
        const merged = { ...entry.record.attributes, ...next.value };
        if (Object.keys(merged).length > 128) throw new Error("too many accumulated attributes");
        const rawDuration = merged["amc.source.duration_ms"];
        this.commit(entry, { ...entry.record, attributes: merged,
          timestamp: traceTimestamp(merged["amc.source.timestamp"]),
          durationMs: typeof rawDuration === "number" && Number.isFinite(rawDuration) && rawDuration >= 0 ? rawDuration : null });
        this.stats.filteredAttributes += next.filtered;
      }),
      addEvent: (name: string, attributes?: CallbackAttributes) => recordCall(() => {
        if (entry.record.events.length >= this.maxEvents) throw new Error("capture event budget exceeded");
        const safeName = text(name); if (!safeName) throw new Error("empty event name");
        const next = this.attributes(attributes);
        this.commit(entry, { ...entry.record, events: [...entry.record.events, { name: safeName, attributes: next.value,
          timestamp: traceTimestamp(next.value["amc.source.timestamp"]) }] });
        this.stats.filteredAttributes += next.filtered;
      }),
      setStatus: (status: CallbackSpanStatus) => recordCall(() => this.commit(entry,
        { ...entry.record, status: this.status(status), explicitStatus: true }))
    });
    const settle = (failed: boolean, error?: unknown): void => {
      if (this.closed || entry.ended) return;
      let status = entry.record.status;
      let rejectionKind: CallbackSpanRecord["rejectionKind"] = failed ? "unknown" : null;
      if (failed) {
        try { if (error instanceof Error) rejectionKind = error.name === "AbortError" ? "aborted" : "error"; } catch { /* unknown rejection stays unknown */ }
      }
      if (failed && !entry.record.explicitStatus) {
        status = { status: "error" };
        try { if (error instanceof Error) status = this.status({ status: "error", error: { name: error.name, message: error.message } }); } catch { /* unreadable rejection is still an error */ }
      }
      const record = { ...entry.record, status, rejectionKind, settlement: failed ? "rejected" as const : "fulfilled" as const, endSequence: this.nextEnd++ };
      try { this.commit(entry, record, true); } catch {
        this.stats.droppedRecordingCalls++;
        try { this.commit(entry, { ...record, status: status.status === "ok" ? { status: "ok" } : { status: "error" } }, true); } catch {
          this.entries.delete(entry.record.id); this.usedBytes -= entry.bytes; entry.ended = true; this.stats.droppedSpans++;
        }
      }
    };
    let result: T | Promise<T>;
    try { result = callback(span); } catch (error) { settle(true, error); return Promise.reject(error); }
    return Promise.prototype.then.call(Promise.resolve(result),
      (value: T) => { settle(false); return value; },
      (error: unknown) => { settle(true, error); throw error; }) as Promise<T>;
  }
  startSpan<T>(options: CallbackSpanOptions, callback: (span: CallbackTelemetrySpan) => T | Promise<T>): Promise<T> {
    return this.start(null, options, callback);
  }
  /** Snapshot time is capture metadata. It never supplies an absent source timestamp. */
  snapshot(): CallbackTelemetryDocument {
    return { format: "amc-callback-telemetry", version: 1, captureId: this.captureId, recordedAt: new Date().toISOString(),
      source: { contract: "pi-telemetry@b2602be77cb7b0de45dd616407fd210daa48aa75", trust: "SELF_REPORTED", signed: false, evaluation: "NOT_EVALUATED" },
      spans: [...this.entries.values()].map(entry => clone(entry.record)), stats: { ...this.stats },
      losses: ["In-process callback reports are unsigned and independently unverified.",
        "Source timestamps and durations remain null unless explicitly supplied; capture time is separate.",
        "Prompts, completions, tool arguments/results and credentials are excluded by default.",
        "Parent spans may be in earlier flush batches; missing parents are not reconstructed.",
        "Flush is at-least-once on uncertain sink failure; deduplicate by captureId and span id.",
        ...(this.stats.droppedSpans || this.stats.droppedRecordingCalls ? ["Capture limits or unreadable inputs caused losses; inspect stats."] : []),
        ...(this.closed ? ["Capture is closed; unsettled callbacks have no asserted final outcome."] : [])] };
  }
  toJSON(): string { return JSON.stringify(this.snapshot(), null, 2); }
  /** Record a refused passive event without retaining its potentially sensitive payload. */
  recordDroppedCall(): void { if (!this.closed) this.stats.droppedRecordingCalls++; }
  /** Export happens only on explicit flush; recording never invokes an exporter. */
  flush(sink: (document: CallbackTelemetryDocument) => void | Promise<void>): Promise<CallbackFlushResult> {
    const run = async (): Promise<CallbackFlushResult> => {
      const document = this.snapshot(); document.spans = document.spans.filter(span => span.settlement !== "pending");
      if (!document.spans.length) return { ok: true, exported: 0, remaining: this.entries.size };
      const sentIds = document.spans.map(span => span.id);
      try { await sink(document); } catch {
        this.stats.flushFailures++; return { ok: false, exported: 0, remaining: this.entries.size, reason: "sink-failed" };
      }
      for (const id of sentIds) { const entry = this.entries.get(id); if (entry) { this.usedBytes -= entry.bytes; this.entries.delete(id); } }
      this.stats.exportedSpans += sentIds.length;
      return { ok: true, exported: sentIds.length, remaining: this.entries.size };
    };
    const next = this.flushTail.then(run, run); this.flushTail = next; return next;
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const entry of this.entries.values()) if (!entry.ended) {
      this.commit(entry, { ...entry.record, settlement: "closed-before-settlement" }, true);
    }
  }
}

export function createCallbackTelemetryCapture(options: CallbackCaptureOptions = {}): CallbackTelemetryCapture {
  return new CallbackTelemetryCapture(options);
}
