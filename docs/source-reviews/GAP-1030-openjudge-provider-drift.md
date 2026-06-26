# GAP-1030 - OpenJudge provider-drift boundary

- Gap: `GAP-1030`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: `agentscope-ai/OpenJudge`
- Retrieval: live GitHub repository metadata, GitHub REST repository/default-branch/contents/readme/releases/tags/languages APIs, raw README, raw `pyproject.toml`, raw license, homepage headers, documentation-site headers, and local backlog metadata fetched on 2026-06-24
- Status: Done

## Relevance decision

`agentscope-ai/OpenJudge` is relevant to AMC as source-review context for provider/model drift canaries that evaluate agent quality, grader stability, reward signal stability, trajectory quality, tool use, memory, reflection, relevance, hallucination, latency, and cost. It maps to the existing AMC Score/Shield/Watch provider-drift primitive because AMC already requires provider version, canary results, signed evidence refs, drift statistic, replayable eval-pack rows, row hashes, observability evidence, and Watch alert or waiver before any provider-drift claim can pass.

Live source metadata verified:

- GitHub repository: `https://github.com/agentscope-ai/OpenJudge`
- GitHub API: `https://api.github.com/repos/agentscope-ai/OpenJudge`
- README API: `https://api.github.com/repos/agentscope-ai/OpenJudge/readme`
- README: `https://raw.githubusercontent.com/agentscope-ai/OpenJudge/main/README.md`
- License: `https://raw.githubusercontent.com/agentscope-ai/OpenJudge/main/LICENSE`
- Pyproject: `https://raw.githubusercontent.com/agentscope-ai/OpenJudge/main/pyproject.toml`
- Homepage: `https://openjudge.me/`
- Documentation: `https://agentscope-ai.github.io/OpenJudge/`
- Repository full name: `agentscope-ai/OpenJudge`
- GitHub description: OpenJudge: A Unified Framework for Holistic Evaluation and Quality Rewards
- Public, non-fork, non-archived repository.
- License metadata and license file: `Apache License 2.0`
- primary language `Python`
- Stars `683`
- Forks `57`
- Watchers `4`
- open issues `12`
- Topics include `agent`, `agent-skills`, `ai-agent`, `alignment`, `evaluation`, `grader`, `llm`, `reward`, `reward-model`, `rlhf`, `skill-md`, and `skills`
- Created `2025-07-08T06:17:01Z`, pushed `2026-06-17T09:40:18Z`, updated `2026-06-24T16:43:50Z`
- default branch `main`; protected `true`; default branch commit `344e45d21a8f8ab25d8c6d2035c503ba24e5616a`
- README sha `029da8dfc4641c12935783f2684099a5d6ddcbf9`, size 22573
- GitHub languages API reports Python and Shell
- Top-level repository shape includes `.github`, `LICENSE`, `README.md`, `README_zh.md`, `cookbooks`, `docker`, `docs`, `experiments`, `mkdocs.yml`, `openjudge`, `pyproject.toml`, `pytest.ini`, `skills`, `tests`, and `ui`
- `openjudge` package shape includes `agentic`, `analyzer`, `evaluation_strategy`, `generator`, `grader_benchmark`, `graders`, `models`, `runner`, and `utils`
- Docs contents include `applications`, `building_graders`, `built_in_graders`, `community`, `get_started`, `integrations`, `running_graders`, and `validating_graders`
- Releases returned `v0.2.2` and `v0.2.1`; tags returned matching `v0.2.2` and `v0.2.1` tag commits
- `pyproject.toml` package name `py-openjudge`
- `pyproject.toml` license `Apache-2.0`
- `pyproject.toml` requires-python `>=3.10`
- `pyproject.toml` dependency labels include `openai>=2.8.0`, `python-Levenshtein>=0.20.0`, `python-dotenv`, and optional test/training stack labels such as `pytest`, `transformers`, and related extras
- Homepage returned HTTP/2 200, `server: nginx/1.29.4`, `content-type: text/html`, `content-length: 116322`, `last-modified: Wed, 17 Jun 2026 10:14:37 GMT`, and no-cache headers
- Documentation site returned HTTP/2 200 from GitHub Pages, `content-type: text/html; charset=utf-8`, `last-modified: Wed, 17 Jun 2026 09:40:50 GMT`, and `content-length: 107066`
- README/source-review labels include 50+ production-ready graders, Agent lifecycle, Memory, Reflection, Tool Use, reward signals, scenario-specific rubrics, zero-shot rubrics generation, data-driven rubrics generation, judge-model training, LangSmith, Langfuse, VERL, PawBench v1.0, 150 tasks, 9 models, 3 harnesses, benchmark datasets, PyPI package, and online grader/UI labels.

OpenJudge is not a reason to add an OpenJudge runner, grader adapter, reward-model pipeline, RLHF pipeline, PawBench importer, LangSmith/Langfuse/VERL integration, or package dependency to AMC. AMC can reference this source only as context attached to AMC-owned provider-drift canary rows and receipts.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only when AMC-owned provider-drift score deltas are computed from replayable canary rows and signed evidence. |
| Shield | Relevant only when grader, reward, tool-use, hallucination, refusal, invalid-action, or safety-oriented outcomes are captured in AMC-owned evidence. |
| Enforce | No runtime enforcement change; provider-drift CI/lifecycle gates already fail closed through the existing provider-drift primitive. |
| Vault | No secrets, dataset storage, privacy, or retention change. |
| Watch | Relevant when provider/version changes produce Watch alerts or documented waivers tied to provider-drift statistics. |
| Fleet | Contextual only for agent-quality and harness-style evaluation; no orchestration, PawBench, or OpenJudge subsystem was added. |
| Passport | No external proof-token change. |
| Comply | No compliance mapping change. |

