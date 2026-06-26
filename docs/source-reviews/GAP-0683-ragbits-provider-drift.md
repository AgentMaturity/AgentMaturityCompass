# GAP-0683 - Ragbits provider-drift boundary

- Gap: `GAP-0683`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/deepsense-ai/ragbits`
- Retrieval: `2026-06-21` via browser access to the live GitHub repository page; shell network remains DNS-restricted in this environment.
- Status: closed through existing provider-drift evaluator and observability receipts; no Ragbits integration or product code change.

## Live source metadata

The live GitHub page identifies `deepsense-ai/ragbits` as a public repository on branch `main`, with MIT license, `1.6k stars`, `139 forks`, `40 issues`, `10 pull requests`, and `519 commits`. The repository page shows `38 releases`, with latest release `v1.6.2` on `Mar 31, 2026`. The language panel lists `Python 80.2%` and `TypeScript 19.7%`. The topic list includes `optimization`, `evaluation`, `agents`, `prompts`, `document-search`, `rag`, `guardrails`, `llms`, and `vector-stores`.

The live README metadata positions Ragbits as GenAI application building blocks. Relevant source-review signals include `100+ LLMs via LiteLLM`, local model support, `ragbits-evaluate`, `ragbits-guardrails`, agentic systems, MCP/A2A context, `OpenTelemetry`, `CLI insights`, `promptfoo`, and auto-optimization. These facts are provider-routing, evaluation, guardrail, and observability context only. No upstream code, README prose beyond short metadata facts, install commands, examples, templates, package metadata, docs pages, screenshots, model outputs, benchmark rows, prompts, configs, or implementation details were copied into AMC.

## Relevance decision

Ragbits is relevant to AMC as provider/model drift context because it explicitly combines multi-LLM routing, evaluation, guardrails, RAG, agent workflows, and observability. That maps to AMC Score/Shield/Watch when an AMC-owned provider-drift canary supplies baseline and candidate provider versions, evaluator configuration, generated test data hash, metric suite, metric ids, verdict aggregation, observability pipeline identifiers, trace export hash, metric report hash, signed evidence refs, eval-pack row hashes, Watch alert or waiver proof, CI gate receipts, and no-copy proof.

This does not justify a Ragbits-specific subsystem. GAP-0683 is closed by documenting the source boundary and adding regression coverage that Ragbits-style evaluator and OpenTelemetry/CLI-insight evidence flows through the existing generic provider-drift engine. Repository metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing provider-drift canary comparisons, evaluator metric suites, eval-pack row hashes, and signed evidence refs. |
| Shield | Relevant through guardrail pass-rate evidence and fail-closed signed proof requirements. |
| Watch | Relevant through existing drift statistics, observability pipeline proof, Watch alert projection, and waiver handling. |
| Enforce | No runtime policy, circuit breaker, MCP/A2A guardrail, or provider enforcement behavior changed. |
| Vault | No secrets, data-residency, private dataset, vector-store, or secure-storage behavior changed. |
| Fleet | Agent/workflow context only; no Ragbits agent runner, A2A adapter, MCP connector, or trust topology was added. |
| Passport | No portable proof-bundle field, trust token, or external credential changed. |
| Comply | No compliance mapping, audit-control mapping, or regulated-domain claim changed. |

## Product closure

No `src/benchmarks/providerDriftBenchmark.ts`, `src/api/benchmarkRouter.ts`, `src/api/watchRouter.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Ragbits adapter, LiteLLM wrapper, OpenTelemetry importer, promptfoo runner, RAG pipeline, package dependency, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0683.

The focused regression exercises the existing provider-drift engine with Ragbits-style fixture data. The positive path requires AMC-owned evaluator, pipeline, trace, metric, signed-evidence, eval-pack, Watch, and CI proof. The negative path fails closed when Ragbits repository metadata is present but signed evidence, evaluator proof, trace export, and metric report evidence are incomplete.

## Fail-closed rule

Ragbits repository identity, stars, forks, issue or pull-request counts, commit counts, release labels, topic labels, package names, LiteLLM labels, OpenTelemetry labels, CLI-insight labels, promptfoo labels, evaluation labels, guardrail labels, RAG labels, local backlog metadata, or source identity alone must fail closed for provider/model drift claims. Passing evidence requires AMC-owned provider versions, canary results, drift statistics, evaluator configuration, generated test-data hash, metric ids and count, verdict aggregation, observability pipeline ids, trace export hash, metric report hash, alert or waiver proof, signed evidence refs, eval-pack row hashes, CI/lifecycle receipts, and no-copy proof.

## No-bloat boundary

No Ragbits provider-drift adapter, LiteLLM wrapper, OpenTelemetry collector, CLI-insights parser, promptfoo runner, ragbits-evaluate importer, ragbits-guardrails importer, RAG pipeline, agent workflow runner, A2A adapter, MCP connector, vector-store connector, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, or source-specific scoring path was added. No upstream code, README prose beyond short metadata facts, install commands, examples, templates, package metadata, docs pages, screenshots, model outputs, benchmark rows, prompts, configs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0683RagbitsProviderDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
