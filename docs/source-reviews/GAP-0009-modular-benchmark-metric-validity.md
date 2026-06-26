# GAP-0009 - Modular benchmark metric validity

- Gap: `GAP-0009`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `A MODULAR BENCHMARKING FRAMEWORK FOR EVALUATING LLM-BASED AGENT APPLICATIONS`
- Retrieval: OpenAlex API, Crossref API, DOI redirect headers, direct page headers, and local backlog metadata, 2026-06-25
- Status: Done

## Relevance decision

GAP-0009 is relevant to AMC because it asks for metric validity and reliability checks for agent evaluation. The modular benchmarking paper is source-review context for benchmark structure, modular design, and systems/software engineering concepts. That maps to AMC's existing Score metric-validity receipt and its Watch-facing CI/lifecycle gate. Shield relevance is indirect: benchmark-backed safety claims still need signed, replayable evidence before they can support security or risk assertions.

The source does not justify a modular benchmark clone, IAEME importer, paper parser, or source-specific scoring subsystem. AMC's valid closure is to require AMC-owned metric-validity evidence: validation table, confidence interval, sample size, metric owner, signed evidence refs, reproducible eval pack, row hashes, dataset/manifest hashes, and CI/lifecycle gate failure behavior.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Primary surface. Metric-validity receipts bind maturity metric claims to validation rows, confidence intervals, sample size, owner, eval-pack hashes, and CI/lifecycle gate state. |
| Shield | Relevant only when benchmarked safety/security assertions are backed by signed AMC evidence. No Shield detector changed. |
| Enforce | Out of scope. No runtime guardrail, policy firewall, or circuit breaker changed. |
| Vault | Out of scope for this gap. Signed evidence refs and hashes can be stored by existing evidence primitives, but no Vault behavior changed. |
| Watch | Relevant because lifecycle-mode regression thresholds fail closed and can be monitored. No new Watch monitor changed. |
| Fleet | Out of scope. No multi-agent topology or fleet orchestration changed. |
| Passport | Out of scope. No portable trust-token schema changed. |
| Comply | Indirect only. Metric-validity proof can support audits, but no compliance mapping changed. |

## Product closure

No product module changed in this Top-100 closure. Existing `src/score/metricValidity.ts` already builds the required AMC-native metric-validity report:

- validation table rows,
- sample size,
- confidence interval,
- metric owner,
- construct-validity/process/outcome coverage,
- inter-rater agreement,
- test-retest stability,
- signed evidence refs,
- eval-pack dataset hash, row hashes, and manifest hash,
- replayable flag, and
- CI/lifecycle gate fail-closed state.

Added focused regression coverage in `tests/gap0009ModularBenchmarkMetricValidityBoundary.test.ts` and this source-review note.

Live source facts verified:

- OpenAlex page: `https://openalex.org/W7119224602`
- OpenAlex API: `https://api.openalex.org/works/W7119224602`
- DOI: `https://doi.org/10.34218/ijrcait_09_01_001`
- DOI value: `10.34218/ijrcait_09_01_001`
- Crossref API: `https://api.crossref.org/works/10.34218/ijrcait_09_01_001`
- DOI PDF target: `https://iaeme.com/MasterAdmin/Journal_uploads/IJRCAIT/VOLUME_9_ISSUE_1/IJRCAIT_09_01_001.pdf`
- Title: `A MODULAR BENCHMARKING FRAMEWORK FOR EVALUATING LLM-BASED AGENT APPLICATIONS`
- publication year `2026`
- publication date `2026-01-06`
- OpenAlex type `article`
- Crossref type `journal-article`
- Journal/source: `INTERNATIONAL JOURNAL OF RESEARCH IN COMPUTER APPLICATIONS AND INFORMATION TECHNOLOGY`
- Publisher: `IAEME Publication`
- OpenAlex OA status `bronze`
- Concepts include `Computer science`, `Modular design`, `Benchmarking`, and `Systems engineering`.
- Authorship metadata includes `Karthik Perikala`.
- DOI resolved to the IAEME PDF target with HTTP `200`; first 200 KB response SHA-256 `fc0a17e01661272783c9162707b8a059665f49d01142e8dcfe9faee3289a1871`.
- Direct OpenAlex page returned HTTP `403`; first 200 KB response SHA-256 `018e4d06a348592573f6162d0e2e0a2c198ec93b7dab27a24f75e682b50723e5`.

## Fail-closed rule

Metric-validity claims fail closed when validation rows are under-sampled, confidence intervals are missing or too wide, construct-validity coverage is incomplete, process evidence is incomplete, outcome alignment is absent, signed evidence refs are missing, eval-pack rows are not replayable, row hashes are absent, the manifest hash is absent, or the CI/lifecycle gate fails.

metadata-only modular benchmark evidence fails closed. Paper title, DOI, OpenAlex metadata, Crossref metadata, IAEME PDF reachability, journal label, publisher label, publication date, OA status, concepts, author metadata, modular-design labels, benchmark labels, systems-engineering labels, software-engineering labels, or local backlog text cannot satisfy AMC metric-validity proof without AMC-owned validation table evidence, confidence interval, sample size, metric owner, signed evidence refs, reproducible eval pack, regression thresholds, row hashes, manifest hash, and CI/lifecycle gate state.

## No-bloat boundary

No modular benchmark clone, IAEME importer, PDF parser, benchmark framework mirror, paper importer, OpenAlex adapter, Crossref adapter, source-specific CLI/API, public methodology bump, benchmark parity claim, copied abstract, copied methods, copied figures, copied tables, copied prompts, copied datasets, copied model outputs, copied code, copied screenshots, or copied implementation details were added.

The modular benchmark paper remains source-review context only. AMC accepts only signed AMC-native metric-validity evidence.

## Verification

- Expected-red focused test: `npx vitest run tests/gap0009ModularBenchmarkMetricValidityBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-0009-modular-benchmark-metric-validity.md` did not exist; 3 metric-validity/no-bloat tests passed.
- Live source checks:
  - `curl -L -s 'https://api.openalex.org/works/W7119224602'` returned OpenAlex metadata recorded above.
  - `curl -L -s 'https://api.crossref.org/works/10.34218/ijrcait_09_01_001'` returned Crossref metadata recorded above.
  - DOI and OpenAlex direct page header/hash checks returned the HTTP and hash evidence recorded above.
- Focused test: `npx vitest run tests/gap0009ModularBenchmarkMetricValidityBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired metric-validity regression: `npx vitest run tests/gap0009ModularBenchmarkMetricValidityBoundary.test.ts tests/gap0006HuntGptMetricValidityBoundary.test.ts tests/gap0002LlmSurveyMetricValidityBoundary.test.ts tests/metricValidity.test.ts tests/publicMethodology.test.ts tests/questionScoreExplainability.test.ts --reporter=dot` passed, 6 files / 174 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 1010 files / 8055 tests.
