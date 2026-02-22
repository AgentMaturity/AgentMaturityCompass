import type { TrustTier } from "../types.js";

/**
 * ClaimProvenanceTag categorizes how a claim was derived
 * - OBSERVED_FACT: Direct measurement by AMC monitor/gateway
 * - DERIVED_PATTERN: Pattern observed across multiple sessions
 * - HYPOTHESIS: Unverified assertion, must be easy to discard
 * - SESSION_LOCAL: True for current session only, don't carry forward
 * - REFERENCE_ONLY: Background context, not actionable
 */
export type ClaimProvenanceTag =
  | "OBSERVED_FACT"
  | "DERIVED_PATTERN"
  | "HYPOTHESIS"
  | "SESSION_LOCAL"
  | "REFERENCE_ONLY";

/**
 * ClaimLifecycleState tracks the verification and trust status
 * - QUARANTINE: New claim, not yet promoted
 * - PROVISIONAL: Partially verified, limited trust
 * - PROMOTED: Fully verified, cross-session evidence
 * - EXPIRED: Stale claim replaced by an append-only expiry event
 * - DEPRECATED: Superseded by newer claim
 * - REVOKED: Explicitly invalidated
 */
export type ClaimLifecycleState =
  | "QUARANTINE"
  | "PROVISIONAL"
  | "PROMOTED"
  | "EXPIRED"
  | "DEPRECATED"
  | "REVOKED";

/**
 * Core claim object model with structured provenance and lifecycle tracking
 */
export interface Claim {
  // Identity
  claimId: string;
  agentId: string;
  runId: string; // diagnostic run that generated this claim
  questionId: string; // AMC question ID (e.g., "AMC-1.1")

  // Content
  assertionText: string; // What is being claimed
  claimedLevel: number; // 0-5 maturity level

  // Provenance and verification
  provenanceTag: ClaimProvenanceTag;
  lifecycleState: ClaimLifecycleState;
  confidence: number; // 0.0-1.0 calibrated confidence
  evidenceRefs: string[]; // evidence event IDs
  trustTier: TrustTier; // highest trust tier of evidence

  // Lineage and history
  promotedFromClaimId: string | null; // lineage tracking (null if origin claim)
  promotionEvidence: string[]; // cross-session evidence that justified promotion
  supersededByClaimId: string | null; // if deprecated, what replaced it

  // Timestamps and expiry
  createdTs: number; // when claim was created
  lastVerifiedTs: number; // when claim was last verified
  expiryTs: number | null; // stale-claim detection TTL, null if no expiry

  // Cryptographic integrity
  prev_claim_hash: string; // hash chain: SHA256 of previous claim
  claim_hash: string; // SHA256 of canonical form
  signature: string; // Ed25519 signature from auditor key
}

/**
 * Tracks state transitions for audit trail
 */
export interface ClaimTransition {
  transitionId: string;
  claimId: string;
  fromState: ClaimLifecycleState;
  toState: ClaimLifecycleState;
  reason: string;
  evidenceRefs: string[]; // evidence supporting the transition
  ts: number;
  signature: string; // Ed25519 signature
}
