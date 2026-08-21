/**
 * Canonical evidence trust weights.
 *
 * Three tables previously disagreed about the same concept: SELF_REPORTED was
 * 0.5 in score/evidenceIngestion but 0.4 in score/formalSpec and
 * score/modelDrift, so identical evidence scored differently depending on which
 * path happened to process it. The published methodology (README, whitepaper)
 * states 0.4, making the 0.5 the outlier.
 *
 * For a product whose central claim is that a score traces to weighted
 * evidence, the weights cannot be a per-module opinion. Every scorer imports
 * these.
 */

/** Uppercase tier names, as used in the ledger and diagnostic runner. */
export type TrustTier = "OBSERVED_HARDENED" | "OBSERVED" | "ATTESTED" | "SELF_REPORTED" | "UNVERIFIED";

/** Lowercase artifact kinds, as used by the formal-spec scorer. */
export type EvidenceKind = "observed" | "attested" | "self_reported";

/**
 * Weight applied to evidence of each tier.
 *
 * OBSERVED_HARDENED sits above OBSERVED because it additionally carries a
 * hardware or notary attestation; UNVERIFIED is evidence AMC accepted but could
 * not corroborate at all.
 */
export const TRUST_WEIGHTS: Record<TrustTier, number> = {
  OBSERVED_HARDENED: 1.1,
  OBSERVED: 1.0,
  ATTESTED: 0.8,
  SELF_REPORTED: 0.4,
  UNVERIFIED: 0.3
};

/** The same weights keyed by the lowercase artifact kinds. */
export const EVIDENCE_KIND_WEIGHTS: Record<EvidenceKind, number> = {
  observed: TRUST_WEIGHTS.OBSERVED,
  attested: TRUST_WEIGHTS.ATTESTED,
  self_reported: TRUST_WEIGHTS.SELF_REPORTED
};

/** Half-life used when ageing evidence, in milliseconds. */
export const EVIDENCE_HALF_LIFE_MS = 90 * 24 * 60 * 60 * 1000;

/** Weight of evidence of a given age, decaying on the half-life above. */
export function evidenceDecay(ageMs: number): number {
  return Math.exp((-0.693 * ageMs) / EVIDENCE_HALF_LIFE_MS);
}
