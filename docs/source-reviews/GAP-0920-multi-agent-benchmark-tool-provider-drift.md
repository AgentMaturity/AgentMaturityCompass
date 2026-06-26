# GAP-0920 - Multi-Agent Benchmark Tool provider-drift boundary

- Gap: `GAP-0920`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `digitalspaceport/Multi-Agent-Benchmark-Tool`, `https://github.com/digitalspaceport/Multi-Agent-Benchmark-Tool`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed the `main` branch, Star 14, Fork 5, Issues 0, Pull requests 0, 5 Commits, README.md, files `.gitignore`, `LICENSE`, `mabt.py`, and `requirements.txt`, MIT license, No releases published, Packages 0, and Python 100.0%.
- Status: Done

## Live source metadata

The live README identifies the project as `Multi Agent Benchmark Tool`. It describes a lightweight asynchronous benchmark that emulates multiple autonomous OpenClaw or Hermes-style agents sending requests to a single OpenAI-compatible endpoint such as vLLM or llama.cpp. Relevant source-review signals include Time-To-First-Token, TTFT, TPOT, Request latency distributions, prefill and decode throughput, target-total-rps, min-per-agent-rps, streaming usage counters when available, fallback token estimation, pacing jitter, timeouts, SDK-level retries, realistic tool-calling flows, tool-followup requests, include-usage behavior, optional image payloads, and output file `mabt_benchmark_results.json`.

Those facts are relevant to AMC only through existing provider-drift benchmark receipts. Multi-Agent Benchmark Tool shows why provider endpoint swaps, local serving stacks, concurrent agent load, token-streaming behavior, tool follow-up requests, latency distributions, and usage accounting need provider version, canary results, drift statistic, and alert or waiver proof before Score, Shield, or Watch can accept a provider/model drift claim.

No upstream Python code, benchmark JSON, prompts, agent scenarios, tool-call payloads, OpenAI-compatible endpoint configuration, vLLM setup, llama.cpp setup, README prose beyond minimal metadata facts, examples, CLI output, requirements, timing traces, usage rows, image payload examples, retry settings, pacing settings, screenshots, or implementation details were copied into AMC.

## Relevance decision

`GAP-0920` is relevant to AMC as a provider-drift boundary. The source maps to Score, Shield, and Watch through generic AMC canary evaluation receipts, not through a Multi-Agent Benchmark Tool integration.

The closure uses existing `runProviderDriftBenchmark`, `buildProviderDriftEvalPack`, `buildProviderDriftWatchAlerts`, and `buildProviderDriftCiGate` behavior. It does not add a Multi-Agent Benchmark Tool adapter, benchmark runner, OpenAI-compatible endpoint wrapper, vLLM integration, llama.cpp integration, OpenClaw/Hermes agent simulator, tool-call simulator, multimodal input simulator, JSON artifact importer, source-specific API route, CLI command, Watch monitor, or provider-drift implementation path.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through provider-drift score stability canaries and replayable eval packs over AMC-owned rows. |
| Shield | Relevant because missing signed provider evidence, evaluator config, traces, and reports fail closed. |
| Watch | Relevant through provider-drift alerts and CI gates over TTFT, TPOT, latency, RPS, tool follow-up success, cost, quality, refusals, and guardrail shifts. |
| Enforce | No runtime policy changed. |
| Vault | No benchmark JSON, endpoint secrets, model configs, image payloads, traces, or upstream artifacts stored. |
| Fleet | Multi-agent load context only; no AMC fleet topology changed. |
| Passport | No badge/passport semantics changed. |
| Comply | No compliance mapping changed. |

## Product closure

The focused regression exercises existing provider-drift primitives with a synthetic AMC-owned Multi-Agent Benchmark Tool-style canary. The positive path requires provider version, canary results, drift statistic, evaluator config hash, generated test-data hash, trace export hash, metric report hash, signed evidence refs, source refs, row hashes, thresholds, Watch alert projection, and CI gate proof. The negative path proves that Multi Agent Benchmark Tool, OpenAI-compatible endpoint, vLLM, llama.cpp, TTFT, TPOT, Request latency distributions, tool-calling flows, tool-followup requests, target-total-rps, min-per-agent-rps, usage counters, fallback token estimation, pacing jitter, timeouts, SDK retries, `mabt_benchmark_results.json`, GitHub metadata, and README labels alone fail closed without AMC-owned provider-drift evidence.

No product implementation module needed a source-specific change.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, Star 14, Fork 5, Issues 0, Pull requests 0, 5 Commits, MIT license, file names, Python 100.0%, OpenAI-compatible endpoint labels, vLLM labels, llama.cpp labels, Time-To-First-Token labels, TTFT labels, TPOT labels, Request latency distributions labels, throughput labels, tool-calling flows labels, tool-followup labels, target-total-rps labels, `mabt_benchmark_results.json` labels, local backlog metadata, or source identity alone must fail closed for provider drift. Passing provider-drift evidence requires provider version, canary results, drift statistic, alert or waiver, evaluator config hash, generated test-data hash, trace export hash, metric report hash, signed evidence refs, row hashes, and CI/Watch gate proof.

## No-bloat boundary

No Multi-Agent Benchmark Tool adapter, benchmark runner, OpenAI-compatible endpoint wrapper, vLLM integration, llama.cpp integration, OpenClaw agent simulator, Hermes-style agent simulator, tool-call simulator, multimodal input simulator, JSON artifact importer, pacing controller, retry controller, token estimator, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, source-specific implementation module, or source-specific scoring path was added. No upstream Python code, benchmark JSON, prompts, agent scenarios, tool-call payloads, OpenAI-compatible endpoint configuration, vLLM setup, llama.cpp setup, README prose beyond minimal metadata facts, examples, CLI output, requirements, timing traces, usage rows, image payload examples, retry settings, pacing settings, screenshots, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0920MultiAgentBenchmarkToolProviderDriftBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the provider-drift behavior tests already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0920MultiAgentBenchmarkToolProviderDriftBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0919CrashLensReplayCorpusBoundary.test.ts tests/gap0920MultiAgentBenchmarkToolProviderDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
