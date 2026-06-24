# GAP-0820 - Raga LLM Hub metric-validity boundary

- Gap: `GAP-0820`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `raga-ai-hub/raga-llm-hub`, `https://github.com/raga-ai-hub/raga-llm-hub`
- Retrieval: `2026-06-21` via GitHub README.md and LICENSE fetch plus live `curl -I --max-time 12 https://github.com/raga-ai-hub/raga-llm-hub`, which returned HTTP/2 200.
- Status: closed through existing metric-validity receipts; no Raga importer, evaluator, guardrail scanner, vulnerability scanner, RAG pipeline runner, metric-pack mirror, or source-specific metric lens added.

## Live source metadata

The reachable GitHub README.md identifies `Raga LLM Hub` as an evaluation toolkit for LLMs. Source-review signals include "over 100 meticulously designed metrics", Relevance & Understanding, Content Quality, Hallucination, Safety & Bias, Context Relevance, Guardrails, Vulnerability scanning, Metric-Based Tests, and references to evaluation across the entire RAG pipeline.

The fetched LICENSE begins with `Attribution-NonCommercial-NoDerivatives 4.0 International`. That license signal is a no-copy boundary for AMC: GAP-0820 does not import, mirror, adapt, or wrap upstream code, examples, metric definitions, guardrail tests, vulnerability-scanning logic, prompts, configuration, datasets, tables, screenshots, generated outputs, or prose beyond short source-identification facts.

## Relevance decision

This source is relevant to AMC only as metric-validity context for Score, Shield, and Watch. A repo that advertises LLM evaluation, guardrails, safety, hallucination, and RAG-pipeline testing is a useful external signal, but it does not by itself prove AMC maturity scores are valid. GAP-0820 therefore maps to AMC's existing metric-validity primitive rather than to a Raga-specific subsystem.

Before a claim can pass, AMC-owned evidence must include a validation table, confidence interval, sample size, metric owner, construct-validity checks, reliability checks, outcome-alignment checks, signed evidence references, row hashes, source refs, and CI lifecycle receipts. GitHub reachability, repository name, README labels, license presence, advertised metric count, guardrail labels, vulnerability-scanning labels, or package-install examples are metadata only and must fail closed for AMC metric-validity claims.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing metric-validity reports, validation facets, sample-size checks, confidence intervals, metric owner checks, and row-hashed eval packs. |
| Shield | Relevant because guardrail, hallucination, safety, and vulnerability claims must fail closed unless signed AMC validation evidence supports the scored assertion. |
| Watch | Relevant through CI lifecycle receipts and repeated metric-validity runs that can be watched for score drift or evidence regression. |
| Enforce | No runtime guardrail, policy-enforcement path, circuit breaker, or Raga rule adapter changed. |
| Vault | No secret, dataset, prompt, response, license artifact, or secure-storage behavior changed. |
| Fleet | Multi-agent or RAG context only; no orchestration topology, tool runner, or routing policy changed. |
| Passport | No portable trust token, proof-bundle schema, or external credential field changed. |
| Comply | License and safety context only; no EU AI Act, NIST, ISO, SOC2, or regulatory mapping changed. |

## Product closure

No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0820.

The focused regression exercises the existing `buildMetricValidationReport` path with AMC-owned metric-validity evidence. The positive path requires signed question-row evidence, validation table coverage, sample size, confidence interval, reliability check, metric owner, outcome alignment, source references, row hashes, and a passing CI gate. The negative path fails closed when source metadata replaces signed metric-validity evidence.

## Fail-closed rule

Repository URL, GitHub HTTP/2 200 reachability, README.md, LICENSE, `Raga LLM Hub`, package-install examples, evaluator examples, guardrail labels, vulnerability scanning labels, "over 100 meticulously designed metrics", Relevance & Understanding, Content Quality, Hallucination, Safety & Bias, Context Relevance, Guardrails, Metric-Based Tests, entire RAG pipeline wording, local backlog metadata, or source identity alone must fail closed for metric-validity claims. Passing evidence requires AMC-owned validation table, confidence interval, sample size, metric owner, construct-validity evidence, reliability checks, outcome-alignment checks, signed evidence refs, row hashes, source refs, CI lifecycle receipts, and no-copy proof.

## No-bloat boundary

No Raga importer, Raga evaluator, guardrail scanner, vulnerability scanner, RAG pipeline runner, metric-pack mirror, package dependency, paper importer, GitHub importer, dataset mirror, benchmark mirror, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, source-specific metric lens, or source-specific scoring path was added. No upstream code, examples, metric definitions, guardrail tests, vulnerability-scanning logic, prompts, configuration, datasets, tables, screenshots, generated outputs, or prose were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0820RagaLlmHubMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
