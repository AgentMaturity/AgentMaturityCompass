# Observability: OpenTelemetry export, usage reports and session export

AMC's native agent writes every session as signed, hash-chained rows. This page covers the three ways those rows reach an operator: GenAI-shaped traces and metrics over OTLP/HTTP JSON, the cross-session `amc usage` report, and the self-contained `amc session export` viewer with its offline verifier. Everything here reads the recorded rows; nothing here invents a count or a cost the rows do not carry.

## OpenTelemetry export (OTLP/HTTP JSON, no SDK dependency)

Export is off until asked for. `AMC_OTEL_ENABLED=1` is the only on switch; `OTEL_SDK_DISABLED=true` wins over it.

| Variable | Meaning |
| --- | --- |
| `AMC_OTEL_ENABLED` | `1` turns export on. Nothing is exported without it. |
| `AMC_OTEL_EXPORTERS` | `otlp`, `jaeger`, `zipkin` (comma separated). Unset with an `OTEL_EXPORTER_OTLP_ENDPOINT` present: one OTLP target. |
| `AMC_OTEL_OTLP_ENDPOINT` / `OTEL_EXPORTER_OTLP_ENDPOINT` | Base URL; `/v1/traces`, `/v1/metrics`, `/v1/logs` are appended. The `AMC_` form wins. |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, `..._METRICS_ENDPOINT`, `..._LOGS_ENDPOINT` | Signal-specific URLs, used verbatim. |
| `OTEL_EXPORTER_OTLP_HEADERS` | `key=value,key2=value2`, values percent-encoded. Sent on every request; never logged or shown by `otel-preview`. |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | Only `http/json` is served. `grpc` or `http/protobuf` disables export with a reason (shown by `otel-preview`); AMC adds no SDK or protobuf dependency. |
| `AMC_OTEL_SERVICE_NAME` / `OTEL_SERVICE_NAME`, `OTEL_RESOURCE_ATTRIBUTES` | Resource attributes. |
| `AMC_OTEL_MAX_BUFFER_SIZE`, `AMC_OTEL_FLUSH_TIMEOUT_MS`, `AMC_OTEL_FLUSH_MAX_RETRIES` | Buffer and dispatch bounds. |

Every POST passes the workspace's residency egress check before it is sent. Telemetry that cannot be sent (buffer cap, failed dispatch, exit budget) is counted in `TELEMETRY_DROPPED` audit rows, never silently lost.

### Span tree

Native session rows fold into one trace per session (trace id derived from the session id, so a resumed session lands in the same trace):

- `invoke_agent <agentId>` (INTERNAL): one segment per writer, from `session/open` or `session/resume` to `session/release` or `session/close`. Attributes `gen_ai.operation.name`, `gen_ai.agent.name`, `gen_ai.conversation.id`, `amc.session.id`, `amc.session.segment` (`open`/`resume`), `amc.session.end`.
- `turn <n>` (INTERNAL): `amc.turn`, `amc.turn.trigger`, `amc.turn.reason`; status ERROR unless the turn ended `complete`.
- `chat <model>` (CLIENT): `gen_ai.provider.name` and `gen_ai.system` (the recorded provider id), `gen_ai.request.model`, `gen_ai.response.finish_reasons`, `http.response.status_code`, `error.type` on a failure, `amc.request.digest`, `amc.request.duration_ms`, `amc.usage.status`, `amc.cost.basis`. Token attributes `gen_ai.usage.input_tokens`, `.output_tokens`, `.cache_read.input_tokens`, `.cache_write.input_tokens`, `.reasoning.output_tokens` appear only for a request whose provider reported them (`usage.status` complete or partial); `amc.cost.usd` only when the cost basis is `provider-reported` or `catalog-estimate`. The classification is the one `amc session show` prints for the same request, computed on its header and outcome rows.
- `execute_tool <name>` (INTERNAL): `gen_ai.tool.name`, `gen_ai.tool.call.id`, `gen_ai.tool.type=function`, `amc.tool.dispatch` (`native`/`code`), `amc.tool.args_sha256`, `amc.tool.outcome`, `amc.tool.exit_code`, `amc.tool.denied`; status ERROR unless the outcome was `OK`.
- `loop/retry` and `loop/cancel` rows become span events on the turn.

No prompt, tool argument, output or model text ever leaves the process: only digests, counts, names and durations. Spans still open when the exporter flushes (a crash, a `--keep-open` session, process exit) carry `amc.span.unterminated=true`; closers written by crash recovery carry `amc.span.interrupted=true`. Rows that are not native session rows keep the older per-row `amc.evidence.<type>` spans.

### Metrics

Delta temporality, one data point per (metric, attribute set) per flush:

