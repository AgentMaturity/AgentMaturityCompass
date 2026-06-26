# GAP-3758 - Arthur AI incident-to-regression boundary

- Gap: `GAP-3758`
- Dimension: `security-incident-regression`
- AMC surfaces requested: Watch, Studio, API
- Source reviewed: `https://www.arthur.ai`, `https://www.arthur.ai/platform`, `https://www.arthur.ai/ai-performance-eval`, `https://www.arthur.ai/column/evaluating-ai-agents-in-production`, `https://docs.arthur.ai/docs/overview`, `https://github.com/arthur-ai/arthur-engine`, `https://api.github.com/repos/arthur-ai/arthur-engine`, and `https://raw.githubusercontent.com/arthur-ai/arthur-engine/main/README.md`
- Retrieval: live homepage, platform page, performance-eval page, production-agent evaluation article, docs overview, GitHub repository, GitHub API, and raw README checks on 2026-06-26.
- Status: closed through a generic AMC incident-to-regression receipt builder; no Arthur integration, importer, SDK wrapper, trace collector, guardrail adapter, dashboard clone, or source-specific route added.

## Live source metadata

The backlog identifies Arthur AI as source `GAP-3758`, category `Observability, monitoring, and traces`, dimension `Incident-to-regression pipeline`, and requested Watch, Studio, and API surfaces. The acceptance line requires `Incident trace, generated test, validation run, and closure status`.

Live retrieval on 2026-06-26 verified:

- Homepage `https://www.arthur.ai` returned HTTP 200, 107,230 bytes, first-200KB hash `0c4dced293cf3fe0d4560d3332b7bc2eb67a2bd1d0a8de74357766b8a287f765`, and contained reviewed metadata phrases including `Ship Reliable AI Agents Fast`, `Agentic Observability and Evaluation`, `AI Performance Evaluation`, `Built-in Guardrails`, `continuous evals`, `monitoring`, `guardrails`, and `performance`.
- Platform page `https://www.arthur.ai/platform` returned HTTP 200, 129,744 bytes, first-200KB hash `f54b35f8c1b92837415d03ee1d61a7e091131abc2d87facfa526577aef40696f`, and contained reviewed metadata phrases including `AI Delivery Engine`, `Launch, Secure & Optimize AI`, `Agentic Observability and Evaluation`, `AI Performance Evaluation`, `Built-in Guardrails`, `continuous evaluation`, `alerts`, `traces`, `regression`, `OpenTelemetry`, `Monitoring across the entire AI lifecycle`, and `Trace Visualization & Analysis`.
- Performance-eval page `https://www.arthur.ai/ai-performance-eval` returned HTTP 200, 91,255 bytes, first-200KB hash `61a8aa35a84a41691a91adcf20b22a2308042192c90bd1f9dd65b10b4f3dda5e`, and contained reviewed metadata phrases including `Continuous AI Evaluation`, `Continuous AI Evaluation & Monitoring`, `continuous evals`, `monitoring`, `guardrails`, `alerts`, and `performance`.
- Production-agent evaluation article `https://www.arthur.ai/column/evaluating-ai-agents-in-production` returned HTTP 200, 83,624 bytes, first-200KB hash `b6bfcd3d25acfbf4693441f260a1731005f00d9ea98abe9e3dffd58a15b6c643`, and contained reviewed metadata phrases including `Evaluating AI Agents in Production`, `continuous evaluation`, `continuous evals`, `alerts`, `traces`, `regression`, `production failures`, `OpenTelemetry`, `OpenInference`, `guardrails`, and `performance`.
- Docs overview `https://docs.arthur.ai/docs/overview` returned HTTP 200, 228,853 bytes, first-200KB hash `a26649372b353d1f8ed10746fafd94d72898fe6ecd56f64665822f7a39036cc4`, and contained reviewed metadata phrases including `What Is Arthur AI?`, `monitoring`, `evaluating`, `governing`, `guardrails`, `continuous evals`, `alerts`, `traces`, `regression`, and `performance`.
- GitHub repository `https://github.com/arthur-ai/arthur-engine` returned HTTP 200, 338,109 bytes, first-200KB hash `698808462c75990d023d8bd01712d0a8c98541e13ae6e9fd1f5f04b5ea4c6ea8`, and contained reviewed metadata phrases including `Monitoring and governing for your AI/ML`, `guardrails`, `continuous evaluation`, `alerts`, `traces`, `regression`, `OpenTelemetry`, `OpenInference`, `performance`, and `quality issues`.
- Repository API `https://api.github.com/repos/arthur-ai/arthur-engine` returned HTTP 200, first-200KB hash `e7ae6e5e329ab3242d3cafcf3b737ab67b594df8bbbed0e4068e064ac487d3f1`, full name `arthur-ai/arthur-engine`, default_branch `dev`, license `MIT`, language `Python`, 82 stars, 12 forks, 39 open issues, pushed_at `2026-06-26T04:56:37Z`, updated_at `2026-06-26T04:56:40Z`, archived `false`, disabled `false`, description `Make AI work for Everyone - Monitoring and governing for your AI/ML`, and topics including agentic, benchmarking, evaluation, genai, guardrails, llm, ml, monitoring, and tracing.
- Raw README `https://raw.githubusercontent.com/arthur-ai/arthur-engine/main/README.md` returned HTTP 200, 7,604 bytes, first-200KB hash `aa7011e234179a474d68f9ced2a65a2d192699f44d2d8d01ffeed34779183b03`, and contained reviewed metadata phrases including `Make AI work for Everyone`, `monitoring`, `evaluating`, `governing`, `guardrails`, `continuous evaluation`, `traces`, `regression`, `OpenTelemetry`, `OpenInference`, `performance`, and `quality issues`.

