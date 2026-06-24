# GAP-1015 - NeMo Gym public-methodology boundary

- Gap: `GAP-1015`
- Dimension: Public methodology versioning (`std-public-methodology`)
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: GitHub repository/API for `NVIDIA-NeMo/Gym`, repository API `https://api.github.com/repos/NVIDIA-NeMo/Gym`, README API `https://api.github.com/repos/NVIDIA-NeMo/Gym/readme`, raw README `https://raw.githubusercontent.com/NVIDIA-NeMo/Gym/main/README.md`, license API `https://api.github.com/repos/NVIDIA-NeMo/Gym/license`, contents API `https://api.github.com/repos/NVIDIA-NeMo/Gym/contents?ref=main`, commit API `https://api.github.com/repos/NVIDIA-NeMo/Gym/commits/main`, latest-release API `https://api.github.com/repos/NVIDIA-NeMo/Gym/releases/latest`, tags API `https://api.github.com/repos/NVIDIA-NeMo/Gym/tags?per_page=10`, pyproject `https://raw.githubusercontent.com/NVIDIA-NeMo/Gym/main/pyproject.toml`, package info `https://raw.githubusercontent.com/NVIDIA-NeMo/Gym/main/nemo_gym/package_info.py`, unit-tests workflow `https://raw.githubusercontent.com/NVIDIA-NeMo/Gym/main/.github/workflows/unit-tests.yml`, full-test-suite workflow `https://raw.githubusercontent.com/NVIDIA-NeMo/Gym/main/.github/workflows/full-test-suite.yml`, Fern docs CI workflow `https://raw.githubusercontent.com/NVIDIA-NeMo/Gym/main/.github/workflows/fern-docs-ci.yml`, docs README `https://raw.githubusercontent.com/NVIDIA-NeMo/Gym/main/docs/README.md`, docs site `https://docs.nvidia.com/nemo/gym/main/about/`, and local backlog metadata.
- Retrieval: `2026-06-24` live source review through GitHub repository APIs, raw GitHub content, official docs headers, workflow/package/docs metadata, and local backlog metadata.
- Status: Done - skipped
- Linear: `AMC-1294`

## Live source metadata

The GitHub API identifies `NVIDIA-NeMo/Gym` at `https://github.com/NVIDIA-NeMo/Gym` as a public, non-fork, non-archived, non-disabled Python repository with homepage `https://docs.nvidia.com/nemo/gym/main/about/`, Apache License 2.0 metadata, default branch `main`, 1,002 stars, 1,002 watchers, 198 forks, 458 open issues, size 66800, created_at `2025-08-25T21:37:55Z`, pushed_at `2026-06-24T16:03:21Z`, and updated_at `2026-06-24T14:23:57Z`.

Repository description at retrieval: `Evaluate and improve models and agents using environments`. Topics include agents, benchmarks, environments, evaluation, gym, llm, reinforcement-learning, reinforcement-learning-environments, rl-environment, and rl-training.

The README API reports `README.md` with README sha `71d6e511af50df3ec448b182feb210c48138afe6`, size 130941, and raw download URL `https://raw.githubusercontent.com/NVIDIA-NeMo/Gym/main/README.md`. The contents API listed `.claude`, `.codex`, `.dockerignore`, `.github`, `.gitignore`, `.pre-commit-config.yaml`, `.python-version`, `ATTRIBUTIONS.md`, `CLAUDE.md`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `LICENSE`, `Makefile`, `README.md`, `SECURITY.md`, `benchmarks`, `cache`, `codecov.yml`, `data`, `docs`, `environments`, `example_environments`, `fern`, `nemo_gym`, `pyproject.toml`, `resources_servers`, `responses_api_agents`, `responses_api_models`, `results`, `scripts`, `tests`, and `uv.lock`. The license API reports LICENSE sha `261eeb9e9f8b2b4b0d119366dda99c6fd7d35c64`, size 11357, license key `apache-2.0`, license name `Apache License 2.0`, and SPDX `Apache-2.0`.

The commit API verified HEAD `797db2912ced96991ae4944a3fffc9d9c445ece0`, commit_date `2026-06-24T11:11:34Z`, author `Wojciech Prazuch`, committer `GitHub`, verified `true`, verification reason `valid`, and message `fix(config): aggregated error for unset '???' config values (#1575)`.

The latest-release API returned release `v0.3.0` published `2026-06-04T15:53:32Z`, name `v0.3.0`, target_commitish `4c44cf950c8045cf3328817bb63b4f21db9f33fb`, and release URL `https://github.com/NVIDIA-NeMo/Gym/releases/tag/v0.3.0`. The tags API returned `v0.3.0`, `v0.2.1`, `v0.2.0`, `v0.1.1`, and `v0.1.0`.

