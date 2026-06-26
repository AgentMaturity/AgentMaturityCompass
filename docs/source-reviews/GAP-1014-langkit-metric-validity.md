# GAP-1014 - LangKit metric-validity boundary

- Gap: `GAP-1014`
- Dimension: Metric validity and reliability checks (`eval-metric-validity`)
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: GitHub repository/API for `whylabs/langkit`, repository API `https://api.github.com/repos/whylabs/langkit`, README API `https://api.github.com/repos/whylabs/langkit/readme`, raw README `https://raw.githubusercontent.com/whylabs/langkit/main/README.md`, license API `https://api.github.com/repos/whylabs/langkit/license`, contents API `https://api.github.com/repos/whylabs/langkit/contents?ref=main`, commit API `https://api.github.com/repos/whylabs/langkit/commits/main`, latest-release API `https://api.github.com/repos/whylabs/langkit/releases/latest`, pyproject `https://raw.githubusercontent.com/whylabs/langkit/main/pyproject.toml`, CI workflow `https://raw.githubusercontent.com/whylabs/langkit/main/.github/workflows/langkit-ci.yml`, quality feature doc `https://raw.githubusercontent.com/whylabs/langkit/main/langkit/docs/features/quality.md`, relevance feature doc `https://raw.githubusercontent.com/whylabs/langkit/main/langkit/docs/features/relevance.md`, security feature doc `https://raw.githubusercontent.com/whylabs/langkit/main/langkit/docs/features/security.md`, sentiment feature doc `https://raw.githubusercontent.com/whylabs/langkit/main/langkit/docs/features/sentiment.md`, and local backlog metadata.
- Retrieval: `2026-06-24` live source review through GitHub repository APIs, raw GitHub content, workflow/package/feature docs, and local backlog metadata.
- Status: Done
- Linear: `AMC-1293`

## Live source metadata

The GitHub API identifies `whylabs/langkit` at `https://github.com/whylabs/langkit` as a public, non-fork, non-archived, non-disabled Jupyter Notebook repository with homepage `https://whylabs.ai`, Apache License 2.0 metadata, default branch `main`, 992 stars, 992 watchers, 74 forks, 37 open issues, size 4588, created_at `2023-04-26T21:46:58Z`, pushed_at `2024-11-22T20:02:14Z`, and updated_at `2026-06-19T17:03:00Z`.

Repository description at retrieval identifies LangKit as an open-source toolkit for monitoring LLM prompt and response interactions, extracting text signals, and supporting observability, safety, security, relevance, and sentiment analysis. Topics include large-language-models, machine-learning, nlg, nlp, observability, prompt-engineering, and prompt-injection.

The README API reports `README.md` with README sha `e23def1a91289692366f63c29c02b9ea6171c155`, size 3946, and raw download URL `https://raw.githubusercontent.com/whylabs/langkit/main/README.md`. The contents API listed `.bumpversion.cfg`, `.gitattributes`, `.github`, `.gitignore`, `.pre-commit-config.yaml`, `DESCRIPTION.md`, `LICENSE`, `Makefile`, `README.md`, `langkit`, `poetry.lock`, `poetry.toml`, `pyproject.toml`, and `static`. The license API reports LICENSE sha `261eeb9e9f8b2b4b0d119366dda99c6fd7d35c64`, size 11357, license key `apache-2.0`, license name `Apache License 2.0`, and SPDX `Apache-2.0`.

The commit API verified HEAD `5d6cab1e2ff32181ba5c514aaa2a4473421dc413`, commit_date `2024-11-22T20:02:11Z`, author `whylabs-automator`, committer `GitHub`, verified `true`, verification reason `valid`, and message `Update version to 0.0.35 (#319)`.

The latest-release API returned release `v0.0.35` published `2024-11-06T19:12:50Z`, name `v0.0.35`, target_commitish `refs/heads/main`, and release URL `https://github.com/whylabs/langkit/releases/tag/v0.0.35`.

