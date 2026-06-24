# GAP-0966 - Tencent WeKnora provider drift

- Gap: `GAP-0966`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: live GitHub repository page at `https://github.com/Tencent/WeKnora`, raw README at `https://raw.githubusercontent.com/Tencent/WeKnora/main/README.md`, and raw license at `https://raw.githubusercontent.com/Tencent/WeKnora/main/LICENSE`
- Retrieval: `2026-06-22` live source review through the web research channel.
- Status: closed through existing provider/model drift benchmark receipts only; no WeKnora adapter, Tencent integration, RAG platform import, provider connector, Langfuse integration, or source-specific canary runner added.
- Linear: `AMC-1244`

## Live source metadata

The live GitHub repository page identifies `Tencent/WeKnora` as public and showed 16.5k stars, 2.1k forks, 201 issues, 61 pull requests, 10 security and quality findings, and 2,108 commits during review.

The raw README describes WeKnora as an open-source LLM knowledge framework for enterprise-grade document understanding, semantic retrieval, and autonomous reasoning. It describes RAG-based Quick Q&A, a ReAct Agent, Wiki Mode, document ingestion, 20+ LLM provider integrations, model/provider swapping, local/private deployment, and Langfuse observability for reasoning, token usage, and pipeline tracing.

The README names provider and model contexts including OpenAI, Azure OpenAI, Anthropic, DeepSeek, Qwen, Zhipu, Hunyuan, Gemini, MiniMax, NVIDIA, Ollama, SiliconFlow, OpenRouter, and related embedding/vector storage components. The raw license states the main project is under the MIT License while third-party components carry their own terms.

No WeKnora code, README prose beyond minimal metadata facts, screenshots, configs, examples, prompts, datasets, traces, generated outputs, or implementation details were copied into AMC.

## Relevance decision

GAP-0966 is relevant to AMC because WeKnora's multi-provider RAG/agent context highlights a real provider and model drift risk: a model, embedding, vector store, reranker, or provider route can shift score, refusal, latency, cost, guardrail, or invalid-action distributions while the visible agent workflow appears unchanged.

The accepted AMC primitive already exists: `runProviderDriftBenchmark`, `buildProviderDriftEvalPack`, `buildProviderDriftWatchAlerts`, and `buildProviderDriftCiGate`. Valid proof requires provider version, canary results, drift statistic, signed evidence, replayable dataset hashes, and alert or waiver output. Repository metadata alone must not affect Score, Shield, or Watch.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through AMC-owned provider canary score rows, metric suites, thresholds, and dataset hashes. |
| Shield | Relevant when drift changes refusal, invalid-action, guardrail, or unsafe behavior metrics. |
| Enforce | No runtime policy, provider router, or circuit breaker changed in this slice. |
| Vault | No credential, data residency, storage, or document security behavior changed. |
| Watch | Relevant through existing Watch provider-drift alerts and CI/lifecycle gates. |
| Fleet | Multi-agent/RAG orchestration context only; no Fleet topology or orchestration behavior changed. |
| Passport | No portable proof-bundle field changed. |
| Comply | License and RBAC context only; no compliance mapping changed. |

## Product closure

No product code changed. The focused regression proves existing provider-drift primitives can accept WeKnora-style provider routing context only when AMC has signed canary rows, provider versions, metric suites, evaluator hashes, trace exports, dataset hashes, and CI gate evidence.

The positive path produces a replayable provider-drift eval pack and passes the CI gate without Watch alerts. The negative path fails closed when WeKnora repository, README, license, provider list, RAG, agent, wiki, and observability metadata replaces AMC-owned signed canary proof.

## Fail-closed rule

WeKnora repository metadata, README claims, license posture, star/fork/issue/PR counts, commit count, RAG labels, ReAct agent labels, Wiki Mode labels, provider names, Langfuse labels, and local backlog metadata are not provider-drift evidence.

A provider/model drift claim must fail closed unless provider version, canary results, drift statistic, signed evidence refs, evaluator config hash, generated test data hash, trace export hash, metric report hash, replayable dataset hash, threshold config, and alert or waiver evidence exist.

## No-bloat boundary

No WeKnora adapter, Tencent integration, RAG platform importer, provider connector, embedding connector, vector database connector, Langfuse integration, document-ingestion import, Wiki Mode clone, ReAct runtime, benchmark mirror, source-specific canary runner, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Score method, Passport field, methodology version bump, package dependency, or source-specific scoring path was added.

No upstream code, docs prose, screenshots, examples, prompts, datasets, configs, generated outputs, model responses, trace samples, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0966TencentWeKnoraProviderDriftBoundary.test.ts --reporter=dot` - 1 file / 4 tests passed.
- Paired regression: `npx vitest run tests/gap0965DeepEvalLiveDriftBoundary.test.ts tests/gap0966TencentWeKnoraProviderDriftBoundary.test.ts --reporter=dot` - 2 files / 8 tests passed.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` - passed.
- Typecheck: `npm run typecheck` - passed.
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
