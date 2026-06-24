# GAP-1017 - WindowsAgentArena metric-validity boundary

- Gap: `GAP-1017`
- Dimension: Metric validity and reliability checks (`eval-metric-validity`)
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: GitHub repository/API for `microsoft/WindowsAgentArena`, repository API `https://api.github.com/repos/microsoft/WindowsAgentArena`, README API `https://api.github.com/repos/microsoft/WindowsAgentArena/readme`, raw README `https://raw.githubusercontent.com/microsoft/WindowsAgentArena/main/README.md`, license API `https://api.github.com/repos/microsoft/WindowsAgentArena/license`, contents API `https://api.github.com/repos/microsoft/WindowsAgentArena/contents?ref=main`, commit API `https://api.github.com/repos/microsoft/WindowsAgentArena/commits/main`, latest-release API `https://api.github.com/repos/microsoft/WindowsAgentArena/releases/latest`, requirements `https://raw.githubusercontent.com/microsoft/WindowsAgentArena/main/requirements.txt`, Docker workflow `https://raw.githubusercontent.com/microsoft/WindowsAgentArena/main/.github/workflows/publish-docker.yml`, agent-development doc `https://raw.githubusercontent.com/microsoft/WindowsAgentArena/main/docs/Develop-Agent.md`, task-development doc `https://raw.githubusercontent.com/microsoft/WindowsAgentArena/main/docs/Develop-Tasks.md`, arXiv API `https://export.arxiv.org/api/query?id_list=2409.08264`, arXiv page `https://arxiv.org/abs/2409.08264`, project site `https://microsoft.github.io/WindowsAgentArena`, blog URL `https://www.microsoft.com/applied-sciences/projects/windows-agent-arena`, and local backlog metadata.
- Retrieval: `2026-06-24` live source review through GitHub repository APIs, raw GitHub content, arXiv API, project-site headers, blog URL headers, and local backlog metadata.
- Status: Done
- Linear: `AMC-1296`

## Live source metadata

The GitHub API identifies `microsoft/WindowsAgentArena` at `https://github.com/microsoft/WindowsAgentArena` as a public, non-fork, non-archived, non-disabled Python repository with homepage `https://microsoft.github.io/WindowsAgentArena`, MIT License metadata, default branch `main`, 874 stars, 874 watchers, 95 forks, 35 open issues, size 200303, created_at `2024-07-29T15:31:40Z`, pushed_at `2026-04-13T19:58:37Z`, and updated_at `2026-06-22T03:24:19Z`.

Repository description at retrieval identifies Windows Agent Arena as a scalable OS platform for testing and benchmarking multi-modal, desktop AI agents. Topics include agentic, ai, ai-agent, ai-benchmark, ai-research, computer, computer-use, desktop-agent, and windows.

The README API reports `README.md` with README sha `d4b26caff094a182d686b33232843fafe6ac070d`, size 24513, and raw download URL `https://raw.githubusercontent.com/microsoft/WindowsAgentArena/main/README.md`. The contents API listed `.dockerignore`, `.gitattributes`, `.github`, `.gitignore`, `CODE_OF_CONDUCT.md`, `LICENSE`, `README.md`, `SECURITY.md`, `SUPPORT.md`, `docs`, `img`, `requirements.txt`, `scripts`, and `src`. The license API reports LICENSE sha `3d8b93bc7987d14c848448c089e2ae15311380d7`, size 1162, license key `mit`, license name `MIT License`, and SPDX `MIT`.

The commit API verified HEAD `6d39ed88c545a0d40a7a02e39b928e278df7332b`, commit_date `2024-11-20T11:34:21Z`, author `Francesco Bonacci`, committer `GitHub`, verified `true`, verification reason `valid`, and message `Merge pull request #48 from microsoft/msz-create-patch-1`.

The latest-release API returned release `v0.0.4` published `2024-09-28T21:06:11Z`, name `v0.0.4`, target_commitish `main`, and release URL `https://github.com/microsoft/WindowsAgentArena/releases/tag/v0.0.4`.

The requirements file reports requirements sha `6a7526a58c1543ce934c9d292a195e70160d9a09`, size 70, and dependency labels including Azure ML packages and pandas. The workflow API reports Docker workflow sha `8e593fa640a0f880dc5b4919a1db00816af9cb50`, size 1987, and a Docker Build and Push workflow using Docker Buildx and Docker Hub credentials.

