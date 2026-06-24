# GAP-1034 - AgentLab metric-validity boundary

- Gap: `GAP-1034`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: `ServiceNow/AgentLab`
- Retrieval: live GitHub repository metadata, GitHub REST repository/default-branch/contents/readme/releases/tags/languages APIs, raw README, raw `pyproject.toml`, raw license, ReadTheDocs headers, PyPI project/JSON metadata, Hugging Face leaderboard headers, arXiv page/API headers for the BrowserGym ecosystem paper, and local backlog metadata fetched on 2026-06-24
- Status: Done

## Relevance decision

`ServiceNow/AgentLab` is relevant to AMC as source-review context for metric validity and reliability checks around web-agent evaluation. It maps to AMC's existing Score/Shield/Watch metric-validity primitive because AMC already requires validation table, confidence interval, sample size, metric owner, signed evidence rows, construct-validity proof, reliability checks, outcome-alignment proof, replayable eval-pack rows, row hashes, and CI/lifecycle gates before a metric-validity claim can pass.

Live source metadata verified:

- GitHub repository: `https://github.com/ServiceNow/AgentLab`
- GitHub API: `https://api.github.com/repos/ServiceNow/AgentLab`
- README API: `https://api.github.com/repos/ServiceNow/AgentLab/readme`
- README: `https://raw.githubusercontent.com/ServiceNow/AgentLab/main/README.md`
- License: `https://raw.githubusercontent.com/ServiceNow/AgentLab/main/LICENSE`
- PyProject: `https://raw.githubusercontent.com/ServiceNow/AgentLab/main/pyproject.toml`
- ReadTheDocs: `https://agentlab.readthedocs.io/`
- PyPI project: `https://pypi.org/project/agentlab/`
- PyPI JSON: `https://pypi.org/pypi/agentlab/json`
- BrowserGym leaderboard: `https://huggingface.co/spaces/ServiceNow/browsergym-leaderboard`
- BrowserGym ecosystem paper: `https://arxiv.org/abs/2412.05467`
- arXiv API: `https://export.arxiv.org/api/query?id_list=2412.05467`
- Repository full name: `ServiceNow/AgentLab`
- GitHub description: `AgentLab: An open-source framework for developing, testing, and benchmarking web agents on diverse tasks, designed for scalability and reproducibility.`
- Public, non-fork, non-archived repository.
- GitHub license API returned `NOASSERTION`; license file says `Apache License, Version 2.0`; `pyproject.toml` and PyPI report `Apache-2.0`
- primary language `Python`
- Stars `591`
- Forks `116`
- Watchers `5`
- open issues `34`
- Topics include `agent`, `agents`, `benchmark`, `evaluation-framework`, `lab`, `llm`, `llm-agents`, `prompting`, and `web-agents`
- Created `2024-05-21T17:17:20Z`, pushed `2026-03-17T19:43:32Z`, updated `2026-06-22T06:35:48Z`
- default branch `main`; protected `true`; default branch commit `cbc35a9bc0facaf731bc858c5825edbe757c719f`
- README sha `40611b4dce6fc79dffeca7684110a54f7d574046`, size 17286
- GitHub languages API reports Python, Jupyter Notebook, HTML, Makefile, and Shell
- Top-level repository shape includes `.github`, `.readthedocs.yaml`, `LICENSE`, `Makefile`, `README.md`, `docs`, `experiments`, `main.py`, `pyproject.toml`, `pytest.ini`, `reproducibility_journal.csv`, `src`, `tests`, `tutorials`, and `uv.lock`
- Latest releases include `v0.4.2`, `v0.4.1`, `v0.4.0`, `v0.3.2`, and `v0.3.2.dev9`
- Latest tags include `v0.4.2`, `v0.4.1`, `v0.4.1rc2`, `v0.4.1rc1`, `v0.4.1.dev2`, `v0.4.1.dev1`, `v0.4.1.dev0`, `v0.4.0`, `v0.4.0.dev6`, and `v0.4.0.dev5`
- `pyproject.toml` package name `agentlab`
- PyPI version `0.4.2`
- `pyproject.toml` requires-python `>=3.11,<3.13`; PyPI reports `<3.13,>=3.11`
- Dependency labels include `browsergym>=0.7.1`, `openai>=1.7,<2`, `anthropic>=0.62.0`, `litellm>=1.75.3`, `ray[default]`, `gradio>=5.5`, `pydantic`, `dask`, `distributed`, `pandas`, `torch>=2.2.2`, `gymnasium>=0.27`, and `python-dotenv>=1.1.1`
- PyPI JSON reports 27 releases and latest files `agentlab-0.4.2-py3-none-any.whl` and `agentlab-0.4.2.tar.gz`
- ReadTheDocs returned HTTP/2 302 to `/en/latest/`, then HTTP/2 200 for the latest documentation page
- Hugging Face BrowserGym leaderboard returned HTTP/2 200
- README/source-review labels include WebArena, WebArena-Verified, WorkArena, WebLinx, VisualWebArena, AssistantBench, MiniWoB, OSWorld, TimeWarp, reproducibility_journal.csv, AgentXray, Unified LeaderBoard, BrowserGym, large-scale parallel agent experiments, experiment result inspection, reproducibility features, trace visualization, and leaderboard upload workflows
- README benchmark table labels include task/template counts 812, 341, 31586, 910, 214, 125, 369, and 1386
- Authenticated GitHub contents reads verified `docs/source` entries `Makefile`, `conf.py`, `index.rst`, `make.bat`, and `requirements.txt`
- Authenticated GitHub contents reads verified `src/agentlab` entries `__init__.py`, `agents`, `analyze`, `benchmarks`, `experiments`, `llm`, `ui_assistant.py`, and `utils`
- Authenticated GitHub contents reads verified `src/agentlab/analyze` entries including `agent_xray.py`, `inspect_results.ipynb`, `inspect_results.py`, `episode_to_html.py`, and `tapes.py`
- Authenticated GitHub contents reads verified `src/agentlab/benchmarks` entries including `abstract_env.py`, `gaia.py`, `multitool_gym.py`, `osworld.md`, `osworld.py`, and `setup_benchmark.py`
- BrowserGym ecosystem arXiv page returned HTTP/2 200 with `content-length: 51033` and `last-modified: Mon, 03 Mar 2025 02:01:25 GMT`
- arXiv API reports title `The BrowserGym Ecosystem for Web Agent Research`, categories `cs.LG`, `cs.AI`, and `cs.SE`, published `2024-12-06T23:43:59Z`, and updated `2025-02-28T16:02:27Z`

