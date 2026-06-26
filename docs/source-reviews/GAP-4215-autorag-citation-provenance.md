# GAP-4215 — AutoRAG citation provenance

- Gap: `GAP-4215`
- Dimension: Claim-level citation provenance
- AMC surfaces requested: Score; Watch; Enforce
- Source reviewed: `Marker-Inc-Korea/AutoRAG`
- Retrieval: GitHub repository API, GitHub languages API, GitHub license API, README, and project documentation, retrieved 2026-06-25
- Status: Done

## Relevance decision

AutoRAG is relevant to AMC as a RAG evaluation and optimization signal, not as a runtime dependency. The live GitHub repository is a public Python project with the description "AutoRAG: An Open-Source Framework for Retrieval-Augmented Generation (RAG) Evaluation & Optimization with AutoML-Style Automation", Apache-2.0 license metadata, and README guidance that its RAG workflow uses QA dataset and Corpus dataset files for evaluation and optimization.

This maps to AMC because enterprise RAG scoring needs to prove exactly which retrieved source backed each factual claim. Metadata that a repository exists, has stars, or supports RAG metrics is not enough. The AMC-owned closure is a generic claim-level citation provenance chain in the existing RAG grounding receipt: Claim ID, source chunk ID, retrieval time, confidence, and permission status.

Live retrieval references:

- `https://github.com/Marker-Inc-Korea/AutoRAG`
- `https://api.github.com/repos/Marker-Inc-Korea/AutoRAG`
- `https://api.github.com/repos/Marker-Inc-Korea/AutoRAG/languages`
- `https://api.github.com/repos/Marker-Inc-Korea/AutoRAG/license`
- `https://raw.githubusercontent.com/Marker-Inc-Korea/AutoRAG/main/README.md`
- `https://marker-inc-korea.github.io/AutoRAG/`

The README describes AutoRAG evaluation over RAG module combinations and includes retrieval metrics such as `retrieval_f1`, `retrieval_recall`, `retrieval_ndcg`, and `retrieval_mrr`. AMC does not copy those metrics or reproduce AutoRAG behavior; it uses the source as evidence that RAG evaluation quality depends on traceable retrieval evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant. Claim-level citation provenance strengthens factuality and RAG maturity scoring. |
| Shield | Indirect only. Permission-denied or unknown sources can contribute to unsafe grounding findings through existing enforcement. |
| Enforce | Relevant. Missing retrieval time or non-allowed source permission fails closed before a receipt can pass verification. |
| Vault | Not changed. Source permission status is recorded, but no new storage or DLP subsystem was added. |
| Watch | Relevant. Receipts expose citation provenance rows for audit drilldown. |
| Fleet | Not changed. Fleet can consume the receipt, but no multi-agent topology change was needed. |
| Passport | Not changed. Signed receipts remain portable through existing artifact signature behavior. |
| Comply | Indirect only. The evidence chain supports auditability, but no compliance mapping changed. |

## Product closure

Updated `src/score/ragGroundingEval.ts` to add generic claim citation provenance rows to each RAG grounding case. Each supported evidence edge now binds:

- claim id
- source chunk id
- retrieval timestamp
- claim confidence
- source permission status
- source id, source URI, and document version

The receipt metrics now include citation provenance coverage. The audit export also lists citation provenance rows so an operator can inspect which claim pointed to which source chunk.

## Fail-closed rule

metadata-only evidence fails closed. A RAG grounding receipt is not valid unless cited claim evidence includes an actual retrieved chunk with a valid retrieval timestamp and `allowed` source permission status. Missing retrieval time, denied permission, unknown permission, missing retrieved chunks, missing claim labels, missing receipt path, missing signature, or receipt hash mismatch all fail verification.

## No-bloat boundary

No AutoRAG importer, runner, adapter, YAML parser, metric mirror, dashboard integration, dataset copy, prompt copy, README copy, or benchmark fixture import was added. AMC only added a generic provenance primitive to the existing RAG grounding receipt.

## Verification

- Expected-red focused test: `npx vitest run tests/gap4215AutoRagCitationProvenanceBoundary.test.ts --reporter=dot` failed first because the source-review doc and citation provenance fields were missing.
- Focused test: `npx vitest run tests/gap4215AutoRagCitationProvenanceBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Related RAG tests: `npx vitest run tests/gap4215AutoRagCitationProvenanceBoundary.test.ts tests/gap4200RagGroundingEvalBoundary.test.ts tests/gap4201RagPoisoningStalenessBoundary.test.ts tests/gap4205FactCheckingGroundingEvalBoundary.test.ts tests/gap4207RagasPoisoningStalenessBoundary.test.ts tests/ragMaturity.test.ts --reporter=dot` passed, 6 files / 33 tests.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 959 files / 7,831 tests.
