# GAP-0870 - MASEval metric-validity boundary

- Gap: `GAP-0870`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `maseval/MASEval`, `https://github.com/maseval/MASEval`, `https://maseval.readthedocs.io/`
- Retrieval: `2026-06-21` via live GitHub repository page, live Read the Docs page, and README review. The live GitHub repository page opened successfully through the web channel and showed Star 35, Fork 10, Issues 7, Pull requests 3, 78 Commits, README.md, LICENSE, MIT license, v0.4.0 Latest Mar 28, 2026, Python 99.8%, Just 0.2%, repository folders `.github`, `assets`, `docs`, `examples`, `maseval`, `scripts`, and `tests`, and files including `BENCHMARKS.md`, `CITATION.cff`, and `pyproject.toml`.
- Status: completed as a metric-validity boundary over existing AMC validation receipts.

## Live source metadata

The live repository and docs identify MASEval as an LLM-based Multi-Agent Evaluation & Benchmark Framework. Relevant source-review signals include topics such as agentic-ai, multi-agent-systems, and large-language-models, package installation via pip install maseval, AutoGen, LangChain, GAIA, AgentBench, system-level benchmarking, task-specific configurations, framework agnostic operation, lifecycle hooks, tracing, logging, metrics collection, ConVerse, GAIA2, MACS, MMLU, MultiAgentBench, and Tau2.

These facts are useful multi-agent metric-validity context, but they are not AMC validation evidence by themselves. No upstream source code, package metadata, docs prose beyond minimal metadata facts, benchmark rows, examples, adapters, prompts, task configs, traces, logs, metrics implementations, generated outputs, screenshots, figures, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC through existing metric-validity receipts because multi-agent evaluation framework context can inform how users reason about Score, Shield, and Watch validity claims. The closure is not a MASEval adapter, package wrapper, benchmark runner, framework integration, or multi-agent evaluation subsystem; it is a fail-closed boundary showing that MASEval metadata is accepted only as source-review context unless AMC-owned metric validity proof exists.

For metric validity to pass, AMC needs validation table evidence, confidence interval evidence, sample size evidence, reliability checks, outcome-alignment checks, metric owner, signed evidence refs, source refs, row hashes, regression thresholds, CI or lifecycle gate proof, and no-copy proof. GitHub/docs/package/multi-agent evaluation metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing validation table, confidence interval, sample size, reliability, outcome-alignment, and metric-owner receipts. |
| Shield | Relevant only as a fail-closed trust boundary for multi-agent evaluation context; source metadata cannot stand in for signed validity proof. |
| Watch | Relevant only through source refs, CI/lifecycle gate receipts, and replayable eval-pack visibility; no live monitor changed. |
| Enforce | No runtime agent-evaluation policy, framework policy, prompt policy, or circuit breaker changed. |
| Vault | No benchmark rows, task configs, traces, logs, examples, package metadata, or secure-storage behavior changed. |
| Fleet | Multi-agent evaluation context only; no MASEval runner or orchestration topology added. |
| Passport | Existing metric validity receipts can feed proof bundles, but no Passport schema changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, API, CLI, Studio, methodology, badge, diagnostic question bank, or scoring code changed for GAP-0870.

The focused regression exercises existing `buildMetricValidationReport` behavior with a positive MASEval-style source-reference packet and a negative source-metadata-only packet. The positive path requires validation table, confidence interval, sample size, reliability check, outcome alignment, metric owner, signed evidence refs, source refs, row hashes, regression thresholds, and CI gate proof. The negative path fails closed when GitHub/docs/multi-agent evaluation metadata replaces signed metric-validity evidence.

## Fail-closed rule

Live GitHub repository page reachability, live Read the Docs page reachability, README.md presence, LICENSE presence, MIT license metadata, Star 35, Fork 10, Issues 7, Pull requests 3, 78 Commits, v0.4.0 Latest Mar 28, 2026, Python 99.8%, Just 0.2%, folder names, file names, topic labels, pip install maseval labels, AutoGen labels, LangChain labels, GAIA labels, AgentBench labels, system-level benchmarking labels, task-specific configurations labels, framework agnostic labels, lifecycle hooks labels, tracing labels, logging labels, metrics collection labels, ConVerse labels, GAIA2 labels, MACS labels, MMLU labels, MultiAgentBench labels, Tau2 labels, local backlog metadata, or source identity alone must fail closed for metric validity. Passing evidence requires validation table, confidence interval, sample size, reliability checks, outcome alignment, metric owner, signed evidence refs, source refs, row hashes, regression thresholds, CI or lifecycle gate proof, and no-copy proof.

## No-bloat boundary

No MASEval adapter, package wrapper, benchmark runner, AutoGen integration, LangChain integration, GAIA runner, AgentBench runner, framework adapter, lifecycle-hook collector, tracing importer, logging importer, metrics collector, benchmark row importer, task-config importer, provider wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, diagnostic question-bank migration, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream source code, package metadata, docs prose beyond minimal metadata facts, benchmark rows, examples, adapters, prompts, task configs, traces, logs, metrics implementations, generated outputs, screenshots, figures, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0870MasevalMetricValidityBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the existing positive and negative metric-validity paths passed.
- Focused regression after doc addition: `npx vitest run tests/gap0870MasevalMetricValidityBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0869KevlarBenchmarkMetricValidityBoundary.test.ts tests/gap0870MasevalMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
