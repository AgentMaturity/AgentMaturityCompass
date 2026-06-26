# GAP-0620 — Fact-checking and factuality-evaluation review methodology boundary

- Gap: `GAP-0620`
- Source DOI: `https://doi.org/10.1007/s10462-025-11454-w`
- OpenAlex: `https://openalex.org/W7118132038`
- Source type: peer-reviewed review article metadata
- Retrieval date: 2026-06-20
- Dimension: `std-public-methodology`
- AMC surfaces: Score, Shield, Watch

## Verified metadata

Live Crossref and OpenAlex checks were performed before implementation.

- Crossref title: “Hallucination to truth: a review of fact-checking and factuality evaluation in large language models”
- Crossref DOI: `10.1007/s10462-025-11454-w`
- Crossref published date: 2026-01-03
- Crossref container: `Artificial Intelligence Review`
- OpenAlex id: `https://openalex.org/W7118132038`
- OpenAlex DOI: `https://doi.org/10.1007/s10462-025-11454-w`
- OpenAlex title: “Hallucination to truth: a review of fact-checking and factuality evaluation in large language models”
- OpenAlex publication year: 2026
- OpenAlex source: `Artificial Intelligence Review`

## Relevance decision

Relevant as methodology-versioning source-review evidence for existing AMC public methodology primitives only. The review supports tighter boundaries for claims about hallucination detection, fact checking, factuality evaluation, claim verification, source grounding, evidence retrieval, evaluator calibration, and abstention/uncertainty policies.

## Product closure

- Added a public methodology boundary: `fact_checking_factuality_review_methodology_integrity`.
- Added a metric-validation gate: `fact_checking_factuality_review_methodology_evidence`.
- Added methodology-versioning receipt checks so Score, Shield, Watch, and badge-bound claims fail closed without DOI/OpenAlex metadata receipts, control mapping, threshold policy, signed evidence, row hashes, changelog, deprecation, migration guidance, and no-copy proof.
- Added badge output copy that reminds users source-review claims are methodology-bound by `amc_methodology_assurance`.

## Explicit non-goals

- No standalone fact-checking subsystem was added.
- No paper prose, tables, figures, taxonomy content, benchmark data, prompts, examples, metric values, or implementation details were copied.
- DOI/OpenAlex metadata, abstracts, titles, venue names, cited benchmark labels, or source metadata alone are not accepted as external evidence.

## Migration guidance

Reports generated before methodology `2026.06.20-r214` should be regenerated or relabeled before they use review-informed fact-checking/factuality claims as externally comparable Score, Shield, or Watch evidence.
