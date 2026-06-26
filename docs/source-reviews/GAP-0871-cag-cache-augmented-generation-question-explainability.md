# GAP-0871 - CAG Cache-Augmented Generation question-explainability boundary

- Gap: `GAP-0871`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `ai-in-pm/CAG-Cache-Augmented-Generation`, `https://github.com/ai-in-pm/CAG-Cache-Augmented-Generation`
- Retrieval: `2026-06-21` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed Star 33, Fork 6, Issues 2, Pull requests 0, 2 Commits, README.md, LICENSE, MIT license, cagai Latest Dec 30, 2024, Python 100.0%, repository folders `Data`, `Results`, `Scripts`, and `cag_demo`, and files including `Cache-Augmented Generation Paper.pdf`, `demonstrator.py`, `requirements.txt`, and `setup.py`.
- Status: completed as a question-level score explainability boundary over existing AMC receipts.

## Live source metadata

The live repository identifies a CAG Demonstrator Agent that compares Cache-Augmented Generation with Retrieval-Augmented Generation. Relevant source-review signals include provider labels OpenAI, Anthropic, Google, Mistral, and Groq, performance metrics, comparison reports, preloaded contexts, retrieved documents, and time comparisons.

These facts are useful CAG-versus-RAG evaluation context, but they are not question-level score explainability proof by themselves. No upstream source code, provider configuration, API-key setup, PDF content, demo outputs, prompts, comparison results, cached contexts, retrieved documents, metrics files, README prose beyond minimal metadata facts, screenshots, figures, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC through existing question-level score explainability receipts because CAG-versus-RAG performance context can inform how users reason about Score, Shield, and Watch question movement. The closure is not a CAG runner, RAG runner, provider integration, demonstrator wrapper, performance-comparison subsystem, cache importer, or retrieval importer; it is a fail-closed boundary showing that CAG demonstrator metadata is accepted only as source-review context unless AMC-owned question explainability proof exists.

For question-level score explainability to pass, AMC needs question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed evidence rows, source refs, thresholds, row hashes, replayability, and no-copy proof. GitHub/README/license/CAG-vs-RAG metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, and row-hashed question score receipts. |
| Shield | Relevant only as a fail-closed trust boundary; source metadata cannot stand in for signed question-level evidence. |
| Watch | Relevant through existing replayability and source-ref visibility; no live monitor changed. |
| Enforce | No runtime retrieval policy, cache policy, provider policy, or circuit breaker changed. |
| Vault | No provider keys, cached contexts, retrieved documents, PDFs, result files, or secure-storage behavior changed. |
| Fleet | CAG/RAG comparison context only; no provider or agent orchestration topology added. |
| Passport | Existing question explainability receipts can feed proof bundles, but no Passport schema changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No `src/diagnostic/questionScoreExplainability.ts`, `src/guide/guideGenerator.ts`, `src/passport/passportArtifact.ts`, API, CLI, Studio, methodology, badge, diagnostic question bank, or scoring code changed for GAP-0871.

The focused regression exercises existing `buildQuestionExplainabilityReport` behavior with a positive CAG demonstrator-style question explainability packet and a negative source-metadata-only packet. The positive path requires question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, source refs, thresholds, row hashes, and replayability. The negative path fails closed when GitHub/README/license/CAG-vs-RAG metadata replaces signed question-level score evidence.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, LICENSE presence, MIT license metadata, Star 33, Fork 6, Issues 2, Pull requests 0, 2 Commits, cagai Latest Dec 30, 2024, Python 100.0%, folder names, file names, Cache-Augmented Generation labels, Retrieval-Augmented Generation labels, OpenAI labels, Anthropic labels, Google labels, Mistral labels, Groq labels, performance metrics labels, comparison reports labels, preloaded contexts labels, retrieved documents labels, time comparisons labels, local backlog metadata, or source identity alone must fail closed for question-level score explainability. Passing evidence requires question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed evidence rows, source refs, thresholds, row hashes, replayability, and no-copy proof.

## No-bloat boundary

No CAG adapter, RAG runner, demonstrator wrapper, provider wrapper, OpenAI integration, Anthropic integration, Google integration, Mistral integration, Groq integration, API-key loader, cache importer, retrieved-document importer, comparison report parser, metrics importer, PDF ingester, provider wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, diagnostic question-bank migration, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream source code, provider configuration, API-key setup, PDF content, demo outputs, prompts, comparison results, cached contexts, retrieved documents, metrics files, README prose beyond minimal metadata facts, screenshots, figures, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0871CagCacheAugmentedGenerationQuestionExplainabilityBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the existing positive and negative question-explainability paths passed.
- Focused regression after doc addition: `npx vitest run tests/gap0871CagCacheAugmentedGenerationQuestionExplainabilityBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0870MasevalMetricValidityBoundary.test.ts tests/gap0871CagCacheAugmentedGenerationQuestionExplainabilityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
