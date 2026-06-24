# GAP-0691 - Anthropic Console Evals metric-validity boundary

- Gap: `GAP-0691`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://platform.claude.com/docs/en/test-and-evaluate/eval-tool` and `https://platform.claude.com/docs/en/test-and-evaluate/develop-tests`
- Retrieval: `2026-06-21` via browser access to the live Anthropic documentation pages; shell network remains DNS-restricted in this environment.
- Status: closed through existing metric-validity receipts; no Anthropic Console integration or product code change.

## Live source metadata

The live Anthropic docs identify `Using the Evaluation Tool` for the Claude Console and `Define success criteria and build evaluations` as the companion eval-design page. The Console page says the Claude Console Evaluation tool tests prompts under scenarios, is reached from the prompt editor `Evaluate tab`, requires dynamic variables such as `{{variable}}` for eval test sets, can create cases with `Generate Test Case`, can manually add rows, can `Import test cases from a CSV file`, can re-run a suite after prompt edits, and supports Side-by-side comparison, Quality grading on a 5-point scale, and Prompt versioning.

The eval-design page emphasizes specific/measurable success criteria, multidimensional criteria, task-specific evals with edge cases, automated grading where possible, volume for scalable grading, code-based grading, human grading, LLM-based grading, and detailed, clear rubrics. These facts identify metric-validity and reliability context only. No Anthropic docs prose beyond short metadata facts, UI labels, grading labels, rubric labels, screenshots, generated prompts, generated test cases, CSV data, examples, code snippets, API shapes, configs, or implementation details were copied into AMC.

## Relevance decision

Anthropic Console Evals is relevant to AMC metric validity because it demonstrates the product risk AMC already guards against: score movement must be grounded in task-specific eval rows, success criteria, rubrics, grader reliability, prompt-version comparison, sample size, confidence intervals, metric ownership, signed evidence refs, row hashes, CI/lifecycle gates, and no-copy proof.

This does not require an Anthropic Console importer, generated-test-case clone, prompt generator, CSV loader, grader adapter, side-by-side UI, or Claude-specific evaluation service. GAP-0691 is closed by documenting the source boundary and adding regression coverage that Console-style eval reliability evidence uses the existing generic `buildMetricValidationReport` path. Documentation metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing validation rows, sample sizes, confidence intervals, stability, grader agreement, and eval-pack row hashes. |
| Shield | Relevant through signed evidence refs, construct-validity coverage, and fail-closed CI gate behavior. |
| Watch | Relevant when metric validity is monitored over repeated runs or CI/lifecycle gates; no new Watch monitor was added. |
| Enforce | No runtime guardrail, prompt policy, or circuit breaker changed. |
| Vault | No prompt variables, CSV uploads, generated test cases, screenshots, or secure-storage behavior changed. |
| Fleet | Agent-evaluation context only; no Anthropic runner or trust topology was added. |
| Passport | No portable proof-bundle field, token, or external credential changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, docs methodology page, API, CLI, Studio, Watch monitor, Shield verifier, Anthropic Console adapter, prompt generator, generated-test-case importer, CSV importer, side-by-side comparison UI, quality-grading clone, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0691.

The focused regression exercises the existing metric-validity report with AMC-owned Anthropic Console-style fixture data. The positive path uses 18 signed validation samples plus success-criteria, task-specific row-manifest, rubric-coverage, grader-reliability, prompt-version-comparison, CI, and metric-owner evidence. The negative path fails closed when documentation metadata replaces signed validation evidence.

## Fail-closed rule

Anthropic docs titles, Claude Console labels, Evaluate tab labels, `{{variable}}` labels, Generate Test Case labels, CSV import labels, side-by-side comparison labels, 5-point quality-grading labels, prompt-versioning labels, task-specific eval labels, grading-method labels, rubric labels, local backlog metadata, or source identity alone must fail closed for metric-validity claims. Passing evidence requires AMC-owned validation table artifacts, confidence interval, sample size, metric owner, construct-validity mapping, process evidence, outcome alignment, signed evidence refs, row hashes, regression thresholds, CI/lifecycle receipts, and no-copy proof.

## No-bloat boundary

No Anthropic Console adapter, Claude Console importer, generated-test-case clone, prompt generator, CSV loader, side-by-side comparison UI, quality-grading UI, prompt-versioning subsystem, grader adapter, rubric importer, screenshot parser, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, or source-specific scoring path was added. No Anthropic docs prose beyond short metadata facts, UI labels, grading labels, rubric labels, screenshots, generated prompts, generated test cases, CSV data, examples, code snippets, API shapes, configs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0691AnthropicConsoleEvalsMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
