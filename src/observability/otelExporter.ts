import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { getWorkspaceScope } from "../enforce/evidenceEmitter.js";
import type { Incident } from "../incidents/incidentTypes.js";
import type { EvidenceEvent, TrustTier } from "../types.js";
import { dispatchTelemetryRequest, type PreparedTelemetryRequest } from "./otelExportTransport.js";
import { noteTelemetryDropped } from "./telemetryDrops.js";

export type ObservabilitySignal = "traces" | "metrics" | "logs";
export type ObservabilityExporterKind = "otlp" | "jaeger" | "zipkin";

export interface ObservabilityExporterTarget {
  kind: ObservabilityExporterKind;
  endpoint: string;
  headers?: Record<string, string>;
  enabledSignals?: Partial<Record<ObservabilitySignal, boolean>>;
}

export interface ObservabilityOTELConfig {
  enabled: boolean;
  serviceName: string;
  serviceVersion: string;
  resourceAttributes?: Record<string, string>;
  targets: ObservabilityExporterTarget[];
  maxBufferSize: number;
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

interface OTelAnyValue {
  stringValue?: string;
  intValue?: number;
  doubleValue?: number;
  boolValue?: boolean;
}

interface OTelAttribute {
  key: string;
  value: OTelAnyValue;
}

interface BufferedSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  kind: number;
  attributes: OTelAttribute[];
  status: { code: number; message?: string };
  events: Array<{
    name: string;
    timeUnixNano: string;
    attributes: OTelAttribute[];
  }>;
}

interface BufferedMetric {
  metricName: string;
  unit: string;
  ts: number;
  value: number;
  attributes: OTelAttribute[];
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

const TRUST_TIER_ORDER: TrustTier[] = ["SELF_REPORTED", "ATTESTED", "OBSERVED", "OBSERVED_HARDENED"];

function attr(key: string, value: string | number | boolean | undefined | null): OTelAttribute | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === "string") {
    return { key, value: { stringValue: value } };
  }
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return { key, value: { intValue: value } };
    }
    return { key, value: { doubleValue: value } };
  }
  return { key, value: { boolValue: value } };
}

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

