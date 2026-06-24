# GAP-0845 - Azure AI Search notebooks public-methodology boundary

- Gap: `GAP-0845`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `Azure-Samples/rag-with-azure-ai-search-notebooks`, `https://github.com/Azure-Samples/rag-with-azure-ai-search-notebooks`
- Retrieval: `2026-06-21` via live GitHub page, GitHub REST API, README API, license API, and shell header checks. Repository URL returned HTTP/2 200. api.github.com repository metadata returned `stargazers_count` 69, language Jupyter Notebook, MIT License metadata, no topics, and description metadata for notebooks demonstrating vector search, hybrid search, image search, RAG, and evaluation with Azure AI Search. README.md and LICENSE.md API lookups succeeded.
- Status: skipped as public-methodology implementation evidence; no public methodology versioning change was made.

## Live source metadata

The live README identifies Azure AI Search Demos. Relevant source-review signals include Azure AI Search, Azure OpenAI, Azure AI Vision, vector search, hybrid search, image search, RAG Evaluation, Vector Embeddings Notebook, Azure AI Search Notebook, Azure AI Search Relevance Notebook, RAG with Azure AI Search, Image Search Notebook, Keyword Search, Hybrid Search with RRF, Reranker, product catalog examples, `azd up`, and Jupyter Notebook implementation context.

These facts are useful RAG/search/evaluation context, but they are not AMC public-methodology evidence. No upstream notebooks, notebook cells, product catalog records, vector examples, image examples, retrieval examples, ranking examples, evaluation examples, Azure deployment configs, prompts, outputs, sample data, README prose beyond minimal metadata facts, screenshots, figures, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC as source-review context for public methodology versioning because RAG/search/evaluation notebooks can influence how users reason about Score, Shield, and Watch limitations. It does not justify changing AMC public scoring semantics by itself.

For a public methodology change to pass, AMC needs an AMC-owned methodology version, changelog, deprecation notice, migration guidance, known-limitations update, evidence taxonomy change, badge/report semantics, signed evidence refs, row hashes, release lifecycle proof, and no-copy proof. Azure AI Search notebook metadata alone cannot justify a public methodology version bump. GAP-0845 is therefore closed as a documented no-op: the source remains useful context, but No public methodology version bump was made.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only; no scoring semantics changed because the source did not supply an AMC-owned methodology version/change record. |
| Shield | Context only; fail-closed boundary protects users from unsupported RAG/search/evaluation methodology claims. |
| Watch | Context only; no monitoring receipt or public methodology lifecycle event changed. |
| Enforce | No runtime search policy, retrieval enforcement, Azure policy, or circuit breaker changed. |
| Vault | No notebooks, sample data, prompts, Azure configs, product catalog records, or secure-storage behavior changed. |
| Fleet | Evaluation context only; no orchestration topology, RAG runner, or fleet benchmark runner added. |
| Passport | No portable proof-bundle field, badge semantics, or public proof token changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed for GAP-0845.

The focused regression verifies that GitHub/API/README/license/Azure AI Search/Azure OpenAI/Azure AI Vision/vector search/hybrid search/image search/RAG Evaluation/notebook/RRF/Reranker metadata stays out of AMC public methodology semantics. No public methodology version bump, changelog update, deprecation notice, migration guidance, badge semantic change, API route, CLI command, or Studio change was added.

## Fail-closed rule

GitHub HTTP/2 200 reachability, api.github.com repository metadata, README.md presence, LICENSE.md presence, MIT License metadata, `stargazers_count` 69, Jupyter Notebook label, Azure AI Search label, Azure OpenAI label, Azure AI Vision label, vector search label, hybrid search label, image search label, RAG Evaluation label, Vector Embeddings Notebook label, Azure AI Search Relevance Notebook label, Hybrid Search with RRF label, Reranker label, local backlog metadata, or source identity alone must fail closed for public methodology versioning. Passing evidence requires AMC-owned methodology version, changelog, deprecation notice, migration guidance, known-limitations text, evidence taxonomy change, badge/report semantics, signed evidence refs, row hashes, release lifecycle proof, and no-copy proof.

## No-bloat boundary

No Azure AI Search adapter, Azure OpenAI wrapper, Azure AI Vision adapter, notebook runner, notebook importer, product catalog importer, vector-search runner, hybrid-search runner, image-search runner, RAG Evaluation runner, relevance notebook importer, RRF implementation, Reranker adapter, Azure deployment helper, Azure config mirror, sample-data mirror, benchmark mirror, provider wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific methodology path, or source-specific scoring path was added. No upstream notebooks, notebook cells, product catalog records, vector examples, image examples, retrieval examples, ranking examples, evaluation examples, Azure deployment configs, prompts, outputs, sample data, README prose beyond minimal metadata facts, screenshots, figures, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0845AzureAiSearchPublicMethodologyBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the implementation no-leakage check passed.
- Focused regression after doc addition: `npx vitest run tests/gap0845AzureAiSearchPublicMethodologyBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0844CircleGuardBenchPublicMethodologyBoundary.test.ts tests/gap0845AzureAiSearchPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
