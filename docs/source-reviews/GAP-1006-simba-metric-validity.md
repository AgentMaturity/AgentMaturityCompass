# GAP-1006 - Simba metric-validity boundary

- Gap: `GAP-1006`
- Dimension: Metric validity and reliability checks (`eval-metric-validity`)
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: `GitHamza0206/simba`
- Retrieval: live GitHub API, Git remote, raw README, raw license, and release retrieval on 2026-06-24 from `https://github.com/GitHamza0206/simba`, `https://api.github.com/repos/GitHamza0206/simba`, `https://raw.githubusercontent.com/GitHamza0206/simba/main/README.md`, `https://api.github.com/repos/GitHamza0206/simba/license`, `https://raw.githubusercontent.com/GitHamza0206/simba/main/LICENSE.md`, and `https://github.com/GitHamza0206/simba/releases/tag/v0.4.0`
- Status: Done

## Relevance decision

GAP-1006 is relevant to AMC only through the existing Score metric-validity receipt path, with Shield and Watch as consumers of the same evidence. Simba is an external TypeScript repository for a customer-service assistant with evaluation and monitoring concepts. Its source context is useful because the backlog asks for metric validity and reliability checks, and Simba's public materials refer to evaluation metrics and assistant-performance monitoring.

That does not justify a Simba-specific AMC integration. Repository metadata, README labels, topics, release tags, dashboard claims, or project structure cannot prove AMC score validity. A passing AMC metric-validity claim still needs the existing AMC-owned evidence shape: validation table, sample size, confidence interval, reliability checks, regression threshold, metric owner, signed evidence refs, replayable source refs, outcome alignment, and a CI gate. Metadata-only evidence must fail closed.

Live primary-source metadata reviewed:

- Repository API: `https://api.github.com/repos/GitHamza0206/simba`.
- Repository URL: `https://github.com/GitHamza0206/simba`.
- Repository HEAD and main branch: `81098f2a1dc4eb0470aae4dbf94695192067340c`.
- README raw URL: `https://raw.githubusercontent.com/GitHamza0206/simba/main/README.md`.
- README SHA: `797a0c6cab70d8785390a60e58595ddab5249d26`.
- License API: `https://api.github.com/repos/GitHamza0206/simba/license`.
- License raw URL: `https://raw.githubusercontent.com/GitHamza0206/simba/main/LICENSE.md`.
- License file: `LICENSE.md`, SHA `59711bc927cfed45472bc311dd23e5596842955d`, size `9135`.
- License: Apache License 2.0, SPDX `Apache-2.0`.
- Latest release: `v0.4.0`, published at `2025-03-11T11:50:14Z`, target commitish `26bc3ca8665e12ee27814f9eb10819de909ca5b2`.
- Language: TypeScript.
- Public repository state: not archived, not disabled, not private, not a fork.
- GitHub counts at retrieval: 1452 stars, 104 forks, 6 open issues.
- Branch and timestamps: default branch `main`, pushed_at `2026-06-18T03:19:25Z`, updated_at `2026-06-22T05:10:07Z`, created_at `2024-12-20T16:42:29Z`.
- Topics: `customer-service`, `evals`, `knowledge-base`, `llm`, `rag`.
- Top-level paths reviewed: `AGENT.md`, `CLAUDE.md`, `LICENSE.md`, `Makefile`, `README.md`, `assets`, `docker`, `docs`, `frontend`, `packages`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `pyproject.toml`, `simba`, `simba_sdk`, and `uv.lock`.

README source context reviewed without copying implementation details:

- Simba presents customer-service assistant functionality with evaluation and customization themes.
- Its README references a `built-in evaluation framework`, plus retrieval and generation quality signals.
- Metric context includes `retrieval accuracy`, `generation quality`, and `latency`.
- Product context includes a `Modern Dashboard`, a checked `Core evaluation framework`, and an unchecked `Advanced analytics dashboard`.
- These signals are external context only. They do not become AMC scoring semantics, metric definitions, dashboards, ingestion jobs, or runtime integrations.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through AMC's existing metric-validity receipt checks for validation table, confidence interval, sample size, metric owner, reliability, and outcome alignment. |
| Shield | Relevant only as an assurance consumer of the same signed metric-validity evidence. No Simba safety or customer-service policy module is added. |
| Enforce | Not changed. No runtime guardrail, customer-service assistant, or Simba control plane is added. |
| Vault | Not changed. No Simba data, credentials, documents, or knowledge-base storage path is added. |
| Watch | Relevant only because metric-validity evidence can be monitored by existing Watch-style CI gates. No Simba monitoring integration is added. |
| Fleet | Not changed. No multi-agent routing or Simba assistant orchestration is added. |
| Passport | Not changed. No Simba proof token, customer-service proof bundle, or external artifact format is added. |
| Comply | Not changed. This source does not alter compliance mappings. |

