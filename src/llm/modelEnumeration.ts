/** Remote model IDs are advisory input to an explicit review, never route or capability authorization. */
import { z } from "zod";
import { credentialRef, type CredentialRef } from "../credentials/credentialRef.js";
import type { CredentialsService } from "../credentials/credentialsService.js";
import { normalizeCredentialValue } from "../credentials/credentialValue.js";
import { checkEgress } from "../residency/checkEgress.js";
import { isSha256HexDigest, sha256Hex } from "../utils/hash.js";
import { canonicalize, isExactIsoTime } from "../utils/json.js";
import { createReviewedModelMetadataSnapshot, type ModelMetadataSnapshot } from "./modelCatalog.js";
import { lookupProviderCatalog } from "./providerCatalog.js";
import { containsCredential } from "./adapter/credentialGuard.js";

const modelId = z.string().min(1).max(512).refine(value => !/[\s\u0000-\u001f\u007f]/u.test(value));
const discoveredModel = z.strictObject({
  model: modelId, contextWindowTokens: z.null(), maxOutputTokens: z.null(), modalities: z.null(), reasoning: z.null(), pricing: z.null()
}).readonly();
const discoverySchema = z.strictObject({
  schemaVersion: z.literal(1), providerId: z.string().min(1), protocol: z.string().min(1),
  source: z.string().url(), retrievedAt: z.string().refine(isExactIsoTime), trust: z.literal("advisory"),
  coverage: z.literal("single-response"), modelSupport: z.literal("not-probed"),
  models: z.array(discoveredModel).max(5000).refine(models => new Set(models.map(model => model.model)).size === models.length).readonly(),
  digest: z.string().refine(isSha256HexDigest)
}).readonly();
const remoteInventory = z.object({ data: z.array(z.object({ id: modelId })).max(5000), has_more: z.boolean().optional() })
  .refine(value => value.has_more !== true);
const MAX_RESPONSE_BYTES = 1_048_576;

export type ModelDiscoveryResult = z.infer<typeof discoverySchema>;

export interface ModelEnumerationInput {
  readonly workspace: string;
  readonly providerId: string;
  readonly protocol: string;
  readonly baseUrl?: string;
  readonly credentialRef?: CredentialRef | null;
  readonly credentials: Pick<CredentialsService, "resolve">;
  readonly signal?: AbortSignal;
}

/** Validates and detaches an advisory result. Its digest proves integrity, not remote truth or operator review. */
export function parseModelDiscoveryResult(value: unknown): ModelDiscoveryResult | null {
  try {
    const parsed = discoverySchema.safeParse(value);
    if (!parsed.success) return null;
    const { digest, ...payload } = parsed.data;
    return digest === sha256Hex(canonicalize(payload)) ? parsed.data : null;
  } catch { return null; }
}

/** Only explicit native provider/protocol pairs have a known model-list endpoint. */
function modelsPath(providerId: string, protocol: string): string {
  if ((providerId === "openai" && ["openai-chat-completions", "openai-responses"].includes(protocol))
    || (providerId === "openai-responses" && protocol === "openai-responses")) return "/v1/models";
  if (providerId === "deepseek" && protocol === "deepseek-chat-completions") return "/models";
  throw new Error("Remote model enumeration is unsupported for this provider/protocol");
}

/** Plain http is loopback only: literal 127.x or [::1]; `localhost` can resolve elsewhere and is not accepted. */
export function isLoopbackHttp(url: URL): boolean {
  return url.protocol === "http:" && (url.hostname === "[::1]" || /^127(?:\.\d{1,3}){3}$/.test(url.hostname));
}

function endpoint(baseUrl: string, path: string): string {
  try {
    const url = new URL(baseUrl);
    if (baseUrl.length > 4096 || !/^https?:\/\/[^/?#\\]+\/?$/i.test(baseUrl) || url.username || url.password
      || !["http:", "https:"].includes(url.protocol) || (url.protocol === "http:" && !isLoopbackHttp(url))) throw new Error();
    return `${url.origin}${path}`;
  } catch { throw new Error("Model enumeration requires a credential-free HTTP(S) origin"); }
}

/** Read untrusted JSON without letting an unexpectedly large inventory allocate an unbounded body. */
async function inventory(response: Response): Promise<z.infer<typeof remoteInventory>> {
  const reader = response.body?.getReader();
  if (reader === undefined) throw new Error("invalid model enumeration response");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new Error("model enumeration response exceeds byte limit");
      chunks.push(part.value);
    }
  } finally {
    try { await reader.cancel(); } catch { /* preserve the original outcome */ }
    reader.releaseLock();
  }
  try {
    return remoteInventory.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch { throw new Error("invalid model enumeration response"); }
}

