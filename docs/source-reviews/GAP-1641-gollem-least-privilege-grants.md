# GAP-1641 - Gollem least-privilege tool grants

- Gap: `GAP-1641`
- Dimension: `tool-least-privilege`
- AMC surfaces requested: Enforce, Shield, Vault
- Source reviewed: m-mizutani/gollem backlog source resolving to gollem-dev/gollem
- Retrieval: 2026-06-25 live GitHub API, raw README, raw docs, and repository contents API review
- Status: Done

## Source reviewed

Backlog source:

- Repository URL: `https://github.com/m-mizutani/gollem`
- GitHub API: `https://api.github.com/repos/m-mizutani/gollem`

Canonical source observed at retrieval:

- Repository URL: `https://github.com/gollem-dev/gollem`
- GitHub API: `https://api.github.com/repos/gollem-dev/gollem`
- Raw README: `https://raw.githubusercontent.com/gollem-dev/gollem/main/README.md`
- Raw MCP docs: `https://raw.githubusercontent.com/gollem-dev/gollem/main/docs/mcp.md`
- Raw tools docs: `https://raw.githubusercontent.com/gollem-dev/gollem/main/docs/tools.md`
- Raw middleware docs: `https://raw.githubusercontent.com/gollem-dev/gollem/main/docs/middleware.md`
- Repository contents API: `https://api.github.com/repos/gollem-dev/gollem/contents?ref=main`

Live source metadata at retrieval:

- The backlog API resolved to `gollem-dev/gollem`.
- The repository is public, not archived, not disabled, not a fork, default_branch `main`, language `Go`, license metadata `Apache-2.0`, stars `190`, forks `11`, open issues `6`, created `2025-04-19T03:36:30Z`, pushed `2026-06-17T01:14:04Z`, and updated `2026-06-17T07:24:42Z`.
- The repository description is "Go framework for agentic AI app with MCP and built-in tools"; topics are `ai-agents`, `go`, and `llm`.
- The README says Gollem provides an agentic application framework with Tools by MCP server and built-in tools, automatic session management, portable conversational memory, history compaction, and middleware for monitoring, logging, and controlling behavior.
- The MCP docs describe local stdio (`NewStdio`) and remote StreamableHTTP (`NewStreamableHTTP`) transport options, with SSE marked deprecated.
- The tools docs describe tool specifications, required fields, parameter constraints, `WithTools`, `WithToolSets`, and `ToolMiddleware` for monitoring and control.
- The middleware docs describe `ToolMiddleware` as a pre-execution security-check and post-execution metrics/logging hook.
- The contents API confirms files and directories including `.github`, `CLAUDE.md`, `LICENSE`, `README.md`, `Taskfile.yml`, `docs`, `examples`, `go.mod`, `go.sum`, `mcp`, `middleware`, `mock`, and Go source/test files.

## Relevance decision

GAP-1641 is relevant to AMC because Gollem exposes both built-in tools and MCP toolsets, plus middleware intended to monitor, log, and control tool execution. That is a strong source-review signal that agent frameworks need per-task tool grants, approval linkage, expiry, and unused-permission reporting before tool/MCP calls can be trusted.

The relevant AMC acceptance is: Grant request, approved scope, expiry, used permissions, and unused permission report.

No additional product primitive was required after `GAP-1639`, because `src/toolhub/leastPrivilegeGrants.ts` already implements the generic signed grant receipt needed for this acceptance. The closure for `GAP-1641` is therefore a source-review boundary and regression test proving Gollem context is handled by the shared AMC primitive, not by a Gollem-specific adapter.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only. Least-privilege grant receipts can support maturity evidence, but no scoring semantics changed. |
| Shield | Relevant. Shield needs drift findings when used tool permissions exceed the signed approved grant. |
| Enforce | Primary surface. Enforce blocks unsafe tool/MCP calls before execution when scope, resource, external-system, data-class, expiry, or signature checks fail. |
| Vault | Relevant. Vault-backed signing keys bind grants and receipts to the workspace key history. |
| Watch | Relevant. Watch can inspect unused permission reports and drift findings, but no new monitor changed. |
| Fleet | Context only. The shared grant receipt can be reused across delegated agents, but no Fleet orchestration changed. |
| Passport | Not directly relevant. No portable trust-token schema changed. |
| Comply | Context only. Receipts can support audit narratives, but no compliance mapping changed. |