## Product closure

No generic metric-validity code needed a source-specific change because `src/score/metricValidity.ts` already supports the required AMC-native acceptance criteria: validation facet coverage, process evidence coverage, sample size, confidence intervals, signed evidence refs, replayable eval-pack rows, outcome alignment, fail-closed warnings, and CI gate output.

The focused regression test `tests/gap1006SimbaMetricValidityBoundary.test.ts` proves:

- Live Simba metadata and the relevance/no-bloat decision are documented.
- A Simba-context metric-validity claim passes only when it uses existing AMC evidence receipts with sample size, confidence interval, validation table, reliability proof, regression threshold, metric owner, signed refs, source refs, and outcome alignment.
- Metadata-only Simba evidence fails closed when repository metadata, topic labels, and dashboard labels replace signed AMC metric-validity evidence.
- `src/score/metricValidity.ts`, `src/diagnostic/questionScoreExplainability.ts`, and `src/diagnostic/runner.ts` do not contain `GitHamza0206/simba`, `https://github.com/GitHamza0206/simba`, `81098f2a1dc4eb0470aae4dbf94695192067340c`, `797a0c6cab70d8785390a60e58595ddab5249d26`, or `simba_metric_validity`.

## Fail-closed rule

The following evidence is rejected by itself:

- GitHub stars, forks, issues, language, topics, default branch, release tag, license metadata, README SHA, repository HEAD, top-level paths, and timestamp metadata.
- README claims about evaluation, dashboards, retrieval, generation, latency, assistant quality, monitoring, or roadmap status.
- Any customer-service use case, knowledge-base label, RAG label, TypeScript package shape, Python package shape, or repository folder name.

An AMC claim can pass only when the assessment supplies AMC-owned evidence with a validation table, confidence interval, sample size, metric owner, reliability check, regression threshold, signed evidence refs, replayable source refs, and outcome-alignment evidence. Missing or metadata-only evidence fails closed under the existing metric-validity report and CI gate.

## No-bloat boundary

No Simba adapter, Simba SDK wrapper, customer-service assistant import, dashboard integration, monitoring integration, eval runner, RAG evaluator, knowledge-base bridge, release watcher, repository importer, API route, CLI command, Studio panel, package dependency, copied code, copied prompts, copied configs, copied metrics, copied examples, copied screenshots, copied data, or source-specific subsystem was added.

Simba remains source-review signal only. AMC keeps the generic metric-validity primitive and refuses to turn this source into product surface area.

## Verification

- Expected-red TDD check: `npx vitest run tests/gap1006SimbaMetricValidityBoundary.test.ts --reporter=dot` failed only because this doc did not exist yet; the receipt-path, fail-closed-path, and implementation-identifier guard already passed.
- Live source retrieval:
  - `gh api repos/GitHamza0206/simba --jq '{full_name,html_url,description,private,fork,archived,disabled,created_at,updated_at,pushed_at,default_branch,language,stargazers_count,forks_count,open_issues_count,license,topics}'`
  - `gh api repos/GitHamza0206/simba/license --jq '{name,path,sha,size,download_url,html_url,license}'`
  - `gh api repos/GitHamza0206/simba/releases/latest --jq '{tag_name,name,html_url,published_at,target_commitish}'`
  - `git ls-remote https://github.com/GitHamza0206/simba.git HEAD refs/heads/main`
  - `gh api repos/GitHamza0206/simba/readme --jq '{name,path,sha,size,download_url,html_url}'`
  - `gh api repos/GitHamza0206/simba/contents --jq '.[].name'`
  - `curl -fsSL https://raw.githubusercontent.com/GitHamza0206/simba/main/README.md | rg -n "open-source|evaluation|metrics|retrieval|generation|latency|Dashboard|monitor|analyze|Production|streaming|async|scalable|Core evaluation|Advanced analytics|full control|customization|measure|performance"`
- Final verification will be recorded after focused tests, typecheck, full suite, commit, push, and Linear closeout.
