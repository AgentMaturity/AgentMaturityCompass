# GAP-0604 source review: Towards end-to-end automation of AI research

Gap: `GAP-0604` / P0 / `llmops-provider-drift`
Surfaces considered: Score, Shield, Watch
Source OpenAlex work: `W7140287209`
DOI: <https://doi.org/10.1038/s41586-026-10265-5>
Title: `Towards end-to-end automation of AI research`

## Live source verification

Verified on 2026-06-20 against DOI, Crossref, OpenAlex, and the publisher landing page:

- DOI content negotiation resolved `10.1038/s41586-026-10265-5` to Crossref metadata with title `Towards end-to-end automation of AI research`.
- Crossref metadata:
  - Type: `journal-article`
  - Publisher: `Springer Science and Business Media LLC`
  - Container: `Nature`
  - Volume/issue/pages: `651` / `8107` / `914-919`
  - Published online: `2026-03-25`; published print: `2026-03-26`
  - License entries: CC-BY 4.0 for TDM and version-of-record content.
- OpenAlex metadata:
  - Work id: `https://openalex.org/W7140287209`
  - DOI: `https://doi.org/10.1038/s41586-026-10265-5`
  - Publication date: `2026-03-25`
  - Primary source: `Nature`; host organization lineage includes Nature Portfolio / Springer Nature.
  - OA landing page and PDF point to Nature URLs for the published version.
- Publisher page metadata at `https://www.nature.com/articles/s41586-026-10265-5` reported:
  - `citation_title`: `Towards end-to-end automation of AI research`
  - `citation_doi`: `10.1038/s41586-026-10265-5`
  - `citation_journal_title`: `Nature`
  - `citation_publication_date`: `2026/03`
  - `citation_volume`: `651`; `citation_issue`: `8107`; first/last pages `914`/`919`
  - `dc.publisher`: `Nature Publishing Group`

## Relevance decision

Decision: **skip / no product change**.

The source is relevant to autonomous research-agent capability and scientific-workflow automation, but it is **not clearly a provider/model drift source** for AMC's `llmops-provider-drift` gap. The verified metadata and publisher page identify a Nature article about an agentic system for automating research workflows. They do not establish a provider-version canary method, model-update drift statistic, production alerting policy, or waiver governance pattern that would justify expanding AMC's provider-drift surfaces.

Per the user rule, this review does not force a new module or API field from a source that is not clearly about provider/model drift. It also does not copy paper prose, figures, tables, or data.

## Existing AMC coverage checked

No source-code change is needed because AMC already has provider drift receipts that match the gap's acceptance shape:

- `src/benchmarks/providerDriftBenchmark.ts`
  - `ProviderDriftCanaryRow` carries provider, model, optional version, canary id, canary results, evidence refs, and signed evidence refs.
  - `ProviderDriftBenchmarkReport.providerVersions` records provider/model/version pairs.
  - `ProviderDriftComparison.driftStatistic` records the computed drift statistic.
  - `ProviderDriftAlert` and `ProviderDriftWaiver` model alert/waiver handling.
  - `runProviderDriftBenchmark` compares baseline and candidate canary rows, applies active waivers, and returns `approve`, `monitor`, `alert`, or `waive` with `failClosed` status.
- `src/api/benchmarkRouter.ts`
  - `POST /api/v1/benchmarks/provider-drift` runs the existing provider/model canary drift benchmark and returns the report, Watch alerts, eval pack, and CI gate.
- `src/watch/providerDriftAlerts.ts`
  - Re-exports Watch alert projection for provider drift.
- `tests/providerDriftBenchmark.test.ts`
  - Covers provider versions, canary results, drift statistic, alerts, waiver behavior, Watch alerts, eval packs, and CI gates.

## Claim boundary

This review records source triage only. It does not cite the paper as evidence for AMC provider/model drift controls. Any future use of this source for product behavior must first identify a concrete provider-drift mechanism in the source and must remain metadata-grounded or use AMC's existing provider-drift receipt pathway with signed evidence.
