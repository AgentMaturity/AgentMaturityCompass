# GAP-0013 - LangWatch provider drift

- Gap: `GAP-0013`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `LangWatch`
- Retrieval: live LangWatch homepage, docs introduction, evaluations overview, and local backlog metadata, 2026-06-25
- Status: Done

## Relevance decision

GAP-0013 is relevant to AMC because it asks for a provider/model drift benchmark implementation path for agent evaluation. LangWatch is source-review context for LLM observability, evaluations, production traces, datasets, prompt and model comparisons, guardrails, offline experiments, online monitoring, and agent simulations. That maps to AMC's existing Score/Shield/Watch provider/model drift benchmark receipts.

The source does not justify a LangWatch adapter, trace importer, OpenTelemetry wrapper, simulation runner, hosted monitor connector, evaluation runner, prompt importer, dataset importer, SDK dependency, MCP client, CLI wrapper, API route, or parity claim. AMC's valid closure is to require AMC-owned provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, row hashes, source refs, and CI/lifecycle gate state.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Primary surface. Provider/model drift can alter agent-quality scores, so canary rows must bind provider and model versions, metric suite, sample size, drift statistics, signed evidence, row hashes, and eval-pack replayability. |
| Shield | Relevant when safety, refusal, guardrail, invalid-action, or regression distributions shift. Missing signed evidence or unwaived drift fails closed. |
| Enforce | Out of scope. No runtime enforcement policy, action firewall, circuit breaker, or tool policy changed. |
| Vault | Out of scope. No secret store, trace store, DLP behavior, or data-residency behavior changed. |
| Watch | Primary operational surface. Existing Watch projection exposes unwaived provider drift as alerts and accepts waivers only when explicit evidence exists. |
| Fleet | Indirect only. Multi-agent and agent-simulation context can inform future fleet eval scenarios, but no fleet topology or scheduler changed. |
| Passport | Out of scope. No portable trust-token schema changed. |
| Comply | Indirect only. Drift receipts can support audit reviews, but no compliance mapping changed. |

## Product closure

No product module changed in this Top-100 closure. Existing `src/benchmarks/providerDriftBenchmark.ts` already produces the required AMC-native provider/model drift proof:

- provider and model versions,
- baseline and candidate canary rows,
- score, refusal, latency, cost, guardrail, judge-agreement, and trajectory metrics,
- drift statistics,
- signed evidence refs,
- evaluation-framework proof,
- observability-pipeline proof,
- replayable eval-pack rows and row hashes,
- Watch alert projection, and
- CI/lifecycle gate fail-closed state.

Added focused regression coverage in `tests/gap0013LangWatchProviderDriftBoundary.test.ts` and this source-review note.

Live source facts verified:

- Backlog URL: `https://langwatch.ai`
- Canonical homepage: `https://langwatch.ai/`
- Docs redirect URL: `https://docs.langwatch.ai/`
- Docs introduction: `https://langwatch.ai/docs/introduction`
- Evaluations overview: `https://langwatch.ai/docs/evaluations/overview`
- Source title: `LangWatch`
- Homepage title/context includes `LangWatch: AI Agent Testing and LLM Evaluation Platform`.
- Docs introduction title/context includes `LangWatch: The Complete LLMOps Platform`.
- Evaluation docs title/context includes `Evaluations Overview`.
- Homepage context says LangWatch can turn `production traces into evals`, `compare prompts and models`, and simulate end-to-end agent systems.
- Homepage/docs context includes `agent simulations`, tracing, evaluations, datasets, prompt management, real-time evaluations, observability, guardrails, batch tests, experiments, auto-evals, OpenTelemetry native context, and working across models/frameworks.
- Evaluation docs context describes a build/test/deploy/monitor lifecycle, model/configuration comparison, production quality monitoring, alerts when quality drops, and a `CI/CD gate`.
- Homepage retrieval returned HTTP `200`, canonical URL `https://langwatch.ai/`, content type `text/html`, and first 200 KB SHA-256 `5a9f4d30133b54292e7e1efd0d933f42d6a9665f4cbb84c178cccc761cb8a401`.
- Docs redirect retrieval returned HTTP `200`, canonical URL `https://langwatch.ai/docs/introduction`, content type `text/html; charset=utf-8`, and first 200 KB SHA-256 `7c0b9651a18f6ca66134450f71c90a09780c687cb40734e636cab0e71d5e3315`.
- Docs introduction retrieval returned HTTP `200`, URL `https://langwatch.ai/docs/introduction`, content type `text/html; charset=utf-8`, and first 200 KB SHA-256 `7c0b9651a18f6ca66134450f71c90a09780c687cb40734e636cab0e71d5e3315`.
- Evaluations overview retrieval returned HTTP `200`, URL `https://langwatch.ai/docs/evaluations/overview`, content type `text/html; charset=utf-8`, and first 200 KB SHA-256 `2af4fbf6cf4de947a7f3fd4153f8bfc8896df36d29d914338f678b898605e93a`.

