# GAP-0797 - MCP-PostgreSQL-Ops question-explainability boundary

- Gap: `GAP-0797`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/call518/MCP-PostgreSQL-Ops`
- Retrieval: `2026-06-21` via GitHub connector reads of `README.md`, `LICENSE`, `pyproject.toml`, and attempted `requirements.txt`; shell network remains restricted in this environment.
- Status: relevant only through existing question-level score explainability; no PostgreSQL, DBA, MCP, or database-monitoring subsystem added.

## Live source metadata

The live GitHub source identifies `call518/MCP-PostgreSQL-Ops` as a PostgreSQL operations and monitoring MCP server. The reviewed README describes PostgreSQL 12-18 support, natural language queries, production-safe read-only operations, optional `pg_stat_statements` and `pg_stat_monitor`, performance analysis, bloat detection, lock/deadlock monitoring context, autovacuum support, schema inspection context, and database operations/monitoring use cases. The reviewed license file is MIT. The reviewed `pyproject.toml` identifies package name `mcp-postgresql-ops`, Python >=3.12, script `mcp-postgresql-ops`, and dependencies including `fastmcp`, `asyncpg`, and `psycopg2-binary`. requirements.txt returned 404.

These facts identify the source and adjacent operational domain only. No README prose beyond minimal metadata phrases, screenshots, workflow diagrams, tool examples, Docker configuration, database schemas, sample data, queries, prompts, source code, tests, package config, implementation details, or generated outputs were copied into AMC.

## Relevance decision

The source is relevant to AMC only as source-review context for question-level score explainability. A PostgreSQL operations MCP server is adjacent to agent evaluation because a user may ask why a maturity question moved, what evidence was accepted, which database/monitoring claims were rejected, and what repair hint is needed before a Score, Shield, or Watch result can mature.

The source does not provide AMC proof by itself. It is not an AMC benchmark, not a diagnostic question-score implementation, and not a reason to add an MCP-PostgreSQL-Ops adapter, PostgreSQL DBA tool, database monitor, MCP server, query analyzer, bloat detector, lock/deadlock monitor, autovacuum analyzer, schema inspector, OpenWebUI workflow, Docker quickstart, package dependency, API route, CLI command, Studio panel, or source-specific evaluator. Accepted claims still need AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed evidence rows, reproducible eval-pack hashes, thresholds, and row hashes.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through existing question-score explainability rows with AMC-owned evidence and repair hints. |
| Shield | Relevant only when unsupported PostgreSQL/MCP operational claims are rejected with signed evidence and no source-data copy. |
| Watch | Relevant only when caller-owned trace/eval telemetry is hash-bound through existing Watch evidence. |
| Fleet | MCP/database-agent context only; no orchestration or trust-topology behavior changed. |
| Enforce | No runtime PostgreSQL, database-access, query, or MCP policy changed. |
| Vault | No credentials, connection strings, database data, prompts, or secure-storage behavior changed. |
| Passport | No portable proof-bundle field, token, or external credential changed. |
| Comply | No database compliance, audit, privacy, SOC2, ISO, or data-residency mapping changed. |

## Product closure

No `src/diagnostic/questionScoreExplainability.ts`, `src/guide/guideGenerator.ts`, `src/passport/passportArtifact.ts`, API, CLI, Studio, Watch monitor, Shield verifier, Passport field, methodology version, badge semantics, diagnostic question bank, or scoring behavior changed for GAP-0797. The closure is a source-review note plus regression coverage that exercises existing AMC question-score explainability primitives: question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed evidence refs, thresholds, missing-gate reasons, and row hashes.

## Fail-closed rule

GitHub README/package/source metadata alone must fail closed for question-level score explainability claims. Repository URL, repo name, MIT license, PyPI/package metadata, PostgreSQL 12-18 support, natural language queries, read-only operations, `pg_stat_statements`, `pg_stat_monitor`, performance analysis, bloat detection, lock/deadlock monitoring labels, autovacuum labels, schema inspection labels, database operations labels, screenshots, Docker examples, local backlog metadata, generated gap wording, or source identity are not enough to pass. Passing evidence requires AMC-owned question IDs, accepted evidence IDs, rejected metadata-only reasons, repair hints, reproducible eval-pack hashes, thresholds, signed evidence refs, and row hashes.

## No-bloat boundary

No MCP-PostgreSQL-Ops adapter, PostgreSQL DBA tool, database monitor, MCP server, query analyzer, bloat detector, lock/deadlock monitor, autovacuum analyzer, schema inspector, OpenWebUI workflow, Docker quickstart, GitHub importer, source-specific question lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, package dependency, public methodology version bump, diagnostic question-bank migration, or source-specific scoring path was added. No README prose beyond minimal metadata phrases, screenshots, workflow diagrams, tool examples, Docker configuration, database schemas, sample data, queries, prompts, source code, tests, package config, implementation details, or generated outputs were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0797McpPostgresqlOpsQuestionExplainabilityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
