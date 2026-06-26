# GAP-0002 - LLM survey metric validity

- Gap: `GAP-0002`
- Dimension: Metric validity and reliability checks
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `A Survey of Large Language Models`
- Retrieval: Live web retrieval on 2026-06-25 from `https://link.springer.com/article/10.1007/s11704-026-60308-3`, `https://journal.hep.com.cn/fcs/EN/10.1007/s11704-026-60308-3`, `https://openalex.org/W4362515116`, and `https://doi.org/10.1007/s11704-026-60308-3`
- Status: Done

## Relevance decision

`A Survey of Large Language Models` is relevant to AMC because the source explicitly frames evaluation as a major LLM lifecycle stage and discusses benchmark-based evaluation, human-based evaluation, model-based evaluation, LLM-as-judge, and agent-as-a-judge approaches. It also identifies evaluation risks that are directly relevant to AMC Score, Shield, and Watch claims: data contamination, length bias, position bias, style bias, benchmark saturation, and a practical utility gap for real deployed systems and agentic tasks.

The source is not proof that AMC metrics are valid. It is a source-review signal that AMC metric claims must be backed by AMC-owned validation evidence. Paper metadata, DOI metadata, author lists, citation counts, journal placement, keyword labels, or benchmark taxonomy labels cannot replace validation tables, confidence intervals, sample size, metric owner, construct validity, inter-rater agreement, test-retest stability, signed evidence refs, artifact hashes, row hashes, and CI gate outcomes.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant. Score claims that cite this source must use the existing metric-validity receipt path with validation table, sample size, confidence interval, metric owner, construct validity, inter-rater agreement, test-retest stability, signed evidence refs, row hashes, and source refs. |
| Shield | Relevant only when safety or evaluator reliability claims cite LLM-as-judge, agent-as-a-judge, contamination, or bias controls. Missing AMC-owned control evidence fails closed. |
| Enforce | Not changed. No runtime policy engine, evaluator router, or benchmark enforcement path was added. |
| Vault | Not changed. No paper-specific storage, data residency, or secret-handling behavior was added. |
| Watch | Relevant. Watch-facing reliability and drift claims must remain tied to signed evidence and CI gate status instead of survey metadata. |
| Fleet | Indirectly relevant when agentic task evaluation is used as context, but no Fleet orchestration behavior changed. |
| Passport | Not changed. Portable proof bundles can consume the existing metric-validity receipt, but no Passport schema changed. |
| Comply | Not changed. Compliance mappings remain consumers of the evidence ledger and metric-validity receipt. |

## Product closure

AMC already exposes the generic metric-validity primitive through `buildMetricValidationReport`. This closure adds a focused regression proving the LLM survey can only strengthen AMC through that existing primitive. The passing path requires AMC-owned signed evidence for the validation table, sample size, confidence interval, reliability check, regression threshold, metric owner, benchmark contamination control, LLM-judge bias control, agentic task outcome proof, and practical utility alignment proof.

The fail-closed path proves that Springer, HEP, DOI, and OpenAlex metadata plus benchmark taxonomy labels do not produce a valid Score, Shield, or Watch claim by themselves. Missing signed evidence keeps the eval pack unreplayable, fails the CI gate, and rejects the overall maturity metric.

Live source facts used for the relevance review:

- Springer lists the source as a Review Article titled `A Survey of Large Language Models`, open access, Published: 09 May 2026, Volume 20, article number 2012627.
- HEP lists the citation venue as Front. Comput. Sci., 2026, 20 (12) : 2012627, DOI `10.1007/s11704-026-60308-3`.
- HEP lists the history as received 2026-02-14, accepted 2026-03-17, and published online 2026-03-24.
- The source organizes the LLM lifecycle around pre-training, post-training, utilization, and evaluation.
- The evaluation section covers benchmark-based evaluation, human-based evaluation, model-based evaluation, LLM-as-judge, and agent-as-a-judge.
- The evaluation-risk discussion includes data contamination, length bias, position bias, style bias, practical utility gaps, agentic tasks, and benchmark saturation.

## Fail-closed rule

Metadata-only LLM survey evidence fails closed. The title, DOI, OpenAlex id, publisher page, HEP page, publication date, author list, citation count, journal issue, keywords, benchmark categories, evaluation method labels, LLM-as-judge label, agent-as-a-judge label, data-contamination warning, bias warning, practical utility warning, or agentic task mention is rejected unless AMC-owned validation evidence is present.

The required AMC evidence includes a validation table, sample size, confidence interval, metric owner, construct validity check, inter-rater agreement or judge-agreement evidence, test-retest stability evidence, regression threshold, signed evidence refs, artifact hashes, row hashes, source refs, replayable eval-pack manifest, and CI gate outcome.

## No-bloat boundary

No LLM survey subsystem, benchmark importer, paper scraper, DOI adapter, OpenAlex adapter, Springer adapter, HEP adapter, eval runner, LLM-as-judge implementation, agent-as-a-judge implementation, benchmark taxonomy module, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Score method, methodology bump, package dependency, or source-specific product module was added.

No paper full text, abstract, figures, tables, benchmark rows, prompts, datasets, configs, model outputs, upstream examples, screenshots, publisher assets, or third-party implementation details were copied into AMC.

## Verification

- TDD red run: `npx vitest run tests/gap0002LlmSurveyMetricValidityBoundary.test.ts --reporter=dot` initially failed because `docs/source-reviews/GAP-0002-llm-survey-metric-validity.md` was missing while the existing metric-validity primitive passed its positive and negative paths.
- Focused verification: `npx vitest run tests/gap0002LlmSurveyMetricValidityBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Related regression verification: `npx vitest run tests/gap0002LlmSurveyMetricValidityBoundary.test.ts tests/metricValidity.test.ts tests/gap1046LiraMetricValidityBoundary.test.ts tests/gap1051ClawBenchMetricValidityBoundary.test.ts --reporter=dot` passed, 4 files / 120 tests.
- Diff check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 935 files / 7,729 tests.
