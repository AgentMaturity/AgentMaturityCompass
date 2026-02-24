/**
 * Output Attestation — signs agent outputs with trust metadata so receiving
 * agents can verify provenance, trust level, and evidence chain integrity.
 *
 * This is the "bidirectional trust" module: not only does AMC protect you
 * from bad inputs, it ensures YOUR outputs carry verifiable trust signals.
 */

import { createHash, createHmac } from "node:crypto";

// ── Types ────────────────────────────────────────────────────────────────────

export interface AttestationInput {
  agentId: string;
  output: string | Record<string, unknown>;
  trustLevel: number; // 0-5
  evidenceChainHash?: string;
  timestamp?: number;
  delegationChain?: string[];
  shieldResults?: { pack: string; passed: boolean }[];
}

export interface Attestation {
  attestationId: string;
  agentId: string;
  outputHash: string;
  trustLevel: number;
  effectiveTrust: number; // min of delegation chain
  timestamp: number;
  evidenceChainHash: string | null;
  shieldSummary: { totalPacks: number; passed: number; failed: number };
  delegationDepth: number;
  signature: string; // HMAC-SHA256 of attestation payload
}

export interface AttestationVerification {
  valid: boolean;
  reason?: string;
  attestation: Attestation;
  trustDecay: number; // 0-1, how much trust has decayed since attestation
  effectiveWeight: number; // final trust weight for consuming agent
}

export interface OutputAttestationReport {
  score: number;
  level: number;
  hasOutputSigning: boolean;
  hasTrustLevelBinding: boolean;
  hasDelegationChainTracking: boolean;
  hasShieldResultBinding: boolean;
  hasEvidenceDecay: boolean;
  hasReceivingAgentVerification: boolean;
  attestationsIssued: number;
  attestationsVerified: number;
  avgEffectiveTrust: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const ATTESTATION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const DECAY_RATE = 0.02; // 2% per day

// ── Core Functions ───────────────────────────────────────────────────────────

export function createAttestation(
  input: AttestationInput,
  signingKey: string = "amc-default-key"
): Attestation {
  const ts = input.timestamp ?? Date.now();
  const outputStr = typeof input.output === "string"
    ? input.output
    : JSON.stringify(input.output);
  const outputHash = createHash("sha256").update(outputStr).digest("hex");

  const delegationDepth = input.delegationChain?.length ?? 0;
  const effectiveTrust = delegationDepth > 0
    ? Math.min(input.trustLevel, ...input.delegationChain!.map(() => input.trustLevel))
    : input.trustLevel;

  const shieldPassed = input.shieldResults?.filter(r => r.passed).length ?? 0;
  const shieldTotal = input.shieldResults?.length ?? 0;

  const payload = {
    agentId: input.agentId,
    outputHash,
    trustLevel: input.trustLevel,
    effectiveTrust,
    timestamp: ts,
    evidenceChainHash: input.evidenceChainHash ?? null,
    shieldSummary: { totalPacks: shieldTotal, passed: shieldPassed, failed: shieldTotal - shieldPassed },
    delegationDepth,
  };

  const payloadStr = JSON.stringify(payload);
  const signature = createHmac("sha256", signingKey).update(payloadStr).digest("hex");
  const attestationId = `att_${createHash("sha256").update(payloadStr + signature).digest("hex").slice(0, 16)}`;

  return { attestationId, ...payload, signature };
}

export function verifyAttestation(
  attestation: Attestation,
  signingKey: string = "amc-default-key",
  currentTime?: number
): AttestationVerification {
  const now = currentTime ?? Date.now();

  // Reconstruct payload and verify signature
  const payload = {
    agentId: attestation.agentId,
    outputHash: attestation.outputHash,
    trustLevel: attestation.trustLevel,
    effectiveTrust: attestation.effectiveTrust,
    timestamp: attestation.timestamp,
    evidenceChainHash: attestation.evidenceChainHash,
    shieldSummary: attestation.shieldSummary,
    delegationDepth: attestation.delegationDepth,
  };
  const expectedSig = createHmac("sha256", signingKey).update(JSON.stringify(payload)).digest("hex");

  if (expectedSig !== attestation.signature) {
    return { valid: false, reason: "signature_mismatch", attestation, trustDecay: 1, effectiveWeight: 0 };
  }

  // Check TTL
  const age = now - attestation.timestamp;
  if (age > ATTESTATION_TTL_MS) {
    return { valid: false, reason: "expired", attestation, trustDecay: 1, effectiveWeight: 0 };
  }

  // Compute decay
  const daysSince = age / (24 * 60 * 60 * 1000);
  const trustDecay = Math.min(1, daysSince * DECAY_RATE);
  const effectiveWeight = attestation.effectiveTrust * (1 - trustDecay) / 5;

  // Shield penalty
  const shieldPenalty = attestation.shieldSummary.failed > 0
    ? 0.5 * (attestation.shieldSummary.failed / Math.max(attestation.shieldSummary.totalPacks, 1))
    : 0;

  return {
    valid: true,
    attestation,
    trustDecay,
    effectiveWeight: Math.max(0, effectiveWeight - shieldPenalty),
  };
}

export function scoreOutputAttestation(input: {
  attestations?: Attestation[];
  verifications?: AttestationVerification[];
}): OutputAttestationReport {
  const atts = input.attestations ?? [];
  const vers = input.verifications ?? [];

  const hasOutputSigning = atts.length > 0;
  const hasTrustLevelBinding = atts.some(a => a.trustLevel > 0);
  const hasDelegationChainTracking = atts.some(a => a.delegationDepth > 0);
  const hasShieldResultBinding = atts.some(a => a.shieldSummary.totalPacks > 0);
  const hasEvidenceDecay = vers.some(v => v.trustDecay > 0);
  const hasReceivingAgentVerification = vers.length > 0;

  const avgEffectiveTrust = vers.length > 0
    ? vers.reduce((sum, v) => sum + v.effectiveWeight, 0) / vers.length
    : 0;

  let score = 0;
  if (hasOutputSigning) score += 20;
  if (hasTrustLevelBinding) score += 15;
  if (hasDelegationChainTracking) score += 15;
  if (hasShieldResultBinding) score += 20;
  if (hasEvidenceDecay) score += 15;
  if (hasReceivingAgentVerification) score += 15;

  const level = score >= 85 ? 5 : score >= 65 ? 4 : score >= 45 ? 3 : score >= 25 ? 2 : score > 0 ? 1 : 0;

  return {
    score,
    level,
    hasOutputSigning,
    hasTrustLevelBinding,
    hasDelegationChainTracking,
    hasShieldResultBinding,
    hasEvidenceDecay,
    hasReceivingAgentVerification,
    attestationsIssued: atts.length,
    attestationsVerified: vers.filter(v => v.valid).length,
    avgEffectiveTrust,
  };
}
