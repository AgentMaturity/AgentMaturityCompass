import { incCounter, observeHistogram, setGauge, stableAgentHash } from "./metricsRegistry.js";

const HTTP_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10];
const METRICS_ENDPOINT_BUCKETS = [0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1];

function normalizeMetricsEndpoint(endpoint: string): "/metrics" | "/health" | "/unknown" {
  if (endpoint === "/metrics") return "/metrics";
  if (endpoint === "/health") return "/health";
  return "/unknown";
}

export function ensureMetricsBaseline(): void {
  incCounter("amc_http_requests_total", "Total Studio HTTP requests", { route: "bootstrap", method: "GET", status: "200" }, 0);
  observeHistogram("amc_http_request_duration_seconds", "Studio HTTP request duration seconds", { route: "bootstrap", method: "GET" }, 0, HTTP_BUCKETS);
  incCounter(
    "amc_metrics_endpoint_requests_total",
    "Total requests to the metrics server endpoints",
    { endpoint: "/metrics", method: "GET", status: "200" },
    0
  );
  observeHistogram(
    "amc_metrics_endpoint_duration_seconds",
    "Metrics endpoint request duration seconds",
    { endpoint: "/metrics", method: "GET" },
    0,
    METRICS_ENDPOINT_BUCKETS
  );
  incCounter(
    "amc_metrics_endpoint_denied_total",
    "Denied requests to metrics server endpoints",
    { endpoint: "/metrics", method: "GET", reason: "ip_not_allowed" },
    0
  );
  incCounter("amc_leases_issued_total", "Leases issued by Studio", { agentIdHash: "bootstrap", routeFamily: "unknown" }, 0);
  incCounter("amc_toolhub_intents_total", "ToolHub intents", { agentIdHash: "bootstrap", actionClass: "READ_ONLY", mode: "SIMULATE" }, 0);
  incCounter(
    "amc_toolhub_exec_total",
    "ToolHub executions",
    { agentIdHash: "bootstrap", toolName: "none", actionClass: "READ_ONLY", status: "ok" },
    0
  );
  incCounter("amc_approvals_requests_total", "Approval requests", { actionClass: "READ_ONLY", riskTier: "low" }, 0);
  incCounter("amc_approvals_decisions_total", "Approval decisions", { decision: "APPROVED", actionClass: "READ_ONLY" }, 0);
  incCounter(
    "amc_gateway_requests_total",
    "Total gateway proxy requests",
    { route: "bootstrap", method: "POST", status: "200", upstream: "bootstrap" },
    0
  );
  observeHistogram(
    "amc_gateway_request_duration_seconds",
    "Gateway proxy request duration seconds",
    { route: "bootstrap", method: "POST", upstream: "bootstrap" },
    0,
    HTTP_BUCKETS
  );
  incCounter(
    "amc_gateway_failures_total",
    "Gateway proxy failures by stage and class",
    { stage: "bootstrap", upstream: "bootstrap", errorClass: "none" },
    0
  );
  incCounter(
    "amc_gateway_trace_context_total",
    "Gateway trace context handling results",
    { state: "bootstrap" },
    0
  );
  setGauge("amc_retention_segments_total", "Retention segments total", {}, 0);
  setGauge("amc_blobs_total", "Blob object count", {}, 0);
  setGauge("amc_blobs_bytes_total", "Blob object bytes", {}, 0);
  setGauge("amc_db_size_bytes", "SQLite DB file size", {}, 0);
  incCounter("amc_transparency_root_changes_total", "Transparency root updates", {}, 0);
  setGauge("amc_integrity_index_gauge", "Integrity index gauge", { scope: "fleet", idHash: "bootstrap" }, 0);
}

export function recordHttpRequestMetric(route: string, method: string, status: number, durationMs: number): void {
  const labels = {
    route,
    method: method.toUpperCase(),
    status: String(status)
  };
  incCounter("amc_http_requests_total", "Total Studio HTTP requests", labels, 1);
  observeHistogram(
    "amc_http_request_duration_seconds",
    "Studio HTTP request duration seconds",
    { route, method: method.toUpperCase() },
    Math.max(0, durationMs) / 1000,
    HTTP_BUCKETS
  );
}

