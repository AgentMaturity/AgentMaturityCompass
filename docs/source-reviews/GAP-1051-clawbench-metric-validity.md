# GAP-1051 - ClawBench metric validity

- Gap: `GAP-1051`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `TIGER-AI-Lab/ClawBench`
- Retrieval: GitHub API, raw README HEAD/body skim, repository contents API, release/tag API, homepage HEAD/body skim, and arXiv API/HEAD on 2026-06-24 UTC.
- Status: Done - relevance boundary documented and regression-tested through existing AMC metric-validity primitives.

## Relevance decision

`TIGER-AI-Lab/ClawBench` is relevant to AMC as an external source-review signal for browser-agent evaluation. The live repository describes ClawBench as an "Open-source benchmark for browser AI agents on daily tasks" and the linked paper is titled `ClawBench: Can AI Agents Complete Everyday Online Tasks?`. That maps to AMC only through existing Score/Shield/Watch metric-validity receipts: validation table, confidence interval, sample size, metric owner, construct validity, inter-rater agreement, test-retest stability, process evidence, outcome-alignment evidence, signed evidence refs, source refs, row hashes, and CI lifecycle evidence.

The source is not a product requirement for a ClawBench runner, browser automation harness, task importer, trace mirror, leaderboard scraper, Chrome-extension bridge, or dataset adapter. AMC can learn from the source-review signal without copying or wrapping the benchmark.

Live metadata checked:

- GitHub repo: `https://github.com/TIGER-AI-Lab/ClawBench`
- GitHub API: `https://api.github.com/repos/TIGER-AI-Lab/ClawBench`
- Raw README: `https://raw.githubusercontent.com/TIGER-AI-Lab/ClawBench/main/README.md`
- Homepage: `https://claw-bench.com`
- Hugging Face Space: `https://huggingface.co/spaces/TIGER-Lab/ClawBench`
- Hugging Face dataset: `https://huggingface.co/datasets/TIGER-Lab/ClawBench`
- Hugging Face V2 trace dataset: `https://huggingface.co/datasets/TIGER-Lab/ClawBenchV2Trace`
- arXiv: `https://arxiv.org/abs/2604.08523`
- arXiv API: `https://export.arxiv.org/api/query?id_list=2604.08523`
- Scoring page: `https://github.com/TIGER-AI-Lab/ClawBench/blob/main/eval/scoring.md`

Primary-source facts captured for the boundary:

- Repository description: Open-source benchmark for browser AI agents on daily tasks.
- Repository language `Python`; language API returned Python, Shell, JavaScript, and Dockerfile bytes.
- GitHub API returned 419 stars, 25 forks, 34 open issues, watchers_count `419`, default branch `main`, main branch protected `true`, license `Apache-2.0`, created_at `2026-04-10T01:59:17Z`, pushed_at `2026-06-23T18:59:16Z`, and updated_at `2026-06-24T16:21:11Z`.
- latest main commit `fb0e5876fe3f43059738613ae805b7719946e5be` with commit date `2026-06-23T18:59:14Z`.
- README.md sha `600c09d2716d41bcd9f618e018b8cdcbd0ea2806`; CFF citation file CITATION.cff sha `47cdb01152bf9395946fd5cabacf2e1481016cce`; pyproject.toml sha `a3226b8f090c512376b37328699dcba5bcaabf0d`; eval/scoring.md sha `67d71aa44acc30f5c191033a96bea1f133a643fb`; test-cases/task.schema.json sha `aa66ba1997815d9798922693a550e628e6448fa1`.
- Latest release `v0.7.0` was published_at `2026-06-22T23:17:33Z`; corresponding tag commit `376db393278fb6de065d3f39b8c98aff2b50231e`.
- GitHub, raw README, homepage, and arXiv HEAD checks returned HTTP/2 200. Raw README reported content-length: 64390. arXiv abstract page reported content-length: 49380.
- arXiv API returned arXiv `2604.08523v1`, primary category `cs.CL`, and category `cs.AI`.
- README/homepage metadata described V1 `153` tasks, V2 `130` tasks, 144 live websites, 15 life categories, five-layer recording, human reference comparison, request interception, and LLM judge scoring.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through AMC-owned metric-validity receipts for maturity metrics. |
| Shield | Relevant when browser-agent evaluation claims include safety or irreversible-action control evidence; ClawBench labels alone do not satisfy Shield. |
| Enforce | No Enforce change; no runtime guardrail or policy adapter is added. |
| Vault | No Vault change; no external traces, credentials, datasets, or secrets are imported. |
| Watch | Relevant only as evidence drilldown/source-ref context for metric-validation lifecycle receipts. |
| Fleet | No Fleet change; no external harness or multi-agent topology is added. |
| Passport | No Passport change; no portable trust token format changes. |
| Comply | No compliance mapping change; benchmark metadata is not regulatory proof. |

