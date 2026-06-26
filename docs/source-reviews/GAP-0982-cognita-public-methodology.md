# GAP-0982 - Cognita public-methodology boundary

- Gap: `GAP-0982`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: live GitHub repository page at `https://github.com/truefoundry/cognita`, GitHub API record at `https://api.github.com/repos/truefoundry/cognita`, raw README at `https://raw.githubusercontent.com/truefoundry/cognita/main/README.md`, and raw license at `https://raw.githubusercontent.com/truefoundry/cognita/main/LICENSE`
- Retrieval: `2026-06-24` live source review through the web research channel, GitHub API inspection, and terminal HTTP checks. The GitHub page identified the repository as a Public archive; the GitHub API returned current metadata; raw README and LICENSE returned `HTTP/2 200`.
- Status: Done - skipped as public-methodology implementation evidence; no public methodology version bump, badge method change, diagnostic methodology versioning change, Cognita importer, RAG framework integration, TrueFoundry gateway integration, or source-specific public methodology path added.
- Linear: `AMC-1261`

## Live source metadata

The live GitHub page identifies `truefoundry/cognita` as a Public archive and states that the repository was archived by the owner on Mar 13, 2026. The README note says the project is no longer actively maintained.

The GitHub API identifies the repository description as RAG framework context for modular open-source production applications by TrueFoundry, with `archived` true, `disabled` false, default branch `main`, language Python, Apache-2.0 license, stargazers_count `4408`, forks_count `390`, open_issues_count `22`, watchers_count `4408`, created_at `2023-07-26T13:08:54Z`, pushed_at `2026-03-13T15:04:36Z`, and updated_at `2026-06-24T06:23:00Z`. Topics include agent, ai, application, data, deep-learning, fine-tuning, framework, generative-ai, llm, llm-ops, llmops, machine-learning, mlops, model-deployment, python, rag, retrieval-augmented-generation, and typescript.

Relevant source-review signals include RAG, production ready deployment framing, modular components, API driven behavior, UI support, incremental indexing, Langchain and LlamaIndex usage, model gateway configuration, Vector DB components, TrueFoundry AI Gateway logging/metrics/feedback context, document parsing/indexing jobs, query services, embedding and reranking services, and deployment-oriented RAG architecture.

No upstream code, README prose beyond short metadata facts, docs prose, architecture diagrams, screenshots, sample data, configs, Docker Compose files, model configuration files, prompts, parser/loader/retriever implementations, frontend assets, backend routes, generated outputs, or implementation details were copied into AMC.

## Relevance decision

Cognita is relevant to AMC only as public-methodology context. It is a RAG production framework signal that can remind AMC to keep public methodology claims tied to versioned scoring semantics, known limitations, evidence taxonomy, changelog, deprecation notice, migration guidance, signed evidence, replayable eval rows, and regression thresholds.

It does not justify changing AMC public scoring semantics in this slice. The source is archived/read-only and no longer actively maintained, and the live review found no AMC-owned scoring formula, evidence taxonomy, badge semantics, diagnostic question bank, public API, CLI behavior, or user-visible methodology behavior change. Cognita source metadata alone cannot justify a public methodology version bump.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant as public-methodology context only; no Score formula, score category, evidence taxonomy, or public scoring semantics changed. |
| Shield | Relevant when unsupported RAG framework claims must fail closed; no Shield verifier changed. |
| Enforce | No runtime RAG guardrail, model gateway, policy enforcement, or circuit breaker changed. |
| Vault | No document data, sample data, credentials, vector-store data, or secure-storage behavior changed. |
| Watch | Relevant only as methodology transparency context for production RAG claims; no Watch monitor changed. |
| Fleet | No orchestration, RAG application topology, or fleet evidence changed. |
| Passport | No portable proof-bundle field changed. |
| Comply | No compliance mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed.

The closure is a no-bloat public-methodology relevance decision. Cognita metadata stays source-review context only; AMC public methodology should change only when AMC-owned score semantics, evidence taxonomy, methodology limitations, migration guidance, or badge assurance actually change.

No public methodology version bump was made.

## Fail-closed rule

GitHub repository reachability, Public archive status, archive date, no-longer-maintained notice, star/fork/issue/watch counts, Apache-2.0 license metadata, Python language metadata, README labels, RAG labels, production ready labels, modular labels, API driven labels, UI labels, incremental indexing labels, Langchain labels, LlamaIndex labels, model gateway labels, Vector DB labels, TrueFoundry AI Gateway labels, document parsing/indexing labels, query-service labels, local backlog metadata, or source identity alone cannot prove AMC public methodology versioning.

Passing public-methodology evidence requires an AMC-owned methodology version, changelog, deprecation notice, migration guidance, known limitations, evidence taxonomy, source-review/no-copy boundary, and an actual public scoring, diagnostic, badge, API, CLI, or user-visible methodology semantic change.

## No-bloat boundary

No Cognita importer, RAG framework integration, TrueFoundry gateway integration, Langchain wrapper, LlamaIndex wrapper, vector DB adapter, parser/loader/retriever importer, Docker Compose integration, model gateway config importer, UI mirror, RAG app deployment path, public methodology version bump, diagnostic methodology versioning field, badge source-review notice, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, package dependency, or source-specific public methodology path was added.

No upstream code, README prose beyond short metadata facts, docs prose, architecture diagrams, screenshots, sample data, configs, Docker Compose files, model configuration files, prompts, parser/loader/retriever implementations, frontend assets, backend routes, generated outputs, or implementation details were copied.

## Verification

- Expected-red regression: `npx vitest run tests/gap0982CognitaPublicMethodologyBoundary.test.ts --reporter=dot` failed before this document existed, with 1 implementation guard passing and 2 missing-document assertions failing.
- Focused regression: `npx vitest run tests/gap0982CognitaPublicMethodologyBoundary.test.ts --reporter=dot` passed, 1 file / 3 tests.
- Paired regression: `npx vitest run tests/gap0981CtiThinkerAdversarialRegressionBoundary.test.ts tests/gap0982CognitaPublicMethodologyBoundary.test.ts --reporter=dot` passed, 2 files / 7 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 829 files / 7,313 tests.
