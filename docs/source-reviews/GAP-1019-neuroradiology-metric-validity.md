# GAP-1019 - Neuroradiology metric-validity boundary

- Gap: `GAP-1019`
- Dimension: Metric validity and reliability checks (`eval-metric-validity`)
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: OpenAlex work `https://openalex.org/W7131099824`, OpenAlex API `https://api.openalex.org/works/W7131099824`, DOI `https://doi.org/10.3348/kjr.2025.1045`, Crossref API `https://api.crossref.org/works/10.3348/kjr.2025.1045`, publisher page `https://kjronline.org/DOIx.php?id=10.3348/kjr.2025.1045`, publisher PDF `https://kjronline.org/Synapse/Data/PDFData/0068KJR/kjr-27-214.pdf`, and local backlog metadata.
- Retrieval: `2026-06-24` live source review through OpenAlex API, DOI headers, Crossref API, publisher HTML, publisher PDF headers, and local backlog metadata.
- Status: Done
- Linear: `AMC-1298`

## Live source metadata

OpenAlex identifies `https://openalex.org/W7131099824` with DOI `https://doi.org/10.3348/kjr.2025.1045`, title `Evaluating the Accuracy and Diagnostic Reasoning of Multimodal Large Language Models in Interpreting Neuroradiology Cases From RadioGraphics`, publication_year `2026`, publication_date `2026-01-01`, type `article`, language `en`, referenced_works_count `31`, cited_by_count `2`, updated_date `2026-06-24T13:16:06.693445`, and created_date `2026-02-24T00:00:00`.

OpenAlex primary-location metadata lists Korean Journal of Radiology, ISSNs `1229-6929` and `2005-8330`, raw type `journal-article`, source host organization Korean Society of Radiology, license `cc-by-nc`, OA status `hybrid`, OA URL `http://kjronline.org/Synapse/Data/PDFData/0068KJR/kjr-27-214.pdf`, and published-version status.

OpenAlex authorship metadata lists Pae Sun Suh at Yonsei University; Ji Su Ko at Kangbuk Samsung Hospital and Sungkyunkwan University; Woo Hyun Shim, Hwon Heo, Chang-Yun Woo, and Chong Hyun Suh at Ulsan College, Asan Medical Center, and the University of Ulsan; and Hyungjun Park at Shinhwa Medical. Top concepts include Medicine, Interpretation, Neuroradiology, Neuroimaging, Differential diagnosis, Radiology, Artificial intelligence, Natural language processing, and MEDLINE.

Crossref identifies DOI `10.3348/kjr.2025.1045` as a journal-article in Korean Journal of Radiology, publisher XMLink, issued/published in 2026, license URL `https://creativecommons.org/licenses/by-nc/4.0`, reference count 35, and referenced-by count 2.

The DOI header request returned `HTTP/2 302` to `https://kjronline.org/DOIx.php?id=10.3348/kjr.2025.1045`, followed by publisher `HTTP/1.1 200 OK`. The direct PDF header path returned a redirect to the HTTPS PDF and then `HTTP/1.1 200 OK`, `Content-Type: application/pdf`, `Content-Length: 4851826`, `Last-Modified: Mon, 23 Feb 2026 00:32:50 GMT`, and ETag `"4a0872-64b72e927ceb2"`.

Narrow publisher review found method-context labels including 401 radiologic quizzes, GPT-4 Turbo with Vision, GPT-4 Omni, Gemini Flash, Claude, top three differential diagnoses, rationale scoring, generalized estimating equations, two neuroradiologist readers, three-radiologist rationale review, four-point scales, hallucinations, acceptable response criteria, clinical-history subgroups, repeatability limitations, and the note that proprietary models underwent updates during the study period. These are useful metric-validity context signals, not AMC clinical evidence.

No paper prose beyond short metadata facts, abstract text beyond short method labels, figures, tables, math, radiology cases, diagnoses, patient examples, quiz rows, prompts, model outputs, clinical images, supplemental material, publisher HTML, PDF text, configs, screenshots, or implementation details were copied into AMC.

## Relevance decision

GAP-1019 is relevant to AMC through the existing Score metric-validity receipt path, with secondary Shield and Watch relevance only when safety, clinical-risk, model-update, or lifecycle claims are backed by signed AMC evidence. The source reinforces why maturity metrics need validation table artifacts, sample size, confidence interval, metric owner, construct validity, inter-rater reliability, test-retest stability, regression thresholds, source refs, row hashes, and outcome alignment before a metric claim can pass.

