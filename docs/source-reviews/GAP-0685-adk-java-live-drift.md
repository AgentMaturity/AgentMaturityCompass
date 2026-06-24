# GAP-0685 - ADK Java live-drift boundary

- Gap: `GAP-0685`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/google/adk-java`
- Retrieval: `2026-06-21` via browser access to the live GitHub repository page; shell network remains DNS-restricted in this environment.
- Status: closed through existing Watch live score and behavior drift receipts; no ADK Java integration or product code change.

## Live source metadata

The live GitHub page identifies `google/adk-java` as a public repository on branch `main`, with Apache-2.0 license, `1.6k stars`, `364 forks`, `58 issues`, `69 pull requests`, and `1,068 commits`. The repository page shows `14 releases`, with latest release `v1.4.0` on `Jun 1, 2026`. The language panel lists `Java 98.9%` and `HTML 1.1%`.

The live README metadata describes an open-source Java toolkit for building, evaluating, and deploying AI agents. Relevant source-review signals include code-first agent behavior, orchestration, tool use, debugging, versioning, deployment from local to cloud, a built-in `Development UI`, an `Evaluate Agents` section currently marked `Coming soon`, A2A protocol integration, multi-agent systems, and `Pre-GA` terms. These facts are deployed-agent runtime and evaluation context only. No upstream code, Java examples, Maven snippets, README prose beyond short metadata facts, screenshots, docs pages, sample commands, configs, release notes, model outputs, tutorials, or implementation details were copied into AMC.

## Relevance decision

ADK Java is relevant to AMC as live score and behavior drift context because deployed, tool-using, multi-agent Java workflows can degrade after prompt, provider, tool, routing, data, traffic, or deployment changes. AMC already has the right generic Watch primitive for this: baseline/live windows, score distributions, behavior signatures, drift statistics, alert receipts, source refs, signed evidence refs, row hashes, receipt hashes, and Watch alert projection.

This does not require an ADK Java SDK, runner, or monitor. GAP-0685 is closed by documenting the source boundary and adding regression coverage that ADK-Java-style deployed-agent trace drift uses the existing generic `live-score-behavior-drift` path. Repository metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing baseline/live score distributions and signed row evidence. |
| Shield | Relevant through fail-closed signed evidence requirements for deployed-agent behavior changes. |
| Watch | Relevant through existing drift statistics, alert receipts, receipt hashes, and Watch alert projection. |
| Enforce | No Java runtime guardrail, policy, circuit breaker, or tool-enforcement behavior changed. |
| Vault | No Google Cloud integration, credential, data-residency, or secure-storage behavior changed. |
| Fleet | Multi-agent and A2A context only; no ADK Java agent runner, A2A adapter, or trust topology was added. |
| Passport | No portable proof-bundle field, token, or external credential changed. |
| Comply | No Pre-GA, cloud, or regulated-domain compliance mapping changed. |

## Product closure

No `src/watch/liveDriftAlerts.ts`, `src/drift/continuousMonitor.ts`, `src/score/index.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Java SDK wrapper, Maven package integration, ADK runner, Development UI clone, A2A connector, Google Cloud connector, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0685.

The focused regression exercises the existing Watch live-drift engine with ADK-Java-style fixture data. The positive path emits score, behavior, latency, and cost Watch alerts with valid signed live-drift receipts. The negative path fails closed when live rows carry source metadata but no signed evidence.

## Fail-closed rule

ADK Java repository identity, stars, forks, issue or pull-request counts, commit counts, release labels, language labels, topic labels, Development UI labels, `Evaluate Agents` labels, `Coming soon` labels, A2A protocol labels, Pre-GA labels, local backlog metadata, or source identity alone must fail closed for live score and behavior drift claims. Passing evidence requires AMC-owned baseline distributions, live sample rows, behavior signatures, drift statistics, alert receipts, source refs, receipt hashes, signed evidence refs, row hashes, Watch alert or waiver proof, and no-copy proof.

## No-bloat boundary

No ADK Java SDK integration, Java agent runner, Maven dependency, Development UI clone, A2A adapter, Google Cloud connector, sample-command runner, repository importer, release parser, Watch monitor, Shield verifier, API route, CLI command, Studio panel, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream code, Java examples, Maven snippets, README prose beyond short metadata facts, screenshots, docs pages, sample commands, configs, release notes, model outputs, tutorials, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0685AdkJavaLiveDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
