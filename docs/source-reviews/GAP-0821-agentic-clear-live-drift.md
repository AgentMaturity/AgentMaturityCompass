# GAP-0821 - Agentic CLEAR live-drift boundary

- Gap: `GAP-0821`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://arxiv.org/abs/2605.22608`, DOI `10.48550/arXiv.2605.22608`, OpenAlex `W7162219190`
- Retrieval: `2026-06-21` via live arXiv page review plus shell header checks. arXiv returned HTTP/2 200, DOI returned HTTP/2 302 to `https://arxiv.org/abs/2605.22608`, and OpenAlex API HEAD returned HTTP/2 200.
- Status: closed through existing Watch live score and behavior drift receipts; no Agentic CLEAR evaluator, multi-level evaluator, benchmark runner, trace scorer, node scorer, or source-specific monitor added.

## Live source metadata

The live arXiv page identifies `Agentic CLEAR: Automating Multi-Level Evaluation of LLM Agents`, Submitted on 21 May 2026, with authors Asaf Yehudai, Lilach Eden, and Michal Shmueli-Scheuer. The paper context is agent evaluation and benchmarks.

Relevant source-review signals include system, trace, node evaluation granularity, operation above the observability layer, four benchmarks, seven agentic settings, task success rate prediction, human-annotated errors, and the Agentic CLEAR label. These are live-drift context only. No upstream prompts, traces, benchmark rows, human annotations, scorer definitions, figures, tables, examples, code, generated outputs, or prose were copied into AMC.

## Relevance decision

This source is relevant to AMC because multi-level agent evaluation can expose behavior drift that score-only monitoring misses. A previously mature agent can degrade when provider behavior, prompts, tools, data, or task mix changes. GAP-0821 maps cleanly to AMC's existing Watch primitive for live score and behavior drift: baseline distribution, live sample, drift statistic, alert receipt, signed evidence refs, receipt hash, row hashes, source refs, and Watch alert projection.

It does not require an Agentic CLEAR evaluator, trace/node scorer, benchmark runner, paper importer, OpenAlex importer, arXiv importer, public methodology version bump, API route, CLI command, or Studio panel. Paper metadata is useful for relevance, but it cannot replace AMC-owned runtime evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through baseline and live score distributions tied to signed evaluation rows. |
| Shield | Relevant because behavior regressions and missing signed evidence must fail closed instead of silently supporting trust claims. |
| Watch | Relevant through existing drift statistics, alert receipts, receipt hashes, and Watch alert projection. |
| Enforce | No runtime policy, guardrail, routing rule, or circuit breaker changed. |
| Vault | No traces, annotations, prompts, benchmark rows, or secure-storage behavior changed. |
| Fleet | Agent-evaluation context only; no fleet topology, orchestrator, or multi-agent runtime changed. |
| Passport | No portable trust token or external proof-bundle schema changed. |
| Comply | Evaluation context only; no compliance framework mapping changed. |

## Product closure

No `src/watch/liveDriftAlerts.ts`, `src/drift/continuousMonitor.ts`, `src/score/index.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Agentic CLEAR adapter, trace scorer, node scorer, benchmark runner, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0821.

The focused regression exercises the existing `runLiveScoreBehaviorDrift` path with Agentic-CLEAR-style multi-level evaluation rows. The positive path emits score, behavior, latency, and cost Watch alerts from signed baseline/live windows. The negative path fails closed when source metadata replaces signed live-drift evidence.

## Fail-closed rule

Paper title, arXiv URL, DOI, OpenAlex id, author list, submission date, Agentic CLEAR label, system/trace/node label, above-the-observability-layer label, four-benchmark label, seven-agentic-settings label, task-success-rate label, human-annotated-error label, local backlog metadata, or source identity alone must fail closed for live score and behavior drift claims. Passing evidence requires AMC-owned baseline distribution, live sample rows, behavior signatures, drift statistic, alert receipt, source refs, receipt hash, signed evidence refs, row hashes, Watch alert or waiver proof, and no-copy proof.

## No-bloat boundary

No Agentic CLEAR evaluator, multi-level evaluator, trace scorer, node scorer, benchmark runner, paper importer, OpenAlex importer, arXiv importer, dataset mirror, benchmark mirror, annotation importer, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific metric lens, or source-specific scoring path was added. No upstream prompts, traces, benchmark rows, human annotations, scorer definitions, figures, tables, examples, code, generated outputs, or prose were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0821AgenticClearLiveDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
