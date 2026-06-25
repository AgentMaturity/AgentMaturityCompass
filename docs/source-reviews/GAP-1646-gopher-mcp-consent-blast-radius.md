# GAP-1646 - Gopher MCP consent and blast-radius prompts

- Gap: `GAP-1646`
- Dimension: `tool-consent-blast-radius`
- AMC surfaces requested: Enforce, Shield, Vault
- Source reviewed: GopherSecurity/gopher-mcp
- Retrieval: 2026-06-25 live GitHub API, raw README, and repository contents API review
- Status: Done

## Source reviewed

- Repository URL: `https://github.com/GopherSecurity/gopher-mcp`
- GitHub API: `https://api.github.com/repos/GopherSecurity/gopher-mcp`
- Raw README: `https://raw.githubusercontent.com/GopherSecurity/gopher-mcp/main/README.md`
- Repository contents API: `https://api.github.com/repos/GopherSecurity/gopher-mcp/contents?ref=main`
- Homepage metadata: `https://gopher.security`

Live source metadata at retrieval:

- GitHub API identifies public repository `GopherSecurity/gopher-mcp`, not archived, not disabled, not a fork, default_branch `main`, language `C++`, license metadata `Apache-2.0`, stars `120`, forks `17`, open issues `67`, created `2025-08-02T05:34:36Z`, pushed `2026-06-24T15:21:05Z`, and updated `2026-06-19T00:22:20Z`.
- GitHub topics include `ai`, `ai-tools`, `async`, `cplusplus`, `cpp`, `cross-platform`, `event-driven`, `json-rpc`, `llm`, `llm-tools`, `mcp`, `mcp-client`, `mcp-sdk`, `mcp-server`, `model-context-protocol`, `protocol`, `sdk`, and `tool-calling`.
- Raw README identifies a C++ Model Context Protocol SDK context, JSON-RPC, mcp-server, mcp-client, async behavior, and Observability context.
- Repository contents API confirms top-level files and directories including `README.md`, `LICENSE`, `CHANGELOG.md`, `CMakeLists.txt`, `Makefile`, `docs`, `examples`, `include`, `sdk`, `src`, `tests`, `bindings`, `docker-mcp`, and `vcpkg.json`.

## Relevance decision

GAP-1646 is relevant to AMC through Enforce, Shield, Vault, and the existing ToolHub consent/blast-radius primitive created for GAP-1635. Gopher MCP is useful source-review context for MCP client/server/tool-calling surfaces where high-impact tools can touch external systems, account scope, and irreversible operational effects.

The correct AMC closure is not a Gopher MCP integration. The relevant product proof is the existing generic ToolHub consent object: consent prompt, summarized impact, reviewer decision, executed scope, metadata-only rejection, hashable consent evidence, and signed ToolHub action receipt binding.

metadata-only Gopher MCP repository facts, README labels, topic labels, homepage metadata, C++ language metadata, JSON-RPC labels, mcp-client labels, mcp-server labels, local backlog text, or source identity cannot prove consent or blast-radius safety.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only. MCP server risk can influence scoring through observed ToolHub evidence, but no scoring weights changed. |
| Shield | Relevant. Shield needs high-impact MCP/tool execution evidence to show unsafe calls are blocked or reviewed before execution. |
| Enforce | Primary surface. ToolHub prompts for impact, reviewer decision, and executed scope before high-impact execution. |
| Vault | Relevant. Vault preserves hashes and metadata while keeping secret values out of prompts and receipts. |
| Watch | Context only. Watch can inspect ToolHub receipts, but no monitor changed. |
| Fleet | Context only. Fleet can aggregate tool risk later, but no topology behavior changed. |
| Passport | Not directly relevant. No portable trust-token schema changed. |
| Comply | Context only. Consent receipts may support audit, but no compliance mapping changed. |

## Product closure

Closed through the existing AMC-native ToolHub blast-radius consent primitive:

- `buildToolBlastRadiusConsent`
- `buildToolExecutedScope`
- `withToolBlastRadiusDecision`
- `hashToolBlastRadiusConsent`
- `validateToolBlastRadiusConsent`
- existing ToolHub execution receipt binding in `src/toolhub/toolhubServer.ts` and `src/toolhub/toolhubReceipts.ts`
- `tests/gap1646GopherMcpConsentBlastRadiusBoundary.test.ts`

No product code change was needed for GAP-1646 because GAP-1635 already added the generic primitive that exposes resources, accounts/env scope, external systems, irreversible effects, reviewer decision status, and executed scope for high-impact ToolHub execution.

## Fail-closed rule

The following must fail closed for GAP-1646:

- Gopher MCP repository identity alone;
- GitHub API metadata, raw README labels, repository contents API, stars, forks, license, language, branch, commit dates, topic labels, Model Context Protocol labels, JSON-RPC labels, mcp-server labels, mcp-client labels, homepage metadata, local backlog text, or source identity alone;
- high-impact execution with metadata-only consent evidence;
- consent prompt shorter than the reviewed blast-radius prompt;
- missing resources;
- missing external system or account scope when present in args;
- missing irreversible effect summary for high-impact execution;
- missing reviewer decision;
- reviewer decision that is not approved or ticket accepted for high-impact execution;
- missing executed scope;
- simulated executed scope pretending to prove real execution.

## No-bloat boundary

No Gopher MCP adapter, Gopher MCP API client, MCP C++ SDK wrapper, C++ package dependency, JSON-RPC bridge, mcp-server integration, mcp-client integration, tool-calling importer, observability bridge, docker-mcp wrapper, docs importer, examples importer, CMake/vcpkg importer, SDK mirror, API route, CLI command, Studio panel, Watch monitor, methodology bump, diagnostic question-bank change, source-specific scoring path, or Gopher-specific implementation branch was added.

AMC did not copy upstream C++ code, README prose beyond minimal metadata facts, docs prose beyond minimal labels, examples, configs, build files, SDK source, JSON-RPC schemas, prompts, screenshots, generated outputs, package metadata, workflows, images, or implementation details.

## Verification

- TDD negative check: `npx vitest run tests/gap1646GopherMcpConsentBlastRadiusBoundary.test.ts --reporter=dot` first failed because this doc did not exist while three ToolHub consent/no-bloat tests passed.
- Focused test: `npx vitest run tests/gap1646GopherMcpConsentBlastRadiusBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Related regression: `npx vitest run tests/gap1646GopherMcpConsentBlastRadiusBoundary.test.ts tests/gap1635ViperConsentBlastRadiusBoundary.test.ts tests/governorToolhubWorkorders.test.ts tests/consoleApprovalsWhatifBenchmarks.test.ts tests/mcpComplianceSafety.test.ts tests/mcpServerTools.test.ts tests/outcomesCasebooksExperimentsValueGates.test.ts --reporter=dot` passed, 7 files / 50 tests.
- Whitespace: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 985 files / 7948 tests.
