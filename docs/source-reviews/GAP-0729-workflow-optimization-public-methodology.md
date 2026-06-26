# GAP-0729 - Workflow optimization public-methodology boundary

- Gap: `GAP-0729`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: arXiv `https://arxiv.org/abs/2603.22386`, backlog OpenAlex `W7140304056`, DOI `10.48550/arxiv.2603.22386`, and title `From Static Templates to Dynamic Runtime Graphs: A Survey of Workflow Optimization for LLM Agents`
- Retrieval: `2026-06-21` via live arXiv page review; arXiv lists authors Ling Yue, Kushal Raj Bhandari, Ching-Yun Ko, Dhaval Patel, Shuxin Lin, Nianjun Zhou, Jianxi Gao, Pin-Yu Chen, and Shaowu Pan; submitted `2026-03-23`.
- Status: skipped as a public-methodology version change; no AMC methodology version bump, diagnostic migration, badge change, graph runtime, or workflow-optimization subsystem added.

## Live source metadata

The live arXiv source describes a survey of workflow optimization for LLM agents, including workflow graphs that combine LLM calls, retrieval, tool use, code execution, memory updates, and verification. Its source-review signal is the distinction between static templates and dynamic runtime graphs, plus the separation of reusable workflow templates, run-specific realized graphs, execution traces, runtime adaptation, graph-level properties, execution cost, robustness, structural variation, and evaluation signals.

These facts are useful context for AMC public-methodology discipline because workflow graphs and runtime adaptation can affect what a maturity score means. They do not by themselves define an AMC methodology version, scoring rule, changelog, deprecation notice, migration guidance, validation artifact, signed evidence receipt, badge rule, or public comparability contract. No upstream abstract prose beyond minimal metadata facts, survey taxonomy, paper tables, literature lists, figures, examples, code, prompts, configs, workflows, or implementation details were copied into AMC.

## Relevance decision

GAP-0729 is relevant to AMC only as public-methodology boundary evidence. The source reinforces that public claims about agent workflow evaluation need versioned scoring semantics, reproducible evidence, trace-aware validation, and migration guidance before they can alter Score, Shield, or Watch behavior.

The accepted AMC primitive is the existing public methodology manifest and versioning path. This slice intentionally does not change that path because the arXiv/DOI/OpenAlex/title metadata and survey framing do not provide AMC-owned methodology proof. A source citation to the survey can be retained only as context; any public methodology claim still requires AMC-owned methodology versioning receipts, validation artifacts, signed evidence refs, row hashes, badge assurance, and report-binding proof.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Background workflow-optimization context only; no accepted public scoring-methodology proof or version bump. |
| Shield | Background robustness and runtime-adaptation context only; no new safety threshold or assurance rule. |
| Watch | Background trace and execution-variation context only; no new drift methodology, monitor, or alert. |
| Enforce | No runtime graph execution, policy enforcement, or circuit-breaker behavior changed. |
| Vault | No data, memory, trace, secret, privacy, or storage behavior changed. |
| Fleet | Multi-agent workflow context only; no orchestration engine, trust topology, or fleet adapter added. |
| Passport | No portable proof-bundle field, badge credential, or external proof token changed. |
| Comply | No compliance mapping or regulated-domain methodology changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `src/badge/badgeCli.ts`, API, CLI, Studio, diagnostic question bank, scoring code, Watch monitor, Shield verifier, Enforce runtime, graph runtime, workflow optimizer, or public methodology docs changed for GAP-0729.

The closure is a no-bloat source-review boundary: workflow optimization, static templates, dynamic runtime graphs, workflow graphs, runtime adaptation, graph-level evaluation, arXiv, DOI, OpenAlex, and survey labels are not accepted as public methodology proof without AMC-owned methodology receipts.

## Fail-closed rule

ArXiv id, DOI, OpenAlex work ID, title, author list, survey labels, workflow optimization labels, static-template labels, dynamic-runtime-graph labels, workflow-graph labels, agentic-computation-graph labels, runtime-adaptation labels, evaluation-signal labels, trace labels, local backlog metadata, or source identity alone must fail closed for public methodology claims. Passing evidence requires AMC-owned methodology versioning receipts, versioned scoring rules, changelog rows, deprecation notice, migration guidance, validation artifacts, signed evidence refs, row hashes, badge assurance, report-binding proof, and no-copy proof.

## No-bloat boundary

No workflow-optimization taxonomy, graph runtime, agentic computation graph engine, orchestration engine, survey mirror, paper importer, arXiv importer, OpenAlex importer, runtime-adaptation simulator, workflow-template catalog, trace parser, methodology version bump, badge parameter, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Enforce policy module, Passport field, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream abstract prose beyond minimal metadata facts, survey taxonomy, paper tables, literature lists, figures, examples, code, prompts, configs, workflows, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0729WorkflowOptimizationPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
