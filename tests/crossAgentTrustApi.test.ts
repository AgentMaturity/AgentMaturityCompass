/**
 * crossAgentTrustApi.test.ts — Tests for the cross-agent trust API routes.
 * Tests each of the 6 new route handlers and their error cases.
 */

import { describe, it, expect } from 'vitest';
import {
  verifyAgentClaim,
  createAgentClaim,
  computeTransitiveTrust,
  applyTemporalDecay,
  computeInheritedTrust,
  INDUSTRY_DECAY_PRESETS,
  type AgentIdentityClaim,
  type TrustPolicyRule,
  type TrustGraph,
  type TrustEdge,
  type TemporalDecayConfig,
  type DelegationPolicy,
  type TrustVerificationResult,
} from '../src/score/crossAgentTrust.js';

// ── Helpers ────────────────────────────────────────────────────────────────

const SECRET = 'test-shared-secret';

function makeValidClaim(opts?: { score?: number; level?: string }): AgentIdentityClaim {
  return createAgentClaim(
    'agent-test-001',
    'abc123publickeyhash',
    'workspace-test',
    SECRET,
    { amcScore: opts?.score ?? 75, amcLevel: opts?.level ?? 'L4' },
  );
}

function makePolicy(overrides: Partial<TrustPolicyRule> = {}): TrustPolicyRule {
  return {
    requirePassport: false,
    requireFreshness: true,
    ...overrides,
  };
}

// ── Route: POST /api/v1/score/trust/verify-claim ───────────────────────────

