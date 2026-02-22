# Metrics

AMC exposes Prometheus-compatible operational metrics.

## Endpoint
- `GET /metrics`
- Config:
  - `AMC_METRICS_BIND` (default `127.0.0.1`)
  - `AMC_METRICS_PORT` (default `9464`)
- CLI:
  - `amc metrics status`

## Security and Privacy
- Metrics labels never include secrets, leases, raw agent IDs, or file paths.
- Agent identity labels are hashed (`agentIdHash`).
- Public metrics bind requires LAN mode and CIDR allowlist checks.

## Core Metrics
- `amc_http_requests_total{route,method,status}`
- `amc_http_request_duration_seconds_bucket{route,method}`
- `amc_gateway_requests_total{route,method,status,upstream}`
- `amc_gateway_request_duration_seconds_bucket{route,method,upstream}`
- `amc_gateway_failures_total{stage,upstream,errorClass}`
- `amc_gateway_trace_context_total{state}`
- `amc_metrics_endpoint_requests_total{endpoint,method,status}`
- `amc_metrics_endpoint_duration_seconds_bucket{endpoint,method}`
- `amc_metrics_endpoint_denied_total{endpoint,method,reason}`
- `amc_leases_issued_total{agentIdHash,routeFamily}`
- `amc_toolhub_intents_total{agentIdHash,actionClass,mode}`
- `amc_toolhub_exec_total{agentIdHash,toolName,actionClass,status}`
- `amc_approvals_requests_total{actionClass,riskTier}`
- `amc_approvals_decisions_total{decision,actionClass}`
- `amc_retention_segments_total`
- `amc_blobs_total`
- `amc_blobs_bytes_total`
- `amc_db_size_bytes`
- `amc_transparency_root_changes_total`
- `amc_integrity_index_gauge{scope,idHash}`

## Operational Use
- Track readiness + request latency for service health.
- Track lease/tool/approval volume for control-plane load.
- Track retention/blob/db metrics for capacity planning.
- Track integrity gauges for recurrence and trust regression alerts.