The pyproject file reports pyproject sha `410b8b7ff60497a57930eb4b8949ca27687cb37f`, package name `langkit`, version `0.0.35`, description `A language toolkit for monitoring LLM interactions`, Apache-2.0 license string, Python range `>=3.8,<4`, core `whylogs` dependency, optional OpenAI, sentence-transformers, evaluate, presidio-analyzer, detoxify, and development dependencies including pytest, mypy, flake8, black, and pre-commit.

The workflow directory contains `langkit-ci.yml` with CI workflow sha `74e54641548a8a990e5fe0ea392981654f8b99c4`, size 1639, plus `push-release.yml` and `release-drafter.yml`. The CI workflow runs on pull requests and pushes across Ubuntu, macOS, and Windows with Python 3.8 through 3.11, Poetry dependency setup, pre-commit checks, package build, and pytest.

Relevant README and feature-doc signals include text quality, text relevance, Security and Privacy, sentiment, toxicity, prompt injection, hallucination, refusal, PII-pattern detection, whylogs profile generation, and monitoring through a WhyLabs platform or user-managed analysis. These are useful metric-validity context signals, not AMC evidence by themselves.

No upstream code, README prose beyond short metadata facts, workflow YAML, pyproject contents beyond short metadata facts, docs prose beyond short metadata facts, notebook cells, examples, benchmark rows, generated profiles, prompts, prompt-injection examples, PII patterns, model outputs, screenshots, configs, dependency files, or implementation details were copied into AMC.

## Relevance decision

GAP-1014 is relevant to AMC through the existing Score, Shield, and Watch metric-validity receipt path. LangKit is an adjacent LLM observability and text-signal toolkit; its public material reinforces why metric claims need construct validity, reliability checks, sample size, confidence interval, metric owner, outcome alignment, signed evidence refs, row hashes, regression thresholds, source refs, and CI or lifecycle gate proof.

This does not justify a LangKit integration. Repository identity, GitHub metadata, README labels, text quality labels, relevance labels, sentiment/toxicity labels, prompt-injection labels, hallucination labels, PII labels, whylogs profile labels, CI workflow labels, release tags, pyproject dependencies, local backlog metadata, or source popularity cannot prove AMC maturity metric validity. A LangKit-context claim can pass only through AMC-owned metric-validity receipts.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing metric-validation rows, validation table, sample size, confidence interval, reliability checks, outcome alignment, and metric owner. |
| Shield | Relevant only when safety/security signal context is backed by signed AMC evidence and metric-validity checks; no LangKit detector was imported. |
| Enforce | Not changed. No runtime policy, guardrail, or LangKit enforcement path was added. |
| Vault | Not changed. No PII detector, pattern file, secrets behavior, or storage path was imported. |
| Watch | Relevant as a consumer of metric-validity regression/lifecycle gates; no new Watch monitor was added. |
| Fleet | Not changed. No multi-agent orchestration or topology evidence changed. |
| Passport | Existing metric-validity receipts can feed proof bundles, but no Passport schema changed. |
| Comply | Not changed. No compliance mapping changed. |

## Product closure

No `src/score/metricValidity.ts`, `src/diagnostic/questionScoreExplainability.ts`, `src/diagnostic/runner.ts`, API, CLI, Studio, scoring code, Shield detector, Watch monitor, package dependency, or public methodology file changed for GAP-1014.

The focused regression exercises existing `buildMetricValidationReport` behavior with a positive LangKit-style source-reference packet and a negative metadata-only packet. The positive path requires validation facets, process evidence, outcome alignment, signed evidence refs, source refs, row hashes, sample size, confidence interval, inter-rater agreement, test-retest stability, replayable eval pack, and CI pass. The negative path proves that LangKit repository metadata, LLM observability labels, text metric labels, and source identity fail closed without AMC-owned metric-validity proof.

