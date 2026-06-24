# GAP-1046 - LiRA metric validity

- Gap: `GAP-1046`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: `LiRA: A Multi-Agent Framework for Reliable and Readable Literature Review Generation`
- Retrieval: OpenAlex API, DOI headers, Crossref API, AAAI article metadata, AAAI article/PDF headers, and local backlog metadata on 2026-06-25
- Status: Done

## Relevance decision

`GAP-1046` is relevant to AMC only through existing metric-validity receipts. The source is an AAAI paper about a multi-agent framework for reliable and readable literature review generation. It is useful context for why Score, Shield, and Watch metric claims must carry a validation table, confidence interval, sample size, metric owner, construct validity, inter-rater agreement, test-retest stability, signed evidence rows, source refs, row hashes, and fail-closed CI/lifecycle gates.

The source does not justify adding a LiRA subsystem, literature-review generator, citation workflow, paper ranking workflow, systematic-review pipeline, multi-agent review runtime, paper importer, DOI adapter, Crossref adapter, OpenAlex adapter, AAAI scraper, API route, CLI command, Studio panel, or source-specific metric-validity module to AMC. Paper metadata can be referenced in a source-review note, but it cannot prove AMC metric validity without AMC-owned signed validation evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through existing metric-validation rows, validation facets, process evidence, outcome alignment, eval-pack rows, and CI gate. |
| Shield | Relevant only as a fail-closed assurance boundary for unsupported literature-review or reliability claims. |
| Enforce | Not changed; no literature-review policy, citation policy, or review-generation guardrail was added. |
| Vault | Not changed; no paper corpus, PDF, citation graph, generated review, prompt, or model output was imported. |
| Watch | Relevant only when metric-validity regressions fail closed in CI/lifecycle evidence and operator review. |
| Fleet | Not changed; no LiRA multi-agent runtime, review fleet, citation agent, or orchestration subsystem was added. |
| Passport | Not changed; existing metric-validity proof can already travel in existing proof bundles. |
| Comply | Not changed; no research-integrity, copyright, publication, or education compliance claim was added. |

## Product closure

The existing AMC metric-validity primitive already covers the acceptance criteria:

- `buildMetricValidationReport` computes metric rows with sample size, confidence interval, inter-rater agreement, test-retest stability, validation facet coverage, process evidence coverage, outcome alignment, warnings, and fail-closed status.
- The report emits replayable eval-pack rows with source refs, row hashes, signed evidence refs, and CI gate status.
- Metadata-only packets fail closed when they lack AMC-owned signed metric rows, validation facets, process evidence, outcome alignment, sample size, metric owner, confidence interval, reliability checks, row hashes, and CI/lifecycle receipts.

The regression uses an AMC-owned synthetic LiRA source-reference row and a metadata-only negative row. No product implementation changed because AMC already exposes the required validation table, confidence interval, sample size, metric owner, construct validity, inter-rater agreement, test-retest stability, source refs, row hashes, and fail-closed CI gate.

## Live source facts

- OpenAlex work: `https://openalex.org/W7139095367`.
- OpenAlex API: `https://api.openalex.org/works/W7139095367`.
- DOI: `10.1609/aaai.v40i47.41489` at `https://doi.org/10.1609/aaai.v40i47.41489`.
- Crossref API: `https://api.crossref.org/works/10.1609/aaai.v40i47.41489`.
- AAAI article page: `https://ojs.aaai.org/index.php/AAAI/article/view/41489`.
- AAAI PDF URL: `https://ojs.aaai.org/index.php/AAAI/article/download/41489/45450`.
- DOI headers returned `HTTP/2 302` to the AAAI article page and then `HTTP/2 200`.
- AAAI article headers returned `HTTP/2 200` with `content-type: text/html; charset=utf-8`.
- AAAI PDF headers returned `HTTP/2 200`, `content-type: application/pdf`, and `content-disposition: attachment;filename=00311-IAAI26.TjoanGoG-EA.pdf`.
- OpenAlex metadata: publication_date `2026-03-14`, OpenAlex type `article`, is_oa `true`, open access status `diamond`, cited_by_count `1`, source `Proceedings of the AAAI Conference on Artificial Intelligence`, host organization `Association for the Advancement of Artificial Intelligence`, volume `40`, issue `47`, and pages `40456-40464`.
- Crossref metadata: Crossref type `journal-article`, publisher `Association for the Advancement of Artificial Intelligence (AAAI)`, published online date 2026-03-14, container title `Proceedings of the AAAI Conference on Artificial Intelligence`, volume `40`, issue `47`, and pages `40456-40464`.
- AAAI article metadata identified the title, `Proceedings of the AAAI Conference on Artificial Intelligence`, volume `40`, issue `47`, first page `40456`, last page `40464`, DOI `10.1609/aaai.v40i47.41489`, and the same PDF URL.
- Authors from OpenAlex/Crossref/AAAI metadata include Gregory Hok Tjoan Go, Khang Ly, Anders Sogaard, Seyed Amin Tabatabaei, Maarten de Rijke, and Xinyi Chen.
- OpenAlex institution metadata includes RELX Group, University of Copenhagen, and University of Amsterdam.
- OpenAlex topics include Topic Modeling, Biomedical Text Mining and Ontologies, and Expert finding and Q&A systems.
- OpenAlex keyword/concept metadata includes Readability, Workflow, Usability, Robustness, Scientific literature, Information retrieval, Citation, and Systematic review.
- Abstract-level and method-level content was not copied into AMC product logic, docs, tests, prompts, fixtures, datasets, or benchmarks.

