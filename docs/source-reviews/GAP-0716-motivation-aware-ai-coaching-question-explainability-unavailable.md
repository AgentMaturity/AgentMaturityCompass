# GAP-0716 - Motivation-aware AI coaching question-explainability unavailable-source boundary

- Gap: `GAP-0716`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://doi.org/10.1145/3772318.3791123`, `https://openalex.org/W7154052379`
- Retrieval: `2026-06-21` via exact-title search, DOI search, DOI redirect attempt, ACM DOI page attempt, OpenAlex id search, and shorter title-fragment search. No reachable primary source was available in this sandbox.
- Status: source unavailable; skipped as product-changing question-explainability evidence.

## Retrieval notes

The backlog row identifies the paper as `An LLM-Based Motivation-Aware Framework For AI Coaching For Behaviour Change`, DOI `10.1145/3772318.3791123`, and OpenAlex id `W7154052379`. Browser searches for the exact title, DOI, OpenAlex id, and shorter title fragments did not surface a reachable primary source. The DOI redirect and ACM DOI page were not usable from this environment.

The available metadata suggests coaching, motivational interviewing, behaviour change, health coaching, applied psychology, psychology, and interview context. These labels may be adjacent to question-level score explainability for AI coaching agents, but they do not provide AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, replay thresholds, or row hashes. No upstream abstract prose beyond local metadata facts, coaching scripts, motivational-interviewing prompts, participant data, intervention materials, model outputs, screenshots, tables, statistics, datasets, code, or implementation details were copied into AMC.

## Relevance decision

Question-level score explainability is relevant to AMC, but this source is not usable as product-changing evidence in this pass because the primary paper was unavailable. Motivation-aware coaching metadata can only remain source-review context. A maturity question can pass only when AMC has its own accepted evidence IDs, rejected-evidence reasons, repair hints, signed evidence rows, row hashes, and missing-gate explanations.

Therefore GAP-0716 is closed as a documented unavailable-source boundary. Existing AMC question-score explainability primitives remain the accepted path for Score/Shield/Watch question-level proof.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through existing question-level explanation rows; paper metadata is rejected as score proof. |
| Shield | Relevant through fail-closed rejected-evidence and missing-gate explanations when signed question evidence is absent. |
| Watch | Relevant through existing question evidence chains that can be monitored; no coaching monitor changed. |
| Enforce | No runtime coaching, motivational-interviewing, health-coaching, or behavior-change policy changed. |
| Vault | No participant data, coaching scripts, prompts, health data, or secure-storage behavior changed. |
| Fleet | AI-coaching context only; no fleet topology or multi-agent coordination changed. |
| Passport | No portable proof bundle or badge field changed. |
| Comply | Health-coaching and behavior-change context only; no compliance mapping changed. |

## Product closure

No `src/diagnostic/questionScoreExplainability.ts`, `src/guide/guideGenerator.ts`, `src/passport/passportArtifact.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, motivation-aware coaching adapter, motivational-interviewing importer, health-coaching evaluator, behavior-change framework, DOI importer, OpenAlex importer, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0716.

The focused regression exercises the existing question-score explainability engine. The positive path accepts AI-coaching context only when AMC-owned question evidence contains accepted evidence IDs, rejected evidence reasons, repair hints, criteria diagnostics, signed rows, and row hashes. The negative path fails closed when DOI/OpenAlex/title metadata replaces AMC-owned question evidence.

## Fail-closed rule

Paper title, DOI, OpenAlex id, ACM labels, coaching labels, motivational-interviewing labels, behaviour-change labels, health-coaching labels, applied-psychology labels, psychology labels, interview labels, local backlog metadata, or source identity alone must fail closed for question-level score explainability claims. Passing evidence requires AMC-owned question id, accepted evidence ids, rejected evidence reasons, missing gate reasons, repair hints, signed evidence rows, thresholds, replayable row hashes, source refs, and no-copy proof.

## No-bloat boundary

No motivation-aware coaching adapter, motivational-interviewing framework, health-coaching evaluator, behavior-change intervention importer, coaching-script loader, prompt importer, participant-study importer, DOI importer, OpenAlex importer, ACM importer, paper importer, dataset mirror, benchmark mirror, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream abstract prose beyond local metadata facts, coaching scripts, motivational-interviewing prompts, participant data, intervention materials, model outputs, screenshots, tables, statistics, datasets, code, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0716MotivationAwareQuestionExplainabilityUnavailableBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
