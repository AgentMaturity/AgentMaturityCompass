# GAP-0751 - OpenCE live-drift boundary

- Gap: `GAP-0751`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/sci-m-wang/OpenCE` and README `https://github.com/sci-m-wang/OpenCE/blob/main/README.md`
- Retrieval: `2026-06-21` via GitHub connector repository metadata and README fetch; shell network remains DNS-restricted in this environment.
- Status: closed through existing Watch live score and behavior drift receipts; no OpenCE integration, context-engineering adapter, ACE wrapper, or closed-loop orchestrator added.

## Live source metadata

The GitHub connector identifies `sci-m-wang/OpenCE` as a public, unarchived repository with default branch `main`. The README identifies OpenCE as a closed-loop Context Engineering toolkit and pluggable meta-framework evolving from an ACE reproduction. Relevant source-review signals include context engineering, RAG, ACE, compression, sense/reason/evaluate/evolve strategy loops, evaluation signals, evolution signals, long-term memory/strategy modules, ACE Reflector, RAGAS, ACE Curator, adaptive RAG policies, five pillar interfaces, Acquisition, Processing, Construction, Evaluation, Evolution, `IAcquirer`, `IProcessor`, `IConstructor`, `IEvaluator`, `IEvolver`, `src/opence/interfaces`, `src/opence/components`, `src/opence/adapters`, LangChain and LlamaIndex adapters, ClosedLoopOrchestrator, ACEClosedLoopMethod, MethodRegistry, OpenAIModelProvider, TransformersModelProvider, RWKVModelProvider, DummyModelProvider, OfflineAdapter, OnlineAdapter, Playbook, Generator, Reflector, Curator, scripts, tests, uv workflow, pytest, and roadmap benchmark-pack plans.

These facts are relevant to AMC only as live score and behavior drift context. Closed-loop context systems can drift when acquisition, processing, construction, evaluator, evolver, memory, strategy, model provider, adapter, prompt construction, or context compression behavior changes. That does not justify copying OpenCE, integrating its adapters, running its ACE method, or claiming context-engineering parity. No upstream README prose beyond minimal metadata facts, code, package layout, examples, command snippets, roadmap text, configs, model-provider implementations, ACE components, or implementation details were copied into AMC.

## Relevance decision

GAP-0751 is relevant to AMC through existing Watch live score and behavior drift receipts. The accepted AMC primitive is already `runLiveScoreBehaviorDrift`: baseline/live windows, score distributions, behavior signatures, drift statistics, alert receipts, source refs, signed evidence refs, row hashes, receipt hashes, and Watch alert projection.

OpenCE context sharpens what must be measured for closed-loop context engineering agents: answer score drift, context-acquisition behavior drift, processing/compression drift, prompt-construction drift, evaluator drift, evolver/memory update drift, provider-route drift, adapter drift, latency drift, cost drift, and signed trace evidence. Repository, README, five-pillar labels, interface names, ACE labels, adapter labels, provider labels, roadmap labels, or test-script labels alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing baseline/live score distributions for context-engineering eval rows. |
| Shield | Relevant through fail-closed signed evidence requirements for unsupported context, evaluator, memory, or adapter claims. |
| Watch | Relevant through existing drift statistics, alert receipts, receipt hashes, and Watch alert projection. |
| Enforce | No runtime context policy, RAG policy, adapter policy, or circuit-breaker behavior changed. |
| Vault | No documents, prompts, memories, provider credentials, playbooks, or secure-storage behavior changed. |
| Fleet | Context-engineering orchestration context only; no OpenCE orchestrator or multi-agent topology added. |
| Passport | No portable proof-bundle field or external benchmark credential changed. |
| Comply | Context-engineering context only; no compliance mapping changed. |

## Product closure

GAP-0751 is closed by documenting the live-source boundary and adding regression coverage over the existing live score and behavior drift primitive. The positive path exercises OpenCE-style closed-loop context drift through AMC-owned baseline/live rows, signed evidence refs, source refs, receipt hashes, and Watch alert projection. The negative path fails closed when repository/README metadata replaces signed live-drift evidence.

No `src/watch/liveDriftAlerts.ts`, `src/drift/continuousMonitor.ts`, `src/score/index.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, OpenCE adapter, context-engineering toolkit, ClosedLoopOrchestrator, ACE wrapper, RAGAS adapter, LangChain/LlamaIndex adapter, model-provider adapter, memory/evolution module, compression module, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0751.

## Fail-closed rule

Repository identity, repository URL, README URL, OpenCE labels, Context Engineering labels, RAG labels, ACE labels, compression labels, five-pillar labels, acquisition/processing/construction/evaluation/evolution labels, interface names, ACE Reflector/RAGAS/ACE Curator labels, adaptive RAG labels, ClosedLoopOrchestrator labels, MethodRegistry labels, provider labels, adapter labels, script/test labels, roadmap labels, local backlog metadata, or source identity alone must fail closed for live score and behavior drift claims. Passing evidence requires AMC-owned baseline distributions, live sample rows, behavior signatures, drift statistics, alert receipts, source refs, receipt hashes, signed evidence refs, row hashes, Watch alert or waiver proof, and no-copy proof.

## No-bloat boundary

No OpenCE integration, context-engineering toolkit, ClosedLoopOrchestrator, ACEClosedLoopMethod, MethodRegistry, ACE wrapper, RAGAS adapter, LangChain adapter, LlamaIndex adapter, OpenAI/Transformers/RWKV provider adapter, memory/evolution module, acquisition/processing/construction/evaluation/evolution interface, compression module, playbook module, script runner, docs importer, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream README prose beyond minimal metadata facts, code, package layout, examples, command snippets, roadmap text, configs, model-provider implementations, ACE components, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0751OpenCeLiveDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
