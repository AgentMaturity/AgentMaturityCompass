# GAP-0750 - CAIM public-methodology boundary

- Gap: `GAP-0750`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: arXiv `https://arxiv.org/abs/2505.13044`, arXiv DOI `10.48550/arXiv.2505.13044`, backlog DOI `10.1145/3742413.3789222`, backlog OpenAlex `W7133361058`, and title `CAIM: Development and Evaluation of a Cognitive AI Memory Framework for Long-Term Interaction with Intelligent Agents`
- Retrieval: `2026-06-21` via live arXiv page review and DOI/title search; shell network remains DNS-restricted in this environment.
- Status: skipped as a public-methodology version change; no AMC methodology version bump, diagnostic migration, badge change, memory framework, long-term interaction benchmark, or cognitive AI subsystem added.

## Live source metadata

The live arXiv source identifies CAIM as research on a cognitive AI memory framework for long-term interaction with intelligent agents. The arXiv page lists authors Rebecca Westhaeusser, Frederik Berenz, Wolfgang Minker, and Sebastian Zepf; submitted `2025-05-19`; arXiv id `2505.13044`; arXiv DOI `10.48550/arXiv.2505.13044`; and subjects Artificial Intelligence and Human-Computer Interaction.

Relevant source-review signals include long-term interactions, user adaptation, contextual knowledge, changing-environment context, holistic memory modeling, cognitive AI principles, thoughts, memory mechanisms, decision-making, Memory Controller, Memory Retrieval, Post-Thinking, memory storage, retrieval accuracy, response correctness, contextual coherence, memory storage metrics, and baseline comparison. These facts are useful as memory-evaluation context, but they do not define AMC scoring semantics, evidence taxonomy, changelog entries, deprecation notices, migration guidance, validation artifacts, badge behavior, or public comparability rules. No upstream abstract prose beyond minimal metadata facts, evaluation rows, memory traces, prompts, benchmark data, figures, tables, algorithms, configs, or implementation details were copied into AMC.

## Relevance decision

GAP-0750 is relevant to AMC only as public-methodology boundary evidence. CAIM-style long-term memory evaluation can inform future evidence taxonomy for memory-heavy agents, but AMC already has public methodology/versioning primitives and should not treat a memory-framework paper as a methodology source.

The accepted AMC primitive is the existing public methodology manifest and versioning path. This slice intentionally does not change that path because the arXiv/DOI/OpenAlex/title metadata and memory-framework evaluation framing do not provide AMC-owned methodology proof. A source citation can be retained only as context; any public methodology claim still requires AMC-owned methodology versioning receipts, validation artifacts, signed evidence refs, row hashes, badge assurance, and report-binding proof.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Background memory-evaluation context only; no accepted public scoring-methodology proof or version bump. |
| Shield | Background memory correctness/context-risk context only; no new safety threshold or assurance rule. |
| Watch | Background long-term interaction context only; no new drift methodology, monitor, or alert. |
| Enforce | No runtime memory policy, retrieval policy, or enforcement behavior changed. |
| Vault | No memory store, user profile, interaction trace, prompt, or secure-storage behavior changed. |
| Fleet | Intelligent-agent memory context only; no orchestration adapter or fleet topology changed. |
| Passport | No portable proof-bundle field, badge credential, or external proof token changed. |
| Comply | No compliance mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `src/badge/badgeCli.ts`, API, CLI, Studio, diagnostic question bank, scoring code, Watch monitor, Shield verifier, Enforce runtime, CAIM memory framework, Memory Controller, Memory Retrieval, Post-Thinking module, long-term interaction benchmark, cognitive AI subsystem, memory evaluator, or public methodology docs changed for GAP-0750.

The closure is a no-bloat source-review boundary: CAIM, cognitive AI, long-term interaction, user adaptation, contextual knowledge, memory framework, Memory Controller, Memory Retrieval, Post-Thinking, retrieval accuracy, response correctness, contextual coherence, memory storage, arXiv, DOI, OpenAlex, and paper labels are not accepted as public methodology proof without AMC-owned methodology receipts.

## Fail-closed rule

ArXiv id, arXiv DOI, backlog DOI, OpenAlex work ID, title, author list, CAIM labels, cognitive-AI labels, memory-framework labels, long-term-interaction labels, adaptation labels, contextual-knowledge labels, Memory Controller labels, Memory Retrieval labels, Post-Thinking labels, retrieval-accuracy labels, response-correctness labels, contextual-coherence labels, memory-storage labels, local backlog metadata, or source identity alone must fail closed for public methodology claims. Passing evidence requires AMC-owned methodology versioning receipts, versioned scoring rules, changelog rows, deprecation notice, migration guidance, validation artifacts, signed evidence refs, row hashes, badge assurance, report-binding proof, and no-copy proof.

## No-bloat boundary

No CAIM memory framework, Memory Controller, Memory Retrieval, Post-Thinking module, cognitive architecture, memory store, long-term interaction benchmark, memory evaluator, retrieval evaluator, response-correctness evaluator, contextual-coherence scorer, memory-storage metric, paper importer, arXiv importer, OpenAlex importer, methodology version bump, badge parameter, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Enforce policy module, Passport field, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream abstract prose beyond minimal metadata facts, evaluation rows, memory traces, prompts, benchmark data, figures, tables, algorithms, configs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0750CaimPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
