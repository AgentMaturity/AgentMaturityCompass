# GAP-0849 - Spark Dashboard provider-drift boundary

- Gap: `GAP-0849`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `niklasfrick/spark-dashboard`, `https://github.com/niklasfrick/spark-dashboard`
- Retrieval: `2026-06-21` via live GitHub page, GitHub REST API, README API, license API, and shell header checks. Repository URL returned HTTP/2 200. api.github.com repository metadata returned `stargazers_count` 62, language TypeScript, MIT License metadata, no open issues, and topics including `ai`, `ai-monitoring`, `dashboard`, `dgx`, `gpu`, `gpu-monitoring`, `llm`, `llm-monitoring`, `metrics`, `nvidia`, `observability`, `spark`, and `vllm`. README.md and LICENSE API lookups succeeded.
- Status: Done; closed by documenting and testing the existing provider/model drift benchmark boundary without adding a Spark Dashboard-specific subsystem.

## Live source metadata

The live README and API metadata identify Spark Dashboard as Real-time hardware and LLM inference monitoring for Linux systems with NVIDIA GPUs. Relevant source-review signals include GPU, CPU, memory, disk, network, vLLM, Rust backend, React frontend, TypeScript, WebSocket streaming, Prometheus parsing, tokens per second, time to first token, inter-token latency, end-to-end latency, queue time, KV cache utilization, SLO Goodput, Multi-Engine Support, provider chips, dashboard charts, and TypeScript/Rust implementation context.

These facts are useful observability context, but they are not AMC provider-drift evidence by themselves. No upstream code, dashboard screenshots, GIFs, architecture diagrams, WebSocket schemas, Prometheus parsers, deployment configs, service files, metrics examples, CLI options, README prose beyond minimal metadata facts, screenshots, assets, prompts, outputs, or implementation details were copied into AMC.

## Relevance decision

Relevant to AMC only through existing provider/model drift benchmark primitives. Spark Dashboard is observability-heavy rather than an AMC scoring benchmark, but LLM inference monitoring can contextualize latency, throughput, queue, and cost shifts that provider-drift canaries already evaluate for Score, Shield, and Watch.

The source does not justify a Spark Dashboard adapter, vLLM monitor, GPU metrics connector, WebSocket dashboard integration, Prometheus parser, provider wrapper, or source-specific benchmark path. GAP-0849 is closed by regression coverage showing that Spark Dashboard-style inference monitoring context can be represented by AMC-owned provider-drift canary rows, and that GitHub/API/README/license/dashboard/GPU/vLLM metadata alone fails closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only when provider score movement is calculated from AMC-owned canary rows and signed evidence. |
| Shield | Relevant when provider drift affects refusal, guardrail, invalid-action, or unsafe behavior; no source-specific Shield verifier was added. |
| Watch | Relevant through existing provider-drift Watch alerts and CI/lifecycle gates; no Spark Dashboard monitor was added. |
| Enforce | No runtime policy, routing enforcement, vLLM policy, or circuit breaker changed. |
| Vault | No telemetry feeds, dashboard assets, service configs, prompts, or secure-storage behavior changed. |
| Fleet | Multi-engine observability context only; no orchestration topology or source-specific multi-agent runner added. |
| Passport | No portable proof-bundle field, badge semantics, or public proof token changed. |
| Comply | No compliance mapping changed. |

## Product closure

The product path remains the existing provider-drift primitive: `runProviderDriftBenchmark`, `buildProviderDriftEvalPack`, `buildProviderDriftWatchAlerts`, and `buildProviderDriftCiGate`. The focused regression exercises a Spark Dashboard-style inference monitoring provider-drift packet using AMC-owned provider version, canary results, drift statistic, signed evidence refs, replayable eval-pack rows, source refs, row hashes, and CI gate proof.

No `src/benchmarks/providerDriftBenchmark.ts`, `src/watch/providerDriftAlerts.ts`, `src/api/benchmarkRouter.ts`, API, CLI, Studio, methodology, badge, diagnostic question bank, or scoring code changed for GAP-0849.

## Fail-closed rule

GitHub HTTP/2 200 reachability, api.github.com repository metadata, README.md presence, LICENSE presence, MIT License metadata, `stargazers_count` 62, TypeScript label, ai-monitoring topic, gpu-monitoring topic, llm-monitoring topic, observability topic, vllm topic, Real-time hardware and LLM inference monitoring label, GPU label, CPU label, memory label, Rust label, React label, WebSocket label, Prometheus label, tokens per second label, time to first token label, inter-token latency label, end-to-end latency label, queue time label, KV cache utilization label, SLO Goodput label, Multi-Engine Support label, provider chips label, local backlog metadata, or source identity alone must fail closed. Passing evidence requires AMC-owned provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, row hashes, and CI or lifecycle gate proof.

## No-bloat boundary

No Spark Dashboard adapter, vLLM monitor, GPU metrics connector, CPU metrics connector, NVML parser, Prometheus parser, WebSocket client, dashboard importer, Rust service wrapper, React panel, provider-chip mapper, SLO Goodput importer, multi-engine monitor, provider wrapper, benchmark mirror, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Enforce guardrail, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific provider-drift metric, or source-specific scoring path was added. No upstream code, dashboard screenshots, GIFs, architecture diagrams, WebSocket schemas, Prometheus parsers, deployment configs, service files, metrics examples, CLI options, README prose beyond minimal metadata facts, screenshots, assets, prompts, outputs, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0849SparkDashboardProviderDriftBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the provider-drift positive, metadata-only fail-closed, and no-leakage checks passed.
- Focused regression after doc addition: `npx vitest run tests/gap0849SparkDashboardProviderDriftBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0848AzureRagProviderDriftBoundary.test.ts tests/gap0849SparkDashboardProviderDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
