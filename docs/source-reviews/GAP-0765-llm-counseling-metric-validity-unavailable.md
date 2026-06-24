# GAP-0765 - LLM counseling metric-validity unavailable-source boundary

- Gap: `GAP-0765`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://openalex.org/W7128356801`, `https://doi.org/10.3390/bs16020241`
- Retrieval: `2026-06-21` via live browser/search checks; shell network remains DNS-restricted in this environment.
- Status: source unavailable/inaccessible; skipped as metric-validity implementation evidence.

## Live retrieval result

The local backlog identifies the source as `Power Distance and Psychological Safety in LLM Counseling: Effects on Self-Efficacy with Implications for Mental Health-Relevant Behavior Change`, OpenAlex work `W7128356801`, and DOI `10.3390/bs16020241`. During this pass, live retrieval did not produce a usable primary source page or independent source page for the paper:

- exact-title search for `Power Distance and Psychological Safety in LLM Counseling: Effects on Self-Efficacy with Implications for Mental Health-Relevant Behavior Change` returned no usable primary/source result.
- DOI search for `10.3390/bs16020241` returned no usable primary/source result.
- OpenAlex search for `W7128356801` returned no usable primary/source result.
- MDPI article fetch for the likely `Behavioral Sciences` article path returned `429 Too Many Requests`, so the primary page could not be reviewed.

The backlog row may be a future, rate-limited, removed, unreleased, private, or incorrectly indexed article record. AMC cannot use it as metric-validity evidence without a reachable source and reviewable method/evidence details. No upstream abstract prose beyond the local metadata identifiers above, counseling study materials, vignettes, mental-health intervention data, participant data, prompts, model outputs, statistics tables, screenshots, configs, docs text, or implementation details were copied into AMC.

## Relevance decision

Metric validity is relevant to AMC through existing Score, Shield, and Watch primitives when AMC has validation tables, confidence intervals, sample size, metric owner, construct-validity evidence, reliability checks, signed evidence refs, row hashes, CI/lifecycle gates, and no-copy proof. GAP-0765 does not supply those facts because the cited source was unavailable/inaccessible during live verification.

Therefore GAP-0765 is closed as a documented skip. The source is not rejected because LLM counseling, psychological safety, power distance, self-efficacy, mental-health-relevant behavior change, vignettes, social psychology, or belongingness are irrelevant; it is rejected because unavailable paper metadata alone cannot substantiate an AMC metric-validity implementation, public-methodology change, clinical/safety claim, or scoring claim.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Metric-validity scoring remains relevant only through AMC-owned validation tables, confidence intervals, sample sizes, and metric-owner proof. |
| Shield | No counseling, mental-health, safety, or reliability proof can be derived from an unavailable/inaccessible source. |
| Watch | No regression, benchmark, or metric-reliability monitor evidence can be derived from metadata alone. |
| Enforce | No runtime counseling, clinical, safety, or power-distance guardrail changed. |
| Vault | No mental-health, participant, counseling, vignette, prompt, or model-output storage behavior changed. |
| Fleet | No multi-agent counseling workflow or trust-topology behavior changed. |
| Passport | No portable proof-bundle field, token, or external credential changed. |
| Comply | No medical, behavioral-health, privacy, or research-ethics compliance mapping changed. |

## Product closure

No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, API, CLI, Studio, or scoring code changed for GAP-0765. Existing AMC metric-validity primitives remain the only accepted path for validation table, confidence interval, sample size, metric owner, signed evidence, and regression-threshold claims.

The source-review closure is the product boundary: source unavailable/inaccessible, skipped as metric-validity implementation evidence, with tests ensuring source-specific identifiers stay out of metric-validity implementation modules and public methodology semantics.

## Fail-closed rule

Unavailable paper metadata alone must fail closed for metric-validity claims. Local backlog metadata, title text, DOI, OpenAlex id, LLM-counseling labels, psychological-safety labels, power-distance labels, self-efficacy labels, mental-health labels, vignette labels, belongingness labels, social-psychology labels, partial abstract snippets, category labels, generated gap wording, or source identity are not enough to pass. Passing evidence requires AMC-owned validation table artifacts, confidence interval, sample size, metric owner, construct-validity mapping, reliability checks, signed evidence refs, row hashes, regression thresholds, CI/lifecycle receipts, and no-copy proof.

## No-bloat boundary

No LLM-counseling metric-validity adapter, mental-health benchmark importer, power-distance evaluator, psychological-safety evaluator, self-efficacy survey model, vignette simulator, MDPI/OpenAlex importer, DOI resolver, clinical workflow, counseling workflow, source-specific metric lens, public methodology version bump, diagnostic question-bank migration, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, or source-specific scoring path was added. No upstream abstract prose beyond local metadata identifiers, counseling study materials, vignettes, mental-health intervention data, participant data, prompts, model outputs, statistics tables, screenshots, configs, docs text, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0765LlmCounselingMetricValidityUnavailableBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
