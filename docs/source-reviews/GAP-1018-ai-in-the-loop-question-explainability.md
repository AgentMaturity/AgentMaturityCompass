# GAP-1018 - AI-in-the-loop question-explainability boundary

- Gap: `GAP-1018`
- Dimension: Question-level score explainability (`eval-score-explainability`)
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: OpenAlex work `https://openalex.org/W7125630689`, OpenAlex API `https://api.openalex.org/works/W7125630689`, DOI `https://doi.org/10.56553/popets-2026-0006`, Crossref API `https://api.crossref.org/works/10.56553/popets-2026-0006`, publisher page `https://petsymposium.org/popets/2026/popets-2026-0006.php`, publisher PDF `https://petsymposium.org/popets/2026/popets-2026-0006.pdf`, and local backlog metadata.
- Retrieval: `2026-06-24` live source review through OpenAlex API, DOI headers, Crossref API, publisher HTML, publisher PDF headers, narrow PDF text extraction, and local backlog metadata.
- Status: Done
- Linear: `AMC-1297`

## Live source metadata

OpenAlex identifies `https://openalex.org/W7125630689` with DOI `https://doi.org/10.56553/popets-2026-0006`, title `AI-in-the-Loop: Privacy Preserving Real-Time Scam Detection and Conversational Scam-baiting by Leveraging LLMs and Federated Learning`, publication_year `2026`, publication_date `2026-01-01`, type `article`, cited_by_count `2`, updated_date `2026-06-11T09:08:48.828518`, and created_date `2026-01-26T00:00:00`.

OpenAlex primary-location metadata lists Proceedings on Privacy Enhancing Technologies, ISSN `2299-0984`, raw type `journal-article`, license `cc-by`, OA status `hybrid`, OA URL `https://petsymposium.org/popets/2026/popets-2026-0006.pdf`, source host organization De Gruyter Open, and published-version status.

OpenAlex authorship metadata lists Ismail Hossain, Md. Jahangir Alam, and Sajedul Talukder at The University of Texas at El Paso, plus Sai Puppala at Southern Illinois University Carbondale. Top concepts include Computer science, Internet privacy, Federated learning, Interoperability, Computer security, Harm, Guard, and Moderation.

Crossref identifies DOI `10.56553/popets-2026-0006` as a journal-article in Proceedings on Privacy Enhancing Technologies, publisher Privacy Enhancing Technologies Symposium Advisory Board, issued/published January 2026, license URL `https://creativecommons.org/licenses/by/4.0/`, reference count 0, and referenced-by count 2.

The DOI header request returned `HTTP/2 302` to `https://petsymposium.org/popets/2026/popets-2026-0006.php`, followed by publisher `HTTP/1.1 200 OK`. The publisher PDF header returned `HTTP/1.1 200 OK`, `Content-Type: application/pdf`, `Content-Length: 4294220`, `Last-Modified: Sun, 25 Jan 2026 16:48:15 GMT`, and ETag `"41864c-6493928236e22"`.

The publisher page exposes citation metadata for the same title, authors, journal, and PDF URL. Narrow publisher/PDF review found method-context labels including real-time scam detection, conversational scam-baiting, privacy-preserving AI, federated learning, differential privacy, FedAvg, guard models, LlamaGuard, MD-Judge, PII leakage, and privacy-risk tradeoffs. These are source-review context only and do not become AMC evidence without question-tagged AMC receipts.

No paper prose beyond short metadata facts, abstract text beyond short method labels, figures, tables, math, datasets, experimental values, prompts, conversation examples, model outputs, guard prompts, code, PDF text, screenshots, configs, generated outputs, or implementation details were copied into AMC.

## Relevance decision

GAP-1018 is relevant to AMC through the existing Score question-level score explainability path, with secondary Shield and Watch relevance when a scored claim concerns safety, privacy, drift, or real-time intervention quality. The source reinforces the need for every L0-L5 score movement to expose question ID, accepted evidence IDs, rejected evidence reasons, repair hint, reproducible eval pack, signed rows, row hashes, and fail-closed thresholds.

This does not justify a scam-detection product area. OpenAlex metadata, DOI resolution, Crossref metadata, publisher page metadata, PDF availability, paper title, author list, journal name, OA license, cited-by count, real-time scam detection labels, scam-baiting labels, federated-learning labels, differential-privacy labels, guard-model labels, FedAvg labels, LlamaGuard labels, MD-Judge labels, or PII leakage labels cannot prove an AMC question score. A claim can pass only when AMC-owned question-score explainability receipts bind the maturity question to accepted evidence, rejected evidence, repair guidance, thresholds, and replayable eval rows.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing question-level score explainability reports and eval-score explainability packs. |
| Shield | Relevant only when safety/privacy/scam-risk claims include signed AMC evidence and rejected-evidence reasons; no scam detector was added. |
| Enforce | Not changed. No runtime moderation, scam intervention, or guardrail policy was added. |
| Vault | Not changed. No PII detector, private-learning store, raw-conversation store, or data-residency behavior changed. |
| Watch | Relevant only when scored claims include lifecycle or regression evidence; no real-time scam monitor was added. |
| Fleet | Not changed. No federated client topology, agent fleet, or orchestration behavior changed. |
| Passport | Existing question-explainability receipts can feed proof bundles, but no Passport schema changed. |
| Comply | Not changed. No privacy law, consent, or compliance mapping changed. |

