# GAP-1024 - TheAgentCompany provider-drift boundary

- Gap: `GAP-1024`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: `TheAgentCompany/TheAgentCompany`
- Retrieval: live GitHub repository metadata, GitHub REST repository/default-branch/contents/releases/languages APIs, raw README, raw `evaluation/README.md`, raw `pyproject.toml`, and raw license fetched on 2026-06-24
- Status: Done

## Relevance decision

`TheAgentCompany/TheAgentCompany` is relevant to AMC as source-review context for provider/model drift canaries that exercise realistic professional-work agent behavior. It maps to the existing AMC Score/Shield/Watch provider-drift primitive because AMC already requires provider version, replayable canary results, signed evidence refs, drift statistic, and Watch alert or waiver before any provider-drift claim can pass.

Live source metadata verified:

- GitHub repository: `https://github.com/TheAgentCompany/TheAgentCompany`
- GitHub API: `https://api.github.com/repos/TheAgentCompany/TheAgentCompany`
- README: `https://raw.githubusercontent.com/TheAgentCompany/TheAgentCompany/main/README.md`
- Evaluation README: `https://raw.githubusercontent.com/TheAgentCompany/TheAgentCompany/main/evaluation/README.md`
- Release: `https://github.com/TheAgentCompany/TheAgentCompany/releases/tag/1.0.0`
- Repository full name: `TheAgentCompany/TheAgentCompany`
- GitHub description: "An agent benchmark with tasks in a simulated software company."
- Homepage: `https://the-agent-company.com`
- Public, non-fork, non-archived repository.
- License: `MIT License`
- primary language `Python`
- Stars `731`
- Forks `118`
- Watchers `11`
- Topics include `agent`, `ai`, `ai-benchmark`, `ai-research`, `benchmark`, and `llm`
- Created `2024-03-11T09:08:11Z`, pushed `2025-11-17T20:31:16Z`, updated `2026-06-24T16:10:46Z`
- default branch `main`; protected `true`; default branch commit `98b68ef82a47690c316f42fddb05baafaab56851`
- release `1.0.0`, published `2024-12-20T02:40:53Z`
- Top-level repository shape includes `docs`, `evaluation`, `servers`, and `workspaces`
- Evaluation files include `evaluation/run_eval.py`, `evaluation/run_eval.sh`, `evaluation/summarise_results.py`, and `evaluation/build_oh_runtime_images.sh`
- `pyproject.toml` reports pyproject version `1.0.0`, Python `>=3.12,<3.14`, and OpenHands `0.42.0`
- Language API reports Python, Makefile, Dockerfile, Shell, Go, Java, C++, TeX, and Batchfile content.
- README/evaluation docs describe Docker image task packaging, trajectories, evaluation scores, final agent states, screenshots, and summary generation.

The source is not a reason to add a benchmark runner, ingest upstream task data, or claim parity with the upstream benchmark. AMC can reference this source only as context attached to AMC-owned canary rows and receipts.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only when AMC-owned provider-drift score deltas are computed from replayable canary rows and signed evidence. |
| Shield | Relevant only when task outcomes include safety, refusal, invalid-action, guardrail, or policy-behavior metrics in AMC-owned evidence. |
| Enforce | No runtime enforcement change; provider-drift CI/lifecycle gates already fail closed through the existing provider-drift primitive. |
| Vault | No secrets, DLP, privacy, or storage change. |
| Watch | Relevant when drift statistics produce Watch alerts or documented waivers tied to provider/version changes. |
| Fleet | Contextual only for fleet-style professional-work agents; no orchestration or simulated-company subsystem was added. |
| Passport | No external proof-token change. |
| Comply | No compliance mapping change. |

## Product closure

No product code change was needed. GAP-1024 is closed by documenting the relevance boundary and adding regression coverage that proves:

