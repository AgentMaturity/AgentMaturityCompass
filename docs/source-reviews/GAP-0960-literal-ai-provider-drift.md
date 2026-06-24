# GAP-0960 - Literal AI provider-drift boundary

- Gap: `GAP-0960`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://literalai.com`, `https://docs.literalai.com`, `https://docs.literalai.com/more/migration-guide`, `https://docs.literalai.com/guides/logs`, `https://docs.literalai.com/guides/monitoring`, `https://docs.literalai.com/guides/dataset`, `https://docs.literalai.com/guides/evaluation`
- Retrieval: `2026-06-22` via live Literal AI homepage and documentation pages.
- Status: closed through existing provider/model drift benchmark receipts; no Literal AI integration, migration tool, data exporter, SDK wrapper, GraphQL adapter, provider wrapper, dashboard clone, or source-specific provider-drift path added.

## Live source metadata

The live Literal AI homepage identifies the product as `Literal AI - RAG LLM observability and evaluation platform` and uses the heading `Ship reliable LLM Products`. It describes a product spanning evaluation to prompt management and lists production AI pain points including Prompt Regressions, LLM Switching Cost, Dataset Cold Start, Multi-Step Debugging, and Data Drift.

The homepage presents Logs & Traces, Monitoring, Dataset, Experiments, Evaluation, Prompt Management, and Human Review as lifecycle features. It also describes Self-Hostable deployments and a Python SDK, TypeScript SDK, GraphQL API integration surface.

The current docs landing route redirects to the migration guide. The migration guide says `Literal AI will be discontinued`, with service availability until `October 31st, 2025`. It also instructs users to export all your data and names datasets, experiments, prompts, threads, messages, generations, prompt templates, and evaluation results as migration/export concerns.

The logs guide says logs are used to monitor and improve an LLM app in production and describes Generation, Step, Run, and Thread logging levels. It also covers Log to a Specific Environment, Log with a Release, and Add a Score. The monitoring guide describes Volume Metrics, Latency Metrics, AI Performance Evaluations, Cost Tracking, and log filtering by date, conversation ID, or AI eval results. The dataset guide describes input/expected output samples for experiments and non regression tests, including Key-Value and Generation dataset types. The evaluation guide positions evaluation as part of continuous deployment and names LLM Generation, Agent Run, Conversation Thread, context relevancy, faithfulness, answer relevancy, and LLM-as-a-Judge evaluation context.

These facts are useful provider/model drift context only. No Literal AI docs prose, code examples, SDK snippets, GraphQL examples, API details, export instructions, dataset rows, score examples, prompt templates, screenshots, migration content, pricing rows, testimonials, generated outputs, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC because Literal AI's public material describes the same operational failure modes that provider/model drift can expose: prompt regressions, model/provider switching, data drift, production monitoring, online evaluation, logs, scores, cost, latency, datasets, and release/environment separation.

The source is also discontinued according to its own docs, so it cannot justify a Literal AI integration or a live product dependency. The only acceptable closure is AMC's existing provider/model drift benchmark primitive: provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, row hashes, and CI or lifecycle gate proof.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through provider-drift score distribution canaries, metric counts, eval-pack rows, and score movement thresholds. |
| Shield | Relevant because source metadata and discontinued-service claims must fail closed unless signed provider-drift evidence exists. |
| Watch | Relevant through drift statistics, Watch alert projection, alert or waiver proof, and CI/lifecycle gate evidence. |
| Enforce | No runtime guardrail, policy enforcement, or circuit breaker changed. |
| Vault | Export/privacy context only; no secure-storage, DLP, secret, or data-retention behavior changed. |
| Fleet | Agent-run logging context only; no Fleet orchestration or trust topology changed. |
| Passport | Existing provider-drift receipts may feed proof bundles, but no Passport schema changed. |
| Comply | Migration/export/security context only; no compliance control mapping changed. |

## Product closure

No product code changed for GAP-0960. The focused regression exercises existing `runProviderDriftBenchmark`, `buildProviderDriftEvalPack`, `buildProviderDriftWatchAlerts`, and `buildProviderDriftCiGate` behavior.

The positive path proves Literal-style LLMOps context can be cited only when AMC-owned canary rows include provider version, canary results, drift statistic inputs, evaluator config hash, generated test-data hash, trace export hash, metric report hash, signed evidence refs, source refs, replayable eval-pack rows, row hashes, Watch alert projection, and CI gate proof. The negative path fails closed when Literal AI homepage/docs/migration/evaluation metadata replaces signed provider-drift evidence.

## Fail-closed rule

Literal AI name, homepage, docs, migration guide, discontinued-service notice, October 31st, 2025 service date, Ship reliable LLM Products heading, evaluation/prompt-management claims, Prompt Regressions, LLM Switching Cost, Dataset Cold Start, Multi-Step Debugging, Data Drift, Logs & Traces, Monitoring, Dataset, Experiments, Evaluation, Prompt Management, Human Review, Self-Hostable deployment, Python SDK, TypeScript SDK, GraphQL API, environment logging, release logging, scores, Volume Metrics, Latency Metrics, AI Performance Evaluations, Cost Tracking, non regression tests, Key-Value datasets, Generation datasets, continuous deployment, LLM Generation, Agent Run, Conversation Thread, context relevancy, faithfulness, answer relevancy, LLM-as-a-Judge, local backlog metadata, or source identity alone must fail closed.

Passing evidence requires AMC-owned provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, row hashes, and CI or lifecycle gate proof.

## No-bloat boundary

No Literal AI integration, Literal AI SDK wrapper, GraphQL adapter, migration tool, export importer, dataset importer, prompt importer, score importer, log importer, trace importer, dashboard clone, provider wrapper, self-host deployment profile, source-specific benchmark path, source-specific metric lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, public methodology version bump, badge migration, package dependency, or diagnostic question-bank migration was added.

No Literal AI docs prose, code examples, SDK snippets, GraphQL examples, API details, export instructions, dataset rows, score examples, prompt templates, screenshots, migration content, pricing rows, testimonials, generated outputs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0960LiteralAiProviderDriftBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired regression: `npx vitest run tests/gap0959PromptInjectionReplayCorpusBoundary.test.ts tests/gap0960LiteralAiProviderDriftBoundary.test.ts --reporter=dot` passed, 2 files / 8 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
