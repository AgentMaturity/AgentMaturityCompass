# GAP-0863 - LangChain synthetic-data RAG eval provider-drift boundary

- Gap: `GAP-0863`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `mddunlap924/LangChain-SynData-RAG-Eval`, `https://github.com/mddunlap924/LangChain-SynData-RAG-Eval`
- Retrieval: `2026-06-21` via live GitHub repository page and README review. The GitHub URL returned HTTP/2 200 in live review. The live GitHub repository page showed Star 40, Fork 8, Issues 0, Pull requests 0, 15 Commits, README.md, MIT license, No releases published, Jupyter Notebook 96.0%, Python 4.0%, and repository folders `imgs`, `notebooks`, `notes-references`, and `src`.
- Status: completed as a provider/model drift boundary over existing AMC canary receipts.

## Live source metadata

The live repository identifies Synthetic Data Generation using LangChain for IR and RAG Evaluation. Relevant source-review signals include LangChain, Llama2-Chat, zero- and few-shot prompting, Information Retrieval, Retrieval Augmented Generation, synthetic datasets, context-query-answer, Custom prompt engineering, Output parsers, Batch GPU inference, LangChain Expression Language, 4-Bit Quantization, Offline metrics, F1, Accuracy, Exact Match, ROGUE, BLEU, and Semantic Answer Similarity.

These facts are useful synthetic RAG evaluation context, but they are not provider/model drift proof by themselves. No upstream notebooks, source code, synthetic datasets, prompts, prompt templates, model outputs, metric rows, result tables, README prose beyond minimal metadata facts, screenshots, figures, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC through existing provider/model drift canary receipts because synthetic RAG evaluation context can inform how users reason about Score, Shield, and Watch changes across model or provider updates. The closure is not a LangChain runner, synthetic-data generator, Llama2 integration, or RAG-evaluation subsystem; it is a fail-closed boundary showing that LangChain-SynData-RAG-Eval metadata is accepted only as source-review context unless AMC-owned provider-drift proof exists.

For provider/model drift to pass, AMC needs provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, row hashes, CI or lifecycle gate proof, and no-copy proof. GitHub/README/license/synthetic-RAG-eval metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing provider score distribution comparisons and canary result rows. |
| Shield | Relevant only as a fail-closed trust boundary; source metadata cannot stand in for signed provider-drift proof. |
| Watch | Relevant through existing provider drift alerts, Watch alert projection, and CI/lifecycle gate receipts. |
| Enforce | No runtime model-routing policy, RAG evaluation policy, or circuit breaker changed. |
| Vault | No notebooks, synthetic datasets, prompts, result tables, model outputs, or secure-storage behavior changed. |
| Fleet | Synthetic RAG evaluation context only; no LangChain-SynData runner or orchestration topology added. |
| Passport | Existing provider-drift receipts can feed proof bundles, but no Passport schema changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No `src/benchmarks/providerDriftBenchmark.ts`, `src/watch/providerDriftAlerts.ts`, `src/api/benchmarkRouter.ts`, API, CLI, Studio, methodology, badge, diagnostic question bank, or scoring code changed for GAP-0863.

The focused regression exercises existing `runProviderDriftBenchmark`, `buildProviderDriftEvalPack`, `buildProviderDriftWatchAlerts`, and `buildProviderDriftCiGate` behavior with a positive LangChain synthetic-data RAG-eval canary packet and a negative source-metadata-only packet. The positive path requires provider version, canary results, drift statistic, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, and CI gate proof. The negative path fails closed when GitHub/README/license/synthetic-RAG-eval metadata replaces signed provider-drift evidence.

## Fail-closed rule

GitHub HTTP/2 200 reachability, live GitHub repository page metadata, README.md presence, MIT license metadata, Star 40, Fork 8, Issues 0, Pull requests 0, 15 Commits, No releases published, Jupyter Notebook 96.0%, Python 4.0%, folder names, LangChain labels, Llama2-Chat labels, zero- and few-shot prompting labels, Information Retrieval labels, Retrieval Augmented Generation labels, synthetic datasets labels, context-query-answer labels, prompt-engineering labels, output-parser labels, batch GPU inference labels, LangChain Expression Language labels, 4-Bit Quantization labels, offline metric labels, local backlog metadata, or source identity alone must fail closed for provider/model drift. Passing evidence requires provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, row hashes, CI or lifecycle gate proof, and no-copy proof.

## No-bloat boundary

No LangChain-SynData adapter, LangChain runner, Llama2 wrapper, synthetic-data generator, prompt-template importer, notebook runner, dataset importer, RAG evaluator, LCEL integration, metric importer, result-table parser, provider wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, diagnostic question-bank migration, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream notebooks, source code, synthetic datasets, prompts, prompt templates, model outputs, metric rows, result tables, README prose beyond minimal metadata facts, screenshots, figures, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0863LangchainSynDataRagEvalProviderDriftBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the existing positive and negative provider-drift paths passed.
- Focused regression after doc addition: `npx vitest run tests/gap0863LangchainSynDataRagEvalProviderDriftBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0862LlmRagEvalProviderDriftBoundary.test.ts tests/gap0863LangchainSynDataRagEvalProviderDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
