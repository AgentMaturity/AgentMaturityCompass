import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import type {
  Claim,
  ClaimTransition,
  ClaimLifecycleState
} from "./claimTypes.js";
import {
  insertClaim,
  insertClaimTransition,
  getClaimById,
  getClaimsByState
} from "./claimStore.js";
import { evaluatePromotion } from "./promotionGate.js";
import type { QuarantinePolicy } from "./quarantine.js";
import type { EvidenceEvent } from "../types.js";

/**
 * Valid state transitions in the claim lifecycle
 * Terminal states: REVOKED
 * Deprecation terminal: DEPRECATED → REVOKED
 */
const VALID_TRANSITIONS: Record<ClaimLifecycleState, ClaimLifecycleState[]> = {
  QUARANTINE: ["PROVISIONAL", "EXPIRED", "REVOKED"],
  PROVISIONAL: ["PROMOTED", "QUARANTINE", "EXPIRED", "DEPRECATED", "REVOKED"],
  PROMOTED: ["EXPIRED", "DEPRECATED", "REVOKED"],
  EXPIRED: ["REVOKED"],
  DEPRECATED: ["REVOKED"],
  REVOKED: [] // terminal
};

interface TransitionClaimInput {
  claimId: string;
  toState: ClaimLifecycleState;
  reason: string;
  evidenceRefs?: string[]; // evidence supporting the transition
}

/**
 * Execute a state transition for a claim with validation and signing
 *
 * - Validates transition is allowed
 * - For promotion transitions, runs promotion gate evaluation
 * - Creates and stores signed ClaimTransition record
 * - Updates claim's lifecycle state (appends new claim record)
 */
export function transitionClaim(
  db: Database.Database,
  input: TransitionClaimInput,
  evidenceEvents: EvidenceEvent[],
  policy: QuarantinePolicy,
  prevClaimHash: string,
  signFn: (digestHex: string) => string
): ClaimTransition {
  const { claimId, toState, reason, evidenceRefs = [] } = input;

  // Get current claim
  const claim = getClaimById(db, claimId);
  if (!claim) {
    throw new Error(`Claim not found: ${claimId}`);
  }

  const fromState = claim.lifecycleState;

  // Validate transition is allowed
  if (!VALID_TRANSITIONS[fromState]?.includes(toState)) {
    throw new Error(
      `Invalid state transition: ${fromState} → ${toState}`
    );
  }

  // Special case: PROMOTED → QUARANTINE not allowed
  if (fromState === "PROMOTED" && toState === "QUARANTINE") {
    throw new Error(
      `Cannot revert PROMOTED claim to QUARANTINE; must REVOKE instead`
    );
  }

  // For promotion transitions, run gate evaluation
  if (
    (fromState === "QUARANTINE" && toState === "PROVISIONAL") ||
    (fromState === "PROVISIONAL" && toState === "PROMOTED")
  ) {
    const eval_ = evaluatePromotion(claim, evidenceEvents, policy);
    if (!eval_.allowed) {
      throw new Error(
        `Promotion not allowed: ${eval_.missingCriteria.join("; ")}`
      );
    }
  }

  // Create transition record
  const transitionId = randomUUID();
  const now = Date.now();

  const transition: ClaimTransition = {
    transitionId,
    claimId,
    fromState,
    toState,
    reason,
    evidenceRefs,
    ts: now,
    signature: "" // will be computed
  };

  // Sign the transition
  const transitionCanonical = canonicalize({
    transition_id: transition.transitionId,
    claim_id: transition.claimId,
    from_state: transition.fromState,
    to_state: transition.toState,
    reason: transition.reason,
    evidence_refs: transition.evidenceRefs,
    ts: transition.ts,
    prev_claim_hash: prevClaimHash
  });

  const transitionHash = sha256Hex(transitionCanonical);
  transition.signature = signFn(transitionHash);

  // Insert transition record
  insertClaimTransition(db, transition);

  // Create updated claim with new state
  const updatedClaim: Claim = {
    ...claim,
    lifecycleState: toState,
    lastVerifiedTs: now,
    prev_claim_hash: claim.claim_hash // chain hash
  };

  // Recompute claim hash for the new state
  const claimCanonical = canonicalize({
    claim_id: updatedClaim.claimId,
    agent_id: updatedClaim.agentId,
    run_id: updatedClaim.runId,
    question_id: updatedClaim.questionId,
    assertion_text: updatedClaim.assertionText,
    claimed_level: updatedClaim.claimedLevel,
    provenance_tag: updatedClaim.provenanceTag,
    lifecycle_state: updatedClaim.lifecycleState,
    confidence: updatedClaim.confidence,
    evidence_refs: updatedClaim.evidenceRefs,
    trust_tier: updatedClaim.trustTier,
    promoted_from_claim_id: updatedClaim.promotedFromClaimId,
    promotion_evidence: updatedClaim.promotionEvidence,
    superseded_by_claim_id: updatedClaim.supersededByClaimId,
    created_ts: updatedClaim.createdTs,
    last_verified_ts: updatedClaim.lastVerifiedTs,
    expiry_ts: updatedClaim.expiryTs,
    prev_claim_hash: updatedClaim.prev_claim_hash
  });

  updatedClaim.claim_hash = sha256Hex(claimCanonical);
  updatedClaim.signature = signFn(updatedClaim.claim_hash);

  // Insert updated claim (append-only)
  insertClaim(db, updatedClaim);

  return transition;
}

