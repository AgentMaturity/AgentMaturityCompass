# GAP-0689 - Google Vertex AI Evaluation provider-drift boundary

- Gap: `GAP-0689`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://cloud.google.com/vertex-ai/generative-ai/docs/models/evaluation-overview`, redirected to `https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/evaluation-overview`
- Retrieval: `2026-06-21` via browser access to the live Google Cloud documentation page; shell network remains DNS-restricted in this environment.
- Status: closed through existing provider-drift evaluator and observability receipts; no Google Vertex or Agent Platform integration added.

## Live source metadata

The original Vertex AI Evaluation URL now redirects to the `Gemini Enterprise Agent Platform` Gen AI evaluation service overview. The live page is marked `Last updated 2026-06-18 UTC`.

The live documentation describes an evaluation service for generative AI models and agents. Relevant provider/model drift signals include model migrations, prompt editing, fine-tuning, adaptive rubrics, static rubrics, computation-based metrics, custom functions, upload-based datasets, `Sample directly from production logs`, synthetic data generation, console workflows, Python SDK workflows, Google and third-party models, model performance baselines, repeated evaluations, agent-specific evaluation, agent traces and response quality, GenAI Client in Agent Platform SDK, Evaluation module in Agent Platform SDK, and LiteLLM-callable models. These facts identify managed evaluation and model-migration context only. No Google docs prose beyond short metadata facts, sample code, notebook links, screenshots, API snippets, prompt examples, metric definitions, rubric examples, dataset rows, reports, visualizations, configs, or implementation details were copied into AMC.

## Relevance decision

Google Vertex AI Evaluation / Agent Platform evaluation is relevant to AMC as provider/model drift context because model migrations, third-party model comparison, production-log sampling, synthetic data generation, rubric evaluation, agent traces, and repeated evaluations are exactly the kinds of evidence users may want to connect to Score/Shield/Watch. AMC already has the generic provider-drift primitive needed for this: provider/model versions, canary results, evaluator proof, observability pipeline proof, drift statistics, alert or waiver, signed evidence refs, eval-pack row hashes, CI/lifecycle gates, and no-copy proof.

This does not require a Google Cloud integration. GAP-0689 is closed by documenting the source boundary and adding regression coverage that Vertex-style model-migration and agent-evaluation proof uses the existing generic `runProviderDriftBenchmark` path. Google docs metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing provider-drift canary comparisons, evaluator metric suites, eval-pack row hashes, and signed evidence refs. |
| Shield | Relevant through guardrail pass-rate evidence, signed proof, and fail-closed CI gate behavior. |
| Watch | Relevant through drift statistics, observability pipeline proof, Watch alert projection, and waiver handling. |
| Enforce | No Google Cloud policy, route enforcement, content filter, or runtime guardrail behavior changed. |
| Vault | No Google Cloud credential, production log, private dataset, or storage behavior changed. |
| Fleet | Agent-evaluation context only; no Agent Platform runner, LiteLLM bridge, or trust topology was added. |
| Passport | No portable proof-bundle field, token, or external credential changed. |
| Comply | No Google Cloud, data residency, or regulated-domain compliance mapping changed. |

## Product closure

No `src/benchmarks/providerDriftBenchmark.ts`, `src/api/benchmarkRouter.ts`, `src/api/watchRouter.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Google Cloud connector, Vertex AI adapter, Agent Platform SDK wrapper, LiteLLM bridge, production-log importer, notebook runner, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0689.

The focused regression exercises the existing provider-drift engine with Vertex-style fixture data. The positive path requires AMC-owned evaluator, observability, trace, metric, signed-evidence, eval-pack, Watch, and CI proof. The negative path fails closed when Google evaluation documentation metadata is present but signed evidence, evaluator proof, trace export, and metric report evidence are incomplete.

## Fail-closed rule

Google docs identity, redirect URLs, page titles, last-updated dates, product names, adaptive-rubric labels, static-rubric labels, computation-metric labels, custom-function labels, production-log sampling labels, synthetic-data labels, model-migration labels, Google/third-party model labels, agent-trace labels, SDK labels, LiteLLM labels, local backlog metadata, or source identity alone must fail closed for provider/model drift claims. Passing evidence requires AMC-owned provider versions, canary results, drift statistics, evaluator configuration, generated test-data hash, metric ids and count, verdict aggregation, observability pipeline ids, trace export hash, metric report hash, alert or waiver proof, signed evidence refs, eval-pack row hashes, CI/lifecycle receipts, and no-copy proof.

## No-bloat boundary

No Google Vertex provider-drift adapter, Google Cloud connector, Agent Platform SDK wrapper, LiteLLM bridge, production-log importer, synthetic-data generator, notebook runner, console report importer, rubric importer, custom-function runner, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No Google docs prose beyond short metadata facts, sample code, notebook links, screenshots, API snippets, prompt examples, metric definitions, rubric examples, dataset rows, reports, visualizations, configs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0689GoogleVertexEvaluationProviderDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
