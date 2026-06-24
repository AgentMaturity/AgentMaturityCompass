# GAP-0910 - Knowledge Graph Hybrid RAG question-explainability boundary

- Gap: `GAP-0910`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `safishamsi/Knowledge-Graph-Based-Hybrid-RAG-System`, `https://github.com/safishamsi/Knowledge-Graph-Based-Hybrid-RAG-System`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed Star 14, Fork 6, Issues 0, Pull requests 0, 67 Commits, README.md, MIT license, No releases published, Packages 0, Python 100.0%, repository folders `Data`, `Dissertation`, `Neo4jKG`, `RAG`, `embeddings`, and `scopusscraping`, and files including `LICENSE`, `LLMpoweredRAG.py`, `README.md`, `README_template.md`, `demowithinspector.pdf`, `queries.txt`, and `uobkg.png`.
- Status: Done

## Live source metadata

The live README identifies Knowledge Graph-Based Hybrid RAG System as an academic search system combining knowledge graphs with retrieval-augmented generation. Relevant source-review signals include citation bias, hallucinations, NDCG@10: 0.814, 50% better search relevance, 57.5% reduction in temporal citation bias, 67% fewer hallucinations through document grounding, Sub-500ms query response times, Neo4j, 61,945 papers, 189,972 authors, SBERT + FAISS indexing, LangChain/LangGraph + Claude-3.5-Sonnet, Scopus API, 82% researcher preference, 64% reduction in literature review time, 96% cost reduction vs GPT-4, Python 3.8+, Anthropic API key, AcademicSearchSystem, find_collaborators, analyze_trends, University of Birmingham, and Prof. Dr. Paolo Missier.

Those facts are relevant to AMC only as question-level score explainability context for hybrid RAG evidence scenarios. They do not allow AMC to claim compatibility, run Neo4j, ingest Scopus data, use Anthropic API keys, call Claude-3.5-Sonnet, import papers/authors, run LangChain/LangGraph, build FAISS indexes, parse PDFs, or copy query files. For Score, Shield, and Watch, the relevant AMC requirement remains question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed rows, source refs, thresholds, row hashes, and no-copy proof.

No upstream Python source, graph data, Scopus data, embeddings, benchmark queries, PDF/demo assets, images, environment setup commands, API key examples, README prose beyond minimal metadata facts, generated outputs, or implementation details were copied into AMC.

## Relevance decision

`GAP-0910` is relevant to AMC as a question-level score explainability boundary. The source has useful hybrid RAG, graph, retrieval, and bias-reduction signals, but AMC should only explain L0-L5 question movement through AMC-owned accepted evidence, rejected evidence reasons, missing gates, repair hints, signed rows, thresholds, and row hashes.

The closure uses existing AMC question-score explainability primitives only. It does not add a Neo4j integration, Scopus importer, LangChain/LangGraph runner, Claude wrapper, FAISS/SBERT indexer, academic-search subsystem, PDF parser, collaborator finder, trend analyzer, or source-specific scoring path.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing question-level explanations for why a maturity question passed, failed, or needs evidence. |
| Shield | Relevant only when rejected evidence reasons and missing gates prevent metadata-only hybrid-RAG claims. |
| Watch | Relevant through existing evidence drilldown and fail-closed status that can be surfaced to operators. |
| Enforce | No runtime graph, retrieval, LLM, or API-key policy changed. |
| Vault | No Scopus data, graph data, papers, embeddings, prompts, API keys, PDFs, or query files stored. |
| Fleet | Hybrid-RAG context only; no agent topology changed. |
| Passport | Existing proof bundles are unchanged. |
| Comply | No compliance framework mapping changed. |

## Product closure

The focused regression exercises existing `buildQuestionExplainabilityReport` behavior with a synthetic AMC-owned hybrid-RAG question proof. The positive path requires a question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed evidence rows, source refs, thresholds, and row hash. The negative path proves that GitHub, README, Neo4j, LangChain, LangGraph, Claude-3.5-Sonnet, Scopus API, SBERT, FAISS, NDCG@10, citation-bias reductions, hallucination reductions, AcademicSearchSystem, find_collaborators, analyze_trends, University of Birmingham metadata, and source identity alone fail closed without AMC-owned question-level proof.

No product implementation module needed a source-specific change.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, MIT license, Star 14, Fork 6, Issues 0, Pull requests 0, 67 Commits, No releases published, Packages 0, Python 100.0%, folder names, file names, Academic search system labels, citation bias labels, hallucinations labels, NDCG@10: 0.814 labels, 57.5% reduction labels, 67% fewer hallucinations labels, Sub-500ms labels, Neo4j labels, 61,945 papers labels, 189,972 authors labels, SBERT + FAISS indexing labels, LangChain/LangGraph + Claude-3.5-Sonnet labels, Scopus API labels, 82% researcher preference labels, 64% reduction labels, 96% cost reduction labels, GPT-4 labels, Anthropic API key labels, AcademicSearchSystem labels, find_collaborators labels, analyze_trends labels, University of Birmingham labels, Prof. Dr. Paolo Missier labels, local backlog metadata, or source identity alone must fail closed for question-level score explainability. Passing question-level proof requires question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed rows, source refs, thresholds, row hashes, and no-copy proof.

## No-bloat boundary

No Neo4j integration, Scopus importer, LangChain integration, LangGraph runner, Claude wrapper, Anthropic API integration, FAISS/SBERT indexer, academic-search subsystem, PDF parser, collaborator finder, trend analyzer, graph traversal engine, BM25 implementation, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, source-specific implementation module, or source-specific scoring path was added. No upstream Python source, graph data, Scopus data, embeddings, benchmark queries, PDF/demo assets, images, environment setup commands, API key examples, README prose beyond minimal metadata facts, generated outputs, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0910KnowledgeGraphHybridRagQuestionExplainabilityBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the question-explainability behavior tests already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0910KnowledgeGraphHybridRagQuestionExplainabilityBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0909LangsmithGoReplayCorpusBoundary.test.ts tests/gap0910KnowledgeGraphHybridRagQuestionExplainabilityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
