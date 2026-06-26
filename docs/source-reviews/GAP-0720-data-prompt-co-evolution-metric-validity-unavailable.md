# GAP-0720 - Data-Prompt Co-Evolution metric-validity unavailable-source boundary

- Gap: `GAP-0720`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: backlog OpenAlex `W7128480797`, DOI `10.1145/3772318.3791222`, and title `Data-Prompt Co-Evolution: Growing Test Sets to Refine LLM Behavior`
- Retrieval: `2026-06-21` via browser search and direct DOI attempts; exact-title, DOI, OpenAlex, and ACM publisher-domain searches did not surface a reachable primary source in this environment. Shell network remains restricted in this sandbox.
- Status: closed through existing metric-validity receipts only when AMC-owned validation evidence exists; no data-prompt co-evolution, growing-test-set, prompt-refinement, or benchmark-generation subsystem added.

## Live source metadata

The local backlog identifies a paper titled `Data-Prompt Co-Evolution: Growing Test Sets to Refine LLM Behavior`, DOI `10.1145/3772318.3791222`, OpenAlex work `W7128480797`, improvement dimension metric validity and reliability checks, category `Agent evaluation and benchmarks`, and concepts including computer science, test, workflow, process, set, iterative and incremental development, artificial intelligence, and machine learning. Browser verification on `2026-06-21` could not reach a primary publisher page or OpenAlex page: exact-title, DOI, OpenAlex, and ACM publisher-domain searches did not surface a reachable primary source.

These facts are insufficient for a product, benchmark, or scoring claim. Data-prompt co-evolution, growing test sets, prompt refinement, and iterative and incremental development are relevant evaluation context only when AMC can validate the metric with signed validation rows, construct-validity coverage, process evidence, outcome alignment, confidence intervals, sample size, metric owner, row hashes, regression thresholds, and no-copy proof. No upstream paper prose, abstract text beyond local backlog metadata, method details, prompts, generated test sets, benchmark rows, evaluation results, tables, figures, screenshots, datasets, model outputs, or implementation details were copied into AMC.

## Relevance decision

GAP-0720 is not accepted as standalone AMC evidence because the primary source was unavailable for live review and the remaining facts are metadata-only. The data-prompt co-evolution theme maps to existing metric validity and reliability checks only as context; it does not justify a source-specific benchmark generator, prompt optimizer, test-set grower, data-prompt loop, or methodology change.

The accepted AMC primitive is already `buildMetricValidationReport`. A source citation to this paper can be retained only as context when the validation packet carries AMC-owned signed evidence, validation facets, process evidence, outcome alignment, confidence interval, sample size, metric owner, row hashes, and CI/lifecycle gate receipts. Metadata-only paper identity must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through existing metric-validity reports with validation table, confidence interval, sample size, metric owner, and signed evidence. |
| Shield | Relevant only when unsupported claims about model behavior, prompt refinement, or benchmark validity are rejected and fail closed. |
| Watch | Relevant only when metric validation is tied to regression thresholds or lifecycle receipts; no live monitor changed. |
| Enforce | No runtime policy, prompt-growth guardrail, or enforcement behavior changed. |
| Vault | No prompts, generated tests, benchmark rows, model outputs, datasets, or secure-storage behavior changed. |
| Fleet | Agent-evaluation context only; no multi-agent orchestration, prompt-evolution worker, or benchmark generator added. |
| Passport | No portable proof-bundle field or credential changed. |
| Comply | No legal, regulatory, or audit-control mapping changed. |

## Product closure

GAP-0720 is closed by documenting the unavailable-source boundary and adding regression coverage over the existing metric-validity primitive. The positive path proves that data-prompt co-evolution context can be cited only with AMC-owned validation evidence. The negative path proves DOI/OpenAlex/title metadata fails closed.

No `src/score/metricValidity.ts`, `src/diagnostic`, docs methodology page, API, CLI, Studio, diagnostic question bank, Watch monitor, Shield verifier, prompt-refinement loop, generated-test-set builder, benchmark-row generator, ACM importer, OpenAlex importer, paper parser, dataset importer, or scoring behavior changed for GAP-0720.

## Fail-closed rule

OpenAlex work ID, DOI, title, workflow labels, test-set labels, data-prompt co-evolution labels, prompt-refinement labels, iterative-development labels, machine-learning labels, publisher identity, local backlog metadata, or source identity alone must fail closed for metric-validity claims. Passing evidence requires AMC-owned validation table artifacts, confidence interval, sample size, metric owner, construct-validity mapping, process evidence, outcome alignment, signed evidence refs, row hashes, regression thresholds, CI or lifecycle receipts, and no-copy proof.

## No-bloat boundary

No prompt-refinement loop, generated-test-set builder, data-prompt co-evolution runner, benchmark-row generator, prompt optimizer, test-suite grower, ACM importer, OpenAlex importer, paper parser, dataset importer, source-specific metric lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream paper prose, abstract text beyond local backlog metadata, method details, prompts, generated test sets, benchmark rows, evaluation results, tables, figures, screenshots, datasets, model outputs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0720DataPromptCoEvolutionMetricValidityUnavailableBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
