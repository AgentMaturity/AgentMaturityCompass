# GAP-1047 - AgentBoard metric validity

- Gap: `GAP-1047`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: `hkust-nlp/AgentBoard`
- Retrieval: GitHub repository API, repository headers, contents API, raw README headers/content scan, homepage headers, leaderboard headers, Hugging Face dataset headers, arXiv API, and local backlog metadata on 2026-06-25
- Status: Done

## Relevance decision

`GAP-1047` is relevant to AMC only through existing metric-validity receipts. AgentBoard is a public repository for analytical evaluation of multi-turn LLM agents. It is useful context for why Score, Shield, and Watch metric claims must carry validation table evidence, confidence interval, sample size, metric owner, construct validity, inter-rater agreement, test-retest stability, signed evidence rows, source refs, row hashes, and fail-closed CI/lifecycle gates.

The source does not justify adding an AgentBoard subsystem, benchmark runner, task importer, dataset mirror, leaderboard parser, W&B panel integration, Hugging Face dataset loader, WebArena/WebShop environment setup, conda/Docker setup path, arXiv importer, GitHub adapter, API route, CLI command, Studio panel, or source-specific metric-validity module to AMC. Repository metadata can be referenced in a source-review note, but it cannot prove AMC metric validity without AMC-owned signed validation evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through existing metric-validation rows, validation facets, process evidence, outcome alignment, eval-pack rows, and CI gate. |
| Shield | Relevant only as a fail-closed assurance boundary for unsupported benchmark or agent-quality claims. |
| Enforce | Not changed; no benchmark execution policy or environment setup policy was added. |
| Vault | Not changed; no dataset, model output, task corpus, trajectory, config, secret, or environment file was imported. |
| Watch | Relevant only when metric-validity regressions fail closed in CI/lifecycle evidence and operator review. |
| Fleet | Not changed; no AgentBoard runner, task fleet, model fleet, or orchestration subsystem was added. |
| Passport | Not changed; existing metric-validity proof can already travel in existing proof bundles. |
| Comply | Not changed; no licensing, benchmark, research, or publication compliance claim was added. |

## Product closure

The existing AMC metric-validity primitive already covers the acceptance criteria:

- `buildMetricValidationReport` computes metric rows with sample size, confidence interval, inter-rater agreement, test-retest stability, validation facet coverage, process evidence coverage, outcome alignment, warnings, and fail-closed status.
- The report emits replayable eval-pack rows with source refs, row hashes, signed evidence refs, and CI gate status.
- Metadata-only packets fail closed when they lack AMC-owned signed metric rows, validation facets, process evidence, outcome alignment, sample size, metric owner, confidence interval, reliability checks, row hashes, and CI/lifecycle receipts.

The regression uses an AMC-owned synthetic AgentBoard source-reference row and a metadata-only negative row. No product implementation changed because AMC already exposes the required validation table, confidence interval, sample size, metric owner, construct validity, inter-rater agreement, test-retest stability, source refs, row hashes, and fail-closed CI gate.

## Live source facts

- GitHub repository: `https://github.com/hkust-nlp/AgentBoard`.
- GitHub API: `https://api.github.com/repos/hkust-nlp/AgentBoard`.
- Raw README: `https://raw.githubusercontent.com/hkust-nlp/AgentBoard/main/README.md`.
- Project homepage: `https://hkust-nlp.github.io/agentboard`.
- Leaderboard: `https://hkust-nlp.github.io/agentboard/static/leaderboard.html`.
- Hugging Face dataset page: `https://huggingface.co/datasets/hkust-nlp/agentboard`.
- arXiv paper: `https://arxiv.org/abs/2401.13178`.
- arXiv API: `https://export.arxiv.org/api/query?id_list=2401.13178`.
- GitHub repository metadata: full name `hkust-nlp/AgentBoard`, description `An Analytical Evaluation Board of Multi-turn LLM Agents [NeurIPS 2024 Oral]`, language `SAS`, 420 stars, 42 forks, 17 open issues, watchers_count `420`, default branch `main`, topics `[]`, license object `null`, created_at `2024-01-08T08:32:45Z`, updated_at `2026-06-24T11:23:41Z`, and pushed_at `2024-05-20T13:44:42Z`.
- Contents API metadata included README.md sha `f047b619ed189254ccfa143c16703dd6b573b304`, requirements.txt sha `53189196d9bc101310e882be5658b9b41b7cef28`, setup.sh sha `358bc97ab3512bc9f830b962bead3bc4621066ba`, plus `agentboard`, `assets`, `eval_configs`, and `scripts` directories.
- GitHub latest release endpoint returned `404`, tag listing returned no tags, and latest commit `bb7255e2daf1989069a186dad9e53f70680961db` had date `2024-04-23T08:51:18Z`.
- Repository page headers returned `HTTP/2 200`.
- Raw README headers returned `HTTP/2 200`, `content-type: text/plain; charset=utf-8`, and `content-length: 21215`.
- Homepage headers returned `HTTP/2 301` to `https://hkust-nlp.github.io/agentboard/` and then `HTTP/2 200`.
- Leaderboard headers returned `HTTP/2 200`.
- Hugging Face dataset headers returned `HTTP/2 200`, `content-type: text/html; charset=utf-8`, and `content-length: 466944`.
- README badge and link metadata reviewed as context includes Data License-GPL--2.0, Code License-Apache--2.0, Python 3.8+, project website, leaderboard, Hugging Face data page, arXiv paper, and W&B panel link.
- README benchmark context reviewed as metadata includes 9 distinct tasks, multi-round interaction, partially-observable environments, analytical evaluation, fine-grained progress rates, grounding accuracy, performance breakdown, long-range interactions, sub-skill details, and trajectory visualization.
- arXiv API metadata identified arXiv `2401.13178v2`, title `AgentBoard: An Analytical Evaluation Board of Multi-turn LLM Agents`, comment `NeurIPS 2024 (Oral)`, primary category `cs.CL`, and categories cs.CL, cs.AI, and cs.LG.
- README prose, benchmark rows, scripts, configs, setup instructions, dataset archives, and generated outputs were not copied into AMC product logic, docs, tests, prompts, fixtures, datasets, or benchmarks.

