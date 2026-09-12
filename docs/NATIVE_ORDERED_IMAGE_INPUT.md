# Native ordered image input

Source-authoring contract, September 10, 2026 — AMC-1514 / AMC-1505, task21.
**UNCOMMITTED / UNEXECUTED / UNQUALIFIED.** The examples and authored regressions
have not been run. This is not installed-package, remote-model or release proof.

## What is additive

`amc-image-input@2` records an image-bearing ordered sequence of text and original
image bytes. Text may precede, follow or separate images. Empty and adjacent text
parts retain their positions and exact UTF-8 contents: no trimming, joining or
moving text ahead of images. At least one image is required; text-only work uses
the existing `prompt(text)` API rather than a new text-only segmentation promise.

Historical `amc-image-input@1` is unchanged: a text prefix plus an image array.
Its canonical serialization, original replay and existing text-plus-images APIs
remain. There is no in-place migration or rewriting of signed old history.

## Public TypeScript and native in-process APIs

The native SDK subpath exports `NativeInputPart`, `NativeImageInput`,
`NATIVE_ORDERED_INPUT_FORMAT`, `snapshotNativeInputParts`, and the session/client
APIs. The ordinary SDK/root barrel re-exports the ordered type, constant and
snapshot helper alongside `AMCNativeClient`.

Given an already configured `AMCNativeSession` named `session` and original PNG
bytes named `pngBytes`:

```ts
const turn = session.promptParts([
  { type: "text", text: "First, inspect this image." },
  { type: "image", image: {
    filename: "photo.png", mediaType: "image/png", bytes: pngBytes
  } },
  { type: "text", text: "Now answer using that image, not the earlier text." }
], { signal: controller.signal });
const result = await turn.result;
```

`openAgentSession` and `resumeAgentSession` return `OrderedAgentSession` with
`await session.promptParts(parts)` for in-process composition. The base
`AgentSession` interface keeps the method optional for externally supplied legacy
factories; ACP refuses an ordered request if its selected factory lacks it.
`AgentDriver.sendParts(parts, target, wakeup)` and `followupParts(parts)` reuse the
existing lane routing, abort demotion and wakeup behavior. These are additive;
`prompt(text, images)` and subprocess `prompt(text, { images, signal })` keep their
legacy interpretation. Ordered and legacy calls share the same serial prompt slot.

## Canonical Python

`NativeInputPart` is `str | NativeImageInput`. Given an already configured Python
`Session` and original bytes named `png_bytes`:

```python
from amc_sdk import NativeImageInput

result = session.prompt_parts([
    "Before the image",
    NativeImageInput(png_bytes, "image/png"),
    "",
    "After the image",
])
```

`start_prompt_parts(parts)` returns the ordinary cancellable `Turn`; `prompt_parts`
waits for its result. Construction/submission snapshots caller-owned bytearrays,
memoryviews and lists. Existing `prompt(text, images=...)`, cancellation, active
turn/refused release rules and thread/process cleanup remain shared, not replaced.

## ACP negotiation and wire

The standard prompt still contains standard ACP text and image content blocks.
Image `data` is canonical base64 with supported `mimeType`; optional `uri` is not
a fetch instruction. Filenames and digests are not invented ACP wire fields.
The server generates safe local attachment names and signs original byte digests.

The actual native stdio launcher advertises this additional capability only for
an image-capable selected route with an ordered-capable native factory:

```json
{
  "agentCapabilities": {
    "promptCapabilities": { "image": true },
    "_meta": {
      "dev.agentmaturity.amc": { "orderedImageInput": "amc-image-input@2" }
    }
  }
}
```

The ordered SDK methods require that exact string and `image: true` before
submission. They add `_meta.dev.agentmaturity.amc.inputFormat` with value
`amc-image-input@2` to `session/prompt`. Unknown versions and missing/merely-truthy
advertisements refuse; they are not silently downgraded to prefix-plus-images.

