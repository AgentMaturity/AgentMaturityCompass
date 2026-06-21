# GAP-0640 — pyod replay-corpus relevance review

- Gap: `GAP-0640`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/yzhao062/pyod`
- Retrieval: `2026-06-21T04:19:24Z` via GitHub API (`status=200`, default branch `master`, license `BSD-2-Clause`, metadata SHA-256 `17a801dc928d86749e6daf0d4babeb6bfa13ac6f716dfea6eccc2026ed718b20`)
- Status: relevance accepted only as a generic anomaly/outlier source signal; no source-specific product code added.

## Relevance decision

PyOD is relevant to AMC only as background source-review context for existing Watch anomaly/drift and Score/Shield/Watch replay-corpus proof requirements. The repository metadata describes anomaly/outlier detection and includes agentic-AI topic metadata, but the GAP asks for a replayable benchmark corpus. Repository metadata alone is not an AMC replay corpus and must not become Score, Shield, or Watch evidence.

AMC already has the needed replay-corpus primitive: an AMC-owned replay pack must include deterministic fixture hashes, source refs, baseline/candidate rows, signed evidence refs, score-delta gates, and CI/lifecycle receipts. Therefore this gap is closed by rejecting metadata-only PyOD evidence and retaining existing generic replay-corpus receipts, not by adding a PyOD subsystem, detector wrapper, importer, benchmark mirror, or copied examples.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only when an AMC-owned replay corpus has signed rows, fixture hashes, and score deltas. |
| Shield | Relevant only for caller-owned safety/anomaly eval rows with signed evidence. |
| Watch | Relevant only as generic anomaly/drift context through existing Watch receipts. |
| Enforce/Vault/Fleet/Passport/Comply | No direct scope for this gap. |

## Product closure

Closed as a relevance-gated no-bloat boundary over existing replay-corpus receipts. No product module changed because AMC already requires caller-owned fixture hashes, replay manifests, baseline/candidate rows, signed evidence refs, score-delta gates, and CI/lifecycle receipts.

## Fail-closed rule

PyOD repository metadata, detector names, topic labels, README claims, stars, language, or source URL alone must fail closed. A PyOD-related replay claim can pass only when bound to AMC-owned fixtures, deterministic hashes, signed evidence rows, and regression thresholds.

## No-bloat boundary

No upstream code, docs prose, examples, configs, datasets, benchmark rows, detector lists, screenshots, or implementation details were copied. No PyOD runtime dependency or source-specific module was added.

## Verification

- `npx vitest run tests/gap0640To0648RelevanceBoundaries.test.ts --reporter=dot`
