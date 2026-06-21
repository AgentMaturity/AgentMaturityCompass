# GAP-0642 — HertzBeat public-methodology relevance review

- Gap: `GAP-0642`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/apache/hertzbeat`
- Retrieval: `2026-06-21T04:19:24Z` via GitHub API (`status=200`, default branch `master`, license `Apache-2.0`, metadata SHA-256 `24a0dc223460c56051cce3e7b67c397542c40ef5437161c4afa0f64342052960`)
- Status: source is relevant to observability context, not to public scoring-methodology semantics; no methodology version bump or source-specific code added.

## Relevance decision

HertzBeat metadata is relevant to Watch/observability source review, but the backlog dimension is public methodology versioning. It does not provide an AMC scoring-methodology rule, question-set version, report-binding requirement, or badge comparability requirement. Treating it as a methodology source would bloat the public methodology with an unrelated observability project.

The correct AMC-native handling is to keep existing public-methodology rules unchanged and require AMC-owned methodology/changelog/deprecation/migration proof for public claims. HertzBeat metadata alone must fail closed as public Score, Shield, or Watch methodology evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Watch | Background observability context only. |
| Score/Shield | No accepted proof without AMC-owned methodology evidence. |
| Enforce/Vault/Fleet/Passport/Comply | No direct scope for this gap. |

## Product closure

Closed as a documented skip for public methodology changes. HertzBeat is an observability system, so this gap does not alter AMC methodology semantics, badge comparability, question-set versions, or scoring gates.

## Fail-closed rule

HertzBeat repository metadata, monitor/alert labels, star counts, language, license, README summaries, or source URL alone must fail closed as AMC public methodology evidence. Public methodology claims still require AMC-owned version, changelog, deprecation notice, migration guidance, validation proof, signed evidence, and row hashes.

## No-bloat boundary

No HertzBeat subsystem, monitor integration, importer, API compatibility layer, metric mirror, public-methodology version bump, or copied upstream code/prose/config/examples was added.

## Verification

- `npx vitest run tests/gap0640To0648RelevanceBoundaries.test.ts --reporter=dot`
