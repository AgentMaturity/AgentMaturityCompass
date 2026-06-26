# GAP-0019 - Humanloop live score and behavior drift alerts

- Gap: `GAP-0019`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://humanloop.com/`, docs overview `https://humanloop.com/docs/getting-started/overview`, monitoring docs `https://humanloop.com/docs/guides/observability/monitoring`, agent evaluation UI docs `https://humanloop.com/docs/tutorials/evaluate-agent-in-ui`, migration docs `https://humanloop.com/docs/guides/migrating-from-humanloop`, evaluator docs `https://humanloop.com/docs/explanation/evaluators`, log docs `https://humanloop.com/docs/explanation/logs`, CI/CD evaluation docs `https://humanloop.com/docs/guides/evals/cicd-integration`, and security/compliance docs `https://humanloop.com/docs/reference/security-compliance`
- Retrieval: live Humanloop homepage and docs, local backlog metadata, and existing AMC Watch live-drift implementation, 2026-06-26
- Status: Done

## Live source metadata

The current Humanloop homepage states Humanloop joins Anthropic and says the Humanloop platform is being sunset. The docs overview identifies Humanloop as an LLM Evals Platform for Enterprises and names Evaluation, Prompt Management, and Observability as primary product areas. The docs repeatedly show the platform sunset notice, including the September 8th, 2025 date.

The monitoring docs are still reachable and describe Monitor production Logs, online Evaluators attached to Prompts, automatically run them on new Logs, average Evaluator results over time, dashboard graphs, and per-log evaluator results in a Logs table. The evaluator docs describe online monitoring for live app logs and explicitly reference check for drift or degradation in performance. The logs docs say Logs contain the inputs and outputs of Function File executions and include metadata such as the Version used. The CI/CD evaluation docs and agent evaluation UI docs provide adjacent evaluation workflow context.

These facts are live-drift context only. No Humanloop product copy, docs examples, SDK/API snippets, request logs, traces, datasets, evaluation rows, export data, screenshots, dashboards, product UI, prompts, generated outputs, or implementation details were copied into AMC.

## Relevance decision

GAP-0019 is relevant to AMC because the backlog asks for live score and behavior drift alerts with baseline distribution, live sample, drift statistic, and alert receipt. Humanloop's production monitoring docs describe online evaluators on production logs, average evaluator results over time, log-level result columns, and drift/degradation monitoring. That maps directly to AMC's existing Watch live-drift primitive.

The accepted AMC primitive is `runLiveScoreBehaviorDrift`: AMC-owned baseline rows, live sample rows, score/behavior distributions, drift statistics, signed evidence refs, source refs, receipt hashes, alert receipts, and Watch alert projection. Humanloop metadata can identify source context, but it cannot replace AMC-owned signed live-drift evidence.

The source does not justify a Humanloop adapter, SDK wrapper, API client, export importer, log importer, evaluator runner, online monitoring connector, dataset importer, migration assistant, source-specific Watch monitor, scoring semantic change, methodology version bump, package dependency, or product parity claim.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant when score drift is computed from AMC-owned baseline and live samples; no Humanloop score method was added. |
| Shield | Relevant when behavior drift indicates unsafe, invalid, or unsupported behavior; no Humanloop evaluator was imported. |
| Watch | Primary surface. Existing live-drift receipts produce drift statistics, alert receipts, receipt hashes, and Watch alert projection. |
| Enforce | Out of scope. No runtime policy, release gate, circuit breaker, or Humanloop monitoring connector changed. |
| Vault | Out of scope. No Humanloop logs, exports, prompts, datasets, request data, or secure-storage behavior changed. |
| Fleet | Context only. No Fleet topology, routing, or multi-agent orchestration changed. |
| Passport | Out of scope. No portable trust token, badge, or proof-bundle schema changed. |
| Comply | Context only. Security/compliance docs do not alter AMC compliance mappings. |

## Product closure