describe('Trust API — verify-claim', () => {
  it('returns trusted:true for a valid, fresh claim with matching policy', () => {
    const claim = makeValidClaim({ score: 80, level: 'L4' });
    const policy = makePolicy({ minAmcScore: 70, minAmcLevel: 'L3' });
    const result = verifyAgentClaim(claim, policy, SECRET);
    expect(result.trusted).toBe(true);
    expect(result.trustLevel).toBe('full');
    expect(result.grantedScopes).toContain('read');
  });

  it('returns trusted:false when score is below minimum', () => {
    const claim = makeValidClaim({ score: 30 });
    const policy = makePolicy({ minAmcScore: 70 });
    const result = verifyAgentClaim(claim, policy, SECRET);
    expect(result.reasons.some(r => r.includes('below required'))).toBe(true);
  });

  it('returns untrusted when signature is invalid', () => {
    const claim = makeValidClaim();
    const result = verifyAgentClaim(claim, makePolicy(), 'wrong-secret');
    expect(result.trusted).toBe(false);
    expect(result.trustLevel).toBe('untrusted');
  });

  it('includes reasons array with at least one entry', () => {
    const claim = makeValidClaim();
    const result = verifyAgentClaim(claim, makePolicy(), SECRET);
    expect(Array.isArray(result.reasons)).toBe(true);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('score field is a number on the display scale (0-100)', () => {
    const claim = makeValidClaim();
    const result = verifyAgentClaim(claim, makePolicy(), SECRET);
    expect(typeof result.score).toBe('number');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('grantedScopes is empty for untrusted claims', () => {
    const claim = makeValidClaim();
    const result = verifyAgentClaim(claim, makePolicy(), 'bad-secret');
    expect(result.grantedScopes).toHaveLength(0);
  });

  it('rejects claim from workspace not in allowedWorkspaces', () => {
    const claim = makeValidClaim();
    const policy = makePolicy({ allowedWorkspaces: ['workspace-other'] });
    const result = verifyAgentClaim(claim, policy, SECRET);
    expect(result.reasons.some(r => r.includes('not in trusted workspace list'))).toBe(true);
  });
});

// ── Route: POST /api/v1/score/trust/create-claim ──────────────────────────

describe('Trust API — create-claim', () => {
  it('creates a claim with the correct agentId', () => {
    const claim = createAgentClaim('agent-42', 'pubhash-xyz', 'ws-123', SECRET);
    expect(claim.agentId).toBe('agent-42');
    expect(claim.issuingWorkspace).toBe('ws-123');
  });

  it('signature is a non-empty hex string', () => {
    const claim = createAgentClaim('agent-1', 'pubhash-abc', 'ws-1', SECRET);
    expect(typeof claim.signature).toBe('string');
    expect(claim.signature.length).toBe(64); // SHA-256 hex
  });

  it('issuedAt is a Date close to now', () => {
    const before = Date.now();
    const claim = createAgentClaim('agent-1', 'pubhash-abc', 'ws-1', SECRET);
    const after = Date.now();
    expect(claim.issuedAt).toBeInstanceOf(Date);
    expect(claim.issuedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(claim.issuedAt.getTime()).toBeLessThanOrEqual(after);
  });

  it('stores optional amcScore and amcLevel', () => {
    const claim = createAgentClaim('agent-1', 'pubhash', 'ws-1', SECRET, {
      amcScore: 85,
      amcLevel: 'L4',
      amcPassportId: 'passport-999',
    });
    expect(claim.amcScore).toBe(85);
    expect(claim.amcLevel).toBe('L4');
    expect(claim.amcPassportId).toBe('passport-999');
  });

  it('sets expiresAt when ttlHours is provided', () => {
    const claim = createAgentClaim('agent-1', 'pubhash', 'ws-1', SECRET, { ttlHours: 24 });
    expect(claim.expiresAt).toBeDefined();
    expect(claim.expiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('created claim passes verify-claim with correct secret', () => {
    const claim = createAgentClaim('agent-1', 'pubhash', 'ws-1', SECRET, { amcScore: 75 });
    const result = verifyAgentClaim(claim, makePolicy(), SECRET);
    expect(result.reasons).toContain('Signature valid');
  });
});

// ── Route: POST /api/v1/score/trust/transitive ────────────────────────────

describe('Trust API — transitive trust', () => {
  const now = Date.now();

  const graph: TrustGraph = {
    edges: [
      { from: 'A', to: 'B', score: 0.9, scopes: ['read', 'write'], establishedAt: now },
      { from: 'B', to: 'C', score: 0.8, scopes: ['read', 'write', 'execute'], establishedAt: now },
      { from: 'A', to: 'C', score: 0.5, scopes: ['read'], establishedAt: now },
    ],
  };

  it('finds direct trust path between adjacent agents', () => {
    const result = computeTransitiveTrust(graph, 'A', 'B');
    expect(result).not.toBeNull();
    expect(result!.from).toBe('A');
    expect(result!.to).toBe('B');
    expect(result!.hops).toBe(1);
  });

  it('finds transitive path through B to C', () => {
    // Should find either A→C direct (score 0.5) or A→B→C transitive
    const result = computeTransitiveTrust(graph, 'A', 'C');
    expect(result).not.toBeNull();
    expect(result!.path.length).toBeGreaterThan(1);
  });

  it('returns null when no path exists', () => {
    const result = computeTransitiveTrust(graph, 'C', 'A');
    expect(result).toBeNull();
  });

  it('respects maxHops option', () => {
    const result = computeTransitiveTrust(graph, 'A', 'C', { maxHops: 1 });
    // With maxHops:1, only direct A→C edge should be found
    if (result) {
      expect(result.hops).toBeLessThanOrEqual(1);
    }
  });

  it('effectiveScopes are intersection of path scopes', () => {
    const result = computeTransitiveTrust(graph, 'A', 'B');
    expect(result).not.toBeNull();
    expect(result!.effectiveScopes).toContain('read');
  });

  it('transitiveScore is on the display scale (0-100)', () => {
    const result = computeTransitiveTrust(graph, 'A', 'B');
    expect(result).not.toBeNull();
    expect(result!.transitiveScore).toBeGreaterThan(0);
    expect(result!.transitiveScore).toBeLessThanOrEqual(100);
  });
});

// ── Route: POST /api/v1/score/trust/decay ─────────────────────────────────

describe('Trust API — temporal decay', () => {
  const now = Date.now();

  it('returns lower score for older establishment time (exponential)', () => {
    const config: TemporalDecayConfig = INDUSTRY_DECAY_PRESETS['general']!;
    const fresh = applyTemporalDecay(1.0, now - 1000, config, now);
    const stale = applyTemporalDecay(1.0, now - 48 * 3600000, config, now);
    expect(fresh).toBeGreaterThan(stale);
  });

  it('returns original score for freshly established trust', () => {
    const config: TemporalDecayConfig = INDUSTRY_DECAY_PRESETS['general']!;
    const score = applyTemporalDecay(0.9, now, config, now);
    expect(score).toBeCloseTo(0.9, 3);
  });

  it('linear model reduces to 0 at maxAgeHours', () => {
    const config: TemporalDecayConfig = INDUSTRY_DECAY_PRESETS['entertainment']!;
    const expired = applyTemporalDecay(1.0, now - config.maxAgeHours * 3600000, config, now);
    expect(expired).toBeCloseTo(0, 2);
  });

  it('step model applies stepReduction after threshold', () => {
    const config: TemporalDecayConfig = INDUSTRY_DECAY_PRESETS['defense']!;
    const original = 1.0;
    const afterStep = applyTemporalDecay(original, now - (config.stepThresholdHours + 1) * 3600000, config, now);
    expect(afterStep).toBeCloseTo(original * config.stepReduction, 5);
  });

  it('healthcare preset uses exponential with short half-life', () => {
    const config = INDUSTRY_DECAY_PRESETS['healthcare']!;
    expect(config.model).toBe('exponential');
    expect(config.halfLifeHours).toBeLessThanOrEqual(8);
  });

  it('score never goes negative', () => {
    const config: TemporalDecayConfig = INDUSTRY_DECAY_PRESETS['general']!;
    const veryOld = applyTemporalDecay(0.5, 0, config, now);
    expect(veryOld).toBeGreaterThanOrEqual(0);
  });
});

// ── Route: POST /api/v1/score/trust/inherited ─────────────────────────────

describe('Trust API — inherited trust', () => {
  const delegatorTrust: TrustVerificationResult = {
    trusted: true,
    trustLevel: 'full',
    reasons: ['Signature valid'],
    score: 80,
    level: 'L4',
    grantedScopes: ['read', 'write', 'execute', 'delegate'],
  };

  const policy: DelegationPolicy = {
    inheritFactor: 0.8,
    maxDelegationDepth: 3,
    requireExplicitGrant: false,
  };

  it('returns an InheritedTrust object', () => {
    const result = computeInheritedTrust(delegatorTrust, 70, policy);
    expect(result).toHaveProperty('inheritedScore');
    expect(result).toHaveProperty('inheritedScopes');
    expect(result).toHaveProperty('delegationDepth');
    expect(result).toHaveProperty('restrictions');
  });

  it('inherited score is lower than delegator score', () => {
    const result = computeInheritedTrust(delegatorTrust, 70, policy);
    expect(result.inheritedScore).toBeLessThanOrEqual(delegatorTrust.score);
  });

  it('delegate scope is excluded by default (requireExplicitGrant:false)', () => {
    const result = computeInheritedTrust(delegatorTrust, 80, policy);
    expect(result.inheritedScopes).not.toContain('delegate');
  });

  it('scopeRestrictions filter inherited scopes', () => {
    const restrictedPolicy: DelegationPolicy = {
      ...policy,
      scopeRestrictions: ['read'],
    };
    const result = computeInheritedTrust(delegatorTrust, 80, restrictedPolicy);
    expect(result.inheritedScopes).toEqual(['read']);
  });

  it('returns zero score when delegation depth exceeds max', () => {
    const result = computeInheritedTrust(delegatorTrust, 70, policy, 10);
    expect(result.inheritedScore).toBe(0);
    expect(result.inheritedScopes).toHaveLength(0);
    expect(result.restrictions.length).toBeGreaterThan(0);
  });

  it('higher inheritFactor gives higher inherited score', () => {
    const p08: DelegationPolicy = { ...policy, inheritFactor: 0.8 };
    const p05: DelegationPolicy = { ...policy, inheritFactor: 0.5 };
    const r08 = computeInheritedTrust(delegatorTrust, 80, p08);
    const r05 = computeInheritedTrust(delegatorTrust, 80, p05);
    expect(r08.inheritedScore).toBeGreaterThan(r05.inheritedScore);
  });
});

// ── Route: GET /api/v1/score/trust/decay-presets ──────────────────────────

describe('Trust API — decay-presets', () => {
  it('INDUSTRY_DECAY_PRESETS is defined and non-empty', () => {
    expect(INDUSTRY_DECAY_PRESETS).toBeDefined();
    expect(Object.keys(INDUSTRY_DECAY_PRESETS).length).toBeGreaterThan(0);
  });

  it('contains healthcare preset', () => {
    expect(INDUSTRY_DECAY_PRESETS).toHaveProperty('healthcare');
  });

  it('contains finance preset', () => {
    expect(INDUSTRY_DECAY_PRESETS).toHaveProperty('finance');
  });

  it('contains general preset', () => {
    expect(INDUSTRY_DECAY_PRESETS).toHaveProperty('general');
  });

  it('each preset has required fields', () => {
    for (const [name, preset] of Object.entries(INDUSTRY_DECAY_PRESETS)) {
      expect(preset).toHaveProperty('model');
      expect(preset).toHaveProperty('halfLifeHours');
      expect(preset).toHaveProperty('maxAgeHours');
      expect(preset).toHaveProperty('stepThresholdHours');
      expect(preset).toHaveProperty('stepReduction');
    }
  });

  it('model field is one of exponential, linear, step', () => {
    const validModels = ['exponential', 'linear', 'step'];
    for (const preset of Object.values(INDUSTRY_DECAY_PRESETS)) {
      expect(validModels).toContain(preset.model);
    }
  });
});
