# GAP-3755 - HertzBeat live-drift boundary

- Gap: `GAP-3755`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Watch, Studio, API
- Source reviewed: `https://github.com/apache/hertzbeat`, `https://api.github.com/repos/apache/hertzbeat`, `https://raw.githubusercontent.com/apache/hertzbeat/master/README.md`, `https://raw.githubusercontent.com/apache/hertzbeat/master/LICENSE`, `https://api.github.com/repos/apache/hertzbeat/contents?ref=master`, and prior review `docs/source-reviews/GAP-0642-hertzbeat-public-methodology.md`
- Retrieval: live GitHub API/raw-source checks on 2026-06-26.
- Status: closed through AMC's existing Watch live score and behavior drift receipts; no HertzBeat integration, monitor importer, alert bridge, or observability subsystem added.

## Live source metadata

The backlog identifies `apache/hertzbeat` as source `GAP-3755`, category `Observability, monitoring, and traces`, dimension `Live score and behavior drift alerts`, and requested Watch, Studio, and API surfaces.

Live retrieval on 2026-06-26 verified:

- Repository API `https://api.github.com/repos/apache/hertzbeat` returned HTTP 200, first-200KB hash `7a104907dd269168d3c0f7d308b1d792bc05deca7d52e83aa795e1cc54f05c8a`.
- Repository full name `apache/hertzbeat`, default_branch `master`, license `Apache-2.0`, language `Java`, 7,292 stars, 1,301 forks, 341 open issues, pushed_at `2026-06-22T04:47:17Z`, updated_at `2026-06-25T20:38:37Z`.
- Repository description identifies an `AI-powered next-generation open source real-time observability system`.
- Topics include agent, ai, alerting, database, grafana, linux, llm, logs, metrics, monitor, monitoring, notifications, observability, prometheus, self-hosted, server, status, status-page, uptime, and zabbix.
- README raw URL `https://raw.githubusercontent.com/apache/hertzbeat/master/README.md` returned HTTP 200, 131,983 bytes, first-200KB hash `ef8de9d50f539b546658f0c527db200dd5c22ec3971b07ca678c356f14f5637f`, with reviewed metadata phrases including AI-powered, real-time observability, Agent, alerting, logs, metrics, Prometheus, status page, and MCP.
- License raw URL `https://raw.githubusercontent.com/apache/hertzbeat/master/LICENSE` returned HTTP 200, 12,587 bytes, first-200KB hash `49798571faa8ecec92a68dc6a5e5c260bafeb0dbf47e406fc2ba87d3a0b41311`.
- Top-level contents API `https://api.github.com/repos/apache/hertzbeat/contents?ref=master` returned HTTP 200, first-200KB hash `a6729b4dea2d98a9f13c99f4e81eb4edcd0963cd80a038e873e18315fc630071`, and top-level names including `.github`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `LICENSE`, `NOTICE`, `README.md`, `SECURITY.md`, `e2e`, `hertzbeat-ai`, `hertzbeat-alerter`, `hertzbeat-base`, `hertzbeat-collector`, `hertzbeat-common-core`, `hertzbeat-manager`, `hertzbeat-otel`, `hertzbeat-plugin`, `hertzbeat-push`, `hertzbeat-warehouse`, `mcp-servers`, `template-marketplace`, and `web-app`.
- Prior AMC review `docs/source-reviews/GAP-0642-hertzbeat-public-methodology.md` already closed HertzBeat as observability context only for methodology purposes, with no public methodology version bump.

These facts are relevant as observability, monitoring, metrics, logs, alerts, notifications, uptime, status-page, Prometheus, OpenTelemetry-adjacent, and agent/AI monitoring context only. They do not provide AMC live-drift evidence.

## Relevance decision

GAP-3755 is relevant to AMC because production agents can degrade after traffic, provider, prompt, policy, tool, data, routing, or observability pipeline changes. A credible AMC live-drift claim must compare a baseline distribution to a live sample, compute a drift statistic, emit an alert receipt, and bind the result to signed evidence.

