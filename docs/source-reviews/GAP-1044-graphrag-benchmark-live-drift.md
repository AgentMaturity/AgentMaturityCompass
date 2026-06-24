# GAP-1044 - GraphRAG-Benchmark live-drift boundary

- Gap: `GAP-1044`
- Dimension: Live score and behavior drift alerts (`obs-live-drift-alerts`)
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: live GitHub repository/API at `https://github.com/GraphRAG-Bench/GraphRAG-Benchmark`, GitHub API at `https://api.github.com/repos/GraphRAG-Bench/GraphRAG-Benchmark`, raw README at `https://raw.githubusercontent.com/GraphRAG-Bench/GraphRAG-Benchmark/main/README.md`, Evaluation README at `https://github.com/GraphRAG-Bench/GraphRAG-Benchmark/blob/main/Evaluation/README.md`, license metadata at `https://github.com/GraphRAG-Bench/GraphRAG-Benchmark/blob/main/LICENSE`, requirements metadata at `https://github.com/GraphRAG-Bench/GraphRAG-Benchmark/blob/main/requirements.txt`, leaderboard site at `https://graphrag-bench.github.io/`, arXiv page `https://arxiv.org/abs/2506.05690`, arXiv API `https://export.arxiv.org/api/query?id_list=2506.05690`, arXiv PDF `https://arxiv.org/pdf/2506.05690`, Hugging Face dataset page `https://huggingface.co/datasets/GraphRAG-Bench/GraphRAG-Bench`, and local backlog metadata.
- Retrieval: `2026-06-25` live source review through GitHub API repository, branch, contents, tree, latest-release endpoint, tag listing, raw README keyword scan and headers, Evaluation README keyword scan, leaderboard headers, arXiv API and page/PDF headers, Hugging Face headers, and local backlog metadata.
- Status: closed through existing Watch live score and behavior drift receipts only when AMC-owned baseline/live evidence exists; no GraphRAG-Benchmark runner, GraphRAG adapter, dataset mirror, Hugging Face importer, leaderboard parser, arXiv/PDF parser, Evaluation script adapter, graph/RAG framework connector, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, package dependency, or source-specific drift subsystem added.
- Linear: `AMC-1323`

## Live source metadata

The GitHub API identifies `GraphRAG-Bench/GraphRAG-Benchmark` as a public repository with description context for GraphRAG-Bench and the paper `When to use Graphs in RAG: A Comprehensive Analysis for Graph Retrieval-Augmented Generation`, 446 stars, 52 forks, 7 open issues, default branch `main`, pushed_at `2026-06-07T02:17:59Z`, Python as the primary language, MIT License metadata, homepage `https://arxiv.org/abs/2506.05690`, and topics `analysis`, `benchmark`, `dataset`, `graphrag`, `graphrag-bench`, `graphrag-benchmark`, and `graphragdataset`.

The `main` branch API returned commit `fdbab5959b18c96532580877ffe27d112bccc0ec`, tree `4813973d917f50443746b04cb0131f924c36eda6`, commit message metadata `Update README.md`, author timestamp `2026-06-07T02:17:58Z`, and verified commit metadata. The root contents list includes `Datasets`, `Evaluation`, `Examples`, `LICENSE`, `RAGvsGraphRAG.jpg`, `README.md`, `pipeline.jpg`, and `requirements.txt`. The recursive tree exposes `Datasets/Corpus/medical.json`, `Datasets/Corpus/medical.parquet`, `Datasets/Corpus/novel.json`, `Datasets/Corpus/novel.parquet`, `Datasets/Questions/medical_questions.json`, `Datasets/Questions/medical_questions.parquet`, `Datasets/Questions/novel_questions.json`, `Datasets/Questions/novel_questions.parquet`, `Evaluation/generation_eval.py`, `Evaluation/retrieval_eval.py`, `Evaluation/indexing_eval.py`, metric files for answer accuracy, context relevance, evidence recall, coverage, faithfulness, and ROUGE, plus example runners for LightRAG, Fast-GraphRAG, HippoRAG2, and DIGIMON. The latest release endpoint returned `404`, and the tag listing returned no tags.

