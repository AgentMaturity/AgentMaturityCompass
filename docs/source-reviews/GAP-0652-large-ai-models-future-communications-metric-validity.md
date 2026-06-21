# GAP-0652 source review: Large AI models for future communications survey

- Gap: `GAP-0652`
- Priority: P0
- Surfaces requested: Score, Shield, Watch
- Source type: paper
- Source ID: `https://openalex.org/W7127308841`
- DOI: `10.1109/comst.2026.3660844`
- Source URL: <https://doi.org/10.1109/comst.2026.3660844>
- Retrieval date: 2026-06-21

## Live source metadata

Live DOI/Crossref and OpenAlex metadata were verified from the isolated `agent/gap-0652` worktree. Only bibliographic metadata facts were inspected and recorded; no abstract text, paper prose, figures, tables, benchmark rows, communications-domain data, prompts, workflows, or implementation details were copied.

### DOI / Crossref metadata

- `https://api.crossref.org/works/10.1109/comst.2026.3660844` returned HTTP 200.
- Crossref response SHA-256: `5f88d5423f3024030d03e55df6f1cfa2bc556990e1c0f8d2114d988909898294`.
- DOI JSON negotiation through `https://doi.org/10.1109/comst.2026.3660844` returned HTTP 200 via Crossref transform.
- DOI transform response SHA-256: `c3696f3ed86fe8c769a64a27790bb4f547eddd5ae0e2b57796ea268e2a9af0cd`.
- Crossref DOI: `10.1109/comst.2026.3660844`.
- Crossref title: `A Comprehensive Survey of Large AI Models for Future Communications: Foundations, Applications, and Challenges`.
- Venue: `IEEE Communications Surveys & Tutorials`.
- Publisher: `Institute of Electrical and Electronics Engineers (IEEE)`.
- Type: `journal-article`.
- Published year reported by Crossref: `2026`.
- First listed authors in Crossref metadata: Feibo Jiang; Cunhua Pan; Li Dong.

### OpenAlex metadata

- `https://api.openalex.org/works/W7127308841` returned HTTP 200.
- OpenAlex response SHA-256: `36baae9a488b9a9c3bf026edfeb4b5cd03a15c1b4f8fcd4400da9fa96210b731`.
- OpenAlex id: `https://openalex.org/W7127308841`.
- OpenAlex DOI: `https://doi.org/10.1109/comst.2026.3660844`.
- OpenAlex title: `A Comprehensive Survey of Large AI Models for Future Communications: Foundations, Applications, and Challenges`.
- Publication year/date: `2026` / `2026-01-01`.
- Source: `IEEE Communications Surveys & Tutorials`.
- OpenAlex type: `article`.
- Open access status: closed.
- First listed OpenAlex authors: Feibo Jiang; Cunhua Pan; Li Dong.

## Relevance decision

**Decision: fail-closed metadata-only source review; no implementation added.**

The verified metadata identifies a broad communications-domain survey of large AI models. The metadata alone does not establish a concrete AMC metric-validity primitive, evaluator suite, trace-evaluation protocol, validation table, benchmark artifact, reliability method, or public methodology versioning control that Score, Shield, or Watch can adopt. It also does not justify a communications-domain subsystem, communications benchmark mirror, importer, adapter, parity layer, or copied paper-content implementation.

If a future AMC claim cites this survey, the citation can be used only as a high-level scientific-literature source-review signal and must still fail closed unless the claim supplies AMC-owned evidence through existing primitives, including:

- `metricValidation.rows[].scientificLiteratureCoverage` when scientific-literature evidence is actually claimed;
- `metricValidation.rows[].evaluatorSuiteCoverage` or `metricValidation.rows[].traceEvaluationCoverage` when evaluator or trace evidence is claimed;
- AMC-owned eval-pack manifest and validation table artifact;
- Score/Shield/Watch surface mapping;
- fail-closed threshold policy;
- metric owner, sample size, and confidence interval;
- signed evidence refs, artifact hashes, and row hashes;
- no-copy/source-review boundary proof.

## Non-implementation boundary

No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, or `src/diagnostic/methodologyVersioning.ts` source change was made for GAP-0652. No new communications-domain gate, subsystem, importer, adapter, benchmark mirror, task corpus, or parity claim was added. Existing scientific-literature, evaluator-suite, and trace-evaluation primitives remain the only allowed path for future Score/Shield/Watch claims.

## Copy/provenance boundary

No paper prose beyond the bibliographic title, no abstract text, no figures, no tables, no benchmark rows, no communications-domain data, no prompts, no workflows, no screenshots, and no implementation details were copied. This review records only metadata facts, retrieval status, response hashes, and the fail-closed non-implementation decision.