The docs API reports Develop-Agent sha `b855dfc386685810a20e38ffefd746131e4876d9`, size 3571, and Develop-Tasks sha `2b7b6429092778f1b9c03ef70eacbe66a88504b8`, size 3171. The agent-development doc identifies `predict()` and `reset()` as the required agent entry points. The task-development doc describes task IDs, natural-language instructions, initial configuration, evaluator wiring, and result checks.

The arXiv API returned `http://arxiv.org/abs/2409.08264v2`, title `Windows Agent Arena: Evaluating Multi-Modal OS Agents at Scale`, published `2024-09-12T17:56:43Z`, updated `2024-09-13T20:17:13Z`, and authors Rogerio Bonatti, Dan Zhao, Francesco Bonacci, Dillon Dupont, Sara Abdali, Yinheng Li, Yadong Lu, Justin Wagle, Kazuhito Koishida, Arthur Bucker, Lawrence Jang, and Zack Hui.

The project site `https://microsoft.github.io/WindowsAgentArena` redirected to the trailing-slash URL and the project site returned HTTP 200. The Microsoft applied-sciences blog URL returned HTTP 403 during header retrieval, so it was recorded as a linked source signal only and not used as product proof.

Relevant README and docs signals include multi-modal, desktop AI agents, a Windows OS environment, Azure ML parallel benchmark runs, Windows 11 VM setup, a golden image, Docker image preparation, `show_results.py`, `show_azure.py`, agent-output folders, approximate benchmark runtime/cost notes, and BYOA development through `predict()` and `reset()`. These signals support relevance review only; they are not AMC metric-validity evidence by themselves.

No upstream code, README prose beyond short metadata facts, workflow YAML, requirements content beyond short dependency labels, docs prose beyond short metadata facts, Windows VM artifacts, golden image artifacts, benchmark tasks, evaluator functions, task JSON, prompts, configs, screenshots, audio, videos, diagrams, example agents, generated outputs, implementation details, or leaderboard data were copied into AMC.

## Relevance decision

GAP-1017 is relevant to AMC through the existing Score metric-validity receipt path, with secondary Shield and Watch relevance only when AMC claims safety or observability reliability for scored desktop-agent evaluations. WindowsAgentArena is an adjacent OS-agent benchmark source, so it helps define what AMC must require before a metric-validity claim can pass: validation table, sample size, confidence interval, metric owner, reliability checks, construct-validity mapping, outcome alignment, signed evidence refs, row hashes, source refs, regression thresholds, and CI or lifecycle gate proof.

This does not justify a WindowsAgentArena integration. Repository identity, arXiv title, README labels, Windows benchmark language, stars, forks, open issues, release tags, Docker workflow metadata, Azure ML labels, Windows 11 VM setup, golden image setup, task evaluator labels, `predict()`/`reset()` interface labels, or project-site availability cannot prove AMC maturity metric validity. A WindowsAgentArena-context claim can pass only through AMC-owned metric-validity receipts.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing metric-validation rows, validation table, sample size, confidence interval, reliability checks, outcome alignment, and metric owner. |
| Shield | Relevant only if a scored desktop-agent claim includes signed safety or misuse evidence; no WAA safety subsystem was added. |
| Enforce | Not changed. No runtime policy, guardrail, VM control, or desktop-action enforcement was added. |
| Vault | Not changed. No secret, API-key, data-residency, VM-storage, or secure-storage behavior changed. |
| Watch | Relevant only as lifecycle/regression-gate context for scored desktop-agent evaluations; no new Watch monitor was added. |
| Fleet | Not changed. No multi-agent orchestration, Azure worker fleet, or topology evidence changed. |
| Passport | Existing metric-validity receipts can feed proof bundles, but no Passport schema changed. |
| Comply | Not changed. No EU AI Act, NIST, ISO, SOC2, Windows licensing, or cloud-compliance mapping changed. |

## Product closure

No `src/score/metricValidity.ts`, `src/diagnostic/questionScoreExplainability.ts`, `src/diagnostic/runner.ts`, API, CLI, Studio, scoring code, Watch monitor, Shield detector, package dependency, VM runner, Docker runner, Azure ML runner, public methodology file, or benchmark importer changed for GAP-1017.

The focused regression exercises existing `buildMetricValidationReport` behavior with a positive WindowsAgentArena-style source-reference packet and a negative metadata-only packet. The positive path requires validation facets, process evidence, outcome alignment, signed evidence refs, source refs, row hashes, sample size, confidence interval, inter-rater agreement, test-retest stability, replayable eval pack, and CI pass. The negative path proves that WindowsAgentArena repository metadata, arXiv metadata, desktop benchmark labels, project-site availability, Docker workflow labels, agent interface labels, and source identity fail closed without AMC-owned metric-validity proof.

