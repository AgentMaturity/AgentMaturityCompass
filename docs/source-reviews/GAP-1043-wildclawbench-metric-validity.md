# GAP-1043 - WildClawBench metric-validity boundary

- Gap: `GAP-1043`
- Dimension: Metric validity and reliability checks (`eval-metric-validity`)
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: live GitHub repository/API at `https://github.com/InternLM/WildClawBench`, GitHub API at `https://api.github.com/repos/InternLM/WildClawBench`, raw README at `https://raw.githubusercontent.com/InternLM/WildClawBench/main/README.md`, project homepage at `https://internlm.github.io/WildClawBench/`, arXiv page `https://arxiv.org/abs/2605.10912`, arXiv API `https://export.arxiv.org/api/query?id_list=2605.10912`, Hugging Face dataset page `https://huggingface.co/datasets/internlm/WildClawBench`, report page `https://github.com/InternLM/WildClawBench/blob/main/WildClawBench_report.pdf`, citation metadata at `https://github.com/InternLM/WildClawBench/blob/main/CITATION.cff`, license metadata at `https://github.com/InternLM/WildClawBench/blob/main/LICENSE`, and local backlog metadata.
- Retrieval: `2026-06-25` live source review through GitHub API repository, branch, contents, tree, raw README headers, latest-release endpoint, tag listing, arXiv API, homepage headers, Hugging Face headers, PDF page headers, and local backlog metadata.
- Status: closed through existing metric-validity receipts only when AMC-owned validation evidence exists; no WildClawBench runner, OpenClaw benchmark importer, Docker image loader, Hugging Face dataset importer, task mirror, trajectory importer, leaderboard parser, arXiv/PDF parser, harness adapter, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, package dependency, or source-specific scoring path added.
- Linear: `AMC-1322`

## Live source metadata

The GitHub API identifies `InternLM/WildClawBench` as a public repository with description context for an in-the-wild AI-agent benchmark in the OpenClaw environment, 450 stars, 44 forks, 5 open issues, default branch `main`, pushed_at `2026-05-19T11:35:36Z`, Python as the primary language, MIT License metadata, homepage `https://internlm.github.io/WildClawBench/`, and topics `agentic-ai`, `agentic-evaluation`, `agents`, `benchmarks`, and `openclaw`.

The `main` branch API returned commit `86d71447413d38f38740a021cb776f64eb396ee0`, tree `2c46588a4da9d64694dbfd728017f88514abb712`, commit message metadata `<doc> clarify pure-text tasks & multimodal tasks`, author and committer timestamp `2026-05-19T11:35:24Z`, and unsigned commit verification metadata. The root contents list includes `.env.example`, `CITATION.cff`, `LICENSE`, `README.md`, `WildClawBench_report.pdf`, `assets`, `eval`, `my_api.json`, `requirements.txt`, `script`, `skills`, `src`, and `tasks`. The repository languages API returned Python, Shell, JavaScript, TypeScript, and TeX byte counts. The latest release endpoint returned `404`, and the tag listing returned no tags.

GitHub contents metadata returned README blob `e2f71de914cee6ce80eb6e47154f8495eb055188` with size 24177, CITATION.cff blob `ed6d3a0121f69b5e18b281c8558894f78b598ca5` with size 1495, and LICENSE blob `9f47988f85ac910ac7a19cc12e2c80cc8d497f9d` with size 1070. Raw README headers returned `HTTP/2 200`, `content-type: text/plain; charset=utf-8`, and content length 24177. The project homepage returned `HTTP/2 200`, `content-type: text/html; charset=utf-8`, `last-modified: Mon, 11 May 2026 17:26:45 GMT`, and content length 181678.

README source-review signals include `WildClawBench: A Benchmark for Real-World, Long-Horizon Agent Evaluation`, arXiv `2605.10912`, 60 tasks, 6 categories, a leaderboard, OpenClaw, Claude Code, Codex CLI, Hermes Agent, Docker-isolated runs, Hugging Face data and image references, per-task outputs including `agent.log`, `chat.jsonl`, `gateway.log`, and produced task files, Brave Search API setup, OpenRouter model setup, an optional judge model, run scripts, personal OpenClaw evaluation, and citation metadata. The arXiv API returned title `WildClawBench: A Benchmark for Real-World, Long-Horizon Agent Evaluation`, published and updated timestamp `2026-05-11T17:49:43Z`, category `cs.CL`, authors including Shuangrui Ding, Xuanlang Dai, Long Xing, Shengyuan Ding, Ziyu Liu, Yang JingYi, Penghui Yang, Zhixiong Zhang, Xilin Wei, Xinyu Fang, Yubo Ma, Haodong Duan, Jing Shao, Jiaqi Wang, Dahua Lin, Kai Chen, and Yuhang Zang, and PDF link metadata. The arXiv page returned `HTTP/2 200` with `last-modified: Tue, 12 May 2026 02:32:29 GMT`. The Hugging Face dataset page returned `HTTP/2 200`, `content-type: text/html; charset=utf-8`, and content length 258131. The GitHub report page returned `HTTP/2 200` and raw-download metadata pointing at the repository PDF.

No repository code, README prose beyond minimal metadata facts, task files, benchmark rows, skills, scripts, prompts, configs, Docker images, Hugging Face data, trajectories, logs, leaderboard values, model outputs, screenshots, assets, report prose, arXiv prose, generated outputs, or implementation details were copied into AMC.

