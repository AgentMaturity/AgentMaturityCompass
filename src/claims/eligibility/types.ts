/**
 * Claim kinds and status dimensions: what a result may claim, decided once and
 * printed the same way on every surface. Unrelated to the claim lifecycle in
 * src/claims/claimTypes.ts. See docs/CLAIM_KINDS.md.
 */

export const CLAIM_KINDS = ["synthetic_example", "self_reported", "observed", "independently_reviewed"] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];

export type ClaimMethod = "synthetic" | "numeric_self_answer" | "keyword_match" | "unkeyed_checksum"
  | "path_presence" | "runtime_observation" | "executed_test" | "human_review";

export type Applicability = { state: "applicable" } | { state: "not_applicable"; rationale: string }
  | { state: "unresolved"; reason: string };
export type EvidenceState = "sufficient" | "incomplete" | "stale" | "contradictory" | "untrusted";
export type ResultState = "pass" | "fail" | "not_evaluated";
export type Enforcement = { state: "none" } | { state: "advisory" } | { state: "observed" }
  | { state: "enforced"; boundary: string };
export type ReviewState = "pending" | "approved" | "rejected" | "expired";

export interface StatusDimensions {
  applicability: Applicability;
  evidence: EvidenceState;
  result: ResultState;
  enforcement: Enforcement;
  review: ReviewState;
}

export type ClaimReasonCode =
  | "SYNTHETIC_VALUES"
  | "SELF_REPORTED_NO_POSITIVE_STATUS"
  | "SELF_REPORTED_LEVEL_CAP"
  | "WEAK_METHOD"
  | "EMPTY_EVIDENCE"
  | "UNBOUND_EVIDENCE"
  | "STALE_EVIDENCE"
  | "CONTRADICTORY_EVIDENCE"
  | "CROSS_SCOPE_EVIDENCE"
  | "SIGNATURE_INVALID"
  | "ISSUER_NOT_PINNED"
  | "REVIEW_NOT_INDEPENDENT"
  | "LEGACY_1X_UNVERIFIED"
  | "NOT_APPLICABLE"
  | "APPLICABILITY_UNRESOLVED"
  | "EVIDENCE_NOT_CLAIM_READY";

export interface ClaimProvenance {
  producer: string;
  method: ClaimMethod;
  evidenceRefs: string[];
  legacy?: { version: string; originalTier?: string };
}

export interface ClaimEnvelope {
  claimKind: ClaimKind;
  statusDimensions: StatusDimensions;
  provenance: ClaimProvenance;
  eligibleLevel: number | null;
  reasons: ClaimReasonCode[];
  entitlement?: { active: boolean };
}

/** Union of both TrustTier vocabularies (src/types.ts and src/score/evidenceIngestion.ts). */
export type ClaimEvidenceTier = "OBSERVED" | "OBSERVED_HARDENED" | "ATTESTED" | "SELF_REPORTED" | "UNVERIFIED";

export interface ClaimEligibilityInput {
  producer: string;
  method: ClaimMethod;
  /** True when the result asserts conformity with a law, regulation, standard or framework mapping. */
  regulated: boolean;
  proposed: { result: ResultState; level: number | null };
  evidence: {
    eventCount: number;
    tiers: readonly ClaimEvidenceTier[];
    newestTs: number | null;
    maxAgeMs?: number;
    boundToControl: boolean;
    sameScope: boolean;
    contradictory: boolean;
    signatureValid: boolean | null;
    issuerPinned: boolean | null;
  };
  evidenceRefs?: readonly string[];
  applicability?: Applicability;
  enforcement?: Enforcement;
  review?: { state: ReviewState; independent: boolean };
  legacy?: { version: string; originalTier?: string };
  /** Copied to the envelope untouched; no rule reads it. Payment never changes a result. */
  entitlement?: { active: boolean };
  now: number;
}
