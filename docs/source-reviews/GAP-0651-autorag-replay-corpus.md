# GAP-0651 — AutoRAG replay-corpus relevance review

- Gap: `GAP-0651`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/Marker-Inc-Korea/AutoRAG`
- Retrieval: `2026-06-21T00:35:47Z` via GitHub API (`status=200`, default branch `main`, HEAD `e0a717b1541c535acadfb35951415e2a5de932de`, license `Apache-2.0`, stars `4835`, forks `402`, open issues `163`, pushed `2026-06-20T07:31:59Z`, metadata SHA-256 `4dd9a60279bff64f95ce42df744f23e25ca8cbc8d85b6a339e8bf14f161df038`)
- Source description: AutoRAG is described by repository metadata as a RAG evaluation and optimization framework with AutoML-style automation.

## Relevance decision

AutoRAG is relevant to AMC only as source-review context for RAG-flavored replayable benchmark corpus expectations across Score, Shield, and Watch. The repository metadata is aligned with evaluation/benchmarking and retrieval-augmented-generation topics, but metadata, popularity, license, and upstream HEAD identity are not replay evidence.

AMC can treat an AutoRAG-inspired RAG evaluation claim as ready only when the caller supplies an AMC-owned replay corpus through existing primitives: deterministic fixture hashes, source refs, baseline/candidate rows, score deltas, signed evidence refs, and CI/lifecycle receipts. Without those AMC-owned signed replay primitives, AutoRAG metadata must fail closed and must not become Score, Shield, or Watch evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only when an AMC-owned replay pack contains signed baseline/candidate rows, fixture hashes, and score deltas. |
| Shield | Relevant only for caller-owned safety or RAG failure rows with signed evidence and no upstream fixture copy. |
| Watch | Relevant only through existing replay-corpus lifecycle receipts and Watch alerts over AMC-owned rows. |
| Enforce/Vault/Fleet/Passport/Comply | No direct scope for this gap. |

## No-bloat boundary

No AutoRAG runtime dependency or source-specific module was added. No upstream code, docs prose, examples, configs, datasets, benchmark rows, pipeline schemas, optimization settings, screenshots, or implementation details were copied.

## Product closure

Closed as a relevance-gated replay-corpus source-review boundary over existing AMC replay receipt primitives. No product module changed because AMC already requires caller-owned fixtures, deterministic hashes, baseline/candidate rows, signed evidence refs, lifecycle receipts, and regression thresholds for replayable benchmark claims.

## Fail-closed rule

AutoRAG repository metadata, README labels, RAG evaluation/optimization wording, license, stars, source URL, or upstream HEAD alone must fail closed. An AutoRAG-related replay claim can pass only when bound to AMC-owned fixtures, signed evidence rows, row hashes, and replay thresholds through existing AMC primitives.

## Verification

- `npx vitest run tests/gap0640To0648RelevanceBoundaries.test.ts --reporter=dot`
- `git diff --check`
