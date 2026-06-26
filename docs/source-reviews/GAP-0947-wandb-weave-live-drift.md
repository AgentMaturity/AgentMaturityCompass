# GAP-0947 — W&B Weave live drift

- Gap: `GAP-0947`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: Weights & Biases Weave homepage and public docs
- Retrieval: live Weave homepage at `https://wandb.ai/site/weave`, redirected canonical page `https://wandb.ai/site/weave/`; docs reviewed at `https://docs.wandb.ai/weave`
- Status: Done

## Relevance decision

Relevant, but only through AMC's existing Watch live score and behavior drift receipt path. The live Weave homepage frames the product as "Observability and continuous improvement for production agents" and says production agents learn and improve from real-world experience. That maps to AMC's existing need to compare baseline distribution, live sample, drift statistic, and alert receipt before accepting live Score, Shield, or Watch claims.

This gap does not justify a W&B integration, Weave adapter, trace importer, monitor connector, Slack/webhook automation, MCP client, guardrail scorer, Playground integration, leaderboard importer, or source-specific Watch monitor. AMC closure is the generic proof boundary: Weave context is accepted only when AMC-owned baseline/live rows, signed evidence refs, drift statistics, and Watch alerts exist.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through baseline/live score distribution comparisons. |
| Shield | Relevant because missing evidence or unsupported safety/quality drift claims must fail closed. |
| Watch | Relevant through existing live score and behavior drift receipts and alert projection. |
| Enforce | Context only; no runtime policy or action control changed. |
| Vault | Not in scope; no trace store, secret, PII, or data-residency behavior changed. |
| Fleet | Multi-agent context only; no orchestration or trust topology changed. |
| Passport | Not in scope; no portable proof-bundle field changed. |
| Comply | Not in scope; no compliance mapping changed. |

## Source signal

Live Weave evidence reviewed on 2026-06-22:

- The homepage describes end-to-end observability, out-of-the-box signals, and a flexible evaluation framework that can prevent regressions.
- It includes Behavior monitoring with out-of-box signals and says monitoring millions of incoming traces manually is not practical.
- It states that Alerts route what matters through Slack notifications and trigger webhook automations.
- It describes sessions and turns for multi-turn, multi-agent systems.
- The Agent-native tracing section names sessions, turns, steps, tools, and sub-agents.
- The evaluation section says teams can Measure every improvement and catch regressions before they reach users.
- The autonomous-improvement section mentions the MCP server, that agents can read live production data, and that they can run evaluations.
- The Playground section says teams can test new LLMs and custom models against production traces.
- Guardrails text says Safety scorers include toxicity, bias, PII detection, and hallucinations.
- Product links include Traces, Evaluations, and Monitors.
- The docs page includes Quickstart: Trace an agent, Evaluate your agents and applications, Monitor and collect feedback, and LLM judges and custom scorers.

## Product closure

No product implementation module changed for this source. The existing AMC primitive is sufficient:

- `runLiveScoreBehaviorDrift` compares baseline distribution and live sample rows, computes drift statistics, and emits alert receipts.
- `verifyLiveDriftReceipt` validates the receipt.
- `buildLiveDriftWatchAlerts` projects Watch alerts from the receipt.
- The focused regression constructs Weave-context baseline/live windows and verifies that signed evidence, drift statistics, source refs, alert receipt, and Watch alerts are present, while metadata-only live rows fail closed.

## Fail-closed rule

Weave product-page, docs, trace, session, turn, step, tool, sub-agent, Slack, webhook, signal, evaluation, regression, MCP, Playground, guardrail, safety scorer, toxicity, bias, PII, hallucination, monitor, LLM judge, custom scorer, or production-observability metadata is rejected unless AMC has:

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

AMC did not add a W&B integration, Weave adapter, trace importer, monitor connector, Slack automation, webhook automation, MCP client, Playground integration, guardrail scorer, leaderboard importer, W&B API client, production data reader, source-specific Watch monitor, Shield verifier, API route, CLI command, Studio panel, Passport field, methodology version bump, package dependency, copied docs prose, screenshots, examples, configs, traces, prompts, datasets, benchmark rows, model outputs, or generated outputs.

## Verification

- `npx vitest run tests/gap0947WandbWeaveLiveDriftBoundary.test.ts --reporter=dot`: passed, 1 file / 4 tests.
- `npx vitest run tests/gap0946GalileoReplayCorpusBoundary.test.ts tests/gap0947WandbWeaveLiveDriftBoundary.test.ts --reporter=dot`: passed, 2 files / 8 tests.
- `git diff --check -- . ':(exclude)AMC_OS'`: passed.
- `npm run typecheck`: passed.
