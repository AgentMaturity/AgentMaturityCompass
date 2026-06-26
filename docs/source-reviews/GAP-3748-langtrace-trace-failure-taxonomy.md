# GAP-3748 - Langtrace trace failure taxonomy boundary

- Gap: `GAP-3748`
- Dimension: `obs-trace-taxonomy`
- AMC surfaces requested: Watch, Studio, API
- Source reviewed: `https://www.langtrace.ai`, `https://docs.langtrace.ai`, `https://github.com/Scale3-Labs/langtrace`, `https://api.github.com/repos/Scale3-Labs/langtrace`, and `https://raw.githubusercontent.com/Scale3-Labs/langtrace/main/README.md`
- Retrieval: live homepage, docs, GitHub repository, GitHub API, and raw README checks on 2026-06-26.
- Status: closed through AMC's generic Watch trace failure taxonomy and remediation-cluster receipts; no Langtrace SDK, OpenTelemetry collector, trace importer, provider adapter, dashboard clone, or source-specific route added.

## Live source metadata

The backlog identifies `Langtrace` as source `GAP-3748`, category `Observability, monitoring, and traces`, dimension `Trace failure taxonomy`, and requested Watch, Studio, and API surfaces. The acceptance line requires `Trace schema, taxonomy label, cluster ID, and linked remediation`; the recommendation asks AMC to classify traces by prompt, retrieval, tool, policy, latency, cost, and human-review failure modes.

Live retrieval on 2026-06-26 verified:

- Homepage `https://www.langtrace.ai` returned HTTP 404, 6,873 bytes, first-200KB hash `a19d8ba6e0113132f05883c09a3646afc494025abba70ed647b0fd8cbaaee0ea`; the homepage currently returns HTTP 404.
- Documentation `https://docs.langtrace.ai` redirected to `https://docs.langtrace.ai/introduction`, returned HTTP 200, 383,504 bytes, first-200KB hash `2e437c81018c9e5976e307af5863080b0dda4531f070a05d82a7bab4971df9b5`, and contained reviewed metadata phrases including `Cost`, `Evaluations`, `LangTrace`, `Latency`, `Monitor`, `Observability`, `OpenTelemetry`, `Prompt`, `Retrieval`, `Self-Host`, `Tool`, `Traces`, `metrics`, `Analytics`, `LLM Frameworks`, `Python SDK`, `TypeScript SDK`, `Typescript SDK`, `costs`, and `latency`.
- Repository page `https://github.com/Scale3-Labs/langtrace` returned HTTP 200, 443,276 bytes, first-200KB hash `21435d2fcc253f8645b9ebe599c0fb4a6a21832ba07fc823df8fd82fee178ef0`, and contained reviewed metadata phrases including `Open Telemetry`, `traces and metrics`, `LLM APIs`, `Vector Databases`, `LLM Frameworks`, `Real-time Monitoring`, `Performance Insights`, `Debug Tools`, `Analytics`, `Self-hosting`, `TypeScript SDK`, `Python SDK`, `costs`, and `latency`.
- Repository API `https://api.github.com/repos/Scale3-Labs/langtrace` returned HTTP 200, first-200KB hash `13eccce780e443a5c9d271e039e4e058b9348951f23f9499511bd9e6154ce076`, full name `Scale3-Labs/langtrace`, default_branch `main`, license `AGPL-3.0`, language `TypeScript`, 1,207 stars, 124 forks, 1 open issue, pushed_at `2025-11-17T15:08:48Z`, and updated_at `2026-06-20T11:06:21Z`.
- The GitHub API description identifies Langtrace as an Open Telemetry based end-to-end observability tool for LLM applications with tracing, evaluations, and metrics for LLMs, LLM frameworks, vector databases, TypeScript, and Python.
- Repository topics include ai, datasets, evaluations, gpt, langchain, llm, llm-framework, llmops, observability, open-source, open-telemetry, openai, prompt-engineering, and tracing.
- README `https://raw.githubusercontent.com/Scale3-Labs/langtrace/main/README.md` returned HTTP 200, 13,318 bytes, first-200KB hash `eb4d0b1bcf210ead1c9c4d67efbb620b5af1b8ec651b582c296649155d6be918`, and contained reviewed metadata phrases including `Analytics`, `Debug Tools`, `LLM APIs`, `LLM Frameworks`, `Open Telemetry`, `Performance Insights`, `Python SDK`, `Real-time Monitoring`, `Self-hosting`, `TypeScript SDK`, `Typescript SDK`, `Vector Databases`, `costs`, `latency`, and `traces and metrics`.

These facts are relevant as observability, trace, metrics, evaluation, latency, cost, prompt, retrieval, tool, and self-hosting context only. They do not provide AMC trace taxonomy proof.

## Relevance decision

