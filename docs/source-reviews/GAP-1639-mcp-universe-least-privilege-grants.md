# GAP-1639 - MCP-Universe least-privilege tool grants

- Gap: `GAP-1639`
- Dimension: `tool-least-privilege`
- AMC surfaces requested: Enforce, Shield, Vault
- Source reviewed: SalesforceAIResearch/MCP-Universe
- Retrieval: 2026-06-25 live GitHub API, raw README, and repository contents API review
- Status: Done

## Source reviewed

- Repository URL: `https://github.com/SalesforceAIResearch/MCP-Universe`
- GitHub API: `https://api.github.com/repos/SalesforceAIResearch/MCP-Universe`
- Raw README: `https://raw.githubusercontent.com/SalesforceAIResearch/MCP-Universe/main/README.md`
- Repository contents API: `https://api.github.com/repos/SalesforceAIResearch/MCP-Universe/contents?ref=main`
- Project homepage: `https://mcp-universe.github.io/`

Live source metadata at retrieval:

- The repository is public, not archived, not disabled, not a fork, default_branch `main`, language `Python`, license metadata `Apache-2.0`, stars `591`, forks `85`, open issues `30`, created `2025-05-02T05:47:55Z`, pushed `2026-06-23T09:01:52Z`, and updated `2026-06-25T04:05:57Z`.
- The repository homepage is `https://mcp-universe.github.io/` and the topic list is empty.
- The README identifies MCP-Universe as an ecosystem for building, optimizing, and evaluating AI agents that interact with MCP, including benchmarking for real-world MCP server interactions.
- The README frames the benchmark around real-world scenarios, long-horizon reasoning, large, unfamiliar tool spaces, real-world data sources, live environments, and dynamic evaluation.
- The top-level contents API confirms files and directories including `.env.example`, `.github`, `AI_ETHICS.md`, `CODEOWNERS`, `CONTRIBUTING.md`, `LICENSE.txt`, `README.md`, `SECURITY.md`, `assets`, `docs`, `mcpuniverse`, `pyproject.toml`, and `requirements.txt`.

## Relevance decision

GAP-1639 is relevant to AMC because MCP-backed agents often need broad tool discovery while the safe runtime requirement is the opposite: per-task, least-privilege grants with expiry, approval linkage, and an unused-permission report. MCP-Universe is source-review evidence that real MCP workloads can involve large tool spaces, live data, long task horizons, and parallel tool usage; those properties make overbroad grants a material Enforce/Shield/Vault risk.

The relevant AMC acceptance is: Grant request, approved scope, expiry, used permissions, and unused permission report.

The source does not justify an MCP-Universe integration. AMC closes this gap through a generic signed least-privilege tool grant receipt that can be used by ToolHub, Enforce, Shield, Vault, and Watch without importing MCP-Universe code, tasks, benchmarks, configs, prompts, or examples.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only. Least-privilege grant receipts can support maturity evidence, but no scoring semantics changed. |
| Shield | Relevant. Shield needs drift findings when tool use exceeds approved scope, resource, external-system, or data-class bounds. |
| Enforce | Primary surface. Enforce blocks unsafe calls before execution when a used permission exceeds the signed grant or the grant expired. |
| Vault | Relevant. Vault-backed signing keys bind approval scope, expiry, and grant digest to the receipt. |
| Watch | Relevant. Watch can inspect expiry, drift findings, and unused permission reports for runtime evidence drilldown. |
| Fleet | Context only. Fleet can reuse the generic receipt across delegated agents, but no orchestration path changed. |
| Passport | Not directly relevant. No portable trust-token schema changed. |
| Comply | Context only. Receipts may support audit narratives, but no compliance mapping changed. |

## Product closure

Closed by adding the AMC-native `leastPrivilegeGrants` primitive:

