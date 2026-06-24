# GAP-0951 - Haystack question explainability

- Gap: `GAP-0951`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: live GitHub repository page for `deepset-ai/haystack`, `https://github.com/deepset-ai/haystack`; homepage `https://haystack.deepset.ai/`; docs `https://docs.haystack.deepset.ai/docs/intro`
- Retrieval: `2026-06-22` via live source review
- Status: Done

## Live source metadata

The live GitHub repository page identified `deepset-ai/haystack` as public, on `main`, with Star 25.6k, Fork 2.9k, Issues 81, Pull requests 27, 5,491 Commits, Apache-2.0 license, v2.30.2 Latest Jun 18, 2026, MDX 81.4%, and an Apache-2.0, Unknown licenses found sidebar note. Its README described Haystack as an Open-source AI orchestration framework for building production-ready LLM applications in Python and for context-engineered, production-ready LLM applications.

The README describes explicit control over retrieval, routing, memory, and generation; a transparent and traceable architecture; Model- and vendor-agnostic integrations; and built-in components for retrieval, indexing, tool calling, memory, and evaluation. It also describes the Haystack Enterprise Platform as a way to manage data, retrieval, and testing workflows, secure access controls, auditability, and scalable cloud or on-prem deployment.

The live Haystack homepage identified Haystack as The Open Source AI Framework for Production Ready Agents, RAG & Context Engineering. It stated Haystack Sets the Standard for Agentic AI Across Industries, and described Build Transparent, Context Engineered AI Systems, full visibility to inspect, debug, and optimize every decision your AI makes, Integrate Freely with Your AI Stack, no vendor lock-in, Operate at Enterprise Scale, built-in reliability and observability, AI Agents, standardized tool calling, and Branching and looping pipelines.

The live docs page was Introduction to Haystack, Version: 2.30. It described Haystack as an open-source AI framework for building production-ready AI Agents, powerful RAG applications, and scalable multimodal search systems. It also described reusable components, components and pipelines, Document Stores, Agents, Tools, and the enterprise platform for data, pipelines, testing, and governance at scale.

Those facts are relevant to AMC only as source-review context for question-level score explainability. They do not justify a Haystack adapter, pipeline runner, RAG benchmark mirror, or source-specific scoring path.

## Relevance decision

`GAP-0951` is relevant through AMC's existing question-level score explainability primitive. Haystack's orchestration, RAG, agent, tool-use, evaluation, and observability context maps to the need to expose why each L0-L5 question moved, which accepted evidence IDs were used, which rejected evidence reasons were recorded, and what repair hint remains.

The product closure is not Haystack parity. It is an AMC-owned explainability receipt that ties question ID, accepted evidence IDs, rejected evidence reasons, repair hint, reproducible eval pack, row hashes, and fail-closed thresholds to signed evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Primary surface. Question-level explainability must show question ID, level movement, accepted evidence IDs, rejected evidence reasons, repair hint, and row hashes. |
| Shield | Relevant when missing gates or rejected evidence describe unsafe, unverified, or unsupported agent behavior. |
| Watch | Relevant as source-review context for observable agent/pipeline behavior, but no Watch runtime change is required. |
| Enforce | No runtime policy changed. |
| Vault | No upstream traces, prompts, documents, datasets, or pipeline artifacts stored. |
| Fleet | Agent-workflow context only; no fleet topology changed. |
| Passport | Relevant only because existing Passport artifacts can carry AMC-owned question evidence; no Passport schema changed. |
| Comply | No compliance mapping changed. |

## Product closure

No product code changed. The focused regression exercises existing `buildQuestionExplainabilityReport` and `buildEvalScoreExplainabilityPack` behavior with a Haystack-style source context. The positive path proves an accepted question row requires AMC-owned accepted evidence IDs, signed evidence, rejected evidence reasons, repair hint, reproducible eval pack, and fail-closed thresholds. The negative path proves Haystack repository, homepage, docs, framework, RAG, agent, observability, evaluation, tool-use, governance, and version metadata fails closed when it replaces AMC-owned question evidence.

No `src/diagnostic/questionScoreExplainability.ts`, `src/guide/guideGenerator.ts`, `src/passport/passportArtifact.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed.

## Fail-closed rule

Live GitHub reachability, `deepset-ai/haystack` repository metadata, Star 25.6k, Fork 2.9k, Issues 81, Pull requests 27, 5,491 Commits, Apache-2.0 license, v2.30.2 Latest Jun 18, 2026, MDX 81.4%, homepage slogans, production-ready agent/RAG/context-engineering labels, model- and vendor-agnostic labels, pipeline labels, tool-calling labels, testing and governance labels, enterprise-platform labels, local backlog metadata, or GitHub repository identity alone must fail closed for question-level score explainability.

Passing question-level explainability requires AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, reproducible eval pack evidence, threshold checks, and row hashes.

## No-bloat boundary

No Haystack adapter, pipeline runner, RAG importer, Document Store bridge, agent workflow runner, tool-calling bridge, memory importer, evaluation runner, deployment wrapper, Hayhooks wrapper, MCP wrapper, enterprise governance mapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport schema change, source-specific implementation module, source-specific scoring path, or parity wrapper was added. No Haystack code, docs prose beyond minimal metadata facts, screenshots, examples, configs, traces, prompts, eval datasets, benchmark rows, model outputs, generated outputs, or implementation details were copied into AMC.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0951HaystackQuestionExplainabilityBoundary.test.ts --reporter=dot` failed because this source-review doc did not exist; the explainability, fail-closed, and implementation leakage checks already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0951HaystackQuestionExplainabilityBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired regression with `GAP-0950`: `npx vitest run tests/gap0950MlflowPublicMethodologyBoundary.test.ts tests/gap0951HaystackQuestionExplainabilityBoundary.test.ts --reporter=dot` passed, 2 files / 7 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
