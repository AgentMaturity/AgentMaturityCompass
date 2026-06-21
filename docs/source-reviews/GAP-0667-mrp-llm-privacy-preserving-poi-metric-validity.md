# GAP-0667 source review: MRP-LLM privacy-preserving next POI recommendation

- Gap: `GAP-0667`
- Priority: P0
- Surfaces requested: Score, Shield, Watch
- Source type: paper
- Source ID: `https://openalex.org/W4405300788`
- DOI: `10.1145/3774935.3806151`
- Source URL: <https://doi.org/10.1145/3774935.3806151>
- Retrieval date: 2026-06-21T04:55:07Z

## Live source metadata

Live DOI/Crossref, DOI CSL-transform, and OpenAlex metadata were verified from the isolated `agent/gap-0667` worktree. Only bibliographic metadata facts were inspected and recorded; no abstract text, paper prose, figures, tables, prompts, benchmark rows, user/location datasets, privacy-preserving framework details, recommendation-system workflow, model architecture details, or implementation details were copied into AMC.

### DOI / Crossref metadata

- `https://api.crossref.org/works/10.1145/3774935.3806151` returned HTTP 200.
- Crossref response SHA-256: `11b25414040d9a56c20a3332c1624fe973ac23a4c741867a6758c95cb6cac112`.
- DOI JSON negotiation through `https://doi.org/10.1145/3774935.3806151` returned HTTP 200 via Crossref transform.
- DOI transform response SHA-256: `3bc7e7ffef1649e85e07efb370f3f7caea18863018310629359b0cdc3a7f16d7`.
- Crossref DOI: `10.1145/3774935.3806151`.
- Crossref title: `MRP-LLM: Multitask Reflective Large Language Models for Privacy-Preserving Next POI Recommendation`.
- Venue: `Proceedings of the 34th ACM Conference on User Modeling, Adaptation and Personalization`.
- Publisher: `ACM`.
- Type: `proceedings-article`.
- Published date reported by Crossref: `2026-06-08`; DOI CSL issued date reports `2026-06-07`.
- First listed authors in Crossref/DOI metadata: Ziqing Wu; Zhu Sun; Dongxia Wang; Lu Zhang; Jie Zhang.
- License metadata includes a CC-BY 4.0 legalcode URL.

### OpenAlex metadata

- `https://api.openalex.org/works/W4405300788` returned HTTP 200.
- OpenAlex response SHA-256: `6086d987f3265261dc2360bd54c1c0cc443e5a3e8f70d3cb02a6652d2a4d77a3`.
- OpenAlex id: `https://openalex.org/W4405300788`.
- OpenAlex DOI: `https://doi.org/10.1145/3774935.3806151`.
- OpenAlex title: `MRP-LLM: Multitask Reflective Large Language Models for Privacy-Preserving Next POI Recommendation`.
- Publication year/date: `2026` / `2026-06-01`.
- OpenAlex type: `preprint`.
- Open access status: gold.
- OpenAlex did not report a primary source display name in the live response.
- First listed OpenAlex authors: Zhigang Wu; Zhu Sun; Dongxia Wang; Lu Zhang; Jie Zhang. This differs from Crossref/DOI metadata for the first given name, so future reviews must re-check the live source receipts before citing author metadata.

## Relevance decision

**Decision: fail-closed metadata-only source review; no implementation added.**

The verified metadata identifies a paper about a multitask reflective LLM method for privacy-preserving next point-of-interest recommendation. The metadata does not establish an AMC metric-validity or reliability method, validation table, evaluator suite, trace-evaluation protocol, benchmark artifact AMC can replay, threshold policy, or public methodology versioning control for Score, Shield, or Watch. It also does not justify an MRP-LLM subsystem, privacy-preserving framework, importer, adapter, benchmark mirror, task corpus, recommendation-system integration, or parity claim.

If a future AMC claim cites this paper, the citation can be used only as a high-level scientific-literature source-review signal and must still fail closed unless the claim supplies AMC-owned evidence through existing primitives, including:

- `metricValidation.rows[].scientificLiteratureCoverage` when scientific-literature evidence is actually claimed;
- `metricValidation.rows[].evaluatorSuiteCoverage` or `metricValidation.rows[].traceEvaluationCoverage` when evaluator or trace evidence is claimed;
- AMC-owned eval-pack manifest and validation table artifact;
- Score/Shield/Watch surface mapping;
- fail-closed threshold policy;
- metric owner, sample size, and confidence interval;
- signed evidence refs, artifact hashes, and row hashes;
- no-copy/source-review boundary proof.

## Non-implementation boundary

No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, or `src/diagnostic/methodologyVersioning.ts` source change was made for GAP-0667. No new MRP-LLM gate, privacy-preserving framework, importer, adapter, benchmark mirror, POI/recommendation subsystem, task corpus, model-architecture binding, or parity claim was added. Existing scientific-literature, evaluator-suite, and trace-evaluation primitives remain the only allowed path for any future Score/Shield/Watch claim.

## Copy/provenance boundary

No paper prose beyond the bibliographic title, no abstract text, no figures, no tables, no benchmark rows, no user/location data, no prompts, no privacy-preserving workflow, no recommendation-system workflow, no model architecture details, no screenshots, and no implementation details were copied. This review records only metadata facts, retrieval status, response hashes, one live metadata discrepancy, and the fail-closed non-implementation decision.
