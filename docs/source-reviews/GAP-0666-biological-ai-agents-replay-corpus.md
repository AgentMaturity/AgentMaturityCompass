# GAP-0666 — Biological AI agents survey replay-corpus boundary

- Gap: `GAP-0666`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://openalex.org/W7131698947` / DOI `10.1093/bib/bbag075`
- Retrieval: `2026-06-21T04:54:49Z` via live OpenAlex and DOI metadata
- Source title: `Artificial Intelligence agents for biological research: a survey`

## Live metadata verification

Only bibliographic/source metadata was recorded. No paper prose, abstract text, figures, tables, datasets, benchmark rows, prompts, model outputs, biological workflow details, survey taxonomy, algorithms, or implementation details were copied into AMC.

| Field | Verified value |
| --- | --- |
| OpenAlex work | `https://openalex.org/W7131698947` |
| DOI | `https://doi.org/10.1093/bib/bbag075` |
| Title | `Artificial Intelligence agents for biological research: a survey` |
| OpenAlex type/year/date | `article`, `2026`, `2026-01-01` |
| DOI CSL type/publisher | `journal-article`, `Oxford University Press (OUP)` |
| Journal/source | `Briefings in Bioinformatics` |
| OpenAlex authorship count | `7` |
| DOI CSL referenced-by count | `5` |
| OpenAlex open-access metadata | `is_oa=true`, `oa_status=gold` |
| OpenAlex metadata SHA-256 | `25fff36622fe5e9a9fa713d5044a109890b6603a18f7f75371981a327fffceb0` |
| DOI CSL metadata SHA-256 | `cd9c74c1ea4b8ce2801cfd4cab850f1ca109d261c48956360f0be0eaa39dc542` |

## Relevance decision

Relevant only as background source-review context for biological-research agent replay expectations. The source is a survey, not an AMC-owned benchmark corpus, executable harness, dataset release, or signed evidence ledger. Its live metadata can identify a domain where Score, Shield, and Watch replay claims may be important, but it cannot create replayable evidence by itself.

AMC accepts a biological-research-agent replay claim only when the caller supplies AMC-owned replay-corpus primitives:

- deterministic fixture hashes and runtime/command/dependency hashes;
- source refs bound to caller-owned task manifests rather than copied survey content;
- baseline and candidate rows with score deltas;
- signed evidence refs for Score/Shield evidence;
- Watch lifecycle or CI receipts and alertable fail-closed rows;
- no-paper-copy and no-upstream-dataset-copy boundary proof.

Metadata-only DOI/OpenAlex citation remains rejected as Score, Shield, or Watch evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Yes, only through existing replay-corpus rows with AMC-owned fixtures, baseline/candidate scores, score deltas, row hashes, and signed evidence. |
| Shield | Yes, only for caller-owned safety/failure rows with signed evidence and no copied biological/survey dataset content. |
| Watch | Yes, only through existing replay-corpus CI/lifecycle receipts and fail-closed Watch alerts over AMC-owned rows. |
| Passport | Indirect context only through existing evidence summaries; no source-specific passport field. |
| Comply | Background only; no biomedical compliance or regulatory framework is added. |
| Enforce/Fleet/Vault | No direct scope for this gap. |

## Product closure

Closed as a source-review boundary over existing replay-corpus primitives. No product module changed because AMC already requires caller-owned fixtures, deterministic hashes, signed evidence refs, baseline/candidate rows, score-delta thresholds, CI/lifecycle receipts, and Watch alerts for replayable benchmark claims.

## Fail-closed rule

The survey title, DOI, OpenAlex work id, journal, open-access status, authorship metadata, concepts/keywords, citation counts, or any other bibliographic metadata alone must fail closed. A biological-research-agent replay claim can pass only when bound to AMC-owned task fixtures, signed evidence rows, deterministic hashes, score deltas, and CI/lifecycle receipts through existing AMC replay-corpus primitives.

## No-bloat boundary

No biological research subsystem, importer, dataset mirror, survey-content corpus, DOI/OpenAlex importer, benchmark mirror, paper parser, biomedical workflow, clinical/biological compliance control, copied paper prose/data, figures/tables, taxonomy, prompts, examples, or source-specific scoring path was added.

## Verification

- `npx vitest run tests/gap0666BiologicalAiAgentsReplayCorpus.test.ts --reporter=dot`
- `npm run typecheck`
- `git diff --check`
