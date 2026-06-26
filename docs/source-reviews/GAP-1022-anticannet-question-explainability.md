# GAP-1022 - AntiCanNet question explainability

- Gap: `GAP-1022`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: `AntiCanNet: A Graph Convolution and Chemical LLM Framework forPredicting Anti-Cancer Small Molecules`
- Retrieval: OpenAlex API, DOI headers, Crossref API, publisher article/PDF headers, and local backlog metadata on 2026-06-24
- Status: Done

## Relevance decision

`GAP-1022` is relevant to AMC only through existing question-level score explainability receipts. The source is a biomedical/chemical-LLM paper about anti-cancer small molecule prediction; it is useful context for why scored claims need question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, reproducible eval packs, signed rows, row hashes, and fail-closed thresholds.

The source does not justify adding a chemical LLM, graph convolution model, QSAR model, drug-discovery predictor, small-molecule dataset, biomedical subsystem, paper importer, or medical claim to AMC. Paper metadata can be referenced in a source-review note, but it cannot prove any AMC L0-L5 question score.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through existing question-level explainability rows and eval-score packs. |
| Shield | Relevant only if safety or high-risk biomedical claims are backed by signed AMC evidence, not paper metadata. |
| Enforce | Not changed; no biomedical rule, molecule filter, or runtime policy was added. |
| Vault | Not changed; no molecule datasets, medical data, or proprietary paper content were imported. |
| Watch | Relevant only when missing question proof creates fail-closed operational evidence. |
| Fleet | Not changed; no multi-agent chemistry workflow was added. |
| Passport | Relevant only through existing portable question-explainability proof bundles; no schema changed. |
| Comply | Not changed; no medical, regulatory, clinical, or drug-discovery compliance claim was added. |

## Product closure

The existing AMC question-score explainability primitive already covers the acceptance criteria:

- `buildQuestionExplainabilityReport` binds scored questions to accepted evidence, rejected evidence, criterion diagnostics, missing gates, and repair hints.
- `buildEvalScoreExplainabilityPack` emits reproducible row-hashed eval-pack rows, accepted evidence IDs, rejected evidence reasons, fail-closed thresholds, source refs, and pack hash.
- Metadata-only source packets fail closed when they lack AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.

The regression uses an AMC-owned synthetic AntiCanNet-style source-reference row and a metadata-only negative row. No product implementation changed because AMC already exposes the required question ID, accepted evidence IDs, rejected evidence reasons, and repair hint proof path.

## Live source facts

- OpenAlex work: `https://openalex.org/W7160512984`.
- OpenAlex API: `https://api.openalex.org/works/W7160512984`.
- DOI: `10.2174/0115748936434191260212112236` at `https://doi.org/10.2174/0115748936434191260212112236`.
- Crossref API: `https://api.crossref.org/works/10.2174/0115748936434191260212112236`.
- Publisher page from DOI/Crossref: `https://www.eurekaselect.com/253362/article`.
- Crossref PDF link: `https://www.eurekaselect.com/article/download?doi=10.2174/0115748936434191260212112236`.
- DOI headers returned `HTTP/2 302` to the EurekaSelect article page, followed by `HTTP/2 403` with a Cloudflare challenge in this environment.
- Publisher article and PDF headers also returned `HTTP/2 403` Cloudflare challenge responses, so no publisher HTML/PDF content was used as proof.
- Venue: `Current Bioinformatics`.
- Publication metadata: publication_date `2026-05-05`, OpenAlex type `article`, Crossref type `journal-article`, oa_status `closed`, volume `21`, cited_by_count `1`.
- Authors from OpenAlex/Crossref include Lei Chen, Liuqi Xu, Bo Zhou, and Yuanlin Chen.
- Institutions from OpenAlex/Crossref include Shanghai Maritime University and Shanghai University of Medicine and Health Sciences.
- OpenAlex concepts include Computer science, Artificial neural network, Graph, Convolution (computer science), Machine learning, Drug discovery, Artificial intelligence, Training set, Small molecule, Data mining, Quantitative structure-activity relationship, Test data, Deep neural networks, Convolutional neural network, and Deep learning.
- Abstract-level method/result labels reviewed only as metadata include PaDEL, ChemGPT, small-molecule, graph neural network, training dataset, test datasets, AUC, 0.971, 0.9, ACSMs, and cancer-related pathway language. None of those labels were copied into product logic or benchmark fixtures.

## Fail-closed rule

OpenAlex metadata, DOI metadata, Crossref metadata, publisher URL availability, Cloudflare challenge responses, Crossref VOR link records, closed-OA status, title, authors, institutions, journal, concept labels, ChemGPT labels, PaDEL labels, AUC values, graph neural network labels, drug-discovery labels, anti-cancer labels, small-molecule labels, training/test dataset labels, local backlog text, or source identity cannot prove AMC question-level score explainability.

Passing evidence requires AMC-owned question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed evidence rows, row hashes, reproducible eval-pack rows, threshold results, source refs, and CI/lifecycle receipts.

## No-bloat boundary

No chemical LLM subsystem, graph convolution model, molecular feature generator, PaDEL integration, ChemGPT integration, QSAR model, anti-cancer predictor, small-molecule network, drug-discovery workflow, biomedical classifier, clinical claim, medical compliance path, molecule dataset importer, training/test dataset mirror, article scraper, PDF parser, Crossref adapter, DOI adapter, API route, CLI command, Studio panel, Watch monitor, Shield detector, Score method, Passport schema, package dependency, copied paper prose, copied abstract text, copied tables, copied figures, copied molecules, copied datasets, copied model outputs, copied evaluation values, copied screenshots, or source-specific question-explainability module was added.

The paper remains source-review signal only.

## Verification

- TDD expected failure before doc creation: `npx vitest run tests/gap1022AntiCanNetQuestionExplainabilityBoundary.test.ts --reporter=dot` failed only because this document did not exist; 3 question-explainability primitive tests passed.
- Live source retrieval:
  - `curl -fsSL https://api.openalex.org/works/W7160512984`
  - `curl -I -L https://doi.org/10.2174/0115748936434191260212112236`
  - `curl -fsSL https://api.crossref.org/works/10.2174/0115748936434191260212112236`
  - `curl -I -L 'https://www.eurekaselect.com/article/download?doi=10.2174/0115748936434191260212112236'`
  - `curl -I -L -A 'Mozilla/5.0' https://www.eurekaselect.com/253362/article`
  - `curl -I -L -A 'Mozilla/5.0' 'https://www.eurekaselect.com/article/download?doi=10.2174/0115748936434191260212112236'`
- `npx vitest run tests/gap1022AntiCanNetQuestionExplainabilityBoundary.test.ts --reporter=dot`: PASS, 1 file / 4 tests.
- `npx vitest run tests/gap1018AiInTheLoopQuestionExplainabilityBoundary.test.ts tests/gap1022AntiCanNetQuestionExplainabilityBoundary.test.ts --reporter=dot`: PASS, 2 files / 8 tests.
- `git diff --check -- . ':(exclude)AMC_OS'`: PASS.
- Narrow no-bloat token scan over `src/diagnostic/questionScoreExplainability.ts`, `src/guide/guideGenerator.ts`, and `src/passport/passportArtifact.ts`: PASS, no AntiCanNet identifiers.
- `npm run typecheck`: PASS.
- `npm test -- --reporter=dot`: PASS, 869 files / 7,463 tests.
