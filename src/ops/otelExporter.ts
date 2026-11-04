/**
 * library-only, not enforced by production telemetry: this compatibility exporter
 * has no production caller. Canonical export lives in src/observability/otelExporter.ts.
 * WP26 should reuse the W3C trace-context and conversion helpers through that path
 * before treating this module as an active telemetry integration.
 *
 * otelExporter.ts — Native OpenTelemetry Protocol (OTLP) exporter for AMC traces.
 *
 * Converts AMC's native trace format (AMCTraceV1) into OpenTelemetry-compatible
 * spans that can be exported via OTLP/JSON to any OTEL collector (Jaeger, Zipkin,
 * Grafana Tempo, Datadog, etc.).
 *
 * Supports:
 *   - AMC trace → OTLP span conversion
 *   - Semantic conventions for GenAI (gen_ai.system, gen_ai.request.model)
 *   - Batch export with configurable flush interval
 *   - HTTP/JSON OTLP endpoint push
 *   - Resource attributes (service.name, service.version, amc.agent.id)
 *   - W3C trace context propagation (traceparent header)
 */

import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import type { AMCTraceV1 } from '../correlation/traceSchema.js';

/* ── OTLP types (subset matching the OTLP/JSON spec) ──────────── */

export interface OTLPResource {
  attributes: OTLPAttribute[];
}

export interface OTLPAttribute {
  key: string;
  value: { stringValue?: string; intValue?: number; boolValue?: boolean };
}

export interface OTLPSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number; // 1=INTERNAL, 2=SERVER, 3=CLIENT, 4=PRODUCER, 5=CONSUMER
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OTLPAttribute[];
  status: { code: number; message?: string }; // 0=UNSET, 1=OK, 2=ERROR
  events: OTLPSpanEvent[];
}

export interface OTLPSpanEvent {
  name: string;
  timeUnixNano: string;
  attributes: OTLPAttribute[];
}

export interface OTLPScopeSpans {
  scope: { name: string; version: string };
  spans: OTLPSpan[];
}

export interface OTLPResourceSpans {
  resource: OTLPResource;
  scopeSpans: OTLPScopeSpans[];
}

export interface OTLPExportRequest {
  resourceSpans: OTLPResourceSpans[];
}

/* ── Exporter config ─────────────────────────────────────────── */

export interface OTELExporterConfig {
  /** OTLP endpoint URL (e.g. http://localhost:4318/v1/traces) */
  endpoint: string;
  /** Service name for resource attribute */
  serviceName: string;
  /** Service version */
  serviceVersion?: string;
  /** Additional resource attributes */
  resourceAttributes?: Record<string, string>;
  /** Max spans per batch before auto-flush */
  maxBatchSize: number;
  /** Flush interval in ms */
  flushIntervalMs: number;
  /** Custom headers for OTLP requests */
  headers?: Record<string, string>;
  /** Whether to enable export (can be disabled for testing) */
  enabled: boolean;
}

const DEFAULT_CONFIG: OTELExporterConfig = {
  endpoint: 'http://localhost:4318/v1/traces',
  serviceName: 'amc-agent',
  serviceVersion: '1.0.0',
  maxBatchSize: 100,
  flushIntervalMs: 5000,
  enabled: true,
};

/* ── Trace context ───────────────────────────────────────────── */

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  traceFlags?: number;
  sampled?: boolean;
}

/** Generate a W3C traceparent header */
export function createTraceparent(ctx: TraceContext): string {
  let flags: number;
  if (ctx.traceFlags !== undefined) {
    flags = ctx.traceFlags;
  } else if (ctx.sampled !== undefined) {
    flags = ctx.sampled ? 1 : 0;
  } else {
    flags = 1;
  }
  return `00-${ctx.traceId}-${ctx.spanId}-${String(flags).padStart(2, '0')}`;
}

/** Parse a W3C traceparent header */
export function parseTraceparent(header: string): (TraceContext & { sampled: boolean }) | undefined {
  const parts = header.split('-');
  if (parts.length < 4) return undefined;
  const traceId = parts[1]!;
  const spanId = parts[2]!;
  // Validate lengths
  if (traceId.length !== 32 || spanId.length !== 16) return undefined;
  const traceFlags = parseInt(parts[3]!, 16);
  return {
    traceId,
    spanId,
    traceFlags,
    sampled: (traceFlags & 1) === 1,
  };
}

/* ── AMC → OTLP conversion ───────────────────────────────────── */

function generateTraceId(): string {
  return createHash('md5').update(randomUUID()).digest('hex');
}

function generateSpanId(): string {
  return createHash('md5').update(randomUUID()).digest('hex').slice(0, 16);
}

