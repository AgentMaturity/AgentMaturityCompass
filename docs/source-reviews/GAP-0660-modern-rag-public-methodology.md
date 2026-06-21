# GAP-0660 — modern RAG public-methodology relevance review

- Gap: `GAP-0660`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://openalex.org/W7128601153` / DOI `10.1016/j.cosrev.2026.100925`
- Source URL: `https://doi.org/10.1016/j.cosrev.2026.100925`
- Retrieval: `2026-06-21T04:54:43Z` via OpenAlex, Crossref, and DOI content negotiation (`status=200` for all three; selected metadata SHA-256 `2854d51cf1e1f5152672ded0ceb5381657efe657a64f6cf506ec8887f9d4c289`)
- Status: source is relevant modern RAG / knowledge-graph architecture background, but not a public AMC methodology version change by itself.

## Live source metadata

Verified selected identity metadata before closure without copying paper prose, abstract text, figures, tables, architecture diagrams, benchmark rows, datasets, prompts, or implementation details:

| Field | Value |
| --- | --- |
| OpenAlex ID | `https://openalex.org/W7128601153` |
| DOI | `https://doi.org/10.1016/j.cosrev.2026.100925` |
| Title | `From vectors to knowledge graphs: A comprehensive analysis of modern retrieval-augmented generation architectures` |
| Venue/source | `Computer Science Review` |
| Publisher | `Elsevier BV` |
| Type | OpenAlex `article`; Crossref/DOI `journal-article` |
| Publication metadata | OpenAlex `2026-02-11` / `publication_year: 2026`; Crossref/DOI issued `2026-08` |
| Article/page | Crossref article number `100925`; DOI CSL page `100925`; DOI CSL volume `61` |
| OpenAlex access | `closed` |
| Counts at retrieval | OpenAlex `authorship_count=3`, `referenced_works_count=38`, `cited_by_count=3`; Crossref `reference-count=315`, `is-referenced-by-count=3` |
| Metadata freshness | OpenAlex `updated_date=2026-06-15T08:34:33.830935`, `created_date=2026-02-11T00:00:00`; Crossref `created.date-time=2026-02-11T13:26:20Z` |
| DOI/Crossref license metadata | Elsevier TDM / STM automated sharing policy URLs only; no open paper-content license was inferred |

The metadata SHA-256 is computed over AMC's compact, sorted JSON capture of the fields above plus API statuses and retrieval timestamp. These facts are retained only as source-review identity metadata.

## Relevance decision

The source is relevant as background context for RAG evolution, vector retrieval, graph-augmented retrieval, and knowledge-graph terminology that might appear in Score, Shield, or Watch narratives. It can help reviewers recognize when a claim is merely using RAG/KG vocabulary rather than presenting AMC-owned evidence.

It does not establish or change AMC public methodology version semantics. The live DOI/OpenAlex/Crossref metadata and title do not supply an AMC scoring rule, public question-set version, badge comparability rule, report-binding contract, evidence schema, fail-closed threshold policy, signed-evidence requirement, row-hash requirement, deprecation notice, changelog, or migration guidance. Treating this paper as a methodology-version source, retrieval subsystem spec, KG subsystem spec, benchmark mirror, or importer requirement would exceed the source-review gap and add product bloat.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Background RAG/KG context only; accepted scoring claims still require AMC-owned eval packs, validation tables, thresholds, metric owners, sample sizes, confidence intervals, signed evidence, row hashes, and no-copy proof. |
| Shield | Background risk/evidence context only; no new safety threshold, control, attack class, or badge-assurance rule is introduced by source metadata alone. |
| Watch | Background retrieval/architecture context only; no new drift detector, graph monitor, live retrieval receipt, or alert semantics were added. |
| Enforce | No direct scope for policy enforcement. |
| Vault | No direct scope for secret/data-governance controls. |
| Fleet | No direct scope for orchestration or deployment controls. |
| Passport | No direct scope for identity/provenance passports beyond existing signed evidence rules. |
| Comply | Indirect technical-review context only; no compliance mapping was added. |

## No-bloat boundary

No retrieval subsystem, knowledge-graph subsystem, RAG adapter, graph database connector, vector-store connector, importer, benchmark mirror, evaluation harness, paper compatibility layer, public methodology version bump, copied paper prose, copied abstract, copied figures/tables, copied architecture diagrams, copied datasets, copied prompts, or copied metric values was added.

DOI/OpenAlex/Crossref metadata, venue, publisher, title, citation counts, article number, or source URL alone must fail closed for public Score, Shield, or Watch methodology evidence. Such claims require AMC-owned methodology version proof, changelog/deprecation/migration evidence, validation artifacts, badge assurance, signed evidence, row hashes, and no-copy receipts.

## Product closure

Closed as a relevance-gated no-bloat source-review boundary. No product module changed because this source does not alter AMC's public methodology versioning contract; it only records background context for future RAG/KG-related agent-evaluation claims.

## Verification

- `npx vitest run tests/gap0660PublicMethodologyBoundary.test.ts`
- `npm run typecheck`
- `git diff --check`