/**
 * Shortcut to deprecate a claim and optionally link it to a successor
 */
export function deprecateClaim(
  db: Database.Database,
  claimId: string,
  supersededByClaimId: string | null,
  reason: string,
  prevClaimHash: string,
  signFn: (digestHex: string) => string
): ClaimTransition {
  const claim = getClaimById(db, claimId);
  if (!claim) {
    throw new Error(`Claim not found: ${claimId}`);
  }

  // Update claim with successor link before transitioning
  const updatedClaim: Claim = {
    ...claim,
    supersededByClaimId,
    lastVerifiedTs: Date.now(),
    prev_claim_hash: claim.claim_hash
  };

  // Recompute hash with updated superseded link
  const claimCanonical = canonicalize({
    claim_id: updatedClaim.claimId,
    agent_id: updatedClaim.agentId,
    run_id: updatedClaim.runId,
    question_id: updatedClaim.questionId,
    assertion_text: updatedClaim.assertionText,
    claimed_level: updatedClaim.claimedLevel,
    provenance_tag: updatedClaim.provenanceTag,
    lifecycle_state: updatedClaim.lifecycleState, // still current state
    confidence: updatedClaim.confidence,
    evidence_refs: updatedClaim.evidenceRefs,
    trust_tier: updatedClaim.trustTier,
    promoted_from_claim_id: updatedClaim.promotedFromClaimId,
    promotion_evidence: updatedClaim.promotionEvidence,
    superseded_by_claim_id: updatedClaim.supersededByClaimId,
    created_ts: updatedClaim.createdTs,
    last_verified_ts: updatedClaim.lastVerifiedTs,
    expiry_ts: updatedClaim.expiryTs,
    prev_claim_hash: updatedClaim.prev_claim_hash
  });

  updatedClaim.claim_hash = sha256Hex(claimCanonical);
  updatedClaim.signature = signFn(updatedClaim.claim_hash);

  // Insert updated claim
  insertClaim(db, updatedClaim);

  // Now transition to DEPRECATED
  return transitionClaim(
    db,
    {
      claimId,
      toState: "DEPRECATED",
      reason,
      evidenceRefs: []
    },
    [], // no evidence needed for deprecation
    { minDistinctSessions: 1 } as QuarantinePolicy, // dummy policy
    updatedClaim.claim_hash,
    signFn
  );
}

/**
 * Shortcut to revoke a claim
 */
export function revokeClaim(
  db: Database.Database,
  claimId: string,
  reason: string,
  prevClaimHash: string,
  signFn: (digestHex: string) => string
): ClaimTransition {
  return transitionClaim(
    db,
    {
      claimId,
      toState: "REVOKED",
      reason,
      evidenceRefs: []
    },
    [], // no evidence needed for revocation
    { minDistinctSessions: 1 } as QuarantinePolicy, // dummy policy
    prevClaimHash,
    signFn
  );
}

/**
 * Batch auto-expire stale claims
 *
 * - PROVISIONAL claims past TTL → transition to QUARANTINE for re-verification
 * - QUARANTINE claims past TTL → REVOKE as expired
 */
export function autoExpireStale(
  db: Database.Database,
  agentId: string,
  policy: QuarantinePolicy,
  now: number,
  signFn: (digestHex: string) => string
): ClaimTransition[] {
  const transitions: ClaimTransition[] = [];

  // Get PROVISIONAL claims
  const provisionalClaims = getClaimsByState(db, agentId, "PROVISIONAL");
  const provisionalTtlMs = policy.provisionalTtlMs;

  for (const claim of provisionalClaims) {
    const age = now - claim.lastVerifiedTs;
    if (age > provisionalTtlMs) {
      // Revert to QUARANTINE for re-verification
      try {
        const transition = transitionClaim(
          db,
          {
            claimId: claim.claimId,
            toState: "QUARANTINE",
            reason: `Re-quarantined after ${Math.floor(age / 1000 / 60 / 60)} hours without re-verification`,
            evidenceRefs: []
          },
          [],
          policy,
          claim.claim_hash,
          signFn
        );
        transitions.push(transition);
      } catch (err) {
        // Log but continue with other claims
        console.error(`Failed to re-quarantine claim ${claim.claimId}:`, err);
      }
    }
  }

  // Get QUARANTINE claims
  const quarantineClaims = getClaimsByState(db, agentId, "QUARANTINE");
  const quarantineTtlMs = policy.quarantineTtlMs;

  for (const claim of quarantineClaims) {
    const age = now - claim.createdTs;
    if (age > quarantineTtlMs) {
      // Revoke as expired
      try {
        const transition = revokeClaim(
          db,
          claim.claimId,
          `Expired after ${Math.floor(age / 1000 / 60 / 60 / 24)} days in QUARANTINE`,
          claim.claim_hash,
          signFn
        );
        transitions.push(transition);
      } catch (err) {
        // Log but continue with other claims
        console.error(`Failed to revoke expired claim ${claim.claimId}:`, err);
      }
    }
  }

  return transitions;
}
