# GAP-0010 - Galileo Studio evidence drilldown boundary

- Gap: `GAP-0010`
- Dimension: `obs-studio-drilldown`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://www.galileo.ai`, redirect/canonical page `https://galileo.ai/`, product page `https://galileo.ai/products`, Signals page `https://galileo.ai/signals`, Protect page `https://galileo.ai/protect`, docs index `https://docs.galileo.ai/what-is-galileo`, observability docs `https://docs.galileo.ai/concepts/logging/overview`, trace-evaluation guide `https://docs.galileo.ai/getting-started/evaluate-and-improve/evaluate-and-improve`, experiments docs `https://docs.galileo.ai/sdk-api/experiments/experiments`, compare-experiments docs `https://docs.galileo.ai/concepts/experiments/compare`, and Agent Control docs `https://docs.galileo.ai/concepts/agent-control/overview`
- Retrieval: `2026-06-25` via live Galileo homepage, product pages, and docs.
- Status: closed through existing Score/Watch Studio evidence drilldown receipts; no Galileo adapter, trace importer, experiment importer, guardrail importer, Agent Control integration, Signals integration, or source-specific Studio route added.
- Linear: `AMC-495`

## Live source metadata

The live Galileo homepage opens with Don't just monitor AI failures. Stop them. It describes Galileo as an AI observability and eval engineering platform where offline evals become production guardrails. The page also discusses datasets from synthetic, development, and live production data; RAG Evals, Agent Evals, Safety Evals, Security Evals, and Custom Evals; and an insights engine analyzes agent behavior to identify failure modes across models, prompts, functions, context, datasets, traces, and MCP server signals.

The homepage and product pages connect evaluation to production action. They name unit testing and CI/CD rigor, and state that Eval scores automatically control agent actions, tool access, and escalation paths. The platform page frames Galileo around evaluation, observability, real-time protection, offline and online measurement, traces, sessions, guardrail policies, alerting, metrics, prompt stores, datasets, annotations, root cause analysis, and custom dashboards.

The live docs page What Is Galileo? describes Galileo as an observability, evaluation, and production guardrail platform for GenAI and agentic applications. The observability docs describe sessions, traces, and spans, including LLM calls, tool calls, or a retrieval step. The trace-evaluation guide tells operators to Select the trace to drill down and use an explanation of the metric. The experiments docs describe experiment Log stream outputs, one trace per dataset row, and the ability to drill into each experiment. The compare-experiments docs describe metrics, inputs, and outputs and note that users can hover over a metric to see reasoning details.

Galileo's Agent Control docs describe a centralized safety layer for LLM and tool inputs and outputs, with audit-ready traces. The Signals page is headed Find issues after first signal and frames production trace analysis as a way to surface hidden failures. The Protect page says operators can Click any row to pivot deeper or export the evidence for audits, and names Root cause, in one click.

These facts are Studio drilldown context only. No Galileo product copy, docs examples, SDK/API snippets, guardrail configs, trace rows, metric explanations, experiment rows, screenshots, dashboards, product UI, datasets, prompts, generated outputs, or implementation details were copied into AMC.

## Relevance decision

GAP-0010 is relevant to AMC because Galileo's public product and docs describe the same operator need: open a finding, inspect trace context, compare evaluation output, view metric explanations, see guardrail actions, and export audit evidence. That maps directly to AMC's existing Studio evidence drilldown primitive: UI route, source artifact links, evidence preview, and empty/error states, plus trace preview, reasoning trace preview, receipt preview, source artifact preview, empty-state receipts, error-state receipts, signed evidence refs, accepted/rejected evidence, row hashes, and fail-closed response state.

