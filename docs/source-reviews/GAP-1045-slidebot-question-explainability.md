# GAP-1045 - SlideBot question explainability

- Gap: `GAP-1045`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: `SlideBot: A Multi-Agent Framework for Generating Informative, Reliable, Multi-Modal Presentations`
- Retrieval: OpenAlex API, DOI headers, Crossref API, AAAI article metadata, AAAI article/PDF headers, and local backlog metadata on 2026-06-25
- Status: Done

## Relevance decision

`GAP-1045` is relevant to AMC only through existing question-level score explainability receipts. The source is an AAAI paper about a multi-agent framework for generating multi-modal presentations. It is useful context for why Score, Shield, and Watch evidence must explain why a specific L0-L5 diagnostic question moved, which AMC evidence was accepted, which evidence was rejected, and what repair hint remains.

The source does not justify adding a SlideBot subsystem, presentation generator, multimodal slide pipeline, planner, retriever, code-generation path, paper importer, DOI adapter, Crossref adapter, OpenAlex adapter, AAAI scraper, API route, CLI command, Studio panel, or source-specific runtime to AMC. Paper metadata can be referenced in a source-review note, but it cannot prove any AMC maturity question without AMC-owned signed evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through existing question-level explainability rows and eval-score packs. |
| Shield | Relevant only as a fail-closed assurance boundary for claims that lack signed AMC question evidence. |
| Enforce | Not changed; no presentation-generation policy or multimodal pipeline policy was added. |
| Vault | Not changed; no paper PDF, slide artifact, dataset, prompt, model output, or generated deck was imported. |
| Watch | Relevant only when missing question proof creates fail-closed operational evidence and repair hints. |
| Fleet | Not changed; no SlideBot multi-agent runtime, agent topology, or orchestration subsystem was added. |
| Passport | Relevant only through existing portable question-explainability proof bundles; no schema changed. |
| Comply | Not changed; no education, accessibility, copyright, or AI-policy compliance claim was added. |

## Product closure

The existing AMC question-score explainability primitive already covers the acceptance criteria:

- `buildQuestionExplainabilityReport` binds scored questions to accepted evidence, rejected evidence, criterion diagnostics, missing gates, and repair hints.
- `buildEvalScoreExplainabilityPack` emits reproducible row-hashed eval-pack rows, accepted evidence IDs, rejected evidence reasons, fail-closed thresholds, source refs, and pack hash.
- Metadata-only source packets fail closed when they lack AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.

The regression uses an AMC-owned synthetic SlideBot source-reference row and a metadata-only negative row. No product implementation changed because AMC already exposes the required question ID, accepted evidence IDs, rejected evidence reasons, repair hint, reproducible eval pack, and fail-closed threshold proof path.

## Live source facts

- OpenAlex work: `https://openalex.org/W7138903429`.
- OpenAlex API: `https://api.openalex.org/works/W7138903429`.
- DOI: `10.1609/aaai.v40i48.42124` at `https://doi.org/10.1609/aaai.v40i48.42124`.
- Crossref API: `https://api.crossref.org/works/10.1609/aaai.v40i48.42124`.
- AAAI article page: `https://ojs.aaai.org/index.php/AAAI/article/view/42124`.
- AAAI PDF URL: `https://ojs.aaai.org/index.php/AAAI/article/download/42124/46085`.
- DOI headers returned `HTTP/2 302` to the AAAI article page and then `HTTP/2 200`.
- AAAI article headers returned `HTTP/2 200` with `content-type: text/html; charset=utf-8`.
- AAAI PDF headers returned `HTTP/2 200`, `content-type: application/pdf`, and `content-disposition: attachment;filename=00108-EAAI26.XieE-EDU.pdf`.
- OpenAlex metadata: publication_date `2026-03-14`, OpenAlex type `article`, is_oa `true`, open access status `diamond`, cited_by_count `1`, source `Proceedings of the AAAI Conference on Artificial Intelligence`, host organization `Association for the Advancement of Artificial Intelligence`, volume `40`, issue `48`, and pages `40907-40915`.
- Crossref metadata: Crossref type `journal-article`, publisher `Association for the Advancement of Artificial Intelligence (AAAI)`, published online date 2026-03-14, container title `Proceedings of the AAAI Conference on Artificial Intelligence`, volume `40`, issue `48`, and pages `40907-40915`.
- AAAI article metadata identified the title, `Proceedings of the AAAI Conference on Artificial Intelligence`, volume `40`, issue `48`, first page `40907`, last page `40915`, DOI `10.1609/aaai.v40i48.42124`, and the same PDF URL.
- Authors from OpenAlex/Crossref/AAAI metadata include Eric Xie, Danielle Waterfield, Danielle A. Waterfield, Michael Kennedy, and Aidong Zhang.
- OpenAlex institution metadata includes University of Virginia.
- OpenAlex topics include Visual and Cognitive Learning Processes, Multimodal Machine Learning Applications, and Intelligent Tutoring Systems and Adaptive Learning.
- OpenAlex keyword/concept metadata includes Cognitive load, Personalization, Adaptability, Multimedia, Human-computer interaction, Instructional design, Structured prediction, Cognition, Educational technology, Artificial intelligence, Personalized learning, and Quality Education.
- Abstract-level and method-level content was not copied into AMC product logic, docs, tests, prompts, fixtures, datasets, or benchmarks.

