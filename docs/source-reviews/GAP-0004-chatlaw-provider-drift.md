# GAP-0004 - Chatlaw provider drift

- Gap: `GAP-0004`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `Chatlaw: A Multi-Agent Legal Assistant based on a Role-Aligned Mixture-of-Experts Architecture`
- Retrieval: OpenAlex API, Crossref API, DOI redirect, arXiv page, and local backlog metadata, 2026-06-25
- Status: Done

## Relevance decision

GAP-0004 is relevant to AMC because it asks for provider/model drift benchmark proof in an agent-evaluation context. The Chatlaw source is useful because legal-agent, multi-agent, role-aligned, MoE, retrieval, and hallucination-sensitive workflows can drift when providers, model versions, routes, prompts, retrieval indexes, judge rubrics, or guardrails change. That maps to AMC's existing Score/Shield/Watch provider/model drift benchmark receipts.

The source does not justify a Chatlaw clone, legal assistant subsystem, role-aligned MoE implementation, knowledge-graph importer, legal dataset mirror, LawBench runner, legal advice workflow, or source-specific provider-drift path. AMC's valid closure is to require AMC-owned provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, row hashes, source refs, and CI/lifecycle gate state.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Primary surface. Provider/model drift can change legal-agent maturity score claims, so canary rows must bind provider and model versions, metric suite, sample size, drift statistics, signed evidence, row hashes, and eval-pack replayability. |
| Shield | Relevant because legal-agent hallucination, refusal, unsafe advice, unsupported legal claims, and guardrail behavior can drift. Missing signed evidence or unwaived drift fails closed. |
| Enforce | Out of scope. No runtime legal-advice enforcement policy, action firewall, or circuit breaker changed. |
| Vault | Out of scope. No legal dataset storage, secret, privacy, or data-residency behavior changed. |
| Watch | Primary operational surface. Existing Watch projection exposes unwaived provider drift as alerts and accepts waivers only when explicitly present. |
| Fleet | Multi-agent context only. No fleet topology, orchestration, or role-routing runtime changed. |
| Passport | Out of scope. No portable trust-token schema changed. |
| Comply | Indirect only. Legal-domain drift evidence can support audits, but no compliance mapping changed. |

## Product closure

No product module changed in this Top-100 closure. Existing `src/benchmarks/providerDriftBenchmark.ts` already produces the required AMC-native provider/model drift proof:

- provider and model versions,
- baseline and candidate canary rows,
- score, refusal, latency, cost, guardrail, judge-agreement, and trajectory metrics,
- drift statistics,
- signed evidence refs,
- evaluation-framework proof,
- observability-pipeline proof,
- replayable eval-pack rows and row hashes,
- Watch alert projection, and
- CI/lifecycle gate fail-closed state.

Added focused regression coverage in `tests/gap0004ChatlawProviderDriftBoundary.test.ts` and this source-review note.

Live source facts verified:

- OpenAlex page: `https://openalex.org/W4382618722`
- OpenAlex API: `https://api.openalex.org/works/W4382618722`
- DOI: `https://doi.org/10.1016/j.fmre.2026.03.026`
- DOI value: `10.1016/j.fmre.2026.03.026`
- Crossref API: `https://api.crossref.org/works/10.1016/j.fmre.2026.03.026`
- Elsevier DOI target: `https://linkinghub.elsevier.com/retrieve/pii/S2667325826004048`
- arXiv page: `https://arxiv.org/abs/2306.16092`
- Title: `Chatlaw: A Multi-Agent Legal Assistant based on a Role-Aligned Mixture-of-Experts Architecture`
- publication year `2026`
- publication date `2026-05-01`
- OpenAlex type `preprint`
- Crossref type `journal-article`
- Journal/source: `Fundamental Research`
- Publisher: `Elsevier BV`
- Crossref license metadata includes `http://creativecommons.org/licenses/by-nc-nd/4.0/`.
- OpenAlex OA status `gold`
- Concepts include `Computer science`, `Language model`, `Data science`, `Data modeling`, and `Information retrieval`.
- Authorship metadata includes `Jiaxi Cui`, `Munan Ning`, `Zongjian Li`, `Hao Li`, and `Bohua Chen`.
- DOI redirect returned HTTP `200`, URL `https://linkinghub.elsevier.com/retrieve/pii/S2667325826004048`, content type `text/html;charset=UTF-8`, and first 200 KB SHA-256 `69b928da3602ac9c30c0849c4f6691860726ca23159b8e57c9c602888241c74c`.
- arXiv retrieval returned HTTP `200`, URL `https://arxiv.org/abs/2306.16092`, content type `text/html; charset=utf-8`, and first 200 KB SHA-256 `74a310f41dde00b7e81bacbdf079810c738c00ea0ade69eb37dea9e77ecfa926`.
- OpenAlex API first 200 KB SHA-256 `5138cf909585d56a4c5ef25c6ed7a12814d3e3a0e093cdf1e719af26d4da1cf1`.
- Crossref API first 200 KB SHA-256 `c1a8420c5a0954b857970e2417263068103312cba7203599d6359e0340de3d34`.