export function recordMetricsEndpointRequestMetric(endpoint: string, method: string, status: number, durationMs: number): void {
  const normalizedEndpoint = normalizeMetricsEndpoint(endpoint);
  const methodUpper = method.toUpperCase();
  incCounter(
    "amc_metrics_endpoint_requests_total",
    "Total requests to the metrics server endpoints",
    { endpoint: normalizedEndpoint, method: methodUpper, status: String(status) },
    1
  );
  observeHistogram(
    "amc_metrics_endpoint_duration_seconds",
    "Metrics endpoint request duration seconds",
    { endpoint: normalizedEndpoint, method: methodUpper },
    Math.max(0, durationMs) / 1000,
    METRICS_ENDPOINT_BUCKETS
  );
}

export function recordMetricsEndpointDeniedMetric(endpoint: string, method: string, reason: string): void {
  incCounter(
    "amc_metrics_endpoint_denied_total",
    "Denied requests to metrics server endpoints",
    { endpoint: normalizeMetricsEndpoint(endpoint), method: method.toUpperCase(), reason },
    1
  );
}

export function recordLeaseIssuedMetric(agentId: string, routeFamily: string): void {
  incCounter("amc_leases_issued_total", "Leases issued by Studio", { agentIdHash: stableAgentHash(agentId), routeFamily }, 1);
}

export function recordToolhubIntentMetric(agentId: string, actionClass: string, mode: string): void {
  incCounter(
    "amc_toolhub_intents_total",
    "ToolHub intents",
    { agentIdHash: stableAgentHash(agentId), actionClass, mode },
    1
  );
}

export function recordToolhubExecMetric(agentId: string, toolName: string, actionClass: string, status: string): void {
  incCounter(
    "amc_toolhub_exec_total",
    "ToolHub executions",
    { agentIdHash: stableAgentHash(agentId), toolName, actionClass, status },
    1
  );
}

export function recordApprovalRequestMetric(actionClass: string, riskTier: string): void {
  incCounter("amc_approvals_requests_total", "Approval requests", { actionClass, riskTier }, 1);
}

export function recordApprovalDecisionMetric(decision: string, actionClass: string): void {
  incCounter("amc_approvals_decisions_total", "Approval decisions", { decision, actionClass }, 1);
}

export function recordGatewayRequestMetric(
  route: string,
  method: string,
  status: number,
  durationMs: number,
  upstream: string
): void {
  const methodUpper = method.toUpperCase();
  incCounter(
    "amc_gateway_requests_total",
    "Total gateway proxy requests",
    { route, method: methodUpper, status: String(status), upstream },
    1
  );
  observeHistogram(
    "amc_gateway_request_duration_seconds",
    "Gateway proxy request duration seconds",
    { route, method: methodUpper, upstream },
    Math.max(0, durationMs) / 1000,
    HTTP_BUCKETS
  );
}

export function recordGatewayFailureMetric(stage: string, upstream: string, errorClass: string): void {
  incCounter(
    "amc_gateway_failures_total",
    "Gateway proxy failures by stage and class",
    { stage, upstream, errorClass },
    1
  );
}

export function recordGatewayTraceContextMetric(state: "propagated" | "generated" | "invalid"): void {
  incCounter("amc_gateway_trace_context_total", "Gateway trace context handling results", { state }, 1);
}

export function setRetentionSegmentsMetric(total: number): void {
  setGauge("amc_retention_segments_total", "Retention segments total", {}, total);
}

export function setBlobMetrics(total: number, bytes: number): void {
  setGauge("amc_blobs_total", "Blob object count", {}, total);
  setGauge("amc_blobs_bytes_total", "Blob object bytes", {}, bytes);
}

export function setDbSizeMetric(bytes: number): void {
  setGauge("amc_db_size_bytes", "SQLite DB file size", {}, bytes);
}

export function incrementTransparencyRootChanges(): void {
  incCounter("amc_transparency_root_changes_total", "Transparency root updates", {}, 1);
}

export function setIntegrityGauge(scope: "fleet" | "enterprise" | "agent", id: string, value: number): void {
  setGauge(
    "amc_integrity_index_gauge",
    "Integrity index gauge",
    {
      scope,
      idHash: stableAgentHash(id)
    },
    value
  );
}
