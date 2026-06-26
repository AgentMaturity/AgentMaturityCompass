# GAP-0006 - HuntGPT metric validity

- Gap: `GAP-0006`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `HuntGPT: Integrating Machine Learning-Based Anomaly Detection and Explainable AI with Large Language Models (LLMs)`
- Retrieval: OpenAlex API, Crossref API, DOI redirect headers, direct page headers, and local backlog metadata, 2026-06-25
- Status: Done

## Relevance decision

GAP-0006 is relevant to AMC because it asks for metric validity and reliability checks for agent evaluation. The HuntGPT paper is source-review context around anomaly detection, false-positive risk, XAI, and operational trust. That maps to AMC's existing Score metric-validity receipt, with Shield relevance where false positives and security evaluation affect safety evidence, and Watch relevance where lifecycle or CI gates monitor regressions.

The source does not justify a HuntGPT implementation, anomaly-detection subsystem, network-security benchmark clone, paper importer, or MDPI/OpenAlex adapter. AMC's valid closure is to require AMC-owned metric-validity evidence: validation table, confidence interval, sample size, metric owner, signed evidence refs, reproducible eval pack, row hashes, dataset/manifest hashes, and CI/lifecycle gate failure behavior.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Primary surface. Metric-validity receipts bind maturity metric claims to validation rows, confidence intervals, sample size, owner, eval-pack hashes, and CI/lifecycle gate state. |
| Shield | Relevant where security/anomaly-detection evaluation context reminds AMC to fail closed on weak safety or false-positive evidence. No Shield detector changed. |
| Enforce | Out of scope. No runtime guardrail, policy firewall, or circuit breaker changed. |
| Vault | Out of scope for this gap. Signed evidence refs and hashes can be stored by existing evidence primitives, but no Vault behavior changed. |
| Watch | Relevant because CI/lifecycle gate state and regression thresholds can be monitored. No new Watch monitor changed. |
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

Added focused regression coverage in `tests/gap0006HuntGptMetricValidityBoundary.test.ts` and this source-review note.

Live source facts verified:

- OpenAlex page: `https://openalex.org/W4387210439`
- OpenAlex API: `https://api.openalex.org/works/W4387210439`
- DOI: `https://doi.org/10.3390/telecom7030073`
- DOI value: `10.3390/telecom7030073`
- Crossref API: `https://api.crossref.org/works/10.3390/telecom7030073`
- MDPI target: `https://www.mdpi.com/2673-4001/7/3/73`
- Title: `HuntGPT: Integrating Machine Learning-Based Anomaly Detection and Explainable AI with Large Language Models (LLMs)`
- publication year `2026`
- publication date `2026-06-08`
- OpenAlex type `preprint`
- Crossref type `journal-article`
- Journal/source: `Telecom`
- Publisher: `MDPI AG`
- Crossref license: `Creative Commons BY 4.0`
- OpenAlex primary-location license: `cc-by`
- OpenAlex OA status `gold`
- Concepts include `Computer science`, `Intrusion detection system`, `Anomaly detection`, and `False positive paradox`.
- Authorship metadata includes University of Oulu.
- DOI redirect resolved to the MDPI target but returned HTTP `403`; first 200 KB response SHA-256 `97a0dacf09315d9917fe11c656c61fbfd016b790ff26d1a16cc07f3e076df90d`.
- Direct OpenAlex page returned HTTP `403`; first 200 KB response SHA-256 `9af17d1592db7862c38f7ec2653101d82ed2f2077de2d317f760001cd97e4606`.

## Fail-closed rule

Metric-validity claims fail closed when validation rows are under-sampled, confidence intervals are missing or too wide, construct-validity coverage is incomplete, process evidence is incomplete, outcome alignment is absent, signed evidence refs are missing, eval-pack rows are not replayable, row hashes are absent, the manifest hash is absent, or the CI/lifecycle gate fails.

metadata-only HuntGPT evidence fails closed. Paper title, DOI, OpenAlex metadata, Crossref metadata, MDPI page metadata, journal label, publisher label, publication date, OA status, concepts, author/institution metadata, anomaly-detection labels, XAI labels, false-positive labels, or local backlog text cannot satisfy AMC metric-validity proof without AMC-owned validation table evidence, confidence interval, sample size, metric owner, signed evidence refs, reproducible eval pack, regression thresholds, row hashes, manifest hash, and CI/lifecycle gate state.

## No-bloat boundary

No HuntGPT adapter, anomaly-detection engine, IDS benchmark clone, XAI explainer, random-forest model, paper importer, OpenAlex adapter, Crossref adapter, MDPI scraper, source-specific CLI/API, public methodology bump, security benchmark parity claim, copied abstract, copied methods, copied figures, copied tables, copied prompts, copied datasets, copied model outputs, copied code, copied screenshots, or copied implementation details were added.

HuntGPT remains source-review context only. AMC accepts only signed AMC-native metric-validity evidence.

## Verification

- Expected-red focused test: `npx vitest run tests/gap0006HuntGptMetricValidityBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-0006-huntgpt-metric-validity.md` did not exist; 3 metric-validity/no-bloat tests passed.
- Live source checks:
  - `curl -L -s 'https://api.openalex.org/works/W4387210439'` returned OpenAlex metadata recorded above.
  - `curl -L -s 'https://api.crossref.org/works/10.3390/telecom7030073'` returned Crossref metadata recorded above.
  - DOI and OpenAlex direct page header/hash checks returned the HTTP and hash evidence recorded above.
- Focused test: `npx vitest run tests/gap0006HuntGptMetricValidityBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired metric-validity regression: `npx vitest run tests/gap0006HuntGptMetricValidityBoundary.test.ts tests/gap0002LlmSurveyMetricValidityBoundary.test.ts tests/metricValidity.test.ts tests/publicMethodology.test.ts tests/questionScoreExplainability.test.ts --reporter=dot` passed, 5 files / 170 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 1009 files / 8051 tests.
