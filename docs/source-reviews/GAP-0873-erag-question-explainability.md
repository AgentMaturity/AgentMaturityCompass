# GAP-0873 - eRAG question-explainability boundary

- Gap: `GAP-0873`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `alirezasalemi7/eRAG`, `https://github.com/alirezasalemi7/eRAG`, `https://doi.org/10.1145/3626772.3657957`
- Retrieval: `2026-06-21` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed Star 32, Fork 4, Issues 3, Pull requests 1, 5 Commits, README.md, LICENSE, MIT license, No releases published, Python 100.0%, repository folder `erag`, and files including `pyproject.toml` and `setup.py`.
- Status: completed as a question-level score explainability boundary over existing AMC receipts.

## Live source metadata

The live repository identifies eRAG: Evaluating Retrieval Quality in Retrieval-Augmented Generation. Relevant source-review signals include SIGIR 2024, retrieval models, query-document relevance labels, downstream RAG performance, document-level annotations, set-based or ranking metrics, Kendall correlation analysis, 0.168 to 0.494 reported correlation range, 50 times less GPU memory, pip install erag, `retrieval_results`, `expected_outputs`, `text_generator`, `downstream_metric`, `retrieval_metrics`, P_10, success, recall, and map.

These facts are useful retrieval-quality evaluation context, but they are not question-level score explainability proof by themselves. No upstream source code, package metadata, datasets, query-document labels, examples, prompts, generated outputs, metric implementations, metric results, README prose beyond minimal metadata facts, screenshots, tables, figures, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC through existing question-level score explainability receipts because retrieval-quality evaluation context can inform how users reason about Score, Shield, and Watch question movement. The closure is not an eRAG adapter, package wrapper, retrieval evaluator, metric implementation, downstream RAG benchmark runner, or query-document label importer; it is a fail-closed boundary showing that eRAG metadata is accepted only as source-review context unless AMC-owned question explainability proof exists.

For question-level score explainability to pass, AMC needs question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed evidence rows, source refs, thresholds, row hashes, replayability, and no-copy proof. GitHub/README/license/retrieval-quality metric metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, and row-hashed question score receipts. |
| Shield | Relevant only as a fail-closed trust boundary; source metadata cannot stand in for signed question-level evidence. |
| Watch | Relevant through existing replayability and source-ref visibility; no live monitor changed. |
| Enforce | No runtime retrieval policy, metric policy, provider policy, or circuit breaker changed. |
| Vault | No datasets, query-document labels, examples, prompts, generated outputs, or secure-storage behavior changed. |
| Fleet | Retrieval/RAG evaluation context only; no eRAG runner or orchestration topology added. |
| Passport | Existing question explainability receipts can feed proof bundles, but no Passport schema changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No `src/diagnostic/questionScoreExplainability.ts`, `src/guide/guideGenerator.ts`, `src/passport/passportArtifact.ts`, API, CLI, Studio, methodology, badge, diagnostic question bank, or scoring code changed for GAP-0873.

The focused regression exercises existing `buildQuestionExplainabilityReport` behavior with a positive eRAG-style question explainability packet and a negative source-metadata-only packet. The positive path requires question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, source refs, thresholds, row hashes, and replayability. The negative path fails closed when GitHub/README/license/retrieval-quality metric metadata replaces signed question-level score evidence.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, LICENSE presence, MIT license metadata, Star 32, Fork 4, Issues 3, Pull requests 1, 5 Commits, No releases published, Python 100.0%, folder names, file names, SIGIR 2024 labels, retrieval models labels, query-document relevance labels, downstream RAG performance labels, document-level annotations labels, set-based or ranking metrics labels, Kendall labels, 0.168 to 0.494 labels, 50 times less GPU memory labels, pip install erag labels, `retrieval_results` labels, `expected_outputs` labels, `text_generator` labels, `downstream_metric` labels, `retrieval_metrics` labels, P_10 labels, success labels, recall labels, map labels, local backlog metadata, or source identity alone must fail closed for question-level score explainability. Passing evidence requires question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed evidence rows, source refs, thresholds, row hashes, replayability, and no-copy proof.

## No-bloat boundary

No eRAG adapter, package wrapper, retrieval evaluator, downstream RAG benchmark runner, query-document label importer, metric implementation, P_10 implementation, success metric implementation, recall implementation, map implementation, Kendall analyzer, GPU-memory benchmark, provider wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, diagnostic question-bank migration, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream source code, package metadata, datasets, query-document labels, examples, prompts, generated outputs, metric implementations, metric results, README prose beyond minimal metadata facts, screenshots, tables, figures, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0873EragQuestionExplainabilityBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the existing positive and negative question-explainability paths passed.
- Focused regression after doc addition: `npx vitest run tests/gap0873EragQuestionExplainabilityBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0872FinRptPublicMethodologyBoundary.test.ts tests/gap0873EragQuestionExplainabilityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
