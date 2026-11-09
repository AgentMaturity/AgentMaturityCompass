import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { getWorkspaceScope, withWorkspaceScope } from "../enforce/evidenceEmitter.js";
import type { Incident } from "../incidents/incidentTypes.js";
import type { EvidenceEvent, TrustTier } from "../types.js";
import { canonicalize } from "../utils/json.js";
import { dispatchTelemetryRequest, type PreparedTelemetryRequest, type TelemetryDispatchOptions } from "./otelExportTransport.js";
import { resolveOtelEnvConfig } from "./otelEnvConfig.js";
import { NativeSpanFolder, type FoldOutput } from "./nativeSessionSpans.js";
import { msToNanos, otelAttr as attr, type OTelAttribute, type OTelMetricPoint, type OTelSpan } from "./otelValues.js";
import { toZipkinSpans } from "./otelZipkin.js";
import { noteTelemetryDropped } from "./telemetryDrops.js";

export type ObservabilitySignal = "traces" | "metrics" | "logs";
export type ObservabilityExporterKind = "otlp" | "jaeger" | "zipkin";

export interface ObservabilityExporterTarget {
  kind: ObservabilityExporterKind;
  endpoint: string;
  headers?: Record<string, string>;
  enabledSignals?: Partial<Record<ObservabilitySignal, boolean>>;
  /** Signal-specific OTLP endpoints, used verbatim (OTEL_EXPORTER_OTLP_<SIGNAL>_ENDPOINT). */
  signalEndpoints?: Partial<Record<ObservabilitySignal, string>>;
}

export interface ObservabilityOTELConfig {
  enabled: boolean;
  serviceName: string;
  serviceVersion: string;
  resourceAttributes?: Record<string, string>;
  targets: ObservabilityExporterTarget[];
  maxBufferSize: number;
  /** Why the exporter is off although export was asked for (unsupported protocol, no target). */
  disabledReason?: string | null;
}

export interface ScoreComputationMetric {
  agentId: string;
  score: number;
  ts?: number;
  runId?: string;
  sessionId?: string;
  level?: number;
  maxScore?: number;
  percentage?: number;
  questionId?: string;
  dimension?: string;
  source?: string;
}

export interface IncidentLogInput {
  incidentId: string;
  agentId: string;
  severity: string;
  state: string;
  title: string;
  description?: string;
  triggerType?: string;
  triggerId?: string;
  ts?: number;
}

type BufferedSpan = OTelSpan;

interface BufferedMetric {
  metricName: string;
  unit: string;
  ts: number;
  value: number;
  attributes: OTelAttribute[];
}

/** One delta stream, aggregated between flushes: a sum, or a histogram with fixed explicit bounds. */
interface AggregatedStream {
  readonly kind: "sum" | "histogram";
  readonly name: string;
  readonly unit: string;
  readonly attributes: readonly OTelAttribute[];
  readonly startTs: number;
  count: number;
  sum: number;
  min: number;
  max: number;
  readonly bucketCounts: number[];
}

interface BufferedLog {
  ts: number;
  severityText: string;
  severityNumber: number;
  body: string;
  attributes: OTelAttribute[];
}

interface BufferedBatch {
  spans: BufferedSpan[];
  metrics: BufferedMetric[];
  logs: BufferedLog[];
  streams: AggregatedStream[];
}
interface CapturedWorkspace {
  workspace: string | undefined;
  run: ReturnType<typeof AsyncLocalStorage.snapshot>;
}
type ScopedBufferedBatch = BufferedBatch & { scope: CapturedWorkspace };
type SignalCounts = Record<ObservabilitySignal, number>;

interface DispatchRequest {
  targetKind: ObservabilityExporterKind;
  signal: ObservabilitySignal;
  endpoint: string;
  headers: Record<string, string>;
  payload: unknown;
  counts: SignalCounts;
}

interface PreparedDispatchRequest extends PreparedTelemetryRequest {
  targetKind: ObservabilityExporterKind;
  signal: ObservabilitySignal;
  counts: SignalCounts;
}
export interface ObservabilityDispatchResult {
  targetKind: ObservabilityExporterKind;
  signal: ObservabilitySignal;
  endpoint: string;
  ok: boolean;
  status?: number;
  error?: string;
}

