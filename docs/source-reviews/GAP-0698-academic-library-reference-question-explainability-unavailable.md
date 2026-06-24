# GAP-0698 - Academic library reference question-explainability unavailable-source boundary

- Gap: `GAP-0698`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: backlog OpenAlex `W7125387752`, DOI `10.1108/rsr-05-2025-0030`, and title `Deploying and evaluating a conversational agent using LLMs for academic library reference`
- Retrieval: `2026-06-21` via browser search and direct URL attempts; exact-title, DOI, OpenAlex, and publisher-domain searches did not surface a reachable primary source in this environment. Shell network remains DNS-restricted in this environment.
- Status: skipped as product-changing evidence; relevant theme only through existing question-level score explainability when AMC-owned evidence exists.

## Live source metadata

The local backlog identifies a paper titled `Deploying and evaluating a conversational agent using LLMs for academic library reference`, DOI `10.1108/rsr-05-2025-0030`, OpenAlex work `W7125387752`, improvement dimension question-level score explainability, and category `Agent evaluation and benchmarks`. Browser verification on `2026-06-21` could not reach a primary publisher page or OpenAlex page: exact-title, DOI, OpenAlex, Emerald publisher-domain, and quoted-title searches did not surface a reachable primary source.

These facts are insufficient for a product or scoring claim. The academic-library RAG/chatbot evaluation context is directionally relevant to AMC question explainability, but maturity proof still requires AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed evidence refs, thresholds, row hashes, and no-copy proof. No upstream paper prose, abstract text beyond local backlog metadata, method details, rubrics, tables, figures, library transcripts, chatbot answers, prompts, datasets, screenshots, or implementation details were copied into AMC.

## Relevance decision

GAP-0698 is not accepted as standalone AMC evidence because the primary source was unavailable for live review and the remaining facts are metadata-only. The theme maps to existing question-level score explainability, but no source-specific implementation is justified.

The accepted AMC primitive is already `buildQuestionExplainabilityReport`. A source citation to this paper can be retained only as context when each question row carries AMC-owned accepted evidence, rejected evidence reasons, repair hints, signed evidence refs, thresholds, and row hashes. Metadata-only paper identity must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only when existing AMC question rows explain why each L0-L5 question moved using accepted evidence, rejected reasons, repair hints, thresholds, and row hashes. |
| Shield | Relevant only when unsupported evaluation claims are rejected with explicit reasons and fail closed instead of raising assurance confidence. |
| Watch | Relevant only when caller-owned evaluation runs and evidence receipts are hash-bound; no live monitor changed. |
| Enforce | No runtime policy, library-chatbot guardrail, or enforcement behavior changed. |
| Vault | No library transcripts, user questions, prompts, answers, datasets, or secure-storage behavior changed. |
| Fleet | No conversational-agent framework, library-reference workflow, or multi-agent orchestration adapter added. |
| Passport | No portable proof-bundle field or credential changed. |
| Comply | No library, education, accessibility, privacy, or audit-control mapping changed. |

## Product closure

GAP-0698 is closed by documenting the unavailable-source boundary and adding regression coverage over the existing question-score explainability primitive. The positive path proves that academic-library reference context can be cited only after AMC-owned question evidence exists. The negative path proves DOI/OpenAlex/title metadata fails closed.

No `src/diagnostic/questionScoreExplainability.ts`, `src/guide/guideGenerator.ts`, `src/passport/passportArtifact.ts`, API, CLI, Studio, diagnostic question bank, Passport field, Watch monitor, academic-library chatbot adapter, RAG reference workflow, publisher importer, paper parser, rubric importer, dataset importer, or scoring behavior changed for GAP-0698.

## Fail-closed rule

OpenAlex work ID, DOI, title, academic-library labels, RAG/chatbot labels, conversational-agent labels, evaluation category labels, publisher identity, local backlog metadata, or source identity alone must fail closed for question-score explainability claims. Passing evidence requires AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed evidence refs, thresholds, row hashes, and no-copy proof.

## No-bloat boundary

No academic-library chatbot adapter, reference-desk workflow, RAG library corpus, Emerald importer, OpenAlex importer, paper parser, rubric importer, transcript importer, dataset importer, QA benchmark pack, source-specific question lens, API route, CLI command, Studio panel, Passport field, methodology version bump, or parity layer was added. No library-reference product claim was added. No upstream paper prose, abstract text beyond local backlog metadata, method details, rubrics, tables, figures, library transcripts, chatbot answers, prompts, datasets, screenshots, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0698AcademicLibraryReferenceQuestionExplainabilityUnavailableBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
