# GAP-1049 - Code incoherence question explainability

- Gap: `GAP-1049`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: `Incoherence as Oracle-less Measure of Error in LLM-Based Code Generation`
- Retrieval: OpenAlex API, Crossref API, DOI redirect headers, AAAI publisher article metadata, AAAI article headers, PDF headers, and local backlog metadata on 2026-06-25
- Status: Done

## Relevance decision

`GAP-1049` is relevant to AMC only through existing question-level score explainability receipts. The source is an AAAI paper about oracle-less error measurement for LLM-based code generation, and the backlog asks for question ID, accepted evidence IDs, rejected evidence reasons, and repair hint. That maps to AMC's existing Score, Shield, and Watch question-explainability primitive: every maturity movement must show why a specific L0-L5 diagnostic question moved, which AMC evidence was accepted, which evidence was rejected, which gates are missing, what repair hint remains, and how the row-hashed eval pack fails closed.

The source does not justify adding an oracle-less code-generation benchmark runner, incoherence metric subsystem, source-specific scorer, code-generation task importer, program-ranking implementation, false-positive analyzer, AAAI importer, DOI importer, OpenAlex importer, Crossref importer, PDF parser, paper method copy, API route, CLI command, Studio panel, package dependency, benchmark dataset, or copied paper content to AMC. Paper metadata can only be source-review context attached to AMC-owned question-score evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through existing question-level explainability rows, accepted evidence IDs, rejected evidence reasons, repair hints, and eval-score packs. |
| Shield | Relevant only as a fail-closed assurance boundary for unsupported code-quality, oracle-less evaluation, or question-score claims. |
| Enforce | Not changed; no code-generation execution policy, oracle policy, or runtime enforcement path was added. |
| Vault | Not changed; no code tasks, generated programs, paper content, prompts, datasets, traces, or model outputs were imported. |
| Watch | Relevant only when missing question proof creates fail-closed operational evidence and repair hints. |
| Fleet | Not changed; no code-generation agent fleet, ranking fleet, or evaluation runner was added. |
| Passport | Relevant only through existing portable question-explainability proof bundles; no schema changed. |
| Comply | Not changed; no public methodology version or compliance mapping changed. |

## Product closure

No product code change was needed. GAP-1049 is closed by documenting the relevance boundary and adding regression coverage that proves existing AMC question-score explainability behavior handles this source without source-specific code:

- `buildQuestionExplainabilityReport` binds scored questions to accepted evidence, rejected evidence, criterion diagnostics, missing gates, and repair hints.
- `buildEvalScoreExplainabilityPack` emits reproducible row-hashed eval-pack rows, accepted evidence IDs, rejected evidence reasons, fail-closed thresholds, source refs, and pack hash.
- Metadata-only source packets fail closed when they lack AMC-owned question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed evidence rows, thresholds, and row hashes.

The regression uses an AMC-owned synthetic code-incoherence source-reference row and a metadata-only negative row. No product implementation changed because AMC already exposes the required question ID, accepted evidence IDs, rejected evidence reasons, repair hint, reproducible eval pack, and fail-closed threshold proof path.

## Live source facts

