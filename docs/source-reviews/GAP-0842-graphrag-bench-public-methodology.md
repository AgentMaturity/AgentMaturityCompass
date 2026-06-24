# GAP-0842 - GraphRAG-Bench public-methodology boundary

- Gap: `GAP-0842`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `jeremycp3/GraphRAG-Bench`, `https://github.com/jeremycp3/GraphRAG-Bench`, arXiv `https://arxiv.org/abs/2506.02404`, Hugging Face dataset `https://huggingface.co/datasets/jeremycp3/GraphRAG-Bench`
- Retrieval: `2026-06-21` via live GitHub page, GitHub REST API, README API, license API, and shell header checks. Repository URL returned HTTP/2 200. api.github.com repository metadata returned `stargazers_count` 75, language Python, description metadata for `GraphRAG-Bench: Challenging Domain-Specific Reasoning for Evaluating Graph Retrieval-Augmented Generation`, and no repository topics. README.md API lookup succeeded. License metadata was null and the license API returned Not Found.
- Status: skipped as public-methodology implementation evidence; no public methodology versioning change was made.

## Live source metadata

The live README and API metadata identify GraphRAG-Bench: Challenging Domain-Specific Reasoning for Evaluating Graph Retrieval-Augmented Generation. Relevant source-review signals include the official leaderboard, arXiv paper, Hugging Face dataset, 5 question types, 16 disciplines, 7 million words, 20 computer science textbooks, reasoning score, Accuracy, evaluator script context, and Python implementation context.

These facts are useful benchmark and methodology context, but they are not AMC public-methodology evidence. No upstream benchmark rows, textbook corpus content, question examples, rationales, answers, evaluator code, leaderboard rows, dataset records, README prose beyond minimal metadata facts, arXiv prose, Hugging Face data, screenshots, figures, prompts, outputs, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC as source-review context for public methodology versioning because domain-specific graph RAG benchmarks can influence how users reason about Score, Shield, and Watch limitations. It does not justify changing AMC public scoring semantics by itself.

For a public methodology change to pass, AMC needs an AMC-owned methodology version, changelog, deprecation notice, migration guidance, known-limitations update, evidence taxonomy change, badge/report semantics, signed evidence refs, row hashes, release lifecycle proof, and no-copy proof. GraphRAG-Bench metadata alone cannot justify a public methodology version bump. GAP-0842 is therefore closed as a documented no-op: the source remains useful context, but No public methodology version bump was made.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only; no scoring semantics changed because the source did not supply an AMC-owned methodology version/change record. |
| Shield | Context only; fail-closed boundary protects users from unsupported graph-RAG methodology claims. |
| Watch | Context only; no monitoring receipt or public methodology lifecycle event changed. |
| Enforce | No runtime policy, route enforcement, graph-RAG policy, or circuit breaker changed. |
| Vault | No datasets, textbook content, question rows, rationales, answers, prompts, or secure-storage behavior changed. |
| Fleet | Benchmark context only; no orchestration topology or multi-agent benchmark runner added. |
| Passport | No portable proof-bundle field, badge semantics, or public proof token changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed for GAP-0842.

The focused regression verifies that GitHub/API/README/arXiv/Hugging Face/dataset/leaderboard/question-type/corpus/reasoning/accuracy metadata stays out of AMC public methodology semantics. No public methodology version bump, changelog update, deprecation notice, migration guidance, badge semantic change, API route, CLI command, or Studio change was added.

## Fail-closed rule

GitHub HTTP/2 200 reachability, api.github.com repository metadata, README.md presence, license API returned Not Found, `stargazers_count` 75, Python label, official leaderboard label, arXiv link, Hugging Face dataset link, 5 question types label, 16 disciplines label, 7 million words label, 20 computer science textbooks label, reasoning score label, Accuracy label, evaluator label, local backlog metadata, or source identity alone must fail closed for public methodology versioning. Passing evidence requires AMC-owned methodology version, changelog, deprecation notice, migration guidance, known-limitations text, evidence taxonomy change, badge/report semantics, signed evidence refs, row hashes, release lifecycle proof, and no-copy proof.

## No-bloat boundary

No GraphRAG-Bench runner, graph-RAG benchmark importer, official leaderboard integration, arXiv importer, Hugging Face dataset mirror, textbook corpus mirror, evaluator script adapter, question-type parser, dataset converter, benchmark mirror, provider wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific methodology path, or source-specific scoring path was added. No upstream benchmark rows, textbook corpus content, question examples, rationales, answers, evaluator code, leaderboard rows, dataset records, README prose beyond minimal metadata facts, arXiv prose, Hugging Face data, screenshots, figures, prompts, outputs, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0842GraphRagBenchPublicMethodologyBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the implementation no-leakage check passed.
- Focused regression after doc addition: `npx vitest run tests/gap0842GraphRagBenchPublicMethodologyBoundary.test.ts --reporter=dot` passed, 1 file / 3 tests.
- Paired regression: `npx vitest run tests/gap0841LegalRagKubernetesProviderDriftBoundary.test.ts tests/gap0842GraphRagBenchPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