export interface ObservabilityFlushResult {
  ts: number;
  exported: { traces: number; metrics: number; logs: number };
  requests: ObservabilityDispatchResult[];
}

const DEFAULT_CONFIG: ObservabilityOTELConfig = {
  enabled: false,
  serviceName: "amc-observability",
  serviceVersion: "1.0.0",
  targets: [],
  maxBufferSize: 1024
};

const DEFAULT_FLUSH_TIMEOUT_MS = 5_000;
const DEFAULT_FLUSH_MAX_RETRIES = 1;
const DEFAULT_FLUSH_RETRY_BASE_DELAY_MS = 200;
/** Seconds; the GenAI convention's duration buckets, reused for tool durations. */
const DURATION_BOUNDS = [0.01, 0.02, 0.04, 0.08, 0.16, 0.32, 0.64, 1.28, 2.56, 5.12, 10.24, 20.48, 40.96, 81.92];
const AGGREGATION_TEMPORALITY_DELTA = 1;

const TRUST_TIER_ORDER: TrustTier[] = ["SELF_REPORTED", "ATTESTED", "OBSERVED", "OBSERVED_HARDENED"];

function normalizeHex(input: string, bytes: number): string {
  const raw = input.replace(/[^a-fA-F0-9]/g, "").toLowerCase();
  if (raw.length >= bytes * 2) {
    return raw.slice(0, bytes * 2);
  }
  return `${raw}${"0".repeat(bytes * 2 - raw.length)}`;
}

function generateTraceId(seed?: string): string {
  const base = seed ?? randomUUID().replace(/-/g, "");
  return normalizeHex(base, 16);
}

function generateSpanId(seed?: string): string {
  const base = seed ?? randomUUID().replace(/-/g, "");
  return normalizeHex(base, 8);
}

function toTrustTier(value: unknown, fallbackEventType?: string): TrustTier {
  if (
    value === "OBSERVED" ||
    value === "OBSERVED_HARDENED" ||
    value === "ATTESTED" ||
    value === "SELF_REPORTED"
  ) {
    return value;
  }
  if (fallbackEventType === "review") {
    return "SELF_REPORTED";
  }
  return "OBSERVED";
}

function toSeverityNumber(severity: string): number {
  const normalized = severity.trim().toUpperCase();
  if (normalized === "CRITICAL") return 21;
  if (normalized === "HIGH" || normalized === "ERROR") return 17;
  if (normalized === "WARN" || normalized === "WARNING" || normalized === "MEDIUM") return 13;
  if (normalized === "LOW" || normalized === "DEBUG") return 5;
  return 9;
}

function toInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseMeta(metaJson: string): Record<string, unknown> {
  try {
    return JSON.parse(metaJson) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function getString(meta: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const raw = meta[key];
    if (typeof raw === "string" && raw.trim().length > 0) {
      return raw.trim();
    }
  }
  return undefined;
}

function enabledForSignal(target: ObservabilityExporterTarget, signal: ObservabilitySignal): boolean {
  if (!target.enabledSignals) return true;
  const value = target.enabledSignals[signal];
  if (value === undefined) return true;
  return value;
}

function toResourceAttributes(config: ObservabilityOTELConfig): OTelAttribute[] {
  const base: OTelAttribute[] = [
    { key: "service.name", value: { stringValue: config.serviceName } },
    { key: "service.version", value: { stringValue: config.serviceVersion } },
    { key: "telemetry.sdk.name", value: { stringValue: "amc-observability-exporter" } },
    { key: "telemetry.sdk.language", value: { stringValue: "typescript" } }
  ];
  if (!config.resourceAttributes) return base;
  for (const [key, value] of Object.entries(config.resourceAttributes)) {
    const converted = attr(key, value);
    if (converted) {
      base.push(converted);
    }
  }
  return base;
}

function otlpEndpoint(target: ObservabilityExporterTarget, signal: ObservabilitySignal): string {
  const specific = target.signalEndpoints?.[signal];
  if (specific) return specific;
  const trimmed = target.endpoint.replace(/\/+$/, "");
  const normalizedSignal = signal === "traces" ? "traces" : signal === "metrics" ? "metrics" : "logs";
  if (/\/v1\/(traces|metrics|logs)$/i.test(trimmed)) {
    return trimmed.replace(/\/v1\/(traces|metrics|logs)$/i, `/v1/${normalizedSignal}`);
  }
  return `${trimmed}/v1/${normalizedSignal}`;
}

function zipkinEndpoint(base: string): string {
  const trimmed = base.replace(/\/+$/, "");
  if (trimmed.endsWith("/api/v2/spans")) {
    return trimmed;
  }
  return `${trimmed}/api/v2/spans`;
}

function signalKindFromEvidence(eventType: string): number {
  if (eventType === "llm_request" || eventType === "llm_response") return 3;
  if (eventType === "tool_action") return 4;
  if (eventType === "tool_result") return 5;
  return 1;
}

function sortByTs<T extends { ts: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.ts - b.ts);
}