## Fail-closed rule

OpenAlex metadata, DOI metadata, Crossref metadata, AAAI metadata, PDF URL availability, title, authors, institutions, conference name, publisher, open-access status, citation counts, topic labels, concept labels, article date, volume, issue, page range, LiRA labels, multi-agent labels, literature-review labels, readability labels, reliability labels, workflow labels, usability labels, robustness labels, citation labels, systematic-review labels, local backlog text, or source identity cannot prove AMC metric validity.

Passing evidence requires AMC-owned validation table, confidence interval, sample size, metric owner, construct-validity mapping, inter-rater agreement, test-retest stability, process evidence, outcome alignment, signed evidence refs, row hashes, source refs, and CI/lifecycle receipts.

## No-bloat boundary

No LiRA subsystem, literature-review generator, citation workflow, paper ranking workflow, systematic-review pipeline, multi-agent review runtime, review-quality scorer, readability scorer, citation checker, paper corpus importer, DOI adapter, Crossref adapter, OpenAlex importer, AAAI scraper, PDF parser, paper importer, citation importer, benchmark runner, source-specific metric-validity module, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, Score method, methodology version bump, diagnostic question-bank migration, package dependency, copied paper prose, copied abstract text, copied tables, copied figures, copied prompts, copied examples, copied screenshots, copied generated reviews, copied model outputs, copied result values, copied benchmark rows, or copied source configs were added.

The paper remains source-review signal only.

## Verification

- TDD expected failure before doc creation: `npx vitest run tests/gap1046LiraMetricValidityBoundary.test.ts --reporter=dot` failed only because this document did not exist; 3 metric-validity primitive tests passed.
- Live source retrieval:
  - `node` fetch of `https://api.openalex.org/works/W7139095367`
  - `node` fetch of `https://api.crossref.org/works/10.1609/aaai.v40i47.41489`
  - `curl -I -L https://doi.org/10.1609/aaai.v40i47.41489`
  - `curl -I -L https://ojs.aaai.org/index.php/AAAI/article/view/41489`
  - `curl -I -L https://ojs.aaai.org/index.php/AAAI/article/download/41489/45450`
  - AAAI article metadata extraction from `https://ojs.aaai.org/index.php/AAAI/article/view/41489`
- `npx vitest run tests/gap1046LiraMetricValidityBoundary.test.ts --reporter=dot`: PASS, 1 file / 4 tests.
- `npx vitest run tests/gap1043WildClawBenchMetricValidityBoundary.test.ts tests/gap1046LiraMetricValidityBoundary.test.ts --reporter=dot`: PASS, 2 files / 8 tests.
- `git diff --check -- . ':(exclude)AMC_OS'`: PASS.
- Narrow no-bloat token scan over `src/score/metricValidity.ts`, `src/diagnostic/questionScoreExplainability.ts`, and `src/diagnostic/runner.ts`: PASS, no LiRA identifiers.
- `npm run typecheck`: PASS.
- `npm test -- --reporter=dot`: PASS, 893 files / 7,556 tests.
