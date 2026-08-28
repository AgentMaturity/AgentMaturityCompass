import type { BridgeProvider } from "./bridgeConfigSchema.js";

export type BridgeRequestKind =
  | "chat_completions"
  | "responses"
  | "batches"
  | "embeddings"
  | "images"
  | "audio"
  | "messages"
  | "generate_content";

export interface BridgeRouteMatch {
  provider: BridgeProvider;
  requestKind: BridgeRequestKind;
  incomingPath: string;
  gatewayPath: string;
  modelFromPath: string | null;
}

function stripBridgePrefix(pathname: string, provider: BridgeProvider): string {
  const prefix = `/bridge/${provider}`;
  if (pathname === prefix) {
    return "/";
  }
  if (!pathname.startsWith(`${prefix}/`)) {
    return pathname;
  }
  return pathname.slice(prefix.length);
}

/**
 * Every model-proxy path this router serves, as a concrete example of each.
 *
 * The matcher below is a sequence of regexes, which cannot be enumerated — so a
 * caller asking "what does the Bridge proxy?" had nowhere to look and answered
 * by writing its own list. `validatePythonSdkCoverage` did exactly that, twice
 * in one file, and then compared the two copies: it reported 100% coverage
 * because it was comparing a list against itself, and published that number.
 *
 * These are SAMPLES, not patterns: each must be matched by `matchBridgeRoute`,
 * which `tests/bridgeModelRouter.test.ts` asserts. That keeps the list honest
 * about removals and renames. A regex added below without a sample added here is
 * the residual gap, and a far smaller one than a list that agreed with itself.
 */
export const BRIDGE_MODEL_ROUTES: readonly string[] = [
  "/bridge/openai/v1/chat/completions",
  "/bridge/openai/v1/responses",
  "/bridge/openai/v1/batches",
  "/bridge/openai/v1/embeddings",
  "/bridge/openai/v1/images/generations",
  "/bridge/openai/v1/audio/speech",
  "/bridge/anthropic/v1/messages",
  "/bridge/gemini/v1beta/models/gemini-1.5-pro:generateContent",
  "/bridge/openrouter/v1/chat/completions",
  "/bridge/xai/v1/chat/completions",
  "/bridge/local/v1/chat/completions"
];

export function matchBridgeRoute(pathname: string): BridgeRouteMatch | null {
  const openaiChat = /^\/bridge\/openai\/v1\/chat\/completions$/;
  if (openaiChat.test(pathname)) {
    return {
      provider: "openai",
      requestKind: "chat_completions",
      incomingPath: pathname,
      gatewayPath: `/openai${stripBridgePrefix(pathname, "openai")}`,
      modelFromPath: null
    };
  }

  const openaiResponses = /^\/bridge\/openai\/v1\/responses$/;
  if (openaiResponses.test(pathname)) {
    return {
      provider: "openai",
      requestKind: "responses",
      incomingPath: pathname,
      gatewayPath: `/openai${stripBridgePrefix(pathname, "openai")}`,
      modelFromPath: null
    };
  }

  const openaiBatches = /^\/bridge\/openai\/v1\/batches$/;
  if (openaiBatches.test(pathname)) {
    return {
      provider: "openai",
      requestKind: "batches",
      incomingPath: pathname,
      gatewayPath: `/openai${stripBridgePrefix(pathname, "openai")}`,
      modelFromPath: null
    };
  }

  const openaiEmbeddings = /^\/bridge\/openai\/v1\/embeddings$/;
  if (openaiEmbeddings.test(pathname)) {
    return {
      provider: "openai",
      requestKind: "embeddings",
      incomingPath: pathname,
      gatewayPath: `/openai${stripBridgePrefix(pathname, "openai")}`,
      modelFromPath: null
    };
  }

  const openaiImageGenerations = /^\/bridge\/openai\/v1\/images\/generations$/;
  if (openaiImageGenerations.test(pathname)) {
    return {
      provider: "openai",
      requestKind: "images",
      incomingPath: pathname,
      gatewayPath: `/openai${stripBridgePrefix(pathname, "openai")}`,
      modelFromPath: null
    };
  }

  const openaiAudioSpeech = /^\/bridge\/openai\/v1\/audio\/speech$/;
  if (openaiAudioSpeech.test(pathname)) {
    return {
      provider: "openai",
      requestKind: "audio",
      incomingPath: pathname,
      gatewayPath: `/openai${stripBridgePrefix(pathname, "openai")}`,
      modelFromPath: null
    };
  }

  const anthropicMessages = /^\/bridge\/anthropic\/v1\/messages$/;
  if (anthropicMessages.test(pathname)) {
    return {
      provider: "anthropic",
      requestKind: "messages",
      incomingPath: pathname,
      gatewayPath: `/anthropic${stripBridgePrefix(pathname, "anthropic")}`,
      modelFromPath: null
    };
  }

  const geminiContent = /^\/bridge\/gemini\/v1beta\/models\/([^/:]+):generateContent$/;
  const geminiMatch = geminiContent.exec(pathname);
  if (geminiMatch) {
    return {
      provider: "gemini",
      requestKind: "generate_content",
      incomingPath: pathname,
      gatewayPath: `/gemini${stripBridgePrefix(pathname, "gemini")}`,
      modelFromPath: decodeURIComponent(geminiMatch[1] ?? "")
    };
  }

  const openrouterChat = /^\/bridge\/openrouter\/v1\/chat\/completions$/;
  if (openrouterChat.test(pathname)) {
    return {
      provider: "openrouter",
      requestKind: "chat_completions",
      incomingPath: pathname,
      gatewayPath: `/openrouter${stripBridgePrefix(pathname, "openrouter")}`,
      modelFromPath: null
    };
  }

  const xaiChat = /^\/bridge\/xai\/v1\/chat\/completions$/;
  if (xaiChat.test(pathname)) {
    return {
      provider: "xai",
      requestKind: "chat_completions",
      incomingPath: pathname,
      gatewayPath: `/grok${stripBridgePrefix(pathname, "xai")}`,
      modelFromPath: null
    };
  }

  const localChat = /^\/bridge\/local\/v1\/chat\/completions$/;
  if (localChat.test(pathname)) {
    return {
      provider: "local",
      requestKind: "chat_completions",
      incomingPath: pathname,
      gatewayPath: `/local${stripBridgePrefix(pathname, "local")}`,
      modelFromPath: null
    };
  }

  return null;
}

export function providerDisplayName(provider: BridgeProvider): string {
  switch (provider) {
    case "openai":
      return "OpenAI";
    case "anthropic":
      return "Anthropic";
    case "gemini":
      return "Google Gemini";
    case "openrouter":
      return "OpenRouter";
    case "xai":
      return "xAI Grok";
    case "local":
      return "Local OpenAI-compatible";
  }
}
