# GAP-0758 - RAG Experiment Accelerator live-drift boundary

- Gap: `GAP-0758`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/microsoft/rag-experiment-accelerator`, README `https://github.com/microsoft/rag-experiment-accelerator/blob/development/README.md`
- Retrieval: `2026-06-21` via GitHub connector default-branch README, license, requirements, `config.sample.json`, and `04_evaluation.py` fetches; shell network remains DNS-restricted in this environment.
- Status: closed through existing Watch live score and behavior drift receipts; no RAG Experiment Accelerator integration, Azure AI Search adapter, Azure OpenAI adapter, Azure ML pipeline, or RAG evaluator runner added.

## Live source metadata

The GitHub connector fetched `microsoft/rag-experiment-accelerator` from default branch `development`. The README identifies RAG Experiment Accelerator as a tool for conducting experiments and evaluations using Azure AI Search and a RAG pattern. Relevant source-review signals include Azure AI Search, Azure OpenAI, Azure Machine Learning, MLFlow, search hyperparameters, search strategies, query sets, evaluation metrics, multiple search indexes, Document Intelligence loaders, query generation, pure text search, pure vector search, hybrid search, sub-querying, LLM re-ranking, MAP@k retrieval metrics, end-to-end metrics, component-wise LLM-as-judge metrics, `llm_answer_relevance`, `llm_context_precision`, `llm_context_recall`, report generation, multilingual analyzers, content sampling, representative samples, roughly `10%` margin guidance, `config.sample.json`, `04_evaluation.py`, `azure_oai_eval_deployment_name`, and MIT License metadata.

These facts are relevant to AMC only as live score and behavior drift context. RAG experiment systems can drift when indexing, chunking, embedding dimensions, sampling, analyzer choices, query expansion, HyDE configuration, retrieval thresholds, reranking, model deployment, evaluator prompts, component metrics, or report generation changes. That does not justify copying Microsoft code, integrating Azure services, running its pipeline, or claiming RAG Experiment Accelerator parity. No upstream README prose beyond minimal metadata facts, code, command examples, config JSON, report images, sample artifacts, dependency manifests, license text, prompts, evaluation rows, Azure setup steps, or implementation details were copied into AMC.

## Relevance decision

GAP-0758 is relevant to AMC through existing Watch live score and behavior drift receipts. The accepted AMC primitive is already `runLiveScoreBehaviorDrift`: baseline/live windows, score distributions, behavior signatures, drift statistics, alert receipts, source refs, signed evidence refs, row hashes, receipt hashes, and Watch alert projection.

RAG Experiment Accelerator context sharpens what must be measured for RAG evaluation agents: retrieval score drift, answer score drift, context precision/recall drift, LLM-as-judge drift, search strategy behavior drift, query expansion behavior drift, reranker drift, embedding model drift, sampling drift, latency drift, cost drift, and signed trace evidence. Repository, README, Azure, MLFlow, metric, config, report, or pipeline labels alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing baseline/live score distributions for RAG evaluation rows. |
| Shield | Relevant through fail-closed signed evidence requirements for unsupported RAG, evaluator, or Azure-service claims. |
| Watch | Relevant through existing drift statistics, alert receipts, receipt hashes, and Watch alert projection. |
| Enforce | No runtime RAG policy, search policy, model policy, or circuit-breaker behavior changed. |
| Vault | No Azure credentials, OpenAI keys, documents, prompts, configs, datasets, or secure-storage behavior changed. |
| Fleet | RAG experimentation context only; no orchestration adapter or fleet topology changed. |
| Passport | No portable proof-bundle field or external benchmark credential changed. |
| Comply | Azure/RAG context only; no compliance mapping changed. |

## Product closure

GAP-0758 is closed by documenting the live-source boundary and adding regression coverage over the existing live score and behavior drift primitive. The positive path exercises RAG Experiment Accelerator-style search/evaluation drift through AMC-owned baseline/live rows, signed evidence refs, source refs, receipt hashes, and Watch alert projection. The negative path fails closed when repository/README/config/metric metadata replaces signed live-drift evidence.

No `src/watch/liveDriftAlerts.ts`, `src/drift/continuousMonitor.ts`, `src/score/index.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, RAG Experiment Accelerator adapter, Azure AI Search integration, Azure OpenAI integration, Azure ML pipeline, MLFlow reporter, Document Intelligence loader, search strategy runner, query expansion runner, reranker, sampling pipeline, evaluation runner, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0758.

## Fail-closed rule

Repository identity, repository URL, README URL, RAG Experiment Accelerator labels, Azure AI Search labels, Azure OpenAI labels, Azure ML labels, MLFlow labels, search-strategy labels, query-set labels, Document Intelligence labels, query-generation labels, sub-querying labels, reranking labels, MAP@k labels, LLM-as-judge labels, `llm_answer_relevance` labels, `llm_context_precision` labels, `llm_context_recall` labels, sampling labels, config labels, report labels, dependency labels, MIT License labels, local backlog metadata, or source identity alone must fail closed for live score and behavior drift claims. Passing evidence requires AMC-owned baseline distributions, live sample rows, behavior signatures, drift statistics, alert receipts, source refs, receipt hashes, signed evidence refs, row hashes, Watch alert or waiver proof, and no-copy proof.

## No-bloat boundary

No RAG Experiment Accelerator integration, Azure AI Search adapter, Azure OpenAI adapter, Azure ML pipeline, MLFlow reporter, Document Intelligence loader, LangChain loader, RAG evaluator runner, search strategy runner, query expansion runner, HyDE adapter, reranker, MAP@k runner, LLM-as-judge metric runner, sampling pipeline, config importer, report importer, Azure provisioner, docs importer, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream README prose beyond minimal metadata facts, code, command examples, config JSON, report images, sample artifacts, dependency manifests, license text, prompts, evaluation rows, Azure setup steps, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0758RagExperimentAcceleratorLiveDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
