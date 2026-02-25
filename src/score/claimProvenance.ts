/**
 * claimProvenance.ts — Claim-level provenance lifecycle for AMC
 *
 * Inspired by provenance tagging research's provenance tagging system.
 * Extends AMC's evidence trust tiers to the granularity of individual claims.
 *
 * Core insight: a claim cannot be promoted from HYPOTHESIS to DERIVED/USER_VERIFIED
 * without evidence spanning 2+ sessions. This is the "quarantine gate" that
 * prevents unverified observations from becoming operating policy.
 *
 * Integrates with AMC's existing EvidenceArtifact trust model:
 *   USER_VERIFIED  → maps to OBSERVED trust tier
 *   DERIVED        → maps to ATTESTED trust tier
 *   HYPOTHESIS     → maps to SELF_REPORTED (capped, can't unlock levels)
 *   SESSION_LOCAL  → ephemeral, never persisted across sessions
 *   REFERENCE_ONLY → background context, never actioned
 */

import { randomUUID } from 'node:crypto';

/* ── Types ────────────────────────────────────────────────────────── */

export type ClaimTier =
  | 'USER_VERIFIED'    // Human stated this directly — highest trust (OBSERVED equivalent)
  | 'DERIVED'          // Pattern observed across 2+ sessions — high trust (ATTESTED equivalent)
  | 'HYPOTHESIS'       // A guess — must not become policy without evidence (SELF_REPORTED)
  | 'SESSION_LOCAL'    // True now only — do not carry forward across sessions
  | 'REFERENCE_ONLY';  // Background info — never act on daily

export const CLAIM_TIER_WEIGHTS: Record<ClaimTier, number> = {
  USER_VERIFIED: 1.0,
  DERIVED: 0.8,
  HYPOTHESIS: 0.4,
  SESSION_LOCAL: 0.2,
  REFERENCE_ONLY: 0.1,
};

/** Mirrors AMC's EvidenceArtifact trust multipliers */
export const CLAIM_TIER_TO_EVIDENCE_KIND: Record<ClaimTier, 'observed' | 'attested' | 'self_reported'> = {
  USER_VERIFIED: 'observed',
  DERIVED: 'attested',
  HYPOTHESIS: 'self_reported',
  SESSION_LOCAL: 'self_reported',
  REFERENCE_ONLY: 'self_reported',
};

export interface Claim {
  id: string;
  text: string;
  tier: ClaimTier;
  agentId: string;
  sessionIds: string[];         // sessions where this claim appeared
  evidenceRefs: string[];       // AMC evidence artifact IDs supporting this claim
  createdAt: Date;
  lastSeenAt: Date;
  promotedAt?: Date;
  promotedFrom?: ClaimTier;
  quarantined: boolean;
  quarantineReason?: string;
  confidence: number;           // 0–1, decays without new evidence
  tags: string[];
}

export interface PromotionResult {
  success: boolean;
  claim?: Claim;
  error?: string;
  requiredSessions?: number;
  actualSessions?: number;
}

export interface ClaimProvenanceStore {
  claims: Map<string, Claim>;
  addClaim(claim: Omit<Claim, 'id' | 'createdAt' | 'lastSeenAt' | 'quarantined' | 'confidence'>): Claim;
  getClaim(id: string): Claim | undefined;
  getByTier(tier: ClaimTier): Claim[];
  getByAgent(agentId: string): Claim[];
  promote(claimId: string, targetTier: ClaimTier, evidenceRefs?: string[]): PromotionResult;
  quarantine(claimId: string, reason: string): Claim | undefined;
  addSessionObservation(claimId: string, sessionId: string): Claim | undefined;
  purgeSessonLocal(): number;   // remove SESSION_LOCAL claims — call at session end
  toJSON(): object;
}

/* ── Validation ───────────────────────────────────────────────────── */

const MIN_SESSIONS_FOR_DERIVED = 2;
const MIN_SESSIONS_FOR_USER_VERIFIED = 1;  // human verification is sufficient

/** Tier promotion rules — what can go to what */
const ALLOWED_PROMOTIONS: Record<ClaimTier, ClaimTier[]> = {
  HYPOTHESIS:      ['DERIVED', 'USER_VERIFIED', 'REFERENCE_ONLY'],
  DERIVED:         ['USER_VERIFIED'],
  USER_VERIFIED:   [],                     // top tier, can't be promoted further
  SESSION_LOCAL:   ['HYPOTHESIS'],         // can only become a hypothesis, not policy
  REFERENCE_ONLY:  ['HYPOTHESIS'],
};

