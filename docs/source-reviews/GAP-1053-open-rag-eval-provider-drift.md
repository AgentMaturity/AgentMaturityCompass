# GAP-1053 - Open RAG Eval provider drift

- Gap: `GAP-1053`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `vectara/open-rag-eval`
- Retrieval: GitHub CLI/API, repository contents API, branch API, release/tag API, raw README/METRICS skim, and HEAD checks on 2026-06-24 UTC.
- Status: Done - relevance boundary documented and regression-tested through existing AMC provider-drift primitives.

## Relevance decision

`vectara/open-rag-eval` is relevant to AMC as an external source-review signal for RAG evaluation provider/model drift. The repository describes RAG evaluation without the need for golden answers and exposes RAG-oriented evaluators, connectors, per-query outputs, and metrics. That maps to AMC only through existing Score/Shield/Watch provider-drift receipts: provider version, canary results, drift statistic, alert or waiver, signed evidence refs, source refs, replayable eval-pack rows, row hashes, and CI/watch gates.

The source is not a product requirement for an Open RAG Eval runner, importer, metric adapter, connector bridge, prompt loader, dataset mirror, config mirror, or result parser. AMC can use the source-review signal without adding any source-specific product surface.

Live metadata checked:

- Repository: `https://github.com/vectara/open-rag-eval`
- GitHub API: `https://api.github.com/repos/vectara/open-rag-eval`
- README API: `https://api.github.com/repos/vectara/open-rag-eval/readme`
- Default-branch README: `https://raw.githubusercontent.com/vectara/open-rag-eval/dev/README.md`
- Default-branch METRICS: `https://raw.githubusercontent.com/vectara/open-rag-eval/dev/METRICS.md`
- Default-branch LICENSE: `https://raw.githubusercontent.com/vectara/open-rag-eval/dev/LICENSE`
- Latest release: `https://github.com/vectara/open-rag-eval/releases/tag/v0.3.0`

Primary-source facts captured for the boundary:

- Repository description: RAG evaluation without the need for golden answers.
- Repository identity: `vectara/open-rag-eval`.
- primary language `Python`; language API returned Python, Dockerfile, and Makefile.
- Stars `375`; Forks `23`; Watchers API total `5`; watchers_count `375`; open issues `8`.
- default branch `dev`; dev branch protected `true`; latest dev commit `9803c35bc1cf5a8f7190cedb74a2f5fad9bf7129` at `2026-06-02T21:55:42Z`.
- main branch protected `true`; main branch commit `74e72d0fee7088b0497b9068b6bb7d436b685a64` at `2025-12-15T23:25:27Z`.
- License detected as `Apache-2.0`.
- README sha `8493ab0a0d6979a19ba42f0c98a697b6026bfdb9`.
- METRICS.md sha `caa8c9216e53fdceecad810777ffc5b8baa95d86`.
- requirements.txt sha `71822e15130b7b985762a673f0126094a8cac897`.
- setup.py sha `f493c9b2bccb6a048f1cc84ab1f719b7323ba9d0`.
- latest release `v0.3.0`; published_at `2025-12-15T23:29:13Z`; tag commit `74e72d0fee7088b0497b9068b6bb7d436b685a64`.
- GitHub repo returned HTTP/2 200. The raw README returned HTTP/2 200 with content-length: 32265.
- README/METRICS metadata referenced TREC-RAG metrics, UMBRELA, AutoNuggetizer, HHEM, GoldenAnswerEvaluator, ConsistencyEvaluator, Vectara connector, LlamaIndex, LangChain, and per-query scores.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through AMC-owned provider-drift canaries for score distribution stability. |
| Shield | Relevant only when signed canary rows include refusal, invalid-action, guardrail, or hallucination/factuality safety signals. |
| Enforce | No Enforce change; no RAG connector or runtime policy path is added. |
| Vault | No Vault change; no external prompts, configs, API keys, datasets, or RAG outputs are imported. |
| Watch | Relevant through existing Watch alerts for provider/model drift when signed canary evidence crosses thresholds. |
| Fleet | No Fleet change; no source-specific agent topology is added. |
| Passport | No Passport change; no trust token schema changes. |
| Comply | No Comply change; repository metadata is not regulatory evidence. |

