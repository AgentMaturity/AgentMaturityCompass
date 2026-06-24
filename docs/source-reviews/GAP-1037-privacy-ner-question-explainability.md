# GAP-1037 - Privacy NER question explainability

- Gap: `GAP-1037`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: `On the Applicability of LLMs and SLMs for Privacy-Preserving Named Entity Recognition in Financial Applications`
- Retrieval: OpenAlex API, DOI headers, Crossref API, MDPI article page through browser retrieval, MDPI headers through shell retrieval, and local backlog metadata on 2026-06-25
- Status: Done

## Relevance decision

`GAP-1037` is relevant to AMC only through existing question-level score explainability receipts. The source is a paper about applying LLMs and SLMs to privacy-preserving named entity recognition in financial applications. It is useful context for why Score, Shield, and Watch evidence must show why a specific L0-L5 diagnostic question moved, which evidence was accepted, which evidence was rejected, and what repair hint remains.

The source does not justify adding a privacy-preserving NER subsystem, PII detector, financial-document extractor, AI4Privacy dataset clone, transformer fine-tuning runner, benchmark runner, paper importer, DOI adapter, Crossref adapter, MDPI scraper, API route, CLI command, Studio panel, or source-specific runtime to AMC. Paper metadata can be referenced in a source-review note, but it cannot prove any AMC maturity question without AMC-owned signed evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through existing question-level explainability rows and eval-score packs. |
| Shield | Relevant only as a fail-closed assurance boundary for privacy/PII claims without signed AMC evidence. |
| Enforce | Not changed; no PII masking, NER policy, or financial extraction policy was added. |
| Vault | Not changed; no PII dataset, financial document, synthetic record, or model artifact was imported. |
| Watch | Relevant only when missing question proof creates fail-closed operational evidence and repair hints. |
| Fleet | Not changed; no model benchmark fleet, PII detector fleet, or financial NER pipeline was added. |
| Passport | Relevant only through existing portable question-explainability proof bundles; no schema changed. |
| Comply | Not changed; no privacy compliance claim, financial compliance claim, or data-protection mapping was added. |

## Product closure

The existing AMC question-score explainability primitive already covers the acceptance criteria:

- `buildQuestionExplainabilityReport` binds scored questions to accepted evidence, rejected evidence, criterion diagnostics, missing gates, and repair hints.
- `buildEvalScoreExplainabilityPack` emits reproducible row-hashed eval-pack rows, accepted evidence IDs, rejected evidence reasons, fail-closed thresholds, source refs, and pack hash.
- Metadata-only source packets fail closed when they lack AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.

The regression uses an AMC-owned synthetic privacy-NER source-reference row and a metadata-only negative row. No product implementation changed because AMC already exposes the required question ID, accepted evidence IDs, rejected evidence reasons, repair hint, reproducible eval pack, and fail-closed threshold proof path.

## Live source facts

- OpenAlex work: `https://openalex.org/W7143515573`.
- OpenAlex API: `https://api.openalex.org/works/W7143515573`.
- DOI: `10.3390/app16073332` at `https://doi.org/10.3390/app16073332`.
- Crossref API: `https://api.crossref.org/works/10.3390/app16073332`.
- MDPI article page: `https://www.mdpi.com/2076-3417/16/7/3332`.
- OpenAlex PDF URL: `https://www.mdpi.com/2076-3417/16/7/3332/pdf?version=1774868239`.
- DOI headers returned `HTTP/2 302` to the MDPI article page.
- Shell retrieval of the MDPI article returned `HTTP/2 403`, so shell-side publisher HTML/PDF content was not used as product proof.
- Browser retrieval of the MDPI page identified the journal as `Applied Sciences`, article date as 30 March 2026, and venue citation as `Appl. Sci. 2026, 16(7), 3332`.
- OpenAlex metadata: publication_date `2026-03-30`, OpenAlex type `article`, is_oa `true`, cited_by_count `1`, and source `Applied Sciences`.
- Crossref metadata: Crossref type `journal-article`, publisher `MDPI AG`, publication date 2026-03-30, container title `Applied Sciences`, volume `16`, issue `7`, and page `3332`.
- Authors from OpenAlex/Crossref include Evgenia Psarra and Kyriakos Stefanidis.
- Institutions from OpenAlex include Athena Research and Innovation Center In Information Communication & Knowledge Technologies, Industrial Systems Institute, and University of Piraeus.
- OpenAlex concepts include Benchmarking, Computer science, Named-entity recognition, Transformer, Architecture, Data science, Relation (database), Artificial intelligence, Natural language processing, and Language model.
- Abstract/method-level context reviewed only as metadata includes the AI4Privacy PII 43 K dataset, 54 PII categories, 229 diverse use cases, financial application framing, accuracy, precision, recall, and F1-score measurements, plus model-family labels such as DistilBERT, BERT, RoBERTa, ModernBERT, and DeBERTa. None of those labels were copied into product logic or benchmark fixtures.