export function isPromotionValid(claim: Claim, targetTier: ClaimTier): { valid: boolean; reason?: string } {
  // Can't demote
  const tierOrder: ClaimTier[] = ['REFERENCE_ONLY', 'SESSION_LOCAL', 'HYPOTHESIS', 'DERIVED', 'USER_VERIFIED'];
  const currentIdx = tierOrder.indexOf(claim.tier);
  const targetIdx = tierOrder.indexOf(targetTier);
  if (targetIdx < currentIdx) {
    return { valid: false, reason: `Cannot demote claim from ${claim.tier} to ${targetTier}` };
  }

  // Check allowed transitions
  const allowed = ALLOWED_PROMOTIONS[claim.tier];
  if (!allowed.includes(targetTier)) {
    return { valid: false, reason: `Promotion from ${claim.tier} → ${targetTier} is not allowed` };
  }

  // Quarantined claims cannot be promoted
  if (claim.quarantined) {
    return { valid: false, reason: `Claim is quarantined: ${claim.quarantineReason}` };
  }

  // HYPOTHESIS → DERIVED requires 2+ sessions (the quarantine gate)
  if (claim.tier === 'HYPOTHESIS' && targetTier === 'DERIVED') {
    if (claim.sessionIds.length < MIN_SESSIONS_FOR_DERIVED) {
      return {
        valid: false,
        reason: `HYPOTHESIS requires ${MIN_SESSIONS_FOR_DERIVED} sessions to become DERIVED (has ${claim.sessionIds.length})`,
      };
    }
  }

  // HYPOTHESIS → USER_VERIFIED requires explicit evidence ref
  if (claim.tier === 'HYPOTHESIS' && targetTier === 'USER_VERIFIED') {
    if (claim.evidenceRefs.length === 0) {
      return { valid: false, reason: 'USER_VERIFIED requires at least one evidence reference' };
    }
  }

  return { valid: true };
}

/* ── Claim factory ────────────────────────────────────────────────── */

export function createClaim(params: {
  text: string;
  tier: ClaimTier;
  agentId: string;
  sessionId: string;
  evidenceRefs?: string[];
  tags?: string[];
}): Claim {
  return {
    id: `claim_${randomUUID()}`,
    text: params.text,
    tier: params.tier,
    agentId: params.agentId,
    sessionIds: [params.sessionId],
    evidenceRefs: params.evidenceRefs ?? [],
    createdAt: new Date(),
    lastSeenAt: new Date(),
    quarantined: params.tier === 'SESSION_LOCAL',  // SESSION_LOCAL is auto-quarantined from promotion
    quarantineReason: params.tier === 'SESSION_LOCAL' ? 'SESSION_LOCAL claims cannot be promoted without tier change' : undefined,
    confidence: CLAIM_TIER_WEIGHTS[params.tier],
    tags: params.tags ?? [],
  };
}

/* ── Promotion ────────────────────────────────────────────────────── */

export function promoteClaim(claim: Claim, targetTier: ClaimTier, newEvidenceRefs?: string[]): PromotionResult {
  const validation = isPromotionValid(claim, targetTier);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.reason,
      requiredSessions: targetTier === 'DERIVED' ? MIN_SESSIONS_FOR_DERIVED : undefined,
      actualSessions: claim.sessionIds.length,
    };
  }

  const promoted: Claim = {
    ...claim,
    tier: targetTier,
    promotedAt: new Date(),
    promotedFrom: claim.tier,
    evidenceRefs: [...claim.evidenceRefs, ...(newEvidenceRefs ?? [])],
    confidence: CLAIM_TIER_WEIGHTS[targetTier],
    quarantined: false,
    quarantineReason: undefined,
  };

  return { success: true, claim: promoted };
}

export function quarantineClaim(claim: Claim, reason: string): Claim {
  return {
    ...claim,
    quarantined: true,
    quarantineReason: reason,
    tier: 'SESSION_LOCAL',  // quarantine = demote to session-local
  };
}

/* ── In-memory store ──────────────────────────────────────────────── */

export class ClaimProvenanceRegistry implements ClaimProvenanceStore {
  readonly claims = new Map<string, Claim>();

  addClaim(params: Omit<Claim, 'id' | 'createdAt' | 'lastSeenAt' | 'quarantined' | 'confidence'>): Claim {
    // Check for duplicate text+agent (upsert by session observation)
    const existing = [...this.claims.values()].find(
      c => c.text === params.text && c.agentId === params.agentId,
    );
    if (existing) {
      return this.addSessionObservation(existing.id, params.sessionIds[0]!) ?? existing;
    }

    const claim = createClaim({
      text: params.text,
      tier: params.tier,
      agentId: params.agentId,
      sessionId: params.sessionIds[0] ?? 'unknown',
      evidenceRefs: params.evidenceRefs,
      tags: params.tags,
    });
    // Add any additional session IDs provided
    if (params.sessionIds.length > 1) {
      for (const sid of params.sessionIds.slice(1)) {
        claim.sessionIds.push(sid);
      }
    }
    this.claims.set(claim.id, claim);
    return claim;
  }

