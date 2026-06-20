# GAP-0623 source review — obs-live-drift-alerts

## Scope

- Gap: `GAP-0623`
- Task: narrow-task training / broad-misalignment live drift alerts
- AMC surfaces: Score, Shield, Watch
- Implementation boundary: reuse existing Watch live drift primitives (`runLiveScoreBehaviorDrift`, receipts, watch-alert projection); do not add a standalone misalignment subsystem.

## Metadata verification

Verified on 2026-06-20 with DOI/Crossref and OpenAlex metadata lookups:

- DOI: `10.1038/s41586-025-09937-5`
- DOI URL: https://doi.org/10.1038/s41586-025-09937-5
- OpenAlex work: `W7124177090` / https://openalex.org/W7124177090
- Title: `Training large language models on narrow tasks can lead to broad misalignment`
- Venue/source: `Nature`
- Crossref type: `journal-article`
- OpenAlex type: `article`
- Publication date/year: `2026-01-14` / `2026`
- Crossref publisher: `Springer Science and Business Media LLC`
- OpenAlex primary-location license: `cc-by`

## AMC mapping

The source is treated as a metadata-only risk-mapping signal for existing live drift evidence:

- **Score:** score drops, pass-rate drops, and alignment/control quality metrics already represented in `LiveDriftSampleRow`.
- **Shield:** policy/control hashes and shield proof hashes on each row, plus signed evidence references.
- **Watch:** baseline-vs-live distribution drift, live sample manifest, drift statistic, receipt hash, and projected watch alerts.

The implementation requires callers to provide hashes for the metadata snapshot, relevance mapping, Score/Shield/Watch mappings, baseline distribution, live sample manifest, drift statistic, alert receipt, and no-copy boundary. Missing or mismatched DOI/OpenAlex/source proof fails closed by adding a Watch-compatible alert to the existing receipt.

## No-copy boundary

No paper prose, datasets, figures, tables, prompts, examples, model outputs, or experimental results were copied into AMC. The code stores only bibliographic metadata and caller-supplied evidence hashes. Tests use synthetic rows created for AMC receipt behavior, not source-paper data.

## Acceptance evidence

The tests exercise:

- Baseline distribution exposed on the result.
- Live sample receipt rows exposed on the result.
- Drift statistic exposed as existing score/behavior drift objects.
- Alert receipt hash and Watch alerts built from the existing live drift receipt.
- Fail-closed metadata/proof alert behavior.
