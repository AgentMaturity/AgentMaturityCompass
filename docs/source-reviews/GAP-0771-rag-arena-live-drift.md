# GAP-0771 - RAG Arena live-drift boundary

- Gap: `GAP-0771`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: GitHub `https://github.com/firecrawl/rag-arena`, README `https://github.com/firecrawl/rag-arena/blob/master/README.md`, package manifest `https://github.com/firecrawl/rag-arena/blob/master/package.json`, license `https://github.com/firecrawl/rag-arena/blob/master/LICENSE`
- Retrieval: `2026-06-21` via GitHub connector fetch on default branch `master`.
- Status: closed through existing live score and behavior drift receipts; no RAG Arena app, retriever leaderboard, Supabase integration, or LangChain RAG evaluator added.

## Live source metadata

The live README identifies RAG Arena as an open-source Next.js project made by Mendable.ai that interfaces with LangChain to provide a RAG chatbot experience where queries receive multiple responses. Users vote on responses, responses are unblurred to reveal the retriever used, and a real-time leaderboard displays database data. The README describes Supabase database operations, Upstash Redis, a Python/Flask service, Neo4j graph-store setup, ingest route, dynamic retriever route, rate limiting, document RAG, OpenAI integration, voting logic, Elo adjustment, leaderboard rows, and RAG functions including vector store, parent document, multi-vector, contextual compression, time weighted, and multi-query retrievers.

The package manifest identifies a private Next.js app named `arena-chatbot` with dependencies including LangChain, Supabase, Upstash, OpenAI, Next, React, and TypeScript. The license file identifies MIT License and Mendable.ai copyright.

These facts are relevant to AMC as live score and behavior drift context only. User-feedback RAG leaderboards can drift when retrievers, prompts, indexing, providers, databases, latency, or vote distributions change. They do not justify importing RAG Arena, adding retriever implementations, mirroring leaderboard data, or changing AMC scoring semantics. No upstream README prose beyond minimal metadata facts, code, configs, environment variables, database schemas, retriever implementations, prompts, model outputs, leaderboard rows, or implementation details were copied into AMC.

## Relevance decision

GAP-0771 is relevant to AMC through existing Watch live score and behavior drift receipts because RAG retriever behavior and user-feedback distributions can shift after provider, prompt, corpus, index, ranking, or routing changes. The accepted AMC primitive is already `runLiveScoreBehaviorDrift` with baseline/live windows, behavior signatures, drift statistics, source refs, signed evidence refs, Watch alerts, and receipt verification.

The source can be retained only as context when the live-drift packet carries AMC-owned baseline rows, live rows, score distributions, behavior signatures, evidence refs, signed evidence refs, row hashes, receipt hash, alert receipt, and no-copy proof. GitHub/README/package/license metadata, retriever names, leaderboard labels, or vote labels alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing baseline/live score distribution comparisons for RAG retriever behavior. |
| Shield | Relevant through fail-closed checks for missing signed evidence and unsupported retriever, vote, or leaderboard claims. |
| Watch | Relevant through existing live score and behavior drift alert receipts. |
| Fleet | Multi-retriever context only; no orchestration or trust topology changed. |
| Enforce | No runtime RAG routing, rate-limit, or retriever policy changed. |
| Vault | No Supabase data, user votes, prompts, documents, or secure-storage behavior changed. |
| Passport | No portable proof-bundle field or external benchmark credential changed. |
| Comply | No compliance mapping changed. |

## Product closure

GAP-0771 is closed by documenting the live-source boundary and adding regression coverage over the existing live-drift primitive. The positive path proves that RAG Arena-style retriever drift context can be cited only with AMC-owned baseline/live rows, behavior signatures, source refs, signed evidence, Watch alert projection, and receipt verification. The negative path proves GitHub/README/package/retriever metadata fails closed.

No `src/watch/liveDriftAlerts.ts`, `src/drift/continuousMonitor.ts`, `src/score/index.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, RAG Arena app, Next.js route, Supabase integration, Upstash integration, LangChain retriever, Neo4j graph store, leaderboard, vote-tracking system, methodology version, diagnostic question bank, or scoring behavior changed for GAP-0771.

## Fail-closed rule

GitHub URL, README text, package metadata, license metadata, repository name, star counts, RAG Arena labels, Next.js labels, LangChain labels, Supabase labels, Upstash labels, Python/Flask labels, Neo4j labels, retriever names, leaderboard labels, vote counts, Elo labels, user-feedback labels, local backlog metadata, or source identity alone must fail closed for live-drift claims. Passing evidence requires AMC-owned baseline and live sample rows, score distributions, behavior signatures, evidence refs, signed evidence refs, receipt hash, Watch alert or waiver, and CI/lifecycle gate proof.

## No-bloat boundary

No RAG Arena app, Next.js route, Supabase integration, Upstash integration, LangChain retriever, Neo4j graph store, Python service, leaderboard, vote-tracking system, Elo runner, retriever benchmark mirror, repository importer, source-specific drift lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream README prose beyond minimal metadata facts, code, configs, environment variables, database schemas, retriever implementations, prompts, model outputs, leaderboard rows, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0771RagArenaLiveDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
