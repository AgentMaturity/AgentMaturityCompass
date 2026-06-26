# GAP-0649 — adaptive multi-agent public-methodology relevance review

- Gap: `GAP-0649`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://openalex.org/W7125981967` / DOI `10.3390/app16031323`
- Source URL: `https://doi.org/10.3390/app16031323`
- Retrieval: `2026-06-21T04:34:38Z` via OpenAlex, Crossref, and DOI content negotiation (`status=200` for all three; selected metadata SHA-256 `10cc7838de79b99eee81c8b85c2c18052998b42b0cb900aa4cb73283dc88b355`)
- Status: source is relevant education-domain multi-agent architecture context, but not a public AMC methodology version change by itself.

## Live source metadata

Verified selected identity metadata before closure without copying paper prose, datasets, tables, figures, benchmark rows, or implementation details:

- OpenAlex ID: `https://openalex.org/W7125981967`
- DOI: `https://doi.org/10.3390/app16031323`
- Title: `An Adaptive Multi-Agent Architecture with Reinforcement Learning and Generative AI for Intelligent Tutoring Systems: A Moodle-Based Case Study`
- Venue/source: `Applied Sciences`
- Publisher metadata: `MDPI AG` / OpenAlex host organization `Multidisciplinary Digital Publishing Institute`
- Type: OpenAlex `article`; Crossref/DOI `journal-article`
- Publication date: `2026-01-28` (`publication_year: 2026`)
- OpenAlex open-access status: `gold`; Crossref license URL `https://creativecommons.org/licenses/by/4.0/`
- Counts at retrieval: OpenAlex `authorship_count=3`, `referenced_works_count=16`, `cited_by_count=5`; Crossref `reference-count=31`, `is-referenced-by-count=6`
- Metadata freshness: OpenAlex `updated_date=2026-06-16T09:24:06.705377`, `created_date=2026-01-29T00:00:00`; Crossref `created.date-time=2026-01-28T15:04:46Z`

## Relevance decision

The source is relevant as background context for adaptive multi-agent systems in an educational/intelligent-tutoring setting. It can inform a source-review note for existing Score, Shield, and Watch evidence expectations when AMC-owned evaluations claim education-domain agent behavior, safety, or drift coverage.

It does not establish or change AMC public methodology version semantics. The metadata does not provide an AMC scoring rule, question-set version, public report-binding requirement, badge comparability rule, fail-closed threshold policy, signed evidence requirement, or migration/deprecation contract. Promoting it to a methodology version bump, benchmark mirror, adaptive multi-agent subsystem, Moodle integration, RL/GenAI adapter, or source-specific importer would add bloat and would exceed the source-review gap.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Background context only; accepted scoring claims still require AMC-owned eval packs, validation tables, thresholds, signed evidence, row hashes, and no-paper-copy proof. |
| Shield | Background context only; safety claims require existing Shield receipts and fail-closed evidence, not paper metadata alone. |
| Watch | Background context only; drift/monitoring claims require existing replay/live-drift receipts and signed trace evidence. |
| Enforce | No direct scope for policy enforcement. |
| Vault | No direct scope for secret/data-governance controls. |
| Fleet | No direct scope for fleet orchestration. |
| Passport | No direct scope for identity/provenance passports beyond existing signed evidence rules. |
| Comply | Indirect education-domain context only; no compliance claim or control mapping added. |

## No-bloat boundary

No public methodology version bump, adaptive multi-agent subsystem, Moodle integration, reinforcement-learning adapter, generative-AI adapter, benchmark mirror, paper-data copy, framework compatibility layer, SDK/importer, or new AMC product surface was added. Metadata-only DOI/OpenAlex/Crossref facts must fail closed as public methodology evidence unless paired with AMC-owned methodology version, changelog, deprecation/migration proof, validation artifacts, badge assurance, signed evidence, row hashes, and no-copy proof.

## Product closure

Closed as a relevance-gated no-bloat source-review boundary. No product module changed because this source does not alter AMC's public methodology versioning contract; it only records background context for future education-domain agent-evaluation claims.

## Fail-closed rule

Adaptive multi-agent architecture labels, Moodle case-study metadata, RL/GenAI wording, DOI/OpenAlex/Crossref metadata, venue, author, citation counts, or source URL alone must fail closed for public Score, Shield, or Watch methodology evidence. Such claims require AMC-owned methodology version proof, changelog/deprecation/migration evidence, validation artifacts, badge assurance, signed evidence, row hashes, and no-copy receipts.

## Verification

- `npx vitest run tests/gap0640To0648RelevanceBoundaries.test.ts`
- `npm run typecheck`
- `git diff --check`