## Product closure

No `src/diagnostic/questionScoreExplainability.ts`, `src/guide/guideGenerator.ts`, `src/passport/passportArtifact.ts`, API, CLI, Studio, Score method, Shield detector, Watch monitor, Passport schema, package dependency, public methodology file, or paper importer changed for GAP-1018.

The focused regression exercises existing `buildQuestionExplainabilityReport` and `buildEvalScoreExplainabilityPack` behavior with a positive AI-in-the-loop source-reference packet and a negative metadata-only packet. The positive path requires a question ID, accepted evidence IDs, rejected evidence reasons, repair hint, reproducible eval pack, signed evidence rows, row hashes, pass-rate and average-score fail-closed thresholds, source refs, and no-importer proof. The negative path proves that OpenAlex, DOI, Crossref, publisher, PDF, scam-detection, federated-learning, and guard-model metadata fail closed without AMC-owned question evidence.

## Fail-closed rule

OpenAlex metadata, DOI metadata, Crossref metadata, publisher citation metadata, publisher PDF availability, title, authors, institutions, journal, license, OA status, cited-by count, concept labels, abstract labels, real-time scam detection labels, conversational scam-baiting labels, privacy-preserving AI labels, federated learning labels, differential privacy labels, FedAvg labels, guard models, LlamaGuard labels, MD-Judge labels, PII leakage labels, paper method terms, local backlog text, or source identity cannot prove AMC question-level score explainability.

Passing evidence requires AMC-owned question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed rows, row hashes, reproducible eval pack, CI or lifecycle threshold proof, and no-copy/no-importer proof.

## No-bloat boundary

No scam-detection subsystem, scam-baiting agent, conversation simulator, social-engineering classifier, federated-learning runtime, differential-privacy module, FedAvg implementation, guard-model wrapper, LlamaGuard integration, MD-Judge integration, PII leakage detector, privacy-risk scorer, raw-conversation store, dataset importer, paper importer, PDF parser, publisher scraper, model fine-tuner, active intervention workflow, safety-aware utility clone, API route, CLI command, Studio panel, Watch monitor, Shield detector, Score method, Passport schema, package dependency, copied source code, copied paper prose, copied abstract text, copied figures, copied tables, copied math, copied prompts, copied conversation examples, copied datasets, copied experimental values, copied model outputs, copied guard prompts, copied configs, copied screenshots, copied generated outputs, or source-specific subsystem was added.

The paper remains source-review signal only.

## Verification

- Expected-red focused test before doc: `npx vitest run tests/gap1018AiInTheLoopQuestionExplainabilityBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1018-ai-in-the-loop-question-explainability.md` did not exist; 3 question-explainability primitive tests passed.
- Live source retrieval:
  - `curl -fsSL https://api.openalex.org/works/W7125630689`
  - `curl -I -L https://doi.org/10.56553/popets-2026-0006`
  - `curl -fsSL https://api.crossref.org/works/10.56553/popets-2026-0006`
  - `curl -fsSL https://petsymposium.org/popets/2026/popets-2026-0006.php`
  - `curl -I -L https://petsymposium.org/popets/2026/popets-2026-0006.pdf`
  - `curl -fsSL https://petsymposium.org/popets/2026/popets-2026-0006.pdf | pdftotext -f 1 -l 4 - -`
- `npx vitest run tests/gap1018AiInTheLoopQuestionExplainabilityBoundary.test.ts --reporter=dot`: PASS, 1 file / 4 tests.
- `npx vitest run tests/gap1010ElAgenteGraficoQuestionExplainabilityBoundary.test.ts tests/gap1018AiInTheLoopQuestionExplainabilityBoundary.test.ts --reporter=dot`: PASS, 2 files / 8 tests.
- `git diff --check -- . ':(exclude)AMC_OS'`: PASS.
- Narrow no-bloat token scan over `src/diagnostic/questionScoreExplainability.ts`, `src/guide/guideGenerator.ts`, and `src/passport/passportArtifact.ts`: PASS, no AI-in-the-loop paper identifiers.
- `npm run typecheck`: PASS.
- `npm test -- --reporter=dot`: PASS, 865 files / 7,447 tests.
