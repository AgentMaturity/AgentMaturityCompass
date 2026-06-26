# GAP-0901 - msmarco-genqa question-explainability boundary

- Gap: `GAP-0901`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `GioiaZheng/msmarco-genqa`, `https://github.com/GioiaZheng/msmarco-genqa`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed Star 18, Fork 0, Issues 34, Pull requests 5, 187 Commits, README.md, MIT license, repository folders `.github`, `configs`, `data`, `docs`, `examples`, `experiments`, `figures`, `notebooks`, `outputs`, `reports`, `scripts`, `src`, and `tests`, and files including `.gitignore`, `CONTRIBUTING.md`, `LICENSE`, `Makefile`, `README.md`, `REPRODUCIBILITY.md`, `RESULTS.md`, `SECURITY.md`, `metadata.json`, `pyproject.toml`, `requirements-lock.txt`, and `requirements.txt`.
- Status: Done

## Live source metadata

The live README identifies MS MARCO GenQA as a reproducible research-engineering implementation of an MS MARCO retrieval-augmented QA pipeline. Relevant source-review signals include lexical retrieval, dense retrieval, cross-encoder reranking, generation, statistical evaluation, grounding analysis, the dev/small split with 6,980 queries, Token-F1, ROUGE-L, paired-bootstrap 95% CIs, BM25, SBERT/FAISS, qrels-anchored evaluation, query-level diagnostics, paired generation runs, BERTScore proxy checks, RAG triad reporting, query-form slicing, regression taxonomy, config-driven runners, manifest.json, output hashes, metadata, CI, report artifacts, reproducibility notes, retrieval quality reports, reranker lift diagnostics, input validation, experiment tracking, and optional FastAPI serving.

Those facts are relevant to AMC only as question-level score explainability context for RAG evaluation scenarios. They do not allow AMC to claim msmarco-genqa compatibility, run MS MARCO pipelines, import qrels, copy output artifacts, evaluate Token-F1/ROUGE-L/BERTScore, rerank with cross-encoders, build FAISS indexes, serve FastAPI endpoints, or ingest notebooks/reports. For Score, Shield, and Watch, the relevant AMC requirement remains question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed rows, source refs, thresholds, row hashes, and no-copy proof.

No upstream Python source, scripts, configs, data, notebooks, outputs, reports, figures, qrels, generated predictions, metric tables, examples, Makefile commands, FastAPI payloads, README prose beyond minimal metadata facts, reproducibility commands, or implementation details were copied into AMC.

## Relevance decision

`GAP-0901` is relevant to AMC as a question-level score explainability boundary. The source has strong RAG evaluation and query-level diagnostic signals, but AMC should only explain L0-L5 question movement through AMC-owned accepted evidence, rejected evidence reasons, missing gates, repair hints, signed rows, thresholds, and row hashes.

The closure uses existing AMC question-score explainability primitives only. It does not add an MS MARCO importer, RAG pipeline, qrels loader, retrieval evaluator, reranking evaluator, BERTScore proxy, RAG triad runner, FastAPI client, notebook runner, report parser, or source-specific scoring path.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing question-level explanations for why a maturity question passed, failed, or needs evidence. |
| Shield | Relevant only when rejected evidence reasons and missing gates prevent unsafe metadata-only score claims. |
| Watch | Relevant through existing evidence drilldown and fail-closed status that can be surfaced to operators. |
| Enforce | No runtime retrieval, generation, or serving policy changed. |
| Vault | No MS MARCO data, qrels, predictions, outputs, notebooks, reports, or model artifacts stored. |
| Fleet | No multi-agent topology changed. |
| Passport | Existing proof bundles are unchanged. |
| Comply | No compliance framework mapping changed. |

## Product closure

The focused regression exercises existing `buildQuestionExplainabilityReport` behavior with a synthetic AMC-owned MS-MARCO/RAG-style question proof. The positive path requires a question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed evidence rows, source refs, thresholds, and row hash. The negative path proves that GitHub, README, MS MARCO, retrieval-augmented QA pipeline, lexical retrieval, dense retrieval, cross-encoder reranking, generation, statistical evaluation, grounding analysis, query-level diagnostics, BERTScore proxy, RAG triad reporting, regression taxonomy, manifest.json, output hashes, and source identity alone fail closed without AMC-owned question-level proof.

No product implementation module needed a source-specific change.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, MIT license, Star 18, Fork 0, Issues 34, Pull requests 5, 187 Commits, folder names, file names, MS MARCO labels, retrieval-augmented QA pipeline labels, lexical retrieval labels, dense retrieval labels, cross-encoder reranking labels, generation labels, statistical evaluation labels, grounding analysis labels, 6,980 queries labels, Token-F1 labels, ROUGE-L labels, paired-bootstrap 95% CIs labels, query-level diagnostics labels, BERTScore proxy labels, RAG triad reporting labels, regression taxonomy labels, manifest.json labels, output hashes labels, local backlog metadata, or source identity alone must fail closed for question-level score explainability. Passing question-level proof requires question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed rows, source refs, thresholds, row hashes, and no-copy proof.

## No-bloat boundary

No MS MARCO importer, RAG pipeline, qrels loader, retrieval evaluator, reranking evaluator, generator runner, BERTScore proxy, RAG triad runner, FastAPI client, notebook runner, report parser, FAISS integration, SBERT integration, cross-encoder integration, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, source-specific implementation module, or source-specific scoring path was added. No upstream Python source, scripts, configs, data, notebooks, outputs, reports, figures, qrels, generated predictions, metric tables, examples, Makefile commands, FastAPI payloads, README prose beyond minimal metadata facts, reproducibility commands, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0901MsmarcoGenqaQuestionExplainabilityBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the question-explainability behavior tests already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0901MsmarcoGenqaQuestionExplainabilityBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0900ToolkitMcpServerMetricValidityBoundary.test.ts tests/gap0901MsmarcoGenqaQuestionExplainabilityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
