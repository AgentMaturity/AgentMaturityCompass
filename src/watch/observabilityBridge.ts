/**
 * Observability Bridge — connects external observability platforms
 * (Langfuse, Helicone, OTLP/Jaeger, Datadog, custom webhooks)
 * to AMC's scoring and monitoring pipeline.
 *
 * This is what makes AMC a trust layer ON TOP of observability.
 * Observability shows you what your agent did. AMC tells you whether to trust it.
 */

import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { join } from "node:path";
import { sha256Hex } from "../utils/hash.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { openLedger } from "../ledger/ledger.js";
import type { MonitoringEvent } from "./continuousMonitor.js";

/* ── Trace types (normalized from any provider) ─────────────────── */

export type TraceStatus = "ok" | "error" | "timeout" | "cancelled" | "unknown";

export interface NormalizedSpan {
  spanId: string;
  traceId: string;
  parentSpanId?: string;
  name: string;
  kind: "llm_call" | "tool_call" | "agent_step" | "chain" | "retrieval" | "embedding" | "rerank" | "guard" | "unknown";
  startTimeMs: number;
  endTimeMs: number;
  durationMs: number;
  status: TraceStatus;
  model?: string;
  provider?: string;
  tokenUsage?: { prompt: number; completion: number; total: number };
  costUsd?: number;
  error?: { type: string; message: string; stack?: string };
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
  toolName?: string;
  toolSuccess?: boolean;
}

export interface NormalizedTrace {
  traceId: string;
  sessionId?: string;
  agentId?: string;
  name?: string;
  startTimeMs: number;
  endTimeMs: number;
  durationMs: number;
  status: TraceStatus;
  spans: NormalizedSpan[];
  totalTokens: number;
  totalCostUsd: number;
  modelBreakdown: Record<string, { tokens: number; costUsd: number; calls: number }>;
  errorCount: number;
  toolCallCount: number;
  llmCallCount: number;
  metadata?: Record<string, unknown>;
}

/* ── Provider adapter interface ──────────────────────────────────── */

export type ObservabilityProvider = "otlp" | "langfuse" | "helicone" | "datadog" | "webhook";

export interface ProviderConfig {
  provider: ObservabilityProvider;
  endpoint: string;
  apiKey?: string;
  projectId?: string;
  headers?: Record<string, string>;
  pollIntervalMs?: number;
  batchSize?: number;
}

export interface ProviderAdapter {
  readonly provider: ObservabilityProvider;
  connect(config: ProviderConfig): Promise<void>;
  disconnect(): Promise<void>;
  fetchTraces(since: number, limit: number): Promise<NormalizedTrace[]>;
  fetchTrace(traceId: string): Promise<NormalizedTrace | null>;
  isConnected(): boolean;
}

/* ── Model cost lookup (real pricing as of March 2026) ───────────── */

const MODEL_COSTS_PER_1K: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 0.0025, output: 0.01 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "gpt-4-turbo": { input: 0.01, output: 0.03 },
  "gpt-4": { input: 0.03, output: 0.06 },
  "gpt-3.5-turbo": { input: 0.0005, output: 0.0015 },
  "claude-opus-4": { input: 0.015, output: 0.075 },
  "claude-sonnet-4": { input: 0.003, output: 0.015 },
  "claude-haiku-3.5": { input: 0.0008, output: 0.004 },
  "claude-3-opus": { input: 0.015, output: 0.075 },
  "claude-3-sonnet": { input: 0.003, output: 0.015 },
  "claude-3-haiku": { input: 0.00025, output: 0.00125 },
  "gemini-2.0-flash": { input: 0.0001, output: 0.0004 },
  "gemini-1.5-pro": { input: 0.00125, output: 0.005 },
  "gemini-1.5-flash": { input: 0.000075, output: 0.0003 },
  "command-r-plus": { input: 0.003, output: 0.015 },
  "command-r": { input: 0.0005, output: 0.0015 },
  "llama-3.1-70b": { input: 0.00059, output: 0.00079 },
  "llama-3.1-8b": { input: 0.00006, output: 0.00006 },
  "mistral-large": { input: 0.002, output: 0.006 },
  "mixtral-8x7b": { input: 0.0006, output: 0.0006 },
};

export function estimateCost(model: string | undefined, tokens: { prompt: number; completion: number }): number {
  if (!model) return 0;
  const normalizedModel = model.toLowerCase().replace(/[-_]/g, "-");
  for (const [key, costs] of Object.entries(MODEL_COSTS_PER_1K)) {
    if (normalizedModel.includes(key)) {
      return (tokens.prompt / 1000) * costs.input + (tokens.completion / 1000) * costs.output;
    }
  }
  // Fallback: assume mid-range pricing
  return ((tokens.prompt + tokens.completion) / 1000) * 0.002;
}

/* ── OTLP Adapter (OpenTelemetry Protocol) ───────────────────────── */

export class OTLPAdapter implements ProviderAdapter {
  readonly provider: ObservabilityProvider = "otlp";
  private config: ProviderConfig | null = null;
  private connected = false;
  private cursor: number = 0;

