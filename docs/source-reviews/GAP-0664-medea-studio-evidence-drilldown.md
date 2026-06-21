# GAP-0664 — Medea paper Studio evidence drilldown boundary

- Gap: `GAP-0664`
- Priority: source-review P0
- Dimension: `obs-studio-drilldown`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: OpenAlex `W7125151103`, DOI `10.64898/2026.01.16.696667`
- Source URL: `https://openalex.org/W7125151103`
- DOI URL: `https://doi.org/10.64898/2026.01.16.696667`
- Retrieval: `2026-06-21` via OpenAlex Works API and DOI redirect
- OpenAlex API response SHA-256: `7fd6c98e29c1cdaadb8e39c8d81b11144564c6df14cabaa15b2ccf193729e48d`
- DOI landing HTML SHA-256: `b8bfb786410b32ec4ce4bb21e9fef849b39f31f9dd03253392c7c509aa00f5de`

## Live source metadata

| Field | Value |
| --- | --- |
| OpenAlex work | `https://openalex.org/W7125151103` |
| DOI | `https://doi.org/10.64898/2026.01.16.696667` |
| DOI redirect target | `https://www.biorxiv.org/content/10.64898/2026.01.16.696667v1` |
| Title | `Medea: An omics AI agent for therapeutic discovery` |
| Type | `article` |
| Publication date | `2026-01-20` |
| Venue/source | `bioRxiv (Cold Spring Harbor Laboratory)` |
| Host organization | `Cold Spring Harbor Laboratory` |
| Cited-by count at retrieval | `3` |
| OpenAlex concepts sampled | Computer science; Context (archaeology); Identification (biology); Artificial intelligence; Machine learning; Cancer immunotherapy; Immunotherapy; Omics |

## Relevance decision

Relevant only to the existing AMC Studio evidence drilldown and question-level score explainability boundary. The live metadata identifies a paper about an AI agent in an omics/therapeutic-discovery setting, which is useful as a paper-source identity signal for Score, Shield, and Watch evidence drilldown rows. It does not establish an AMC maturity score, biomedical capability, therapeutic-discovery workflow, or model/evaluation parity.

Accepted use is limited to AMC-owned artifacts that already include a question id, signed accepted evidence, rejected-evidence reasons, repair hints, an AMC `/api/v1/score/evidence-drilldown/...` route, paper source artifact links, trace/reasoning/receipt/evidence/source previews, empty/error-state hashes, row hashes, and fail-closed thresholds through the existing `obsStudioDrilldownLens` / question explainability path.

Metadata-only claims remain rejected evidence. A DOI, OpenAlex row, paper title, preprint landing page, abstract, author claim, biomedical task label, screenshot, or local note is not enough to pass question-level score explainability without AMC-owned signed evidence and drilldown receipts.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Yes, only through existing question-score explainability rows with evidence drilldown proof. |
| Shield | Yes, only when metadata-only or biomedical-parity claims are rejected with signed evidence refs and repair hints. |
| Watch | Yes, only when caller-owned preview/empty/error-state receipts and source artifact links are hash-bound through existing Watch/drilldown proof. |
| Guide | Indirect: guide/passport output may cite AMC-owned accepted/rejected question-row proof, not paper content. |
| Passport | Indirect: portable proof remains AMC row hashes and signed evidence receipts. |
| Fleet / Enforce / Vault / Comply | No direct product scope in this source review. |

## No-bloat boundary

No omics subsystem, therapeutic-discovery subsystem, biomedical importer, model adapter, paper-content mirror, dataset mirror, agent clone, evaluation clone, preprint scraper, copied paper prose, figures, tables, prompts, workflows, data, screenshots, or UI assets were added. This review binds only to existing AMC evidence drilldown/question explainability primitives.

## Acceptance boundary

A Medea-paper Studio evidence drilldown claim can pass only when all of the following are present in AMC-owned artifacts:

- live source-review metadata for the DOI/OpenAlex record recorded as identity, not proof;
- a signed AMC question row with accepted evidence ids and rejected metadata-only evidence reasons;
- an AMC evidence drilldown route under `/api/v1/score/evidence-drilldown/...`;
- paper source artifact links for DOI, OpenAlex, venue/publisher, and source-review document;
- trace, reasoning trace, receipt, evidence preview, source artifact preview, empty-state, and error-state hashes;
- evidence preview count and source artifact link count meeting configured thresholds;
- row hash, fail-closed threshold behavior, and repair hints.

## Verification

- Focused regression: `npx vitest run tests/gap0664MedeaStudioEvidenceDrilldown.test.ts`
- Typecheck: `npm run typecheck`
