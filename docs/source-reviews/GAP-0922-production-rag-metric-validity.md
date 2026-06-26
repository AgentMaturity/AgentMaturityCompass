# GAP-0922 - production-rag metric-validity boundary

- Gap: `GAP-0922`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `KazKozDev/production-rag`, `https://github.com/KazKozDev/production-rag`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed the `main` branch, Star 14, Fork 3, Issues 0, Pull requests 0, 9 Commits, README.md, MIT license, repository folders `evaluation`, `examples`, and `rag`, and files `.gitignore`, `LICENSE`, `README.md`, `pyproject.toml`, and `requirements.txt`. The repository language signal was Python 100.0%.
- Status: Done

## Live source metadata

The live README title is `Production RAG System`. It describes Production-quality Retrieval-Augmented Generation with multi-strategy retrieval and comprehensive evaluation framework. Relevant source-review signals include semantic and lexical search, hybrid retrieval, query optimization, cross-encoder reranking through a Cross-Encoder Reranker, systematic comparison of retriever strategies, `SemanticRetriever`, `BM25Retriever`, `HybridRetriever`, `RAGPipeline`, `Evaluator`, Precision@10, NDCG@10, Precision@K, Recall@K, MRR, NDCG@K, MAP, Query Expansion, Query Rewriting, Stop Word Removal, Intent Detection, RRF, Python 3.8+, numpy, track retrieval quality metrics, Monitor query latency, Log failed retrievals, A/B test retriever strategies, circuit breakers, retry logic, graceful degradation, query caching, batch queries, and production considerations for reliability and optimization.

Those facts are relevant to AMC only as metric-validity context for retrieval-quality evaluations. They do not allow AMC to claim production-rag compatibility, run the RAG pipeline, import retrievers, compute upstream retrieval metrics, copy benchmark examples, or add a RAG evaluator. For Score, Shield, and Watch, the relevant AMC requirement remains a validation table, confidence interval, sample size, metric owner, construct-validity coverage, reliability checks, outcome alignment, regression thresholds, signed evidence refs, source refs, row hashes, and CI gate proof.

No upstream Python source, RAG examples, evaluation code, metric formulas, README prose beyond minimal metadata facts, package files, requirements, query examples, document examples, benchmark rows, retrieval outputs, result tables, diagrams, config snippets, dependency lists, or implementation details were copied into AMC.

## Relevance decision

`GAP-0922` is relevant to AMC as a metric-validity and reliability boundary. Retrieval systems make precision, recall, rank, reranking, latency, and reliability claims, but AMC should only score those claims when existing metric-validation receipts prove the metric is valid, reliable, and tied to signed evidence.

The closure uses existing AMC metric-validity primitives only. It does not add a production-rag adapter, RAG pipeline, SemanticRetriever wrapper, BM25Retriever wrapper, HybridRetriever wrapper, RRF implementation, cross-encoder reranker, query optimizer, evaluation metric runner, Python dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, or source-specific scoring path.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing validation table, construct-validity, confidence interval, sample size, reliability, and outcome-alignment evidence. |
| Shield | Relevant only when signed evidence proves retrieval-quality metric reliability and regression thresholds. |
| Watch | Relevant through existing CI/Watch fail-closed gates for metric validity. |
| Enforce | No runtime RAG policy changed. |
| Vault | No upstream documents, queries, embeddings, retrieval outputs, requirements, or benchmark artifacts stored. |
| Fleet | No multi-agent topology changed. |
| Passport | Existing proof bundles are unchanged. |
| Comply | No compliance framework mapping changed. |

## Product closure

The focused regression exercises existing `buildMetricValidationReport` behavior with a synthetic AMC-owned production-rag-style validation packet. The positive path requires question scores, validation facets, process evidence, outcome alignment, signed evidence refs, source refs, row hashes, confidence interval, inter-rater agreement, replayable eval pack, and CI pass. The negative path proves that GitHub, README, Production RAG System, Production-quality Retrieval-Augmented Generation, multi-strategy retrieval, comprehensive evaluation framework, semantic and lexical search, hybrid retrieval, query optimization, Cross-Encoder Reranker, Precision@10, NDCG@10, Precision@K, Recall@K, MRR, NDCG@K, MAP, RRF, track retrieval quality metrics, Monitor query latency, circuit breakers, retry logic, graceful degradation, package metadata, and source identity alone fail closed without AMC-owned metric-validity proof.

No product implementation module needed a source-specific change.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, MIT license metadata, Star 14, Fork 3, Issues 0, Pull requests 0, 9 Commits, Python 100.0%, folder names, file names, Production RAG System labels, Production-quality Retrieval-Augmented Generation labels, multi-strategy retrieval labels, comprehensive evaluation framework labels, semantic and lexical search labels, hybrid retrieval labels, query optimization labels, Cross-Encoder Reranker labels, SemanticRetriever labels, BM25Retriever labels, HybridRetriever labels, RAGPipeline labels, Evaluator labels, Precision@10 labels, NDCG@10 labels, Precision@K labels, Recall@K labels, MRR labels, NDCG@K labels, MAP labels, Query Expansion labels, Query Rewriting labels, Stop Word Removal labels, Intent Detection labels, RRF labels, Python 3.8+ labels, numpy labels, track retrieval quality metrics labels, Monitor query latency labels, Log failed retrievals labels, A/B test retriever strategies labels, circuit breakers labels, retry logic labels, graceful degradation labels, local backlog metadata, or source identity alone must fail closed for metric validity. Passing metric-validity proof requires validation table, confidence interval, sample size, metric owner, construct-validity coverage, reliability checks, outcome alignment, regression thresholds, signed evidence refs, source refs, row hashes, and CI gate proof.

## No-bloat boundary

No production-rag adapter, RAG pipeline, SemanticRetriever wrapper, BM25Retriever wrapper, HybridRetriever wrapper, RRF implementation, cross-encoder reranker, query optimizer, evaluation metric runner, precision/recall calculator, NDCG calculator, MAP calculator, MRR calculator, Python dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, source-specific implementation module, or source-specific scoring path was added. No upstream Python source, RAG examples, evaluation code, metric formulas, README prose beyond minimal metadata facts, package files, requirements, query examples, document examples, benchmark rows, retrieval outputs, result tables, diagrams, config snippets, dependency lists, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0922ProductionRagMetricValidityBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the metric-validity behavior tests already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0922ProductionRagMetricValidityBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0921JobclawPublicMethodologyBoundary.test.ts tests/gap0922ProductionRagMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