export class ObservabilityOTELExporter {
  private readonly config: ObservabilityOTELConfig;
  private spans: BufferedSpan[] = [];
  private metrics: BufferedMetric[] = [];
  private logs: BufferedLog[] = [];
  private streams = new Map<string, AggregatedStream>();
  private readonly itemScopes = new WeakMap<object, CapturedWorkspace>();
  private inFlightFlush: Promise<ObservabilityFlushResult> | null = null;
  private readonly flushes = new Set<Promise<ObservabilityFlushResult>>();

  constructor(config: Partial<ObservabilityOTELConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      targets: config.targets ?? DEFAULT_CONFIG.targets
    };
  }

  isEnabled(): boolean {
    return this.config.enabled && this.config.targets.length > 0;
  }

  /** Why nothing is exported although export was asked for; null when enabled or never asked. */
  disabledReason(): string | null {
    return this.config.disabledReason ?? null;
  }

  recordEvidenceEvent(event: EvidenceEvent): void {
    const scope = { workspace: getWorkspaceScope(), run: AsyncLocalStorage.snapshot() };
    const meta = parseMeta(event.meta_json);
    if (event.event_type === "audit" && meta.auditType === "TELEMETRY_DROPPED"
      && event.session_id.startsWith("telemetry-dropped-")) return;
    const agentId = getString(meta, ["agentId", "agent_id"]) ?? "unknown";
    const trustTier = toTrustTier(meta.trustTier, event.event_type);
    const severity = getString(meta, ["severity"]) ?? "INFO";
    const questionId = getString(meta, ["questionId", "question_id"]);
    const dimension = getString(meta, ["dimension", "dimensionId", "dimension_id"]);

    const attributes: OTelAttribute[] = [];
    const candidates = [
      attr("amc.evidence.id", event.id),
      attr("amc.agent.id", agentId),
      attr("amc.session.id", event.session_id),
      attr("amc.runtime", event.runtime),
      attr("amc.event.type", event.event_type),
      attr("amc.trust.tier", trustTier),
      attr("amc.severity", severity),
      attr("amc.question.id", questionId),
      attr("amc.dimension", dimension),
      attr("amc.payload.sha256", event.payload_sha256),
      attr("amc.event.hash", event.event_hash),
      attr("amc.prev_event.hash", event.prev_event_hash)
    ];
    for (const candidate of candidates) {
      if (candidate) attributes.push(candidate);
    }

    this.spans.push(this.captureItem({
      traceId: generateTraceId(event.session_id),
      spanId: generateSpanId(event.id),
      name: `amc.evidence.${event.event_type}`,
      kind: signalKindFromEvidence(event.event_type),
      startTimeUnixNano: msToNanos(event.ts),
      endTimeUnixNano: msToNanos(event.ts + 1),
      attributes,
      status: { code: 1 },
      events: []
    }, scope));

    this.enforceBufferLimits();
  }

  /** A finished span from the native session folder (SH-OBS-01). */
  recordSpan(span: OTelSpan): void {
    this.spans.push(this.captureItem({ ...span }, { workspace: getWorkspaceScope(), run: AsyncLocalStorage.snapshot() }));
    this.enforceBufferLimits();
  }

  /** Aggregate one increment or observation into its delta stream; one data point per stream per flush. */
  recordMetricPoint(point: OTelMetricPoint): void {
    const scope = { workspace: getWorkspaceScope(), run: AsyncLocalStorage.snapshot() };
    // One stream per workspace scope as well: a point recorded for workspace B must never merge into A's stream and leave under A's residency check.
    const key = canonicalize({ k: point.kind, n: point.name, u: point.unit, a: point.attributes, w: scope.workspace ?? null });
    let stream = this.streams.get(key);
    if (!stream) {
      if (this.streams.size >= this.config.maxBufferSize) { noteTelemetryDropped(1); return; }
      stream = { kind: point.kind, name: point.name, unit: point.unit, attributes: [...point.attributes], startTs: Date.now(), count: 0, sum: 0,
        min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY, bucketCounts: new Array<number>(DURATION_BOUNDS.length + 1).fill(0) };
      this.captureItem(stream, scope);
      this.streams.set(key, stream);
    }
    stream.count += 1;
    stream.sum += point.value;
    stream.min = Math.min(stream.min, point.value);
    stream.max = Math.max(stream.max, point.value);
    if (point.kind === "histogram") {
      const at = DURATION_BOUNDS.findIndex((bound) => point.value <= bound);
      const slot = at === -1 ? DURATION_BOUNDS.length : at;
      stream.bucketCounts[slot] = (stream.bucketCounts[slot] ?? 0) + 1;
    }
  }

  recordScoreComputation(metric: ScoreComputationMetric): void {
    const scope = { workspace: getWorkspaceScope(), run: AsyncLocalStorage.snapshot() };
    const ts = metric.ts ?? Date.now();
    const percentage = metric.percentage ?? (
      typeof metric.maxScore === "number" && metric.maxScore > 0
        ? (metric.score / metric.maxScore) * 100
        : metric.score
    );
    const commonAttrs: OTelAttribute[] = [];
    const shared = [
      attr("amc.agent.id", metric.agentId),
      attr("amc.run.id", metric.runId),
      attr("amc.session.id", metric.sessionId),
      attr("amc.question.id", metric.questionId),
      attr("amc.dimension", metric.dimension),
      attr("amc.metric.source", metric.source ?? "score_router")
    ];
    for (const candidate of shared) {
      if (candidate) commonAttrs.push(candidate);
    }

    this.metrics.push(this.captureItem({ metricName: "amc.score.value", unit: "score", ts, value: metric.score, attributes: [...commonAttrs] }, scope));
    this.metrics.push(this.captureItem({ metricName: "amc.score.percentage", unit: "percent", ts, value: percentage, attributes: [...commonAttrs] }, scope));
    if (typeof metric.level === "number") {
      this.metrics.push(this.captureItem({ metricName: "amc.score.level", unit: "level", ts, value: metric.level, attributes: [...commonAttrs] }, scope));
    }

    this.enforceBufferLimits();
  }

  recordIncident(incident: IncidentLogInput): void {
    const scope = { workspace: getWorkspaceScope(), run: AsyncLocalStorage.snapshot() };
    const ts = incident.ts ?? Date.now();
    const severityText = incident.severity.toUpperCase();
    const severityNumber = toSeverityNumber(severityText);
    const body = incident.description
      ? `${incident.title}: ${incident.description}`
      : incident.title;
    const attributes: OTelAttribute[] = [];
    const values = [
      attr("amc.incident.id", incident.incidentId),
      attr("amc.agent.id", incident.agentId),
      attr("amc.incident.state", incident.state),
      attr("amc.incident.severity", severityText),
      attr("amc.incident.trigger_type", incident.triggerType),
      attr("amc.incident.trigger_id", incident.triggerId),
      attr("amc.incident.title", incident.title)
    ];
    for (const candidate of values) {
      if (candidate) attributes.push(candidate);
    }
    this.logs.push(this.captureItem({ ts, severityText, severityNumber, body, attributes }, scope));
    this.enforceBufferLimits();
  }

  getBufferStats(): { traces: number; metrics: number; logs: number } {
    return {
      traces: this.spans.length,
      metrics: this.metrics.length + this.streams.size,
      logs: this.logs.length
    };
  }

  previewRequests(): Array<{
    targetKind: ObservabilityExporterKind;
    signal: ObservabilitySignal;
    endpoint: string;
    payload: unknown;
  }> {
    return this.buildDispatchRequests().map((request) => ({
      targetKind: request.targetKind,
      signal: request.signal,
      endpoint: request.endpoint,
      payload: request.payload
    }));
  }

  /**
   * A flush that finds one in flight waits for it within its own budget, then sends what was buffered since under its
   * own options; it never returns the earlier promise as if it covered the newer items (an exit flush after the
   * `session/close` flush would otherwise inherit that flush's timeout and leave later rows behind, uncounted).
   */
  async flush(options: Partial<TelemetryDispatchOptions> = {}): Promise<ObservabilityFlushResult> {
    const previous = this.inFlightFlush;
    const run = (async () => {
      if (previous === null) return this.flushInternal(options);
      const budgetMs = options.timeoutMs ?? toInt(process.env.AMC_OTEL_FLUSH_TIMEOUT_MS, DEFAULT_FLUSH_TIMEOUT_MS);
      const started = Date.now();
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([previous.catch(() => null), new Promise<void>((done) => { timer = setTimeout(done, budgetMs); timer.unref(); })]);
      clearTimeout(timer);
      return this.flushInternal(options.timeoutMs === undefined ? options : { ...options, timeoutMs: Math.max(1, budgetMs - (Date.now() - started)) });
    })();
    this.inFlightFlush = run;
    this.flushes.add(run);
    try {
      return await run;
    } finally {
      this.flushes.delete(run);
      if (this.inFlightFlush === run) {
        this.inFlightFlush = null;
      }
    }
  }

  /** Resolves once every flush started so far has settled; each is bounded by its own dispatch timeout and retries. */
  async idle(): Promise<void> {
    while (this.flushes.size > 0) await Promise.allSettled([...this.flushes]);
  }

  private async flushInternal(overrides: Partial<TelemetryDispatchOptions>): Promise<ObservabilityFlushResult> {
    const exported: SignalCounts = { traces: 0, metrics: 0, logs: 0 };
    if (!this.config.enabled || this.config.targets.length === 0) {
      this.clearBuffers();
      return { ts: Date.now(), exported, requests: [] };
    }

    const requests: PreparedDispatchRequest[] = [];
    for (const batch of this.groupBuffers()) {
      const built = this.buildDispatchRequests(batch);
      // Aggregated streams travel only in an OTLP metrics request; a Zipkin-only configuration drops them, counted.
      if (batch.streams.length > 0 && !built.some((request) => request.signal === "metrics" && request.targetKind !== "zipkin")) noteTelemetryDropped(batch.streams.length);
      for (const request of built) {
        const body = JSON.stringify(request.payload);
        if (body === undefined) throw new Error("telemetry payload is not serializable");
        requests.push({
          targetKind: request.targetKind,
          signal: request.signal,
          endpoint: request.endpoint,
          headers: Object.fromEntries(Object.entries(request.headers).map(([key, value]) => [key, String(value)])),
          body,
          workspace: batch.scope.workspace,
          run: batch.scope.run,
          counts: request.counts
        });
      }
    }
    const options = {
      timeoutMs: overrides.timeoutMs ?? toInt(process.env.AMC_OTEL_FLUSH_TIMEOUT_MS, DEFAULT_FLUSH_TIMEOUT_MS),
      maxRetries: overrides.maxRetries ?? toInt(process.env.AMC_OTEL_FLUSH_MAX_RETRIES, DEFAULT_FLUSH_MAX_RETRIES),
      retryBaseDelayMs: overrides.retryBaseDelayMs ?? toInt(process.env.AMC_OTEL_FLUSH_RETRY_BASE_DELAY_MS, DEFAULT_FLUSH_RETRY_BASE_DELAY_MS)
    };
    // A preparation failure leaves the buffered items and their captured scopes intact.
    this.clearBuffers();
    await Promise.resolve();

    // Targets and signals are independent: dispatched together so an exit flush is bounded by one timeout, not their sum.
    const results = await Promise.all(requests.map((request) => dispatchTelemetryRequest(request, options).catch((error: unknown) => ({
      ok: false, error: error instanceof Error ? error.message : String(error)
    }))));
    const out: ObservabilityDispatchResult[] = [];
    const countedSignals = new Map<string | undefined, Set<ObservabilitySignal>>();
    let dropped = 0;
    requests.forEach((request, index) => {
      const result = results[index]!;
      out.push({ targetKind: request.targetKind, signal: request.signal, endpoint: request.endpoint, ...result });
      if (result.ok) {
        const counted = countedSignals.get(request.workspace) ?? new Set<ObservabilitySignal>();
        for (const signal of ["traces", "metrics", "logs"] as const) {
          if (request.counts[signal] > 0 && !counted.has(signal)) {
            exported[signal] += request.counts[signal];
            counted.add(signal);
          }
        }
        countedSignals.set(request.workspace, counted);
      } else {
        dropped += request.counts.traces + request.counts.metrics + request.counts.logs;
      }
    });
    if (dropped > 0) noteTelemetryDropped(dropped);

    return {
      ts: Date.now(),
      exported,
      requests: out
    };
  }

  private clearBuffers(): void {
    this.spans = [];
    this.metrics = [];
    this.logs = [];
    this.streams = new Map();
  }

  private enforceBufferLimits(): void {
    const trim = <T>(items: T[]): T[] => {
      const retained = items.length > this.config.maxBufferSize ? items.slice(items.length - this.config.maxBufferSize) : items;
      noteTelemetryDropped(items.length - retained.length);
      return retained;
    };
    this.spans = trim(this.spans);
    this.metrics = trim(this.metrics);
    this.logs = trim(this.logs);
  }

  private captureItem<T extends object>(item: T, scope: CapturedWorkspace): T {
    this.itemScopes.set(item, scope);
    return item;
  }

  private groupBuffers(): ScopedBufferedBatch[] {
    const groups = new Map<string | undefined, ScopedBufferedBatch>();
    const groupFor = (item: object): ScopedBufferedBatch => {
      const scope = this.itemScopes.get(item);
      if (!scope) throw new Error("telemetry buffer scope is missing");
      let batch = groups.get(scope.workspace);
      if (!batch) {
        batch = { scope, spans: [], metrics: [], logs: [], streams: [] };
        groups.set(scope.workspace, batch);
      }
      return batch;
    };
    for (const span of this.spans) groupFor(span).spans.push(span);
    for (const metric of this.metrics) groupFor(metric).metrics.push(metric);
    for (const log of this.logs) groupFor(log).logs.push(log);
    for (const stream of this.streams.values()) groupFor(stream).streams.push(stream);
    return [...groups.values()];
  }

  private buildDispatchRequests(batch: BufferedBatch = { spans: this.spans, metrics: this.metrics, logs: this.logs, streams: [...this.streams.values()] }): DispatchRequest[] {
    if (this.config.targets.length === 0) {
      return [];
    }

    const resourceAttributes = toResourceAttributes(this.config);
    const requests: DispatchRequest[] = [];
    const { spans, metrics, logs, streams } = batch;
    const metricCount = metrics.length + streams.length;
    const scope = { name: "amc.observability", version: this.config.serviceVersion };

    for (const target of this.config.targets) {
      const headers = {
        "content-type": "application/json",
        ...(target.headers ?? {})
      };

      if (target.kind === "zipkin") {
        // Zipkin carries per-row metrics and logs as pseudo-spans; the aggregated streams have no Zipkin form and are not counted as exported here.
        const payload = toZipkinSpans(batch, this.config.serviceName);
        if (payload.length === 0) continue;
        requests.push({ targetKind: target.kind, signal: "traces", endpoint: zipkinEndpoint(target.endpoint), headers, payload,
          counts: { traces: spans.length, metrics: metrics.length, logs: logs.length } });
        continue;
      }

      if (spans.length > 0 && enabledForSignal(target, "traces")) {
        requests.push({ targetKind: target.kind, signal: "traces", endpoint: otlpEndpoint(target, "traces"), headers,
          payload: { resourceSpans: [{ resource: { attributes: resourceAttributes }, scopeSpans: [{ scope, spans }] }] },
          counts: { traces: spans.length, metrics: 0, logs: 0 } });
      }

      if (metricCount > 0 && enabledForSignal(target, "metrics")) {
        requests.push({ targetKind: target.kind, signal: "metrics", endpoint: otlpEndpoint(target, "metrics"), headers,
          payload: this.toOTLPMetricsPayload(resourceAttributes, metrics, streams), counts: { traces: 0, metrics: metricCount, logs: 0 } });
      }

      if (logs.length > 0 && enabledForSignal(target, "logs")) {
        requests.push({ targetKind: target.kind, signal: "logs", endpoint: otlpEndpoint(target, "logs"), headers,
          payload: { resourceLogs: [{ resource: { attributes: resourceAttributes }, scopeLogs: [{ scope, logRecords: logs.map((entry) => ({
            timeUnixNano: msToNanos(entry.ts), severityNumber: entry.severityNumber, severityText: entry.severityText,
            body: { stringValue: entry.body }, attributes: entry.attributes })) }] }] },
          counts: { traces: 0, metrics: 0, logs: logs.length } });
      }
    }

    return requests;
  }

  private toOTLPMetricsPayload(resourceAttributes: OTelAttribute[], entries: BufferedMetric[], streams: readonly AggregatedStream[]): unknown {
    const byName = new Map<string, BufferedMetric[]>();
    for (const metric of entries) {
      const key = `${metric.metricName}::${metric.unit}`;
      const current = byName.get(key) ?? [];
      current.push(metric);
      byName.set(key, current);
    }

    const metrics: unknown[] = [...byName.entries()].map(([key, points]) => {
      const [metricName, unit] = key.split("::");
      return {
        name: metricName,
        unit,
        gauge: {
          dataPoints: sortByTs(points).map((point) => ({
            timeUnixNano: msToNanos(point.ts),
            asDouble: point.value,
            attributes: point.attributes
          }))
        }
      };
    });
    const now = Date.now();
    const byStream = new Map<string, AggregatedStream[]>();
    for (const stream of streams) {
      const key = `${stream.kind}::${stream.name}::${stream.unit}`;
      byStream.set(key, [...(byStream.get(key) ?? []), stream]);
    }
    for (const [, group] of byStream) {
      const first = group[0]!;
      const points = group.map((stream) => ({ startTimeUnixNano: msToNanos(stream.startTs), timeUnixNano: msToNanos(Math.max(now, stream.startTs)), attributes: stream.attributes,
        ...(stream.kind === "sum" ? { asDouble: stream.sum }
          : { count: stream.count, sum: stream.sum, min: stream.min, max: stream.max, bucketCounts: stream.bucketCounts, explicitBounds: DURATION_BOUNDS }) }));
      metrics.push({ name: first.name, unit: first.unit, ...(first.kind === "sum"
        ? { sum: { aggregationTemporality: AGGREGATION_TEMPORALITY_DELTA, isMonotonic: true, dataPoints: points } }
        : { histogram: { aggregationTemporality: AGGREGATION_TEMPORALITY_DELTA, dataPoints: points } }) });
    }

    return {
      resourceMetrics: [
        {
          resource: { attributes: resourceAttributes },
          scopeMetrics: [
            {
              scope: { name: "amc.observability", version: this.config.serviceVersion },
              metrics
            }
          ]
        }
      ]
    };
  }
}

