# GAP-0634 — Cognitive-retrieval source review for eval-score explainability

- Gap: `GAP-0634`
- Dimension: `eval-score-explainability`
- AMC surfaces: Score, Shield, Watch
- Source reviewed: `https://doi.org/10.5281/zenodo.19425474`
- Retrieval date: 2026-06-21

## Live metadata verification

The source was verified from live DOI, Zenodo, and OpenAlex metadata before implementation. No paper prose, tables, figures, datasets, algorithms, or benchmark data were copied into AMC.

- DOI requested: `https://doi.org/10.5281/zenodo.19425474`
- DOI resolver final URL: `https://zenodo.org/records/19476901`
- Zenodo API requested: `https://zenodo.org/api/records/19425474`
- Zenodo API final record: `https://zenodo.org/api/records/19476901`
- Zenodo record id: `19476901`
- Zenodo version DOI: `10.5281/zenodo.19476901`
- Zenodo concept DOI: `10.5281/zenodo.19425474`
- OpenAlex work: `https://openalex.org/W7150166984`
- OpenAlex DOI: `https://doi.org/10.5281/zenodo.19425474`
- Title: `From Static Scores to Cognitive Retrieval: A Comparative Evaluation of Memory Prioritization Algorithms for LLM Multi-Agent Systems`
- Creator/author: `Takayuki Seki`
- Resource/type/year: Zenodo `Preprint`; OpenAlex `preprint`, 2026
- Publication date: `2026-04-09`

## Relevance decision

Relevant only as source-review context for existing AMC question-score explainability, guide, and passport primitives. The source title and metadata indicate evaluation of score/retrieval prioritization in LLM multi-agent memory systems, which is adjacent to explaining score-derived decisions, but it does not justify adding a cognitive retrieval subsystem to AMC.

AMC accepts this source only when an AMC-owned question-score explanation binds:

- question ID,
- accepted evidence IDs,
- rejected evidence reasons,
- repair hint,
- signed evidence rows,
- reproducible eval-pack hashes,
- fail-closed thresholds,
- DOI/OpenAlex/Zenodo metadata-review references,
- no-paper-prose/data-copy boundary proof.

Metadata-only citation of the DOI, OpenAlex work, or Zenodo record is rejected as score evidence.

## Product closure

- Added `sourceRefCount` to eval-score explainability packs and passport summaries so DOI/OpenAlex/Zenodo source-review references remain countable beside per-row question proof.
- Updated guide evidence requirements to mention DOI/OpenAlex/Zenodo metadata and to treat the cognitive-retrieval preprint as literature metadata only until bound to AMC-owned question-score receipts.
- Added regression coverage proving Score/Shield/Watch rows expose question ID, accepted evidence IDs, rejected evidence reasons, and repair hints through diagnostic, guide, and passport paths.

## Non-goals / boundary

This change does **not** add cognitive retrieval, memory prioritization algorithms, retrieval ranking, paper-data imports, a Zenodo/OpenAlex importer, or parity with the paper. It uses only live bibliographic metadata and existing AMC primitives.
