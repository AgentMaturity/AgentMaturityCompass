# GAP-0874 - Claude RAG skills provider-drift boundary

- Gap: `GAP-0874`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `floflo777/claude-rag-skills`, `https://github.com/floflo777/claude-rag-skills`
- Retrieval: `2026-06-21` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed Star 32, Fork 3, Issues 0, Pull requests 0, 1 Commit, README.md, CONTRIBUTING.md, LICENSE, MIT license, No releases published, repository folders `chunking-advisor`, `examples`, `rag-audit`, `rag-eval`, and `rag-scaffold`, and file `marketplace.json`.
- Status: completed as a provider/model drift boundary over existing AMC canary receipts.

## Live source metadata

The live repository identifies Ailog RAG Skills for Claude Code. Relevant source-review signals include topics such as ai, claude-code, embeddings, vector-database, and retrieval-augmented-generation; RAG Audit; RAG Eval; Chunking Advisor; RAG Scaffold; chunking issues; embedding problems; retrieval anti-patterns; generation issues; production gaps; Recall@K; Precision@K; Mean Reciprocal Rank; Normalized Discounted Cumulative Gain; Faithfulness; Relevance; Coherence and conciseness; Ailog Benchmark; Ailog API; and Claude Code >= 2.0.0.

These facts are useful RAG evaluation and skill-workflow context, but they are not provider/model drift proof by themselves. No upstream Claude Code skill files, marketplace metadata, examples, prompts, scripts, metric implementations, Ailog configuration, benchmark rows, README prose beyond minimal metadata facts, screenshots, figures, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC through existing provider/model drift canary receipts because RAG quality metrics and Claude Code skill workflows can inform how users reason about Score, Shield, and Watch changes across model or provider updates. The closure is not a Claude Code skill importer, Ailog integration, RAG audit runner, RAG eval runner, chunking advisor, scaffold generator, or metric implementation; it is a fail-closed boundary showing that Claude RAG skills metadata is accepted only as source-review context unless AMC-owned provider-drift proof exists.

For provider/model drift to pass, AMC needs provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, row hashes, CI or lifecycle gate proof, and no-copy proof. GitHub/README/license/Claude/RAG skill metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing provider score distribution comparisons and canary result rows. |
| Shield | Relevant only as a fail-closed trust boundary; source metadata cannot stand in for signed provider-drift proof. |
| Watch | Relevant through existing provider drift alerts, Watch alert projection, and CI/lifecycle gate receipts. |
| Enforce | No runtime Claude skill policy, RAG policy, model-routing policy, or circuit breaker changed. |
| Vault | No skill files, marketplace metadata, prompts, examples, API config, or secure-storage behavior changed. |
| Fleet | Claude Code skill context only; no skill runner or orchestration topology added. |
| Passport | Existing provider-drift receipts can feed proof bundles, but no Passport schema changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No `src/benchmarks/providerDriftBenchmark.ts`, `src/watch/providerDriftAlerts.ts`, `src/api/benchmarkRouter.ts`, API, CLI, Studio, methodology, badge, diagnostic question bank, or scoring code changed for GAP-0874.

The focused regression exercises existing `runProviderDriftBenchmark`, `buildProviderDriftEvalPack`, `buildProviderDriftWatchAlerts`, and `buildProviderDriftCiGate` behavior with a positive Claude RAG skills-style canary packet and a negative source-metadata-only packet. The positive path requires provider version, canary results, drift statistic, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, and CI gate proof. The negative path fails closed when GitHub/README/license/Claude/RAG skill metadata replaces signed provider-drift evidence.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, CONTRIBUTING.md presence, LICENSE presence, MIT license metadata, Star 32, Fork 3, Issues 0, Pull requests 0, 1 Commit, No releases published, folder names, file names, topic labels, RAG Audit labels, RAG Eval labels, Chunking Advisor labels, RAG Scaffold labels, chunking issues labels, embedding problems labels, retrieval anti-patterns labels, generation issues labels, production gaps labels, Recall@K labels, Precision@K labels, Mean Reciprocal Rank labels, Normalized Discounted Cumulative Gain labels, Faithfulness labels, Relevance labels, Coherence and conciseness labels, Ailog Benchmark labels, Ailog API labels, Claude Code >= 2.0.0 labels, local backlog metadata, or source identity alone must fail closed for provider/model drift. Passing evidence requires provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, row hashes, CI or lifecycle gate proof, and no-copy proof.

## No-bloat boundary

No Claude RAG skills adapter, Claude Code skill importer, Ailog integration, RAG Audit runner, RAG Eval runner, Chunking Advisor, RAG Scaffold generator, metric implementation, benchmark row importer, Ailog API wrapper, marketplace importer, provider wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, diagnostic question-bank migration, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream Claude Code skill files, marketplace metadata, examples, prompts, scripts, metric implementations, Ailog configuration, benchmark rows, README prose beyond minimal metadata facts, screenshots, figures, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0874ClaudeRagSkillsProviderDriftBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the existing positive and negative provider-drift paths passed.
- Focused regression after doc addition: `npx vitest run tests/gap0874ClaudeRagSkillsProviderDriftBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0873EragQuestionExplainabilityBoundary.test.ts tests/gap0874ClaudeRagSkillsProviderDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
