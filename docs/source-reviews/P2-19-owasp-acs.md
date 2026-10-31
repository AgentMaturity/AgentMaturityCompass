# P2-19 - OWASP Agent Control Standard (ACS) v0.1 source review

- Plan item: `P2-19` (Implement OWASP Agent Control Standard hooks)
- Dimension: runtime hook control, machine-readable standards
- Retrieval: 2026-10-28, by cloning the repository below; only the pinned tag was read for this review
- Status: experimental. AMC implements the hooks listed in [docs/standards/ACS.md](../standards/ACS.md); it claims no ACS conformance.

## Pinned source

| Item | Value |
| --- | --- |
| Repository | `https://github.com/Agent-Control-Standard/ACS` (the OWASP GenAI Security Project's ACS working repository; the spec's own schema URLs use `https://genai-security-project.github.io/agent-control-standard/schema/v0.1.0/`) |
| Release | tag `v0.1.4` (`version.txt` reads `0.1.4`), tagged 2026-10-16 |
| Commit | `834f3f0d51e7bbbd9a68ff682bec89f97ddd72d8` |
| Tree | `37f9688e7a3181cc1cce4be4e3bff293faae8666` |
| Wire version | `0.1.0` (`docs/spec/instrument/specification.md` "Version: 0.1.0"; schemas under `specification/v0.1.0/`) |
| Licences | `LICENSING.md`: `specification/**`, code and schemas Apache-2.0; `docs/**` and prose CC BY-SA 4.0; code samples in Markdown Apache-2.0 |

SHA-256 of the files this review relies on, at the tag:

| File | SHA-256 |
| --- | --- |
| `docs/spec/instrument/specification.md` | `13532811c2d7ce3aea2edabfb9929cdaa00facc3346fd38cd92f720ab55cd030` |
| `docs/spec/instrument/hooks.md` | `d935b393e75006ecbf9dc4e93c0762a08ead5bbef6a6923d0f2346bf7cdebb30` |
| `docs/spec/conformance.md` | `0b030ec9ae0cd0190727a20bb98e8e8e869e14ded8c1e55bddecaecbf9f752c8` |
| `specification/v0.1.0/request-envelope.json` | `6b7d3c9266144c834fe0efea5098d225262e30970f4c3b0dd29fd5475ad7a36b` |
| `specification/v0.1.0/response-envelope.json` | `afd16189ad044fcf380f69366589bd04aba246fed5d1e740dda2cb1ca36bc751` |
| `specification/v0.1.0/handshake.json` | `9fabf14e732372cdcab4923bd977ecd9fcd32896e4e4126cc460a640e0d627ab` |
| `specification/v0.1.0/hooks/tool-call-request.json` | `fe166b2b070be94fe2fe88a96db7dc1583b65b7c328a8b15b620a065af6b7691` |
| `specification/v0.1.0/hooks/tool-call-result.json` | `ee165f486aedcf2c79ba87a53602456b76808687cdac975591c756414c556537` |
| `specification/v0.1.0/hooks/system-ping.json` | `76954399b864aabeb479a51d1e91889b3465b8b80e48681f328f593abd11f9a2` |

The default branch had moved six commits past the tag on the retrieval date (head `d1ad2943107601e3c09f8e0c8eaf57b78b38a01b`). Those commits define the HMAC key derivation and `key_id`, and add decision-failure trace events. They are not part of the pinned release and AMC uses none of them. Re-pin deliberately when a newer tag ships: ACS v0.1 is a public preview.

Earlier work: AMC-1464 reviewed "Agent Control" at commit `83188b62c63e2b4ff9ada87048fd99605184ee5a` (`agentcontrol.dev`, `github.com/agentcontrol/agent-control`). That commit is not in the ACS repository's history and the project is a different product, so none of its notes are reused here.

## Architecture (specification.md section 2)

Two parties: the **Observed Agent** (the runtime) sends hook traffic to the **Guardian Agent** (the policy enforcement point). Every hook point has the same direction: the runtime calls the guardian and waits for the decision. There are no guardian-initiated callbacks in v0.1. The guardian has a deterministic layer and an optional agent (LLM) layer; deterministic-only guardians are conformant (section 12.2).

## Wire format and transport (sections 3, 4, 10.3, 17)

