---
"agent-maturity-compass": minor
---

Observability for the native agent (SH-OBS-01, -02, -03): GenAI-shaped OpenTelemetry traces and metrics over OTLP/HTTP JSON, a cross-session usage report, and a verifiable session export.

- Native session rows now export as one trace per session: `invoke_agent` → `turn` → `chat <model>` (CLIENT) and `execute_tool <name>` spans with `gen_ai.*` attributes, plus delta sums for provider-reported tokens, `amc.request.cost.usd` when the cost basis is known, and duration histograms. A request's usage and cost on a span are classified exactly as `amc session show` classifies them; the stub's synthetic zeros and unreported counts produce no value. Standard `OTEL_EXPORTER_OTLP_*`, `OTEL_SERVICE_NAME`, `OTEL_RESOURCE_ATTRIBUTES` and `OTEL_SDK_DISABLED` are honoured; `AMC_OTEL_ENABLED` stays the only on switch; an unsupported protocol disables export with a reason. Short commands flush within a 2 s budget before exit (before, their rows were lost at exit uncounted). `amc observe otel-preview --session <id>` prints the payloads offline.
- `amc usage [--since] [--until] [--by day|session|model|provider|agent] [--agent] [--utc] [--expect-monitor] [--json]` reports requests, tokens (observed or unreported, never zero for the unreported), cost (reported and catalog estimate with status) and latency per bucket from verified rows; exit 2 with no table when the evidence does not verify.
- `amc session export <id> --out s.html [--include-content]` writes a self-contained viewer that embeds the signed rows, the seal and one ledger-row key, with content redacted and bounded when asked for; `amc session verify-export s.html --expect-monitor <sha256>` verifies rows, chain, seal and content digests offline through the trust-flag path. Open sessions report `tail unproven`.

freeze-exception: SH-OBS — `observe otel-preview`, `usage`, `session export` and `session verify-export` are new commands of the state-of-the-art harness program.
