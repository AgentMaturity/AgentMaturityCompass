# GAP-0955 - epistemic failure modes judge-calibration boundary

- Gap: `GAP-0955`
- Dimension: `eval-judge-calibration`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://doi.org/10.5281/zenodo.19042469`, `https://zenodo.org/records/19042469`, `https://openalex.org/W7136127232`
- Retrieval: `2026-06-22` via live DOI/Zenodo/OpenAlex header checks. DOI returned HTTP/2 302 to `https://zenodo.org/doi/10.5281/zenodo.19042469`, then Zenodo redirected to `https://zenodo.org/records/19042469`. Zenodo record returned HTTP/1.1 200 OK and advertised `https://zenodo.org/api/records/19042469` as a JSON describedby link. OpenAlex API HEAD returned HTTP/2 200 for `https://api.openalex.org/works/W7136127232`.
- Status: closed through existing judge calibration and appeal receipts; no epistemic-failure taxonomy importer, Zenodo importer, OpenAlex importer, paper parser, judge UI, or source-specific calibration subsystem added.

## Live source metadata

The live DOI chain resolves to Zenodo record `19042469` for `A Taxonomy of Epistemic Failure Modes in Large Language Models`. The Zenodo record headers expose the PDF item `A Taxonomy of Epistemic Failure Modes in Large Language Models - Bosch 2026.pdf`, a JSON record link at `https://zenodo.org/api/records/19042469`, a Creative Commons Attribution 4.0 license link, and a `ScholarlyArticle` type link. The OpenAlex work endpoint for `https://api.openalex.org/works/W7136127232` returned HTTP/2 200 on HEAD.

These facts are source-verification anchors only. No paper text, taxonomy content, examples, figures, tables, prompts, benchmark rows, model outputs, PDFs, API JSON, OpenAlex fields, Zenodo metadata payloads, or prose were copied into AMC.

## Relevance decision

This source is relevant to AMC because epistemic failure-mode evaluation can rely on LLM judges and contested scoring decisions. GAP-0955 maps to AMC's existing judge calibration primitive: rubric version, calibration set, disagreement metric, appeal outcome, signed evidence refs, receipt hash, replayability, CI gate, and Watch alerts.

It does not require a new scoring method, epistemic-risk taxonomy subsystem, paper importer, Zenodo importer, OpenAlex importer, PDF parser, API route, CLI command, Studio panel, appeal UI, or methodology version bump. The source can motivate a judge-calibration test case, but DOI/OpenAlex/Zenodo metadata cannot replace AMC-owned judge calibration evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through calibrated judge receipts, rubric versions, disagreement metrics, and score-facing CI gates. |
| Shield | Relevant because opaque or contested judge outcomes must fail closed without signed calibration and appeal evidence. |
| Watch | Relevant through judge-calibration Watch alerts for row-count gaps, judge disagreement, signed-evidence gaps, and appeal outcome gaps. |
| Enforce | No runtime policy, provider route, guardrail, or circuit breaker changed. |
| Vault | No secure-storage, privacy, prompt vault, PDF storage, or metadata retention behavior changed. |
| Fleet | No orchestration topology, agent routing, or fleet-level runtime primitive changed. |
| Passport | No portable trust token or proof-bundle schema changed. |
| Comply | No compliance framework mapping or auditor export changed. |

## Product closure

No `src/eval/judgeCalibration.ts`, `src/score/index.ts`, `src/studio/studioState.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version, badge semantics, diagnostic question bank, Zenodo/OpenAlex importer, paper parser, epistemic-failure taxonomy subsystem, or source-specific calibration module changed for GAP-0955.

The focused regression exercises the existing `buildJudgeCalibrationReceipt`, `verifyJudgeCalibrationReceipt`, and `buildJudgeCalibrationWatchAlerts` paths. The positive path requires rubric version, calibration set, disagreement metric, appeal outcome, signed evidence refs, source refs, receipt hash, replayability, and a passing CI gate. The negative path fails closed when DOI/OpenAlex/Zenodo metadata replaces signed judge-calibration evidence.

## Fail-closed rule

Paper title, DOI, Zenodo record, Zenodo API link, OpenAlex id, OpenAlex API endpoint, PDF filename, license link, `ScholarlyArticle` type, local backlog abstract, source title, or source identity alone must fail closed for judge-calibration claims. Passing evidence requires an AMC-owned rubric version, calibration set, disagreement metric, appeal outcome, judge prompt/output hashes, signed evidence refs, source refs, receipt hash, CI lifecycle proof, Watch alert or waiver proof, and no-copy proof.

## No-bloat boundary

No epistemic-failure taxonomy subsystem, judge UI, appeal UI, paper parser, Zenodo importer, OpenAlex importer, DOI crawler, PDF mirror, source metadata cache, benchmark mirror, dataset mirror, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific metric lens, or source-specific scoring path was added. No upstream paper text, taxonomy content, examples, figures, tables, prompts, benchmark rows, model outputs, PDFs, API JSON, OpenAlex fields, Zenodo metadata payloads, code, generated outputs, or prose were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0955EpistemicFailureModesJudgeCalibrationBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0954PromptLayerReplayCorpusBoundary.test.ts tests/gap0955EpistemicFailureModesJudgeCalibrationBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