## Relevance decision

GAP-1043 is relevant to AMC through existing Score, Shield, and Watch metric-validity receipts. WildClawBench is a benchmark source for long-horizon agent evaluation, harness comparison, OpenClaw/Codex/Claude Code/Hermes scaffolding, tasks, logs, trajectories, Docker isolation, and leaderboard-style results. That context reinforces why AMC metric claims must carry construct validity, reliability, sample size, confidence interval, metric-owner, outcome-alignment, signed-evidence, row-hash, regression-threshold, and source-reference proof.

The accepted AMC primitive is already `buildMetricValidationReport`. WildClawBench source context may be cited only when an AMC-owned validation packet supplies validation table artifacts, signed evidence refs, row hashes, sample size, confidence interval, reliability checks, outcome alignment, metric owner, source refs, CI or lifecycle gate proof, and no-copy proof. Repository identity, GitHub counts, README labels, arXiv labels, Hugging Face labels, task counts, category counts, harness names, Docker labels, leaderboard labels, trace/log file names, API-key setup labels, local backlog metadata, or source popularity alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing metric-validation rows, eval-pack manifests, validation table, sample size, confidence interval, reliability checks, outcome alignment, and metric owner. |
| Shield | Relevant when signed evidence refs and fail-closed CI gates prevent unsupported safety, benchmark, harness-comparison, or leaderboard claims from passing. |
| Enforce | No runtime policy, Docker runner, benchmark backend, OpenClaw workflow, or circuit breaker changed. |
| Vault | No dataset, task prompt, task workspace, trajectory, log, API key, Docker image, Hugging Face artifact, or secure-storage behavior changed. |
| Watch | Relevant when metric validity is monitored through repeated runs, regression thresholds, or lifecycle gates; no new Watch monitor was added. |
| Fleet | Harness and multi-agent context only; no fleet runner, trust topology, or agent-orchestration behavior changed. |
| Passport | Existing metric-validity receipts can feed proof bundles, but no Passport schema, trust token, or external credential changed. |
| Comply | No compliance mapping changed. |

## Product closure

No product code changed. The focused regression exercises the existing generic metric-validity path with AMC-owned synthetic fixture data.

The positive path proves WildClawBench context can be accepted only when AMC-owned evidence includes 30 signed validation samples, construct-validity coverage, inter-rater reliability, test-retest stability, harness repeatability, trajectory leakage control, regression-threshold fit, validation table, sample-size evidence, confidence-interval evidence, reliability checks, metric-owner evidence, outcome-alignment proof, source refs, row hashes, and CI gate proof. The negative path fails closed when repository metadata, README labels, arXiv labels, Hugging Face labels, task counts, harness labels, Docker labels, leaderboard labels, trace/log labels, and source identity replace signed metric-validity evidence.

## Fail-closed rule

WildClawBench repository identity, GitHub stars, forks, open issues, language metadata, MIT License metadata, default-branch metadata, commit/tree/blob hashes, README labels, arXiv identity, Hugging Face dataset identity, report-page identity, homepage reachability, no-release/no-tag metadata, 60 tasks, 6 categories, OpenClaw labels, Claude Code labels, Codex CLI labels, Hermes Agent labels, Docker labels, leaderboard labels, `agent.log`, `chat.jsonl`, `gateway.log`, Brave Search API labels, OpenRouter labels, judge model labels, personal OpenClaw evaluation labels, local backlog metadata, or source identity alone cannot prove AMC metric validity.

Passing evidence requires AMC-owned validation table artifacts, confidence interval, sample size, metric owner, construct-validity mapping, reliability checks, outcome alignment, signed evidence refs, row hashes, regression thresholds, CI or lifecycle receipts, source refs, and no-copy proof.

## No-bloat boundary

No WildClawBench runner, OpenClaw benchmark importer, Codex/Claude Code/Hermes harness adapter, Docker image loader, Hugging Face dataset importer, task corpus mirror, task template importer, skill importer, script runner, trajectory importer, log parser, leaderboard parser, arXiv parser, PDF parser, report mirror, browser task runner, API-key setup helper, OpenRouter adapter, Brave Search adapter, judge-model runner, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific metric-validity module, or source-specific scoring path was added.

No repository code, README prose beyond minimal metadata facts, task files, benchmark rows, skills, scripts, prompts, configs, Docker images, Hugging Face data, trajectories, logs, leaderboard values, model outputs, screenshots, assets, report prose, arXiv prose, generated outputs, or implementation details were copied.

## Verification

- TDD expected failure: `npx vitest run tests/gap1043WildClawBenchMetricValidityBoundary.test.ts --reporter=dot` failed before this document existed with `ENOENT: no such file or directory, open 'docs/source-reviews/GAP-1043-wildclawbench-metric-validity.md'`; 3 metric-validity primitive tests passed.
- Focused regression: `npx vitest run tests/gap1043WildClawBenchMetricValidityBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired regression: `npx vitest run tests/gap1043WildClawBenchMetricValidityBoundary.test.ts tests/gap0990EvalScopeMetricValidityBoundary.test.ts --reporter=dot` passed, 2 files / 8 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed; narrow token scan over `src/score/metricValidity.ts`, `src/diagnostic/questionScoreExplainability.ts`, and `src/diagnostic/runner.ts` found no GAP-1043 WildClawBench identifiers.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 890 files / 7,544 tests.
