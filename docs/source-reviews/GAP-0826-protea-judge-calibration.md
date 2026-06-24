# GAP-0826 - PROTEA judge-calibration boundary

- Gap: `GAP-0826`
- Dimension: `eval-judge-calibration`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://arxiv.org/abs/2605.18032`, DOI `10.48550/arXiv.2605.18032`, OpenAlex `W7161674885`
- Retrieval: `2026-06-21` via live DOI and OpenAlex header checks plus the arXiv source already reviewed for the PROTEA source family. DOI returned HTTP/2 302 to `https://arxiv.org/abs/2605.18032`; OpenAlex API HEAD returned HTTP/2 200.
- Status: closed through existing judge calibration and appeal receipts; no PROTEA judge, workflow graph debugger, node scorer, appeal UI, or source-specific calibration subsystem added.

## Live source metadata

The live PROTEA source family identifies `PROTEA: Offline Evaluation and Iterative Refinement for Multi-Agent LLM Workflows`. Relevant source-review signals include role-specific LLM calls, intermediate outputs, downstream nodes, configurable rubrics, workflow graph overlays, backward node evaluation, offline refinement, and node-level workflow debugging.

These facts are judge calibration context only. No upstream workflow graphs, prompts, intermediate outputs, node examples, rubrics, traces, score trajectories, datasets, figures, tables, code, generated outputs, or prose were copied into AMC.

## Relevance decision

This source is relevant to AMC because multi-agent workflow scoring can depend on LLM judges, rubric choices, and disagreement handling. GAP-0826 maps to AMC's existing judge calibration primitive: rubric version, calibration set, disagreement metric, appeal outcome, signed evidence refs, receipt hash, CI gate, Watch alerts, and replayable source refs.

It does not require a PROTEA evaluator, workflow graph debugger, node scorer, paper importer, OpenAlex importer, arXiv importer, API route, CLI command, Studio panel, appeal UI, or methodology version bump. Paper metadata can motivate the calibration check, but it cannot replace AMC-owned judge calibration and appeal evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through calibrated judge receipts, rubric versions, and score-facing CI gates. |
| Shield | Relevant because judge disagreement and unresolved appeals must fail closed for contested scores. |
| Watch | Relevant through judge-calibration Watch alerts for failed gates, disagreement, signed-evidence gaps, and appeal outcome gaps. |
| Enforce | No runtime workflow policy, provider route, or circuit breaker changed. |
| Vault | No prompts, traces, intermediate outputs, rubrics, or secure-storage behavior changed. |
| Fleet | Multi-agent workflow context only; no orchestration topology or workflow graph runtime changed. |
| Passport | No portable trust token or proof-bundle schema changed. |
| Comply | Appeal-path context only; no compliance framework mapping changed. |

## Product closure

No `src/eval/judgeCalibration.ts`, `src/score/index.ts`, `src/studio/studioState.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, PROTEA adapter, workflow graph debugger, node scorer, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0826.

The focused regression exercises the existing `buildJudgeCalibrationReceipt`, `verifyJudgeCalibrationReceipt`, and `buildJudgeCalibrationWatchAlerts` paths. The positive path requires rubric version, calibration set, disagreement metric, appeal outcome, signed evidence refs, source refs, receipt hash, replayability, and a passing CI gate. The negative path fails closed when paper metadata replaces signed judge-calibration evidence.

## Fail-closed rule

Paper title, arXiv URL, DOI, OpenAlex id, PROTEA label, role-specific LLM calls, intermediate outputs, downstream nodes, configurable rubrics, workflow graph, backward node evaluation, local backlog metadata, or source identity alone must fail closed for judge-calibration claims. Passing evidence requires AMC-owned rubric version, calibration set, disagreement metric, appeal outcome, signed evidence refs, judge prompts or hashes, calibration examples, source refs, receipt hash, CI lifecycle proof, Watch alert or waiver proof, and no-copy proof.

## No-bloat boundary

No PROTEA judge, workflow graph debugger, node scorer, rubric importer, appeal UI, paper importer, OpenAlex importer, arXiv importer, dataset mirror, benchmark mirror, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific metric lens, or source-specific scoring path was added. No upstream workflow graphs, prompts, intermediate outputs, node examples, rubrics, traces, score trajectories, datasets, figures, tables, code, generated outputs, or prose were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0826ProteaJudgeCalibrationBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
