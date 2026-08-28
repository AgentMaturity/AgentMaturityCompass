# `@amc/acp-schema`

The Agent Client Protocol schema, vendored as DATA. There is no runtime code
here, but this file IS read at run time: `src/acp/acpSchema.ts` validates every
inbound ACP message against it with `ajv`, and the build copies it to
`dist/acp/acp-schema.json` so an installed package has it too.

That is deliberate. Generating codecs from the schema would put a derived
artifact between AMC and the contract, and a derived artifact can drift.
Validating against the schema itself makes drift impossible: there is nothing to
drift from. It also means a missing or malformed schema fails loudly instead of
rotting quietly.

| | |
|---|---|
| Upstream | `@agentclientprotocol/sdk` |
| Version | 0.18.0 (`schema.json` as published) |
| Source | https://github.com/agentclientprotocol/typescript-sdk |
| License | Apache-2.0 (see `LICENSE`) |
| Vendored | 2026-08-28 |

## Why vendored rather than depended on

Three reasons, in order of weight.

**AMC signs what it reads.** `src/wire/ndjsonFraming.ts` already refuses the MCP
SDK's `ReadBuffer` — a package AMC *does* depend on — because `readMessage()`
returns a parsed object and never the line's bytes, fusing framing to parsing.
The ACP SDK's reader has the same shape. Taking it would put a third party
between AMC and the bytes it digests.

**Its stream recovery contradicts AMC's.** The SDK's reader catches a parse
error, writes to `console.error`, and skips the line. AMC's framer latches and
stops producing records, because resynchronising a desynced stream is not
recovery — and on a stdio transport that `console.error` writes into the stream
the peer is reading.

**The licence obligation would otherwise go unrecorded.**
`scripts/vendor/gen-third-party-notices.mjs` walks `vendor/` only and hard-fails
on a directory with no `LICENSE`. A `node_modules` dependency escapes that gate
entirely, so Apache-2.0 §4(d) notice propagation would appear in no AMC artifact.
Vendoring converts the obligation from unrecorded into gate-enforced.

## Updating

Replace `schema.json` and `LICENSE` from the upstream tag, bump `version` here to
match, and run the suite. `tests/acpAgentServer.test.ts` validates every response
AMC emits against this file, so a schema change that breaks a response cannot
land silently.
