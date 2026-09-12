# Native OpenAI Chat Completions signed-image input

Source authoring date: **2026-09-10**. Task `native-chat-image-input-20`, AMC-1514
under AMC-1505. **AUTHORED / UNCOMMITTED / UNEXECUTED / UNQUALIFIED.** This describes
local source, not passing tests, an installed release or a remotely probed model.

## Independent Chat wire contract

The official [Chat Completions create reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)
was read on September 10, 2026. Its user message content accepts a text string or
content-part array. An image part is `image_url`, with **nested** `image_url.url`
and optional `image_url.detail`. This is not the Responses `input_image` schema.

```json
{
  "role": "user",
  "content": [
    { "type": "text", "text": "Describe this image." },
    {
      "type": "image_url",
      "image_url": {
        "url": "data:image/png;base64,<original committed image bytes>",
        "detail": "auto"
      }
    }
  ]
}
```

The placeholder is explanatory, not a runnable image. AMC emits canonical base64
of the original signed binary payload, not a URL fetched later. This encoder fixes
detail to `auto`; no inferred per-image detail, file ID, server-side state,
recompression, resize or image generation is introduced. The request uses the
existing `/v1/chat/completions` envelope, with `stream:true` and
`stream_options.include_usage:true` owned by the historical Chat encoder.

## Versioned native integration

The actual `openaiAdapter` now selects **`openai-chat@4`**. The new encoder is in
the live built-in registry and the same default registry used by cold derivation.
The public LLM barrel exports `openaiChatEncoderV4`; existing root and native SDK
barrels continue through that public LLM surface. The exact version4 tool-binding
predicate keeps provider wire aliases scoped to the functions offered at prepare
time. Historical calls do not become newly executable authority.

Chat encoders v1/v2/v3 remain registered under their original identities. The v2/v3
capability binding now uses `OPENAI_CHAT_TEXT_CAPABILITIES`, preserving their
image refusal without changing their encoding algorithms. Non-image v4 requests
return the existing v3 bytes. Image-bearing requests reuse v3's text/function
projection, tool choice, raw argument strings, null assistant content, individual
keyed tool results and explicit `amc.tool-result` failure envelopes, replacing
only the image-bearing user message projection with ordered Chat content parts.
Image-only user messages do not consume an adjacent history row or invent empty
text. System text remains the separately committed system prompt.

Discovery captures the selected native route. ACP advertises image input only
when the image capability, protocol `openai-chat-completions`, encoder ID
`openai-chat` and encoder version4 all match. Historical, unknown or mismatched
routes do not inherit it. `modelSupport` remains **`not-probed`**. An arbitrary
compatible endpoint or selected remote model can reject locally admitted input.
No DeepSeek image support, provider count or full Chat protocol coverage is claimed.

The Chat output decoder is unchanged. Unsupported reasoning/audio/refusal/
annotation or legacy function-call output remains refused; absent reported usage
is not invented. The existing documented `content_filter` finish-reason lossiness
is not resolved by image input. Model-specific `max_tokens` compatibility also
remains the operator's route/model concern, not a capability probe.

## Public entrypoints

These examples describe a build containing the authored changes. They were not
executed; no currently published package is claimed to contain them. Existing
workspace setup, credential-reference resolution, policy and approvals still apply.

```sh
amc agent-loop run --provider openai --model '<operator-selected image-capable model>' \
  --image ./diagram.png 'Describe this image.'
```

The CLI accepts repeated image paths in order and still requires a text prompt.
Its bounded local file loader and no-follow behavior are unchanged. It does not
fetch image URLs. In-process `AgentSession.prompt(text, images)` uses the same
immutable native input path.

```ts
import { readFileSync } from "node:fs";
import { AMCNativeClient } from "agent-maturity-compass/sdk/native";

const model = process.env.AMC_IMAGE_MODEL;
if (!model) throw new Error("Set an accessible, image-capable Chat model explicitly.");
const client = await AMCNativeClient.start({
  workspace: ".", provider: "openai", model, credential: "OPENAI_API_KEY"
});
try {
  const session = await client.newSession();
  const result = await session.prompt("Describe this image.", {
    images: [{ filename: "diagram.png", mediaType: "image/png", bytes: readFileSync("diagram.png") }]
  }).result;
  console.log(result.text, result.verification); // Completion is still not verification.
} finally {
  await client.close();
}
```

```python
import os
from pathlib import Path
from amc_sdk import AmcAgent, NativeImageInput

with AmcAgent(workspace=".", provider="openai", model=os.environ["AMC_IMAGE_MODEL"],
              credential="OPENAI_API_KEY") as agent:
    session = agent.new_session()
    result = session.prompt("Describe this image.", images=[
        NativeImageInput(Path("diagram.png").read_bytes(), "image/png")
    ])
    print(result.text, result.verification)
```

