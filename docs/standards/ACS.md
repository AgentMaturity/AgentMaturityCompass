# OWASP Agent Control Standard (ACS): AMC hook map

Status: **experimental** (P2-19). Pinned to ACS release `v0.1.4`, commit `834f3f0d51e7bbbd9a68ff682bec89f97ddd72d8`, wire version `0.1.0`. The source review, with every field AMC uses and every gap, is [docs/source-reviews/P2-19-owasp-acs.md](../source-reviews/P2-19-owasp-acs.md). ACS v0.1 is a public preview; expect breaking changes and re-pin deliberately.

## What AMC claims

- AMC **implements ACS v0.1 hooks `steps/toolCallRequest`, `handshake/hello` and `system/ping`**. It is not "ACS compliant", "ACS certified" or "ACS-Core conformant": OWASP runs no conformance programme for v0.1, and AMC has the gaps listed in the source review (no ACS signatures, no published `chain_hash`, no per-session handshake state).
- **Enforced at `steps/toolCallRequest`** only for runtimes that call AMC's guardian route and honour its answer. AMC decides there with an enforcement point that can block (its hook control path), but it cannot see whether a third-party runtime applies the decision, so every ACS decision's receipt records `enforcement.level: "advisory"`. Only a conformance test against that runtime would show it honours AMC's answer; none exists yet.
- Hooks AMC can only record are **observed**; AMC serves none of them over ACS yet. Hooks AMC does not serve are **unsupported**: the guardian answers `-32003` (`CAPABILITY_NOT_NEGOTIATED`, `data.reason: "unsupported"`) and omits them from `methods_evaluated`. It never answers allow for them.
- AMC output is evidence of conformity, never proof of compliance.

## Route

`POST /bridge/hooks/acs/v0.1` on the AMC Bridge: loopback only, JSON-RPC 2.0 over HTTP, one request per call. Every request, `system/ping` included, needs an AMC hook lease with the `hook:control` scope whose route allowlist names `/hooks/acs/v0.1` (`amc lease issue --scopes hook:control --routes /hooks/acs/v0.1 ...`). ACS mandates no authentication mechanism, so the lease is the authentication. `metadata.agent_id` must equal the agent the lease names. The generic `/bridge/hooks/control/v1` route refuses the `acs` provider, so ACS input reaches AMC's control path only through this route and its clock, identity and replay checks.

`steps/toolCallRequest` is decided by the same path as Claude Code, Gemini CLI and Pi hooks: the signed ToolHub config, Action Policy and Approval Policy; the P1-02 authorization record on an allow; and a signed `action_state` receipt in a sealed ledger event. There is no second evaluator. AMC maps three tools, each with a fixed argument schema: `fs.read` (`path`), `fs.write` (`path`, optional `content`) and `http.fetch` (`url`, evaluated as a GET). Every value must be a string and a path must be absolute, because ACS names no working directory. A call with any other tool name, an argument outside the schema, or `raw_command` or `operation` is not mapped and is denied, because a key the ToolHub validator does not read could carry the real effect. Shell, process and git tools are not mapped, so they never bypass the shell-command parsing other providers use. Each mapped tool also has a lowest action class; a signed config that gives it less is denied. The decision's receipt and ids are returned in `policy_data.amc`.

## Hook map

| ACS hook | AMC enforcement point | AMC role | Claim wording |
| --- | --- | --- | --- |
| `steps/toolCallRequest` | Provider hook control (`src/bridge/hookControl.ts` via `src/standards/acs/`): ToolHub, Action Policy, Approval Policy, authorization record, signed receipt | enforce | Enforced at `steps/toolCallRequest` for runtimes that call AMC's ACS route; advisory until a conformance test shows the runtime honours AMC's answer |
| `handshake/hello` | ACS guardian route (`src/standards/acs/acsGuardian.ts`) | serve (no decision) | Implements ACS v0.1 `handshake/hello` |
| `system/ping` | ACS guardian route | serve (always allow) | Implements ACS v0.1 `system/ping` |
| `steps/toolCallResult` | Candidate: observed hook ingress (`src/bridge/hookIngress.ts`) | unsupported (observe planned) | Not supported |
| `steps/sessionStart` | none | unsupported | Not supported |
| `steps/sessionEnd` | none | unsupported | Not supported |
| `steps/agentTrigger` | none | unsupported | Not supported |
| `steps/turnStart` | none | unsupported | Not supported |
| `steps/turnEnd` | none | unsupported | Not supported |
| `steps/userMessage` | Candidate: Claude Code prompt admission (`src/bridge/hookAdmission.ts`) has no ACS mapping | unsupported | Not supported |
| `steps/agentResponse` | none | unsupported | Not supported |
| `steps/knowledgeRetrieval` | none | unsupported | Not supported |
| `steps/memoryContextRetrieval` | none | unsupported | Not supported |
| `steps/memoryStore` | none | unsupported | Not supported |
| `steps/preCompact` | none | unsupported | Not supported |
| `steps/postCompact` | none | unsupported | Not supported |
| `steps/subagentStart` | none (P1-02 delegation narrowing applies to AMC's own tool pipeline, not to ACS) | unsupported | Not supported |
| `steps/subagentStop` | none | unsupported | Not supported |
| `steps/skillRegister` | none | unsupported | Not supported |
| `steps/skillLoad` | none | unsupported | Not supported |
| `steps/skillUnload` | none | unsupported | Not supported |
| `agbom/snapshot` | none (P2-18 owns the AIBOM format) | unsupported | Not supported |
| `agbom/changed` | none (P2-18) | unsupported | Not supported |
| `protocols/MCP/*` | Candidate: MCP gateway and egress proxy (`src/gateway/server.ts`) | unsupported | Not supported |

The approvals store and the deletion executor are AMC enforcement points with no ACS hook: ACS v0.1 has no approver-to-guardian method AMC could serve, and no deletion hook.

## Dispositions

| AMC outcome | ACS answer |
| --- | --- |
| allow | `allow`, with `reasoning` |
| deny | `deny`, with `reasoning` |
| ask (approval required) | `deny` with `reason_codes: ["approver_unavailable"]`: the ACS section 9.2 substitution, because AMC has no approval path for hook calls (`capabilityLossy: true` in the receipt) |
| steer (correct and retry) | `deny`: AMC serves no ACS `modify` and never rewrites tool input |
| any other value | `deny` (`toAcsDecision` fails closed) |
| no decision recorded (ledger unavailable, latched audit) | `deny` with `reason_codes: ["amc_decision_unrecorded"]`, not an error a fail-open runtime would proceed on |

AMC never returns `modify`, `ask` or `defer`. Its ServerHello announces `on_decision_failure: "deny"`, `signature_algorithms_supported: []`, `approver_types_supported: []`, `profiles_accepted: []` and `methods_evaluated` limited to `steps/toolCallRequest`.

## Conformance results

ACS v0.1.4 ships no test vectors. `tests/acsConformance.test.ts` runs 8 AMC-authored cases (one built from the spec's "ACS in Action" example) and validates every AMC answer against the pinned JSON Schemas; the results are recorded in `qualification/2026-10-27-P2-19/`.

## Related

- [docs/standards/crosswalks/owasp-asi-2026.json](crosswalks/owasp-asi-2026.json): the experimental AMC-to-OWASP Agentic Top 10 mapping.
- [docs/standards/acs-contributions/](acs-contributions/README.md): draft agent test cases for Sid to submit to OWASP.
