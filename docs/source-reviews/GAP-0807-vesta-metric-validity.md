# GAP-0807 - VESTA metric-validity boundary

- Gap: `GAP-0807`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://arxiv.org/abs/2606.08531`, DOI `10.48550/arxiv.2606.08531`, `https://openalex.org/W7164034352`
- Retrieval: `2026-06-21` via browser/search checks. The arXiv page was reachable; DOI and OpenAlex were retained as source references.
- Status: closed through existing metric-validity receipts; no VESTA scenario generator, safety evaluation framework, scenario dataset, or source-specific metric lens added.

## Live source metadata

This is the same live source reviewed for GAP-0806, but GAP-0807 maps a different backlog dimension: metric validity.

The reachable arXiv page identifies `VESTA: A Fully Automated Scenario Generation and Safety Evaluation Framework for LLM Agents`, first submitted `Sun Jun 7 09:23:38 2026`, with authors Lu Jia, Haibo Tong, Feifei Zhao, Jindong Li, Dongqi Liang, Ping Wu, Qian Zhang, and Yi Zeng. The local backlog maps this metric-validity slice to OpenAlex work `W7164034352`.

Relevant source-review signals include five risk dimensions, 1,072 measurable evaluation scenarios, 12 LLM agents, two authority contexts, an average ASR of 47.1%, and process-level evaluation for LLM agents. These facts are metric-validity context only. No upstream paper prose beyond short metadata facts, generated scenarios, prompts, authority-context data, risk labels, agent outputs, evaluation scripts, figures, tables, statistics, model outputs, code, or benchmark rows were copied into AMC.

## Relevance decision

This source is relevant to AMC because a safety-evaluation framework can pressure-test whether Score/Shield/Watch claims are backed by valid metrics rather than paper metadata. GAP-0807 maps to AMC's existing metric-validity primitive, not to a VESTA subsystem.

Before a claim can pass, AMC-owned evidence must include a validation table, confidence interval, sample size, metric owner, construct-validity checks, reliability checks, outcome-alignment checks, signed evidence references, row hashes, source refs, and CI lifecycle receipts. arXiv, DOI, OpenAlex, title, scenario counts, ASR labels, risk-dimension labels, authority-context labels, or process-level evaluation labels are source metadata only and cannot replace metric-validity evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing metric-validity reports, validation facets, sample-size checks, confidence intervals, and row-hashed eval packs. |
| Shield | Relevant because safety-evaluation claims must fail closed unless signed validation evidence proves the metric can support the claim. |
| Watch | Relevant through CI lifecycle receipts and metric-drift evidence that can be monitored over repeated diagnostic runs. |
| Enforce | No runtime policy, circuit breaker, or enforcement behavior changed. |
| Vault | No prompts, generated scenarios, outputs, risk labels, or secure-storage behavior changed. |
| Fleet | Multi-agent evaluation context only; no orchestration topology, authority-context runner, or agent fleet simulator added. |
| Passport | No portable trust token or proof-bundle schema changed. |
| Comply | Safety-evaluation context only; no compliance framework mapping changed. |

## Product closure

No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, VESTA benchmark, scenario generator, safety evaluation framework, risk-dimension catalog, authority-context runner, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0807.

The focused regression exercises the existing `buildMetricValidationReport` path with AMC-owned metric-validity evidence. The positive path requires signed question-row evidence, validation table coverage, sample size, confidence interval, reliability check, metric owner, outcome alignment, source references, row hashes, and a passing CI gate. The negative path fails closed when source metadata replaces signed metric-validity evidence.

## Fail-closed rule

Paper title, arXiv URL, DOI, OpenAlex id, author list, submission date, five-risk-dimensions label, 1,072-scenario label, 12-agent label, two-authority-context label, average ASR of 47.1% label, process-level evaluation label, LLM-agent safety labels, local backlog metadata, or source identity alone must fail closed for metric-validity claims. Passing evidence requires AMC-owned validation table, confidence interval, sample size, metric owner, construct-validity evidence, reliability checks, outcome-alignment checks, signed evidence refs, row hashes, source refs, CI lifecycle receipts, and no-copy proof.

## No-bloat boundary

No VESTA benchmark, scenario generator, safety evaluation framework, risk-dimension catalog, authority-context runner, scenario importer, prompt importer, output importer, process-level evaluator, paper importer, OpenAlex importer, arXiv importer, dataset mirror, benchmark mirror, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific metric lens, or source-specific scoring path was added. No upstream paper prose beyond short metadata facts, generated scenarios, prompts, authority-context data, risk labels, agent outputs, evaluation scripts, figures, tables, statistics, model outputs, code, or benchmark rows were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0807VestaMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
