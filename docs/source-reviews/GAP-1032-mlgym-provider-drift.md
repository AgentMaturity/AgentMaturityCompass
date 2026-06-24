# GAP-1032 - MLGym provider-drift boundary

- Gap: `GAP-1032`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: `facebookresearch/MLGym`
- Retrieval: live GitHub repository metadata, GitHub REST repository/default-branch/contents/readme/releases/tags/languages APIs, raw README, raw `pyproject.toml`, raw license, docs/data/results README files, package init file, website headers, arXiv page/API/PDF headers, and local backlog metadata fetched on 2026-06-24
- Status: Done

## Relevance decision

`facebookresearch/MLGym` is relevant to AMC as provider/model drift source-review context for AI research-agent benchmark canaries. The repository and paper describe a benchmark and framework for evaluating research agents on machine-learning tasks, including model comparisons, trajectories, task configs, containers, and experiment/result artifacts. That maps to AMC's existing Score/Shield/Watch provider-drift primitive because AMC already requires provider version, canary results, drift statistic, signed evidence rows, replayable eval-pack rows, observability evidence, thresholds, and Watch alert or waiver before a provider-drift claim can pass.

Live source metadata verified:

- GitHub repository: `https://github.com/facebookresearch/MLGym`
- GitHub API: `https://api.github.com/repos/facebookresearch/MLGym`
- README API: `https://api.github.com/repos/facebookresearch/MLGym/readme`
- README: `https://raw.githubusercontent.com/facebookresearch/MLGym/main/README.md`
- License: `https://raw.githubusercontent.com/facebookresearch/MLGym/main/LICENSE`
- PyProject: `https://raw.githubusercontent.com/facebookresearch/MLGym/main/pyproject.toml`
- Website: `https://sites.google.com/view/mlgym`
- arXiv: `https://arxiv.org/abs/2502.14499`
- arXiv API: `https://export.arxiv.org/api/query?id_list=2502.14499`
- arXiv PDF: `https://arxiv.org/pdf/2502.14499`
- Repository full name: `facebookresearch/MLGym`
- GitHub description: `MLGym A New Framework and Benchmark for Advancing AI Research Agents`
- Public, non-fork, non-archived repository.
- GitHub license API returned `NOASSERTION`; license file begins with `Attribution-NonCommercial 4.0 International`.
- primary language `Python`
- Stars `607`
- Forks `59`
- Watchers `11`
- open issues `9`
- Created `2025-02-18T18:26:47Z`, pushed `2025-08-10T20:00:53Z`, updated `2026-06-22T11:26:21Z`
- default branch `main`; protected `false`; default branch commit `9d40c1b5035202018cd7091fb4e83a9c68b377c0`
- README sha `f441612f8ba9de5809dfd838bbba5ae60ce47082`, size 8920
- GitHub languages API reports Python, Shell, and Dockerfile
- Releases API: no releases returned
- Tags API: no tags returned
- Top-level repository shape includes `.github`, `CHANGELOG.md`, `CLAUDE.md`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `LICENSE`, `MAINTENANCE.md`, `README.md`, `assets`, `configs`, `data`, `demo`, `demonstrations`, `dockerfiles`, `docs`, `mlgym`, `notebooks`, `pyproject.toml`, `results`, `run.py`, `run_replay.py`, `scripts`, `tests`, `tools`, `trajectories`, and `uv.lock`
- `configs` contents include `agents`, `datasets`, and `tasks`
- `data` contents include `3SATTime`, `battleOfSexes`, `bertMNLI`, `blotto`, `imageCaptioningCOCO`, `imageClassificationCifar10`, `imageClassificationFMnist`, `languageModelingFineWeb`, `prisonersDilemma`, `regressionKaggleHousePrice`, `rlBreakoutMinAtar`, `rlMetaMazeMisc`, `rlMountainCarContinuous`, `rlMountainCarContinuousReinforce`, and `titanic`
- `mlgym` package contents include `agent`, `backend`, `environment`, `evaluation`, `tools`, `types.py`, and `utils`
- `results` contents include `README.md` and `tables`
- `trajectories` contents include `mlgym_bench_v0`
- `demo` contents include `demo.py`, `trajectory_visualizer.py`, and `vars.py`; README labels this as a trajectory visualizer
- `pyproject.toml` package name `mlgym`
- `mlgym/__init__.py` package version `0.1.1`
- `pyproject.toml` requires-python `>=3.11`
- `pyproject.toml` dependency labels include `gymnasium`, `numpy`, `openai>=1.0`, `pandas`, `huggingface_hub`, `datasets`, `docker`, `litellm`, `streamlit`, `pymupdf`, `pymupdf4llm`, `matplotlib`, `seaborn`, and `gputil`
- README/source-review labels include MLGym-Bench, 13 diverse and open-ended AI research tasks, machine-learning task environment, AI research agents, reinforcement-learning algorithms, training agents, model comparisons, containers, task configs, trajectories, and an experimental framework that is under heavy development
- Website returned website HTTP/2 200, `content-type: text/html; charset=utf-8`, and Google Sites headers
- arXiv page returned HTTP/2 200, `content-type: text/html; charset=utf-8`, `content-length: 49304`, and `last-modified: Fri, 21 Feb 2025 01:41:35 GMT`
- arXiv PDF returned HTTP/2 200, `content-type: application/pdf`, `content-length: 1811246`, `filename="2502.14499v1.pdf"`, and `last-modified: Fri, 21 Feb 2025 01:42:15 GMT`
- arXiv API reports title `MLGym: A New Framework and Benchmark for Advancing AI Research Agents`, categories `cs.CL`, `cs.AI`, and `cs.LG`, published `2025-02-20T12:28:23Z`, and updated `2025-02-20T12:28:23Z`

