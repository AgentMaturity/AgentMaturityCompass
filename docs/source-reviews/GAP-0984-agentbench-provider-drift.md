# GAP-0984 - AgentBench provider-drift boundary

- Gap: `GAP-0984`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: live GitHub repository/API at `https://github.com/THUDM/AgentBench`, raw README at `https://raw.githubusercontent.com/THUDM/AgentBench/main/README.md`, raw license at `https://raw.githubusercontent.com/THUDM/AgentBench/main/LICENSE`, raw requirements file at `https://raw.githubusercontent.com/THUDM/AgentBench/main/requirements.txt`, `git ls-remote`, and local backlog metadata.
- Retrieval: `2026-06-24` live source review through GitHub repository page, GitHub CLI/API, raw GitHub content, and `git ls-remote`.
- Status: closed through existing provider/model drift benchmark receipts only; no AgentBench runner, AgentRL integration, benchmark importer, dataset importer, Docker Compose path, leaderboard mirror, task worker, provider adapter, API route, CLI command, Studio panel, Watch monitor, Shield verifier, or source-specific canary runner added.
- Linear: `AMC-1263`

## Live source metadata

The live GitHub page identifies `THUDM/AgentBench` as a Public repository with 75 commits, Apache-2.0 license metadata, 3.5k stars, 263 forks, 26 watchers, Python/Shell/PDDL/Dockerfile language mix, and No releases published. The GitHub API identifies the description as `A Comprehensive Benchmark to Evaluate LLMs as Agents (ICLR'24)`.

GitHub API metadata returned `archived` false, `disabled` false, `fork` false, default branch `main`, language Python, Apache License 2.0, 3,512 stars, 263 forks, 74 open issues, watchers_count `3512`, created_at `2023-07-28T04:32:06Z`, pushed_at `2026-02-08T17:01:05Z`, and updated_at `2026-06-24T09:56:24Z`. Topics include chatgpt, gpt-4, llm, and llm-agent.

`git ls-remote https://github.com/THUDM/AgentBench.git HEAD refs/heads/main` verified default branch `main` at `d1e4a10db08c87075c78972e48ecc182be03e2d5`. Raw README, LICENSE, and requirements files returned `HTTP/2 200`.

Relevant source-review signals include AgentBench FC, AgentRL integration, function-calling benchmark framing, fully containerized deployment support, Docker Compose, task contexts for `alfworld`, `dbbench`, `knowledgegraph`, `os_interaction`, and `webshop`, VisualAgentBench, original AgentBench coverage across 8 distinct environments, Dev and Test splits, multi-turn interaction volume, Docker/task-worker operational constraints, model leaderboard context, and resource warnings.

No AgentBench code, README prose beyond short metadata facts, docs prose, configs, task definitions, datasets, Docker files, prompts, benchmark rows, leaderboard rows, screenshots, images, videos, generated outputs, model responses, requirements content beyond minimal metadata facts, or implementation details were copied into AMC.

## Relevance decision

GAP-0984 is relevant to AMC because AgentBench is an agent benchmark source where model/provider updates can shift task success, refusal, invalid-action, latency, cost, guardrail, and tool/environment-completion distributions while an agent product appears unchanged.

The accepted AMC primitive already exists: `runProviderDriftBenchmark`, `buildProviderDriftEvalPack`, `buildProviderDriftWatchAlerts`, and `buildProviderDriftCiGate`. Valid proof requires provider version, canary results, drift statistic, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, row hashes, CI/lifecycle gate proof, source refs, and alert or waiver output. Repository metadata, leaderboard labels, Docker/task labels, and benchmark identity alone must not affect Score, Shield, or Watch.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through AMC-owned provider canary score rows, metric suites, thresholds, dataset hashes, and row hashes. |
| Shield | Relevant when drift changes refusal, invalid-action, guardrail, unsafe tool use, tool-call validity, or environment-completion metrics. |
| Enforce | No runtime policy, model router, task worker, Docker service, benchmark runner, or circuit breaker changed. |
| Vault | No credential, data residency, secret storage, artifact storage, or benchmark data storage behavior changed. |
| Watch | Relevant through existing Watch provider-drift alerts and CI/lifecycle gate receipts. |
| Fleet | Multi-environment and multi-agent benchmark context only; no Fleet topology or orchestration behavior changed. |
| Passport | Existing provider-drift receipts can feed proof bundles, but no Passport schema changed. |
| Comply | License and benchmark context only; no compliance mapping changed. |

## Product closure

No product code changed. The focused regression proves existing provider-drift primitives can accept AgentBench-style multi-environment agent benchmark context only when AMC has signed canary rows, provider versions, metric suites, evaluator hashes, trace exports, dataset hashes, observability proof, thresholds, and CI gate evidence.

The positive path produces a replayable provider-drift eval pack and passes the CI gate without Watch alerts. The negative path fails closed when AgentBench repository metadata, README metadata, license metadata, requirements metadata, task labels, leaderboard labels, AgentBench FC labels, AgentRL labels, Docker Compose labels, language labels, topic labels, and source identity replace AMC-owned signed canary proof.

## Fail-closed rule

AgentBench repository identity, GitHub star/fork/issue/watcher counts, default-branch SHA, README labels, Apache License 2.0 label, Python language label, topics, AgentBench FC label, AgentRL label, function-calling label, VisualAgentBench label, Docker Compose label, task names, Dev and Test split labels, leaderboard labels, resource warnings, No releases published status, local backlog metadata, or source identity alone cannot prove provider/model drift.

A provider/model drift claim must fail closed unless provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, evaluator config hash, generated test data hash, trace export hash, metric report hash, threshold config, row hashes, CI or lifecycle receipt, Watch alert projection, source refs, and no-copy proof exist.

## No-bloat boundary

No AgentBench runner, AgentRL integration, benchmark importer, dataset importer, task loader, Docker Compose integration, task-worker launcher, leaderboard mirror, function-calling benchmark adapter, VisualAgentBench adapter, ALFWorld/WebShop/Mind2Web/Freebase integration, model leaderboard importer, requirements importer, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Score method, Passport field, methodology version bump, diagnostic question-bank migration, provider router, package dependency, or source-specific provider-drift lens was added.

No upstream code, README prose beyond short metadata facts, docs prose, configs, task definitions, datasets, Docker files, prompts, benchmark rows, leaderboard rows, screenshots, images, videos, generated outputs, model responses, requirements content beyond minimal metadata facts, or implementation details were copied.

## Verification

- TDD expected failure: `npx vitest run tests/gap0984AgentBenchProviderDriftBoundary.test.ts --reporter=dot` failed before this doc existed with `ENOENT: no such file or directory, open 'docs/source-reviews/GAP-0984-agentbench-provider-drift.md'`; 3 provider-drift primitive tests passed.
- Focused regression: `npx vitest run tests/gap0984AgentBenchProviderDriftBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired regression: `npx vitest run tests/gap0983AiInfraGuardPublicMethodologyBoundary.test.ts tests/gap0984AgentBenchProviderDriftBoundary.test.ts --reporter=dot` passed, 2 files / 7 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 831 files / 7,320 tests.
