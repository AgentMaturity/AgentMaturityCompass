/** The normative reason codes (P1-06 step 5), per dimension. A conforming verifier reports these, and only these. */
export const REASON_CODES = {
  integrity: ["MALFORMED", "UNKNOWN_FIELD", "UNSUPPORTED_VERSION", "DIGEST_MISMATCH", "SIGNATURE_INVALID"],
  issuerAdmission: ["ISSUER_NOT_PINNED", "ISSUER_WRONG_PURPOSE", "ISSUER_REVOKED", "ISSUER_DISTRUSTED", "KEY_NOT_YET_VALID",
    "KEY_EXPIRED", "TRUST_LIST_EXPIRED", "TRUST_LIST_SIGNATURE_INVALID", "UNANCHORED", "ROLLBACK_DETECTED"],
  scope: ["SCOPE_MISMATCH", "FOREIGN_EVIDENCE"],
  freshness: ["ATTESTATION_EXPIRED", "NOT_YET_VALID", "REPLAYED_OR_SUPERSEDED", "CLAIMED_TIME_BEFORE_KEY_VALIDITY"],
  completeness: ["EMPTY_EVIDENCE", "EVIDENCE_MISSING", "CONTRADICTORY_EVIDENCE", "OUTCOME_UNKNOWN"],
  satisfaction: ["CLAIMED_RESULT_FAILED", "NOT_RECOMPUTABLE"]
} as const;

export type Dimension = keyof typeof REASON_CODES;
export type ReasonCode<D extends Dimension = Dimension> = (typeof REASON_CODES)[D][number];
export const DIMENSIONS = Object.keys(REASON_CODES) as Dimension[];
export type DimensionStatus = "pass" | "fail" | "not-evaluated";

/** One reason a dimension did not pass, with a human-readable detail. */
export interface Finding<D extends Dimension = Dimension> {
  code: ReasonCode<D>;
  detail: string;
}

export const KEY_PURPOSES = ["ledger-row", "receipt", "artifact-seal", "revocation-list", "config-signature", "lease", "session",
  "release", "notary", "evidence-authority", "independent-attestation", "trust-list-root", "catalog-review"] as const;
export type KeyPurpose = (typeof KEY_PURPOSES)[number];
