# GAP-0855 - Ragrank metric-validity boundary

- Gap: `GAP-0855`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `izam-mohammed/ragrank`, `https://github.com/izam-mohammed/ragrank`, `https://ragrank.readthedocs.io/latest/`, `https://api-ragrank.readthedocs.io/`, `https://pypi.org/project/ragrank/`
- Retrieval: `2026-06-21` via live GitHub repository page, docs page, API docs page, and package page review. The GitHub URL and linked public pages returned HTTP/2 200 in live review. The live GitHub repository page showed Star 47, Fork 15, Issues 1, Pull requests 2, 291 Commits, README.md, Apache-2.0 license, v0.0.9 Latest Feb 14, 2026, and a language mix led by Python 97.3% and Makefile 2.7%.
- Status: completed as a metric-validity boundary over existing AMC validation receipts.

## Live source metadata

The live repository and docs identify Ragrank as an LLM/RAG evaluation toolkit. Relevant source-review signals include topics and labels such as evaluation, language-model, llm-eval, llmops, prompt-engineering, rag, Retrieval-Augmented Generation, response_relevancy, Response Relevancy, Response Conciseness, Context relevancy, Context Utilization, Custom Metrics, Evaluate, monitor, and troubleshoot LLM applications, 5+ LLM-evaluated metrics, Define evaluation datasets in Python code, and online monitoring.

These facts are useful metric-validity context for RAG and LLM evaluation, but they are not AMC validation evidence by themselves. No upstream source code, metric implementations, prompts, examples, docs prose beyond minimal metadata facts, package metadata, generated outputs, sample datasets, notebooks, configs, screenshots, figures, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC through existing metric-validity receipts because RAG/LLM evaluation labels can inform how users reason about Score, Shield, and Watch validity claims. The closure is not a Ragrank adapter or evaluator; it is a fail-closed boundary showing that Ragrank metadata is accepted only as source-review context unless AMC-owned metric validity proof exists.

For metric validity to pass, AMC needs validation table evidence, confidence interval evidence, sample size evidence, reliability checks, outcome-alignment checks, metric owner, signed evidence refs, source refs, row hashes, regression thresholds, CI or lifecycle gate proof, and no-copy proof. GitHub/docs/package metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing validation table, confidence interval, sample size, reliability, outcome-alignment, and metric-owner receipts. |
| Shield | Relevant only as a fail-closed trust boundary; source metadata cannot stand in for signed validity proof. |
| Watch | Relevant only through source refs, CI/lifecycle gate receipts, and replayable eval-pack visibility; no live monitor changed. |
| Enforce | No runtime RAG evaluator policy, prompt policy, or circuit breaker changed. |
| Vault | No datasets, prompts, docs examples, package metadata, or secure-storage behavior changed. |
| Fleet | LLM/RAG evaluation context only; no evaluator runner or orchestration topology added. |
| Passport | Existing metric validity receipts can feed proof bundles, but no Passport schema changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, API, CLI, Studio, methodology, badge, diagnostic question bank, or scoring code changed for GAP-0855.

The focused regression exercises existing `buildMetricValidationReport` behavior with a positive Ragrank-style source-reference packet and a negative source-metadata-only packet. The positive path requires validation table, confidence interval, sample size, reliability check, outcome alignment, metric owner, signed evidence refs, source refs, row hashes, regression thresholds, and CI gate proof. The negative path fails closed when GitHub/docs/package/RAG metric metadata replaces signed metric-validity evidence.

## Fail-closed rule

GitHub HTTP/2 200 reachability, live GitHub repository page metadata, docs reachability, API docs reachability, package page metadata, README.md presence, Apache-2.0 license metadata, Star 47, Fork 15, Issues 1, Pull requests 2, 291 Commits, v0.0.9 Latest Feb 14, 2026, Python 97.3%, Makefile 2.7%, evaluation labels, language-model labels, llm-eval labels, llmops labels, prompt-engineering labels, rag labels, Retrieval-Augmented Generation labels, response_relevancy labels, metric names, online monitoring labels, local backlog metadata, or source identity alone must fail closed for metric validity. Passing evidence requires validation table, confidence interval, sample size, reliability checks, outcome alignment, metric owner, signed evidence refs, source refs, row hashes, regression thresholds, CI or lifecycle gate proof, and no-copy proof.

## No-bloat boundary

No Ragrank adapter, evaluator runner, metric importer, docs parser, API client, package wrapper, prompt wrapper, RAG evaluator, online monitor, dataset importer, response_relevancy implementation, context relevancy implementation, context utilization implementation, custom metric runner, provider wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, diagnostic question-bank migration, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream source code, metric implementations, prompts, examples, docs prose beyond minimal metadata facts, package metadata, generated outputs, sample datasets, notebooks, configs, screenshots, figures, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0855RagrankMetricValidityBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the existing positive and negative metric-validity paths passed.
- Focused regression after doc addition: `npx vitest run tests/gap0855RagrankMetricValidityBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0854StateBenchQuestionExplainabilityBoundary.test.ts tests/gap0855RagrankMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
