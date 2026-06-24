# GAP-0787 - EpidemIQs metric-validity boundary

- Gap: `GAP-0787`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: arXiv `https://arxiv.org/abs/2510.00024`, arXiv DOI `https://doi.org/10.48550/arXiv.2510.00024`, backlog IEEE DOI `https://doi.org/10.1109/tai.2026.3666830`, and OpenAlex `https://openalex.org/W7131082530`
- Retrieval: `2026-06-21` via live arXiv page review; the IEEE DOI was not directly opened through the browser safety path and is retained only as backlog metadata until independently reviewable.
- Status: closed through existing metric-validity receipts; no epidemic-modeling agent, prompt-to-paper workflow, or source-specific benchmark runner added.

## Live source metadata

The live arXiv page identifies the source as `EpidemIQs: Prompt-to-Paper LLM Agents for Epidemic Modeling and Analysis`, arXiv `2510.00024`, submitted `24 Sep 2025`, last revised `25 Feb 2026` as `v2`, with arXiv DOI `10.48550/arXiv.2510.00024`. Listed authors include Mohammad Hossein Samaei, Faryad Darabi Sahneh, Lee W. Cohnstaedt, and Caterina Scoglio. The page lists subjects Social and Information Networks and Artificial Intelligence.

Relevant source-review signals include prompt-to-paper epidemic-modeling workflows, five predefined research phases, scientist agent and task-expert agent roles, GPT 4.1 and GPT 4.1 Mini model context, average token usage around `870K`, approximate cost of `$1.57 per study`, average task success rate of 79%, LLM-as-Judge and human expert reviews, workflow reliability, documentation, visualization, and task-quality evaluation. These facts are relevant to AMC as metric validity and reliability context only. No upstream article prose beyond minimal metadata facts, epidemic models, prompts, generated papers, datasets, figures, tables, statistics, model outputs, code, configs, or implementation details were copied into AMC.

## Relevance decision

GAP-0787 is relevant to AMC through existing metric validity and reliability checks because prompt-to-paper research agents can produce plausible scientific workflows while lacking validated measurement proof. The accepted AMC primitive is already `buildMetricValidationReport`.

A source citation to this arXiv paper can be retained only as context when the validation packet carries AMC-owned signed evidence, validation facets, process evidence, outcome alignment, confidence interval, sample size, metric owner, row hashes, and CI/lifecycle gate receipts. arXiv/IEEE DOI/OpenAlex/title metadata, model labels, task-success labels, cost labels, token labels, or abstract metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing metric-validity reports with validation table, confidence interval, sample size, metric owner, and signed evidence. |
| Shield | Relevant through fail-closed handling for unsupported epidemic-modeling, prompt-to-paper, judge, cost, token, or benchmark claims. |
| Watch | Relevant when metric validation is tied to regression thresholds or lifecycle receipts; no live monitor changed. |
| Fleet | Multi-agent/scientist-agent context only; no orchestration adapter or topology changed. |
| Enforce | No runtime epidemic-modeling, research-paper-generation, or tool-use policy changed. |
| Vault | No epidemic datasets, generated papers, prompts, outputs, or secure-storage behavior changed. |
| Passport | No portable proof-bundle field or scientific credential changed. |
| Comply | Public-health and scientific-workflow context only; no compliance mapping changed. |

## Product closure

GAP-0787 is closed by documenting the live-source boundary and adding regression coverage over the existing metric-validity primitive. The positive path proves that EpidemIQs-style epidemic-modeling agent context can be cited only with AMC-owned validation evidence. The negative path proves arXiv/DOI/OpenAlex/title metadata fails closed.

No `src/score/metricValidity.ts`, `src/diagnostic`, docs methodology page, API, CLI, Studio, diagnostic question bank, Watch monitor, Shield verifier, epidemic-modeling agent, prompt-to-paper workflow, scientist-agent runtime, task-expert agent, LLM-as-judge runner, public-health simulator, methodology version, or scoring behavior changed for GAP-0787.

## Fail-closed rule

arXiv URL, arXiv DOI, IEEE DOI, OpenAlex work ID, title, author list, subject labels, prompt-to-paper labels, five-phase labels, scientist-agent labels, task-expert labels, GPT 4.1 labels, GPT 4.1 Mini labels, token-use labels, cost labels, task-success labels, LLM-as-Judge labels, human-expert-review labels, epidemic-modeling labels, local backlog metadata, or source identity alone must fail closed for metric-validity claims. Passing evidence requires AMC-owned validation table artifacts, confidence interval, sample size, metric owner, construct-validity mapping, process evidence, outcome alignment, signed evidence refs, row hashes, regression thresholds, CI or lifecycle receipts, and no-copy proof.

## No-bloat boundary

No epidemic-modeling agent, prompt-to-paper workflow, scientist-agent runtime, task-expert agent, LLM-as-judge runner, human-expert-review workflow, public-health simulator, epidemic dataset importer, paper importer, OpenAlex importer, DOI resolver, arXiv importer, source-specific metric lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream article prose beyond minimal metadata facts, epidemic models, prompts, generated papers, datasets, figures, tables, statistics, model outputs, code, configs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0787EpidemiqsMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
