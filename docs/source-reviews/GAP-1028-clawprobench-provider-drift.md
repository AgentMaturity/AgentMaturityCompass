# GAP-1028 - ClawProBench provider-drift boundary

- Gap: `GAP-1028`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: `suyoumo/ClawProBench`
- Retrieval: live GitHub repository metadata, GitHub REST repository/default-branch/contents/readme/releases/tags/languages APIs, raw README, raw `requirements.txt`, raw license, homepage headers, and local backlog metadata fetched on 2026-06-24
- Status: Done

## Relevance decision

`suyoumo/ClawProBench` is relevant to AMC as source-review context for provider/model drift canaries that exercise live-runtime agent behavior, deterministic grading, repeated-trial reliability, scenario coverage, leaderboard metrics, refusals, invalid actions, latency, and cost. It maps to the existing AMC Score/Shield/Watch provider-drift primitive because AMC already requires provider version, canary results, signed evidence refs, drift statistic, and Watch alert or waiver before any provider-drift claim can pass.

Live source metadata verified:

- GitHub repository: `https://github.com/suyoumo/ClawProBench`
- GitHub API: `https://api.github.com/repos/suyoumo/ClawProBench`
- README API: `https://api.github.com/repos/suyoumo/ClawProBench/readme`
- README: `https://raw.githubusercontent.com/suyoumo/ClawProBench/main/README.md`
- License: `https://raw.githubusercontent.com/suyoumo/ClawProBench/main/LICENSE`
- Requirements: `https://raw.githubusercontent.com/suyoumo/ClawProBench/main/requirements.txt`
- Homepage/leaderboard: `https://suyoumo.github.io/bench/`
- Repository full name: `suyoumo/ClawProBench`
- GitHub description: ClawProBench is a live-first benchmark harness for evaluating LLM agents in the OpenClaw runtime with deterministic grading and repeated-trial reliability.
- Public, non-fork, non-archived repository.
- License metadata and license file: `Apache License 2.0`
- primary language `Python`
- Stars `785`
- Forks `52`
- Watchers `12`
- open issues `0`
- Topics include `agent`, `benchmark`, `evaluation`, `harness`, `leaderboard`, `llm`, and `openclaw`
- Created `2025-03-02T09:15:10Z`, pushed `2026-06-08T06:35:32Z`, updated `2026-06-24T17:19:16Z`
- default branch `main`; protected `false`; default branch commit `1d7a2bdaf6c3280622c174231a3e9568538fdd3e`
- README sha `66fb39d27cb9d8ed79b02491ad57896b3efb2a16`, size 12185
- Top-level repository shape includes `config/openclaw.json.template`, `config/pricing.yaml`, `custom_checks`, `datasets`, `docs`, `fixtures`, `frameworks`, `harness`, `mock_tools`, `results`, `run.py`, `scenarios`, `scripts`, and `tests`
- GitHub languages API reports Python and Shell
- Requirements include `PyYAML>=6.0`, `fastapi>=0.110`, and `uvicorn>=0.29`
- Docs contents include `docs/assets`, `docs/quality`, and `docs/validation`
- Homepage returned homepage HTTP/2 200, `content-type: text/html; charset=utf-8`, `content-length: 773115`, `last-modified: Thu, 18 Jun 2026 15:38:05 GMT`, and GitHub Pages/Fastly headers.
- GitHub releases API returned no releases returned.
- GitHub tags API returned no tags returned.
- README/source-review labels include 102 active scenarios, 162 catalog scenarios, core profile, deterministic grading, repeated-trial reliability, pass^3, pass@3, FinalScore, avg_score, max_score, cost, latency, resume metadata, isolated live runs, scenario profiles, structured reports, and OpenClaw runtime requirements.

The source is not a reason to add a ClawProBench runner, import scenarios or leaderboards, mirror OpenClaw runtime behavior, or claim parity with the benchmark. AMC can reference this source only as context attached to AMC-owned canary rows and receipts.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only when AMC-owned provider-drift score deltas are computed from replayable live-runtime canary rows and signed evidence. |
| Shield | Relevant only when live-runtime outcomes include safety, refusal, invalid-action, guardrail, or scenario-specific risk metrics in AMC-owned evidence. |
| Enforce | No runtime enforcement change; provider-drift CI/lifecycle gates already fail closed through the existing provider-drift primitive. |
| Vault | No secrets, dataset storage, privacy, or retention change. |
| Watch | Relevant when provider/version changes produce Watch alerts or documented waivers tied to live-runtime drift. |
| Fleet | Contextual only for live-runtime agent benchmarking; no orchestration, OpenClaw, or leaderboard subsystem was added. |
| Passport | No external proof-token change. |
| Comply | No compliance mapping change. |

## Product closure

No product code change was needed. GAP-1028 is closed by documenting the relevance boundary and adding regression coverage that proves:

