# GAP-0761 - A-RAG live-drift boundary

- Gap: `GAP-0761`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/Ayanami0730/arag`, README `https://github.com/Ayanami0730/arag/blob/main/README.md`, arXiv `https://arxiv.org/abs/2602.03442`, website `https://agentresearchlab.org/agents/a-rag/index.html#home`, dataset `https://huggingface.co/datasets/Ayanami0730/rag_test`
- Retrieval: `2026-06-21` via GitHub connector default-branch README, `pyproject.toml`, `scripts/eval.py`, and `configs/example.yaml` fetches; shell network remains DNS-restricted in this environment.
- Status: closed through existing Watch live score and behavior drift receipts; no A-RAG integration, hierarchical retrieval adapter, dataset importer, embedding-index builder, or benchmark runner added.

## Live source metadata

The GitHub connector fetched `Ayanami0730/arag` from default branch `main`. The README identifies the source as `A-RAG: Scaling Agentic Retrieval-Augmented Generation via Hierarchical Retrieval Interfaces`, links arXiv `2602.03442`, a project website, and a HuggingFace dataset. Relevant source-review signals include hierarchical retrieval interfaces, `keyword_search`, `semantic_search`, `chunk_read`, autonomous strategy, iterative execution, interleaved tool use, ReAct-like action-observation-reasoning loop, Graph RAG, Workflow RAG, Qwen3-Embedding-0.6B, `ARAG_API_KEY`, `ARAG_BASE_URL`, `ARAG_MODEL`, `batch_runner.py`, `eval.py`, MuSiQue, HotpotQA, 2WikiMultiHopQA, GraphRAG-Bench, LLM-Evaluation Accuracy, Contain-Match Accuracy, GPT-4o-mini, GPT-5-mini, `max_loops`, `max_token_budget`, `total_cost`, `total_retrieved_tokens`, answer rate, LLM accuracy, contain accuracy, average loops, Python `>=3.10`, package version `0.1.0`, and MIT License metadata.

These facts are relevant to AMC only as live score and behavior drift context. Agentic RAG systems can drift when retrieval strategy, embedding index, query decomposition, keyword search, semantic search, chunk reading, ReAct loop depth, model provider, judge prompt, token budget, cost, latency, or dataset distribution changes. That does not justify copying A-RAG, importing its HuggingFace dataset, building its embedding index, running its benchmark, or claiming hierarchical-retrieval parity. No upstream README prose beyond minimal metadata facts, code snippets, command examples, benchmark tables, dataset rows, config files, prompts, outputs, scripts, dependency manifests, license text, or implementation details were copied into AMC.

## Relevance decision

GAP-0761 is relevant to AMC through existing Watch live score and behavior drift receipts. The accepted AMC primitive is already `runLiveScoreBehaviorDrift`: baseline/live windows, score distributions, behavior signatures, drift statistics, alert receipts, source refs, signed evidence refs, row hashes, receipt hashes, and Watch alert projection.

A-RAG context sharpens what must be measured for agentic RAG drift: answer score drift, retrieval behavior drift, keyword/semantic/chunk tool routing drift, loop-count drift, token/cost drift, latency drift, error attribution drift, judge-evaluation drift, and signed trace evidence. Repository, README, arXiv, website, dataset, benchmark-table, config, tool-name, or script labels alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing baseline/live score distributions for agentic RAG eval rows. |
| Shield | Relevant through fail-closed signed evidence requirements for unsupported retrieval, judge, and benchmark claims. |
| Watch | Relevant through existing drift statistics, alert receipts, receipt hashes, and Watch alert projection. |
| Enforce | No runtime RAG policy, retrieval-tool policy, model policy, or circuit-breaker behavior changed. |
| Vault | No API keys, datasets, chunks, questions, predictions, prompts, configs, or secure-storage behavior changed. |
| Fleet | Agentic RAG context only; no orchestration adapter or fleet topology changed. |
| Passport | No portable proof-bundle field or external benchmark credential changed. |
| Comply | No compliance mapping changed. |

## Product closure

GAP-0761 is closed by documenting the live-source boundary and adding regression coverage over the existing live score and behavior drift primitive. The positive path exercises A-RAG-style hierarchical retrieval drift through AMC-owned baseline/live rows, signed evidence refs, source refs, receipt hashes, and Watch alert projection. The negative path fails closed when repository/README/arXiv/dataset/benchmark metadata replaces signed live-drift evidence.

No `src/watch/liveDriftAlerts.ts`, `src/drift/continuousMonitor.ts`, `src/score/index.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, A-RAG adapter, hierarchical retrieval adapter, keyword-search adapter, semantic-search adapter, chunk-read adapter, ReAct loop runner, HuggingFace dataset importer, embedding-index builder, batch runner, evaluator, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0761.

## Fail-closed rule

Repository identity, repository URL, README URL, arXiv URL, website URL, HuggingFace dataset URL, A-RAG labels, hierarchical retrieval labels, keyword-search labels, semantic-search labels, chunk-read labels, autonomous-strategy labels, iterative-execution labels, interleaved-tool-use labels, ReAct labels, Graph RAG labels, Workflow RAG labels, Qwen3 embedding labels, API-key labels, model-provider labels, batch-runner labels, eval-script labels, MuSiQue labels, HotpotQA labels, 2Wiki labels, GraphRAG-Bench labels, LLM-Evaluation Accuracy labels, Contain-Match Accuracy labels, GPT-4o-mini labels, GPT-5-mini labels, loop/token/cost labels, package-version labels, MIT License labels, local backlog metadata, or source identity alone must fail closed for live score and behavior drift claims. Passing evidence requires AMC-owned baseline distributions, live sample rows, behavior signatures, drift statistics, alert receipts, source refs, receipt hashes, signed evidence refs, row hashes, Watch alert or waiver proof, and no-copy proof.

## No-bloat boundary

No A-RAG integration, hierarchical retrieval adapter, keyword-search adapter, semantic-search adapter, chunk-read adapter, ReAct loop runner, HuggingFace dataset importer, Qwen embedding-index builder, batch runner, evaluator, benchmark-table mirror, config importer, prompt importer, prediction importer, arXiv importer, website scraper, docs importer, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream README prose beyond minimal metadata facts, code snippets, command examples, benchmark tables, dataset rows, config files, prompts, outputs, scripts, dependency manifests, license text, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0761AragLiveDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