This does not justify a neuroradiology subsystem or any clinical diagnostic claim. OpenAlex metadata, DOI resolution, Crossref metadata, publisher page labels, PDF availability, article title, author list, journal name, OA license, cited-by count, 401 quiz labels, model names, radiologist-comparison labels, generalized estimating equation labels, four-point scale labels, hallucination labels, clinical-history subgroup labels, repeatability limitation text, or medical/radiology concepts cannot prove AMC metric validity. A neuroradiology-context claim can pass only through AMC-owned metric-validity receipts.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing metric-validation rows, validation table, sample size, confidence interval, reliability checks, outcome alignment, and metric owner. |
| Shield | Relevant only if clinical-risk or hallucination claims include signed AMC safety evidence; no medical safety system was added. |
| Enforce | Not changed. No diagnostic workflow, clinical guardrail, or medical policy enforcement was added. |
| Vault | Not changed. No patient data, imaging data, PHI handling, or storage behavior changed. |
| Watch | Relevant as lifecycle/model-update context for scored claims; no clinical monitor was added. |
| Fleet | Not changed. No model fleet, radiology workflow, or human-reader topology changed. |
| Passport | Existing metric-validity receipts can feed proof bundles, but no Passport schema changed. |
| Comply | Not changed. No medical, HIPAA, FDA, or clinical compliance mapping changed. |

## Product closure

No `src/score/metricValidity.ts`, `src/diagnostic/questionScoreExplainability.ts`, `src/diagnostic/runner.ts`, API, CLI, Studio, scoring code, Watch monitor, Shield detector, package dependency, clinical workflow, medical benchmark importer, public methodology file, or paper importer changed for GAP-1019.

The focused regression exercises existing `buildMetricValidationReport` behavior with a positive neuroradiology-style source-reference packet and a negative metadata-only packet. The positive path requires validation facets, process evidence, outcome alignment, signed evidence refs, source refs, row hashes, sample size, confidence interval, inter-rater agreement, test-retest stability, replayable eval pack, and CI pass. The negative path proves that OpenAlex, DOI, Crossref, publisher, PDF, clinical benchmark labels, article-method labels, model names, and source identity fail closed without AMC-owned metric-validity proof.

## Fail-closed rule

OpenAlex metadata, DOI metadata, Crossref metadata, publisher citation metadata, publisher PDF availability, title, authors, institutions, journal, license, OA status, cited-by count, concept labels, medical/radiology labels, 401 radiologic quizzes, model names, top-three differential diagnosis labels, generalized estimating equation labels, radiologist-comparison labels, four-point scale labels, hallucination labels, acceptable response labels, clinical-history subgroup labels, repeatability limitation labels, local backlog text, or source identity cannot prove AMC metric validity.

Passing evidence requires AMC-owned validation table artifacts, confidence interval, sample size, metric owner, construct-validity mapping, reliability checks, outcome alignment, signed evidence refs, row hashes, regression thresholds, source refs, CI or lifecycle receipts, and no-copy/no-medical-claim proof.

## No-bloat boundary

No neuroradiology subsystem, clinical diagnostic claim, radiology benchmark importer, RadioGraphics quiz importer, KJR importer, PDF parser, publisher scraper, clinical image handler, patient-case dataset, medical prompt runner, LLM diagnostic runner, radiologist-comparison module, generalized-estimating-equation implementation, hallucination scorer, four-point-scale scorer, clinical-history subgroup analyzer, repeatability analyzer, medical compliance path, PHI/Vault workflow, API route, CLI command, Studio panel, Watch monitor, Shield detector, Score method, copied source code, copied paper prose, copied abstract text, copied figures, copied tables, copied math, copied radiology cases, copied diagnoses, copied patient examples, copied quiz rows, copied prompts, copied model outputs, copied clinical images, copied supplemental material, copied publisher HTML, copied PDF text, copied configs, copied screenshots, or source-specific subsystem was added.

The paper remains source-review signal only.

## Verification

- Expected-red focused test before doc: `npx vitest run tests/gap1019NeuroradiologyMetricValidityBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1019-neuroradiology-metric-validity.md` did not exist; 3 metric-validity primitive tests passed.
- Live source retrieval:
  - `curl -fsSL https://api.openalex.org/works/W7131099824`
  - `curl -I -L https://doi.org/10.3348/kjr.2025.1045`
  - `curl -fsSL https://api.crossref.org/works/10.3348/kjr.2025.1045`
  - `curl -fsSL 'https://kjronline.org/DOIx.php?id=10.3348/kjr.2025.1045'`
  - `curl -I -L http://kjronline.org/Synapse/Data/PDFData/0068KJR/kjr-27-214.pdf`
- `npx vitest run tests/gap1019NeuroradiologyMetricValidityBoundary.test.ts --reporter=dot`: PASS, 1 file / 4 tests.
- `npx vitest run tests/gap1017WindowsAgentArenaMetricValidityBoundary.test.ts tests/gap1019NeuroradiologyMetricValidityBoundary.test.ts --reporter=dot`: PASS, 2 files / 8 tests.
- `git diff --check -- . ':(exclude)AMC_OS'`: PASS.
- Narrow no-bloat token scan over `src/score/metricValidity.ts`, `src/diagnostic/questionScoreExplainability.ts`, and `src/diagnostic/runner.ts`: PASS, no neuroradiology paper identifiers.
- `npm run typecheck`: PASS.
- `npm test -- --reporter=dot`: PASS, 866 files / 7,451 tests.