- JSON-RPC 2.0 request envelope: `jsonrpc` "2.0", `method`, `id` (string or number), `params`; top-level `additionalProperties: false`.
- `params` requires `acs_version` (semver), `request_id` (UUID), `timestamp` (date-time), `metadata` (requires `agent_id`, `session_id` UUID) and `payload`; optional `nonce` (16 to 64 characters), `tenant_id` (reserved, no isolation rules) and `signature` `{ algorithm, value, key_id }`.
- Method namespaces: `steps/*`, `protocols/*`, `agbom/*`, `trace/*` (reserved), `system/*`, `handshake/*`, `wrapped:`.
- Transports: HTTP(S) and stdio with Content-Length framing. Streaming and notifications are not supported. Batching is permitted; a guardian that does not support it MUST return `-32600` for array input.
- Response: `jsonrpc`, `id`, and exactly one of `result` or `error`. A hook `result` is an `AcsResult` with `type` "final", `acs_version`, `request_id`, `decision`, and conditional `reasoning`, `modifications`, `ask_details`, `defer_details`; optional `reason_codes`, `policy_references`, `policy_data`, `cited_provenance_ids`, `payload`, `chain_hash`, `signature`, `metadata`.
- Forward compatibility: accept `X.Y.Z` matching the major version; unknown fields MUST be ignored.
- Replay protection: reject a `timestamp` outside the negotiated skew window (default 300000 ms) with `TIMESTAMP_OUT_OF_WINDOW` (`-32006`); reject a duplicate `request_id` within the session with `REPLAY_DETECTED` (`-32005`); SHOULD reject duplicate nonces.
- Error codes: JSON-RPC `-32700`, `-32600`, `-32601`, `-32602`, `-32603`; ACS registry `-32000` `SESSION_REFUSED`, `-32001` `UNSUPPORTED_VERSION`, `-32002` `PROVENANCE_REQUIRED`, `-32003` `CAPABILITY_NOT_NEGOTIATED`, `-32004` `SIGNATURE_INVALID`, `-32005` `REPLAY_DETECTED`, `-32006` `TIMESTAMP_OUT_OF_WINDOW`, `-32007` `CHAIN_MISMATCH`.

## Authentication and signatures (sections 10, 11)

- Section 11: "Authentication mechanism declared in handshake; spec mandates none."
- Section 10: ACS-Core requires a signature over the RFC 8785 (JCS) canonical envelope with `signature` removed; `HMAC-SHA256` is the baseline, with a per-session key "HKDF-derived from deployment-provided input keying material ... together with the session_id". The pinned text names no HKDF salt, info string, output length or `key_id` rule, so two implementations cannot derive the same key from it. (The default branch fixes this after the tag; see above.)
- `system/ping` MUST NOT require a signature.

## Handshake (section 4, handshake.json)

`handshake/hello` is required before hook traffic. ClientHello requires `acs_versions_supported`, `methods_implemented`, `transports_supported`, `provenance_producer`; optional `max_payload_size_bytes`, `wrapped_protocols`, `profiles_supported`. ServerHello requires `negotiated_version`, `methods_evaluated`, `selected_transport`, `timeout_config` (`default_ms`); optional `signature_algorithms_supported` (empty means not supported or not required), `skew_window_ms`, `on_decision_failure` (`proceed` default or `deny`), `approver_types_supported`, `policy_requires_provenance`, `agbom_serializations_supported`, `trace_emission`, `profiles_accepted`. Methods the client lists but the guardian omits from `methods_evaluated` "are NOT evaluated" and clients "MUST treat them as ALLOW-by-default".

## Hook points (section 5, hooks.md)

All hooks are runtime-to-guardian requests on the common envelope.

| Method | Fires | Decision-eligible | Required in ACS-Core |
| --- | --- | --- | --- |
| `steps/sessionStart` | Session initiation | Yes (allow/deny) | Yes |
| `steps/agentTrigger` | Agent activation | Yes | `userMessage` or `agentTrigger` |
| `steps/turnStart` | Turn begins | Yes (most allow) | SHOULD |
| `steps/userMessage` | User input received | Yes | `userMessage` or `agentTrigger` |
| `steps/agentResponse` | Output before the user sees it | Yes | Yes |
| `steps/knowledgeRetrieval` | RAG lookup | Yes | SHOULD |
| `steps/memoryContextRetrieval` | Memory read | Yes | SHOULD |
| `steps/memoryStore` | Memory write | Yes | SHOULD |
| `steps/toolCallRequest` | Before tool execution; "Primary enforcement gate" | Yes (all five dispositions) | Yes |
| `steps/toolCallResult` | After execution, before ingestion | Yes (allow/deny/modify) | Yes |
| `steps/preCompact` | Before compaction | Yes | SHOULD |
| `steps/postCompact` | After compaction | No (modify or allow only) | SHOULD |
| `steps/subagentStart` | Subagent spawned | Yes | Yes for subagent-capable clients |
| `steps/subagentStop` | Subagent ended | No | SHOULD |
| `steps/skillRegister` | Skill enters available set | Yes | SHOULD |
| `steps/skillLoad` | Skill activates | Yes | SHOULD |
| `steps/skillUnload` | Skill leaves active set | No | SHOULD |
| `steps/turnEnd` | Turn ends | No | SHOULD |
| `steps/sessionEnd` | Session ends | No (audit finalization) | Yes |
| `agbom/snapshot`, `agbom/changed` | AgBOM inventory (Inspect pillar) | Yes | Inspect profiles only |
| `system/ping` | Liveness | Always allow | SHOULD (or a declared alternative) |
| `protocols/MCP/*` | Wrapped MCP | Yes | When sessions involve MCP |

