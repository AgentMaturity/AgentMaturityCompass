import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import { ANTHROPIC_MESSAGES_ENCODER_ID } from "./anthropicMessagesEncoder.js";
import { anthropicMessagesEncoderV4 } from "./anthropicMessagesEncoderV4.js";
import { OPENAI_CHAT_ENCODER_ID } from "./openaiChatEncoder.js";
import { openaiChatEncoderV4 } from "./openaiChatEncoderV4.js";
import { OPENAI_RESPONSES_ENCODER_ID } from "./openaiResponsesEncoder.js";
import { openaiResponsesEncoderV3 } from "./openaiResponsesEncoderV3.js";
import type { RequestEncoder } from "./requestEncoder.js";
import { RequestEncodingError, type EncodableRequest } from "./requestSpec.js";

/**
 * Route-level prompt-cache retention (PXA-15). The route's `cacheRetention` is committed in the signed header's params
 * and translated here, by NEW encoder versions: without it each version's bytes equal its predecessor's, so every
 * digest recorded under an earlier version stays reconstructable and a route without retention keeps its old version.
 */
export type CacheRetention = "short" | "long";

export function isCacheRetention(value: unknown): value is CacheRetention {
  return value === "short" || value === "long";
}

type Body = Record<string, unknown>;

/** The retention version for each active encoder that has one; any other encoder cannot carry the option. */
const RETENTION_VERSIONS: ReadonlyMap<string, number> = new Map([
  [`${ANTHROPIC_MESSAGES_ENCODER_ID}@4`, 5], [`${OPENAI_CHAT_ENCODER_ID}@4`, 5], [`${OPENAI_RESPONSES_ENCODER_ID}@3`, 4]
]);

export function cacheRetentionEncoderVersion(encoderId: string, version: number): number | null {
  return RETENTION_VERSIONS.get(`${encoderId}@${version}`) ?? null;
}

function retentionEncoder(base: RequestEncoder, version: number, wireKeys: readonly string[],
  apply: (body: Body, retention: CacheRetention, request: EncodableRequest) => void): RequestEncoder {
  return {
    id: base.id,
    version,
    encode(request) {
      if (!Object.hasOwn(request.params, "cacheRetention")) return base.encode(request);
      const { cacheRetention: retention, ...params } = request.params;
      if (!isCacheRetention(retention)) throw new RequestEncodingError("cacheRetention must be short or long.");
      const conflict = wireKeys.find(key => Object.hasOwn(params, key));
      if (conflict !== undefined) throw new RequestEncodingError(`request param "${conflict}" conflicts with the route's cache retention.`);
      const stripped = { ...request, params };
      const body = JSON.parse(base.encode(stripped).toString("utf8")) as Body;
      apply(body, retention, stripped);
      return Buffer.from(canonicalize(body), "utf8");
    }
  };
}

/** Upgrades only the three breakpoints v2+ already place (system, last tool, last message block) to a 1h TTL. */
function anthropicTtl(body: Body, retention: CacheRetention): void {
  if (retention === "short") return;
  const mark = (block: unknown): void => {
    if (typeof block === "object" && block !== null && Object.hasOwn(block, "cache_control")) {
      (block as Body).cache_control = { type: "ephemeral", ttl: "1h" };
    }
  };
  if (Array.isArray(body.system)) mark(body.system.at(-1));
  if (Array.isArray(body.tools)) mark(body.tools.at(-1));
  const last = Array.isArray(body.messages) ? body.messages.at(-1) as Body | undefined : undefined;
  if (Array.isArray(last?.content)) mark(last.content.at(-1));
}

/** A key for the stable prefix (model, system, offered tools), so a growing conversation keeps hitting one cache. */
function openaiRetention(body: Body, retention: CacheRetention, request: EncodableRequest): void {
  body.prompt_cache_key = `amc:${sha256Hex(canonicalize({ model: request.model, system: request.system, tools: request.tools }))}`;
  body.prompt_cache_retention = retention === "long" ? "24h" : "in_memory";
}

const OPENAI_WIRE_KEYS = ["prompt_cache_key", "prompt_cache_retention", "prompt_cache_options"] as const;
export const anthropicMessagesEncoderV5 = retentionEncoder(anthropicMessagesEncoderV4, 5, ["cache_control"], anthropicTtl);
export const openaiChatEncoderV5 = retentionEncoder(openaiChatEncoderV4, 5, OPENAI_WIRE_KEYS, openaiRetention);
export const openaiResponsesEncoderV4 = retentionEncoder(openaiResponsesEncoderV3, 4, OPENAI_WIRE_KEYS, openaiRetention);
