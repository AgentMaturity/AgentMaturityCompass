// The package root re-exports this SDK barrel. Keep the native LLM seam usable
// without reaching into a package-private dist path or a foreign harness.
export * as llm from "../llm/index.js";
export {
  AMCClient,
  createAMCClient,
  createAMCClientFromEnv,
  type AMCClientConfig,
  type AMCBridgeResponse,
  type AMCPayload,
  type OpenAIChatPayload,
  type OpenAIResponsesPayload,
  type OpenAIEmbeddingsPayload,
  type OpenAIImagesPayload,
  type OpenAIAudioSpeechPayload,
  type AnthropicMessagesPayload,
  type GeminiGenerateContentPayload,
  type OpenRouterChatPayload,
  type XAIChatPayload,
  type LocalChatPayload
} from "./amcClient.js";
export { AMCAgent, createAMCAgent } from "./amcAgent.js";
export { createA4Client, type A4Client, type A4Session, type A4ApiResponse, type A4MutationResult } from "./a4Client.js";
export {
  AMCNativeClient, AMCNativeSession, AMCNativeTurn, AMCNativeProtocolError, AMCNativeRefusedError,
  type AMCNativeClientOptions, type AMCNativeRunResult, type AMCNativeUpdate, type AMCNativeReceipt
} from "./nativeAgentClient.js";
export { NATIVE_ORDERED_INPUT_FORMAT, snapshotNativeInputParts, type NativeInputPart,
  type OrderedAgentSession } from "./nativeAgentClient.js";
export { NATIVE_AUDIO_INPUT_FORMAT, snapshotNativeAudioParts, type NativeAudioInput, type NativeAudioPart, type NativeAudioMediaType,
  loadNativeAudioManifest, NATIVE_AUDIO_FILE_MANIFEST_FORMAT } from "./nativeAgentClient.js";
export type { NativeValidationResult, NativeValidationCheckResult, NativeValidationStatus } from "../agent/nativeValidation.js";
export {
  discoverNativeMcpCatalog, mountNativeMcpServer, nativeMcpToolName,
  type NativeMcpServer, type NativeMcpCatalog, type NativeMcpCatalogTool,
  type NativeMcpGrant, type MountedNativeMcpServer
} from "../mcp/nativeMcpClient.js";
export { runSpan, type AMCSpanRecord } from "./amcSpan.js";
export { sendBridgeTelemetry, type AMCTelemetryEvent } from "./amcTelemetry.js";
export { hashSdkValue, redactSdkText } from "./amcEvidence.js";
export { assertNoSelfScoring, requireBridgeUrl } from "./amcGuards.js";
export { AMCSDKError, type AMCSDKErrorCode } from "./errors.js";
export {
  createAMCMobileFetchBridge,
  createReactNativeAMCFetch,
  type AMCMobileFetchLike,
  type AMCMobileFetchOptions,
  type AMCMobileProvider
} from "./mobileFetch.js";
export { instrumentOpenAIClient, createOpenAIFetchTransport } from "./integrations/openai.js";
export { instrumentAnthropicClient } from "./integrations/anthropic.js";
export { instrumentGeminiClient } from "./integrations/gemini.js";
export { createVercelAIFetchBridge } from "./integrations/vercelAiSdk.js";
export { createLangChainJsBridge } from "./integrations/langchainJs.js";
export { createLangGraphJsBridge } from "./integrations/langgraphJs.js";
export { instrumentOpenAIAgentsSdk } from "./integrations/openaiAgentsSdk.js";
export {
  deprecatedBridgeRoute,
  deprecatedBridgeRoutes,
  sdkVersionPolicy,
  type DeprecatedBridgeRoute,
  type SdkVersionPolicy
} from "./versioning.js";

// ── Framework adapters ────────────────────────────────────────────
export { FrameworkAdapter, LangChainAdapter, CrewAIAdapter, OpenAIAgentsAdapter, createAdapter } from "./frameworkAdapters.js";
export type {
  FrameworkType, AdapterConfig, AdapterEvent, AdapterSession,
  AdapterCallbacks,
} from "./frameworkAdapters.js";
