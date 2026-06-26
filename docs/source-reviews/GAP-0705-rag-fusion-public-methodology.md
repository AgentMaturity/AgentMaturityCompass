# GAP-0705 - RAG-Fusion public-methodology boundary

- Gap: `GAP-0705`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/Raudaschl/rag-fusion`
- Retrieval: `2026-06-21` via GitHub connector repository metadata and live `README.md` fetch; shell network remains DNS-restricted in this environment.
- Status: skipped as AMC public-methodology evidence; no methodology version bump or product code change.

## Live source metadata

The GitHub connector identifies `Raudaschl/rag-fusion` as a public repository with repository id `696503950`, default branch `master`, size `562`, not archived, owner `Raudaschl`, and clone URL `https://github.com/Raudaschl/rag-fusion.git`. The connector also confirms read-only permissions in this environment and fetched the live `README.md`, modified `2026-04-26T18:45:00Z`.

The live README metadata describes RAG-Fusion as a retrieval approach that combines multi-query generation with reciprocal rank fusion for retrieval-augmented generation. Relevant source-review signals include vector search, BM25, reciprocal rank fusion, reranking, evaluation against NFCorpus from BEIR, retrieval metrics such as precision, recall, NDCG, and MRR, paired-bootstrap confidence intervals, sample-size notes, end-to-end answer-quality evaluation with an LLM judge, cost and latency analysis, query rewrite caching, and an experiments folder for replication. These facts identify retrieval-evaluation and replay context only. No upstream code, README prose beyond short metadata facts, install commands, API-key examples, CLI command examples, Mermaid diagrams, project tree details, evaluation tables, metric values, dataset rows, raw results, prompts, query examples, screenshots, package files, or implementation details were copied into AMC.

## Relevance decision

RAG-Fusion is relevant to AMC as external retrieval-evaluation context: it emphasizes evaluation datasets, multiple retrieval variants, sample sizes, confidence intervals, replay commands, and production caveats. That context reinforces AMC's existing evidence-first posture for Score, Shield, and Watch.

RAG-Fusion is not an AMC public methodology versioning source. The live repository does not define AMC scoring methodology ids, L0-L5 threshold semantics, badge comparability rules, public methodology hashes, deprecation notices, migration guidance, report binding, or AMC diagnostic question-bank changes. RAG-Fusion repository metadata and README evaluation claims alone must fail closed for public methodology claims.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Retrieval-evaluation context only; no accepted public scoring-methodology proof. |
| Shield | Evaluation-caveat context only; no Shield assurance threshold changed. |
| Watch | Replay/measurement context only; no Watch methodology or alert semantics changed. |
| Enforce | No runtime RAG policy, adaptive routing guardrail, or enforcement behavior changed. |
| Vault | No API keys, retrieval corpora, query rewrites, embeddings, dataset rows, or secure-storage behavior changed. |
| Fleet | RAG pipeline context only; no retrieval agent or orchestration adapter added. |
| Passport | No portable proof-bundle field or credential changed. |
| Comply | No RAG, medical/nutrition dataset, privacy, or audit-control mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `src/badge/badgeCli.ts`, docs methodology page, API, CLI, Studio, diagnostic question bank, Watch monitor, Shield verifier, or scoring code changed for GAP-0705. No public methodology version bump was made.

The closure is a documented no-op: retrieval-evaluation context only, no public methodology version change.

## Fail-closed rule

RAG-Fusion repository identity, repository id, branch name, README labels, multi-query labels, reciprocal-rank-fusion labels, BM25/vector-search labels, reranker labels, NFCorpus or BEIR labels, metric labels, sample-size labels, confidence-interval labels, LLM-judge labels, cost/latency labels, query-cache labels, experiment-folder labels, local backlog metadata, or source identity alone must fail closed for AMC public methodology claims. Passing evidence requires AMC-owned methodology id/version/hash, changelog rows, deprecation notice, migration guidance, validation artifacts, signed evidence refs, row hashes, badge/report binding, and no-copy proof.

## No-bloat boundary

No RAG-Fusion adapter, retrieval pipeline, query rewriter, reciprocal-rank-fusion implementation, BM25/vector search integration, ChromaDB integration, cross-encoder reranker, NFCorpus/BEIR importer, evaluation CLI wrapper, bootstrap-CI runner, query-cache importer, replication workflow, GitHub importer, source-specific methodology lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream code, README prose beyond short metadata facts, install commands, API-key examples, CLI command examples, Mermaid diagrams, project tree details, evaluation tables, metric values, dataset rows, raw results, prompts, query examples, screenshots, package files, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0705RagFusionPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