- existing `runProviderDriftBenchmark` can represent professional-work provider-drift canaries with source refs attached to AMC-owned evidence;
- `buildProviderDriftEvalPack`, `buildProviderDriftWatchAlerts`, and `buildProviderDriftCiGate` preserve replayable receipts, Watch alert behavior, and fail-closed CI behavior;
- repository metadata, README text, topics, release tags, license facts, default-branch facts, language mix, Docker task packaging, OpenHands configuration, trajectories, evaluation scores, screenshots, or upstream benchmark identity cannot replace AMC-owned signed drift evidence.

## Fail-closed rule

The following evidence is metadata-only and must fail closed if it is used without AMC-owned provider-drift proof:

- GitHub repository URL/API response, stars, forks, watchers, topics, license, default branch, branch protection, commit SHA, release tag, language mix, repository tree, README, evaluation README, pyproject dependency metadata, homepage, benchmark framing, Docker image structure, OpenHands configuration, task instructions, trajectories, evaluation scores, final states, screenshots, or summary report references.

A passing AMC provider-drift claim must include provider version, canary results, drift statistic, alert or waiver, replayable eval-pack rows, row hashes, signed evidence refs, evaluator config hash, generated test data hash, observability trace export, metric report, thresholds, and CI/lifecycle gate outcome.

## No-bloat boundary

AMC did not add a TheAgentCompany runner, repo importer, benchmark clone, task loader, Docker image builder, OpenHands adapter, simulated-company workspace, browser automation harness, code-execution harness, NPC/chat evaluator, leaderboard importer, experiment result parser, external dependency, API route, CLI command, Studio panel, Watch panel, source-specific provider-drift module, copied tasks, copied task instructions, copied benchmark data, copied README content, copied evaluator logic, copied screenshots, copied figures, copied configs, or copied source code.

External sources remain source-review signals only. AMC’s product primitive remains generic provider-drift evidence over Score/Shield/Watch.

## Verification

- `gh repo view TheAgentCompany/TheAgentCompany --json nameWithOwner,description,stargazerCount,forkCount,watchers,primaryLanguage,repositoryTopics,licenseInfo,defaultBranchRef,pushedAt,updatedAt,createdAt,homepageUrl,url,isArchived,isFork,isPrivate` passed.
- `curl -sS https://api.github.com/repos/TheAgentCompany/TheAgentCompany | jq ...` passed.
- `curl -sS https://api.github.com/repos/TheAgentCompany/TheAgentCompany/readme | jq ...` passed.
- `curl -sS 'https://api.github.com/repos/TheAgentCompany/TheAgentCompany/contents?ref=main' | jq ...` passed.
- `curl -sS https://api.github.com/repos/TheAgentCompany/TheAgentCompany/branches/main | jq ...` passed.
- `curl -sS 'https://api.github.com/repos/TheAgentCompany/TheAgentCompany/releases?per_page=5' | jq ...` passed.
- `curl -sS https://raw.githubusercontent.com/TheAgentCompany/TheAgentCompany/main/README.md | rg ...` passed.
- `curl -sS https://raw.githubusercontent.com/TheAgentCompany/TheAgentCompany/main/evaluation/README.md | rg ...` passed.
- `curl -sS https://raw.githubusercontent.com/TheAgentCompany/TheAgentCompany/main/pyproject.toml | sed -n '1,120p'` passed.
- `curl -sS https://raw.githubusercontent.com/TheAgentCompany/TheAgentCompany/main/LICENSE | sed -n '1,20p'` passed.
- TDD expected failure before doc creation passed as expected: missing source-review doc was the only failing condition, while 3 provider-drift primitive tests passed.
- `npx vitest run tests/gap1024TheAgentCompanyProviderDriftBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- `npx vitest run tests/gap1023AiAgentBehavioralScienceProviderDriftBoundary.test.ts tests/gap1024TheAgentCompanyProviderDriftBoundary.test.ts --reporter=dot` passed, 2 files / 8 tests.
- `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Narrow token scan over `src/benchmarks/providerDriftBenchmark.ts`, `src/watch/providerDriftAlerts.ts`, and `src/api/benchmarkRouter.ts` found no GAP-1024 TheAgentCompany identifiers.
- `npm run typecheck` passed.
- `npm test -- --reporter=dot` passed, 871 files / 7,471 tests.
