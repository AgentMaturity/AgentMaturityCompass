# GAP-0907 - rag-evaluation provider-drift boundary

- Gap: `GAP-0907`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `0xshre/rag-evaluation`, `https://github.com/0xshre/rag-evaluation`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed Star 16, Fork 4, Issues 0, Pull requests 0, 16 Commits, README.md, No releases published, Packages 0, Jupyter Notebook 98.8%, Python 1.2%, repository folders `notebooks` and `src`, and files including `.gitignore`, `README.md`, `requirements.txt`, and `setup_script.sh`.
- Status: Done

## Live source metadata

The live README identifies QA RAG (Retrieval-Augmented Generation) System with Evaluation and describes a QA RAG system built with DSPy and RAGAS. Relevant source-review signals include chromadb, wikitext-raw-2, RecursiveCharacterTextSplitter, sentence-transformers/paraphrase-MiniLM-L6-v2, 384-dimensional embeddings, synthetic questions and answers, 427 generated questions, gpt-3.5-turbo, DSPy retrieval modules, RAGAS, Faithfulness, Answer Relevance, Context Precision, Context Relevancy, Context Recall, Answer Semantic Similarity, Answer Correctness, memorization checks without retrieval, hyperparameter search, chunk size, overlap, SIMPLE zero-shot, COMPILED few-shot, num_passages, multiple-query retrieval, Query Expansion, W&B report link, and ChromaDB-backed retrieval.

Those facts are relevant to AMC only as provider/model drift context for RAG provider routes. They do not allow AMC to claim rag-evaluation compatibility, run notebooks, download wikitext data, build ChromaDB, use DSPy, evaluate RAGAS metrics, call gpt-3.5-turbo, import W&B reports, or copy synthetic Q&A examples. For Score, Shield, and Watch, the relevant AMC requirement remains provider version, canary results, drift statistic, alert or waiver, evaluator config hash, generated test-data hash, trace export hash, metric report hash, signed evidence refs, source refs, row hashes, thresholds, and CI/Watch gate proof.

No upstream notebook content, Python source, prompts, generated questions, generated answers, dataset files, metric tables, W&B report content, requirements, setup scripts, README prose beyond minimal metadata facts, examples, command snippets, or implementation details were copied into AMC.

## Relevance decision

`GAP-0907` is relevant to AMC as a provider and model drift benchmark boundary. The source's RAG evaluation context is useful as a source-review signal for provider-route stability, but the closure must be AMC-owned canary evidence, not a RAGAS/DSPy integration.

The closure uses existing AMC provider-drift primitives only. It does not add a rag-evaluation importer, notebook runner, DSPy adapter, RAGAS evaluator, ChromaDB integration, wikitext downloader, gpt-3.5 provider wrapper, W&B importer, hyperparameter-search runner, query-expansion runner, or source-specific benchmark runner.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing provider-drift score, refusal, latency, cost, and guardrail canary metrics. |
| Shield | Relevant only when signed provider-drift evidence and fail-closed proof are present. |
| Watch | Relevant through existing provider-drift Watch alerts and CI gates. |
| Enforce | No runtime RAG, retrieval, provider, or model policy changed. |
| Vault | No datasets, generated Q&A, ChromaDB indexes, W&B reports, prompts, or model configs stored. |
| Fleet | RAG-provider context only; no agent topology changed. |
| Passport | Existing proof bundles are unchanged. |
| Comply | No compliance framework mapping changed. |

## Product closure

The focused regression exercises existing `runProviderDriftBenchmark`, `buildProviderDriftEvalPack`, `buildProviderDriftWatchAlerts`, and `buildProviderDriftCiGate` behavior with a synthetic AMC-owned RAG evaluation provider canary. The positive path requires provider version, canary results, drift statistic, no alert or waiver need, signed evidence, row hashes, metric coverage, and CI pass. The negative path proves that rag-evaluation, DSPy, RAGAS, chromadb, wikitext-raw-2, RecursiveCharacterTextSplitter, sentence-transformers/paraphrase-MiniLM-L6-v2, 427 generated questions, gpt-3.5-turbo, Faithfulness, Answer Relevance, Context Precision, Context Relevancy, Context Recall, Answer Semantic Similarity, Answer Correctness, Hyper-parameter Search, Query Expansion, W&B, and source metadata fail closed without AMC-owned provider-drift proof.

No product implementation module needed a source-specific change.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, Star 16, Fork 4, Issues 0, Pull requests 0, 16 Commits, No releases published, Packages 0, Jupyter Notebook 98.8%, Python 1.2%, folder names, file names, DSPy labels, RAGAS labels, chromadb labels, wikitext-raw-2 labels, RecursiveCharacterTextSplitter labels, sentence-transformers/paraphrase-MiniLM-L6-v2 labels, 427 generated questions labels, gpt-3.5-turbo labels, Faithfulness labels, Answer Relevance labels, Context Precision labels, Context Relevancy labels, Context Recall labels, Answer Semantic Similarity labels, Answer Correctness labels, Hyper-parameter Search labels, Query Expansion labels, W&B report labels, local backlog metadata, or source identity alone must fail closed for provider drift. Passing provider-drift proof requires provider version, canary results, drift statistic, alert or waiver, evaluator config hash, generated test-data hash, trace export hash, metric report hash, signed evidence refs, source refs, row hashes, thresholds, and CI/Watch gate proof.

## No-bloat boundary

No rag-evaluation importer, notebook runner, DSPy adapter, RAGAS evaluator, ChromaDB integration, wikitext downloader, sentence-transformer integration, gpt-3.5 provider wrapper, W&B importer, hyperparameter-search runner, query-expansion runner, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, source-specific implementation module, or source-specific scoring path was added. No upstream notebook content, Python source, prompts, generated questions, generated answers, dataset files, metric tables, W&B report content, requirements, setup scripts, README prose beyond minimal metadata facts, examples, command snippets, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0907RagEvaluationProviderDriftBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the provider-drift behavior tests already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0907RagEvaluationProviderDriftBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0906ClawSafetyLiveDriftBoundary.test.ts tests/gap0907RagEvaluationProviderDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
