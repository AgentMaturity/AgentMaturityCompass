# GAP-0994 - BEIR provider-drift boundary

- Gap: `GAP-0994`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: live GitHub repository/API at `https://github.com/beir-cellar/beir`, GitHub repository API at `https://api.github.com/repos/beir-cellar/beir`, raw README at `https://raw.githubusercontent.com/beir-cellar/beir/main/README.md`, raw license at `https://raw.githubusercontent.com/beir-cellar/beir/main/LICENSE`, raw pyproject at `https://raw.githubusercontent.com/beir-cellar/beir/main/pyproject.toml`, latest release page at `https://github.com/beir-cellar/beir/releases/tag/v2.2.0`, `git ls-remote`, and local backlog metadata.
- Retrieval: `2026-06-24` live source review through GitHub repository API, raw GitHub content, release API, `git ls-remote`, and local backlog metadata.
- Status: closed through existing provider/model drift benchmark receipts only; no BEIR runner, retrieval benchmark mirror, dataset importer, Hugging Face importer, pytrec evaluator, embedding provider adapter, API provider adapter, API route, CLI command, Studio panel, Watch monitor, Shield verifier, package dependency, or source-specific provider-drift subsystem added.
- Linear: `AMC-1273`

## Live source metadata

The GitHub API identifies `beir-cellar/beir` as a public Python repository with description `A Heterogeneous Benchmark for Information Retrieval. Easy to use, evaluate your models across 15+ diverse IR datasets.`, homepage `http://beir.ai`, Apache License 2.0 metadata, default branch `main`, 2,220 stars, 246 forks, 79 open issues, watchers_count `2220`, created_at `2021-01-18T09:55:54Z`, pushed_at `2025-10-16T06:38:03Z`, and updated_at `2026-06-19T16:29:32Z`. Topics include benchmark, dataset, information-retrieval, llm, nlp, passage-retrieval, rag, retrieval, retrieval-models, sentence-transformers, and zero-shot-retrieval.

`git ls-remote https://github.com/beir-cellar/beir.git HEAD refs/heads/main` verified default branch `main` at `ef83d29307061c65d04b035b4f4e7c18bd8374af`. Raw README, LICENSE, and pyproject files returned reachable content from the `main` branch.

The GitHub releases API identifies latest release `v2.2.0`, target branch `main`, created_at `2025-06-04T17:45:05Z`, updated_at `2025-06-04T18:42:18Z`, and published_at `2025-06-04T18:42:18Z`.

The pyproject metadata identifies package name `beir`, pyproject version `2.2.0`, Apache License 2.0, requires-python `>=3.9`, dependencies including sentence-transformers, pytrec-eval-terrier, and datasets, plus optional faiss-cpu, elasticsearch, peft, llm2vec, TensorFlow, and dev extras.

Relevant source-review signals include 17 benchmark datasets, retrieval model evaluation, nDCG/MAP/Recall/Precision style metrics, runfile/result artifacts, Hugging Face dataset access, API embedding evaluation context, Cohere and Voyage provider examples, LoRA/vLLM evaluation context, and release metadata about provider/API evaluation support.

No BEIR code, README prose beyond short metadata facts, release prose beyond short metadata facts, license text beyond license identity, pyproject content beyond short metadata facts, examples, configs, datasets, qrels, runfiles, leaderboards, model names beyond minimal metadata labels, prompts, benchmark rows, metric rows, screenshots, images, generated outputs, or implementation details were copied into AMC.

## Relevance decision

GAP-0994 is relevant to AMC because BEIR-style retrieval benchmarks are exactly the kind of canary context where embedding model/provider updates can change retrieval quality, latency, cost, refusal, or guardrail distributions while an agent product appears unchanged.

