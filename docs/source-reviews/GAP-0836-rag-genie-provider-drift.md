# GAP-0836 - RAG Genie provider-drift boundary

- Gap: `GAP-0836`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `stephanj/rag-genie`, `https://github.com/stephanj/rag-genie`
- Retrieval: `2026-06-21` via live GitHub page review and shell header checks. Repository URL returned HTTP/2 200. The live page exposed README.md, LICENSE.txt, MIT license metadata, Java implementation context, and RAG Genie project metadata. Direct api.github.com DNS lookup failed in this shell.
- Status: closed through existing provider-drift benchmark receipts; no RAG Genie integration, Java/Spring Boot service, Angular UI, PostgreSQL schema, embedding tester, chunking tester, Q&A evaluator, or source-specific provider-drift adapter added.

## Live source metadata

The live repository page identifies RAG Genie as `The RAG Genie, an LLM RAG prototype to test and evaluate your embeddings, chunk splitting strategies using Q&A and evaluations.` Relevant source-review signals include embeddings, chunk splitting strategies, Q&A, evaluations, Java, Spring Boot, Angular, PostgreSQL, README.md, LICENSE.txt, and MIT license metadata.

These facts are provider/model drift context only. They do not authorize copying upstream code, README prose beyond minimal metadata facts, Java services, Angular UI, database schemas, prompts, Q&A examples, evaluation rows, generated answers, screenshots, configs, or implementation details into AMC.

## Relevance decision

GAP-0836 is relevant to AMC because RAG evaluation outcomes can drift when provider models, embeddings, chunking, prompts, retrieval indexes, generation settings, or evaluator configs change. The gap maps to AMC's existing provider/model drift benchmark primitive: provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, observability proof, and CI gate proof.

It does not require a RAG Genie runner, Java service, Spring Boot integration, Angular UI, PostgreSQL importer, embedding evaluator, chunk-splitting evaluator, Q&A evaluator, GitHub importer, API route, CLI command, Studio panel, or methodology version bump. Repository metadata can explain why provider drift matters for RAG evaluation settings, but it cannot replace AMC-owned provider-drift evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing provider-drift score distributions, canary rows, eval packs, and CI gate proof. |
| Shield | Relevant because RAG evaluation claims fail closed without signed evidence and evaluation-framework proof. |
| Watch | Relevant through provider-drift alerts, drift statistics, observability proof, and alert or waiver evidence. |
| Enforce | No runtime RAG policy, provider route, retrieval policy, chunking policy, or circuit breaker changed. |
| Vault | No documents, embeddings, prompts, Q&A rows, generated answers, schemas, or secure-storage behavior changed. |
| Fleet | RAG prototype context only; no orchestration topology or multi-agent runtime changed. |
| Passport | No portable trust token or proof-bundle schema changed. |
| Comply | RAG evaluation context only; no compliance framework mapping changed. |

## Product closure

No `src/benchmarks/providerDriftBenchmark.ts`, `src/watch/providerDriftAlerts.ts`, `src/api/benchmarkRouter.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, RAG Genie integration, Java/Spring Boot service, Angular UI, PostgreSQL schema, embedding tester, chunking tester, Q&A evaluator, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0836.

The focused regression exercises the existing `runProviderDriftBenchmark`, `buildProviderDriftEvalPack`, Watch alert projection, and CI gate path. The positive path requires provider version, canary results, drift statistic, signed evidence, replayable eval-pack rows, observability proof, and CI gate proof. The negative path fails closed when repository metadata replaces AMC-owned provider-drift evidence.

## Fail-closed rule

GitHub HTTP/2 200 reachability, README.md presence, LICENSE.txt presence, MIT license metadata, api.github.com DNS lookup failed, repository title, RAG Genie label, embeddings label, chunk splitting strategies label, Q&A label, evaluations label, Java label, Spring Boot label, Angular label, PostgreSQL label, local backlog metadata, or source identity alone must fail closed for provider/model drift claims.

Passing evidence requires AMC-owned provider version, canary results, drift statistic, alert or waiver, signed evidence refs, evaluation-framework proof, observability pipeline proof, replayable eval-pack rows, CI gate proof, source refs, row hashes, and no-copy proof.

## No-bloat boundary

No RAG Genie integration, Java/Spring Boot service, Angular UI, PostgreSQL schema, embedding tester, chunking tester, Q&A evaluator, repository importer, benchmark mirror, provider wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific metric lens, or source-specific scoring path was added. No upstream code, README prose beyond minimal metadata facts, Java services, Angular UI, database schemas, prompts, Q&A examples, evaluation rows, generated answers, screenshots, configs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0836RagGenieProviderDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