/** The exporter the environment asks for; `OTEL_*` variables are honoured (src/observability/otelEnvConfig.ts). */
export function createObservabilityOTELExporterFromEnv(): ObservabilityOTELExporter {
  const resolved = resolveOtelEnvConfig();
  return new ObservabilityOTELExporter({ ...resolved.config, disabledReason: resolved.disabledReason });
}

let sharedExporter: ObservabilityOTELExporter | null = null;
let sharedFolder: NativeSpanFolder | null = null;
const SHARED_FLUSH_THRESHOLD = 128;
const DEFAULT_EXIT_FLUSH_BUDGET_MS = 2_000;

export function getSharedObservabilityExporter(): ObservabilityOTELExporter {
  if (!sharedExporter) {
    sharedExporter = createObservabilityOTELExporterFromEnv();
  }
  return sharedExporter;
}

export function resetSharedObservabilityExporterForTests(): void {
  sharedExporter = null;
  sharedFolder = null;
}

/** Hand a folder's output to the exporter. */
export function recordFoldOutput(exporter: ObservabilityOTELExporter, output: FoldOutput): void {
  for (const span of output.spans) exporter.recordSpan(span);
  for (const point of output.metrics) exporter.recordMetricPoint(point);
}

export function queueEvidenceEventSpan(event: EvidenceEvent, workspace?: string): void {
  try {
    const exporter = getSharedObservabilityExporter();
    const record = (): void => {
      // Native session rows fold into GenAI spans; the folder stays inert while export is off (nothing to drop).
      if (exporter.isEnabled()) {
        sharedFolder ??= new NativeSpanFolder();
        const folded = sharedFolder.ingest(event);
        if (folded !== null) {
          recordFoldOutput(exporter, folded);
          if (event.event_type === "session/close" || event.event_type === "session/release") {
            void exporter.flush().catch(() => { /* Preparation failures retain the batch for a later flush. */ });
          }
          return;
        }
      }
      exporter.recordEvidenceEvent(event);
    };
    workspace !== undefined ? withWorkspaceScope(workspace, record) : record();
    maybeFlushSharedExporter(exporter);
  } catch {
    noteTelemetryDropped(1); // Observability must never block core workflows; the drop is counted.
  }
}

