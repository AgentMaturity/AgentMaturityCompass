import type { TrustTier } from "../types.js";

/**
 * The tiers a row may claim. One list, matching `TrustTier` in ../types.ts.
 */
export const TRUST_TIERS: readonly TrustTier[] = [
  "OBSERVED",
  "OBSERVED_HARDENED",
  "ATTESTED",
  "SELF_REPORTED"
] as const;

/**
 * Refuse a `trustTier` nobody recognises, at the write.
 *
 * `trustTier` rides in free-form evidence meta, and the reader
 * (`trustTierFromMeta` in ../diagnostic/gates.ts) answers `SELF_REPORTED` for
 * anything it does not recognise. So a typo, or a lower-case "observed", did not
 * fail: it silently became the weakest tier at scoring time, arbitrarily far
 * from the code that caused it and with nothing pointing back. The write is the
 * last point where the mistake is still attributable.
 *
 * Absence stays legal. Many rows are not evidence about an agent's behaviour,
 * and stamping a tier on them would be its own false claim.
 */
export function assertValidTrustTier(meta: Record<string, unknown>): void {
  if (!("trustTier" in meta)) return;
  const value = meta["trustTier"];
  if (value === undefined) return;
  if (typeof value === "string" && (TRUST_TIERS as readonly string[]).includes(value)) return;
  throw new Error(
    `invalid trustTier ${JSON.stringify(value)}; expected one of ${TRUST_TIERS.join(", ")} or none`
  );
}