The canonical Python client is `sdk/python/amc_sdk`, not the historical bridge.
Both subprocess clients use standard ACP `image` blocks with original base64
`data` and `mimeType`, after requiring the peer's image capability to be exactly
true. The existing client APIs need no provider-specific payload rewrite.
See [the ACP image contract](NATIVE_ACP_IMAGE_INPUT.md) for wire fields, explicit
release/load, cancellation, frame bounds and hostile-peer behavior.

## Signed sources and preserved limits

Task17/task18's `amc-image-input@1` stores an immutable canonical text-plus-images
bundle in the signed blob-backed inbox. Base64 is not copied into metadata.
Only input admitted through the existing preStep gate projects original binary
`user/attachment` rows. MIME, byte length, digest and source inbox event/index
remain bound to those rows. Request source resolution and cold derivation consume
that evidence, never a caller file, captured HTTP oracle or synthesized image.

The image encoder rechecks original bytes, supported MIME and committed SHA-256.
Count and aggregate raw-byte bounds apply across the complete projected request
history: eight images, 4 MiB per image and 8 MiB total. Image-bearing Chat requests
are bounded to 32 MiB serialized. PNG/JPEG/GIF/WebP header/container admission is
not full codec validation, malware detection, animation/dimension compatibility,
prompt-injection protection or proof of provider receipt. Existing lower signed
event/blob and ACP bounds remain; none were enlarged.

ACP ingress is limited to 262,144 bytes per JSON line excluding its terminator,
including base64 expansion and text/JSON overhead. Its history limits remain
separate; therefore an image accepted in-process may be too large for subprocess
transport or replay. Failures refuse rather than truncate or resize.

The public native contract still accepts a text/resource-reference prefix followed
by ordered images, or images alone. **Arbitrary public text-after-image order is
not implemented.** It requires a new ordered, versioned native input contract;
silently concatenating or rearranging ACP blocks would corrupt meaning. The new
encoder can preserve already-signed ordered parts, but that does not widen public
input admission. Audio, embedded resources and unknown prompt blocks still refuse.

Missing payloads remain `payload-missing`; pruned payloads remain `payload-pruned`;
readable tampering or contradictory signed MIME/length/digest/role remains
`evidence-inconsistent`, without guessed bytes. Existing unreadable encrypted-blob
classification is unchanged. Reconstruction is complementary to cryptographic
row/chain verification, not an external trust anchor. History is replayed only
after authenticated load and remains separate from new output or verification.

Existing signed policy, preStep veto, cancellation, request budgets, endpoint
rules, tool choice and offered-authority capture remain in the actual runtime.
No guard or error state was weakened to enable images.

## Regression source and qualification boundary

`tests/nativeChatImageInput.test.ts` specifies actual selected runtime/HTTP bytes,
SQLite/JSONL cold reconstruction, real CLI parsing/composed input and the actual
registered CLI action in a marked disposable child with local HTTP, original-file
independence, canonical names and raw argument fragments, keyed failed results,
later text history, immutable offered authority, historical byte compatibility,
exact discovery, mixed-message boundaries, unsupported modalities, size limits,
budget/cancellation and hostile persisted evidence.

`tests/nativeChatAcpImageInput.test.ts` specifies actual public ACP input and
initialize, immutable inbox, original binary attachments, policy/veto/cancel/
budget boundaries, release/load, ordered multiple images, explicit public
interleaving refusal, and missing/pruned/tampered history without partial replay.

`tests/fixtures/nativeChatImageStream.ts` scripts only HTTP;
`tests/fixtures/nativeChatCli.ts` invokes the real registered command/action,
requires a disposable-workspace marker, and is not the installed CLI entrypoint.
The authored CLI test bounds and closes its child and local HTTP server. Neither
was started in task20. The existing real
native ACP fixture, TypeScript subprocess suite and canonical Python image suite
now contain explicit Chat lanes and Chat wire assertions on SQLite/JSONL. The
existing hostile peer remains separate from native-runtime proof. Cold child
source takes only workspace and session identity after writer closure, using the
default registry; transmitted bytes are parent comparison oracles only.

**No test, check, import, build, fixture or acceptance was executed.** These are
regression sources, not passing receipts. No Git baseline/staging/commit, live
provider, production credential/signing, publish or deployment occurred. Source,
package, platform, model, security, human, comparator and release qualification
remain distinct and outstanding. Task09 FULL_GOAL_COVERAGE and broader provider/
modality/backend/platform/older residuals remain open. All seven Done criteria
and genuine license/human/security/release gates remain; no superiority claim.