function msToNanos(ts: number): string {
  return String(BigInt(ts) * BigInt(1_000_000));
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

function toBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
  return fallback;
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

function otlpEndpoint(base: string, signal: ObservabilitySignal): string {
  const trimmed = base.replace(/\/+$/, "");
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
  private readonly itemScopes = new WeakMap<object, CapturedWorkspace>();
  private inFlightFlush: Promise<ObservabilityFlushResult> | null = null;

  constructor(config: Partial<ObservabilityOTELConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      targets: config.targets ?? DEFAULT_CONFIG.targets
    };
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

  recordScoreComputation(metric: ScoreComputationMetric): void {
    const scope = { workspace: getWorkspaceScope(), run: AsyncLocalStorage.snapshot() };
    const ts = metric.ts ?? Date.now();
    msToNanos(ts);
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

    this.metrics.push(this.captureItem({
      metricName: "amc.score.value",
      unit: "score",
      ts,
      value: metric.score,
      attributes: [...commonAttrs]
    }, scope));
    this.metrics.push(this.captureItem({
      metricName: "amc.score.percentage",
      unit: "percent",
      ts,
      value: percentage,
      attributes: [...commonAttrs]
    }, scope));
    if (typeof metric.level === "number") {
      this.metrics.push(this.captureItem({
        metricName: "amc.score.level",
        unit: "level",
        ts,
        value: metric.level,
        attributes: [...commonAttrs]
      }, scope));
    }

    this.enforceBufferLimits();
  }

  recordIncident(incident: IncidentLogInput): void {
    const scope = { workspace: getWorkspaceScope(), run: AsyncLocalStorage.snapshot() };
    const ts = incident.ts ?? Date.now();
    msToNanos(ts);
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
    this.logs.push(this.captureItem({
      ts,
      severityText,
      severityNumber,
      body,
      attributes
    }, scope));
    this.enforceBufferLimits();
  }

  getBufferStats(): { traces: number; metrics: number; logs: number } {
    return {
      traces: this.spans.length,
      metrics: this.metrics.length,
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

  async flush(): Promise<ObservabilityFlushResult> {
    if (this.inFlightFlush) {
      return this.inFlightFlush;
    }
    const run = this.flushInternal();
    this.inFlightFlush = run;
    try {
      return await run;
    } finally {
      if (this.inFlightFlush === run) {
        this.inFlightFlush = null;
      }
    }
  }

  private async flushInternal(): Promise<ObservabilityFlushResult> {
    const exported: SignalCounts = { traces: 0, metrics: 0, logs: 0 };
    if (!this.config.enabled || this.config.targets.length === 0) {
      this.spans = [];
      this.metrics = [];
      this.logs = [];
      return { ts: Date.now(), exported, requests: [] };
    }

    const requests: PreparedDispatchRequest[] = [];
    for (const batch of this.groupBuffers()) {
      for (const request of this.buildDispatchRequests(batch)) {
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
      timeoutMs: toInt(process.env.AMC_OTEL_FLUSH_TIMEOUT_MS, DEFAULT_FLUSH_TIMEOUT_MS),
      maxRetries: toInt(process.env.AMC_OTEL_FLUSH_MAX_RETRIES, DEFAULT_FLUSH_MAX_RETRIES),
      retryBaseDelayMs: toInt(process.env.AMC_OTEL_FLUSH_RETRY_BASE_DELAY_MS, DEFAULT_FLUSH_RETRY_BASE_DELAY_MS)
    };
    // A preparation failure leaves the buffered items and their captured scopes intact.
    this.spans = [];
    this.metrics = [];
    this.logs = [];
    await Promise.resolve();

    const out: ObservabilityDispatchResult[] = [];
    const countedSignals = new Map<string | undefined, Set<ObservabilitySignal>>();
    let dropped = 0;
    for (const request of requests) {
      const result = await dispatchTelemetryRequest(request, options).catch((error: unknown) => ({
        ok: false, error: error instanceof Error ? error.message : String(error)
      }));
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
    }
    if (dropped > 0) noteTelemetryDropped(dropped);

    return {
      ts: Date.now(),
      exported,
      requests: out
    };
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
        batch = { scope, spans: [], metrics: [], logs: [] };
        groups.set(scope.workspace, batch);
      }
      return batch;
    };
    for (const span of this.spans) groupFor(span).spans.push(span);
    for (const metric of this.metrics) groupFor(metric).metrics.push(metric);
    for (const log of this.logs) groupFor(log).logs.push(log);
    return [...groups.values()];
  }

  private buildDispatchRequests(batch: BufferedBatch = { spans: this.spans, metrics: this.metrics, logs: this.logs }): DispatchRequest[] {
    if (this.config.targets.length === 0) {
      return [];
    }

    const resourceAttributes = toResourceAttributes(this.config);
    const requests: DispatchRequest[] = [];
    const { spans, metrics, logs } = batch;

    for (const target of this.config.targets) {
      const headers = {
        "content-type": "application/json",
        ...(target.headers ?? {})
      };

      if (target.kind === "zipkin") {
        const payload = this.toZipkinSpans(batch);
        if (payload.length === 0) continue;
        requests.push({
          targetKind: target.kind,
          signal: "traces",
          endpoint: zipkinEndpoint(target.endpoint),
          headers,
          payload,
          counts: { traces: spans.length, metrics: metrics.length, logs: logs.length }
        });
        continue;
      }

      if (spans.length > 0 && enabledForSignal(target, "traces")) {
        requests.push({
          targetKind: target.kind,
          signal: "traces",
          endpoint: otlpEndpoint(target.endpoint, "traces"),
          headers,
          payload: {
            resourceSpans: [
              {
                resource: { attributes: resourceAttributes },
                scopeSpans: [
                  {
                    scope: { name: "amc.observability", version: this.config.serviceVersion },
                    spans
                  }
                ]
              }
            ]
          },
          counts: { traces: spans.length, metrics: 0, logs: 0 }
        });
      }

      if (metrics.length > 0 && enabledForSignal(target, "metrics")) {
        requests.push({
          targetKind: target.kind,
          signal: "metrics",
          endpoint: otlpEndpoint(target.endpoint, "metrics"),
          headers,
          payload: this.toOTLPMetricsPayload(resourceAttributes, metrics),
          counts: { traces: 0, metrics: metrics.length, logs: 0 }
        });
      }

      if (logs.length > 0 && enabledForSignal(target, "logs")) {
        requests.push({
          targetKind: target.kind,
          signal: "logs",
          endpoint: otlpEndpoint(target.endpoint, "logs"),
          headers,
          payload: {
            resourceLogs: [
              {
                resource: { attributes: resourceAttributes },
                scopeLogs: [
                  {
                    scope: { name: "amc.observability", version: this.config.serviceVersion },
                    logRecords: logs.map((entry) => ({
                      timeUnixNano: msToNanos(entry.ts),
                      severityNumber: entry.severityNumber,
                      severityText: entry.severityText,
                      body: { stringValue: entry.body },
                      attributes: entry.attributes
                    }))
                  }
                ]
              }
            ]
          },
          counts: { traces: 0, metrics: 0, logs: logs.length }
        });
      }
    }

    return requests;
  }

  private toOTLPMetricsPayload(resourceAttributes: OTelAttribute[], entries: BufferedMetric[]): unknown {
    const byName = new Map<string, BufferedMetric[]>();
    for (const metric of entries) {
      const key = `${metric.metricName}::${metric.unit}`;
      const current = byName.get(key) ?? [];
      current.push(metric);
      byName.set(key, current);
    }

    const metrics = [...byName.entries()].map(([key, points]) => {
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

  private toZipkinSpans(batch: BufferedBatch): Array<Record<string, unknown>> {
    const localEndpoint = { serviceName: this.config.serviceName };
    const spans = batch.spans.map((span) => {
      const tags: Record<string, string> = {};
      for (const attribute of span.attributes) {
        const value = attribute.value.stringValue
          ?? attribute.value.doubleValue
          ?? attribute.value.intValue
          ?? attribute.value.boolValue;
        tags[attribute.key] = value === undefined ? "" : String(value);
      }
      return {
        traceId: span.traceId,
        id: span.spanId,
        parentId: span.parentSpanId,
        name: span.name,
        timestamp: Math.floor(Number(span.startTimeUnixNano) / 1000),
        duration: Math.max(1, Math.floor((Number(span.endTimeUnixNano) - Number(span.startTimeUnixNano)) / 1000)),
        localEndpoint,
        tags
      };
    });

    for (const metric of batch.metrics) {
      const tags: Record<string, string> = {
        "amc.metric.name": metric.metricName,
        "amc.metric.unit": metric.unit,
        "amc.metric.value": String(metric.value)
      };
      for (const attribute of metric.attributes) {
        const value = attribute.value.stringValue
          ?? attribute.value.doubleValue
          ?? attribute.value.intValue
          ?? attribute.value.boolValue;
        tags[attribute.key] = value === undefined ? "" : String(value);
      }
      spans.push({
        traceId: generateTraceId(metric.metricName),
        id: generateSpanId(`${metric.metricName}-${metric.ts}`),
        parentId: undefined,
        name: `amc.metric.${metric.metricName}`,
        timestamp: metric.ts * 1000,
        duration: 1,
        localEndpoint,
        tags
      });
    }

    for (const entry of batch.logs) {
      const tags: Record<string, string> = {
        "amc.log.severity": entry.severityText,
        "amc.log.message": entry.body
      };
      for (const attribute of entry.attributes) {
        const value = attribute.value.stringValue
          ?? attribute.value.doubleValue
          ?? attribute.value.intValue
          ?? attribute.value.boolValue;
        tags[attribute.key] = value === undefined ? "" : String(value);
      }
      spans.push({
        traceId: generateTraceId(entry.body),
        id: generateSpanId(`${entry.ts}`),
        parentId: undefined,
        name: "amc.incident.log",
        timestamp: entry.ts * 1000,
        duration: 1,
        localEndpoint,
        tags
      });
    }

    return spans;
  }
}

export function createObservabilityOTELExporterFromEnv(): ObservabilityOTELExporter {
  const enabled = toBoolean(process.env.AMC_OTEL_ENABLED, false);
  const serviceName = process.env.AMC_OTEL_SERVICE_NAME ?? DEFAULT_CONFIG.serviceName;
  const serviceVersion = process.env.AMC_OTEL_SERVICE_VERSION ?? DEFAULT_CONFIG.serviceVersion;
  const maxBufferSize = toInt(process.env.AMC_OTEL_MAX_BUFFER_SIZE, DEFAULT_CONFIG.maxBufferSize);
  const exportersRaw = process.env.AMC_OTEL_EXPORTERS ?? "";
  const requested = exportersRaw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);

  const targets: ObservabilityExporterTarget[] = [];
  if (requested.includes("otlp")) {
    targets.push({
      kind: "otlp",
      endpoint: process.env.AMC_OTEL_OTLP_ENDPOINT ?? "http://127.0.0.1:4318"
    });
  }
  if (requested.includes("jaeger")) {
    targets.push({
      kind: "jaeger",
      endpoint: process.env.AMC_OTEL_JAEGER_ENDPOINT ?? "http://127.0.0.1:4318"
    });
  }
  if (requested.includes("zipkin")) {
    targets.push({
      kind: "zipkin",
      endpoint: process.env.AMC_OTEL_ZIPKIN_ENDPOINT ?? "http://127.0.0.1:9411"
    });
  }

  return new ObservabilityOTELExporter({
    enabled,
    serviceName,
    serviceVersion,
    maxBufferSize,
    targets
  });
}

let sharedExporter: ObservabilityOTELExporter | null = null;
const SHARED_FLUSH_THRESHOLD = 128;

export function getSharedObservabilityExporter(): ObservabilityOTELExporter {
  if (!sharedExporter) {
    sharedExporter = createObservabilityOTELExporterFromEnv();
  }
  return sharedExporter;
}

export function resetSharedObservabilityExporterForTests(): void {
  sharedExporter = null;
}

export function queueEvidenceEventSpan(event: EvidenceEvent): void {
  try {
    const exporter = getSharedObservabilityExporter();
    exporter.recordEvidenceEvent(event);
    maybeFlushSharedExporter(exporter);
  } catch {
    noteTelemetryDropped(1); // Observability must never block core workflows; the drop is counted.
  }
}

export function queueScoreComputationMetric(metric: ScoreComputationMetric): void {
  try {
    const exporter = getSharedObservabilityExporter();
    exporter.recordScoreComputation(metric);
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
