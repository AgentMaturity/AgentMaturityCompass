/** Explicit Pi profile at 6c384aa3. The pinned v1 bridge and decoder retain their original contract. */
import { z } from "zod";
import { CallbackTelemetryCapture, type CallbackCaptureOptions } from "./callbackTelemetryCapture.js";
import { callbackSpanSchema, callbackTelemetryDocumentSchema, type CallbackAttributes, type CallbackSpanOptions,
  type CallbackSpanRecord, type CallbackSpanStatus, type CallbackTelemetryContext, type CallbackTelemetrySpan } from "./callbackTelemetryContract.js";
import { callbackTelemetryTraces, callbackTelemetryWarnings, parseCallbackTelemetry } from "./callbackTelemetryImport.js";
import type { ProductionTrace } from "../agents/traceIngestion.js";
import { SourceFormatError, headerVersion } from "./sourceFormatError.js";

export const PI_CURRENT_TELEMETRY_CONTRACT = "pi-telemetry@6c384aa30f619d7b28963f2bab24d8dacbe73cb6";
const LEGACY_CONTRACT = "pi-telemetry@b2602be77cb7b0de45dd616407fd210daa48aa75";
const LINK_EVENT = "amc.current.span_link";
const LINK_CAPTURE = "amc.link.capture_id", LINK_SPAN = "amc.link.span_id";
const ALIASES: Record<string, string> = { "usage.input": "pi.ai.usage.input_tokens", "usage.output": "pi.ai.usage.output_tokens" };
const CURRENT_KEYS = ["provider", "api", "model", "reasoning", "stop", "usage.input", "usage.output", "usage.cache_read",
  "usage.cache_write", "cost.total", "response.id", "type", "index", "chars", "tool", "entry.id", "entry.kind", "reason", "extension",
  "task.id", "submission.id", "status", "answer.entry_id", "submission.type", "conversation.id", "result", "task.name", "phase", "kind",
  "attempt", "resumed", "outcome", "tool.name", "tool.call_id", "amc.source.timestamp", "amc.source.duration_ms"];
const NUMERIC_KEYS = new Set(["usage.input", "usage.output", "usage.cache_read", "usage.cache_write", "cost.total", "index", "chars", "entry.id", "task.id", "submission.id", "answer.entry_id", "conversation.id", "attempt", "amc.source.timestamp", "amc.source.duration_ms"]);
const operationalString = (value: unknown): boolean => typeof value === "string" && value.length <= 256 && /^[A-Za-z0-9_./:@+=-]+$/.test(value);
function admitAttributes(input: CallbackAttributes | undefined, capture: CallbackTelemetryCapture, allowed: ReadonlySet<string>) {
  const mapped: CallbackAttributes = {}; let filtered = 0;
  for (const [key, value] of Object.entries(input ?? {})) {
    if (value === undefined) continue;
    const valid = !CURRENT_KEYS.includes(key) || (NUMERIC_KEYS.has(key)
      ? typeof value === "number" && Number.isFinite(value) && value >= 0
      : key === "resumed" ? typeof value === "boolean"
      : key === "reason" && Array.isArray(value) ? value.every(operationalString) : operationalString(value));
    if (key === LINK_CAPTURE || key === LINK_SPAN || !allowed.has(key) || !valid) { filtered++; continue; }
    mapped[ALIASES[key] ?? key] = value;
  }
  const safe = capture.admitAttributes(mapped);
  return { value: safe.value, filtered: filtered + safe.filtered };
}
const reverseAliases = (attributes: CallbackSpanRecord["attributes"]): CallbackSpanRecord["attributes"] => Object.fromEntries(Object.entries(attributes)
  .map(([key, value]) => [Object.keys(ALIASES).find(name => ALIASES[name] === key) ?? key, value]));
