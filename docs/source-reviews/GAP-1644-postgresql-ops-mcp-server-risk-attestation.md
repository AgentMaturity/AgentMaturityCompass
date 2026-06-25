# GAP-1644 - PostgreSQL Ops MCP server risk attestation

- Gap: `GAP-1644`
- Dimension: `tool-mcp-risk-attestation`
- AMC surfaces requested: Enforce, Shield, Vault
- Source reviewed: call518/MCP-PostgreSQL-Ops
- Retrieval: 2026-06-25 live GitHub API, raw README, and repository contents API review
- Status: Done

## Source reviewed

- Repository URL: `https://github.com/call518/MCP-PostgreSQL-Ops`
- GitHub API: `https://api.github.com/repos/call518/MCP-PostgreSQL-Ops`
- Raw README: `https://raw.githubusercontent.com/call518/MCP-PostgreSQL-Ops/main/README.md`
- Repository contents API: `https://api.github.com/repos/call518/MCP-PostgreSQL-Ops/contents?ref=main`
- Project homepage: `https://deepwiki.com/call518/MCP-PostgreSQL-Ops`

Live source metadata at retrieval:

- The repository is public, not archived, not disabled, not a fork, default_branch `main`, language `Python`, license metadata `MIT`, stars `151`, forks `25`, open issues `8`, created `2025-08-19T03:17:30Z`, pushed `2026-06-22T00:33:30Z`, and updated `2026-06-15T14:03:08Z`.
- The repository description says it gives AI assistants PostgreSQL DBA capabilities with 30+ tools for performance analysis, bloat detection, lock/deadlock monitoring, autovacuum, and schema inspection.
- Topics include `agent`, `agentic-ai`, `database`, `database-tools`, `dba`, `fastmcp`, `mcp`, `mcp-server`, `monitoring`, `postgres`, `postgresql`, `postgresql-diagnostics`, `python`, and `sql`.
- The README identifies the project as an MCP server for PostgreSQL operations and monitoring.
- The README describes PostgreSQL 12-18 support, read-only operations, RDS/Aurora compatibility, regular-user operation for basic monitoring, optional extension-enhanced analytics, performance analysis, bloat detection, lock monitoring, autovacuum intelligence, replication/WAL monitoring, and Docker/OpenWebUI quickstart surfaces.
- The contents API confirms files and directories including `.env.example`, `.github`, `.gitleaks.toml`, `.pre-commit-config.yaml`, `Dockerfile.MCP-Server`, `Dockerfile.MCPO-Proxy`, `LICENSE`, `README.md`, `SECURITY.md`, `docker-compose.yml`, `mcp-config.json.http`, `mcp-config.json.stdio`, `pyproject.toml`, `scripts`, `src`, `tests`, and `uv.lock`.

## Relevance decision

GAP-1644 is relevant to AMC because a database-oriented MCP server can expose powerful operational capabilities even when its README emphasizes safe or read-only behavior. AMC should not accept MCP server metadata, tool labels, or repository claims as risk evidence. The accepted proof must be a signed server attestation that declares server identity, capability list, data access, network reach, sandbox policy, signer identity, and last scan.

The relevant AMC acceptance is: Server manifest, capability list, signer, sandbox policy, and last scan.

The source does not justify an MCP-PostgreSQL-Ops integration. AMC closes the gap with a generic signed MCP server risk attestation receipt that can be reused by Enforce, Shield, Vault, and Passport without importing a PostgreSQL tool server, Docker setup, MCPO proxy, OpenWebUI flow, config files, examples, or code.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through score-impact signals. The receipt exposes deterministic `riskScoreImpact`, but no public scoring method changed. |
| Shield | Relevant. Shield needs drift findings for undeclared capabilities, stale scans, sandbox drift, open high-risk findings, and metadata-only server claims. |
| Enforce | Primary surface. Enforce blocks unsafe MCP calls before execution when the observed invocation drifts from the signed server attestation. |
| Vault | Relevant. Vault-backed signing keys bind the server manifest, signer identity, sandbox policy, last scan, and receipt hash. |
| Watch | Context only. Watch can inspect drift findings, but no monitor changed. |
| Fleet | Context only. Fleet can reuse the receipt for delegated MCP servers, but no orchestration path changed. |
| Passport | Relevant downstream. The attestation is portable proof-bundle evidence, but no public Passport schema changed. |
| Comply | Context only. Receipts may support audit narratives, but no compliance mapping changed. |

## Product closure

Closed by adding the AMC-native `mcpServerRiskAttestation` primitive:

