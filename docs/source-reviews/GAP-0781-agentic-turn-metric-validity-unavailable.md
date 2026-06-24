# GAP-0781 - Agentic turn metric-validity unavailable-source boundary

- Gap: `GAP-0781`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://openalex.org/W7122443558`, `https://doi.org/10.3389/frai.2025.1728738`
- Retrieval: `2026-06-21` via live browser/search checks; shell network remains restricted in this environment.
- Status: source unavailable; skipped as metric-validity implementation evidence.

## Live retrieval result

The local backlog identifies the source as `From the logic of coordination to goal-directed reasoning: the agentic turn in artificial intelligence`, OpenAlex work `W7122443558`, and DOI `10.3389/frai.2025.1728738`. During this pass, live retrieval did not produce a usable primary source page or independent source page for the paper:

- exact-title search for `From the logic of coordination to goal-directed reasoning: the agentic turn in artificial intelligence` returned no usable primary/source result.
- DOI search for `10.3389/frai.2025.1728738` returned no usable primary/source result.
- OpenAlex search for `W7122443558` returned no usable primary/source result.
- direct DOI opening produced no usable primary/source page in the browser tool output.

The backlog row may be a future, removed, unreleased, private, or incorrectly indexed article record. AMC cannot use it as metric-validity evidence without a reachable source and reviewable method/evidence details. No upstream abstract prose beyond the local metadata identifiers above, logic of coordination material, goal-directed reasoning framework, agentic turn taxonomy, agency theory, artificial life content, cognitive science content, datasets, prompts, model outputs, statistics tables, screenshots, configs, docs text, or implementation details were copied into AMC.

## Relevance decision

Metric validity is relevant to AMC through existing Score, Shield, and Watch primitives when AMC has validation tables, confidence intervals, sample size, metric owner, construct-validity evidence, reliability checks, signed evidence refs, row hashes, CI/lifecycle gates, and no-copy proof. GAP-0781 does not supply those facts because the cited source was unavailable during live verification.

Therefore GAP-0781 is closed as a documented skip. The source is not rejected because logic of coordination, goal-directed reasoning, the agentic turn, agency, artificial life, cognitive science, construct validity, or agent evaluation are irrelevant; it is rejected because unavailable paper metadata alone cannot substantiate an AMC metric-validity implementation, public-methodology change, or scoring claim.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Metric-validity scoring remains relevant only through AMC-owned validation tables, confidence intervals, sample sizes, and metric-owner proof. |
| Shield | No agentic-reasoning, coordination, safety, or reliability proof can be derived from an unreachable source. |
| Watch | No benchmark, regression, or metric-reliability monitor evidence can be derived from metadata alone. |
| Enforce | No runtime coordination, agency, or goal-directed reasoning guardrail changed. |
| Vault | No benchmark data, prompts, traces, or model-output storage behavior changed. |
| Fleet | Agentic coordination context only; no orchestration or trust-topology behavior changed. |
| Passport | No portable proof-bundle field, token, or external credential changed. |
| Comply | No compliance mapping changed. |

## Product closure

No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, API, CLI, Studio, or scoring code changed for GAP-0781. Existing AMC metric-validity primitives remain the only accepted path for validation table, confidence interval, sample size, metric owner, signed evidence, and regression-threshold claims.

The source-review closure is the product boundary: source unavailable, skipped as metric-validity implementation evidence, with tests ensuring source-specific identifiers stay out of metric-validity implementation modules and public methodology semantics.

## Fail-closed rule

Unavailable paper metadata alone must fail closed for metric-validity claims. Local backlog metadata, title text, DOI, OpenAlex id, logic-of-coordination labels, goal-directed-reasoning labels, agentic-turn labels, agency labels, artificial-life labels, cognitive-science labels, construct-validity labels, partial abstract snippets, category labels, generated gap wording, or source identity are not enough to pass. Passing evidence requires AMC-owned validation table artifacts, confidence interval, sample size, metric owner, construct-validity mapping, reliability checks, signed evidence refs, row hashes, regression thresholds, CI/lifecycle receipts, and no-copy proof.

## No-bloat boundary

No agentic-turn metric-validity adapter, coordination-logic evaluator, goal-directed-reasoning simulator, agency taxonomy importer, artificial-life evaluator, cognitive-science evaluator, Frontiers/OpenAlex importer, DOI resolver, source-specific metric lens, public methodology version bump, diagnostic question-bank migration, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, or source-specific scoring path was added. No upstream abstract prose beyond local metadata identifiers, logic of coordination material, goal-directed reasoning framework, agentic turn taxonomy, agency theory, artificial life content, cognitive science content, datasets, prompts, model outputs, statistics tables, screenshots, configs, docs text, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0781AgenticTurnMetricValidityUnavailableBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
