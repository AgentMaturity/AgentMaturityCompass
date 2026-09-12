# Native signed audio input

Source authoring September 10, 2026: task native-signed-audio-input-23,
AMC-1514 / AMC-1505. **AUTHORED / UNCOMMITTED / UNEXECUTED / UNQUALIFIED.**
This is the authored source contract, not an installed-package, platform, codec,
security or live-provider acceptance result. Do not execute these examples or
regression sources until the current ALL-full-goal implementation boundary permits
validation. No live provider or production credential was used in this task.

**Same-task closure note, September 10, 2026:** the initial guide delivery was
reconciled against CoS's exact context-mismatch result and subsequent successful
patch; this file was not recreated. Late acknowledged source adds data-only
array/index/nested-image admission and explicit signed turn-ending reporting.
An idle driver is not itself successful completion; the native session retires
failed-prompt text and exposes the recorded ending to ACP. Matching regressions
for failure/max-token outcomes, text isolation and original sample-byte tampering
are authored, not run. See the task-local AUTHORING_RECEIPT.md and
DOCUMENTATION_RECONCILIATION.md. Local handoff closure is not qualification or
proof of the still-pending final Linear delivery.

## Explicit route and immutable versions

`gemini-audio` selects `gemini-generate-content@2`. Existing `gemini` remains
`gemini-generate-content@1` and refuses audio. Other routes also refuse this audio
contract: no fallback to transcripts, image descriptions, Chat compatibility,
file uploads or another provider. The new ordered input is `amc-audio-input@1`,
with at least one audio part and optional original text and PNG/JPEG/WebP images.
Historical `amc-image-input@1` and `amc-image-input@2` codecs are unchanged.
Both Gemini1 and Gemini2 remain shipped in the default cold registry. Gemini2
delegates non-audio requests to the historical Gemini1 encoder; headers still name
the actual selected version. Old supported wire bytes are not re-versioned.

## Bounded original media, not a codec verdict

Audio is original **audio/wav**, exact RIFF/WAVE `fmt ` PCM16 header immediately
followed by `data`: mono/stereo, 8–192 kHz, consistent byte rate, sample alignment,
RIFF/data lengths and no trailing bytes. Original samples are not decoded or
rewritten. RF64, compressed/float WAV, optional metadata chunks, MP3, AAC, FLAC,
OGG, raw PCM and alternate MIME aliases refuse in this version. There is no
transcoder or normalization service.

These are bounded header/framing checks, **not complete codec parsing, malware/
security inspection, semantic speech validation or provider qualification**.
Model-specific modality support must be independently established; adapter
selection does not prove that every model accepts this input.

Native limits: eight audio files, eight images, 256 ordered parts, 4 MiB per audio,
8 MiB combined original image/audio bytes. Text and the canonical inbox envelope
have a 16 MiB bound. Gemini2 applies media limits across its complete model-visible
history and an independent 32 MiB request-body bound. No truncation or upload is
performed to fit a limit.

**Lower surface limits remain.** ACP ingress/public-client submission is 256 KiB
per JSON line including metadata/base64. ACP history preflight is 900,000 bytes
per update and 8 MiB aggregate. A valid larger native/CLI input can therefore be
refused by ACP submission or load. Whole history preflight precedes any replay
prefix. Audio did not widen those existing transport/output bounds.

## Signed source and order

Insertion copies caller Buffers and commits immutable canonical base64, original
MIME, length and SHA-256. Adjacent/empty text and every media position remain in
caller order. Plain filenames are bounded, with no paths, URLs or control bytes.
The complete canonical sequence enters the existing signed native inbox.

The audio-bearing API requires ordinary dense data arrays and exact plain part
objects. Array-index accessors and nested image accessors/extra fields refuse
before content is read. Images in this new contract are restricted to the
PNG/JPEG/WebP intersection before inbox insertion; the old image codecs are not
changed. These checks are input-shape admission, not isolation from arbitrary
code already running inside the host process.

