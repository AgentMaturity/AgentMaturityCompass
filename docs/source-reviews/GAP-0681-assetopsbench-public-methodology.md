# GAP-0681 — AssetOpsBench public-methodology boundary

- Gap: `GAP-0681`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/IBM/AssetOpsBench`
- Retrieval: `2026-06-21` via browser access to the live GitHub repository page; shell network remains DNS-restricted in this environment.
- Status: skipped as AMC public-methodology evidence; no methodology version bump or product code change.

## Live source metadata

The live GitHub page identifies `IBM/AssetOpsBench` as a public repository on branch `main`, with Apache-2.0 license, `1.9k stars`, `278 forks`, `27 issues`, `14 pull requests`, `793 commits`, `No releases published`, and `Python 99.7%` language share. The repository is positioned as an Industry 4.0 asset operations and maintenance agent benchmark/framework and lists topics including `iot`, `predictive-maintenance`, `time-series-forecasting`, `condition-based-maintenance`, `llm-agents`, `model-context-protocol`, `hvac-maintenance`, and `ai-for-physical-assets`.

The live README metadata also says the work is accepted at `KDD 2026`, and its at-a-glance summary lists `9 asset classes`, `141+ scenarios`, `5 domain agents`, `2 orchestration frameworks`, `20+` university extensions, and `500+` competition submissions. It describes MCP support, domain-specific MCP servers, agent frameworks, leaderboards evaluated with `7 Large Language Models`, and scoring with `Llama-4-Maverick-17B`.

These facts identify the source and benchmark context only. No upstream code, README prose beyond short metadata facts, setup commands, scenario rows, leaderboard rows, publication lists, competition records, dataset contents, screenshots, examples, prompts, configs, docs text, or implementation details were copied into AMC.

## Relevance decision

AssetOpsBench is relevant to AMC as an external benchmark context for agent evaluation, multi-agent orchestration, MCP tooling, industrial operations, and evidence-bearing scenario evaluation. It is not an AMC public methodology version source. The live repository does not define AMC scoring-methodology ids, L0-L5 threshold semantics, question-bank migrations, badge comparability rules, deprecation notices, migration guidance, or AMC report/badge binding.

AssetOpsBench repository metadata alone must fail closed for AMC public methodology claims. GAP-0681 is closed as a documented no-op: benchmark context only, no public methodology version change.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Benchmark context only; no accepted public scoring-methodology proof. |
| Shield | Industrial/MCP benchmark context only; no new assurance threshold or Shield rule. |
| Watch | Benchmark/leaderboard context only; no new live-drift methodology or monitor integration. |
| Enforce | No policy-enforcement, MCP server, or runtime guardrail behavior changed. |
| Vault | No industrial dataset, sensor, work-order, or private asset-data storage feature. |
| Fleet | No AssetOpsBench runner, domain-agent orchestration, MCP adapter, or trust topology implementation. |
| Passport | No portable proof-bundle field or credential change. |
| Comply | No industrial compliance, safety, or regulated-domain mapping. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `src/badge/badgeCli.ts`, API, CLI, Studio, diagnostic question bank, domain pack, Shield runner, Watch monitor, or scoring code changed for GAP-0681. Existing AMC public-methodology primitives remain the only path for a public methodology claim: methodology id/version/hash, changelog, deprecation notice, migration guidance, validation proof, badge/report binding, signed evidence refs, row hashes, and no-copy proof.

## Fail-closed rule

AssetOpsBench GitHub metadata, stars, forks, issues, pull requests, license labels, branch names, commit counts, repository topics, KDD/venue labels, asset-class counts, scenario counts, domain-agent counts, orchestration labels, MCP labels, leaderboard labels, LLM judge labels, competition-submission counts, local backlog metadata, or source identity alone must fail closed for public methodology claims. Passing evidence requires AMC-owned methodology versioning receipts, versioned scoring rules, changelog rows, migration guidance, validation artifacts, signed evidence refs, row hashes, badge assurance, report binding, and no-copy proof.

## No-bloat boundary

No AssetOpsBench benchmark importer, Industry 4.0 domain pack, MCP server adapter, industrial scenario mirror, Hugging Face dataset importer, leaderboard importer, LLM-judge wrapper, domain-agent runner, MetaAgent/AgentHive adapter, work-order or sensor connector, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream code, README prose, setup commands, scenario rows, leaderboard rows, publication lists, competition records, dataset contents, screenshots, examples, prompts, configs, docs text, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0681AssetOpsBenchPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
