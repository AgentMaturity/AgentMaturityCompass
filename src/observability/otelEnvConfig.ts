/**
 * Exporter configuration from the environment (SH-OBS-01).
 *
 * Precedence: `OTEL_SDK_DISABLED=true` wins; `AMC_OTEL_ENABLED` is the only on switch (fail closed: nothing is
 * exported unless asked); `AMC_OTEL_*` wins over the standard `OTEL_*` variable it shadows. With `AMC_OTEL_EXPORTERS`
 * unset, a standard `OTEL_EXPORTER_OTLP_ENDPOINT` (or a signal-specific endpoint) adds one OTLP/HTTP JSON target.
 * Header values are percent-decoded here and never logged or previewed. A protocol other than `http/json` cannot be
 * served without a dependency, so it yields a disabled exporter whose reason `otel-preview` shows.
 */
import type { ObservabilityExporterTarget, ObservabilityOTELConfig, ObservabilitySignal } from "./otelExporter.js";

export interface ResolvedOtelEnv {
  readonly config: ObservabilityOTELConfig;
  /** Why export is off although something asked for it; null when enabled or simply not requested. */
  readonly disabledReason: string | null;
}

const DEFAULTS = { serviceName: "amc-observability", serviceVersion: "1.0.0", maxBufferSize: 1024 } as const;

function truthy(value: string | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** `k=v,k2=v2` with percent-encoded values (OTel spec); malformed entries are skipped, never guessed. */
export function parseKeyValueList(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of (raw ?? "").split(",")) {
    const at = entry.indexOf("=");
    if (at <= 0) continue;
    const key = entry.slice(0, at).trim();
    const value = entry.slice(at + 1).trim();
    if (key.length === 0) continue;
    try { out[key] = decodeURIComponent(value); } catch { out[key] = value; }
  }
  return out;
}

/** Host only: an endpoint can carry userinfo or query-string tokens. */
export function endpointHostOnly(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "(unparseable endpoint)";
  }
}

export function resolveOtelEnvConfig(env: NodeJS.ProcessEnv = process.env): ResolvedOtelEnv {
  const headers = parseKeyValueList(env.OTEL_EXPORTER_OTLP_HEADERS);
  const withHeaders = (target: ObservabilityExporterTarget): ObservabilityExporterTarget =>
    Object.keys(headers).length === 0 ? target : { ...target, headers: { ...headers, ...(target.headers ?? {}) } };
  const requested = (env.AMC_OTEL_EXPORTERS ?? "").split(",").map((entry) => entry.trim().toLowerCase()).filter((entry) => entry.length > 0);
  const standardEndpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim() || undefined;
  const signalEndpoints: Partial<Record<ObservabilitySignal, string>> = {};
  for (const [signal, key] of [["traces", "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"], ["metrics", "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT"], ["logs", "OTEL_EXPORTER_OTLP_LOGS_ENDPOINT"]] as const) {
    const value = env[key]?.trim();
    if (value) signalEndpoints[signal] = value;
  }
  const targets: ObservabilityExporterTarget[] = [];
  const otlpRequested = requested.includes("otlp") || (requested.length === 0 && (standardEndpoint !== undefined || Object.keys(signalEndpoints).length > 0));
  if (otlpRequested) {
    targets.push(withHeaders({ kind: "otlp", endpoint: env.AMC_OTEL_OTLP_ENDPOINT ?? standardEndpoint ?? "http://127.0.0.1:4318",
      ...(Object.keys(signalEndpoints).length === 0 ? {} : { signalEndpoints }) }));
  }
  if (requested.includes("jaeger")) targets.push(withHeaders({ kind: "jaeger", endpoint: env.AMC_OTEL_JAEGER_ENDPOINT ?? "http://127.0.0.1:4318" }));
  if (requested.includes("zipkin")) targets.push({ kind: "zipkin", endpoint: env.AMC_OTEL_ZIPKIN_ENDPOINT ?? "http://127.0.0.1:9411" });

  const asked = truthy(env.AMC_OTEL_ENABLED);
  let disabledReason: string | null = null;
  if (asked && truthy(env.OTEL_SDK_DISABLED)) disabledReason = "OTEL_SDK_DISABLED is set";
  const protocol = env.OTEL_EXPORTER_OTLP_PROTOCOL?.trim().toLowerCase();
  if (asked && disabledReason === null && protocol !== undefined && protocol !== "" && protocol !== "http/json") {
    disabledReason = `OTEL_EXPORTER_OTLP_PROTOCOL=${protocol} is not supported; AMC exports OTLP over http/json only (no SDK dependency)`;
  }
  if (asked && disabledReason === null && targets.length === 0) disabledReason = "AMC_OTEL_ENABLED is set but no exporter target is configured (AMC_OTEL_EXPORTERS or OTEL_EXPORTER_OTLP_ENDPOINT)";
  const resourceAttributes = parseKeyValueList(env.OTEL_RESOURCE_ATTRIBUTES);
  return {
    config: {
      enabled: asked && disabledReason === null,
      serviceName: env.AMC_OTEL_SERVICE_NAME ?? env.OTEL_SERVICE_NAME ?? DEFAULTS.serviceName,
      serviceVersion: env.AMC_OTEL_SERVICE_VERSION ?? DEFAULTS.serviceVersion,
      maxBufferSize: positiveInt(env.AMC_OTEL_MAX_BUFFER_SIZE, DEFAULTS.maxBufferSize),
      targets,
      ...(Object.keys(resourceAttributes).length === 0 ? {} : { resourceAttributes })
    },
    disabledReason
  };
}
