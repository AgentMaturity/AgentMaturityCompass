# GAP-0788 - NOMAD metric-validity boundary

- Gap: `GAP-0788`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: arXiv `https://arxiv.org/abs/2511.22409`, arXiv DOI `https://doi.org/10.48550/arXiv.2511.22409`, related DOI `https://doi.org/10.5220/0014301900004058`, and OpenAlex `https://openalex.org/W7139097803`
- Retrieval: `2026-06-21` via live arXiv page review; the related DOI is retained as source metadata from the arXiv/backlog record.
- Status: closed through existing metric-validity receipts; no NOMAD system, UML generator, or source-specific benchmark runner added.

## Live source metadata

The live arXiv page identifies the source as `NOMAD: A Multi-Agent LLM System for UML Class Diagram Generation from Natural Language Requirements`, arXiv `2511.22409`, submitted `27 Nov 2025`, last revised `1 May 2026` as `v2`, with arXiv DOI `10.48550/arXiv.2511.22409` and related DOI `10.5220/0014301900004058`. Listed authors include Polydoros Giannouris and Sophia Ananiadou. The page lists Software Engineering subject context.

Relevant source-review signals include UML class diagram generation from natural language requirements, role-specialised subtasks, entity extraction, relationship classification, diagram synthesis, evaluation against Northwind and human-authored UML exercises, a taxonomy of errors, structural errors, relationship errors, semantic/logical errors, and verification as a design probe. These facts are relevant to AMC as metric validity and reliability context only. No upstream article prose beyond minimal metadata facts, UML diagrams, requirements prompts, benchmark rows, error-taxonomy rows, figures, tables, statistics, model outputs, code, configs, or implementation details were copied into AMC.

## Relevance decision

GAP-0788 is relevant to AMC through existing metric validity and reliability checks because software-engineering diagram agents can produce plausible artifacts while lacking validated measurement proof. The accepted AMC primitive is already `buildMetricValidationReport`.

A source citation to this arXiv paper can be retained only as context when the validation packet carries AMC-owned signed evidence, validation facets, process evidence, outcome alignment, confidence interval, sample size, metric owner, row hashes, and CI/lifecycle gate receipts. arXiv/DOI/OpenAlex/title metadata, UML labels, dataset labels, error-taxonomy labels, or abstract metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing metric-validity reports with validation table, confidence interval, sample size, metric owner, and signed evidence. |
| Shield | Relevant through fail-closed handling for unsupported UML-generation, software-engineering, error-taxonomy, or benchmark claims. |
| Watch | Relevant when metric validation is tied to regression thresholds or lifecycle receipts; no live monitor changed. |
| Fleet | Multi-agent software-engineering context only; no orchestration adapter or topology changed. |
| Enforce | No runtime UML, requirements-analysis, or code/design policy changed. |
| Vault | No requirements, UML diagrams, datasets, prompts, outputs, or secure-storage behavior changed. |
| Passport | No portable proof-bundle field or software-engineering credential changed. |
| Comply | Software-engineering context only; no compliance mapping changed. |

## Product closure

GAP-0788 is closed by documenting the live-source boundary and adding regression coverage over the existing metric-validity primitive. The positive path proves that NOMAD-style UML-generation agent context can be cited only with AMC-owned validation evidence. The negative path proves arXiv/DOI/OpenAlex/title metadata fails closed.

No `src/score/metricValidity.ts`, `src/diagnostic`, docs methodology page, API, CLI, Studio, diagnostic question bank, Watch monitor, Shield verifier, NOMAD implementation, UML class-diagram generator, natural-language requirements parser, entity-extraction module, relationship-classification module, diagram-synthesis module, methodology version, or scoring behavior changed for GAP-0788.

## Fail-closed rule

arXiv URL, arXiv DOI, related DOI, OpenAlex work ID, title, author list, subject labels, role-specialised-subtask labels, entity-extraction labels, relationship-classification labels, diagram-synthesis labels, Northwind labels, human-authored UML exercise labels, taxonomy-of-errors labels, structural labels, relationship labels, semantic/logical labels, verification-as-design-probe labels, local backlog metadata, or source identity alone must fail closed for metric-validity claims. Passing evidence requires AMC-owned validation table artifacts, confidence interval, sample size, metric owner, construct-validity mapping, process evidence, outcome alignment, signed evidence refs, row hashes, regression thresholds, CI or lifecycle receipts, and no-copy proof.

## No-bloat boundary

No NOMAD implementation, UML class-diagram generator, natural-language requirements parser, entity-extraction module, relationship-classification module, diagram-synthesis module, Northwind importer, UML exercise importer, error-taxonomy importer, paper importer, OpenAlex importer, DOI resolver, arXiv importer, source-specific metric lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream article prose beyond minimal metadata facts, UML diagrams, requirements prompts, benchmark rows, error-taxonomy rows, figures, tables, statistics, model outputs, code, configs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0788NomadMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
