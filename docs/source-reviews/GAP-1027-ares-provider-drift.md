# GAP-1027 - ARES provider-drift boundary

- Gap: `GAP-1027`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: `stanford-futuredata/ARES`
- Retrieval: live GitHub repository metadata, GitHub REST repository/default-branch/contents/readme/releases/tags/languages APIs, raw README, raw `pyproject.toml`, raw license, homepage headers, and local backlog metadata fetched on 2026-06-24
- Status: Done

## Relevance decision

`stanford-futuredata/ARES` is relevant to AMC as source-review context for provider/model drift canaries that exercise RAG behavior over context relevance, answer faithfulness, answer relevance, retrieval quality, judge agreement, confidence intervals, refusal, invalid-action, latency, and cost. It maps to the existing AMC Score/Shield/Watch provider-drift primitive because AMC already requires provider version, canary results, signed evidence refs, drift statistic, and Watch alert or waiver before any provider-drift claim can pass.

Live source metadata verified:

- GitHub repository: `https://github.com/stanford-futuredata/ARES`
- GitHub API: `https://api.github.com/repos/stanford-futuredata/ARES`
- README API: `https://api.github.com/repos/stanford-futuredata/ARES/readme`
- README: `https://raw.githubusercontent.com/stanford-futuredata/ARES/main/README.md`
- pyproject: `https://raw.githubusercontent.com/stanford-futuredata/ARES/main/pyproject.toml`
- License: `https://raw.githubusercontent.com/stanford-futuredata/ARES/main/LICENSE`
- Homepage/docs: `https://ares-ai.vercel.app/`
- Paper link surfaced by README metadata: `https://arxiv.org/abs/2311.09476`
- Repository full name: `stanford-futuredata/ARES`
- GitHub description: `Automated Evaluation of RAG Systems`
- Public, non-fork, non-archived repository.
- License metadata and license file: `Apache License 2.0`
- primary language `Python`
- Stars `717`
- Forks `66`
- Watchers `10`
- open issues `21`
- GitHub topics API returned no repository topics.
- Created `2023-09-27T03:56:19Z`, pushed `2025-03-28T11:25:50Z`, updated `2026-06-18T08:52:57Z`
- default branch `main`; protected `false`; default branch commit `c7c9018a755faf8347c4da415632bae1593ef104`
- README sha `3c6230c40cb10478f354b880d5969ef6840014a6`, size 12627
- Top-level repository shape includes `ares`, `checkpoints`, `datasets`, `docs`, `requirements.txt`, `pyproject.toml`, and `README.md`
- pyproject project name `ares-ai`
- pyproject version `0.6.6`
- pyproject declares optional `vllm == 0.4.1`
- pyproject script `ares-cli`
- pyproject dependencies include LLM/evaluation packages such as OpenAI, Anthropic, datasets, evaluate, transformers, torch, sentence-transformers, scikit-learn, FastAPI, and vLLM as optional metadata.
- pyproject classifiers include Python 3.9, 3.10, and 3.11; it also has a stale MIT classifier despite repository license metadata and license file reporting Apache 2.0.
- Homepage returned homepage HTTP/2 200, `content-type: text/html; charset=utf-8`, `content-length: 36405`, `last-modified: Fri, 29 May 2026 13:44:45 GMT`, and Vercel cache headers.
- GitHub releases API returned no releases returned.
- GitHub tags API returned no tags returned.
- GitHub languages API reports Python-only source.
- README/source-review labels include Retrieval-Augmented Generation, context relevance, answer faithfulness, answer relevance, synthetic data, fine-tuned classifiers, Prediction-Powered Inference, confidence interval, vLLM, datasets, checkpoints, unlabeled/labeled evaluation sets, few-shot examples, and LLM-judge evaluation.

The source is not a reason to add an ARES evaluator, import RAG datasets, copy checkpoints, run upstream examples, or claim parity with ARES. AMC can reference this source only as context attached to AMC-owned canary rows and receipts.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only when AMC-owned provider-drift score deltas are computed from replayable RAG canary rows and signed evidence. |
| Shield | Relevant only when RAG failure modes, unsafe context use, hallucination/faithfulness outcomes, refusals, or invalid actions are measured in AMC-owned evidence. |
| Enforce | No runtime enforcement change; provider-drift CI/lifecycle gates already fail closed through the existing provider-drift primitive. |
| Vault | No secrets, dataset storage, privacy, or retention change. |
| Watch | Relevant when provider/version changes produce Watch alerts or documented waivers tied to RAG behavior drift. |
| Fleet | Contextual only for RAG-enabled agents; no orchestration or RAG evaluator subsystem was added. |
| Passport | No external proof-token change. |
| Comply | No compliance mapping change. |

## Product closure

