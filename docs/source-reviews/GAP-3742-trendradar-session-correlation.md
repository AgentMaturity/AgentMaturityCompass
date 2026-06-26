# GAP-3742 - TrendRadar session-correlation boundary

- Gap: `GAP-3742`
- Dimension: `obs-session-correlation`
- AMC surfaces requested: Watch, Studio, API
- Source reviewed: `https://github.com/sansan0/TrendRadar`, `https://api.github.com/repos/sansan0/TrendRadar`, `https://raw.githubusercontent.com/sansan0/TrendRadar/master/README.md`, `https://raw.githubusercontent.com/sansan0/TrendRadar/master/LICENSE`, and `https://api.github.com/repos/sansan0/TrendRadar/contents?ref=master`
- Retrieval: live GitHub API/raw-source checks on 2026-06-26.
- Status: closed through a generic AMC cross-surface session-correlation helper; no TrendRadar integration, monitor, crawler, alert channel, or MCP server added.

## Live source metadata

The backlog identifies `sansan0/TrendRadar` as source `GAP-3742`, category `Observability, monitoring, and traces`, dimension `Cross-surface session correlation`, and requested Watch, Studio, and API surfaces.

Live retrieval on 2026-06-26 verified:

- Repository API `https://api.github.com/repos/sansan0/TrendRadar` returned HTTP 200, first-200KB hash `3b840467c131222e0297145c8cbca5f239e9e64047c4d1cc7c7968eea4424a0c`.
- Repository full name `sansan0/TrendRadar`, default_branch `master`, license `GPL-3.0`, language `Python`, 59,923 stars, 24,728 forks, 47 open issues, pushed_at `2026-06-19T12:52:21Z`, updated_at `2026-06-26T03:28:19Z`.
- Repository description includes `AI-driven public opinion & trend monitor`, `multi-platform aggregation`, `RSS`, `smart alerts`, MCP, Docker, Telegram, Slack, Python, trend, and public-opinion monitoring context.
- README raw URL `https://raw.githubusercontent.com/sansan0/TrendRadar/master/README.md` returned HTTP 200, 93,663 bytes, first-200KB hash `ce2694adeecca311101c58222c3318307b53cd6d1a8237da17fee4a7c46b89a8`; reviewed as source metadata only.
- License raw URL `https://raw.githubusercontent.com/sansan0/TrendRadar/master/LICENSE` returned HTTP 200, 35,149 bytes, first-200KB hash `3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986`.
- Top-level contents API `https://api.github.com/repos/sansan0/TrendRadar/contents?ref=master` returned HTTP 200, first-200KB hash `caf28427991b6992d0d86d3ac77fd5782f5b268261da63b52af52bafee657b67`, and top-level names including `.github`, `LICENSE`, multiple README files, `config`, `docker`, `docs`, `mcp_server`, `trendradar`, `requirements.txt`, `pyproject.toml`, `version_mcp`, and `uv.lock`.

These facts are relevant as trend/alert/multi-channel observability context only. They do not provide AMC session-correlation evidence.

## Relevance decision

GAP-3742 is relevant to AMC because enterprise operators need one stable session ID that joins Score, Shield, Watch, API, Studio, and related runtime events into an inspectable run story. Without a surface event list, timestamp chain, missing-event checks, and risk/cost/latency trends, failures can appear as disconnected receipts instead of one auditable session.

TrendRadar is only a source signal for multi-platform aggregation, RSS, smart alerts, MCP, sentiment/trend analysis, Docker deployment, and notification channels. AMC should not import or mirror those features. The accepted AMC primitive is a generic cross-surface session-correlation summary built from AMC-owned traces.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only; Score events can be correlated when present, but no scoring semantics changed. |
| Shield | Context only; Shield decisions can be correlated when present, but no verifier changed. |
| Enforce | Context only; Enforce events can be required by callers, but no enforcement rule changed. |
| Vault | Context only; Vault events can be required by callers, but no storage or DLP rule changed. |
| Watch | Relevant through session-correlated surface events, timestamp chain, missing-event checks, and live risk/cost/latency trends. |
| Fleet | Context only; no orchestration topology changed. |
| Passport | Context only; no proof-bundle schema changed. |
| Comply | Context only; no compliance mapping changed. |

## Product closure

Implemented a generic helper in `src/observability/sessionCorrelator.ts`:

- `buildCrossSurfaceSessionCorrelation`
- `AMCSurfaceId`
- `CrossSurfaceSessionCorrelation`

The helper accepts AMC-owned normalized traces for one session, derives the session ID, surface event list, timestamp chain, required-surface missing-event checks, risk event count, failure-mode counts, total cost, p95 latency, and fail-closed reasons. It fails closed when a trace lacks the stable session ID, required surfaces are missing, no correlated events exist, or the timestamp chain is invalid.

Added focused regression `tests/gap3742TrendRadarSessionCorrelationBoundary.test.ts`.

No source-specific product code or route was added.

## Fail-closed rule

TrendRadar repository URL, GitHub API metadata, README content, license metadata, star/fork/issue counts, default branch, Python language label, topics, AI-driven public opinion & trend monitor label, multi-platform aggregation label, RSS label, smart alerts label, MCP label, sentiment label, trend label, Docker label, Telegram label, Slack label, top-level source layout, local backlog metadata, or source identity alone must fail closed for AMC session-correlation claims.

Passing evidence requires an AMC-owned stable session ID, surface event list, timestamp chain, missing-event checks, Watch/API/Studio visibility, failure clusters or failure-mode counts when failures exist, risk/cost/latency trends, and no-copy proof.

## No-bloat boundary

No TrendRadar adapter, GitHub importer, RSS crawler, multi-platform aggregator, public-opinion monitor, trend monitor, AI newsletter, sentiment analyzer, news filter, alert router, Telegram connector, Slack connector, Feishu connector, DingTalk connector, WeChat connector, ntfy connector, bark connector, email connector, Docker profile, MCP server, repository mirror, README mirror, source code import, source-specific API route, Studio panel, Watch monitor, Passport schema change, methodology bump, provider parity claim, or source-specific scoring path was added.

No upstream code, README prose beyond short metadata phrases, license text, docs prose, screenshots, configs, Docker files, MCP server code, RSS examples, notification templates, prompts, analysis outputs, data, alerts, or implementation details were copied into AMC.

## Verification

- Initial expected-red focused test: `npx vitest run tests/gap3742TrendRadarSessionCorrelationBoundary.test.ts --reporter=dot` failed because this source-review doc and `buildCrossSurfaceSessionCorrelation` did not exist; the no-bloat check passed.
- Product helper check after implementation: focused test failed only because this source-review doc did not exist; 3 session-correlation/no-bloat tests passed.
- Focused test after doc: `npx vitest run tests/gap3742TrendRadarSessionCorrelationBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired session-correlation regression: `npx vitest run tests/gap3742TrendRadarSessionCorrelationBoundary.test.ts tests/observability/sessionCorrelator.test.ts tests/traceFailureIndex.test.ts tests/receiptsCorrelationRuntimeDashboard.test.ts --reporter=dot` passed, 4 files / 19 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 1024 files / 8112 tests.
