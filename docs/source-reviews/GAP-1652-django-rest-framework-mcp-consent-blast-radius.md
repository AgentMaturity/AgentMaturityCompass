# GAP-1652 - Django REST Framework MCP consent and blast-radius prompts

- Gap: `GAP-1652`
- Dimension: `tool-consent-blast-radius`
- AMC surfaces requested: Enforce, Shield, Vault
- Source reviewed: zacharypodbela/django-rest-framework-mcp
- Retrieval: 2026-06-25 live GitHub API, raw README, and repository contents API review
- Status: Done

## Source reviewed

- Repository URL: `https://github.com/zacharypodbela/django-rest-framework-mcp`
- GitHub API: `https://api.github.com/repos/zacharypodbela/django-rest-framework-mcp`
- Raw README: `https://raw.githubusercontent.com/zacharypodbela/django-rest-framework-mcp/main/README.md`
- Repository contents API: `https://api.github.com/repos/zacharypodbela/django-rest-framework-mcp/contents?ref=main`

Live source metadata at retrieval:

- GitHub API identifies public repository `zacharypodbela/django-rest-framework-mcp`, not archived, not disabled, not a fork, default_branch `main`, language `Python`, license metadata `BSD-3-Clause`, stars `50`, forks `6`, open issues `6`, created `2025-08-09T18:25:23Z`, pushed `2025-11-25T21:25:20Z`, and updated `2026-06-25T13:58:59Z`.
- GitHub API has no topic labels for the repository at retrieval.
- Raw README identifies `Django REST Framework MCP`, Django REST Framework, Model Context Protocol, API, server, authentication, permissions, and OpenAPI context.
- Repository contents API confirms top-level files and directories including `README.md`, `LICENSE`, `CLAUDE.md`, `CONTRIBUTING.md`, `MANIFEST.in`, `pyproject.toml`, `setup.cfg`, `setup.py`, `demo`, `djangorestframework_mcp`, `external-docs`, `internal-docs`, `source-code-of-dependencies`, and `tests`.

## Relevance decision

GAP-1652 is relevant to AMC through Enforce, Shield, Vault, and the existing ToolHub consent/blast-radius primitive created for GAP-1635. Django REST Framework MCP is useful source-review context for API-backed MCP servers that expose REST actions as tools to LLM and agent workflows, especially where authentication, permissions, OpenAPI shape, external APIs, and data export can create high-impact blast radius.

The correct AMC closure is not a Django REST Framework MCP integration. The relevant product proof is the existing generic ToolHub consent object: consent prompt, summarized impact, reviewer decision, executed scope, metadata-only rejection, hashable consent evidence, and signed ToolHub action receipt binding.

metadata-only Django REST Framework MCP repository facts, README labels, Python language metadata, BSD license metadata, authentication labels, permissions labels, OpenAPI labels, local backlog text, or source identity cannot prove consent or blast-radius safety.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only. MCP server risk can influence scoring through observed ToolHub evidence, but no scoring weights changed. |
| Shield | Relevant. Shield needs reviewed evidence before API-backed tools export data or affect external systems. |
| Enforce | Primary surface. ToolHub prompts for impact, reviewer decision, and executed scope before high-impact execution. |
| Vault | Relevant. Vault preserves hashes and metadata while keeping API tokens and raw payloads out of prompts and receipts. |
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
- `tests/gap1652DjangoRestFrameworkMcpConsentBlastRadiusBoundary.test.ts`

No product code change was needed for GAP-1652 because GAP-1635 already added the generic primitive that exposes resources, accounts/env scope, external systems, irreversible effects, reviewer decision status, and executed scope for high-impact ToolHub execution.

## Fail-closed rule

The following must fail closed for GAP-1652:

- Django REST Framework MCP repository identity alone;
- GitHub API metadata, raw README labels, repository contents API, stars, forks, license, language, branch, commit dates, Django REST Framework labels, Model Context Protocol labels, API labels, server labels, authentication labels, permissions labels, OpenAPI labels, local backlog text, or source identity alone;
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

No Django REST Framework MCP adapter, Django REST Framework MCP API client, DRF package dependency, Python package dependency, MCP server integration, Django integration, REST framework integration, OpenAPI importer, authentication importer, permissions importer, demo importer, source-code-of-dependencies importer, docs importer, examples importer, API route, CLI command, Studio panel, Watch monitor, methodology bump, diagnostic question-bank change, source-specific scoring path, or Django REST Framework MCP-specific implementation branch was added.

AMC did not copy upstream Python code, README prose beyond minimal metadata facts, docs prose beyond minimal labels, examples, configs, OpenAPI schemas, authentication code, permission code, dependency source, prompts, screenshots, generated outputs, package metadata, workflows, images, or implementation details.

## Verification

- TDD negative check: `npx vitest run tests/gap1652DjangoRestFrameworkMcpConsentBlastRadiusBoundary.test.ts --reporter=dot` first failed because this doc did not exist while three ToolHub consent/no-bloat tests passed.
- Focused test: `npx vitest run tests/gap1652DjangoRestFrameworkMcpConsentBlastRadiusBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Related regression: `npx vitest run tests/gap1652DjangoRestFrameworkMcpConsentBlastRadiusBoundary.test.ts tests/gap1646GopherMcpConsentBlastRadiusBoundary.test.ts tests/gap1635ViperConsentBlastRadiusBoundary.test.ts tests/governorToolhubWorkorders.test.ts tests/consoleApprovalsWhatifBenchmarks.test.ts tests/mcpComplianceSafety.test.ts tests/mcpServerTools.test.ts tests/outcomesCasebooksExperimentsValueGates.test.ts --reporter=dot` passed, 8 files / 54 tests.
- Whitespace: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 986 files / 7952 tests.
