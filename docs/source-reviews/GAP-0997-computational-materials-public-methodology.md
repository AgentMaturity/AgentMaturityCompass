# GAP-0997 — computational materials public methodology

- Gap: `GAP-0997`
- Dimension: Public methodology versioning (`std-public-methodology`)
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: `Modular large language model agents for multi-task computational materials science`
- Retrieval: live OpenAlex API, DOI redirect, Nature publisher endpoint, and Crossref API on `2026-06-24`
- Status: Done - skipped

## Relevance decision

The paper is relevant to AMC only as agent-evaluation and computational-materials context. It is not an AMC scoring-methodology change, badge-comparability change, diagnostic question-bank migration, API behavior change, CLI behavior change, Studio behavior change, or public methodology semantic change.

Computational-materials paper metadata alone cannot justify a public methodology version bump. The accepted AMC public-methodology primitive remains methodology version, changelog, deprecation notice, migration guidance, evidence taxonomy, signed evidence refs, row hashes, badge assurance, and report-binding proof. This slice is skipped as public-methodology implementation evidence.

Live metadata facts reviewed:

- OpenAlex work/API: `https://openalex.org/W7140770361` and `https://api.openalex.org/works/W7140770361`
- DOI: `https://doi.org/10.1038/s43246-025-00994-x`
- Publisher page: `https://www.nature.com/articles/s43246-025-00994-x`
- Crossref API: `https://api.crossref.org/works/10.1038/s43246-025-00994-x`
- Title: `Modular large language model agents for multi-task computational materials science`
- Journal/source: `Communications Materials`
- Publisher: `Springer Science and Business Media LLC`
- Publication metadata: publication_date `2026-03-26`, published `2026`
- Crossref counts: reference-count `63`
- OpenAlex counts: referenced_works_count `41`, cited_by_count `2`
- open access status `gold`
- Crossref license URL maps to `CC BY-NC-ND 4.0`
- Authors reviewed: Akshat Chaudhari, Janghoon Ock, Amir Barati Farimani
- OpenAlex concepts reviewed: Computer science, Modular design, Programming language, Computational model, Artificial intelligence, Modeling language, Field (mathematics), Software engineering
- DOI/Nature retrieval showed redirect and publisher access through `HTTP/2 302`, `HTTP/2 303`, and final `HTTP/2 200` responses.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only. No score formula, L0-L5 threshold, metric-validity rule, or public scoring semantic changed. |
| Shield | Context only. No assurance, red-team, safety, or threat-detection behavior changed. |
| Enforce | Not relevant; no runtime guardrail or circuit breaker changed. |
| Vault | Not relevant; no secrets, DLP, privacy, or storage behavior changed. |
| Watch | Context only. No live drift, monitoring, alert, or evidence-drilldown behavior changed. |
| Fleet | Not relevant; no multi-agent orchestration or trust topology changed. |
| Passport | Not relevant; no portable trust-token or external proof-bundle behavior changed. |
| Comply | Not relevant; no compliance mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed for this gap.

No public methodology version bump was made because the verified source does not alter AMC public scoring semantics, evidence taxonomy, methodology versioning, badge comparability, deprecation notice, migration guidance, or report-binding proof.

## Fail-closed rule

Computational-materials paper metadata, title, DOI, OpenAlex metadata, Crossref metadata, Nature endpoint availability, author names, publication date, journal name, license URL, cited-by count, reference counts, open-access status, concept labels, or local backlog metadata alone must fail closed for public methodology claims.

Passing public methodology evidence requires AMC-owned methodology versioning receipts, changelog rows, deprecation notices, migration guidance, evidence taxonomy changes, signed evidence refs, row hashes, badge/report binding proof, and an explicit AMC semantic change.

## No-bloat boundary

This gap did not add and must not add a computational-materials subsystem, materials-science scoring lane, domain benchmark runner, paper importer, DOI resolver, OpenAlex importer, Crossref importer, Nature/PDF parser, computational-tool adapter, API route, CLI command, Studio panel, Watch monitor, Shield verifier, package dependency, public methodology version bump, copied paper prose, copied figures, copied tables, copied equations, copied prompts, copied examples, copied datasets, copied outputs, or copied implementation details.

## Verification

- Expected-red focused test before doc: `npx vitest run tests/gap0997ComputationalMaterialsPublicMethodologyBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-0997-computational-materials-public-methodology.md` did not exist; the implementation guard passed.
- Focused test after doc: `npx vitest run tests/gap0997ComputationalMaterialsPublicMethodologyBoundary.test.ts --reporter=dot` passed, 1 file / 3 tests.
- Paired adjacent source-review tests: `npx vitest run tests/gap0996SweBenchMetricValidityBoundary.test.ts tests/gap0997ComputationalMaterialsPublicMethodologyBoundary.test.ts --reporter=dot` passed, 2 files / 7 tests.
- Source-specific implementation token scan: `rg -n "W7140770361|10\\.1038/s43246-025-00994-x|Modular large language model agents for multi-task computational materials science|computational_materials_public_methodology" src/methodology/publicMethodology.ts src/diagnostic/methodologyVersioning.ts docs/SCORING_METHODOLOGY.md src/badge/badgeCli.ts` returned no product-module matches.
- Diff whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 844 files / 7,369 tests.
- Post-doc focused rerun: `npx vitest run tests/gap0997ComputationalMaterialsPublicMethodologyBoundary.test.ts --reporter=dot` passed, 1 file / 3 tests.
