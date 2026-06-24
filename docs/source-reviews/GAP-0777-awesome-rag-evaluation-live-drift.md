# GAP-0777 - Awesome RAG Evaluation live-drift boundary

- Gap: `GAP-0777`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: GitHub `https://github.com/YHPeter/Awesome-RAG-Evaluation`, README `https://github.com/YHPeter/Awesome-RAG-Evaluation/blob/main/README.md`, arXiv `https://arxiv.org/pdf/2405.07437`, license `https://github.com/YHPeter/Awesome-RAG-Evaluation/blob/main/LICENSE`
- Retrieval: `2026-06-21` via GitHub connector fetch on default branch `main`; `requirements.txt` path returned 404.
- Status: closed through existing live score and behavior drift receipts; no RAG evaluation catalog, benchmark importer, or survey methodology added.

## Live source metadata

The live README identifies the repository as the official repository for `Evaluation of Retrieval-Augmented Generation: A Survey`, links arXiv `2405.07437`, and states the paper was accepted by the `2024 CCF Big Data`. The README frames a unified RAG evaluation process called `Auepora`, with retrieval and generation components, and discusses quantifiable metrics such as relevance, accuracy, and faithfulness. It also lists RAG evaluation tools and benchmarks including TruLens RAG Triad, LangChain Bench, Databricks Eval, RAGAs, ARES, RGB, MultiHop-RAG, CRUD-RAG, MedRAGBench, RAGBench, LegalBench-RAG, CRAG, FreshLLMs, and others. Changelog entries show the repository adding and updating benchmarks through `2025-04-21`.

The license file identifies MIT License with copyright `2024 YHPeter`. The checked `requirements.txt` path returned 404.

These facts are relevant to AMC as live score and behavior drift context only. RAG evaluation catalogs can drift when benchmark coverage, metric definitions, retrieval/generation assumptions, datasets, or framework references change. They do not justify importing the catalog, mirroring benchmark links, adding RAG evaluators, or changing AMC scoring semantics. No upstream README prose beyond minimal metadata facts, benchmark tables, links, datasets, metrics, figures, BibTeX entries, configs, code, or implementation details were copied into AMC.

## Relevance decision

GAP-0777 is relevant to AMC through existing Watch live score and behavior drift receipts because RAG evaluation behavior can drift as retrieval/generation metrics, benchmarks, datasets, providers, prompts, or references change. The accepted AMC primitive is already `runLiveScoreBehaviorDrift` with baseline/live windows, behavior signatures, drift statistics, source refs, signed evidence refs, Watch alerts, and receipt verification.

The source can be retained only as context when the live-drift packet carries AMC-owned baseline rows, live rows, score distributions, behavior signatures, evidence refs, signed evidence refs, row hashes, receipt hash, alert receipt, and no-copy proof. GitHub/README/license metadata, benchmark names, metric names, or catalog entries alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing baseline/live score distribution comparisons for RAG evaluation behavior. |
| Shield | Relevant through fail-closed checks for missing signed evidence and unsupported benchmark, metric, or catalog claims. |
| Watch | Relevant through existing live score and behavior drift alert receipts. |
| Fleet | RAG evaluator catalog context only; no orchestration or trust topology changed. |
| Enforce | No runtime RAG metric, retrieval, or generation policy changed. |
| Vault | No datasets, benchmark rows, prompts, or secure-storage behavior changed. |
| Passport | No portable proof-bundle field or external benchmark credential changed. |
| Comply | No compliance mapping changed. |

## Product closure

GAP-0777 is closed by documenting the live-source boundary and adding regression coverage over the existing live-drift primitive. The positive path proves that RAG evaluation catalog context can be cited only with AMC-owned baseline/live rows, behavior signatures, source refs, signed evidence, Watch alert projection, and receipt verification. The negative path proves GitHub/README/license/benchmark metadata fails closed.

No `src/watch/liveDriftAlerts.ts`, `src/drift/continuousMonitor.ts`, `src/score/index.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, RAG evaluation catalog importer, benchmark mirror, RAGAs/ARES/RGB adapter, dataset importer, survey methodology, methodology version, diagnostic question bank, or scoring behavior changed for GAP-0777.

## Fail-closed rule

GitHub URL, README text, license metadata, repository name, arXiv link, CCF Big Data label, Auepora label, retrieval labels, generation labels, relevance labels, accuracy labels, faithfulness labels, benchmark names, dataset names, changelog entries, local backlog metadata, or source identity alone must fail closed for live-drift claims. Passing evidence requires AMC-owned baseline and live sample rows, score distributions, behavior signatures, evidence refs, signed evidence refs, receipt hash, Watch alert or waiver, and CI/lifecycle gate proof.

## No-bloat boundary

No RAG evaluation catalog importer, benchmark mirror, RAGAs adapter, ARES adapter, RGB adapter, MultiHop-RAG adapter, CRUD-RAG adapter, MedRAGBench adapter, RAGBench adapter, LegalBench-RAG adapter, CRAG adapter, dataset importer, survey methodology, GitHub importer, source-specific drift lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream README prose beyond minimal metadata facts, benchmark tables, links, datasets, metrics, figures, BibTeX entries, configs, code, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0777AwesomeRagEvaluationLiveDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
