# GAP-0894 - smallevals metric-validity boundary

- Gap: `GAP-0894`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `mburaksayici/smallevals`, `https://github.com/mburaksayici/smallevals`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed Star 20, Fork 2, Issues 0, Pull requests 1, 22 Commits, README.md, No releases published, Python 100.0%, repository folders `logo`, `smallevals`, and `tests`, and files including `.gitignore`, `.python-version`, `example_usage_chromadb.py`, `pyproject.toml`, and `uv.lock`. No license metadata was visible on the GitHub repository page.
- Status: completed as `Done`.

## Live source metadata

The live README identifies smallevals as a Local LLM Evaluation Framework with Tiny 0.6B Models and describes CPU-fast and GPU-blazing fast offline retrieval evaluation for RAG systems. Relevant source-review signals include 0.6B models, QAG-0.6B, CRC-0.6B, GJ-0.6B, ASM-0.6B, retrieval evaluation, RAG systems, generate questions, top_k, n_chunks, retrieval metrics, Milvus, Elastic, PGVector, Chroma, Pinecone, FAISS, Qdrant, Weaviate, ChromaDB, QA generation, tiny-LLM evaluation, and known limitations around training data and generic questions.

Those facts are relevant to AMC only as metric-validity context for RAG/retrieval evaluation. They do not allow AMC to claim smallevals parity, run tiny QA models, import vector databases, or use source-specific retrieval metrics. For Score, Shield, and Watch, the relevant AMC requirement remains validation table, confidence interval, sample size, metric owner, reliability checks, outcome alignment, signed evidence refs, source refs, row hashes, regression thresholds, and no-copy proof.

No upstream Python source, README examples, prompt templates, QA examples, model names beyond minimal metadata facts, generated questions, vector database configs, connection snippets, screenshots, local dashboard code, benchmark rows, model outputs, training data, tests, package metadata beyond minimal metadata facts, or implementation details were copied into AMC.

## Relevance decision

`GAP-0894` is relevant to AMC through existing metric validity and reliability checks. Offline retrieval evaluation and tiny-model RAG scoring context is a useful source-review signal, but it must be represented through AMC-owned metric-validation evidence, not through a smallevals adapter or imported RAG evaluator.

The closure uses existing AMC metric-validity receipts only. It does not add a smallevals integration, vector database adapter, tiny-LLM runner, QA generator, dashboard, RAG evaluator, retrieval-metric implementation, or source-specific scoring path.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing validation table, confidence interval, sample size, metric owner, and outcome-alignment proof. |
| Shield | Relevant only when signed metric-validity evidence and fail-closed proof are present. |
| Watch | Relevant through existing CI/lifecycle metric-validity gate visibility. |
| Enforce | No runtime RAG or retrieval policy changed. |
| Vault | No documents, vector indexes, generated QA, prompts, or model artifacts stored. |
| Fleet | RAG/retrieval-evaluation context only; no agent topology changed. |
| Passport | Existing proof bundles are unchanged. |
| Comply | No compliance framework mapping changed. |

## Product closure

The focused regression exercises existing `buildMetricValidationReport` behavior with a synthetic AMC-owned RAG retrieval metric-validity packet. The positive path requires validation facets, process evidence, outcome alignment, sample size, confidence interval, inter-rater agreement, signed evidence, source refs, row hashes, replayable eval-pack proof, and CI pass. The negative path proves that smallevals, tiny models, RAG evaluation, vector database support, QA generation, and retrieval metrics metadata fails closed without signed AMC-owned metric-validity evidence.

No product implementation module needed a source-specific change.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, Star 20, Fork 2, Issues 0, Pull requests 1, 22 Commits, No releases published, Python 100.0%, folder names, file names, Local LLM Evaluation Framework with Tiny 0.6B Models labels, CPU-fast labels, GPU-blazing fast labels, offline retrieval evaluation labels, RAG systems labels, 0.6B models labels, QAG-0.6B labels, CRC-0.6B labels, GJ-0.6B labels, ASM-0.6B labels, Milvus/Elastic/PGVector/Chroma/Pinecone/FAISS/Qdrant/Weaviate labels, generate questions labels, top_k labels, n_chunks labels, retrieval metrics labels, local backlog metadata, or source identity alone must fail closed for metric-validity proof. Passing proof requires validation table, confidence interval, sample size, metric owner, reliability checks, outcome alignment, signed evidence refs, source refs, row hashes, regression thresholds, and CI/lifecycle gate proof.

## No-bloat boundary

No smallevals adapter, tiny QA model runner, QAG-0.6B integration, CRC-0.6B integration, GJ-0.6B integration, ASM-0.6B integration, vector database adapter, Chroma integration, ChromaDB integration, Milvus integration, Elastic integration, PGVector integration, Pinecone integration, FAISS integration, Qdrant integration, Weaviate integration, QA generator, retrieval-metric implementation, dashboard, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, source-specific implementation module, or source-specific scoring path was added. No upstream Python source, README examples, prompt templates, QA examples, model names beyond minimal metadata facts, generated questions, vector database configs, connection snippets, screenshots, local dashboard code, benchmark rows, model outputs, training data, tests, package metadata beyond minimal metadata facts, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0894SmallevalsMetricValidityBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the metric-validity behavior tests already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0894SmallevalsMetricValidityBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0893AgentTrustPublicMethodologyBoundary.test.ts tests/gap0894SmallevalsMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