An entering preStep decision cannot drop, replace, downgrade or reorder the
original audio claims. Explicit policy veto remains available and records its
loss. The complete claimed sequence must equal its committed inbox before the
first projected content row. Each signed row retains source inbox, input format,
absolute content index and separate image/audio indexes. The existing spine
passes original Buffer bytes to blob-backed content, without a UTF-8 media trip.

Cold request reconstruction checks the original inbox, unique admitted claim,
complete content group, original text/binary/MIME/filename/length/digest/role/order.
Partial removal, replacement and interleaving fail; lawful whole compaction remains
separate. Pruned payloads, unexpectedly missing payloads and inconsistent evidence
are distinct. Byte reconstruction is not ledger authentication: ACP load separately
authenticates the complete committed tail before projecting original content.

CLI/in-process filenames are retained. Standard ACP audio blocks have no filename
field in this contract: the server assigns `acp-audio-N.wav`. Do not claim ACP
retained an arbitrary original path or filename. Original bytes/MIME/relative order
survive its standard wire and acquire signed length/digest/source indexes on intake.

## CLI local manifest

`--audio-input` is exclusive with positional text and `--image`. Put all parts in
the manifest's actual order. Paths are relative to its directory. JSON must be
canonical with sorted object keys and no duplicates; trailing whitespace is allowed.

```json
{"format":"amc-audio-files@1","parts":[{"mimeType":"audio/wav","path":"speech.wav","type":"audio"},{"text":"Describe the original audio.  ","type":"text"}]}
```

For an explicitly configured compatible model, the native command is:

```sh
amc agent-loop run --provider gemini-audio --model YOUR_SUPPORTED_MODEL \
  --credential GEMINI_API_KEY --tools none --max-tokens 512 \
  --audio-input ./input.json --json
```

The credential argument is a reference, not secret material. Existing credential,
policy and budget lifecycles still govern it. The reader requires bounded regular
files, no-follow/nonblock open, bounded reads and unchanged size/stat, closing its
file descriptors. No-follow covers the opened file; parent directories remain
operator-selected, not an asserted sandbox confinement. URLs, provider file IDs,
URI-only content and unsupported siblings refuse the complete input.

## TypeScript, native sessions and ACP

The public SDK exports NativeAudioInput, NativeAudioPart,
NATIVE_AUDIO_INPUT_FORMAT, snapshotNativeAudioParts and loadNativeAudioManifest.
The existing AMCNativeClient accepts `provider: "gemini-audio"`; acquired sessions:

```ts
const original = loadNativeAudioManifest("./input.json");
const turn = session.promptAudioParts(original, { signal });
const result = await turn.result;
// Completion is not verification: retain existing validation/receipt semantics.
```

In-process AgentSession/driver expose promptAudioParts/followupAudioParts through
the same native loop and signed writer. Policy pins, preStep, budget admission,
cancellation, tool authority and lower transport/history controls are preserved.
The public client requires `promptCapabilities.audio: true` plus this exact value
inside `agentCapabilities._meta["dev.agentmaturity.amc"]`:

```json
{"audioInput":{"format":"amc-audio-input@1","encoderId":"gemini-generate-content","encoderVersion":2,"mimeTypes":["audio/wav"]}}
```

Images additionally require their capability. ACP uses standard
`{type:"audio",mimeType:"audio/wav",data:"BASE64"}` content and namespaced
inputFormat. Unsupported annotations, URI references, resources, documents, video
and extra fields are not silently discarded. The client accepts original audio
updates only as negotiated user history in its owned load, never generated or
unsolicited audio content.

