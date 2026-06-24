# GAP-0692 - OpenAI Evals and Traces question-explainability boundary

- Gap: `GAP-0692`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://platform.openai.com/docs/guides/evals` redirected to `https://developers.openai.com/api/docs/guides/evals`, plus `https://developers.openai.com/api/docs/guides/agent-evals`
- Retrieval: `2026-06-21` via browser access to official OpenAI documentation; shell network remains DNS-restricted in this environment.
- Status: relevant only through existing question-level score explainability; no OpenAI Evals, trace-grading, dataset, or grader integration added.

## Live source metadata

The official OpenAI docs page identifies `Working with evals` as a guide for testing and improving model outputs through evaluations. It records that the OpenAI Evals platform is being deprecated: existing evals become read-only for existing users on October 31, 2026, and the platform is scheduled to shut down on November 30, 2026. The same page points newer evaluation work toward Datasets during that transition.

The official `Evaluate agent workflows` page describes using traces, graders, datasets, and eval runs to improve agent quality. Relevant question-explainability signals include traces that capture model calls, tool calls, guardrails, and handoffs; trace grading for structured criteria; workflow questions about tool choice, handoff correctness, instruction/safety-policy violations, and prompt/routing changes; `Logs > Traces` as the dashboard entry point; and datasets/eval runs for repeatability, prompt comparison, benchmarking changes, and larger-scale evaluation over time.

These facts identify eval/trace source-review context only. No OpenAI docs prose beyond short metadata facts, workflow labels, deprecation dates, dashboard labels, grader labels, dataset labels, eval-run labels, screenshots, code snippets, API schemas, cookbook content, traces, prompts, eval rows, configs, or implementation details were copied into AMC.

## Relevance decision

OpenAI Evals and Traces is relevant to AMC question-level score explainability because trace and eval tools can expose why a workflow changed, but AMC maturity users still need a per-question explanation: question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed evidence refs, thresholds, row hashes, and Score/Shield/Watch surface mapping.

The accepted AMC primitive is already question-score explainability. OpenAI documentation, Evals platform status, trace-grading labels, datasets labels, grader labels, eval-run labels, dashboard labels, or cookbook links are not accepted evidence by themselves.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through existing AMC question rows with accepted evidence IDs, rejected evidence reasons, repair hints, thresholds, and row hashes. |
| Shield | Relevant only when unsupported eval/trace claims are rejected with signed evidence and repair guidance. |
| Watch | Relevant only when caller-owned traces, receipts, and threshold results are hash-bound through AMC evidence. |
| Enforce | No guardrail runtime, trace grader, or policy-enforcement change. |
| Vault | No OpenAI traces, datasets, dashboard logs, API keys, or secure-storage behavior changed. |
| Fleet | Agent-workflow context only; no OpenAI workflow runner, handoff monitor, or trust topology was added. |
| Passport | No portable proof-bundle field or credential changed. |
| Comply | No compliance mapping or regulated-domain claim. |

## Product closure

GAP-0692 is closed by documenting the source-review boundary and adding regression coverage over the existing `questionScoreExplainability` primitive. The positive path proves that OpenAI eval/trace context can be cited only after AMC-owned question evidence exists. The negative path proves metadata-only source identity fails closed.

No `src/diagnostic/questionScoreExplainability.ts`, `src/guide/guideGenerator.ts`, `src/passport/passportArtifact.ts`, API, CLI, Studio, diagnostic question bank, Passport field, Watch monitor, trace-grading subsystem, dataset importer, OpenAI Evals API client, grader adapter, or scoring behavior changed for GAP-0692.

## Fail-closed rule

OpenAI docs titles, platform-deprecation dates, Datasets labels, trace labels, grader labels, model-call labels, tool-call labels, guardrail labels, handoff labels, dashboard labels, eval-run labels, prompt-comparison labels, benchmark-change labels, cookbook links, local backlog metadata, or source identity alone must fail closed for question-score explainability claims. Passing evidence requires AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed evidence refs, thresholds, row hashes, and no-copy proof.

## No-bloat boundary

No OpenAI Evals API client, trace-grading integration, dataset importer, grader adapter, prompt optimizer wrapper, dashboard connector, `Logs > Traces` scraper, cookbook importer, eval-run runner, external-model evaluator, batch evaluator, OpenAI-specific question lens, API route, CLI command, Studio panel, Passport field, methodology version bump, or parity layer was added. No OpenAI docs prose beyond short metadata facts, workflow labels, deprecation dates, dashboard labels, grader labels, dataset labels, eval-run labels, screenshots, code snippets, API schemas, cookbook content, traces, prompts, eval rows, configs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0692OpenAiEvalsTracesQuestionExplainabilityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
