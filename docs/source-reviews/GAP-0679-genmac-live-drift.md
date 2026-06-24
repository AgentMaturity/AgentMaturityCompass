# GAP-0679 — GENMAC live-drift boundary

- Gap: `GAP-0679`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://arxiv.org/abs/2412.04440`; backlog DOI `10.1609/aaai.v40i7.37418`; backlog OpenAlex `W7138404676`
- Retrieval: `2026-06-21` via browser search/open of the arXiv record and exact-title/DOI searches; shell network remains DNS-restricted in this environment.
- Status: done through existing Watch live score and behavior drift receipts; no text-to-video, multimodal-agent, or source-specific live-drift subsystem added.

## Live source metadata

The reachable arXiv record identifies the live source as `GenMAC: Compositional Text-to-Video Generation with Multi-Agent Collaboration`, dated `Thu Dec  5 18:56:05 2024`. The record describes a multi-agent compositional text-to-video generation workflow with stages named `Design, Generation, and Redesign`, and a Redesign stage decomposed across a `verification agent`, `suggestion agent`, `correction agent`, and `output structuring agent`. It also describes a `self-routing mechanism` for selecting a correction agent for compositional text-to-video generation scenarios.

The exact DOI and OpenAlex identifiers were not reached as primary landing pages through the browser tool during this pass, so they are retained only as backlog identity metadata. No paper prose beyond short bibliographic and method-label metadata facts, figures, framework diagrams, prompt examples, benchmark rows, video examples, model outputs, code, datasets, tables, screenshots, or implementation details were copied into AMC.

## Relevance decision

GENMAC is relevant to AMC only as multi-agent evaluation context for live score and behavior drift. A deployed multi-agent workflow can degrade after prompt, provider, routing, task-distribution, or data changes, so AMC must require baseline distributions, live samples, drift statistics, alert receipts, signed evidence refs, and row hashes before any live-drift claim is accepted.

This does not require a GENMAC-specific subsystem. AMC already has a generic `runLiveScoreBehaviorDrift` Watch path that compares baseline and live distributions, emits score/behavior/latency/cost alerts, binds source refs, produces receipt hashes, verifies receipts, and fails closed when signed evidence is missing. GAP-0679 is closed by documenting the source boundary and adding regression coverage that GENMAC-style multi-agent generation context uses that existing generic path.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through generic live score and behavior drift summaries with signed evidence and receipt hashes. |
| Shield | Relevant through fail-closed signed-evidence requirements and verifiable live-drift receipts. |
| Watch | Relevant through existing Watch live-drift alerts for score drops, behavior-signature changes, latency, cost, and missing signed evidence. |
| Enforce | No runtime policy, generation control, or circuit-breaker change. |
| Vault | No generated video, prompt, layout, dataset, or private media storage feature. |
| Fleet | No multi-agent orchestration, text-to-video workflow, or self-routing implementation. |
| Passport | No portable proof-bundle field or credential change. |
| Comply | No regulated-domain or compliance mapping. |

## Product closure

No `src/watch/liveDriftAlerts.ts`, `src/drift/continuousMonitor.ts`, `src/score/index.ts`, API route, CLI command, Studio panel, drift monitor, score method, diagnostic question bank, methodology version, or generation subsystem changed for GAP-0679. The focused regression exercises the existing Watch live-drift path with GENMAC-style fixture context and verifies both drift-alert receipt behavior and metadata-only signed-evidence fail-closed behavior.

## Fail-closed rule

Paper title, arXiv metadata, DOI/OpenAlex fields, method-stage labels, agent-role labels, self-routing labels, text-to-video claims, benchmark-performance claims, local backlog metadata, or source identity alone must fail closed for live-drift claims. Passing evidence requires AMC-owned baseline rows, live sample rows, behavior signatures, drift statistics, alert receipts, source refs, receipt hashes, signed evidence refs, row hashes, and no-copy proof.

## No-bloat boundary

No GENMAC implementation, text-to-video generator, multimodal-agent workflow, self-routing mechanism, correction-agent suite, video benchmark runner, model-output parser, prompt/layout importer, dataset mirror, paper scraper, API route, CLI command, Studio panel, Watch monitor, Shield route, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No paper prose beyond short metadata facts, figures, framework diagrams, prompt examples, benchmark rows, video examples, model outputs, code, datasets, tables, screenshots, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0679GenmacLiveDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
