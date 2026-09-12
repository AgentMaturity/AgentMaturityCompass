# Native DeepSeek wire integration — source authored, unqualified

**Source authored, UNQUALIFIED and UNCOMMITTED as of September 10, 2026.** The
first-party wire modules are connected to the native runtime, default request
registry and named public source entry points. That source integration is not a
successful installed-package run or live-provider result. It is a bounded
DeepSeek Chat contract, not an OpenAI-compatible origin counted as another
provider, a model catalog, or a DSH/pi runtime dependency.

`src/llm/request/deepseekChatEncoder.ts` encodes existing canonical request parts.
`src/llm/providers/deepseekAdapter.ts` translates HTTP/SSE into AMC stream chunks.
`deepseekContract.ts` validates explicit options and records the bounded dialect;
`deepseekUsage.ts` maps DeepSeek's reported token/cache partition.

## Implemented source contract

The encoder emits explicit thinking mode/effort, an output-token budget, stream
mode and usage request. It retains full recorded assistant reasoning across tool
subturns and subsequent user turns. Historical calls retain their exact IDs and
raw JSON arguments, deterministic AMC wire aliases, and keyed success/error text
envelopes. Removed historical tools do not become newly offered tool authority.

Only text, textual thinking and function history are accepted. Reasoning replay
requires nonempty explicitly offered functions: the documented tools-free API
ignores prior reasoning, so this implementation refuses that replay rather than
claiming the model consumed it. In enabled thinking mode with tools, assistant
history without recorded reasoning is refused rather than filled with invented
text. Explicitly recorded empty reasoning is preserved. Mode-switch/history
compatibility outside that contract remains unqualified.

Temperature/top-p options ignored in thinking mode are refused; deprecated
presence/frequency penalties are refused in every mode. Effort aliases the vendor
remaps, unknown params, unsupported modalities, and lossy JSON are refused. No SDK
`extra_body`, media, prefix-completion, remote conversation or hosted-tool option
is silently accepted. No model name or context-limit catalog is hardcoded.

The decoder preserves reasoning/text/tool fragments, stable response and tool
identities, parallel indexed calls, strict UTF-8 and fragmented CRLF framing.
Reported final usage is emitted when received, so a later dropped sentinel can
remain a failed request with known counts. Tool completion waits for `[DONE]`,
valid JSON-object arguments and the required usage. Filtering/resource failures
and truncated tool output are errors, not executable tools or successful answers.
Missing usage remains missing; reported zero remains zero. Cache hit plus miss
must equal prompt tokens; reasoning is already inside output tokens. No cache
write count is fabricated.

Cancellation relies on the existing transport's AbortSignal and normal iterator
closure. The envelope does not fetch, resolve keys, write evidence, grant policy,
change an endpoint allowlist, retry, or execute tools. Origin validation is not
an SSRF-enforcement claim; signed transport/endpoint controls are still required.

## Native source integration

The adapter carries `DEEPSEEK_CAPABILITIES`, with protocol
`deepseek-chat-completions` and conditional thinking representation
`full-text-replay-with-tools`. Capability snapshots retain that condition.
`assertRequestCapabilities` refuses signed thinking replay without offered tools
before a request header or transport dispatch, rather than silently omitting
reasoning or inventing a tool grant.

`deepseek-chat@1` is registered in `builtInEncoders.ts`, hence available to both
preparation and the default cold reconstruction registry. Its exact identity is
also included in `providerToolNames.ts::usesProviderToolNames`. The runtime binds
provider aliases against the offered schema names captured at preparation, not
caller-owned schemas reread during dispatch. Historical tool names do not add
authority to the current offer. Existing encoder versions are retained unchanged.

The native `agent-loop run`, `agent-loop chat`, first-use guide,
`native-schedule run-due` / `watch`, and ACP source entry points recognize
`deepseek`. Routes default to origin `https://api.deepseek.com` and credential
**reference** `DEEPSEEK_API_KEY`; the adapter uses `/chat/completions`. A model
must be explicitly selected. The route helpers never resolve a credential value.
Thinking defaults to `enabled`, with exact effort `high`; explicit choices are
`enabled` / `disabled` and `low` / `high` / `max` when thinking is enabled.
`--thinking` and `--reasoning-effort` on unrelated providers are refused, not
ignored. ACP includes the effective DeepSeek parameters in its composition digest.

Interactive tools-free DeepSeek chat requires `--thinking disabled` from its
first turn. A tools-free one-shot run may generate reasoning, but a later request
cannot replay that signed reasoning without a nonempty explicit tool offer.
Adding synthetic tools or discarding history is not a supported workaround.

The actual package-root SDK barrel and existing `sdk/native` source entry point
export the `llm` namespace, including the adapter, encoder, capabilities, contract
and reconstruction APIs. `AMCNativeClient` validates its DeepSeek options before
child creation and forwards them as separate ACP argv entries. Source exports and
manifest paths do not establish installed-package, Studio or all-surface parity.

## Authored regressions and remaining qualification

All of the following are **AUTHORED UNEXECUTED** fixture definitions, not receipts:

- `tests/deepseekNativeWire.test.ts`: component options, canonical encoding and
  replay, strict fragmented streams, tool identity, unsupported data, usage and
  cancellation; task15 replaced the obsolete unregistered-state assertion with
  guarded positive registration and capability admission assertions.
- `tests/deepseekNativeIntegration.test.ts`: real `LlmRuntime`, adapter and signed
  `SessionService` with only scripted HTTP transport. The full lifecycle retains
  namespaced tool identity and raw argument JSON, keys an error result, retains
  both prior reasoning texts in a later user turn, closes the writer, then derives
  through a fresh read-only store and the default registry. Only workspace and
  session identity are supplied to derivation; transmitted bodies and digests are
  comparison oracles. Negative fixtures cover tools-free replay, removed tools,
  unoffered aliases before executable publication and post-prepare schema mutation.
- `tests/deepseekPublicSurface.test.ts`: actual source barrels, registered
  CLI/ACP/schedule option parsing, credential-reference defaults, route helpers,
  first-use guidance, ACP startup/refusal, CLI refusal and real SDK argv/handshake
  handling against a scripted child-process edge. Positive parser fixtures do not
  execute a scheduled task. No core runtime, encoder, registry or policy is mocked.

No tests, imports, typechecks, builds, acceptance or live provider calls were run
for this authoring work. Package/platform behavior, live model access and wire
behavior, endpoint-policy and budget qualification, independent review, human
usefulness, comparator outcomes and release gates remain unqualified. Verification
calls authored inside a fixture have not themselves been executed. Final checks
remain deferred until all remaining implementation is complete, not merely this
DeepSeek slice. Signed image input and its attachment chain, other major/local
native protocols and richer modalities remain open full-goal requirements.

## Dated official contract

Retrieved September 10, 2026:
https://api-docs.deepseek.com/guides/thinking_mode/ and
https://api-docs.deepseek.com/api/create-chat-completion/.

The thinking guide requires full tools-request reasoning replay, while the
assistant `reasoning_content` field description still describes beta prefix
completion. This implementation follows the explicit thinking/tool guide; no
live request resolved that discrepancy. The Chat reference puts usage on the
final finish chunk, not a separate empty-choice usage frame. These are dated wire
references, not a claim of remote model identity, quality or all-provider support.
