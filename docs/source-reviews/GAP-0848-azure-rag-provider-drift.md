# GAP-0848 - Azure RAG provider-drift boundary

- Gap: `GAP-0848`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `Azure-Samples/Design-and-evaluation-of-RAG-solutions`, `https://github.com/Azure-Samples/Design-and-evaluation-of-RAG-solutions`
- Retrieval: `2026-06-21` via live GitHub page, GitHub REST API, README API, license API, and shell header checks. Repository URL returned HTTP/2 200. api.github.com repository metadata returned `stargazers_count` 55, language Jupyter Notebook, MIT License metadata, no repository topics, one open issue, and description metadata for RAG recommendations, testing and evaluation, and reusable code snippets. README.md and LICENSE API lookups succeeded.
- Status: Done; closed by documenting and testing the existing provider/model drift benchmark boundary without adding an Azure RAG-specific subsystem.

## Live source metadata

The live README and API metadata identify Design and evaluation of a RAG implementation. Relevant source-review signals include Retrieval-Augmented Generation, best practices, testing and evaluation, reusable code snippets, Azure Open AI GPT models, Azure AI Search, RAG Project Assurance, Preparation phase and document analysis, Chunk processing, Search and retrieval, Testing search results, Automatic generation of synthetic Q&A pairs, Evaluate answer quality, Testing the end-to-end process, Summary of recommendations, List of code snippets, and Jupyter Notebook implementation context.

These facts are useful RAG design/evaluation context, but they are not AMC provider-drift evidence by themselves. No upstream notebooks, code snippets, generated documents, document-analysis outputs, chunking examples, search results, synthetic Q&A pairs, answer-quality examples, diagrams, configs, prompts, outputs, README prose beyond minimal metadata facts, screenshots, images, or implementation details were copied into AMC.

## Relevance decision

Relevant to AMC only through existing provider/model drift benchmark primitives. Azure RAG design and evaluation context can help shape canary design for Score, Shield, and Watch, but a sample repository does not prove provider drift unless AMC has provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, and CI or lifecycle gate proof.

The source does not justify an Azure RAG adapter, Azure OpenAI wrapper, Azure AI Search adapter, notebook runner, generated-document pipeline, search-result evaluator, answer-quality evaluator, provider wrapper, or source-specific benchmark path. GAP-0848 is closed by regression coverage showing that Azure RAG context can be represented by AMC-owned provider-drift canary rows, and that GitHub/API/README/license/RAG/Azure/testing metadata alone fails closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only when provider score movement is calculated from AMC-owned canary rows and signed evidence. |
| Shield | Relevant when RAG provider drift changes refusal, guardrail, grounding, or unsafe-action behavior; no source-specific Shield verifier was added. |
| Watch | Relevant through existing provider-drift Watch alerts and CI/lifecycle gates. |
| Enforce | No runtime policy, routing enforcement, Azure policy, retrieval policy, or circuit breaker changed. |
| Vault | No notebooks, generated documents, code snippets, prompts, Azure configs, or secure-storage behavior changed. |
| Fleet | RAG evaluation context only; no orchestration topology or source-specific multi-agent runner added. |
| Passport | No portable proof-bundle field, badge semantics, or public proof token changed. |
| Comply | No compliance mapping changed. |

## Product closure

The product path remains the existing provider-drift primitive: `runProviderDriftBenchmark`, `buildProviderDriftEvalPack`, `buildProviderDriftWatchAlerts`, and `buildProviderDriftCiGate`. The focused regression exercises an Azure RAG provider-drift packet using AMC-owned provider version, canary results, drift statistic, signed evidence refs, replayable eval-pack rows, source refs, row hashes, and CI gate proof.

No `src/benchmarks/providerDriftBenchmark.ts`, `src/watch/providerDriftAlerts.ts`, `src/api/benchmarkRouter.ts`, API, CLI, Studio, methodology, badge, diagnostic question bank, or scoring code changed for GAP-0848.

## Fail-closed rule

GitHub HTTP/2 200 reachability, api.github.com repository metadata, README.md presence, LICENSE presence, MIT License metadata, `stargazers_count` 55, Jupyter Notebook label, no repository topics, Retrieval-Augmented Generation label, best practices label, testing and evaluation label, reusable code snippets label, Azure Open AI GPT models label, Azure AI Search label, RAG Project Assurance label, Preparation phase and document analysis label, Chunk processing label, Search and retrieval label, Testing search results label, Automatic generation of synthetic Q&A pairs label, Evaluate answer quality label, Testing the end-to-end process label, local backlog metadata, or source identity alone must fail closed. Passing evidence requires AMC-owned provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, row hashes, and CI or lifecycle gate proof.

## No-bloat boundary

No Azure RAG adapter, Azure OpenAI wrapper, Azure AI Search adapter, generated-document pipeline, HTML-to-Markdown converter, chunking pipeline, search-result evaluator, synthetic-QA generator, answer-quality evaluator, end-to-end RAG tester, notebook runner, code-snippet importer, provider wrapper, benchmark mirror, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Enforce guardrail, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific provider-drift metric, or source-specific scoring path was added. No upstream notebooks, code snippets, generated documents, document-analysis outputs, chunking examples, search results, synthetic Q&A pairs, answer-quality examples, diagrams, configs, prompts, outputs, README prose beyond minimal metadata facts, screenshots, images, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0848AzureRagProviderDriftBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the provider-drift positive, metadata-only fail-closed, and no-leakage checks passed.
- Focused regression after doc addition: `npx vitest run tests/gap0848AzureRagProviderDriftBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0847RaggedProviderDriftBoundary.test.ts tests/gap0848AzureRagProviderDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
