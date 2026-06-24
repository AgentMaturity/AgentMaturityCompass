# GAP-0696 - Langtrace live-drift boundary

- Gap: `GAP-0696`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/Scale3-Labs/langtrace`
- Retrieval: `2026-06-21` via browser access to the live GitHub repository page; shell network remains DNS-restricted in this environment.
- Status: closed through existing Watch live score and behavior drift receipts; no Langtrace, OpenTelemetry, or SDK integration added.

## Live source metadata

The live GitHub page identifies `Scale3-Labs/langtrace` as a public repository on branch `main`, with `1.2k stars`, `124 forks`, `0 issues`, `1 pull request`, and `701 commits`. The repository page shows AGPL-3.0 license for the application repository, notes the SDKs use Apache 2.0 License, and lists `93 releases`, with latest release `4.0.11` on `Apr 17, 2025`. The language panel lists `TypeScript 99.4%`.

The live README metadata describes Langtrace as open-source observability for LLM applications. Relevant source-review signals include Open Telemetry support, Real-time Monitoring, Performance Insights for latency, costs, and usage patterns, Debug Tools, Analytics, Self-hosting, TypeScript SDK, Python SDK, traces and metrics for LLM APIs, vector databases, and LLM frameworks. These facts are observability and live-drift context only. No upstream code, SDK install snippets, API-key examples, README prose beyond short metadata facts, screenshots, OpenTelemetry semantic conventions, integration tables, self-hosting configs, Docker files, trace payloads, metrics rows, or implementation details were copied into AMC.

## Relevance decision

Langtrace is relevant to AMC as live score and behavior drift context because LLM observability tools focus on traces, metrics, latency, cost, usage, evaluations, and real-time debugging. AMC already has the right generic Watch primitive for this: baseline/live windows, score distributions, behavior signatures, drift statistics, alert receipts, source refs, signed evidence refs, row hashes, receipt hashes, and Watch alert projection.

This does not require a Langtrace SDK, OpenTelemetry collector, self-hosted stack, provider integration, or trace importer. GAP-0696 is closed by documenting the source boundary and adding regression coverage that Langtrace-style observability drift uses the existing generic `live-score-behavior-drift` path. Repository metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing baseline/live score distributions and signed row evidence. |
| Shield | Relevant through fail-closed signed evidence requirements for observed behavior changes. |
| Watch | Relevant through existing drift statistics, alert receipts, receipt hashes, and Watch alert projection. |
| Enforce | No runtime policy, OpenTelemetry processor, or circuit breaker changed. |
| Vault | No API keys, trace payloads, vector database records, logs, metrics, or secure-storage behavior changed. |
| Fleet | Framework/provider integration context only; no Langtrace collector or trust topology was added. |
| Passport | No portable proof-bundle field or external credential changed. |
| Comply | No AGPL/SDK license, observability, or audit-control mapping changed. |

## Product closure

No `src/watch/liveDriftAlerts.ts`, `src/drift/continuousMonitor.ts`, `src/score/index.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Langtrace SDK wrapper, OpenTelemetry collector, semantic-convention parser, trace importer, metrics importer, self-hosting deployer, provider adapter, vector database adapter, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0696.

The focused regression exercises the existing Watch live-drift engine with Langtrace-style fixture data. The positive path emits score, behavior, latency, and cost Watch alerts with valid signed live-drift receipts. The negative path fails closed when live rows carry source metadata but no signed evidence.

## Fail-closed rule

Langtrace repository identity, stars, forks, issue or pull-request counts, commit counts, release labels, language labels, AGPL or Apache license labels, Open Telemetry labels, Real-time Monitoring labels, Performance Insights labels, latency/cost/usage labels, Debug Tools labels, Analytics labels, Self-hosting labels, TypeScript SDK labels, Python SDK labels, integration labels, local backlog metadata, or source identity alone must fail closed for live score and behavior drift claims. Passing evidence requires AMC-owned baseline distributions, live sample rows, behavior signatures, drift statistics, alert receipts, source refs, receipt hashes, signed evidence refs, row hashes, Watch alert or waiver proof, and no-copy proof.

## No-bloat boundary

No Langtrace SDK integration, OpenTelemetry collector, semantic-convention parser, trace importer, metrics importer, self-hosting deployer, Next.js/Postgres/ClickHouse stack, provider adapter, LLM framework adapter, vector database adapter, Docker setup, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream code, SDK install snippets, API-key examples, README prose beyond short metadata facts, screenshots, OpenTelemetry semantic conventions, integration tables, self-hosting configs, Docker files, trace payloads, metrics rows, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0696LangtraceLiveDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