GitHub contents metadata returned README blob `061023c554826de9d3e6c2106faef8f7deb6c8d6` with size 7987, LICENSE blob `90355b0205ca42b9a2d2cb6087da83a48830a038` with size 1068, requirements blob `962707a47b70ee97cd3eda7d875e7b29782c451f` with size 191, and Evaluation README blob `71dcc073c948f9f0aeb8c46b4369b30fab5c5ff3` with size 2403. Raw README headers returned `HTTP/2 200`, `content-type: text/plain; charset=utf-8`, and content length 7987. The leaderboard site returned `HTTP/2 200`, `content-type: text/html; charset=utf-8`, `last-modified: Thu, 05 Mar 2026 04:37:59 GMT`, and content length 19531. The Hugging Face dataset page returned `HTTP/2 200`, `content-type: text/html; charset=utf-8`, and content length 748952.

README source-review signals include GraphRAG-Bench, GraphRAG-Benchmark, arXiv `2506.05690v3`, ICLR acceptance context, Hugging Face dataset and leaderboard links, `GraphRAG-Bench (Novel)`, `GraphRAG-Bench (Medical)`, Fact Retrieval, Complex Reasoning, Contextual Summarization, Creative Generation, Accuracy, ROUGE-L, Coverage, Factual Score, graph construction, knowledge retrieval, generation, and examples for GraphRAG framework evaluation. Evaluation README source-review signals include answer-generation quality metrics, retrieval context relevance and context recall, indexing quality, graph structure metrics, Microsoft GraphRAG, LightRAG, Fast-GraphRAG, HippoRAG2, and generic GraphML input labels.

The arXiv API returned title `When to use Graphs in RAG: A Comprehensive Analysis for Graph Retrieval-Augmented Generation`, version `2506.05690v3`, published timestamp `2025-06-06T02:37:47Z`, updated timestamp `2026-02-22T02:01:06Z`, category `cs.CL`, authors Zhishang Xiang, Chuanjie Wu, Qinggang Zhang, Shengyuan Chen, Zijin Hong, Xiao Huang, and Jinsong Su, plus PDF link metadata. The arXiv page returned `HTTP/2 200` with `last-modified: Tue, 24 Feb 2026 01:39:43 GMT`. The arXiv PDF endpoint returned `HTTP/2 200`, `content-type: application/pdf`, `content-disposition: inline; filename="2506.05690v3.pdf"`, and content length 31150461.

No repository code, README prose beyond minimal metadata facts, Evaluation README prose beyond minimal metadata facts, dataset records, corpus text, question records, metric implementations, examples, scripts, configs, images, benchmark rows, leaderboard values, Hugging Face data, arXiv prose, PDF prose, figures, tables, generated outputs, or implementation details were copied into AMC.

## Relevance decision

GAP-1044 is relevant to AMC through existing Score, Shield, and Watch live score and behavior drift receipts. GraphRAG-Benchmark is a benchmark and dataset source for graph retrieval-augmented generation, retrieval/generation metrics, domain-specific leaderboards, and graph/RAG framework comparisons. That context reinforces why production agent behavior can degrade after data, retrieval, prompt, provider, framework, or scoring changes and why AMC must compare live samples against baseline distributions with signed evidence and alert receipts.

The accepted AMC primitive is already `runLiveScoreBehaviorDrift` with `verifyLiveDriftReceipt` and `buildLiveDriftWatchAlerts`. GraphRAG-Benchmark source context may be cited only when an AMC-owned drift packet supplies baseline rows, live rows, score distributions, behavior signatures, evidence refs, signed evidence refs, row hashes, source refs, drift statistics, Watch alert or waiver proof, CI or lifecycle receipts, and no-copy proof. Repository identity, GitHub counts, README labels, arXiv labels, Hugging Face labels, leaderboard labels, dataset file names, metric names, framework names, local backlog metadata, or source popularity alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant when score means, pass rates, error rates, and benchmark-context deltas are computed from AMC-owned baseline/live rows. |
| Shield | Relevant when signed evidence refs and fail-closed gates prevent unsupported benchmark, retrieval, or safety-adjacent drift claims from passing. |
| Enforce | No runtime policy, graph/RAG runner, framework adapter, or circuit breaker changed. |
| Vault | No dataset, corpus, prompt, question file, API key, Hugging Face artifact, or secure-storage behavior changed. |
| Watch | Directly relevant through existing live-drift receipts, drift statistics, and Watch alert projections. |
| Fleet | Benchmark and framework-comparison context only; no fleet runner, trust topology, or orchestration behavior changed. |
| Passport | Existing live-drift receipts can feed proof bundles, but no Passport schema, trust token, or external credential changed. |
| Comply | No compliance mapping changed. |

