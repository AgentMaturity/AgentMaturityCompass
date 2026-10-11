/**
 * Cross-Agent Trust Protocol
 *
 * From Moltbook research: agents struggle with cross-platform identity,
 * trust bootstrapping, and web-of-trust without human intermediary.
 *
 * AMC-native agent-to-agent trust verification protocol.
 */

import { createHash, createHmac, randomBytes, sign, timingSafeEqual, verify } from 'node:crypto';
import { publicKeyFromPrivate } from '../crypto/keyHistoryEnvelope.js';
import { admitKey, type IssuerAdmission } from '../trust/admission.js';
import type { TrustContext } from '../trust/trustContext.js';
import { ed25519KeyId } from '../trust/trustList.js';
import { canonicalize } from '../utils/json.js';
import { type MaturityLevel } from './formalSpec.js';
import { scoreToLevel, toDisplayScore } from './scoringScale.js';

export interface AgentIdentityClaim {
  agentId: string;                 // the issuing agent
  publicKeyHash: string;           // SHA-256 of agent's public signing key
  amcPassportId?: string;          // Agent Passport ID (if issued)
  amcScore?: number;               // Last known AMC score
  amcLevel?: string;               // e.g. 'L3'
  issuingWorkspace: string;        // AMC workspace that issued this identity
  issuedAt: Date;
  expiresAt?: Date;
  signature: string;               // HMAC (hex) or Ed25519 (base64) over every field below, never over a subset
  /** P1-08: who the claim is for (the receiving agent or workspace); verified against the verifier's expectation. */
  audience?: string;
  /** P1-08: single-use value; a verifier's replay cache refuses it a second time. */
  nonce?: string;
  /** P1-08: the key that proved the claim and its purpose; an HMAC key never doubles as a signing key. */
  keyId?: string;
  keyPurpose?: 'agent-claim-hmac' | 'session';
}

export interface TrustVerificationResult {
  trusted: boolean;
  trustLevel: 'full' | 'conditional' | 'limited' | 'untrusted';
  reasons: string[];
  score: number;           // Display scale (default 0–100)
  level: MaturityLevel;    // L0–L5 derived from score
  grantedScopes: string[]; // what this agent is allowed to do
  requiredActions?: string[];
  /**
   * P1-08 (G6-10): what proved the claim. "shared-secret" is an HMAC any holder of the secret, every verifier included,
   * can forge; "ed25519" is a signature by the agent's session key; "none" did not verify.
   */
  integrity: ClaimIntegrity;
  /** Never above SELF_REPORTED for a shared secret; ATTESTED only for an Ed25519 session key admitted for `session`. */
  trustTier: 'ATTESTED' | 'SELF_REPORTED' | 'UNVERIFIED';
}

type ClaimIntegrity = 'shared-secret' | 'ed25519' | 'none';

export interface TrustPolicyRule {
  minAmcScore?: number;
  minAmcLevel?: string;
  requirePassport: boolean;
  requireFreshness: boolean;       // claim must be < 24h old
  allowedWorkspaces?: string[];    // whitelist of trusted workspaces
}

/**
 * What the verifier expects and allows (P1-08). The identity comes from the verified claim and must equal `issuer`;
 * `audience` must name this verifier; the issuer must be granted `requestedScope` by `grants` (the verifier's signed
 * policy: issuer agent id to allowed scopes). An unknown issuer or scope, or no expectation at all, refuses.
 */
export interface ClaimExpectation {
  audience: string;
  issuer: string;
  requestedScope: string;
  grants: Readonly<Record<string, readonly string[]>>;
  /**
   * The key ids the verifier binds to each issuer: an Ed25519 session key id, or an HMAC secret's claimHmacKeyId. A
   * claim verifies only with a key bound to the issuer it names, so one agent's key never speaks for another.
   */
  issuerKeyIds: Readonly<Record<string, readonly string[]>>;
  replay: ClaimReplayCache;
  revokedKeyIds?: readonly string[];
  now?: Date;
}

/** Claims live at most this long; an HMAC key's claims cannot outlive it by more. */
const MAX_CLAIM_LIFETIME_MS = 24 * 3600_000;
const DEFAULT_CLAIM_LIFETIME_MS = 3600_000;
const MAX_CLOCK_SKEW_MS = 60_000;
const MIN_SECRET_BYTES = 16;

/**
 * Replay protection for verified claims: each (key id, nonce) is admitted once until its claim expires, and each key at
 * most `maxUsesPerKey` times. A full cache refuses rather than forgets.
 * ponytail: in-memory per process; a restart forgets nonces of claims still valid (at most MAX_CLAIM_LIFETIME_MS); a
 * shared store is the upgrade when verifiers run as several processes.
 */
