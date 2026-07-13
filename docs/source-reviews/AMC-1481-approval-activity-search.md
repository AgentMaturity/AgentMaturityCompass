# AMC-1481 - approval activity search and filters

- Issue: `AMC-1481`
- Dimension: privacy-safe approval operability, signed-inventory integrity, and filtered history truth
- AMC surfaces requested: Enforce, Watch, approvals CLI, authenticated API, Studio Approvals, OpenAPI, Docs
- Sources reviewed: [AgentApprove activity monitoring](https://www.agentapprove.com/use-cases/monitor-agent-activity) and [AgentApprove changelog](https://www.agentapprove.com/changelog)
- Retrieval: live first-party pages reviewed 2026-07-13
- Status: Implemented and locally release-verified; publication verification pending

## Relevance decision

This item is directly relevant. AMC already had one canonical signed request, decision, and consumption chain plus a privacy-safe inbox summary, but operators could filter only by status. They could not search stable request IDs or narrow history by action class, risk, mode, creation window, order, and limit across CLI, API, and Studio.

The existing request list also skipped malformed and signature-invalid request files. A filtered history must not imply completeness after silently excluding untrusted activity, so AMC-1481 adds a complete signed-artifact inventory audit before any filter is applied.

AgentApprove's first-party activity page was retrieved with SHA-256 `22b7b11234aef256b440652b5a0c6aca56bd99adec2265ea20d7e72178f1f1c7`; its relevant product signal is searchable and filterable operational activity. The first-party changelog was retrieved with SHA-256 `4abd09de495e85d52105821bdbdd3311d90f30f4017a396f57685a16e252e430`. AMC takes only that usability lesson and keeps its own signed artifact model, privacy boundary, API, CLI, and UI.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring, maturity, methodology, or evidence-acceptance change. |
| Shield | No attack pack, detector, threat rule, or assurance score change. |
| Enforce | Primary surface. Operators can query the existing signed approval chain without weakening approval or execution rules. |
| Vault | Existing key and signature authorities verify artifacts; raw private fields and credentials remain excluded. |
| Watch | Supporting surface. The derived view makes approval history inspectable without a second telemetry store. |
| Fleet | Agent identity scopes the existing per-agent chain; no fleet aggregate or inheritance change. |
| Passport | The query result is not signed, portable, or claim eligible. |
| Comply | No framework mapping, retention rule, or audit evidence type changes. |

## Product closure

- Added one shared `2026-07-13` approval activity projection.
- Extended `amc approvals list` with request-ID query, status, action-class, risk-tier, effective-mode, inclusive creation bounds, deterministic order, 1-200 row limit, and JSON output.
- Extended authenticated `GET /approvals/requests` with the same parser and response; invalid filters return HTTP 400.
- Added the same compact controls to the existing Studio Approvals page while preserving the pending inbox default.
- Studio decision buttons now appear only for pending rows whose request, chain, and current context are trusted.
- Added complete request, decision, consumption, and detached-signature inventory verification before filters.
- Returned normalized filters, aggregate scan counts, match/return/truncation counts, generic reason codes, privacy-safe summaries, and the explicit non-proof boundary.

## Fail-closed rule

Invalid or missing signatures, malformed JSON/schema, non-regular artifacts, filename-to-record mismatches, wrong-agent records, duplicate identities, decisions or consumption records that name unknown requests, and detached signatures without their artifact make the entire activity projection invalid. An invalid result contains zero activity rows. Filtering occurs only after the complete inventory is trusted, so a narrow status, time, or request query cannot hide corruption.

Current policy, tools, budget, or lease-context drift remains visible through each row's existing context-integrity state. It does not rewrite or hide the signed historical inventory, and it never enables a decision.

## Privacy and proof boundary

Search covers only the stable approval request ID. Filters use existing privacy-safe status, action class, approval risk tier, effective mode, creation timestamps, order, and limit. List results do not expose or search tool names, intent IDs, work-order IDs, reviewer identities, decision reasons, commands, MCP servers, prompts, raw arguments, payloads, credentials, Vault references, tokens, paths, destination URLs, or signatures.

Every response says `derivedView: true`, `recorded: false`, and `proofEligible: false`. It is a read-only view of signed approval artifacts, not a new activity record, execution receipt, or proof that an approved action ran.

## No-bloat boundary

No activity database, index, cache, daemon, monitor, event protocol, ingestion path, analytics store, MCP registry, raw-content search, new approval command, duplicate API route, public guide, methodology version, evidence type, receipt type, provider adapter, or competitor compatibility layer was added.

No competitor code, schema, event model, query, UI, test, prose, configuration, screenshot, generated output, or visual asset was copied.

## Verification

- Expected red: the dedicated contract failed because `src/approvals/approvalActivity.ts` did not exist.
- Core implementation checkpoint: 7 of 9 dedicated tests passed; the remaining functional assertion was corrected to distinguish generic integrity `reasonCode` fields from excluded raw decision `reason`, and the remaining expected failure was publication documentation.
- The final dedicated contract passed 11 of 11 tests. The combined approval, Studio, OpenAPI, and authorization matrix passed 75 of 75 tests across 6 files.
- Focused coverage for `src/approvals/approvalActivity.ts` reached 89.53% statements, 88.28% branches, 100% functions, and 89.41% lines.
- The independent full suite passed 1,077 files / 8,538 tests after a clean build in 108.66 seconds.
- The authoritative `tmp/release-gate/amc-1481-final.json` receipt passed on 2026-07-13. Its 12 applicable steps include JavaScript syntax, public OpenAPI parse, typecheck, clean build, adversarial regression, a second 1,077-file / 8,538-test full suite, 1,166-command inventory generation, architecture boundaries, 1,500-file Docs drift, zero-vulnerability runtime audit, CLI/domain smoke, and all 10 isolated install personas. Only the intentionally unset pre-publication live URL was skipped.
- The architecture gate reports `src/studio/studioServer.ts` at 8,877 lines, below its 8,883-line audit baseline.
- Built Studio Playwright checks passed at 1,440 x 1,000 and 390 x 844. Pending default returned 2 of 2 rows; all-history returned 3 of 3; six decision buttons appeared only for two trusted pending rows; one cancelled row was unavailable. Both widths had zero post-login console errors, failed requests, or page overflow. The desktop table fit its 1,064-pixel container exactly; mobile table overflow remained contained in the existing horizontal table scroller.
- Local SHA-256 values: activity projection `56a8898640920d2a988ea45cbd436f65ce75777903ab3d22622554b8ebf44ada`, approval chain store `1f05263b4a9beb40e09a7149ace763fb6a1403a6d9895db808b26e613245ee7c`, Studio app `1336cecd19106145c236f38979dc2620fe0cfa24ea2eeb87e46c4146dd30932c`, public OpenAPI `7e486c9fad5b02fac7762740e85feeaacfc09dd8550e7d3223e3e1df1b6485b7`, command inventory `3b16ab93b95ead3518c4df8cead7346995eaab31c1aa85da21a391e4fe620933`, and release receipt `518ee310a42063ad182ecde441a5d1b5031e2f8191c20c177a49c4ebae49f3d9`.
- Desktop and mobile screenshot SHA-256 values are `c42a18164f1cb44fa1a3fd5a9774605feac9648337289627a5d84dea179372fe` and `12760bbaa089fe082c4af48f8f792af7ac48c1626116f708994df306d6da0107`.
- Exact implementation commit, GitHub workflow, production manifest, byte-parity, and live browser evidence will be appended before `AMC-1481` is closed.
