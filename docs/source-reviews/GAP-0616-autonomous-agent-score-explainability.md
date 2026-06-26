# GAP-0616 — Autonomous-agent review question-score explainability boundary

- Gap: `GAP-0616`
- Source: DOI `10.1007/s10462-025-11471-9`, OpenAlex `W7118468219`
- Source type: paper
- Retrieval date: 2026-06-20
- Dimension: `eval-score-explainability`
- AMC surfaces: Score, Shield, Watch

## Live source metadata

Crossref resolved DOI `10.1007/s10462-025-11471-9` to title `From language to action: a review of large language models as autonomous agents and tool users`, publisher Springer, container `Artificial Intelligence Review`, type `journal-article`, year 2026. OpenAlex `W7118468219` matched the DOI/title and listed open-access metadata.

## Relevance decision

Relevant only to existing AMC question-score explainability, guide, and passport primitives. The source supports the need for question-level evidence linkage, not a standalone autonomous-agent paper subsystem.

## Product closure

- Extended guide/passport question explainability summaries to expose question ID, accepted evidence IDs, rejected evidence reasons, repair hint, status, and row hash.
- Added tests that bind DOI/OpenAlex metadata-only source refs into AMC-owned eval-score explainability receipts and keep copied paper prose/data out of fixtures.

## No-copy boundary

No paper prose, figures, tables, datasets, prompts, examples, or evaluation data were copied.
