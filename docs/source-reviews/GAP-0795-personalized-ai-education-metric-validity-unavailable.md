# GAP-0795 - Personalized AI education metric-validity unavailable-source boundary

- Gap: `GAP-0795`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: backlog DOI `10.1002/cae.70153`, OpenAlex work `W7125592461`, and title `Towards Personalized AI Education: Context-Aware Retrieval-Augmented Generation With Grade-Level LLM Adaptation`
- Retrieval: `2026-06-21` via live browser/search checks; shell network remains restricted in this environment.
- Status: source unavailable; skipped as metric-validity implementation evidence.

## Live retrieval result

The local backlog identifies the source as `Towards Personalized AI Education: Context-Aware Retrieval-Augmented Generation With Grade-Level LLM Adaptation`, DOI `10.1002/cae.70153`, and OpenAlex work `W7125592461`. During this pass, live retrieval did not produce a usable primary source page or independent source page for the paper:

- exact-title search for `Towards Personalized AI Education: Context-Aware Retrieval-Augmented Generation With Grade-Level LLM Adaptation` returned no usable primary/source result.
- DOI search for `10.1002/cae.70153` returned no usable primary/source result.
- OpenAlex search for `W7125592461` returned no usable primary/source result.
- direct DOI opening returned `403 Forbidden`.

The backlog row may be a future, removed, gated, unpublished, or incorrectly indexed article record. AMC cannot use it as metric-validity evidence without a reachable source and reviewable method/evidence details. No upstream article prose, learning materials, retrieval prompts, grade-level adaptation logic, benchmark rows, datasets, model outputs, statistics tables, figures, screenshots, configs, docs text, or implementation details were copied into AMC.

## Relevance decision

Metric validity is relevant to AMC through existing Score, Shield, and Watch primitives when AMC has validation tables, confidence intervals, sample size, metric owner, construct-validity evidence, reliability checks, signed evidence refs, row hashes, CI/lifecycle gates, and no-copy proof. GAP-0795 does not supply those facts because the cited source was unavailable during live verification.

Therefore GAP-0795 is closed as a documented skip. The source is not rejected because personalized AI education, context-aware RAG, grade-level LLM adaptation, operationalization, benchmark design, or machine learning are irrelevant; it is rejected because unavailable paper metadata alone cannot substantiate an AMC metric-validity implementation, public-methodology change, or scoring claim.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Metric-validity scoring remains relevant only through AMC-owned validation tables, confidence intervals, sample sizes, and metric-owner proof. |
| Shield | No education-RAG safety, calibration, or reliability proof can be derived from an unreachable source. |
| Watch | No benchmark, regression, or metric-reliability monitor evidence can be derived from metadata alone. |
| Enforce | No runtime education, retrieval, grade-level adaptation, prompt, or policy guardrail changed. |
| Vault | No student data, prompts, traces, model outputs, learning artifacts, or secure-storage behavior changed. |
| Fleet | Education-agent context only; no orchestration or trust-topology behavior changed. |
| Passport | No portable proof-bundle field, token, or external credential changed. |
| Comply | No compliance, education-policy, privacy, or accessibility mapping changed. |

## Product closure

No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, API, CLI, Studio, or scoring code changed for GAP-0795. Existing AMC metric-validity primitives remain the only accepted path for validation table, confidence interval, sample size, metric owner, signed evidence, reliability, and regression-threshold claims.

The source-review closure is the product boundary: source unavailable, skipped as metric-validity implementation evidence, with tests ensuring source-specific identifiers stay out of metric-validity implementation modules and public methodology semantics.

## Fail-closed rule

Unavailable paper metadata alone must fail closed for metric-validity claims. Local backlog metadata, title text, DOI, OpenAlex id, personalized AI education labels, context-aware RAG labels, grade-level LLM adaptation labels, operationalization labels, benchmark labels, machine learning labels, partial abstract snippets, category labels, generated gap wording, or source identity are not enough to pass. Passing evidence requires AMC-owned validation table artifacts, confidence interval, sample size, metric owner, construct-validity mapping, reliability checks, signed evidence refs, row hashes, regression thresholds, CI/lifecycle receipts, and no-copy proof.

## No-bloat boundary

No personalized-AI-education metric-validity adapter, education-RAG evaluator, grade-level adaptation scorer, learner model, curriculum system, lesson generator, tutoring benchmark, Wiley importer, OpenAlex importer, DOI resolver, source-specific metric lens, public methodology version bump, diagnostic question-bank migration, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, or source-specific scoring path was added. No upstream article prose, learning materials, retrieval prompts, grade-level adaptation logic, benchmark rows, datasets, model outputs, statistics tables, figures, screenshots, configs, docs text, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0795PersonalizedAiEducationMetricValidityUnavailableBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
