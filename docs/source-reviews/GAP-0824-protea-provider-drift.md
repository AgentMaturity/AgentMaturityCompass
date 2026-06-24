# GAP-0824 - PROTEA provider-drift boundary

- Gap: `GAP-0824`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://arxiv.org/abs/2605.18032`, DOI `10.48550/arXiv.2605.18032`, OpenAlex `W7161915061`
- Retrieval: `2026-06-21` via live arXiv page review plus shell header checks. arXiv returned HTTP/2 200, DOI returned HTTP/2 302 to `https://arxiv.org/abs/2605.18032`, and OpenAlex API HEAD returned HTTP/2 200.
- Status: closed through existing provider-drift benchmark receipts; no PROTEA evaluator, workflow graph debugger, node scorer, trace scorer, provider wrapper, or source-specific drift adapter added.

## Live source metadata

The live arXiv page identifies `PROTEA: Offline Evaluation and Iterative Refinement for Multi-Agent LLM Workflows`, Submitted on 18 May 2026, with authors Kazuki Kawamura, Satoshi Waki, and Kei Tateno.

Relevant source-review signals include role-specific LLM calls, intermediate outputs, downstream nodes, offline, test-driven improvement, configurable rubrics, workflow graph overlays, backward node evaluation, score trajectories, and iterative workflow refinement. These facts are provider-drift context only. No upstream workflow graphs, prompts, intermediate outputs, node examples, rubrics, traces, score trajectories, datasets, figures, tables, code, generated outputs, or prose were copied into AMC.

## Relevance decision

This source is relevant to AMC because multi-agent workflow evaluations can change when a provider model changes, even when the workflow graph stays fixed. GAP-0824 maps to AMC's existing provider/model drift benchmark primitive: recurring canary rows, provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval packs, Watch alerts, and CI gate proof.

It does not require a PROTEA evaluator, workflow graph debugger, node scorer, trace scorer, paper importer, OpenAlex importer, arXiv importer, API route, CLI command, Studio panel, or methodology version bump. Paper metadata can explain why provider drift matters for multi-agent workflows, but it cannot replace AMC-owned provider-drift evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing provider-drift score distributions, canary rows, eval packs, and CI gate proof. |
| Shield | Relevant because workflow-level claims fail closed without signed evidence and evaluation-framework proof. |
| Watch | Relevant through provider-drift alerts, drift statistics, and alert or waiver evidence. |
| Enforce | No runtime workflow policy, provider route, or circuit breaker changed. |
| Vault | No prompts, traces, intermediate outputs, rubrics, or secure-storage behavior changed. |
| Fleet | Multi-agent workflow context only; no orchestration topology or workflow graph runtime changed. |
| Passport | No portable trust token or proof-bundle schema changed. |
| Comply | Evaluation context only; no compliance framework mapping changed. |

## Product closure

No `src/benchmarks/providerDriftBenchmark.ts`, `src/watch/providerDriftAlerts.ts`, `src/api/benchmarkRouter.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, provider wrapper, PROTEA adapter, workflow graph debugger, node scorer, trace scorer, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0824.

The focused regression exercises the existing `runProviderDriftBenchmark`, `buildProviderDriftEvalPack`, Watch alert projection, and CI gate path. The positive path requires provider version, canary results, drift statistic, signed evidence, eval-pack rows, observability proof, and CI gate proof. The negative path fails closed when paper metadata replaces AMC-owned provider-drift evidence.

## Fail-closed rule

Paper title, arXiv URL, DOI, OpenAlex id, author list, submission date, PROTEA label, role-specific LLM calls, intermediate outputs, downstream nodes, offline test-driven improvement, configurable rubrics, workflow graph, backward node evaluation, score trajectories, local backlog metadata, or source identity alone must fail closed for provider/model drift claims. Passing evidence requires AMC-owned provider version, canary results, drift statistic, alert or waiver, signed evidence refs, evaluation framework proof, observability pipeline proof, replayable eval-pack rows, CI gate proof, source refs, and no-copy proof.

## No-bloat boundary

No PROTEA evaluator, workflow graph debugger, node scorer, trace scorer, rubric importer, paper importer, OpenAlex importer, arXiv importer, dataset mirror, benchmark mirror, provider wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific metric lens, or source-specific scoring path was added. No upstream workflow graphs, prompts, intermediate outputs, node examples, rubrics, traces, score trajectories, datasets, figures, tables, code, generated outputs, or prose were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0824ProteaProviderDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
