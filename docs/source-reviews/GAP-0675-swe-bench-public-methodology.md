# GAP-0675 — SWE-bench public-methodology boundary

- Gap: `GAP-0675`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://www.swebench.com`
- Retrieval: `2026-06-21` via browser access to the live SWE-bench website; shell network remains DNS-restricted in this environment.
- Status: skipped as AMC public-methodology evidence; no methodology version bump or product code change.

## Live source metadata

The live SWE-bench page identifies the site as `Official Leaderboards` and exposes benchmark variants including SWE-bench, SWE-bench Verified, SWE-bench Multilingual, SWE-bench Multimodal, and SWE-bench Lite. The page shows comparison controls for agents/models and states that each entry reports the `% Resolved` metric across benchmark instance counts including `2294 Full`, `500 Verified`, `300 Lite & Multilingual`, and `517 Multimodal`.

These metadata facts identify the source and benchmark context only. No leaderboard rows, model names, result tables, chart data, JSON/PNG exports, website code, dataset rows, benchmark tasks, docs prose, screenshots, or implementation details were copied into AMC.

## Relevance decision

SWE-bench is relevant to AMC as a software-engineering agent benchmark context, but the gap dimension is public methodology versioning. The live site does not define an AMC scoring-methodology version, evidence taxonomy change, L0-L5 threshold migration, question-bank migration, badge comparability rule, Shield threshold, Watch drift policy, deprecation notice, or migration guidance.

Therefore SWE-bench leaderboard metadata alone must fail closed for AMC public methodology claims. GAP-0675 is closed as a documented no-op: benchmark context only, no public methodology version change.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Background benchmark context only; no accepted public scoring-methodology proof. |
| Shield | Background software-agent evaluation context only; no new safety threshold or assurance rule. |
| Watch | Background benchmark/leaderboard context only; no new drift methodology or monitor integration. |
| Enforce | No policy-enforcement or coding-agent sandbox change. |
| Vault | No dataset, repository, or private-code storage feature. |
| Fleet | No benchmark runner, agent orchestration, or trust-topology implementation. |
| Passport | No portable proof-bundle field or credential change. |
| Comply | No compliance mapping or regulated-domain claim. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `src/badge/badgeCli.ts`, API, CLI, Studio, diagnostic question bank, or scoring code changed for GAP-0675. Existing AMC public-methodology primitives remain the only path for a public methodology claim: methodology id/version/hash, changelog, deprecation notice, migration guidance, validation proof, badge/report binding, signed evidence refs, row hashes, and no-copy proof.

## Fail-closed rule

SWE-bench site metadata, leaderboard labels, benchmark variant names, `% Resolved` labels, instance counts, comparison controls, agent/model filters, chart/export labels, news entries, citations, local backlog metadata, or source identity alone must fail closed for public methodology claims. Passing evidence requires AMC-owned methodology versioning receipts, versioned scoring rules, changelog rows, migration guidance, validation artifacts, signed evidence refs, row hashes, badge assurance, and report-binding proof.

## No-bloat boundary

No SWE-bench dataset mirror, leaderboard importer, resolved-rate adapter, benchmark runner, task scraper, model-result parser, chart/export parser, public methodology version bump, badge query parameter, API route, CLI command, Studio panel, parity layer, or source-specific scoring path was added. No leaderboard rows, model names, result tables, chart data, JSON/PNG exports, website code, dataset rows, benchmark tasks, docs prose, screenshots, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0675SweBenchPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
