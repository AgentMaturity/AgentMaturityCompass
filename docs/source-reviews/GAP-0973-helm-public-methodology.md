# GAP-0973 - HELM public-methodology boundary

- Gap: `GAP-0973`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: live HELM website at `https://crfm.stanford.edu/helm/`, latest leaderboard URL at `https://crfm.stanford.edu/helm/latest/`, classic leaderboard URL at `https://crfm.stanford.edu/helm/classic/latest/`, and live GitHub repository page at `https://github.com/stanford-crfm/helm`
- Retrieval: `2026-06-22` live source review through the web research channel.
- Status: Done - skipped as public-methodology implementation evidence; no public methodology version bump, badge method change, diagnostic methodology versioning change, HELM importer, runner, leaderboard mirror, or source-specific public methodology path added.
- Linear: `AMC-1251`

## Live source metadata

The live HELM website URLs opened through the web research channel, and the live GitHub repository page identifies `stanford-crfm/helm` as the Holistic Evaluation of Language Models (HELM) repository with 2.8k stars, 397 forks, 49 issues, 28 pull requests, 6,298 commits, Apache-2.0 license, Python/TypeScript implementation, and v0.5.16 Latest Apr 30, 2026. The repository README notes that HELM entered maintenance mode on June 1, 2026.

Relevant source-review signals include holistic, reproducible and transparent evaluation of foundation models; Datasets and benchmarks in a standardized format; models from various providers; metrics for measuring various aspects beyond accuracy; Web UI for inspecting individual prompts and responses; Web leaderboard for comparing results; official leaderboards including HELM Capabilities, HELM Safety, and VHELM; and reproducible published model-evaluation results.

No HELM code, README prose beyond short metadata facts, docs prose, website prose, leaderboard rows, benchmark rows, configs, prompts, datasets, screenshots, result tables, model outputs, or implementation details were copied into AMC.

## Relevance decision

HELM is relevant to AMC as public-methodology context because it illustrates why external trust artifacts need methodology version, changelog, deprecation notice, migration guidance, evidence taxonomy, limitations, and repeatable benchmark proof before Score/Shield/Watch claims are compared externally.

It does not justify changing AMC public scoring semantics in this slice. AMC already has public methodology versioning, badge source-review notices, and diagnostic methodology receipts. HELM source metadata alone cannot justify a public methodology version bump because no AMC scoring formula, evidence taxonomy, badge semantics, diagnostic question bank, or public API changed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant as public-methodology context only; no Score semantics changed. |
| Shield | Relevant when unsupported benchmark or leaderboard claims must fail closed; no Shield verifier changed. |
| Enforce | No runtime policy, model provider, runner, or circuit breaker changed. |
| Vault | No dataset, result table, credential, or secure-storage behavior changed. |
| Watch | Relevant only as benchmark transparency context; no Watch monitor changed. |
| Fleet | No orchestration, multi-agent topology, or fleet evidence changed. |
| Passport | No portable proof-bundle field changed. |
| Comply | No compliance mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed.

The closure is a no-bloat public-methodology relevance decision. HELM metadata stays source-review context only; AMC public methodology should change only when AMC-owned score semantics, evidence taxonomy, methodology limitations, migration guidance, or badge assurance actually change.

No public methodology version bump was made.

## Fail-closed rule

HELM website reachability, GitHub counts, Apache-2.0 license metadata, v0.5.16 release metadata, maintenance-mode metadata, holistic-evaluation labels, reproducible/transparent labels, dataset/benchmark labels, model-provider labels, metric labels, Web UI labels, leaderboard labels, HELM Capabilities labels, HELM Safety labels, VHELM labels, local backlog metadata, or source identity alone cannot prove AMC public methodology versioning.

Passing public-methodology evidence requires an AMC-owned methodology version, changelog, deprecation notice, migration guidance, known limitations, evidence taxonomy, source-review/no-copy boundary, and actual public scoring or badge semantic change.

## No-bloat boundary

No HELM importer, runner, SDK integration, benchmark adapter, leaderboard mirror, result-table ingestion, provider wrapper, methodology version bump, diagnostic methodology versioning field, badge source-review notice, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, package dependency, or source-specific public methodology path was added.

No upstream code, README prose beyond short metadata facts, docs prose, website prose, leaderboard rows, benchmark rows, configs, prompts, datasets, screenshots, result tables, model outputs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0973HelmPublicMethodologyBoundary.test.ts --reporter=dot` passed, 1 file / 3 tests.
- Paired regression: `npx vitest run tests/gap0972LmEvaluationHarnessQuestionExplainabilityBoundary.test.ts tests/gap0973HelmPublicMethodologyBoundary.test.ts --reporter=dot` passed, 2 files / 7 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
