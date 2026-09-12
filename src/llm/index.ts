/**
 * The LLM seam — public surface.
 *
 * P3.1 in full: the stream contract, the fold, the typed failure taxonomy, the
 * reconstructable-request path, the adapter registry with its per-call pin, the
 * runtime that dispatches and records, and native provider wire adapters.
 *
 * The invariant this seam exists to protect: an adapter translates a wire
 * format into {@link StreamChunk}s and stops. It does not assemble, it does not
 * decide what is retryable, it does not choose whether the grammar applies, and
 * it does not read a credential from anywhere but its argument. All of those are
 * decided once, here, so that what gets signed is a function of what the
 * provider actually sent.
 *
 * There is still no retry EXECUTOR. Nothing here sleeps, counts attempts or
 * reopens a turn: turn-boundary retry belongs to the agent loop (P3.2), which is
 * what can durably record a second attempt. What this seam provides is the typed
 * failure, the frozen policy, and the signed row a retry decision reads.
 */

// ── The protocol adapters emit ───────────────────────────────────────────
export {
  type ContentBlock,
  type ContentBlockMap,
  DELTA_BLOCK_KIND,
  type FinishReason,
  type ImageContentBlock,
  type AudioContentBlock,
  type StreamChunk,
  type StreamChunkType,
  type StreamTokenUsage,
  type SuccessfulFinishKind,
  type TextContentBlock,
  type ThinkingContentBlock,
  type ToolCallId,
  type ToolResultContentBlock,
  type ToolUseContentBlock,
  billedInputTokens,
  isContentDelta,
  isFailedFinish,
  toolCallId
} from "./streamChunk.js";

// ── The grammar, enforced unconditionally in the production path ─────────
export {
  type GrammarTermination,
  type LlmStreamProtocolCode,
  LlmStreamProtocolError,
  StreamGrammar,
  isLlmStreamProtocolError
} from "./streamProtocol.js";

// ── The fold from chunks to blocks ───────────────────────────────────────
export {
  type AssembledBlock,
  type BlockDropReason,
  type BlockOutcome,
  BlockAssembler,
  type PartialBlockContent,
  type StreamAssembly,
  type StreamTermination,
  droppedBlocks,
  surfaceBlocks
} from "./blockAssembler.js";

// ── Typed failures: provider facts, never a policy verdict ───────────────
export {
  LLM_FAILURE_CODE,
  type LlmErrorOptions,
  LlmError,
  type LlmFailure,
  type LlmFailureCode,
  httpFailureCode,
  isContextWindowExceededDetail,
  isLlmError,
  isQuotaExceededDetail,
  normalizeLlmFailure,
  parseProviderRetryAfterMs
} from "./llmFailure.js";

// ── Retryability: a policy lookup over a failure code ────────────────────
export {
  type AlwaysRetryPolicyConfig,
  type BackoffConfig,
  DEFAULT_RETRYABLE_CODES,
  MAX_RETRY_DELAY_MS,
  type NormalRetryPolicyConfig,
  type ResolvedAlwaysRetryPolicy,
  type ResolvedNormalRetryPolicy,
  type ResolvedRetryBackoff,
  type ResolvedRetryPolicy,
  RetryPolicyConfigError,
  type RetryPolicyConfig,
  isRetryableFailure,
  resolveRetryPolicy
} from "./retryPolicy.js";

// ── Reconstructable requests: record them, and get them back ────────────
// The write half (prepareRequest) and the read half (deriveRecordedRequest) are
// exported together on purpose: a recording path with no derivation is a digest
// nobody can check, which is the defect this stage exists to remove.
export {
  ANTHROPIC_MESSAGES_ENCODER_ID,
  anthropicMessagesEncoder
} from "./request/anthropicMessagesEncoder.js";
export { OPENAI_CHAT_ENCODER_ID, openaiChatEncoder } from "./request/openaiChatEncoder.js";
export { openaiChatEncoderV2 } from "./request/openaiChatEncoderV2.js";
export { openaiChatEncoderV3 } from "./request/openaiChatEncoderV3.js";
export { openaiChatEncoderV4 } from "./request/openaiChatEncoderV4.js";
export { anthropicMessagesEncoderV3 } from "./request/anthropicMessagesEncoderV3.js";
export { anthropicMessagesEncoderV4 } from "./request/anthropicMessagesEncoderV4.js";
export { openaiResponsesEncoderV2 } from "./request/openaiResponsesEncoderV2.js";
export { openaiResponsesEncoderV3 } from "./request/openaiResponsesEncoderV3.js";
export { deepseekChatEncoder } from "./request/deepseekChatEncoder.js";
export { BUILT_IN_REQUEST_ENCODERS } from "./request/builtInEncoders.js";
export {
  DEFAULT_REQUEST_ENCODERS,
  type DeriveRequestInput,
  type RequestDerivation,
  type RequestDerivationStatus,
  deriveRecordedRequest,
  deriveSessionRequests
} from "./request/deriveRequest.js";
export {
  type PrepareRequestSpec,
  RequestPreparationError,
  prepareRequest
} from "./request/prepareRequest.js";
export { type RequestEncoder, RequestEncoderRegistry } from "./request/requestEncoder.js";
export {
  type EncodableMessage,
  type EncodablePart,
  type EncodableRequest,
  RequestEncodingError,
  type ToolSchema,
  canonicalToolSchemaBytes
} from "./request/requestSpec.js";
export {
  type RequestSourceFailure,
  type RequestSourceFailureKind,
  type RequestSourceInput,
  type RequestSourceResolution,
  resolveRequestSources
} from "./request/requestSources.js";