/**
 * Flush before a short-lived process exits, within a wall-clock budget for what this flush sends. Spans still open are
 * emitted unterminated; what cannot be sent in time is counted as dropped, and the CLI's exit hook writes that count as
 * a TELEMETRY_DROPPED row once every flush in flight has settled.
 */
export async function flushSharedObservabilityExporter(options: { budgetMs?: number } = {}): Promise<ObservabilityFlushResult | null> {
  const exporter = sharedExporter;
  if (!exporter || !exporter.isEnabled()) return null;
  const budgetMs = options.budgetMs ?? DEFAULT_EXIT_FLUSH_BUDGET_MS;
  if (sharedFolder) recordFoldOutput(exporter, sharedFolder.drain());
  const result = await exporter.flush({ timeoutMs: budgetMs, maxRetries: 0 });
  // A flush still in flight past the budget (a session/close flush retrying a down collector) keeps the process alive
  // until it settles anyway, through its live request and retry timers: waiting here counts what it drops before exit.
  await exporter.idle();
  return result;
}

export function queueScoreComputationMetric(metric: ScoreComputationMetric, workspace?: string): void {
  try {
    const exporter = getSharedObservabilityExporter();
    workspace !== undefined ? withWorkspaceScope(workspace, () => exporter.recordScoreComputation(metric)) : exporter.recordScoreComputation(metric);
    maybeFlushSharedExporter(exporter);
  } catch {
    noteTelemetryDropped(1); // Observability must never block core workflows; the drop is counted.
  }
}

export function queueIncidentLog(input: Incident | IncidentLogInput): void {
  const normalized: IncidentLogInput = "createdTs" in input
    ? { incidentId: input.incidentId, agentId: input.agentId, severity: input.severity, state: input.state, title: input.title,
      description: input.description, triggerType: input.triggerType, triggerId: input.triggerId, ts: input.updatedTs || input.createdTs }
    : input;
  try {
    const exporter = getSharedObservabilityExporter();
    exporter.recordIncident(normalized);
    maybeFlushSharedExporter(exporter);
  } catch {
    noteTelemetryDropped(1); // Observability must never block core workflows; the drop is counted.
  }
}

function maybeFlushSharedExporter(exporter: ObservabilityOTELExporter): void {
  const stats = exporter.getBufferStats();
  const buffered = stats.traces + stats.metrics + stats.logs;
  if (buffered < SHARED_FLUSH_THRESHOLD) return;
  void exporter.flush().catch(() => { /* Preparation failures retain the batch for a later flush. */ });
}

export function classifyTrustTierRank(tier: TrustTier): number {
  const index = TRUST_TIER_ORDER.indexOf(tier);
  return index >= 0 ? index + 1 : 1;
}
