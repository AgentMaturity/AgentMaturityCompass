# GAP-0701 - Monoscope public-methodology boundary

- Gap: `GAP-0701`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/monoscope-tech/monoscope`
- Retrieval: `2026-06-21` via browser access to the live GitHub repository page; shell network remains DNS-restricted in this environment.
- Status: skipped as AMC public-methodology evidence; no methodology version bump or product code change.

## Live source metadata

The live GitHub page identifies `monoscope-tech/monoscope` as a public repository on branch `master`, with approximately `1.2k stars`, `48 forks`, `6` issues, `5` pull requests, `6` watchers, `5,215 commits`, AGPL-3.0 license, `15` releases, latest `Monoscope v0.6.23` on `Jun 11, 2026`, and languages including Haskell `82.0%`, TypeScript `10.5%`, JavaScript `2.5%`, PLpgSQL `2.3%`, CSS `1.5%`, and Shell `0.7%`.

The live README metadata identifies Monoscope as an open-source observability platform for logs, traces, and metrics stored in S3-compatible buckets, with natural-language queries, scheduled AI agents, anomaly detection, email reports, OpenTelemetry support, live tail, unified observability views, a CLI with documented JSON output shapes, a Claude Code skills path, an MCP server, REST tool registration, self-hosting, TimeFusion storage, dashboards, and roadmap items such as AIOps workflow builder and multi-tenant workspace support. These facts identify observability and agent-ops context only. No upstream code, README prose beyond short metadata facts, install commands, API-key examples, CLI command examples, MCP config snippets, telemetry examples, architecture diagrams, screenshots, docs prose, roadmap text beyond short labels, package files, or implementation details were copied into AMC.

## Relevance decision

Monoscope is relevant to AMC as external observability and agent-ops context: logs, traces, metrics, scheduled agents, anomaly detection, and machine-readable CLI/MCP surfaces are adjacent to Watch and evidence drilldown. That context reinforces AMC's existing evidence-first posture for Score, Shield, and Watch.

Monoscope is not an AMC public methodology versioning source. The live repository does not define AMC scoring methodology ids, L0-L5 threshold semantics, badge comparability rules, public methodology hashes, deprecation notices, migration guidance, report binding, or AMC diagnostic question-bank changes. Monoscope repository metadata alone must fail closed for public methodology claims.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Observability/agent-ops context only; no accepted public scoring-methodology proof. |
| Shield | Anomaly and triage context only; no Shield assurance threshold changed. |
| Watch | Relevant as Watch-adjacent observability context, but no Watch methodology or alert semantics changed. |
| Enforce | No runtime policy, monitor muting, or enforcement behavior changed. |
| Vault | No S3 buckets, telemetry payloads, API keys, MCP headers, or secure-storage behavior changed. |
| Fleet | Scheduled AI-agent context only; no Monoscope agent scheduler or orchestration adapter added. |
| Passport | No portable proof-bundle field or credential changed. |
| Comply | No compliance mapping or audit-control mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `src/badge/badgeCli.ts`, docs methodology page, API, CLI, Studio, diagnostic question bank, Watch monitor, Shield verifier, or scoring code changed for GAP-0701. No public methodology version bump was made.

The closure is a documented no-op: observability/agent-ops context only, no public methodology version change.

## Fail-closed rule

Monoscope repository metadata, star/fork/issue/pull-request/watch counts, commit counts, release labels, AGPL license labels, language percentages, topic labels, observability labels, logs/traces/metrics labels, S3 labels, natural-language query labels, scheduled-agent labels, anomaly-detection labels, CLI JSON-envelope labels, Claude Code skill labels, MCP server labels, REST tool labels, TimeFusion labels, roadmap labels, local backlog metadata, or source identity alone must fail closed for AMC public methodology claims. Passing evidence requires AMC-owned methodology id/version/hash, changelog rows, deprecation notice, migration guidance, validation artifacts, signed evidence refs, row hashes, badge/report binding, and no-copy proof.

## No-bloat boundary

No Monoscope adapter, observability platform clone, S3 telemetry store, TimeFusion integration, OpenTelemetry collector, CLI wrapper, MCP server connector, REST tool registrar, Claude Code skills integration, anomaly agent scheduler, email-report workflow, dashboard panel, log/trace/metric importer, AIOps workflow builder, GitHub importer, source-specific methodology lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream code, README prose beyond short metadata facts, install commands, API-key examples, CLI command examples, MCP config snippets, telemetry examples, architecture diagrams, screenshots, docs prose, roadmap text beyond short labels, package files, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0701MonoscopePublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