GAP-3748 is relevant to AMC because production agent traces need a source-independent way to become explainable Watch evidence: a trace schema, a taxonomy label, a stable cluster ID, and a linked remediation record. The backlog recommendation maps cleanly to existing AMC trace-failure indexing and remediation-cluster primitives.

The accepted AMC primitive is generic `buildTraceFailureIndex`, which converts AMC-owned production trace evidence into failure entries and clusters with evidence refs, redacted snippets, cluster IDs, remediation recommendation IDs, and suggested repair input. GAP-3748 expands that existing taxonomy to cover prompt, retrieval, tool, policy, latency, cost, and human-review failures without adding a Langtrace-specific system.

Out of scope: Langtrace parity, Langtrace ingestion, OpenTelemetry ingestion, SDK integration, docs mirroring, dashboard replication, provider/vector database adapters, and source-specific Studio/API routes.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant when trace clusters explain score impact and remediation next actions; no scoring methodology version changed. |
| Shield | Relevant when trace failure classes identify policy, unsafe action, or human-review gaps; no new Shield detector was added. |
| Enforce | Context only through remediation input; no runtime guardrail or circuit breaker changed. |
| Vault | Context only; no secret storage, DLP, privacy, or residency behavior changed. |
| Watch | Primary surface; generic trace failure entries and clusters now classify prompt, retrieval, tool, policy, latency, cost, and human-review failures. |
| Fleet | Relevant when affected agents and runs are grouped in clusters; no orchestration topology changed. |
| Passport | Downstream proof-bundle context only; no Passport schema changed. |
| Comply | Audit context only; no compliance mapping changed. |

## Product closure

Product code changed in AMC's existing generic trace taxonomy:

- Added generic `prompt_error`, `cost_spike`, and `human_review_gap` failure classes.
- Classified production-trace failures from error text, output, and metadata, not from request-schema keys that can create false taxonomy matches.
- Mapped the new failure classes into the existing fixer RCA resource and likely-cause paths.
- Added focused regression `tests/gap3748LangtraceTraceFailureTaxonomyBoundary.test.ts`.

The positive path proves AMC can classify prompt, retrieval, tool, policy, latency, cost, and human-review failures into trace clusters with stable `tfcl_` IDs, `repair.*` recommendation IDs, suggested repair input, and evidence refs. The negative path proves Langtrace metadata alone produces no trace taxonomy entries.

## Fail-closed rule

Langtrace homepage status, docs status, GitHub repository identity, GitHub API metadata, README metadata, Open Telemetry label, traces and metrics label, LLM APIs label, Vector Databases label, LLM Frameworks label, Real-time Monitoring label, Performance Insights label, Debug Tools label, Analytics label, Self-hosting label, TypeScript SDK label, Python SDK label, prompt label, retrieval label, tool label, policy label, latency label, cost label, human-review label, stars, forks, license, default branch, topics, local backlog metadata, or source identity alone must fail closed for trace taxonomy proof.

Passing proof requires AMC-owned trace schema, taxonomy label, cluster ID, linked remediation recommendation, suggested repair input, evidence refs, row or trace hashes where available, redacted snippets, and no-copy proof. Metadata-only traces, non-error traces, or source identity claims without AMC evidence produce zero entries and zero clusters.

## No-bloat boundary

No Langtrace SDK, Langtrace adapter, Langtrace API client, OpenTelemetry collector, OpenTelemetry bridge, trace importer, metrics importer, evaluation importer, provider adapter, vector database adapter, LLM framework adapter, self-hosting deployer, dashboard clone, docs mirror, source-specific Watch monitor, Studio panel, API route, CLI command, Passport field, methodology bump, badge migration, package dependency, source-specific scoring path, or product parity claim was added.

No upstream code, README prose beyond short metadata phrases, docs prose, SDK snippets, install commands, trace rows, dashboard screenshots, evaluation examples, prompts, datasets, generated outputs, configs, or implementation details were copied into AMC.

## Verification

- Expected-red focused test: `npx vitest run tests/gap3748LangtraceTraceFailureTaxonomyBoundary.test.ts --reporter=dot` first failed because this source-review doc did not exist and because production trace classification was incorrectly dominated by a request `prompt` key; after the generic classifier fix, the same command failed only because this source-review doc did not exist, with 3 tests passing.
- Focused test after doc: `npx vitest run tests/gap3748LangtraceTraceFailureTaxonomyBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired trace taxonomy regression: `npx vitest run tests/gap3748LangtraceTraceFailureTaxonomyBoundary.test.ts tests/traceFailureIndex.test.ts tests/fixerRca.test.ts tests/governedOptimizer.test.ts tests/mechanicWorkbench.test.ts --reporter=dot` passed, 5 files / 18 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 1029 files / 8132 tests.