## Fail-closed rule

OpenAlex metadata, DOI metadata, Crossref metadata, AAAI metadata, PDF URL availability, title, authors, institutions, conference name, publisher, open-access status, citation counts, topic labels, concept labels, article date, volume, issue, page range, SlideBot labels, multi-agent labels, multi-modal presentation labels, education labels, cognitive-load labels, personalization labels, adaptation labels, human-computer-interaction labels, local backlog text, or source identity cannot prove AMC question-level score explainability.

Passing evidence requires AMC-owned question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed evidence rows, row hashes, reproducible eval-pack rows, threshold results, source refs, and CI/lifecycle receipts.

## No-bloat boundary

No SlideBot subsystem, presentation generator, multimodal slide pipeline, planner, retriever, code-generation path, layout generator, deck renderer, AAAI scraper, DOI adapter, Crossref adapter, OpenAlex importer, PDF parser, paper importer, citation importer, education benchmark runner, cognitive-load scorer, source-specific question-explainability module, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport schema, Score method, package dependency, copied paper prose, copied abstract text, copied tables, copied figures, copied prompts, copied examples, copied screenshots, copied generated slides, copied model outputs, copied result values, copied benchmark rows, or copied source configs were added.

The paper remains source-review signal only.

## Verification

- TDD expected failure before doc creation: `npx vitest run tests/gap1045SlideBotQuestionExplainabilityBoundary.test.ts --reporter=dot` failed only because this document did not exist; 3 question-explainability primitive tests passed.
- Live source retrieval:
  - `curl -I -L https://doi.org/10.1609/aaai.v40i48.42124`
  - `node -e "fetch('https://api.crossref.org/works/10.1609/aaai.v40i48.42124')..."`
  - `curl -I -L https://ojs.aaai.org/index.php/AAAI/article/view/42124`
  - `curl -I -L https://ojs.aaai.org/index.php/AAAI/article/download/42124/46085`
  - AAAI article metadata extraction from `https://ojs.aaai.org/index.php/AAAI/article/view/42124`
- `npx vitest run tests/gap1045SlideBotQuestionExplainabilityBoundary.test.ts --reporter=dot`: PASS, 1 file / 4 tests.
- `npx vitest run tests/gap1037PrivacyNerQuestionExplainabilityBoundary.test.ts tests/gap1045SlideBotQuestionExplainabilityBoundary.test.ts --reporter=dot`: PASS, 2 files / 8 tests.
- `git diff --check -- . ':(exclude)AMC_OS'`: PASS.
- Narrow no-bloat token scan over `src/diagnostic/questionScoreExplainability.ts`, `src/guide/guideGenerator.ts`, and `src/passport/passportArtifact.ts`: PASS, no SlideBot identifiers.
- `npm run typecheck`: PASS.
- `npm test -- --reporter=dot`: PASS, 892 files / 7,552 tests.
