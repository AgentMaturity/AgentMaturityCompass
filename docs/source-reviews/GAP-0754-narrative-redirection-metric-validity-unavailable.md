# GAP-0754 - Narrative redirection metric-validity unavailable-source boundary

- Gap: `GAP-0754`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: backlog OpenAlex `W7133345812`, DOI `10.1145/3742413.3789218`, and title `Guiding, Not Railroading: Design and Evaluation of a Multi-Agent System for Narrative Redirection in Role-playing Games`
- Retrieval: `2026-06-21` via browser search and direct ACM DOI attempt; exact-title and DOI searches returned no primary result in this environment, and `https://dl.acm.org/doi/10.1145/3742413.3789218` returned `403`. Shell network remains DNS-restricted in this environment.
- Status: closed through existing metric-validity receipts; no narrative-redirection engine, role-playing game subsystem, narrative network, or multi-agent story controller added.

## Live source metadata

The local backlog identifies a paper titled `Guiding, Not Railroading: Design and Evaluation of a Multi-Agent System for Narrative Redirection in Role-playing Games`, DOI `10.1145/3742413.3789218`, OpenAlex work `W7133345812`, improvement dimension metric validity and reliability checks, category `Agent evaluation and benchmarks`, and concepts including narrative, coherence, agency, human-computer interaction, narrative network, and adventure. The backlog abstract snippet frames the source around LLMs and role-playing game narrative redirection. Browser verification on `2026-06-21` could not reach a primary publisher page or OpenAlex page: exact-title and DOI searches returned no primary result in this environment, and the ACM DOI page returned `403`.

These metadata facts are relevant to AMC as metric validity and reliability context only. Narrative redirection and role-playing agent claims need construct validity, reliability checks, sample size, confidence intervals, metric ownership, signed evidence, row hashes, regression thresholds, and no-copy proof. They do not justify importing the paper system, adding a narrative control workflow, or changing public methodology. No upstream paper prose, abstract text beyond local backlog metadata, narrative scenarios, game states, prompts, model outputs, figures, tables, benchmark rows, code, configs, or implementation details were copied into AMC.

## Relevance decision

GAP-0754 is relevant to AMC through existing metric validity and reliability checks because narrative-agent evaluation claims can look strong while lacking validated measurement proof. The accepted AMC primitive is already `buildMetricValidationReport`.

A source citation to this unavailable paper can be retained only as context when the validation packet carries AMC-owned signed evidence, validation facets, process evidence, outcome alignment, confidence interval, sample size, metric owner, row hashes, and CI/lifecycle gate receipts. DOI/OpenAlex/title/backlog metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing metric-validity reports with validation table, confidence interval, sample size, metric owner, and signed evidence. |
| Shield | Relevant through fail-closed handling for unsupported narrative, agency, role-playing, or user-control claims. |
| Watch | Relevant when metric validation is tied to regression thresholds or lifecycle receipts; no live monitor changed. |
| Enforce | No runtime narrative policy, game-master policy, or steering policy changed. |
| Vault | No story states, game logs, prompts, player profiles, outputs, or secure-storage behavior changed. |
| Fleet | Multi-agent narrative context only; no orchestration adapter added. |
| Passport | No portable proof-bundle field or credential changed. |
| Comply | Role-playing game research context only; no compliance mapping changed. |

## Product closure

GAP-0754 is closed by documenting the unavailable-source boundary and adding regression coverage over the existing metric-validity primitive. The positive path proves that narrative-redirection context can be cited only with AMC-owned validation evidence. The negative path proves DOI/OpenAlex/title/backlog metadata fails closed.

No `src/score/metricValidity.ts`, `src/diagnostic`, docs methodology page, API, CLI, Studio, diagnostic question bank, Watch monitor, Shield verifier, narrative-redirection engine, RPG subsystem, story controller, narrative network, agency evaluator, ACM importer, OpenAlex importer, paper parser, dataset importer, or scoring behavior changed for GAP-0754.

## Fail-closed rule

OpenAlex work ID, DOI, title, narrative-redirection labels, role-playing-game labels, narrative labels, coherence labels, agency labels, HCI labels, narrative-network labels, adventure labels, ACM labels, local backlog metadata, or source identity alone must fail closed for metric-validity claims. Passing evidence requires AMC-owned validation table artifacts, confidence interval, sample size, metric owner, construct-validity mapping, process evidence, outcome alignment, signed evidence refs, row hashes, regression thresholds, CI or lifecycle receipts, and no-copy proof.

## No-bloat boundary

No narrative-redirection engine, role-playing game subsystem, story controller, narrative network, game-master workflow, player model, agency evaluator, coherence scorer, story-state importer, prompt importer, output importer, benchmark mirror, ACM importer, OpenAlex importer, paper parser, dataset importer, source-specific metric lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream paper prose, abstract text beyond local backlog metadata, narrative scenarios, game states, prompts, model outputs, figures, tables, benchmark rows, code, configs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0754NarrativeRedirectionMetricValidityUnavailableBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
