# GAP-0862 - llm-rag-eval provider-drift boundary

- Gap: `GAP-0862`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `sujitpal/llm-rag-eval`, `https://github.com/sujitpal/llm-rag-eval`
- Retrieval: `2026-06-21` via live GitHub repository page and README review. The GitHub URL returned HTTP/2 200 in live review. The live GitHub repository page showed Star 41, Fork 5, Issues 1, Pull requests 1, 67 Commits, README.md, Apache-2.0 license, No releases published, Python 95.1%, Jupyter Notebook 4.9%, and repository folders `figs`, `rag-data`, `resources`, and `src`.
- Status: completed as a provider/model drift boundary over existing AMC canary receipts.

## Live source metadata

The live repository identifies llm-rag-eval as a Large Language Model powered evaluator for Retrieval Augmented Generation pipelines. Relevant source-review signals include RAGAS, ARES, Gemini Pro 1.0, Google AI embedding model, LCEL, DSPy, Bootstrap Few Shot with Random Search, Active Learning supervision, Faithfulness, Answer Relevance, Context Precision, Context Utilization, Context Relevance, Context Recall, Answer Similarity, Answer Correctness, AmnestyQA, and HuggingFace.

These facts are useful RAG evaluation context, but they are not provider/model drift proof by themselves. No upstream source code, notebooks, datasets, RAGAS configs, ARES configs, prompts, generated outputs, evaluation rows, result tables, README prose beyond minimal metadata facts, screenshots, figures, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC through existing provider/model drift canary receipts because RAG evaluation context can inform how users reason about Score, Shield, and Watch changes across model or provider updates. The closure is not an llm-rag-eval runner, RAGAS adapter, ARES adapter, LCEL integration, or DSPy integration; it is a fail-closed boundary showing that llm-rag-eval metadata is accepted only as source-review context unless AMC-owned provider-drift proof exists.

For provider/model drift to pass, AMC needs provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, row hashes, CI or lifecycle gate proof, and no-copy proof. GitHub/README/license/RAG evaluator metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing provider score distribution comparisons and canary result rows. |
| Shield | Relevant only as a fail-closed trust boundary; source metadata cannot stand in for signed provider-drift proof. |
| Watch | Relevant through existing provider drift alerts, Watch alert projection, and CI/lifecycle gate receipts. |
| Enforce | No runtime model-routing policy, evaluator policy, or circuit breaker changed. |
| Vault | No datasets, notebooks, prompts, result tables, model outputs, or secure-storage behavior changed. |
| Fleet | RAG evaluation context only; no llm-rag-eval runner or orchestration topology added. |
| Passport | Existing provider-drift receipts can feed proof bundles, but no Passport schema changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No `src/benchmarks/providerDriftBenchmark.ts`, `src/watch/providerDriftAlerts.ts`, `src/api/benchmarkRouter.ts`, API, CLI, Studio, methodology, badge, diagnostic question bank, or scoring code changed for GAP-0862.

The focused regression exercises existing `runProviderDriftBenchmark`, `buildProviderDriftEvalPack`, `buildProviderDriftWatchAlerts`, and `buildProviderDriftCiGate` behavior with a positive llm-rag-eval-style RAG canary packet and a negative source-metadata-only packet. The positive path requires provider version, canary results, drift statistic, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, and CI gate proof. The negative path fails closed when GitHub/README/license/RAG evaluator metadata replaces signed provider-drift evidence.

## Fail-closed rule

GitHub HTTP/2 200 reachability, live GitHub repository page metadata, README.md presence, Apache-2.0 license metadata, Star 41, Fork 5, Issues 1, Pull requests 1, 67 Commits, No releases published, Python 95.1%, Jupyter Notebook 4.9%, folder names, Large Language Model labels, Retrieval Augmented Generation labels, RAGAS labels, ARES labels, Gemini Pro 1.0 labels, Google AI embedding model labels, LCEL labels, DSPy labels, Bootstrap Few Shot with Random Search labels, Active Learning supervision labels, RAG metric labels, AmnestyQA labels, HuggingFace labels, local backlog metadata, or source identity alone must fail closed for provider/model drift. Passing evidence requires provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, row hashes, CI or lifecycle gate proof, and no-copy proof.

## No-bloat boundary

No llm-rag-eval adapter, RAGAS adapter, ARES adapter, LCEL integration, DSPy integration, Gemini wrapper, Google embedding wrapper, dataset importer, notebook runner, prompt importer, metric importer, result-table parser, HuggingFace dataset mirror, provider wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, diagnostic question-bank migration, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream source code, notebooks, datasets, RAGAS configs, ARES configs, prompts, generated outputs, evaluation rows, result tables, README prose beyond minimal metadata facts, screenshots, figures, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0862LlmRagEvalProviderDriftBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the existing positive and negative provider-drift paths passed.
- Focused regression after doc addition: `npx vitest run tests/gap0862LlmRagEvalProviderDriftBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0861HypotheticalMindsQuestionExplainabilityBoundary.test.ts tests/gap0862LlmRagEvalProviderDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
