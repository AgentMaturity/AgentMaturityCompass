# Native signed image input — September 10, 2026

Task `native-signed-image-input-17`, AMC-1514 under AMC-1505.
**AUTHORED / UNEXECUTED / UNCOMMITTED / UNQUALIFIED.** This document describes
source changes, not a test receipt, installed-package result or live-provider run.

**Later source authoring, 2026-09-10:** task18 implemented the bounded
[ACP/TypeScript/Python image path](NATIVE_ACP_IMAGE_INPUT.md), and task19 added
[native OpenAI Responses v3 image input](NATIVE_RESPONSES_IMAGE_INPUT.md).
Task20 added [native OpenAI Chat v4 image input](NATIVE_CHAT_IMAGE_INPUT.md).
The task17 scope and next-action descriptions below are historical handoff context,
not the current provider/public-surface matrix. These later sources are likewise
UNCOMMITTED / UNEXECUTED / UNQUALIFIED; no old receipt is promoted by this note.

## Wire decision and version boundary

The selected native protocol is Anthropic Messages, `anthropic-messages@4`.
The official primary vision reference, retrieved September 10, 2026, documents
user content blocks of the following form:

```json
{"type":"image","source":{"type":"base64","media_type":"image/png","data":"<original bytes in canonical base64>"}}
```

Primary source: https://platform.claude.com/docs/en/build-with-claude/vision
The linked Messages API reference is https://platform.claude.com/docs/en/api/messages;
its full page exceeded the browsing reader's size limit, so the vision page is
the primary source actually inspected for this wire decision. No remote model
was queried. `modelSupport` remains `not-probed`. The adapter keeps the existing
`anthropic-version: 2023-06-01` envelope header.

Versions 1, 2 and 3 remain in the built-in reconstruction registry and retain
their image refusal. Version 4 retains v3's provider-safe tool identities and
cache breakpoints. Text/tool requests without thinking parts have an authored
exact-byte v3/v4 compatibility regression. Unsigned Anthropic thinking replay
still refuses; no provider signature is invented. DeepSeek, OpenAI Chat and
OpenAI Responses native adapters remain image-unsupported in this source slice.
This is not a statement that their remote models can never support images.

## Public native input

```sh
amc agent-loop run --provider anthropic --model '<operator-selected model>' \
  --image ./pixel.png 'Describe the attached image.'
```

This is usage documentation, not an instruction executed by task17. Existing
workspace, credential-reference, tool-policy and approval setup remains required.
The option may be repeated, and order is preserved. Unsupported native routes
refuse before image files are read. The file loader uses bounded regular-file
reads with no-follow admission, detects a changed file during reading, and does
not fetch URLs, follow leaf symlinks, resize, or substitute a file ID for bytes.
A platform without the no-follow primitive refuses rather than weakening it.

The public in-process native SDK now exports `openAgentSession`,
`resumeAgentSession`, `NativeImageInput` and `snapshotNativeImages`.
An opened native session accepts `prompt(text, images)`, where every image has
`filename`, `mediaType` and a `Buffer` containing the original bytes. Existing
session composition and route policy continue to apply. **The subprocess/ACP
`AMCNativeSession.prompt(text)` path is not made image-capable by these exports.**

## Durable input and provenance

`amc-image-input@1` is an optional, signed `loop/inbox` payload format. Its
canonical JSON stores the text and base64 image content in the existing
blob-backed payload, not in row metadata. Ordinary text inbox rows retain their
existing shape. Image data is snapped before asynchronous composition or wakeup.
The inbox records before its live projection changes; replay requires canonical
base64, valid bounds, and the original committed payload hash.

Only after a claimed message passes the existing pre-step gate does the driver
project `user/attachment` rows. The image recorder compares the claimed image
list with the exact signed inbox row. Attachments record original binary payloads,
MIME, byte length, and the source inbox event/index. Their surface references and
payload hashes feed the ordinary signed request header. Veto and cancellation
fixtures explicitly require no model-visible image and no model dispatch.

`requestSources.ts` now resolves raw `Buffer` bytes rather than converting images
through UTF-8. It requires a user attachment, matching committed digest and byte
length, and matching supported media type. The encoder requires those resolved
bytes and emits inline base64 deterministically. A hash, file's existence, URL,
or encoder-generated body by itself is **not** evidence of a provider dispatch.

## Limits and distinctions

The local policy is deliberately bounded: up to eight images, four MiB raw per
image and eight MiB raw per input/request history; the versioned inbox payload is
bounded to sixteen MiB and Anthropic v4's serialized request to thirty-two MiB.
These are local admission choices, not remote capability measurements. Existing
signed event/blob limits may be lower and are not widened. Existing native model
budget admission, request binding, tool approval, endpoint rules and cancellation
remain on the real runtime path.

PNG, JPEG, GIF and WebP are recognized by explicit filename, MIME and bounded
header/container checks. This is **not full codec validation, a malware scan,
dimension acceptance, an animation guarantee, or protection against instructions
contained in images**. Unsupported/invalid inputs refuse locally; a remote model
can still reject a locally admitted image. SVG, PDF, arbitrary binary, URLs and
provider file references are not introduced as image inputs.

Missing evidence yields `payload-missing`; a retention-pruned payload yields
`payload-pruned`; readable altered bytes or conflicting signed image metadata
yield `evidence-inconsistent`, with no guessed bytes. Existing unreadable or
corrupt encrypted blobs retain the payload reader's `payload-missing`/unreadable
classification, not a forged successful reconstruction. Cryptographic row/chain
verification remains complementary to byte reconstruction. A local internally
consistent fixture is not externally anchored trust.

## Regressions authored, not executed

`tests/nativeSignedImageInput.test.ts` covers actual runtime/adapter HTTP-boundary
capture, exact decoded image bytes, tool identity plus keyed error replay,
historical versions, MIME/digest/role/URL/size/base64 hostility, native budget
refusal and persisted missing/pruned/tampered image fixtures.

`tests/nativeSignedImagePublicInput.test.ts` covers CLI option parsing, local file
admission, durable inbox replay, post-commit substitution refusal, veto,
cancellation, SDK exports and the real native composed-turn path.

`tests/fixtures/nativeSignedImageCold.ts` is authored to run in a fresh process
after writer closure, receiving **only workspace and session identity**. It uses
the default reconstruction registry. Captured outbound bytes are comparison
oracles in the parent, never child reconstruction inputs. No fixture process
was started. The one-field `ToolSchema.parameters` correction in the prior
unexecuted DeepSeek integration suite is included without changing its scenarios.

## Remaining implementation and gates

The next named implementation gap is the ACP public image path:
`src/acp/acpAgentServer.ts::flattenPrompt` currently drops image/audio blocks;
`session/prompt` passes only text to the native session. The existing ACP
image capability remains false. `src/sdk/nativeAgentClient.ts` still sends only
text blocks over ACP. Wire discovery, explicit unsupported-input refusal and
signed-image forwarding there, plus corresponding client/Python/public-surface
breadth, remain open. No queue rescan was performed to identify this concrete
call path. Broader native providers/modalities and task09
`FULL_GOAL_COVERAGE.md` remain open beyond this slice.

No tests, checks, imports, builds, acceptance, commits, live provider calls,
credential operations, production signing, publishing or deployment were run.
All inherited refusals and seven Done gates remain. Source, package, platform,
real-provider, independent security, human usability, comparator and release
qualification are still outstanding; no superiority claim is made.
