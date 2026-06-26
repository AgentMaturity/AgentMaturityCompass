# GAP-1643 - mcp-use tool schema contracts

- Gap: `GAP-1643`
- Dimension: `tool-schema-contracts`
- AMC surfaces requested: Enforce, Shield, Vault
- Source reviewed: mcp-use/mcp-use-ts and current mcp-use/mcp-use monorepo
- Retrieval: 2026-06-25 live GitHub API, raw README, and repository contents API review for archived backlog source and canonical monorepo
- Status: Done

## Source reviewed

Backlog source:

- Repository URL: `https://github.com/mcp-use/mcp-use-ts`
- GitHub API: `https://api.github.com/repos/mcp-use/mcp-use-ts`
- Raw README: `https://raw.githubusercontent.com/mcp-use/mcp-use-ts/main/README.md`
- Repository contents API: `https://api.github.com/repos/mcp-use/mcp-use-ts/contents?ref=main`

Canonical source indicated by backlog README:

- Repository URL: `https://github.com/mcp-use/mcp-use`
- GitHub API: `https://api.github.com/repos/mcp-use/mcp-use`
- Raw README: `https://raw.githubusercontent.com/mcp-use/mcp-use/main/README.md`
- Repository contents API: `https://api.github.com/repos/mcp-use/mcp-use/contents?ref=main`

Live source metadata at retrieval:

- The backlog repository `mcp-use/mcp-use-ts` is public, archived, not disabled, not a fork, default_branch `main`, language `TypeScript`, license metadata absent, stars `175`, forks `35`, open issues `21`, created `2025-04-20T08:42:35Z`, pushed `2026-05-21T12:16:49Z`, and updated `2026-06-11T18:29:21Z`.
- The backlog repository topics include `agent`, `langchain`, `llm`, `mcp`, `mcp-client`, `mcp-server`, `modelcontextprotocol`, and `typescript`.
- The backlog README says `Repository moved to monorepo https://github.com/mcp-use/mcp-use`.
- The current monorepo `mcp-use/mcp-use` is public, not archived, not disabled, not a fork, default_branch `main`, language `TypeScript`, license metadata `MIT`, stars `10148`, forks `1348`, open issues `107`, created `2025-03-28T10:06:31Z`, pushed `2026-06-25T14:18:34Z`, and updated `2026-06-25T14:16:44Z`.
- The monorepo topics include `apps-sdk`, `chatgpt`, `claude-code`, `mcp`, `mcp-apps`, `mcp-client`, `mcp-gateway`, `mcp-inspector`, `mcp-server`, `mcp-tools`, `mcp-ui`, `model-context-protocol`, and `skills`.
- The monorepo README describes mcp-use as a fullstack MCP framework for MCP Apps, ChatGPT, Claude, MCP servers, AI agents, a TypeScript SDK, Python SDK, MCP Inspector, deploy flow, widgets, templates, and MCP Apps.
- The archived contents API confirms files and directories including `.changeset`, `.github`, `.npmrc`, `README.md`, `package.json`, `packages`, `pnpm-lock.yaml`, and `tsconfig.json`.
- The canonical contents API confirms files and directories including `.claude-plugin`, `.mcp.json`, `CLAUDE.md`, `LICENSE`, `README.md`, `SECURITY.md`, `docs`, and `examples`.

## Relevance decision

GAP-1643 is relevant to AMC because MCP frameworks can expose client SDKs, server SDKs, inspectors, apps, widgets, tools, gateways, and deploy surfaces behind a tool-like interface. A schema-valid tool call can still be unsafe if it comes from an unexpected MCP server, unapproved transport, overbroad scope, missing sandbox, or broader-than-approved network policy.

The relevant AMC acceptance is: Tool contract, validation result, side-effect declaration, and drift finding.

The source does not justify an mcp-use integration. The backlog repository is archived and points to a monorepo, so AMC treats it as a source-review signal only. The closure is a generic signed tool contract receipt that can bind MCP server risk posture when a tool call is MCP-backed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only. MCP risk posture can inform maturity evidence, but no scoring semantics changed. |
| Shield | Relevant. Shield needs drift findings when MCP server identity, transport, scope, sandbox, or network posture changes. |
| Enforce | Primary surface. Enforce blocks unsafe MCP calls before execution when observed server posture exceeds the signed contract. |
| Vault | Relevant. Vault-backed signing keys bind the MCP risk posture to the signed contract and receipt. |
| Watch | Relevant downstream. Watch can inspect MCP drift findings, but no monitor changed. |
| Fleet | Context only. Fleet can reuse the receipt across delegated MCP calls, but no orchestration path changed. |
| Passport | Not directly relevant. No portable trust-token schema changed. |
| Comply | Context only. Receipts may support audits, but no compliance mapping changed. |