## Product closure

No product code change was needed. GAP-1030 is closed by documenting the relevance boundary and adding regression coverage that proves:

- existing `runProviderDriftBenchmark` can represent OpenJudge-style quality/reward provider-drift canaries with source refs attached to AMC-owned evidence;
- `buildProviderDriftEvalPack`, `buildProviderDriftWatchAlerts`, and `buildProviderDriftCiGate` preserve replayable receipts, Watch alert behavior, and fail-closed CI behavior;
- GitHub repository metadata, README labels, license facts, default branch, commit SHA, release/tag labels, pyproject labels, docs/homepage headers, package/dependency labels, grader library labels, reward-model labels, RLHF labels, LangSmith/Langfuse/VERL labels, PawBench labels, benchmark labels, online UI labels, source code tree shape, local backlog text, or source identity cannot replace AMC-owned signed drift evidence.

## Fail-closed rule

The following evidence is metadata-only and must fail closed if it is used without AMC-owned provider-drift proof:

- GitHub repository URL/API response, stars, forks, watchers, issues, topics, license, default branch, commit SHA, release/tag labels, language mix, repository tree, README, pyproject, homepage headers, documentation headers, package/dependency labels, grader library labels, benchmark dataset labels, reward signal labels, judge-model labels, RLHF labels, integration labels, PawBench labels, leaderboard labels, online UI labels, local backlog text, or source identity.

A passing AMC provider-drift claim must include provider version, canary results, drift statistic, alert or waiver, replayable eval-pack rows, row hashes, signed evidence refs, evaluator config hash, generated test data hash, observability trace export, metric report, thresholds, and CI/lifecycle gate outcome.

## No-bloat boundary

AMC did not add an OpenJudge runner, grader adapter, reward-model integration, RLHF pipeline, PawBench importer, LangSmith adapter, Langfuse adapter, VERL adapter, repository importer, package dependency, grader-library mirror, benchmark-dataset downloader, online UI wrapper, py-openjudge dependency, judge-model trainer, rubric generator, custom grader builder, leaderboard clone, homepage mirror, docs mirror, API route, CLI command, Studio panel, Watch panel, source-specific provider-drift module, copied README prose, copied docs prose, copied benchmark data, copied datasets, copied prompts, copied examples, copied configs, copied results, copied screenshots, copied source code, or copied model outputs.

External sources remain source-review signals only. AMC's product primitive remains generic provider-drift evidence over Score/Shield/Watch.

## Verification

- `gh repo view agentscope-ai/OpenJudge --json nameWithOwner,description,stargazerCount,forkCount,watchers,primaryLanguage,repositoryTopics,licenseInfo,defaultBranchRef,pushedAt,updatedAt,createdAt,homepageUrl,url,isArchived,isFork,isPrivate` passed.
- `curl -sS -w '\\nHTTP_STATUS:%{http_code}\\n' https://api.github.com/repos/agentscope-ai/OpenJudge | jq ...` passed.
- `curl -sSIL https://github.com/agentscope-ai/OpenJudge | sed -n '1,100p'` passed.
- `curl -sS 'https://api.github.com/search/repositories?q=repo:agentscope-ai/OpenJudge' | jq ...` passed.
- `curl -sS https://api.github.com/repos/agentscope-ai/OpenJudge/readme | jq ...` passed.
- `curl -sS 'https://api.github.com/repos/agentscope-ai/OpenJudge/contents?ref=main' | jq ...` passed.
- `curl -sS https://api.github.com/repos/agentscope-ai/OpenJudge/branches/main | jq ...` passed.
- `curl -sS 'https://api.github.com/repos/agentscope-ai/OpenJudge/languages' | jq` passed.
- `curl -sS 'https://api.github.com/repos/agentscope-ai/OpenJudge/releases?per_page=5' | jq ...` passed.
- `curl -sS 'https://api.github.com/repos/agentscope-ai/OpenJudge/tags?per_page=10' | jq ...` passed.
- `curl -sS https://raw.githubusercontent.com/agentscope-ai/OpenJudge/main/README.md | rg ...` passed.
- `curl -sS https://raw.githubusercontent.com/agentscope-ai/OpenJudge/main/LICENSE | sed -n '1,20p'` passed.
- `curl -sS https://raw.githubusercontent.com/agentscope-ai/OpenJudge/main/pyproject.toml | rg ...` passed.
- `curl -sS 'https://api.github.com/repos/agentscope-ai/OpenJudge/contents/docs?ref=main' | jq ...` passed.
- `curl -sS 'https://api.github.com/repos/agentscope-ai/OpenJudge/contents/openjudge?ref=main' | jq ...` passed.
- `curl -sSIL https://openjudge.me/ | sed -n '1,100p'` passed.
- `curl -sSIL https://agentscope-ai.github.io/OpenJudge/ | sed -n '1,80p'` passed.
- TDD expected failure before doc creation passed as expected: missing source-review doc was the only failing condition, while 3 provider-drift primitive tests passed.
- `npx vitest run tests/gap1030OpenJudgeProviderDriftBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- `npx vitest run tests/gap1030OpenJudgeProviderDriftBoundary.test.ts tests/gap1028ClawProBenchProviderDriftBoundary.test.ts --reporter=dot` passed, 2 files / 8 tests.
- `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Narrow token scan over `src/benchmarks/providerDriftBenchmark.ts`, `src/watch/providerDriftAlerts.ts`, and `src/api/benchmarkRouter.ts` found no GAP-1030 OpenJudge identifiers.
- `npm run typecheck` passed.
- `npm test -- --reporter=dot` passed, 877 files / 7,494 tests.
