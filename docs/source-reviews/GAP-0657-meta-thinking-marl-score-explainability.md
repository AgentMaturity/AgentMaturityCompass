# GAP-0657 — Meta-thinking MARL survey score-explainability boundary

- Gap: `GAP-0657`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://openalex.org/W7133818764` / DOI `10.21203/rs.3.rs-8994957/v1`
- Retrieval: `2026-06-21T04:34:33Z` via live OpenAlex and DOI metadata
- Source URL: `https://doi.org/10.21203/rs.3.rs-8994957/v1`

## Live metadata verification

Only bibliographic/source metadata was recorded. No paper prose, abstract text, figures, tables, datasets, benchmark rows, prompts, model outputs, algorithms, or implementation details were copied into AMC.

- OpenAlex work: `https://openalex.org/W7133818764`
- OpenAlex DOI: `https://doi.org/10.21203/rs.3.rs-8994957/v1`
- DOI resolver identifier: `10.21203/rs.3.rs-8994957/v1`
- Title: `Meta-Thinking in LLMs via Multi-Agent Reinforcement Learning: A Survey`
- OpenAlex type/year/date: `preprint`, `2026`, `2026-03-05`
- DOI CSL type/publisher/date: `posted-content`, `Springer Science and Business Media LLC`, `2026-03-05`
- Source host in OpenAlex metadata: `Research Square`
- OpenAlex authorship count: `5`
- OpenAlex retraction/paratext flags: `is_retracted=false`, `is_paratext=false`
- OpenAlex metadata SHA-256: `4710bd1b67e790fdef5975cb443403948ba74c1d09c1ed9286917a95f76a9c12`
- DOI CSL metadata SHA-256: `4b63e29c2dc802da59e470537090b37a0475be5d8089533192c39049931a6c51`

## Relevance decision

Relevant, but only as source-review context for AMC's existing question-level score explainability and multi-user/multi-agent benchmark lenses. The verified title and metadata identify a survey about LLM meta-thinking through multi-agent reinforcement learning; that can motivate careful explanation of multi-agent evaluation claims, but it does not supply AMC evidence by itself.

AMC may cite this source only when a Score, Shield, or Watch question-score row is already backed by AMC-owned evidence:

- question ID and score receipt;
- accepted evidence IDs and signed evidence rows;
- rejected evidence reasons for metadata-only paper claims;
- repair hints;
- reproducible eval-pack hashes and CI/config hashes;
- fail-closed thresholds;
- multi-user/multi-agent benchmark lens fields when claimed, including scenario id, role manifest hash, interaction trace hash, evaluator config hash, result/metric hashes, and thresholded coordination/fairness/instruction-following metrics;
- no-paper-copy/source-review boundary proof.

Metadata-only DOI/OpenAlex citation remains rejected as Score, Shield, or Watch evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Yes, only through existing question-score explainability rows with AMC-owned eval packs, signed evidence, thresholds, and rejected metadata-only reasons. |
| Shield | Yes, only when unsafe or unsupported multi-agent/MARL-style claims are rejected with signed evidence and repair hints. |
| Watch | Yes, only when caller-owned traces/metrics are hash-bound through existing Watch/evaluation receipts. |
| Fleet | Indirect context only; no orchestration/runtime change. |
| Enforce | No direct policy-enforcement change. |
| Vault | No vault/storage change. |
| Passport | Indirect only through existing question-score explainability summaries; no source-specific passport field. |
| Comply | No compliance-control change. |

## Product closure

GAP-0657 is closed with documentation plus regression coverage over existing question-score explainability primitives. No source module was added because the existing diagnostic explainability builder already supports source refs, rejected evidence, multi-user benchmark lenses, reproducible eval packs, signed rows, thresholds, and fail-closed pack status.

## No-bloat boundary

This change does **not** add a meta-thinking subsystem, MARL subsystem, DOI/OpenAlex importer, benchmark mirror, paper parser, survey-content corpus, copied paper prose/data, training loop, multi-agent simulator, benchmark parity layer, or source-specific scoring path. The source is used only as live bibliographic metadata for a relevance-gated source review.
