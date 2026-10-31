# P0-23 read-only preflight — 14 October 2026

P0-23 is the next serial current-plan issue after the parent finishes bounded P0-22 qualification. Its declared dependencies P0-08, P0-15 and P0-21 are ancestors of accepted main `5ea5e866a42acd5c8228a712e9b8c1d9f18c745c`. This audit performed no tests, builds, installations, servers, application imports, source edits, tracker changes or Claude messaging. It is not qualification or completion.

The owned P0-22 tree remains at `07125b76cb17ecf063f19b914085a5bfc968df35` with parent-owned uncommitted fleet, cognition, tests, snapshots and approved documentation work. All 23 checked P0-23 and protected input files match accepted main exactly, including the API registry, Studio server, shared CLI, result-command registry, REPL, freeze baseline and line budgets. The private JSON lists their SHA-256 values.

The graph query ran first. Its 36,459-node graph is dated 8 September; installed Graphify 0.9.74 differs from the repository refresh pin 0.9.56. It supplied navigation only. No graph refresh, watcher or server ran. Direct source was the evidence.

Static registry enumeration found 113 API result routes, including six retained A4 routes, and 30 Studio result routes. Saved OpenAPI documents 57 API registry entries, all with ClaimResult references; 56 are absent. Five named claim-test files from the recovered specification do not exist. Equivalent existing coverage is acknowledged below rather than treated as missing solely because filenames differ.

## Published OpenAPI omits 56 registered API result routes

Confirmed static acceptance gap. src/api/resultRouteRegistry.ts:64-113 contains 113 routes: 107 non-A4 routes and six A4 routes. Literal entries and the three explicit provider-drift expansions were enumerated without importing application code. Saved website/openapi.yaml documents 57 registered routes, and all 57 reference ClaimResult. The remaining 56 are absent. All six A4 routes are among the documented 57. tests/openapiContracts.test.ts:85-97 continues when an operation is missing and requires only at least 51 documented routes. src/api/resultRouteRegistry.ts:203-216 likewise silently skips absent operations.

Next contract: Require each in-scope registry method and normalized path to exist and reference ClaimResult in both saved and freshly generated contracts. Keep held A4 route behavior unchanged. The existing permissive threshold must not replace exact route accounting. No generator, API request or test was executed.

## Sealed legacy diagnostic claims bypass the stored-run downgrade

Source-inferred behavior risk requiring reproduction. src/api/resultRouteRegistry.ts:138-141 directly calls envelopeForDiagnosticReport after sealedRunReportVerifies. Studio reuses that registry helper. src/mcp/mcpClaimOutput.ts:32-34 uses loadDomainEvidence; src/domains/domainEvidence.ts:26-32 directly calls envelopeForDiagnosticReport after seal verification. src/claims/eligibility/adapters.ts:85-104 derives the kind from VALID status and observed coverage, with no AMC version check. src/claims/eligibility/adapters/results.ts:32-49 uses isLegacyAmcVersion and preserves Legacy (1.x), self-reported even for a correctly sealed legacy report.

Next contract: Use a real owned-workspace auditor seal over a 1.1.1 report with observed coverage. Check actual MCP text and structuredContent, dispatched API JSON and Studio JSON against the same stored-run semantics. Keep current sealed and current unsealed controls. Retain a real RED before proposing a bounded canonical-adapter repair. A legacy mismatch is inferred from the source paths; no fresh failure or exploit was executed.

## The page claim strip can retain prior labels across in-place reloads

Source-inferred behavior risk requiring reproduction. src/console/assets/components/claimBadge.js:73-84 accumulates claims in a Map keyed by claimLabel and returns reset(). src/console/assets/app.js:3944 discards the returned reset handle. src/console/assets/passport.js:122-146 rerenders the page after create and export without resetting the strip.

Next contract: Drive the actual strip subscription through a first result and a lowered replacement, then a page reload/reset. Confirm that a prior stronger label is removed. Do not claim browser proof from a pure HTML helper test. No DOM or browser execution occurred. Accumulation follows from the current source; its visible effect still requires a bounded contract.

## MCP response qualification is absent; the specification count is stale

Confirmed test coverage gap with preserved extension. src/mcp/amcMcpServer.ts:107-123 includes the ten original tools, the P1-17 amc_incident_clocks extension, and gated A4 metadata. tests/mcpServer.test.ts:37-60 intentionally pins 11 default tools. Its remaining tests inspect CLI configuration, metadata and workspace error behavior; tests/mcpServerTools.test.ts only tests workspace paths. No existing test imports createAmcMcpServer or InMemoryTransport to exercise these ten actual AMC tool responses. src/mcp/mcpClaimOutput.ts:15-23 separates original text from the canonical claim text block and attaches structuredContent, preserving parseable JSON output.

Next contract: Keep 11 default tools and the hidden A4 preview extension. Exercise the ten original tool handlers through SDK Client and InMemoryTransport with actual workspace fixtures; add the incident extension separately using its existing fixture. Parse structuredContent statusDimensions, compare canonical words and the docs pointer, and test empty/unbound results without inventing an evaluated score. Existing tests were read, not run. Do not restore the obsolete count of ten or enable AMC_A4_PREVIEW.

## Own-key pack lookup is implemented; MCP-level refusal remains unqualified

Implemented source guard with meaningful existing unit coverage. src/domains/industryPacks.ts:2509-2512 uses Object.hasOwn for getPackById. tests/industryPackSchema.test.ts:69-74 checks __proto__, constructor, toString and hasOwnProperty plus a real ID. src/mcp/amcMcpServer.ts:385-405 checks entitlement before lookup, then returns Unknown sector pack on missing IDs. src/domains/packSelfAssessment.ts:29-47 derives a regulated self-assessment envelope and eligibleLevel from canonical numeric-self-answer rules.

