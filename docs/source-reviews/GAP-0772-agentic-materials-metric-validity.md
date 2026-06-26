# GAP-0772 - Agentic materials metric-validity boundary

- Gap: `GAP-0772`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: arXiv `https://arxiv.org/abs/2602.00169`, DOI `https://doi.org/10.48550/arXiv.2602.00169`, OpenAlex `https://openalex.org/W7127510601`
- Retrieval: `2026-06-21` via live arXiv page review; shell network remains DNS-restricted in this environment.
- Status: closed through existing metric-validity receipts; no materials-science agent, DFT/robotic-lab adapter, or scientific-discovery workflow added.

## Live source metadata

The live arXiv page identifies the source as `Towards Agentic Intelligence for Materials Science`, arXiv `2602.00169`, submitted `29 Jan 2026`, revised `6 Feb 2026` as version 2, with DOI `10.48550/arXiv.2602.00169`. Listed authors include Huan Zhang, Yizhan Li, Wenhao Huang, Ziyu Hou, Yu Song, Xuye Liu, Farshid Effaty, Jinya Jiang, Sifan Wu, Qianggang Ding, Izumi Takahara, Leonard R. MacGillivray, Teruyasu Mizoguchi, Tianshu Yu, Lizi Liao, Yuyu Luo, Yu Rong, Jia Li, Ying Diao, Heng Ji, and Bang Liu. The page lists `81 pages` and subjects Materials Science and Artificial Intelligence.

Relevant source-review signals include agentic systems for materials discovery, planning/action/learning across a discovery loop, corpus curation, pretraining, domain adaptation, instruction tuning, goal-conditioned agents, simulation platforms, experimental platforms, credit assignment, aligned terminology/evaluation/workflow stages, literature mining, materials characterization, property prediction, materials design, process optimization, external tools, DFT, robotic labs, autonomy, memory, tool use, long-horizon goals, and safety-aware materials agents.

These facts are relevant to AMC as metric validity and reliability context only. Scientific discovery claims need construct validity, reliability checks, sample size, confidence intervals, metric ownership, signed evidence, row hashes, regression thresholds, and no-copy proof. They do not justify importing the survey, copying materials-science workflows, adding DFT or robotic-lab adapters, or changing public methodology. No upstream article prose beyond minimal metadata facts, datasets, prompts, model outputs, benchmark rows, figures, tables, code, configs, or implementation details were copied into AMC.

## Relevance decision

GAP-0772 is relevant to AMC through existing metric validity and reliability checks because agentic materials-science workflows can look mature while lacking validated measurement proof. The accepted AMC primitive is already `buildMetricValidationReport`.

A source citation to this arXiv paper can be retained only as context when the validation packet carries AMC-owned signed evidence, validation facets, process evidence, outcome alignment, confidence interval, sample size, metric owner, row hashes, and CI/lifecycle gate receipts. arXiv/DOI/OpenAlex/title metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing metric-validity reports with validation table, confidence interval, sample size, metric owner, and signed evidence. |
| Shield | Relevant through fail-closed handling for unsupported scientific-discovery, materials-agent, DFT, robotic-lab, or benchmark claims. |
| Watch | Relevant when metric validation is tied to regression thresholds or lifecycle receipts; no live monitor changed. |
| Fleet | Multi-agent/autonomy context only; no orchestration adapter or topology changed. |
| Enforce | No runtime materials-science, DFT, lab, or tool-use policy changed. |
| Vault | No materials datasets, lab traces, prompts, outputs, or secure-storage behavior changed. |
| Passport | No portable proof-bundle field or scientific credential changed. |
| Comply | Scientific-discovery context only; no compliance mapping changed. |

## Product closure

GAP-0772 is closed by documenting the live-source boundary and adding regression coverage over the existing metric-validity primitive. The positive path proves that agentic materials-science context can be cited only with AMC-owned validation evidence. The negative path proves arXiv/DOI/OpenAlex/title metadata fails closed.

No `src/score/metricValidity.ts`, `src/diagnostic`, docs methodology page, API, CLI, Studio, diagnostic question bank, Watch monitor, Shield verifier, materials-science agent, DFT adapter, robotic-lab adapter, scientific-discovery workflow, corpus importer, materials benchmark runner, methodology version, or scoring behavior changed for GAP-0772.

## Fail-closed rule

arXiv URL, DOI, OpenAlex work ID, title, author list, subject labels, agentic materials labels, discovery-loop labels, corpus-curation labels, domain-adaptation labels, instruction-tuning labels, simulation/experimental platform labels, DFT labels, robotic-lab labels, autonomy labels, memory labels, tool-use labels, safety-aware labels, local backlog metadata, or source identity alone must fail closed for metric-validity claims. Passing evidence requires AMC-owned validation table artifacts, confidence interval, sample size, metric owner, construct-validity mapping, process evidence, outcome alignment, signed evidence refs, row hashes, regression thresholds, CI or lifecycle receipts, and no-copy proof.

## No-bloat Boundary

No materials-science agent, DFT adapter, robotic-lab adapter, scientific-discovery workflow, corpus importer, survey importer, arXiv importer, OpenAlex importer, materials benchmark runner, simulation platform integration, experimental platform integration, source-specific metric lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream article prose beyond minimal metadata facts, datasets, prompts, model outputs, benchmark rows, figures, tables, code, configs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0772AgenticMaterialsMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