HertzBeat is a useful source-review signal because it is a real-time observability system with alerting, logs, metrics, monitoring, notifications, uptime, status-page, Prometheus, OpenTelemetry-related module names, and agent/AI labels. AMC should not copy or mirror HertzBeat. The accepted AMC primitive is the existing source-independent `runLiveScoreBehaviorDrift` path with Watch alert projection.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing baseline/live score distributions tied to signed row evidence. |
| Shield | Relevant only when behavior drift affects safety, refusal, unsupported-action, error, or policy-relevant metrics with signed evidence. |
| Enforce | Context only; no guardrail or policy enforcement rule changed. |
| Vault | Context only; no storage, DLP, secret, or residency rule changed. |
| Watch | Primary surface; existing live score and behavior drift receipts emit baseline/live drift statistics, alert receipts, and Watch alerts. |
| Fleet | Context only; no orchestration topology changed. |
| Passport | Context only; no proof-bundle schema changed. |
| Comply | Context only; no compliance mapping changed. |

## Product closure

No product code change was required for GAP-3755. AMC already has the generic Watch primitive for this gap:

- `runLiveScoreBehaviorDrift`
- `verifyLiveDriftReceipt`
- `buildLiveDriftWatchAlerts`

Added focused regression `tests/gap3755HertzbeatLiveDriftBoundary.test.ts`.

The positive path proves that HertzBeat observability context can be cited only with AMC-owned baseline rows, live rows, behavior signatures, source refs, signed evidence refs, drift statistics, and Watch alert projection. The negative path proves repository metadata fails closed when live rows lack signed evidence.

No HertzBeat-specific product code, route, schema, UI, connector, importer, monitor bridge, alert bridge, OpenTelemetry bridge, or Prometheus bridge was added.

## Fail-closed rule

HertzBeat repository URL, GitHub API metadata, README content, license metadata, star/fork/issue counts, default branch, Java language label, Apache-2.0 license label, AI-powered next-generation open source real-time observability system label, agent label, alerting label, logs label, metrics label, monitoring label, notifications label, observability label, Prometheus label, status page label, uptime label, MCP label, module names such as hertzbeat-ai, hertzbeat-otel, hertzbeat-alerter, prior methodology review, local backlog metadata, or source identity alone must fail closed for live score and behavior drift claims.

Passing evidence requires AMC-owned baseline distribution, live sample rows, score distributions, behavior signatures, drift statistic, alert receipt, source refs, receipt hash, signed evidence refs, row hashes, Watch alert or waiver proof, and no-copy proof.

## No-bloat boundary

No HertzBeat adapter, API client, SDK wrapper, repository importer, monitor importer, alert importer, metric importer, log importer, OpenTelemetry bridge, Prometheus bridge, Grafana bridge, Zabbix bridge, status-page clone, uptime monitor, notification integration, MCP server bridge, hertzbeat-ai bridge, hertzbeat-alerter bridge, source-specific Watch monitor, API/CLI route, Studio panel, Passport schema change, methodology bump, provider parity claim, or source-specific scoring path was added.

No upstream code, README prose beyond short metadata phrases, license text, docs prose, screenshots, configs, templates, dashboards, metric definitions, alert examples, notification examples, prompts, datasets, generated outputs, or implementation details were copied into AMC.

## Verification

- Expected-red focused test: `npx vitest run tests/gap3755HertzbeatLiveDriftBoundary.test.ts --reporter=dot` failed because this source-review doc did not exist; 3 live-drift/no-bloat tests passed.
- Focused test after doc: `npx vitest run tests/gap3755HertzbeatLiveDriftBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired live-drift regression: `npx vitest run tests/gap3755HertzbeatLiveDriftBoundary.test.ts tests/gap3743ArizeLiveDriftBoundary.test.ts tests/gap0019HumanloopLiveDriftBoundary.test.ts tests/gap0023LiteralAiLiveDriftBoundary.test.ts tests/liveDriftAlerts.test.ts --reporter=dot` passed, 5 files / 97 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 1027 files / 8124 tests.
