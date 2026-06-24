# GAP-1036 - Integrated BI question explainability

- Gap: `GAP-1036`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: `LLMs for Integrated Business Intelligence: A Big Data-Driven Framework Integrating Marketing Optimization, Financial Performance, and Audit Quality`
- Retrieval: OpenAlex API, DOI headers, Crossref API, MDPI article page through browser retrieval, MDPI headers through shell retrieval, and local backlog metadata on 2026-06-25
- Status: Done

## Relevance decision

`GAP-1036` is relevant to AMC only through existing question-level score explainability receipts. The source is an integrated business-intelligence paper connecting LLMs, marketing allocation, financial forecasting, multi-agent optimization, attribution, and audit assessment. That is useful context for why a user must see exactly why each L0-L5 diagnostic question moved, which evidence was accepted, which evidence was rejected, and what repair hint remains.

The source does not justify adding an integrated BI subsystem, marketing optimizer, financial forecaster, audit-quality scorer, multi-agent budget simulator, attribution model, dataset clone, paper importer, DOI adapter, Crossref adapter, MDPI scraper, API route, CLI command, or Studio panel to AMC. Paper metadata can be referenced in a source-review note, but it cannot prove any AMC maturity question without AMC-owned signed evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through existing question-level explainability rows and eval-score packs. |
| Shield | Relevant only as a fail-closed assurance boundary for high-impact business/audit claims without signed AMC evidence. |
| Enforce | Not changed; no marketing, finance, attribution, or audit policy enforcement was added. |
| Vault | Not changed; no e-commerce dataset, customer data, financial records, or audit records were imported. |
| Watch | Relevant only when missing question proof creates fail-closed operational evidence and repair hints. |
| Fleet | Not changed; no CMO/CFO/auditor/optimizer agent simulator or orchestration subsystem was added. |
| Passport | Relevant only through existing portable question-explainability proof bundles; no schema changed. |
| Comply | Not changed; no financial-audit compliance claim, assurance method, or regulatory mapping was added. |

## Product closure

The existing AMC question-score explainability primitive already covers the acceptance criteria:

- `buildQuestionExplainabilityReport` binds scored questions to accepted evidence, rejected evidence, criterion diagnostics, missing gates, and repair hints.
- `buildEvalScoreExplainabilityPack` emits reproducible row-hashed eval-pack rows, accepted evidence IDs, rejected evidence reasons, fail-closed thresholds, source refs, and pack hash.
- Metadata-only source packets fail closed when they lack AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.

The regression uses an AMC-owned synthetic integrated-BI source-reference row and a metadata-only negative row. No product implementation changed because AMC already exposes the required question ID, accepted evidence IDs, rejected evidence reasons, repair hint, reproducible eval pack, and fail-closed threshold proof path.

## Live source facts

- OpenAlex work: `https://openalex.org/W7149926154`.
- OpenAlex API: `https://api.openalex.org/works/W7149926154`.
- DOI: `10.3390/bdcc10040110` at `https://doi.org/10.3390/bdcc10040110`.
- Crossref API: `https://api.crossref.org/works/10.3390/bdcc10040110`.
- MDPI article page: `https://www.mdpi.com/2504-2289/10/4/110`.
- OpenAlex PDF URL: `https://www.mdpi.com/2504-2289/10/4/110/pdf?version=1775385171`.
- DOI headers returned `HTTP/2 302` to the MDPI article page.
- Shell retrieval of the MDPI article returned `HTTP/2 403`, so shell-side publisher HTML/PDF content was not used as product proof.
- Browser retrieval of the MDPI page identified the journal as `Big Data and Cognitive Computing`, article date as 5 April 2026, and venue citation as `Big Data Cogn. Comput. 2026, 10(4), 110`.
- OpenAlex metadata: publication_date `2026-04-05`, OpenAlex type `article`, is_oa `true`, cited_by_count `2`, and source `Big Data and Cognitive Computing`.
- Crossref metadata: Crossref type `journal-article`, publisher `MDPI AG`, publication date 2026-04-05, and container title `Big Data and Cognitive Computing`.
- Authors from OpenAlex/Crossref include Leonidas Theodorakopoulos, Aristeidis Karras, Alexandra Theodoropoulou, and Christos Klavdianos.
- OpenAlex concepts include Audit, Business, Marketing, Customer lifetime value, Big data, Marketing research, Quality (philosophy), and Marketing strategy.
- Abstract-level context reviewed only as metadata includes an e-commerce validation setting with 2.8 million customers, USD 156 million in marketing expenditure, marketing ROI movement, financial forecasting error reduction, fraud detection accuracy improvement, an Audit Quality Index result, and customer lifetime value prediction accuracy movement. None of those labels were copied into product logic or benchmark fixtures.

