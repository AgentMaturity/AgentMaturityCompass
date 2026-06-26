# GAP-0011 - W&B Weave metric validity

- Gap: `GAP-0011`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `Weights & Biases Weave`
- Retrieval: live Weave homepage, public Weave docs, evaluation tutorial, and local backlog metadata, 2026-06-25
- Status: Done

## Relevance decision

GAP-0011 is relevant to AMC because it asks for metric validity and reliability checks for agent evaluation. The live Weave source is useful context because it positions Weave as an observability and evaluation platform for language-model applications and production agents, with traces, datasets, scorers, evaluations, monitors, guardrails, and regression detection. That maps to AMC's existing Score metric-validity receipts, Watch-facing CI/lifecycle gates, and Shield's requirement that safety or reliability claims fail closed when proof is incomplete.

The source does not justify a W&B integration, Weave adapter, SDK dependency, hosted trace reader, custom scorer bridge, leaderboard importer, MCP client, production-data loop, or source-specific scoring subsystem. AMC's valid closure is the generic proof boundary: Weave context is accepted only after it is bound to AMC-owned validation table evidence, confidence interval, sample size, metric owner, signed evidence refs, reproducible eval pack, row hashes, dataset/manifest hashes, and CI/lifecycle gate state.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Primary surface. Existing metric-validity receipts bind maturity metric claims to validation rows, confidence intervals, sample size, owner, eval-pack hashes, source refs, and CI/lifecycle gate state. |
| Shield | Relevant only when safety, quality, guardrail, or regression claims are backed by signed AMC evidence. No Shield detector changed. |
| Enforce | Out of scope. No runtime policy, action firewall, or circuit breaker changed. |
| Vault | Out of scope for this gap. Existing signed evidence refs and hashes can be stored by evidence primitives, but no Vault behavior changed. |
| Watch | Relevant because CI/lifecycle regression thresholds fail closed and can be monitored. No source-specific Watch monitor changed. |
| Fleet | Multi-agent context only. No orchestration, topology, or fleet scheduler changed. |
| Passport | Out of scope. No portable trust-token schema changed. |
| Comply | Indirect only. Metric-validity proof can support audits, but no compliance mapping changed. |

## Product closure

No product module changed in this Top-100 closure. Existing `src/score/metricValidity.ts` already builds the required AMC-native metric-validity report:

- validation table rows,
- sample size,
- confidence interval,
- metric owner,
- construct-validity/process/outcome coverage,
- inter-rater agreement,
- test-retest stability,
- signed evidence refs,
- eval-pack dataset hash, row hashes, and manifest hash,
- replayable flag, and
- CI/lifecycle gate fail-closed state.

Added focused regression coverage in `tests/gap0011WeaveMetricValidityBoundary.test.ts` and this source-review note.

Live source facts verified:

- Backlog URL: `https://wandb.ai/site/weave`
- Canonical homepage: `https://wandb.ai/site/weave/`
- Weave docs: `https://docs.wandb.ai/weave`
- Weave evaluation docs: `https://docs.wandb.ai/weave/tutorial-eval`
- Source title: `Weights & Biases Weave`
- The homepage presents Weave around production-agent observability, monitoring, custom signals, alerts, sessions, turns, tools, sub-agents, evaluation comparisons, regressions, Playground, Guardrails, and Leaderboards.
- The docs page describes Weave as an observability and evaluation platform for tracking, evaluating, and improving LLM applications, with LLM judges and custom scorers.
- The evaluation tutorial describes a repeatable pipeline using a model, dataset, scoring function, evaluation run, and result inspection.
- Homepage retrieval returned HTTP `200`, canonical URL `https://wandb.ai/site/weave/`, content type `text/html; charset=UTF-8`, and first 200 KB SHA-256 `dcbbdc4a404d6075b2cdea65bbdb2b58586c26c66dad1d5dd0cfc26fd11a39ed`.
- Docs retrieval returned HTTP `200`, URL `https://docs.wandb.ai/weave`, content type `text/html; charset=utf-8`, and first 200 KB SHA-256 `77978cb92b9e56a2a6c29a817767566acbd0ce45647aea383a60004033226347`.
- Evaluation-doc retrieval returned HTTP `200`, URL `https://docs.wandb.ai/weave/tutorial-eval`, content type `text/html; charset=utf-8`, and first 200 KB SHA-256 `4034018fe0969f63b307b38e5f489043f3557ab85ead857d9a00dbfc8c77ff0a`.

