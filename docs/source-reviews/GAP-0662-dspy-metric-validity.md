# GAP-0662 — DSPy metric-validity boundary

- Gap: `GAP-0662`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://dspy.ai` and linked repository `stanfordnlp/dspy`
- Retrieval: `2026-06-21` via browser access to the live DSPy documentation site; shell network remains DNS-restricted in this environment.
- Status: relevant as metric-validity source-review context only; no DSPy metric-validity subsystem or source-specific scoring change.

## Live source metadata

The live DSPy documentation site identifies DSPy as a Python framework for structured LM programs and links to `stanfordnlp/dspy`. The site exposes documentation sections for metrics/evaluation, optimizers, RAG, agents, tools, MCP, observability/debugging, and API entries such as `Evaluate`, `EvaluationResult`, `SemanticF1`, `answer_exact_match`, and `answer_passage_match`. The page also displays Python `>=3.10`, MIT license, Stanford NLP affiliation, and public adoption/community indicators.

These facts are source identity and domain context only. No DSPy documentation prose beyond short labels, no examples, no code snippets, no prompts, no metrics definitions, no optimizer configs, no benchmark rows, no results, no screenshots, and no implementation details were copied.

## Relevance decision

DSPy is relevant to AMC as adjacent evidence for LM pipeline optimization and evaluation. It reinforces why AMC metric-validity claims must be backed by validation tables, metric owners, sample sizes, confidence intervals, evaluator-suite coverage, trace-evaluation coverage when claimed, threshold policy, signed evidence refs, artifact hashes, and row hashes.

The gap does not justify a DSPy metric-validity implementation. AMC already has a generic Mechanic export that can emit DSPy-shaped target artifacts, but that export format is not source-review proof, not a benchmark mirror, and not a metric-validity receipt. DSPy site labels, API names, docs, optimizer examples, community counts, or local DSPy exports must fail closed unless AMC-owned metric-validity evidence exists.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through existing AMC metric-validity primitives with validation table, owner, sample size, confidence interval, evaluator proof, and row hashes. |
| Shield | Relevant only when unsupported evaluator/metric claims are rejected with signed evidence and repair guidance. |
| Watch | Relevant only when caller-owned trace/evaluation telemetry is hash-bound through existing Watch evidence. |
| Enforce | No policy-enforcement change. |
| Vault | No secrets, storage, privacy, or data-residency change. |
| Fleet | No orchestration or trust-topology implementation. |
| Passport | No portable proof-bundle field or credential change. |
| Comply | No compliance mapping or regulated-domain claim. |

## Product closure

No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `src/mechanic/tuneExport.ts`, API, CLI, Studio, or scoring behavior changed for GAP-0662. The existing Mechanic DSPy target export remains a generic export format and is explicitly out of scope for source-review evidence. Accepted metric-validity proof still requires AMC-owned validation artifacts, thresholds, metric owner, sample size, confidence interval, signed evidence refs, artifact hashes, row hashes, and no-copy/source-review proof.

## Fail-closed rule

DSPy site metadata, competitor label `COMP-082`, repository identity, documentation labels, API names, examples, optimizer names, metric names, community counts, MIT license, Stanford NLP affiliation, local Mechanic DSPy export output, or DSPy-shaped target artifacts must fail closed for Score, Shield, or Watch metric-validity claims. Passing evidence requires AMC-owned validation table artifacts, evaluator-suite proof, trace-evaluation proof when claimed, threshold policy, metric owner, sample size, confidence interval, signed evidence refs, artifact hashes, row hashes, and no-copy proof.

## No-bloat boundary

No DSPy SDK integration, importer, adapter, optimizer wrapper, evaluator wrapper, benchmark runner, dataset mirror, prompt compiler, target-export change, metric-validity subsystem, methodology version bump, API route, CLI command, Studio panel, parity layer, or source-specific scoring path was added. No upstream code, docs prose, examples, prompts, configs, metrics definitions, benchmark rows, result tables, traces, screenshots, UI assets, package metadata text, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0662DspyMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: attempted with `npm test -- --reporter=dot`; blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
