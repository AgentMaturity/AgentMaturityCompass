# GAP-0886 - MOSAIC metric-validity boundary

- Gap: `GAP-0886`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `Abdulhamid97Mousa/MOSAIC`, `https://github.com/Abdulhamid97Mousa/MOSAIC`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed Star 24, Fork 4, Issues 2, Pull requests 0, 65 Commits, README.md, LICENSE, MIT license, No releases published, Python 99.6%, Other 0.4%, repository folders `.factory`, `.github/ workflows`, `3rd_party`, `docs`, `experiments/ operator_configs`, `gym_gui`, `metadata`, `requirements`, `tools`, and `var`, and files including `.env.example`, `run_client.sh`, `run_malmo.sh`, and `setup_malmo.sh`.
- Status: completed as a metric-validity boundary over existing AMC validation receipts.

## Live source metadata

The live repository identifies MOSAIC as a unified platform for cross-paradigm comparison and evaluation of homogeneous and heterogeneous multi-agent RL, LLM, VLM, and human decision-makers. Relevant source-review signals include Two Evaluation Modes, Manual Mode, Script Mode, shared seeds, deterministic seed sequences, JSONL telemetry logs, cross-paradigm comparison, Heterogeneous Agent Mixing, Resource Management & Quotas, PolicyMappingService, FastLane, MOSAIC MultiGrid, RL/LLM/VLM/human workers, and environment families spanning Gymnasium, Atari, PettingZoo, SMAC, Overcooked, Malmo, and related simulators.

These facts are useful multi-agent metric-validity context, but they are not AMC validation evidence by themselves. No upstream Python source code, shell scripts, GUI assets, videos, benchmark configurations, environment data, telemetry JSONL, policy mappings, seed schedules, result tables, worker implementations, README prose beyond minimal metadata facts, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC through existing metric-validity receipts because cross-paradigm comparison, shared seeds, deterministic scripts, and heterogeneous agent evaluation can inform how users reason about Score, Shield, and Watch validity claims. The closure is not a MOSAIC adapter, Python package integration, PyQt GUI integration, RL/VLM/LLM worker runner, Malmo setup, FastLane implementation, environment importer, policy mapping service, telemetry parser, seed scheduler, or cross-paradigm simulator; it is a fail-closed boundary showing that MOSAIC metadata is accepted only as source-review context unless AMC-owned metric validity proof exists.

For metric validity to pass, AMC needs validation table evidence, confidence interval evidence, sample size evidence, reliability checks, outcome-alignment checks, metric owner, signed evidence refs, source refs, row hashes, regression thresholds, CI or lifecycle gate proof, and no-copy proof. GitHub/README/license/cross-paradigm-evaluation metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing validation table, confidence interval, sample size, reliability, outcome-alignment, and metric-owner receipts. |
| Shield | Relevant only as a fail-closed trust boundary for cross-paradigm multi-agent evaluation claims; source metadata cannot stand in for signed validity proof. |
| Watch | Relevant only through source refs, CI/lifecycle gate receipts, and replayable eval-pack visibility; no live monitor changed. |
| Enforce | No runtime policy, simulator policy, worker policy, or circuit breaker changed. |
| Vault | No environment data, policies, telemetry logs, seeds, configs, or secure-storage behavior changed. |
| Fleet | Multi-agent evaluation context only; no MOSAIC orchestration topology or simulator added. |
| Passport | Existing metric validity receipts can feed proof bundles, but no Passport schema changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, API, CLI, Studio, methodology, badge, diagnostic question bank, or scoring code changed for GAP-0886.

The focused regression exercises existing `buildMetricValidationReport` behavior with a positive MOSAIC-style source-reference packet and a negative source-metadata-only packet. The positive path requires validation table, confidence interval, sample size, reliability check, outcome alignment, metric owner, signed evidence refs, source refs, row hashes, regression thresholds, and CI gate proof. The negative path fails closed when GitHub/README/license/cross-paradigm-evaluation metadata replaces signed metric-validity evidence.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, LICENSE presence, MIT license metadata, Star 24, Fork 4, Issues 2, Pull requests 0, 65 Commits, No releases published, Python 99.6%, Other 0.4%, folder names, file names, RL, LLM, VLM, and human decision-makers labels, Two Evaluation Modes labels, Manual Mode labels, Script Mode labels, shared seeds labels, deterministic seed sequences labels, JSONL labels, Heterogeneous Agent Mixing labels, Resource Management & Quotas labels, PolicyMappingService labels, FastLane labels, MOSAIC MultiGrid labels, local backlog metadata, or source identity alone must fail closed for metric validity. Passing evidence requires validation table, confidence interval, sample size, reliability checks, outcome alignment, metric owner, signed evidence refs, source refs, row hashes, regression thresholds, CI or lifecycle gate proof, and no-copy proof.

## No-bloat boundary

No MOSAIC adapter, Python package integration, PyQt GUI integration, RL/VLM/LLM worker runner, Malmo setup, FastLane implementation, environment importer, policy mapping service, telemetry parser, seed scheduler, cross-paradigm simulator, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, diagnostic question-bank migration, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream Python source code, shell scripts, GUI assets, videos, benchmark configurations, environment data, telemetry JSONL, policy mappings, seed schedules, result tables, worker implementations, README prose beyond minimal metadata facts, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0886MosaicMetricValidityBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the existing positive and negative metric-validity paths passed.
- Focused regression after doc addition: `npx vitest run tests/gap0886MosaicMetricValidityBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0885OpensearchObservabilityStackReplayCorpusBoundary.test.ts tests/gap0886MosaicMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
