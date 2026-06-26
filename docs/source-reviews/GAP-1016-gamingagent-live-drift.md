# GAP-1016 - GamingAgent live-drift boundary

- Gap: `GAP-1016`
- Dimension: Live score and behavior drift alerts (`obs-live-drift-alerts`)
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: GitHub repository/API for `lmgame-org/GamingAgent`, repository API `https://api.github.com/repos/lmgame-org/GamingAgent`, README API `https://api.github.com/repos/lmgame-org/GamingAgent/readme`, raw README `https://raw.githubusercontent.com/lmgame-org/GamingAgent/main/README.md`, license API `https://api.github.com/repos/lmgame-org/GamingAgent/license`, contents API `https://api.github.com/repos/lmgame-org/GamingAgent/contents?ref=main`, commit API `https://api.github.com/repos/lmgame-org/GamingAgent/commits/main`, latest-release API `https://api.github.com/repos/lmgame-org/GamingAgent/releases/latest`, pyproject `https://raw.githubusercontent.com/lmgame-org/GamingAgent/main/pyproject.toml`, requirements `https://raw.githubusercontent.com/lmgame-org/GamingAgent/main/requirements.txt`, benchmark README `https://raw.githubusercontent.com/lmgame-org/GamingAgent/main/lmgame-bench/README.md`, arXiv API `https://export.arxiv.org/api/query?id_list=2505.15146`, arXiv page `https://arxiv.org/abs/2505.15146`, project website `https://lmgame.org/#/gaming_agent`, Hugging Face leaderboard `https://huggingface.co/spaces/lmgame/game_arena_bench`, and local backlog metadata.
- Retrieval: `2026-06-24` live source review through GitHub repository APIs, raw GitHub content, arXiv API, project website headers, Hugging Face leaderboard headers, and local backlog metadata.
- Status: Done
- Linear: `AMC-1295`

## Live source metadata

The GitHub API identifies `lmgame-org/GamingAgent` at `https://github.com/lmgame-org/GamingAgent` as a public, non-fork, non-archived, non-disabled Python repository with no homepage value, MIT License metadata, default branch `main`, 942 stars, 942 watchers, 102 forks, 9 open issues, size 317030, created_at `2025-02-27T04:19:23Z`, pushed_at `2025-11-16T20:16:05Z`, and updated_at `2026-06-23T02:19:43Z`.

Repository description at retrieval: `[ICLR 2026] LLM/VLM gaming agents and model evaluation through games.` The repository reports no GitHub topics.

The README API reports `README.md` with README sha `7a3e07b7b56bd580468ee548561b1614dd142cd8`, size 9000, and raw download URL `https://raw.githubusercontent.com/lmgame-org/GamingAgent/main/README.md`. The contents API listed `.gitignore`, `.gitmodules`, `LICENSE`, `README.md`, `assets`, `computer_use`, `credentials.sh`, `eval`, `gamingagent`, `lmgame-bench`, `pyproject.toml`, `requirements.txt`, `tests`, and `tools`. The license API reports LICENSE sha `4d76a289e3667898ca5b040e739f872a96175b27`, size 1065, license key `mit`, license name `MIT License`, and SPDX `MIT`.

The commit API verified HEAD `996d848ae5e3bf68433d663f38ef4da5bdfe5332`, commit_date `2025-09-12T00:41:27Z`, author `Vica1106`, committer `GitHub`, verified `true`, verification reason `valid`, and message `[Feat] Add video recording for tictactoe & 3 prompt version of Texas Holdem (#75)`.

The latest-release API returned 404, so there is no latest GitHub release metadata for this review. The repository root contains no `.github` workflow directory, so no `.github` workflow directory was used as CI evidence for this slice.

The pyproject file reports pyproject sha `c9b726d2a190ad77c503ebea2e7465502bc677c1`, package name `GamingAgent`, version `0.1.0`, MIT license text, Python `>=3.10`, and dependencies including OpenAI, OpenCV, pygame, gym, gymnasium, gymnasium_2048, and tile_match_gym. The requirements file reports requirements sha `c66fe86161de54a08b4e0883f8d894a80997fecb`.

