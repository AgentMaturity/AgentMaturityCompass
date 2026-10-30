/** Credential-free physical selection and deterministic virtual-model receipt. */
import { z } from "zod";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";

const text = z.string().min(1);
const version = z.number().int().positive();
const baseUrl = text.refine(value => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
});
const physicalSchema = z.strictObject({
  schemaVersion: z.literal(1), providerId: text, model: text, protocol: text.nullable(), baseUrl,
  adapterId: text, adapterVersion: version, encoderId: text, encoderVersion: version,
  routeConfigDigest: text.regex(/^[a-f0-9]{64}$/)
}).readonly();
const decisionSchema = z.strictObject({
  schemaVersion: z.literal(1), intent: text, strategy: z.enum(["cheapest", "fastest", "best-quality", "round-robin", "fallback"]),
  reason: text, physicalRouteDigest: text.regex(/^[a-f0-9]{64}$/)
}).readonly();

export type PhysicalRouteIdentity = z.infer<typeof physicalSchema>;
export type VirtualRoutingDecision = z.infer<typeof decisionSchema>;

export function physicalRouteDigest(route: PhysicalRouteIdentity): string {
  return sha256Hex(canonicalize(route));
}

export function parsePhysicalRouteIdentity(value: unknown): PhysicalRouteIdentity | null {
  const parsed = physicalSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseVirtualRoutingDecision(value: unknown, physicalRoute: PhysicalRouteIdentity): VirtualRoutingDecision | null {
  const parsed = decisionSchema.safeParse(value);
  return parsed.success && parsed.data.physicalRouteDigest === physicalRouteDigest(physicalRoute) ? parsed.data : null;
}
