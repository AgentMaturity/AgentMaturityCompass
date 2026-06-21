# GAP-0644 — OpenLLMetry replay-corpus boundary

- Gap: `GAP-0644`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/traceloop/openllmetry`
- Retrieval: `2026-06-21T04:19:24Z` via GitHub API (`status=200`, default branch `main`, license `Apache-2.0`, metadata SHA-256 `c8180eb9bb19b7232500d3723b0947bcde47b6a2604b5a19b1ac82ab71f36d88`)

## Relevance decision

Relevant to AMC only as source-review context for existing eval replay-corpus and Watch observability proof paths. OpenTelemetry-style tracing/observability concepts map to AMC-owned replay manifests, trace/export hashes, result/report hashes, score deltas, CI receipts, and signed evidence refs.

This does not justify an OpenLLMetry SDK integration, OpenTelemetry exporter/importer, trace schema mirror, parity layer, or copied upstream config/examples. Source metadata alone remains rejected.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Accepted only through an AMC-owned replay corpus with signed baseline/candidate rows and score deltas. |
| Shield | Accepted only when safety/guardrail trace evidence is caller-owned and signed. |
| Watch | Relevant through existing observability/replay watch alerts, not a new telemetry subsystem. |
| Enforce/Vault/Fleet/Passport/Comply | No direct scope for this gap. |

## No-copy boundary

No upstream code, docs prose, examples, SDK setup, telemetry schema, config, trace data, screenshots, or implementation details were copied.
