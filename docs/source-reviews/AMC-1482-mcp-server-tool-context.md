# AMC-1482 - MCP server and tool context

- Issue: `AMC-1482`
- Dimension: signed tool identity, MCP server grouping, and trust-graph context
- AMC surfaces requested: Enforce, Fleet, ToolHub CLI/API/Studio, CGX, OpenAPI, Docs
- Sources reviewed: [AgentApprove changelog](https://www.agentapprove.com/changelog) and [Agent Event Protocol specification at commit 2583cff](https://github.com/agentapprove/agent-event-protocol/blob/2583cff9380f8f0a459d52c7112b6105c46496ed/spec.md)
- Retrieval: live first-party page and immutable public specification reviewed 2026-07-13
- Status: Implemented and release-gate verified locally; publication verification pending

## Relevance decision

This item is directly relevant. AMC already had a signed ToolHub allowlist and signed CGX graph, but both reduced allowed tools to flat names. Operators could not distinguish integration context, group MCP tools under one declared server, or carry a stable server/tool identity from Enforce into Fleet.

The AgentApprove changelog response was retrieved with SHA-256 `58a811317f569bb3cdb4c18d8fad271abc703a78ba1c180fd6523f7478d7f8a0`; its relevant product signal is server-level grouping for observed MCP tools. The external specification was pinned at commit `2583cff9380f8f0a459d52c7112b6105c46496ed` and retrieved with SHA-256 `c5211e50374436a1956eff07a007c84e8eeb522acc6e691f58d4f817d7ad609e`; its relevant architectural signal is separation between invocations and stable tool/server catalog identities.

AMC takes only those product lessons. It keeps its own signed ToolHub policy, domain-separated identity scheme, action classes, APIs, Studio UI, CGX vocabulary, integrity model, and claim boundary.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring, maturity, diagnostic, or methodology change. |
| Shield | No detector, attack pack, scan, or safety score change. |
| Enforce | Primary. Signed policy now carries bounded declared MCP context and the list path fails closed before returning tools. |
| Vault | Existing auditor keys verify the config snapshot; no secret, credential, path, raw policy, or signature material is exposed. |
| Watch | Context is inspectable, but no runtime event, liveness, monitor, or discovery claim is added. |
| Fleet | Primary supporting surface. CGX now represents MCP server nodes and provider edges using the same identities. |
| Passport | The projection is not signed, portable, recorded, or proof eligible. |
| Comply | No framework mapping, retention rule, or evidence class changes. |

## Product closure

- Extended the existing version 1 tool definition with optional strict `native` or `mcp` context. Omitted context remains native.
- Added one `2026-07-13` projection over an exact config byte snapshot whose digest and auditor signature are verified before parsing.
- Derived domain-separated stable native-tool, MCP-tool, and MCP-server identities without user-managed identity rows or a second store.
- Validated the complete allowlist before returning any row, including case-normalized duplicate names, identity collisions, and exact server-metadata consistency.
- Grouped native tools separately and MCP tools by server in deterministic order.
- Reused the projection in `amc tools list [--json]`, `GET /api/v1/tools/list`, authenticated `GET /toolhub/tools`, Studio ToolHub, and CGX.
- Added `MCPServer` nodes and `PROVIDES` edges to the existing CGX schema and propagation vocabulary.
- Kept ToolHub intent and execution requests name-based and behavior-compatible.

## Fail-closed rule

Missing config, missing signature, digest/signature failure, malformed signed schema, duplicate normalized tool names, duplicate derived identities, or conflicting name/version/transport metadata for one server ID produce an untrusted projection with zero tools and groups. CGX refuses to build from that projection.

The output contains only the signed config hash when available, aggregate status, bounded reason codes, stable identities, names, action classes, execution-ticket requirements, and declared server context. It excludes allow/deny rules, paths, arguments, commands, payloads, credentials, signature bytes, and private runtime state.

Every result states `derivedView: true`, `recorded: false`, and `proofEligible: false`. It proves only declared context in the current signed ToolHub allowlist. It does not discover a live server, prove availability, verify a server attestation, or prove an invocation.

## No-bloat boundary

No MCP registry, catalog database, discovery scanner, daemon, poller, runtime probe, event protocol importer, external schema adapter, server process, attestation store, second tool authority, new command, duplicate route, new public guide, scoring change, methodology bump, evidence type, receipt type, or provider-specific subsystem was added.

No competitor code, schema, event rows, IDs, tests, prose, configuration, screenshots, visual assets, examples, generated output, or implementation details were copied.

## Verification

- Expected red: the dedicated contract failed because `src/toolhub/toolContext.ts` did not exist.
- Dedicated contract passes 6 of 6 tests, including native compatibility, exact grouping, stable identities, no-write inspection, Studio and CGX parity, CLI formatting, public/generated OpenAPI, docs, tamper, malformed context, duplicates, and metadata conflicts.
- Combined focused coverage passes 7 files / 93 tests; adjacent ToolHub/API/CGX regression passes 5 files / 80 tests.
- Public/generated OpenAPI and documentation contract passes 3 files / 18 tests; public YAML and Studio JavaScript parse successfully.
- The new projection reaches 93.54% statements, 80.43% branches, 100% functions, and 96.42% lines.
- Typecheck, clean build, architecture boundaries (`src/cli.ts` 24,403 lines; `src/studio/studioServer.ts` 8,875 lines; two prefix branches), and Docs drift over 1,501 files pass.
- Built CLI smoke passed against a real temporary signed workspace with 2 groups and 8 tools in matching JSON and human output.
- Independent and release-gate full suites each pass 1,078 files / 8,544 tests. The adversarial regression, zero-vulnerability runtime audit, CLI/domain smoke, and all install personas pass.
- Authoritative local release receipt `tmp/release-gate/amc-1482-final.json` passes with SHA-256 `c3d16f2578465ab363e5f0f0d5c33e0377c8cbae60a977fdba98f40ba5863597`; live-deploy health is correctly skipped until publication.
- Authenticated Studio browser checks pass at 1,440 x 1,000 and 390 x 844 with 3 groups / 10 tools, a visible trust boundary, no page-level overflow, and no post-auth console or request errors. Screenshot SHA-256 values are `2b840f9d56a1798420b35097efb273314c3f9676521bdd06e536ad4758b79dd0` (desktop) and `f98adc999da8cacfd6715352a7dc885b02d332a715d270036a38e167bd5013d9` (mobile).
- Commit, exact-SHA CI, and production evidence will be added only after they pass.
