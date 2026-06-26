# GAP-0991 - Healthcare agent taxonomy live-drift boundary

- Gap: `GAP-0991`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: OpenAlex work page at `https://openalex.org/W7118158543`, OpenAlex API record at `https://api.openalex.org/works/W7118158543`, DOI at `https://doi.org/10.1109/access.2026.3651218`, IEEE Xplore redirect target at `https://ieeexplore.ieee.org/document/11329025/`, Crossref API at `https://api.crossref.org/works/10.1109/access.2026.3651218`, and local backlog metadata.
- Retrieval: `2026-06-24` live source review through OpenAlex API inspection, DOI redirect check, IEEE endpoint header check, Crossref API inspection, and local backlog metadata.
- Status: closed through existing Watch live score and behavior drift receipts only; no healthcare taxonomy subsystem, clinical benchmark runner, seven-dimensional taxonomy scorer, paper importer, IEEE importer, Crossref importer, OpenAlex importer, DOI resolver, dataset mirror, medical workflow, physician benchmark adapter, API route, CLI command, Studio panel, Watch monitor, Shield verifier, package dependency, or source-specific drift monitor added.
- Linear: `AMC-1270`

## Live source metadata

OpenAlex identifies `Agentic AI in Healthcare and Medicine: A Seven-Dimensional Taxonomy for Empirical Evaluation of LLM-Based Agents` as a `2026` journal article in `IEEE Access`, with publication_date `2026-01-01`, DOI `https://doi.org/10.1109/access.2026.3651218`, open access status `gold`, CC BY license metadata, referenced_works_count `63`, and cited_by_count `6`.

Crossref identifies DOI `10.1109/access.2026.3651218` as a journal article in `IEEE Access`, publisher `Institute of Electrical and Electronics Engineers (IEEE)`, published `2026`, reference-count `134`, ISSN `2169-3536`, and CC BY license metadata. Crossref author metadata includes Shubham Vatsal, Harsh Dubey, and Aditi Singh.

The DOI redirected to `https://ieeexplore.ieee.org/document/11329025/`. From this environment, IEEE Xplore returned a CloudFront WAF challenge (`x-amzn-waf-action: challenge`), so source-review closure uses OpenAlex, DOI, and Crossref metadata plus redirect/header reachability rather than copying or parsing article content.

OpenAlex concept metadata included Computer science, Knowledge management, Benchmarking, Typology, Health care, Rubric, Empirical research, Competence, Core competency, Data science, Empirical evidence, and Heuristics.

No article text, abstract prose beyond short metadata facts, IEEE page prose, PDF content, taxonomy rows, rubric text, clinical scenarios, patient cases, benchmark rows, tables, figures, prompts, model outputs, evaluation examples, screenshots, or implementation details were copied into AMC.

## Relevance decision

GAP-0991 is relevant to AMC only through existing Watch live score and behavior drift receipts. Healthcare agent evaluation taxonomies can help identify what must be monitored, but a paper taxonomy is not an AMC drift signal by itself.

The accepted AMC primitives are already `runLiveScoreBehaviorDrift`, `verifyLiveDriftReceipt`, and `buildLiveDriftWatchAlerts`. Source context may be cited only when AMC has its own baseline distribution, live sample rows, behavior signatures, drift statistics, alert receipts, source refs, receipt hashes, signed evidence refs, row hashes, Watch alert or waiver proof, and no-copy proof. Paper identity, DOI reachability, IEEE reachability, OpenAlex/Crossref metadata, healthcare labels, taxonomy labels, rubric labels, concept labels, citation counts, reference counts, open-access labels, or local backlog metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through score deltas calculated from AMC-owned baseline and live rows. |
| Shield | Relevant when drift indicates safety, clinical-action, refusal, invalid-action, error-attribution, or unsupported-action regressions. |
| Enforce | No runtime medical policy, clinical workflow, guardrail, or circuit breaker changed. |
| Vault | No patient data, clinical vignette, taxonomy dataset, PDF, prompt, model output, private artifact, or secure-storage behavior changed. |
| Watch | Primary surface. Existing live score and behavior drift receipts already model baseline distribution, live sample, drift statistic, alert receipt, and Watch alert projection. |
| Fleet | Healthcare-agent evaluation context only; no Fleet topology, routing, or orchestration changed. |
| Passport | No portable proof-bundle field, token, or external credential changed. |
| Comply | No medical-device, clinical, HIPAA, EU AI Act, NIST, ISO, SOC 2, or regulatory mapping changed. |

## Product closure

No product code changed. The focused regression proves existing Watch primitives can accept healthcare-agent taxonomy context only when AMC has signed baseline/live evidence. The positive path exercises score mean, behavior signature, error rate, latency, cost, physician task success, and clinical-action safety drift alerts. The negative path fails closed when paper metadata replaces signed evidence.

## Fail-closed rule

Healthcare taxonomy source identity, title, DOI reachability, IEEE redirect reachability, OpenAlex reachability, Crossref reachability, IEEE Access metadata, author metadata, publication dates, open-access status, concept labels, healthcare labels, seven-dimensional taxonomy labels, empirical-evaluation labels, rubric labels, competency labels, WAF challenge status, citation counts, reference counts, CC BY labels, local backlog metadata, or source identity alone are not live AMC evidence.

A live score and behavior drift claim must fail closed unless each baseline and live sample has evidence refs and signed evidence refs, plus enough rows to compute baseline distribution, live sample, drift statistic, alert receipt, receipt hash, and Watch alert or waiver proof.

## No-bloat boundary

No healthcare taxonomy subsystem, clinical benchmark runner, seven-dimensional taxonomy scorer, paper importer, IEEE importer, Crossref importer, OpenAlex importer, DOI resolver, dataset mirror, medical workflow, physician benchmark adapter, patient-record loader, rubric parser, taxonomy parser, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Score method, Passport field, methodology version bump, package dependency, or source-specific drift monitor was added.

No article text, abstract prose beyond short metadata facts, IEEE page prose, PDF content, taxonomy rows, rubric text, clinical scenarios, patient cases, benchmark rows, tables, figures, prompts, model outputs, evaluation examples, screenshots, or implementation details were copied.

## Verification

- TDD expected failure: `npx vitest run tests/gap0991HealthcareAgentTaxonomyLiveDriftBoundary.test.ts --reporter=dot` failed before this document existed with `ENOENT: no such file or directory, open 'docs/source-reviews/GAP-0991-healthcare-agent-taxonomy-live-drift.md'`; 3 live-drift primitive tests passed.
- Focused regression: `npx vitest run tests/gap0991HealthcareAgentTaxonomyLiveDriftBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired regression: `npx vitest run tests/gap0990EvalScopeMetricValidityBoundary.test.ts tests/gap0991HealthcareAgentTaxonomyLiveDriftBoundary.test.ts --reporter=dot` passed, 2 files / 8 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed; narrow token scan over the new GAP-0991 doc/test found no matches.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 838 files / 7,347 tests.
