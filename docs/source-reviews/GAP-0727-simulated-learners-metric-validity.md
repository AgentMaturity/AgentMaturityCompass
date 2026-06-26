# GAP-0727 - Simulated learners metric-validity boundary

- Gap: `GAP-0727`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: arXiv `https://arxiv.org/abs/2604.04361`, backlog OpenAlex `W7151487588`, DOI `10.48550/arxiv.2604.04361`, and title `Developing Authentic Simulated Learners for Mathematics Teacher Learning: Insights from Three Approaches with Large Language Models`
- Retrieval: `2026-06-21` via live arXiv page review; arXiv lists authors Jie Cao, Ha Nguyen, Selim Yavuz, Boran Yu, Shuguang Wang, Pavneet Kaur Bharaj, and Dionne Cross Francis; submitted `2026-04-06`; accepted at AIED 2026.
- Status: closed through existing metric-validity receipts; no simulated learner product, mathematics-teacher training workflow, fine-tuning path, multi-agent learner simulator, or DPO training system added.

## Live source metadata

The live arXiv source studies simulated learners for mathematics teacher learning. Relevant source-review signals include LLMs acting as students, few-shot prompting baselines, fine-tuning, multi-agent, and direct preference optimization approaches, cognitive and linguistic authenticity, explicit reasoning behind student strategies, and interviews with elementary mathematics pre-service teachers and researchers with `n = 8`.

These facts are relevant to AMC as metric validity and reliability context only. Simulated learner research highlights why maturity scores need construct validity, reliability checks, sample size, confidence intervals, metric ownership, signed evidence, row hashes, regression thresholds, and no-copy proof. It does not justify a simulated-student subsystem, education-domain benchmark, teacher-training workflow, fine-tuning pipeline, multi-agent classroom simulator, DPO trainer, or methodology change. No upstream paper prose beyond minimal metadata facts, student responses, teaching tasks, interview data, prompts, model outputs, rubrics, datasets, figures, tables, code, configs, or implementation details were copied into AMC.

## Relevance decision

GAP-0727 is relevant to AMC through existing metric validity and reliability checks because simulated-agent authenticity metrics can be overclaimed without validated measurement proof. The accepted AMC primitive is already `buildMetricValidationReport`.

A source citation to this paper can be retained only as context when the validation packet carries AMC-owned signed evidence, validation facets, process evidence, outcome alignment, confidence interval, sample size, metric owner, row hashes, and CI/lifecycle gate receipts. Paper/arXiv/DOI/OpenAlex metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing metric-validity reports with validation table, confidence interval, sample size, metric owner, and signed evidence. |
| Shield | Relevant through fail-closed handling for unsupported authenticity, pedagogy, simulation-quality, or educational-effectiveness claims. |
| Watch | Relevant when metric validation is tied to regression thresholds or lifecycle receipts; no live monitor changed. |
| Enforce | No runtime education workflow, learner simulation, or policy enforcement behavior changed. |
| Vault | No student responses, teacher interviews, prompts, rubrics, training data, or secure-storage behavior changed. |
| Fleet | Multi-agent learner-simulation context only; no classroom simulation or orchestration adapter added. |
| Passport | No portable proof-bundle field or credential changed. |
| Comply | Education context only; no compliance mapping changed. |

## Product closure

GAP-0727 is closed by documenting the live-source boundary and adding regression coverage over the existing metric-validity primitive. The positive path proves that simulated-learner authenticity context can be cited only with AMC-owned validation evidence. The negative path proves arXiv/DOI/OpenAlex/title metadata fails closed.

No `src/score/metricValidity.ts`, `src/diagnostic`, docs methodology page, API, CLI, Studio, diagnostic question bank, Watch monitor, Shield verifier, simulated learner product, teacher-training workflow, fine-tuning path, multi-agent classroom simulator, DPO trainer, education benchmark, arXiv importer, OpenAlex importer, paper parser, dataset importer, or scoring behavior changed for GAP-0727.

## Fail-closed rule

ArXiv id, OpenAlex work ID, DOI, title, author list, simulated-learner labels, mathematics-education labels, fine-tuning labels, multi-agent labels, DPO labels, authenticity labels, interview labels, AIED label, local backlog metadata, or source identity alone must fail closed for metric-validity claims. Passing evidence requires AMC-owned validation table artifacts, confidence interval, sample size, metric owner, construct-validity mapping, process evidence, outcome alignment, signed evidence refs, row hashes, regression thresholds, CI or lifecycle receipts, and no-copy proof.

## No-bloat boundary

No simulated learner product, mathematics-teacher training workflow, classroom simulator, fine-tuning pipeline, DPO trainer, multi-agent learner simulator, education-domain benchmark, student-response generator, interview analyzer, arXiv importer, OpenAlex importer, paper parser, dataset importer, source-specific metric lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream paper prose beyond minimal metadata facts, student responses, teaching tasks, interview data, prompts, model outputs, rubrics, datasets, figures, tables, code, configs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0727SimulatedLearnersMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
