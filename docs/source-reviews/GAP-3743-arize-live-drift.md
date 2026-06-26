# GAP-3743 - Arize AI live-drift boundary

- Gap: `GAP-3743`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Watch, Studio, API
- Source reviewed: `https://arize.com/`, `https://arize.com/model-monitoring/`, `https://arize.com/docs/ax/machine-learning/machine-learning/how-to-ml/monitors/choosing-your-metrics`, `https://arize.com/docs/ax/machine-learning/machine-learning/how-to-ml/monitors/configure-monitors/notifications-and-integrations`, and `https://arize.com/blog/llm-observability-for-ai-agents-and-applications/`
- Retrieval: live official Arize page checks on 2026-06-26.
- Status: closed through AMC's existing Watch live score and behavior drift receipts; no Arize integration, connector, importer, dashboard clone, or monitor bridge added.

## Live source metadata

The backlog identifies `Arize AI` as source `GAP-3743`, category `Observability, monitoring, and traces`, dimension `Live score and behavior drift alerts`, and requested Watch, Studio, and API surfaces.

Live retrieval on 2026-06-26 verified:

- Homepage `https://arize.com/` returned HTTP 200, 302,045 bytes, first-200KB hash `ba4cdf6e1872dbcd212abb9cc54b425405385c24ed85c9682908c25caeb65dd9`, and official product phrases including `The continual learning platform for agents`, `Trace. Eval. Learn.`, Agent Observability, Evaluation, Traces, span, trace, and session evals, OpenInference, OpenTelemetry, production performance, and 40+ models.
- Model monitoring page `https://arize.com/model-monitoring/` returned HTTP 200, 234,165 bytes, first-200KB hash `2ff68ecfa20e4e0f3e70537312f4211d6dbeddde4b5899b1f68d5f79f643ee85`.
- Monitor metric docs `https://arize.com/docs/ax/machine-learning/machine-learning/how-to-ml/monitors/choosing-your-metrics` returned HTTP 200, 835,044 bytes, first-200KB hash `f4a92788544cbc5852722438bc70d07b8e8b061c03dcb077e2e5ed833119d8ac`, and official phrases including automatically detect drift, anomalous performance degradations, Performance Metrics, Drift Metrics, prediction drift, unexpected changes, and drops in performance.
- Notification docs `https://arize.com/docs/ax/machine-learning/machine-learning/how-to-ml/monitors/configure-monitors/notifications-and-integrations` returned HTTP 200, 825,003 bytes, first-200KB hash `2f2a8ea8b89d62ba82bba72130f3cb88ed1ac4d2f01c4485f1282f8c9553c5a3`, and official phrases including monitors fire when a model metric crosses a threshold, Triggered, No Data, Email, Slack, OpsGenie, PagerDuty, Webhooks, continuously send your model, and drift and performance troubleshooting.
- LLM observability article `https://arize.com/blog/llm-observability-for-ai-agents-and-applications/` returned HTTP 200, 251,470 bytes, first-200KB hash `a841e535aab854cd48a75420738908d7df9dd2384184539f4ef5d8ca424ba705`, and official phrases including LLM Observability, AI Agents and Applications, traces, LLM calls, evaluations, OpenInference, OpenTelemetry, production, latency, cost, retrieval, hallucination, tool calling, and session-level evaluations.

These facts are relevant as competitor observability, production monitoring, trace, evaluation, drift, alert, and notification context only. They do not provide AMC live-drift evidence.

## Relevance decision

GAP-3743 is relevant to AMC because production agents can degrade after traffic, provider, prompt, policy, tool, data, or routing changes. A credible AMC claim must compare a baseline distribution to a live sample, compute a drift statistic, emit an alert receipt, and bind the result to signed evidence.

