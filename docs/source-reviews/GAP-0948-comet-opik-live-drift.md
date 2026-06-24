# GAP-0948 — Comet Opik live drift

- Gap: `GAP-0948`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: Comet Opik product page and public docs
- Retrieval: live Opik product page at `https://www.comet.com/site/products/opik/`; docs reviewed at `https://www.comet.com/docs/opik/`
- Status: Done

## Relevance decision

Relevant, but only through AMC's existing Watch live score and behavior drift receipt path. The live product page frames Opik as "AI Observability & Evals" for the Agentic Era and describes logs across user interactions, context retrieval, tool calls, automated eval workflows, and production monitoring. That maps cleanly to AMC's baseline distribution, live sample, drift statistic, and alert receipt primitive.

This gap does not justify a Comet integration, Opik adapter, trace importer, online-evaluation runner, guardrail connector, Ollie workflow, Agent Playground clone, prompt optimizer, cost tracker, or source-specific Watch monitor. AMC closure is the generic proof boundary: Opik context is accepted only when AMC-owned baseline/live rows, signed evidence refs, drift statistics, and Watch alerts exist.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through baseline/live score distribution comparisons. |
| Shield | Relevant because missing evidence or unsupported safety/quality drift claims must fail closed. |
| Watch | Relevant through existing live score and behavior drift receipts and alert projection. |
| Enforce | Context only; no runtime guardrail or policy enforcement changed. |
| Vault | Not in scope; no trace store, PII, secret, or data-residency behavior changed. |
| Fleet | Agentic-system context only; no fleet orchestration or topology changed. |
| Passport | Not in scope; no portable proof-bundle field changed. |
| Comply | Governance and compliance context only; no compliance mapping changed. |

## Source signal

Live Opik evidence reviewed on 2026-06-22:

- The product page says Opik logs every step your agent takes, from user interactions to context retrieval and tool calls.
- It links those traces to automated eval workflows across development, testing, and production.
- The Trace & Debug Any Step section says teams can Capture, visualize, and understand every action, annotate and fix underperforming traces, and produce audit logs.
- The Evaluate Outcomes with LLM-as-a-Judge Metrics section references reference dataset or a plain-text assertion, surface errors out of thousands of traces, and Evaluate traces from development, testing, or production.
- The metrics list includes 30+ metrics for answer relevance, context precision, task completion, hallucination, and more.
- The Monitor Your Agents in Production section says teams can Evaluate production traces in real time and get alerted if a user interaction fails test criteria.
- The same section references Apply guardrails and protecting against PII exposure.
- The Opik Difference includes Test Suites & Assertions, Ollie, and Agent Playground.
- The Open Source & Ready to Run section references 19k GitHub stars.
- The docs page includes Log traces, Build test suites from your traces, and Track quality in production.
- The docs page says online evaluation rules can score incoming traces and monitor feedback scores, latency, cost, and error rates.

## Product closure

No product implementation module changed for this source. The existing AMC primitive is sufficient:

- `runLiveScoreBehaviorDrift` compares baseline distribution and live sample rows, computes drift statistics, and emits alert receipts.
- `verifyLiveDriftReceipt` validates the receipt.
- `buildLiveDriftWatchAlerts` projects Watch alerts from the receipt.
- The focused regression constructs Opik-context baseline/live windows and verifies that signed evidence, drift statistics, source refs, alert receipt, and Watch alerts are present, while metadata-only live rows fail closed.

## Fail-closed rule

Opik product-page, docs, trace, dataset, assertion, LLM-as-judge, metric, production-monitoring, online-evaluation, guardrail, PII, audit-log, Ollie, Agent Playground, prompt optimizer, test-suite, feedback, latency, cost, error-rate, or open-source metadata is rejected unless AMC has:

- baseline distribution;
- live sample;
- drift statistic;
- behavior signature comparison;
- source refs;
- evidence refs;
- signed evidence refs;
- receipt hash and receipt verification;
- alert receipt or waiver;
- CI/lifecycle gate proof.

## No-bloat boundary

AMC did not add a Comet integration, Opik adapter, trace importer, online-evaluation runner, guardrail connector, Ollie workflow, Agent Playground clone, prompt optimizer, cost tracker, audit-log importer, dataset importer, source-specific Watch monitor, Shield verifier, API route, CLI command, Studio panel, Passport field, methodology version bump, package dependency, copied docs prose, screenshots, examples, configs, traces, prompts, datasets, benchmark rows, model outputs, or generated outputs.

## Verification

- `npx vitest run tests/gap0948CometOpikLiveDriftBoundary.test.ts --reporter=dot`: passed, 1 file / 4 tests.
- `npx vitest run tests/gap0947WandbWeaveLiveDriftBoundary.test.ts tests/gap0948CometOpikLiveDriftBoundary.test.ts --reporter=dot`: passed, 2 files / 8 tests.
- `git diff --check -- . ':(exclude)AMC_OS'`: passed.
- `npm run typecheck`: passed.
