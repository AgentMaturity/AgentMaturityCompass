# GAP-0663 — DBMS configuration question-explainability boundary

- Gap: `GAP-0663`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://openalex.org/W7140756610` / DOI `10.14778/3797919.3797940`
- Corroborating primary source reached: `https://arxiv.org/abs/2603.22708`
- Retrieval: `2026-06-21`; browser access to arXiv succeeded and showed the related DOI; shell network remains DNS-restricted in this environment.
- Status: relevant only through existing question-level score explainability; no DBMS tuning, source-code analysis, or configuration-agent subsystem added.

## Live source metadata

The accessible arXiv page identified `Why Database Manuals Are Not Enough: Efficient and Reliable Configuration Tuning for DBMSs via Code-Driven LLM Agents`, submission date `2026-03-24`, subject `cs.DB`, journal reference `VLDB 2026`, arXiv DOI `10.48550/arXiv.2603.22708`, and related DOI `10.14778/3797919.3797940`. The local backlog row maps the source to OpenAlex work `W7140756610`.

These facts identify the source and its adjacent domain only. No paper prose beyond the title, no abstract text, no figures, no tables, no benchmark rows, no tuning rules, no source-code analysis method, no DBMS configuration data, no prompts, no results, and no implementation details were copied.

## Relevance decision

The source is relevant to AMC only as source-review context for question-level score explainability. A code-driven LLM agent for DBMS tuning is adjacent to agent evaluation because a user may ask why a maturity question moved, what evidence was accepted, and why metadata-only or domain-specific claims were rejected.

The source does not provide AMC proof by itself. It is not an AMC benchmark, not a question-score explainability implementation, and not a reason to add a DBMS tuning subsystem, source-code analyzer, configuration-rule miner, database benchmark mirror, paper importer, clinical-style domain map, or source-specific evaluator. Accepted claims still need AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed evidence rows, reproducible eval-pack hashes, thresholds, and row hashes.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through existing question-score explainability rows with AMC-owned evidence and repair hints. |
| Shield | Relevant only when unsupported DBMS/configuration-agent claims are rejected with signed evidence and no paper-data copy. |
| Watch | Relevant only when caller-owned trace/eval telemetry is hash-bound through existing Watch evidence. |
| Enforce | No policy-enforcement change. |
| Vault | No secrets, storage, privacy, or data-residency change. |
| Fleet | No orchestration or trust-topology implementation. |
| Passport | No portable proof-bundle field or credential change. |
| Comply | No compliance mapping or regulated-domain claim. |

## Product closure

No `src/diagnostic`, `src/guide`, `src/passport`, API, CLI, Studio, or scoring behavior changed for GAP-0663. The closure is a source-review note plus regression coverage that keeps the paper bounded to existing AMC question-score explainability primitives: question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed evidence refs, reproducible eval-pack hashes, thresholds, and row hashes.

## Fail-closed rule

ArXiv metadata, DOI/OpenAlex identity fields, paper title, VLDB reference, DBMS tuning domain, code-driven LLM-agent framing, claimed tuning results, benchmark names, source-code analysis terminology, configuration-rule labels, and local backlog metadata must fail closed for Score, Shield, or Watch question-score explainability claims. Passing evidence requires AMC-owned question rows, accepted evidence IDs, rejected metadata-only reasons, repair hints, reproducible eval-pack hashes, thresholds, signed evidence refs, and row hashes.

## No-bloat boundary

No DBMS tuning subsystem, configuration-rule miner, source-code analyzer, database benchmark mirror, paper importer, benchmark adapter, dataset mirror, tuning-rule schema, SysInsight-style pipeline, source-specific evaluator, API route, CLI command, Studio panel, Passport field, or parity claim was added. No upstream paper prose, abstract text, figures, tables, prompts, configs, tuning rules, benchmark rows, datasets, results, screenshots, source code, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0663DbmsConfigurationQuestionExplainabilityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: attempted with `npm test -- --reporter=dot`; blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