- `createSignedMcpServerRiskAttestation` signs a generic MCP server attestation with server manifest, capabilities, data access, network reach, signer identity, sandbox policy, last scan, source citations, digest, and signature.
- `evaluateMcpServerRiskAttestation` verifies the signature, checks server manifest evidence, evaluates scan freshness and high-risk findings, validates observed transport/capability/scope/resource/external-system/data-class evidence, enforces sandbox and network policy, emits drift findings, blocks unsafe calls before execution, and projects deterministic `riskScoreImpact` signals.
- `verifyMcpServerRiskAttestationReceipt` fails closed when metadata-only source facts replace signed attestation evidence, receipt hashes mismatch, signatures are invalid, required evidence is missing, last scan is absent, sandbox policy is absent, signer identity is absent, or Enforce/Shield/Vault binding is missing.
- `tests/gap1644PostgresOpsMcpServerRiskAttestation.test.ts` covers the source-review boundary, valid signed server attestation, score-impact signals, stale/overbroad/sandbox-drift blocking, metadata-only rejection, and no MCP-PostgreSQL-Ops-specific identifiers in generic implementation files.

No API route, CLI command, Studio panel, Watch monitor, methodology version bump, diagnostic question, scoring weight, PostgreSQL workflow, or source-specific public behavior was added.

## Fail-closed rule

The following must fail closed for GAP-1644:

- MCP-PostgreSQL-Ops repository identity, README labels, topic labels, Docker labels, PyPI badges, OpenWebUI instructions, config file names, screenshots, local backlog text, or any metadata-only evidence;
- unsigned, digest-mismatched, or metadata-only server attestations;
- missing server manifest, capability list, signer identity, sandbox policy, or last scan;
- stale scans beyond the policy window;
- failed scans or open high/critical findings;
- observed transport not declared by the signed manifest;
- observed capability not declared by the signed manifest;
- observed scope/resource/external system/data class not declared for the capability or manifest;
- missing sandbox when sandbox is required;
- observed network policy broader than the signed sandbox policy;
- observed host outside the signed allowlist;
- receipt hash mismatch;
- missing Enforce/Shield/Vault surface binding.

## No-bloat boundary

No MCP-PostgreSQL-Ops adapter, PostgreSQL connector, DBA tool runner, Docker Compose runner, MCPO proxy, OpenWebUI integration, FastMCP integration, PyPI dependency, MCP inspector runner, extension scanner, schema inspector, bloat detector, lock monitor, autovacuum monitor, WAL monitor, replication monitor, database credentials workflow, `.env` importer, MCP config importer, screenshot importer, docs importer, examples importer, API route, CLI command, Studio view, Watch monitor, methodology bump, diagnostic question-bank change, scoring path, or source-specific implementation branch was added.

AMC did not copy upstream Python code, README prose beyond minimal metadata facts, docs prose beyond minimal labels, examples, configs, prompts, generated outputs, package metadata, lockfiles, workflows, Dockerfiles, screenshots, database fixtures, SQL, tool definitions, or implementation details.

## Verification

- TDD negative check: `npx vitest run tests/gap1644PostgresOpsMcpServerRiskAttestation.test.ts --reporter=dot` first failed because `src/mcp/mcpServerRiskAttestation.ts` did not exist.
- Focused behavioral check after implementation: `npx vitest run tests/gap1644PostgresOpsMcpServerRiskAttestation.test.ts --reporter=dot` passed the behavior/no-bloat tests and failed only because this source-review doc did not exist.
- Final focused test: `npx vitest run tests/gap1644PostgresOpsMcpServerRiskAttestation.test.ts --reporter=dot` passed, 1 file / 5 tests.
- Related regression: `npx vitest run tests/gap1644PostgresOpsMcpServerRiskAttestation.test.ts tests/gap1643McpUseToolSchemaContracts.test.ts tests/gap1639McpUniverseLeastPrivilegeGrants.test.ts tests/gap1641GollemLeastPrivilegeGrants.test.ts tests/gap1640AEnvironmentToolSchemaContracts.test.ts tests/gap1637OutlinesToolSchemaContracts.test.ts tests/gap1635ViperConsentBlastRadiusBoundary.test.ts tests/gap1646GopherMcpConsentBlastRadiusBoundary.test.ts tests/gap1652DjangoRestFrameworkMcpConsentBlastRadiusBoundary.test.ts tests/governorToolhubWorkorders.test.ts tests/mcpComplianceSafety.test.ts tests/mcpServerTools.test.ts tests/passportSchemaCompatibility.test.ts tests/receiptInterchange.test.ts --reporter=dot` passed, 12 files / 69 tests.
- Whitespace: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 994 files / 7,992 tests.
