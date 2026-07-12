# AMC-1476 - capability-gated provider steer outcome

- Issue: `AMC-1476`
- Dimension: provider-native correction, fail-closed enforcement, and evidence truth
- AMC surfaces requested: Enforce, Watch, adapter capability receipts, Docs
- Sources reviewed: [Agent Control steer action demo](https://docs.agentcontrol.dev/examples/steer-action-demo), [Agent Control repository](https://github.com/agentcontrol/agent-control), [Claude Code hooks](https://code.claude.com/docs/en/hooks), and [Gemini CLI hook authoring](https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/writing-hooks.md)
- Retrieval: live first-party docs and immutable repository source reviewed 2026-07-12
- Immutable source commit: Agent Control `83188b62c63e2b4ff9ada87048fd99605184ee5a`
- Status: Shipped and production verified

## Relevance decision

A recoverable correction is relevant to AMC when a trusted control can tell an agent how to fix a rejected tool request without permitting the rejected call. It is not relevant as a generic request-rewrite engine or a softer label for deny.

AMC therefore recognizes steer only for an existing signed ToolHub argument validation failure. The current call stays blocked. Claude's pinned hook contract can return the denial and bounded context to the agent, so AMC can record an effective steer. The verified Gemini contract does not expose the same distinct corrective outcome, so AMC records requested steer, effective deny, and an explicitly lossy fail-closed mapping.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring, maturity, weighting, or methodology change. |
| Shield | No detector, assurance pack, exploit, or red-team change. |
| Enforce | Owns the requested outcome, actual wire decision, effective outcome, and provider mapping. |
| Vault | Existing redaction and signed auditor/monitor paths remain in force; no new secret or payload store. |
| Watch | Existing immutable hook lifecycle exposes a verified `steered` state and rejects execution under the blocked action ID. |
| Fleet | A retry is a new action identity; no fleet scheduler, retry daemon, or orchestration rule is added. |
| Passport | Existing signed adapter capability receipts advertise `provider.steer` only for a verified provider contract. |
| Comply | No framework mapping change. Existing signed ledger evidence remains available to binders. |

## Product closure

- Added logical `steer` while preserving provider wire decisions as allow, deny, or ask.
- Added a version-2 signed decision envelope with requested outcome, wire decision, effective outcome, provider mapping, capability loss, and exact provider response hash.
- Classified only trusted ToolHub argument validation failures as recoverable; signature, mapping, configuration, governor, budget, ticket, freeze, scope, and approval failures preserve their existing outcomes.
- Mapped Claude steer to a blocked current call with bounded redacted correction and no `updatedInput`.
- Mapped Gemini steer to a lossy hard deny and prevented any effective-steer claim.
- Normalized immutable version-1 allow/deny/ask evidence deterministically and retained verification support for legacy result shapes.
- Added a Watch `steered` lifecycle state. Reusing the denied action ID with changed input remains a replay conflict, and execution after the denial fails closed.
- Bound request, terminal, and control projections to their authoritative `tool_action`, `tool_result`, and `audit` evidence event types so valid lookalike metadata on unrelated events cannot create a false deny or steer.
- Added provider capability truth, compatibility docs, generated OpenAPI, focused regression coverage, and this source-review receipt.

## Fail-closed rule

AMC rejects unknown outcomes or mappings, inconsistent provider/outcome combinations, untrusted control files, conflicting action-ID replay, response-shape drift, input rewrites, oversized correction text, receipt/hash mismatch, malformed decision metadata, and execution after a denied or steered decision. A provider without a verified corrective-retry contract receives a hard deny and cannot report effective steer.

## Privacy boundary

The provider response and evidence contain a generic canonical tool class, bounded corrective guidance, booleans, enum values, IDs, and hashes. They exclude raw tool input, attempted paths or hosts, provider session text, prompts, outputs, credentials, signing material, and rewritten arguments.

## No-bloat boundary

No competitor code, prose, schema, examples, policies, retry loop, adapter, screenshot, asset, or generated output was copied. No input transformer, provider-specific subsystem, second policy engine, retry daemon, event store, new endpoint, methodology change, compatibility mode, or source-specific package was added.

## Verification

- Expected-red: 1 file / 6 tests failed only on the missing AMC-owned outcome, mapping, lifecycle, capability, response, and legacy-normalization behavior.
- Final trust-boundary regression slice: 4 files / 49 tests passed, including provider steer, event-type-bound lifecycle/correlation/onboarding, hook integration, and legacy normalization.
- Authoritative release gate: passed from the final local tree; 1,072 files / 8,490 tests passed, typecheck and build passed, generated OpenAPI parsed, architecture boundaries passed, 1,494 documentation files passed drift review, CLI/domain smoke passed, and the runtime dependency audit found 0 vulnerabilities.
- Clean-install QA: all 10 isolated user personas passed with an average rating of 10/10.
- Desktop distribution: npm package plus macOS universal, Linux x64, and Windows x64 artifacts rebuilt and verified. Packed npm SHA-256: `a593c7a5c4211c659a4286bc51f5e850b70e73a4460ab6cefb62ced710a04ed0` (4,797,067 bytes).
- Local receipts: `tmp/release-gate/amc-1476-final.json`, `tmp/persona-install-qa/latest.json`, and `dist/installers/manifest.json`.
- Implementation commit: `d0166a9db7b9b8a6766d35fc3d431f93016b36b5`.
- Exact-SHA GitHub verification: Pages run `29187142923`, CI run `29187142945`, Docker Runner Image run `29187142948`, and npm Publish run `29187142991` all completed successfully. Node 20 and Node 22 build/test jobs, security scan, local E2E, Docker smoke, Helm validation, image smoke, and package preflight were green.
- Production revision: `https://agentmaturity.co/docs/content-manifest.json` reported source revision `d0166a9db7b9b8a6766d35fc3d431f93016b36b5`, 172 public guides, and the repository-exact `ADAPTERS` guide hash `a0105a18858ba45624f83deb4ceb0291b36824c066cadab7412475c18eee7a64`.
- Live contract: the public adapter guide states that Claude corrective steer blocks the current call without input rewrite and that Gemini maps the request to a lossy deny without reporting effective steer. The public OpenAPI exposes lifecycle schema `2026-07-12`, status `steered`, requested/effective outcome separation, `fail_closed_deny`, and strict request/decision/terminal phase objects.
- Live release gate: `tmp/release-gate/amc-1476-live.json` passed, including typecheck, build, OpenAPI parse, architecture boundaries, Docs drift across 1,494 files, runtime audit with 0 vulnerabilities, CLI/domain smoke, and HTTP 200 production health. The full 8,490-test suite and 10-persona install QA are proven by the authoritative non-quick local gate and exact-SHA CI above.
- Production browser/TLS: homepage and adapter docs returned HTTP 200 without console errors, page errors, missing contract text, or horizontal overflow at 1,440 x 900 and 390 x 844. The apex returned HTTP 200, `www` redirected to the apex, and the Let's Encrypt certificate covered `agentmaturity.co` plus `www.agentmaturity.co` from 2026-06-26 through 2026-09-24.
