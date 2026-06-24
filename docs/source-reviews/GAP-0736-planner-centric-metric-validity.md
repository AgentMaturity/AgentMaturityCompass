# GAP-0736 - Planner-centric tool reasoning metric-validity boundary

- Gap: `GAP-0736`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: arXiv `https://arxiv.org/abs/2511.10037`, backlog OpenAlex `W7139107105`, backlog DOI `10.1609/aaai.v40i40.40676`, arXiv DOI `10.48550/arxiv.2511.10037`, and title `Beyond ReAct: A Planner-Centric Framework for Complex Tool-Augmented LLM Reasoning`
- Retrieval: `2026-06-21` via live arXiv page review and DOI/title search; shell network remains DNS-restricted in this environment.
- Status: closed through existing metric-validity receipts; no planner, DAG executor, tool-use benchmark runner, or ReAct/Plan-and-Execute subsystem added.

## Live source metadata

The live arXiv source identifies the paper as planner-centric research for complex tool-augmented LLM reasoning. Relevant source-review signals include ReAct limitations, Plan-and-Execute structure, directed acyclic graph planning, ComplexTool-Plan benchmark context, multiple tool invocation dependencies, SFT and GRPO training signals, StableToolBench evaluation context, task success and dependency management, and planner reliability for complex tool use. The live arXiv page lists authors Zhiqing Sun, Sheng Shen, Jinhui Yuan, Fei Liu, and Hai Zhao; submitted `2025-11-13`.

These facts are relevant to AMC as metric validity and reliability context only. Planner-centric tool use highlights why maturity metrics need construct validity, reliability checks, sample size, confidence intervals, metric ownership, signed evidence, row hashes, regression thresholds, and no-copy proof. It does not justify importing the paper's framework, adding a DAG planner, running ComplexTool-Plan, or changing public methodology. No upstream paper prose beyond minimal metadata facts, benchmark rows, tool traces, plans, DAGs, prompts, training recipes, model outputs, figures, tables, algorithms, code, configs, or implementation details were copied into AMC.

## Relevance decision

GAP-0736 is relevant to AMC through existing metric validity and reliability checks because planner-centric tool-use claims can look strong while lacking validated measurement proof. The accepted AMC primitive is already `buildMetricValidationReport`.

A source citation to this paper can be retained only as context when the validation packet carries AMC-owned signed evidence, validation facets, process evidence, outcome alignment, confidence interval, sample size, metric owner, row hashes, and CI/lifecycle gate receipts. Paper/arXiv/DOI/OpenAlex metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing metric-validity reports with validation table, confidence interval, sample size, metric owner, and signed evidence. |
| Shield | Relevant through fail-closed handling for unsupported planner, DAG, tool-use, or benchmark claims. |
| Watch | Relevant when metric validation is tied to regression thresholds or lifecycle receipts; no live monitor changed. |
| Enforce | No runtime planner, DAG executor, tool router, or policy-enforcement behavior changed. |
| Vault | No plans, traces, prompts, tool outputs, benchmark rows, or secure-storage behavior changed. |
| Fleet | Tool-augmented reasoning context only; no orchestration adapter added. |
| Passport | No portable proof-bundle field or credential changed. |
| Comply | Planning benchmark context only; no compliance mapping changed. |

## Product closure

GAP-0736 is closed by documenting the live-source boundary and adding regression coverage over the existing metric-validity primitive. The positive path proves that planner-centric tool reasoning context can be cited only with AMC-owned validation evidence. The negative path proves arXiv/DOI/OpenAlex/title metadata fails closed.

No `src/score/metricValidity.ts`, `src/diagnostic`, docs methodology page, API, CLI, Studio, diagnostic question bank, Watch monitor, Shield verifier, planner, DAG executor, Plan-and-Execute runtime, ReAct runtime, ComplexTool-Plan benchmark runner, StableToolBench adapter, SFT/GRPO trainer, arXiv importer, OpenAlex importer, paper parser, dataset importer, or scoring behavior changed for GAP-0736.

## Fail-closed rule

ArXiv id, OpenAlex work ID, DOI, title, author list, planner-centric labels, ReAct labels, Plan-and-Execute labels, DAG labels, ComplexTool-Plan labels, StableToolBench labels, multi-tool labels, SFT labels, GRPO labels, task-success labels, dependency-management labels, local backlog metadata, or source identity alone must fail closed for metric-validity claims. Passing evidence requires AMC-owned validation table artifacts, confidence interval, sample size, metric owner, construct-validity mapping, process evidence, outcome alignment, signed evidence refs, row hashes, regression thresholds, CI or lifecycle receipts, and no-copy proof.

## No-bloat boundary

No planner, DAG executor, Plan-and-Execute runtime, ReAct runtime, tool router, ComplexTool-Plan benchmark runner, StableToolBench adapter, SFT trainer, GRPO trainer, tool-trace importer, plan importer, benchmark mirror, arXiv importer, OpenAlex importer, paper parser, dataset importer, source-specific metric lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream paper prose beyond minimal metadata facts, benchmark rows, tool traces, plans, DAGs, prompts, training recipes, model outputs, figures, tables, algorithms, code, configs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0736PlannerCentricMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
