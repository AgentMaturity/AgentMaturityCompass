# GAP-0007 - Arize Phoenix replay corpus

- Gap: `GAP-0007`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: live Phoenix homepage redirect from `https://phoenix.arize.com` to `https://arize.com/phoenix/`, Phoenix docs at `https://arize.com/docs/phoenix`, Phoenix evaluation docs at `https://arize.com/docs/phoenix/evaluation/llm-evals`, Phoenix experiments docs at `https://arize.com/docs/phoenix/datasets-and-experiments/how-to-experiments`, and repository link `https://github.com/Arize-ai/phoenix/`
- Retrieval: `2026-06-25` live source review through the web research channel.
- Status: closed through existing eval replay corpus receipts only when AMC-owned replay evidence exists; no Phoenix adapter, trace importer, OpenTelemetry collector, OpenInference collector, evaluator runner, dataset importer, experiment importer, or source-specific replay path added.
- Linear: `AMC-492`

## Live source metadata

The live Phoenix homepage identifies the product with the headline Trace the Exponential and describes it as an open-source platform for agent development and evaluation. It presents agent work around Talk with your traces, Investigate issues, add annotations, run experiments, Get visibility into your agents, Measure and improve agent quality, Build evals that score outputs and catch issues before they reach your users, Test changes with evidence, and Create datasets from traces.

The homepage frames Phoenix as A systematic way to improve AI quality across OBSERVE, ANNOTATE, HYPOTHESIZE, EXPERIMENT, and MEASURE. It also names the trace elements prompts, retrievals, tool calls, outputs; review modes including human review or LLM-as-judge; experiment expectations such as benchmark performance; measurement across Score output across cost, latency, and performance; and open-source/standards signals including ELv2 licensed, Native OpenTelemetry support, Vendor Agnostic, and OpenInference.

The live Phoenix docs describe AI Observability and Evaluation. They connect traces, output scoring, failures and regressions, prompt iteration, experiments, and comparisons on the same inputs. They also list LLM-based evaluators, code-based checks, human labels, Ragas, Deepeval, Cleanlab, dataset evaluators, and experiments that rerun grouped traces or uploaded cases through application variants.

The experiments docs support a UI and SDK workflow with tasks, evaluators, and datasets. They explicitly include repetitions for variance and consistency checks, which is relevant to AMC only as a source-review signal for replayability requirements.

No Phoenix code, docs prose beyond minimal metadata facts, traces, OpenTelemetry payloads, OpenInference schemas, evaluator configs, datasets, prompts, examples, screenshots, generated outputs, or implementation details were copied into AMC.

## Relevance decision

GAP-0007 is relevant to AMC because Phoenix validates a market need for agent evaluation traces, datasets, experiments, evaluators, same-input comparisons, repeated runs, and regression-aware evidence. That need maps to AMC only through the existing replayable benchmark corpus primitive for Score, Shield, and Watch.

The accepted AMC primitive is already `runReplayBenchmarkCorpus` plus `buildEvalReplayCorpusEvidenceReceipt`: replay manifest, fixture hash, fixed seed, source refs, baseline and candidate score delta, signed evidence refs, row hashes, CI receipt, and Score/Shield/Watch coverage. Phoenix homepage or docs metadata alone must fail closed and cannot make a score, safety, or observability claim pass.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through AMC-owned replay manifests with fixture hash, fixed seed, score delta, and signed evidence. |
| Shield | Relevant when replay rows include signed evidence for unsafe, regressed, hallucinated, or policy-failing behavior. |
| Enforce | No runtime policy enforcement, circuit breaker, or tool policy changed in this slice. |
| Vault | No dataset storage, secrets, DLP, retention, or privacy behavior changed. |
| Watch | Relevant when replay deltas create CI or lifecycle receipts that Watch can surface; no Phoenix live monitor was added. |
| Fleet | Agent and trace context only; no Fleet orchestration, routing, or topology changed. |
| Passport | No portable proof-bundle field changed. |
| Comply | No compliance mapping or framework control changed. |

## Product closure

No product implementation module changed for this closure. Existing AMC replay-corpus product behavior already accepts source-linked replay evidence only when the result has an AMC-owned replay manifest, fixture hash, fixed seed, score delta, source refs, signed evidence, row hashes, CI receipt, and Score/Shield/Watch coverage.

The focused regression exercises that existing behavior for Phoenix context. The positive path binds Phoenix source refs to an AMC-owned fixture with signed baseline and candidate evidence. The negative path fails closed when Phoenix homepage, docs labels, traces, datasets, experiments, evaluators, same-input comparisons, OpenTelemetry, OpenInference, LLM-as-judge, and repetition metadata are used without an AMC-owned replay fixture.

## Fail-closed rule

Phoenix homepage labels, docs labels, trace labels, dataset labels, experiment labels, evaluator labels, OpenTelemetry labels, OpenInference labels, LLM-as-judge labels, repetitions labels, same-input-comparison labels, GitHub metadata, and local backlog metadata are not replay-corpus evidence.

Passing evidence requires AMC-owned replay manifest, fixture hash, fixed seed, score delta, source refs, signed evidence refs, row hashes, CI or lifecycle receipt, Score/Shield/Watch coverage, and no-copy proof.

## No-bloat boundary

No Phoenix adapter, Phoenix API client, OpenTelemetry exporter, OpenTelemetry collector, OpenInference collector, evaluator runner, dataset importer, experiment importer, trace ingestion path, prompt sync, repository mirror, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Score method, Passport field, methodology version bump, package dependency, or source-specific scoring path was added.

No upstream code, docs prose, screenshots, examples, prompts, datasets, benchmark rows, trace samples, OpenTelemetry payloads, OpenInference schemas, configs, generated outputs, model responses, or implementation details were copied.

## Verification

- TDD guard: `npx vitest run tests/gap0007ArizePhoenixReplayCorpusBoundary.test.ts --reporter=dot` failed before this source-review document existed, with only the missing doc assertion failing and the three replay-corpus behavior checks already passing.
- Focused regression: `npx vitest run tests/gap0007ArizePhoenixReplayCorpusBoundary.test.ts --reporter=dot` - 1 file / 4 tests passed.
- Paired replay-corpus regression: `npx vitest run tests/gap0007ArizePhoenixReplayCorpusBoundary.test.ts tests/replayBenchmarkCorpus.test.ts tests/gap0944ArizePhoenixMetricValidityBoundary.test.ts tests/gap0946GalileoReplayCorpusBoundary.test.ts tests/gap0968PatronusReplayCorpusBoundary.test.ts tests/gap0999VellumReplayCorpusBoundary.test.ts --reporter=dot` - 6 files / 182 tests passed.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` - passed.
- Typecheck: `npm run typecheck` - passed.
- Full suite: `npm test -- --reporter=dot` - 937 files / 7,737 tests passed.