function msToNanos(ms: number): string {
  return String(BigInt(ms) * BigInt(1_000_000));
}

function attr(key: string, value: string | number | boolean): OTLPAttribute {
  if (typeof value === 'string') return { key, value: { stringValue: value } };
  if (typeof value === 'number') return { key, value: { intValue: value } };
  return { key, value: { boolValue: value } };
}

/** Map AMC event type to OTLP span kind */
function eventToSpanKind(event: string): number {
  switch (event) {
    case 'llm_call': return 3; // CLIENT
    case 'llm_result': return 3; // CLIENT
    case 'tool_intent': return 4; // PRODUCER
    case 'tool_result': return 5; // CONSUMER
    case 'verification_step': return 1; // INTERNAL
    default: return 1; // INTERNAL
  }
}

/** Convert a single AMC trace to an OTLP span */
export function amcTraceToOTLPSpan(
  trace: AMCTraceV1,
  agentIdOrTraceId?: string,
  traceIdOrParentSpanId?: string,
): OTLPSpan {
  // Support both (trace, agentId, traceId) and (trace, traceId, parentSpanId) call patterns
  // If 3rd arg looks like a 32-char hex traceId, treat as (trace, agentId, traceId)
  let traceId: string | undefined;
  let parentSpanId: string | undefined;
  if (traceIdOrParentSpanId && traceIdOrParentSpanId.length === 32) {
    traceId = traceIdOrParentSpanId;
  } else if (agentIdOrTraceId && agentIdOrTraceId.length === 32) {
    traceId = agentIdOrTraceId;
    parentSpanId = traceIdOrParentSpanId;
  } else {
    traceId = agentIdOrTraceId;
    parentSpanId = traceIdOrParentSpanId;
  }
  const spanId = generateSpanId();
  const startNanos = msToNanos(trace.ts);
  // Estimate end time as start + 1ms (AMC traces don't track duration)
  const endNanos = msToNanos(trace.ts + 1);

  const attributes: OTLPAttribute[] = [
    attr('amc.agent.id', trace.agentId),
    attr('amc.event.type', trace.event),
  ];

  // GenAI semantic conventions
  if (trace.providerId) attributes.push(attr('gen_ai.system', trace.providerId));
  if (trace.model) attributes.push(attr('gen_ai.request.model', trace.model));
  if (trace.request_id) attributes.push(attr('amc.request.id', trace.request_id));
  if (trace.receipt) attributes.push(attr('amc.receipt', trace.receipt));
  if (trace.hashes?.input_sha256) attributes.push(attr('amc.hash.input', trace.hashes.input_sha256));
  if (trace.hashes?.output_sha256) attributes.push(attr('amc.hash.output', trace.hashes.output_sha256));

  const events: OTLPSpanEvent[] = [];
  if (trace.note) {
    events.push({
      name: 'amc.note',
      timeUnixNano: startNanos,
      attributes: [attr('note', trace.note)],
    });
  }

  return {
    traceId: traceId ?? generateTraceId(),
    spanId,
    parentSpanId,
    name: `amc.${trace.event}`,
    kind: eventToSpanKind(trace.event),
    startTimeUnixNano: startNanos,
    endTimeUnixNano: endNanos,
    attributes,
    status: { code: 1 }, // OK
    events,
  };
}

/** Convert a batch of AMC traces to an OTLP export request */
export function amcTracesToOTLPRequest(
  traces: AMCTraceV1[],
  agentIdOrConfig?: string | Partial<OTELExporterConfig>,
  resourceAttrs?: Record<string, string>,
): OTLPExportRequest {
  const cfg = typeof agentIdOrConfig === 'object' ? { ...DEFAULT_CONFIG, ...agentIdOrConfig } : { ...DEFAULT_CONFIG };
  if (resourceAttrs) {
    cfg.resourceAttributes = { ...(cfg.resourceAttributes ?? {}), ...resourceAttrs };
  }
  const traceId = generateTraceId();

  const resourceAttributes: OTLPAttribute[] = [
    attr('service.name', cfg.serviceName),
    attr('service.version', cfg.serviceVersion ?? '1.0.0'),
    attr('telemetry.sdk.name', 'amc-otel-exporter'),
    attr('telemetry.sdk.language', 'typescript'),
  ];

  if (cfg.resourceAttributes) {
    for (const [k, v] of Object.entries(cfg.resourceAttributes)) {
      resourceAttributes.push(attr(k, v));
    }
  }

  let parentSpanId: string | undefined;
  const spans: OTLPSpan[] = [];

  for (const trace of traces) {
    const span = amcTraceToOTLPSpan(trace, traceId, parentSpanId);
    spans.push(span);
    parentSpanId = span.spanId; // Chain spans linearly
  }

  return {
    resourceSpans: [{
      resource: { attributes: resourceAttributes },
      scopeSpans: [{
        scope: { name: 'amc-governance', version: '1.0.0' },
        spans,
      }],
    }],
  };
}