It does not require a Galileo adapter, trace importer, evaluator runner, Signals clone, Protect clone, Agent Control integration, source-specific route, new API surface, scoring semantic change, methodology version bump, or package dependency. Galileo metadata can identify source context, but it cannot replace AMC-owned drilldown previews and receipts.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through score-finding drilldown output, accepted/rejected evidence preview, signed evidence, and fail-closed state. |
| Shield | Relevant because unsafe, hallucinated, or policy-risk findings must fail closed when trace/receipt/source-artifact/empty/error proof is missing. |
| Watch | Relevant through observability source links and Watch-side source artifact link projection into Score drilldowns. |
| Enforce | Agent Control and guardrail context only; no runtime policy, provider route, deployment gate, or circuit breaker changed. |
| Vault | No secure-storage, PII redaction, tenant isolation, or secret behavior changed. |
| Fleet | Agent behavior and MCP context only; no Fleet topology, routing, or orchestration behavior changed. |
| Passport | No portable trust token, badge, or proof-bundle schema changed. |
| Comply | Audit-export and trace context only; no compliance framework mapping changed. |

## Product closure

No `src/diagnostic/evidenceDrilldown.ts`, `src/watch/evidenceDrilldown.ts`, `src/console/assets/evidenceDrilldown.js`, `src/studio/openapi.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version, badge semantics, diagnostic question bank, Galileo adapter, trace importer, experiment importer, Agent Control integration, Signals integration, Protect integration, or source-specific implementation module changed for GAP-0010.

The focused regression exercises the existing `buildScoreEvidenceDrilldown` and `buildWatchObsStudioSourceArtifactLinks` paths. The positive path requires UI route, source artifact links, evidence preview, trace preview, receipt preview, empty/error states, signed evidence refs, accepted/rejected evidence, source refs, and a ready non-fail-closed response. The negative path fails closed when Galileo product metadata replaces AMC-owned evidence previews. A missing question receipt pack returns an explicit empty state.

## Fail-closed rule

Galileo name, product URLs, docs URLs, Signals labels, Protect labels, Agent Control labels, RAG Evals labels, Agent Evals labels, Safety Evals labels, Security Evals labels, Custom Evals labels, insights-engine labels, CI/CD labels, guardrail labels, trace/session/span labels, metric-explanation labels, experiment-comparison labels, MCP labels, audit-export labels, product screenshots, product examples, or local backlog metadata must fail closed as Studio evidence drilldown proof.

Passing evidence requires AMC-owned UI route, source artifact links, trace preview, reasoning trace preview, receipt preview, evidence preview, source artifact preview, empty-state receipts, error-state receipts, signed evidence refs, accepted/rejected evidence, row hashes, and explicit repair guidance.

## No-bloat boundary

No Galileo adapter, Galileo SDK wrapper, Galileo API client, trace importer, metric importer, experiment importer, dataset importer, guardrail importer, Agent Control integration, Signals integration, Protect integration, Luna model wrapper, dashboard clone, alert connector, MCP connector, source-specific Studio route, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, badge migration, diagnostic question-bank migration, package dependency, source-specific metric lens, or source-specific scoring path was added.

No Galileo product copy, docs examples, SDK/API snippets, trace rows, metric explanations, experiment rows, guardrail configs, screenshots, dashboards, product UI, datasets, prompts, generated outputs, model responses, or implementation details were copied.

## Verification

- TDD guard: `npx vitest run tests/gap0010GalileoStudioDrilldownBoundary.test.ts --reporter=dot` failed before this source-review document existed, with only the missing doc assertion failing and the four Studio drilldown behavior checks already passing.
- Focused regression: `npx vitest run tests/gap0010GalileoStudioDrilldownBoundary.test.ts --reporter=dot` - 1 file / 5 tests passed.
- Paired Studio drilldown regression: `npx vitest run tests/gap0010GalileoStudioDrilldownBoundary.test.ts tests/evidenceDrilldown.test.ts tests/apiRouters.test.ts tests/gap0943BraintrustStudioDrilldownBoundary.test.ts tests/gap0958LaminarStudioDrilldownBoundary.test.ts tests/gap0962CometOpikStudioDrilldownBoundary.test.ts tests/gap0979HeliconeStudioDrilldownBoundary.test.ts --reporter=dot` - 7 files / 56 tests passed.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` - passed.
- Typecheck: `npm run typecheck` - passed.
- Full suite: `npm test -- --reporter=dot` - 938 files / 7,742 tests passed.