The source is not a reason to add an AgentLab runner, BrowserGym wrapper, web-agent runtime, benchmark runner, task adapter, leaderboard mirror, package dependency, PyPI importer, ReadTheDocs mirror, arXiv importer, trace visualizer, experiment analyzer, API route, CLI command, Studio panel, Watch panel, or source-specific metric-validity module. AMC can reference this source only as context attached to AMC-owned metric-validity receipts.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only when AMC-owned metric-validity rows provide validation table, sample size, confidence interval, metric owner, signed evidence, construct-validity proof, and outcome-alignment proof. |
| Shield | Relevant only when prompt-injection, unsafe-action, refusal, invalid-action, or web-agent safety metrics are captured in AMC-owned validation evidence. |
| Enforce | No runtime enforcement change; metric-validity CI/lifecycle gates already fail closed through the existing primitive. |
| Vault | No secrets, dataset storage, privacy, or retention change. |
| Watch | Relevant only when metric drift or validity degradation emits Watch evidence from AMC-owned receipts. |
| Fleet | Contextual only for web-agent benchmark coverage; no agent/runtime orchestration subsystem was added. |
| Passport | No external proof-token change. |
| Comply | No compliance mapping change. |

## Product closure

No product code change was needed. GAP-1034 is closed by documenting the relevance boundary and adding regression coverage that proves:

- existing `buildMetricValidationReport` can represent AgentLab-style web-agent benchmark context only when AMC-owned validation rows are present;
- validation table, confidence interval, sample size, metric owner, construct-validity evidence, reliability checks, signed evidence refs, row hashes, outcome alignment, replayable eval-pack rows, and CI/lifecycle gates are preserved;
- GitHub repository metadata, README labels, release/tag labels, pyproject labels, dependency labels, ReadTheDocs headers, PyPI metadata, Hugging Face leaderboard headers, arXiv metadata, benchmark names, task counts, reproducibility labels, result-inspection labels, leaderboard labels, local backlog text, or source identity cannot replace AMC-owned metric-validity evidence.

## Fail-closed rule

The following evidence is metadata-only and must fail closed if it is used without AMC-owned metric-validity proof:

- GitHub repository URL/API response, stars, forks, watchers, issues, topics, license metadata, default branch, commit SHA, release/tag labels, README, pyproject, dependency labels, ReadTheDocs headers, PyPI metadata, leaderboard headers, arXiv metadata, benchmark names, task counts, reproducibility labels, trace-visualization labels, result-analysis labels, tutorial names, local backlog text, or source identity.

A passing AMC metric-validity claim must include validation table, confidence interval, sample size, metric owner, signed evidence rows, construct-validity proof, reliability checks, outcome-alignment proof, replayable eval-pack rows, row hashes, source refs, and CI/lifecycle gate outcome.

## No-bloat boundary

AMC did not add an AgentLab runner, BrowserGym wrapper, web-agent runtime, benchmark runner, task adapter, experiment launcher, Ray backend, leaderboard mirror, package dependency, PyPI importer, ReadTheDocs mirror, arXiv importer, Hugging Face integration, trace visualizer, AgentXray clone, experiment analyzer, reproducibility-journal importer, dataset importer, API route, CLI command, Studio panel, Watch panel, source-specific metric-validity module, copied README prose, copied docs prose, copied benchmark rows, copied datasets, copied prompts, copied examples, copied configs, copied notebooks, copied result tables, copied source code, copied model outputs, copied screenshots, or copied generated state.