No product code change was needed. GAP-1027 is closed by documenting the relevance boundary and adding regression coverage that proves:

- existing `runProviderDriftBenchmark` can represent RAG provider-drift canaries with source refs attached to AMC-owned evidence;
- `buildProviderDriftEvalPack`, `buildProviderDriftWatchAlerts`, and `buildProviderDriftCiGate` preserve replayable receipts, Watch alert behavior, and fail-closed CI behavior;
- GitHub repository metadata, README labels, license facts, default branch, commit SHA, package metadata, homepage headers, arXiv link, datasets, checkpoints, fine-tuned classifiers, Prediction-Powered Inference, confidence interval labels, vLLM labels, RAG evaluation labels, or source identity cannot replace AMC-owned signed drift evidence.

## Fail-closed rule

The following evidence is metadata-only and must fail closed if it is used without AMC-owned provider-drift proof:

- GitHub repository URL/API response, stars, forks, watchers, issues, license, default branch, commit SHA, empty release/tag metadata, language mix, repository tree, README, pyproject, package dependencies, homepage headers, arXiv link, RAG labels, context relevance labels, answer faithfulness labels, answer relevance labels, datasets, checkpoints, synthetic data labels, classifier labels, PPI labels, confidence interval labels, LLM-judge labels, vLLM labels, local backlog text, or source identity.

A passing AMC provider-drift claim must include provider version, canary results, drift statistic, alert or waiver, replayable eval-pack rows, row hashes, signed evidence refs, evaluator config hash, generated test data hash, observability trace export, metric report, thresholds, and CI/lifecycle gate outcome.

## No-bloat boundary

AMC did not add an ARES runner, RAG evaluator clone, repository importer, package dependency, dataset downloader, checkpoint loader, PPI implementation, classifier trainer, synthetic query generator, LLM judge wrapper, vLLM bridge, arXiv importer, docs mirror, API route, CLI command, Studio panel, Watch panel, source-specific provider-drift module, copied README prose, copied docs prose, copied benchmark data, copied datasets, copied prompts, copied examples, copied checkpoints, copied configs, copied results, copied screenshots, copied source code, or copied model outputs.

External sources remain source-review signals only. AMC’s product primitive remains generic provider-drift evidence over Score/Shield/Watch.

## Verification

- `gh repo view stanford-futuredata/ARES --json nameWithOwner,description,stargazerCount,forkCount,watchers,primaryLanguage,repositoryTopics,licenseInfo,defaultBranchRef,pushedAt,updatedAt,createdAt,homepageUrl,url,isArchived,isFork,isPrivate` passed.
- `curl -sS https://api.github.com/repos/stanford-futuredata/ARES | jq ...` passed.
- `curl -sS https://api.github.com/repos/stanford-futuredata/ARES/readme | jq ...` passed.
- `curl -sS 'https://api.github.com/repos/stanford-futuredata/ARES/contents?ref=main' | jq ...` passed.
- `curl -sS https://api.github.com/repos/stanford-futuredata/ARES/branches/main | jq ...` passed.
- `curl -sS 'https://api.github.com/repos/stanford-futuredata/ARES/releases?per_page=5' | jq ...` passed and returned no release rows.
- `curl -sS 'https://api.github.com/repos/stanford-futuredata/ARES/tags?per_page=10' | jq ...` passed and returned no tag rows.
- `curl -sS 'https://api.github.com/repos/stanford-futuredata/ARES/languages' | jq` passed.
- `curl -sS https://raw.githubusercontent.com/stanford-futuredata/ARES/main/README.md | rg ...` passed.
- `curl -sS https://raw.githubusercontent.com/stanford-futuredata/ARES/main/pyproject.toml | sed -n '1,120p'` passed.
- `curl -sS https://raw.githubusercontent.com/stanford-futuredata/ARES/main/LICENSE | sed -n '1,12p'` passed.
- `curl -sSIL https://ares-ai.vercel.app/ | sed -n '1,80p'` passed.
- TDD expected failure before doc creation passed as expected: missing source-review doc was the only failing condition, while 3 provider-drift primitive tests passed.
- `npx vitest run tests/gap1027AresProviderDriftBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- `npx vitest run tests/gap1025ThinkAugmentedFunctionCallingProviderDriftBoundary.test.ts tests/gap1027AresProviderDriftBoundary.test.ts --reporter=dot` passed, 2 files / 8 tests.
- `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Narrow token scan over `src/benchmarks/providerDriftBenchmark.ts`, `src/watch/providerDriftAlerts.ts`, and `src/api/benchmarkRouter.ts` found no GAP-1027 ARES identifiers.
- `npm run typecheck` passed.
- `npm test -- --reporter=dot` passed, 874 files / 7,482 tests.
