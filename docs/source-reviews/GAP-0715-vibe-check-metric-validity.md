# GAP-0715 - Vibe Check metric-validity boundary

- Gap: `GAP-0715`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://arxiv.org/abs/2509.09870`, `https://doi.org/10.1145/3772318.3790388`, `https://openalex.org/W4414592688`
- Retrieval: `2026-06-21` via browser search and arXiv page. The exact title resolves to arXiv `2509.09870`; DOI and OpenAlex remain backlog/source-reference metadata for this pass.
- Status: closed through existing metric-validity receipts; no personality-agent evaluator, user-perception benchmark, trait-modulation framework, or source-specific scoring path added.

## Live source metadata

The reachable arXiv result identifies the title `Vibe Check: Understanding the Effects of LLM-Based Conversational Agents' Personality and Alignment on User Perceptions in Goal-Oriented Tasks`, authors Hasibur Rahman and Smit Desai, date `2025-09-11`, arXiv `2509.09870`, related DOI `10.1145/3772318.3790388`, and backlog OpenAlex id `W4414592688`.

The paper metadata describes LLM-based conversational agents, personality expression, user-agent personality alignment, goal-oriented travel-planning tasks, a between-subjects experiment with `N=150`, low/medium/high expression across Big Five traits, a Trait Modulation Keys framework, and perception outcomes including intelligence, enjoyment, anthropomorphism, intention to adopt, trust, and likeability. These facts are metric-validity context only. No upstream paper prose beyond short metadata facts, trait-modulation keys, persona prompts, study instruments, participant data, travel-planning tasks, tables, figures, statistics, model outputs, code, or benchmark rows were copied into AMC.

## Relevance decision

This source is relevant to AMC metric validity because personality and alignment effects on user perceptions are examples of constructs that can be easy to overclaim if the score does not show construct validity, sample size, confidence intervals, reliability checks, metric ownership, and regression thresholds. AMC already has the needed generic primitive: `buildMetricValidationReport` produces validation rows, confidence intervals, inter-rater agreement, test-retest stability, eval-pack row hashes, source refs, and CI gates.

This does not require a Vibe Check benchmark, Big Five trait evaluator, personality-alignment scorer, travel-planning study importer, Trait Modulation Keys importer, or methodology version bump. GAP-0715 is closed by documenting the source boundary and adding regression coverage that Vibe-Check-style user-perception context uses existing AMC metric-validity receipts. arXiv, DOI, OpenAlex, title, author, study-size, trait, or perception labels alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing metric-validity validation rows, confidence intervals, sample-size checks, reliability checks, and signed evidence. |
| Shield | Relevant through fail-closed CI behavior when construct-validity or signed evidence is missing. |
| Watch | Relevant through metric-validity receipts that can be monitored as regression evidence. |
| Enforce | No runtime personality, alignment, or prompt-control policy changed. |
| Vault | No participant data, prompts, travel-planning tasks, or secure-storage behavior changed. |
| Fleet | Conversational-agent context only; no multi-agent topology or fleet behavior changed. |
| Passport | No portable proof-bundle field changed. |
| Comply | Human-study context only; no compliance mapping changed. |

## Product closure

No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, personality-agent evaluator, user-perception benchmark, trait-modulation importer, travel-planning task importer, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0715.

The focused regression exercises the existing metric-validity engine with Vibe-Check-style fixture data. The positive path requires AMC-owned construct-validity checks, validation table proof, sample-size proof, confidence interval proof, reliability proof, regression threshold proof, metric owner proof, signed evidence refs, and repeat-run stability. The negative path fails closed when arXiv/DOI/OpenAlex/title metadata replaces signed metric-validity evidence.

## Fail-closed rule

Paper title, arXiv id, DOI, OpenAlex id, author list, date, Big Five labels, personality-expression labels, user-agent alignment labels, goal-oriented task labels, travel-planning labels, Trait Modulation Keys labels, `N=150` label, perception-outcome labels, local backlog metadata, or source identity alone must fail closed for metric-validity claims. Passing evidence requires AMC-owned validation table, construct-validity coverage, process evidence, outcome alignment, confidence interval, sample size, inter-rater agreement, test-retest stability, metric owner, signed evidence refs, row hashes, regression thresholds, CI receipt, and no-copy proof.

## No-bloat boundary

No Vibe Check benchmark, Big Five trait evaluator, personality-alignment scorer, Trait Modulation Keys importer, user-perception study importer, travel-planning task importer, persona prompt importer, participant-data loader, arXiv importer, OpenAlex importer, ACM importer, paper importer, dataset mirror, benchmark mirror, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream paper prose beyond short metadata facts, trait-modulation keys, persona prompts, study instruments, participant data, travel-planning tasks, tables, figures, statistics, model outputs, code, or benchmark rows were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0715VibeCheckMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