The pyproject file reports pyproject sha `c8d92ec2f87085f0b908b3c29d52fed343f7e27c`, package name `nemo-gym`, description `NeMo Gym is a library for building reinforcement learning environments`, Apache license file reference, Python `>=3.12`, dependencies such as OpenAI, pydantic, FastAPI, Hydra/OmegaConf, Ray, python-multipart, GitPython, and CLI entry points for runs, tests, benchmark listing, benchmark preparation, rollout collection, rollout aggregation, reward profiling, dataset upload/download, config dump, status, and version display.

The package info file reports package_info sha `c415008946ff52900bea634a3782a9e8531c2d7b`, package version `0.4.0rc0`, repository URL `https://github.com/NVIDIA-NeMo/Gym`, download URL `https://github.com/NVIDIA-NeMo/Gym/releases`, and Apache2 license string.

The workflow directory contains unit-tests workflow sha `810f75fcc82f2a0ba447674d77a6219b21371ad9`, full-test-suite workflow sha `de74b1ed466c3b8b122badd68ddb79fa3232ab05`, fern-docs-ci workflow sha `03d476cf33fa9857f8ffc7c3850c13afb1031718`, and additional release, linting, docs-preview, container, secrets, and community workflows. The reviewed test workflows cover uv setup, Python 3.12, `ng_dev_test`, `ng_test_all`, sharded server tests, wheel install checks, local mock inference setup, CLI command checks, and docs CI. The Fern docs CI validates Fern configuration for docs changes.

The docs README reports docs README sha `03fb9cfdf3d9c05ff678c77b067c2fdd7fe6db85` and says the old Sphinx tree was retired in favor of Fern MDX under `fern/`, with the docs published to `https://docs.nvidia.com/nemo/gym`. The docs site `https://docs.nvidia.com/nemo/gym/main/about/` returned docs site HTTP 200 with title `NeMo Gym | NeMo Gym`.

Relevant README/source-review signals include environment-based agent/model evaluation, reproducible evaluation, shared environments and verifiers, agent harnesses, task datasets, verifiers, stateful environments, rollouts, materialized inputs, aggregate metrics, reward profiling, benchmarks, training environments, custom environment tutorials, local and hosted model providers, and public dataset/config references.

No upstream code, README prose beyond short metadata facts, workflow YAML, pyproject content beyond short metadata facts, docs prose beyond short metadata facts, benchmark rows, environment configs, datasets, verifier logic, agent harness code, rollouts, aggregate metrics files, model outputs, prompts, examples, screenshots, package metadata beyond short metadata facts, or implementation details were copied into AMC.

## Relevance decision

GAP-1015 is relevant to AMC only as public-methodology boundary evidence. NeMo Gym is an adjacent environment/evaluation framework with releases, docs, CLI workflows, benchmark/environment catalogs, rollout collection, and CI. Those facts reinforce why AMC public score changes need a methodology version, changelog, deprecation notice, migration guidance, known limitations, evidence taxonomy, regression thresholds, and stable report-binding proof.

NeMo Gym repo evidence alone cannot justify an AMC public methodology version bump. Its release tags, package version, docs workflow, benchmark environment catalog, rollout outputs, reward profiling, and CI/test workflows govern NeMo Gym package behavior, not AMC score semantics, badge semantics, diagnostic evidence taxonomy, deprecation policy, migration guidance, or public changelog entries. This slice is skipped as public-methodology implementation evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only. No AMC score formula, L0-L5 threshold, evidence taxonomy, methodology version, changelog, deprecation notice, migration guidance, known-limitation text, or badge comparability changed. |
| Shield | Context only. Environment/verifier and benchmark signals do not create AMC assurance evidence without AMC-owned signed evidence. |
| Enforce | Not changed. No runtime policy, sandbox, verifier, or environment enforcement path changed. |
| Vault | Not changed. No dataset storage, credential, API key, or cache behavior was imported. |
| Watch | Context only. Rollouts, aggregate metrics, and CI labels do not create AMC drift monitoring or evidence drilldown behavior. |
| Fleet | Context only. Agent harnesses and environment orchestration do not change AMC fleet topology evidence. |
| Passport | Not changed. No proof-bundle schema or NeMo Gym trust-token adapter changed. |
| Comply | Not changed. No compliance mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed.

No public methodology version bump was made because the verified source does not alter AMC public scoring semantics, evidence taxonomy, methodology versioning, badge comparability, deprecation notices, migration guidance, known limitations, or report-binding proof.

