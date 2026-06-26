# GAP-1040 - KIS COLIEE provider drift

- Gap: `GAP-1040`
- Dimension: Provider and model drift benchmark
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: `KIS: COLIEE 2025 Task 4 Solver Using Japanese LLM`
- Retrieval: DOI resolver, Springer article page metadata, OpenAlex work API, Crossref works API
- Status: Done

## Relevance decision

`GAP-1040` is relevant to AMC only through the existing provider/model drift benchmark receipts. The paper metadata describes a Japanese LLM solver context for COLIEE 2025 Task 4 and legal textual entailment. That is useful source-review context for canary design, but it does not justify adding a legal-entailment solver, Japanese LLM subsystem, COLIEE task runner, Springer/OpenAlex/Crossref importer, benchmark mirror, dataset, prompt set, or source-specific scoring path.

AMC may use this source only as context for an AMC-owned provider-drift canary. A passing claim requires provider version, canary results, drift statistic, alert or waiver, replayable eval pack, row hash, signed evidence, and CI/lifecycle gate evidence. DOI, Springer, OpenAlex, Crossref, title, author, journal, abstract, or concept metadata fail closed by themselves.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only when provider versions and canary results are bound to an AMC-owned provider-drift benchmark and replayable eval pack. |
| Shield | Relevant only when signed evidence proves guardrail/safety drift checks for the AMC-owned canary. |
| Enforce | Not in scope; this does not add runtime policy enforcement or circuit breakers. |
| Vault | Not in scope; this does not add secrets, privacy, residency, or secure storage behavior. |
| Watch | Relevant only when drift statistic, alert or waiver, Watch alert output, and CI/lifecycle gate evidence are present. |
| Fleet | Not in scope; this does not add fleet orchestration or multi-agent topology. |
| Passport | Not in scope; this does not mint portable trust tokens or external proof bundles. |
| Comply | Contextual only; legal-entailment metadata is not an AMC compliance mapping or legal claim. |

## Product closure

No new source-specific product module was added. Existing provider-drift primitives already close the AMC product requirement:

- `src/benchmarks/providerDriftBenchmark.ts` builds provider/model drift comparisons, replayable eval packs, CI gates, and fail-closed alerts.
- `src/watch/providerDriftAlerts.ts` maps drift findings into Watch alerts.
- `src/api/benchmarkRouter.ts` exposes generic benchmark behavior without source-specific routes.

The regression test for this gap proves both paths:

- A valid AMC-owned Japanese legal-entailment canary is accepted only with provider version, canary results, metric coverage, trajectory count, evaluator config hash, generated data hash, observability evidence, signed evidence, source refs, row hash, drift statistic, alert or waiver, and CI gate evidence.
- A metadata-only COLIEE/Japanese LLM/Springer/OpenAlex/Crossref row fails closed when signed evidence and provider-drift proof are missing.

## Fail-closed rule

Reject any provider-drift claim that depends only on source metadata. The following are insufficient without AMC-owned drift evidence:

- DOI `10.1007/s12626-026-00209-w` or `https://doi.org/10.1007/s12626-026-00209-w`
- OpenAlex record `https://openalex.org/W7139042755`
- OpenAlex API record `https://api.openalex.org/works/W7139042755`
- Crossref API record `https://api.crossref.org/works/10.1007/s12626-026-00209-w`
- Springer article page `https://link.springer.com/article/10.1007/s12626-026-00209-w`
- Springer PDF URL `https://link.springer.com/content/pdf/10.1007/s12626-026-00209-w.pdf`
- Title, author, journal, volume, page, publication date, COLIEE, Japanese LLM, legal-entailment, solver, task, abstract, or concept metadata

## No-bloat boundary

AMC did not add a legal entailment solver, Japanese LLM subsystem, COLIEE task runner, Springer scraper, Springer adapter, DOI adapter, Crossref adapter, OpenAlex importer, PDF parser, paper mirror, benchmark mirror, legal benchmark harness, prompt strategy runner, dataset mirror, model leaderboard, API route, CLI command, Studio panel, Watch panel, source-specific provider-drift module, copied paper prose, copied abstract, copied tables, copied figures, copied prompts, copied examples, copied datasets, copied benchmark rows, copied generated outputs, or copied source content.

The only accepted product behavior remains the generic AMC provider-drift benchmark path.

## Source facts used

Live retrieval on 2026-06-25 verified:

- DOI redirect `https://doi.org/10.1007/s12626-026-00209-w` returned `HTTP/2 302` to Springer, then `HTTP/2 301` to `https://link.springer.com/article/10.1007/s12626-026-00209-w`, `HTTP/2 303` through `idp.springer.com`, another `HTTP/2 302`, and final `HTTP/2 200` article HTML metadata.
- Springer article metadata returned title `KIS: COLIEE 2025 Task 4 Solver Using Japanese LLM`, journal `The Review of Socionetwork Strategies`, publication month `2026/04`, PDF URL `https://link.springer.com/content/pdf/10.1007/s12626-026-00209-w.pdf`, DOI `10.1007/s12626-026-00209-w`, volume `20`, firstpage `341`, lastpage `359`, and dc.publisher `Springer`.
- OpenAlex `https://openalex.org/W7139042755` and `https://api.openalex.org/works/W7139042755` returned title `KIS: COLIEE 2025 Task 4 Solver Using Japanese LLM`, publication_date `2026-03-18`, publication year `2026`, OpenAlex type `article`, journal `The Review of Socionetwork Strategies`, `oa_status `hybrid``, `cited_by_count `1``, and PDF URL `https://link.springer.com/content/pdf/10.1007/s12626-026-00209-w.pdf`.
- Crossref `https://api.crossref.org/works/10.1007/s12626-026-00209-w` returned DOI `10.1007/s12626-026-00209-w`, publisher `Springer Science and Business Media LLC`, Crossref type `journal-article`, container title `The Review of Socionetwork Strategies`, page `341-359`, the Springer article page, and the Springer PDF URL.
- Authors/institution observed across source metadata: Takaaki Onaga, Yoshinobu Kano, and Shizuoka University.
- Concepts observed in OpenAlex include Task (project management), Computer science, Monotonic function, Solver, Sensitivity (control systems), Test (biology), Artificial intelligence, Outcome (game theory), Textual entailment, Natural language processing, Logical consequence, and Task analysis.

## Verification

- `npx vitest run tests/gap1040KisColieeProviderDriftBoundary.test.ts --reporter=dot` - expected red before this doc existed: 1 failed / 3 passed, missing source-review doc only.
- `npx vitest run tests/gap1040KisColieeProviderDriftBoundary.test.ts --reporter=dot` - passed, 1 file / 4 tests.
- `npx vitest run tests/gap1040KisColieeProviderDriftBoundary.test.ts tests/gap1033AllFuturesProviderDriftBoundary.test.ts --reporter=dot` - passed, 2 files / 8 tests.
- `git diff --check -- . ':(exclude)AMC_OS'` - passed.
- Narrow token scan over provider-drift implementation files - passed, no GAP-1040 identifiers in implementation modules.
- `npm run typecheck` - passed.
- `npm test -- --reporter=dot` - passed, 887 files / 7,533 tests.
