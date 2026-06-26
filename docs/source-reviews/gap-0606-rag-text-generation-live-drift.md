# GAP-0606 source review: RAG text-generation live drift alerts

Gap: `GAP-0606` / `obs-live-drift-alerts`
Surfaces considered: Score, Shield, Watch
Source OpenAlex work: `W4394947112`
DOI: <https://doi.org/10.1145/3805774>
Assigned title: `Survey on Retrieval-Augmented Text Generation for LLM`
Verified title: `A Survey on Retrieval-Augmented Text Generation for Large Language Models`

## Live source verification

Verified from the isolated `agent/gap-0606` worktree on 2026-06-20 using live OpenAlex, Crossref, DOI resolution, and ACM landing-page metadata requests. Only bibliographic and landing-page metadata was inspected; no paper prose, figures, tables, evaluation data, prompts, or PDF contents were copied into AMC.

- OpenAlex API `https://api.openalex.org/works/W4394947112` returned HTTP 200:
  - Work id: `https://openalex.org/W4394947112`
  - DOI: `https://doi.org/10.1145/3805774`
  - Title/display name: `A Survey on Retrieval-Augmented Text Generation for Large Language Models`
  - Publication date: `2026-04-09`
  - Primary source: `ACM Computing Surveys`; host organization name: `Association for Computing Machinery`
  - Concepts included `Computer science`, `Natural language processing`, `Language model`, `Information retrieval`, and `Artificial intelligence`.
- Crossref API `https://api.crossref.org/works/10.1145/3805774` returned HTTP 200:
  - DOI: `10.1145/3805774`
  - Type: `journal-article`
  - Publisher: `Association for Computing Machinery (ACM)`
  - Container: `ACM Computing Surveys`
  - Published online: `2026-05-15`; print date: `2026-09-30`
- DOI resolution for `https://doi.org/10.1145/3805774` returned HTTP 200 and resolved to `https://dl.acm.org/doi/10.1145/3805774`.
- The ACM landing-page metadata retrieved through DOI resolution reported:
  - `<title>`: `A Survey on Retrieval-Augmented Text Generation for Large Language Models | ACM Computing Surveys`
  - `dc.Title`: `A Survey on Retrieval-Augmented Text Generation for Large Language Models`
  - `dc.Publisher`: `ACMPUB27New York, NY`
  - `dc.Date`: `2026-05-15`

## Relevance decision

Decision: **relevant only as a metadata-grounded RAG text-generation monitoring source; no paper content imported**.

The verified metadata identifies an ACM Computing Surveys article about retrieval-augmented text generation for large language models. That is relevant to AMC's RAG live-drift surface because existing AMC Watch receipts already track baseline RAG distributions, live samples, drift statistics, evidence coverage, and alert receipts for retrieval quality, generation quality, answer support, hallucination rate, citation/grounding coverage, and strategy/context drift.

The source was not used as a benchmark dataset, implementation, or source of thresholds. Product behavior remains fail-closed and metadata-only: a caller must provide DOI/OpenAlex/publisher metadata hashes plus per-row evidence and signed receipts. Missing or mismatched metadata produces an alert even when generic RAG quality metrics are stable.

## Product integration

Implemented a thin Watch adapter over existing live-drift primitives:

- `src/watch/ragTextGenerationLiveDrift.ts`
  - Adds typed `RagTextGenerationSourceProof` metadata proof fields for OpenAlex, DOI/Crossref, publisher metadata, review receipt, and no-copy proof.
  - Maps RAG text-generation baseline/live rows into existing `LiveDriftSampleRow` RAG fields.
  - Uses `runLiveScoreBehaviorDrift` for baseline distribution, live sample hashing, score/behavior drift statistics, fail-closed alert receipts, and Watch alert projection.
  - Adds a source-proof alert on `ragStrategyEvidenceCoverage0to1` when metadata hashes or canonical identifiers are missing/mismatched.
- `src/watch/index.ts`
  - Re-exports the adapter and types.
- `tests/ragTextGenerationLiveDrift.test.ts`
  - Verifies stable baseline/live windows produce a valid non-alerting receipt.
  - Verifies live RAG quality drift plus incomplete metadata proof fails closed with alert receipt and Watch alerts.

## Copy/provenance boundary

No ACM paper prose, abstract text, PDF text, figures, tables, datasets, or prompts are copied into AMC. Tests use synthetic hashes and synthetic RAG telemetry rows to exercise AMC's existing drift receipt machinery.
