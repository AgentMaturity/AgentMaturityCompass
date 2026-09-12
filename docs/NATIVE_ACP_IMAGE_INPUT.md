# Native ACP and subprocess SDK image input

Source authoring date: **2026-09-10**. Task `native-acp-image-input-18`, AMC-1514.
**AUTHORED / UNCOMMITTED / UNEXECUTED / UNQUALIFIED.** This document describes
the source contract, not a released package, passing tests or a probed model.

## Wire contract and discovery

AMC retains protocol version 1 and its existing vendored ACP SDK 0.18.0 schema,
recorded as vendored on 2026-08-28. Every inbound request still passes the existing
schema validator; no generated codecs, schema replacement or runtime dependency
was introduced. Official primary references inspected on 2026-09-10:

- [ACP v1 content](https://agentclientprotocol.com/protocol/v1/content)
- [ACP v1 initialization](https://agentclientprotocol.com/protocol/v1/initialization)

The standard image block uses `type: "image"`, base64 `data`, and `mimeType`.
The optional `uri` is an annotation, not a request to read a file or fetch a URL.
AMC never substitutes a URI, filename, file ID or digest for original image bytes.
The schema permits optional metadata/annotations; neither becomes a grant.
There is no invented ACP filename, SHA-256 or signing field.

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "session/prompt",
  "params": {
    "sessionId": "the-session-returned-by-session/new",
    "prompt": [
      { "type": "text", "text": "Describe this image." },
      { "type": "image", "mimeType": "image/png", "data": "<original bytes as canonical base64>" }
    ]
  }
}
```

The placeholder is explanatory, not a runnable image. Supply actual canonical
base64 for PNG, JPEG, GIF or WebP bytes whose header/container agrees with the MIME.
Image-only prompts are supported by the authored path without manufacturing an
empty provider text block. Plain text and resource links preserve the previous
text API: text fragments are joined with newlines and trimmed; links become
`[linked resource: ...]` references and are not fetched. The native input contract
accepts a text/resource-reference prefix followed by ordered images, or images
alone. It explicitly refuses a text/reference block after an image instead of
silently rearranging that interleaved prompt. This representational restriction
is narrower than the full ACP content array; arbitrary interleaving is not claimed.

`initialize.agentCapabilities.promptCapabilities.image` is derived once from
the actual fixed route: **Anthropic Messages encoder v4, OpenAI Responses
encoder v3 or OpenAI Chat encoder v4, with its matching protocol and image-input capability contract**.
Responses was added by task19 on 2026-09-10; see [its native contract](NATIVE_RESPONSES_IMAGE_INPUT.md).
Chat was added by task20 on the same date; see [the independent Chat contract](NATIVE_CHAT_IMAGE_INPUT.md).
Historical Anthropic and Chat encoders v1–v3, Responses encoders v1–v2, other native protocols,
missing contracts and unknown routes do not inherit that capability. This describes
native handling, not successful remote model access: `modelSupport` remains
`not-probed`. No DeepSeek image support or compatible-endpoint equivalence is claimed.
Audio and embedded resources remain unsupported and refuse the entire prompt,
even alongside valid text. Unknown/malformed blocks are not silently discarded.

## Original bytes and governed execution

The source path is `acpAgentServer` → `acpPromptInput` → `AgentSession.prompt`
→ the existing `AgentDriver` and `LoopInbox`. Both subprocess clients snapshot
input before asynchronous work; the server validates all blocks before committing
inbox work. The native `amc-image-input@1` bundle is immutable and blob-backed,
with a signed inbox row rather than base64 copied into metadata.

Only an admitted pre-step message produces signed `user/attachment` rows. Those
rows retain the original binary payload, MIME, byte length, SHA-256 and source
inbox event/index. The runtime derives its selected native provider request from signed
sources. No UTF-8 conversion, resizing or recompression supplies provider image
bytes. The image-only empty-text correction affects newly admitted image-only
messages; existing signed rows and historical encoder bytes are not rewritten.

Cancellation, pre-step veto, tool policy/approvals, signed configuration and model
budget admission remain on their existing paths. Image capability is not policy
permission. Header checks are not full codec validation, malware detection,
prompt-injection immunity, an external trust anchor or proof of provider receipt.

## Bounds are surface-specific

The native image helper limits each image to 4 MiB and each input to eight images
and 8 MiB. The current Anthropic, Responses and Chat image encoders also bound images across the complete
projected request history; these are not promises that an arbitrary remote model
accepts the same bounds.

**ACP requests are smaller:** the existing NDJSON ingress limit is 262,144 bytes
per JSON line, excluding its terminator. Base64 expansion and JSON/text overhead
count. TypeScript and Python now refuse oversized request lines locally instead
of sending a nominally allowed 1 MiB frame that kills the native connection. No
ingress limit was widened. Large images admitted through the in-process interface
therefore need not fit the subprocess interface.

ACP replay retains the existing 900,000-byte server notification-parameter bound,
1 MiB client response-frame bound and 8 MiB aggregate replay bound. The complete
history projection is preflighted before any replay notification is sent. Oversize
history is refused, not truncated or silently resized. The server's session-row
bound also remains in force.

## TypeScript subprocess API

For a build containing these changes, the existing public package subpath exposes
the additive `images` option. The `signal` option and text-only calls are unchanged.
No published-install availability is implied by this source example.

```ts
import { readFileSync } from "node:fs";
import { AMCNativeClient } from "agent-maturity-compass/sdk/native";

const model = process.env.AMC_IMAGE_MODEL;
if (!model) throw new Error("Select an accessible image-capable Anthropic model.");
const client = await AMCNativeClient.start({
  workspace: ".", provider: "anthropic", model, credential: "ANTHROPIC_API_KEY"
});
try {
  const session = await client.newSession();
  const turn = session.prompt("Describe this image.", {
    images: [{ filename: "diagram.png", mediaType: "image/png", bytes: readFileSync("diagram.png") }]
  });
  const result = await turn.result;
  console.log(result.text, result.verification); // Still "not-verified".
} finally {
  await client.close();
}
```

The caller owns file selection and reading; the SDK takes bytes, not arbitrary
paths or URLs. The filename is validated locally but is not an ACP wire field.
The receiving runtime assigns safe names based on MIME and image order.
Image submission requires the peer's `image` capability to be exactly `true`;
a missing capability, `false` or a truthy string does not authorize it.

## Canonical Python API

The supported Python client is `sdk/python/amc_sdk`, not the separate historical
bridge wrapper under `src/sdk/python`. `NativeImageInput(data, mime_type)` copies
bytes/bytearray/memoryview on construction. A memoryview is bounded by `nbytes`,
not its number of elements. `Session.prompt` and `Session.start_prompt` both take
keyword-only `images`; legacy positional text calls and result fields remain.

```python
import os
from pathlib import Path
from amc_sdk import AmcAgent, NativeImageInput

with AmcAgent(workspace=".", provider="anthropic", model=os.environ["AMC_IMAGE_MODEL"],
              credential="ANTHROPIC_API_KEY") as agent:
    session = agent.new_session()
    result = session.prompt("Describe this image.", images=[
        NativeImageInput(Path("diagram.png").read_bytes(), "image/png")
    ])
    print(result.text, result.verification)  # Completion is not verification.
```

For cancellation use the existing `start_prompt`/`Turn.cancel` or session cancel
path and wait for the actual result. A cancel request alone is not process closure.

## Signed history and cold reconstruction

An idle session's explicit release permits a later verified load. Normal close
still seals it; a sealed session is not silently reopened. `session/load`
authenticates the committed tail before projecting attachments. Image replay
checks signed surface role/kind/digest, actual binary payload digest, byte length
and MIME. Missing, pruned and inconsistent evidence refuse; no unsigned placeholder
or UTF-8 rendering of binary data replaces it. Text attachments remain text.

Replayed `user_message_chunk` image content uses only standard ACP fields. Both
clients accept it only during the correlated load window. TypeScript now retires
that window on the reader when the load reply arrives, rather than in a later
promise continuation. Late images, unsolicited user images and assistant image
output fail closed. History remains separate from the next prompt's output and
from an independent verification receipt.

## Authored regression boundary

`tests/nativeAcpImageInput.test.ts` exercises raw public ACP bytes, actual stdio
discovery, signed inbox/attachment lifecycle, cancellation, pre-step veto, budgets,
release/load, payload tampering and bounded replay. `tests/nativeImageSdk.test.ts`
exercises the actual TypeScript subprocess client. Canonical Python coverage is
`sdk/python/tests/test_image_input.py`, including its public blocking/streaming APIs.

`tests/fixtures/nativeAcpImageRuntime.ts` composes actual native ACP, session,
driver, credentials isolation, adapter and ledger; only HTTP responses are scripted.
Its executable mode requires an explicitly marked disposable workspace. The
separate `nativeAcpImageClientPeer.mjs` is deliberately untrusted protocol input,
not substitute runtime proof. Both clients have authored SQLite/JSONL lifecycle
lanes; cold reconstruction uses the existing fresh-process fixture with only
workspace/session identity after writer closure, comparing captured HTTP bytes
as an oracle, never as reconstruction input.

**None of these tests, imports, fixture processes, checks or builds was executed.**
No test count, pass, installed-wheel/package, platform, live-provider, human,
independent security, comparator or release qualification is claimed. The broader
task09 `FULL_GOAL_COVERAGE.md`, other providers/modalities, backend/platform breadth,
older residuals and all seven Done/license/security/release gates remain open.