const contextIdentities = new WeakMap<object, { captureId: string; spanId: string }>();
const linkSchema = z.object({ captureId: z.string().uuid(), spanId: z.string().max(100), attributes: callbackSpanSchema.shape.attributes }).strict();
const currentPiTelemetryDocumentSchema = callbackTelemetryDocumentSchema.extend({
  version: z.literal(2),
  source: z.object({ contract: z.literal(PI_CURRENT_TELEMETRY_CONTRACT), trust: z.literal("SELF_REPORTED"), signed: z.literal(false), evaluation: z.literal("NOT_EVALUATED") }).strict(),
  capabilities: z.object({ metrics: z.literal("unsupported"), propagation: z.literal("unsupported"), watch: z.literal("metadata-only") }).strict(),
  spans: z.array(callbackSpanSchema.extend({ sourceIdentity: z.object({ captureId: z.string().uuid(), spanId: z.string().max(100) }).strict(), links: z.array(linkSchema).max(32) }).strict()).max(4096),
  stats: callbackTelemetryDocumentSchema.shape.stats.extend({ droppedLinks: z.number().int().nonnegative(), watchLosses: z.number().int().nonnegative() }).strict()
}).strict();
export type CurrentPiTelemetryDocument = z.infer<typeof currentPiTelemetryDocumentSchema>;
export interface CurrentPiTelemetryContext {
  startSpan<T>(options: CurrentPiSpanOptions, callback: (span: CurrentPiTelemetrySpan) => T | Promise<T>): Promise<T>;
}
export interface CurrentPiSpanLink { context: CurrentPiTelemetryContext; attributes?: CallbackAttributes }
export interface CurrentPiSpanOptions extends CallbackSpanOptions { links?: readonly CurrentPiSpanLink[] }
export interface CurrentPiTelemetrySpan extends CurrentPiTelemetryContext {
  addLink(link: CurrentPiSpanLink): void;
  setAttributes(attributes: CallbackAttributes): void;
  addEvent(name: string, attributes?: CallbackAttributes): void;
  setStatus(status: CallbackSpanStatus): void;
}
export interface CurrentPiWatchHandle {
  readonly value: unknown;
  start(listener: (change: { value: unknown; ops: readonly unknown[]; retired: boolean }, context: unknown) => Promise<void>): void;
  stop(): Promise<{ reason: string }>;
  readonly closed: Promise<{ reason: string }>;
}