The `eval` directory contains an evaluation notebook, notebook utilities, performance assets, replay utilities, and video generation script. The `lmgame-bench` directory contains README, `evaluate_all.sh`, `multi_agent_runner.py`, `run.py`, and `single_agent_runner.py`. The `tests` directory contains `test_run.py` plus test-agent and Pokemon Red test directories.

The README and benchmark README describe standardized interactive gaming environments, a vanilla single-model VLM setting, a customized GamingAgent workflow, Gymnasium environment interfaces, model/game evaluation commands, parallel evaluation, multi-agent runner behavior, `single_agent_runner.py`, performance analysis through an evaluation notebook, replay videos from episode logs, computer-use gaming agents, and instructions for adding games. Example game context includes Sokoban, TicTacToe, Texas Holdem, and other classic or Gymnasium/Retro environments.

The arXiv API verified arXiv `2505.15146v2`, title `lmgame-Bench: How Good are LLMs at Playing Games?`, published `2025-05-21T06:02:55Z`, updated `2025-06-03T09:53:37Z`, category `cs.AI`, and authors Lanxiang Hu, Mingjia Huo, Yuxuan Zhang, Haoyang Yu, Eric P. Xing, Ion Stoica, Tajana Rosing, and Haojian Jin. The project website returned HTTP 200 and the Hugging Face leaderboard redirected from `lmgame/game_arena_bench` to `lmgame/lmgame_bench` before returning HTTP 200; this is recorded as Hugging Face leaderboard redirected.

No upstream code, README prose beyond short metadata facts, benchmark rows, notebooks, prompts, game configs, ROM instructions, runner code, replay scripts, generated performance analysis, leaderboard rows, model outputs, examples, screenshots, credentials template content, tests, or implementation details were copied into AMC.

## Relevance decision

GAP-1016 is relevant to AMC through the existing Watch live score and behavior drift receipt path. GamingAgent is useful source-review context because game-based agent evaluation can regress when model, prompt, harness, game environment, provider, or runtime behavior changes. AMC should accept this context only when its own baseline distribution, live sample, drift statistic, signed evidence refs, and alert receipt exist.

GamingAgent repository metadata, README labels, arXiv metadata, leaderboard reachability, game names, runner script names, package dependencies, local backlog metadata, and source popularity are not live-drift evidence. A GamingAgent-context claim passes only through AMC-owned signed baseline/live rows and existing `runLiveScoreBehaviorDrift`, `verifyLiveDriftReceipt`, and Watch alert projections.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant when score drift is computed from AMC-owned baseline and live samples; no GamingAgent score method was added. |
| Shield | Relevant when behavior drift indicates unsafe or invalid actions; no GamingAgent safety evaluator was imported. |
| Enforce | Not changed. No game policy, sandbox, or runtime guardrail was added. |
| Vault | Not changed. No ROM, credential, API key, cache, dataset, or leaderboard storage behavior was imported. |
| Watch | Relevant through existing live score and behavior drift receipts, drift statistics, alert receipts, and evidence drilldown. |
| Fleet | Context only. Multi-agent runner labels do not change AMC fleet topology evidence. |
| Passport | Not changed. No proof-bundle schema or GamingAgent trust token adapter changed. |
| Comply | Not changed. No compliance mapping changed. |

## Product closure

No `src/watch/liveDriftAlerts.ts`, `src/drift/continuousMonitor.ts`, `src/score/index.ts`, API, CLI, Studio, package dependency, or scoring behavior changed for GAP-1016.

The focused regression exercises existing `runLiveScoreBehaviorDrift`, `verifyLiveDriftReceipt`, and `buildLiveDriftWatchAlerts` behavior with GamingAgent-style source references. The positive path requires AMC-owned signed baseline and live rows, source refs, baseline distribution, live sample, drift statistic, and alert receipt. The negative path proves GamingAgent GitHub/README/arXiv/leaderboard metadata fails closed without signed live-drift evidence.

