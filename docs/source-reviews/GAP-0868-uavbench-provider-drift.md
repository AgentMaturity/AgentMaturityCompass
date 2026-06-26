# GAP-0868 - UAVBench provider-drift boundary

- Gap: `GAP-0868`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `maferrag/UAVBench`, `https://github.com/maferrag/UAVBench`
- Retrieval: `2026-06-21` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed Star 36, Fork 2, Issues 1, Pull requests 0, 24 Commits, README.md, LICENSE, Apache-2.0 license, No releases published, Jupyter Notebook 100.0%, repository folders `Images`, `data`, `results`, and `scripts`, and file `2511.11252v1.pdf`.
- Status: completed as a provider/model drift boundary over existing AMC canary receipts.

## Live source metadata

The live repository identifies UAVBench: An Open Benchmark Dataset for Autonomous and Agentic AI UAV Systems via LLM-Generated Flight Scenarios. Relevant source-review signals include a physically grounded benchmark dataset for autonomous aerial systems and Large Language Models, 50,000 validated UAV flight scenarios, UAVBench_MCQ, 50,000 multiple-choice questions, mission planning, perception, decision-making, schema compliance, physical and geometric consistency, safety and hazard-aware risk scoring, Multi-Agent Coordination, Cyber-Physical Security, and Ethical Decision-Making.

These facts are useful UAV reasoning and agentic safety evaluation context, but they are not provider/model drift proof by themselves. No upstream datasets, notebooks, PDF content, generated scenarios, multiple-choice questions, answer keys, scripts, results, images, README prose beyond minimal metadata facts, prompts, model outputs, safety labels, figures, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC through existing provider/model drift canary receipts because UAV reasoning and safety-risk context can inform how users reason about Score, Shield, and Watch changes across model or provider updates. The closure is not a UAV simulator, dataset importer, scenario generator, notebook runner, PDF ingester, physical consistency engine, or safety-risk classifier; it is a fail-closed boundary showing that UAVBench metadata is accepted only as source-review context unless AMC-owned provider-drift proof exists.

For provider/model drift to pass, AMC needs provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, row hashes, CI or lifecycle gate proof, and no-copy proof. GitHub/README/license/UAV benchmark metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing provider score distribution comparisons and canary result rows. |
| Shield | Relevant only as a fail-closed trust boundary for safety-sensitive UAV reasoning context; source metadata cannot stand in for signed provider-drift proof. |
| Watch | Relevant through existing provider drift alerts, Watch alert projection, and CI/lifecycle gate receipts. |
| Enforce | No runtime UAV policy, model-routing policy, physical-world policy, or circuit breaker changed. |
| Vault | No datasets, generated scenarios, multiple-choice questions, PDF contents, result files, images, or secure-storage behavior changed. |
| Fleet | UAV multi-agent context only; no UAVBench runner or orchestration topology added. |
| Passport | Existing provider-drift receipts can feed proof bundles, but no Passport schema changed. |
| Comply | No aviation, safety, or compliance framework mapping changed. |

## Product closure

No `src/benchmarks/providerDriftBenchmark.ts`, `src/watch/providerDriftAlerts.ts`, `src/api/benchmarkRouter.ts`, API, CLI, Studio, methodology, badge, diagnostic question bank, or scoring code changed for GAP-0868.

The focused regression exercises existing `runProviderDriftBenchmark`, `buildProviderDriftEvalPack`, `buildProviderDriftWatchAlerts`, and `buildProviderDriftCiGate` behavior with a positive UAVBench-style canary packet and a negative source-metadata-only packet. The positive path requires provider version, canary results, drift statistic, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, and CI gate proof. The negative path fails closed when GitHub/README/license/UAV benchmark metadata replaces signed provider-drift evidence.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, LICENSE presence, Apache-2.0 license metadata, Star 36, Fork 2, Issues 1, Pull requests 0, 24 Commits, No releases published, Jupyter Notebook 100.0%, folder names, file names, physically grounded benchmark labels, autonomous aerial systems labels, Large Language Models labels, 50,000 validated UAV flight scenarios labels, UAVBench_MCQ labels, 50,000 multiple-choice questions labels, mission planning labels, perception labels, decision-making labels, schema compliance labels, physical and geometric consistency labels, safety and hazard-aware risk scoring labels, Multi-Agent Coordination labels, Cyber-Physical Security labels, Ethical Decision-Making labels, local backlog metadata, or source identity alone must fail closed for provider/model drift. Passing evidence requires provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, row hashes, CI or lifecycle gate proof, and no-copy proof.

## No-bloat boundary

No UAVBench adapter, UAV simulator, dataset importer, scenario generator, multiple-choice-question importer, PDF ingester, notebook runner, results parser, image importer, physical consistency engine, safety-risk classifier, UAV policy engine, provider wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, diagnostic question-bank migration, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream datasets, notebooks, PDF content, generated scenarios, multiple-choice questions, answer keys, scripts, results, images, README prose beyond minimal metadata facts, prompts, model outputs, safety labels, figures, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0868UavBenchProviderDriftBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the existing positive and negative provider-drift paths passed.
- Focused regression after doc addition: `npx vitest run tests/gap0868UavBenchProviderDriftBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0867AzureRagVisionProviderDriftBoundary.test.ts tests/gap0868UavBenchProviderDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