  async connect(config: ProviderConfig): Promise<void> {
    this.config = config;
    // Verify endpoint is reachable
    await this.healthCheck();
    this.connected = true;
    this.cursor = Date.now() - 3600_000; // Start from 1 hour ago
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.config = null;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async fetchTraces(since: number, limit: number): Promise<NormalizedTrace[]> {
    if (!this.config) throw new Error("OTLP adapter not connected");
    const endpoint = `${this.config.endpoint}/v1/traces`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
      ...(this.config.headers ?? {}),
    };

    try {
      const body = await httpFetch(endpoint, "GET", headers, undefined, {
        start: new Date(since).toISOString(),
        limit: String(limit),
      });
      const data = JSON.parse(body) as { resourceSpans?: OTLPResourceSpan[] };
      return this.normalizeOTLP(data.resourceSpans ?? []);
    } catch {
      // Many OTLP backends use different query APIs — try Jaeger-style
      return this.fetchTracesJaegerCompat(since, limit);
    }
  }

  async fetchTrace(traceId: string): Promise<NormalizedTrace | null> {
    if (!this.config) throw new Error("OTLP adapter not connected");
    try {
      const endpoint = `${this.config.endpoint}/api/traces/${traceId}`;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
        ...(this.config.headers ?? {}),
      };
      const body = await httpFetch(endpoint, "GET", headers);
      const data = JSON.parse(body);
      const traces = this.normalizeOTLP(data.resourceSpans ?? [data]);
      return traces[0] ?? null;
    } catch {
      return null;
    }
  }

  private async fetchTracesJaegerCompat(since: number, limit: number): Promise<NormalizedTrace[]> {
    if (!this.config) return [];
    const endpoint = `${this.config.endpoint}/api/traces`;
    const headers: Record<string, string> = {
      ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
      ...(this.config.headers ?? {}),
    };
    try {
      const body = await httpFetch(endpoint, "GET", headers, undefined, {
        start: String(since * 1000), // microseconds
        limit: String(limit),
        lookback: "1h",
      });
      const data = JSON.parse(body) as { data?: JaegerTrace[] };
      return (data.data ?? []).map((t) => this.normalizeJaegerTrace(t));
    } catch {
      return [];
    }
  }

  private async healthCheck(): Promise<void> {
    if (!this.config) throw new Error("No config");
    // Try a simple GET to see if endpoint responds
    try {
      await httpFetch(`${this.config.endpoint}/`, "GET", {});
    } catch {
      // Many backends don't have a root endpoint, that's fine
    }
  }

  private normalizeOTLP(resourceSpans: OTLPResourceSpan[]): NormalizedTrace[] {
    const traceMap = new Map<string, NormalizedSpan[]>();

    for (const rs of resourceSpans) {
      for (const scopeSpan of rs.scopeSpans ?? []) {
        for (const span of scopeSpan.spans ?? []) {
          const traceId = span.traceId;
          if (!traceMap.has(traceId)) traceMap.set(traceId, []);
          traceMap.get(traceId)!.push(this.normalizeOTLPSpan(span));
        }
      }
    }

    return Array.from(traceMap.entries()).map(([traceId, spans]) => buildTrace(traceId, spans));
  }

  private normalizeOTLPSpan(span: OTLPSpan): NormalizedSpan {
    const attrs = attrMap(span.attributes ?? []);
    const startNano = Number(span.startTimeUnixNano ?? 0);
    const endNano = Number(span.endTimeUnixNano ?? 0);
    const startMs = startNano / 1_000_000;
    const endMs = endNano / 1_000_000;
    const model = attrs["gen_ai.request.model"] ?? attrs["llm.model"] ?? attrs["ai.model"];
    const promptTokens = Number(attrs["gen_ai.usage.prompt_tokens"] ?? attrs["llm.token_count.prompt"] ?? 0);
    const completionTokens = Number(attrs["gen_ai.usage.completion_tokens"] ?? attrs["llm.token_count.completion"] ?? 0);
    const kind = classifySpanKind(span.name, attrs);
    const costAttr = attrs["gen_ai.usage.cost"] ?? attrs["llm.cost"];
    const costUsd = costAttr
      ? Number(costAttr)
      : estimateCost(model, { prompt: promptTokens, completion: completionTokens });

    const status: TraceStatus = span.status?.code === 2 ? "error"
      : span.status?.code === 1 ? "ok"
      : "unknown";

    return {
      spanId: span.spanId,
      traceId: span.traceId,
      parentSpanId: span.parentSpanId || undefined,
      name: span.name,
      kind,
      startTimeMs: startMs,
      endTimeMs: endMs,
      durationMs: endMs - startMs,
      status,
      model,
      provider: attrs["gen_ai.system"] ?? attrs["llm.provider"],
      tokenUsage: (promptTokens || completionTokens) ? { prompt: promptTokens, completion: completionTokens, total: promptTokens + completionTokens } : undefined,
      costUsd,
      error: status === "error" ? { type: span.status?.message ?? "error", message: attrs["exception.message"] ?? span.status?.message ?? "unknown" } : undefined,
      toolName: attrs["tool.name"] ?? attrs["gen_ai.tool.name"],
      toolSuccess: attrs["tool.success"] !== undefined ? attrs["tool.success"] === "true" : undefined,
      metadata: Object.keys(attrs).length > 0 ? attrs : undefined,
    };
  }

  private normalizeJaegerTrace(jaeger: JaegerTrace): NormalizedTrace {
    const spans: NormalizedSpan[] = (jaeger.spans ?? []).map((s) => {
      const tags = tagMap(s.tags ?? []);
      const startMs = s.startTime / 1000;
      const endMs = (s.startTime + s.duration) / 1000;
      const model = tags["gen_ai.request.model"] ?? tags["llm.model"];
      const promptTokens = Number(tags["gen_ai.usage.prompt_tokens"] ?? 0);
      const completionTokens = Number(tags["gen_ai.usage.completion_tokens"] ?? 0);

      return {
        spanId: s.spanID,
        traceId: s.traceID,
        parentSpanId: s.references?.[0]?.spanID,
        name: s.operationName,
        kind: classifySpanKind(s.operationName, tags),
        startTimeMs: startMs,
        endTimeMs: endMs,
        durationMs: endMs - startMs,
        status: tags["otel.status_code"] === "ERROR" ? "error" as TraceStatus : "ok" as TraceStatus,
        model,
        tokenUsage: (promptTokens || completionTokens) ? { prompt: promptTokens, completion: completionTokens, total: promptTokens + completionTokens } : undefined,
        costUsd: estimateCost(model, { prompt: promptTokens, completion: completionTokens }),
      };
    });
    return buildTrace(jaeger.traceID, spans);
  }
}