/**
 * Operator-invoked GET only. No startup hook, registry mutation, catalog insertion or implicit capability grant.
 * This intentionally lists one bounded response; APIs requiring pagination or other protocols remain unsupported.
 */
export async function enumerateRemoteModels(input: ModelEnumerationInput): Promise<ModelDiscoveryResult> {
  const path = modelsPath(input.providerId, input.protocol);
  const provider = lookupProviderCatalog(input.providerId);
  const url = endpoint(input.baseUrl ?? provider?.defaultBaseUrl ?? "", path);
  const ref = input.credentialRef === undefined && provider?.defaultBaseUrl != null
    && new URL(url).origin === new URL(provider.defaultBaseUrl).origin && provider.defaultCredentialRef !== null
    ? credentialRef(provider.defaultCredentialRef) : input.credentialRef;
  const secret = ref == null ? null : normalizeCredentialValue(input.credentials.resolve(ref));
  if (secret === null) throw new Error("Model enumeration credential is unavailable");
  checkEgress({ workspace: input.workspace, channel: "provider", url, providerId: input.providerId });
  const signal = AbortSignal.timeout(30_000);
  const response = await fetch(url, { method: "GET", headers: { accept: "application/json", authorization: `Bearer ${secret}` },
    redirect: "error", signal: input.signal === undefined ? signal : AbortSignal.any([input.signal, signal]) });
  if (!response.ok) {
    try { await response.body?.cancel(); } catch { /* the fixed status error does not expose remote contents */ }
    throw new Error(`Model enumeration failed: HTTP ${response.status}`);
  }
  const remote = await inventory(response);
  if (remote.data.some(model => containsCredential(model.id, secret))) throw new Error("Model enumeration response contains credential material");
  const payload = {
    schemaVersion: 1, providerId: input.providerId, protocol: input.protocol, source: url, retrievedAt: new Date().toISOString(),
    trust: "advisory", coverage: "single-response", modelSupport: "not-probed",
    models: remote.data.map(({ id }) => ({ model: id, contextWindowTokens: null, maxOutputTokens: null, modalities: null, reasoning: null, pricing: null }))
  };
  const result = parseModelDiscoveryResult({ ...payload, digest: sha256Hex(canonicalize(payload)) });
  if (result === null) throw new Error("invalid model enumeration response");
  return result;
}

export interface DiscoveredModelReview {
  readonly expectedDiscoveryDigest: string;
  readonly model: string;
  readonly source: string;
  readonly asOf: string;
  readonly contextWindowTokens?: ModelMetadataSnapshot["contextWindowTokens"];
  readonly maxOutputTokens?: ModelMetadataSnapshot["maxOutputTokens"];
  readonly modalities?: ModelMetadataSnapshot["modalities"];
  readonly reasoning?: ModelMetadataSnapshot["reasoning"];
}

/**
 * Produce one operator-reviewed pin for explicit route configuration. Nothing is installed or trusted automatically;
 * remote claims of limits, modalities, reasoning or prices are never promoted. Existing request signing binds the pin.
 */
export function pinDiscoveredModel(result: unknown, review: DiscoveredModelReview): ModelMetadataSnapshot {
  const discovered = parseModelDiscoveryResult(result);
  if (discovered === null || discovered.digest !== review.expectedDiscoveryDigest) throw new Error("Model discovery digest mismatch");
  if (!discovered.models.some(model => model.model === review.model)) throw new Error("Model is not present in the reviewed discovery result");
  return createReviewedModelMetadataSnapshot({ providerId: discovered.providerId, protocol: discovered.protocol, model: review.model,
    source: review.source, asOf: review.asOf, discoveryDigest: discovered.digest, contextWindowTokens: review.contextWindowTokens ?? null, maxOutputTokens: review.maxOutputTokens ?? null,
    modalities: review.modalities ?? null, reasoning: review.reasoning ?? null });
}

// Public model metadata and discovery share the package entry point.
export {
  createModelMetadataSnapshot, createReviewedModelMetadataSnapshot, listModelMetadata,
  parseModelMetadataSnapshot, type ModelMetadataSnapshot
} from "./modelCatalog.js";
