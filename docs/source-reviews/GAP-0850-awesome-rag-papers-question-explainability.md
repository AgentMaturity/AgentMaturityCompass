# GAP-0850 - AwesomeRAGPapers question-explainability boundary

- Gap: `GAP-0850`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `HuggingAGI/AwesomeRAGPapers`, `https://github.com/HuggingAGI/AwesomeRAGPapers`
- Retrieval: `2026-06-21` via live GitHub page, GitHub REST API, README API, license API, and shell header checks. Repository URL returned HTTP/2 200. api.github.com repository metadata returned `stargazers_count` 52, no detected language, null license metadata, topics `llm`, `rag`, and `survey`, and description metadata for a curated collection of influential surveys and papers on Retrieval-Augmented Generation. README.md API lookup succeeded. The license API returned Not Found.
- Status: Done; closed by documenting and testing the existing question-level score explainability boundary without adding a paper-list importer.

## Live source metadata

The live README and API metadata identify AwesomeRAGPapers as a curated RAG paper list. Relevant source-review signals include Curated collection of influential surveys and papers on Retrieval-Augmented Generation, frameworks, evaluations, multi-modal extensions, domain-specific applications, Retrieval-Augmented Generation for AI-Generated Content: A Survey, A Survey on RAG Meeting LLMs, Modular RAG, A Comprehensive Survey of Retrieval-Augmented Generation, Graph Retrieval-Augmented Generation: A Survey, Agentic Retrieval-Augmented Generation, Blended RAG, Self-RAG, GraphRAG, LightRAG, KAG, HybridRAG, arXiv links, GitHub links, paper PDFs, and catalog context.

These facts are useful RAG benchmark and methodology context, but they are not AMC question-level score explainability evidence by themselves. No upstream paper list rows, paper PDFs, abstracts, figures, screenshots, images, Chinese README prose, arXiv prose, GitHub-linked source content, paper assets, citations, prompts, outputs, or implementation details were copied into AMC.

## Relevance decision

Relevant to AMC only through existing question-score explainability primitives. A RAG paper catalog can contextualize why a maturity question is important, but it cannot explain a specific L0-L5 movement unless AMC has question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, row hashes, and source refs.

The source does not justify a paper-list importer, arXiv crawler, PDF mirror, RAG survey classifier, or source-specific question lens. GAP-0850 is closed by regression coverage showing that AwesomeRAGPapers context can be represented by AMC-owned question-score evidence, and that GitHub/API/README/catalog/RAG survey metadata alone fails closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only when question movement is explained with AMC-owned accepted evidence, rejected evidence reasons, and row proof. |
| Shield | Context only; fail-closed boundary prevents unsupported RAG evaluation claims from influencing safety or assurance labels. |
| Watch | Context only; no runtime monitoring receipt changed. |
| Enforce | No runtime policy, route enforcement, or circuit breaker changed. |
| Vault | No paper PDFs, images, catalog rows, prompts, or secure-storage behavior changed. |
| Fleet | RAG survey context only; no orchestration topology or multi-agent runner added. |
| Passport | No portable proof-bundle field, badge semantics, or public proof token changed. |
| Comply | No compliance mapping changed. |

## Product closure

The product path remains the existing question-score explainability primitive: `buildQuestionExplainabilityReport`. The focused regression exercises an AwesomeRAGPapers-style RAG catalog context using AMC-owned question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, source refs, and row hashes.

No `src/diagnostic/questionScoreExplainability.ts`, `src/guide/guideGenerator.ts`, `src/passport/passportArtifact.ts`, API, CLI, Studio, methodology, badge, diagnostic question bank, or scoring code changed for GAP-0850.

## Fail-closed rule

GitHub HTTP/2 200 reachability, api.github.com repository metadata, README.md presence, license API returned Not Found, null license metadata, `stargazers_count` 52, no detected language, `llm` topic, `rag` topic, `survey` topic, Curated collection of influential surveys and papers on Retrieval-Augmented Generation label, frameworks label, evaluations label, multi-modal extensions label, domain-specific applications label, Retrieval-Augmented Generation for AI-Generated Content: A Survey label, A Survey on RAG Meeting LLMs label, Modular RAG label, A Comprehensive Survey of Retrieval-Augmented Generation label, Graph Retrieval-Augmented Generation: A Survey label, Agentic Retrieval-Augmented Generation label, Blended RAG label, Self-RAG label, GraphRAG label, LightRAG label, KAG label, HybridRAG label, local backlog metadata, or source identity alone must fail closed. Passing evidence requires AMC-owned question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, row hashes, source refs, and no-copy proof.

## No-bloat boundary

No AwesomeRAGPapers importer, arXiv crawler, PDF mirror, paper-list parser, survey classifier, RAG taxonomy module, catalog freshness monitor, GitHub-linked source importer, image mirror, citation importer, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific question lens, or source-specific scoring path was added. No upstream paper list rows, paper PDFs, abstracts, figures, screenshots, images, Chinese README prose, arXiv prose, GitHub-linked source content, paper assets, citations, prompts, outputs, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0850AwesomeRagPapersQuestionExplainabilityBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the question-explainability positive, metadata-only fail-closed, and no-leakage checks passed.
- Focused regression after doc addition: `npx vitest run tests/gap0850AwesomeRagPapersQuestionExplainabilityBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0849SparkDashboardProviderDriftBoundary.test.ts tests/gap0850AwesomeRagPapersQuestionExplainabilityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
