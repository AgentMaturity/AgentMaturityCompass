# GAP-0756 - ReactionSeek metric-validity boundary

- Gap: `GAP-0756`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: Nature Communications `https://www.nature.com/articles/s41467-026-70180-1`, DOI `10.1038/s41467-026-70180-1`, OpenAlex `https://openalex.org/W7133224213`
- Retrieval: `2026-06-21` via live Nature article page review; shell network remains DNS-restricted in this environment.
- Status: closed through existing metric-validity receipts; no ReactionSeek pipeline, chemistry data miner, SynChat app, or cheminformatics integration added.

## Live source metadata

The live Nature Communications page identifies the source as `ReactionSeek: LLM-powered literature data mining and knowledge discovery in organic synthesis`, open access, published `02 March 2026`, volume `17`, article `3356`. Listed authors include Jiawei Li, Minzhou Li, Qi Yang, and Sanzhong Luo. Nature subjects include Cheminformatics and Organic chemistry.

Relevant source-review signals include LLM-powered literature data mining, organic synthesis, chemical knowledge extraction, multimodal mining from text and images, cheminformatics tools, prompt engineering, Organic Syntheses collection, over `95%` precision and recall for key reaction parameters, AI-ready dataset generation, Synthetic Chatbot/SynChat, catalysis trend discovery, image mining, text mining, data standardization, GLM-4V, InDraw, SMILES, OCSR, ChEMU benchmarking, F1 `0.983`, `50` article benchmark subsets, `236` molecules for characterization data, `3103` Organic Syntheses articles, `102` volumes as of 2025, and output-format conformance for `48` of `50` benchmark articles after reprocessing.

These facts are relevant to AMC as metric validity and reliability context only. Literature data-mining and chemistry extraction claims need construct validity, reliability checks, sample size, confidence intervals, metric ownership, signed evidence, row hashes, regression thresholds, and no-copy proof. They do not justify importing ReactionSeek, copying chemistry datasets, adding SynChat, or changing public methodology. No upstream article prose beyond minimal metadata facts, chemical datasets, reaction schemes, prompts, model outputs, benchmark rows, figures, tables, code, configs, or implementation details were copied into AMC.

## Relevance decision

GAP-0756 is relevant to AMC through existing metric validity and reliability checks because chemistry data-mining claims can look strong while lacking validated measurement proof. The accepted AMC primitive is already `buildMetricValidationReport`.

A source citation to this paper can be retained only as context when the validation packet carries AMC-owned signed evidence, validation facets, process evidence, outcome alignment, confidence interval, sample size, metric owner, row hashes, and CI/lifecycle gate receipts. Nature/DOI/OpenAlex/title metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing metric-validity reports with validation table, confidence interval, sample size, metric owner, and signed evidence. |
| Shield | Relevant through fail-closed handling for unsupported chemistry-mining, chatbot, or dataset claims. |
| Watch | Relevant when metric validation is tied to regression thresholds or lifecycle receipts; no live monitor changed. |
| Enforce | No runtime chemistry extraction policy, data-mining policy, or standardization policy changed. |
| Vault | No chemistry datasets, reaction schemes, prompts, outputs, or secure-storage behavior changed. |
| Fleet | Literature data-mining context only; no orchestration adapter added. |
| Passport | No portable proof-bundle field or credential changed. |
| Comply | Chemistry research context only; no compliance mapping changed. |

## Product closure

GAP-0756 is closed by documenting the live-source boundary and adding regression coverage over the existing metric-validity primitive. The positive path proves that ReactionSeek-style chemistry data-mining context can be cited only with AMC-owned validation evidence. The negative path proves Nature/DOI/OpenAlex/title metadata fails closed.

No `src/score/metricValidity.ts`, `src/diagnostic`, docs methodology page, API, CLI, Studio, diagnostic question bank, Watch monitor, Shield verifier, ReactionSeek pipeline, chemistry data miner, SynChat app, cheminformatics integration, OCSR wrapper, SMILES converter, Organic Syntheses importer, ChEMU benchmark runner, OpenAlex importer, Nature importer, paper parser, dataset importer, or scoring behavior changed for GAP-0756.

## Fail-closed rule

Nature URL, OpenAlex work ID, DOI, title, author list, ReactionSeek labels, chemistry data-mining labels, cheminformatics labels, Organic Syntheses labels, prompt-engineering labels, precision/recall labels, SynChat labels, catalysis-trend labels, image-mining labels, text-mining labels, data-standardization labels, SMILES/OCSR labels, ChEMU labels, local backlog metadata, or source identity alone must fail closed for metric-validity claims. Passing evidence requires AMC-owned validation table artifacts, confidence interval, sample size, metric owner, construct-validity mapping, process evidence, outcome alignment, signed evidence refs, row hashes, regression thresholds, CI or lifecycle receipts, and no-copy proof.

## No-bloat boundary

No ReactionSeek pipeline, chemistry data miner, SynChat app, cheminformatics integration, OCSR wrapper, SMILES converter, Organic Syntheses importer, ChEMU benchmark runner, image-mining workflow, text-mining workflow, data-standardization module, prompt importer, output importer, benchmark mirror, Nature importer, OpenAlex importer, paper parser, dataset importer, source-specific metric lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream article prose beyond minimal metadata facts, chemical datasets, reaction schemes, prompts, model outputs, benchmark rows, figures, tables, code, configs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0756ReactionSeekMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
