# GAP-1002 - MLE-bench question-explainability boundary

- Gap: `GAP-1002`
- Dimension: Question-level score explainability (`eval-score-explainability`)
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: `openai/mle-bench`
- Retrieval: live primary retrieval on 2026-06-24 from `https://github.com/openai/mle-bench`, `https://api.github.com/repos/openai/mle-bench`, `https://raw.githubusercontent.com/openai/mle-bench/main/README.md`, `https://api.github.com/repos/openai/mle-bench/license`, `https://raw.githubusercontent.com/openai/mle-bench/main/LICENSE`, `https://raw.githubusercontent.com/openai/mle-bench/main/pyproject.toml`, `https://raw.githubusercontent.com/openai/mle-bench/main/agents/README.md`, `https://raw.githubusercontent.com/openai/mle-bench/main/run_agent.py`, `https://raw.githubusercontent.com/openai/mle-bench/main/experiments/aggregate_grading_reports.py`, `https://github.com/openai/mle-bench/tree/main/experiments/splits`, and `https://arxiv.org/abs/2410.07095`
- Status: Done

## Relevance decision

GAP-1002 is relevant to AMC, but only through the existing question-level score explainability primitive. MLE-bench is a public benchmark for machine learning engineering agents, so it is useful source-review context for AMC's requirement that each L0-L5 question score explain why it moved, which signed evidence was accepted, which evidence was rejected, what repair hint applies, and which reproducible eval pack and fail-closed thresholds support the result.

The source does not require AMC to run MLE-bench, import Kaggle competitions, mirror benchmark rows, build Docker images, parse upstream grading reports, or add an MLE-bench-specific scoring path. The AMC closure is to verify that existing Score/Shield/Watch question-score evidence packs reject source metadata by itself and accept only AMC-owned signed rows, question IDs, row hashes, reproducible eval packs, thresholds, and repair hints.

Live repository metadata reviewed:

- `openai/mle-bench` is public, not archived, not disabled, not a fork, with default branch `main`.
- Remote HEAD for `main`: `507f92e1138bb6e40dac5c6ee7a6758e6424bf97`.
- GitHub API metadata: Python, 1,590 stars, 255 forks, 8 open issues, no topics, created_at `2024-10-08T17:07:40Z`, pushed_at `2026-04-24T17:33:44Z`, updated_at `2026-06-24T10:47:05Z`.
- GitHub license API reports `NOASSERTION`; the raw `LICENSE` content begins with `MIT License`, so the code license reviewed as MIT. The license note is not treated as permission to copy external datasets or downloaded competition files.
- Latest GitHub release not found: the GitHub releases API returned 404 for `/releases/latest`.
- README metadata: `README.md` SHA `b00b53510a7d38a21d6dcc14f53fc87111709742`, size 20,988 bytes.
- Package metadata reviewed from `pyproject.toml`: package name `mlebench`, version `1.0.0`, requires Python `>=3.11`, and exposes the `mlebench` CLI entrypoint.

Source context reviewed:

- The README links the paper `MLE-Bench: Evaluating Machine Learning Agents on Machine Learning Engineering` at `https://arxiv.org/abs/2410.07095`.
- The benchmark uses 75 Kaggle competitions for the full set, and a low complexity split of 22 competitions.
- The README reports full dataset size of 3.3TB and low-complexity size of 158GB.
- The README recommends repeating evaluations with at least 3 seeds and reporting Any Medal as mean plus SEM because agents and LLMs can be high variance.
- Leaderboard aggregation uses grading reports under `runs/`.
- Grading JSONL rows require `competition_id` and `submission_path`, and grading is driven by `mlebench grade` or `mlebench grade-sample`.
- The repository describes the `mlebench-env` base image with a Conda environment and grading server.
- `agents/README.md` describes a dummy agent and three evaluated open-source agent IDs: `aide`, `mlagentbench`, and `opendevin`.
- The README mentions a rule violation detector, known issues with some competitions, a planned v2 release, and a future version column for distinguishing v1 and v2 results.
- The benchmark relies on external datasets downloaded via the Kaggle API; those external datasets are not copied, mirrored, or represented as AMC fixtures.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant. MLE-bench reinforces that score claims need question ID, accepted evidence IDs, rejected evidence reasons, repair hint, reproducible eval pack, signed evidence rows, and fail-closed thresholds. |
| Shield | Relevant only as assurance context. Metadata, leaderboard claims, Docker setup, and upstream agent results cannot substitute for signed AMC evidence or threshold receipts. |
| Enforce | Not changed. No runtime policy or circuit-breaker behavior is added for this source. |
| Vault | Not changed. No secrets, Kaggle credentials, downloaded datasets, or storage integration are added. |
| Watch | Relevant through existing lifecycle/eval threshold receipts that can surface failed regression gates. No upstream leaderboard watcher is added. |
| Fleet | Not changed. The upstream multi-agent examples are source context only and do not create AMC fleet orchestration behavior. |
| Passport | Relevant through existing external proof bundle shape only; no MLE-bench passport adapter is added. |
| Comply | Not changed. This gap does not change compliance mappings. |

