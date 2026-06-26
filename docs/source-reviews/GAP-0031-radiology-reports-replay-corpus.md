# GAP-0031 - Radiology reports replayable benchmark corpus

- Gap: `GAP-0031`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `Large language models for simplifying radiology reports: a systematic review and meta-analysis of patient, public, and clinician evaluations`
- Retrieval: live OpenAlex API/page, DOI redirect behavior, Lancet/ScienceDirect access behavior, PubMed ESummary/EFetch, PMC page, local backlog metadata, and existing AMC replay-corpus implementation, 2026-06-26
- Status: Done

## Relevance decision

GAP-0031 is relevant to AMC because it asks for a replayable benchmark corpus: versioned manifests, fixed seeds, fixture hashes, score deltas, signed evidence, and CI/lifecycle receipts that let auditors rerun the evidence behind Score, Shield, and Watch claims. The radiology report simplification article is useful source-review context because it reviews LLM-based rewriting of clinical radiology reports for patient, public, and clinician understanding, and it explicitly preserves the concern that simplification can still contain clinically significant errors.

The source reinforces AMC's existing requirement that high-risk evaluation claims must be replayable and evidence-linked. A valid AMC closure must use AMC-owned replay manifests, fixture hashes, fixed seeds, baseline/candidate rows, score deltas, signed evidence refs, CI receipt, Watch alert projection, Shield verification, row hashes, and fail-closed thresholds.

The source does not justify a radiology benchmark clone, report simplification subsystem, clinical workflow, medical claim, Lancet scraper, ScienceDirect adapter, PubMed importer, PMC importer, OpenAlex importer, DOI adapter, copied radiology reports, copied clinical cases, copied prompts, copied outputs, or source-specific replay path.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Primary surface. Replay-corpus receipts bind score deltas to deterministic fixture hashes, source refs, signed baseline/candidate evidence, and a manifest hash. |
| Shield | Relevant. Shield can verify replay receipts before accepting radiology, readability, completeness, safety, or clinical-error evaluation claims. |
| Enforce | Out of scope. No runtime policy, release gate, circuit breaker, or radiology simplification enforcement workflow changed. |
| Vault | Out of scope. No radiology report storage, patient data, PHI handling, DLP, or data-residency behavior changed. |
| Watch | Relevant. Watch can project replay-corpus regressions and missing evidence into alertable failures. |
| Fleet | Out of scope. No fleet topology, routing, or multi-agent orchestration changed. |
| Passport | Indirect only. Replay receipts can support exported trust bundles, but no Passport schema changed. |
| Comply | Indirect only. The source is medical context, but no healthcare, HIPAA, clinical-governance, or medical-device compliance mapping changed. |

## Product closure

No product implementation module changed for this Top-100 closure. Existing AMC behavior already covers the gap:

- `runReplayBenchmarkCorpus` emits a replayable manifest with source refs, fixture hashes, fixed seeds, baseline/candidate rows, signed evidence refs, row hashes, score deltas, and manifest hash.
- `buildEvalReplayCorpusEvidenceReceipt` fails closed when Score/Shield/Watch coverage, source refs, signed evidence, manifest hash, fixture hash, score delta, or CI receipt proof is missing.
- The replay-corpus API/CLI path returns manifest, CI receipt, and Watch alert projection.
- Shield verifies replay receipts and Watch projects alertable failures.

Added focused regression coverage in `tests/gap0031RadiologyReportsReplayCorpusBoundary.test.ts` and this source-review note.

Live source facts verified:

- DOI: `https://doi.org/10.1016/j.landig.2025.100960`
- Lancet page: `https://www.thelancet.com/journals/landig/article/PIIS2589-7500(25)00142-6/fulltext`
- ScienceDirect DOI target: `https://www.sciencedirect.com/science/article/pii/S2589750025001426`
- PubMed: `https://pubmed.ncbi.nlm.nih.gov/41698858/`
- PubMed ID `41698858`
- PMC: `https://pmc.ncbi.nlm.nih.gov/articles/PMC12992207/`
- PMCID `PMC12992207`
- OpenAlex work/API: `https://openalex.org/W7128949215` / `https://api.openalex.org/works/W7128949215`
- Source title: `Large language models for simplifying radiology reports: a systematic review and meta-analysis of patient, public, and clinician evaluations`
- Journal/source: `The Lancet Digital Health`
- Publisher/host: Elsevier BV.
- Publication date: 2026-02-01.
- E-publication date: 2026 Feb 16.
- OpenAlex type: article.
- OpenAlex volume/issue/page: volume `8`, issue `2`, page `100960`.
- OpenAlex open-access status: gold; OpenAlex license: `cc-by`.
- OpenAlex indexing: Crossref, DOAJ, PubMed.
- PubMed publication types: Journal Article, Systematic Review, Meta-Analysis.
- PubMed and NCBI source context includes CENTRAL, MEDLINE, Embase, searches through Nov 11, 2025, full-text articles and preprints, patient/public/clinician assessments, readability, and clinical-error concerns.
- PubMed abstract metadata records 38 studies, 12,922 simplified reports, and 508 evaluators.
- Retrieval hashes:
  - OpenAlex API HTTP 200, effective URL `https://api.openalex.org/works/W7128949215`, first-200KB SHA-256 `5cac6de1c8104f59e045bb9c9a925984a1ed64af2ec49cf61b2ada26c710842c`.
  - OpenAlex page HTTP 200, effective URL `https://openalex.org/W7128949215`, first-200KB SHA-256 `aa45744b70c20550bd079db4356ac6d15377370e982f86be349ee036b4700059`.
  - DOI retrieval followed to ScienceDirect and returned HTTP 403, effective URL `https://www.sciencedirect.com/science/article/pii/S2589750025001426`, first-200KB SHA-256 `4971b2a3fe265cb75f59fb4fa5e4adefcb20627a55d44b87653cd7b57dc99b0d`; this is recorded as access behavior, not as proof content.
  - Lancet article retrieval returned HTTP 403, effective URL `https://www.thelancet.com/journals/landig/article/PIIS2589-7500(25)00142-6/fulltext`, first-200KB SHA-256 `fdadb8c013d3b381fe65e4c07bed6804152c4862c0d17b06cc3654449be0efdf`; this is recorded as access behavior, not as proof content.
  - PubMed page HTTP 200, effective URL `https://pubmed.ncbi.nlm.nih.gov/41698858/`, first-200KB SHA-256 `3b2ac4c3b70fc23c7331d1352b04d34dfbb7161e77d2e91b7fc75130b76c7bb0`.
  - PMC page HTTP 200, effective URL `https://pmc.ncbi.nlm.nih.gov/articles/PMC12992207/`, first-200KB SHA-256 `af3490cdf889f6c0f03a4f22181966a900d0b5e1eb9e15472ab49307f087e19e`.

