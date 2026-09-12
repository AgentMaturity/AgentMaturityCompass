# Native OpenAI Responses signed-image input

Source authoring: **2026-09-10**, task `native-responses-image-input-19`,
AMC-1514 / AMC-1505. **UNCOMMITTED / UNEXECUTED / UNQUALIFIED.** This is an
implementation contract and usage guide, not a test receipt or release claim.

## Dated wire decision

Official primary references actually read on September 10, 2026:

- [OpenAI Images and vision guide](https://developers.openai.com/api/docs/guides/images-vision).
- [OpenAI's generated OpenAPI ResponseInputImageParam schema](https://github.com/openai/openai-python/blob/main/src/openai/types/responses/response_input_image_param.py).

The generated schema specifies `type: input_image`, `detail`, and an optional
`image_url` accepting a data URL. It separately permits file IDs; AMC does not
use that branch. The guide places `input_image` and `input_text` entries in a
user message's `content` array. AMC fixes `detail` to `auto` in this version.
Neither reference is a pinned installed SDK dependency; their retrieval date
is the evidence boundary. The full API HTML exceeded the web reader's size limit;
it is not claimed as a successfully read full protocol schema.

```json
{
  "model": "<operator-selected model>",
  "stream": true,
  "store": false,
  "max_output_tokens": 512,
  "input": [{
    "role": "user",
    "content": [
      { "type": "input_text", "text": "Describe this image." },
      { "type": "input_image", "image_url": "data:image/png;base64,<original signed bytes>", "detail": "auto" }
    ]
  }]
}
```

Placeholders above are not image data. This authored path makes no provider call,
uploads no file and obtains no remote model capability evidence. `modelSupport`
remains `not-probed`. A model or endpoint can reject a locally admitted request.

## Selected version and historical preservation

The actual native `openai-responses` adapter now selects **encoder version 3**.
`openaiResponsesEncoderV3` is exported through the existing LLM public barrel and
registered in `BUILT_IN_REQUEST_ENCODERS`, which the actual live preparation and
default cold reconstruction paths both use. CLI `routeFor` and ACP `acpRouteFor`
already select this adapter; no compatibility-origin inference or alternate route
is added. The CLI's existing capability gate still precedes local image-file reads.

Versions 1 and 2 remain registered. Their existing wire algorithms and image
refusal are preserved by a separate historical text-only capability contract.
Version 3 delegates parameter, tool-schema, tool-choice, function-call correlation
and result-envelope validation to that historical encoder after validating the
complete input. Non-image requests retain v2's bytes. For image-bearing user
messages, v3 emits ordered content arrays. Provider-safe function names still bind
only to the currently offered tool set; historical names do not grant authority.
Raw function argument strings and keyed `amc.tool-result` success/error envelopes
retain their meaning. The output decoder is unchanged: text/function outputs only,
not opaque reasoning, generated images, hosted tools or complete Responses parity.

## Signed source and immutable input

This route reuses task17's `amc-image-input@1` inbox and original binary
`user/attachment` payloads, not a second image pipeline. The actual shared
`requestSources` resolver requires consistent signed MIME, byte length, surface
role/digest and payload digest. V3 additionally requires original bytes, matching
SHA-256 and supported media type before constructing a data URL. No UTF-8 binary
conversion, inferred MIME, resizing, recompression, URL fetch, filesystem path or
remote file ID becomes a reconstruction source.

The original queued image is snapshotted before asynchronous work and projected
only after the existing native pre-step admission. Cancellation, policy pins,
tool approval and signed model-budget admission remain on the unchanged runtime
path. Image support is neither a permission grant nor proof that an image is safe.

## Public interfaces

For a build containing these unqualified source changes, the existing CLI accepts:

```sh
amc agent-loop run --provider openai-responses --model '<operator-selected model>' \
  --image ./diagram.png 'Describe the original image.'
```

The CLI still requires a text prompt; image-only CLI invocation is not introduced.
The in-process `AgentSession.prompt(text, images)` and both ACP subprocess clients
retain task17/task18's APIs. ACP image-only prompts do not invent empty provider
text. Existing workspace, credential-reference, signed policy and approval setup
remain prerequisites; the examples are documentation and were not executed.

```ts
import { readFileSync } from "node:fs";
import { AMCNativeClient } from "agent-maturity-compass/sdk/native";

const model = process.env.AMC_IMAGE_MODEL;
if (!model) throw new Error("Choose an accessible image-input model explicitly.");
const client = await AMCNativeClient.start({
  workspace: ".", provider: "openai-responses", model, credential: "OPENAI_API_KEY"
});
try {
  const session = await client.newSession();
  const result = await session.prompt("Describe this image.", {
    images: [{ filename: "diagram.png", mediaType: "image/png", bytes: readFileSync("diagram.png") }]
  }).result;
  console.log(result.text, result.verification); // Completion remains not-verified.
} finally {
  await client.close();
}
```

```python
import os
from pathlib import Path
from amc_sdk import AmcAgent, NativeImageInput

with AmcAgent(workspace=".", provider="openai-responses", model=os.environ["AMC_IMAGE_MODEL"],
              credential="OPENAI_API_KEY") as agent:
    result = agent.new_session().prompt("Describe this image.", images=[
        NativeImageInput(Path("diagram.png").read_bytes(), "image/png")
    ])
    print(result.text, result.verification)  # Not an independent verification receipt.
```

ACP discovery requires exactly `openai-responses@3` plus the matching protocol and
image-input capability, or the existing `anthropic-messages@4` contract. Unknown,
future or historical encoder versions do not inherit image capability. DeepSeek
and OpenAI Chat native image support remain disabled; no analogy enables them.

The durable public input remains **text/resource references followed by ordered
images**, or images alone on the image-capable session APIs. Arbitrary ACP
text-after-image interleaving still refuses without partial submission. No new
versioned ordered inbox contract is introduced by the v3 provider encoder.

## Bounds and reconstruction outcomes

Native admission remains eight images, 4 MiB raw per image and 8 MiB total raw
image bytes. V3 applies the count/aggregate bound to the full projected image
history and bounds its image-bearing serialized body to 32 MiB. Existing lower
signed event/blob limits are not widened. PNG/JPEG/GIF/WebP checks are bounded
header/container checks, not full codec, animation, dimension, malware or
prompt-injection validation. Provider acceptance can be stricter.

ACP retains its 262,144-byte ingress-line limit, base64/JSON overhead included,
and task18's smaller replay/frame/aggregate constraints. Native local images may
therefore exceed the subprocess interface's allowance. No guard was widened.

Default cold derivation obtains only workspace/session identity after writer
closure, then reads signed sources and the recorded encoder identity. Missing
payloads remain `payload-missing`, pruned payloads `payload-pruned`, and readable
altered image bytes or conflicting metadata `evidence-inconsistent`. No guessed
bytes or successful-looking placeholders replace them. Row/chain authentication
is complementary to byte derivation, not implied by it. Signed ACP history is
preflighted before replay; missing/inconsistent evidence refuses load without
partial output. Local internal consistency is not externally anchored trust.

## Authored regressions and open qualification

`tests/nativeResponsesImageInput.test.ts` targets actual runtime HTTP capture,
original bytes, exact default-registry fresh-process reconstruction, tool/error
replay, historical identity, capability and hostile payload/metadata cases.
`tests/nativeResponsesAcpImageInput.test.ts` targets actual public admission,
image-only and ordered images, signed inbox, policy/preStep/cancellation/budget,
release/load and no-partial-replay behavior. The existing TS and canonical Python
real subprocess suites now include Responses alongside Anthropic on SQLite/JSONL.
The separate hostile ACP peer cases remain intact. Existing capability negatives
were adjusted only where the selected image support changed their premise.

Only HTTP is scripted in the actual native runtime fixture. The fresh cold reader
receives no expected bytes or injected registry; the parent's HTTP capture is the
comparison oracle. All tests and fixtures are **AUTHORED, NOT EXECUTED**. No source
import/check/build/acceptance, installed wheel/package, platform, provider, human,
security, comparator or release qualification is implied. Broader task09
`FULL_GOAL_COVERAGE.md`, other protocols/modalities/backends/platforms/older gaps
and all seven Done/license/human/security/release gates remain open.
