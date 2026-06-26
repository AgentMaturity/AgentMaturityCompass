# GAP-0728 - AVO metric-validity boundary

- Gap: `GAP-0728`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: arXiv `https://arxiv.org/abs/2603.24517`, backlog OpenAlex `W7140855608`, DOI `10.48550/arxiv.2603.24517`, and title `AVO: Agentic Variation Operators for Autonomous Evolutionary Search`
- Retrieval: `2026-06-21` via live arXiv page review; arXiv lists authors Terry Chen, Zhifan Ye, Bing Xu, Zihao Ye, Timmy Liu, Ali Hassani, Tianqi Chen, Andrew Kerr, Haicheng Wu, Yang Xu, Yu-Jung Chen, Hanfeng Chen, Aditya Kane, Ronny Krashinsky, Ming-Yu Liu, Vinod Grover, Luis Ceze, Roger Bringmann, John Tran, Wei Liu, Fung Xie, Michael Lightstone, and Humphrey Shi; submitted `2026-03-25`.
- Status: closed through existing metric-validity receipts; no AVO engine, evolutionary search loop, kernel optimizer, GPU benchmark runner, or autonomous coding-agent workflow added.

## Live source metadata

The live arXiv source describes AVO as an agentic variation-operator approach for autonomous evolutionary search. Relevant source-review signals include autonomous coding-agent loops, current-lineage context, domain-specific knowledge, execution feedback, propose/repair/critique/verify cycles, attention-kernel optimization, NVIDIA B200 evaluation context, multi-day autonomous evolution, and transfer to grouped-query attention.

These facts are relevant to AMC as metric validity and reliability context only. Agentic evolutionary search and performance-optimization claims highlight why maturity metrics need construct validity, reliability checks, sample size, confidence intervals, metric ownership, signed evidence, row hashes, regression thresholds, and no-copy proof. They do not justify an AVO engine, kernel optimizer, GPU benchmark runner, CUDA/Triton workflow, autonomous code-evolution loop, or methodology change. No upstream paper prose beyond minimal metadata facts, kernel code, optimization recipes, benchmark rows, GPU configs, prompts, model outputs, lineage data, figures, tables, code, or implementation details were copied into AMC.

## Relevance decision

GAP-0728 is relevant to AMC through existing metric validity and reliability checks because autonomous optimization claims can look impressive while lacking validated measurement proof. The accepted AMC primitive is already `buildMetricValidationReport`.

A source citation to this paper can be retained only as context when the validation packet carries AMC-owned signed evidence, validation facets, process evidence, outcome alignment, confidence interval, sample size, metric owner, row hashes, and CI/lifecycle gate receipts. Paper/arXiv/DOI/OpenAlex metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing metric-validity reports with validation table, confidence interval, sample size, metric owner, and signed evidence. |
| Shield | Relevant through fail-closed handling for unsupported optimization, performance, autonomy, or coding-agent claims. |
| Watch | Relevant when metric validation is tied to regression thresholds or lifecycle receipts; no live monitor changed. |
| Enforce | No runtime code-editing, kernel-generation, GPU-execution, or policy enforcement behavior changed. |
| Vault | No kernel code, GPU traces, benchmark data, model outputs, prompts, lineage data, or secure-storage behavior changed. |
| Fleet | Coding-agent/evolutionary-search context only; no orchestration adapter added. |
| Passport | No portable proof-bundle field or credential changed. |
| Comply | Hardware/performance research context only; no compliance mapping changed. |

## Product closure

GAP-0728 is closed by documenting the live-source boundary and adding regression coverage over the existing metric-validity primitive. The positive path proves that AVO-style autonomous evolutionary search context can be cited only with AMC-owned validation evidence. The negative path proves arXiv/DOI/OpenAlex/title metadata fails closed.

No `src/score/metricValidity.ts`, `src/diagnostic`, docs methodology page, API, CLI, Studio, diagnostic question bank, Watch monitor, Shield verifier, AVO engine, evolutionary search loop, kernel optimizer, GPU benchmark runner, CUDA/Triton adapter, autonomous coding-agent workflow, arXiv importer, OpenAlex importer, paper parser, dataset importer, or scoring behavior changed for GAP-0728.

## Fail-closed rule

ArXiv id, OpenAlex work ID, DOI, title, author list, AVO labels, evolutionary-search labels, kernel-optimization labels, GPU labels, lineage labels, execution-feedback labels, autonomous-coding-agent labels, performance-improvement labels, local backlog metadata, or source identity alone must fail closed for metric-validity claims. Passing evidence requires AMC-owned validation table artifacts, confidence interval, sample size, metric owner, construct-validity mapping, process evidence, outcome alignment, signed evidence refs, row hashes, regression thresholds, CI or lifecycle receipts, and no-copy proof.

## No-bloat boundary

No AVO engine, evolutionary search loop, kernel optimizer, GPU benchmark runner, CUDA adapter, Triton adapter, autonomous coding-agent workflow, lineage tracker, execution-feedback runner, grouped-query attention benchmark, hardware performance evaluator, arXiv importer, OpenAlex importer, paper parser, dataset importer, source-specific metric lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream paper prose beyond minimal metadata facts, kernel code, optimization recipes, benchmark rows, GPU configs, prompts, model outputs, lineage data, figures, tables, code, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0728AvoMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
