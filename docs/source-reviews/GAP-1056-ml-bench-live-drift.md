# GAP-1056 — ML-Bench live-drift boundary

- Gap: `GAP-1056`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `gersteinlab/ML-Bench`
- Retrieval: live GitHub API, raw README headers/content, arXiv API, arXiv page headers, Hugging Face dataset page headers, 2026-06-25
- Status: Done

## Relevance decision

`gersteinlab/ML-Bench` is relevant to AMC as an agent-evaluation source-review signal because it evaluates LLMs and agents on repository-level machine-learning tasks. The backlog asks for live score and behavior drift alerts, so the AMC mapping is the existing Watch live-drift receipt path: baseline distribution, live sample, drift statistic, signed evidence, and alert receipt.

The source does not justify an ML-Bench runner, importer, dataset mirror, model adapter, Docker wrapper, arXiv parser, or benchmark-specific scoring lane. It is not a methodology-version change and it does not create a public claim that AMC reproduces ML-Bench.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through existing score-drift fields inside the generic live score and behavior drift receipt. |
| Shield | Indirect context only: drift alerts can surface unsafe or unreliable agent behavior, but this gap adds no new Shield detector. |
| Enforce | Out of scope; no runtime policy or circuit breaker changed. |
| Vault | Out of scope; no secrets, DLP, residency, or secure-storage behavior changed. |
| Watch | Primary surface. Existing live-drift receipts already require a baseline distribution, live sample, drift statistic, alert receipt, and signed evidence. |
| Fleet | Out of scope for this slice; no multi-agent topology or orchestration primitive changed. |
| Passport | Out of scope; no portable trust token or external proof bundle changed. |
| Comply | Out of scope; no EU AI Act, NIST, ISO, or SOC2 mapping changed. |

## Product closure

No product code changed. GAP-1056 is closed by documenting the source boundary and adding a focused regression test proving that ML-Bench context is accepted only through AMC's existing Watch live-drift receipt primitives.

Live source facts verified:

- GitHub repository: `gersteinlab/ML-Bench`
- Repository URL: https://github.com/gersteinlab/ML-Bench
- GitHub API URL: https://api.github.com/repos/gersteinlab/ML-Bench
- Project page: https://ml-bench.github.io/
- Raw README: https://raw.githubusercontent.com/gersteinlab/ML-Bench/master/README.md
- README HTML: https://github.com/gersteinlab/ML-Bench/blob/master/README.md
- arXiv record: https://arxiv.org/abs/2311.09835
- arXiv API query: https://export.arxiv.org/api/query?id_list=2311.09835
- arXiv PDF link from API: https://arxiv.org/pdf/2311.09835v5
- Hugging Face dataset page: https://huggingface.co/datasets/super-dainiu/ml-bench
- Repository metadata: MIT License, Python, 315 stars, 11 forks, 12 watchers, default branch `master`, pushed_at `2025-07-31T08:53:58Z`, updated_at `2026-06-06T06:51:47Z`
- Current head: `476ffcf1cc3bc047e206427e90c2f683339b0cc7`
- Current tree: `3046210ce1a2ee4dfae4e6210441f07671ac61fc`
- README SHA: `1cab80aee7bc43a4516562d32b2cac860b0b1649`
- LICENSE SHA: `af1393b388a10f9a4bcdea4ecee8a89f227b975b`
- GitHub commit verification `valid`
- GitHub latest release endpoint returned `404`
- GitHub tags endpoint returned no tags
- arXiv `2311.09835v5`
- arXiv title: ML-Bench: Evaluating Large Language Models and Agents for Machine Learning Tasks on Repository-Level Code
- arXiv metadata describes a benchmark with 9,641 examples across 18 GitHub repositories and separate ML-LLM-Bench and ML-Agent-Bench setups.
- arXiv metadata and README describe agent execution in a Linux sandbox environment, `Pass@5` reporting, and agent success rate reporting.
- README references the dataset `super-dainiu/ml-bench`, splits: ['full', 'quarter'], post-processed `merged_full_benchmark.jsonl`, and `merged_quarter_benchmark.jsonl`.

The AMC acceptance path remains source-agnostic. A valid claim must come from `runLiveScoreBehaviorDrift` and verify through `verifyLiveDriftReceipt`; Watch alerts are derived with `buildLiveDriftWatchAlerts`.

## Fail-closed rule

Metadata-only evidence is rejected. Stars, forks, README text, arXiv metadata, dataset page availability, Docker commands, API-call scripts, output file names, paper metrics, and repo commit metadata do not prove an AMC drift claim.

A GAP-1056 claim can pass only when the receipt includes:

- a concrete AMC baseline window,
- a concrete AMC live window,
- scored rows with evidence references,
- signed evidence references,
- drift statistics over score and behavior fields,
- source references, and
- Watch alert receipts generated from the generic live-drift primitive.

Rows with missing signed evidence must fail receipt verification and emit a `signedEvidenceRefs` fail-closed alert.

## No-bloat boundary

AMC did not add and must not add an ML-Bench runner, `ml_bench_live_drift` product primitive, GitHub repository importer, Hugging Face dataset mirror, Docker execution wrapper, arXiv parser, OpenAI run-script wrapper, benchmark-specific adapter, or copied upstream examples, outputs, prompts, scripts, configs, code, dataset rows, README prose, or paper text.

The source stays a review signal. AMC-owned behavior stays in existing Watch and Score evidence primitives.

## Verification

- `npx vitest run tests/gap1056MlBenchLiveDriftBoundary.test.ts --reporter=dot` first failed as expected while this document was missing: 1 failing doc-read test, 3 passing receipt/leakage tests.
- `npx vitest run tests/gap1056MlBenchLiveDriftBoundary.test.ts --reporter=dot` passed: 1 file / 4 tests.
- `npx vitest run tests/gap1056MlBenchLiveDriftBoundary.test.ts tests/gap1044GraphRagBenchmarkLiveDriftBoundary.test.ts --reporter=dot` passed: 2 files / 8 tests.
- `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Narrow token scan over `src/watch/liveDriftAlerts.ts`, `src/drift/continuousMonitor.ts`, and `src/score/index.ts` found no ML-Bench identifiers.
- `npm run typecheck` passed.
- `npm test -- --reporter=dot` passed: 903 files / 7,595 tests.