## Fail-closed rule

Replay-corpus evidence fails closed when Score/Shield/Watch coverage is missing, source refs are missing, signed evidence refs are absent, replay manifest is absent, fixture hash is absent, fixed seed is absent, baseline/candidate rows are absent, score delta is absent, CI/lifecycle receipt is absent, row hashes are absent, manifest hash is absent, or Watch/Shield consumers cannot verify the receipt.

Metadata-only radiology evidence fails closed. Article title, DOI, Lancet page, ScienceDirect target, PubMed ID, PMCID, OpenAlex metadata, publication date, journal label, publisher label, OA status, license label, indexing label, systematic-review label, meta-analysis label, CENTRAL/MEDLINE/Embase labels, patient/public/clinician labels, readability labels, clinical-error labels, radiology-report labels, report-count labels, evaluator-count labels, or local backlog metadata cannot satisfy AMC replay-corpus proof without AMC-owned fixtures, manifests, signed baseline/candidate evidence, deterministic hashes, score deltas, and CI receipts.

## No-bloat boundary

No radiology benchmark clone, report simplification subsystem, clinical workflow, patient-communication workflow, readability scorer, clinical-error scorer, medical-report generator, radiology report parser, Lancet scraper, ScienceDirect adapter, PubMed importer, PMC importer, OpenAlex importer, DOI adapter, paper parser, citation importer, source-specific API/CLI, Watch monitor, Shield verifier, Passport schema change, public methodology version bump, healthcare compliance mapping, medical-device claim, provider parity claim, copied source prose, copied abstract text, copied figures, copied tables, copied examples, copied radiology reports, copied clinical cases, copied prompts, copied model outputs, copied benchmark rows, copied screenshots, copied configs, or copied implementation details were added.

The paper remains source-review context only. AMC accepts only signed AMC-native replay-corpus evidence.

## Verification

- Expected-red focused test: `npx vitest run tests/gap0031RadiologyReportsReplayCorpusBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-0031-radiology-reports-replay-corpus.md` did not exist; 3 replay-corpus/no-bloat tests passed.
- Live source checks:
  - Web channel found the PubMed, PMC, Lancet, DOI, and OpenAlex records and verified current search/source metadata.
  - Shell retrieval fetched `https://api.openalex.org/works/W7128949215` with HTTP 200 and hash `5cac6de1c8104f59e045bb9c9a925984a1ed64af2ec49cf61b2ada26c710842c`.
  - Shell retrieval fetched `https://openalex.org/W7128949215` with HTTP 200 and hash `aa45744b70c20550bd079db4356ac6d15377370e982f86be349ee036b4700059`.
  - Shell DOI retrieval showed `https://doi.org/10.1016/j.landig.2025.100960` redirects to ScienceDirect, which returned HTTP 403 and was recorded as access behavior only.
  - Shell Lancet article retrieval returned HTTP 403, recorded as access behavior and not proof content.
  - Shell retrieval fetched `https://pubmed.ncbi.nlm.nih.gov/41698858/` with HTTP 200 and hash `3b2ac4c3b70fc23c7331d1352b04d34dfbb7161e77d2e91b7fc75130b76c7bb0`.
  - Shell retrieval fetched `https://pmc.ncbi.nlm.nih.gov/articles/PMC12992207/` with HTTP 200 and hash `af3490cdf889f6c0f03a4f22181966a900d0b5e1eb9e15472ab49307f087e19e`.
- Focused test: `npx vitest run tests/gap0031RadiologyReportsReplayCorpusBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired replay-corpus/API regression: `npx vitest run tests/gap0031RadiologyReportsReplayCorpusBoundary.test.ts tests/gap0029PsychometricsReplayCorpusBoundary.test.ts tests/gap0014BiasSurveyReplayCorpusBoundary.test.ts tests/gap0007ArizePhoenixReplayCorpusBoundary.test.ts tests/replayBenchmarkCorpus.test.ts tests/apiRouters.test.ts tests/providerDriftBenchmark.test.ts --reporter=dot` passed, 7 files / 240 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 1019 files / 8091 tests.