## Product closure

Product closure is a no-bloat provider-drift boundary. The existing `runProviderDriftBenchmark`, `buildProviderDriftEvalPack`, `buildProviderDriftWatchAlerts`, and `buildProviderDriftCiGate` primitives already enforce the required AMC provider/model drift evidence:

- provider version
- canary results
- drift statistic
- alert or waiver
- evaluation framework evidence
- observability pipeline evidence
- signed evidence refs
- source refs
- replayable eval-pack row hashes
- CI/watch gate behavior

The focused regression proves that Open RAG Eval context can pass only when these AMC-owned provider-drift receipts exist. The negative path proves that repository metadata, README/METRICS labels, RAG metric names, connector names, release tags, branch status, stars, language, license, and source identity fail closed when substituted for signed provider-drift proof.

No public methodology, API, CLI, Studio, runtime RAG integration, or scoring semantic changed.

## Fail-closed rule

Metadata-only Open RAG Eval evidence must fail closed. The following signals are insufficient by themselves:

- GitHub repo existence, stars, forks, watchers, topics, language, license, issue count, releases, tags, protected branch state, default branch, commit SHAs, README/METRICS file SHAs, or package metadata.
- README/METRICS claims about RAG evaluation, golden answers, UMBRELA, AutoNuggetizer, HHEM, TREC-RAG, GoldenAnswerEvaluator, ConsistencyEvaluator, Vectara, LlamaIndex, LangChain, per-query scores, plotting, connectors, or web API endpoints.
- Copied configs, sample prompts, CSV examples, metric docs, source code, connector implementations, data rows, generated answers, retrieved passages, plots, or result files.

An AMC provider-drift claim passes only with AMC-owned baseline/candidate canary rows, provider versions, metric suites, evaluator config hash, generated test data hash, dashboard artifact hash, trace export hash, metric report hash, pipeline config hash, sample size, trajectory count, signed evidence refs, source refs, drift statistic, alert or waiver, CI gate, and Watch alert projection.

## No-bloat boundary

AMC did not add and must not add a source-specific Open RAG Eval subsystem for this gap. Specifically out of scope:

- open-rag-eval runner, importer, adapter, metric bridge, connector bridge, prompt loader, config parser, CSV loader, plot renderer, result parser, web API proxy, API route, CLI command, Studio panel, or package dependency.
- Copied upstream code, README/METRICS prose, configs, sample prompts, data files, query rows, generated answers, retrieved passages, metric outputs, plots, examples, tests, result files, or implementation details.

The only committed product artifact is the source-review doc plus a focused regression test that keeps the existing AMC provider-drift primitive fail-closed.

## Verification

- Expected red: `npx vitest run tests/gap1053OpenRagEvalProviderDriftBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1053-open-rag-eval-provider-drift.md` did not exist; the three primitive checks passed.
- Focused: `npx vitest run tests/gap1053OpenRagEvalProviderDriftBoundary.test.ts --reporter=dot`
- Paired provider-drift boundary regression: `npx vitest run tests/gap1053OpenRagEvalProviderDriftBoundary.test.ts tests/gap1048SmtSolvingProviderDriftBoundary.test.ts --reporter=dot`
- Static whitespace: `git diff --check -- . ':(exclude)AMC_OS'`
- No-bloat scan: `rg -n "open-rag-eval|vectara/open-rag-eval|9803c35bc1cf5a8f7190cedb74a2f5fad9bf7129|open-rag-eval-provider-drift" src/benchmarks/providerDriftBenchmark.ts src/watch/providerDriftAlerts.ts src/api/benchmarkRouter.ts`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot`