## Fail-closed rule

GitHub repository metadata, README labels, stars, forks, open issues, language labels, README badges, license badges, contents listings, commit hashes, release/tag absence, homepage availability, leaderboard availability, Hugging Face dataset availability, W&B panel labels, arXiv metadata, NeurIPS labels, task-count labels, multi-turn labels, partially-observable-environment labels, analytical-evaluation labels, progress-rate labels, grounding-accuracy labels, performance-breakdown labels, trajectory labels, local backlog text, or source identity cannot prove AMC metric validity.

Passing evidence requires AMC-owned validation table, confidence interval, sample size, metric owner, construct-validity mapping, inter-rater agreement, test-retest stability, process evidence, outcome alignment, signed evidence refs, row hashes, source refs, and CI/lifecycle receipts.

## No-bloat boundary

No AgentBoard subsystem, benchmark runner, task importer, dataset mirror, Hugging Face loader, leaderboard parser, W&B panel integration, WebArena setup, WebShop setup, conda setup, Docker setup, shell setup runner, environment variable helper, arXiv importer, GitHub adapter, README parser, task corpus importer, trajectory importer, log parser, model adapter, evaluation script adapter, source-specific metric-validity module, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, Score method, methodology version bump, diagnostic question-bank migration, package dependency, copied repository code, copied README prose, copied setup instructions, copied scripts, copied configs, copied task files, copied benchmark rows, copied dataset records, copied leaderboard values, copied W&B content, copied Hugging Face data, copied arXiv prose, copied figures, copied tables, copied generated outputs, or copied implementation details were added.

The repository remains source-review signal only.

## Verification

- TDD expected failure before doc creation: `npx vitest run tests/gap1047AgentBoardMetricValidityBoundary.test.ts --reporter=dot` failed only because this document did not exist; 3 metric-validity primitive tests passed.
- Live source retrieval:
  - `node` fetch of `https://api.github.com/repos/hkust-nlp/AgentBoard`
  - `node` fetch of `https://api.github.com/repos/hkust-nlp/AgentBoard/contents?ref=main`
  - `node` fetch of release, tag, and latest-commit metadata from the GitHub API
  - `curl -I -L https://github.com/hkust-nlp/AgentBoard`
  - `curl -I -L https://raw.githubusercontent.com/hkust-nlp/AgentBoard/main/README.md`
  - `curl -I -L https://hkust-nlp.github.io/agentboard`
  - `curl -I -L https://hkust-nlp.github.io/agentboard/static/leaderboard.html`
  - `curl -I -L https://huggingface.co/datasets/hkust-nlp/agentboard`
  - `curl -L -s https://export.arxiv.org/api/query?id_list=2401.13178`
- `npx vitest run tests/gap1047AgentBoardMetricValidityBoundary.test.ts --reporter=dot`: PASS, 1 file / 4 tests.
- `npx vitest run tests/gap1046LiraMetricValidityBoundary.test.ts tests/gap1047AgentBoardMetricValidityBoundary.test.ts --reporter=dot`: PASS, 2 files / 8 tests.
- `git diff --check -- . ':(exclude)AMC_OS'`: PASS.
- Narrow no-bloat token scan over `src/score/metricValidity.ts`, `src/diagnostic/questionScoreExplainability.ts`, and `src/diagnostic/runner.ts`: PASS, no AgentBoard identifiers.
- `npm run typecheck`: PASS.
- `npm test -- --reporter=dot`: PASS, 894 files / 7,560 tests.
