# GAP-0881 - Dart Agent Core metric-validity boundary

- Gap: `GAP-0881`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `memex-lab/dart_agent_core`, `https://github.com/memex-lab/dart_agent_core`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed Star 27, Fork 8, Issues 1, Pull requests 3, 61 Commits, README.md, LICENSE, MIT license, Dart 100.0%, repository folders `bin`, `doc`, `example`, `lib`, and `test`, and files including `CHANGELOG.md`, `README.zh-CN.md`, `analysis_options.yaml`, and `pubspec.yaml`.
- Status: completed as a metric-validity boundary over existing AMC validation receipts.

## Live source metadata

The live repository identifies Dart Agent Core as a mobile-first, local-first Dart library for building and evaluating stateful, tool-using AI agents. Relevant source-review signals include stateful sessions, tool use, skills, sub-agent delegation, planning, streaming, multi-provider LLM support, multimodal input, loop detection, controller hooks, Agent evals, tasks, graders, transcripts, record/replay, reports, pass@k / pass^k metrics, Langfuse export, and cross-run health.

These facts are useful agent-evaluation metric-validity context, but they are not AMC validation evidence by themselves. No upstream Dart source code, tests, README prose beyond minimal metadata facts, examples, eval tasks, graders, transcripts, record/replay outputs, reports, pass@k calculations, provider configs, skill files, screenshots, diagrams, package metadata, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC through existing metric-validity receipts because agent eval suites, graders, record/replay, and pass@k-style metrics can inform how users reason about Score, Shield, and Watch validity claims. The closure is not a Dart Agent Core adapter, Dart package integration, Flutter bridge, eval runner, grader importer, transcript importer, record/replay runner, Langfuse exporter, provider wrapper, skill loader, or sub-agent simulator; it is a fail-closed boundary showing that Dart Agent Core metadata is accepted only as source-review context unless AMC-owned metric validity proof exists.

For metric validity to pass, AMC needs validation table evidence, confidence interval evidence, sample size evidence, reliability checks, outcome-alignment checks, metric owner, signed evidence refs, source refs, row hashes, regression thresholds, CI or lifecycle gate proof, and no-copy proof. GitHub/README/license/Dart-agent-framework metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing validation table, confidence interval, sample size, reliability, outcome-alignment, and metric-owner receipts. |
| Shield | Relevant only as a fail-closed trust boundary for agent-eval claims; source metadata cannot stand in for signed validity proof. |
| Watch | Relevant only through source refs, CI/lifecycle gate receipts, and replayable eval-pack visibility; no live monitor changed. |
| Enforce | No runtime policy, tool policy, provider policy, or circuit breaker changed. |
| Vault | No provider keys, transcripts, local state files, package metadata, or secure-storage behavior changed. |
| Fleet | Sub-agent delegation context only; no Dart Agent Core orchestration topology or simulator added. |
| Passport | Existing metric validity receipts can feed proof bundles, but no Passport schema changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, API, CLI, Studio, methodology, badge, diagnostic question bank, or scoring code changed for GAP-0881.

The focused regression exercises existing `buildMetricValidationReport` behavior with a positive Dart Agent Core-style source-reference packet and a negative source-metadata-only packet. The positive path requires validation table, confidence interval, sample size, reliability check, outcome alignment, metric owner, signed evidence refs, source refs, row hashes, regression thresholds, and CI gate proof. The negative path fails closed when GitHub/README/license/Dart-agent-framework metadata replaces signed metric-validity evidence.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, LICENSE presence, MIT license metadata, Star 27, Fork 8, Issues 1, Pull requests 3, 61 Commits, Dart 100.0%, folder names, file names, mobile-first labels, local-first labels, stateful labels, tool use labels, skills labels, sub-agent delegation labels, planning labels, streaming labels, multi-provider LLM support labels, Agent evals labels, tasks labels, graders labels, transcripts labels, record/replay labels, reports labels, pass@k / pass^k labels, Langfuse export labels, cross-run health labels, local backlog metadata, or source identity alone must fail closed for metric validity. Passing evidence requires validation table, confidence interval, sample size, reliability checks, outcome alignment, metric owner, signed evidence refs, source refs, row hashes, regression thresholds, CI or lifecycle gate proof, and no-copy proof.

## No-bloat boundary

No Dart Agent Core adapter, Dart package integration, Flutter bridge, eval runner, grader importer, transcript importer, record/replay runner, Langfuse exporter, provider wrapper, skill loader, sub-agent simulator, loop detector, controller hook integration, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, diagnostic question-bank migration, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream Dart source code, tests, README prose beyond minimal metadata facts, examples, eval tasks, graders, transcripts, record/replay outputs, reports, pass@k calculations, provider configs, skill files, screenshots, diagrams, package metadata, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0881DartAgentCoreMetricValidityBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the existing positive and negative metric-validity paths passed.
- Focused regression after doc addition: `npx vitest run tests/gap0881DartAgentCoreMetricValidityBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0880CoragProviderDriftBoundary.test.ts tests/gap0881DartAgentCoreMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
