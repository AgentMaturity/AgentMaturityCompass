# GAP-0672 — graph-rag-agent metric-validity boundary

- Gap: `GAP-0672`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/1517005260/graph-rag-agent`
- Retrieval: `2026-06-21` via browser access to the live GitHub repository page; shell network remains DNS-restricted in this environment.
- Status: relevant as metric-validity source-review context only; no GraphRAG/DeepSearch integration or AMC metric-validity implementation change.

## Live source metadata

The live GitHub page identifies `1517005260/graph-rag-agent` as a public repository on branch `master`, with approximately `2.2k` stars, `316 forks`, `32` issues, `4` pull requests, `127` commits, and MIT license. The repository page positions the project around GraphRAG, DeepSearch, multi-agent RAG, knowledge-graph construction/search, and a custom evaluation framework.

These metadata facts identify the source and its adjacent domain only. No README prose beyond short metadata labels, architecture text, screenshots, diagrams, code, prompts, configs, datasets, benchmark rows, evaluator definitions, result examples, test outputs, or implementation details were copied into AMC.

## Relevance decision

The source is relevant to AMC as RAG/GraphRAG evaluation context for metric-validity discussions. A custom evaluation framework in a RAG/agent repository can motivate why AMC metric claims need validation tables, metric owners, sample sizes, confidence intervals, evaluator-suite coverage, trace-evaluation coverage where claimed, threshold policy, signed evidence refs, artifact hashes, and row hashes.

The source is not accepted as AMC metric-validity evidence by itself. GitHub metadata, repository popularity, MIT license, README labels, module names, evaluation-framework labels, local demo output, graph-search claims, DeepSearch framing, or GraphRAG terminology do not establish construct validity, inter-rater reliability, test-retest stability, confidence intervals, or maturity-score predictiveness inside AMC.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through existing AMC metric-validity primitives with validation table, owner, sample size, confidence interval, evaluator proof, and row hashes. |
| Shield | Relevant only when unsupported RAG/GraphRAG metric claims are rejected with signed evidence, thresholds, and repair guidance. |
| Watch | Relevant only when caller-owned trace/evaluation telemetry is hash-bound through existing Watch evidence; repository metadata alone is not observability proof. |
| Enforce | No policy-enforcement or RAG guardrail change. |
| Vault | No source-data, private-knowledge-base, secrets, privacy, or data-residency feature. |
| Fleet | No multi-agent orchestration or trust-topology implementation. |
| Passport | No portable proof-bundle field or credential change. |
| Comply | No compliance mapping or regulated-domain claim. |

## Product closure

No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, docs methodology page, API, CLI, Studio, or scoring behavior changed for GAP-0672. Existing AMC metric-validity controls remain the only accepted product path: validation table artifact, evaluator-suite coverage, trace-evaluation coverage when claimed, threshold policy, metric owner, sample size, confidence interval, signed evidence refs, artifact hashes, row hashes, and no-copy/source-review proof.

## Fail-closed rule

GitHub repository metadata, star/fork/issue counts, MIT license, branch name, README labels, GraphRAG labels, DeepSearch labels, multi-agent labels, evaluation-framework wording, module names, demo screenshots, local outputs, aggregate scores, dataset folders, test folders, or source identity alone must fail closed for Score, Shield, or Watch metric-validity claims. Passing evidence requires AMC-owned validation tables, evaluator/trace proof, thresholds, metric owner, sample size, confidence interval, signed evidence refs, artifact hashes, row hashes, and no-copy proof.

## No-bloat boundary

No GraphRAG/DeepSearch integration, importer, adapter, evaluation-framework wrapper, Neo4j connector, graph builder, private-RAG benchmark mirror, source dataset mirror, demo runner, screenshot/UI clone, paper/resource mirror, methodology version bump, API route, CLI command, Studio panel, parity layer, or source-specific scoring path was added. No upstream code, README/docs prose, architecture text, examples, prompts, configs, tests, benchmark rows, result tables, traces, screenshots, UI assets, package metadata text, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0672GraphRagAgentMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
