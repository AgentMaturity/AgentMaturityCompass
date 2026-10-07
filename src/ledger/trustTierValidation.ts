import { producerOfMeta, workspaceOwnKeyIds } from "../claims/evidenceProvenance.js";
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

/**
 * assertValidTrustTier, plus the tier the producer may claim (P0-18). Only AMC's runtime writes OBSERVED or
 * OBSERVED_HARDENED, and ATTESTED needs an attestation record (keyId, sigB64, digestSha256) that the writer verified
 * and readers re-verify against the trust list. No trust-list reads on the append path; for an ATTESTED row only, the
 * `workspace`'s own key ids are read, because its monitor and auditor keys never attest as a third party.
 */
export function assertTrustTierProvenance(meta: Record<string, unknown>, workspace?: string): void {
  assertValidTrustTier(meta);
  const tier = meta["trustTier"];
  if (tier === undefined || tier === "SELF_REPORTED") return;
  const producer = producerOfMeta(meta);
  const attestation = meta["attestation"] as Record<string, unknown> | null | undefined;
  const allowed = tier === "ATTESTED"
    ? producer !== "synthetic" && typeof attestation === "object" && attestation !== null
      && ["keyId", "sigB64", "digestSha256"].every((field) => typeof attestation[field] === "string")
    : producer === "amc-runtime";
  if (!allowed) {
    throw new Error(`trust tier ${String(tier)} is not allowed for ${producer} evidence; tiers derive from provenance (docs/EVIDENCE_TRUST.md)`);
  }
  if (tier === "ATTESTED" && workspace && workspaceOwnKeyIds(workspace).includes(String(attestation?.["keyId"]))) {
    throw new Error("trust tier ATTESTED is not allowed with the workspace's own key; tiers derive from provenance (docs/EVIDENCE_TRUST.md)");
  }
}

/**
 * The outcome ledger's guard (P0-18): only AMC's runtime (ToolHub) observes an outcome, and no outcome writer verifies
 * a third-party attestation, so every other source writes SELF_REPORTED.
 */
export function assertOutcomeTrustTier(source: string, trustTier: string): void {
  if (trustTier === "SELF_REPORTED" || (trustTier === "OBSERVED" && source === "toolhub")) return;
  throw new Error(`trust tier ${trustTier} is not allowed for ${source} outcomes; tiers derive from provenance (docs/EVIDENCE_TRUST.md)`);
}
