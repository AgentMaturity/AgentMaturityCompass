# GAP-0802 - Secure LLM agents question-explainability boundary

- Gap: `GAP-0802`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://arxiv.org/abs/2606.10749`, `https://openalex.org/W7164446700`
- Retrieval: `2026-06-21` via browser/search checks. The arXiv page was reachable; OpenAlex was retained as a source reference.
- Status: relevant only through existing question-level score explainability; no secure-agent survey, attack taxonomy, defense framework, or evaluation benchmark added.

## Live source metadata

The reachable arXiv page identifies `Toward Secure LLM Agents: Threat Surfaces, Attacks, Defenses, and Evaluation`, first submitted `Tue Jun 9 12:01:07 2026`, with authors Yuchen Ling, Shengcheng Yu, Zhenyu Chen, and Chunrong Fang. The source-review metadata includes OpenAlex work `W7164446700`.

Relevant source-review signals include a review of 247 papers, a lifecycle-based and systems-oriented framework, and security dimensions around information flow, delegated authority, persistent state, prompt injection, tool-mediated control-flow hijacking, multi-agent propagation, trust boundaries, privilege control, and provenance-aware state management. These facts are security context only. No upstream paper prose beyond short metadata facts, tables, threat taxonomies, attack examples, defense checklists, benchmark rows, prompts, figures, model outputs, code, or implementation details were copied into AMC.

## Relevance decision

The source is relevant to AMC only as source-review context for question-level score explainability. Secure LLM agent threats are directly adjacent to Score, Shield, and Watch because operators need to understand why a maturity question moved, which evidence was accepted, which security claims were rejected, and what repair hint is needed before a claim can mature.

The source does not provide AMC proof by itself. It is not an AMC question-score explainability implementation, not a reason to add a security survey subsystem, and not a reason to copy a threat taxonomy, benchmark, defense checklist, or evaluation framework. Accepted claims still need AMC-owned question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed evidence rows, thresholds, missing-gate reasons, and row hashes.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through existing question-score explainability rows with AMC-owned evidence and repair hints. |
| Shield | Relevant only when unsupported secure-agent claims are rejected with signed evidence and no paper-data copy. |
| Watch | Relevant only when caller-owned trace/eval telemetry is hash-bound through existing Watch evidence. |
| Fleet | Multi-agent propagation context only; no orchestration, topology, or fleet policy changed. |
| Enforce | No runtime prompt-injection, tool-control, privilege, or policy guardrail changed. |
| Vault | No persistent state, prompts, attack traces, or secure-storage behavior changed. |
| Passport | No portable proof-bundle field, token, or external credential changed. |
| Comply | No compliance mapping changed from a security survey alone. |

## Product closure

No `src/diagnostic/questionScoreExplainability.ts`, `src/guide/guideGenerator.ts`, `src/passport/passportArtifact.ts`, API, CLI, Studio, Watch monitor, Shield verifier, Passport field, methodology version, badge semantics, diagnostic question bank, secure-agent survey subsystem, threat taxonomy, defense framework, benchmark runner, or scoring behavior changed for GAP-0802. The closure is a source-review note plus regression coverage that exercises existing AMC question-score explainability primitives: question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed evidence refs, thresholds, missing-gate reasons, and row hashes.

## Fail-closed rule

arXiv/OpenAlex/title/security-survey metadata alone must fail closed for question-level score explainability claims. Source identity, author list, submission date, 247-paper count, lifecycle-based framing, systems-oriented framework labels, information-flow labels, delegated-authority labels, persistent-state labels, prompt-injection labels, tool-mediated control-flow hijacking labels, multi-agent propagation labels, trust-boundary labels, privilege-control labels, provenance-aware state-management labels, local backlog metadata, or generated gap wording are not enough to pass. Passing evidence requires AMC-owned question IDs, accepted evidence IDs, rejected metadata-only reasons, repair hints, reproducible eval-pack hashes, thresholds, signed evidence refs, row hashes, and no-copy proof.

## No-bloat boundary

No secure-agent survey subsystem, threat taxonomy importer, attack benchmark, defense framework, evaluation mirror, prompt-injection test harness, tool-control hijacking simulator, persistent-state corruption model, multi-agent propagation workflow, paper importer, OpenAlex importer, arXiv importer, source-specific question lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, package dependency, public methodology version bump, diagnostic question-bank migration, or source-specific scoring path was added. No upstream paper prose beyond short metadata facts, tables, threat taxonomies, attack examples, defense checklists, benchmark rows, prompts, figures, model outputs, code, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0802SecureLlmAgentsQuestionExplainabilityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
