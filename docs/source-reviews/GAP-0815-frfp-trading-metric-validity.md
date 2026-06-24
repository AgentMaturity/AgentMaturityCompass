# GAP-0815 - FRFP trading metric-validity boundary

- Gap: `GAP-0815`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: DOI `10.5281/zenodo.20481443`, Zenodo redirect record `20481444`, `https://openalex.org/W7162947222`
- Retrieval: `2026-06-21` via live DOI/Zenodo/OpenAlex header checks. DOI returned HTTP 302 to `https://zenodo.org/doi/10.5281/zenodo.20481443`; Zenodo record `20481443` returned HTTP 302 to `/records/20481444`; OpenAlex API HEAD returned HTTP 200.
- Status: closed through existing metric-validity receipts; no FRFP importer, trading simulator, Lean formalization subsystem, shared-window evaluator, or source-specific metric lens added.

## Live source metadata

This is the same live source reviewed for GAP-0814, but GAP-0815 maps the source to metric validity and reliability checks.

The local backlog names the source as `FRFP Governance Improves LLM Trading Agents: A Lean-Formalized, Shared-Window Evaluation` and maps it to OpenAlex work `W7162947222`. The backlog summary describes an FRFP-based Human-AI protocol affecting a multi-agent trading workflow under matched infrastructure and scoring.

Relevant source-review signals include FRFP-based Human-AI protocol, multi-agent trading workflow, matched infrastructure and scoring, shared-window evaluation, Lean-Formalized governance context, protocol, baseline, bounded function, workflow, and inference concepts. These are metric-validity context only. No upstream PDF body, trading traces, Lean proof artifacts, shared-window data, prompts, tools, benchmark rows, scoring tables, code, model outputs, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC because governed multi-agent trading evaluation raises construct-validity and reliability questions: does a maturity score predict operational trust and risk control, or does it reflect a source-specific trading/protocol setup? GAP-0815 maps to AMC's existing metric-validity primitive, not to an FRFP, Lean, trading, or financial benchmark subsystem.

Before a claim can pass, AMC-owned evidence must include a validation table, confidence interval, sample size, metric owner, construct-validity checks, reliability checks, outcome-alignment checks, signed evidence references, row hashes, source refs, and CI lifecycle receipts. DOI, Zenodo, OpenAlex, title, FRFP label, Lean-Formalized label, shared-window label, matched infrastructure and scoring label, or trading-agent metadata are source metadata only and cannot replace metric-validity evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing metric-validity reports, validation facets, sample-size checks, confidence intervals, and row-hashed eval packs. |
| Shield | Relevant because high-stakes trading-agent governance claims must fail closed unless signed validation evidence proves the metric can support the claim. |
| Watch | Relevant through CI lifecycle receipts and metric-drift evidence that can be monitored over repeated diagnostic runs. |
| Enforce | No runtime trading policy, financial policy, tool-access policy, or circuit breaker changed. |
| Vault | No trading traces, Lean proof artifacts, prompts, tools, datasets, or secure-storage behavior changed. |
| Fleet | Multi-agent trading context only; no orchestration topology, trading simulator, or shared-window evaluator added. |
| Passport | No portable trust token or proof-bundle schema changed. |
| Comply | Governance context only; no compliance framework mapping changed. |

## Product closure

No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, FRFP benchmark, trading simulator, Lean formalization subsystem, shared-window evaluator, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0815.

The focused regression exercises the existing `buildMetricValidationReport` path with AMC-owned metric-validity evidence. The positive path requires signed question-row evidence, validation table coverage, sample size, confidence interval, reliability check, metric owner, outcome alignment, source references, row hashes, and a passing CI gate. The negative path fails closed when source metadata replaces signed metric-validity evidence.

## Fail-closed rule

DOI, Zenodo redirect, Zenodo record id, OpenAlex id, paper title, FRFP-based Human-AI protocol label, multi-agent trading workflow label, matched infrastructure and scoring label, shared-window evaluation label, Lean-Formalized label, protocol label, baseline label, bounded function label, workflow label, inference label, local backlog metadata, or source identity alone must fail closed for metric-validity claims. Passing evidence requires AMC-owned validation table, confidence interval, sample size, metric owner, construct-validity evidence, reliability checks, outcome-alignment checks, signed evidence refs, row hashes, source refs, CI lifecycle receipts, and no-copy proof.

## No-bloat boundary

No FRFP importer, trading simulator, Lean formalization subsystem, shared-window evaluator, PDF importer, Zenodo importer, OpenAlex importer, paper importer, dataset mirror, benchmark mirror, financial benchmark runner, trading trace importer, prompt importer, tool adapter, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific metric lens, or source-specific scoring path was added. No upstream PDF body, trading traces, Lean proof artifacts, shared-window data, prompts, tools, benchmark rows, scoring tables, code, model outputs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0815FrfpTradingMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