- `createSignedLeastPrivilegeToolGrant` signs a per-task grant that binds grant request, agent, run, task, tool, action class, requested scope, approved scope, approval receipt, policy id, approver, source citations, expiry, digest, and signer.
- `evaluateLeastPrivilegeToolGrantUsage` evaluates the signed grant before or after execution, validates the signature, checks expiry, rejects used scopes/resources/external systems/data classes outside the approved scope, blocks before execution on unsafe use, emits drift findings, and produces an unused permission report.
- `verifyLeastPrivilegeToolGrantReceipt` fails closed when metadata-only source evidence replaces a signed grant, the receipt hash is mismatched, grant signature evidence is invalid, unused permission reporting is missing, or Enforce/Shield/Vault binding is absent.
- `tests/gap1639McpUniverseLeastPrivilegeGrants.test.ts` covers the source-review boundary, allowed least-privilege use, unused permission reporting, expired and overbroad use blocking, metadata-only rejection, and no MCP-Universe-specific identifiers in generic ToolHub implementation files.

No API route, CLI command, Studio panel, Watch monitor, methodology version bump, diagnostic question, scoring weight, or source-specific public behavior was added.

## Fail-closed rule

The following must fail closed for GAP-1639:

- MCP-Universe repository identity, README labels, homepage, arXiv badge, leaderboard badge, stars, forks, license, file names, local backlog text, or any other metadata-only evidence;
- unsigned, digest-mismatched, or metadata-only grants;
- grants without approval receipt, approved scope, expiry, policy id, or source citations;
- missing unused permission report;
- grant use after expiry;
- used scope not included in the approved scope;
- used resource not included in the approved resources;
- used external system not included in the approved external systems;
- used data class not included in the approved data classes;
- receipt hash mismatch;
- missing Enforce/Shield/Vault surface binding.

## No-bloat boundary

No MCP-Universe adapter, `mcpuniverse` dependency, Python package dependency, benchmark runner, task importer, MCPMark runner, Deep Research Agent wrapper, MCP+ wrapper, Docker/PostgreSQL/Redis setup, dashboard integration, leaderboard integration, website scraper, docs importer, examples importer, source-specific ToolHub branch, API route, CLI command, Studio view, Watch monitor, methodology bump, diagnostic question-bank change, scoring path, or source-specific implementation branch was added.

AMC did not copy upstream code, README prose beyond minimal metadata facts, docs prose beyond minimal labels, examples, configs, prompts, generated outputs, package metadata, lockfiles, workflows, images, benchmark rows, model outputs, or implementation details.

## Verification

- TDD negative check: `npx vitest run tests/gap1639McpUniverseLeastPrivilegeGrants.test.ts --reporter=dot` first failed because `src/toolhub/leastPrivilegeGrants.ts` did not exist.
- Focused behavioral check after implementation: `npx vitest run tests/gap1639McpUniverseLeastPrivilegeGrants.test.ts --reporter=dot` passed the behavior/no-bloat tests and failed only because this source-review doc did not exist.
- Final focused test: `npx vitest run tests/gap1639McpUniverseLeastPrivilegeGrants.test.ts --reporter=dot` passed, 1 file / 5 tests.
- Related regression: `npx vitest run tests/gap1639McpUniverseLeastPrivilegeGrants.test.ts tests/gap1643McpUseToolSchemaContracts.test.ts tests/gap1640AEnvironmentToolSchemaContracts.test.ts tests/gap1637OutlinesToolSchemaContracts.test.ts tests/gap1635ViperConsentBlastRadiusBoundary.test.ts tests/gap1646GopherMcpConsentBlastRadiusBoundary.test.ts tests/gap1652DjangoRestFrameworkMcpConsentBlastRadiusBoundary.test.ts tests/governorToolhubWorkorders.test.ts tests/mcpComplianceSafety.test.ts tests/mcpServerTools.test.ts --reporter=dot` passed, 10 files / 59 tests.
- Whitespace: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 992 files / 7,982 tests.
