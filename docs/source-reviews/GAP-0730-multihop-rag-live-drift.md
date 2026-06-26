# GAP-0730 - MultiHop-RAG live-drift boundary

- Gap: `GAP-0730`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/yixuantt/MultiHop-RAG`, live README at `https://raw.githubusercontent.com/yixuantt/MultiHop-RAG/main/README.md`, and arXiv `https://arxiv.org/abs/2401.15391`
- Retrieval: `2026-06-21` via browser access to the raw GitHub README and live arXiv page; shell network remains DNS-restricted in this environment.
- Status: closed through existing Watch live score and behavior drift receipts; no MultiHop-RAG dataset mirror, retriever runner, QA runner, evaluation runner, or RAG subsystem added.

## Live source metadata

The live README identifies `yixuantt/MultiHop-RAG` as a dataset for evaluating retrieval-augmented generation across documents. Relevant source-review signals include `2556` queries, supporting evidence distributed across `2` to `4` documents, document metadata in the RAG pipeline, a Hugging Face dataloader link, simple retrieval and QA examples, retrieval and QA evaluation scripts, a construction-pipeline reference, COLM 2024 acceptance, and ODC-BY licensing. The live arXiv page identifies the paper `MultiHop-RAG: Benchmarking Retrieval-Augmented Generation for Multi-Hop Queries`, authors Yixuan Tang and Yi Yang, submitted `2024-01-27`, DOI `10.48550/arxiv.2401.15391`, and a public GitHub link.

These facts are relevant to AMC only as live score and behavior drift context. Multi-hop RAG systems can regress when the retriever, reranker, generator, document metadata, evidence linking, prompt template, embedding model, or corpus snapshot changes. That does not justify copying the dataset, mirroring benchmark rows, running the repository scripts, adding a RAG engine, or claiming benchmark parity. No upstream README prose beyond minimal metadata facts, dataset rows, queries, evidence documents, dataloader code, scripts, pipeline code, prompts, configs, examples, results, images, citation blocks, or implementation details were copied into AMC.

## Relevance decision

GAP-0730 is relevant to AMC through existing Watch live score and behavior drift receipts. The accepted AMC primitive is already `runLiveScoreBehaviorDrift`: baseline/live windows, score distributions, behavior signatures, drift statistics, alert receipts, source refs, signed evidence refs, row hashes, receipt hashes, and Watch alert projection.

MultiHop-RAG context sharpens what must be measured for RAG agents: answer score drift, retrieval-behavior drift, multi-hop evidence-coverage drift, metadata-use drift, latency/cost drift, and signed trace evidence. Repository, README, arXiv, DOI, query-count, script-name, or dataset-label metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing baseline/live score distributions for RAG evaluation rows. |
| Shield | Relevant through fail-closed signed evidence requirements for unsupported benchmark, retrieval, or QA claims. |
| Watch | Relevant through existing drift statistics, alert receipts, receipt hashes, and Watch alert projection. |
| Enforce | No runtime retrieval policy, prompt policy, metadata policy, or circuit-breaker behavior changed. |
| Vault | No queries, documents, metadata, answer keys, prompts, traces, embeddings, or secure-storage behavior changed. |
| Fleet | RAG pipeline context only; no orchestration adapter or multi-agent topology changed. |
| Passport | No portable proof-bundle field or external benchmark credential changed. |
| Comply | Dataset and benchmark context only; no compliance mapping changed. |

## Product closure

GAP-0730 is closed by documenting the live-source boundary and adding regression coverage over the existing live score and behavior drift primitive. The positive path exercises MultiHop-RAG-style multi-hop retrieval and answer behavior drift through AMC-owned baseline/live rows, signed evidence refs, source refs, receipt hashes, and Watch alert projection. The negative path fails closed when repository/README/arXiv metadata replaces signed live-drift evidence.

No `src/watch/liveDriftAlerts.ts`, `src/drift/continuousMonitor.ts`, `src/score/index.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, MultiHop-RAG adapter, dataset mirror, Hugging Face dataloader, retriever runner, reranker runner, QA runner, evaluation runner, construction-pipeline runner, embedding-model benchmark, RAG benchmark service, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0730.

## Fail-closed rule

Repository identity, repository URL, raw README labels, MultiHop-RAG labels, query-count labels, multi-hop labels, evidence-document labels, document-metadata labels, RAG-pipeline labels, Hugging Face dataloader labels, simple-retrieval labels, QA-script labels, retrieval-evaluation labels, QA-evaluation labels, construction-pipeline labels, COLM 2024 labels, ODC-BY license labels, arXiv id, DOI, author list, local backlog metadata, or source identity alone must fail closed for live score and behavior drift claims. Passing evidence requires AMC-owned baseline distributions, live sample rows, behavior signatures, drift statistics, alert receipts, source refs, receipt hashes, signed evidence refs, row hashes, Watch alert or waiver proof, and no-copy proof.

## No-bloat boundary

No MultiHop-RAG integration, dataset mirror, query importer, evidence-document importer, Hugging Face dataloader, retriever runner, reranker runner, QA runner, retrieval evaluator, QA evaluator, construction-pipeline runner, metadata parser, embedding-model benchmark, RAG benchmark service, arXiv importer, OpenAlex importer, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream README prose beyond minimal metadata facts, dataset rows, queries, evidence documents, dataloader code, scripts, pipeline code, prompts, configs, examples, results, images, citation blocks, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0730MultihopRagLiveDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
