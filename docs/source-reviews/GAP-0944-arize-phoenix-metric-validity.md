# GAP-0944 — Arize Phoenix metric validity

- Gap: `GAP-0944`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: Arize Phoenix homepage, public docs, evaluation docs, eval tutorial, and GitHub source identity
- Retrieval: `https://phoenix.arize.com` redirected to canonical `https://arize.com/phoenix/`; docs reviewed at `https://arize.com/docs/phoenix`; evaluation docs reviewed at `https://arize.com/docs/phoenix/evaluation/llm-evals`; tutorial reviewed at `https://arize.com/docs/phoenix/evaluation/tutorials/run-evals-with-built-in-evals`; source identity checked at `https://github.com/Arize-ai/phoenix/`
- Status: Done

## Relevance decision

Relevant, but only through AMC's existing metric-validity receipt path. The live Phoenix homepage positions Phoenix around "Trace the Exponential" and describes it as an open-source platform for agent development and evaluation. The source is directly relevant to Score, Shield, and Watch because it combines tracing, evaluation, annotation, datasets, experiments, and quality measurement.

The right AMC closure is not a Phoenix adapter. It is a regression proving that Phoenix-style source context can only pass when AMC has its own validation table, confidence interval, sample size, metric owner, signed evidence refs, reproducible eval pack, outcome alignment, and CI or lifecycle fail-closed threshold proof.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through metric validity, reliability checks, replayable eval-pack rows, and signed evidence refs. |
| Shield | Relevant because weak metric proof must fail closed before it becomes assurance evidence. |
| Enforce | Not in scope; no runtime policy or circuit breaker changed. |
| Vault | Not in scope; no storage, secret, DLP, or data-residency capability changed. |
| Watch | Relevant through trace/eval observability context, but only as source signal for AMC-owned metric receipts. |
| Fleet | Not in scope; no orchestration or fleet topology changed. |
| Passport | Not in scope; no portable trust token changed. |
| Comply | Not in scope; no compliance mapping changed. |

## Source signal

Live Phoenix evidence reviewed on 2026-06-22:

- The homepage includes Talk with your traces and says users can Investigate issues, add annotations, run experiments.
- The tracing section says teams can Get visibility into your agents.
- The evaluation section says teams can Measure and improve agent quality and Build evals that score outputs and catch issues before they reach your users.
- The iteration section says Test changes with evidence and Create datasets from traces.
- The product loop is framed as A systematic way to improve AI quality across OBSERVE, ANNOTATE, HYPOTHESIZE, EXPERIMENT, and MEASURE.
- The observe flow covers prompts, retrievals, tool calls, outputs.
- The annotation flow includes human review or LLM-as-judge.
- The experiment flow references benchmark performance.
- The measure flow includes Score output across cost, latency, and performance.
- The OSS Core section says ELv2 licensed, 9k+ GitHub stars, Native OpenTelemetry support, Vendor Agnostic, 3M+ Downloads, 10k+ Github Stars, and 22M+ OTEL Instrumentation Monthly Downloads.
- The public docs identify Phoenix as AI Observability and Evaluation, built on OpenTelemetry and OpenInference.
- The evaluation docs describe LLM-based evaluators, code-based checks, human labels, and evaluator integrations including Ragas, Deepeval, and Cleanlab.

## Product closure

No product implementation module changed for this source. The existing AMC primitive is sufficient:

- `buildMetricValidationReport` already produces metric rows, confidence intervals, inter-rater agreement, validation facet coverage, process evidence coverage, outcome alignment, eval-pack rows, replayability, and CI/lifecycle gate decisions.
- The focused regression constructs a Phoenix-context metric-validation packet and verifies that it passes only with signed AMC evidence and fails closed when Phoenix source metadata is substituted for real metric-validity proof.
- Existing methodology docs already contain an Arize/Phoenix-style boundary from earlier source review work; this slice does not bump methodology or add new public semantics.

## Fail-closed rule

Phoenix homepage, docs, GitHub, OpenTelemetry, OpenInference, evaluator, dataset, experiment, annotation, LLM-as-judge, human-label, agent, quality, benchmark, download, star, or vendor-agnostic metadata is rejected unless the AMC report has:

- a validation table;
- sufficient sample size;
- confidence interval;
- reliability/inter-rater agreement signal;
- metric owner or process evidence;
- construct-validity facet coverage;
- outcome alignment;
- signed evidence refs for rows and process evidence;
- replayable eval-pack rows;
- regression thresholds that fail closed in CI or lifecycle mode.

## No-bloat boundary

AMC did not add a Phoenix adapter, Arize API client, OpenInference collector, OpenTelemetry exporter, evaluator runner, annotation importer, dataset importer, experiment importer, trace/span ingestion feature, Phoenix UI clone, PXI integration, prompt-management integration, package dependency, public methodology version bump, CLI command, API route, copied docs prose, screenshots, examples, configs, notebooks, benchmark rows, traces, prompts, or generated outputs.

## Verification

- `npx vitest run tests/gap0944ArizePhoenixMetricValidityBoundary.test.ts --reporter=dot`: passed, 1 file / 4 tests.
- `npx vitest run tests/gap0943BraintrustStudioDrilldownBoundary.test.ts tests/gap0944ArizePhoenixMetricValidityBoundary.test.ts --reporter=dot`: passed, 2 files / 8 tests.
- `git diff --check -- . ':(exclude)AMC_OS'`: passed.
- `npm run typecheck`: passed.