/* ── Langfuse Adapter ────────────────────────────────────────────── */

export class LangfuseAdapter implements ProviderAdapter {
  readonly provider: ObservabilityProvider = "langfuse";
  private config: ProviderConfig | null = null;
  private connected = false;

  async connect(config: ProviderConfig): Promise<void> {
    if (!config.apiKey) throw new Error("Langfuse requires an API key (public key). Set secretKey in headers as x-langfuse-secret-key.");
    this.config = config;
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.config = null;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async fetchTraces(since: number, limit: number): Promise<NormalizedTrace[]> {
    if (!this.config) throw new Error("Langfuse adapter not connected");
    const baseUrl = this.config.endpoint.replace(/\/$/, "");
    const secretKey = this.config.headers?.["x-langfuse-secret-key"] ?? this.config.headers?.["X-Langfuse-Secret-Key"] ?? "";
    const auth = Buffer.from(`${this.config.apiKey}:${secretKey}`).toString("base64");

    const body = await httpFetch(`${baseUrl}/api/public/traces`, "GET", {
      Authorization: `Basic ${auth}`,
    }, undefined, {
      fromTimestamp: new Date(since).toISOString(),
      limit: String(limit),
      orderBy: "timestamp.desc",
    });

    const data = JSON.parse(body) as { data?: LangfuseTrace[] };
    const traces: NormalizedTrace[] = [];

    for (const t of data.data ?? []) {
      // Fetch observations (spans) for each trace
      const obsBody = await httpFetch(`${baseUrl}/api/public/observations`, "GET", {
        Authorization: `Basic ${auth}`,
      }, undefined, { traceId: t.id, limit: "200" });
      const obsData = JSON.parse(obsBody) as { data?: LangfuseObservation[] };
      traces.push(this.normalizeLangfuseTrace(t, obsData.data ?? []));
    }

    return traces;
  }

  async fetchTrace(traceId: string): Promise<NormalizedTrace | null> {
    if (!this.config) throw new Error("Langfuse adapter not connected");
    const baseUrl = this.config.endpoint.replace(/\/$/, "");
    const secretKey = this.config.headers?.["x-langfuse-secret-key"] ?? "";
    const auth = Buffer.from(`${this.config.apiKey}:${secretKey}`).toString("base64");

    try {
      const traceBody = await httpFetch(`${baseUrl}/api/public/traces/${traceId}`, "GET", {
        Authorization: `Basic ${auth}`,
      });
      const t = JSON.parse(traceBody) as LangfuseTrace;

      const obsBody = await httpFetch(`${baseUrl}/api/public/observations`, "GET", {
        Authorization: `Basic ${auth}`,
      }, undefined, { traceId: t.id, limit: "200" });
      const obsData = JSON.parse(obsBody) as { data?: LangfuseObservation[] };

      return this.normalizeLangfuseTrace(t, obsData.data ?? []);
    } catch {
      return null;
    }
  }

  private normalizeLangfuseTrace(trace: LangfuseTrace, observations: LangfuseObservation[]): NormalizedTrace {
    const spans: NormalizedSpan[] = observations.map((obs) => {
      const startMs = new Date(obs.startTime).getTime();
      const endMs = obs.endTime ? new Date(obs.endTime).getTime() : startMs;
      const model = obs.model ?? undefined;
      const promptTokens = obs.usage?.input ?? obs.usage?.promptTokens ?? 0;
      const completionTokens = obs.usage?.output ?? obs.usage?.completionTokens ?? 0;
      const totalCost = obs.calculatedTotalCost ?? obs.usage?.totalCost ?? estimateCost(model, { prompt: promptTokens, completion: completionTokens });

      let kind: NormalizedSpan["kind"] = "unknown";
      if (obs.type === "GENERATION") kind = "llm_call";
      else if (obs.type === "SPAN") kind = classifySpanKind(obs.name ?? "", {});
      else if (obs.type === "EVENT") kind = "agent_step";

      return {
        spanId: obs.id,
        traceId: trace.id,
        parentSpanId: obs.parentObservationId ?? undefined,
        name: obs.name ?? obs.type,
        kind,
        startTimeMs: startMs,
        endTimeMs: endMs,
        durationMs: endMs - startMs,
        status: obs.level === "ERROR" ? "error" as TraceStatus : "ok" as TraceStatus,
        model,
        provider: obs.model ? guessProvider(obs.model) : undefined,
        tokenUsage: (promptTokens || completionTokens) ? { prompt: promptTokens, completion: completionTokens, total: promptTokens + completionTokens } : undefined,
        costUsd: totalCost,
        error: obs.level === "ERROR" ? { type: "error", message: obs.statusMessage ?? "unknown" } : undefined,
        input: obs.input,
        output: obs.output,
        metadata: obs.metadata as Record<string, unknown> | undefined,
      };
    });

    return buildTrace(trace.id, spans, trace.sessionId ?? undefined, trace.name ?? undefined);
  }
}

/* ── Helicone Adapter ────────────────────────────────────────────── */

export class HeliconeAdapter implements ProviderAdapter {
  readonly provider: ObservabilityProvider = "helicone";
  private config: ProviderConfig | null = null;
  private connected = false;