export function createCurrentPiTelemetryBridge(options: CallbackCaptureOptions & { sourceContract: string; maxLinksPerSpan?: number }) {
  if (options.sourceContract !== PI_CURRENT_TELEMETRY_CONTRACT) throw new Error(`Unsupported Pi telemetry contract; expected ${PI_CURRENT_TELEMETRY_CONTRACT}.`);
  const maxLinks = options.maxLinksPerSpan ?? 16;
  if (!Number.isSafeInteger(maxLinks) || maxLinks < 1 || maxLinks > 32) throw new Error("Invalid Pi link bound.");
  const allowed = new Set([...CURRENT_KEYS, ...(options.allowedAttributes ?? [])]);
  const capture = new CallbackTelemetryCapture({ ...options, allowedAttributes: [...allowed].map(key => ALIASES[key] ?? key).concat(LINK_CAPTURE, LINK_SPAN) });
  let filtered = 0, droppedLinks = 0, watchLosses = 0, closed = false;
  const attributes = (input?: CallbackAttributes): CallbackAttributes => {
    const safe = admitAttributes(input, capture, allowed); filtered += safe.filtered; return safe.value;
  };
  const start = <T>(parent: CallbackTelemetryContext, spanOptions: CurrentPiSpanOptions, callback: (span: CurrentPiTelemetrySpan) => T | Promise<T>): Promise<T> => {
    // Admission is best effort; even hostile recording getters cannot suppress or duplicate the callback.
    let safeOptions: CallbackSpanOptions;
    try { safeOptions = closed ? { name: "" } : { name: spanOptions.name, attributes: attributes(spanOptions.attributes) }; }
    catch { capture.recordDroppedCall(); safeOptions = { name: "" }; }
    return parent.startSpan(safeOptions, underlying => {
      let active = !closed;
      const spanId = capture.spanIdentity(underlying);
      const span: CurrentPiTelemetrySpan = Object.freeze({
        startSpan: <Result>(child: CurrentPiSpanOptions, run: (childSpan: CurrentPiTelemetrySpan) => Result | Promise<Result>) => start(underlying, child, run),
        addLink: (link: CurrentPiSpanLink) => {
          if (!active || closed || !spanId) return;
          try {
            const target = contextIdentities.get(link.context);
            if (!target || links >= maxLinks) { droppedLinks++; return; }
            const safe = attributes(link.attributes);
            const before = capture.snapshot().stats.droppedRecordingCalls;
            underlying.addEvent(LINK_EVENT, { ...safe, [LINK_CAPTURE]: target.captureId, [LINK_SPAN]: target.spanId });
            if (capture.snapshot().stats.droppedRecordingCalls !== before) droppedLinks++;
            else links++;
          } catch { droppedLinks++; }
        },
        setAttributes: (input: CallbackAttributes) => { if (!active || closed) return; try { underlying.setAttributes(attributes(input)); } catch { capture.recordDroppedCall(); } },
        addEvent: (name: string, input?: CallbackAttributes) => { if (!active || closed) return; try { underlying.addEvent(name, attributes(input)); } catch { capture.recordDroppedCall(); } },
        setStatus: (status: CallbackSpanStatus) => { if (!active) return; try { underlying.setStatus(status); } catch { capture.recordDroppedCall(); } }
      });
      let links = 0;
      if (spanId) contextIdentities.set(span, { captureId: capture.captureId, spanId });
      if (active && spanId) try { for (const link of spanOptions.links ?? []) span.addLink(link); } catch { droppedLinks++; }
      let result: T | Promise<T>;
      try { result = callback(span); } catch (error) { active = false; throw error; }
      return Promise.prototype.then.call(Promise.resolve(result), (value: T) => { active = false; return value; }, (error: unknown) => { active = false; throw error; }) as Promise<T>;
    });
  };
  const telemetryContext: CurrentPiTelemetryContext = Object.freeze({ startSpan: <T>(input: CurrentPiSpanOptions, run: (span: CurrentPiTelemetrySpan) => T | Promise<T>) => start(capture, input, run) });
  const snapshot = (): CurrentPiTelemetryDocument => {
    const original = capture.snapshot();
    return { ...original, version: 2, source: { ...original.source, contract: PI_CURRENT_TELEMETRY_CONTRACT },
      capabilities: { metrics: "unsupported", propagation: "unsupported", watch: "metadata-only" },
      stats: { ...original.stats, filteredAttributes: original.stats.filteredAttributes + filtered, droppedLinks, watchLosses },
      spans: original.spans.map(span => ({ ...span, attributes: reverseAliases(span.attributes), sourceIdentity: { captureId: original.captureId, spanId: span.id },
        events: span.events.filter(event => !(event.name === LINK_EVENT && typeof event.attributes[LINK_SPAN] === "string")).map(event => ({ ...event, attributes: reverseAliases(event.attributes) })),
        links: span.events.filter(event => event.name === LINK_EVENT && typeof event.attributes[LINK_SPAN] === "string").map(event => {
          const { [LINK_CAPTURE]: captureId, [LINK_SPAN]: linkedId, ...attrs } = event.attributes;
          return { captureId: String(captureId), spanId: String(linkedId), attributes: reverseAliases(attrs) as z.infer<typeof linkSchema>["attributes"] };
        }) })),
      losses: [...original.losses, "Current Pi metrics and propagation are unsupported; absent measurements are unknown, never zero.",
        "Durable watches retain metadata only; content, delta payloads and source revision continuity are not imported."] };
  };
  const bindWatch = (handle: CurrentPiWatchHandle) => {
    let active = true, stopPromise: Promise<{ ok: boolean }> | undefined, retired = false, updates = 0;
    const state = { attached: false, initialSnapshot: false, resyncRequired: false, terminal: null as string | null };
    // No handle was acquired after closure; stopping this inert binding owns no source cleanup.
    if (closed) return { state, stop: async () => ({ ok: true }), get retired() { return retired; }, get updates() { return updates; } };
    const loss = () => { if (!closed) watchLosses++; state.resyncRequired = true; };
    const stop = (): Promise<{ ok: boolean }> => {
      active = false;
      if (!stopPromise) stopPromise = Promise.resolve().then(() => handle.stop()).then(end => { state.terminal = end.reason; return { ok: true }; }, () => { loss(); stopPromise = undefined; return { ok: false }; });
      return stopPromise;
    };
    try {
      state.initialSnapshot = handle.value !== undefined;
      if (!state.initialSnapshot) loss();
      handle.start(async change => {
        if (!active || closed) return;
        try {
          if (!change || change.value === undefined || !Array.isArray(change.ops) || typeof change.retired !== "boolean") { loss(); return; }
          retired = change.retired; updates++;
          // Retirement is an address-incarnation boundary, not stream closure. A root replacement resynchronizes it.
          if (retired) state.resyncRequired = true;
          if (change.ops.some(op => Array.isArray(op) && op[0] === "r")) { state.initialSnapshot = true; state.resyncRequired = false; }
        } catch { loss(); }
      });
      state.attached = true;
      void Promise.resolve(handle.closed).then(end => { active = false; state.terminal = end.reason; if (!["stopped", "ended"].includes(end.reason)) loss(); }, () => { active = false; state.terminal = "failed"; loss(); });
    } catch { loss(); void stop(); }
    return { state, stop, get retired() { return retired; }, get updates() { return updates; } };
  };
  return { telemetryContext, snapshot, toJSON: () => JSON.stringify(snapshot(), null, 2), close: () => { closed = true; capture.close(); }, bindWatch,
    flush: (sink: (document: CurrentPiTelemetryDocument) => void | Promise<void>) => capture.flush(async legacy => {
      const ids = new Set(legacy.spans.map(span => span.id)); const document = snapshot(); document.spans = document.spans.filter(span => ids.has(span.id)); await sink(document);
    }) };
}