External sources remain source-review signals only. AMC's product primitive remains generic metric-validity evidence over Score/Shield/Watch.

## Verification

- `gh repo view ServiceNow/AgentLab --json nameWithOwner,description,stargazerCount,forkCount,watchers,primaryLanguage,repositoryTopics,licenseInfo,defaultBranchRef,pushedAt,updatedAt,createdAt,homepageUrl,url,isArchived,isFork,isPrivate` passed.
- `curl -sS https://api.github.com/repos/ServiceNow/AgentLab | jq ...` passed.
- `curl -sSIL https://github.com/ServiceNow/AgentLab | sed -n '1,80p'` passed.
- `curl -sS 'https://api.github.com/search/repositories?q=repo:ServiceNow/AgentLab' | jq ...` passed.
- `curl -sS https://api.github.com/repos/ServiceNow/AgentLab/readme | jq ...` passed.
- `curl -sS 'https://api.github.com/repos/ServiceNow/AgentLab/contents?ref=main' | jq ...` passed.
- `curl -sS https://api.github.com/repos/ServiceNow/AgentLab/branches/main | jq ...` passed.
- `curl -sS 'https://api.github.com/repos/ServiceNow/AgentLab/languages' | jq` passed.
- `curl -sS 'https://api.github.com/repos/ServiceNow/AgentLab/releases?per_page=5' | jq ...` passed.
- `curl -sS 'https://api.github.com/repos/ServiceNow/AgentLab/tags?per_page=10' | jq ...` passed.
- `curl -sS https://raw.githubusercontent.com/ServiceNow/AgentLab/main/LICENSE | sed -n '1,36p'` passed.
- `curl -sS https://raw.githubusercontent.com/ServiceNow/AgentLab/main/pyproject.toml | sed -n '1,220p'` passed.
- `curl -sS https://raw.githubusercontent.com/ServiceNow/AgentLab/main/README.md | rg ...` passed.
- `curl -sS 'https://api.github.com/repos/ServiceNow/AgentLab/contents/docs?ref=main' | jq ...` passed.
- `curl -sS 'https://api.github.com/repos/ServiceNow/AgentLab/contents/experiments?ref=main' | jq ...` passed.
- `curl -sS https://raw.githubusercontent.com/ServiceNow/AgentLab/main/README.md | sed -n '1,70p'` passed.
- `curl -sS https://raw.githubusercontent.com/ServiceNow/AgentLab/main/.readthedocs.yaml | sed -n '1,120p'` passed.
- `curl -sSIL https://agentlab.readthedocs.io/ | sed -n '1,80p'` passed.
- `curl -sSIL https://arxiv.org/abs/2412.05467 | sed -n '1,80p'` passed.
- `curl -sS 'https://export.arxiv.org/api/query?id_list=2412.05467' | rg ...` passed.
- `curl -sSIL https://pypi.org/project/agentlab/ | sed -n '1,80p'` passed.
- `curl -sS https://pypi.org/pypi/agentlab/json | jq ...` passed.
- `curl -sS 'https://api.github.com/repos/ServiceNow/AgentLab/contents/tutorials?ref=main' | jq ...` passed.
- `curl -sS 'https://api.github.com/repos/ServiceNow/AgentLab/contents/tests?ref=main' | jq ...` passed.
- An unauthenticated contents request for `src/agentlab` hit a GitHub API rate limit; authenticated `gh api` follow-up reads were used for remaining repository tree checks.
- `gh api 'repos/ServiceNow/AgentLab/contents/src/agentlab?ref=main' --jq '.[].name'` passed.
- `gh api 'repos/ServiceNow/AgentLab/contents/docs/source?ref=main' --jq '.[].name'` passed.
- `gh api 'repos/ServiceNow/AgentLab/contents/src/agentlab/analyze?ref=main' --jq '.[].name'` passed.
- `gh api 'repos/ServiceNow/AgentLab/contents/src/agentlab/benchmarks?ref=main' --jq '.[].name'` passed.
- `curl -sSIL https://huggingface.co/spaces/ServiceNow/browsergym-leaderboard | sed -n '1,80p'` passed.
- TDD expected failure before doc creation passed as expected: missing source-review doc was the only failing condition, while 3 metric-validity primitive tests passed.
- `npx vitest run tests/gap1034AgentLabMetricValidityBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- `npx vitest run tests/gap1034AgentLabMetricValidityBoundary.test.ts tests/gap1031MobileGymMetricValidityBoundary.test.ts --reporter=dot` passed, 2 files / 8 tests.
- `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Narrow token scan over metric-validity implementation files found no GAP-1034 AgentLab identifiers.
- `npm run typecheck` passed.
- `npm test -- --reporter=dot` passed, 881 files / 7,510 tests.
