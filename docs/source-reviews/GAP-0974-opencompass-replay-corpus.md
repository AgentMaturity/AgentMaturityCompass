# GAP-0974 - OpenCompass replay-corpus boundary

- Gap: `GAP-0974`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: live OpenCompass website at `https://opencompass.org.cn/`, live GitHub repository page at `https://github.com/open-compass/opencompass`, live OpenCompass quick-start docs at `https://opencompass.readthedocs.io/en/latest/get_started/quick_start.html`, and live arXiv record at `https://arxiv.org/abs/2605.19276`
- Retrieval: `2026-06-24` live source review through web research and the local backlog row.
- Status: closed through existing eval replay corpus receipts only when AMC-owned replay evidence exists; no OpenCompass runner, package dependency, config importer, dataset importer, leaderboard mirror, result-row loader, or source-specific replay path added.
- Linear: `AMC-1253`

## Live source metadata

The live OpenCompass website and GitHub repository describe OpenCompass as a one-stop platform for large model evaluation and a fair, open, and reproducible benchmark. The live GitHub repository page identified the `open-compass/opencompass` project as public, with 7.1k stars, 793 forks, 377 issues, 87 pull requests, 1,134 commits, and an Apache-2.0 license at retrieval time.

The live repository page links the OpenCompass website, CompassRank leaderboard, documentation, and installation docs. The README-visible source signal includes evaluation over model(s) and dataset(s), API model evaluation, configuration files, dataset preparation, generated evaluation outputs, leaderboard reproduction guidance, and result artifacts such as CSV and TXT files.

The live OpenCompass quick-start docs describe the user-visible evaluation workflow as Configure -> Inference -> Evaluation -> Visualization. The arXiv record for "OpenCompass: A Universal Evaluation Platform for Large Language Models" describes a platform architecture with a Configuration System, Task Partitioning Module, Execution and Scheduling Module, Task Execution Unit, and Result Visualization Module. It also identifies rule-based, LLM-as-a-Judge, and cascaded evaluators across mainstream benchmark datasets.

No OpenCompass code, docs prose beyond short metadata facts, benchmark datasets, benchmark rows, prompts, configuration files, examples, leaderboards, result rows, screenshots, generated outputs, model outputs, or implementation details were copied into AMC.

## Relevance decision

GAP-0974 is relevant to AMC only through the existing replayable benchmark corpus primitive. OpenCompass reinforces a concrete AMC audit requirement: an agent evaluation claim must be reproducible through an AMC-owned replay manifest with fixed seed, fixture hash, baseline/candidate score delta, source refs, signed evidence refs, row hashes, Score/Shield/Watch coverage, and CI or lifecycle receipt proof.

The accepted AMC primitive is already `runReplayBenchmarkCorpus` plus `buildEvalReplayCorpusEvidenceReceipt`. OpenCompass website claims, GitHub metadata, quick-start workflow labels, model and dataset labels, evaluator labels, leaderboard labels, arXiv architecture labels, and local backlog metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through AMC-owned replay manifests with fixture hash, fixed seed, score delta, source refs, signed evidence, and row hashes. |
| Shield | Relevant when replay rows cover unsafe, adversarial, refusal, policy-failing, or regression behavior with signed evidence and CI/lifecycle receipts. |
| Enforce | No runtime guardrail, policy, sandbox, circuit breaker, tool approval, or execution path changed. |
| Vault | No dataset, prompt, API key, leaderboard row, result artifact, or secure-storage behavior changed. |
| Watch | Relevant when replay deltas become regression evidence for monitoring, lifecycle receipts, or drilldown; no live monitor changed for this gap. |
| Fleet | Model, dataset, and scheduler context only; no Fleet orchestration, topology, routing, or multi-agent coordination changed. |
| Passport | No portable identity, credential, trust token, or proof-bundle schema changed. |
| Comply | No compliance mapping, legal attestation, or regulatory control changed. |

## Product closure

No product code changed. The focused regression exercises existing `runReplayBenchmarkCorpus` and `buildEvalReplayCorpusEvidenceReceipt` behavior with AMC-owned synthetic fixture data.

The positive path proves OpenCompass source context can be cited only when AMC-owned replay rows include replay manifest, fixture hash, fixed seed, source refs, baseline/candidate evidence, signed evidence refs, Score/Shield/Watch coverage, row hashes, score delta, and CI receipt proof. The negative path fails closed when OpenCompass website claims, GitHub metadata, quick-start workflow labels, model and dataset labels, evaluator labels, leaderboard labels, result-export labels, arXiv architecture labels, and benchmark labels replace an AMC-owned replay fixture.

## Fail-closed rule

OpenCompass website claims, GitHub counts, one-stop platform labels, fair/open/reproducible benchmark labels, configuration labels, inference/evaluation/visualization labels, model and dataset labels, evaluator labels, leaderboard labels, CSV/TXT result labels, architecture labels, arXiv abstract claims, local backlog metadata, and source identity alone are not replay-corpus evidence.

Passing evidence requires AMC-owned replay manifest, fixture hash, fixed seed, score delta, source refs, signed evidence refs, row hashes, CI or lifecycle receipt, Score/Shield/Watch coverage, and no-copy proof.

## No-bloat boundary

No OpenCompass runner, importer, adapter, package dependency, config importer, dataset importer, leaderboard mirror, result-row loader, result visualizer, evaluation scheduler, evaluator wrapper, CLI command, API route, Studio panel, Watch monitor, Shield verifier, Score method, Passport field, methodology version bump, or source-specific replay path was added.

No upstream code, docs prose beyond short metadata facts, benchmark datasets, benchmark rows, prompts, configuration files, examples, leaderboards, result rows, screenshots, generated outputs, model outputs, or implementation details were copied.

## Verification

- TDD expected failure: `npx vitest run tests/gap0974OpenCompassReplayCorpusBoundary.test.ts --reporter=dot` - failed before this doc existed with `ENOENT: no such file or directory, open 'docs/source-reviews/GAP-0974-opencompass-replay-corpus.md'`; 3 replay primitive tests passed.
- Focused regression: `npx vitest run tests/gap0974OpenCompassReplayCorpusBoundary.test.ts --reporter=dot` - 1 file / 4 tests passed.
- Paired regression: `npx vitest run tests/gap0973HelmPublicMethodologyBoundary.test.ts tests/gap0974OpenCompassReplayCorpusBoundary.test.ts --reporter=dot` - 2 files / 7 tests passed.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` - passed.
- Typecheck: `npm run typecheck` - passed.
- Full suite: `npm test -- --reporter=dot` - 821 files / 7,283 tests passed.
