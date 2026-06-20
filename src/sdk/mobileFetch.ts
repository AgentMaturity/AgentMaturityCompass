import { assertNoSelfScoring, requireBridgeUrl } from "./amcGuards.js";
import { AMCSDKError } from "./errors.js";

export type AMCMobileProvider = "openai" | "anthropic" | "gemini" | "openrouter" | "xai" | "local";
export type AMCMobileFetchLike = typeof fetch;

export interface AMCMobileFetchOptions {
  bridgeUrl: string;
  agentId: string;
  token?: string;
  workspaceId?: string;
  provider?: AMCMobileProvider;
  fetchImpl?: AMCMobileFetchLike;
  injectHeaders?: Record<string, string>;
  stripProviderAuth?: boolean;
  correlationIdFactory?: () => string;
}

const PROVIDER_PREFIX: Record<AMCMobileProvider, string> = {
  openai: "/bridge/openai",
  anthropic: "/bridge/anthropic",
  gemini: "/bridge/gemini",
  openrouter: "/bridge/openrouter",
  xai: "/bridge/xai",
  local: "/bridge/local"
};

const PROVIDER_HOSTS: Array<{ provider: AMCMobileProvider; host: string }> = [
  { provider: "openai", host: "api.openai.com" },
  { provider: "anthropic", host: "api.anthropic.com" },
  { provider: "gemini", host: "generativelanguage.googleapis.com" },
  { provider: "openrouter", host: "openrouter.ai" },
  { provider: "xai", host: "api.x.ai" }
];

const PROVIDER_AUTH_HEADERS = ["authorization", "x-api-key", "api-key", "x-goog-api-key", "x-openai-key"];

function makeCorrelationId(): string {
  const maybeCrypto = globalThis.crypto as Crypto | undefined;
  if (maybeCrypto && typeof maybeCrypto.randomUUID === "function") {
    return maybeCrypto.randomUUID();
  }
  return `amc-mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function inputUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.url;
  }
  const candidate = (input as { url?: unknown }).url;
  if (typeof candidate === "string" && candidate.trim().length > 0) {
    return candidate;
  }
  throw new AMCSDKError({
    code: "INVALID_BRIDGE_URL",
    message: "AMC mobile fetch wrapper requires a string URL, URL object, or Request with a URL."
  });
}

function inferProvider(url: URL, fallback: AMCMobileProvider): AMCMobileProvider {
  const host = url.hostname.toLowerCase();
  return PROVIDER_HOSTS.find((row) => host === row.host || host.endsWith(`.${row.host}`))?.provider ?? fallback;
}

function bridgeUrlFor(input: RequestInfo | URL, bridgeUrl: string, providerFallback: AMCMobileProvider): string {
  const rawUrl = inputUrl(input);
  const parsed = new URL(rawUrl, "https://amc-mobile.local");
  const provider = inferProvider(parsed, providerFallback);
  const bridge = new URL(requireBridgeUrl(bridgeUrl));
  const basePath = bridge.pathname.replace(/\/+$/, "");
  const providerPrefix = PROVIDER_PREFIX[provider];
  const upstreamPath = parsed.pathname.startsWith("/") ? parsed.pathname : `/${parsed.pathname}`;
  bridge.pathname = `${basePath}${providerPrefix}${upstreamPath}`.replace(/\/{2,}/g, "/");
  bridge.search = parsed.search;
  return bridge.toString();
}

function requestInitFromInput(input: RequestInfo | URL, init?: RequestInit): RequestInit {
  if (init) {
    return init;
  }
  if (typeof Request !== "undefined" && input instanceof Request) {
    return {
      method: input.method,
      headers: input.headers,
      body: input.body,
      signal: input.signal
    };
  }
  return {};
}

function parseBodyForGuard(body: BodyInit | null | undefined): Record<string, unknown> | null {
  if (typeof body !== "string") {
    return null;
  }
  try {
    const parsed = JSON.parse(body) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function mergeMobileHeaders(params: {
  input: RequestInfo | URL;
  init: RequestInit;
  opts: AMCMobileFetchOptions;
  correlationId: string;
}): Headers {
  const sourceHeaders =
    params.init.headers ??
    (typeof Request !== "undefined" && params.input instanceof Request ? params.input.headers : undefined);
  const headers = new Headers(sourceHeaders);
  if (params.opts.stripProviderAuth !== false) {
    for (const header of PROVIDER_AUTH_HEADERS) {
      headers.delete(header);
    }
  }
  headers.set("x-amc-agent-id", params.opts.agentId);
  headers.set("x-amc-correlation-id", params.correlationId);
  headers.set("x-amc-sdk-name", "amc-mobile-fetch");
  if (params.opts.workspaceId) {
    headers.set("x-amc-workspace-id", params.opts.workspaceId);
  }
  if (params.opts.token && params.opts.token.trim().length > 0) {
    headers.set("authorization", `Bearer ${params.opts.token}`);
  }
  for (const [key, value] of Object.entries(params.opts.injectHeaders ?? {})) {
    headers.set(key, value);
  }
  return headers;
}

export function createAMCMobileFetchBridge(opts: AMCMobileFetchOptions): AMCMobileFetchLike {
  const bridgeUrl = requireBridgeUrl(opts.bridgeUrl);
  const providerFallback = opts.provider ?? "openai";
  const fetchImpl = opts.fetchImpl ?? fetch;
  if (!opts.agentId || opts.agentId.trim().length === 0) {
    throw new AMCSDKError({
      code: "INVALID_BRIDGE_URL",
      message: "agentId is required for AMC mobile fetch instrumentation."
    });
  }

  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const nextInitBase = requestInitFromInput(input, init);
    const guardPayload = parseBodyForGuard(nextInitBase.body);
    if (guardPayload) {
      assertNoSelfScoring(guardPayload);
    }
    const correlationId = opts.correlationIdFactory?.() ?? makeCorrelationId();
    const headers = mergeMobileHeaders({
      input,
      init: nextInitBase,
      opts,
      correlationId
    });
    const targetUrl = bridgeUrlFor(input, bridgeUrl, providerFallback);

    try {
      return await fetchImpl(targetUrl, {
        ...nextInitBase,
        headers
      });
    } catch (error) {
      throw new AMCSDKError({
        code: "NETWORK_ERROR",
        message: `Failed to reach AMC Bridge at ${targetUrl}.`,
        path: new URL(targetUrl).pathname,
        details: "Mobile apps should call a reachable AMC Bridge or your backend proxy, not localhost on a user's device.",
        cause: error
      });
    }
  }) as AMCMobileFetchLike;
}

export const createReactNativeAMCFetch = createAMCMobileFetchBridge;
