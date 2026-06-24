# GAP-0880 - CORAG provider-drift boundary

- Gap: `GAP-0880`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `harinaralasetty/CORAG`, `https://github.com/harinaralasetty/CORAG`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed Star 27, Fork 3, Issues 0, Pull requests 1, 41 Commits, README.md, LICENSE, Apache-2.0 license, No releases published, Python 100.0%, repository folders `chat_management`, `inference`, `preprocessing`, `prompts`, `retrieval`, `test_files`, and `toolkit`, and files including `CORAG_ICON.png`, `Flowchart.png`, `Screenshot.png`, `config.py`, `requirements.txt`, and `server.py`.
- Status: completed as a provider/model drift boundary over existing AMC canary receipts.

## Live source metadata

The live repository identifies Completely OpenSource Retrieval Augmented Generation. Relevant source-review signals include Google Gemini, Anthropic Claude, Google, Voyage AI, OpenAI, sentence-transformers, PDF documents, audio files, conversational history, HNSW indexing, cosine similarity, Custom Agent Executor, search and calculator tools, conversational memory, and NiceGUI.

These facts are useful RAG provider/embedding drift context, but they are not provider/model drift proof by themselves. No upstream source code, API key configuration, prompts, document/audio processing code, images, screenshots, HNSW implementation details, tool code, UI code, README prose beyond minimal metadata facts, generated outputs, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC through existing provider/model drift canary receipts because multi-provider RAG, embedding providers, tool routing, memory, and retrieval quality can inform how users reason about Score, Shield, and Watch changes across model or provider updates. The closure is not a CORAG adapter, RAG runner, PDF/audio processor, HNSW importer, provider-key loader, UI integration, or tool-router implementation; it is a fail-closed boundary showing that CORAG metadata is accepted only as source-review context unless AMC-owned provider-drift proof exists.

For provider/model drift to pass, AMC needs provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, row hashes, CI or lifecycle gate proof, and no-copy proof. GitHub/README/license/CORAG metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing provider score distribution comparisons and canary result rows. |
| Shield | Relevant only as a fail-closed trust boundary for RAG/tool-provider context; source metadata cannot stand in for signed provider-drift proof. |
| Watch | Relevant through existing provider drift alerts, Watch alert projection, and CI/lifecycle gate receipts. |
| Enforce | No runtime provider policy, retrieval policy, API-key policy, or circuit breaker changed. |
| Vault | No API keys, document/audio inputs, prompts, embeddings, UI assets, or secure-storage behavior changed. |
| Fleet | RAG agent context only; no CORAG runner or orchestration topology added. |
| Passport | Existing provider-drift receipts can feed proof bundles, but no Passport schema changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No `src/benchmarks/providerDriftBenchmark.ts`, `src/watch/providerDriftAlerts.ts`, `src/api/benchmarkRouter.ts`, API, CLI, Studio, methodology, badge, diagnostic question bank, or scoring code changed for GAP-0880.

The focused regression exercises existing `runProviderDriftBenchmark`, `buildProviderDriftEvalPack`, `buildProviderDriftWatchAlerts`, and `buildProviderDriftCiGate` behavior with a positive CORAG-style canary packet and a negative source-metadata-only packet. The positive path requires provider version, canary results, drift statistic, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, and CI gate proof. The negative path fails closed when GitHub/README/license/CORAG metadata replaces signed provider-drift evidence.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, LICENSE presence, Apache-2.0 license metadata, Star 27, Fork 3, Issues 0, Pull requests 1, 41 Commits, No releases published, Python 100.0%, folder names, file names, Google Gemini labels, Anthropic Claude labels, Google labels, Voyage AI labels, OpenAI labels, sentence-transformers labels, PDF documents labels, audio files labels, conversational history labels, HNSW indexing labels, cosine similarity labels, Custom Agent Executor labels, search and calculator labels, conversational memory labels, NiceGUI labels, local backlog metadata, or source identity alone must fail closed for provider/model drift. Passing evidence requires provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, row hashes, CI or lifecycle gate proof, and no-copy proof.

## No-bloat boundary

No CORAG adapter, RAG runner, PDF processor, audio processor, document importer, embedding provider wrapper, HNSW importer, reranker, Custom Agent Executor, search tool, calculator tool, memory manager, NiceGUI integration, API-key loader, provider wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, diagnostic question-bank migration, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream source code, API key configuration, prompts, document/audio processing code, images, screenshots, HNSW implementation details, tool code, UI code, README prose beyond minimal metadata facts, generated outputs, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0880CoragProviderDriftBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the existing positive and negative provider-drift paths passed.
- Focused regression after doc addition: `npx vitest run tests/gap0880CoragProviderDriftBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0879MultiAgentEvalProviderDriftBoundary.test.ts tests/gap0880CoragProviderDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
