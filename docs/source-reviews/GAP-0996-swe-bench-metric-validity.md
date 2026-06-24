# GAP-0996 — SWE-bench metric validity

- Gap: `GAP-0996`
- Dimension: Metric validity and reliability checks (`eval-metric-validity`)
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: `SWE-bench/SWE-bench`
- Retrieval: live public site, GitHub API, raw GitHub files, docs endpoint, Hugging Face collection endpoint, `git ls-remote`, and release API probe on `2026-06-24`
- Status: Done

## Relevance decision

SWE-bench is relevant to AMC as software-engineering agent benchmark context for existing Score/Shield/Watch metric validity. The source can label a source-review boundary because the live public site and repository expose benchmark variants, a leaderboard metric, dataset references, Docker/reproducibility guidance, and paper links. It does not by itself prove an AMC maturity metric is valid.

The accepted AMC claim remains bounded to AMC-owned validation table artifacts, confidence interval calculations, sample size, metric owner, construct-validity checks, reliability checks, outcome-alignment proof, signed evidence refs, row hashes, and CI/lifecycle gates. SWE-bench site metadata, leaderboard rows, `% Resolved`, benchmark variant names, repository metadata, Hugging Face links, Docker instructions, paper links, and local backlog metadata fail closed unless paired with those AMC-owned metric-validity receipts.

Live metadata facts reviewed:

- Public site: `https://www.swebench.com`
- Repository/API: `https://github.com/SWE-bench/SWE-bench` and `https://api.github.com/repos/SWE-bench/SWE-bench`
- Raw README: `https://raw.githubusercontent.com/SWE-bench/SWE-bench/main/README.md`
- Raw license: `https://raw.githubusercontent.com/SWE-bench/SWE-bench/main/LICENSE`
- Raw package metadata: `https://raw.githubusercontent.com/SWE-bench/SWE-bench/main/pyproject.toml`
- Docs endpoint: `https://swebench.com/SWE-bench/`
- Hugging Face collection endpoint: `https://huggingface.co/collections/SWE-bench/swe-bench`
- OpenReview paper page: `https://openreview.net/forum?id=VTF8yNQM66`
- SWE-bench arXiv record: `https://arxiv.org/abs/2310.06770`
- SWE-bench Multimodal arXiv record: `https://arxiv.org/abs/2410.03859`
- Repository state: public, not archived, not disabled, not a fork, language `Python`, license `MIT License`, default branch `main`
- Repository counts at retrieval: `5,247 stars`, `902 forks`, `116 open issues`
- Repository timestamps: created_at `2023-10-04T01:22:46Z`, pushed_at `2026-04-01T05:16:30Z`, updated_at `2026-06-24T12:00:26Z`
- Git HEAD/main: `f7bbbb2ccdf479001d6467c9e34af59e44a840f9`
- GitHub release API result: no GitHub latest release
- Package metadata includes project `swebench`, requires-python `>=3.10`, and dependency signals `datasets` and `docker`
- Public site metadata references `SWE-bench Verified`, `SWE-bench Lite`, `SWE-bench Multilingual`, `SWE-bench Multimodal`, `% Resolved`, `2294 Full`, `500 Verified`, `300 Lite & Multilingual`, and `517 Multimodal`
- README metadata references `Docker`, `ICLR 2024 Oral`, `ICLR 2025`, and `OpenAI Preparedness`

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only when metric-validity rows compute validation coverage, confidence interval, sample size, metric owner, reliability, and outcome alignment from AMC-owned evidence. |
| Shield | Relevant only as a fail-closed assurance gate when metadata tries to replace signed metric-validation evidence. |
| Enforce | Not changed; this gap does not add runtime policy enforcement or circuit breakers. |
| Vault | Not changed; this gap does not add secrets, DLP, privacy, or storage behavior. |
| Watch | Relevant only through existing CI/lifecycle gate and evidence-bound reporting that operators can monitor. |
| Fleet | Not changed; no fleet topology or orchestration behavior is added. |
| Passport | Not changed; no portable trust token or external proof bundle field is added. |
| Comply | Not changed; no compliance mapping or regulatory artifact is added. |

## Product closure

No product code changed. Existing AMC metric-validity primitives already support the required closure:

- validation table coverage
- confidence interval calculation
- sample size checks
- metric owner evidence
- construct-validity checks
- reliability checks
- outcome-alignment checks
- signed evidence reference validation
- replayable eval-pack rows
- CI/lifecycle fail-closed gates

The focused regression test binds SWE-bench metadata to that existing AMC-owned primitive and verifies that a passing claim requires signed validation, process, and outcome evidence. It also verifies that leaderboard or dataset metadata alone fails closed.

## Fail-closed rule

SWE-bench metadata must fail closed when it substitutes for evidence. The following are insufficient by themselves:

- site title, leaderboard tabs, `% Resolved`, instance counts, model names, organization names, dates, cost fields, logs fields, tags, chart/export data, or comparison controls
- benchmark variant names such as SWE-bench, SWE-bench Verified, SWE-bench Lite, SWE-bench Multilingual, and SWE-bench Multimodal
- repository popularity, stars, forks, topics, branch name, license, commit SHA, package metadata, docs endpoint availability, Hugging Face collection availability, Docker guidance, paper links, ICLR labels, or OpenAI Preparedness references

A metric-validity claim can pass only with AMC-owned validation tables, confidence intervals, sample sizes, metric owners, construct-validity and reliability checks, outcome-alignment proof, signed evidence refs, row hashes, thresholds, replayable eval-pack rows, and CI/lifecycle gate receipts.

## No-bloat boundary

This gap did not add and must not add a SWE-bench runner, leaderboard importer, dataset mirror, task scraper, model-result parser, Hugging Face importer, Docker harness wrapper, sb-cli adapter, resolved-rate adapter, chart/export parser, source-specific metric-validity path, API route, CLI command, Studio panel, Watch monitor, Shield verifier, package dependency, methodology version bump, copied website prose, copied README prose, copied leaderboard rows, copied dataset rows, copied benchmark tasks, copied configs, copied screenshots, copied model outputs, or copied upstream code.

## Verification

- Expected-red focused test before doc: `npx vitest run tests/gap0996SweBenchMetricValidityBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-0996-swe-bench-metric-validity.md` did not exist; the three metric-validity primitive tests passed.
- Focused test after doc: `npx vitest run tests/gap0996SweBenchMetricValidityBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired adjacent source-review tests: `npx vitest run tests/gap0995SweAgentLiveDriftBoundary.test.ts tests/gap0996SweBenchMetricValidityBoundary.test.ts --reporter=dot` passed, 2 files / 8 tests.
- Source-specific implementation token scan: `rg -n "SWE-bench/SWE-bench|https://www.swebench.com|swe_bench_metric_validity" src/score/metricValidity.ts src/diagnostic/questionScoreExplainability.ts src/diagnostic/runner.ts` returned no product-module matches.
- Diff whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 843 files / 7,366 tests.
- Post-doc focused rerun: `npx vitest run tests/gap0996SweBenchMetricValidityBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