## Fail-closed rule

GamingAgent repository metadata, GitHub stars, forks, open issues, language label, MIT license, README sha, LICENSE sha, pyproject sha, requirements sha, latest-release 404, missing workflow directory, README labels, arXiv `2505.15146v2`, ICLR label, project website reachability, Hugging Face leaderboard redirected status, standardized interactive gaming environments, single-model VLM setting, GamingAgent workflow labels, Gymnasium labels, Sokoban/TicTacToe/Texas Holdem labels, multi-agent runner labels, `single_agent_runner.py`, performance analysis labels, replay videos labels, package dependencies, local backlog text, or source identity cannot prove AMC live drift.

Passing evidence requires AMC-owned baseline distribution, live sample, drift statistic, alert receipt, signed evidence refs, source refs, row hashes, and CI/lifecycle gate proof.

## No-bloat boundary

No GamingAgent integration, game runner, benchmark importer, ICLR paper importer, arXiv importer, leaderboard scraper, website crawler, VLM/LLM game evaluator, Gymnasium adapter, Retro adapter, ROM handler, Sokoban/TicTacToe/Texas Holdem environment, multi-agent runner, single-agent runner, replay video generator, performance notebook runner, computer-use agent runner, API provider adapter, credential loader, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Score method, copied source code, copied configs, copied README prose, copied benchmark rows, copied notebooks, copied prompts, copied game configs, copied tests, copied leaderboard rows, copied model outputs, copied screenshots, or source-specific subsystem was added.

GamingAgent remains source-review signal only.

## Verification

- Expected-red focused test before doc: `npx vitest run tests/gap1016GamingAgentLiveDriftBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1016-gamingagent-live-drift.md` did not exist; 3 live-drift primitive tests passed.
- Live source retrieval:
  - `curl -fsSL https://api.github.com/repos/lmgame-org/GamingAgent`
  - `curl -fsSL https://api.github.com/repos/lmgame-org/GamingAgent/readme`
  - `curl -fsSL https://api.github.com/repos/lmgame-org/GamingAgent/license`
  - `curl -fsSL 'https://api.github.com/repos/lmgame-org/GamingAgent/contents?ref=main'`
  - `curl -fsSL https://api.github.com/repos/lmgame-org/GamingAgent/commits/main`
  - `curl -fsSL https://api.github.com/repos/lmgame-org/GamingAgent/releases/latest`
  - `curl -fsSL https://raw.githubusercontent.com/lmgame-org/GamingAgent/main/README.md`
  - `curl -fsSL https://raw.githubusercontent.com/lmgame-org/GamingAgent/main/pyproject.toml`
  - `curl -fsSL https://raw.githubusercontent.com/lmgame-org/GamingAgent/main/requirements.txt`
  - `curl -fsSL https://raw.githubusercontent.com/lmgame-org/GamingAgent/main/lmgame-bench/README.md`
  - `curl -fsSL 'https://export.arxiv.org/api/query?id_list=2505.15146'`
  - `curl -I -L https://lmgame.org/#/gaming_agent`
  - `curl -I -L https://huggingface.co/spaces/lmgame/game_arena_bench`
- `npx vitest run tests/gap1016GamingAgentLiveDriftBoundary.test.ts --reporter=dot`: PASS, 1 file / 4 tests.
- `npx vitest run tests/gap1012FinSightAiLiveDriftBoundary.test.ts tests/gap1016GamingAgentLiveDriftBoundary.test.ts --reporter=dot`: PASS, 2 files / 8 tests.
- `git diff --check -- . ':(exclude)AMC_OS'`: PASS.
- Narrow no-bloat token scan over `src/watch/liveDriftAlerts.ts`, `src/drift/continuousMonitor.ts`, and `src/score/index.ts`: PASS, no GamingAgent identifiers.
- `npm run typecheck`: PASS.
- `npm test -- --reporter=dot`: PASS, 863 files / 7,439 tests.
