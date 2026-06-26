# GAP-0968 - Patronus AI replay corpus

- Gap: `GAP-0968`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: live Patronus AI homepage at `https://www.patronus.ai` and live Patronus docs at `https://docs.patronus.ai/docs`
- Retrieval: `2026-06-22` live source review through the web research channel.
- Status: closed through existing eval replay corpus receipts only when AMC-owned replay evidence exists; no Patronus adapter, Patronus runner, dataset importer, simulation importer, evaluator importer, or source-specific replay path added.
- Linear: `AMC-1246`

## Live source metadata

The live Patronus AI homepage now emphasizes simulation research and infrastructure. It names Digital World Models, long-horizon tasks, world data artifacts, Simulation Domains, Deep Research, Multi-Turn Dialogue, Long Horizon, Memory, and featured research labels including Lynx, FinanceBench, BLUR, and GLIDER.

The live Patronus docs identify evaluation and operations surfaces including Evaluators, Evaluations, Experiments, Datasets, Comparisons, Traces, Percival, Prompts, Annotations, SDKs and toolkits, real time alerts, visualizations, in-house evaluator models, and Dataset Generation for RAG, Agents, and other architectures.

No Patronus code, docs prose beyond minimal metadata facts, simulation data, benchmarks, Q&A pairs, prompts, traces, screenshots, evaluator configs, datasets, generated outputs, or implementation details were copied into AMC.

## Relevance decision

GAP-0968 is relevant to AMC only through the existing replayable benchmark corpus primitive. Patronus evaluation, monitoring, simulation, research, and dataset-generation context reinforces a real audit need: auditors must be able to rerun a versioned eval manifest with fixed seeds and reproduce score deltas from source-linked datasets.

The accepted AMC primitive is already `runReplayBenchmarkCorpus` plus `buildEvalReplayCorpusEvidenceReceipt`: replay manifest, fixture hash, fixed seed, score delta, source refs, signed evidence refs, CI receipt, row hashes, Score/Shield/Watch coverage, and no-copy proof. Patronus homepage/docs metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through AMC-owned replay manifests with fixture hash, fixed seed, score delta, and signed evidence. |
| Shield | Relevant when replay evidence covers unsafe, hallucinated, or policy-failing behavior with signed receipts. |
| Enforce | No runtime policy enforcement or circuit breaker changed in this slice. |
| Vault | No dataset storage, secrets, DLP, or privacy behavior changed. |
| Watch | Relevant when replay deltas are tied to regression thresholds or lifecycle receipts; no live monitor changed. |
| Fleet | Simulation and agent context only; no Fleet orchestration or topology changed. |
| Passport | No portable proof-bundle field changed. |
| Comply | No compliance mapping changed. |

## Product closure

No product code changed. The focused regression exercises existing `runReplayBenchmarkCorpus` and `buildEvalReplayCorpusEvidenceReceipt` behavior.

The positive path proves Patronus source context can be cited only when AMC-owned replay rows include replay manifest, fixture hash, fixed seed, source refs, baseline/candidate evidence, signed evidence refs, score delta, Score/Shield/Watch coverage, and CI receipt proof. The negative path fails closed when Patronus homepage, docs, simulation, evaluation, monitoring, dataset-generation, and research metadata replaces an AMC-owned replay fixture.

## Fail-closed rule

Patronus homepage claims, docs claims, Digital World Models labels, FinanceBench labels, Lynx labels, GLIDER labels, BLUR labels, simulation labels, evaluation labels, monitoring labels, dataset-generation labels, real-time-alert labels, and local backlog metadata are not replay-corpus evidence.

Passing evidence requires AMC-owned replay manifest, fixture hash, fixed seed, score delta, source refs, signed evidence refs, row hashes, CI or lifecycle receipt, Score/Shield/Watch coverage, and no-copy proof.

## No-bloat boundary

No Patronus adapter, Patronus runner, dataset importer, simulation importer, evaluator importer, monitoring integration, policy-check integration, FinanceBench mirror, Lynx integration, GLIDER integration, BLUR importer, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Score method, Passport field, methodology version bump, package dependency, or source-specific scoring path was added.

No upstream code, docs prose, screenshots, examples, prompts, datasets, benchmark rows, trace samples, configs, generated outputs, model responses, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0968PatronusReplayCorpusBoundary.test.ts --reporter=dot` - 1 file / 4 tests passed.
- Paired regression: `npx vitest run tests/gap0967RagaAiCatalystStudioDrilldownBoundary.test.ts tests/gap0968PatronusReplayCorpusBoundary.test.ts --reporter=dot` - 2 files / 8 tests passed.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` - passed.
- Typecheck: `npm run typecheck` - passed.
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
