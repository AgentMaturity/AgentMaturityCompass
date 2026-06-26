# GAP-3752 - OpenTelemetry GenAI risk/cost/latency SLO boundary

- Gap: `GAP-3752`
- Dimension: `obs-risk-cost-latency-slo`
- AMC surfaces requested: Watch, Studio, API
- Source reviewed: `https://opentelemetry.io/docs/specs/semconv/gen-ai/`, `https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/`, and `https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-metrics/`
- Retrieval: live OpenTelemetry semantic-convention page checks on 2026-06-26.
- Status: closed through AMC's generic risk, cost, and latency SLO receipt builder; no OpenTelemetry collector, semantic-convention importer, trace pipeline, dashboard clone, or source-specific route added.

## Live source metadata

The backlog identifies `OpenTelemetry GenAI` as source `GAP-3752`, category `Observability, monitoring, and traces`, dimension `Risk, cost, and latency SLOs`, and requested Watch, Studio, and API surfaces. The acceptance line requires `SLO definition, time window, breach evidence, and alert routing`.

Live retrieval on 2026-06-26 verified:

- GenAI semantic-convention page `https://opentelemetry.io/docs/specs/semconv/gen-ai/` returned HTTP 200, 172,605 bytes, first-200KB hash `92f4765e5ea07d8c05beb8c6a22839634f4633a865ecd8205958e132407d8cbd`, and contained reviewed metadata phrases including `GenAI`, `Semantic Conventions`, `spans`, `metrics`, `events`, `operation`, `request`, `response`, `token`, `usage`, `client`, `server`, `system`, `error`, `tool`, `agent`, and `OpenTelemetry`.
- GenAI spans page `https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/` returned HTTP 200, 171,314 bytes, first-200KB hash `50f421fdcea87172c07caec93cc8c7646378febb7d312f12c5f0ae8dd49d6353`, and contained reviewed metadata phrases including `GenAI`, `Semantic Conventions`, `spans`, `metrics`, `events`, `operation`, `request`, `response`, `token`, `usage`, `client`, `server`, `system`, `error`, `tool`, `agent`, and `OpenTelemetry`.
- GenAI metrics page `https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-metrics/` returned HTTP 200, 171,338 bytes, first-200KB hash `608a266fe57f97bae8ee65f2ec568bc522e4ceb90f5d3a3746bb835d3ecb8b80`, and contained reviewed metadata phrases including `GenAI`, `Semantic Conventions`, `spans`, `metrics`, `events`, `operation`, `request`, `response`, `token`, `usage`, `client`, `server`, `system`, `error`, `tool`, `agent`, and `OpenTelemetry`.

These facts are relevant as public observability, trace, span, metric, event, request, response, token usage, system, error, tool, and agent telemetry context only. They do not provide AMC SLO proof.

## Relevance decision

GAP-3752 is relevant to AMC because an agent can look safe in one dashboard while still being too slow, too costly, too risky, or too dependent on human escalation to operate in production. The accepted AMC primitive is a generic per-agent operating SLO receipt that combines reliability, risk incidents, token cost, latency, and escalation rate across a declared time window.

The source signal maps to Watch/Studio/API through trace search, failure clusters, live risk/cost/latency trends, breach evidence, and alert routing. OpenTelemetry GenAI is only source-review context. AMC should not mirror semantic-convention tables, import upstream schemas, add a collector, or claim OpenTelemetry compatibility from metadata alone.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant as runtime SLO evidence that can explain score findings; no scoring methodology version changed. |
| Shield | Relevant when risk incidents and escalation breaches indicate safety or review gaps. |
| Enforce | Context only; no runtime guardrail, action block, or circuit breaker changed. |
| Vault | Context only; no secure storage, DLP, privacy, or residency behavior changed. |
| Watch | Primary surface; SLO receipts include trace index rows, failure clusters, live trends, breach evidence, and alert routing. |
| Fleet | Relevant because the receipt is per-agent and includes Fleet as a surface binding for operating posture. |
| Passport | Downstream proof-bundle context only; no Passport schema changed. |
| Comply | Audit context only; no compliance mapping changed. |

## Product closure

Product code changed in AMC's generic observability layer:

- Added `src/observability/riskCostLatencySlo.ts`.
- Exported the generic receipt builder and types from `src/index.ts`.
- Added focused regression `tests/gap3752OpenTelemetryGenAiRiskCostLatencySloBoundary.test.ts`.

The new builder creates a source-independent SLO receipt with:

- SLO definition and time window.
- Per-agent trace index entries with row hashes and searchable fields.
- Failure clusters by failure mode.
- Live trends for reliability, risk incidents, total cost, p95 latency, escalation rate, token count, failure modes, risk events, and remediation states.
- Breach evidence with observed values, thresholds, evidence refs, and alert route IDs.
- Watch-compatible alerts.
- Fail-closed reasons when SLO evidence, trace rows, or alert routing are missing.

No public API route was added because the gap can close through the existing exported AMC primitive and source-review receipt without inventing a source-specific runtime endpoint.

## Fail-closed rule

OpenTelemetry page status, GenAI labels, Semantic Conventions labels, span labels, metric labels, event labels, request labels, response labels, token usage labels, system labels, error labels, tool labels, agent labels, byte counts, hashes, source URL, local backlog metadata, or source identity alone must fail closed for risk, cost, and latency SLO proof.

Passing proof requires AMC-owned SLO definition, time window, objective thresholds, alert routing, trace rows, signed or hashed evidence refs, trace row hashes, trace search fields, failure clusters, live trend metrics, breach evidence, alert route IDs, receipt hash, and no-copy proof.

## No-bloat boundary

No OpenTelemetry collector, semantic-convention table importer, OTLP ingest path, span schema mirror, metric schema mirror, event schema mirror, GenAI compatibility claim, dashboard clone, source-specific Watch monitor, Studio panel, API route, CLI command, Fleet state migration, Passport field, methodology bump, package dependency, or source-specific scoring path was added.

No upstream code, semantic-convention tables, docs prose beyond short metadata phrases, examples, schemas, configs, screenshots, generated outputs, trace rows, metrics rows, event rows, or implementation details were copied into AMC.

## Verification

- Expected-red focused test: `npx vitest run tests/gap3752OpenTelemetryGenAiRiskCostLatencySloBoundary.test.ts --reporter=dot` first failed because the generic SLO module did not exist; after adding the generic module, the same command failed only because this source-review doc did not exist, with 3 tests passing.
- Focused test after doc: `npx vitest run tests/gap3752OpenTelemetryGenAiRiskCostLatencySloBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired observability regression: `npx vitest run tests/gap3752OpenTelemetryGenAiRiskCostLatencySloBoundary.test.ts tests/observability/sessionCorrelator.test.ts tests/traceFailureIndex.test.ts tests/observability/costTracker.test.ts tests/fleetGovernance.test.ts --reporter=dot` passed, 5 files / 32 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 1030 files / 8136 tests.