Arize AI is a useful competitor signal because its official pages emphasize agent observability, traces, evaluations, model monitoring, drift metrics, performance degradation detection, threshold-triggered monitors, Slack/PagerDuty/Webhook notifications, OpenInference, OpenTelemetry, latency, cost, and session-level evaluations. AMC should not copy or mirror Arize. The accepted AMC primitive is the existing source-independent `runLiveScoreBehaviorDrift` path with Watch alert projection.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing baseline/live score distributions tied to signed row evidence. |
| Shield | Relevant only when behavior drift affects safety, refusal, unsupported-action, error, or policy-relevant metrics with signed evidence. |
| Enforce | Context only; no guardrail or policy enforcement rule changed. |
| Vault | Context only; no storage, DLP, secret, or residency rule changed. |
| Watch | Primary surface; existing live score and behavior drift receipts emit baseline/live drift statistics, alert receipts, and Watch alerts. |
| Fleet | Context only; no orchestration topology changed. |
| Passport | Context only; no proof-bundle schema changed. |
| Comply | Context only; no compliance mapping changed. |

## Product closure

No product code change was required for GAP-3743. AMC already has the generic Watch primitive for this gap:

- `runLiveScoreBehaviorDrift`
- `verifyLiveDriftReceipt`
- `buildLiveDriftWatchAlerts`

Added focused regression `tests/gap3743ArizeLiveDriftBoundary.test.ts`.

The positive path proves that Arize-style competitor context can be cited only with AMC-owned baseline rows, live rows, behavior signatures, source refs, signed evidence refs, drift statistics, and Watch alert projection. The negative path proves competitor metadata fails closed when live rows lack signed evidence.

No Arize-specific product code, route, schema, UI, connector, importer, alert bridge, or monitor bridge was added.

## Fail-closed rule

Arize homepage, model monitoring page, monitor metric docs, notification docs, LLM observability article, product slogans, competitor identity, Agent Observability label, Evaluation label, Trace. Eval. Learn. label, production signals label, model monitoring label, automatically detect drift label, anomalous performance degradation label, Performance Metrics label, Drift Metrics label, Triggered label, No Data label, Slack label, PagerDuty label, Webhooks label, LLM Observability label, AI Agents and Applications label, OpenInference label, OpenTelemetry label, latency label, cost label, session-level evaluations label, local backlog metadata, or source identity alone must fail closed for live score and behavior drift claims.

Passing evidence requires AMC-owned baseline distribution, live sample rows, score distributions, behavior signatures, drift statistic, alert receipt, source refs, receipt hash, signed evidence refs, row hashes, Watch alert or waiver proof, and no-copy proof.

## No-bloat boundary

No Arize adapter, API client, SDK wrapper, repository importer, monitor importer, trace importer, OpenInference bridge, OpenTelemetry bridge, Phoenix bridge, dashboard clone, alert notification integration, Slack integration, PagerDuty integration, OpsGenie integration, webhook integration, model-monitoring clone, metric catalog clone, LLM-observability clone, source-specific Watch monitor, API/CLI route, Studio panel, Passport schema change, methodology bump, provider parity claim, or source-specific scoring path was added.

No upstream code, page prose beyond short metadata phrases, docs prose, screenshots, configs, examples, dashboards, metric definitions, alert examples, trace examples, notification examples, prompts, datasets, generated outputs, or implementation details were copied into AMC.

## Verification

- Expected-red focused test: `npx vitest run tests/gap3743ArizeLiveDriftBoundary.test.ts --reporter=dot` failed because this source-review doc did not exist; 3 live-drift/no-bloat tests passed.
- Focused test after doc: `npx vitest run tests/gap3743ArizeLiveDriftBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired live-drift regression: `npx vitest run tests/gap3743ArizeLiveDriftBoundary.test.ts tests/gap0019HumanloopLiveDriftBoundary.test.ts tests/gap0023LiteralAiLiveDriftBoundary.test.ts tests/liveDriftAlerts.test.ts --reporter=dot` passed, 4 files / 93 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 1026 files / 8120 tests.
