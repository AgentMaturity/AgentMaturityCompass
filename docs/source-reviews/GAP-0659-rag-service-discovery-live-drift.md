# GAP-0659 — RAG service-discovery chunking live-drift boundary

- Gap: `GAP-0659`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://openalex.org/W7129177026` / DOI `10.1109/tsc.2026.3665441`
- Retrieval: `2026-06-21T04:54:40Z` via OpenAlex, Crossref, and DOI content negotiation.

## Live source metadata

- OpenAlex status: `200`; id `https://openalex.org/W7129177026`; DOI `https://doi.org/10.1109/tsc.2026.3665441`.
- OpenAlex title: `Retrieval-Augmented Generation for Service Discovery: Chunking Strategies and Benchmarking`.
- OpenAlex type/year/date: `article` / `2026` / `2026-02-16`.
- OpenAlex source: `IEEE Transactions on Services Computing`; host organization `Institute of Electrical and Electronics Engineers`; OpenAlex source type `journal`.
- Crossref status: `200`; DOI `10.1109/tsc.2026.3665441`; publisher `Institute of Electrical and Electronics Engineers (IEEE)`; type `journal-article`; container title `IEEE Transactions on Services Computing`; print publication `2026-03`.
- DOI content-negotiation status: `200`; final URL `https://api.crossref.org/v1/works/10.1109%2Ftsc.2026.3665441/transform`.
- Metadata hashes: OpenAlex first payload SHA-256 `d8676fe022ae2ee7dfad51994f987e9400fcfa4c36b5d489af17e827aac25afa`; Crossref first payload SHA-256 `6be4c8347ed4d521585e6f8f12e6b99d8fcdab68b7b11207982cb68bbfb11803`; DOI CSL payload SHA-256 `1bcaedb34f88b63afe57b4bd667525a963c0b4a9f49899a433bc98768d80a220`.

## Relevance decision

Relevant to AMC only as background context for existing Watch live score/behavior drift receipts. A service-discovery RAG chunking-strategy change can be represented by AMC-owned baseline/live windows with score deltas, behavior signatures, RAG strategy manifests, index/query/evaluator hashes, grounding/citation/support metrics, signed evidence refs, thresholds, and source refs.

The paper metadata does not by itself provide AMC-owned service-discovery traces, chunking strategy manifests, benchmark rows, evaluator configs, thresholds, signed evidence, row hashes, or alert waivers. Source metadata alone must therefore fail closed for Score, Shield, or Watch claims.

## AMC/8 surface check

- Score: yes, only through existing signed score-window and RAG metric drift primitives.
- Shield: yes, only when signed live-drift evidence shows unsupported, unsafe, or hallucinated service-discovery behavior.
- Watch: yes, only through existing `liveDriftAlerts` receipts and Watch alert builders.
- Enforce, Vault, Fleet, Passport, Comply: no direct implementation for this gap.

## Product closure

GAP-0659 is closed by documenting the source-review boundary and adding regression coverage that exercises the existing Watch live score/behavior drift receipt path with AMC-owned synthetic RAG service-discovery traces. The test confirms the DOI/OpenAlex rows remain source refs only; readiness still depends on AMC-owned baseline/live rows, signed evidence refs, thresholds, receipt verification, and Watch alert projection.

## Fail-closed rule

OpenAlex metadata, DOI metadata, Crossref metadata, paper title, chunking-strategy labels, service-discovery terminology, or source URL alone must fail closed. A live-drift claim passes only with AMC-owned baseline/live samples, behavior signatures, RAG strategy/index/query/evaluator hashes, score/pass-rate and grounding metrics, alert or waiver proof, signed evidence refs, and source refs.

## No-bloat boundary

No RAG service-discovery subsystem, chunking engine, importer, dataset mirror, paper benchmark clone, service catalog, parity layer, provider adapter, or copied paper implementation was added. No paper prose, tables, figures, datasets, benchmark values, service descriptions, prompts, or implementation details were copied. The closure uses only high-level public metadata and AMC-owned live-drift receipt primitives.

## Verification

- `npx vitest run tests/gap0659RagServiceDiscoveryLiveDriftBoundary.test.ts --reporter=dot`
- `npm run typecheck`
- `git diff --check`
