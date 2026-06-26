# GAP-0965 - DeepEval live drift

- Gap: `GAP-0965`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: live Confident AI homepage at `https://www.confident-ai.com`, live DeepEval homepage at `https://deepeval.com/`, and GitHub repository page at `https://github.com/confident-ai/deepeval`
- Retrieval: `2026-06-22` live source review through the web research channel.
- Status: closed through existing Watch live score and behavior drift receipts only; no DeepEval adapter, Confident AI integration, eval runner, trace importer, dataset importer, or source-specific monitor added.
- Linear: `AMC-1243`

## Live source metadata

The live DeepEval homepage identifies DeepEval as an LLM Evaluation Framework for building evaluation pipelines. It describes local or CI evaluation tests, research-backed metrics, transparent score explanations, multi-turn and multimodal evaluation context, agent traces, and synthetic goldens.

The live Confident AI homepage positions Confident AI as the commercial quality platform built around evaluation, observability, red teaming, and governance. It shows quality alerts, production traces, trace-to-dataset workflow context, real-time monitoring, quality degradation alerts, and a CI pipeline behavior where a build fails when configured thresholds are crossed.

The live GitHub repository page confirms `confident-ai/deepeval` as a public repository and showed 16.4k stars, 1.6k forks, 211 issues, and 98 pull requests during review. Those repository facts are source-review metadata only.

No DeepEval code, Confident AI product copy, docs prose, examples, prompts, screenshots, datasets, trace samples, generated outputs, configs, or implementation details were copied into AMC.

## Relevance decision

GAP-0965 is relevant to AMC because the competitor signal maps directly to AMC's existing Watch live drift primitive: compare a baseline distribution to a live sample, compute a drift statistic, and emit an alert receipt tied to signed evidence. Score is implicated by score deltas and regression thresholds. Shield is implicated when behavior drift shows refusals, invalid actions, unsafe actions, or error attribution changes.

This does not justify adding DeepEval itself to AMC. DeepEval and Confident AI are reviewed as source signals only. AMC should continue to use `runLiveScoreBehaviorDrift`, `verifyLiveDriftReceipt`, and `buildLiveDriftWatchAlerts` for source-independent live score and behavior drift evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through AMC-owned baseline/live score rows and regression thresholds. |
| Shield | Relevant when signed drift rows show refusal, error, invalid-action, or unsafe behavior movement. |
| Enforce | No runtime policy or circuit breaker changed in this slice. |
| Vault | No secrets, DLP, privacy, storage, or data residency behavior changed. |
| Watch | Primary surface. Existing live drift receipts already bind baseline distribution, live sample, drift statistic, and alert receipt. |
| Fleet | Agent trace context is indirect only; no Fleet topology or orchestration behavior changed. |
| Passport | No portable trust-token or proof-bundle schema changed. |
| Comply | Governance context only; no compliance mapping changed. |

## Product closure

No product code changed. The focused regression proves existing Watch primitives can accept DeepEval/Confident AI context only when AMC has signed baseline and live evidence. The positive path exercises score mean, behavior signature, refusal rate, latency, and cost drift alerts. The negative path fails closed when source metadata replaces signed live evidence.

The closure keeps DeepEval as an external signal, not an AMC subsystem. AMC-owned evidence must carry the agent ID, baseline window, live window, row hashes, evidence refs, signed evidence refs, drift metrics, and Watch alert receipt.

## Fail-closed rule

DeepEval homepage claims, Confident AI homepage claims, GitHub star/fork/issue/PR counts, evaluation-framework labels, CI labels, tracing labels, quality-alert labels, trace-to-dataset labels, production-monitoring labels, and local backlog metadata are not live AMC evidence.

A live score and behavior drift claim must fail closed unless each baseline and live sample has evidence refs and signed evidence refs, enough rows to compute drift, source refs, drift statistic output, and an alert receipt.

## No-bloat boundary

No DeepEval adapter, Confident AI integration, eval runner, trace importer, dataset importer, synthetic-golden generator, GitHub importer, dashboard clone, benchmark mirror, OpenTelemetry wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Score method, Passport field, methodology version bump, package dependency, or source-specific scoring path was added.

No upstream code, docs prose, screenshots, examples, prompts, datasets, traces, configs, generated outputs, model responses, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0965DeepEvalLiveDriftBoundary.test.ts --reporter=dot` - 1 file / 4 tests passed.
- Paired regression: `npx vitest run tests/gap0964PromptNativeSemanticRuntimeReplayCorpusBoundary.test.ts tests/gap0965DeepEvalLiveDriftBoundary.test.ts --reporter=dot` - 2 files / 8 tests passed.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` - passed.
- Typecheck: `npm run typecheck` - passed.
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
