# GAP-0656 — healthcare harmonization source-review boundary for question-score explainability

- Gap: `GAP-0656`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://openalex.org/W7139053837` / DOI `10.3389/fdgth.2026.1756555`
- Retrieval: `2026-06-21T04:34:38Z` via DOI resolver, OpenAlex API, and Crossref API.
- Metadata facts hash: `36fbaf604f508038d84a61bc8de394e01b5252a5d163ad171903d080651f6393`

## Live metadata verification

Metadata-only facts recorded from live registries:

| Field | Value |
| --- | --- |
| DOI | `10.3389/fdgth.2026.1756555` |
| DOI URL | `https://doi.org/10.3389/fdgth.2026.1756555` |
| DOI landing URL | `https://www.frontiersin.org/journals/digital-health/articles/10.3389/fdgth.2026.1756555/full` |
| OpenAlex work | `https://openalex.org/W7139053837` |
| Title | `Ontology- and LLM-based data harmonization for federated learning in healthcare` |
| Type/year/date | Crossref `journal-article`; OpenAlex `article`; `2026-03-18` |
| Venue/publisher | `Frontiers in Digital Health`; `Frontiers Media SA` |
| Authors listed by OpenAlex | Natallia Kokash; Lei Wang; Tom Gillespie; Adam Belloum; Paola Grosso; Sara K. Quinney; Lang Li; Bernard de Bono |
| Indexing / access | OpenAlex indexed in Crossref, DOAJ, PubMed; gold open access; CC BY 4.0 |
| Crossref counts | `reference-count=51`, `is-referenced-by-count=3` |
| Crossref raw SHA-256 | `639eee4ee1810bce7a21621886b12fbdadaf0fc92516253cf99733bcdbf94368` |
| OpenAlex raw SHA-256 observations | `51cede24ab2a4591fb82a22a97cc46f843293e268a1cd0260b5b100015aa9607`, then `05a675b14b68be2a220c205199b77c43302c2acc6b319f55b0ba12e8fe823f14` |

The raw OpenAlex response hash changed between two live reads, so AMC records the stable canonical facts hash above and treats the raw hashes as retrieval observations only.

## Relevance decision

Weakly relevant, but not implementation-relevant by itself. The metadata places the source in healthcare ontology/data-harmonization and federated-learning context with an LLM component. That is adjacent to question-level score explainability only at the evidence-semantics boundary: accepted/rejected candidate evidence, validator configuration, and expert-review provenance can resemble AMC's existing accepted-evidence IDs, rejected-evidence reasons, repair hints, signed evidence rows, reproducible eval-pack hashes, and fail-closed thresholds.

The source is not an agent-evaluation benchmark for AMC, not a question-score explainability implementation, and not a reason to add a healthcare ontology subsystem, federated-learning pipeline, paper importer, benchmark mirror, clinical mapping dataset, or source-specific evaluator. DOI/OpenAlex/Crossref metadata alone remains rejected as Score/Shield/Watch evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Only relevant when a user-owned AMC question-score row binds question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed evidence, thresholds, and row hash. |
| Shield | Only relevant when unsafe/unsupported harmonization claims are explicitly rejected with signed evidence and no paper-data copy. |
| Watch | Only relevant when caller-owned eval or drift telemetry is hash-bound; source metadata alone cannot create a Watch signal. |
| Comply | Healthcare context is indirect; this review adds no compliance or medical claim. |
| Enforce/Vault/Fleet/Passport | No direct scope for this gap. |

## No-bloat boundary

No healthcare ontology/federated-learning subsystem, importer, data pipeline, benchmark mirror, clinical mapper, paper-content copy, or source-specific product code was added. This review closes fail-closed unless future AMC-owned evidence supplies question-score explainability receipts through existing primitives.

## Regression coverage

`tests/gap0656SourceReview.test.ts` verifies that DOI/OpenAlex metadata for this source remains fail-closed as question-score explainability evidence when it lacks AMC-owned accepted evidence IDs, signed evidence rows, reproducible eval-pack hashes, thresholds, and repair hints tied to release gates.