## Fail-closed rule

WindowsAgentArena repository metadata, GitHub stars, forks, open issues, topics, homepage, README sha, LICENSE sha, requirements sha, Docker workflow sha, Develop-Agent sha, Develop-Tasks sha, release tag, default branch, language label, arXiv title, arXiv version, project-site HTTP 200, blog URL, Windows OS environment labels, Windows 11 VM labels, golden image labels, Azure ML labels, Docker labels, `show_results.py`, `show_azure.py`, `predict()`, `reset()`, task evaluator labels, benchmark runtime/cost labels, examples, diagrams, local backlog text, or source identity cannot prove AMC metric validity.

Passing evidence requires AMC-owned validation table artifacts, confidence interval, sample size, metric owner, construct-validity mapping, reliability checks, outcome alignment, signed evidence refs, row hashes, regression thresholds, source refs, CI or lifecycle receipts, and no-copy proof.

## No-bloat boundary

No WindowsAgentArena integration, WAA adapter, Windows VM runner, QEMU runner, Docker runner, Azure ML runner, Azure Storage uploader, golden image manager, desktop-agent harness, task importer, evaluator importer, result-table parser, `show_results.py` clone, `show_azure.py` clone, Omniparser adapter, accessibility-tree adapter, OCR/Tesseract adapter, GroundingDINO adapter, Dockur adapter, OSWorld adapter, Navi agent clone, benchmark task clone, task JSON clone, config parser, API-key handler, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield detector, Score method, copied source code, copied configs, copied README prose, copied workflow YAML, copied docs prose, copied requirements content, copied task definitions, copied examples, copied generated outputs, copied images, copied audio, copied video, or source-specific subsystem was added.

WindowsAgentArena remains source-review signal only.

## Verification

- Expected-red focused test before doc: `npx vitest run tests/gap1017WindowsAgentArenaMetricValidityBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1017-windows-agent-arena-metric-validity.md` did not exist; 3 metric-validity primitive tests passed.
- Live source retrieval:
  - `curl -fsSL https://api.github.com/repos/microsoft/WindowsAgentArena`
  - `curl -fsSL https://api.github.com/repos/microsoft/WindowsAgentArena/readme`
  - `curl -fsSL https://api.github.com/repos/microsoft/WindowsAgentArena/license`
  - `curl -fsSL 'https://api.github.com/repos/microsoft/WindowsAgentArena/contents?ref=main'`
  - `curl -fsSL https://api.github.com/repos/microsoft/WindowsAgentArena/commits/main`
  - `curl -fsSL https://api.github.com/repos/microsoft/WindowsAgentArena/releases/latest`
  - `curl -fsSL https://raw.githubusercontent.com/microsoft/WindowsAgentArena/main/README.md`
  - `curl -fsSL https://raw.githubusercontent.com/microsoft/WindowsAgentArena/main/requirements.txt`
  - `curl -fsSL https://raw.githubusercontent.com/microsoft/WindowsAgentArena/main/.github/workflows/publish-docker.yml`
  - `curl -fsSL https://raw.githubusercontent.com/microsoft/WindowsAgentArena/main/docs/Develop-Agent.md`
  - `curl -fsSL https://raw.githubusercontent.com/microsoft/WindowsAgentArena/main/docs/Develop-Tasks.md`
  - `curl -fsSL 'https://export.arxiv.org/api/query?id_list=2409.08264'`
  - `curl -I -L https://microsoft.github.io/WindowsAgentArena`
  - `curl -I -L https://www.microsoft.com/applied-sciences/projects/windows-agent-arena`
- `npx vitest run tests/gap1017WindowsAgentArenaMetricValidityBoundary.test.ts --reporter=dot`: PASS, 1 file / 4 tests.
- `npx vitest run tests/gap1014LangKitMetricValidityBoundary.test.ts tests/gap1017WindowsAgentArenaMetricValidityBoundary.test.ts --reporter=dot`: PASS, 2 files / 8 tests.
- `git diff --check -- . ':(exclude)AMC_OS'`: PASS.
- Narrow no-bloat token scan over `src/score/metricValidity.ts`, `src/diagnostic/questionScoreExplainability.ts`, and `src/diagnostic/runner.ts`: PASS, no WindowsAgentArena identifiers.
- `npm run typecheck`: PASS.
- `npm test -- --reporter=dot`: PASS, 864 files / 7,443 tests.
