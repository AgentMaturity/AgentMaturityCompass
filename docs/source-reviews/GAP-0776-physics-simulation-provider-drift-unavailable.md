# GAP-0776 - Physics simulation provider-drift unavailable-source boundary

- Gap: `GAP-0776`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: backlog OpenAlex `W7124960098`, DOI `10.1038/s44387-025-00057-z`, and title `A self-correcting multi-agent LLM framework for language-based physics simulation and explanation`
- Retrieval: `2026-06-21` via browser search and direct DOI attempt; exact-title and DOI searches did not surface a reachable primary source in this environment, and direct DOI opening was blocked by browser safety constraints. Shell network remains DNS-restricted in this environment.
- Status: closed through existing provider/model drift benchmark receipts; no physics simulator, self-correcting multi-agent framework, or explanation engine added.

## Live source metadata

The local backlog identifies a paper titled `A self-correcting multi-agent LLM framework for language-based physics simulation and explanation`, DOI `10.1038/s44387-025-00057-z`, OpenAlex work `W7124960098`, improvement dimension provider and model drift benchmark, category `Agent evaluation and benchmarks`, and concepts including robustness, benchmark, code, convergence, theoretical computer science, artificial intelligence, and natural language. The backlog abstract snippet frames physics-based simulations as important in science and engineering.

Browser verification on `2026-06-21` could not reach a primary publisher page or OpenAlex page: exact-title and DOI searches did not surface a reachable primary source in this environment, and the direct DOI URL was blocked. These metadata facts are relevant to AMC only as provider/model drift benchmark context for physics-simulation and explanation agents. Provider or model changes can alter physics reasoning, self-correction loops, explanation behavior, refusal behavior, latency, and cost. That does not justify copying the paper, importing physics datasets, adding a simulator, adding a self-correction framework, or claiming benchmark parity. No upstream paper prose, abstract text beyond local backlog metadata, physics data, simulation tasks, code, prompts, model outputs, benchmark rows, figures, tables, configs, or implementation details were copied into AMC.

## Relevance decision

GAP-0776 is relevant to AMC through existing provider/model drift benchmark receipts because physics-simulation agents need recurring canaries across provider versions. The accepted AMC primitive is already `runProviderDriftBenchmark` with provider version, canary result, drift statistic, alert or waiver, eval-pack, Watch alert, and CI gate evidence.

The source can be retained only as context when the provider-drift packet carries AMC-owned evaluator config, generated test data, metric ids, trajectory counts, trace exports, metric reports, pipeline config, source refs, signed evidence refs, row hashes, Watch alerts or waivers, and no-copy proof. DOI/OpenAlex/title metadata, physics-simulation labels, self-correction labels, multi-agent labels, explanation labels, or robustness labels alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing provider/model canary comparisons for physics-simulation score deltas. |
| Shield | Relevant through fail-closed checks for missing signed evidence, evaluator proof, generated test data, trace exports, and metric reports. |
| Watch | Relevant through provider-drift Watch alerts and CI/lifecycle gates when provider changes affect behavior, latency, or cost. |
| Fleet | Multi-agent self-correction context only; no orchestration adapter or topology changed. |
| Enforce | No runtime physics, self-correction, explanation, or simulator policy changed. |
| Vault | No physics datasets, simulation traces, prompts, outputs, or secure-storage behavior changed. |
| Passport | No portable proof-bundle field or external benchmark credential changed. |
| Comply | No compliance mapping changed. |

## Product closure

GAP-0776 is closed by documenting the unavailable-source boundary and adding regression coverage over the existing provider-drift primitive. The positive path proves that physics-simulation context can be cited only with AMC-owned canary rows, provider/model versions, evaluator proof, observability proof, source refs, signed evidence, eval-pack rows, Watch alerts or waivers, and CI gate proof. The negative path proves DOI/OpenAlex/title/physics-simulation metadata fails closed.

No `src/benchmarks/providerDriftBenchmark.ts`, `src/api/benchmarkRouter.ts`, `src/api/watchRouter.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, physics simulator, self-correcting multi-agent framework, explanation engine, physics dataset importer, benchmark runner, methodology version, diagnostic question bank, or scoring behavior changed for GAP-0776.

## Fail-closed rule

OpenAlex work ID, DOI, title, physics-simulation labels, self-correcting labels, multi-agent labels, language-based simulation labels, explanation labels, robustness labels, benchmark labels, code labels, convergence labels, artificial-intelligence labels, natural-language labels, local backlog metadata, or source identity alone must fail closed for provider/model drift claims. Passing evidence requires AMC-owned provider/model versions, canary rows, evaluator config hash, generated test data hash, metric ids, trajectory counts, trace exports, metric reports, pipeline config, source refs, signed evidence refs, row hashes, Watch alerts or waivers, and CI/lifecycle gate proof.

## No-bloat boundary

No physics simulator, self-correcting multi-agent framework, explanation engine, physics dataset importer, simulation-task importer, prompt importer, output importer, benchmark mirror, paper importer, Nature importer, OpenAlex importer, source-specific provider-drift lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream paper prose, abstract text beyond local backlog metadata, physics data, simulation tasks, code, prompts, model outputs, benchmark rows, figures, tables, configs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0776PhysicsSimulationProviderDriftUnavailableBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
