import type { Claim, ClaimLifecycleState } from "./claimTypes.js";
import type { TrustTier, EvidenceEvent } from "../types.js";
import type { QuarantinePolicy } from "./quarantine.js";

/**
 * Evidence summary extracted from evidence events for promotion evaluation
 */
export interface EvidenceSummary {
  distinctSessions: number;
  distinctDays: number;
  totalEvents: number;
  hasObservedEvidence: boolean;
  highestTrustTier: TrustTier;
  confidence: number;
}

/**
 * Result of promotion gate evaluation
 */
export interface PromotionEvaluation {
  claimId: string;
  currentState: ClaimLifecycleState;
  requestedState: ClaimLifecycleState;
  allowed: boolean;
  reasons: string[]; // why allowed or denied
  missingCriteria: string[]; // what's still needed for promotion
  evidenceSummary: EvidenceSummary;
}

/**
 * Extract evidence summary from raw evidence events
 * Maps event metadata to sessions, days, and trust tier hierarchy
 */
function summarizeEvidence(
  evidenceEvents: EvidenceEvent[],
  claimConfidence: number
): EvidenceSummary {
  const sessionIds = new Set<string>();
  const dayStrings = new Set<string>();
  let highestTrustTier: TrustTier = "SELF_REPORTED";
  let hasObservedEvidence = false;

  // Infer trust tier from event types and meta
  const trustTierRanking = {
    OBSERVED: 3,
    OBSERVED_HARDENED: 4,
    ATTESTED: 2,
    SELF_REPORTED: 1
  };

  for (const event of evidenceEvents) {
    // Track distinct sessions
    sessionIds.add(event.session_id);

    // Track distinct days (parse event timestamp)
    const date = new Date(event.ts);
    const dayStr = date.toISOString().split("T")[0] ?? date.toISOString();
    dayStrings.add(dayStr);

    // Infer trust tier from event type
    if (
      event.event_type === "metric" ||
      event.event_type === "test" ||
      event.event_type === "output_validated"
    ) {
      hasObservedEvidence = true;
      if (trustTierRanking[highestTrustTier] < trustTierRanking.OBSERVED) {
        highestTrustTier = "OBSERVED";
      }
    } else if (
      event.event_type === "audit" ||
      event.event_type === "review" ||
      event.event_type === "gateway"
    ) {
      if (trustTierRanking[highestTrustTier] < trustTierRanking.ATTESTED) {
        highestTrustTier = "ATTESTED";
      }
    } else if (
      event.event_type === "llm_request" ||
      event.event_type === "llm_response"
    ) {
      if (trustTierRanking[highestTrustTier] < trustTierRanking.SELF_REPORTED) {
        highestTrustTier = "SELF_REPORTED";
      }
    }
  }

  return {
    distinctSessions: sessionIds.size,
    distinctDays: dayStrings.size,
    totalEvents: evidenceEvents.length,
    hasObservedEvidence,
    highestTrustTier,
    confidence: claimConfidence
  };
}

/**
 * Evaluate whether a claim can be promoted to a requested state
 *
 * Promotion logic:
 * 1. Check if claim's provenance tag is in nonPromotableTags → deny
 * 2. QUARANTINE → PROVISIONAL: requires minEvidenceEvents
 * 3. PROVISIONAL → PROMOTED: requires ALL of minDistinctSessions, minDistinctDays,
 *    requireObservedEvidence (if set), minConfidenceForPromotion
 * 4. Any → DEPRECATED: always allowed
 * 5. Any → REVOKED: always allowed
 * 6. PROMOTED → QUARANTINE: not allowed (must REVOKE first)
 * 7. Invalid transitions: denied
 */
