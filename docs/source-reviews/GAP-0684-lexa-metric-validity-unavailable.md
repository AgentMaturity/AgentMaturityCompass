# GAP-0684 - LEXA metric-validity unavailable-source boundary

- Gap: `GAP-0684`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://openalex.org/W7133355586`, `https://doi.org/10.1007/s11280-026-01407-w`
- Retrieval: `2026-06-21` via live browser/search checks; shell network remains DNS-restricted in this environment.
- Status: source unavailable; skipped as metric-validity implementation evidence.

## Live retrieval result

The local backlog identifies the source as `LEXA: Legal case retrieval via graph contrastive learning with contextualised LLM embeddings`, OpenAlex work `W7133355586`, and DOI `10.1007/s11280-026-01407-w`. During this pass, live retrieval did not produce a reachable primary source page or independent source page for the paper:

- exact-title search for `LEXA: Legal case retrieval via graph contrastive learning with contextualised LLM embeddings` returned no usable primary/source result.
- DOI search for `10.1007/s11280-026-01407-w` returned no usable primary/source result.
- OpenAlex search for `W7133355586` returned no usable primary/source result.
- Springer article search for `s11280-026-01407-w` and the title returned no usable primary/source result.

The backlog row may be a future, removed, unreleased, private, or incorrectly indexed article record. AMC cannot use it as metric-validity evidence without a reachable source and reviewable method/evidence details. No upstream abstract prose beyond the local metadata identifiers above, legal retrieval data, graph-learning method details, examples, prompts, benchmark rows, screenshots, configs, model outputs, docs text, or implementation details were copied into AMC.

## Relevance decision

Metric validity is relevant to AMC through existing Score, Shield, and Watch primitives when AMC has validation tables, confidence intervals, sample size, metric owner, construct-validity evidence, reliability checks, signed evidence refs, row hashes, CI/lifecycle gates, and no-copy proof. GAP-0684 does not supply those facts because the cited source was unavailable during live verification.

Therefore GAP-0684 is closed as a documented skip. The source is not rejected because legal retrieval or metric validity is irrelevant; it is rejected because unavailable paper metadata alone cannot substantiate an AMC metric-validity implementation, public-methodology change, or scoring claim.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Metric-validity scoring remains relevant only through AMC-owned validation tables, confidence intervals, sample sizes, and metric-owner proof. |
| Shield | No assurance or reliability proof can be derived from an unreachable source. |
| Watch | No drift, benchmark, or metric-reliability monitor evidence can be derived from metadata alone. |
| Enforce | No runtime guardrail, policy, circuit breaker, or legal-retrieval enforcement behavior changed. |
| Vault | No legal case data, private corpus, DLP, retention, or secure-storage behavior changed. |
| Fleet | No multi-agent orchestration or trust-topology behavior changed. |
| Passport | No portable proof-bundle field, token, or external credential changed. |
| Comply | No legal-domain compliance mapping or audit-control obligation changed. |

## Product closure

No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, API, CLI, Studio, or scoring code changed for GAP-0684. Existing AMC metric-validity primitives remain the only accepted path for validation table, confidence interval, sample size, metric owner, signed evidence, and regression-threshold claims.

The source-review closure is the product boundary: source unavailable, skipped as metric-validity implementation evidence, with tests ensuring source-specific identifiers stay out of metric-validity implementation modules and public methodology semantics.

## Fail-closed rule

Unavailable paper metadata alone must fail closed for metric-validity claims. Local backlog metadata, title text, DOI, OpenAlex id, legal-retrieval labels, graph-contrastive-learning labels, contextualised embedding labels, partial abstract snippets, category labels, generated gap wording, or source identity are not enough to pass. Passing evidence requires AMC-owned validation table artifacts, confidence interval, sample size, metric owner, construct-validity mapping, reliability checks, signed evidence refs, row hashes, regression thresholds, CI/lifecycle receipts, and no-copy proof.

## No-bloat boundary

No LEXA legal retrieval metric-validity adapter, legal case retrieval benchmark importer, Springer/OpenAlex importer, legal corpus mirror, graph contrastive learning module, contextualised embedding evaluator, legal retrieval metric lens, public methodology version bump, diagnostic question-bank migration, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, or source-specific scoring path was added. No upstream abstract prose beyond local metadata identifiers, legal retrieval data, graph-learning method details, examples, prompts, benchmark rows, screenshots, configs, model outputs, docs text, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0684LexaMetricValidityUnavailableBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
