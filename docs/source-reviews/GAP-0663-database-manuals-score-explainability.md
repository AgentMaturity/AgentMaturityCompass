# GAP-0663 — database-manual/configuration-tuning paper source-review boundary

- Gap: `GAP-0663`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://openalex.org/W7140756610` / DOI `10.14778/3797919.3797940`
- Retrieval: `2026-06-21T04:54:17Z` via live OpenAlex, DOI CSL, and Crossref metadata APIs.
- Metadata facts hash: `5e5c63c2b0d91db8db4a922714d9c0698272728d143a230715a8f878367a35e9`

## Live metadata verification

Metadata-only facts recorded from live registries:

| Field | Value |
| --- | --- |
| DOI | `10.14778/3797919.3797940` |
| DOI URL | `https://doi.org/10.14778/3797919.3797940` |
| DOI CSL status/final URL | `200`; `https://api.crossref.org/v1/works/10.14778%2F3797919.3797940/transform` |
| OpenAlex work | `https://openalex.org/W7140756610` |
| OpenAlex status/API URL | `200`; `https://api.openalex.org/works/W7140756610` |
| Crossref status/API URL | `200`; `https://api.crossref.org/works/10.14778/3797919.3797940` |
| Title | `Why Database Manuals are Not Enough: Efficient and Reliable Configuration Tuning for DBMSs via Code-Driven LLM Agents` |
| Type/year/date | Crossref `journal-article`; OpenAlex `article`; OpenAlex date `2026-02-01`; Crossref print date `2026-02-01`; Crossref online date `2026-05-08` |
| Venue/publisher | `Proceedings of the VLDB Endowment`; `Association for Computing Machinery (ACM)` |
| OpenAlex authors listed | Xinyi Zhang; Tiantian Chen; Zhentao Han; Zhaoyan Hong; Wei Lu; Sheng Wang; Mo Sha; Anni Wang; Shuang Liu; Lu Zhang; Feifei Li; Xinke Du |
| Counts | OpenAlex authorship count `12`; Crossref author count `12`; Crossref references `60`; Crossref cited-by count `3`; OpenAlex cited-by count `3` |
| DOI CSL raw SHA-256 | `9a1e65ca5363744879620cdc8b0e6119b2ef07eb63e5b10cd85ddb11bb040fe3` |
| Crossref raw SHA-256 | `8eab6269d2ffb6a5f19e97ede7e0383661c94daabba1f7337671e1cd0e1bcc96` |
| OpenAlex raw SHA-256 observations | `1f3b65ed0dbb71a56f3351bd841f20128ceb9b5ccb8b0f30bd0925002e35caa0`, then `dbb8bb0dc27664516bae3c6368818a419b4776274107681db3ac8e4e128e576a` |

The raw OpenAlex response hash changed between two live reads, so AMC records the stable canonical facts hash above and treats raw hashes as retrieval observations only.

Only bibliographic/source metadata was retained. No paper prose, abstract text, figures, tables, benchmark rows, tuning rules, DBMS configuration data, source-code analysis details, prompts, model outputs, algorithms, or implementation details were copied into AMC.

## Relevance decision

Not relevant enough to bind as question-level score explainability evidence. The verified title and registry metadata place the source in DBMS configuration tuning / code-driven LLM-agent system context. That is domain and system-design context, not AMC question-score explanation semantics.

GAP-0663 therefore fails closed for Score, Shield, and Watch unless a separate AMC-owned evaluation already supplies the existing question-score explainability requirements:

- question ID and score receipt;
- accepted evidence IDs and signed evidence rows;
- rejected evidence reasons for metadata-only paper claims;
- repair hints;
- reproducible eval-pack hashes and CI/config hashes;
- fail-closed thresholds;
- no-paper-copy/source-review boundary proof.

DOI/OpenAlex/Crossref metadata alone remains rejected as Score, Shield, or Watch evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Fail closed. A DBMS configuration-tuning citation cannot explain an AMC question score without AMC-owned accepted evidence IDs, signed rows, eval-pack hashes, thresholds, and repair hints. |
| Shield | Fail closed. Unsupported claims about database tuning, manuals, code-driven LLM agents, or paper performance cannot be treated as Shield proof; they must be rejected evidence unless backed by AMC-owned safety/evaluation receipts. |
| Watch | Fail closed. The source does not create Watch drift/monitoring evidence; Watch claims still require caller-owned telemetry, thresholds, alert/waiver receipts, and hashes. |
| Fleet | No direct orchestration/runtime scope. |
| Enforce | No direct policy-enforcement change. |
| Vault | No vault/storage change. |
| Passport | No source-specific passport field. |
| Comply | No compliance-control change. |

## No-bloat boundary

No database-manual subsystem, DBMS configuration-tuning subsystem, tuning-rule importer, source-code analysis wrapper, paper parser, benchmark mirror, dataset mirror, adapter, parity layer, DB connector, or source-specific scoring path was added. This review closes GAP-0663 as a relevance-gated fail-closed source-review note over existing AMC question-score explainability primitives.

## Regression coverage

`tests/gap0663DatabaseManualsSourceReview.test.ts` verifies that this source-review document records live DOI/OpenAlex/Crossref metadata and that metadata-only citation of this paper remains fail-closed in the existing question-score explainability pack.
