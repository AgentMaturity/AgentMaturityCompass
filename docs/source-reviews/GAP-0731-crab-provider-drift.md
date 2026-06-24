# GAP-0731 - CRAB provider-drift boundary

- Gap: `GAP-0731`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/camel-ai/crab`, live README at `https://raw.githubusercontent.com/camel-ai/crab/main/README.md`, project page `https://crab.camel-ai.org/`, and arXiv `https://arxiv.org/abs/2407.01511`
- Retrieval: `2026-06-21` via browser access to the live GitHub repository, raw README, and arXiv page; shell network remains DNS-restricted in this environment.
- Status: closed through existing provider/model drift benchmark receipts; no CRAB integration, GUI automation runner, environment launcher, or benchmark mirror added.

## Live source metadata

The live README identifies CRAB as a cross-environment agent benchmark framework for multimodal language model agents. Relevant source-review signals include cross-platform and multi-environment evaluation, in-memory, Docker, virtual-machine, distributed, and physical-machine execution contexts, Python-function action spaces, a unified environment/action interface, `@action` registration, graph evaluators, a packaged `crab-framework`, example single-environment and multi-environment scripts, and the `CRAB-Benchmark-v0` task set. The live arXiv page identifies `CRAB: Cross-environment Agent Benchmark for Multimodal Language Model Agents`, authors Xiangru Tang and collaborators, submitted `2024-07-01`, DOI `10.48550/arxiv.2407.01511`, and reports desktop and mobile cross-environment agent tasks.

These facts are relevant to AMC only as provider/model drift benchmark context. Cross-environment multimodal agent benchmarks highlight why model/provider updates need recurring canary rows with provider version, generated test data, evaluator config, metric ids, trajectory counts, trace exports, metric reports, pipeline config, alert or waiver proof, and signed evidence. They do not justify importing CRAB, launching GUI environments, running its benchmark, copying its task set, or claiming benchmark parity. No upstream README prose beyond minimal metadata facts, task definitions, evaluator graphs, examples, code, configs, UI screenshots, benchmark rows, model results, citations, or implementation details were copied into AMC.

## Relevance decision

GAP-0731 is relevant to AMC through existing provider and model drift benchmark receipts because multimodal agent behavior can change across providers, model versions, GUI environments, and execution substrates. The accepted AMC primitive is already `runProviderDriftBenchmark` with provider version, canary result, drift statistic, alert/waiver, eval-pack, Watch alert, and CI gate evidence.

The source can be retained only as context when the provider-drift packet carries AMC-owned evaluator config, generated test data, metric ids, trajectory counts, trace exports, metric reports, pipeline config, source refs, signed evidence refs, row hashes, Watch alerts or waivers, and no-copy proof. Repository, README, project-page, arXiv, task-count, graph-evaluator, action-space, environment, or benchmark labels alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing provider/model canary comparisons, score deltas, and replayable eval-pack rows. |
| Shield | Relevant through fail-closed checks for missing signed evidence, evaluator proof, generated test data, trace exports, and metric reports. |
| Watch | Relevant through provider-drift Watch alerts and CI/lifecycle gates. |
| Enforce | No runtime provider-routing, GUI action, sandbox, VM, Docker, or policy-enforcement behavior changed. |
| Vault | No screenshots, UI traces, tasks, configs, credentials, VM state, or secure-storage behavior changed. |
| Fleet | Cross-environment agent context only; no orchestration adapter or fleet topology changed. |
| Passport | No portable proof-bundle field or benchmark credential changed. |
| Comply | Benchmark context only; no compliance mapping changed. |

## Product closure

GAP-0731 is closed by documenting the live-source boundary and adding regression coverage over the existing provider-drift primitive. The positive path proves that CRAB-style cross-environment multimodal agent context can be cited only with AMC-owned canary rows, provider/model versions, evaluator proof, observability proof, source refs, signed evidence, eval-pack rows, and CI gate proof. The negative path proves GitHub/README/arXiv/project-page metadata fails closed.

No `src/benchmarks/providerDriftBenchmark.ts`, `src/api/benchmarkRouter.ts`, `src/api/watchRouter.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, CRAB adapter, GUI automation runner, environment launcher, Docker runner, virtual-machine runner, physical-machine runner, graph evaluator, action-space importer, task importer, benchmark mirror, project-page importer, methodology version, diagnostic question bank, or scoring behavior changed for GAP-0731.

## Fail-closed rule

Repository identity, repository URL, raw README labels, project-page labels, CRAB labels, cross-environment labels, multimodal-agent labels, GUI-automation labels, action-space labels, `@action` labels, graph-evaluator labels, Docker labels, virtual-machine labels, physical-machine labels, task-count labels, benchmark labels, arXiv id, DOI, author list, local backlog metadata, or source identity alone must fail closed for provider/model drift claims. Passing evidence requires AMC-owned provider/model versions, canary rows, evaluator config hash, generated test data hash, metric ids, trajectory counts, trace exports, metric reports, pipeline config, source refs, signed evidence refs, row hashes, Watch alerts or waivers, and CI/lifecycle gate proof.

## No-bloat boundary

No CRAB integration, GUI automation runner, cross-environment runner, environment launcher, Docker runner, VM runner, physical-machine runner, graph evaluator, action-space importer, task importer, benchmark mirror, project-page importer, arXiv importer, provider adapter, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream README prose beyond minimal metadata facts, task definitions, evaluator graphs, examples, code, configs, UI screenshots, benchmark rows, model results, citations, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0731CrabProviderDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
