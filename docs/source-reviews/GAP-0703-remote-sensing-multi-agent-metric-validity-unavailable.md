# GAP-0703 - Remote sensing multi-agent metric-validity unavailable-source boundary

- Gap: `GAP-0703`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: backlog OpenAlex `W7119479065`, DOI `10.1080/20964471.2025.2600178`, and title `An LLM-based multi-agent system for remote sensing analysis`
- Retrieval: `2026-06-21` via browser search and direct URL attempts; exact-title, DOI, OpenAlex, Taylor & Francis publisher-domain, and quoted-title searches did not surface a reachable primary source in this environment. Shell network remains DNS-restricted in this environment.
- Status: closed through existing metric-validity receipts only when AMC-owned validation evidence exists; no remote-sensing, GIS, or multi-agent analysis subsystem added.

## Live source metadata

The local backlog identifies a paper titled `An LLM-based multi-agent system for remote sensing analysis`, DOI `10.1080/20964471.2025.2600178`, OpenAlex work `W7119479065`, improvement dimension metric validity and reliability checks, category `Agent evaluation and benchmarks`, and concepts including workflow, remote sensing, task management, visualization, baseline, remote sensing application, and security token. Browser verification on `2026-06-21` could not reach a primary publisher page or OpenAlex page: exact-title, DOI, OpenAlex, Taylor & Francis publisher-domain, and quoted-title searches did not surface a reachable primary source.

These facts are insufficient for a product, domain, or scoring claim. Remote-sensing multi-agent analysis is relevant evaluation context only when AMC can validate the metric with signed validation rows, construct-validity coverage, process evidence, outcome alignment, confidence intervals, sample size, metric owner, row hashes, regression thresholds, and no-copy proof. No upstream paper prose, abstract text beyond local backlog metadata, method details, remote-sensing workflows, geospatial examples, imagery data, visualization outputs, datasets, tables, figures, prompts, model outputs, screenshots, or implementation details were copied into AMC.

## Relevance decision

GAP-0703 is not accepted as standalone AMC evidence because the primary source was unavailable for live review and the remaining facts are metadata-only. The remote-sensing multi-agent theme maps to existing metric-validity receipts only as context; it does not justify a source-specific metric, GIS adapter, remote-sensing benchmark pack, or methodology change.

The accepted AMC primitive is already `buildMetricValidationReport`. A source citation to this paper can be retained only as context when the validation packet carries AMC-owned signed evidence, validation facets, process evidence, outcome alignment, confidence interval, sample size, metric owner, row hashes, and CI/lifecycle gate receipts. Metadata-only paper identity must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through existing metric-validity reports with validation table, confidence interval, sample size, metric owner, and signed evidence. |
| Shield | Relevant only when unsupported remote-sensing or model-quality claims are rejected and fail closed. |
| Watch | Relevant only when metric validation is tied to regression thresholds or lifecycle receipts; no live monitor changed. |
| Enforce | No runtime policy, geospatial workflow guardrail, or enforcement behavior changed. |
| Vault | No imagery, geospatial data, prompts, model outputs, datasets, tokens, or secure-storage behavior changed. |
| Fleet | Multi-agent analysis context only; no remote-sensing agent workflow or orchestration adapter added. |
| Passport | No portable proof-bundle field or credential changed. |
| Comply | No remote-sensing, geospatial, environmental, defense, or audit-control mapping changed. |

## Product closure

GAP-0703 is closed by documenting the unavailable-source boundary and adding regression coverage over the existing metric-validity primitive. The positive path proves that remote-sensing context can be cited only with AMC-owned validation evidence. The negative path proves DOI/OpenAlex/title metadata fails closed.

No `src/score/metricValidity.ts`, `src/diagnostic`, docs methodology page, API, CLI, Studio, diagnostic question bank, Watch monitor, Shield verifier, remote-sensing workflow, GIS adapter, imagery processor, visualization layer, benchmark importer, paper parser, dataset importer, or scoring behavior changed for GAP-0703.

## Fail-closed rule

OpenAlex work ID, DOI, title, workflow labels, remote-sensing labels, multi-agent labels, visualization labels, baseline labels, task-management labels, security-token labels, publisher identity, local backlog metadata, or source identity alone must fail closed for metric-validity claims. Passing evidence requires AMC-owned validation table artifacts, confidence interval, sample size, metric owner, construct-validity mapping, process evidence, outcome alignment, signed evidence refs, row hashes, regression thresholds, CI or lifecycle receipts, and no-copy proof.

## No-bloat boundary

No remote-sensing workflow, GIS adapter, imagery processor, visualization layer, geospatial data importer, remote-sensing benchmark pack, multi-agent analysis runtime, Taylor & Francis importer, OpenAlex importer, paper parser, dataset importer, source-specific metric lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream paper prose, abstract text beyond local backlog metadata, method details, remote-sensing workflows, geospatial examples, imagery data, visualization outputs, datasets, tables, figures, prompts, model outputs, screenshots, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0703RemoteSensingMetricValidityUnavailableBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
