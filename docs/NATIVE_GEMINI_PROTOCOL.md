# Native Gemini GenerateContent

**Authoring status, 2026-09-10:** source and executable regression specifications
are authored, uncommitted, unexecuted and unqualified. No test, source import,
fixture, build, installed package, external model, platform or acceptance run was
performed for task22. This is a bounded AMC-1514 slice, not full-goal completion.

## Route and wire identity

The native provider selector is `gemini`. Both the actual `agent-loop run` CLI and
registered ACP server select `gemini-generate-content@1`, default origin
`https://generativelanguage.googleapis.com`, credential reference `GEMINI_API_KEY`.
The selected model is an explicit model resource, not a URL. No model is probed or
automatically assumed capable. `--max-tokens` maps to
`generationConfig.maxOutputTokens`; DeepSeek-specific flags remain DeepSeek-only.

This is REST `v1beta/models/{model}:streamGenerateContent?alt=sse`. It is not a
Chat-compatible endpoint, Vertex API, Google SDK dependency, or Interactions API.
The body contains native `contents`, optional `systemInstruction`, generation
configuration and native function declarations. Credentials remain outside body
bytes and signed request payloads. The API-key header cannot be overridden by
extra headers and redirects are explicitly refused for this route. Abandoned
responses are cancelled/disposed, including a decoder rejection before body use.

The existing TypeScript `AMCNativeClient` and canonical Python `AmcAgent` already
forward explicit provider/model selection to the registered ACP action; they now
reach this route without a replacement client or custom registry. Their existing
Gemini instrumentation/bridge exports remain present and distinct from this native
implementation. The default built-in encoder registry includes the exact new
identity; cold reconstruction requires only the workspace and session identity.

## Original input and replay

Native text and original PNG/JPEG/WebP input are supported at the protocol layer.
Images use native `inlineData` with the original MIME and base64 of the original
signed binary. There is no image URI fetch, transcode, filename-as-proof, digest
substitution or normalization. The shared image codec's GIF support does not
imply Gemini support: Gemini ACP refuses GIF before inbox admission. Other native
entry points also fail before a model request header/dispatch when this encoder
cannot represent their input; their already recorded input is not erased.

`amc-image-input@1` bytes and old legacy prefix-plus-images behavior are unchanged.
Image-bearing ordered `amc-image-input@2` retains empty/adjacent text and text after
an image. ACP advertises the exact v2 extension only for the exact Gemini1 route
with native ordered input. TypeScript `promptParts` and Python `prompt_parts` /
`start_prompt_parts` preserve that order through their existing immutable snapshot
and serial lifetime. Existing inbox, original-content indices, policy pins,
preStep admission, budget checks and lower ACP frame/history bounds remain.

Every supported Gemini output Part retains raw Part JSON, response identity and
part position in signed metadata. Opaque `thoughtSignature` bytes remain on that
original Part. A signature-only Part uses an empty internal thinking carrier but
replays the original signature-only wire object, never invented text/signatures.
AMC does not cryptographically authenticate Google's opaque signature; AMC's own
row signature authenticates its recorded observation.

Function arguments retain their exact raw JSON substring, including whitespace,
key order and numeric spelling. Duplicate JSON keys, invalid UTF-8/surrogates,
unrepresentable numbers and excessive nesting/size are refused. An optional
provider-issued function-call ID remains exact. When absent, a labelled local key
scoped by original response/part identifies the AMC result; it is never echoed as
an invented provider ID. Function responses use the original wire name and
optional original ID, with `response.output` or `response.error` containing the
literal tool output. A misleading `isError` field inside output cannot override
the signed result outcome. ID-less responses retain original call order.

The live binder accepts only exact function names offered by the immutable
prepared request. Cold history resolves each call to that earlier signed request
and its offered schema; a removed historical function may replay but is not
re-authorized. Missing original headers, changed model selection, payload/schema
digest inconsistencies, wrong names, missing/duplicate/reordered Parts and
unanswered/unknown call keys fail closed. Signed Gemini parts cannot silently move
to Chat/Responses/Anthropic/DeepSeek replay. Deriving matching bytes is not a
substitute for the existing signature-authenticated public load.

