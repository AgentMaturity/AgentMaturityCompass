/**
 * Cross-Agent Trust Protocol
 *
 * From Moltbook research: agents struggle with cross-platform identity,
 * trust bootstrapping, and web-of-trust without human intermediary.
 *
 * AMC-native agent-to-agent trust verification protocol.
 */

import { createHash, createHmac } from 'node:crypto';
import { type MaturityLevel } from './formalSpec.js';

function scoreToLevel(score: number): MaturityLevel {
  if (score >= 0.9) return 'L5';
  if (score >= 0.75) return 'L4';
  if (score >= 0.55) return 'L3';
  if (score >= 0.35) return 'L2';
  if (score >= 0.15) return 'L1';
  return 'L0';
}

export interface AgentIdentityClaim {
  agentId: string;
  publicKeyHash: string;           // SHA-256 of agent's public signing key
  amcPassportId?: string;          // Agent Passport ID (if issued)
  amcScore?: number;               // Last known AMC score
  amcLevel?: string;               // e.g. 'L3'
  issuingWorkspace: string;        // AMC workspace that issued this identity
  issuedAt: Date;
  expiresAt?: Date;
  signature: string;               // HMAC-SHA256 of claim fields
}

export interface TrustVerificationResult {
  trusted: boolean;
  trustLevel: 'full' | 'conditional' | 'limited' | 'untrusted';
  reasons: string[];
  score: number;           // 0–1 composite trust score
  level: MaturityLevel;    // L0–L5 derived from score
  grantedScopes: string[]; // what this agent is allowed to do
  requiredActions?: string[];
}

export interface TrustPolicyRule {
  minAmcScore?: number;
  minAmcLevel?: string;
  requirePassport: boolean;
  requireFreshness: boolean;       // claim must be < 24h old
  allowedWorkspaces?: string[];    // whitelist of trusted workspaces
}

const LEVEL_ORDER = ['L1', 'L2', 'L3', 'L4', 'L5'];

function levelToNum(level: string): number {
  return LEVEL_ORDER.indexOf(level);
}

