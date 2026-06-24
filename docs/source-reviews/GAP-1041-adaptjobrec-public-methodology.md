# GAP-1041 - AdaptJobRec public methodology

- Gap: `GAP-1041`
- Dimension: Public methodology versioning
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: `AdaptJobRec: Enhancing Conversational Career Recommendation Through an LLM-Powered Agentic System`
- Retrieval: DOI resolver, AAAI OJS article metadata, AAAI PDF endpoint, OpenAlex work API, Crossref works API
- Status: Done - skipped

## Relevance decision

`GAP-1041` is relevant to AMC as source-review context only. The source describes an LLM-powered agentic career-recommendation system and is useful background for agent-evaluation research. It does not change AMC's public scoring methodology, methodology version, evidence taxonomy, maturity levels, badge semantics, diagnostic question bank, public limitations, deprecation notices, migration guidance, API, CLI, or Studio behavior.

No public methodology version bump is warranted. AdaptJobRec paper evidence alone cannot justify an AMC public methodology version bump because it is source metadata about a career-recommendation agentic system, not an AMC methodology change with versioned score semantics, public changelog, migration guidance, or badge impact.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Contextual only; it does not change scoring semantics, score thresholds, or methodology versioning. |
| Shield | Contextual only; it does not add safety methodology, red-team semantics, or Shield scoring rules. |
| Enforce | Not in scope; no runtime policy enforcement or circuit breaker changed. |
| Vault | Not in scope; no privacy, secrets, storage, or data residency behavior changed. |
| Watch | Contextual only; no observability, alerting, or drift methodology changed. |
| Fleet | Not in scope; no multi-agent orchestration or fleet methodology changed. |
| Passport | Not in scope; no trust-token or proof-bundle semantics changed. |
| Comply | Not in scope; no compliance mapping or regulatory methodology changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed.

This gap is closed as a documented no-op boundary. The test verifies that AdaptJobRec source metadata does not enter the public methodology manifest and that implementation modules do not contain source-specific identifiers.

## Fail-closed rule

Reject any public-methodology claim that depends only on source metadata. The following are insufficient to alter AMC public methodology:

- DOI `10.1609/aaai.v40i47.41491` or `https://doi.org/10.1609/aaai.v40i47.41491`
- OpenAlex record `https://openalex.org/W7139039941`
- OpenAlex API record `https://api.openalex.org/works/W7139039941`
- Crossref API record `https://api.crossref.org/works/10.1609/aaai.v40i47.41491`
- AAAI article page `https://ojs.aaai.org/index.php/AAAI/article/view/41491`
- AAAI PDF URL `https://ojs.aaai.org/index.php/AAAI/article/download/41491/45452`
- Title, author, institution, proceedings, volume, page, recommender-system, personalization, conversational career recommendation, LLM-powered agentic system, decomposition, latency, or source concept metadata

Any public methodology change still requires a methodology version, changelog, deprecation notice, migration guidance, evidence taxonomy impact, score-semantics impact, and badge impact analysis. This source provides none of those AMC-owned change requirements, so it is skipped as public-methodology implementation evidence.

## No-bloat boundary

AMC did not add a career recommendation subsystem, AdaptJobRec adapter, recommender-system benchmark, AAAI scraper, DOI adapter, Crossref adapter, OpenAlex importer, PDF parser, paper mirror, benchmark mirror, dataset mirror, personalization engine, conversation system, API route, CLI command, Studio panel, Watch panel, badge semantics change, question-bank change, public methodology version bump, copied paper prose, copied abstract, copied tables, copied figures, copied prompts, copied datasets, copied benchmark rows, copied examples, copied generated outputs, or copied source content.

## Source facts used

Live retrieval on 2026-06-25 verified:

- DOI redirect `https://doi.org/10.1609/aaai.v40i47.41491` returned `HTTP/2 302` to `https://ojs.aaai.org/index.php/AAAI/article/view/41491`; the AAAI article returned HTTP/2 200.
- The AAAI article metadata returned title `AdaptJobRec: Enhancing Conversational Career Recommendation Through an LLM-Powered Agentic System`, proceedings `Proceedings of the AAAI Conference on Artificial Intelligence`, PDF URL `https://ojs.aaai.org/index.php/AAAI/article/download/41491/45452`, DOI `10.1609/aaai.v40i47.41491`, volume `40`, firstpage `40473`, and lastpage `40479`.
- The PDF endpoint returned HTTP/2 200 with `content-type: application/pdf`.
- OpenAlex `https://openalex.org/W7139039941` and `https://api.openalex.org/works/W7139039941` returned title `AdaptJobRec: Enhancing Conversational Career Recommendation Through an LLM-Powered Agentic System`, publication_date `2026-03-14`, publication year `2026`, OpenAlex type `article`, journal `Proceedings of the AAAI Conference on Artificial Intelligence`, `oa_status `diamond``, `cited_by_count `1``, and PDF URL `https://ojs.aaai.org/index.php/AAAI/article/download/41491/45452`.
- Crossref `https://api.crossref.org/works/10.1609/aaai.v40i47.41491` returned DOI `10.1609/aaai.v40i47.41491`, publisher `Association for the Advancement of Artificial Intelligence (AAAI)`, Crossref type `journal-article`, container title `Proceedings of the AAAI Conference on Artificial Intelligence`, page `40473-40479`, and the same AAAI PDF URL.
- Authors/institutions observed across source metadata include Qixin Wang, Dawei Wang, Kun Chen, Yaowei Hu, Puneet Girdhar, Ruoteng Wang, Aadesh Gupta, Chaitanya Devella, Wenlai Guo, Shujuan Huang / Shangwen Huang, Bachir Aoun, Greg Hayworth, Han Li, Xintao Wu, Walmart (United States), and University of Arkansas at Fayetteville.
- Concepts observed in OpenAlex include Recommender system, Computer science, Suite, Task (project management), Identification (biology), Filter (signal processing), Human-computer interaction, Personalization, Latency (audio), Decomposition, Key (lock), and World Wide Web.

## Verification

- `npx vitest run tests/gap1041AdaptJobRecPublicMethodologyBoundary.test.ts --reporter=dot` - expected red before this doc existed: 2 failed / 1 passed, missing source-review doc only; implementation leakage check passed.
- `npx vitest run tests/gap1041AdaptJobRecPublicMethodologyBoundary.test.ts --reporter=dot` - passed, 1 file / 3 tests.
- `npx vitest run tests/gap1041AdaptJobRecPublicMethodologyBoundary.test.ts tests/gap1038ParseBenchPublicMethodologyBoundary.test.ts --reporter=dot` - passed, 2 files / 6 tests.
- `git diff --check -- . ':(exclude)AMC_OS'` - passed.
- Narrow token scan over public-methodology implementation files - passed, no GAP-1041 identifiers in implementation modules.
- `npm run typecheck` - passed.
- `npm test -- --reporter=dot` - passed, 888 files / 7,536 tests.
