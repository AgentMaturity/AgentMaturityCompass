# GAP-0717 - Generative Traffic Agents replay-corpus boundary

- Gap: `GAP-0717`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://arxiv.org/abs/2601.16778`, `https://doi.org/10.1145/3772318.3790772`, `https://openalex.org/W7125674531`
- Retrieval: `2026-06-21` via browser search and live arXiv result.
- Status: closed through existing eval replay corpus receipts; no traffic-agent simulator, mobility dataset, persona generator, or source-specific benchmark added.

## Live source metadata

The reachable arXiv result identifies the title `GTA: Generative Traffic Agents for Simulating Realistic Mobility Behavior`, authors Simon Laemmer, Mark Colley, and Patrick Ebel, date `2026-01-23`, and arXiv `2601.16778`. The backlog row also lists DOI `10.1145/3772318.3790772` and OpenAlex id `W7125674531`.

The paper metadata describes LLM-powered persona-based agents for transportation-choice simulation, artificial populations generated from census-based sociodemographic data, activity schedules, mode-choice simulation, Berlin-scale experiments, empirical comparisons, modal split by socioeconomic status, trip-length and mode-preference bias observations, and future mobility-policy scenario analysis. These facts are replay-corpus context only. No upstream paper prose beyond short metadata facts, census data, personas, mobility schedules, simulation rows, empirical datasets, trip data, transport-policy scenarios, figures, tables, statistics, prompts, model outputs, code, or benchmark rows were copied into AMC.

## Relevance decision

This source is relevant to AMC as replayable benchmark-corpus context because traffic-agent simulation claims are exactly the kind of agent-evaluation claim that should be reproducible through versioned manifests, fixed seeds, fixture hashes, baseline/candidate score deltas, source refs, signed evidence refs, and CI receipts. AMC already has the needed generic primitive: `runReplayBenchmarkCorpus` plus `buildEvalReplayCorpusEvidenceReceipt`.

This does not require a GTA simulator, mobility-behavior benchmark, census-data importer, persona generator, transport-mode evaluator, Berlin mobility dataset, or methodology version bump. GAP-0717 is closed by documenting the source boundary and adding regression coverage that GTA-style mobility-agent context uses existing AMC replay-corpus receipts. arXiv, DOI, OpenAlex, title, author, persona, census, mobility, or empirical-comparison labels alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing replayable benchmark corpus manifests, fixture hashes, score deltas, and signed row evidence. |
| Shield | Relevant through fail-closed evidence and CI receipts before external claims about mobility-agent evaluation are trusted. |
| Watch | Relevant through replay receipts that can be monitored as regression evidence. |
| Enforce | No runtime mobility-policy, transport-mode, or persona policy changed. |
| Vault | No census data, mobility data, personas, schedules, or secure-storage behavior changed. |
| Fleet | Agent-simulation context only; no fleet topology or traffic-agent orchestration added. |
| Passport | No portable proof-bundle field changed. |
| Comply | Mobility and urban-planning context only; no compliance mapping changed. |

## Product closure

No `src/benchmarks/replayBenchmarkCorpus.ts`, `src/eval/replayCorpusEvidenceReceipt.ts`, `src/diagnostic/evalReplayCorpusBoundary.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, traffic-agent simulator, mobility dataset importer, persona generator, transport-mode evaluator, Berlin mobility benchmark, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0717.

The focused regression exercises the existing eval replay corpus engine with GTA-style mobility-agent fixture data. The positive path requires AMC-owned replay fixtures, fixed seeds, fixture hashes, source refs, baseline/candidate score deltas, signed evidence, and CI-ready receipts. The negative path fails closed when arXiv/DOI/OpenAlex/title metadata replaces AMC-owned replay evidence.

## Fail-closed rule

Paper title, arXiv id, DOI, OpenAlex id, author list, date, persona-agent labels, census-data labels, sociodemographic labels, artificial-population labels, activity-schedule labels, mode-choice labels, Berlin-scale labels, empirical-comparison labels, modal-split labels, trip-length labels, mobility-policy labels, local backlog metadata, or source identity alone must fail closed for replay-corpus claims. Passing evidence requires AMC-owned replay manifest, fixture hash, fixed seed, input/expected hashes, baseline and candidate run ids, score delta, CI receipt, signed evidence refs, row hashes, source refs, Score/Shield/Watch coverage, and no-copy proof.

## No-bloat boundary

No GTA simulator, traffic-agent benchmark, mobility-behavior simulator, census-data importer, persona generator, activity-schedule generator, mode-choice evaluator, Berlin mobility dataset, empirical-data importer, transport-policy scenario runner, arXiv importer, OpenAlex importer, ACM importer, paper importer, dataset mirror, benchmark mirror, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream paper prose beyond short metadata facts, census data, personas, mobility schedules, simulation rows, empirical datasets, trip data, transport-policy scenarios, figures, tables, statistics, prompts, model outputs, code, or benchmark rows were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0717GenerativeTrafficAgentsReplayCorpusBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