## Fail-closed rule

OpenAlex metadata, DOI metadata, Crossref metadata, MDPI metadata, publisher URL availability, title, authors, institutions, journal, open-access status, citation counts, concept labels, article date, volume, issue, page, AI4Privacy PII 43 K dataset labels, 54 PII categories, 229 diverse use cases, financial application labels, privacy-preserving labels, named-entity recognition labels, transformer labels, SLM labels, LLM labels, DistilBERT labels, BERT labels, RoBERTa labels, ModernBERT labels, DeBERTa labels, accuracy labels, precision labels, recall labels, F1-score labels, local backlog text, or source identity cannot prove AMC question-level score explainability.

Passing evidence requires AMC-owned question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed evidence rows, row hashes, reproducible eval-pack rows, threshold results, source refs, and CI/lifecycle receipts.

## No-bloat boundary

No privacy-preserving NER subsystem, PII detector, PII masker, financial-document extractor, AI4Privacy dataset importer, Kaggle importer, synthetic PII generator, transformer fine-tuning runner, benchmark runner, model leaderboard, DistilBERT integration, BERT integration, RoBERTa integration, ModernBERT integration, DeBERTa integration, SLM/LLM model registry, financial compliance path, privacy compliance path, MDPI scraper, DOI adapter, Crossref adapter, OpenAlex importer, PDF parser, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport schema, Score method, package dependency, copied paper prose, copied abstract text, copied tables, copied figures, copied model lists as executable config, copied dataset rows, copied result values as benchmark fixtures, copied prompts, copied model outputs, copied screenshots, or source-specific question-explainability module was added.

The paper remains source-review signal only.

## Verification

- TDD expected failure before doc creation: `npx vitest run tests/gap1037PrivacyNerQuestionExplainabilityBoundary.test.ts --reporter=dot` failed only because this document did not exist; 3 question-explainability primitive tests passed.
- Live source retrieval:
  - `curl -L -sS -D /tmp/gap1037_doi_headers.txt -o /tmp/gap1037_doi.html https://doi.org/10.3390/app16073332`
  - `curl -sS https://api.openalex.org/works/W7143515573`
  - `curl -sS https://api.crossref.org/works/10.3390/app16073332`
  - `curl -sS -I https://www.mdpi.com/2076-3417/16/7/3332`
  - Browser retrieval of `https://www.mdpi.com/2076-3417/16/7/3332`
- `npx vitest run tests/gap1037PrivacyNerQuestionExplainabilityBoundary.test.ts --reporter=dot`: PASS, 1 file / 4 tests.
- `npx vitest run tests/gap1036IntegratedBiQuestionExplainabilityBoundary.test.ts tests/gap1037PrivacyNerQuestionExplainabilityBoundary.test.ts --reporter=dot`: PASS, 2 files / 8 tests.
- `git diff --check -- . ':(exclude)AMC_OS'`: PASS.
- Narrow no-bloat token scan over `src/diagnostic/questionScoreExplainability.ts`, `src/guide/guideGenerator.ts`, and `src/passport/passportArtifact.ts`: PASS, no privacy NER identifiers.
- `npm run typecheck`: PASS.
- `npm test -- --reporter=dot`: PASS, 884 files / 7,522 tests.