export class ClaimReplayCache {
  private readonly seen = new Map<string, number>();
  private readonly uses = new Map<string, number>();
  constructor(private readonly maxEntries = 100_000, private readonly maxUsesPerKey = 10_000) {}

  admit(keyId: string, nonce: string, expiresMs: number, nowMs: number): 'ok' | 'replay' | 'full' | 'key-exhausted' {
    for (const [entry, until] of this.seen) if (until < nowMs - MAX_CLOCK_SKEW_MS) this.seen.delete(entry);
    const entry = `${keyId}:${nonce}`;
    if (this.seen.has(entry)) return 'replay';
    if (this.seen.size >= this.maxEntries) return 'full';
    const used = this.uses.get(keyId) ?? 0;
    if (used >= this.maxUsesPerKey) return 'key-exhausted';
    this.seen.set(entry, expiresMs);
    this.uses.set(keyId, used + 1);
    return 'ok';
  }
}

const LEVEL_ORDER = ['L1', 'L2', 'L3', 'L4', 'L5'];

function levelToNum(level: string): number {
  return LEVEL_ORDER.indexOf(level);
}

const HMAC_TAG = 'AMC_AGENT_CLAIM_HMAC_V2';
const SIGNED_TAG = 'AMC_AGENT_CLAIM_V2';

/** The purpose-bound MAC key: derived from the shared secret, so the secret itself never keys anything else. */
function claimMacKey(sharedSecret: string): Buffer {
  if (typeof sharedSecret !== 'string' || Buffer.byteLength(sharedSecret, 'utf8') < MIN_SECRET_BYTES) {
    throw new Error(`the claim secret must be at least ${MIN_SECRET_BYTES} bytes`);
  }
  if (/PRIVATE KEY/.test(sharedSecret)) throw new Error('a signing key never doubles as a claim HMAC secret');
  return createHmac('sha256', sharedSecret).update(`${HMAC_TAG} key`).digest();
}

/** The id of an HMAC claim key, which names it without revealing it. */
export function claimHmacKeyId(sharedSecret: string): string {
  return createHmac('sha256', claimMacKey(sharedSecret)).update('key id').digest('hex');
}

/** Every bound field, canonical: issuer, audience, key purpose and id, times, nonce, and the claimed score and level. */
function claimBody(claim: AgentIdentityClaim): string {
  return canonicalize({
    v: 2, keyPurpose: claim.keyPurpose ?? null, keyId: claim.keyId ?? null, agentId: claim.agentId, audience: claim.audience ?? null,
    issuingWorkspace: claim.issuingWorkspace, publicKeyHash: claim.publicKeyHash,
    issuedAt: claim.issuedAt.toISOString(), expiresAt: claim.expiresAt?.toISOString() ?? null, nonce: claim.nonce ?? null,
    amcScore: claim.amcScore ?? null, amcLevel: claim.amcLevel ?? null, amcPassportId: claim.amcPassportId ?? null
  });
}

function hmacOf(claim: AgentIdentityClaim, sharedSecret: string): Buffer {
  return createHmac('sha256', claimMacKey(sharedSecret)).update(`${HMAC_TAG}\0`).update(claimBody(claim)).digest();
}

function signedClaimBytes(claim: AgentIdentityClaim): Buffer {
  return Buffer.from(`${SIGNED_TAG}\0${claimBody(claim)}`, 'utf8');
}

type ClaimOptions = { audience?: string; amcScore?: number; amcLevel?: string; amcPassportId?: string; ttlHours?: number };

function unsignedClaim(agentId: string, publicKeyHash: string, issuingWorkspace: string, opts: ClaimOptions | undefined,
  key: { keyId: string; keyPurpose: 'agent-claim-hmac' | 'session' }): AgentIdentityClaim {
  if (!opts?.audience) throw new Error('a claim needs an audience: the agent or workspace it is for');
  const lifetime = opts.ttlHours === undefined ? DEFAULT_CLAIM_LIFETIME_MS : opts.ttlHours * 3600_000;
  if (!(lifetime > 0) || lifetime > MAX_CLAIM_LIFETIME_MS) throw new Error(`ttlHours must be above 0 and at most ${MAX_CLAIM_LIFETIME_MS / 3600_000}`);
  const issuedAt = new Date();
  return {
    agentId, publicKeyHash, issuingWorkspace, issuedAt, expiresAt: new Date(issuedAt.getTime() + lifetime), signature: '',
    amcScore: opts.amcScore, amcLevel: opts.amcLevel, amcPassportId: opts.amcPassportId,
    audience: opts.audience, nonce: randomBytes(16).toString('hex'), ...key
  };
}