The source is not a reason to add an MLGym runner, AI research-agent runtime, benchmark clone, model-comparison pipeline, dataset importer, trajectory visualizer, container runner, environment wrapper, task adapter, training loop, or package dependency. AMC can reference this source only as context attached to AMC-owned provider-drift receipts.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only when AMC-owned canary rows compare provider/model versions against benchmark-backed scoring evidence and regression thresholds. |
| Shield | Relevant only when refusal, invalid-action, guardrail, or unsafe research-action drift is captured in AMC-owned signed evidence. |
| Enforce | No runtime enforcement change; CI/lifecycle provider-drift gates already fail closed through the existing primitive. |
| Vault | No secrets, dataset storage, privacy, or retention change. |
| Watch | Relevant only when provider-drift results emit Watch alerts or documented waivers from AMC-owned evidence. |
| Fleet | Contextual only for research-agent benchmark coverage; no orchestration/runtime subsystem was added. |
| Passport | No external proof-token change. |
| Comply | No compliance mapping change. |

## Product closure

No product code change was needed. GAP-1032 is closed by documenting the relevance boundary and adding regression coverage that proves:

- existing provider-drift primitives can represent MLGym-style research-agent canaries only through AMC-owned signed rows;
- provider version, canary results, drift statistic, evaluator config, generated test data hash, verdict aggregation, dashboard artifact, pipeline run, experiment run, observability project, trace export, metric report, replayable eval-pack row hashes, source refs, thresholds, and CI/lifecycle gate outcomes are preserved;
- GitHub repository metadata, README labels, pyproject labels, license metadata, website headers, arXiv metadata, package names, task folder names, dependency labels, trajectory/demo labels, result-folder labels, model-comparison labels, local backlog text, or source identity cannot replace AMC-owned provider-drift proof.

## Fail-closed rule

The following evidence is metadata-only and must fail closed if it is used without AMC-owned provider-drift proof:

- GitHub repository URL/API response, stars, forks, watchers, issues, license metadata, default branch, commit SHA, README, pyproject, package init, dependency labels, website headers, arXiv page/API/PDF metadata, repository tree, docs/data/results README labels, task folder names, trajectory folder names, demo labels, container labels, model-comparison labels, local backlog text, or source identity.

A passing AMC provider-drift claim must include provider version, baseline and candidate canary rows, sample size, trajectory count, drift statistic, signed evidence refs, evaluator/framework evidence, observability/pipeline evidence, replayable eval-pack rows, row hashes, thresholds, and Watch alert or waiver.

## No-bloat boundary

AMC did not add an MLGym runner, research-agent benchmark clone, Gym environment wrapper, task adapter, container runner, Docker/Podman integration, model-comparison runner, leaderboard clone, dataset importer, data downloader, trajectory visualizer, Streamlit UI, training loop, RL algorithm, package dependency, arXiv importer, website mirror, API route, CLI command, Studio panel, Watch panel, source-specific provider-drift module, copied README prose, copied paper prose, copied benchmark rows, copied datasets, copied prompts, copied examples, copied configs, copied trajectories, copied notebooks, copied result tables, copied source code, copied model outputs, or copied generated state.