## Fail-closed rule

Metric-validity claims fail closed when validation rows are under-sampled, confidence intervals are missing or too wide, construct-validity coverage is incomplete, process evidence is incomplete, outcome alignment is absent, signed evidence refs are missing, eval-pack rows are not replayable, row hashes are absent, the manifest hash is absent, or the CI/lifecycle gate fails.

metadata-only Weave evidence fails closed. Product-page text, docs navigation, screenshots, trace labels, session labels, turn labels, tool labels, sub-agent labels, built-in scorer labels, custom scorer labels, LLM judge labels, dataset labels, evaluation-run labels, monitor labels, alert labels, Guardrails labels, Playground labels, Leaderboard labels, MCP labels, SDK docs, or local backlog metadata cannot satisfy AMC metric-validity proof without AMC-owned validation table evidence, confidence interval, sample size, metric owner, signed evidence refs, reproducible eval pack, regression thresholds, row hashes, manifest hash, and CI/lifecycle gate state.

## No-bloat boundary

No W&B integration, Weave adapter, SDK dependency, trace importer, trace reader, hosted data connector, scoring-function bridge, custom scorer mirror, LLM judge wrapper, dataset importer, evaluation runner, monitor connector, alert connector, Slack/webhook automation, Guardrails clone, Playground integration, Leaderboard importer, MCP client, production-data loop, API route, CLI command, Studio panel, Passport field, public methodology bump, copied docs prose, copied examples, copied code, copied screenshots, copied traces, copied datasets, copied prompts, copied model outputs, copied configs, or copied implementation details were added.

The Weave source remains source-review context only. AMC accepts only signed AMC-native metric-validity evidence.

## Verification

- Expected-red focused test: `npx vitest run tests/gap0011WeaveMetricValidityBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-0011-weave-metric-validity.md` did not exist; 3 metric-validity/no-bloat tests passed.
- Live source checks:
  - Web channel opened `https://wandb.ai/site/weave`, canonicalized to `https://wandb.ai/site/weave/`, and showed production-agent observability, evaluation, monitoring, tracing, Guardrails, and regression-detection context.
  - Web channel opened `https://docs.wandb.ai/weave` and showed Weave docs, evaluation, custom scorers, datasets, tracing, and monitoring navigation.
  - Web channel opened `https://docs.wandb.ai/weave/tutorial-eval` and showed the evaluation pipeline context recorded above.
  - `curl -L -s 'https://wandb.ai/site/weave'` returned the HTTP and hash evidence recorded above.
  - `curl -L -s 'https://docs.wandb.ai/weave'` returned the HTTP and hash evidence recorded above.
  - `curl -L -s 'https://docs.wandb.ai/weave/tutorial-eval'` returned the HTTP and hash evidence recorded above.
- Focused test: `npx vitest run tests/gap0011WeaveMetricValidityBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired metric-validity regression: `npx vitest run tests/gap0011WeaveMetricValidityBoundary.test.ts tests/gap0009ModularBenchmarkMetricValidityBoundary.test.ts tests/gap0006HuntGptMetricValidityBoundary.test.ts tests/gap0002LlmSurveyMetricValidityBoundary.test.ts tests/metricValidity.test.ts tests/publicMethodology.test.ts tests/questionScoreExplainability.test.ts --reporter=dot` passed, 7 files / 178 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 1011 files / 8059 tests.
