# GAP-0694 - ADK JS live-drift boundary

- Gap: `GAP-0694`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/google/adk-js`
- Retrieval: `2026-06-21` via browser access to the live GitHub repository page; shell network remains DNS-restricted in this environment.
- Status: closed through existing Watch live score and behavior drift receipts; no ADK JS integration or product code change.

## Live source metadata

The live GitHub page identifies `google/adk-js` as a public repository on branch `main`, with Apache-2.0 license, `1.2k stars`, `162 forks`, `12 issues`, `20 pull requests`, and `377 commits`. The repository page shows `32 releases`, with latest release `devtools: v1.2.0` on `Jun 3, 2026`. The language panel lists `TypeScript 96.9%`, `JavaScript 1.8%`, and other languages.

The live README metadata describes an open-source, code-first TypeScript toolkit for building, evaluating, and deploying sophisticated AI agents. Relevant source-review signals include flexible agent workflows, tool use in code, type safety, Zod validation, browser/server runtime support, built-in tools, multi-agent systems, sequential/parallel/loop/routed workflows, A2A protocol, a dev UI, CLI commands such as `adk run` and `adk web`, and deployment wording that includes `deploy cloud_run`. These facts are deployed-agent runtime and evaluation context only. No upstream code, TypeScript examples, install snippets, README prose beyond short metadata facts, screenshots, docs pages, sample commands, configs, release notes, model outputs, tutorials, or implementation details were copied into AMC.

## Relevance decision

ADK JS is relevant to AMC as live score and behavior drift context because deployed, tool-using, multi-agent TypeScript workflows can degrade after prompt, provider, tool, routing, data, traffic, or deployment changes. AMC already has the right generic Watch primitive for this: baseline/live windows, score distributions, behavior signatures, drift statistics, alert receipts, source refs, signed evidence refs, row hashes, receipt hashes, and Watch alert projection.

This does not require an ADK JS SDK, runner, dev UI, A2A connector, or Cloud Run deployment path. GAP-0694 is closed by documenting the source boundary and adding regression coverage that ADK-JS-style deployed-agent trace drift uses the existing generic `live-score-behavior-drift` path. Repository metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing baseline/live score distributions and signed row evidence. |
| Shield | Relevant through fail-closed signed evidence requirements for deployed-agent behavior changes. |
| Watch | Relevant through existing drift statistics, alert receipts, receipt hashes, and Watch alert projection. |
| Enforce | No TypeScript runtime guardrail, policy, circuit breaker, or tool-enforcement behavior changed. |
| Vault | No Google Cloud integration, API-key handling, data-residency, or secure-storage behavior changed. |
| Fleet | Multi-agent and A2A context only; no ADK JS agent runner, A2A adapter, or trust topology was added. |
| Passport | No portable proof-bundle field, token, or external credential changed. |
| Comply | No cloud or regulated-domain compliance mapping changed. |

## Product closure

No `src/watch/liveDriftAlerts.ts`, `src/drift/continuousMonitor.ts`, `src/score/index.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, TypeScript SDK wrapper, package integration, ADK runner, dev UI clone, A2A connector, Google Cloud connector, Cloud Run deployer, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0694.

The focused regression exercises the existing Watch live-drift engine with ADK-JS-style fixture data. The positive path emits score, behavior, latency, and cost Watch alerts with valid signed live-drift receipts. The negative path fails closed when live rows carry source metadata but no signed evidence.

## Fail-closed rule

ADK JS repository identity, stars, forks, issue or pull-request counts, commit counts, release labels, language labels, topic labels, code-first TypeScript labels, evaluating labels, multi-agent labels, A2A protocol labels, dev UI labels, CLI command labels, deployment labels, local backlog metadata, or source identity alone must fail closed for live score and behavior drift claims. Passing evidence requires AMC-owned baseline distributions, live sample rows, behavior signatures, drift statistics, alert receipts, source refs, receipt hashes, signed evidence refs, row hashes, Watch alert or waiver proof, and no-copy proof.

## No-bloat boundary

No ADK JS SDK integration, TypeScript agent runner, npm package dependency, dev UI clone, A2A adapter, Google Cloud connector, Cloud Run deployer, sample-command runner, repository importer, release parser, Watch monitor, Shield verifier, API route, CLI command, Studio panel, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream code, TypeScript examples, install snippets, README prose beyond short metadata facts, screenshots, docs pages, sample commands, configs, release notes, model outputs, tutorials, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0694AdkJsLiveDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