An ordinary standard ACP prompt containing text/resource references after an
image also selects v2 on a supporting native launcher. Unextended legacy
text/reference-prefix-plus-images prompts retain the old prefix joining/trimming
semantics. Use explicit v2 metadata when preserving every prefix text-block
boundary matters. A `resource_link` stays an unfetched textual annotation
`[linked resource: URI]` at its original position; it does not become resource
content. Audio, embedded resources and unknown content still refuse atomically.

`amc acp` is the CLI transport for this ordered wire. Existing `amc agent run`
repeated `--image` flags remain the legacy text-prefix-plus-images interface;
this change does not invent order-sensitive CLI flags.

Official ACP primary references read on September 10, 2026:
https://agentclientprotocol.com/protocol/content
https://agentclientprotocol.com/protocol/extensibility
The extension uses `_meta` rather than adding custom unnamespaced message fields.

## Signed source and historical wire identities

The entire sequence is validated and frozen before `LoopInbox` writes its v2
blob-backed input. A preStep veto may reject it. An entering hook cannot drop,
rewrite, reorder, duplicate or downgrade that claimed ordered input; the original
commitment is compared again before any text or attachment row is projected.

Each projected row carries its signed source inbox event ID, format and
zero-based `sourceContentIndex`. Images also retain their historical image-only
`sourceInputIndex`, original MIME, byte length and SHA-256. Original binary bytes
are never replaced by a UTF-8 representation in queued or signed image payloads.
The existing attachment scanner still inspects its own text view of those bytes;
that view is not the image payload. Text uses exact UTF-8, including empty text.
The ordinary surface projection and request-source resolver preserve signed row
order, raw tool arguments and keyed error history.

The current native image encoders already consume these ordered image-bearing
parts: Chat `openai-chat@4`, Responses `openai-responses@3`, and Anthropic Messages
version4. Their encoder source, registrations, byte algorithms and historical
identities are unchanged here. Chat emits nested `image_url` data URLs, Responses
emits `input_image` with a data URL, and Anthropic emits base64 image sources.
The retained dated provider-wire references are in the predecessor image guides.
No DeepSeek image capability or additional compatible-origin provider is inferred.
Remote model support remains **not probed**.

Request-byte reconstruction is not signature verification. `deriveRecordedRequest`
deliberately does not recompute ledger hashes/signatures; a change to source-index
metadata may leave reconstructed bytes identical while authenticated ACP history
loading rejects the edited row. Both checks are required for a verified result.
Missing and pruned input/image payloads retain separate errors; tampered original
image bytes or MIME/length commitments are not substituted or silently skipped.

## Bounds and non-claims

Native policy allows at most256 ordered parts, eight images,4MiB per image,8MiB
aggregate original image bytes and16MiB canonical inbox payload. These are policy
constants, not measured capacity claims. The **lower ACP256KiB input-line bound**
includes JSON/base64 overhead and still controls subprocess/public ACP input.
Separate response/history per-frame and8MiB aggregate limits remain unchanged;
legitimate larger local sessions may be refused on ACP load before partial replay.
Requests also retain each provider encoder's existing image-history/body bounds.

Header/container checks are not complete image decoding, malware validation or
prompt-injection immunity. Policy pins, preStep, cancellation, model budgets,
tool authority and verified resume remain the existing native controls. No tests,
checks, imports, builds, fixtures, live providers or acceptance were executed.

Authored regression sources: `tests/nativeOrderedImageInput.test.ts`,
`tests/nativeOrderedAcpImageInput.test.ts`, `tests/nativeOrderedImageSdk.test.ts`,
and `sdk/python/tests/test_ordered_image_input.py`. They specify real native/HTTP,
public ACP, actual registered CLI, TypeScript/Python subprocess, cold SQLite/JSONL
and hostile-input/evidence scenarios. Untrusted peer fixtures test client edges
only; they are never labelled native-runtime proof.

Task21 evidence: `AMC_OS/RESEARCH/2026-09-10-native-ordered-image-input/`.
Broader task09 full-goal work and all source/package/platform/provider/human/
comparator/license/security/release gates remain open. Validation begins only
after all full-goal implementation, at the authorized candidate/clone boundary.
