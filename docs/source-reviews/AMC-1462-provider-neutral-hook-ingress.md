# AMC-1462 - Pinned provider-neutral hook ingress

- Issue: `AMC-1462`
- Dimension: Provider-neutral hook observation and signed receipts
- AMC surfaces requested: Watch; Vault; Bridge/API; Enforce-adjacent
- Sources reviewed: Agent Event Protocol public draft and AgentApprove AEP overview
- Retrieval: Live primary-source review on `2026-07-10`, pinned to commit `2583cff9380f8f0a459d52c7112b6105c46496ed`
- Status: Done - implemented and release-verified

## Relevance decision

Provider-neutral action observation is directly relevant to AMC because Bridge already authenticates agent traffic, the evidence ledger already owns immutable observed events and signed receipts, and Watch already renders those events. The missing capability was a strict shared hook vocabulary. AMC-1462 extends those existing primitives instead of adding a source-specific adapter, event database, or policy engine.

AMC accepts only an AMC-owned observed action subset of the AEP `0.1` draft. AMC does not claim AEP conformance. The public draft says breaking changes remain possible before 1.0, and its 1.0 reference JSON Schema and conformance fixtures are not published.

## Source retrieval

- Repository: `https://github.com/agentapprove/agent-event-protocol`
- Pinned tree: `https://github.com/agentapprove/agent-event-protocol/tree/2583cff9380f8f0a459d52c7112b6105c46496ed`
- Specification: `https://github.com/agentapprove/agent-event-protocol/blob/2583cff9380f8f0a459d52c7112b6105c46496ed/spec.md`
- Integration guide: `https://github.com/agentapprove/agent-event-protocol/blob/2583cff9380f8f0a459d52c7112b6105c46496ed/integration-guide.md`
- Product overview: `https://www.agentapprove.com/standards/agent-event-protocol`
- Source fact: draft `0.1` defines a canonical envelope and action lifecycle but leaves transport, authentication, signing, replay protection, encryption, and retention to consumers.
- Source fact: the current draft lists `action.requested`, `action.completed`, `action.failed`, and `action.denied`; AMC observes exactly those four event types in this slice.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No direct maturity increase. Hook metadata alone cannot raise a score. |
| Shield | Adjacent only. Observed actions can later support assurance, but no Shield evaluator changed. |
| Enforce | Adjacent only. This slice records actions and returns no control decision. |
| Vault | Relevant. Raw payloads are not retained; normalized projections use existing encrypted blob retention. |
| Watch | Relevant. Accepted events appear in the existing Observe/Watch evidence timeline. |
| Fleet | Future correlation can use the stable action ID, but no Fleet graph behavior changed here. |
| Passport | Out of scope. No portable interoperability or conformance credential is issued. |
| Comply | Indirect only. Signed receipts can support audits, but no framework mapping changed. |

## Product closure

`POST /bridge/hooks/aep/0.1/events` now:

- authenticates before body parsing with a signed `hook:observe` lease and `/hooks` route allowance;
- consumes the lease's signed requests-per-minute budget in a cross-connection transaction before body parsing, including malformed authenticated attempts;
- caps raw bodies at 256 KiB and rejects invalid UTF-8, invalid JSON, duplicate JSON keys, unsupported versions/types, malformed identifiers, invalid action/tool relationships, stale timestamps, and future timestamps;
- accepts only `action.requested`, `action.completed`, `action.failed`, and `action.denied` from the pinned draft;
- computes the exact raw-body SHA-256, then discards the raw body;
- stores only an encrypted, privacy-safe projection with input/output/error-message digests, stable action identity, protocol pin, and `conformanceClaim: false`;
- writes one deterministic append-only ledger event and one signed receipt;
- seals each evidence session, returns the original signed receipt for byte-identical retries with `200` only after recalculating prefix metadata hashes and links, verifying every prefix writer signature, authenticating the target payload or its signed retention proof, and verifying receipt/seal/source-pin/identity bindings, and rejects conflicting source-event reuse with `409` and no ledger growth;
- appears in the existing Watch/Observe timeline as `tool_action` or `tool_result` evidence.

The generated Bridge OpenAPI and hosted `website/openapi.yaml` both publish the endpoint, lease security, status codes, source pin, and non-conformance boundary. Their generated request schemas encode the runtime tool/skill/MCP and completed/failed/denied conditions, and both reference the same strict receipt contract.

## Fail-closed rule