export function evaluatePromotion(
  claim: Claim,
  evidenceEvents: EvidenceEvent[],
  policy: QuarantinePolicy
): PromotionEvaluation {
  const reasons: string[] = [];
  const missingCriteria: string[] = [];

  const summary = summarizeEvidence(evidenceEvents, claim.confidence);
  const requestedState = claim.lifecycleState; // Assumed to be the "to" state from context

  // Helper: check if transition is valid
  const validTransitions: Record<ClaimLifecycleState, ClaimLifecycleState[]> = {
    QUARANTINE: ["PROVISIONAL", "EXPIRED", "REVOKED"],
    PROVISIONAL: ["PROMOTED", "QUARANTINE", "EXPIRED", "DEPRECATED", "REVOKED"],
    PROMOTED: ["EXPIRED", "DEPRECATED", "REVOKED"],
    EXPIRED: ["REVOKED"],
    DEPRECATED: ["REVOKED"],
    REVOKED: []
  };

  // We evaluate as if transitioning to requestedState
  // In actual usage, this is called BEFORE the transition happens
  const currentState = claim.lifecycleState;
  const isValidTransition =
    validTransitions[currentState]?.includes(requestedState) ?? false;

  // Check 1: Provenance tag in nonPromotableTags
  if (policy.nonPromotableTags.includes(claim.provenanceTag)) {
    return {
      claimId: claim.claimId,
      currentState,
      requestedState,
      allowed: false,
      reasons: [
        `Provenance tag "${claim.provenanceTag}" is in non-promotable list`
      ],
      missingCriteria: [
        `Only claims with promotable provenance tags can be promoted`
      ],
      evidenceSummary: summary
    };
  }

  // Check 2: Invalid state transition
  if (!isValidTransition) {
    return {
      claimId: claim.claimId,
      currentState,
      requestedState,
      allowed: false,
      reasons: [
        `Invalid state transition from ${currentState} to ${requestedState}`
      ],
      missingCriteria: [],
      evidenceSummary: summary
    };
  }

  // Check 3: PROMOTED → QUARANTINE not allowed
  if (currentState === "PROMOTED" && requestedState === "QUARANTINE") {
    return {
      claimId: claim.claimId,
      currentState,
      requestedState,
      allowed: false,
      reasons: [
        `Cannot revert PROMOTED claim to QUARANTINE; must REVOKE instead`
      ],
      missingCriteria: [],
      evidenceSummary: summary
    };
  }

  // Check 4: terminal transitions to EXPIRED/DEPRECATED/REVOKED are always allowed
  if (requestedState === "EXPIRED" || requestedState === "DEPRECATED" || requestedState === "REVOKED") {
    if (requestedState === "REVOKED") {
      reasons.push("Revocation is always allowed");
    } else if (requestedState === "EXPIRED") {
      reasons.push("Expiry is always allowed");
    } else {
      reasons.push("Deprecation is always allowed");
    }
    return {
      claimId: claim.claimId,
      currentState,
      requestedState,
      allowed: true,
      reasons,
      missingCriteria: [],
      evidenceSummary: summary
    };
  }

  // Check 5: QUARANTINE → PROVISIONAL requires minEvidenceEvents
  if (currentState === "QUARANTINE" && requestedState === "PROVISIONAL") {
    if (summary.totalEvents < policy.minEvidenceEvents) {
      missingCriteria.push(
        `Need ${policy.minEvidenceEvents} evidence events; have ${summary.totalEvents}`
      );
      return {
        claimId: claim.claimId,
        currentState,
        requestedState,
        allowed: false,
        reasons: [
          `Insufficient evidence to promote from QUARANTINE to PROVISIONAL`
        ],
        missingCriteria,
        evidenceSummary: summary
      };
    }
    reasons.push(
      `Evidence meets minimum threshold (${summary.totalEvents} >= ${policy.minEvidenceEvents})`
    );
    return {
      claimId: claim.claimId,
      currentState,
      requestedState,
      allowed: true,
      reasons,
      missingCriteria: [],
      evidenceSummary: summary
    };
  }

  // Check 6: PROVISIONAL → PROMOTED requires comprehensive evidence
  if (currentState === "PROVISIONAL" && requestedState === "PROMOTED") {
    // All criteria must be met for PROMOTED promotion

    // 6a: minDistinctSessions
    if (summary.distinctSessions < policy.minDistinctSessions) {
      missingCriteria.push(
        `Need evidence from ${policy.minDistinctSessions} sessions; have ${summary.distinctSessions}`
      );
    } else {
      reasons.push(
        `Evidence spans ${summary.distinctSessions} sessions (requirement: ${policy.minDistinctSessions})`
      );
    }

    // 6b: minDistinctDays
    if (summary.distinctDays < policy.minDistinctDays) {
      missingCriteria.push(
        `Need evidence spanning ${policy.minDistinctDays} calendar days; have ${summary.distinctDays}`
      );
    } else {
      reasons.push(
        `Evidence spans ${summary.distinctDays} calendar days (requirement: ${policy.minDistinctDays})`
      );
    }

    // 6c: requireObservedEvidence
    if (policy.requireObservedEvidence && !summary.hasObservedEvidence) {
      missingCriteria.push(
        `Require at least one OBSERVED-tier evidence event; none found`
      );
    } else if (summary.hasObservedEvidence) {
      reasons.push(`Evidence includes OBSERVED-tier events`);
    }

    // 6d: minConfidenceForPromotion
    if (summary.confidence < policy.minConfidenceForPromotion) {
      missingCriteria.push(
        `Confidence too low: ${summary.confidence.toFixed(2)} < ${policy.minConfidenceForPromotion}`
      );
    } else {
      reasons.push(
        `Confidence meets threshold: ${summary.confidence.toFixed(2)} >= ${policy.minConfidenceForPromotion}`
      );
    }

    const canPromote = missingCriteria.length === 0;

    return {
      claimId: claim.claimId,
      currentState,
      requestedState,
      allowed: canPromote,
      reasons,
      missingCriteria,
      evidenceSummary: summary
    };
  }

  // Fallback: unknown transition (should have been caught above)
  return {
    claimId: claim.claimId,
    currentState,
    requestedState,
    allowed: false,
    reasons: [`Unhandled state transition`],
    missingCriteria: [],
    evidenceSummary: summary
  };
}

