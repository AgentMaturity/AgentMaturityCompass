/**
 * The one evidence trust-weight table. Every module that weights evidence by trust tier imports it: evidence ingestion,
 * the formal-spec and model-drift side scores, meta-confidence, claim citation quality and community signals.
 *
 * What these weights do, truthfully: they scale side scores (confidence, citation quality, drift, community signals).
 * No trust weight is applied to a maturity level. A question's level is gated instead: only OBSERVED (and
 * OBSERVED_HARDENED, which gates treat as OBSERVED) evidence can support L2 and above, and self-reported or attested
 * evidence supports L1 at most (`amc methodology`, evidenceTrustTiers). Before 2026-11-16 claim confidence,
 * community governance and meta-confidence kept their own tables with other numbers; they now read this one.
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