- existing `runProviderDriftBenchmark` can represent live-runtime provider-drift canaries with source refs attached to AMC-owned evidence;
- `buildProviderDriftEvalPack`, `buildProviderDriftWatchAlerts`, and `buildProviderDriftCiGate` preserve replayable receipts, Watch alert behavior, and fail-closed CI behavior;
- GitHub repository metadata, README labels, license facts, default branch, commit SHA, requirements, homepage headers, scenario counts, catalog counts, profile labels, leaderboard labels, deterministic-grading labels, repeated-trial labels, pass^3, pass@3, FinalScore, avg_score, max_score, cost, latency, resume metadata, OpenClaw runtime labels, or source identity cannot replace AMC-owned signed drift evidence.

## Fail-closed rule

The following evidence is metadata-only and must fail closed if it is used without AMC-owned provider-drift proof:

- GitHub repository URL/API response, stars, forks, watchers, issues, topics, license, default branch, commit SHA, empty release/tag metadata, language mix, repository tree, README, requirements, homepage headers, scenario counts, catalog counts, profile names, leaderboard labels, OpenClaw labels, deterministic grading labels, repeated-trial reliability labels, pass^3/pass@3 labels, score formula labels, cost/latency labels, local backlog text, or source identity.

A passing AMC provider-drift claim must include provider version, canary results, drift statistic, alert or waiver, replayable eval-pack rows, row hashes, signed evidence refs, evaluator config hash, generated test data hash, observability trace export, metric report, thresholds, and CI/lifecycle gate outcome.

## No-bloat boundary

AMC did not add a ClawProBench runner, OpenClaw adapter, leaderboard clone, repository importer, package dependency, scenario loader, mock-tool runner, custom-check runner, pricing parser, results parser, pass^3/pass@3 calculator, FinalScore calculator, closed-dataset importer, homepage mirror, API route, CLI command, Studio panel, Watch panel, source-specific provider-drift module, copied README prose, copied docs prose, copied benchmark data, copied scenarios, copied datasets, copied prompts, copied examples, copied configs, copied results, copied screenshots, copied source code, or copied model outputs.

External sources remain source-review signals only. AMC’s product primitive remains generic provider-drift evidence over Score/Shield/Watch.

## Verification

- `gh repo view suyoumo/ClawProBench --json nameWithOwner,description,stargazerCount,forkCount,watchers,primaryLanguage,repositoryTopics,licenseInfo,defaultBranchRef,pushedAt,updatedAt,createdAt,homepageUrl,url,isArchived,isFork,isPrivate` passed.
- `curl -sS -w '\\nHTTP_STATUS:%{http_code}\\n' https://api.github.com/repos/suyoumo/ClawProBench | sed -n '1,160p'` passed.
- `curl -sSIL https://github.com/suyoumo/ClawProBench | sed -n '1,100p'` passed.
- `curl -sS 'https://api.github.com/search/repositories?q=ClawProBench' | jq ...` passed.
- `curl -sS https://api.github.com/repos/suyoumo/ClawProBench/readme | jq ...` passed.
- `curl -sS 'https://api.github.com/repos/suyoumo/ClawProBench/contents?ref=main' | jq ...` passed.
- `curl -sS https://api.github.com/repos/suyoumo/ClawProBench/branches/main | jq ...` passed.
- `curl -sS 'https://api.github.com/repos/suyoumo/ClawProBench/languages' | jq` passed.
- `curl -sS 'https://api.github.com/repos/suyoumo/ClawProBench/releases?per_page=5' | jq ...` passed and returned no release rows.
- `curl -sS 'https://api.github.com/repos/suyoumo/ClawProBench/tags?per_page=10' | jq ...` passed and returned no tag rows.
- `curl -sS https://raw.githubusercontent.com/suyoumo/ClawProBench/main/README.md | rg ...` passed.
- `curl -sS https://raw.githubusercontent.com/suyoumo/ClawProBench/main/LICENSE | sed -n '1,12p'` passed.
- `curl -sS https://raw.githubusercontent.com/suyoumo/ClawProBench/main/requirements.txt | sed -n '1,80p'` passed.
- `curl -sSIL https://suyoumo.github.io/bench/ | sed -n '1,80p'` passed.
- TDD expected failure before doc creation passed as expected: missing source-review doc was the only failing condition, while 3 provider-drift primitive tests passed.
- `npx vitest run tests/gap1028ClawProBenchProviderDriftBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- `npx vitest run tests/gap1027AresProviderDriftBoundary.test.ts tests/gap1028ClawProBenchProviderDriftBoundary.test.ts --reporter=dot` passed, 2 files / 8 tests.
- `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Narrow token scan over `src/benchmarks/providerDriftBenchmark.ts`, `src/watch/providerDriftAlerts.ts`, and `src/api/benchmarkRouter.ts` found no GAP-1028 ClawProBench identifiers.
- `npm run typecheck` passed.
- `npm test -- --reporter=dot` passed, 875 files / 7,486 tests.