export function verifyAgentClaim(
  claim: AgentIdentityClaim,
  policy: TrustPolicyRule,
  sharedSecret: string,
): TrustVerificationResult {
  const reasons: string[] = [];
  let score = 0;

  // 1. Signature check (0.30)
  const payload = `${claim.agentId}:${claim.publicKeyHash}:${claim.issuingWorkspace}:${claim.issuedAt.toISOString()}`;
  const expectedSig = createHmac('sha256', sharedSecret).update(payload).digest('hex');
  const sigValid = claim.signature === expectedSig;
  if (sigValid) { score += 0.30; reasons.push('Signature valid'); }
  else { reasons.push('SIGNATURE INVALID — claim may be forged'); }

  // 2. Freshness check (0.15)
  const ageHours = (Date.now() - claim.issuedAt.getTime()) / 3600000;
  const expired = claim.expiresAt && claim.expiresAt < new Date();
  if (!policy.requireFreshness || (ageHours < 24 && !expired)) {
    score += 0.15;
    reasons.push(`Claim is fresh (${ageHours.toFixed(1)}h old)`);
  } else {
    reasons.push(`Claim is stale (${ageHours.toFixed(1)}h old) — exceeds 24h freshness requirement`);
  }

  // 3. AMC Score check (0.20)
  if (policy.minAmcScore !== undefined) {
    const agentScore = claim.amcScore ?? 0;
    if (agentScore >= policy.minAmcScore) {
      score += 0.20;
      reasons.push(`AMC score ${agentScore} meets minimum ${policy.minAmcScore}`);
    } else {
      reasons.push(`AMC score ${agentScore} below required ${policy.minAmcScore}`);
    }
  } else {
    score += 0.20;
  }

  // 4. AMC Level check (0.15)
  if (policy.minAmcLevel && claim.amcLevel) {
    if (levelToNum(claim.amcLevel) >= levelToNum(policy.minAmcLevel)) {
      score += 0.15;
      reasons.push(`AMC level ${claim.amcLevel} meets minimum ${policy.minAmcLevel}`);
    } else {
      reasons.push(`AMC level ${claim.amcLevel} below required ${policy.minAmcLevel}`);
    }
  } else {
    score += 0.15;
  }

  // 5. Passport check (0.10)
  if (!policy.requirePassport || claim.amcPassportId) {
    score += 0.10;
    if (claim.amcPassportId) reasons.push(`AMC Passport present: ${claim.amcPassportId}`);
  } else {
    reasons.push('AMC Passport required but not present');
  }

  // 6. Workspace check (0.10)
  if (!policy.allowedWorkspaces || policy.allowedWorkspaces.includes(claim.issuingWorkspace)) {
    score += 0.10;
  } else {
    reasons.push(`Workspace '${claim.issuingWorkspace}' not in trusted workspace list`);
  }

  // Total possible: 1.0
  const trustLevel: TrustVerificationResult['trustLevel'] =
    !sigValid ? 'untrusted' :
    score >= 0.80 ? 'full' :
    score >= 0.60 ? 'conditional' :
    score >= 0.40 ? 'limited' :
    'untrusted';

  const grantedScopes =
    trustLevel === 'full' ? ['read', 'write', 'execute', 'delegate'] :
    trustLevel === 'conditional' ? ['read', 'write'] :
    trustLevel === 'limited' ? ['read'] :
    [];

  const requiredActions: string[] = [];
  if (!claim.amcPassportId) requiredActions.push('Issue AMC Passport: amc passport create --agent ' + claim.agentId);
  if (ageHours > 24) requiredActions.push('Refresh identity claim: amc identity refresh --agent ' + claim.agentId);

  return {
    trusted: trustLevel !== 'untrusted',
    trustLevel, reasons, score,
    level: scoreToLevel(score),
    grantedScopes,
    requiredActions: requiredActions.length ? requiredActions : undefined,
  };
}

// ── Trust Transitivity ─────────────────────────────────────────────────────

/**
 * Trust transitivity: if A trusts B and B trusts C, what trust does A grant C?
 *
 * Trust decays at each hop:
 *   transitiveScore = score_AB × score_BC × decayFactor^hops
 *
 * Scopes are intersected (C only gets scopes that both B and A→B grant).
 * Maximum chain depth is configurable (default: 3).
 */

export interface TrustEdge {
  from: string;         // agent ID
  to: string;           // agent ID
  score: number;        // 0–1
  scopes: string[];
  establishedAt: number; // timestamp ms
  ttlMs?: number;        // time-to-live for this edge
}

export interface TrustGraph {
  edges: TrustEdge[];
}

export interface TransitiveTrustResult {
  from: string;
  to: string;
  transitiveScore: number;       // 0–1
  maturityLevel: MaturityLevel;  // L0–L5 derived from transitiveScore
  effectiveScopes: string[];
  path: string[];           // agent IDs in the trust chain
  hops: number;
  decayApplied: number;     // total decay multiplier
  weakestLink: { from: string; to: string; score: number };
  expired: boolean;
}