/* ── Batch exporter ──────────────────────────────────────────── */

export interface ExportResult {
  success: boolean;
  spansExported: number;
  endpoint: string;
  error?: string;
  timestamp: number;
}

export class OTELExporter {
  private config: OTELExporterConfig;
  private buffer: AMCTraceV1[] = [];
  private exportHistory: ExportResult[] = [];
  private flushTimer?: ReturnType<typeof setInterval>;

  constructor(config: Partial<OTELExporterConfig> & { batchSize?: number } = {}) {
    const { batchSize, ...rest } = config;
    this.config = { ...DEFAULT_CONFIG, ...rest };
    if (batchSize !== undefined) this.config.maxBatchSize = batchSize;
  }

  /** Add a trace to the export buffer */
  addTrace(trace: AMCTraceV1, _agentId?: string): void {
    this.buffer.push(trace);
    if (this.buffer.length >= this.config.maxBatchSize) {
      this.flush();
    }
  }

  /** Add multiple traces */
  addTraces(traces: AMCTraceV1[]): void {
    for (const t of traces) this.addTrace(t);
  }

  /** Flush the buffer and export to OTLP endpoint */
  async flush(): Promise<ExportResult> {
    const traces = [...this.buffer];
    this.buffer = [];

    if (traces.length === 0) {
      return { success: true, spansExported: 0, endpoint: this.config.endpoint, timestamp: Date.now() };
    }

    const request = amcTracesToOTLPRequest(traces, this.config);
    const result: ExportResult = {
      success: true,
      spansExported: traces.length,
      endpoint: this.config.endpoint,
      timestamp: Date.now(),
    };

    if (this.config.enabled) {
      try {
        const payload = JSON.stringify(request);
        const response = await fetch(this.config.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(this.config.headers ?? {}),
          },
          body: payload,
          signal: AbortSignal.timeout(5_000),
        });
        result.success = response.ok;
        if (!response.ok) {
          result.error = `HTTP ${response.status}`;
        }
      } catch (err) {
        result.success = false;
        result.error = err instanceof Error ? err.message : String(err);
      }
    }

    this.exportHistory.push(result);
    return result;
  }

  /** Start periodic flushing */
  startPeriodicFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => this.flush(), this.config.flushIntervalMs);
  }

  /** Stop periodic flushing */
  stopPeriodicFlush(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  /** Get the last OTLP request payload (for testing) */
  getLastPayload(): OTLPExportRequest | undefined {
    if (this.buffer.length === 0 && this.exportHistory.length === 0) return undefined;
    const traces = this.buffer.length > 0 ? [...this.buffer] : [];
    return traces.length > 0 ? amcTracesToOTLPRequest(traces, this.config) : undefined;
  }

  /** Convert current buffer to OTLP JSON string */
  toOTLPJSON(): string {
    const request = amcTracesToOTLPRequest([...this.buffer], this.config);
    return JSON.stringify(request, null, 2);
  }

  /** Get export history */
  getExportHistory(): ExportResult[] {
    return [...this.exportHistory];
  }

  /** Get buffer size */
  get bufferSize(): number { return this.buffer.length; }
  get historySize(): number { return this.exportHistory.length; }

  /** Update config */
  updateConfig(updates: Partial<OTELExporterConfig>): void {
    Object.assign(this.config, updates);
  }

  getConfig(): OTELExporterConfig {
    return { ...this.config };
  }

  /** Get export stats */
  getStats(): { totalSpansBuffered: number; totalSpansExported: number } {
    const totalExported = this.exportHistory.reduce((s, r) => s + r.spansExported, 0);
    return { totalSpansBuffered: this.buffer.length, totalSpansExported: totalExported };
  }

  /** Drain the buffer, returning the OTLP export request */
  drain(): OTLPExportRequest {
    const traces = [...this.buffer];
    this.buffer = [];
    const request = amcTracesToOTLPRequest(traces, this.config);
    this.exportHistory.push({
      success: true,
      spansExported: traces.length,
      endpoint: this.config.endpoint,
      timestamp: Date.now(),
    });
    return request;
  }

  /** Shutdown: flush and stop timers */
  async shutdown(): Promise<ExportResult> {
    this.stopPeriodicFlush();
    return this.flush();
  }
}