  getClaim(id: string): Claim | undefined {
    return this.claims.get(id);
  }

  getByTier(tier: ClaimTier): Claim[] {
    return [...this.claims.values()].filter(c => c.tier === tier);
  }

  getByAgent(agentId: string): Claim[] {
    return [...this.claims.values()].filter(c => c.agentId === agentId);
  }

  promote(claimId: string, targetTier: ClaimTier, evidenceRefs?: string[]): PromotionResult {
    const claim = this.claims.get(claimId);
    if (!claim) return { success: false, error: `Claim ${claimId} not found` };

    const result = promoteClaim(claim, targetTier, evidenceRefs);
    if (result.success && result.claim) {
      this.claims.set(claimId, result.claim);
    }
    return result;
  }

  quarantine(claimId: string, reason: string): Claim | undefined {
    const claim = this.claims.get(claimId);
    if (!claim) return undefined;
    const q = quarantineClaim(claim, reason);
    this.claims.set(claimId, q);
    return q;
  }

  addSessionObservation(claimId: string, sessionId: string): Claim | undefined {
    const claim = this.claims.get(claimId);
    if (!claim) return undefined;
    if (claim.sessionIds.includes(sessionId)) return claim;

    const updated: Claim = {
      ...claim,
      sessionIds: [...claim.sessionIds, sessionId],
      lastSeenAt: new Date(),
      // Confidence grows with each new session observation (capped at tier max)
      confidence: Math.min(CLAIM_TIER_WEIGHTS[claim.tier], claim.confidence + 0.1),
    };
    this.claims.set(claimId, updated);
    return updated;
  }

  purgeSessonLocal(): number {
    let count = 0;
    for (const [id, claim] of this.claims) {
      if (claim.tier === 'SESSION_LOCAL') {
        this.claims.delete(id);
        count++;
      }
    }
    return count;
  }

  /** Summary for AMC Score integration */
  getProvenanceSummary(agentId: string): {
    total: number;
    byTier: Record<ClaimTier, number>;
    quarantined: number;
    readyToPromote: number;
    trustWeightedScore: number;
    independentVerificationRate: number;
    narrativeLockInRisk: boolean;
  } {
    const agentClaims = this.getByAgent(agentId);
    const byTier = {
      USER_VERIFIED: 0, DERIVED: 0, HYPOTHESIS: 0, SESSION_LOCAL: 0, REFERENCE_ONLY: 0,
    } as Record<ClaimTier, number>;

    let weightedSum = 0;
    let readyToPromote = 0;

    for (const c of agentClaims) {
      byTier[c.tier]++;
      weightedSum += CLAIM_TIER_WEIGHTS[c.tier];

      // Ready to promote: HYPOTHESIS with 2+ sessions, not quarantined
      if (c.tier === 'HYPOTHESIS' && c.sessionIds.length >= MIN_SESSIONS_FOR_DERIVED && !c.quarantined) {
        readyToPromote++;
      }
    }

    // Independent verification: USER_VERIFIED and DERIVED are independently verified;
    // HYPOTHESIS, SESSION_LOCAL, REFERENCE_ONLY are self-reported
    const independentlyVerified = byTier.USER_VERIFIED + byTier.DERIVED;
    const independentVerificationRate = agentClaims.length > 0
      ? independentlyVerified / agentClaims.length
      : 0;
    const narrativeLockInRisk = agentClaims.length > 0 && independentVerificationRate < 0.5;

    return {
      total: agentClaims.length,
      byTier,
      quarantined: agentClaims.filter(c => c.quarantined).length,
      readyToPromote,
      trustWeightedScore: agentClaims.length > 0 ? weightedSum / agentClaims.length : 0,
      independentVerificationRate,
      narrativeLockInRisk,
    };
  }

  toJSON(): object {
    return {
      claims: Object.fromEntries(
        [...this.claims.entries()].map(([id, c]) => [id, {
          ...c,
          createdAt: c.createdAt.toISOString(),
          lastSeenAt: c.lastSeenAt.toISOString(),
          promotedAt: c.promotedAt?.toISOString(),
        }]),
      ),
    };
  }
}
