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
export { runSpan, type AMCSpanRecord } from "./amcSpan.js";
export { sendBridgeTelemetry, type AMCTelemetryEvent } from "./amcTelemetry.js";
export { hashSdkValue, redactSdkText } from "./amcEvidence.js";
export { assertNoSelfScoring, requireBridgeUrl } from "./amcGuards.js";
export { AMCSDKError, type AMCSDKErrorCode } from "./errors.js";
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
