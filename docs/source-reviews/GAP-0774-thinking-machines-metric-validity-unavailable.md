# GAP-0774 - Thinking Machines metric-validity unavailable-source boundary

- Gap: `GAP-0774`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://openalex.org/W4414988547`, `https://doi.org/10.3390/bdcc10010038`
- Retrieval: `2026-06-21` via live browser/search checks; shell network remains DNS-restricted in this environment.
- Status: source unavailable; skipped as metric-validity implementation evidence.

## Live retrieval result

The local backlog identifies the source as `Thinking Machines: Mathematical Reasoning in the Age of LLMs`, OpenAlex work `W4414988547`, and DOI `10.3390/bdcc10010038`. During this pass, live retrieval did not produce a usable primary source page or independent source page for the paper:

- exact-title search for `Thinking Machines: Mathematical Reasoning in the Age of LLMs` returned no usable primary/source result.
- DOI search for `10.3390/bdcc10010038` returned no usable primary/source result.
- OpenAlex search for `W4414988547` returned no usable primary/source result.
- direct DOI opening was blocked by browser safety constraints because no matching search result was available to anchor it.

The backlog row may be a future, removed, unreleased, private, or incorrectly indexed article record. AMC cannot use it as metric-validity evidence without a reachable source and reviewable method/evidence details. No upstream abstract prose beyond the local metadata identifiers above, mathematical-reasoning benchmarks, symbolic tasks, proofs, datasets, prompts, model outputs, statistics tables, screenshots, configs, docs text, or implementation details were copied into AMC.

## Relevance decision

Metric validity is relevant to AMC through existing Score, Shield, and Watch primitives when AMC has validation tables, confidence intervals, sample size, metric owner, construct-validity evidence, reliability checks, signed evidence refs, row hashes, CI/lifecycle gates, and no-copy proof. GAP-0774 does not supply those facts because the cited source was unavailable during live verification.

Therefore GAP-0774 is closed as a documented skip. The source is not rejected because mathematical reasoning, deductive reasoning, symbolic tasks, syntax, mathematical logic, cognitive science, or computational models are irrelevant; it is rejected because unavailable paper metadata alone cannot substantiate an AMC metric-validity implementation, public-methodology change, or scoring claim.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Metric-validity scoring remains relevant only through AMC-owned validation tables, confidence intervals, sample sizes, and metric-owner proof. |
| Shield | No reasoning, reliability, safety, or hallucination proof can be derived from an unreachable source. |
| Watch | No benchmark, regression, or metric-reliability monitor evidence can be derived from metadata alone. |
| Enforce | No runtime reasoning, proof-checking, syntax, or logic guardrail changed. |
| Vault | No math benchmark data, proofs, prompts, or model-output storage behavior changed. |
| Fleet | Reasoning-agent context only; no orchestration or trust-topology behavior changed. |
| Passport | No portable proof-bundle field, token, or external credential changed. |
| Comply | No compliance mapping changed. |

## Product closure

No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, API, CLI, Studio, or scoring code changed for GAP-0774. Existing AMC metric-validity primitives remain the only accepted path for validation table, confidence interval, sample size, metric owner, signed evidence, and regression-threshold claims.

The source-review closure is the product boundary: source unavailable, skipped as metric-validity implementation evidence, with tests ensuring source-specific identifiers stay out of metric-validity implementation modules and public methodology semantics.

## Fail-closed rule

Unavailable paper metadata alone must fail closed for metric-validity claims. Local backlog metadata, title text, DOI, OpenAlex id, mathematical-reasoning labels, deductive-reasoning labels, symbolic-task labels, syntax labels, mathematical-logic labels, cognitive-science labels, computational-model labels, partial abstract snippets, category labels, generated gap wording, or source identity are not enough to pass. Passing evidence requires AMC-owned validation table artifacts, confidence interval, sample size, metric owner, construct-validity mapping, reliability checks, signed evidence refs, row hashes, regression thresholds, CI/lifecycle receipts, and no-copy proof.

## No-bloat boundary

No mathematical-reasoning metric-validity adapter, proof benchmark importer, symbolic-task evaluator, theorem-proving runner, syntax evaluator, mathematical-logic module, cognitive-science evaluator, MDPI/OpenAlex importer, DOI resolver, source-specific metric lens, public methodology version bump, diagnostic question-bank migration, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, or source-specific scoring path was added. No upstream abstract prose beyond local metadata identifiers, mathematical-reasoning benchmarks, symbolic tasks, proofs, datasets, prompts, model outputs, statistics tables, screenshots, configs, docs text, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0774ThinkingMachinesMetricValidityUnavailableBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