// ── Transport: the one HTTP chokepoint every adapter dispatches through ──
export {
  type HttpRequest,
  type HttpResponse,
  type HttpTransport,
  bodyFromChunks,
  fetchTransport,
  readBodyText
} from "./adapter/transport.js";
export { type SseEvent, sseEvents } from "./adapter/sse.js";

// ── Adapters: what a provider implementation is allowed to decide ────────
export {
  type AdapterEnvelopeInput,
  type AdapterFailureHint,
  type AdapterFailureInput,
  type LlmAdapter
} from "./adapter/adapterTypes.js";
export {
  AdapterRegistry,
  type LlmRouteConfig,
  LlmRouteError,
  type PinnedRoute,
  type ProviderDescription
} from "./adapter/adapterRegistry.js";
export { classifyResponseFailure } from "./adapter/responseFailure.js";
export {
  CREDENTIAL_PLACEHOLDER,
  containsCredential,
  scrubCredential
} from "./adapter/credentialGuard.js";

// ── The runtime: pin, log, dispatch, record ──────────────────────────────
export {
  type LlmCallSpec,
  LlmDispatchError,
  LlmRuntime,
  type LlmRuntimeInit,
  PreparedCall
} from "./adapter/llmRuntime.js";
export {
  LlmRecordingError,
  type SettledStream,
  StreamRecorder,
  type StreamRecorderInit
} from "./adapter/streamRecorder.js";

// ── Providers ────────────────────────────────────────────────────────────
export { ANTHROPIC_ADAPTER_ID, anthropicAdapter } from "./providers/anthropicAdapter.js";
export { OPENAI_ADAPTER_ID, openaiAdapter } from "./providers/openaiAdapter.js";
export { deepseekAdapter } from "./providers/deepseekAdapter.js";
export { ollamaAdapter, decodeOllama, ollamaEnvelope } from "./providers/ollamaAdapter.js";
export { ollamaChatEncoder } from "./request/ollamaChatEncoder.js";
export { OLLAMA_CHAT_ID, OLLAMA_CHAT_VERSION, OLLAMA_DEFAULT_BASE_URL, OLLAMA_WIRE_CONTRACT, ollamaParams } from "./providers/ollamaContract.js";
export { createOllamaRoute, type OllamaRouteOptions } from "./providers/ollamaRoute.js";
export { ollamaUsage } from "./providers/ollamaUsage.js";
export { OLLAMA_CALL_KEY_PREFIX, readOllamaCallKey, type OllamaCallIdentity } from "./providers/ollamaToolIdentity.js";
export { geminiAdapter, decodeGemini } from "./providers/geminiAdapter.js";
export { GEMINI_CONTENT_ID, GEMINI_CONTENT_VERSION, GEMINI_WIRE_CONTRACT, geminiParams } from "./providers/geminiContract.js";
export { geminiContentEncoder } from "./request/geminiContentEncoder.js";
export { geminiContentEncoderV2 } from "./request/geminiContentEncoderV2.js";
export { geminiAudioAdapter, decodeGeminiAudio, GEMINI_AUDIO_CONTENT_VERSION } from "./providers/geminiAudioAdapter.js";
export { GEMINI_AUDIO_CAPABILITIES } from "./adapter/providerCapabilities.js";
export { DEEPSEEK_CHAT_ID, DEEPSEEK_CHAT_VERSION, DEEPSEEK_WIRE_CONTRACT, deepseekParams } from "./providers/deepseekContract.js";
export { type GatewayAdapterOptions, gatewayAdapter } from "./providers/gatewayAdapter.js";

// `assertNever` is intentionally NOT re-exported: it is the seam's own
// discipline for its closed unions, not a general-purpose utility for the rest
// of the repository to pick up.

export { OPENAI_RESPONSES_ADAPTER_ID, openaiResponsesAdapter } from "./providers/openaiResponsesAdapter.js";
export { OPENAI_RESPONSES_ENCODER_ID, openaiResponsesEncoder } from "./request/openaiResponsesEncoder.js";
export {
  CAPABILITY_NAMES, ANTHROPIC_CAPABILITIES, OPENAI_CHAT_CAPABILITIES, OPENAI_CHAT_TEXT_CAPABILITIES, OPENAI_RESPONSES_CAPABILITIES, OPENAI_RESPONSES_TEXT_CAPABILITIES, DEEPSEEK_CAPABILITIES, GEMINI_CAPABILITIES, OLLAMA_CAPABILITIES, STUB_CAPABILITIES,
  LlmCapabilityError, assertRequestCapabilities, assertRequiredCapabilities, snapshotCapabilities,
  type ProviderCapability, type CapabilitySupport, type ProviderCapabilities
} from "./adapter/providerCapabilities.js";
