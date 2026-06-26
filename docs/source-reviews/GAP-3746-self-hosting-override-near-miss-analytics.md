# GAP-3746 - Self-Hosting-Guide override and near-miss analytics boundary

- Gap: `GAP-3746`
- Dimension: `human-override-analytics`
- AMC surfaces requested: Watch, Studio, API
- Source reviewed: `https://github.com/mikeroyal/Self-Hosting-Guide`, `https://api.github.com/repos/mikeroyal/Self-Hosting-Guide`, `https://raw.githubusercontent.com/mikeroyal/Self-Hosting-Guide/main/README.md`, `https://raw.githubusercontent.com/mikeroyal/Self-Hosting-Guide/main/CONTRIBUTING.md`, and `https://api.github.com/repos/mikeroyal/Self-Hosting-Guide/contents?ref=main`
- Retrieval: live GitHub repository, GitHub API, raw README, raw contributing guide, and contents API checks on 2026-06-26.
- Status: closed through a generic AMC Watch override and near-miss analytics receipt; no Self-Hosting-Guide integration, importer, catalog mirror, deployment guide, dashboard clone, or source-specific route added.

## Live source metadata

The backlog identifies `mikeroyal/Self-Hosting-Guide` as source `GAP-3746`, category `Observability, monitoring, and traces`, dimension `Override and near-miss analytics`, and requested Watch, Studio, and API surfaces. The acceptance line requires `Override event, reason code, trend window, near-miss link, and action taken`.

Live retrieval on 2026-06-26 verified:

- Repository page `https://github.com/mikeroyal/Self-Hosting-Guide` returned HTTP 200, 265,312 bytes, first-200KB hash `57bc546bb0344eb7269ebe69fd373528d284f07022f3416cff01ce5e2b443fce`, and contained reviewed metadata phrases including `Self-Hosting Guide`, `locally hosting`, `on premises`, `private web servers`, `software applications`, `LLMs`, `Automation`, `Home Assistant`, `Networking`, `authentication`, `privacy`, `observability`, `self-hosted`, `docker-compose`, and `WireGuard`.
- Repository API `https://api.github.com/repos/mikeroyal/Self-Hosting-Guide` returned HTTP 200, first-200KB hash `1fc991290cc6b95f1abc24ebdaf6b044b9a74f2a12d7f0fce2789678a184245d`, full name `mikeroyal/Self-Hosting-Guide`, default_branch `main`, language `Dockerfile`, 21,687 stars, 1,089 forks, 59 open issues, pushed_at `2025-06-27T01:51:16Z`, updated_at `2026-06-26T02:45:09Z`, archived `false`, disabled `false`, and description `Self-Hosting Guide. Learn all about  locally hosting (on premises & private web servers) and managing software applications by yourself or your organization. Including Cloud, LLMs, WireGuard, Automation, Home Assistant, and Networking.`
- Repository topics include authentication, awesome, awesome-list, decentralized, docker-compose, home-assistant, home-automation, linux, oauth, observability, open-source, privacy, raspberry-pi, reverse-proxy, search, self-hosted, self-hosting, selfhosted, ssh, and wireguard.
- Raw README `https://raw.githubusercontent.com/mikeroyal/Self-Hosting-Guide/main/README.md` returned HTTP 200, 588,407 bytes, first-200KB hash `2cff677f055f8f055b95acab2c4ab85ca128cc54a9b8c3d5fb8d7ae849bb27b6`, and contained reviewed metadata phrases including `locally hosting`, `on premises`, `private web servers`, `software applications`, `LLMs`, `Automation`, `Home Assistant`, `Networking`, `authentication`, `privacy`, `observability`, `self-hosted`, `docker-compose`, and `WireGuard`.
- Raw contributing guide `https://raw.githubusercontent.com/mikeroyal/Self-Hosting-Guide/main/CONTRIBUTING.md` returned HTTP 200, 652 bytes, first-200KB hash `73592ac012f869e3a4f9dc5d0c37a5ab987b62d85d946733ca3252ada355bcff`.
- Contents API `https://api.github.com/repos/mikeroyal/Self-Hosting-Guide/contents?ref=main` returned HTTP 200, first-200KB hash `9117ebaf3509a854361e85718644c69a3dd0efab8461261721847d98d12df844`.

This is weak source context for the requested dimension. The repository is a broad self-hosting and infrastructure guide, not a human override or agent near-miss analytics product. It is useful only as operational context around self-hosted systems, authentication, privacy, observability, automation, networking, and LLM-related infrastructure.

