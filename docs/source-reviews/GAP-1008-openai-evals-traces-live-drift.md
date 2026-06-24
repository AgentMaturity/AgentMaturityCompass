# GAP-1008 - OpenAI Evals and Traces live-drift boundary

- Gap: `GAP-1008`
- Dimension: Live score and behavior drift alerts (`obs-live-drift-alerts`)
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: OpenAI Evals and Traces
- Retrieval: live official-source retrieval on 2026-06-24 from `https://platform.openai.com/docs/guides/evals`, `https://developers.openai.com/api/docs/guides/evals`, `https://developers.openai.com/api/docs/guides/trace-grading`, `https://developers.openai.com/api/docs/guides/agent-evals`, and `https://developers.openai.com/api/docs/guides/evaluation-best-practices`
- Status: Done

## Relevance decision

GAP-1008 is relevant to AMC only through the existing Watch live score and behavior drift alert primitive, with Score and Shield consuming the resulting receipt. OpenAI's official docs describe eval runs, trace grading, agent workflow traces, graders, datasets, repeatable eval runs, and production-eval guidance. Those are useful source-review signals for AMC's requirement that live drift alerts must compare a baseline distribution with a live sample, compute a drift statistic, and emit an alert receipt tied to signed evidence.

This does not justify a new OpenAI integration. The current official source status makes that boundary more important: the legacy Evals guide redirects to the OpenAI Developers docs and states that the Evals platform is being deprecated, becomes read-only for existing users on October 31, 2026, and is scheduled to shut down on November 30, 2026. AMC should not build a source-specific product surface around that legacy platform.

Live official-source metadata reviewed:

- Original entry URL: `https://platform.openai.com/docs/guides/evals`.
- Canonical Evals URL: `https://developers.openai.com/api/docs/guides/evals`.
- Redirect/header evidence: `HTTP/2 301` followed by `HTTP/2 200`.
- Canonical Evals header evidence: etag: `"15aa9e27f9d9707885355a6aab15dceb"` and last-modified: `Wed, 24 Jun 2026 00:12:04 GMT`.
- Canonical Evals title: `Working with evals | OpenAI API`.
- Canonical Evals page context reviewed: `Datasets`, `Describe the task`, `Run your eval`, `Analyze the results`, result payloads containing `report_url`, and Cookbook links for `Detecting prompt regressions`, `Bulk model and prompt experimentation`, and `Monitoring stored completions`.
- Trace grading URL: `https://developers.openai.com/api/docs/guides/trace-grading`.
- Trace grading title: `Trace grading | OpenAI API`.
- Trace grading context reviewed: structured scores, labels, agent traces, tool calls, reasoning steps, `Logs > Traces`, `Grade all`, the evaluation dashboard, run configuration by date range, and tool-call filtering.
- Agent workflow evals URL: `https://developers.openai.com/api/docs/guides/agent-evals`.
- Agent workflow evals title: `Evaluate agent workflows | OpenAI API`.
- Agent workflow evals context reviewed: traces, graders, datasets, evaluation runs, guardrails, handoffs, regressions, failure modes, and moving to datasets and eval runs when repeatability is needed.
- Evaluation best practices URL: `https://developers.openai.com/api/docs/guides/evaluation-best-practices`.
- Evaluation best practices title: `Evaluation best practices | OpenAI API`.
- Evaluation best practices context reviewed: structured tests, numerical scores, combining metrics with human judgment, eval-driven development, `Log everything`, automation where possible, continuous evaluation, and avoiding eval datasets that miss production traffic patterns.

These facts are source-review signals only. They are not copied into AMC as API examples, datasets, prompts, graders, traces, result rows, screenshots, or product behavior.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant. Live score drift must be backed by baseline and live distributions, signed eval rows, score drops, and reproducible receipts. |
| Shield | Relevant as assurance context only. Agent traces and grader labels do not replace AMC-signed safety or behavior evidence. |
| Enforce | Not changed. No runtime guardrail or OpenAI enforcement hook is added. |
| Vault | Not changed. No OpenAI credentials, stored completions, datasets, traces, or dashboard data are ingested. |
| Watch | Relevant. The existing live-drift receipt path already computes score, behavior, refusal, error, latency, cost, tool-call, evidence, and signed-evidence alerts. |
| Fleet | Not changed. Agent-workflow eval context does not add AMC fleet orchestration behavior. |
| Passport | Not changed. No OpenAI proof bundle adapter is added. |
| Comply | Not changed. This source does not alter compliance mappings. |