These facts are relevant as production AI monitoring, evaluation, tracing, alerting, guardrail, and regression context only. They do not provide AMC incident-closure proof.

## Relevance decision

GAP-3758 is relevant to AMC because a known production incident should not close until it creates a future safeguard. The source reinforces the same operating need: AI agent observability, continuous evaluation, trace review, guardrails, alerts, and production failure analysis.

The accepted AMC primitive is a generic incident-to-regression receipt. Closure now requires AMC-owned incident trace rows, generated regression-test receipts, passing validation-run receipts, and closure evidence. Arthur AI is source-review context only. It does not justify importing Arthur traces, calling Arthur APIs, mirroring Arthur dashboards, or copying Arthur guardrail behavior.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant when incidents explain score regressions and generated tests become score evidence; no scoring methodology version changed. |
| Shield | Relevant when risk events or guardrail misses become regression safeguards. |
| Enforce | Context only; no runtime policy engine, block action, or circuit breaker changed. |
| Vault | Context only; no secrets, DLP, privacy, residency, or secure-storage behavior changed. |
| Watch | Primary surface; receipts index traces by failure mode, risk event, prompt/tool boundary, latency, cost, remediation state, and evidence refs. |
| Fleet | Relevant downstream because incident receipts can be attached to agent-level operations; no Fleet schema changed. |
| Passport | Downstream proof-bundle context only; no Passport token or public proof schema changed. |
| Comply | Audit context only; no compliance mapping or framework control changed. |

## Product closure

Added generic AMC incident-regression primitives:

- `buildIncidentRegressionReceipt`
- `buildIncidentRegressionWatchAlerts`

The receipt binds Watch, Studio, and API surfaces by producing a trace search index, failure clusters, live risk/cost/latency trends, generated-test receipts, validation-run receipts, computed closure status, fail-closed reasons, and a receipt hash. It is not Arthur-specific.

Added focused regression `tests/gap3758ArthurIncidentRegressionBoundary.test.ts`.

The positive path proves incident traces must become generated regression tests and passing validation runs before closure is ready. The negative paths fail closed when Arthur metadata replaces incident traces, generated tests, validation runs, or closure evidence, and when a generated test has only a failed validation run.

## Fail-closed rule

Arthur AI source identity, homepage metadata, platform metadata, performance-eval metadata, production-agent article metadata, docs metadata, GitHub repository metadata, README metadata, license metadata, stars, forks, topics, default branch, monitoring labels, guardrail labels, tracing labels, alert labels, OpenTelemetry labels, OpenInference labels, continuous-eval labels, regression labels, production-failure labels, local backlog metadata, or source identity alone must fail closed for incident-regression closure proof.

Passing proof requires AMC-owned incident trace rows, trace row hashes, evidence refs, generated regression-test receipts, test hashes, validation-run receipts, passing validation status, run hashes, closure evidence refs, computed closure status, Watch alert projection for blocked closure, receipt hash, and no-copy proof.

## No-bloat boundary

No Arthur adapter, Arthur SDK wrapper, Arthur API client, trace importer, guardrail importer, evaluator importer, alert importer, OpenTelemetry collector, OpenInference collector, dashboard clone, source-specific Watch monitor, source-specific Studio panel, source-specific API route, CLI command, Fleet migration, Passport field, methodology bump, package dependency, or source-specific scoring path was added.

No upstream code, docs prose beyond short metadata phrases, README prose beyond short metadata phrases, examples, configs, screenshots, traces, alerts, eval rows, guardrail rules, generated outputs, or implementation details were copied into AMC.

## Verification

- Expected-red focused test: `npx vitest run tests/gap3758ArthurIncidentRegressionBoundary.test.ts --reporter=dot` failed because `src/incidents/incidentRegression.ts` did not exist.
- Focused test after implementation: `npx vitest run tests/gap3758ArthurIncidentRegressionBoundary.test.ts --reporter=dot`
- Paired incident/watch regression: `npx vitest run tests/gap3758ArthurIncidentRegressionBoundary.test.ts tests/incidentsSubsystem.test.ts tests/incidentsStore.test.ts tests/traceFailureIndex.test.ts tests/gap3748LangtraceTraceFailureTaxonomyBoundary.test.ts tests/gap3752OpenTelemetryGenAiRiskCostLatencySloBoundary.test.ts --reporter=dot`
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot`