const refused = (integrity: ClaimIntegrity, reasons: string[]): TrustVerificationResult => ({
  trusted: false, trustLevel: 'untrusted', reasons, score: 0, level: scoreToLevel(0), grantedScopes: [], integrity, trustTier: 'UNVERIFIED'
});

/** Binding, lifetime, revocation, replay and authorization checks shared by both claim kinds; null when all pass. */
function bindingProblems(claim: AgentIdentityClaim, expected: ClaimExpectation | undefined, keyPurpose: 'agent-claim-hmac' | 'session', keyId: string): string[] | null {
  if (expected === undefined) return ['no verifier expectation (audience, issuer, scope, grants, replay cache): refusing'];
  const problems: string[] = [];
  const now = (expected.now ?? new Date()).getTime();
  if (claim.keyPurpose !== keyPurpose || claim.keyId !== keyId) problems.push('claim names another key or key purpose');
  if (expected.revokedKeyIds?.includes(keyId)) problems.push(`key ${keyId} is revoked`);
  if (claim.agentId !== expected.issuer) problems.push(`claim is from ${claim.agentId}, not the expected ${expected.issuer}`);
  const boundKeys = Object.hasOwn(expected.issuerKeyIds, expected.issuer) ? expected.issuerKeyIds[expected.issuer] : undefined;
  if (!boundKeys?.includes(keyId)) problems.push(`key ${keyId} is not bound to issuer ${expected.issuer}`);
  if (claim.audience !== expected.audience) problems.push(`claim is for ${claim.audience ?? 'no audience'}, not ${expected.audience}`);
  const issued = claim.issuedAt instanceof Date ? claim.issuedAt.getTime() : Number.NaN;
  const expires = claim.expiresAt instanceof Date ? claim.expiresAt.getTime() : Number.NaN;
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || expires <= issued || expires - issued > MAX_CLAIM_LIFETIME_MS) problems.push('claim lifetime is missing or longer than allowed');
  else if (issued > now + MAX_CLOCK_SKEW_MS) problems.push('claim is issued in the future');
  else if (now > expires + MAX_CLOCK_SKEW_MS) problems.push('claim expired');
  if (!claim.nonce || !/^[0-9a-f]{32}$/.test(claim.nonce)) problems.push('claim carries no nonce');
  const allowed = Object.hasOwn(expected.grants, expected.issuer) ? expected.grants[expected.issuer] : undefined;
  if (allowed === undefined) problems.push(`issuer ${expected.issuer} has no grant in the verifier's policy`);
  else if (!allowed.includes(expected.requestedScope)) problems.push(`issuer ${expected.issuer} is not granted ${expected.requestedScope}`);
  return problems.length ? problems : null;
}

/** HMAC claims: integrity "shared-secret", capped at SELF_REPORTED whatever the score (G6-10). */
export function verifyAgentClaim(
  claim: AgentIdentityClaim,
  policy: TrustPolicyRule,
  sharedSecret: string,
  expected?: ClaimExpectation,
): TrustVerificationResult {
  let keyId: string;
  let sigValid = false;
  try {
    keyId = claimHmacKeyId(sharedSecret);
    const presented = Buffer.from(typeof claim.signature === 'string' ? claim.signature : '', 'hex');
    const mac = hmacOf(claim, sharedSecret);
    sigValid = presented.length === mac.length && timingSafeEqual(presented, mac);
  } catch (error) {
    return refused('none', [`claim cannot be verified: ${error instanceof Error ? error.message : String(error)}`]);
  }
  if (!sigValid) return refused('none', ['SIGNATURE INVALID — claim may be forged']);
  const problems = bindingProblems(claim, expected, 'agent-claim-hmac', keyId);
  if (problems) return refused('shared-secret', problems);
  return finish(scoreClaim(claim, policy, true), expected!, claim, keyId, 'shared-secret', 'SELF_REPORTED');
}

