# GAP-0962 - Comet Opik Studio drilldown boundary

- Gap: `GAP-0962`
- Dimension: `obs-studio-drilldown`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/comet-ml/opik`, `https://www.comet.com/site/products/opik/`, `https://www.comet.com/docs/opik/`
- Retrieval: `2026-06-22` via live GitHub repository page, live Opik product page, and live Opik documentation index.
- Status: closed through existing Score/Watch Studio evidence drilldown receipts; no Comet integration, Opik adapter, trace importer, dashboard clone, SDK wrapper, agent optimizer, Ollie harness, guardrail connector, or source-specific Studio route added.

## Live source metadata

The live GitHub repository page for `comet-ml/opik` identifies the repository as public and describes Opik as helping teams debug, evaluate, and monitor LLM applications, RAG systems, and agentic workflows with comprehensive tracing, automated evaluations, and production-ready dashboards. The repository page shows Star 19.7k, Fork 1.5k, Issues 89, Pull requests 35, 6,152 Commits, README, contributing files, and Apache-2.0 license metadata.

The README section describes `Open-source AI Observability, Evaluation, and Optimization` and says Opik supports comprehensive tracing, evaluation, prompt/tool optimization, RAG chatbots, code assistants, and complex agentic systems. It also describes comprehensive observability, advanced evaluation, production-ready dashboards, online evaluation rules, Opik Agent Optimizer, and Opik Guardrails.

The live product page frames Opik around understanding what an agent is doing, where it is failing, and how to fix it. It includes Trace & Debug Any Step, Capture, visualize, and understand every action, annotate and fix underperforming traces, audit logs, Evaluate Outcomes with LLM-as-a-Judge Metrics, reference dataset or a plain-text assertion, errors out of thousands of traces, 30+ metrics for answer relevance, context precision, task completion, hallucination, Monitor Your Agents in Production, Evaluate production traces in real time, Apply guardrails, PII exposure, token usage, model cost, Track & Optimize Coding Agent Spend, Claude Code and Codex, MCP installs, skills, model selection, context retrieval, configurations, Test Suites, Ollie, and Agent Playground.

The live docs index includes Agent playground, Prompt playground, Optimization Studio, Datasets & Experiments, Online Evaluation rules, Gateway, Guardrails, Anonymizers, Alerts, SAML SSO, OIDC SSO, JWT Authentication, Python SDK, TypeScript SDK, local development, integrations, metrics, agent task completion, agent tool correctness, trajectory accuracy, and related evaluation/observability pages.

These facts are Studio drilldown context only. No Opik repository code, README prose beyond minimal metadata facts, docs prose, SDK snippets, install commands, trace rows, dashboard screenshots, prompt examples, evaluation examples, guardrail configs, optimizer content, pricing content, generated outputs, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC because GAP-0962 asks for Studio evidence drilldown: operators should open a score finding and drill into traces, receipts, policy rules, and source artifacts. Opik's public material emphasizes tracing, debugging, evaluation, production monitoring, guardrails, cost tracking, test suites, and agent playground workflows. Those map to AMC's existing Studio drilldown primitive: UI route, source artifact links, evidence preview, trace preview, receipt preview, source artifact preview, empty-state receipts, error-state receipts, signed evidence refs, accepted/rejected evidence, and fail-closed response state.

The source does not require a Comet integration, Opik adapter, trace importer, OpenTelemetry connector, dashboard clone, SDK wrapper, CLI command, Ollie harness, Agent Playground clone, guardrail connector, optimizer runner, dataset importer, test-suite importer, source-specific Studio route, API route, Watch monitor, Shield verifier, public methodology version bump, or package dependency. Opik metadata can label source links, but it cannot replace AMC-owned drilldown previews and receipts.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through score-finding drilldown output, receipt preview, signed evidence, and fail-closed evidence preview state. |
| Shield | Relevant because unsupported observability/drilldown claims fail closed when signed evidence and rejected-evidence reasons are missing. |
| Watch | Relevant through Watch-side source artifact links projected into Score evidence drilldowns. |
| Enforce | Guardrail context only; no runtime policy, action blocking, or circuit breaker changed. |
| Vault | PII/security context only; no secure-storage, DLP, secret, or data-retention behavior changed. |
| Fleet | Agentic workflow context only; no Fleet orchestration or trust topology changed. |
| Passport | Existing drilldown receipts may feed proof bundles, but no Passport schema changed. |
| Comply | Audit log, SSO, and compliance-risk context only; no compliance mapping changed. |

## Product closure

No product code changed for GAP-0962. The focused regression exercises existing `buildScoreEvidenceDrilldown` and `buildWatchObsStudioSourceArtifactLinks` behavior. The required Studio evidence drilldown proof remains UI route, source artifact links, evidence preview, and empty/error states.

The positive path proves Opik source context can be cited only when AMC-owned Score drilldown rows include UI route, source artifact links, evidence preview, trace preview, reasoning trace preview, receipt preview, source artifact preview, empty-state receipts, error-state receipts, signed evidence refs, accepted evidence, rejected evidence, row hash, and repair guidance. The negative path fails closed when Opik GitHub/product/docs metadata replaces drilldown evidence previews.

## Fail-closed rule

GitHub repository identity, Star 19.7k, Fork 1.5k, Issues 89, Pull requests 35, 6,152 Commits, Apache-2.0 license, README, product page, docs index, Open-source AI Observability, Evaluation, and Optimization, comprehensive tracing, automated evaluations, production-ready dashboards, Trace & Debug Any Step, Capture/visualize/understand labels, annotate/fix labels, audit logs, LLM-as-a-Judge Metrics, reference dataset, plain-text assertion, 30+ metrics, answer relevance, context precision, task completion, hallucination, production monitoring, guardrails, PII exposure, cost tracking, Claude Code and Codex labels, MCP installs, Test Suites, Ollie, Agent Playground, Prompt playground, Optimization Studio, Datasets & Experiments, Online Evaluation rules, Gateway, Guardrails, Anonymizers, Alerts, SSO/JWT metadata, local backlog metadata, or source identity alone must fail closed as Studio evidence drilldown proof.

Passing proof requires AMC-owned UI route, source artifact links, evidence preview, trace preview, reasoning trace preview, receipt preview, source artifact preview, empty-state receipts, error-state receipts, signed evidence refs, accepted/rejected evidence, row hashes, and explicit repair guidance.

## No-bloat boundary

No Comet integration, Opik adapter, SDK wrapper, OpenTelemetry connector, trace importer, log importer, dashboard clone, prompt playground clone, Agent Playground clone, Ollie harness, optimizer runner, guardrail connector, anonymizer integration, alert connector, dataset importer, test-suite importer, code-assistant cost tracker, MCP scanner, source-specific Studio route, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, public methodology version bump, badge migration, package dependency, source-specific metric lens, or source-specific scoring path was added.

No Opik repository code, README prose beyond minimal metadata facts, docs prose, SDK snippets, install commands, trace rows, dashboard screenshots, prompt examples, evaluation examples, guardrail configs, optimizer content, pricing content, generated outputs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0962CometOpikStudioDrilldownBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired regression: `npx vitest run tests/gap0961AutoMlPipelineProviderDriftBoundary.test.ts tests/gap0962CometOpikStudioDrilldownBoundary.test.ts --reporter=dot` passed, 2 files / 8 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
