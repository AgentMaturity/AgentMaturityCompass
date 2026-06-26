# GAP-1031 - MobileGym metric-validity boundary

- Gap: `GAP-1031`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: `Purewhiter/mobilegym`
- Retrieval: live GitHub repository metadata, GitHub REST repository/default-branch/contents/readme/releases/tags/languages APIs, raw README, raw `package.json`, raw license, homepage headers, arXiv page/API/PDF headers, and local backlog metadata fetched on 2026-06-24
- Status: Done

## Relevance decision

`Purewhiter/mobilegym` is relevant to AMC as source-review context for metric validity and reliability checks around mobile GUI agent benchmarks: construct validity, state-based verification, deterministic judging, task-template coverage, parallel rollout repeatability, sim-to-real alignment, confidence intervals, sample size, and metric ownership. It maps to AMC's existing Score/Shield/Watch metric-validity primitive because AMC already requires validation table, confidence interval, sample size, metric owner, signed evidence rows, replayable eval pack, outcome-alignment proof, regression thresholds, and CI/lifecycle gates before a metric-validity claim can pass.

Live source metadata verified:

- GitHub repository: `https://github.com/Purewhiter/mobilegym`
- GitHub API: `https://api.github.com/repos/Purewhiter/mobilegym`
- README API: `https://api.github.com/repos/Purewhiter/mobilegym/readme`
- README: `https://raw.githubusercontent.com/Purewhiter/mobilegym/main/README.md`
- License: `https://raw.githubusercontent.com/Purewhiter/mobilegym/main/LICENSE`
- Package JSON: `https://raw.githubusercontent.com/Purewhiter/mobilegym/main/package.json`
- Contents API: `https://api.github.com/repos/Purewhiter/mobilegym/contents?ref=main`
- Homepage: `https://mobilegym.dev`
- arXiv: `https://arxiv.org/abs/2605.26114`
- arXiv API: `https://export.arxiv.org/api/query?id_list=2605.26114`
- arXiv PDF: `https://arxiv.org/pdf/2605.26114`
- Repository full name: `Purewhiter/mobilegym`
- GitHub description: MobileGym: A Verifiable and Highly Parallel Simulation Platform for Mobile GUI Agent Research; Browser-hosted Android Simulator; Verifiable Evaluation; Scalable Online RL Training
- Public, non-fork, non-archived repository.
- License metadata and license file: `Apache License 2.0`
- primary language `TypeScript`
- Stars `653`
- Forks `107`
- Watchers `1`
- open issues `7`
- Topics include `agent`, `agents`, `ai`, `android`, `automation`, `benchmark`, `gym`, `llm`, `llm-agents`, `mobile-agent`, `online-rl`, `react`, `reinforcement-learning`, `rl`, `rl-environment`, `sim-to-real`, `simulator`, `typescript`, and `vlm`
- Created `2026-05-14T11:09:52Z`, pushed `2026-06-20T09:54:11Z`, updated `2026-06-24T12:50:37Z`
- default branch `main`; protected `false`; default branch commit `399235e7e3f26469c3ddd4a75705f63d6e3071a4`
- README sha `823213322e66d4d268ba9a4026fb67fadebcb090`, size 32551
- GitHub languages API reports TypeScript, Python, CSS, HTML, JavaScript, and Shell
- Top-level repository shape includes `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `DISCLAIMER.md`, `LICENSE`, `LICENSE-DATA`, `NOTICE`, `README.md`, `README_zh.md`, `apps`, `assets`, `bench_env`, `docs`, `os`, `package.json`, `public`, `scripts`, `system`, `tests`, `web`, and Vite/Vitest/TypeScript config files
- `apps` contents include Alipay, Bilibili, Ebay, Map, Railway12306, RedBook, Reddit, Spotify, TencentMeeting, Weather, Wechat, WechatReading, and X
- Docs contents include `docs/README.md`, `docs/api`, `docs/getting-started.md`, `docs/guides`, and `docs/platform`
- Release/tag metadata returned release `data-v1.0` / `mobilegym-data v1.0`
- `package.json` package name `mobile-gym`
- `package.json` version `0.1.0`
- `package.json` scripts include vite, build, preview, test, lint, and CSS build/watch commands
- `package.json` dependency labels include react, react-dom, react-router-dom, vite, vitest, TypeScript, zustand, lucide-react, sqlite-wasm, puppeteer, and Tailwind-related tooling
- Homepage returned HTTP/2 200, `content-type: text/html; charset=utf-8`, `last-modified: Sat, 06 Jun 2026 06:50:47 GMT`, and GitHub Pages/Fastly/Cloudflare headers
- arXiv page returned HTTP/2 200, `content-length: 48363`, and `last-modified: Thu, 28 May 2026 00:36:42 GMT`
- arXiv PDF returned HTTP/2 200, `content-type: application/pdf`, `content-length: 2470935`, `filename="2605.26114v2.pdf"`, and `last-modified: Thu, 28 May 2026 00:41:45 GMT`
- arXiv API reports title `MobileGym: A Verifiable and Highly Parallel Simulation Platform for Mobile GUI Agent Research`, categories `cs.AI` and `cs.CL`, published `2026-05-25T17:59:49Z`, and updated `2026-05-27T05:27:30Z`
- README/arXiv source-review labels include 28 simulated apps, 416 task templates, deterministic judges, 256 parallel instances, 256 test and 160 train templates, structured JSON state, AnswerSheet protocol, state diffing, online RL, GRPO, sim-to-real transfer, 95.1 retention, and +40.7 pt real-device gain.

The source is not a reason to add a MobileGym simulator, benchmark runner, dataset importer, Android emulator, task adapter, RL training pipeline, or package dependency. AMC can reference this source only as context attached to AMC-owned metric-validity receipts.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only when AMC-owned metric-validity rows provide validation table, sample size, confidence interval, metric owner, signed evidence, and outcome-alignment proof. |
| Shield | Relevant only when mobile-agent safety, side-effect, false-completion, or unexpected-state metrics are captured in AMC-owned validation evidence. |
| Enforce | No runtime enforcement change; metric-validity CI/lifecycle gates already fail closed through the existing primitive. |
| Vault | No secrets, dataset storage, privacy, or retention change. |
| Watch | Relevant only when metric drift or validity degradation emits Watch evidence from AMC-owned receipts. |
| Fleet | Contextual only for mobile-agent benchmark coverage; no simulator, task runtime, or RL subsystem was added. |
| Passport | No external proof-token change. |
| Comply | No compliance mapping change. |

## Product closure

No product code change was needed. GAP-1031 is closed by documenting the relevance boundary and adding regression coverage that proves:

- existing `buildMetricValidationReport` can represent MobileGym-style mobile GUI benchmark context only when AMC-owned validation rows are present;
- validation table, confidence interval, sample size, metric owner, construct-validity evidence, reliability checks, signed evidence refs, row hashes, outcome alignment, and CI/lifecycle gates are preserved;
- GitHub repository metadata, README labels, arXiv metadata, homepage headers, package labels, release/tag labels, app names, data release labels, simulator claims, task counts, benchmark labels, deterministic judge labels, sim-to-real labels, online RL labels, screenshots, local backlog text, or source identity cannot replace AMC-owned metric-validity evidence.

## Fail-closed rule

The following evidence is metadata-only and must fail closed if it is used without AMC-owned metric-validity proof:

- GitHub repository URL/API response, stars, forks, watchers, issues, topics, license, default branch, commit SHA, release/tag labels, language mix, repository tree, README, package.json, homepage headers, arXiv page/API/PDF metadata, app list, task counts, benchmark split labels, deterministic judge labels, structured-state labels, sim-to-real labels, online RL labels, local backlog text, or source identity.

A passing AMC metric-validity claim must include validation table, confidence interval, sample size, metric owner, signed evidence rows, construct-validity proof, reliability checks, outcome-alignment proof, replayable eval-pack rows, row hashes, source refs, and CI/lifecycle gate outcome.

## No-bloat boundary

AMC did not add a MobileGym simulator, browser-hosted Android environment, benchmark runner, dataset importer, Android emulator, task adapter, app simulator, state-diff judge, AnswerSheet implementation, RL training pipeline, GRPO pipeline, dataset downloader, data release mirror, package dependency, Vite/React integration, arXiv importer, homepage mirror, API route, CLI command, Studio panel, Watch panel, source-specific metric-validity module, copied README prose, copied paper prose, copied benchmark rows, copied datasets, copied prompts, copied examples, copied configs, copied screenshots, copied source code, copied model outputs, or copied generated state.

External sources remain source-review signals only. AMC's product primitive remains generic metric-validity evidence over Score/Shield/Watch.

## Verification

- `gh repo view Purewhiter/mobilegym --json nameWithOwner,description,stargazerCount,forkCount,watchers,primaryLanguage,repositoryTopics,licenseInfo,defaultBranchRef,pushedAt,updatedAt,createdAt,homepageUrl,url,isArchived,isFork,isPrivate` passed.
- `curl -sS https://api.github.com/repos/Purewhiter/mobilegym | jq ...` passed.
- `curl -sSIL https://github.com/Purewhiter/mobilegym | sed -n '1,100p'` passed.
- `curl -sS 'https://api.github.com/search/repositories?q=repo:Purewhiter/mobilegym' | jq ...` passed.
- `curl -sS https://api.github.com/repos/Purewhiter/mobilegym/readme | jq ...` passed.
- `curl -sS 'https://api.github.com/repos/Purewhiter/mobilegym/contents?ref=main' | jq ...` passed.
- `curl -sS https://api.github.com/repos/Purewhiter/mobilegym/branches/main | jq ...` passed.
- `curl -sS 'https://api.github.com/repos/Purewhiter/mobilegym/languages' | jq` passed.
- `curl -sS 'https://api.github.com/repos/Purewhiter/mobilegym/releases?per_page=5' | jq ...` passed.
- `curl -sS 'https://api.github.com/repos/Purewhiter/mobilegym/tags?per_page=10' | jq ...` passed.
- `curl -sS https://raw.githubusercontent.com/Purewhiter/mobilegym/main/LICENSE | sed -n '1,24p'` passed.
- `curl -sS https://raw.githubusercontent.com/Purewhiter/mobilegym/main/package.json | jq ...` passed.
- `curl -sS https://raw.githubusercontent.com/Purewhiter/mobilegym/main/README.md | rg ...` passed.
- `curl -sS 'https://api.github.com/repos/Purewhiter/mobilegym/contents/docs?ref=main' | jq ...` passed.
- `curl -sS 'https://api.github.com/repos/Purewhiter/mobilegym/contents/apps?ref=main' | jq ...` passed.
- `curl -sSIL https://mobilegym.dev | sed -n '1,100p'` passed.
- `curl -sSIL https://arxiv.org/abs/2605.26114 | sed -n '1,80p'` passed.
- `curl -sS 'https://export.arxiv.org/api/query?id_list=2605.26114' | rg ...` passed.
- `curl -sSIL https://arxiv.org/pdf/2605.26114 | sed -n '1,80p'` passed.
- TDD expected failure before doc creation passed as expected: missing source-review doc was the only failing condition, while 3 metric-validity primitive tests passed.
- `npx vitest run tests/gap1031MobileGymMetricValidityBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- `npx vitest run tests/gap1031MobileGymMetricValidityBoundary.test.ts tests/gap1017WindowsAgentArenaMetricValidityBoundary.test.ts --reporter=dot` passed, 2 files / 8 tests.
- `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Narrow token scan over metric-validity implementation files found no GAP-1031 MobileGym identifiers.
- `npm run typecheck` passed.
- `npm test -- --reporter=dot` passed, 878 files / 7,498 tests.
- Final focused regression after document creation passed: `npx vitest run tests/gap1031MobileGymMetricValidityBoundary.test.ts --reporter=dot`, 1 file / 4 tests.
