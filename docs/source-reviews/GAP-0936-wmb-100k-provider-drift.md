# GAP-0936 - WMB-100K provider-drift boundary

- Gap: `GAP-0936`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `Irina1920/WMB-100K`, `https://github.com/Irina1920/WMB-100K`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page showed the `master` branch, Star 13, Fork 0, Issues 0, Pull requests 0, 1 Commit, folders `datasets`, `documents`, `scripts`, and `src`, files `.gitignore`, `COMPARISON.md`, `Cargo.lock`, `Cargo.toml`, `README.md`, and `requirements.txt`, No releases published, Packages 0, Rust 81.8%, Python 18.2%, and topics benchmark, ai, evaluation, memory-systems, 100k, rag, vector-database, llm, ai-memory, and mem0.
- Status: Done

## Live source metadata

The live README title is `WMB-100K - Wontopos Memory Benchmark v2.1`. It describes a 100,000-turn benchmark for AI memory systems with 4.3M tokens, 2,708 questions, 105,591 turns, situational retrieval accuracy, false memory defense, Part A document data, Part B conversation data, S1 scored questions, S2-S7 analysis questions, 400 false-memory probes, GPT-4o-mini semantic judge in Quick mode, Official mode with 3 LLMs majority vote, Claude Haiku, Gemini Flash, Speed Penalty, FM Penalty, no results yet, synthetic conversation data generated using Claude Haiku, English-only limitation, vendor-created benchmark limitation, independent reproduction/audit request, Apache 2.0 license text, and fairness reporting guidance.

Those facts are relevant to AMC only through existing provider/model drift receipts. WMB-100K is a benchmark context that can shape canaries for memory-system retrieval and false-memory defense across provider/model versions, but the accepted AMC proof remains provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, row hashes, CI or lifecycle gate proof, and no-copy proof.

No upstream Rust code, Python code, scripts, datasets, documents, question rows, answer rows, judge prompts, scoring formulas, leaderboard rows, result files, Cargo files, requirements, README prose beyond minimal metadata facts, generated outputs, model responses, or implementation details were copied into AMC.

## Relevance decision

`GAP-0936` is relevant to AMC through existing provider/model drift benchmark receipts. A memory-system benchmark with fixed judges and latency/cost-sensitive scoring is a valid context for recurring provider canaries, but it does not justify a WMB runner, dataset importer, score.py wrapper, memory-system benchmark subsystem, Rust crate integration, Python script runner, or source-specific provider-drift path.

The product closure is a focused regression over the existing `runProviderDriftBenchmark`, `buildProviderDriftEvalPack`, `buildProviderDriftWatchAlerts`, and `buildProviderDriftCiGate` primitives. No source-specific implementation module changed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through provider/model canary score distributions and replayable eval-pack receipts. |
| Shield | Relevant because missing signed evidence, evaluator proof, or observability proof fails closed before accepting provider drift claims. |
| Watch | Relevant through drift statistics, Watch alert projection, and alert or waiver evidence. |
| Enforce | No runtime policy changed. |
| Vault | No datasets, documents, memory rows, prompts, API keys, judge outputs, or upstream artifacts stored. |
| Fleet | Memory-system benchmark context only; no AMC fleet topology changed. |
| Passport | No badge/passport semantics changed. |
| Comply | No compliance mapping changed. |

## Product closure

The focused regression exercises existing provider-drift primitives with a synthetic AMC-owned WMB-100K-style canary packet. The positive path requires provider version, canary results, drift statistic, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, and CI gate proof. The negative path fails closed when WMB-100K repository metadata, benchmark labels, README labels, dataset labels, judge labels, and provider names replace signed provider-drift evidence.

No product implementation module needed a source-specific change.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, Star 13, Fork 0, Issues 0, Pull requests 0, 1 Commit, folder names, file names, No releases published, Packages 0, Rust 81.8%, Python 18.2%, topic labels, WMB-100K title, 100,000-turn benchmark labels, 4.3M tokens labels, 2,708 questions labels, 105,591 turns labels, situational retrieval accuracy labels, false memory defense labels, GPT-4o-mini semantic judge labels, 3 LLMs majority vote labels, Claude Haiku labels, Gemini Flash labels, Speed Penalty labels, vendor-created benchmark labels, Apache 2.0 labels, local backlog metadata, or source identity alone must fail closed for provider/model drift. Passing evidence requires provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, row hashes, CI or lifecycle gate proof, and no-copy proof.

## No-bloat boundary

No WMB-100K adapter, memory benchmark runner, dataset importer, document importer, scripts wrapper, score.py runner, test_mem0 wrapper, test_langchain wrapper, Rust crate integration, Python runner, Cargo build path, requirements install path, leaderboard importer, result submission flow, judge prompt implementation, official-mode evaluator, dataset mirror, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream Rust code, Python code, scripts, datasets, documents, question rows, answer rows, judge prompts, scoring formulas, leaderboard rows, result files, Cargo files, requirements, README prose beyond minimal metadata facts, generated outputs, model responses, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0936Wmb100kProviderDriftBoundary.test.ts --reporter=dot` failed because this source-review doc did not exist; provider-drift positive, metadata-only fail-closed, and implementation leakage checks already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0936Wmb100kProviderDriftBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired regression: `npx vitest run tests/gap0935LexRagMetricValidityBoundary.test.ts tests/gap0936Wmb100kProviderDriftBoundary.test.ts --reporter=dot` passed, 2 files / 8 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