## Product closure

Product closure is a no-bloat regression boundary. The existing `buildMetricValidationReport` primitive already requires the AMC-owned artifacts needed for metric validity:

- validation table
- confidence interval
- sample size
- metric owner
- construct validity
- inter-rater agreement
- test-retest stability
- signed evidence refs
- source refs
- row hashes
- CI gate state

The focused test proves that ClawBench context can pass only when these AMC-owned receipts are present and signed. The same test proves that repository metadata, README labels, homepage leaderboard claims, task counts, trace dataset names, arXiv metadata, release tags, stars, language, license, issue counts, and benchmark terms fail closed when substituted for signed metric-validity evidence.

No public methodology, API, CLI, Studio, or scoring semantics changed.

## Fail-closed rule

Metadata-only ClawBench evidence must fail closed. The following signals are insufficient by themselves:

- GitHub repo existence, stars, forks, watchers, topics, language, license, issue counts, releases, tags, default branch, protected branch state, or commit SHAs.
- README/homepage claims about browser agents, real-world tasks, everyday tasks, task counts, live websites, trace datasets, request interception, LLM judge scoring, leaderboards, or supported harnesses.
- arXiv availability, abstract metadata, category labels, paper title, author list, or linked project page.
- Hugging Face Space/dataset availability or trace dataset names.
- Local command output, copied benchmark rows, copied tasks, screenshots, traces, model-result percentages, or leaderboard scores.

An AMC metric-validity claim passes only with AMC-owned validation table evidence, confidence interval, sample size, metric owner, construct-validity proof, inter-rater agreement proof, test-retest stability proof, process evidence, outcome-alignment evidence, signed evidence refs, source refs, replayable eval-pack rows, row hashes, and CI/lifecycle receipts.

## No-bloat boundary

AMC did not add and must not add a source-specific ClawBench subsystem for this gap. Specifically out of scope:

- ClawBench runner, importer, parser, browser harness, task adapter, dataset mirror, trace mirror, leaderboard scraper, Chrome extension bridge, noVNC bridge, Docker wrapper, or API route.
- New dependencies for ClawBench, Hugging Face, browser automation, Chromium, OpenClaw, Harbor, Hermes, browser-use, Playwright MCP, or external LLM judges.
- Copied upstream code, README prose, benchmark task definitions, rubrics, traces, screenshots, configs, prompts, generated outputs, model responses, result rows, examples, or docs.

The only committed product artifact is the source-review doc plus a focused regression test that keeps the existing AMC metric-validity primitive fail-closed.

## Verification

- Expected red: `npx vitest run tests/gap1051ClawBenchMetricValidityBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1051-clawbench-metric-validity.md` did not exist; the three primitive checks passed.
- Focused: `npx vitest run tests/gap1051ClawBenchMetricValidityBoundary.test.ts --reporter=dot`
- Paired metric-validity boundary regression: `npx vitest run tests/gap1051ClawBenchMetricValidityBoundary.test.ts tests/gap1047AgentBoardMetricValidityBoundary.test.ts --reporter=dot`
- Static whitespace: `git diff --check -- . ':(exclude)AMC_OS'`
- No-bloat scan: `rg -n "ClawBench|clawbench|TIGER-AI-Lab/ClawBench|2604.08523|fb0e5876fe3f43059738613ae805b7719946e5be" src/score/metricValidity.ts src/diagnostic/questionScoreExplainability.ts src/diagnostic/runner.ts`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot`
