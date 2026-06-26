# GAP-0220 - 5W1H judge-calibration boundary

- Gap: `GAP-0220`
- Dimension: `eval-judge-calibration`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://doi.org/10.3390/electronics15030659`, `https://www.mdpi.com/2079-9292/15/3/659`, `https://www.mdpi.com/2079-9292/15/3/659/pdf`, `https://openalex.org/W7127357507`, and `https://api.openalex.org/works/W7127357507`
- Retrieval: live official DOI, MDPI, and OpenAlex pages fetched on 2026-06-26; MDPI rendered article facts were checked through browser/web retrieval, and OpenAlex API metadata was checked through shell fetch.
- Status: closed through existing AMC judge-calibration receipts; no 5W1H paper-specific judge, evaluator, importer, or appeal subsystem added.

## Live source metadata

The backlog identifies the source as `Benchmarking LLM-as-a-Judge Models for 5W1H Extraction Evaluation`, paper source id `https://openalex.org/W7127357507`, DOI `https://doi.org/10.3390/electronics15030659`, category `Agent evaluation and benchmarks`, dimension `Judge calibration and appeal path`, and requested Score, Shield, and Watch surfaces.

Browser retrieval on 2026-06-26 verified the MDPI article title `Benchmarking LLM-as-a-Judge Models for 5W1H Extraction Evaluation`, DOI `10.3390/electronics15030659`, journal/source `Electronics`, and article metadata. Source-review signals include 5W1H extraction evaluation, LLM-as-a-Judge benchmarking, rubric/criterion discipline, Factual Accuracy, Completeness, Relevance and Conciseness, Clarity and Readability, Faithfulness to Source, Overall Coherence, calibration session context, Inter-Annotator Agreement, Cohen-style agreement context, Judgment Acceptance Rate, Explanatory Utility Index, score distribution patterns, and criterion-level variance.

Shell retrieval on 2026-06-26 observed:

- `https://doi.org/10.3390/electronics15030659` redirected to `https://www.mdpi.com/2079-9292/15/3/659`, returned HTTP 200 `text/html`, 2193 bytes, first-200KB hash `c45d85bb0545fda5871697a04c14465946cd361a425bd45b3cbd30af41e0e53`.
- `https://www.mdpi.com/2079-9292/15/3/659` returned HTTP 200 `text/html`, 2193 bytes, first-200KB hash `089962a7c618547512ff1b024cf2b964b094213a3e707bc1d026ef78ab30cc01`.
- `https://www.mdpi.com/2079-9292/15/3/659/pdf` returned HTTP 200 `text/html`, 2212 bytes, first-200KB hash `3d63f7d16af6786e2fe4efea894a78fa065e18d73b58756f673ce25ba4a33bd0`.
- `https://openalex.org/W7127357507` returned HTTP 200 `text/html; charset=UTF-8`, 2766 bytes, first-200KB hash `aa45744b70c20550bd079db4356ac6d15377370e982f86be349ee036b4700059`.
- `https://api.openalex.org/works/W7127357507` returned HTTP 200 `application/json`, 18,503 bytes, first-200KB hash `6f84c66ac851671837a07ced17359cbfc8174259c4224ea9c285d52861faba7a`.

OpenAlex API metadata identified publication_date `2026-02-03`, cited_by_count `1`, referenced_works_count `25`, open_access status `gold`, license `cc-by`, publication type `article`, language `en`, source `Electronics`, OA URL `https://www.mdpi.com/2079-9292/15/3/659/pdf?version=1770105148`, and concepts including Benchmarking, Task, Computer science, CLARITY, Natural language processing, Relevance, Artificial intelligence, Quality, and Machine learning. Authors listed by OpenAlex include José Cassola-Bacallao, José Morales-Donaire, Paula Hernández-Montoya, and Brian Keith-Norambuena.

## Relevance decision

GAP-0220 is relevant to AMC because LLM-as-a-judge scoring can be opaque, biased, unstable, or hard to appeal unless each scoring claim is bound to a rubric version, calibration set, disagreement metric, appeal outcome, signed evidence refs, row hashes, receipt hash, replayability, and CI/lifecycle proof.

