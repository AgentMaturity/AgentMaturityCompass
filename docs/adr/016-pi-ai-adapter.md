# ADR 016: Pinned pi-ai request encoders behind AMC's adapter seam

Status: proposed on 2026-10-18 by the P1-38 implementer, under D-02 = A (evidence layer first; native adapters stay
the default and pi-ai is opt-in). Sid approves the dependency (see `docs/providers/pi-ai-review-1.3.0.md`, Needs-Sid).
Owner: P1-38. Date: 2026-10-18.

The P1-38 issue names this file `docs/adr/009-pi-ai-adapter.md`. Number 009 is already `009-authorization-record.md`,
so this ADR takes the next free number, 016.

## Context

AMC signs a `request/header` row that commits to `sha256(exact request bytes)` before anything is sent, and a verifier
re-derives those bytes from the log (`deriveSessionRequests`, `src/llm/request/deriveRequest.ts`). An adapter only
wraps bytes it did not build (`src/llm/adapter/adapterTypes.ts`). `@earendil-works/pi-ai` reaches many providers, but
it builds and sends its own requests through vendor SDKs. A competitor controls it and it releases often.

The issue's spike question: can AMC capture the exact request bytes before dispatch and record them in the signed
header, either (a) by sending through an AMC-supplied `fetch`, or (b) by building the request without sending it?

## Spike evidence (pi-ai 1.3.0, integrity in the review)

All paths are inside the published package.

- `dist/types.d.ts:57` declares `ProviderRequestOptions.fetch`, and `:68` declares
  `onPayload(payload, model)`, "for inspecting or replacing provider payloads before sending".
- `dist/api/openai-completions.js:151` exports `stream(model, context, options)`. Inside it, lines 186-188 run
  `createClient(...)`, then `buildParams(...)`, then `await options?.onPayload?.(params, model)`. That is the first
  `await`, so `onPayload` is called synchronously during `stream()`. The request is sent only afterwards, at line 197,
  by `client.chat.completions.create(params, ...)` with `maxRetries: 0` (line 195) and pi-ai's own retry wrapper.
- (b) works: an `onPayload` that records the payload and throws stops `stream()` before the client call, so pi-ai
  sends nothing and retries nothing. AMC serialises the captured payload with `JSON.stringify`, as the SDK does.
- (a) works as a cross-check: with an injected `fetch`, the body pi-ai's send path hands to `fetch` is byte-identical
  to AMC's bytes. `tests/piAi/piAiAdapterContract.test.ts` ("the encoder's bytes equal what pi-ai's own send path
  transmits through its fetch option") proves this for every allowlisted provider, including tool replay.
- The payload is deterministic: `PI_CACHE_RETENTION` is read only when `cacheRetention` is unset
  (`dist/api/openai-completions.js:142-150`), and AMC always passes `cacheRetention: "none"`. Message timestamps are
  fixed at 0 and never reach the payload. No clock, random value or credential is in the body.
- pi-ai's own decoder starts usage at zero (`dist/api/openai-completions.js:161-167`) and maps missing counts to 0
  (`parseChunkUsage`, line 1166). AMC therefore does not use it.

Exit criterion met: AMC captures the exact bytes before dispatch and records them in the signed `request/header`.

## Decision

1. **Encoder, not transport.** `pi-ai:<provider>@1` (`src/llm/providers/piAi/piAiEncoder.ts`) is an ordinary
   `RequestEncoder`. It maps the signed `EncodableRequest` to a pi context, calls pi-ai's `stream()` with the capturing
   `onPayload`, and returns the bytes. `prepareRequest` signs them like any native request. AMC's transport sends them,
   so P2-02 dataflow admission, capability admission, budget admission, the egress gate and AMC's retry policy all
   apply. There is no second request path.
2. **Decoder.** The pi adapter (`piAiAdapter.ts`) reuses AMC's native Chat Completions decoder. Missing usage stays
   unreported (`usage.reported: false`, assembly usage `null`), never zero.
3. **Derivation.** Re-derive. With pi-ai 1.3.0 installed, a matching digest is `reconstructed`. Without it, the request
   is `unreconstructable` (no encoder available), never `reconstructed`. No `recorded-bytes` status is added, because
   the bytes re-derive deterministically. `verifyAgentRun` and `amc session replay-request` load pi-ai only when a
   recorded header names a pi encoder.
4. **Allowlist.** `groq`, `huggingface` and `together`: no native route covers them, and the pinned catalog serves
   them through `openai-completions`. A model must be in the pinned catalog, use `openai-completions` and not be a
   reasoning model. AMC cannot record reasoning output on this route.
5. **Capabilities.** Every feature is `unknown` except those the contract tests prove: text input and output, usage,
   tool calls and tool replay are `supported`. Tool-result error flag and error text are proven `unsupported`, because
   pi-ai 1.3.0 sends a failed and a successful result as identical bytes. `assertRequestCapabilities` refuses the rest
   before a header exists.
6. **Params and limits.** Only `max_tokens` (required, at most the catalog's `maxTokens` and `contextWindow`) and
   `temperature` (0 to 2) map. Anything else is refused before a header exists. Input length against the context
   window is not checked before send, because AMC has no tokenizer for these models.
7. **Packaging.** An optional peer at exactly `1.3.0`, loaded only with `import()` by `piAiLoader.ts`, after checking
   Node (`>=22.19.0`) and the installed version. Refusals name the remediation. `engines.node` stays `>=20`.
8. **Routes.** `pi-ai:<provider>` on `amc agent-loop run` only, listed apart from native routes in `--help`. ACP and
   native schedules keep native routes only.

## Consequences

- A pi-ai upgrade is a new encoder version. A session recorded under `pi-ai:<provider>@1` re-derives only with
  pi-ai 1.3.0 installed, and otherwise reports `unreconstructable`. `docs/providers/PI_AI_UPGRADE_POLICY.md` covers this.
- pi-ai re-serialises historical tool-call arguments from parsed objects. The replayed arguments are deterministic
  but may differ in whitespace or number spelling from what the model emitted. Arguments that are not a JSON object
  are refused.
- pnpm's `autoInstallPeers` records the optional peer in `pnpm-lock.yaml` and installs it in every workspace checkout
  (77 packages). npm consumers of the published package do not get it. This needs Sid's approval.
- The capability matrix (`docs/providers/CAPABILITY_MATRIX.md`) is generated from contract-test results against local
  fixture servers. No cell was checked against a real provider.
