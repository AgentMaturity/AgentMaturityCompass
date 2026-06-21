# GAP-0665 — Vibe Coding Omics Data Analysis Applications replay-corpus boundary

- Gap: `GAP-0665`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://openalex.org/W7118933147` / DOI `10.1021/acs.jproteome.5c00984`
- Retrieval: `2026-06-21T04:55:27Z` via live OpenAlex, DOI CSL, and Crossref Works metadata
- Source URL: `https://doi.org/10.1021/acs.jproteome.5c00984`

## Live metadata verification

Only bibliographic/source metadata was recorded. No paper prose, abstract text, figures, tables, omics datasets, application code, prompts, workflows, benchmark rows, model outputs, or implementation details were copied into AMC.

- OpenAlex work: `https://openalex.org/W7118933147`
- OpenAlex DOI: `https://doi.org/10.1021/acs.jproteome.5c00984`
- DOI resolver identifier: `10.1021/acs.jproteome.5c00984`
- Crossref DOI: `10.1021/acs.jproteome.5c00984`
- Title: `Vibe Coding Omics Data Analysis Applications`
- OpenAlex type/year/date: `article`, `2026`, `2026-01-06`
- DOI CSL type/publisher/date: `journal-article`, `American Chemical Society (ACS)`, `2026-01-06`
- Crossref venue: `Journal of Proteome Research`
- Crossref published-online / published-print dates: `2026-01-06` / `2026-02-06`
- OpenAlex primary source: `Journal of Proteome Research`
- OpenAlex open-access status: `hybrid`, `is_oa=true`
- Author count in OpenAlex/DOI/Crossref metadata: `1`; first author: `Jesse G. Meyer`
- OpenAlex retraction/paratext flags: `is_retracted=false`, `is_paratext=false`
- OpenAlex metadata SHA-256: `ddce5c094355a6c62f78da4c2d4952523ae15f8d72a37e48c544931c7925e8ac`
- DOI CSL metadata SHA-256: `9b42d902ec03b552b148187711a4548233121480e674fd0f9671f5d86c930f09`
- Crossref Works metadata SHA-256: `eebaf0718abf19b9d4e83c0cc637ead8759732ac474cfb87b6a6721903fe9e4e`

## Relevance decision

Relevant, but only as source-review context for AMC's existing replayable benchmark corpus and `evalReplayCorpusEvidenceReceipt` primitives. The verified title and metadata identify a journal article about vibe-coded omics data-analysis applications, which can motivate careful replay evaluation of AI-generated scientific-analysis app claims. It does not supply replay evidence by itself.

AMC can mark a related Score, Shield, or Watch replay claim as ready only when the caller supplies an AMC-owned signed replay corpus through existing primitives:

- replay manifest id/version and source refs;
- deterministic fixture hash and fixture input/expected hashes;
- baseline and candidate scores with score delta;
- signed evidence refs on replay rows;
- CI or lifecycle receipt hash;
- row hashes and failed-row ids;
- Score, Shield, and Watch surface mapping;
- fail-closed thresholds and repair recommendation;
- no-paper-copy/source-review boundary proof.

Metadata-only DOI/OpenAlex/Crossref citation remains rejected as Score, Shield, or Watch evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Yes, only through existing signed replay-corpus rows with baseline/candidate scores, score deltas, fixture hashes, and row hashes. |
| Shield | Yes, only when caller-owned replay rows encode safety, unsupported-science, privacy, or tool-risk checks with signed evidence; source metadata alone fails closed. |
| Watch | Yes, only through existing CI/lifecycle replay receipts and Watch alerts over AMC-owned rows. |
| Fleet | Indirect context only; no orchestration/runtime change. |
| Enforce | No direct policy-enforcement change. |
| Vault | No vault/storage change. |
| Passport | Indirect only through existing replay receipt summaries; no source-specific passport field. |
| Comply | No compliance-control change. |

## Product closure

GAP-0665 is closed with documentation plus regression coverage over existing replay-corpus primitives. No product module changed because `runReplayBenchmarkCorpus` and `buildEvalReplayCorpusEvidenceReceipt` already require source refs, fixture hashes, score deltas, signed evidence refs, Score/Shield/Watch coverage, CI receipt hashing, row issues, and fail-closed recommendations.

## No-bloat boundary

This change does **not** add an omics subsystem, vibe-coding subsystem, DOI/OpenAlex/Crossref importer, ACS connector, benchmark mirror, paper parser, omics dataset, application-code copy, scientific workflow runner, benchmark parity layer, or source-specific scoring path. No paper prose, abstract text, figures, tables, datasets, code, benchmark rows, prompts, model outputs, workflows, or implementation details were copied.

## Fail-closed rule

A title, DOI record, OpenAlex record, Crossref record, venue name, author metadata, open-access flag, vibe-coding label, omics label, source URL, or publisher metadata alone must fail closed. A related replay claim can pass only when bound to AMC-owned fixtures, signed evidence rows, deterministic hashes, replay thresholds, and CI/lifecycle receipts through existing AMC primitives.

## Verification

- `npx vitest run tests/gap0665VibeCodingOmicsReplayCorpus.test.ts --reporter=dot`
- `npm run typecheck`
- `git diff --check`