## Product closure

No product code changed. The focused regression exercises the existing generic Watch live-drift path with AMC-owned synthetic fixture data.

The positive path proves GraphRAG-Benchmark context can be accepted only when AMC-owned baseline and live windows include signed evidence refs, evidence refs, baseline distribution, live sample, behavior signatures, drift statistic, source refs, receipt verification, and Watch alert projection. The negative path fails closed when repository metadata, README labels, arXiv labels, Hugging Face labels, leaderboard labels, dataset labels, metric labels, framework labels, and source identity replace signed live-drift evidence.

## Fail-closed rule

GraphRAG-Benchmark repository identity, GitHub stars, forks, open issues, language metadata, MIT License metadata, branch metadata, commit/tree/blob hashes, README labels, Evaluation README labels, arXiv identity, Hugging Face dataset identity, leaderboard reachability, no-release/no-tag metadata, GraphRAG-Bench (Novel), GraphRAG-Bench (Medical), Fact Retrieval, Complex Reasoning, Contextual Summarization, Creative Generation, Accuracy, ROUGE-L, Coverage, Factual Score, context relevance, context recall, indexing quality, Microsoft GraphRAG, LightRAG, Fast-GraphRAG, HippoRAG2, `medical.parquet`, `novel.parquet`, local backlog metadata, or source identity alone cannot prove AMC live drift.

Passing evidence requires AMC-owned baseline distributions, live sample rows, behavior signatures, drift statistics, alert receipts, source refs, receipt hashes, signed evidence refs, row hashes, Watch alert or waiver proof, CI or lifecycle gate proof, and no-copy proof.

## No-bloat boundary

No GraphRAG-Benchmark runner, GraphRAG adapter, RAG framework connector, Microsoft GraphRAG adapter, LightRAG adapter, Fast-GraphRAG adapter, HippoRAG2 adapter, DIGIMON adapter, dataset mirror, corpus mirror, question importer, Hugging Face importer, leaderboard parser, arXiv parser, PDF parser, Evaluation script adapter, metric implementation copy, graph construction evaluator, retrieval evaluator, generation evaluator, indexing evaluator, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific Watch monitor, source-specific drift subsystem, or source-specific scoring path was added.

No repository code, README prose beyond minimal metadata facts, Evaluation README prose beyond minimal metadata facts, dataset records, corpus text, question records, metric implementations, examples, scripts, configs, images, benchmark rows, leaderboard values, Hugging Face data, arXiv prose, PDF prose, figures, tables, generated outputs, or implementation details were copied.

## Verification

- TDD expected failure: `npx vitest run tests/gap1044GraphRagBenchmarkLiveDriftBoundary.test.ts --reporter=dot` failed before this document existed with `ENOENT: no such file or directory, open 'docs/source-reviews/GAP-1044-graphrag-benchmark-live-drift.md'`; 3 live-drift primitive tests passed.
- Focused regression: `npx vitest run tests/gap1044GraphRagBenchmarkLiveDriftBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired regression: `npx vitest run tests/gap1044GraphRagBenchmarkLiveDriftBoundary.test.ts tests/gap0761AragLiveDriftBoundary.test.ts --reporter=dot` passed, 2 files / 8 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed; narrow token scan over `src/watch/liveDriftAlerts.ts`, `src/drift/continuousMonitor.ts`, and `src/score/index.ts` found no GAP-1044 GraphRAG-Benchmark identifiers.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 891 files / 7,548 tests.