export function parseCurrentPiTelemetry(value: unknown) {
  const result = currentPiTelemetryDocumentSchema.safeParse(value);
  if (!result.success) throw new Error("Unsupported or malformed current Pi callback telemetry profile; no generic fallback is permitted.");
  const document = result.data;
  const privacy = new CallbackTelemetryCapture({ allowedAttributes: CURRENT_KEYS.map(key => ALIASES[key] ?? key) });
  const allowed = new Set(CURRENT_KEYS);
  let filtered = 0, errorDetails = 0;
  const admit = (input: CallbackAttributes) => {
    const safe = admitAttributes(input, privacy, allowed); filtered += safe.filtered;
    return reverseAliases(safe.value) as z.infer<typeof callbackSpanSchema>["attributes"];
  };
  for (const span of document.spans) {
    if (span.status.status === "error" && span.status.error) { span.status = { status: "error" }; errorDetails++; }
    span.attributes = admit(span.attributes);
    for (const event of span.events) event.attributes = admit(event.attributes);
    for (const link of span.links) link.attributes = admit(link.attributes);
  }
  document.stats.filteredAttributes += filtered;
  document.losses = [
    "Imported callback reports remain unsigned, independently unverified and SELF_REPORTED.",
    "Source timestamps and durations remain null when absent; capture time supplies neither.",
    `${document.losses.length} input diagnostic strings were excluded at this admission stage; inspect source statistics for capture losses.`,
    "Metrics and propagation are unsupported; missing measurements remain unknown.",
    "Durable watch content and source revision continuity are not imported.",
    ...(filtered ? [`${filtered} imported attributes were filtered by the current Pi operational profile.`] : []),
    ...(errorDetails ? [`${errorDetails} free-form source error details were excluded by default.`] : [])
  ];
  const { capabilities: _capabilities, ...legacy } = document;
  const base = parseCallbackTelemetry({ ...legacy, version: 1, source: { ...document.source, contract: LEGACY_CONTRACT },
    stats: Object.fromEntries(Object.entries(document.stats).filter(([key]) => !["droppedLinks", "watchLosses"].includes(key))),
    spans: document.spans.map(({ sourceIdentity, links, ...span }) => {
      if (!/^[1-9]\d*$/.test(span.id.slice(document.captureId.length + 1)) || sourceIdentity.captureId !== document.captureId || sourceIdentity.spanId !== span.id || links.some(link => !link.spanId.startsWith(`${link.captureId}:`) || !/^[1-9]\d*$/.test(link.spanId.slice(link.captureId.length + 1)))) throw new Error("Pi telemetry source identity is inconsistent.");
      return span;
    }) });
  return { document, format: { ...base.format, name: "pi-callback-telemetry" as const, version: 2 as const, sourceContract: PI_CURRENT_TELEMETRY_CONTRACT, sourceRevision: PI_CURRENT_TELEMETRY_CONTRACT.slice("pi-telemetry@".length) } };
}
export type ParsedCurrentPiTelemetry = ReturnType<typeof parseCurrentPiTelemetry>;
export function parseDetectedCurrentPiTelemetry(text: string): ParsedCurrentPiTelemetry | null {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return null; }
  if (!value || typeof value !== "object" || Array.isArray(value) || (value as { format?: unknown }).format !== "amc-callback-telemetry" || (value as { version?: unknown }).version === 1) return null;
  const row = value as { version?: unknown; source?: unknown };
  const version = headerVersion(row.version);
  const supported = `amc-callback-telemetry v2 with source profile ${PI_CURRENT_TELEMETRY_CONTRACT}`;
  const refuse = (reason: string): never => {
    throw new SourceFormatError(`${reason}; AMC supports ${supported}.`, {
      code: "PI_CURRENT_TELEMETRY_REFUSED", format: "pi-callback-telemetry", detectedVersion: version, supported, sourceRevision: null
    });
  };
  if (version !== 2) refuse(version === null ? "Pi callback telemetry has a missing or invalid version" : `Unsupported Pi callback telemetry version ${version}`);
  const source = row.source;
  if (!source || typeof source !== "object" || Array.isArray(source) || (source as { contract?: unknown }).contract !== PI_CURRENT_TELEMETRY_CONTRACT) {
    refuse("Unsupported or missing current Pi telemetry source profile");
  }
  try { return parseCurrentPiTelemetry(value); }
  catch { return refuse("Malformed current Pi callback telemetry document"); }
}
export function currentPiTelemetryWarnings(parsed: ParsedCurrentPiTelemetry): string[] {
  return [...parsed.document.losses,
    ...(parsed.document.stats.droppedSpans ? [`${parsed.document.stats.droppedSpans} current Pi spans were dropped.`] : []),
    ...(parsed.document.stats.droppedRecordingCalls ? [`${parsed.document.stats.droppedRecordingCalls} current Pi recording calls were dropped.`] : []),
    ...(parsed.document.stats.filteredAttributes ? [`${parsed.document.stats.filteredAttributes} current Pi attributes were filtered.`] : []),
    ...(parsed.format.pendingSpans ? [`${parsed.format.pendingSpans} current Pi spans have no final source outcome.`] : []),
    ...(parsed.format.missingParents ? [`${parsed.format.missingParents} current Pi parents are missing from this batch.`] : []),
    ...(parsed.document.stats.droppedLinks ? [`${parsed.document.stats.droppedLinks} Pi span links were dropped.`] : []),
    ...(parsed.document.stats.watchLosses ? [`${parsed.document.stats.watchLosses} Pi watch losses require resynchronization.`] : []),
    "Current Pi telemetry remains SELF_REPORTED and NOT_EVALUATED; signing cannot upgrade its source trust."];
}
export function currentPiTelemetryTraces(parsed: ParsedCurrentPiTelemetry, agentId: string): ProductionTrace[] {
  const document = parsed.document;
  const { capabilities: _capabilities, ...legacy } = document;
  const base = parseCallbackTelemetry({ ...legacy, version: 1, source: { ...document.source, contract: LEGACY_CONTRACT },
    stats: Object.fromEntries(Object.entries(document.stats).filter(([key]) => !["droppedLinks", "watchLosses"].includes(key))),
    spans: document.spans.map(({ sourceIdentity: _identity, links: _links, ...span }) => ({ ...span, attributes: Object.fromEntries(Object.entries({
      ...span.attributes, "pi.ai.provider": span.attributes.provider, "pi.ai.model": span.attributes.model, "pi.ai.response.stop_reason": span.attributes.stop,
      "pi.ai.usage.input_tokens": span.attributes["usage.input"], "pi.ai.usage.output_tokens": span.attributes["usage.output"],
      "pi.ai.usage.cache_read_tokens": span.attributes["usage.cache_read"], "pi.ai.usage.cache_write_tokens": span.attributes["usage.cache_write"], "pi.ai.usage.cost": span.attributes["cost.total"]
    }).filter(([, value]) => value !== undefined)) })) });
  return callbackTelemetryTraces(base, agentId).map((trace, index) => ({ ...trace, metadata: { ...trace.metadata, sourceFormat: parsed.format,
    currentPiTelemetry: { sourceIdentity: document.spans[index]!.sourceIdentity, links: document.spans[index]!.links, attributes: document.spans[index]!.attributes, capabilities: document.capabilities },
    normalizationLosses: [...callbackTelemetryWarnings(base), ...currentPiTelemetryWarnings(parsed)] } }));
}
