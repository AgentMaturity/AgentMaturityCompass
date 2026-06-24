# GAP-0858 - VGC-Bench provider-drift boundary

- Gap: `GAP-0858`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `cameronangliss/vgc-bench`, `https://github.com/cameronangliss/vgc-bench`, `https://arxiv.org/abs/2506.10326`
- Retrieval: `2026-06-21` via live GitHub repository page, README review, and linked arXiv page. The GitHub URL returned HTTP/2 200 in live review. The live GitHub repository page showed Star 45, Fork 14, Issues 0, Pull requests 0, 903 Commits, README.md, MIT license, No releases published, topics `pokemon`, `reinforcement-learning`, `game-theory`, and `multi-agent-learning`, and a language mix led by Python 95.3%, Shell 3.0%, and PowerShell 1.7%.
- Status: completed as a provider/model drift boundary over existing AMC canary receipts.

## Live source metadata

The live repository identifies VGC-Bench: Towards Mastering Diverse Team Strategies in Competitive Pokemon. Relevant source-review signals include multi-agent reinforcement learning, 4 Policy Space Response Oracle, behavior cloning, Large Language Model player, 3 heuristic players, Pokemon Showdown, open team sheets, cross-play evaluation, performance test, generalization test, ranking algorithm, 200 battles, 5 independent training runs, and 1000 total battles.

These facts are useful strategy benchmark context, but they are not provider/model drift proof by themselves. No upstream source code, benchmark tasks, battle data, teams, replay data, training configs, agent implementations, game assets, prompts, model outputs, result tables, README prose beyond minimal metadata facts, screenshots, figures, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC through existing provider/model drift canary receipts because strategy benchmarks with LLM and non-LLM agents can inform how users reason about Score, Shield, and Watch behavior changes across model or provider updates. The closure is not a VGC-Bench runner, Pokemon simulator, training harness, or model-comparison subsystem; it is a fail-closed boundary showing that VGC-Bench metadata is accepted only as source-review context unless AMC-owned provider-drift proof exists.

For provider/model drift to pass, AMC needs provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, row hashes, CI or lifecycle gate proof, and no-copy proof. GitHub/README/license/game-benchmark metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing provider score distribution comparisons and canary result rows. |
| Shield | Relevant only as a fail-closed trust boundary; source metadata cannot stand in for signed provider-drift proof. |
| Watch | Relevant through existing provider drift alerts, Watch alert projection, and CI/lifecycle gate receipts. |
| Enforce | No runtime model-routing policy, strategy policy, game policy, or circuit breaker changed. |
| Vault | No teams, battle data, configs, prompts, result tables, model outputs, or secure-storage behavior changed. |
| Fleet | Multi-agent strategy context only; no VGC-Bench runner or orchestration topology added. |
| Passport | Existing provider-drift receipts can feed proof bundles, but no Passport schema changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No `src/benchmarks/providerDriftBenchmark.ts`, `src/watch/providerDriftAlerts.ts`, `src/api/benchmarkRouter.ts`, API, CLI, Studio, methodology, badge, diagnostic question bank, or scoring code changed for GAP-0858.

The focused regression exercises existing `runProviderDriftBenchmark`, `buildProviderDriftEvalPack`, `buildProviderDriftWatchAlerts`, and `buildProviderDriftCiGate` behavior with a positive VGC-Bench-style strategy benchmark canary packet and a negative source-metadata-only packet. The positive path requires provider version, canary results, drift statistic, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, and CI gate proof. The negative path fails closed when GitHub/README/license/game-benchmark metadata replaces signed provider-drift evidence.

## Fail-closed rule

GitHub HTTP/2 200 reachability, live GitHub repository page metadata, arXiv reachability, README.md presence, MIT license metadata, Star 45, Fork 14, Issues 0, Pull requests 0, 903 Commits, No releases published, Python 95.3%, Shell 3.0%, PowerShell 1.7%, Pokemon labels, reinforcement-learning labels, game-theory labels, multi-agent-learning labels, benchmark labels, cross-play labels, training-run labels, battle-count labels, local backlog metadata, or source identity alone must fail closed for provider/model drift. Passing evidence requires provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, row hashes, CI or lifecycle gate proof, and no-copy proof.

## No-bloat boundary

No VGC-Bench adapter, Pokemon simulator, Pokemon Showdown wrapper, benchmark runner, battle runner, dataset importer, team importer, replay importer, training harness, behavior-cloning runner, reinforcement-learning runner, PSRO runner, heuristic-agent runner, ranking-algorithm implementation, provider wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, diagnostic question-bank migration, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream source code, benchmark tasks, battle data, teams, replay data, training configs, agent implementations, game assets, prompts, model outputs, result tables, README prose beyond minimal metadata facts, screenshots, figures, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0858VgcBenchProviderDriftBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the existing positive and negative provider-drift paths passed.
- Focused regression after doc addition: `npx vitest run tests/gap0858VgcBenchProviderDriftBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0857LlmCoordinationProviderDriftBoundary.test.ts tests/gap0858VgcBenchProviderDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
