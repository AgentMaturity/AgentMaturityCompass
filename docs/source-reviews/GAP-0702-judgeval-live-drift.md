# GAP-0702 - Judgeval live-drift boundary

- Gap: `GAP-0702`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/JudgmentLabs/judgeval`
- Retrieval: `2026-06-21` via GitHub connector repository metadata and live `README.md` fetch; shell network remains DNS-restricted in this environment.
- Status: closed through existing Watch live score and behavior drift receipts; no Judgeval SDK, CLI, MCP, OpenTelemetry, or provider integration added.

## Live source metadata

The GitHub connector identifies `JudgmentLabs/judgeval` as a public repository with repository id `878272507`, default branch `main`, size `231070`, not archived, owner organization `JudgmentLabs`, and clone URL `https://github.com/JudgmentLabs/judgeval.git`. The connector also confirms read-only permissions in this environment and fetched the live `README.md`, modified `2026-05-12T08:53:02Z`.

The live README metadata describes Judgeval as a Python SDK for agent improvement with tracing and agent-judge evaluation for LLM-powered applications. Relevant source-review signals include production-data-backed failure detection, root-cause triage, validating fixes against production cases, OpenTelemetry-based tracing, captured inputs/outputs/token usage, prompt-based agent judges, scored/labeled behavior records over time, live production traffic monitoring, replay on historical traces, Slack regression alerts, integrations with OpenAI, Anthropic, Google GenAI, Together AI, LangGraph, OpenLit, and Claude Agent SDK, terminal management of agents/traces/judges/behaviors/evaluations, and an MCP server for querying traces, invoking judges, browsing behaviors, and surfacing failures. These facts are live-drift and observability context only. No upstream code, README prose beyond short metadata facts, SDK install snippets, API-key examples, Python examples, CLI command examples, MCP configs, docs prose, badge assets, telemetry payloads, trace rows, judge prompts, behavior outputs, screenshots, or implementation details were copied into AMC.

## Relevance decision

Judgeval is relevant to AMC as live score and behavior drift context because it centers on tracing, judges, production monitoring, behavior records, regression alerts, and historical trace replay. AMC already has the right generic Watch primitive for this: baseline/live windows, score distributions, behavior signatures, drift statistics, alert receipts, source refs, signed evidence refs, row hashes, receipt hashes, and Watch alert projection.

This does not require a Judgeval SDK, OpenTelemetry collector, CLI wrapper, MCP connector, provider integration, historical trace importer, judge runner, Slack alert integration, or behavior store. GAP-0702 is closed by documenting the source boundary and adding regression coverage that Judgeval-style production-monitoring drift uses the existing generic `live-score-behavior-drift` path. Repository or README metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing baseline/live score distributions and signed row evidence. |
| Shield | Relevant through fail-closed signed evidence requirements for observed behavior changes and regression alerts. |
| Watch | Relevant through existing drift statistics, alert receipts, receipt hashes, and Watch alert projection. |
| Enforce | No runtime policy, provider wrapper, OpenTelemetry processor, or circuit breaker changed. |
| Vault | No API keys, trace payloads, inputs, outputs, token usage, behavior records, or secure-storage behavior changed. |
| Fleet | Agent monitoring and judge context only; no Judgeval scheduler, CLI, MCP, or trust topology was added. |
| Passport | No portable proof-bundle field or external credential changed. |
| Comply | No observability, open-source, provider, or audit-control mapping changed. |

## Product closure

No `src/watch/liveDriftAlerts.ts`, `src/drift/continuousMonitor.ts`, `src/score/index.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Judgeval SDK wrapper, OpenTelemetry collector, CLI wrapper, MCP connector, provider adapter, historical trace importer, judge runner, Slack alert integration, behavior store, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0702.

The focused regression exercises the existing Watch live-drift engine with Judgeval-style fixture data. The positive path emits score, behavior, latency, and cost Watch alerts with valid signed live-drift receipts. The negative path fails closed when live rows carry source metadata but no signed evidence.

## Fail-closed rule

Judgeval repository identity, repository id, branch name, README labels, Python SDK labels, agent-improvement labels, OpenTelemetry labels, tracing labels, input/output/token usage labels, agent-judge labels, scored/labeled behavior labels, production-monitoring labels, historical-trace replay labels, Slack alert labels, provider/framework integration labels, CLI labels, MCP labels, local backlog metadata, or source identity alone must fail closed for live score and behavior drift claims. Passing evidence requires AMC-owned baseline distributions, live sample rows, behavior signatures, drift statistics, alert receipts, source refs, receipt hashes, signed evidence refs, row hashes, Watch alert or waiver proof, and no-copy proof.

## No-bloat boundary

No Judgeval SDK integration, OpenTelemetry collector, provider wrapper, CLI wrapper, MCP connector, historical trace importer, judge runner, prompt-based scorer adapter, behavior store, Slack alert integration, terminal workflow, documentation crawler, GitHub importer, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream code, README prose beyond short metadata facts, SDK install snippets, API-key examples, Python examples, CLI command examples, MCP configs, docs prose, badge assets, telemetry payloads, trace rows, judge prompts, behavior outputs, screenshots, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0702JudgevalLiveDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