External sources remain source-review signals only. AMC's product primitive remains generic provider/model drift evidence over Score/Shield/Watch.

## Verification

- `gh repo view facebookresearch/MLGym --json nameWithOwner,description,stargazerCount,forkCount,watchers,primaryLanguage,repositoryTopics,licenseInfo,defaultBranchRef,pushedAt,updatedAt,createdAt,homepageUrl,url,isArchived,isFork,isPrivate` passed.
- `curl -sS https://api.github.com/repos/facebookresearch/MLGym | jq ...` passed.
- `curl -sSIL https://github.com/facebookresearch/MLGym | sed -n '1,80p'` passed.
- `curl -sS 'https://api.github.com/search/repositories?q=repo:facebookresearch/MLGym' | jq ...` passed.
- `curl -sS https://api.github.com/repos/facebookresearch/MLGym/readme | jq ...` passed.
- `curl -sS 'https://api.github.com/repos/facebookresearch/MLGym/contents?ref=main' | jq -r '.[].name'` passed.
- `curl -sS https://api.github.com/repos/facebookresearch/MLGym/branches/main | jq ...` passed.
- `curl -sS 'https://api.github.com/repos/facebookresearch/MLGym/languages' | jq` passed.
- `curl -sS 'https://api.github.com/repos/facebookresearch/MLGym/releases?per_page=5' | jq ...` passed.
- `curl -sS 'https://api.github.com/repos/facebookresearch/MLGym/tags?per_page=10' | jq ...` passed.
- `curl -sS https://raw.githubusercontent.com/facebookresearch/MLGym/main/LICENSE | sed -n '1,40p'` passed.
- `curl -sS https://raw.githubusercontent.com/facebookresearch/MLGym/main/pyproject.toml | sed -n '1,180p'` passed.
- `curl -sS https://raw.githubusercontent.com/facebookresearch/MLGym/main/README.md | rg ...` passed.
- `curl -sS 'https://api.github.com/repos/facebookresearch/MLGym/contents/docs?ref=main' | jq ...` passed.
- `curl -sS 'https://api.github.com/repos/facebookresearch/MLGym/contents/configs?ref=main' | jq ...` passed.
- `curl -sS 'https://api.github.com/repos/facebookresearch/MLGym/contents/data?ref=main' | jq ...` passed.
- `curl -sSIL https://sites.google.com/view/mlgym | sed -n '1,100p'` passed.
- `curl -sSIL https://arxiv.org/abs/2502.14499 | sed -n '1,80p'` passed.
- `curl -sS 'https://export.arxiv.org/api/query?id_list=2502.14499' | rg ...` passed.
- `curl -sSIL https://arxiv.org/pdf/2502.14499 | sed -n '1,80p'` passed.
- `curl -sS 'https://api.github.com/repos/facebookresearch/MLGym/contents/mlgym?ref=main' | jq ...` passed.
- `curl -sS 'https://api.github.com/repos/facebookresearch/MLGym/contents/results?ref=main' | jq ...` passed.
- `curl -sS https://raw.githubusercontent.com/facebookresearch/MLGym/main/docs/README.md | sed -n '1,220p'` passed.
- `curl -sS https://raw.githubusercontent.com/facebookresearch/MLGym/main/results/README.md | sed -n '1,220p'` passed.
- `curl -sS https://raw.githubusercontent.com/facebookresearch/MLGym/main/data/README.md | sed -n '1,220p'` passed.
- `curl -sS https://raw.githubusercontent.com/facebookresearch/MLGym/main/mlgym/__init__.py | sed -n '1,80p'` passed.
- `curl -sS 'https://api.github.com/repos/facebookresearch/MLGym/contents/trajectories?ref=main' | jq ...` passed.
- `curl -sS 'https://api.github.com/repos/facebookresearch/MLGym/contents/demo?ref=main' | jq ...` passed.
- TDD expected failure before doc creation passed as expected: missing source-review doc was the only failing condition, while 3 provider-drift primitive tests passed.
- `npx vitest run tests/gap1032MlgymProviderDriftBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- `npx vitest run tests/gap1032MlgymProviderDriftBoundary.test.ts tests/gap1030OpenJudgeProviderDriftBoundary.test.ts --reporter=dot` passed, 2 files / 8 tests.
- `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Narrow token scan over provider-drift implementation files found no GAP-1032 MLGym identifiers.
- `npm run typecheck` passed.
- `npm test -- --reporter=dot` passed, 879 files / 7,502 tests.