The source is paper context only. The accepted AMC primitive is the existing `buildJudgeCalibrationReceipt`, `verifyJudgeCalibrationReceipt`, and `buildJudgeCalibrationWatchAlerts` flow, which already binds rubric version, calibration rows, judge prompt/output hashes, disagreement metrics, appeal outcomes, signed evidence refs, source refs, receipt hash, CI gate, Watch alert projection, and fail-closed verification.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing judge-calibration receipts for rubric version, calibration set, disagreement metric, appeal outcome, and score evidence. |
| Shield | Relevant because paper/source metadata must fail closed unless signed judge-calibration evidence proves the claim. |
| Enforce | No runtime guardrail, policy enforcement, or circuit breaker changed. |
| Vault | No data-residency, secure-storage, secret, or DLP behavior changed. |
| Watch | Relevant through existing judge-calibration Watch alerts for row-count gaps, judge disagreement, signed-evidence gaps, and appeal outcome gaps. |
| Fleet | Agent-evaluation context only; no multi-agent orchestration or topology changed. |
| Passport | Existing judge-calibration receipts may feed proof bundles, but no Passport schema changed. |
| Comply | Appeal/contestability context only; no compliance mapping changed. |

## Product closure

No product code changed for this Top-100 closure. Earlier Slice 221 already added the AMC-owned judge-calibration primitive and public API routes. This closure adds a source-review receipt and a focused regression proving that the existing primitive covers GAP-0220 without a source-specific paper subsystem.

The positive test path accepts 5W1H LLM-as-a-Judge context only when an AMC-owned calibration packet includes rubric version, calibration set, three signed calibration rows, two judges per row, prompt/output hashes, source refs, a disagreement metric, an appeal outcome, signed appeal evidence, a receipt hash, replayability, and a passing CI gate.

The negative test path fails closed when DOI, MDPI, OpenAlex, title, concept, rubric-label, metric-label, and local backlog metadata replace signed AMC-owned judge-calibration evidence.

## Fail-closed rule

Paper title, DOI URL, DOI redirect behavior, MDPI article URL, MDPI PDF URL, OpenAlex page, OpenAlex API metadata, publication date, Electronics journal label, open-access label, `cc-by` license label, 5W1H label, LLM-as-a-Judge label, Factual Accuracy label, Completeness label, Relevance and Conciseness label, Clarity and Readability label, Faithfulness to Source label, Overall Coherence label, calibration session label, Inter-Annotator Agreement label, Cohen label, Judgment Acceptance Rate label, Explanatory Utility Index label, score distribution patterns label, criterion-level variance label, author list, concept list, local backlog metadata, or source identity alone must fail closed for judge-calibration claims.

Passing evidence requires AMC-owned rubric version, calibration set, disagreement metric, appeal outcome, judge prompt/output hashes, signed evidence refs, source refs, receipt hash, CI lifecycle proof, Watch alert or waiver proof, row hashes, replayability, and no-copy proof.

## No-bloat boundary

No 5W1H extraction benchmark importer, MDPI importer, OpenAlex importer, DOI crawler, PDF parser, paper mirror, source metadata cache, rubric clone, criterion-weight clone, LLM-as-a-Judge evaluator, 5W1H extractor, calibration-session workflow, inter-annotator-agreement calculator, Cohen-kappa module, judgment-acceptance metric, explanatory-utility metric, score-distribution analyzer, criterion-variance analyzer, appeal UI, source-specific API/CLI, Studio panel, Watch monitor, Shield verifier, Passport schema change, methodology bump, provider parity claim, or source-specific scoring path was added.

No article prose beyond short metadata phrases, figures, tables, formulas, criterion definitions, calibration examples, prompts, judge outputs, datasets, benchmark rows, result values, screenshots, assets, or implementation details were copied into AMC.

## Verification

- Expected-red focused test: `npx vitest run tests/gap0220FiveW1HJudgeCalibrationBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; 3 judge-calibration/no-bloat tests passed.
- Focused test after doc: `npx vitest run tests/gap0220FiveW1HJudgeCalibrationBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired judge-calibration regression: `npx vitest run tests/gap0220FiveW1HJudgeCalibrationBoundary.test.ts tests/judgeCalibration.test.ts tests/apiRouters.test.ts tests/gap0826ProteaJudgeCalibrationBoundary.test.ts tests/gap0897IndoxJudgeCalibrationBoundary.test.ts tests/gap0955EpistemicFailureModesJudgeCalibrationBoundary.test.ts tests/gap0988VirtualExpertJudgeCalibrationBoundary.test.ts --reporter=dot` passed, 7 files / 57 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 1023 files / 8108 tests.
