# GAP-0726 - Networked LLM agents metric-validity boundary

- Gap: `GAP-0726`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: arXiv `https://arxiv.org/abs/2510.25003`, backlog OpenAlex `W7152549665`, DOI `10.1145/3774904.3792580`, and title `Emergent Coordinated Behaviors in Networked LLM Agents: Modeling the Strategic Dynamics of Information Operations`
- Retrieval: `2026-06-21` via browser search and arXiv page review; arXiv lists authors Gian Marco Orlando, Jinyi Ye, Valerio La Gatta, Mahdi Saeedi, Vincenzo Moscato, Emilio Ferrara, and Luca Luceri; date `2025-10-28`; networked LLM-agent coordination and information-operations context.
- Status: closed through existing metric-validity receipts; no information-operation simulator, social-network environment, coordination dashboard, or campaign-analysis subsystem added.

## Live source metadata

The live arXiv source studies coordination among generative agents in simulated information-operation campaigns. Relevant source-review signals include generative agent-based modeling, IO and organic agents, common-goal/teammate-awareness/collective-decision regimes, network density, clustering, reciprocity, narrative convergence, re-share amplification, hashtag adoption, cross-group diffusion, 50-agent simulations, repeated runs, and an interactive coordination dashboard.

These facts are relevant to AMC as metric validity and reliability context only. They highlight why agent-evaluation metrics need construct validity, reliability checks, sample size, confidence intervals, metric ownership, signed evidence, row hashes, regression thresholds, and no-copy proof. They do not justify an IO simulator, political campaign model, social graph runner, coordination dashboard, narrative-convergence metric, hashtag tracker, or methodology change. No upstream paper prose beyond minimal metadata facts, prompts, social-media datasets, campaign scenarios, agent personas, graph data, dashboard views, figures, tables, code, configs, generated posts, or implementation details were copied into AMC.

## Relevance decision

GAP-0726 is relevant to AMC through existing metric validity and reliability checks because coordination and impact metrics can be overclaimed without validated measurement proof. The accepted AMC primitive is already `buildMetricValidationReport`.

A source citation to this paper can be retained only as context when the validation packet carries AMC-owned signed evidence, validation facets, process evidence, outcome alignment, confidence interval, sample size, metric owner, row hashes, and CI/lifecycle gate receipts. Paper/arXiv/DOI/OpenAlex metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing metric-validity reports with validation table, confidence interval, sample size, metric owner, and signed evidence. |
| Shield | Relevant through fail-closed handling for unsupported coordination, influence, safety, or information-operation claims. |
| Watch | Relevant when metric validation is tied to regression thresholds or lifecycle receipts; no live monitor changed. |
| Enforce | No runtime campaign, graph, social simulation, or policy enforcement behavior changed. |
| Vault | No prompts, personas, social data, generated posts, dashboard traces, or secure-storage behavior changed. |
| Fleet | Multi-agent coordination context only; no information-operation agent workflow or orchestration adapter added. |
| Passport | No portable proof-bundle field or credential changed. |
| Comply | Societal-risk context only; no compliance mapping changed. |

## Product closure

GAP-0726 is closed by documenting the live-source boundary and adding regression coverage over the existing metric-validity primitive. The positive path proves that networked LLM-agent coordination context can be cited only with AMC-owned validation evidence. The negative path proves arXiv/DOI/OpenAlex/title metadata fails closed.

No `src/score/metricValidity.ts`, `src/diagnostic`, docs methodology page, API, CLI, Studio, diagnostic question bank, Watch monitor, Shield verifier, IO simulator, social-network environment, coordination dashboard, narrative-convergence evaluator, hashtag tracker, campaign-analysis workflow, arXiv importer, OpenAlex importer, paper parser, dataset importer, or scoring behavior changed for GAP-0726.

## Fail-closed rule

ArXiv id, OpenAlex work ID, DOI, title, author list, IO labels, coordination labels, network-density labels, clustering labels, reciprocity labels, narrative-convergence labels, hashtag-adoption labels, dashboard labels, local backlog metadata, or source identity alone must fail closed for metric-validity claims. Passing evidence requires AMC-owned validation table artifacts, confidence interval, sample size, metric owner, construct-validity mapping, process evidence, outcome alignment, signed evidence refs, row hashes, regression thresholds, CI or lifecycle receipts, and no-copy proof.

## No-bloat boundary

No information-operation simulator, social-network environment, coordination dashboard, graph runner, narrative-convergence evaluator, hashtag tracker, campaign-analysis workflow, agent persona generator, Twitter/X dataset importer, dashboard importer, arXiv importer, OpenAlex importer, paper parser, dataset importer, source-specific metric lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream paper prose beyond minimal metadata facts, prompts, social-media datasets, campaign scenarios, agent personas, graph data, dashboard views, figures, tables, code, configs, generated posts, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0726NetworkedLlmAgentsMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
