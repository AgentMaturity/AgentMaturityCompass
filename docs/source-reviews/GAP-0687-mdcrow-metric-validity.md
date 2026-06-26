# GAP-0687 - MDCrow metric-validity boundary

- Gap: `GAP-0687`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://arxiv.org/abs/2502.09565`, backlog DOI `10.1088/2632-2153/ae4b07`, backlog OpenAlex `W7131651590`
- Retrieval: `2026-06-21` via browser access to the live arXiv page; shell network remains DNS-restricted in this environment.
- Status: closed through existing metric-validity receipts; no MDCrow integration or product code change.

## Live source metadata

The live arXiv page identifies `MDCrow: Automating Molecular Dynamics Workflows with Large Language Models`, dated `Thu Feb 13 18:19:20 2025`, with rendered paper date `March 22, 2026`. The backlog also records DOI `10.1088/2632-2153/ae4b07` and OpenAlex work `W7131651590`; those identifiers are retained as backlog identity metadata for this slice.

The live source describes an agentic LLM assistant for molecular dynamics workflows. Relevant metric-validity signals include `40 expert-designed tools`, `25 tasks`, task complexity between `1 and 10 subtasks`, expert-recorded completion/accuracy/error/hallucination observations, robustness by prompt style and task complexity, coefficient of variation, Spearman correlation, and model comparisons including `gpt-4o` and `llama3-405b`. These facts identify metric-validity context only. No upstream paper prose beyond short metadata facts, task prompts, figures, tables, simulation files, generated outputs, code, tool definitions, benchmark rows, formulas, plots, configs, examples, appendices, or implementation details were copied into AMC.

## Relevance decision

MDCrow is relevant to AMC metric validity because it evaluates an agentic workflow with explicit sample size, task complexity, expert evaluation, robustness checks, model comparisons, statistical tests, hallucinations, and runtime-error observations. That maps to AMC Score/Shield/Watch when the evidence is AMC-owned: validation tables, confidence intervals, sample size, metric owner, construct-validity facets, process evidence, outcome alignment, signed evidence refs, row hashes, CI/lifecycle gates, and no-copy proof.

This does not require a molecular-dynamics subsystem. GAP-0687 is closed by documenting the source boundary and adding regression coverage that MDCrow-style task robustness evidence uses the existing generic `buildMetricValidationReport` path. Paper metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing validation rows, sample sizes, confidence intervals, stability, and eval-pack row hashes. |
| Shield | Relevant through signed evidence refs, construct-validity coverage, and fail-closed CI gate behavior. |
| Watch | Relevant when metric validity is monitored over repeated runs or CI/lifecycle gates; no new Watch monitor was added. |
| Enforce | No runtime guardrail, molecular-dynamics tool policy, or circuit breaker changed. |
| Vault | No protein data, simulation files, literature corpus, private dataset, or secure-storage behavior changed. |
| Fleet | Agentic workflow context only; no MDCrow runner or multi-agent trust topology was added. |
| Passport | No portable proof-bundle field, token, or external credential changed. |
| Comply | No regulated-domain or scientific-compliance mapping changed. |

## Product closure

No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, docs methodology page, API, CLI, Studio, Watch monitor, Shield verifier, molecular-dynamics adapter, OpenMM/MDTraj/PaperQA wrapper, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0687.

The focused regression exercises the existing metric-validity report with AMC-owned MDCrow-style fixture data. The positive path uses 25 signed validation samples plus task-manifest, subtask-scale, expert-evaluation, robustness, CI, and metric-owner evidence. The negative path fails closed when paper metadata replaces signed validation evidence.

## Fail-closed rule

MDCrow paper title, arXiv metadata, DOI/OpenAlex fields, model names, task counts, subtask counts, coefficient-of-variation labels, Spearman correlation labels, hallucination/error labels, tool counts, local backlog metadata, or source identity alone must fail closed for metric-validity claims. Passing evidence requires AMC-owned validation table artifacts, confidence interval, sample size, metric owner, construct-validity mapping, process evidence, outcome alignment, signed evidence refs, row hashes, regression thresholds, CI/lifecycle receipts, and no-copy proof.

## No-bloat boundary

No MDCrow adapter, molecular-dynamics workflow runner, OpenMM integration, MDTraj integration, PaperQA integration, PDB/protein tool wrapper, simulation file importer, literature corpus importer, task-prompt importer, plot parser, benchmark table importer, statistical-test wrapper, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, or source-specific scoring path was added. No upstream paper prose beyond short metadata facts, task prompts, figures, tables, simulation files, generated outputs, code, tool definitions, benchmark rows, formulas, plots, configs, examples, appendices, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0687MdcrowMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