  async connect(config: ProviderConfig): Promise<void> {
    if (!config.apiKey) throw new Error("Helicone requires an API key");
    this.config = config;
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.config = null;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async fetchTraces(since: number, limit: number): Promise<NormalizedTrace[]> {
    if (!this.config) throw new Error("Helicone adapter not connected");
    const baseUrl = this.config.endpoint.replace(/\/$/, "") || "https://api.helicone.ai";

    const body = await httpFetch(`${baseUrl}/v1/request/query`, "POST", {
      Authorization: `Bearer ${this.config.apiKey}`,
      "Content-Type": "application/json",
    }, JSON.stringify({
      filter: {
        request_created_at: { gte: new Date(since).toISOString() },
      },
      limit,
      sort: { created_at: "desc" },
    }));

    const data = JSON.parse(body) as { data?: HeliconeRequest[] };
    return this.groupIntoTraces(data.data ?? []);
  }

  async fetchTrace(traceId: string): Promise<NormalizedTrace | null> {
    if (!this.config) throw new Error("Helicone adapter not connected");
    const baseUrl = this.config.endpoint.replace(/\/$/, "") || "https://api.helicone.ai";

    try {
      const body = await httpFetch(`${baseUrl}/v1/request/${traceId}`, "GET", {
        Authorization: `Bearer ${this.config.apiKey}`,
      });
      const req = JSON.parse(body) as HeliconeRequest;
      const span = this.normalizeHeliconeRequest(req);
      return buildTrace(traceId, [span]);
    } catch {
      return null;
    }
  }

  private normalizeHeliconeRequest(req: HeliconeRequest): NormalizedSpan {
    const startMs = new Date(req.request_created_at).getTime();
    const endMs = req.response_created_at ? new Date(req.response_created_at).getTime() : startMs;
    const model = req.model ?? req.request_model ?? undefined;
    const promptTokens = req.prompt_tokens ?? 0;
    const completionTokens = req.completion_tokens ?? 0;
    const cost = req.cost_usd ?? estimateCost(model, { prompt: promptTokens, completion: completionTokens });

    return {
      spanId: req.request_id ?? randomUUID(),
      traceId: req.helicone_session ?? req.request_id ?? randomUUID(),
      name: model ?? "llm_call",
      kind: "llm_call",
      startTimeMs: startMs,
      endTimeMs: endMs,
      durationMs: endMs - startMs,
      status: req.response_status && req.response_status >= 400 ? "error" : "ok",
      model,
      provider: req.provider ?? (model ? guessProvider(model) : undefined),
      tokenUsage: { prompt: promptTokens, completion: completionTokens, total: promptTokens + completionTokens },
      costUsd: cost,
      error: req.response_status && req.response_status >= 400 ? { type: `HTTP ${req.response_status}`, message: req.response_body?.error?.message ?? "unknown" } : undefined,
      metadata: req.properties,
    };
  }

  private groupIntoTraces(requests: HeliconeRequest[]): NormalizedTrace[] {
    const groups = new Map<string, HeliconeRequest[]>();
    for (const req of requests) {
      const sessionId = req.helicone_session ?? req.request_id ?? randomUUID();
      if (!groups.has(sessionId)) groups.set(sessionId, []);
      groups.get(sessionId)!.push(req);
    }
    return Array.from(groups.entries()).map(([traceId, reqs]) => {
      const spans = reqs.map((r) => this.normalizeHeliconeRequest(r));
      return buildTrace(traceId, spans);
    });
  }
}

/* ── Webhook Adapter (receives pushes from any platform) ──────── */

export class WebhookAdapter implements ProviderAdapter {
  readonly provider: ObservabilityProvider = "webhook";
  private config: ProviderConfig | null = null;
  private connected = false;
  private buffer: NormalizedTrace[] = [];
  private maxBuffer = 10000;

