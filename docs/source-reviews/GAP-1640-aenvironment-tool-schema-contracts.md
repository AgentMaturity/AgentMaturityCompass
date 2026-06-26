# GAP-1640 - AEnvironment tool schema contracts

- Gap: `GAP-1640`
- Dimension: `tool-schema-contracts`
- AMC surfaces requested: Enforce, Shield, Vault
- Source reviewed: inclusionAI/AEnvironment
- Retrieval: 2026-06-25 live GitHub API, raw README, homepage metadata, and repository contents API review
- Status: Done

## Source reviewed

- Repository URL: `https://github.com/inclusionAI/AEnvironment`
- GitHub API: `https://api.github.com/repos/inclusionAI/AEnvironment`
- Raw README: `https://raw.githubusercontent.com/inclusionAI/AEnvironment/main/README.md`
- Repository contents API: `https://api.github.com/repos/inclusionAI/AEnvironment/contents?ref=main`
- Homepage: `https://inclusionai.github.io/AEnvironment/`

Live source metadata at retrieval:

- GitHub API identifies public repository `inclusionAI/AEnvironment`, not archived, not disabled, not a fork, default_branch `main`, language `Python`, license metadata `Apache-2.0`, stars `310`, forks `36`, open issues `14`, created `2025-12-16T08:55:47Z`, pushed `2026-06-25T07:29:26Z`, and updated `2026-06-25T10:10:59Z`.
- GitHub API topics include `agent`, `ant-asystem`, `asystem`, `benchmark`, `environment`, `mcp`, `reinforement-learning`, `rl`, and `sandbox`.
- Raw README describes `AEnvironment`, `Everything as Environment`, Agentic RL, extended MCP protocol, environment providers, agent/service deployment, tools/functions/rewards, built-in environments, sandbox-style terminal environments, and agent-as-environment composition.
- Repository contents API confirms top-level files and directories including `.claude`, `.github`, `CONTRIBUTING.md`, `LEGAL.md`, `LICENSE`, `README.md`, `aenv`, `api-service`, `controller`, `deploy`, `docs`, `envhub`, `go.work`, and `go.work.sum`.

## Relevance decision

GAP-1640 is relevant to AMC because environment platforms can expose deployment, sandbox, terminal, file, registry, tool, and agent-as-environment operations through one tool-like interface. A signed contract must prove more than nominal schema compatibility: it must bind input, output, side effects, approvals, and declared failure modes into a verifiable receipt.

The relevant AMC acceptance is: Tool contract, validation result, side-effect declaration, and drift finding.

The source does not justify an AEnvironment adapter. AEnvironment metadata is useful as a source-review signal for MCP and sandboxed environment risk; it is not evidence that an AMC tool invocation had a signed contract, output validation, side-effect validation, approval evidence, or failure-mode validation.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only. Tool contract receipts may feed maturity evidence, but no scoring semantics changed. |
| Shield | Relevant. Shield needs drift findings when environment tools exceed declared side effects or failure modes. |
| Enforce | Primary surface. Enforce blocks unsafe tool execution when contract, schema, approval, side-effect, or failure-mode evidence fails. |
| Vault | Relevant. Vault-backed signing keys bind contracts and receipts without trusting metadata-only claims. |
| Watch | Relevant downstream. Watch can inspect contract drift findings, but no monitor changed. |
| Fleet | Context only. Multi-agent environment calls can reuse the receipt, but no orchestration path changed. |
| Passport | Not directly relevant. No portable trust-token schema changed. |
| Comply | Context only. Receipts may support audits, but no compliance mapping changed. |

## Product closure

Closed by extending the existing AMC-native ToolHub contract primitive from GAP-1637:

- `validateToolSchemaContractInvocation` now accepts `observedFailureMode` and records it in the signed receipt.
- `failureModeValidation` verifies that signed contracts declare failure modes and that observed failure modes are included in the signed contract.
- Undeclared failure modes emit `failure_mode_drift`; contracts with no declared failure modes emit `failure_modes_missing`.
- `verifyToolSchemaContractReceipt` fails closed when failure-mode validation evidence is missing from the receipt.
- `tests/gap1640AEnvironmentToolSchemaContracts.test.ts` covers a valid signed deploy-tool contract, an undeclared failure-mode drift case, metadata-only rejection, and no AEnvironment-specific identifiers in generic ToolHub implementation files.

No API route, CLI command, Studio panel, Watch monitor, methodology version bump, diagnostic question, scoring weight, or source-specific public behavior was added.

## Fail-closed rule

The following must fail closed for GAP-1640:

- AEnvironment repository identity, homepage, README labels, topics, stars, forks, license, contents API, source title, source URL, local backlog text, or any other metadata-only evidence;
- unsigned or digest-mismatched tool contracts;
- missing failure-mode declarations in a signed contract;
- observed failure modes not declared in the signed contract;
- missing failure-mode validation evidence in a receipt;
- invalid input schema evidence;
- invalid output schema evidence after execution;
- undeclared external systems, resources, data classes, or irreversible side effects;
- approval-required side effects without an approval receipt;
- receipt hash mismatch;
- missing validation evidence or missing Enforce/Shield/Vault surface binding.

## No-bloat boundary

No AEnvironment adapter, AEnvironment API client, Python dependency, environment runtime, MCP server integration, sandbox runner, terminal runner, deployment workflow, Claude Code Skill importer, PyPI package integration, RL training integration, benchmark importer, TAU2 importer, SWE-Bench importer, Terminal-Bench importer, Mini Program example importer, docs importer, examples importer, source-specific MCP gateway, source-specific ToolHub integration, API route, CLI command, Studio view, Watch monitor, methodology bump, diagnostic question-bank change, scoring path, or source-specific implementation branch was added.

AMC did not copy upstream code, README prose beyond minimal metadata facts, docs prose beyond minimal labels, examples, configs, prompts, generated outputs, package metadata, workflows, images, or implementation details.

## Verification

- TDD negative check: `npx vitest run tests/gap1640AEnvironmentToolSchemaContracts.test.ts --reporter=dot` first failed because this doc did not exist and because `failureModeValidation` was not present in the generic ToolHub contract receipt.
- Focused behavioral check after implementation: `npx vitest run tests/gap1640AEnvironmentToolSchemaContracts.test.ts --reporter=dot` passed the four behavior/no-bloat tests and failed only because this source-review doc did not exist.
- Final focused test: `npx vitest run tests/gap1640AEnvironmentToolSchemaContracts.test.ts --reporter=dot` passed, 1 file / 5 tests.
- Related regression: `npx vitest run tests/gap1640AEnvironmentToolSchemaContracts.test.ts tests/gap1637OutlinesToolSchemaContracts.test.ts tests/gap1635ViperConsentBlastRadiusBoundary.test.ts tests/gap1646GopherMcpConsentBlastRadiusBoundary.test.ts tests/gap1652DjangoRestFrameworkMcpConsentBlastRadiusBoundary.test.ts tests/governorToolhubWorkorders.test.ts tests/mcpComplianceSafety.test.ts tests/mcpServerTools.test.ts --reporter=dot` passed, 8 files / 49 tests.
- Whitespace: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 990 files / 7972 tests.
