# GAP-0882 - Self-Care metric-validity boundary

- Gap: `GAP-0882`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `Not-Diamond/self-care`, `https://github.com/Not-Diamond/self-care`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed Star 27, Fork 0, Issues 0, Pull requests 0, 22 Commits, README.md, CODE_OF_CONDUCT.md, CONTRIBUTING.md, SECURITY.md, LICENSE, MIT license, 17 releases, latest release `v0.0.17`, JavaScript 93.0%, Shell 7.0%, repository folders `.claude-plugin`, `.github`, `agents`, `commands`, `lib`, and `scripts`.
- Status: completed as a metric-validity boundary over existing AMC validation receipts.

## Live source metadata

The live repository identifies Self-Care as a Claude Code agent trace analysis and context remediation plugin. Relevant source-review signals include Claude Code plugin usage, trace analysis, LangSmith trace import, LangFuse trace import, local OTEL-format or Claude Code trace JSON import, triage reports, auto-remediation, continuous monitoring, scheduled trace polling, `.self-care` reports, `.self-care/config.json`, and 14 specialized detection skills.

The detector labels shown by the live source include Context Utilization, Reasoning-Action Mismatch, Instruction Following, Step Repetition, Goal Drift, Missing Context, Tool Failure, Missed Action, Ambiguous Instructions, Contradictory Instructions, Grounding, Persona Adherence, Premature Termination, and Guardrail Violation.

These facts are useful trace-quality metric-validity context, but they are not AMC validation evidence by themselves. No upstream JavaScript or shell code, Claude plugin files, agents, commands, trace fixtures, trace reports, remediation prompts, config examples, scheduled-task instructions, detector definitions, README prose beyond minimal metadata facts, generated reports, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC through existing metric-validity receipts because trace-quality detectors and remediation labels can inform how users reason about Score, Shield, and Watch validity claims. The closure is not a Self-Care adapter, Claude Code plugin integration, trace scanner, LangSmith importer, LangFuse importer, OTEL parser, local trace runner, detector implementation, auto-remediation engine, scheduled monitor, context editor, or report generator; it is a fail-closed boundary showing that Self-Care metadata is accepted only as source-review context unless AMC-owned metric validity proof exists.

For metric validity to pass, AMC needs validation table evidence, confidence interval evidence, sample size evidence, reliability checks, outcome-alignment checks, metric owner, signed evidence refs, source refs, row hashes, regression thresholds, CI or lifecycle gate proof, and no-copy proof. GitHub/README/license/Claude-trace-plugin metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing validation table, confidence interval, sample size, reliability, outcome-alignment, and metric-owner receipts. |
| Shield | Relevant only as a fail-closed trust boundary for trace-quality and guardrail-violation claims; source metadata cannot stand in for signed validity proof. |
| Watch | Relevant only through source refs, CI/lifecycle gate receipts, and replayable eval-pack visibility; no live monitor changed. |
| Enforce | No Claude Code policy, trace policy, remediation policy, or circuit breaker changed. |
| Vault | No trace files, API keys, `.self-care` config, reports, or secure-storage behavior changed. |
| Fleet | Agent-trace context only; no Self-Care orchestration or scheduled-analysis topology added. |
| Passport | Existing metric validity receipts can feed proof bundles, but no Passport schema changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, API, CLI, Studio, methodology, badge, diagnostic question bank, or scoring code changed for GAP-0882.

The focused regression exercises existing `buildMetricValidationReport` behavior with a positive Self-Care-style source-reference packet and a negative source-metadata-only packet. The positive path requires validation table, confidence interval, sample size, reliability check, outcome alignment, metric owner, signed evidence refs, source refs, row hashes, regression thresholds, and CI gate proof. The negative path fails closed when GitHub/README/license/Claude-trace-plugin metadata replaces signed metric-validity evidence.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, CODE_OF_CONDUCT.md presence, CONTRIBUTING.md presence, SECURITY.md presence, LICENSE presence, MIT license metadata, Star 27, Fork 0, Issues 0, Pull requests 0, 22 Commits, 17 releases, `v0.0.17`, JavaScript 93.0%, Shell 7.0%, folder names, Claude Code labels, LangSmith labels, LangFuse labels, OTEL-format labels, trace JSON labels, 14 specialized detection skills labels, Goal Drift labels, Grounding labels, Missed Action labels, Guardrail Violation labels, auto-remediation labels, continuous monitoring labels, local backlog metadata, or source identity alone must fail closed for metric validity. Passing evidence requires validation table, confidence interval, sample size, reliability checks, outcome alignment, metric owner, signed evidence refs, source refs, row hashes, regression thresholds, CI or lifecycle gate proof, and no-copy proof.

## No-bloat boundary

No Self-Care adapter, Claude Code plugin integration, trace scanner, LangSmith importer, LangFuse importer, OTEL parser, local trace runner, detector implementation, auto-remediation engine, scheduled monitor, context editor, report generator, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, diagnostic question-bank migration, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream JavaScript or shell code, Claude plugin files, agents, commands, trace fixtures, trace reports, remediation prompts, config examples, scheduled-task instructions, detector definitions, README prose beyond minimal metadata facts, generated reports, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0882SelfCareMetricValidityBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the existing positive and negative metric-validity paths passed.
- Focused regression after doc addition: `npx vitest run tests/gap0882SelfCareMetricValidityBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0881DartAgentCoreMetricValidityBoundary.test.ts tests/gap0882SelfCareMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
