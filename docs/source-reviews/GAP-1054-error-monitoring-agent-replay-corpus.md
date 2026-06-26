# GAP-1054 - error-monitoring-agent replay corpus

- Gap: `GAP-1054`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: `airweave-ai/error-monitoring-agent`
- Retrieval: GitHub CLI/API, repository contents API, branch API, commit API, release/tag API, raw README/docs headers, raw README skim, and local backlog metadata on 2026-06-25.
- Status: Done - relevance boundary documented and regression-tested through existing AMC replay-corpus primitives.

## Relevance decision

`airweave-ai/error-monitoring-agent` is relevant to AMC as an external source-review signal for replayable evaluation of production-style error-monitoring agents. The repository describes an Intelligent error monitoring agent using Airweave context search over code, tickets, and Slack discussions, with sample data, semantic clustering, context search, severity analysis, and Linear and Slack preview/integration flows.

That maps to AMC only through existing Score/Shield/Watch replay-corpus receipts: a replay manifest, fixture hash, fixed seed, score delta, CI receipt, source refs, row hashes, signed evidence refs, and Score/Shield/Watch surface coverage.

It does not justify adding an Airweave integration, error-monitoring-agent runner, Sentry/Azure/Datadog source adapter, Linear/Slack alert integration, demo data importer, pipeline replayer, WebSocket mirror, frontend demo panel, source-specific replay module, or API/CLI/Studio route.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only when an AMC-owned replay fixture produces scored baseline/candidate evidence with a replay manifest and score delta. |
| Shield | Relevant only when replay rows include signed evidence for safety, escalation, alerting, or assurance checks on AMC-owned tasks. |
| Enforce | No Enforce change; no runtime monitoring policy, data-source connector, or alert action path was added. |
| Vault | No Vault change; no upstream env files, keys, sample errors, Slack messages, Linear tickets, code snippets, or configs were imported. |
| Watch | Relevant only through existing replay-corpus readiness and CI evidence, not through source metadata or demo screenshots. |
| Fleet | No Fleet change; no source-specific agent topology or orchestration path was added. |
| Passport | No Passport change; existing proof bundles can already carry replay-corpus receipts. |
| Comply | No Comply change; repository metadata is not regulatory evidence. |

## Product closure

No new source-specific product module was added. Existing AMC replay-corpus primitives already enforce the product requirement:

- `src/benchmarks/replayBenchmarkCorpus.ts` builds replay manifests, fixture hashes, fixed seeds, score deltas, source refs, signed row evidence, and CI receipts.
- `src/eval/replayCorpusEvidenceReceipt.ts` converts replay results into fail-closed Score/Shield/Watch evidence receipts.
- `src/diagnostic/evalReplayCorpusBoundary.ts` keeps diagnostic readiness blocked unless complete replay-corpus evidence exists.

The focused regression proves both paths:

- A valid AMC-owned error-monitoring-style replay fixture is accepted only with source refs, Score/Shield/Watch coverage, fixture hash, fixed seed, signed evidence, score delta, and CI receipt.
- A metadata-only Airweave/error-monitoring row fails closed even when it cites the repository, API, README, docs, config file, topics, language, stars, branch, and release absence.

## Live source facts

- Repository: `https://github.com/airweave-ai/error-monitoring-agent`
- GitHub API: `https://api.github.com/repos/airweave-ai/error-monitoring-agent`
- README API: `https://api.github.com/repos/airweave-ai/error-monitoring-agent/readme`
- Default-branch README: `https://raw.githubusercontent.com/airweave-ai/error-monitoring-agent/main/README.md`
- Default-branch configuration docs: `https://raw.githubusercontent.com/airweave-ai/error-monitoring-agent/main/docs/CONFIGURATION.md`
- Default-branch architecture docs: `https://raw.githubusercontent.com/airweave-ai/error-monitoring-agent/main/docs/ARCHITECTURE.md`
- Default-branch env example: `https://raw.githubusercontent.com/airweave-ai/error-monitoring-agent/main/.env.example`
- Repository identity: `airweave-ai/error-monitoring-agent`.
- Repository description: Intelligent error monitoring agent that uses Airweave context from code, tickets, and Slack to cluster errors and create actionable alerts.
- primary language `Python`; language API returned Python, TypeScript, CSS, JavaScript, and HTML.
- Stars `366`; Forks `51`; Watchers API total `3`; watchers_count `366`; open issues `0`.
- default branch `main`; main branch protected `false`.
- latest main commit `ec358d1148f9a4e5a46988afaff13fa078d3f726`; commit date `2026-01-29T12:38:23Z`; verification reason `unsigned`.
- Repository created at `2026-01-23T12:41:43Z`; pushed at `2026-01-29T12:38:29Z`; updated at `2026-06-21T07:12:11Z`.
- licenseInfo `null`; README states `MIT License`.
- README sha `3437cc3a4838850314f263346cf9885daedaf320`; size `10618`.
- .env.example sha `4e3fe4e198f50aebf44c5122710cc61d7f477c8b`; size `3322`.
- CONFIGURATION.md sha `5af93b542c239dfd5fa8867cf8cb2612d54081d8`; size `6479`.
- ARCHITECTURE.md sha `d8d133f42dfb599f587afb3daa1f84ba49313a6b`; size `7881`.
- Repository contents API showed `.env.example`, `.gitignore`, `README.md`, `backend`, `docs`, and `frontend`.
- Docs contents API showed `docs/ARCHITECTURE.md`, `docs/CONFIGURATION.md`, and `docs/error-monitoring-agent-demo.mp4`.
- GitHub releases API returned 404, so there are no GitHub releases exposed through the latest-release endpoint.
- Git tags API returned an empty list, so there are no Git tags.
- GitHub repo returned HTTP/2 200.
- raw README returned HTTP/2 200 with content-length: 10618.
- CONFIGURATION.md returned HTTP/2 200 with content-length: 6479.
- ARCHITECTURE.md returned HTTP/2 200 with content-length: 7881.
- README source signal included sample data, semantic clustering, context search, severity analysis, alert preview, suppression logic, Linear and Slack preview, Sentry/Azure/custom sources, and scheduled/API execution modes.

