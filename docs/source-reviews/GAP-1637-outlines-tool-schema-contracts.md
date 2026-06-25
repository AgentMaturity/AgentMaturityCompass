# GAP-1637 - Outlines tool schema contracts

- Gap: `GAP-1637`
- Dimension: `tool-schema-contracts`
- AMC surfaces requested: Enforce, Shield, Vault
- Source reviewed: dottxt-ai/outlines
- Retrieval: 2026-06-25 live GitHub API, raw README, homepage metadata, and repository contents API review
- Status: Done

## Source reviewed

- Repository URL: `https://github.com/dottxt-ai/outlines`
- GitHub API: `https://api.github.com/repos/dottxt-ai/outlines`
- Raw README: `https://raw.githubusercontent.com/dottxt-ai/outlines/main/README.md`
- Repository contents API: `https://api.github.com/repos/dottxt-ai/outlines/contents?ref=main`
- Homepage: `https://dottxt-ai.github.io/outlines/`

Live source metadata at retrieval:

- GitHub API identifies public repository `dottxt-ai/outlines`, not archived, not disabled, not a fork, default_branch `main`, language `Python`, license metadata `Apache-2.0`, stars `14136`, forks `723`, open issues `107`, created `2023-03-17T16:01:18Z`, pushed `2026-06-19T12:21:16Z`, and updated `2026-06-25T13:58:56Z`.
- GitHub API topics include `cfg`, `generative-ai`, `json`, `llms`, `prompt-engineering`, `regex`, `structured-generation`, and `symbolic-ai`.
- Raw README identifies the project as `Structured Outputs` for LLMs and describes structured generation, schema audit, output types, Pydantic usage, valid structures, and model/provider examples.
- Repository contents API confirms top-level files and directories including `.devcontainer`, `.github`, `LICENSE`, `README.md`, `docs`, `examples`, `llm.txt`, `mkdocs.yml`, `outlines`, `pyproject.toml`, `requirements-doc.txt`, `scripts`, `tests`, and `uv.lock`.

## Relevance decision

GAP-1637 is relevant to AMC because structured-output tools and MCP calls can look schema-safe while still producing unsafe side effects. AMC needs a generic Enforce, Shield, and Vault primitive that proves a tool invocation matched a signed contract before execution and records the validation evidence afterward.

The relevant AMC acceptance is: Tool contract, validation result, side-effect declaration, and drift finding.

The source is not a reason to add an Outlines runtime, schema compiler, adapter, dependency, or provider wrapper. Outlines metadata is useful only as a source-review signal for structured-output risk; it is not evidence that an AMC tool/MCP invocation had a signed tool contract or that its inputs, outputs, side effects, approval requirement, and failure modes were verified.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only. Contract receipts can inform maturity evidence, but no scoring semantics changed. |
| Shield | Relevant. Shield needs drift findings when tool schemas or side effects diverge from the signed contract. |
| Enforce | Primary surface. Enforce blocks unsafe calls before execution when input schema, output schema, side effects, or approval evidence fail. |
| Vault | Relevant. Vault-backed signing keys bind contracts and receipts without trusting metadata-only claims. |
| Watch | Relevant downstream. Watch can inspect receipt hashes and drift findings, but no monitor changed. |
| Fleet | Context only. Fleet can reuse the receipt for delegated tool calls, but no orchestration path changed. |
| Passport | Not directly relevant. No portable trust-token schema changed. |
| Comply | Context only. Receipts may support audits, but no compliance mapping changed. |

## Product closure

Closed with an AMC-native generic ToolHub contract primitive:

- `createSignedToolSchemaContract` creates a signed contract with input schema, output schema, side-effect declaration, failure modes, source citations, and a contract digest.
- `validateToolSchemaContractInvocation` validates inputs, outputs, and observed side effects against the signed contract, records approval evidence, emits drift findings, and blocks before execution when evidence fails.
- `verifyToolSchemaContractReceipt` verifies the receipt hash, contract signature, validation evidence, metadata-only rejection, and required Enforce/Shield/Vault surface binding.
- `tests/gap1637OutlinesToolSchemaContracts.test.ts` covers a valid signed contract path, an unsafe before-execution block, metadata-only rejection, receipt tampering, and no Outlines-specific identifiers in generic ToolHub implementation files.

No API route, CLI command, Studio panel, Watch monitor, methodology version bump, diagnostic question, scoring weight, or source-specific public behavior was added.

## Fail-closed rule

The following must fail closed for GAP-1637:

- Outlines repository identity, homepage, README labels, topics, stars, forks, license, contents API, source title, source URL, local backlog text, or any other metadata-only evidence;
- unsigned or digest-mismatched tool contracts;
- missing contract signature or unavailable signing key history;
- invalid input schema evidence;
- invalid output schema evidence after execution;
- undeclared external systems, resources, data classes, or irreversible side effects;
- approval-required side effects without an approval receipt;
- receipt hash mismatch;
- missing validation evidence or missing Enforce/Shield/Vault surface binding.

## No-bloat boundary

No Outlines adapter, API client, Python dependency, structured-generation runtime, CFG engine, regex engine, JSON schema compiler, Pydantic importer, provider wrapper, model runner, docs importer, examples importer, source-specific MCP gateway, source-specific ToolHub integration, API route, CLI command, Studio view, Watch monitor, methodology bump, diagnostic question-bank change, scoring path, or `outlines_tool_schema_contract` implementation branch was added.

AMC did not copy upstream code, README prose beyond minimal metadata facts, docs prose beyond minimal labels, examples, configs, prompts, generated outputs, package metadata, workflows, or implementation details.

## Verification

- TDD negative check: `npx vitest run tests/gap1637OutlinesToolSchemaContracts.test.ts --reporter=dot` first failed because `src/toolhub/toolSchemaContracts.ts` did not exist.
- Focused behavioral check after implementation: `npx vitest run tests/gap1637OutlinesToolSchemaContracts.test.ts --reporter=dot` passed the four behavior/no-bloat tests and failed only because this source-review doc did not exist.
- Final focused test: `npx vitest run tests/gap1637OutlinesToolSchemaContracts.test.ts --reporter=dot` passed, 1 file / 5 tests.
- Related regression: `npx vitest run tests/gap1637OutlinesToolSchemaContracts.test.ts tests/gap1635ViperConsentBlastRadiusBoundary.test.ts tests/gap1646GopherMcpConsentBlastRadiusBoundary.test.ts tests/gap1652DjangoRestFrameworkMcpConsentBlastRadiusBoundary.test.ts tests/gap1636GuidanceAutonomyBoundary.test.ts tests/gap1638LlamaCppAgentAutonomyBoundary.test.ts tests/governorToolhubWorkorders.test.ts tests/mcpComplianceSafety.test.ts tests/mcpServerTools.test.ts --reporter=dot` passed, 9 files / 54 tests.
- Whitespace: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 989 files / 7967 tests.