## Product closure

No product module changed for GAP-1002 because AMC already has the relevant primitive in `src/diagnostic/questionScoreExplainability.ts`, with downstream guide and passport support in `src/guide/guideGenerator.ts` and `src/passport/passportArtifact.ts`.

The focused regression test `tests/gap1002MleBenchQuestionExplainabilityBoundary.test.ts` proves:

- A positive AMC-owned question explainability row is replayable and not fail-closed when it has signed accepted evidence, rejected evidence reasons, a repair hint, criterion diagnostics, reproducible eval pack metadata, CI/export/trace hashes, and pass-rate/average-score thresholds.
- A metadata-only MLE-bench source review row fails closed when it lacks accepted evidence, signed rows, thresholds, and question-level proof.
- The source-review boundary does not add `openai/mle-bench`, `MLE-bench`, the remote HEAD, or `mle_bench_question_explainability` identifiers to diagnostic, guide, or passport implementation modules.

## Fail-closed rule

Metadata-only proof must fail closed. Repository popularity, README statements, package metadata, arXiv references, Kaggle competition counts, dataset size, leaderboard reports, `runs/` structure, `competition_id`, `submission_path`, `mlebench grade`, `mlebench-env`, Conda, grading server, agent IDs, rule violation detector notes, known issues, v2 planning, and release status do not prove an AMC maturity level.

A question score can pass only when AMC has its own question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed evidence rows, row hashes, reproducible eval pack, and fail-closed thresholds tied to the lifecycle run.

## No-bloat boundary

No MLE-bench runner, Kaggle downloader, Docker/image builder, leaderboard importer, dataset mirror, grading report parser, agent wrapper, benchmark adapter, API route, CLI command, Studio panel, dependency, copied source code, copied benchmark rows, copied datasets, copied configs, copied examples, copied generated outputs, or source-specific subsystem was added.

MLE-bench remains source-review signal only.

## Verification

- Expected-red TDD check: `npx vitest run tests/gap1002MleBenchQuestionExplainabilityBoundary.test.ts --reporter=dot` failed only because this doc did not exist yet; the 3 product/boundary assertions passed.
- Live source retrieval:
  - `gh api repos/openai/mle-bench --jq '{full_name,html_url,description,private,archived,disabled,fork,default_branch,language,stargazers_count,forks_count,open_issues_count,topics,created_at,pushed_at,updated_at,license}'`
  - `gh api repos/openai/mle-bench/license --jq '{html_url,download_url,license,path,sha,size}'`
  - `gh api repos/openai/mle-bench/releases/latest --jq '{tag_name,published_at,html_url}'` returned 404, confirming latest GitHub release not found.
  - `git ls-remote https://github.com/openai/mle-bench.git HEAD refs/heads/main`
  - `gh api repos/openai/mle-bench/contents/README.md --jq '{download_url,sha,size}'`
  - `curl -fsSL https://raw.githubusercontent.com/openai/mle-bench/main/README.md | rg -n 'MLE-Bench:|04-24-2026|Any Medal|mean|SEM|3 seeds|75 Kaggle|22 competitions|3.3TB|158GB|competition_id|submission_path|mlebench grade|mlebench-env|Conda|grading server|runs/|leaderboard|known issues|v2|version column|Kaggle API|rule violation'`
  - `curl -fsSL https://raw.githubusercontent.com/openai/mle-bench/main/pyproject.toml | rg -n 'name =|version =|requires-python|mlebench ='`
  - `curl -fsSL https://raw.githubusercontent.com/openai/mle-bench/main/agents/README.md | rg -n 'aide|mlagentbench|opendevin|dummy|agent|submissions'`
  - `curl -fsSL https://raw.githubusercontent.com/openai/mle-bench/main/LICENSE | sed -n '1,12p'`
- Final verification will be recorded after focused tests, typecheck, full suite, commit, and push.