## Streaming and usage

The adapter accepts one candidate and bounded, lossless SSE/JSON. Response/model
identity must not change in flight. Unsupported Parts, built-in tool activity,
unknown semantic fields and malformed/duplicate frames are not silently discarded.
No complete executable tool block is emitted before all Parts, final usage and
terminal framing are admitted. Truncation, cancellation, a malformed sibling or
trailing frame cannot turn an observed partial function call into tool authority.
Observed dropped metadata remains in signed failure evidence rather than being
promoted to replayable completed content. Provider safety/block outcomes are
failures, not successful model replies. Response metadata is shape-checked; model
status is provider-reported information, not an AMC capability or qualification.

Reported prompt tokens include cached input. AMC records uncached input as prompt
minus reported cache read, and output as candidate tokens plus separately reported
thought tokens. Reasoning remains an output subset annotation in AMC's accounting,
not an additional second charge. Missing cache/write/reasoning counters remain
unknown. Successful terminal usage requires explicit prompt and candidate counts;
partial/omitted or inconsistent totals fail rather than inventing zeroes. Native
implicit-cache read usage is supported; there is no explicit `cachedContent`
resource lifecycle or cache-write claim in this version.

## Explicit unsupported scope

Audio/video/document inputs, remote files, image/audio output, server-executed
tools/code/search/URL context, citation/grounding/logprob payloads, multiple
candidates, non-text response modalities, structured-output schemas, external
cache resources and arbitrary safety overrides are not supported by this version.
Their presence is refused, not flattened into text or treated as ordinary function
calls. A complete JSON function-call Part is supported; incremental/alternate
function argument protocols do not gain authority through this adapter.

The task09 full-goal matrix still contains broader modalities, provider/cache
surfaces, backends, platforms and older residuals. The next selected authoring
requirement is a signed native audio-input contract and its Gemini public route,
not a live-provider test or a claim that all remaining requirements are complete.
All seven Done, license, human/security/platform/release gates remain open.

## Authored regression sources — not run

`tests/nativeGeminiWire.test.ts` specifies exact native bytes/registry/capability,
raw replay, usage, unsafe parameters, malformed JSON/SSE, unknown modalities,
signature and tool-ID behavior, protected headers and redirects.
`tests/nativeGeminiRuntime.test.ts` specifies actual signed runtime/tool binding,
keyed failures, ordered originals, cancellation, immutable offered authority,
cross-model refusal and fresh-process default reconstruction on SQLite and JSONL.
`tests/nativeGeminiPublic.test.ts` specifies actual ACP, registered CLI, TypeScript,
socket HTTP, policy/budget/preStep, restart/history, cancellation and redirects.
`tests/nativeGeminiColdHostile.test.ts` specifies missing/pruned/rewritten source
and metadata refusal, separately from signature-authenticated public load.
`sdk/python/tests/test_gemini_protocol.py` specifies canonical Python with the same
actual registered CLI/socket boundary, restart, cold derivation, MIME refusal and
cancellation/child/socket cleanup. Only disposable marked fixture roots may be
mutated by these future tests. No fixture source was executed during authoring.

## Dated primary wire references

Retrieved 2026-09-10:

- https://ai.google.dev/api/generate-content — GenerateContent REST, stream, Part,
  FunctionCall/FunctionResponse, schema, safety, model status and usage fields.
- https://ai.google.dev/gemini-api/docs/image-understanding — raster MIME list;
  documentation updated 2026-09-02. Do not confuse newer Interactions examples
  on that guide with the separate GenerateContent wire used here.
- https://ai.google.dev/gemini-api/docs/api-key — API-key header and secure key
  reference handling. No key was provisioned, read from production or used live.
- https://ai.google.dev/gemini-api/docs/caching — implicit versus explicit cache.
