# GAP-0003 - Langfuse provider drift

- Gap: `GAP-0003`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `Langfuse`
- Retrieval: live Langfuse homepage, evaluation overview, CI/CD experiment docs, monitor docs, and local backlog metadata, 2026-06-25
- Status: Done

## Relevance decision

GAP-0003 is relevant to AMC because it asks for provider/model drift benchmark proof for agent evaluation. Langfuse is source-review context for observability, traces, evaluations, datasets, experiments, CI/CD regression checks, monitors, alerts, cost, latency, and quality dashboards. That maps to AMC's existing Score/Shield/Watch provider/model drift benchmark receipts.

The source does not justify a Langfuse adapter, hosted data connector, trace importer, experiment runner, monitor connector, alert connector, SDK dependency, MCP client, CLI wrapper, API route, or parity claim. AMC's valid closure is to require AMC-owned provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, row hashes, source refs, and CI/lifecycle gate state.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Primary surface. Provider/model drift can change maturity scores, so canary rows must bind provider and model versions, metric suite, sample size, drift statistics, signed evidence, row hashes, and eval-pack replayability. |
| Shield | Relevant when safety, guardrail, refusal, invalid-action, or security-score distributions shift. Missing signed evidence or unwaived drift fails closed. |
| Enforce | Out of scope. No runtime enforcement policy, action firewall, or circuit breaker changed. |
| Vault | Out of scope. No secret store, trace store, or data-residency behavior changed. |
| Watch | Primary operational surface. Existing Watch projection exposes unwaived provider drift as alerts and accepts waivers only when explicitly present. |
| Fleet | Out of scope. No fleet topology or multi-agent scheduler changed. |
| Passport | Out of scope. No portable trust-token schema changed. |
| Comply | Indirect only. Drift evidence can support audit reviews, but no compliance mapping changed. |

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

Added focused regression coverage in `tests/gap0003LangfuseProviderDriftBoundary.test.ts` and this source-review note.

Live source facts verified:

- Backlog URL: `https://langfuse.com`
- Canonical homepage: `https://langfuse.com/`
- Evaluation overview: `https://langfuse.com/docs/evaluation/overview`
- Experiments in CI/CD: `https://langfuse.com/docs/evaluation/experiments/experiments-ci-cd`
- Monitors and Alerts: `https://langfuse.com/docs/metrics/features/monitors`
- Source title: `Langfuse`
- Homepage title/context includes `Open Source AI Engineering Platform`, observability, prompt management, evaluation, metrics, traces, experiments, human annotation, cost, latency, quality dashboards, model-provider integrations, APIs/exports, CLI, and MCP server context.
- Evaluation Overview describes repeatable checks, online and offline evaluation, datasets, experiments, manual and automated evaluators, and catching regressions before shipping.
- Experiments in CI/CD describes dataset-backed experiment scripts, evaluator scoring, threshold failure via `RegressionError`, and GitHub Actions gating.
- Monitors and Alerts describes threshold-based alerting over observations and numeric/categorical scores, severity states, Slack/webhook/GitHub Actions automations, and no-data handling.
- Homepage retrieval returned HTTP `200`, canonical URL `https://langfuse.com/`, content type `text/html; charset=utf-8`, and first 200 KB SHA-256 `f85fcc720fe1e0e2e46c473635802eb38149394a446301e9a5561e8c804d598c`.
- Evaluation overview retrieval returned HTTP `200`, URL `https://langfuse.com/docs/evaluation/overview`, content type `text/html; charset=utf-8`, and first 200 KB SHA-256 `0dd0a1c36881857eef3a714981fbc3aedf6eafb5f1ae3d56b35aa15da579405d`.
- CI/CD experiment retrieval returned HTTP `200`, URL `https://langfuse.com/docs/evaluation/experiments/experiments-ci-cd`, content type `text/html; charset=utf-8`, and first 200 KB SHA-256 `f90db8d1ce666f2780a2dc6d029a34abce71609d74484e9b366ed44292c8c4ea`.
- Monitors retrieval returned HTTP `200`, URL `https://langfuse.com/docs/metrics/features/monitors`, content type `text/html; charset=utf-8`, and first 200 KB SHA-256 `a33b0e6d3fa717ff9d253bb7177525b63eaa8ba90df4be4f6cb0a050c2386bc4`.