## Fail-closed rule

Metadata-only error-monitoring-agent evidence must fail closed. The following are insufficient without AMC-owned replay evidence:

- Repository existence, owner, stars, forks, watchers, topics, language, branch state, commit SHA, commit date, unsigned verification status, issue count, docs file names, file sizes, file SHAs, README labels, architecture labels, configuration labels, release absence, tag absence, or README license text.
- README claims about Airweave, semantic clustering, context search, severity analysis, suppression logic, Linear tickets, Slack alerts, Sentry, Azure, Datadog, sample data, mock search results, preview mode, FastAPI endpoints, WebSocket events, scheduled jobs, or API-triggered pipeline runs.
- Copied upstream source code, README prose, configs, env examples, sample errors, mock search results, Slack threads, Linear tickets, UI assets, pipeline traces, alert payloads, docs diagrams, video assets, prompts, model outputs, or generated results.

A passing AMC replay-corpus claim must include replay manifest, fixture hash, fixed seed, score delta, CI receipt, Score/Shield/Watch surface coverage, source refs, row hashes, and signed evidence refs.

## No-bloat boundary

AMC did not add and must not add a source-specific Airweave or error-monitoring-agent subsystem for this gap. Specifically out of scope:

- Airweave SDK integration, error-monitoring-agent runner, importer, adapter, Sentry adapter, Azure adapter, Datadog adapter, custom-source adapter, semantic-clustering implementation, context-search implementation, Linear ticket creator, Slack alert sender, suppression engine, WebSocket mirror, FastAPI proxy, frontend demo panel, video asset, config parser, env loader, source-specific replay module, API route, CLI command, Studio panel, or package dependency.
- Copied upstream code, README prose, docs prose, env examples, configs, sample errors, mock search results, Slack messages, Linear tickets, code snippets, UI assets, video files, prompts, traces, alert payloads, generated outputs, result files, or implementation details.

The only committed product artifact is the source-review doc plus a focused regression test that keeps the existing AMC replay-corpus primitive fail-closed.

## Verification

- Expected red: `npx vitest run tests/gap1054ErrorMonitoringAgentReplayCorpusBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1054-error-monitoring-agent-replay-corpus.md` did not exist; the three replay-corpus primitive checks passed.
- Live source retrieval:
  - `gh repo view airweave-ai/error-monitoring-agent --json nameWithOwner,description,createdAt,updatedAt,pushedAt,isArchived,isFork,isPrivate,defaultBranchRef,stargazerCount,forkCount,watchers,primaryLanguage,licenseInfo,repositoryTopics,url,homepageUrl`
  - `gh api repos/airweave-ai/error-monitoring-agent`
  - `gh api repos/airweave-ai/error-monitoring-agent/branches`
  - `gh api repos/airweave-ai/error-monitoring-agent/readme`
  - `gh api 'repos/airweave-ai/error-monitoring-agent/contents?ref=main'`
  - `gh api repos/airweave-ai/error-monitoring-agent/languages`
  - `gh api repos/airweave-ai/error-monitoring-agent/commits/ec358d1148f9a4e5a46988afaff13fa078d3f726`
  - `gh api repos/airweave-ai/error-monitoring-agent/releases/latest`
  - `gh api repos/airweave-ai/error-monitoring-agent/tags`
  - `curl -sSIL https://github.com/airweave-ai/error-monitoring-agent`
  - `curl -sSIL https://raw.githubusercontent.com/airweave-ai/error-monitoring-agent/main/README.md`
  - `curl -sSIL https://raw.githubusercontent.com/airweave-ai/error-monitoring-agent/main/docs/CONFIGURATION.md`
  - `curl -sSIL https://raw.githubusercontent.com/airweave-ai/error-monitoring-agent/main/docs/ARCHITECTURE.md`
- Focused: `npx vitest run tests/gap1054ErrorMonitoringAgentReplayCorpusBoundary.test.ts --reporter=dot`
- Paired replay-corpus boundary regression: `npx vitest run tests/gap1054ErrorMonitoringAgentReplayCorpusBoundary.test.ts tests/gap1052McpAgentBenchReplayCorpusBoundary.test.ts --reporter=dot`
- Static whitespace: `git diff --check -- . ':(exclude)AMC_OS'`
- No-bloat scan: `rg -n "airweave-ai/error-monitoring-agent|error-monitoring-agent|airweave|ec358d1148f9a4e5a46988afaff13fa078d3f726" src/benchmarks/replayBenchmarkCorpus.ts src/eval/replayCorpusEvidenceReceipt.ts src/diagnostic/evalReplayCorpusBoundary.ts`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot`