- `gen_ai.client.inference.usage.input_tokens`, `.output_tokens`, `.cache_read.input_tokens`, `.cache_write.input_tokens`, `.reasoning.output_tokens` (`{token}`, monotonic sums): only provider-reported counts. A stub run, or a provider that reported nothing, produces no point: an absent count is never zero.
- `amc.request.cost.usd` (`USD`, sum, attribute `amc.cost.basis`): only when the basis is known.
- `gen_ai.client.operation.duration` (`s`, histogram with the GenAI convention's bounds) per chat request; `amc.tool.duration` per tool call.

Attributes on every point: `gen_ai.operation.name`, `gen_ai.provider.name`, `gen_ai.request.model`. Collectors expecting cumulative temporality must convert.

### Checking without a collector

`amc observe otel-preview --session <id> [--json]` folds a recorded session and prints the span tree, the metric points and the exact OTLP request bodies, offline. Endpoints are shown as host only; header values are never shown. The preview folds even when export is disabled and says why export is off.

### Exit flush

Short commands (`amc agent-loop run`, `amc chat`) flush buffered telemetry after their action with a 2 s budget (`flushSharedObservabilityExporter`), and `session/close` or `session/release` triggers a flush of its own. Before this build, a short run buffered its rows and lost them at exit without counting the loss.

### Limits

- OTLP over `http/json` only; gRPC and protobuf are deferred (D-02).
- No W3C `traceparent` propagation into provider requests (D-03) and no span link from a delegated child session to its parent (D-15).
- Content capture (prompts, arguments, outputs) is not offered, even opt-in (D-01).

## `amc usage`: usage and cost across sessions

```
amc usage [--since 7d|12h|30m|<iso>] [--until <iso>] [--by day|session|model|provider|agent] [--agent <id>] [--utc] [--expect-monitor <sha256>] [--json]
```

Reads every native row through the verified budget reader (chain, signatures, session envelopes and seals checked; `SQLite` plus the JSONL or Postgres session store). If the evidence does not verify the command exits 2 and prints no table. Folding is per request: each `request/header` is paired with its settlement and classified exactly as `amc session show` classifies it, then attributed by the header's timestamp to its bucket. A session that crosses midnight or switches model is split accordingly. Day buckets use the local calendar day budgets use (`--utc` switches).

Each bucket reports request counts (reported, unreported, synthetic, failed, pending, invalid), per-field token totals as `observed | unreported` with the number of reporting requests, cost as the reported subtotal and the catalog-estimate subtotal with the cost status and the number of unknown requests, and latency p50/p95 (nearest rank) over measured requests. A bucket holding an invalid request withholds its totals. The stub provider's zero tokens are synthetic and never counted as observed. `--json` emits `amc.usage-report/v1`; `verification` says `signed-rows (anchored)` only when `--expect-monitor` pinned the key, otherwise `signed-rows (unanchored)` (internal consistency, not authorship).

`amc costs show` is unchanged and reads imported external traces, not native sessions. `amc budgets status` keeps today's budget view with tool counts.

Limit: the report scans every row (the verified path); an indexed path is deferred (D-05).

## `amc session export`: a readable, verifiable session file

```
amc session export <id> --out s.html [--include-content] [--json-out s.json]
amc session verify-export s.html --expect-monitor <sha256> [--accept-unverifiable-content] [--json]
```

The export embeds the session's rows (every signed field), its lifecycle record (seal included), the usage projection, and exactly one public key: the workspace's current ledger-row key. Every row and the seal must verify under that key at export time; a session signed by a rotated key is refused rather than exported with a key list anyone could extend. The key's fingerprint is printed for out-of-band sharing; the file never vouches for its own key.

By default the file carries digests only. `--include-content` embeds system prompts, messages, assistant text, tool arguments and tool outputs (including unified diffs from `fs.write`/`fs.edit`): each payload is checked against its committed digest, run through secret redaction, bounded at 256 KiB per payload and 16 MiB in total, and spilled tool output is read through the verified spill reader with its commitment digest. It is refused whenever the session falls under the ledger payload encryption regime (P2-09): the workspace policy enables `ledgerEncryptionEnabled`, or any inline payload is an encrypted field. The policy check covers every row, blobs included, so a regime-on session stored as blobs is refused too. Blob and spill payloads under the workspace's default blob encryption are outside that regime: every reader decrypts them, and the export carries them decrypted, redacted and bounded, the same bytes `amc session show` prints.

The HTML viewer renders the embedded JSON through DOM text nodes only, loads nothing (CSP `default-src 'none'`), escapes `<`, `>` and `&` inside the JSON so model or tool text cannot inject markup, and performs no verification: it says so and names the verifier.

`verify-export` is the authoritative check. It compares the embedded key against the pinned fingerprint and admits it through the same trust path as `session verify-proof` (distrust and revocation lists apply, P0-51), recomputes every row's hash and signature, checks the per-session sequence and chain, checks that a closed session's seal names the last row, checks that the embedded usage summary equals the one recomputed from the rows, and checks embedded content against each row's digest where it was neither redacted, truncated nor spilled. Content that was redacted, truncated or spilled cannot be checked against its digest, so it fails the verdict unless `--accept-unverifiable-content` is passed, and the output then says those entries were accepted as display-only. Content attached to a row that carries none (lifecycle or request rows) is refused. An HTML export is accepted only when the file is, byte for byte, the canonical rendering of its embedded document: a decoy JSON block, an edited page, an inserted comment or trailing bytes are refused, so what the verifier checks is exactly what the page shows. An open or released session verifies its rows but reports `tail unproven`: a truncated row list cannot be detected without a seal. Exit codes follow the other verify commands (0 trusted, 1 failed, 2 integrity-only).

Limits: the global ledger chain is not checked on a slice (use `amc session verify`); the export is a copy of signed rows, not a transparency anchor (`amc session anchor` / `proof` remain the anchoring path).
