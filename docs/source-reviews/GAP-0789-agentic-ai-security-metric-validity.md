# GAP-0789 - Agentic AI Security metric-validity boundary

- Gap: `GAP-0789`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: arXiv `https://arxiv.org/abs/2510.23883`, arXiv DOI `https://doi.org/10.48550/arXiv.2510.23883`, backlog IEEE DOI `https://doi.org/10.1109/access.2026.3675554`, and OpenAlex `https://openalex.org/W7138839765`
- Retrieval: `2026-06-21` via live arXiv page review; the IEEE DOI is retained as backlog metadata until independently reviewable.
- Status: closed through existing metric-validity receipts; no agentic-security taxonomy, defense framework, or source-specific benchmark runner added.

## Live source metadata

The live arXiv page identifies the source as `Agentic AI Security: Threats, Defenses, Evaluation, and Open Challenges`, arXiv `2510.23883`, submitted `27 Oct 2025`, with arXiv DOI `10.48550/arXiv.2510.23883`. Listed authors include Shrestha Datta, Shahriar Kabir Nahin, Anshuman Chhabra, and Prasant Mohapatra.

Relevant source-review signals include agentic AI systems with planning, tool use, memory, and autonomy; operation across web, software, and physical environments; a taxonomy of threats; benchmarks and evaluation methodologies; defense strategies; technical and governance perspectives; and secure-by-design agent systems. These facts are directly relevant to AMC security evaluation context, but they still require AMC-owned metric validity proof. No upstream article prose beyond minimal metadata facts, threat taxonomy rows, defense tables, benchmark rows, prompts, datasets, figures, statistics, model outputs, code, configs, or implementation details were copied into AMC.

## Relevance decision

GAP-0789 is relevant to AMC through existing metric validity and reliability checks because agentic-security evaluations can look persuasive while lacking validated measurement proof. The accepted AMC primitive is already `buildMetricValidationReport`.

A source citation to this arXiv paper can be retained only as context when the validation packet carries AMC-owned signed evidence, validation facets, process evidence, outcome alignment, confidence interval, sample size, metric owner, row hashes, and CI/lifecycle gate receipts. arXiv/IEEE DOI/OpenAlex/title metadata, security taxonomy labels, defense labels, benchmark labels, or abstract metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing metric-validity reports with validation table, confidence interval, sample size, metric owner, and signed evidence. |
| Shield | Strongly relevant through fail-closed handling for unsupported threat, defense, benchmark, and security-evaluation claims. |
| Watch | Relevant when metric validation is tied to regression thresholds or lifecycle receipts; no live monitor changed. |
| Fleet | Agentic/multi-agent security context only; no orchestration adapter or topology changed. |
| Enforce | No runtime defense, tool-use, memory, web, software, or physical-environment policy changed. |
| Vault | No threat data, prompts, logs, memory contents, or secure-storage behavior changed. |
| Passport | No portable proof-bundle field or security credential changed. |
| Comply | Governance context only; no compliance mapping changed. |

## Product closure

GAP-0789 is closed by documenting the live-source boundary and adding regression coverage over the existing metric-validity primitive. The positive path proves that agentic-security context can be cited only with AMC-owned validation evidence. The negative path proves arXiv/DOI/OpenAlex/title metadata fails closed.

No `src/score/metricValidity.ts`, `src/diagnostic`, docs methodology page, API, CLI, Studio, diagnostic question bank, Watch monitor, Shield verifier, agentic-security taxonomy module, defense framework, benchmark importer, threat evaluator, governance workflow, methodology version, or scoring behavior changed for GAP-0789.

## Fail-closed rule

arXiv URL, arXiv DOI, IEEE DOI, OpenAlex work ID, title, author list, planning labels, tool-use labels, memory labels, autonomy labels, web/software/physical-environment labels, taxonomy-of-threat labels, benchmark/evaluation-methodology labels, defense-strategy labels, technical/governance labels, secure-by-design labels, local backlog metadata, or source identity alone must fail closed for metric-validity claims. Passing evidence requires AMC-owned validation table artifacts, confidence interval, sample size, metric owner, construct-validity mapping, process evidence, outcome alignment, signed evidence refs, row hashes, regression thresholds, CI or lifecycle receipts, and no-copy proof.

## No-bloat boundary

No agentic-security taxonomy module, defense framework, benchmark importer, threat evaluator, governance workflow, web-agent security adapter, software-agent security adapter, physical-environment security adapter, memory-security evaluator, tool-use security evaluator, paper importer, OpenAlex importer, DOI resolver, arXiv importer, source-specific metric lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream article prose beyond minimal metadata facts, threat taxonomy rows, defense tables, benchmark rows, prompts, datasets, figures, statistics, model outputs, code, configs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0789AgenticAiSecurityMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