## Fail-closed rule

LangKit repository metadata, GitHub stars, forks, open issues, topics, homepage, README sha, LICENSE sha, pyproject sha, CI workflow sha, release tag, default branch, language label, text quality labels, text relevance labels, Security and Privacy labels, sentiment labels, toxicity labels, prompt injection labels, hallucination labels, refusal labels, PII-pattern labels, whylogs labels, WhyLabs platform labels, optional dependency names, examples, notebooks, performance labels, local backlog text, or source identity cannot prove AMC metric validity.

Passing evidence requires AMC-owned validation table artifacts, confidence interval, sample size, metric owner, construct-validity mapping, reliability checks, outcome alignment, signed evidence refs, row hashes, regression thresholds, source refs, CI or lifecycle receipts, and no-copy proof.

## No-bloat boundary

No LangKit integration, WhyLabs adapter, whylogs adapter, notebook runner, signal extractor, profile reader, prompt/response logger, text quality clone, relevance clone, sentiment clone, toxicity clone, prompt injection detector, hallucination detector, PII detector, regex pattern importer, OpenAI wrapper, LangChain callback bridge, pyproject parser, CI workflow mirror, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield detector, Score method, copied source code, copied configs, copied README prose, copied workflow YAML, copied docs prose, copied pyproject content, copied notebook cells, copied examples, copied prompt-injection examples, copied PII patterns, copied generated outputs, or source-specific subsystem was added.

LangKit remains source-review signal only.

## Verification

- Expected-red focused test before doc: `npx vitest run tests/gap1014LangKitMetricValidityBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1014-langkit-metric-validity.md` did not exist; 3 metric-validity primitive tests passed.
- Live source retrieval:
  - `curl -fsSL https://api.github.com/repos/whylabs/langkit`
  - `curl -fsSL https://api.github.com/repos/whylabs/langkit/readme`
  - `curl -fsSL https://api.github.com/repos/whylabs/langkit/license`
  - `curl -fsSL 'https://api.github.com/repos/whylabs/langkit/contents?ref=main'`
  - `curl -fsSL https://api.github.com/repos/whylabs/langkit/commits/main`
  - `curl -fsSL https://api.github.com/repos/whylabs/langkit/releases/latest`
  - `curl -fsSL https://raw.githubusercontent.com/whylabs/langkit/main/README.md`
  - `curl -fsSL https://raw.githubusercontent.com/whylabs/langkit/main/pyproject.toml`
  - `curl -fsSL https://raw.githubusercontent.com/whylabs/langkit/main/.github/workflows/langkit-ci.yml`
  - `curl -fsSL https://raw.githubusercontent.com/whylabs/langkit/main/langkit/docs/features/quality.md`
  - `curl -fsSL https://raw.githubusercontent.com/whylabs/langkit/main/langkit/docs/features/relevance.md`
  - `curl -fsSL https://raw.githubusercontent.com/whylabs/langkit/main/langkit/docs/features/security.md`
  - `curl -fsSL https://raw.githubusercontent.com/whylabs/langkit/main/langkit/docs/features/sentiment.md`
- `npx vitest run tests/gap1014LangKitMetricValidityBoundary.test.ts --reporter=dot`: PASS, 1 file / 4 tests.
- `npx vitest run tests/gap0990EvalScopeMetricValidityBoundary.test.ts tests/gap1014LangKitMetricValidityBoundary.test.ts --reporter=dot`: PASS, 2 files / 8 tests.
- `git diff --check -- . ':(exclude)AMC_OS'`: PASS.
- Narrow no-bloat token scan over `src/score/metricValidity.ts`, `src/diagnostic/questionScoreExplainability.ts`, and `src/diagnostic/runner.ts`: PASS, no LangKit identifiers.
- `npm run typecheck`: PASS.
- `npm test -- --reporter=dot`: PASS, 861 files / 7,432 tests.