Native prompt results also carry the actual signed turn ending, separately from
driver status. A driver can become idle after recording an error; that no longer
turns the error into `ok: true`. Failed-prompt text is retired from the result
cursor, so a subsequent successful prompt does not receive it as fresh output.
ACP uses the native ending when present, preserving max-token/max-step and
cancellation outcomes. Its existing lossy governance-block mapping keeps the
actual ending in namespaced metadata; external legacy factories keep their old
status fallback. No signed row, policy decision or historical request byte is
rewritten by this reporting correction.

## Canonical Python

Use canonical sdk/python/amc_sdk, not a replacement client:

```python
from pathlib import Path
from amc_sdk import NativeAudioInput

original = NativeAudioInput(Path("speech.wav").read_bytes(), "audio/wav")
turn = session.start_prompt_audio_parts([original, "", "Describe the original."])
result = turn.result()
```

prompt_audio_parts is the blocking counterpart. NativeAudioInput copies bytes,
bytearray or memoryview; NativeAudioPart also admits strings and NativeImageInput.
Exact negotiation, no conversion, lower limits and existing serial/cancel/release/
resume semantics apply. Installed availability requires separate package qualification.

## Actual GenerateContent and historical function authority

Gemini2 uses `v1beta/models/{model}:streamGenerateContent?alt=sse`. Each original
audio part becomes `inlineData:{mimeType:"audio/wav",data:originalBase64}` at its
original Content.parts position. This is not Interactions, Vertex/Enterprise,
Chat compatibility or an external File/upload workflow.

The original strict decoder/EOF/body-cancellation path is shared. Raw Part JSON,
thoughtSignature, response identity, part order and exact argument substrings stay
intact. Original optional provider call IDs remain distinct from minted local join
keys. Results join the exact prior call with explicit error/output semantics and
ID-less ordering. Historical Gemini1 calls remain bound to the original version1
offered schema when later audio uses version2. Replay never reauthorizes old tools.

Audio usage adds reported AUDIO only in prompt/cache details. Generated audio,
hosted-tool usage, video and other unsupported output contracts refuse. Absent
cache/reasoning counters are not invented measured zeroes. Usage is not a cost,
billing, external-cache or model-capability receipt.

## Regression and release boundary

Authored but never imported/executed: tests/nativeSignedAudioInput.test.ts,
nativeSignedAudioRuntime.test.ts, nativeSignedAudioPublic.test.ts,
nativeSignedAudioColdHostile.test.ts; fixtures/nativeSignedAudio.ts,
nativeSignedAudioCli.ts, nativeSignedAudioCold.ts; canonical Python
sdk/python/tests/test_signed_audio_input.py.

These author actual signed runtime/HTTP/registered CLI/TS/Python/ACP, independent
default SQLite/JSONL cold reconstruction, hostile original byte/MIME/order/source,
preStep/policy/budget/cancel, original function authority and lower frame/history
scenarios. Disposable fixture signing, mutation, processes and sockets exist only
in source; none ran here. No passing count, clean-clone/provider/platform receipt,
ALL-full-goal completion or release claim exists.

Broader video/document/output/audio-format/cache/backend/platform/older task09
FULL_GOAL_COVERAGE residuals remain open, along with all seven Done/license/human/
security/platform/release gates. Evidence: AMC_OS/RESEARCH/2026-09-10-native-signed-audio-input/.

## Dated official references

Read September10,2026: https://ai.google.dev/api/generate-content — actual
Content/Part/Blob and FunctionCall/FunctionResponse/usage schema. Parts are ordered;
Blob carries source MIME plus raw base64 media bytes.

Read September10,2026: https://ai.google.dev/gemini-api/docs/audio — audio/wav MIME
list; page reports last updated September2,2026UTC. Its current examples use
Interactions: this implementation does not transfer those examples' duration,
model or wire assumptions into GenerateContent qualification.

Read September10,2026: https://agentclientprotocol.com/protocol/v1/content —
standard Audio Content carries type, mimeType and base64 data and requires the
audio prompt capability. AMC's versioned extension is a stricter local contract,
not a newly invented standard ACP field or a general ACP conformance claim.
