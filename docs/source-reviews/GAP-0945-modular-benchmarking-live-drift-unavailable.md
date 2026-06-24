# GAP-0945 — Modular benchmarking live drift unavailable-source boundary

- Gap: `GAP-0945`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: backlog OpenAlex `W7119224602`, DOI `10.34218/ijrcait_09_01_001`, and title `A MODULAR BENCHMARKING FRAMEWORK FOR EVALUATING LLM-BASED AGENT APPLICATIONS`
- Retrieval: 2026-06-22 via exact-title, DOI, and OpenAlex searches; exact-title, DOI, and OpenAlex searches did not surface a reachable primary source, and direct DOI and OpenAlex opening returned no usable page content through the web channel.
- Status: source unavailable; closed through existing live score and behavior drift receipts with no source-specific implementation.

## Live source metadata

The local backlog identifies the source as a paper titled `A MODULAR BENCHMARKING FRAMEWORK FOR EVALUATING LLM-BASED AGENT APPLICATIONS`, DOI `10.34218/ijrcait_09_01_001`, OpenAlex work `W7119224602`, improvement dimension live score and behavior drift alerts, category `Agent evaluation and benchmarks`, and surfaces Score, Shield, and Watch. The OpenAlex metadata notes No abstract in OpenAlex metadata.

The available local metadata concepts are Computer science, Modular design, Benchmarking, Systems engineering, Software engineering, Component (thermodynamics), Engineering, and Measure (data warehouse). Those terms are too generic to justify a source-specific benchmark adapter, paper importer, or live drift implementation. They are useful only as context for modular agent benchmarking and observed production drift.

Live source retrieval result: source unavailable. Exact-title, DOI, and OpenAlex searches did not surface a reachable primary source in this environment. Direct DOI and OpenAlex opening returned no usable page content through the web channel. Search results surfaced unrelated agent benchmarking papers, so they were not used as substitutes. No paper prose, abstract text beyond local backlog metadata, benchmark method, dataset, prompts, traces, figures, tables, code, configs, examples, or implementation details were copied into AMC.

## Relevance decision

GAP-0945 is relevant to AMC through existing Watch live score and behavior drift receipts because modular agent benchmark performance can degrade after traffic, provider, prompt, data, tool, or architecture changes. The accepted AMC primitive is already `runLiveScoreBehaviorDrift` with baseline distribution, live sample, drift statistic, source refs, signed evidence refs, alert receipt, and receipt verification.

The source itself is not adequate implementation evidence. DOI/OpenAlex/title/concept metadata alone must fail closed. The source can remain only as context when the live-drift packet is AMC-owned and carries signed baseline/live evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing baseline/live score distribution comparisons. |
| Shield | Relevant through fail-closed checks for missing signed evidence and unsupported benchmark claims. |
| Watch | Relevant through existing Watch live score and behavior drift receipts. |
| Enforce | No runtime policy, circuit breaker, prompt gate, or provider block changed. |
| Vault | No dataset, trace store, secret, DLP, or secure-storage behavior changed. |
| Fleet | Modular agent context only; no orchestration or topology changed. |
| Passport | No portable proof bundle or external benchmark credential changed. |
| Comply | No compliance mapping changed. |

## Product closure

GAP-0945 is closed by documenting the unavailable-source boundary and adding regression coverage over the existing live-drift primitive. The positive path proves that modular agent benchmarking drift context can be cited only with AMC-owned baseline/live rows, behavior signatures, source refs, signed evidence, Watch alert projection, drift statistic, alert receipt, and receipt verification. The negative path proves DOI/OpenAlex/title/concept metadata fails closed when signed live-drift evidence is missing.

No `src/watch/liveDriftAlerts.ts`, `src/drift/continuousMonitor.ts`, `src/score/index.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, modular benchmark runner, paper importer, OpenAlex importer, DOI resolver, methodology version, diagnostic question bank, or scoring behavior changed for GAP-0945.

## Fail-closed rule

OpenAlex work ID, DOI, title, Computer science label, Modular design label, Benchmarking label, Systems engineering label, Software engineering label, Component (thermodynamics) label, Engineering label, Measure (data warehouse) label, local backlog metadata, generated source summary, or source identity alone must fail closed for live score and behavior drift claims. Passing evidence requires AMC-owned baseline distribution, live sample, drift statistic, behavior signatures, evidence refs, signed evidence refs, receipt hash, Watch alert or waiver, and CI/lifecycle gate proof.

## No-bloat boundary

No modular benchmarking adapter, paper importer, OpenAlex importer, DOI resolver, benchmark mirror, method extractor, live-drift lens, provider wrapper, task dataset importer, trace importer, prompt importer, output importer, Watch monitor, Shield verifier, API route, CLI command, Studio panel, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream paper prose, abstract text beyond local backlog metadata, methods, datasets, traces, prompts, model outputs, benchmark rows, figures, tables, code, configs, examples, or implementation details were copied.

## Verification

- `npx vitest run tests/gap0945ModularBenchmarkingLiveDriftUnavailableBoundary.test.ts --reporter=dot`: passed, 1 file / 4 tests.
- `npx vitest run tests/gap0944ArizePhoenixMetricValidityBoundary.test.ts tests/gap0945ModularBenchmarkingLiveDriftUnavailableBoundary.test.ts --reporter=dot`: passed, 2 files / 8 tests.
- `git diff --check -- . ':(exclude)AMC_OS'`: passed.
- `npm run typecheck`: passed.