Next contract: Reuse the existing own-key test instead of duplicating a new test file. Add actual SDK calls with an authorized local fixture entitlement so prototype names reach lookup rather than the paywall. All-5 real pack answers must remain self_reported and not evaluated for regulated claims, with no certification or trust upgrade. Preserve the entitlement gate and avoid live checkout or activation requests. No MCP call, entitlement mutation or mutation test was executed.

## API dispatcher and list claims lack actual response contracts

Confirmed test coverage and schema-contract gaps. src/api/index.ts:532-535 binds the matched result route; src/api/apiHelpers.ts applies its labeller in apiSuccess. Direct router tests alone do not exercise this binding. src/api/resultRouteRegistry.ts:155-162 attaches fields beside single results and a nested claim on object list items, while primitive and null items pass through. src/api/resultRouteRegistry.ts:191-198 adds a list item claim property but does not make that property required. No result-route keyword inventory with reasoned exclusions or dedicated API claim response suite was found. tests/apiRouters.test.ts mocks report producers and calls routers directly.

Next contract: First qualify representative single, nonempty list, regulated and unbound responses through handleApiRoute or an owned loopback Studio server. Expand to exact in-scope registry accounting with route fixtures and reasoned non-result exclusions. Preserve refusal responses, access policy, body limits and non-JSON formats. Record malformed/empty lists explicitly; do not silently invent aggregate claims. No dispatch or HTTP request ran. Shared empty-array contract policy remains unresolved and must not be changed as a side effect.

## Studio labels and legends exist but are not proven across listed outputs

Implemented wiring with insufficient route and page qualification. src/studio/studioClaimOutput.ts:11-29 registers 30 result routes. bindStudioResultRoute at src/studio/studioServer.ts:1718 and withClaimBody at :450 cover successful JSON objects. src/studio/studioClaimOutput.ts:43-47 leaves non-object, null, array and non-2xx bodies untouched. src/console/assets/api.js:107-119 collects top-level claims and nested item.claim objects; app.js:3944 installs the strip. claimBadge.js:26-30 includes the six original legend pages and preserves two later A4 page names. tests/claims/claimLabels.test.ts:98-108 checks exact legend parity and one self-reported not-evaluated badge only. src/studio/studioServer.ts:8608-8654 retains catalog/detail entitlement behavior and truth-rule note.

Next contract: Use existing startStudioApiServer fixture patterns on port 0 to prove actual listed successful responses, paid/unpaid catalog claim equality and entitlement notes. Cover all four kinds plus not-evaluated reason, HTML escaping, tooltip dimensions and legend link in the actual badge helper. Add page/subscription checks and any required browser evidence only after owning the scope; do not enable A4 preview. No server, screenshot or badge execution occurred.

## Ownership and decisions

Start with an owned MCP response test slice after P0-22 closes. Do not reuse or alter a Claude checkout. The explicit later issue-reservation list does not name P0-23, but older shared API index, access-policy, result-registry, approvals, OpenAPI and Studio reservations remain unresolved. The wave-5 release is not a blanket release of those older paths. API or Studio production edits require ownership reconciliation first. A4, console A4 assets, held CLI additions, shared CLI/registry/REPL, privacy and paused P2-02 composition paths remain excluded. This audit sent no ownership message and implies no source clearance.

The recovered D-06 document is a decision snapshot, not a fresh approval. Labeling and the payment truth rule work under either commercial option. Gate retirement belongs to P1-51; keep the present entitlement checks. The user-directed unresolved P0-22 empty JSON contract stays unresolved. Analogous P0-23 empty or raw-array behavior must be recorded without inventing aggregate claims or claiming an acceptance waiver.

## Bounded next work

First exercise the ten original MCP tools through the SDK Client and InMemoryTransport, preserving 11 default tools and keeping A4 preview disabled. Reuse the existing own-key test, entitlement fixtures, diagnostic seals, transparency fixtures and rate-limiter reset. Cover successful tool text and structured output, genuine errors, prototype IDs, all-5 self-answers and sealed legacy versus current report controls. Only a real RED can justify a bounded production repair.

Then qualify actual dispatched non-A4 API responses, route accounting and mandatory OpenAPI references. Source edits in shared paths wait for ownership reconciliation. Finally qualify Studio responses, payment invariance, all badge kinds, strip reloads and the original six legend pages with actual page evidence. A successful helper unit test cannot stand in for actual server or browser behavior.

The generic source cap is 800 lines. Physical source counts are 772 for amcMcpServer, 219 for resultRouteRegistry, 8,857 for studioServer against its 8,858 budget, and 2,211 for openapi against its 2,212 budget. Future edits must use the architecture script and preserve the existing budgets and freeze baseline.

Future execution must use both Node 22 in PATH and the explicit Node 22 binary. A focused command, after the new MCP test exists, is:

```sh
PATH=/opt/homebrew/opt/node@22/bin:$PATH /opt/homebrew/opt/node@22/bin/node node_modules/vitest/vitest.mjs run tests/mcpClaimLabels.test.ts tests/mcpServer.test.ts tests/industryPackSchema.test.ts --reporter=json --outputFile=/private/tmp/p0-23-mcp-actual.json
```

Run required build, types, test types, lint, full suite, architecture, docs, API-reference, no-fabrication and freeze checks at the appropriate parent boundary. Keep mutation REDs, restored hashes, transcripts and response evidence. No such execution happened in this preflight.

Private evidence: `/private/tmp/p0-23-readonly-preflight-20261014.json`, `/private/tmp/p0-23-static-source-inventory-20261014.json`, and `/private/tmp/p0-23-graph-navigation-20261014.log`. The JSON records the complete 56-route omission list and each inspected input hash.