export function computeTransitiveTrust(
  graph: TrustGraph,
  from: string,
  to: string,
  opts?: { maxHops?: number; decayPerHop?: number; now?: number },
): TransitiveTrustResult | null {
  const maxHops = opts?.maxHops ?? 3;
  const decayPerHop = opts?.decayPerHop ?? 0.7;  // 30% decay per hop
  const now = opts?.now ?? Date.now();

  // BFS shortest path with highest trust
  const visited = new Set<string>();
  const queue: Array<{ agent: string; path: string[]; score: number; scopes: string[]; weakest: TrustEdge }> = [];

  // Seed with direct edges from 'from'
  for (const edge of graph.edges) {
    if (edge.from === from && !isEdgeExpired(edge, now)) {
      queue.push({
        agent: edge.to,
        path: [from, edge.to],
        score: edge.score,
        scopes: [...edge.scopes],
        weakest: edge,
      });
    }
  }

  let bestResult: TransitiveTrustResult | null = null;

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current.agent === to) {
      const hops = current.path.length - 1;
      const decay = Math.pow(decayPerHop, hops - 1); // First hop has no decay
      const transitiveScore = current.score * decay; // Already 0–1 scale
      const result: TransitiveTrustResult = {
        from, to,
        transitiveScore: Math.round(transitiveScore * 1000) / 1000,
        maturityLevel: scoreToLevel(transitiveScore),
        effectiveScopes: current.scopes,
        path: current.path,
        hops,
        decayApplied: decay,
        weakestLink: { from: current.weakest.from, to: current.weakest.to, score: current.weakest.score },
        expired: false,
      };
      if (!bestResult || result.transitiveScore > bestResult.transitiveScore) {
        bestResult = result;
      }
      continue;
    }

    if (visited.has(current.agent)) continue;
    if (current.path.length > maxHops) continue;
    visited.add(current.agent);

    // Explore next hops
    for (const edge of graph.edges) {
      if (edge.from === current.agent && !visited.has(edge.to) && !isEdgeExpired(edge, now)) {
        const combinedScore = current.score * edge.score;  // Both 0–1, product stays 0–1
        const intersectedScopes = current.scopes.filter(s => edge.scopes.includes(s));
        const weakest = edge.score < current.weakest.score ? edge : current.weakest;

        queue.push({
          agent: edge.to,
          path: [...current.path, edge.to],
          score: combinedScore,
          scopes: intersectedScopes,
          weakest,
        });
      }
    }
  }

  return bestResult;
}

// ── Temporal Trust Decay ───────────────────────────────────────────────────

/**
 * Temporal decay: trust scores degrade over time if not refreshed.
 *
 * Models:
 * - Exponential: score × e^(-λt)  where λ is decay rate, t is hours since establishment
 * - Linear: score × max(0, 1 - t/maxAge)
 * - Step: full trust until threshold, then drops to reduced level
 *
 * Industry-specific decay rates are configurable.
 */

export type DecayModel = "exponential" | "linear" | "step";

export interface TemporalDecayConfig {
  model: DecayModel;
  halfLifeHours: number;       // For exponential: hours until trust halves
  maxAgeHours: number;         // For linear: hours until trust reaches 0
  stepThresholdHours: number;  // For step: hours until step-down
  stepReduction: number;       // For step: score multiplier after step (e.g., 0.5)
}

export const INDUSTRY_DECAY_PRESETS: Record<string, TemporalDecayConfig> = {
  healthcare: { model: "exponential", halfLifeHours: 4, maxAgeHours: 24, stepThresholdHours: 6, stepReduction: 0.3 },
  finance: { model: "exponential", halfLifeHours: 8, maxAgeHours: 48, stepThresholdHours: 12, stepReduction: 0.4 },
  defense: { model: "step", halfLifeHours: 2, maxAgeHours: 12, stepThresholdHours: 4, stepReduction: 0.2 },
  entertainment: { model: "linear", halfLifeHours: 72, maxAgeHours: 168, stepThresholdHours: 48, stepReduction: 0.7 },
  general: { model: "exponential", halfLifeHours: 24, maxAgeHours: 168, stepThresholdHours: 48, stepReduction: 0.5 },
};

export function applyTemporalDecay(
  originalScore: number,
  establishedAt: number,
  config: TemporalDecayConfig,
  now?: number,
): number {
  const elapsed = ((now ?? Date.now()) - establishedAt) / 3600000; // hours
  if (elapsed < 0) return originalScore;

  switch (config.model) {
    case "exponential": {
      const lambda = Math.LN2 / config.halfLifeHours;
      return originalScore * Math.exp(-lambda * elapsed);
    }
    case "linear": {
      const factor = Math.max(0, 1 - elapsed / config.maxAgeHours);
      return originalScore * factor;
    }
    case "step": {
      return elapsed < config.stepThresholdHours
        ? originalScore
        : originalScore * config.stepReduction;
    }
  }
}

