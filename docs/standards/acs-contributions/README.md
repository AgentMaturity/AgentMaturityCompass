# Draft ACS agent test cases for OWASP (P2-19)

Status: **draft for Sid**. Nobody at AMC has contacted OWASP or the ACS working group about these. Sid decides whether and how to submit them; an agent never does.

ACS v0.1.4 ships no conformance test suite (its `docs/spec/conformance.md` points to upstream issue 19 for one). These cases come from building AMC's guardian against the pinned release (`v0.1.4`, commit `834f3f0d51e7bbbd9a68ff682bec89f97ddd72d8`) and are offered as candidate vectors. Each names the spec section it tests, the input, the expected outcome and why. AMC passes the guardian-side cases in `tests/acsHooks.test.ts` and `tests/acsConformance.test.ts`; passing them is not ACS conformance.

Cases: [test-cases.json](test-cases.json). Inputs are abbreviated: every request also carries a valid common envelope (`jsonrpc`, `id`, `params.acs_version` "0.1.0", a fresh UUID `request_id`, a current `timestamp`, `metadata.agent_id` and `metadata.session_id`) unless the case says otherwise.

## How Sid could submit them

1. Check the upstream repository's `CONTRIBUTING.md` and the state of its conformance-suite issue at submission time; re-pin if a newer tag has shipped.
2. Open one issue or pull request per group (replay, dispositions, liveness, unsupported methods), using the case text below as the body.
3. Record the upstream link in the plan document's P2-19 thread.

## Spec feedback drafted while implementing (for Sid to raise, or drop)

- **HMAC key derivation (v0.1.4 section 10).** The tag says the per-session key is HKDF-derived "together with the session_id" but names no salt, info or output length, so two implementations cannot interoperate. The default branch fixed this after the tag (commit `b6b2d75`); asking for a patch release would let implementers pin it.
- **Methods a guardian omits from `methods_evaluated`.** handshake.json tells clients to treat them as ALLOW-by-default. A test case that a guardian still refuses (rather than allows) such a method when it is sent anyway would make the guardian side explicit.
- **`raw_command` beside structured `arguments`.** The toolCallRequest schema allows both. A guardian that evaluates only the arguments cannot know what the runtime will execute; the spec could say which one the runtime runs, or that a guardian should deny when it cannot evaluate `raw_command`.