The ingress fails closed before persistence for missing or invalid lease auth, missing `hook:observe`, a route outside `/hooks`, lease budget exhaustion, unavailable quota state, oversized bodies, invalid UTF-8 or JSON, duplicate keys, unknown top-level fields, versions other than `0.1`, event types outside the four-action subset, missing stable event/action/agent identity, invalid tool or skill relationships, invalid denied/failed lifecycle semantics, stale events, and events beyond the allowed future clock skew.

A deterministic ledger event ID binds authenticated agent identity to source event identity. A byte-identical retry repairs an interrupted pre-seal state when necessary, then recalculates every metadata hash and chain link from genesis through the target, verifies every prefix writer signature, authenticates the target payload or requires its auditor-signed archive/pruning proof, and verifies the receipt signature/digest, session seal, exact source pin, and agent/provider binding before returning the original receipt with `idempotentReplay: true`. Full ledger verification remains the stronger global payload audit: it authenticates every retained historical payload and requires valid signed archive and blob-pruning evidence for every archived or pruned row. Invalid segment bytes fail before decompression, and decompressed segments are capped at 256 MiB. Any target-integrity failure returns `503`; payload-conflicting reuse of the same source event ID returns `409`. Neither path writes another evidence event.

## No-bloat boundary

No AgentApprove adapter, Agent Control compatibility layer, AEP mapping importer, copied schema, copied fixtures, copied provider mappings, copied examples, copied source prose, raw hook archive, separate event database, queue, daemon, policy engine, Score gate, control-response translator, or conformance badge was added. One bounded request-usage table in the existing ledger enforces the already-signed lease budget and deletes rows outside the rolling minute. Provider-native control responses remain a separate P0 item.

## Verification

- Expected-red focused test: `npx vitest run tests/providerNeutralHookIngress.test.ts --reporter=dot` failed because `src/bridge/hookIngress.ts` did not exist.
- Focused implementation test: `npx vitest run tests/providerNeutralHookIngress.test.ts --reporter=dot` passed, 1 file / 16 tests before documentation assertions were added.
- Independent audit red run: 1 file / 23 tests produced 8 expected failures covering raw error retention, lifecycle mismatch, exact-retry recovery, duplicate concurrency, concurrent quota bypass, unhandled ledger failure, and OpenAPI drift.
- Hardened focused test: `npx vitest run tests/providerNeutralHookIngress.test.ts --reporter=dot` passed, 1 file / 23 tests.
- Cross-contract focused test: 7 files / 78 tests passed.
- Second independent audit found three expected-red gaps: unverified retry metadata, missing published conditional lifecycle constraints, and generated/hosted receipt-schema drift.
- Integrity/contract focused test: 1 file / 24 tests passed; 8 ledger/crypto/migration/OpenAPI files / 80 tests passed.
- Independent Ajv probe rejects denied-without-decision, approved denial, tool-without-target, and MCP-without-server; it accepts valid denial and cancelled failure.
- Third independent audit found three expected-red gaps: metadata-only encrypted-blob checks, incomplete targeted chain-prefix verification, and strict-Ajv conditional typing.
- Fourth independent audit found four expected-red gaps: predecessor-signature tamper, unauthenticated archive decompression, mutating retention dry runs, and unproved archive-only state.
- Final adversarial audit found no actionable findings. It verified all four fixes, rejected a 257 MiB decompression expansion at the 256 MiB cap, preserved legitimate and keyless retention, and measured five 5,000-history exact retries at 437.77 ms median (431.44-444.81 ms) without decrypting unrelated historical payloads.
- Final ingress test: 1 file / 29 tests passed. Ciphertext tamper makes full verification fail and retry return `503`; predecessor metadata/signature tamper blocks later retry; forged archive/pruning state fails closed; the hosted schema compiles under strict Ajv and passes the lifecycle/target matrix.
- Retention/bundle focused test: 3 files / 42 tests passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: 1,053 files / 8,324 tests passed.
- Browser E2E: 55 passed / 2 existing i18n skips.
- Release gate: `tmp/release-gate/amc-1462-final.json` passed all 13 checks, including 1,053 files / 8,324 tests, build, CLI/domain smoke, ten install personas, zero runtime dependency vulnerabilities, and live `https://agentmaturity.co` HTTP 200.
- Prepack: npm tarball, SBOM, license inventory, release scan, signed AMC release pack, and release verification passed.
- Remote CI, deployed content, and final commit evidence are recorded in the Linear completion comment and Obsidian handoff after publication.