/** Grants only scopes the policy allows the issuer, consumes the nonce last, and fails closed when the cache refuses it. */
function finish(scored: Omit<TrustVerificationResult, 'integrity' | 'trustTier'>, expected: ClaimExpectation, claim: AgentIdentityClaim, keyId: string,
  integrity: ClaimIntegrity, trustTier: TrustVerificationResult['trustTier']): TrustVerificationResult {
  const admitted = expected.replay.admit(keyId, claim.nonce!, claim.expiresAt!.getTime(), (expected.now ?? new Date()).getTime());
  if (admitted !== 'ok') return refused(integrity, [`claim refused by the replay cache: ${admitted}`]);
  const allowed = expected.grants[expected.issuer]!;
  // A self-reported claim (a shared secret any verifier holds, or a key no admission vouches for) authorizes nothing:
  // it is reported, never trusted, and at most "limited", matching the claim vocabulary's SELF_REPORTED.
  if (trustTier !== 'ATTESTED') {
    const trustLevel = scored.trustLevel === 'untrusted' ? 'untrusted' : 'limited';
    return { ...scored, trusted: false, trustLevel, grantedScopes: [], integrity, trustTier,
      reasons: [...scored.reasons, `${trustTier}: the claim's integrity does not attest the issuer, so it grants no scope`] };
  }
  const grantedScopes = scored.grantedScopes.filter(scope => allowed.includes(scope));
  const trusted = scored.trusted && grantedScopes.includes(expected.requestedScope);
  return { ...scored, trusted, grantedScopes, integrity, trustTier };
}

/** P1-08: a claim signed with the agent's Ed25519 session key; publicKeyHash and keyId are that key's id. */
export function createSignedAgentClaim(
  agentId: string,
  sessionPrivateKeyPem: string,
  issuingWorkspace: string,
  opts?: ClaimOptions,
): AgentIdentityClaim {
  const keyId = ed25519KeyId(publicKeyFromPrivate(sessionPrivateKeyPem)) ?? '';
  const claim = unsignedClaim(agentId, keyId, issuingWorkspace, opts, { keyId, keyPurpose: 'session' });
  return { ...claim, signature: sign(null, signedClaimBytes(claim), sessionPrivateKeyPem).toString('base64') };
}

/**
 * Verifies an Ed25519 claim with the session public key the verifier located, bound by keyId and publicKeyHash. The
 * result is ATTESTED only when issuer admission (P0-09) admits that key for `session` in `context`; otherwise
 * SELF_REPORTED.
 */
export function verifySignedAgentClaim(
  claim: AgentIdentityClaim,
  policy: TrustPolicyRule,
  input: { publicKeyPem: string; context: TrustContext },
  expected?: ClaimExpectation,
): TrustVerificationResult & { admission: IssuerAdmission | null } {
  const keyId = ed25519KeyId(input.publicKeyPem);
  let sigValid = false;
  try {
    sigValid = keyId !== null && keyId === claim.publicKeyHash
      && verify(null, signedClaimBytes(claim), input.publicKeyPem, Buffer.from(claim.signature, 'base64'));
  } catch { /* reported as an invalid signature */ }
  if (!sigValid) return { ...refused('none', ['SIGNATURE INVALID — claim may be forged']), admission: null };
  const problems = bindingProblems(claim, expected, 'session', keyId!);
  if (problems) return { ...refused('ed25519', problems), admission: null };
  const admission = admitKey({ publicKeyPem: input.publicKeyPem, purpose: 'session', signature: 'agent identity claim', context: input.context, claimedSignedAt: claim.issuedAt });
  return { ...finish(scoreClaim(claim, policy, true), expected!, claim, keyId!, 'ed25519', admission.status === 'admitted' ? 'ATTESTED' : 'SELF_REPORTED'), admission };
}

function scoreClaim(claim: AgentIdentityClaim, policy: TrustPolicyRule, sigValid: boolean): Omit<TrustVerificationResult, 'integrity' | 'trustTier'> {
  const reasons: string[] = [];
  let score = 0;

  // 1. Signature check (0.30)
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
    trustLevel, reasons,
    score: toDisplayScore(score),
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
  score: number;        // Internal 0–1 (edges use internal scale for math)
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
  transitiveScore: number;       // Display scale (default 0–100)
  maturityLevel: MaturityLevel;  // L0–L5
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
      const internalTransitive = current.score * decay; // Internal 0–1 scale
      const result: TransitiveTrustResult = {
        from, to,
        transitiveScore: toDisplayScore(internalTransitive),
        maturityLevel: scoreToLevel(internalTransitive),
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

/** An HMAC claim bound to its audience, key, nonce and lifetime (at most 24 hours; 1 hour by default). */
export function createAgentClaim(
  agentId: string,
  publicKeyHash: string,
  issuingWorkspace: string,
  sharedSecret: string,
  opts?: ClaimOptions,
): AgentIdentityClaim {
  const claim = unsignedClaim(agentId, publicKeyHash, issuingWorkspace, opts, { keyId: claimHmacKeyId(sharedSecret), keyPurpose: 'agent-claim-hmac' });
  return { ...claim, signature: hmacOf(claim, sharedSecret).toString('hex') };
}