The accepted AMC primitive already exists: `runProviderDriftBenchmark`, `buildProviderDriftEvalPack`, `buildProviderDriftWatchAlerts`, and `buildProviderDriftCiGate`. Valid proof requires provider version, canary results, drift statistic, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, row hashes, CI/lifecycle gate proof, source refs, and alert or waiver output. Repository metadata, dataset labels, dependency labels, release labels, API provider labels, and benchmark identity alone must not affect Score, Shield, or Watch.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through AMC-owned provider canary score rows, retrieval-quality metrics, metric suites, thresholds, dataset hashes, and row hashes. |
| Shield | Relevant when retrieval drift changes refusal, unsafe retrieval, invalid action, guardrail, evaluator coverage, or downstream answer-risk metrics. |
| Enforce | No runtime policy, provider router, retrieval engine, benchmark runner, dataset loader, or circuit breaker changed. |
| Vault | No credential, data residency, private corpus, artifact store, secure storage, or dataset storage behavior changed. |
| Watch | Relevant through existing Watch provider-drift alerts and CI/lifecycle gate receipts. |
| Fleet | Retrieval/provider canaries can inform fleet-level risk, but no Fleet topology or orchestration behavior changed. |
| Passport | Existing provider-drift receipts can feed proof bundles, but no Passport schema changed. |
| Comply | License and benchmark context only; no compliance mapping changed. |

## Product closure

No product code changed. The focused regression proves existing provider-drift primitives can accept BEIR-style retrieval benchmark context only when AMC has signed canary rows, provider versions, metric suites, evaluator hashes, trace exports, dataset hashes, observability proof, thresholds, and CI gate evidence.

The positive path produces a replayable provider-drift eval pack and passes the CI gate without Watch alerts. The negative path fails closed when BEIR repository metadata, README metadata, license metadata, pyproject metadata, release metadata, dataset labels, metric labels, API provider labels, Hugging Face labels, package labels, language labels, topic labels, and source identity replace AMC-owned signed canary proof.

## Fail-closed rule

BEIR repository identity, GitHub star/fork/issue/watcher counts, default-branch SHA, README labels, Apache License 2.0 label, Python language label, topics, pyproject version, dependency labels, optional dependency labels, release tags, dataset counts, Hugging Face labels, Cohere labels, Voyage labels, LoRA/vLLM labels, runfile labels, metric labels, leaderboard labels, local backlog metadata, or source identity alone cannot prove provider/model drift.

A provider/model drift claim must fail closed unless provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, evaluator config hash, generated test data hash, trace export hash, metric report hash, threshold config, row hashes, CI or lifecycle receipt, Watch alert projection, source refs, and no-copy proof exist.

## No-bloat boundary

No BEIR runner, retrieval benchmark mirror, dataset importer, qrels importer, runfile importer, Hugging Face importer, pytrec evaluator, sentence-transformers wrapper, faiss integration, elasticsearch integration, Cohere adapter, Voyage adapter, LoRA/vLLM path, leaderboard mirror, API provider adapter, example importer, release parser, pyproject parser, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Score method, Passport field, methodology version bump, diagnostic question-bank migration, provider router, package dependency, or source-specific provider-drift subsystem was added.

No upstream code, README prose beyond short metadata facts, release prose beyond short metadata facts, license text beyond license identity, pyproject content beyond short metadata facts, examples, configs, datasets, qrels, runfiles, leaderboards, model names beyond minimal metadata labels, prompts, benchmark rows, metric rows, screenshots, images, generated outputs, or implementation details were copied.

## Verification

- TDD expected failure: `npx vitest run tests/gap0994BeirProviderDriftBoundary.test.ts --reporter=dot` failed before this document existed with `ENOENT: no such file or directory, open 'docs/source-reviews/GAP-0994-beir-provider-drift.md'`; 3 provider-drift primitive tests passed.
- Focused regression: `npx vitest run tests/gap0994BeirProviderDriftBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired regression: `npx vitest run tests/gap0993LlmCounselorPublicMethodologyBoundary.test.ts tests/gap0994BeirProviderDriftBoundary.test.ts --reporter=dot` passed, 2 files / 7 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed; narrow token scan over provider-drift implementation files found no GAP-0994 BEIR identifiers.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 841 files / 7,358 tests.
