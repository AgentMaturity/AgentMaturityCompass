/**
 * `pi-ai:<provider>` routes behind AMC's adapter seam (P1-38, ADR-016).
 *
 * pi-ai contributes the request body (its per-provider payload rules, through piAiEncoder.ts) and its pinned model
 * catalog (base URL, output and context limits, modalities). AMC keeps everything else: the signed `request/header`,
 * prepare-time capability and dataflow admission, budget admission, the egress gate, the transport and the decoder.
 * Decoding reuses the native Chat decoder rather than pi-ai's, because pi-ai fills missing usage with zeros and AMC
 * must report missing usage as unknown.
 */
import { credentialRef } from "../../../credentials/credentialRef.js";
import { openSessionEventStore } from "../../../persistence/openSessionEventStore.js";
import { parseRequestHeaderMeta } from "../../../session/requestHeaderMeta.js";
import type { LlmRouteConfig } from "../../adapter/adapterRegistry.js";
import type { LlmAdapter } from "../../adapter/adapterTypes.js";
import { CAPABILITY_NAMES, type CapabilitySupport, type ProviderCapabilities, type ProviderCapability } from "../../adapter/providerCapabilities.js";
import { BUILT_IN_REQUEST_ENCODERS } from "../../request/builtInEncoders.js";
import { RequestEncoderRegistry } from "../../request/requestEncoder.js";
import { openaiAdapter } from "../openaiAdapter.js";
import { assertPiAiParams, createPiAiEncoder, piAiChatModel, piAiEncoderId, PI_AI_ENCODER_VERSION } from "./piAiEncoder.js";
import { loadPiAi, PI_AI_PROVIDERS, type PiAiLoaderDeps, type PiAiModel, type PiAiProviderId } from "./piAiLoader.js";

export const PI_AI_ROUTE_PREFIX = "pi-ai:";
export const PI_AI_ADAPTER_ID = "pi-ai-openai-completions";
export const PI_AI_PROTOCOL = "pi-ai-openai-completions";

/**
 * Every feature is unknown except what tests/piAi/piAiAdapterContract.test.ts proves at the pinned version. The two
 * error-result features are proven UNSUPPORTED: the pinned encoding sends a failed and a successful result identically.
 */
const PROVEN: Partial<Record<ProviderCapability, CapabilitySupport>> = {
  "text-input": "supported", "text-output": "supported", "tool-calls": "supported", "tool-replay": "supported",
  usage: "supported", "tool-result-error-flag": "unsupported", "tool-result-error-text": "unsupported"
};
export const PI_AI_CAPABILITIES: ProviderCapabilities = Object.freeze({
  schemaVersion: 1, protocol: PI_AI_PROTOCOL,
  features: Object.freeze(Object.fromEntries(CAPABILITY_NAMES.map((name) => [name, PROVEN[name] ?? "unknown"])) as Record<ProviderCapability, CapabilitySupport>),
  usage: "reported-required", cache: "none", thinking: "unsupported", toolReplay: "provider-call-id-and-text-result",
  toolErrorRepresentation: "unsupported", modelSupport: "not-probed"
});

/** Credential reference names pi-ai's own provider definitions read. AMC resolves them through its credentials seam. */
const DEFAULT_CREDENTIAL_REFS: Readonly<Record<PiAiProviderId, string>> = Object.freeze({
  groq: "GROQ_API_KEY", huggingface: "HF_TOKEN", together: "TOGETHER_API_KEY"
});

export function isPiAiRoute(providerId: string): boolean {
  return providerId.startsWith(PI_AI_ROUTE_PREFIX);
}

export function piAiRouteIds(): readonly string[] {
  return PI_AI_PROVIDERS.map((provider) => `${PI_AI_ROUTE_PREFIX}${provider}`);
}

function piAiProviderOf(routeId: string): PiAiProviderId {
  const provider = routeId.slice(PI_AI_ROUTE_PREFIX.length);
  if (!isPiAiRoute(routeId) || !(PI_AI_PROVIDERS as readonly string[]).includes(provider)) {
    throw new Error(`unknown pi-ai route ${JSON.stringify(routeId)}; reviewed pi-ai routes are ${piAiRouteIds().join(", ")}`);
  }
  return provider as PiAiProviderId;
}

/** One adapter per route: params are checked against this model's pinned limits before anything durable exists. */
export function createPiAiAdapter(provider: PiAiProviderId, model: PiAiModel): LlmAdapter {
  const adapter: LlmAdapter = {
    id: PI_AI_ADAPTER_ID,
    version: 1,
    capabilities: PI_AI_CAPABILITIES,
    encoderId: piAiEncoderId(provider),
    encoderVersion: PI_AI_ENCODER_VERSION,
    assertParams: (params: Record<string, unknown>) => assertPiAiParams(params, model),
    // The native Chat envelope (headers, verbatim body, signal); pi-ai catalog base URLs already end in the API version.
    envelope: (input) => ({ ...openaiAdapter.envelope(input), url: `${input.baseUrl}/chat/completions` }),
    decode: (response) => openaiAdapter.decode(response),
    describeFailure: (input) => openaiAdapter.describeFailure?.(input) ?? {}
  };
  return Object.freeze(adapter);
}

/** Built-in encoders plus the pi encoders, so a pi route's runtime still derives every native request. */
function registryWith(library: Awaited<ReturnType<typeof loadPiAi>>): RequestEncoderRegistry {
  return new RequestEncoderRegistry([...BUILT_IN_REQUEST_ENCODERS, ...PI_AI_PROVIDERS.map((provider) => createPiAiEncoder(library, provider))]);
}

/** The route and the encoder registry its runtime must use. Loads pi-ai; nothing else in AMC does. */
export async function piAiRouteFor(routeId: string, options: { readonly baseUrl?: string; readonly credential?: string },
  model: string | undefined, deps?: PiAiLoaderDeps): Promise<{ readonly route: LlmRouteConfig; readonly encoders: RequestEncoderRegistry }> {
  const provider = piAiProviderOf(routeId);
  if (model === undefined || model.trim().length === 0) throw new Error(`--model is required for provider ${routeId}`);
  const library = await loadPiAi(deps);
  const catalogModel = piAiChatModel(library, provider, model);
  return Object.freeze({
    route: { providerId: routeId, adapter: createPiAiAdapter(provider, catalogModel),
      baseUrl: options.baseUrl ?? catalogModel.baseUrl,
      credentialRef: credentialRef(options.credential ?? DEFAULT_CREDENTIAL_REFS[provider]), models: [model] },
    encoders: registryWith(library)
  });
}

/**
 * For verification: a registry that can re-derive this session's pi requests, or null when it recorded none or pi-ai
 * cannot load. Null leaves derivation on the built-in registry, which reports such requests as unreconstructable,
 * never reconstructed. pi-ai is loaded only when a recorded header names a pi encoder.
 */
export async function piAiDerivationEncoders(workspace: string, sessionId: string, deps?: PiAiLoaderDeps): Promise<RequestEncoderRegistry | null> {
  const store = openSessionEventStore(workspace, undefined, { readOnly: true });
  let usesPiAi: boolean;
  try {
    usesPiAi = store.readSessionEvents(sessionId).some((event) => event.event_type === "request/header"
      && isPiAiRoute(parseRequestHeaderMeta(event.meta_json)?.encoderId ?? ""));
  } finally {
    store.close();
  }
  if (!usesPiAi) return null;
  try { return registryWith(await loadPiAi(deps)); } catch { return null; }
}
