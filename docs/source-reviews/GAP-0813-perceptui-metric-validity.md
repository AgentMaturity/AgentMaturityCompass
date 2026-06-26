# GAP-0813 - PerceptUI metric-validity boundary

- Gap: `GAP-0813`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://arxiv.org/abs/2606.05697`, DOI `10.48550/arxiv.2606.05697`, `https://openalex.org/W7163715795`
- Retrieval: `2026-06-21` via live DOI/arXiv/OpenAlex header checks. DOI returned HTTP 302 to `https://arxiv.org/abs/2606.05697`; arXiv returned HTTP 200 headers; OpenAlex API HEAD returned HTTP 200.
- Status: closed through existing metric-validity receipts; no PerceptUI importer, synthetic-user evaluator, UI/UX benchmark runner, persona generator, or source-specific metric lens added.

## Live source metadata

This is the same live source reviewed for GAP-0812, but GAP-0813 maps the source to metric validity and reliability checks.

The reachable arXiv source identifies `PerceptUI: LLM Agents as Human-Aligned Synthetic Users for UI/UX Evaluation`, first submitted `Thu Jun  4 04:35:16 2026`, with authors Nicolas Bougie, Xiaotong Ye, Gian Maria Marconi, and Narimasa Watanabe. The local backlog maps this metric-validity slice to OpenAlex work `W7163715795`.

Relevant source-review signals include persona-conditioned UI/UX evaluation, interface-related questions, natural-language rationales, contrastive reflection fine-tuning, teacher-generated rationales, human decisions, reflective prompt-evolution, failure traces, unseen questions and personas, and population-level response distributions. These facts are metric-validity context only. No upstream personas, UI tasks, interface questions, rationales, prompts, reflection traces, failure traces, datasets, model outputs, response distributions, code, tables, figures, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC because synthetic-user UI/UX evaluation raises construct-validity and reliability questions: does a maturity score actually predict a trustworthy operational evaluation rather than a persona or prompt artifact? GAP-0813 maps to AMC's existing metric-validity primitive, not to a PerceptUI subsystem.

Before a claim can pass, AMC-owned evidence must include a validation table, confidence interval, sample size, metric owner, construct-validity checks, reliability checks, outcome-alignment checks, signed evidence references, row hashes, source refs, and CI lifecycle receipts. arXiv, DOI, OpenAlex, title, PerceptUI label, persona-conditioned UI/UX evaluation label, natural-language rationales, contrastive reflection fine-tuning, human decisions, or population-level response distributions are source metadata only and cannot replace metric-validity evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing metric-validity reports, validation facets, sample-size checks, confidence intervals, and row-hashed eval packs. |
| Shield | Relevant because UI/UX synthetic-user claims must fail closed unless signed validation evidence proves the metric can support the claim. |
| Watch | Relevant through CI lifecycle receipts and metric-drift evidence that can be monitored over repeated diagnostic runs. |
| Enforce | No runtime UI policy, persona policy, or circuit breaker changed. |
| Vault | No personas, UI tasks, prompts, rationales, response distributions, or secure-storage behavior changed. |
| Fleet | Synthetic-user agent context only; no orchestration topology, persona generator, or UI evaluator added. |
| Passport | No portable trust token or proof-bundle schema changed. |
| Comply | Human-alignment context only; no compliance framework mapping changed. |

## Product closure

No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, PerceptUI benchmark, synthetic-user evaluator, persona generator, UI/UX benchmark runner, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0813.

The focused regression exercises the existing `buildMetricValidationReport` path with AMC-owned metric-validity evidence. The positive path requires signed question-row evidence, validation table coverage, sample size, confidence interval, reliability check, metric owner, outcome alignment, source references, row hashes, and a passing CI gate. The negative path fails closed when source metadata replaces signed metric-validity evidence.

## Fail-closed rule

Paper title, arXiv URL, DOI, OpenAlex id, author list, submission date, PerceptUI label, persona-conditioned UI/UX evaluation label, interface-related questions label, natural-language rationales label, contrastive reflection fine-tuning label, teacher-generated rationales label, human decisions label, reflective prompt-evolution label, failure traces label, unseen questions and personas label, population-level response distributions label, local backlog metadata, or source identity alone must fail closed for metric-validity claims. Passing evidence requires AMC-owned validation table, confidence interval, sample size, metric owner, construct-validity evidence, reliability checks, outcome-alignment checks, signed evidence refs, row hashes, source refs, CI lifecycle receipts, and no-copy proof.

## No-bloat boundary

No PerceptUI importer, synthetic-user evaluator, persona generator, UI/UX benchmark runner, interface-question importer, rationale importer, reflection trace importer, failure trace importer, response-distribution importer, paper importer, OpenAlex importer, arXiv importer, dataset mirror, benchmark mirror, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific metric lens, or source-specific scoring path was added. No upstream personas, UI tasks, interface questions, rationales, prompts, reflection traces, failure traces, datasets, model outputs, response distributions, code, tables, figures, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0813PerceptUiMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
