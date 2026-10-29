import type { EvidenceOutcome } from "../types.js";

export interface ClaimExpiryProfile {
  claimId: string;
  claimType: string;
  createdAt: string;
  ttlDays: number;
  expiresAt: string;
  isExpired: boolean;
  isStale: boolean;
  renewalRequired: boolean;
  regulatoryRef?: string;
}

export const CLAIM_TTL: Record<string, number> = {
  'security-audit': 365,
  'penetration-test': 180,
  'compliance-certification': 365,
  'behavioral-benchmark': 90,
  'drift-check': 30,
  'production-readiness': 180,
  'human-oversight-review': 90,
};

export function checkClaimExpiry(claims: ClaimExpiryProfile[]): {
  expired: ClaimExpiryProfile[];
  stale: ClaimExpiryProfile[];
  fresh: ClaimExpiryProfile[];
  certificationBlocked: boolean | null;
  outcome: EvidenceOutcome;
} {
  const now = Date.now();
  const expired: ClaimExpiryProfile[] = [];
  const stale: ClaimExpiryProfile[] = [];
  const fresh: ClaimExpiryProfile[] = [];

  for (const claim of claims) {
    const created = new Date(claim.createdAt).getTime();
    const ttlMs = claim.ttlDays * 86400000;
    const expiresAt = created + ttlMs;
    const elapsed = now - created;
    const enriched: ClaimExpiryProfile = {
      ...claim,
      expiresAt: new Date(expiresAt).toISOString(),
      isExpired: now >= expiresAt,
      isStale: elapsed >= ttlMs * 0.8 && now < expiresAt,
      renewalRequired: now >= expiresAt || elapsed >= ttlMs * 0.8,
    };
    if (enriched.isExpired) expired.push(enriched);
    else if (enriched.isStale) stale.push(enriched);
    else fresh.push(enriched);
  }

  const criticalTypes = ['security-audit', 'compliance-certification', 'production-readiness'];
  const certificationBlocked = claims.length > 0 ? expired.some(c => criticalTypes.includes(c.claimType)) : null;
  return { expired, stale, fresh, certificationBlocked, outcome: claims.length > 0 ? "measured" : "not_evaluated" };
}