- OpenAlex work: `https://openalex.org/W7138089774`.
- OpenAlex API: `https://api.openalex.org/works/W7138089774`.
- DOI: `10.1609/aaai.v40i39.40616` at `https://doi.org/10.1609/aaai.v40i39.40616`.
- Crossref API: `https://api.crossref.org/works/10.1609/aaai.v40i39.40616`.
- AAAI article page: `https://ojs.aaai.org/index.php/AAAI/article/view/40616`.
- AAAI PDF URL: `https://ojs.aaai.org/index.php/AAAI/article/download/40616/44577`.
- DOI headers returned `HTTP/2 302` to the AAAI article page and then `HTTP/2 200`.
- AAAI article headers returned `HTTP/2 200` with `content-type: text/html; charset=utf-8`.
- AAAI PDF headers returned `HTTP/2 200`, `content-type: application/pdf`, and `content-disposition: attachment;filename=19045-AAAI26.ValentinT-NLP.pdf`.
- OpenAlex metadata: publication_date `2026-03-14`, OpenAlex type `article`, is_oa `true`, open access status `diamond`, cited_by_count `1`, source `Proceedings of the AAAI Conference on Artificial Intelligence`, host organization `Association for the Advancement of Artificial Intelligence`, volume `40`, issue `39`, and pages `33305-33313`.
- Crossref metadata: Crossref type `journal-article`, publisher `Association for the Advancement of Artificial Intelligence (AAAI)`, issued date 2026-03-14, container title `Proceedings of the AAAI Conference on Artificial Intelligence`, volume `40`, issue `39`, and pages `33305-33313`.
- AAAI article metadata identified the title, `Proceedings of the AAAI Conference on Artificial Intelligence`, volume `40`, issue `39`, first page `33305`, last page `33313`, DOI `10.1609/aaai.v40i39.40616`, and the same PDF URL.
- Authors from OpenAlex/Crossref/AAAI metadata include Thomas Jean-Michel Valentin, Ardi Madadi, Gaetano Sapia, and Marcel Böhme.
- Publisher citation metadata includes Ecole Normale Supérieure Paris-Saclay and Max Planck Institute for Security and Privacy as author institutions.
- OpenAlex topics reviewed as context: Software Engineering Research, Natural Language Processing Techniques, and Topic Modeling.
- OpenAlex keyword/concept metadata reviewed as context includes Oracle, Ranking (information retrieval), Code (set theory), Task (project management), Measure (data warehouse), False positive paradox, Programming language, Computer science, Artificial intelligence, Machine learning, Natural language, and Theoretical computer science.
- Abstract-level and method-level content was not copied into AMC product logic, docs, tests, prompts, fixtures, datasets, or benchmarks.

## Fail-closed rule

OpenAlex metadata, DOI metadata, Crossref metadata, AAAI metadata, PDF URL availability, title, authors, institutions, conference name, publisher, open-access status, citation counts, topic labels, concept labels, article date, volume, issue, page range, oracle-less labels, incoherence labels, code-generation labels, ranking labels, false-positive labels, programming-language labels, local backlog text, or source identity cannot prove AMC question-level score explainability.

Passing evidence requires AMC-owned question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed evidence rows, row hashes, reproducible eval-pack rows, threshold results, source refs, and CI/lifecycle receipts. If any of those are missing or replaced by paper metadata, the question row fails closed.

## No-bloat boundary

No oracle-less code-generation benchmark runner, incoherence metric subsystem, source-specific scorer, code-generation task importer, program-ranking implementation, false-positive analyzer, AAAI scraper, DOI adapter, Crossref adapter, OpenAlex importer, PDF parser, paper importer, citation importer, source-specific question-explainability module, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport schema, Score method, methodology version bump, diagnostic question-bank migration, package dependency, copied paper prose, copied abstract text, copied formulas, copied code-generation tasks, copied generated programs, copied prompts, copied examples, copied solver outputs, copied model outputs, copied result values, copied benchmark rows, copied datasets, copied tables, copied figures, or copied source configs were added.

The paper remains source-review signal only.

## Verification

- TDD expected failure before doc creation: `npx vitest run tests/gap1049CodeIncoherenceQuestionExplainabilityBoundary.test.ts --reporter=dot` failed only because this document did not exist; 3 question-explainability primitive tests passed.
- Live source retrieval:
  - `fetch('https://api.openalex.org/works/W7138089774')`
  - `fetch('https://api.crossref.org/works/10.1609/aaai.v40i39.40616')`
  - `curl -sSIL https://doi.org/10.1609/aaai.v40i39.40616`
  - `curl -sSIL https://ojs.aaai.org/index.php/AAAI/article/view/40616`
  - `curl --compressed -sSL https://ojs.aaai.org/index.php/AAAI/article/view/40616`
  - `curl -sSIL https://ojs.aaai.org/index.php/AAAI/article/download/40616/44577`
- `npx vitest run tests/gap1049CodeIncoherenceQuestionExplainabilityBoundary.test.ts --reporter=dot`: PASS, 1 file / 4 tests.
- `npx vitest run tests/gap1045SlideBotQuestionExplainabilityBoundary.test.ts tests/gap1049CodeIncoherenceQuestionExplainabilityBoundary.test.ts --reporter=dot`: PASS, 2 files / 8 tests.
- `git diff --check -- . ':(exclude)AMC_OS'`: PASS.
- Narrow no-bloat token scan over `src/diagnostic/questionScoreExplainability.ts`, `src/guide/guideGenerator.ts`, and `src/passport/passportArtifact.ts`: PASS, no GAP-1049 code-incoherence identifiers.
- `npm run typecheck`: PASS.
- `npm test -- --reporter=dot`: PASS, 896 files / 7,568 tests.
