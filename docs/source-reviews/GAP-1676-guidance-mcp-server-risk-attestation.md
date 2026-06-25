# GAP-1676 - Guidance MCP server risk attestation boundary

- Gap: `GAP-1676`
- Dimension: `tool-mcp-risk-attestation`
- AMC surfaces requested: Enforce, Shield, Vault
- Source reviewed: guidance-ai/guidance
- Retrieval: 2026-06-25 live GitHub API, raw README, and repository contents API review
- Status: Done - skipped

## Source reviewed

- Repository URL: `https://github.com/guidance-ai/guidance`
- GitHub API: `https://api.github.com/repos/guidance-ai/guidance`
- Raw README: `https://raw.githubusercontent.com/guidance-ai/guidance/main/README.md`
- Repository contents API: `https://api.github.com/repos/guidance-ai/guidance/contents?ref=main`

Live source metadata at retrieval:

- The repository is public, not archived, not disabled, not a fork, default_branch `main`, language `Jupyter Notebook`, license metadata `MIT`, stars `21519`, forks `1170`, open issues `296`, created `2022-11-10T18:21:45Z`, pushed `2026-05-21T17:08:04Z`, and updated `2026-06-25T12:51:29Z`.
- The repository description is "A guidance language for controlling large language models."
- The README describes Guidance as a programming paradigm for steering language models through constrained generation, regex and CFG constraints, conditionals, loops, tool use, and generation control.
- The README says Guidance is available through PyPI and supports backends such as Transformers, llama.cpp, and OpenAI.
- The contents API confirms files and directories including `.github`, `CONTRIBUTING.md`, `GOVERNANCE.md`, `LICENSE.md`, `MAINTAINERS.md`, `README.md`, `client`, `docs`, `guidance`, `notebooks`, `packages`, `pyproject.toml`, `scripts`, and `tests`.

## Relevance decision

GAP-1676 is relevance-limited. Guidance is useful adjacent context for constrained generation and tool use, but it is not an MCP server, MCP gateway, MCP tool registry, MCP risk attestation product, or server-manifest source. Therefore it does not justify a Guidance-specific MCP server attestation implementation.

The backlog acceptance remains important for real MCP servers: Server manifest, capability list, signer, sandbox policy, and last scan. That acceptance is already covered generically by `src/mcp/mcpServerRiskAttestation.ts` from `GAP-1644`.

This gap is closed as Done - skipped: no product code changed, and the source-review boundary documents why Guidance metadata cannot stand in for MCP server attestation evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only. `GAP-1644` receipts expose risk score-impact signals for real MCP server attestations; Guidance does not change scoring semantics. |
| Shield | Relevant as a fail-closed boundary. Shield must reject metadata-only Guidance facts when an MCP server attestation is required. |
| Enforce | Relevant as a fail-closed boundary. Enforce can use the generic MCP server attestation primitive for actual MCP servers, not Guidance metadata. |
| Vault | Relevant through existing signing/verification of generic MCP attestations; no Guidance-specific key path changed. |
| Watch | Not directly relevant. No monitor changed. |
| Fleet | Not directly relevant. No orchestration changed. |
| Passport | Context only. Generic attestation receipts can travel in proof bundles, but no Passport schema changed. |
| Comply | Not directly relevant. No compliance mapping changed. |

## Product closure

No product code changed for `GAP-1676`.

The existing generic closure from `GAP-1644` remains the appropriate AMC primitive:

- `createSignedMcpServerRiskAttestation` signs server manifest, capability list, signer identity, sandbox policy, and last scan.
- `evaluateMcpServerRiskAttestation` blocks unsafe MCP invocations before execution and emits deterministic risk score-impact signals.
- `verifyMcpServerRiskAttestationReceipt` fails closed on metadata-only source facts, invalid signatures, missing required evidence, stale or missing scan evidence, and receipt hash mismatch.
- `tests/gap1676GuidanceMcpRiskAttestationBoundary.test.ts` proves Guidance metadata fails closed as MCP server attestation proof and that generic attestation remains usable without adding Guidance-specific product code.

## Fail-closed rule

The following must fail closed for GAP-1676:

- Guidance repository identity, README labels, constrained-generation labels, regex/CFG labels, tool-use labels, language/license facts, stars/forks/issues, backend names, PyPI labels, local backlog text, or any metadata-only evidence;
- any claim that Guidance is an MCP server or MCP server risk attestation source without a real AMC-owned server manifest;
- unsigned, digest-mismatched, or metadata-only MCP server attestations;
- missing server manifest, capability list, signer identity, sandbox policy, or last scan;
- missing Enforce/Shield/Vault surface binding.

## No-bloat boundary

No Guidance adapter, Guidance API client, Python dependency, Jupyter dependency, constrained-generation runtime, regex engine, CFG engine, model backend, OpenAI backend wrapper, Transformers backend wrapper, llama.cpp backend wrapper, tool-use runtime, MCP server wrapper, MCP gateway, MCP registry, server attestation importer, notebook importer, docs importer, examples importer, API route, CLI command, Studio view, Watch monitor, methodology bump, diagnostic question-bank change, scoring path, or Guidance-specific implementation branch was added.

AMC did not copy upstream Python code, notebook content, README prose beyond minimal metadata facts, docs prose beyond minimal labels, examples, configs, prompts, generated outputs, package metadata, workflows, images, widgets, grammar examples, tool-use examples, or implementation details.

## Verification

- TDD negative check: `npx vitest run tests/gap1676GuidanceMcpRiskAttestationBoundary.test.ts --reporter=dot` first passed the generic attestation behavior/no-bloat tests and failed only because this source-review doc did not exist.
- Final focused test: `npx vitest run tests/gap1676GuidanceMcpRiskAttestationBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Related regression: `npx vitest run tests/gap1676GuidanceMcpRiskAttestationBoundary.test.ts tests/gap1644PostgresOpsMcpServerRiskAttestation.test.ts tests/gap1636GuidanceAutonomyBoundary.test.ts tests/gap1643McpUseToolSchemaContracts.test.ts tests/gap1639McpUniverseLeastPrivilegeGrants.test.ts tests/gap1641GollemLeastPrivilegeGrants.test.ts tests/gap1640AEnvironmentToolSchemaContracts.test.ts tests/gap1637OutlinesToolSchemaContracts.test.ts tests/mcpComplianceSafety.test.ts tests/mcpServerTools.test.ts tests/passportSchemaCompatibility.test.ts tests/receiptInterchange.test.ts --reporter=dot` passed, 10 files / 57 tests.
- Whitespace: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 995 files / 7,996 tests.
