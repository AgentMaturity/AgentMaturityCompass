# GAP-0847 - RAGGED provider-drift boundary

- Gap: `GAP-0847`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `neulab/ragged`, `https://github.com/neulab/ragged`, arXiv `https://arxiv.org/abs/2403.09040`, Hugging Face dataset `https://huggingface.co/datasets/jenhsia/ragged`
- Retrieval: `2026-06-21` via live GitHub page, GitHub REST API, README API, license API, and shell header checks. Repository URL returned HTTP/2 200. api.github.com repository metadata returned `stargazers_count` 61, language Jupyter Notebook, MIT License metadata, no repository topics, no open issues, and description metadata for Retrieval Augmented Generation Generalized Evaluation Dataset. README.md and LICENSE API lookups succeeded.
- Status: Done; closed by documenting and testing the existing provider/model drift benchmark boundary without adding a RAGGED-specific subsystem.

## Live source metadata

The live README and API metadata identify RAGGED: Towards Informed Design of Scalable and Stable RAG Systems. Relevant source-review signals include Retrieval Augmented Generation Generalized Evaluation Dataset, arXiv `2403.09040`, Hugging Face dataset availability, Natural Questions, HotpotQA, BioASQ11B, retriever-reader configurations, retrieval depths, reader robustness to noise, retrievers, rerankers, prompts, BM25, ColBERT, downstream analysis, and Jupyter Notebook implementation context.

These facts are useful RAG evaluation context, but they are not AMC provider-drift evidence by themselves. No upstream notebooks, datasets, corpus records, query records, retrieval outputs, reader outputs, metrics, scripts, environment files, prompts, examples, README prose beyond minimal metadata facts, Hugging Face data, arXiv prose, screenshots, figures, or implementation details were copied into AMC.

## Relevance decision

Relevant to AMC only through existing provider/model drift benchmark primitives. RAG evaluation context can help shape canary design for Score, Shield, and Watch, but a source repository does not prove provider drift unless AMC has provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, and CI or lifecycle gate proof.

The source does not justify a RAGGED importer, dataset mirror, retriever/reader runner, reranker adapter, notebook runner, provider wrapper, or source-specific benchmark path. GAP-0847 is closed by regression coverage showing that RAGGED-style RAG context can be represented by AMC-owned provider-drift canary rows, and that GitHub/API/README/license/arXiv/Hugging Face/dataset metadata alone fails closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only when provider score movement is calculated from AMC-owned canary rows and signed evidence. |
| Shield | Relevant when RAG provider drift changes refusal, guardrail, grounding, or unsafe-action behavior; no source-specific Shield verifier was added. |
| Watch | Relevant through existing provider-drift Watch alerts and CI/lifecycle gates. |
| Enforce | No runtime policy, routing enforcement, retriever policy, or circuit breaker changed. |
| Vault | No datasets, corpora, query rows, notebook outputs, prompts, or secure-storage behavior changed. |
| Fleet | RAG benchmark context only; no orchestration topology or source-specific multi-agent runner added. |
| Passport | No portable proof-bundle field, badge semantics, or public proof token changed. |
| Comply | No compliance mapping changed. |

## Product closure

The product path remains the existing provider-drift primitive: `runProviderDriftBenchmark`, `buildProviderDriftEvalPack`, `buildProviderDriftWatchAlerts`, and `buildProviderDriftCiGate`. The focused regression exercises a RAGGED-style RAG provider-drift packet using AMC-owned provider version, canary results, drift statistic, signed evidence refs, replayable eval-pack rows, source refs, row hashes, and CI gate proof.

No `src/benchmarks/providerDriftBenchmark.ts`, `src/watch/providerDriftAlerts.ts`, `src/api/benchmarkRouter.ts`, API, CLI, Studio, methodology, badge, diagnostic question bank, or scoring code changed for GAP-0847.

## Fail-closed rule

GitHub HTTP/2 200 reachability, api.github.com repository metadata, README.md presence, LICENSE presence, MIT License metadata, `stargazers_count` 61, Jupyter Notebook label, no repository topics, Retrieval Augmented Generation Generalized Evaluation Dataset label, RAGGED title, arXiv link, Hugging Face dataset link, Natural Questions label, HotpotQA label, BioASQ11B label, retriever-reader configurations label, retrieval depths label, reader robustness to noise label, retrievers label, rerankers label, prompts label, BM25 label, ColBERT label, local backlog metadata, or source identity alone must fail closed. Passing evidence requires AMC-owned provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, row hashes, and CI or lifecycle gate proof.

## No-bloat boundary

No RAGGED importer, dataset mirror, Hugging Face dataset mirror, arXiv importer, notebook runner, retriever runner, reader runner, reranker adapter, BM25 adapter, ColBERT adapter, query converter, corpus converter, evaluation script adapter, provider wrapper, benchmark mirror, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Enforce guardrail, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific provider-drift metric, or source-specific scoring path was added. No upstream notebooks, datasets, corpus records, query records, retrieval outputs, reader outputs, metrics, scripts, environment files, prompts, examples, README prose beyond minimal metadata facts, Hugging Face data, arXiv prose, screenshots, figures, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0847RaggedProviderDriftBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the provider-drift positive, metadata-only fail-closed, and no-leakage checks passed.
- Focused regression after doc addition: `npx vitest run tests/gap0847RaggedProviderDriftBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0846SynthoraLiveDriftBoundary.test.ts tests/gap0847RaggedProviderDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