The focused regression test proves the live source metadata and skip decision are documented, `getPublicMethodologyManifest()` does not include NeMo Gym as an AMC methodology source, and public methodology/badge/scoring modules do not contain source-specific NeMo Gym, release, version, commit, repository, or identifier strings.

## Fail-closed rule

NeMo Gym repository metadata, GitHub stars, forks, issues, topics, homepage, README sha, LICENSE sha, pyproject sha, package_info sha, docs README sha, workflow shas, release tag, package version `0.4.0rc0`, tag list, docs site HTTP 200, environment labels, benchmark labels, reproducible evaluation labels, shared environments and verifiers labels, rollout labels, aggregate metrics labels, reward profiling labels, CLI labels, dataset/config labels, Fern docs labels, CI/test labels, local backlog text, or source identity cannot prove AMC public methodology versioning.

An AMC public methodology change can pass only when there is an AMC-owned scoring semantic change with explicit methodology version, changelog, deprecation notice, migration guidance, known limitations, evidence taxonomy, report-binding proof, tests, and public documentation.

## No-bloat boundary

No NeMo Gym integration, environment runner, benchmark runner, rollout collector, reward profiler, verifier adapter, model-provider adapter, dataset downloader, config parser, Hydra/OmegaConf bridge, Ray runner, FastAPI server, resource server, response agent harness, training workflow, wheel-install test mirror, Fern docs importer, docs-preview workflow mirror, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Score method, public methodology version bump, copied source code, copied configs, copied README prose, copied workflow YAML, copied docs prose, copied pyproject content, copied package metadata, copied benchmark rows, copied datasets, copied rollouts, copied aggregate metrics, copied model outputs, copied examples, or source-specific subsystem was added.

NeMo Gym remains source-review signal only.

## Verification

- Expected-red focused test before doc: `npx vitest run tests/gap1015NemoGymPublicMethodologyBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1015-nemo-gym-public-methodology.md` did not exist; the implementation guard passed.
- Live source retrieval:
  - `curl -fsSL https://api.github.com/repos/NVIDIA-NeMo/Gym`
  - `curl -fsSL https://api.github.com/repos/NVIDIA-NeMo/Gym/readme`
  - `curl -fsSL https://api.github.com/repos/NVIDIA-NeMo/Gym/license`
  - `curl -fsSL 'https://api.github.com/repos/NVIDIA-NeMo/Gym/contents?ref=main'`
  - `curl -fsSL https://api.github.com/repos/NVIDIA-NeMo/Gym/commits/main`
  - `curl -fsSL https://api.github.com/repos/NVIDIA-NeMo/Gym/releases/latest`
  - `curl -fsSL 'https://api.github.com/repos/NVIDIA-NeMo/Gym/tags?per_page=10'`
  - `curl -fsSL https://raw.githubusercontent.com/NVIDIA-NeMo/Gym/main/README.md`
  - `curl -fsSL https://raw.githubusercontent.com/NVIDIA-NeMo/Gym/main/pyproject.toml`
  - `curl -fsSL https://raw.githubusercontent.com/NVIDIA-NeMo/Gym/main/nemo_gym/package_info.py`
  - `curl -fsSL https://raw.githubusercontent.com/NVIDIA-NeMo/Gym/main/.github/workflows/unit-tests.yml`
  - `curl -fsSL https://raw.githubusercontent.com/NVIDIA-NeMo/Gym/main/.github/workflows/full-test-suite.yml`
  - `curl -fsSL https://raw.githubusercontent.com/NVIDIA-NeMo/Gym/main/.github/workflows/fern-docs-ci.yml`
  - `curl -fsSL https://raw.githubusercontent.com/NVIDIA-NeMo/Gym/main/docs/README.md`
  - `curl -I -L https://docs.nvidia.com/nemo/gym/main/about/`
- `npx vitest run tests/gap1015NemoGymPublicMethodologyBoundary.test.ts --reporter=dot`: PASS, 1 file / 3 tests.
- `npx vitest run tests/gap1013JamAiBasePublicMethodologyBoundary.test.ts tests/gap1015NemoGymPublicMethodologyBoundary.test.ts --reporter=dot`: PASS, 2 files / 6 tests.
- `git diff --check -- . ':(exclude)AMC_OS'`: PASS.
- Narrow no-bloat token scan over `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, and `src/badge/badgeCli.ts`: PASS, no NeMo Gym identifiers.
- `npm run typecheck`: PASS.
- `npm test -- --reporter=dot`: PASS, 862 files / 7,435 tests.