  async connect(config: ProviderConfig): Promise<void> {
    this.config = config;
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.buffer = [];
  }

  isConnected(): boolean {
    return this.connected;
  }

  /** Ingest a trace pushed via webhook */
  ingest(trace: NormalizedTrace): void {
    this.buffer.push(trace);
    if (this.buffer.length > this.maxBuffer) {
      this.buffer = this.buffer.slice(-this.maxBuffer);
    }
  }

  /** Ingest raw spans and auto-group into trace */
  ingestSpans(spans: NormalizedSpan[]): NormalizedTrace {
    const traceId = spans[0]?.traceId ?? randomUUID();
    const trace = buildTrace(traceId, spans);
    this.ingest(trace);
    return trace;
  }

  async fetchTraces(since: number, limit: number): Promise<NormalizedTrace[]> {
    return this.buffer
      .filter((t) => t.startTimeMs >= since)
      .slice(-limit);
  }

  async fetchTrace(traceId: string): Promise<NormalizedTrace | null> {
    return this.buffer.find((t) => t.traceId === traceId) ?? null;
  }
}

/* ── Datadog Adapter ─────────────────────────────────────────────── */

export class DatadogAdapter implements ProviderAdapter {
  readonly provider: ObservabilityProvider = "datadog" as ObservabilityProvider;
  private config: ProviderConfig | null = null;
  private connected = false;

  async connect(config: ProviderConfig): Promise<void> {
    if (!config.apiKey) throw new Error("Datadog requires an API key (DD-API-KEY)");
    this.config = config;
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.config = null;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async fetchTraces(since: number, limit: number): Promise<NormalizedTrace[]> {
    if (!this.config) throw new Error("Datadog adapter not connected");
    const baseUrl = this.config.endpoint.replace(/\/$/, "");

    const body = await httpFetch(`${baseUrl}/api/v2/spans/events/search`, "POST", {
      "DD-API-KEY": this.config.apiKey!,
      "Content-Type": "application/json",
    }, JSON.stringify({
      data: {
        type: "search_request",
        attributes: {
          filter: {
            from: new Date(since).toISOString(),
            to: "now",
            query: "service:*",
          },
          page: { limit },
          sort: "-timestamp",
        },
      },
    }));

    const data = JSON.parse(body) as { data?: DatadogSpanEvent[] };
    return this.groupIntoTraces(data.data ?? []);
  }

  async fetchTrace(traceId: string): Promise<NormalizedTrace | null> {
    if (!this.config) throw new Error("Datadog adapter not connected");
    const traces = await this.fetchTraces(0, 100);
    return traces.find((t) => t.traceId === traceId) ?? null;
  }

  private groupIntoTraces(events: DatadogSpanEvent[]): NormalizedTrace[] {
    const groups = new Map<string, NormalizedSpan[]>();
    for (const evt of events) {
      const attrs = evt.attributes ?? {};
      const traceId = attrs.trace_id ?? randomUUID();
      if (!groups.has(traceId)) groups.set(traceId, []);
      const startMs = attrs.timestamp ? new Date(attrs.timestamp).getTime() : Date.now();
      const durationMs = (attrs.duration ?? 0) / 1_000_000; // nanoseconds to ms
      groups.get(traceId)!.push({
        spanId: attrs.span_id ?? randomUUID(),
        traceId,
        parentSpanId: attrs.parent_id,
        name: attrs.resource_name ?? attrs.operation_name ?? "unknown",
        kind: classifySpanKind(attrs.operation_name ?? "", {}),
        startTimeMs: startMs,
        endTimeMs: startMs + durationMs,
        durationMs,
        status: attrs.status === "error" ? "error" : "ok",
        model: attrs["ai.model"],
        metadata: attrs.custom as Record<string, unknown> | undefined,
      });
    }
    return Array.from(groups.entries()).map(([traceId, spans]) => buildTrace(traceId, spans));
  }
}

/* ── Bridge Orchestrator ─────────────────────────────────────────── */

export interface ObservabilityBridgeConfig {
  workspace: string;
  agentId: string;
  providers: ProviderConfig[];
  pollIntervalMs?: number;
  persistTraces?: boolean;
  maxTraceBuffer?: number;
}

export class ObservabilityBridge extends EventEmitter {
  private config: Required<ObservabilityBridgeConfig>;
  private adapters: Map<string, ProviderAdapter> = new Map();
  private traces: NormalizedTrace[] = [];
  private pollTimer: NodeJS.Timeout | null = null;
  private running = false;
  private lastPollTs: number = 0;

