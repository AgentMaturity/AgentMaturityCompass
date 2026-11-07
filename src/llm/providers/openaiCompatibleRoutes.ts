/**
 * SH-PROVIDERS-01: named native routes for servers that speak the OpenAI Chat Completions dialect, plus Azure OpenAI.
 *
 * Each route reuses the `openai-chat@4` encoder bytes and the shared Chat decoder UNCHANGED, so `deriveRecordedRequest`
 * needs no new encoder. What differs is honest identity: the signed `request/header` names the real provider id and an
 * adapter whose capability contract declares what is NOT proven for a generic endpoint (`OPENAI_COMPATIBLE_CAPABILITIES`).
 * No catalog pricing attaches to these routes: `canonicalProvider` never maps them to OpenAI, so cost stays unknown
 * rather than borrowing another provider's price list.
 *
 * Default origins are the ones each provider documents for its OpenAI-compatible endpoint, written WITHOUT `/v1` because
 * the adapter appends `/v1/chat/completions`. A provider whose endpoint does not follow that path (Perplexity, Azure
 * resource hosts) ships no default and requires `--base-url`. Origins were read from the documentation cited in
 * docs/NATIVE_PROVIDERS.md on 2026-11-07; `--base-url` always overrides.
 *
 * Local servers (LM Studio, vLLM, llama.cpp) default to a loopback origin and need no credential there. A non-loopback
 * origin without a credential reference is refused: an unauthenticated request to a remote host is never a default.
 */
import type { AdapterEnvelopeInput, LlmAdapter } from "../adapter/adapterTypes.js";
import { OPENAI_COMPATIBLE_CAPABILITIES } from "../adapter/providerCapabilities.js";
import { isLoopbackHttp } from "../modelEnumeration.js";
import { openaiAdapter } from "./openaiAdapter.js";

export const OPENAI_COMPATIBLE_ADAPTER_ID = "openai-compatible-chat";
export const AZURE_OPENAI_ADAPTER_ID = "azure-openai-chat";

export interface OpenaiCompatibleRoute {
  readonly providerId: string;
  readonly displayName: string;
  /** Origin without `/v1`; null means `--base-url` is required. */
  readonly defaultBaseUrl: string | null;
  /** Credential REFERENCE (an environment name), never a value; null for a route that has no documented key. */
  readonly defaultCredentialRef: string | null;
  readonly adapter: LlmAdapter;
}

/** The shared Chat decoder and envelope under a distinct, honestly-named adapter identity. */
function chatDialectAdapter(id: string, envelope: LlmAdapter["envelope"] = openaiAdapter.envelope): LlmAdapter {
  const adapter: LlmAdapter = {
    id, version: 1, capabilities: OPENAI_COMPATIBLE_CAPABILITIES,
    encoderId: openaiAdapter.encoderId, encoderVersion: openaiAdapter.encoderVersion,
    assertParams: (params) => openaiAdapter.assertParams?.(params),
    envelope,
    decode: (response) => openaiAdapter.decode(response),
    describeFailure: (input) => openaiAdapter.describeFailure?.(input) ?? {}
  };
  return Object.freeze(adapter);
}

export const openaiCompatibleAdapter: LlmAdapter = chatDialectAdapter(OPENAI_COMPATIBLE_ADAPTER_ID);

/** Azure's v1 surface: `${resource}/openai/v1/chat/completions`, authenticated by the `api-key` header, no query string. */
export const azureOpenaiAdapter: LlmAdapter = chatDialectAdapter(AZURE_OPENAI_ADAPTER_ID, (input: AdapterEnvelopeInput) => {
  const base = openaiAdapter.envelope(input);
  const { authorization: _bearer, ...headers } = base.headers;
  return { ...base, headers: { ...headers, ...(input.credential === null ? {} : { "api-key": input.credential }) } };
});

const compat = (providerId: string, displayName: string, defaultBaseUrl: string | null, defaultCredentialRef: string | null): OpenaiCompatibleRoute =>
  Object.freeze({ providerId, displayName, defaultBaseUrl, defaultCredentialRef, adapter: openaiCompatibleAdapter });

export const OPENAI_COMPATIBLE_ROUTES: readonly OpenaiCompatibleRoute[] = Object.freeze([
  compat("groq", "Groq", "https://api.groq.com/openai", "GROQ_API_KEY"),
  compat("mistral", "Mistral", "https://api.mistral.ai", "MISTRAL_API_KEY"),
  compat("xai", "xAI", "https://api.x.ai", "XAI_API_KEY"),
  compat("openrouter", "OpenRouter", "https://openrouter.ai/api", "OPENROUTER_API_KEY"),
  compat("together", "Together", "https://api.together.xyz", "TOGETHER_API_KEY"),
  compat("fireworks", "Fireworks", "https://api.fireworks.ai/inference", "FIREWORKS_API_KEY"),
  compat("lmstudio", "LM Studio (local)", "http://127.0.0.1:1234", null),
  compat("vllm", "vLLM (local)", "http://127.0.0.1:8000", null),
  compat("llamacpp", "llama.cpp server (local)", "http://127.0.0.1:8080", null),
  Object.freeze({ providerId: "azure-openai", displayName: "Azure OpenAI (v1 surface)", defaultBaseUrl: null,
    defaultCredentialRef: "AZURE_OPENAI_API_KEY", adapter: azureOpenaiAdapter })
]);

export function openaiCompatibleRouteFor(providerId: string): OpenaiCompatibleRoute | null {
  return OPENAI_COMPATIBLE_ROUTES.find((route) => route.providerId === providerId) ?? null;
}

/** Whether this route may register without a credential: only a plain-http loopback origin. */
export function credentialOptionalOrigin(baseUrl: string): boolean {
  try { return isLoopbackHttp(new URL(baseUrl)); } catch { return false; }
}
