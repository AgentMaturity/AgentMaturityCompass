# GAP-0624 — Digital materials ecosystem metric-validity boundary

- Gap: `GAP-0624`
- Source DOI: `https://doi.org/10.1039/d5sc09229a`
- OpenAlex work: `W7131071926`
- Verified title: `Digital materials ecosystem: from databases to AI agents for autonomous discovery`
- Source type: peer-reviewed article metadata
- Retrieval date: 2026-06-20
- Dimension: `eval-metric-validity`
- AMC surfaces: Score, Shield, Watch

## Live source metadata

Crossref API retrieval for DOI `10.1039/d5sc09229a` resolved to the title `Digital materials ecosystem: from databases to AI agents for autonomous discovery`, publisher Royal Society of Chemistry (RSC), published year 2026, and DOI URL `https://doi.org/10.1039/d5sc09229a`.

OpenAlex API retrieval for work `W7131071926` resolved to DOI `https://doi.org/10.1039/d5sc09229a`, the same title, publication year 2026, host venue `Chemical Science`, and landing page `https://doi.org/10.1039/d5sc09229a`.

## Relevance decision

Relevant only as a source-review signal for existing AMC metric-validity and public-methodology boundaries. No materials-domain subsystem, article-specific importer, discovery workflow, database connector, or parity claim was added.

## Product closure

- Added a Digital materials ecosystem source-review boundary to public methodology and methodology-versioning assurance.
- Added a Score/Shield/Watch metric-validity gate that fails closed unless claims are backed by AMC-owned eval packs using existing primitives, validation table, threshold policy, metric owner, sample size, confidence interval, signed evidence refs, artifact hashes, and row hashes.
- Added `src/score` requirement helpers so callers can surface the DOI/OpenAlex source-review requirements without creating domain-specific scoring logic.

## No-copy boundary

No paper prose, figures, tables, data, prompts, workflows, implementation details, or materials-domain content were copied. DOI/OpenAlex metadata is used only to verify source identity and to bind the no-copy source-review requirement.