## Product closure

Closed by reusing the AMC-native `leastPrivilegeGrants` primitive from `GAP-1639`:

- `createSignedLeastPrivilegeToolGrant` signs a per-task grant with requested scope, approved scope, approval receipt, policy id, approver, expiry, digest, signer, and source citations.
- `evaluateLeastPrivilegeToolGrantUsage` checks signature validity, expiry, and used scopes/resources/external systems/data classes before or after execution.
- Unsafe calls block before execution and emit drift findings.
- Every usage receipt carries the Grant request, approved scope, expiry, used permissions, and unused permission report.
- `verifyLeastPrivilegeToolGrantReceipt` fails closed on metadata-only evidence, receipt hash mismatch, invalid signature, missing unused permission report, or missing Enforce/Shield/Vault binding.
- `tests/gap1641GollemLeastPrivilegeGrants.test.ts` proves Gollem-style MCP toolsets reuse the generic receipt, block overbroad use, reject metadata-only source facts, and keep Gollem identifiers out of generic ToolHub implementation files.

No product code changed for this gap because the existing generic primitive already covers the acceptance criteria.

## Fail-closed rule

The following must fail closed for GAP-1641:

- Gollem repository identity, redirect/canonical source metadata, README labels, docs labels, topic labels, language/license facts, workflow badges, local backlog text, or any metadata-only evidence;
- unsigned, digest-mismatched, or metadata-only grants;
- missing grant request, approved scope, approval receipt, expiry, used permissions, or unused permission report;
- grant use after expiry;
- used scope not included in the approved scope;
- used resource not included in the approved resources;
- used external system not included in the approved external systems;
- used data class not included in the approved data classes;
- receipt hash mismatch;
- missing Enforce/Shield/Vault surface binding.

## No-bloat boundary

No Gollem adapter, Go dependency, MCP client wrapper, built-in tool importer, subagent importer, middleware integration, stdio transport integration, StreamableHTTP transport integration, SSE support, LLM provider wrapper, schema converter, memory/session store, docs importer, examples importer, package-manager setup, API route, CLI command, Studio view, Watch monitor, methodology bump, diagnostic question-bank change, scoring path, or source-specific implementation branch was added.

AMC did not copy upstream Go code, README prose beyond minimal metadata facts, docs prose beyond minimal labels, examples, configs, prompts, generated outputs, package metadata, lockfiles, workflows, images, tool definitions, middleware code, model outputs, or implementation details.

## Verification

- TDD negative check: `npx vitest run tests/gap1641GollemLeastPrivilegeGrants.test.ts --reporter=dot` first passed the behavioral tests and failed only because this source-review doc did not exist.
- Final focused test: `npx vitest run tests/gap1641GollemLeastPrivilegeGrants.test.ts --reporter=dot` passed, 1 file / 5 tests.
- Related regression: `npx vitest run tests/gap1641GollemLeastPrivilegeGrants.test.ts tests/gap1639McpUniverseLeastPrivilegeGrants.test.ts tests/gap1643McpUseToolSchemaContracts.test.ts tests/gap1640AEnvironmentToolSchemaContracts.test.ts tests/gap1637OutlinesToolSchemaContracts.test.ts tests/gap1635ViperConsentBlastRadiusBoundary.test.ts tests/gap1646GopherMcpConsentBlastRadiusBoundary.test.ts tests/gap1652DjangoRestFrameworkMcpConsentBlastRadiusBoundary.test.ts tests/governorToolhubWorkorders.test.ts tests/mcpComplianceSafety.test.ts tests/mcpServerTools.test.ts --reporter=dot` passed, 11 files / 64 tests.
- Whitespace: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 993 files / 7,987 tests.