  constructor(config: ObservabilityBridgeConfig) {
    super();
    this.config = {
      workspace: config.workspace,
      agentId: config.agentId,
      providers: config.providers,
      pollIntervalMs: config.pollIntervalMs ?? 10_000,
      persistTraces: config.persistTraces ?? true,
      maxTraceBuffer: config.maxTraceBuffer ?? 5000,
    };
    this.lastPollTs = Date.now() - 3600_000;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Connect all adapters
    for (const providerConfig of this.config.providers) {
      const adapter = createProviderAdapter(providerConfig.provider);
      await adapter.connect(providerConfig);
      const key = `${providerConfig.provider}:${providerConfig.endpoint}`;
      this.adapters.set(key, adapter);
      this.emit("provider_connected", { provider: providerConfig.provider, endpoint: providerConfig.endpoint });
    }

    // Start polling
    this.pollTimer = setInterval(() => {
      this.pollAll().catch((err) => {
        this.emit("poll_error", { error: err instanceof Error ? err.message : String(err) });
      });
    }, this.config.pollIntervalMs);

    // Initial poll
    await this.pollAll();
    this.emit("started", { agentId: this.config.agentId, providers: this.config.providers.length });
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    for (const adapter of this.adapters.values()) {
      await adapter.disconnect();
    }
    this.adapters.clear();
    this.emit("stopped", { agentId: this.config.agentId });
  }

  getTraces(since?: number, limit?: number): NormalizedTrace[] {
    let result = this.traces;
    if (since) result = result.filter((t) => t.startTimeMs >= since);
    if (limit) result = result.slice(-limit);
    return result;
  }

  getTrace(traceId: string): NormalizedTrace | undefined {
    return this.traces.find((t) => t.traceId === traceId);
  }

  getWebhookAdapter(): WebhookAdapter | undefined {
    for (const adapter of this.adapters.values()) {
      if (adapter instanceof WebhookAdapter) return adapter;
    }
    return undefined;
  }

  getStats(): {
    totalTraces: number;
    totalSpans: number;
    totalCostUsd: number;
    totalTokens: number;
    providerCount: number;
    connectedProviders: string[];
    errorRate: number;
    avgDurationMs: number;
  } {
    const connected: string[] = [];
    for (const [key, adapter] of this.adapters) {
      if (adapter.isConnected()) connected.push(key);
    }

    let totalSpans = 0;
    let totalCost = 0;
    let totalTokens = 0;
    let totalErrors = 0;
    let totalDuration = 0;

    for (const trace of this.traces) {
      totalSpans += trace.spans.length;
      totalCost += trace.totalCostUsd;
      totalTokens += trace.totalTokens;
      totalErrors += trace.errorCount;
      totalDuration += trace.durationMs;
    }

    return {
      totalTraces: this.traces.length,
      totalSpans,
      totalCostUsd: totalCost,
      totalTokens,
      providerCount: this.adapters.size,
      connectedProviders: connected,
      errorRate: this.traces.length > 0 ? totalErrors / this.traces.length : 0,
      avgDurationMs: this.traces.length > 0 ? totalDuration / this.traces.length : 0,
    };
  }

