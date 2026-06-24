# GAP-0876 - CostBench public-methodology boundary

- Gap: `GAP-0876`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `JiayuJeff/CostBench`, `https://github.com/JiayuJeff/CostBench`, linked public pages including `https://arxiv.org` and `https://huggingface.co`
- Retrieval: `2026-06-21` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed Star 31, Fork 0, Issues 0, Pull requests 0, 44 Commits, README.md, No releases published, Python 100.0%, repository folders `env` and `figures`, and files including `requirements.txt` and `setup.py`.
- Status: skipped as public-methodology implementation evidence; no public methodology versioning change was made.

## Live source metadata

The live repository identifies CostBench: Evaluating Multi-Turn Cost-Optimal Planning and Adaptation in Dynamic Environments for LLM Tool-Use Agents, marked ACL 2026 Main. Relevant source-review signals include multi-turn cost-optimal planning, dynamic adaptation, tool-using scenarios, Hierarchical Tool System, atomic and composite tools, Flexible Cost Assignment, Gaussian noise, Dynamic Blocking, cost changes, preference changes, tool disabling, Adjustable Difficulties, Reproducible Random System, seed-controlled pseudo-random system, `COSTBENCH_TRAVEL_CONFIG`, and model endpoints.

These facts are useful cost-aware tool-use benchmark context, but they are not AMC public-methodology lifecycle evidence. No upstream source code, environments, benchmark rows, tool definitions, cost configs, prompts, model outputs, result tables, datasets, README prose beyond minimal metadata facts, screenshots, figures, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC as source-review context for public methodology versioning because multi-turn cost planning and adaptation labels can inform how users reason about Score, Shield, and Watch limitations. It does not justify changing AMC public scoring, diagnostic methodology, badge semantics, or public methodology lifecycle by itself.

For a public methodology change to pass, AMC needs an AMC-owned methodology version, changelog, deprecation notice, migration guidance, known-limitations update, evidence taxonomy change, badge/report semantics, signed evidence refs, row hashes, release lifecycle proof, and no-copy proof. CostBench metadata alone cannot justify a public methodology version bump. GAP-0876 is therefore closed as a documented no-op: the source remains relevant context, but No public methodology version bump was made.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only; no scoring semantics changed because the source did not provide AMC-owned methodology versioning evidence. |
| Shield | Context only; cost-optimal planning labels reinforce fail-closed review boundaries but do not add Shield behavior. |
| Watch | Context only; repository metadata does not create an AMC monitoring receipt or public methodology lifecycle change. |
| Enforce | No runtime tool-use policy, cost policy, dynamic adaptation policy, or circuit breaker changed. |
| Vault | No environments, tool definitions, cost configs, prompts, outputs, datasets, or secure-storage behavior changed. |
| Fleet | Tool-use planning context only; no CostBench runner or orchestration topology added. |
| Passport | No portable proof-bundle field, badge semantics, or public proof token changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed for GAP-0876.

The focused regression verifies that GitHub/README/cost-planning/tool-use/dynamic-environment metadata stays out of AMC public methodology semantics. No public methodology version bump, changelog update, deprecation notice, migration guidance, known-limitations update, evidence-taxonomy change, badge semantic change, API route, CLI command, or Studio change was added.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, Star 31, Fork 0, Issues 0, Pull requests 0, 44 Commits, No releases published, Python 100.0%, folder names, file names, ACL 2026 Main labels, multi-turn cost-optimal planning labels, dynamic adaptation labels, tool-using scenarios labels, Hierarchical Tool System labels, atomic and composite tools labels, Flexible Cost Assignment labels, Gaussian noise labels, Dynamic Blocking labels, cost changes labels, preference changes labels, tool disabling labels, Adjustable Difficulties labels, Reproducible Random System labels, seed-controlled pseudo-random system labels, `COSTBENCH_TRAVEL_CONFIG` labels, model endpoints labels, local backlog metadata, or source identity alone must fail closed for public methodology versioning. Passing evidence requires AMC-owned methodology version, changelog, deprecation notice, migration guidance, known-limitations text, evidence taxonomy change, badge/report semantics, signed evidence refs, row hashes, release lifecycle proof, and no-copy proof.

## No-bloat boundary

No CostBench adapter, tool-use planner, dynamic environment runner, cost optimizer, tool definition importer, environment importer, benchmark row importer, cost config importer, model endpoint wrapper, provider wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific methodology path, or source-specific scoring path was added. No upstream source code, environments, benchmark rows, tool definitions, cost configs, prompts, model outputs, result tables, datasets, README prose beyond minimal metadata facts, screenshots, figures, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0876CostBenchPublicMethodologyBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the implementation no-leakage check passed.
- Focused regression after doc addition: `npx vitest run tests/gap0876CostBenchPublicMethodologyBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0875RedThreadProviderDriftBoundary.test.ts tests/gap0876CostBenchPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