`toolCallRequest` payload (`hooks/tool-call-request.json`): required `tool` (`name` required; `version`, `provider` optional) and `arguments` (each `{ value, provenance? }`); optional `operation`, `capability`, `raw_command`, `intent`.

## Decision vocabulary (section 6)

`allow`, `deny` (requires `reasoning`), `modify` (requires `reasoning`, `modifications`), `ask` (requires `reasoning`, `ask_details`), `defer` (requires `reasoning`, `defer_details`). ACS-Core MUST support allow, deny, ask and defer; modify is SHOULD. Section 9.2: a guardian that determines the client cannot resolve ASK MUST NOT return ASK and substitutes either DEFER with `timeout_decision: "deny"` or DENY with `reason_codes: ["approver_unavailable"]`, recording the substitution. Section 6.4: on a decision failure (silence, transport failure or an error instead of a decision) the runtime applies `on_decision_failure`, default `proceed` (fail-open); a decision that arrives MUST be honoured.

## Tracing and audit chain (sections 8, conformance)

The guardian keeps a SessionContext with an append-only ContextEntry chain (`entry_hash` = SHA-256 of JCS content plus previous hash) and MUST publish `chain_hash` on responses for content-bearing steps. Trace (OTel, OCSF) and Inspect (AgBOM) are separate profiles; P2-18 owns those formats.

## Conformance tests

`docs/spec/conformance.md`: "This release ships no conformance test suite, no registry of conformant implementations, and no steward body". Profile claims are self-declared. AMC's fixtures in `tests/acsConformance.test.ts` are therefore AMC-authored, built from the spec's own examples, and labelled so.

## What AMC uses, and the gaps it records

AMC serves `steps/toolCallRequest` (enforce, through the existing hook control path), `handshake/hello` and `system/ping`. Gaps against ACS-Core, kept rather than papered over:

1. **Signatures.** AMC verifies no ACS signature and signs no ACS response (`signature_algorithms_supported: []`), because the pinned text does not define the HKDF parameters. AMC's integrity evidence is its own signed receipt for each decision, returned in `policy_data.amc`. A request `signature` is ignored, not treated as authentication.
2. **Authentication.** The AMC hook lease (`hook:control` scope, route allowlist naming `/hooks/acs/v0.1`, loopback only) authenticates every request, ping included. ACS mandates no mechanism, so this fits; AMC never accepts an unauthenticated request.
3. **Audit chain.** AMC publishes no ACS `chain_hash`. Each decision is a sealed, hash-chained AMC ledger event instead.
4. **Handshake state.** AMC answers `handshake/hello` but does not refuse hook traffic that arrives without one, and keeps no per-session negotiated state.
5. **ASK, DEFER and MODIFY.** AMC has no approval path for hook calls, so it applies the section 9.2 substitution (DENY with `approver_unavailable`), and never returns MODIFY or DEFER.
6. **Duplicate request ids.** AMC rejects every duplicate `request_id` with `-32005`; a duplicate with different input carries `data.reason: "replay_conflict"`. Nonces are not tracked separately.
7. **Batching and stdio.** Not served: arrays get `-32600`, and only loopback HTTP is offered.
8. **Unsupported hooks.** Answered `-32003` with `data.reason: "unsupported"`, and omitted from `methods_evaluated`.
9. **Decision failures.** Where AMC cannot record a decision it answers `deny` (reason code `amc_decision_unrecorded`), not an error a runtime with the default `proceed` posture would fail open on. ServerHello also announces `on_decision_failure: "deny"`.