/**
 * Find claims that are stale and need action
 */
export interface StaleClaimsResult {
  stale: Array<{ claim: Claim; reason: string }>;
  expired: Array<{ claim: Claim; reason: string }>;
}

/**
 * Check for stale claims that need re-verification or have expired
 *
 * - PROVISIONAL claims past provisionalTtlMs need re-verification
 * - QUARANTINE claims past quarantineTtlMs have expired and should be revoked
 */
export function checkStaleClaims(
  claims: Claim[],
  policy: QuarantinePolicy,
  now: number = Date.now()
): StaleClaimsResult {
  const stale: Array<{ claim: Claim; reason: string }> = [];
  const expired: Array<{ claim: Claim; reason: string }> = [];

  for (const claim of claims) {
    // Skip terminal states
    if (
      claim.lifecycleState === "REVOKED"
      || claim.lifecycleState === "DEPRECATED"
      || claim.lifecycleState === "EXPIRED"
    ) {
      continue;
    }

    // Check PROVISIONAL claims
    if (claim.lifecycleState === "PROVISIONAL") {
      const age = now - claim.lastVerifiedTs;
      if (age > policy.provisionalTtlMs) {
        stale.push({
          claim,
          reason: `PROVISIONAL claim not verified for ${Math.floor(age / 1000 / 60 / 60)} hours`
        });
      }
    }

    // Check QUARANTINE claims
    if (claim.lifecycleState === "QUARANTINE") {
      const age = now - claim.createdTs;
      if (age > policy.quarantineTtlMs) {
        expired.push({
          claim,
          reason: `QUARANTINE claim created ${Math.floor(age / 1000 / 60 / 60 / 24)} days ago`
        });
      }
    }

    // PROMOTED claims don't have TTL unless explicitly set via expiryTs
    if (claim.lifecycleState === "PROMOTED" && claim.expiryTs !== null) {
      if (now > claim.expiryTs) {
        expired.push({
          claim,
          reason: `PROMOTED claim expiry reached`
        });
      }
    }
  }

  return { stale, expired };
}