## Fail-closed rule

Provider/model drift proof fails closed when provider version is missing, canary result rows are missing, drift statistics are missing, signed evidence refs are absent, evaluation-framework proof is incomplete, observability-pipeline proof is incomplete, source refs are missing, eval-pack row hashes are absent, replayability is false, Watch alert or waiver state is absent for drift, or the CI/lifecycle gate fails.

metadata-only Langfuse evidence fails closed. Product-page text, docs navigation, evaluation labels, dataset labels, experiment labels, CI/CD labels, monitor labels, alert labels, trace labels, score labels, prompt-management labels, model-provider integration lists, cost/latency/quality dashboard labels, GitHub star counts, OSS release labels, API/export labels, CLI labels, MCP labels, security/compliance labels, or local backlog metadata cannot satisfy AMC provider/model drift proof without AMC-owned provider versions, canary rows, drift statistics, signed evidence refs, replayable eval-pack rows, row hashes, source refs, alert or waiver output, and CI/lifecycle gate state.

## No-bloat boundary

No Langfuse adapter, hosted data connector, trace importer, experiment runner, monitor connector, alert connector, SDK dependency, MCP client, CLI wrapper, API route, Studio panel, Watch monitor, Shield verifier, public methodology bump, provider parity claim, copied docs prose, copied examples, copied code, copied screenshots, copied traces, copied datasets, copied prompts, copied model outputs, copied configs, or copied implementation details were added.

Langfuse remains source-review context only. AMC accepts only signed AMC-native provider/model drift evidence.

## Verification

- Expected-red focused test: `npx vitest run tests/gap0003LangfuseProviderDriftBoundary.test.ts --reporter=dot` first exposed one test expectation mismatch against the existing generic comparison shape, then failed only because `docs/source-reviews/GAP-0003-langfuse-provider-drift.md` did not exist; 3 provider-drift/no-bloat tests passed.
- Live source checks:
  - Web channel opened `https://langfuse.com` and showed observability, evaluations, prompt management, traces, experiments, monitors, cost/latency, model-provider integrations, APIs/exports, CLI, and MCP context.
  - Web channel opened official Langfuse evaluation, CI/CD experiment, dataset/versioning, and monitor/alert docs.
  - `curl -L -s 'https://langfuse.com'` returned the HTTP and hash evidence recorded above.
  - `curl -L -s 'https://langfuse.com/docs/evaluation/overview'` returned the HTTP and hash evidence recorded above.
  - `curl -L -s 'https://langfuse.com/docs/evaluation/experiments/experiments-ci-cd'` returned the HTTP and hash evidence recorded above.
  - `curl -L -s 'https://langfuse.com/docs/metrics/features/monitors'` returned the HTTP and hash evidence recorded above.
- Focused test: `npx vitest run tests/gap0003LangfuseProviderDriftBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Initial paired provider-drift regression command included missing file names and passed only the 2 existing files it found; reran with corrected provider-drift file names.
- Paired provider-drift regression: `npx vitest run tests/gap0003LangfuseProviderDriftBoundary.test.ts tests/providerDriftBenchmark.test.ts tests/inspectProviderDrift.test.ts tests/promptfooProviderDriftApi.test.ts tests/promptfooProviderDrift.test.ts tests/humanloopProviderDrift.test.ts tests/patronusProviderDrift.test.ts tests/gap0731CrabProviderDriftBoundary.test.ts --reporter=dot` passed, 8 files / 63 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 1012 files / 8063 tests.
