# GAP-0825 - OpenClaw metric-validity boundary

- Gap: `GAP-0825`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: DOI `10.54254/2755-2721/2026.gu33494`, `https://doi.org/10.54254/2755-2721/2026.gu33494`, `https://ace.ewapub.com/article/view/33494`, OpenAlex `W7161768934`
- Retrieval: `2026-06-21` via live DOI, publisher, and OpenAlex header checks. DOI returned HTTP/2 302 to `https://ace.ewapub.com/article/view/33494`; publisher article returned HTTP/2 200; OpenAlex API HEAD returned HTTP/2 200.
- Status: closed through existing metric-validity receipts; no OpenClaw evaluator, safety-study importer, user-study module, or source-specific metric lens added.

## Live source metadata

The local OpenAlex-backed backlog identifies `Evaluating the Safety of LLM-Based Agents: A User-Centered Study of OpenClaw`, DOI `10.54254/2755-2721/2026.gu33494`, publisher article `https://ace.ewapub.com/article/view/33494`, and OpenAlex work `W7161768934`. The live DOI and publisher article headers confirm the DOI target and article page are reachable in this environment, but shell body retrieval did not expose article text. Source-review signals in the OpenAlex metadata include OpenClaw, user-centered study, Adversarial system, Usability, Risk analysis, Control, and Computer security.

These facts are metric-validity context only. No upstream study text, user tasks, safety rubric, participant data, prompts, screenshots, tables, examples, code, generated outputs, or prose were copied into AMC.

## Relevance decision

This source is relevant to AMC because safety and user-centered evaluations raise metric-validity questions: does an AMC maturity score predict real operational trust and safety rather than optimizing for a disconnected paper label? GAP-0825 maps to AMC's existing metric-validity primitive, not to an OpenClaw or user-study subsystem.

Before a claim can pass, AMC-owned evidence must include a validation table, confidence interval, sample size, metric owner, construct-validity checks, reliability checks, outcome-alignment checks, signed evidence references, row hashes, source refs, and CI lifecycle receipts. DOI reachability, publisher reachability, OpenAlex id, title, OpenClaw label, or safety-study metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing metric-validity reports, validation facets, sample-size checks, confidence intervals, metric owner checks, and row-hashed eval packs. |
| Shield | Relevant because safety-study claims must fail closed unless signed validation evidence supports the scored assertion. |
| Watch | Relevant through CI lifecycle receipts and repeated metric-validity runs that can be watched for score drift or evidence regression. |
| Enforce | No runtime safety policy, OpenClaw policy, guardrail, or circuit breaker changed. |
| Vault | No user-study data, prompts, participant data, or secure-storage behavior changed. |
| Fleet | Agent-safety context only; no orchestration topology or multi-agent runtime changed. |
| Passport | No portable trust token or proof-bundle schema changed. |
| Comply | Safety and risk-analysis context only; no compliance framework mapping changed. |

## Product closure

No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, OpenClaw evaluator, safety-study importer, user-study module, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0825.

The focused regression exercises the existing `buildMetricValidationReport` path with AMC-owned metric-validity evidence. The positive path requires signed question-row evidence, validation table coverage, sample size, confidence interval, reliability check, metric owner, outcome alignment, source references, row hashes, and a passing CI gate. The negative path fails closed when source metadata replaces signed metric-validity evidence.

## Fail-closed rule

DOI URL, publisher URL, OpenAlex id, source title, OpenClaw label, user-centered study label, Adversarial system label, Usability label, Risk analysis label, Control label, Computer security label, local backlog metadata, or source identity alone must fail closed for metric-validity claims. Passing evidence requires AMC-owned validation table, confidence interval, sample size, metric owner, construct-validity evidence, reliability checks, outcome-alignment checks, signed evidence refs, row hashes, source refs, CI lifecycle receipts, and no-copy proof.

## No-bloat boundary

No OpenClaw evaluator, safety-study importer, user-study module, participant-data importer, safety rubric importer, paper importer, publisher importer, OpenAlex importer, dataset mirror, benchmark mirror, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific metric lens, or source-specific scoring path was added. No upstream study text, user tasks, safety rubric, participant data, prompts, screenshots, tables, examples, code, generated outputs, or prose were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0825OpenClawMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