## Fail-closed rule

Provider/model drift proof fails closed when provider version is missing, canary result rows are missing, drift statistics are missing, signed evidence refs are absent, evaluation-framework proof is incomplete, observability-pipeline proof is incomplete, source refs are missing, eval-pack row hashes are absent, replayability is false, Watch alert or waiver state is absent for drift, or the CI/lifecycle gate fails.

metadata-only LangWatch evidence fails closed. Product-page text, docs navigation, trace labels, evaluation labels, dataset labels, prompt labels, model-comparison labels, guardrail labels, observability labels, OpenTelemetry labels, batch-test labels, experiment labels, auto-eval labels, online-monitoring labels, alert labels, model/framework integration labels, GitHub or open-source labels, or local backlog metadata cannot satisfy AMC provider/model drift proof without AMC-owned provider versions, canary rows, drift statistics, signed evidence refs, replayable eval-pack rows, row hashes, source refs, alert or waiver output, and CI/lifecycle gate state.

## No-bloat boundary

No LangWatch adapter, trace importer, OpenTelemetry wrapper, simulation runner, hosted monitor connector, evaluation runner, prompt importer, dataset importer, SDK dependency, MCP client, CLI wrapper, API route, Studio panel, Watch monitor, Shield verifier, public methodology bump, provider parity claim, copied docs prose, copied examples, copied code, copied screenshots, copied traces, copied datasets, copied prompts, copied model outputs, copied configs, or copied implementation details were added.

LangWatch remains source-review context only. AMC accepts only signed AMC-native provider/model drift evidence.

## Verification

- Expected-red focused test: `npx vitest run tests/gap0013LangWatchProviderDriftBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-0013-langwatch-provider-drift.md` did not exist; 3 provider-drift/no-bloat tests passed.
- Live source checks:
  - `curl -L -sS -A 'AMC-source-review/1.0' 'https://langwatch.ai'` returned the HTTP and hash evidence recorded above.
  - `curl -L -sS -A 'AMC-source-review/1.0' 'https://docs.langwatch.ai/'` returned the HTTP and hash evidence recorded above.
  - `curl -L -sS -A 'AMC-source-review/1.0' 'https://langwatch.ai/docs/introduction'` returned the HTTP and hash evidence recorded above.
  - `curl -L -sS -A 'AMC-source-review/1.0' 'https://langwatch.ai/docs/evaluations/overview'` returned the HTTP and hash evidence recorded above.
- Focused test: `npx vitest run tests/gap0013LangWatchProviderDriftBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired provider-drift regression: `npx vitest run tests/gap0013LangWatchProviderDriftBoundary.test.ts tests/gap0003LangfuseProviderDriftBoundary.test.ts tests/gap0004ChatlawProviderDriftBoundary.test.ts tests/providerDriftBenchmark.test.ts tests/inspectProviderDrift.test.ts tests/promptfooProviderDriftApi.test.ts tests/promptfooProviderDrift.test.ts tests/humanloopProviderDrift.test.ts tests/patronusProviderDrift.test.ts tests/gap0731CrabProviderDriftBoundary.test.ts --reporter=dot` passed, 10 files / 71 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 1014 files / 8071 tests.