## Product closure

No product module changed for GAP-1008 because AMC already has the relevant primitive in `src/watch/liveDriftAlerts.ts`, with drift and score consumers available through existing Watch/Drift/Score modules.

The focused regression test `tests/gap1008OpenAiEvalsTracesLiveDriftBoundary.test.ts` proves:

- A positive AMC-owned live-drift receipt accepts OpenAI Evals and Traces only as source references while comparing a signed baseline distribution to a signed live sample.
- The receipt emits fail-closed Watch alerts for score, pass-rate, refusal, error, latency, cost, tool-call, behavior-signature, invalid-action, and error-attribution drift.
- Metadata-only OpenAI docs fail closed when live rows do not include evidence references and signed evidence references.
- The boundary does not add `https://platform.openai.com/docs/guides/evals`, `https://developers.openai.com/api/docs/guides/evals`, `https://developers.openai.com/api/docs/guides/trace-grading`, `OpenAI Evals and Traces`, or `openai_evals_traces_live_drift` identifiers to Watch, Drift, or Score implementation modules.

## Fail-closed rule

Metadata-only proof must fail closed. Official OpenAI docs, redirects, page titles, dashboard labels, deprecation notices, Evals API response shapes, `report_url`, trace-grading labels, structured scores, tool-call filters, reasoning-step descriptions, dataset guidance, evaluation dashboards, Cookbook links, or best-practice advice do not prove AMC maturity.

A live drift claim can pass only when AMC has a baseline distribution, live sample, drift statistic, alert receipt, trace/eval evidence references, signed evidence references for every baseline and live row, receipt hash, row hashes, and fail-closed thresholds tied to the lifecycle run.

## No-bloat boundary

No OpenAI Evals runner, trace exporter, trace grader adapter, dashboard scraper, dataset importer, stored-completion monitor, Cookbook mirror, prompt-regression runner, SDK integration, API route, CLI command, Studio panel, dependency, copied docs prose, copied API examples, copied datasets, copied prompts, copied grader criteria, copied trace rows, copied screenshots, or source-specific subsystem was added.

OpenAI Evals and Traces remains source-review signal only.

## Verification

- Expected-red TDD check: `npx vitest run tests/gap1008OpenAiEvalsTracesLiveDriftBoundary.test.ts --reporter=dot` failed only because this doc did not exist yet (`ENOENT`) and the 3 product/boundary assertions passed.
- Live source retrieval:
  - `curl -fsSL -I https://platform.openai.com/docs/guides/evals`
  - `curl -fsSL https://developers.openai.com/api/docs/guides/evals | rg -n "<title>|meta name=\"description\"|deprecat|read-only|October 31, 2026|November 30, 2026|Datasets|Describe the task|Run your eval|Analyze the results|report_url|Detecting prompt regressions|Bulk model and prompt experimentation|Monitoring stored completions"`
  - `curl -fsSL https://developers.openai.com/api/docs/guides/trace-grading | rg -n "<title>|meta name=\"description\"|Trace grading|structured scores|labels|agent trace|tool calls|reasoning steps|Logs > Traces|Grade all|evaluation dashboard|date range|tool calls"`
  - `curl -fsSL https://developers.openai.com/api/docs/guides/agent-evals | rg -n "<title>|meta name=\"description\"|Evaluate agent workflows|traces|graders|datasets|evaluation runs|guardrails|handoffs|regressions|failure modes|repeatability"`
  - `curl -fsSL https://developers.openai.com/api/docs/guides/evaluation-best-practices | rg -n "<title>|meta name=\"description\"|deprecat|read-only|October 31, 2026|November 30, 2026|eval-driven development|Log everything|Automate when possible|continuous process|production traffic patterns|structured tests|numerical scores|human judgment"`
- `npx vitest run tests/gap1008OpenAiEvalsTracesLiveDriftBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- `npx vitest run tests/gap1007AnthropicConsoleEvalsQuestionExplainabilityBoundary.test.ts tests/gap1008OpenAiEvalsTracesLiveDriftBoundary.test.ts --reporter=dot` passed, 2 files / 8 tests.
- `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Narrow token scan over `src/watch/liveDriftAlerts.ts`, `src/drift/continuousMonitor.ts`, and `src/score/index.ts` found no OpenAI Evals and Traces identifiers.
- `npm run typecheck` passed.
- `npm test -- --reporter=dot` passed, 855 files / 7,410 tests.