No `src/watch/liveDriftAlerts.ts`, `src/drift/continuousMonitor.ts`, `src/score/index.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version, badge semantics, diagnostic question bank, Humanloop adapter, log importer, evaluator runner, export importer, online monitoring connector, migration assistant, or source-specific implementation module changed for GAP-0019.

The focused regression exercises existing `runLiveScoreBehaviorDrift`, `verifyLiveDriftReceipt`, and `buildLiveDriftWatchAlerts` behavior with Humanloop-style source references. The positive path requires AMC-owned signed baseline and live rows, source refs, baseline distribution, live sample, drift statistic, and alert receipt. The negative path proves Humanloop homepage/docs/monitoring/evaluator/log metadata fails closed without signed live-drift evidence.

## Fail-closed rule

Humanloop name, homepage, docs overview, platform sunset notice, Anthropic acquisition notice, September 8th 2025 sunset date, LLM Evals Platform label, Evaluation label, Prompt Management label, Observability label, Monitor production Logs label, online Evaluator label, automatic new-Log execution label, average Evaluator results over time label, Logs table label, drift/degradation label, Function File label, Version label, CI/CD label, security/compliance label, product screenshots, product examples, export references, or local backlog metadata must fail closed as live drift proof.

Passing evidence requires AMC-owned baseline distribution, live sample rows, behavior signatures, drift statistic, alert receipt, source refs, receipt hash, signed evidence refs, row hashes, Watch alert or waiver proof, and no-copy proof.

## No-bloat boundary

No Humanloop adapter, SDK wrapper, API client, export importer, log importer, evaluator runner, online monitoring connector, dataset importer, CI/CD integration, migration assistant, security-control mapper, dashboard clone, source-specific Watch monitor, API route, CLI command, Studio panel, Shield verifier, Passport field, methodology version bump, badge migration, diagnostic question-bank migration, package dependency, source-specific metric lens, or source-specific scoring path was added.

No Humanloop product copy, docs examples, SDK/API snippets, request logs, traces, datasets, evaluation rows, export data, screenshots, dashboards, product UI, prompts, generated outputs, model responses, configs, API keys, security-control text, migration instructions, or implementation details were copied.

## Verification

- Expected-red focused test: `npx vitest run tests/gap0019HumanloopLiveDriftBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-0019-humanloop-live-drift.md` did not exist; 3 live-drift/no-bloat tests passed.
- Live source checks:
  - Web channel found Humanloop docs for monitoring production Logs, evaluators, logs, and the platform sunset context.
  - Shell retrieval fetched `https://humanloop.com/` with HTTP 200 and first-200KB SHA-256 `3f1a4f6d4ec1bc365a79b601c43c37f133302e33605113a392917a4460bd6b5e`.
  - Shell retrieval fetched `https://humanloop.com/docs/getting-started/overview` with HTTP 200 and first-200KB SHA-256 `441db71530c8467b93056d3f390323d2d0404e4727f0745de980c959a397ec10`.
  - Shell retrieval fetched `https://humanloop.com/docs/guides/observability/monitoring` with HTTP 200 and first-200KB SHA-256 `ff40a85463b6dc857ffba429993a7566b4a029e047b3b155f985f56e624c05b6`.
  - Shell retrieval fetched `https://humanloop.com/docs/tutorials/evaluate-agent-in-ui` with HTTP 200 and first-200KB SHA-256 `dbb5e9edb7efc935df6d6d2298bfd2c02518204cc6defc8c172ef462d6d208cc`.
  - Shell retrieval fetched `https://humanloop.com/docs/guides/migrating-from-humanloop` with HTTP 200 and first-200KB SHA-256 `1e1bdf4f8ab0e0bbed142f4cf8f996cae3cb7c9b0a47f2f108653c43f487ef17`.
  - Shell retrieval fetched `https://humanloop.com/docs/explanation/evaluators` with HTTP 200 and first-200KB SHA-256 `afb2c509594044048044be6cc50816b5268f13205e152d017f374bce7fb90b26`.
  - Shell retrieval fetched `https://humanloop.com/docs/explanation/logs` with HTTP 200 and first-200KB SHA-256 `2d8bd050103255149b038d14521506a7519dbde13623e71317098b030ceef42e`.
  - Shell retrieval fetched `https://humanloop.com/docs/guides/evals/cicd-integration` with HTTP 200 and first-200KB SHA-256 `ae6c68a9698039b64e13a8ff720191763334b791435971f875eb68b5aec1bb7b`.
  - Shell retrieval fetched `https://humanloop.com/docs/reference/security-compliance` with HTTP 200 and first-200KB SHA-256 `b10be4bbab96119924b8860efe9986543a0e907343481e61dd52b58f4a36289f`.
- Focused test: `npx vitest run tests/gap0019HumanloopLiveDriftBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired live-drift regression: `npx vitest run tests/gap0019HumanloopLiveDriftBoundary.test.ts tests/gap0948CometOpikLiveDriftBoundary.test.ts tests/gap0949LangWatchLiveDriftBoundary.test.ts tests/gap0696LangtraceLiveDriftBoundary.test.ts tests/liveDriftAlerts.test.ts --reporter=dot` passed, 5 files / 97 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 1021 files / 8100 tests.