## Relevance decision

GAP-3746 is relevant to AMC because operators need Watch evidence when humans override agent decisions, ignore escalations, catch near misses, or repeatedly approve the same risky pattern. Those signals should be searchable by agent, use case, reason code, risk event, failure mode, prompt/tool boundary, cost, latency, and remediation state before incidents accumulate.

The source does not justify a Self-Hosting-Guide adapter, catalog mirror, deployment parser, or source-specific UI. The accepted AMC primitive is a generic override and near-miss analytics receipt. Passing evidence requires AMC-owned override events, reason codes, trend-window proof, near-miss links, action-taken records, row hashes, clusters, trends, repeated approval patterns, and Watch alert projection.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant downstream when override/near-miss trends explain score regressions; no scoring methodology version changed. |
| Shield | Relevant when near misses or ignored escalations reveal safety or review gaps. |
| Enforce | Context only; no runtime block, policy action, or circuit breaker changed. |
| Vault | Context only; no secrets, DLP, privacy, residency, or secure-storage behavior changed. |
| Watch | Primary surface; receipts index override and near-miss events, clusters, trends, and alerts. |
| Fleet | Relevant when patterns are grouped by agent and use case; no Fleet schema changed. |
| Passport | Downstream proof-bundle context only; no Passport schema changed. |
| Comply | Human oversight audit context only; no compliance mapping changed. |

## Product closure

Added generic AMC Watch primitives:

- `buildOverrideNearMissAnalyticsReceipt`
- `buildOverrideNearMissWatchAlerts`

The receipt binds Watch, Studio, and API surfaces by producing a searchable trace index, failure clusters, live override/near-miss/ignored-escalation/approval trends, repeated approval pattern rows, fail-closed reasons, Watch alerts, and a receipt hash.

Added focused regression `tests/gap3746SelfHostingOverrideNearMissAnalyticsBoundary.test.ts`.

The positive path proves AMC can track human overrides, ignored escalations, near misses, and repeated approval patterns by agent and use case. The negative paths prove metadata-only source evidence fails closed, and each event requires reason code, action taken, near-miss link where applicable, and evidence refs.

## Fail-closed rule

Self-Hosting-Guide source identity, GitHub repository metadata, README metadata, contributing guide metadata, contents metadata, stars, forks, open issues, default branch, language, topics, self-hosting labels, authentication labels, privacy labels, observability labels, LLM labels, Automation labels, Home Assistant labels, Networking labels, Docker Compose labels, WireGuard labels, local backlog metadata, or source identity alone must fail closed for override and near-miss analytics proof.

Passing proof requires AMC-owned override or near-miss events, reason code, trend window, trend-window evidence refs, near-miss link where applicable, action taken, failure mode, risk event, prompt/tool boundary, latency, cost, remediation state, event evidence refs, row hashes, clusters, repeated approval pattern evidence, receipt hash, and no-copy proof.

## No-bloat boundary

No Self-Hosting-Guide adapter, GitHub catalog importer, README parser, deployment guide mirror, self-hosting scanner, Docker Compose importer, WireGuard importer, Home Assistant integration, observability catalog connector, authentication catalog connector, source-specific Watch monitor, Studio panel, API route, CLI command, Fleet migration, Passport field, methodology bump, package dependency, or source-specific scoring path was added.

No upstream code, README prose beyond short metadata phrases, docs prose beyond short metadata phrases, resource lists, examples, configs, screenshots, tables, generated outputs, or implementation details were copied into AMC.

## Verification

- Expected-red focused test: `npx vitest run tests/gap3746SelfHostingOverrideNearMissAnalyticsBoundary.test.ts --reporter=dot` failed because `src/watch/overrideNearMissAnalytics.ts` did not exist.
- Focused test after implementation: `npx vitest run tests/gap3746SelfHostingOverrideNearMissAnalyticsBoundary.test.ts --reporter=dot`
- Paired Watch/oversight regression: `npx vitest run tests/gap3746SelfHostingOverrideNearMissAnalyticsBoundary.test.ts tests/humanOversightQualitySignals.test.ts tests/gap3619ApprovalLatencySloBoundary.test.ts tests/gap3626EscalationQualityScoringBoundary.test.ts tests/watch.test.ts tests/traceFailureIndex.test.ts --reporter=dot`
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot`
