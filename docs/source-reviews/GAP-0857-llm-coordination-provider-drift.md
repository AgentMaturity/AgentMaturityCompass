# GAP-0857 - LLM-Coordination provider-drift boundary

- Gap: `GAP-0857`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `UCSB-AI/llm_coordination`, `https://github.com/UCSB-AI/llm_coordination`
- Retrieval: `2026-06-21` via live GitHub repository page and README review. The GitHub URL returned HTTP/2 200 in live review. The live GitHub repository page showed Star 46, Fork 0, Issues 0, Pull requests 0, 13 Commits, README.md, MIT license, No releases published, topics `agent-coordination`, `coordination-game`, `llms`, and `multiagent`, and Python 100.0%.
- Status: completed as a provider/model drift boundary over existing AMC canary receipts.

## Live source metadata

The live repository identifies LLM-Coordination: Evaluating and Analyzing Multi-agent Coordination Abilities in Large Language Models and references NAACL 2025. Relevant source-review signals include Pure Coordination Games, Agentic Coordination, Coordination QA, Experiment Workflow, vLLM, Llama-3.1-8B, Llama-3.1-70B, Mixtral, gemma-2, GPT-4o-mini, Claude-3.5-Sonnet, Gemini-1.5-Pro, and Qwen-72B.

These facts are useful multi-agent coordination benchmark context, but they are not provider/model drift proof by themselves. No upstream source code, benchmark tasks, coordination game definitions, datasets, prompts, model outputs, evaluation configs, result tables, README prose beyond minimal metadata facts, screenshots, figures, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC through existing provider/model drift canary receipts because multi-agent coordination benchmark context can inform how users reason about Score, Shield, and Watch changes across model or provider updates. The closure is not an LLM-Coordination runner, dataset importer, or model-comparison subsystem; it is a fail-closed boundary showing that LLM-Coordination metadata is accepted only as source-review context unless AMC-owned provider-drift proof exists.

For provider/model drift to pass, AMC needs provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, row hashes, CI or lifecycle gate proof, and no-copy proof. GitHub/README/license/model-list/coordination benchmark metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing provider score distribution comparisons and canary result rows. |
| Shield | Relevant only as a fail-closed trust boundary; source metadata cannot stand in for signed provider-drift proof. |
| Watch | Relevant through existing provider drift alerts, Watch alert projection, and CI/lifecycle gate receipts. |
| Enforce | No runtime model-routing policy, coordination policy, or circuit breaker changed. |
| Vault | No datasets, prompts, result tables, model outputs, configs, or secure-storage behavior changed. |
| Fleet | Multi-agent coordination context only; no LLM-Coordination runner or orchestration topology added. |
| Passport | Existing provider-drift receipts can feed proof bundles, but no Passport schema changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No `src/benchmarks/providerDriftBenchmark.ts`, `src/watch/providerDriftAlerts.ts`, `src/api/benchmarkRouter.ts`, API, CLI, Studio, methodology, badge, diagnostic question bank, or scoring code changed for GAP-0857.

The focused regression exercises existing `runProviderDriftBenchmark`, `buildProviderDriftEvalPack`, `buildProviderDriftWatchAlerts`, and `buildProviderDriftCiGate` behavior with a positive LLM-Coordination-style multi-agent coordination canary packet and a negative source-metadata-only packet. The positive path requires provider version, canary results, drift statistic, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, and CI gate proof. The negative path fails closed when GitHub/README/license/model-list/coordination benchmark metadata replaces signed provider-drift evidence.

## Fail-closed rule

GitHub HTTP/2 200 reachability, live GitHub repository page metadata, README.md presence, MIT license metadata, Star 46, Fork 0, Issues 0, Pull requests 0, 13 Commits, No releases published, Python 100.0%, topics such as `agent-coordination`, `coordination-game`, `llms`, or `multiagent`, NAACL 2025 labels, Pure Coordination Games labels, Agentic Coordination labels, Coordination QA labels, Experiment Workflow labels, vLLM labels, model-name labels, local backlog metadata, or source identity alone must fail closed for provider/model drift. Passing evidence requires provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, row hashes, CI or lifecycle gate proof, and no-copy proof.

## No-bloat boundary

No LLM-Coordination adapter, benchmark runner, coordination game runner, dataset importer, prompt importer, model-list importer, vLLM wrapper, result-table parser, Agentic Coordination runner, Coordination QA runner, pure coordination game simulator, provider wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, diagnostic question-bank migration, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream source code, benchmark tasks, coordination game definitions, datasets, prompts, model outputs, evaluation configs, result tables, README prose beyond minimal metadata facts, screenshots, figures, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0857LlmCoordinationProviderDriftBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the existing positive and negative provider-drift paths passed.
- Focused regression after doc addition: `npx vitest run tests/gap0857LlmCoordinationProviderDriftBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0856LogikonLiveDriftBoundary.test.ts tests/gap0857LlmCoordinationProviderDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
