# GAP-0723 - Vipera metric-validity boundary

- Gap: `GAP-0723`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: arXiv `https://arxiv.org/abs/2510.05742`, backlog OpenAlex `W4414978759`, DOI `10.1145/3772318.3791942`, and title `Vipera: Blending Visual and LLM-Driven Guidance for Systematic Auditing of Text-to-Image Generative AI`
- Retrieval: `2026-06-21` via browser search and arXiv page review; arXiv lists authors Yanwei Huang, Wesley Hanwen Deng, Sijia Xiao, Motahhare Eslami, Jason I. Hong, Arpit Narechania, and Adam Perer; date `2025-10-07`; T2I auditing and visual analytics context.
- Status: closed through existing metric-validity receipts; no Vipera UI, text-to-image audit workspace, scene-graph engine, image audit corpus, or LLM suggestion workflow added.

## Live source metadata

The live arXiv source identifies Vipera as an interactive auditing system for text-to-image generative AI. Relevant source-review signals include formative work with five AI auditors, design goals for systematic audits, visual auditing cues including scene graphs, LLM-powered suggestions, structured criteria exploration, bookmarked evidence/note support, and a controlled user study with 24 participants experienced in AI auditing.

These facts are relevant to AMC as metric validity and reliability context only. T2I auditing research highlights why scores should be backed by construct validity, reliability checks, sample size, confidence intervals, metric ownership, and reproducible evidence. It does not justify a Vipera UI, T2I image generation workflow, scene-graph analyzer, visual audit dataset, LLM suggestion engine, or methodology change. No upstream paper prose beyond minimal metadata facts, figures, screenshots, UI layout, prompts, generated images, scene graphs, audit criteria, study materials, model outputs, datasets, code, configs, or implementation details were copied into AMC.

## Relevance decision

GAP-0723 is relevant to AMC through existing metric validity and reliability checks because systematic auditing claims are only credible when score metrics carry AMC-owned validation evidence. The accepted AMC primitive is already `buildMetricValidationReport`.

A source citation to Vipera can be retained only as context when the validation packet carries AMC-owned signed evidence, validation facets, process evidence, outcome alignment, confidence interval, sample size, metric owner, row hashes, and CI/lifecycle gate receipts. Paper/arXiv/DOI/OpenAlex metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing metric-validity reports with validation table, confidence interval, sample size, metric owner, and signed evidence. |
| Shield | Relevant through fail-closed handling for unsupported auditing, bias, safety, or systematicity claims. |
| Watch | Relevant when metric validation is tied to regression thresholds or lifecycle receipts; no live monitor changed. |
| Enforce | No runtime image-audit, prompt, or policy enforcement behavior changed. |
| Vault | No prompts, generated images, audit notes, study data, scene graphs, datasets, or secure-storage behavior changed. |
| Fleet | Agent-evaluation context only; no multi-agent audit workflow or T2I orchestration adapter added. |
| Passport | No portable proof-bundle field or credential changed. |
| Comply | Responsible-AI/audit context only; no compliance mapping changed. |

## Product closure

GAP-0723 is closed by documenting the live-source boundary and adding regression coverage over the existing metric-validity primitive. The positive path proves that Vipera-style visual/LLM-assisted audit context can be cited only with AMC-owned validation evidence. The negative path proves arXiv/DOI/OpenAlex/title metadata fails closed.

No `src/score/metricValidity.ts`, `src/diagnostic`, docs methodology page, API, CLI, Studio, diagnostic question bank, Watch monitor, Shield verifier, Vipera UI, text-to-image audit workspace, scene-graph engine, generated-image corpus, LLM suggestion engine, image-audit benchmark importer, paper parser, dataset importer, or scoring behavior changed for GAP-0723.

## Fail-closed rule

ArXiv id, OpenAlex work ID, DOI, title, author list, T2I labels, visual-analytics labels, scene-graph labels, LLM-suggestion labels, user-study labels, audit-interface labels, publisher identity, local backlog metadata, or source identity alone must fail closed for metric-validity claims. Passing evidence requires AMC-owned validation table artifacts, confidence interval, sample size, metric owner, construct-validity mapping, process evidence, outcome alignment, signed evidence refs, row hashes, regression thresholds, CI or lifecycle receipts, and no-copy proof.

## No-bloat boundary

No Vipera UI, text-to-image audit workspace, visual analytics panel, scene-graph engine, image generator, audit criteria organizer, LLM suggestion engine, note/evidence UI, study-data importer, generated-image corpus, T2I benchmark pack, ACM importer, OpenAlex importer, arXiv importer, paper parser, dataset importer, source-specific metric lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream paper prose beyond minimal metadata facts, figures, screenshots, UI layout, prompts, generated images, scene graphs, audit criteria, study materials, model outputs, datasets, code, configs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0723ViperaMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