## Fail-closed rule

OpenAlex metadata, DOI metadata, Crossref metadata, MDPI metadata, publisher URL availability, title, authors, journal, open-access status, citation counts, concept labels, article date, abstract-level e-commerce dataset labels, 2.8 million customers, USD 156 million marketing spend, marketing ROI labels, financial forecasting error labels, fraud detection accuracy labels, Audit Quality Index labels, customer lifetime value labels, attention attribution labels, game-theoretic optimization labels, multi-agent CMO/CFO/auditor/optimizer labels, local backlog text, or source identity cannot prove AMC question-level score explainability.

Passing evidence requires AMC-owned question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed evidence rows, row hashes, reproducible eval-pack rows, threshold results, source refs, and CI/lifecycle receipts.

## No-bloat boundary

No integrated business-intelligence subsystem, marketing optimization engine, financial forecasting model, audit-quality scorer, Audit Quality Index implementation, CMO/CFO/auditor/optimizer agent simulator, Stackelberg-game solver, attention-attribution model, Markov attribution pipeline, customer lifetime value predictor, fraud-detection model, e-commerce dataset importer, financial-data connector, audit-record connector, MDPI scraper, DOI adapter, Crossref adapter, OpenAlex importer, PDF parser, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport schema, Score method, package dependency, copied paper prose, copied abstract text, copied tables, copied figures, copied equations, copied prompts, copied result values as benchmark fixtures, copied datasets, copied model outputs, copied screenshots, or source-specific question-explainability module was added.

The paper remains source-review signal only.

## Verification

- TDD expected failure before doc creation: `npx vitest run tests/gap1036IntegratedBiQuestionExplainabilityBoundary.test.ts --reporter=dot` failed only because this document did not exist; 3 question-explainability primitive tests passed.
- Live source retrieval:
  - `curl -L -sS -D /tmp/gap1036_doi_headers.txt -o /tmp/gap1036_doi.html https://doi.org/10.3390/bdcc10040110`
  - `curl -sS https://api.openalex.org/works/W7149926154`
  - `curl -sS -I https://www.mdpi.com/2504-2289/10/4/110`
  - `curl -sS https://api.crossref.org/works/10.3390/bdcc10040110`
  - Browser retrieval of `https://www.mdpi.com/2504-2289/10/4/110`
- `npx vitest run tests/gap1036IntegratedBiQuestionExplainabilityBoundary.test.ts --reporter=dot`: PASS, 1 file / 4 tests.
- `npx vitest run tests/gap1022AntiCanNetQuestionExplainabilityBoundary.test.ts tests/gap1036IntegratedBiQuestionExplainabilityBoundary.test.ts --reporter=dot`: PASS, 2 files / 8 tests.
- `git diff --check -- . ':(exclude)AMC_OS'`: PASS.
- Narrow no-bloat token scan over `src/diagnostic/questionScoreExplainability.ts`, `src/guide/guideGenerator.ts`, and `src/passport/passportArtifact.ts`: PASS, no integrated BI identifiers.
- `npm run typecheck`: PASS.
- `npm test -- --reporter=dot`: PASS, 883 files / 7,518 tests.
