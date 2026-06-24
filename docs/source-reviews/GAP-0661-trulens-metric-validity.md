# GAP-0661 — TruLens metric-validity boundary

- Gap: `GAP-0661`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/truera/trulens`
- Retrieval: `2026-06-21` via browser access to the live GitHub repository page; shell network remains DNS-restricted in this environment.
- Status: relevant as metric-validity source-review context only; no TruLens subsystem or AMC metric-validity implementation change.

## Live source metadata

Live GitHub page facts observed for source identity:

- Repository: `truera/trulens`
- Visibility: public
- Default branch shown: `main`
- Repository description/about: `Evaluation and Tracking for LLM Experiments and AI Agents`
- License shown: MIT
- Stars/forks/watchers/issues shown by GitHub page: approximately `3.4k` stars, `302` forks, `22` watching, `52` issues
- Release panel shown: latest release `TruLens 2.8.1`, dated `2026-05-14`
- Language breakdown shown: Python primary, with Jupyter Notebook and TypeScript also present
- Topics shown include agent evaluation, AI observability, LLM evaluation, LLMOps, and explainable ML

These metadata facts identify the source and its adjacent domain only. No README prose, docs prose, examples, code, package configuration, benchmark rows, evaluator definitions, traces, outputs, screenshots, or implementation details were copied.

## Relevance decision

TruLens is relevant to AMC as an evaluation/observability source-review signal for metric-validity discussions. Its repository metadata and public positioning can motivate why AMC metric claims must carry validation tables, metric owners, sample sizes, confidence intervals, evaluator-suite proof, trace-evaluation proof where claimed, signed evidence refs, and row hashes.

The source is not accepted as AMC metric-validity evidence by itself. GitHub metadata, repository popularity, license, release, topics, README labels, evaluator names, instrumentation claims, provider support, local notebooks, or dashboard references do not establish construct validity, inter-rater reliability, test-retest stability, confidence intervals, or maturity-score predictiveness inside AMC.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through existing AMC metric-validity primitives with validation tables, sample sizes, confidence intervals, owners, and signed evidence. |
| Shield | Relevant only when unsupported metric-validity claims are rejected with thresholds, row hashes, and repair guidance. |
| Watch | Relevant only when caller-owned trace/evaluation telemetry is hash-bound through existing Watch evidence; source metadata alone is not observability proof. |
| Enforce | No policy-enforcement change. |
| Vault | No secrets, storage, or data-residency change. |
| Fleet | No orchestration or trust-topology implementation. |
| Passport | No portable proof-bundle field or credential change. |
| Comply | No compliance mapping or regulated-domain claim. |

## Product closure

No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, docs methodology page, API, CLI, Studio, or scoring behavior changed for GAP-0661. Existing AMC metric-validity controls remain the only accepted product path: validation table artifact, evaluator-suite coverage, trace-evaluation coverage when claimed, threshold policy, metric owner, sample size, confidence interval, signed evidence refs, artifact hashes, row hashes, and no-copy/source-review proof.

## Fail-closed rule

Repository metadata, GitHub counts, MIT license, default branch, releases, topics, README labels, package names, evaluator names, instrumentation labels, provider support, dashboard references, notebooks, local demo output, aggregate scores, or source identity alone must fail closed for Score, Shield, or Watch metric-validity claims. Passing evidence requires AMC-owned validation tables, evaluator/trace proof, thresholds, metric owner, sample size, confidence interval, signed evidence refs, artifact hashes, row hashes, and no-copy proof.

## No-bloat boundary

No TruLens SDK integration, importer, adapter, dashboard clone, evaluator wrapper, provider plugin, OpenTelemetry bridge, selector schema mirror, notebook runner, benchmark mirror, dataset mirror, parity layer, methodology version bump, API route, CLI command, or source-specific scoring path was added. No upstream code, README/docs prose, examples, prompts, configs, tests, benchmark rows, result tables, traces, screenshots, UI assets, package metadata text, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0661TrulensMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: attempted with `npm test -- --reporter=dot`; blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