  private async pollAll(): Promise<void> {
    const newTraces: NormalizedTrace[] = [];

    for (const adapter of this.adapters.values()) {
      if (!adapter.isConnected()) continue;
      try {
        const batch = await adapter.fetchTraces(this.lastPollTs, this.config.maxTraceBuffer);
        newTraces.push(...batch);
      } catch (err) {
        this.emit("adapter_error", {
          provider: adapter.provider,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (newTraces.length === 0) return;

    // Deduplicate by traceId
    const existingIds = new Set(this.traces.map((t) => t.traceId));
    const genuinelyNew = newTraces.filter((t) => !existingIds.has(t.traceId));

    if (genuinelyNew.length === 0) return;

    this.traces.push(...genuinelyNew);
    if (this.traces.length > this.config.maxTraceBuffer) {
      this.traces = this.traces.slice(-this.config.maxTraceBuffer);
    }

    this.lastPollTs = Date.now();

    // Persist to workspace if configured
    if (this.config.persistTraces) {
      await this.persistNewTraces(genuinelyNew);
    }

    // Record in ledger
    await this.recordToLedger(genuinelyNew);

    // Emit events for each new trace
    for (const trace of genuinelyNew) {
      this.emit("trace", trace);
      this.emit("monitoring_event", {
        type: "score" as const,
        ts: trace.endTimeMs,
        agentId: this.config.agentId,
        data: {
          traceId: trace.traceId,
          totalCostUsd: trace.totalCostUsd,
          totalTokens: trace.totalTokens,
          errorCount: trace.errorCount,
          durationMs: trace.durationMs,
          llmCalls: trace.llmCallCount,
          toolCalls: trace.toolCallCount,
        },
      } as MonitoringEvent);
    }

    this.emit("poll_complete", { newTraces: genuinelyNew.length, totalTraces: this.traces.length });
  }

  private async persistNewTraces(traces: NormalizedTrace[]): Promise<void> {
    const tracesDir = join(this.config.workspace, ".amc", "agents", this.config.agentId, "traces");
    ensureDir(tracesDir);

    for (const trace of traces) {
      const filename = `${trace.traceId}.json`;
      const filepath = join(tracesDir, filename);
      if (!pathExists(filepath)) {
        writeFileAtomic(filepath, JSON.stringify(trace, null, 2));
      }
    }
  }

  private async recordToLedger(traces: NormalizedTrace[]): Promise<void> {
    try {
      const ledger = openLedger(this.config.workspace);
      const sessionId = `obs-bridge-${randomUUID()}`;
      ledger.startSession({
        sessionId,
        runtime: "unknown",
        binaryPath: "amc-watch",
        binarySha256: sha256Hex("amc-watch"),
      });

      for (const trace of traces) {
        ledger.appendEvidence({
          sessionId,
          runtime: "unknown",
          eventType: "metric",
          payload: JSON.stringify({
            type: "OBSERVABILITY_TRACE",
            traceId: trace.traceId,
            durationMs: trace.durationMs,
            totalTokens: trace.totalTokens,
            totalCostUsd: trace.totalCostUsd,
            llmCalls: trace.llmCallCount,
            toolCalls: trace.toolCallCount,
            errorCount: trace.errorCount,
            status: trace.status,
          }),
          payloadExt: "json",
          inline: true,
          meta: {
            auditType: "OBSERVABILITY_BRIDGE_INGEST",
            traceId: trace.traceId,
            agentId: this.config.agentId,
            trustTier: "OBSERVED",
          },
        });
      }

      ledger.sealSession(sessionId);
      ledger.close();
    } catch {
      // Non-fatal — traces are still stored in memory and files
    }
  }
}

/* ── Factory ─────────────────────────────────────────────────────── */

export function createProviderAdapter(provider: ObservabilityProvider): ProviderAdapter {
  switch (provider) {
    case "otlp": return new OTLPAdapter();
    case "langfuse": return new LangfuseAdapter();
    case "helicone": return new HeliconeAdapter();
    case "datadog": return new DatadogAdapter() as ProviderAdapter;
    case "webhook": return new WebhookAdapter();
    default: throw new Error(`Unknown observability provider: ${provider}`);
  }
}

export function createObservabilityBridge(config: ObservabilityBridgeConfig): ObservabilityBridge {
  return new ObservabilityBridge(config);
}

/* ── Helpers ─────────────────────────────────────────────────────── */

function buildTrace(traceId: string, spans: NormalizedSpan[], sessionId?: string, name?: string): NormalizedTrace {
  if (spans.length === 0) {
    return {
      traceId, sessionId, name, startTimeMs: 0, endTimeMs: 0, durationMs: 0,
      status: "unknown", spans: [], totalTokens: 0, totalCostUsd: 0,
      modelBreakdown: {}, errorCount: 0, toolCallCount: 0, llmCallCount: 0,
    };
  }

  const startTimeMs = Math.min(...spans.map((s) => s.startTimeMs));
  const endTimeMs = Math.max(...spans.map((s) => s.endTimeMs));
  const modelBreakdown: Record<string, { tokens: number; costUsd: number; calls: number }> = {};
  let totalTokens = 0;
  let totalCost = 0;
  let errorCount = 0;
  let toolCallCount = 0;
  let llmCallCount = 0;

  for (const span of spans) {
    if (span.tokenUsage) totalTokens += span.tokenUsage.total;
    if (span.costUsd) totalCost += span.costUsd;
    if (span.status === "error") errorCount++;
    if (span.kind === "tool_call") toolCallCount++;
    if (span.kind === "llm_call") llmCallCount++;

    if (span.model) {
      const key = span.model;
      if (!modelBreakdown[key]) modelBreakdown[key] = { tokens: 0, costUsd: 0, calls: 0 };
      modelBreakdown[key]!.tokens += span.tokenUsage?.total ?? 0;
      modelBreakdown[key]!.costUsd += span.costUsd ?? 0;
      modelBreakdown[key]!.calls += 1;
    }
  }

  const hasError = spans.some((s) => s.status === "error");

  return {
    traceId,
    sessionId,
    name,
    startTimeMs,
    endTimeMs,
    durationMs: endTimeMs - startTimeMs,
    status: hasError ? "error" : "ok",
    spans,
    totalTokens,
    totalCostUsd: totalCost,
    modelBreakdown,
    errorCount,
    toolCallCount,
    llmCallCount,
  };
}

function classifySpanKind(name: string, attrs: Record<string, string | undefined>): NormalizedSpan["kind"] {
  const n = name.toLowerCase();
  if (attrs["gen_ai.operation.name"] === "chat" || n.includes("chat.completion") || n.includes("messages.create") || n.includes("generate_content")) return "llm_call";
  if (n.includes("embed") || attrs["gen_ai.operation.name"] === "embeddings") return "embedding";
  if (n.includes("tool") || n.includes("function_call") || attrs["tool.name"]) return "tool_call";
  if (n.includes("retriev") || n.includes("search") || n.includes("rag")) return "retrieval";
  if (n.includes("rerank")) return "rerank";
  if (n.includes("guard") || n.includes("shield") || n.includes("safety")) return "guard";
  if (n.includes("chain") || n.includes("sequence") || n.includes("pipeline")) return "chain";
  if (n.includes("agent") || n.includes("step")) return "agent_step";
  if (attrs["gen_ai.system"] || attrs["llm.provider"]) return "llm_call";
  return "unknown";
}

function attrMap(attrs: Array<{ key: string; value: { stringValue?: string; intValue?: number; doubleValue?: number; boolValue?: boolean } }>): Record<string, string | undefined> {
  const map: Record<string, string | undefined> = {};
  for (const attr of attrs) {
    map[attr.key] = attr.value.stringValue ?? String(attr.value.intValue ?? attr.value.doubleValue ?? attr.value.boolValue ?? "");
  }
  return map;
}

function tagMap(tags: Array<{ key: string; value: unknown; type?: string }>): Record<string, string | undefined> {
  const map: Record<string, string | undefined> = {};
  for (const tag of tags) {
    map[tag.key] = String(tag.value);
  }
  return map;
}

function guessProvider(model: string): string {
  const m = model.toLowerCase();
  if (m.includes("gpt") || m.includes("o1") || m.includes("o3") || m.includes("davinci")) return "openai";
  if (m.includes("claude")) return "anthropic";
  if (m.includes("gemini")) return "google";
  if (m.includes("command") || m.includes("cohere")) return "cohere";
  if (m.includes("llama") || m.includes("meta")) return "meta";
  if (m.includes("mistral") || m.includes("mixtral")) return "mistral";
  if (m.includes("grok")) return "xai";
  return "unknown";
}

function httpFetch(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: string,
  queryParams?: Record<string, string>,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let fullUrl = url;
    if (queryParams && Object.keys(queryParams).length > 0) {
      const qs = new URLSearchParams(queryParams).toString();
      fullUrl += (url.includes("?") ? "&" : "?") + qs;
    }

    const parsed = new URL(fullUrl);
    const reqFn = parsed.protocol === "https:" ? httpsRequest : httpRequest;

    const req = reqFn(fullUrl, {
      method,
      headers: {
        ...headers,
        ...(body ? { "Content-Length": Buffer.byteLength(body).toString() } : {}),
      },
      timeout: 30_000,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const responseBody = Buffer.concat(chunks).toString("utf-8");
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${responseBody.slice(0, 500)}`));
        } else {
          resolve(responseBody);
        }
      });
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });

    if (body) req.write(body);
    req.end();
  });
}

/* ── External type shapes (minimal for parsing) ──────────────────── */

interface OTLPResourceSpan {
  scopeSpans?: Array<{
    spans?: OTLPSpan[];
  }>;
}

interface OTLPSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTimeUnixNano?: string | number;
  endTimeUnixNano?: string | number;
  attributes?: Array<{ key: string; value: { stringValue?: string; intValue?: number; doubleValue?: number; boolValue?: boolean } }>;
  status?: { code?: number; message?: string };
}

interface JaegerTrace {
  traceID: string;
  spans?: JaegerSpan[];
}

interface JaegerSpan {
  traceID: string;
  spanID: string;
  operationName: string;
  startTime: number; // microseconds
  duration: number; // microseconds
  tags?: Array<{ key: string; value: unknown; type?: string }>;
  references?: Array<{ refType: string; traceID: string; spanID: string }>;
}

interface LangfuseTrace {
  id: string;
  name?: string;
  sessionId?: string;
  timestamp?: string;
  metadata?: unknown;
}

interface LangfuseObservation {
  id: string;
  traceId: string;
  type: "GENERATION" | "SPAN" | "EVENT";
  name?: string;
  startTime: string;
  endTime?: string;
  model?: string;
  usage?: {
    input?: number;
    output?: number;
    total?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    totalCost?: number;
  };
  calculatedTotalCost?: number;
  level?: "DEFAULT" | "DEBUG" | "WARNING" | "ERROR";
  statusMessage?: string;
  input?: unknown;
  output?: unknown;
  metadata?: unknown;
  parentObservationId?: string;
}

interface HeliconeRequest {
  request_id?: string;
  helicone_session?: string;
  request_created_at: string;
  response_created_at?: string;
  model?: string;
  request_model?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  cost_usd?: number;
  response_status?: number;
  response_body?: { error?: { message?: string } };
  provider?: string;
  properties?: Record<string, unknown>;
}

interface DatadogSpanEvent {
  id?: string;
  attributes?: {
    trace_id?: string;
    span_id?: string;
    parent_id?: string;
    operation_name?: string;
    resource_name?: string;
    timestamp?: string;
    duration?: number;
    status?: string;
    custom?: Record<string, unknown>;
    "ai.model"?: string;
  };
}