## Product closure

Closed by extending the existing AMC-native ToolHub contract primitive:

- Signed tool contracts can include optional `mcpServerRiskPosture` with server id, server version, risk tier, approved transports, least-privilege scopes, sandbox requirement, and network policy.
- Tool invocation receipts can include `observedMcpServerRiskPosture`.
- `mcpServerRiskValidation` rejects server id/version mismatch, unapproved transport, unapproved scopes, missing required sandbox, and network policy drift.
- `validateToolSchemaContractInvocation` blocks before execution when MCP server posture drifts from the signed contract.
- `verifyToolSchemaContractReceipt` fails closed when MCP server risk validation evidence is missing from a receipt.
- `tests/gap1643McpUseToolSchemaContracts.test.ts` covers a valid MCP server posture path, a drift/block path, metadata-only rejection, and no mcp-use-specific identifiers in generic ToolHub implementation files.

No API route, CLI command, Studio panel, Watch monitor, methodology version bump, diagnostic question, scoring weight, or source-specific public behavior was added.

## Fail-closed rule

The following must fail closed for GAP-1643:

- mcp-use repository identity, archived repository metadata, monorepo metadata, README labels, topics, stars, forks, license, contents API, source title, source URL, local backlog text, or any other metadata-only evidence;
- unsigned or digest-mismatched tool contracts;
- missing MCP server risk validation evidence in a receipt;
- observed MCP server identity or version mismatch;
- unapproved MCP transport;
- observed scope not listed in the signed least-privilege scopes;
- missing sandbox when sandbox is required;
- observed network policy broader than the signed contract;
- invalid input schema evidence;
- invalid output schema evidence after execution;
- undeclared external systems, resources, data classes, or irreversible side effects;
- approval-required side effects without an approval receipt;
- receipt hash mismatch;
- missing validation evidence or missing Enforce/Shield/Vault surface binding.

## No-bloat boundary

No mcp-use adapter, mcp-use API client, TypeScript package dependency, Python package dependency, MCP client SDK wrapper, MCP server SDK wrapper, MCP Apps runtime, widget runtime, React hook integration, inspector integration, gateway integration, deploy integration, Manufact Cloud integration, template importer, docs importer, examples importer, source-specific MCP gateway, source-specific ToolHub integration, API route, CLI command, Studio view, Watch monitor, methodology bump, diagnostic question-bank change, scoring path, or source-specific implementation branch was added.

AMC did not copy upstream code, README prose beyond minimal metadata facts, docs prose beyond minimal labels, examples, configs, prompts, generated outputs, package metadata, lockfiles, workflows, images, widgets, templates, or implementation details.

## Verification

- TDD negative check: `npx vitest run tests/gap1643McpUseToolSchemaContracts.test.ts --reporter=dot` first failed because this doc did not exist and because `mcpServerRiskValidation` was not present in the generic ToolHub contract receipt.
- Focused behavioral check after implementation: `npx vitest run tests/gap1643McpUseToolSchemaContracts.test.ts --reporter=dot` passed the four behavior/no-bloat tests and failed only because this source-review doc did not exist.
- Final focused test: `npx vitest run tests/gap1643McpUseToolSchemaContracts.test.ts --reporter=dot` passed, 1 file / 5 tests.
- Related regression: `npx vitest run tests/gap1643McpUseToolSchemaContracts.test.ts tests/gap1640AEnvironmentToolSchemaContracts.test.ts tests/gap1637OutlinesToolSchemaContracts.test.ts tests/gap1635ViperConsentBlastRadiusBoundary.test.ts tests/gap1646GopherMcpConsentBlastRadiusBoundary.test.ts tests/gap1652DjangoRestFrameworkMcpConsentBlastRadiusBoundary.test.ts tests/governorToolhubWorkorders.test.ts tests/mcpComplianceSafety.test.ts tests/mcpServerTools.test.ts --reporter=dot` passed, 9 files / 54 tests.
- Whitespace: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 991 files / 7977 tests.