## Fail-closed rule

Provider/model drift proof fails closed when provider version is missing, canary result rows are missing, drift statistics are missing, signed evidence refs are absent, evaluation-framework proof is incomplete, observability-pipeline proof is incomplete, source refs are missing, eval-pack row hashes are absent, replayability is false, Watch alert or waiver state is absent for drift, or the CI/lifecycle gate fails.

metadata-only Chatlaw evidence fails closed. Paper title, DOI, OpenAlex metadata, Crossref metadata, Elsevier DOI reachability, arXiv page, journal label, publisher label, publication date, OA status, license metadata, author metadata, concept labels, multi-agent labels, legal-assistant labels, role-aligned MoE labels, knowledge-graph labels, retrieval labels, hallucination labels, benchmark-improvement labels, LawBench labels, legal-exam labels, or local backlog text cannot satisfy AMC provider/model drift proof without AMC-owned provider versions, canary rows, drift statistics, signed evidence refs, replayable eval-pack rows, row hashes, source refs, alert or waiver output, and CI/lifecycle gate state.

## No-bloat boundary

No Chatlaw clone, legal assistant subsystem, legal advice workflow, role-aligned MoE implementation, knowledge-graph importer, legal dataset mirror, LawBench runner, legal-exam benchmark runner, legal retrieval connector, paper importer, arXiv importer, OpenAlex adapter, Crossref adapter, Elsevier scraper, source-specific CLI/API, Watch monitor, Shield verifier, public methodology bump, provider parity claim, copied paper prose, copied abstract, copied examples, copied code, copied screenshots, copied figures, copied tables, copied datasets, copied prompts, copied model outputs, copied legal cases, copied configs, or copied implementation details were added.

The Chatlaw source remains source-review context only. AMC accepts only signed AMC-native provider/model drift evidence.

## Verification

- Expected-red focused test: `npx vitest run tests/gap0004ChatlawProviderDriftBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-0004-chatlaw-provider-drift.md` did not exist; 3 provider-drift/no-bloat tests passed.
- Live source checks:
  - Web search found the DOI-backed Chatlaw title, the arXiv record, and metadata references for the 2026 Fundamental Research article.
  - `curl -L -s 'https://api.openalex.org/works/W4382618722'` returned the OpenAlex metadata recorded above.
  - `curl -L -s 'https://api.crossref.org/works/10.1016/j.fmre.2026.03.026'` returned the Crossref metadata recorded above.
  - `curl -L -s 'https://doi.org/10.1016/j.fmre.2026.03.026'` resolved to the Elsevier target and returned the HTTP and hash evidence recorded above.
  - `curl -L -s 'https://arxiv.org/abs/2306.16092'` returned the HTTP and hash evidence recorded above.
- Focused test: `npx vitest run tests/gap0004ChatlawProviderDriftBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired provider-drift regression: `npx vitest run tests/gap0004ChatlawProviderDriftBoundary.test.ts tests/gap0003LangfuseProviderDriftBoundary.test.ts tests/providerDriftBenchmark.test.ts tests/inspectProviderDrift.test.ts tests/promptfooProviderDriftApi.test.ts tests/promptfooProviderDrift.test.ts tests/humanloopProviderDrift.test.ts tests/patronusProviderDrift.test.ts tests/gap0731CrabProviderDriftBoundary.test.ts --reporter=dot` passed, 9 files / 67 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 1013 files / 8067 tests.
