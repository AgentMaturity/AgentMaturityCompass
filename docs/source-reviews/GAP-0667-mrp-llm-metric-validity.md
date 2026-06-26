# GAP-0667 — MRP-LLM metric-validity boundary

- Gap: `GAP-0667`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://openalex.org/W4405300788` / DOI `10.1145/3774935.3806151`
- Corroborating primary source reached: `https://arxiv.org/abs/2412.07796`
- Retrieval: `2026-06-21`; arXiv page was reachable by browser, while direct DOI opening was blocked by the browser safety wrapper and shell network remains DNS-restricted.
- Status: relevant as privacy-preserving recommendation metric-validity context only; no recommender, POI, privacy-transmission, or source-specific metric-validity subsystem added.

## Live source metadata

The accessible arXiv page identifies `MRP-LLM: Multitask Reflective Large Language Models for Privacy-Preserving Next POI Recommendation`, submitted `2024-12-03`, with authors Ziqing Wu, Zhu Sun, Dongxia Wang, Lu Zhang, Jie Zhang, and Yew Soon Ong. It lists subject areas `cs.IR` and `cs.AI`, and describes the work as a next point-of-interest recommendation approach with privacy-preserving user data handling. The local backlog maps the source to OpenAlex work `W4405300788` and DOI `10.1145/3774935.3806151`.

These facts are source identity and domain context only. No paper prose beyond bibliographic metadata, no abstract text, no privacy method, no dataset names, no prompt templates, no metrics definitions, no experiment rows, no figures, no tables, no code, and no implementation details were copied.

## Relevance decision

The source is relevant to AMC as a high-level signal for metric-validity and privacy-sensitive evaluation. POI recommendation claims can easily look strong while relying on narrow datasets, unclear privacy boundaries, or metrics that do not predict operational trust. That maps to existing AMC metric-validity requirements: validation table, metric owner, sample size, confidence interval, evaluator-suite coverage, trace-evaluation coverage when claimed, threshold policy, signed evidence refs, artifact hashes, and row hashes.

The source is not accepted as AMC metric-validity evidence by itself. Its arXiv metadata, DOI/OpenAlex fields, privacy-preserving language, multitask/reflection framing, recommendation task, dataset count, or reported experimental claims do not establish AMC construct validity, inter-rater reliability, test-retest stability, confidence intervals, metric ownership, or Score/Shield/Watch readiness.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through existing AMC metric-validity primitives with validation table, owner, sample size, confidence interval, evaluator proof, and row hashes. |
| Shield | Relevant only when privacy/unsupported recommendation claims are rejected with signed evidence, thresholds, and repair guidance. |
| Watch | Relevant only when caller-owned trace/evaluation telemetry is hash-bound through existing Watch evidence. |
| Enforce | No policy-enforcement change. |
| Vault | No privacy-transmission, user-location, or secure-storage implementation. |
| Fleet | No orchestration or trust-topology implementation. |
| Passport | No portable proof-bundle field or credential change. |
| Comply | No privacy-regulatory, location-data, or compliance claim. |

## Product closure

No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, docs methodology page, API, CLI, Studio, Vault, privacy, or scoring behavior changed for GAP-0667. Existing AMC metric-validity controls remain the only accepted product path: validation table artifact, evaluator-suite proof, trace-evaluation proof when claimed, threshold policy, metric owner, sample size, confidence interval, signed evidence refs, artifact hashes, row hashes, and no-copy/source-review proof.

## Fail-closed rule

ArXiv metadata, DOI/OpenAlex identity, paper title, author list, subject labels, POI recommendation framing, privacy-preserving wording, multitask/reflection labels, dataset-count claims, experiment-summary claims, local backlog metadata, or metadata-only source refs must fail closed for Score, Shield, or Watch metric-validity claims. Passing evidence requires AMC-owned validation table artifacts, evaluator/trace proof, threshold policy, metric owner, sample size, confidence interval, signed evidence refs, artifact hashes, row hashes, and no-copy proof.

## No-bloat boundary

No MRP-LLM subsystem, POI recommender, privacy-transmission module, user-preference knowledge base, neighbor-retrieval module, recommendation benchmark mirror, dataset mirror, paper importer, metric-validity wrapper, Vault/privacy feature, API route, CLI command, Studio panel, methodology version bump, or parity layer was added. No upstream prose, abstract text, figures, tables, prompts, metrics definitions, dataset names, experiment rows, model outputs, source code, configs, examples, screenshots, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0667MrpLlmMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: attempted with `npm test -- --reporter=dot`; blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