function isEdgeExpired(edge: TrustEdge, now: number): boolean {
  if (edge.ttlMs && (now - edge.establishedAt) > edge.ttlMs) return true;
  return false;
}

// ── Trust Inheritance ──────────────────────────────────────────────────────

/**
 * When Agent-A delegates to Agent-B, what trust does B inherit?
 *
 * Rules:
 * - Delegated agent inherits AT MOST the delegator's scopes (can't escalate)
 * - Inherited score = min(delegator's score, delegate's own score) × inheritFactor
 * - Inheritance can be restricted by policy
 */

export interface DelegationPolicy {
  inheritFactor: number;        // 0–1, how much trust is inherited (default: 0.8)
  scopeRestrictions?: string[]; // Only these scopes can be inherited
  maxDelegationDepth: number;   // How many levels of re-delegation allowed
  requireExplicitGrant: boolean; // Must delegator explicitly grant each scope?
}

export interface InheritedTrust {
  delegatorId: string;
  delegateId: string;
  inheritedScore: number;
  inheritedScopes: string[];
  delegationDepth: number;
  restrictions: string[];
}

export function computeInheritedTrust(
  delegatorTrust: TrustVerificationResult,
  delegateScore: number,
  policy: DelegationPolicy,
  delegationDepth: number = 1,
): InheritedTrust {
  if (delegationDepth > policy.maxDelegationDepth) {
    return {
      delegatorId: "", delegateId: "",
      inheritedScore: 0, inheritedScopes: [],
      delegationDepth,
      restrictions: [`Delegation depth ${delegationDepth} exceeds maximum ${policy.maxDelegationDepth}`],
    };
  }

  const baseScore = Math.min(delegatorTrust.score, delegateScore);
  const inheritedScore = baseScore * policy.inheritFactor * Math.pow(0.9, delegationDepth - 1);

  let inheritedScopes = [...delegatorTrust.grantedScopes];
  if (policy.scopeRestrictions) {
    inheritedScopes = inheritedScopes.filter(s => policy.scopeRestrictions!.includes(s));
  }
  // Delegated agents never get 'delegate' scope unless explicitly granted
  if (!policy.requireExplicitGrant) {
    inheritedScopes = inheritedScopes.filter(s => s !== "delegate");
  }

  const restrictions: string[] = [];
  if (inheritedScore < delegatorTrust.score) {
    restrictions.push(`Score reduced from ${delegatorTrust.score} to ${inheritedScore.toFixed(1)} via inheritance`);
  }
  if (inheritedScopes.length < delegatorTrust.grantedScopes.length) {
    restrictions.push(`Scopes restricted: ${delegatorTrust.grantedScopes.length} → ${inheritedScopes.length}`);
  }

  return {
    delegatorId: "", delegateId: "",
    inheritedScore: Math.round(inheritedScore * 10) / 10,
    inheritedScopes, delegationDepth, restrictions,
  };
}

export function createAgentClaim(
  agentId: string,
  publicKeyHash: string,
  issuingWorkspace: string,
  sharedSecret: string,
  opts?: { amcScore?: number; amcLevel?: string; amcPassportId?: string; ttlHours?: number },
): AgentIdentityClaim {
  const issuedAt = new Date();
  const expiresAt = opts?.ttlHours ? new Date(issuedAt.getTime() + opts.ttlHours * 3600000) : undefined;
  const payload = `${agentId}:${publicKeyHash}:${issuingWorkspace}:${issuedAt.toISOString()}`;
  const signature = createHmac('sha256', sharedSecret).update(payload).digest('hex');

  return {
    agentId, publicKeyHash, issuingWorkspace, issuedAt, expiresAt, signature,
    amcScore: opts?.amcScore,
    amcLevel: opts?.amcLevel,
    amcPassportId: opts?.amcPassportId,
  };
}
