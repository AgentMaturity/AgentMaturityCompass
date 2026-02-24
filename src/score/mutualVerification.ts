/**
 * Mutual Verification Protocol — agent-to-agent trust verification.
 *
 * When Agent A interacts with Agent B, both can verify each other's AMC
 * scores, evidence chain integrity, and protocol version. This is the
 * "Terpy/Polaris" scenario: bidirectional trust establishment.
 *
 * Uses a challenge-response pattern:
 * 1. Agent A sends a verification challenge (nonce + its own attestation)
 * 2. Agent B responds with its attestation + signed nonce
 * 3. Both sides verify and compute effective mutual trust
 */

import { createHash, createHmac, randomBytes } from "node:crypto";

// ── Types ────────────────────────────────────────────────────────────────────

export interface AgentIdentity {
  agentId: string;
  amcVersion: string;
  trustLevel: number; // 0-5
  scoreTimestamp: number;
  evidenceChainHead: string; // hash of latest ledger entry
  shieldPassRate: number; // 0-1
  protocolVersion: string; // e.g. "amc-mvp-1.0"
}

export interface VerificationChallenge {
  challengeId: string;
  nonce: string;
  challenger: AgentIdentity;
  timestamp: number;
  signature: string;
}

export interface VerificationResponse {
  challengeId: string;
  nonce: string;
  responder: AgentIdentity;
  timestamp: number;
  signature: string;
}

export interface MutualTrustResult {
  verified: boolean;
  reason?: string;
  challengerTrust: number;
  responderTrust: number;
  effectiveMutualTrust: number; // min(challenger, responder) with decay
  protocolCompatible: boolean;
  scoresFresh: boolean;
  evidenceChainsValid: boolean;
  trustDecay: number;
}

export interface MutualVerificationReport {
  score: number;
  level: number;
  hasChallengeResponse: boolean;
  hasNonceVerification: boolean;
  hasProtocolVersionCheck: boolean;
  hasScoreFreshnessCheck: boolean;
  hasEvidenceChainVerification: boolean;
  hasBidirectionalAttestation: boolean;
  hasWeakestLinkEnforcement: boolean;
  verificationsCompleted: number;
  avgMutualTrust: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const SCORE_FRESHNESS_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const COMPATIBLE_PROTOCOLS = ["amc-mvp-1.0", "amc-mvp-1.1"];
const DECAY_PER_DAY = 0.015;

// ── Core Functions ───────────────────────────────────────────────────────────

export function createChallenge(
  challenger: AgentIdentity,
  signingKey: string = "amc-default-key"
): VerificationChallenge {
  const nonce = randomBytes(32).toString("hex");
  const ts = Date.now();
  const payload = JSON.stringify({ nonce, challenger, timestamp: ts });
  const signature = createHmac("sha256", signingKey).update(payload).digest("hex");
  const challengeId = `ch_${createHash("sha256").update(payload).digest("hex").slice(0, 16)}`;

  return { challengeId, nonce, challenger, timestamp: ts, signature };
}

export function respondToChallenge(
  challenge: VerificationChallenge,
  responder: AgentIdentity,
  signingKey: string = "amc-default-key"
): VerificationResponse {
  const ts = Date.now();
  const payload = JSON.stringify({
    challengeId: challenge.challengeId,
    nonce: challenge.nonce,
    responder,
    timestamp: ts,
  });
  const signature = createHmac("sha256", signingKey).update(payload).digest("hex");

  return {
    challengeId: challenge.challengeId,
    nonce: challenge.nonce,
    responder,
    timestamp: ts,
    signature,
  };
}

export function verifyMutualTrust(
  challenge: VerificationChallenge,
  response: VerificationResponse,
  challengerKey: string = "amc-default-key",
  responderKey: string = "amc-default-key",
  currentTime?: number
): MutualTrustResult {
  const now = currentTime ?? Date.now();

  // Verify nonce match
  if (challenge.nonce !== response.nonce) {
    return {
      verified: false, reason: "nonce_mismatch",
      challengerTrust: 0, responderTrust: 0, effectiveMutualTrust: 0,
      protocolCompatible: false, scoresFresh: false, evidenceChainsValid: false, trustDecay: 1,
    };
  }

  // Verify challenge signature
  const challengePayload = JSON.stringify({
    nonce: challenge.nonce,
    challenger: challenge.challenger,
    timestamp: challenge.timestamp,
  });
  const expectedChallengeSig = createHmac("sha256", challengerKey).update(challengePayload).digest("hex");
  if (expectedChallengeSig !== challenge.signature) {
    return {
      verified: false, reason: "challenger_signature_invalid",
      challengerTrust: 0, responderTrust: 0, effectiveMutualTrust: 0,
      protocolCompatible: false, scoresFresh: false, evidenceChainsValid: false, trustDecay: 1,
    };
  }

  // Verify response signature
  const responsePayload = JSON.stringify({
    challengeId: response.challengeId,
    nonce: response.nonce,
    responder: response.responder,
    timestamp: response.timestamp,
  });
  const expectedResponseSig = createHmac("sha256", responderKey).update(responsePayload).digest("hex");
  if (expectedResponseSig !== response.signature) {
    return {
      verified: false, reason: "responder_signature_invalid",
      challengerTrust: 0, responderTrust: 0, effectiveMutualTrust: 0,
      protocolCompatible: false, scoresFresh: false, evidenceChainsValid: false, trustDecay: 1,
    };
  }

  // Protocol compatibility
  const protocolCompatible =
    COMPATIBLE_PROTOCOLS.includes(challenge.challenger.protocolVersion) &&
    COMPATIBLE_PROTOCOLS.includes(response.responder.protocolVersion);

  // Score freshness
  const challengerAge = now - challenge.challenger.scoreTimestamp;
  const responderAge = now - response.responder.scoreTimestamp;
  const scoresFresh = challengerAge < SCORE_FRESHNESS_MS && responderAge < SCORE_FRESHNESS_MS;

  // Evidence chain validity (non-empty hashes)
  const evidenceChainsValid =
    challenge.challenger.evidenceChainHead.length > 0 &&
    response.responder.evidenceChainHead.length > 0;

  // Compute trust with decay
  const maxAge = Math.max(challengerAge, responderAge);
  const daysSince = maxAge / (24 * 60 * 60 * 1000);
  const trustDecay = Math.min(1, daysSince * DECAY_PER_DAY);

  const challengerTrust = challenge.challenger.trustLevel * (1 - trustDecay);
  const responderTrust = response.responder.trustLevel * (1 - trustDecay);

  // Weakest-link: mutual trust is bounded by the weaker party
  let effectiveMutualTrust = Math.min(challengerTrust, responderTrust);

  // Penalties
  if (!protocolCompatible) effectiveMutualTrust *= 0.5;
  if (!scoresFresh) effectiveMutualTrust *= 0.7;
  if (!evidenceChainsValid) effectiveMutualTrust *= 0.6;

  // Shield pass rate penalty
  const minShieldRate = Math.min(
    challenge.challenger.shieldPassRate,
    response.responder.shieldPassRate
  );
  if (minShieldRate < 0.9) effectiveMutualTrust *= minShieldRate;

  return {
    verified: true,
    challengerTrust,
    responderTrust,
    effectiveMutualTrust,
    protocolCompatible,
    scoresFresh,
    evidenceChainsValid,
    trustDecay,
  };
}

export function scoreMutualVerification(input: {
  verifications?: MutualTrustResult[];
}): MutualVerificationReport {
  const vers = input.verifications ?? [];
  const verified = vers.filter(v => v.verified);

  const hasChallengeResponse = vers.length > 0;
  const hasNonceVerification = verified.length > 0;
  const hasProtocolVersionCheck = verified.some(v => v.protocolCompatible);
  const hasScoreFreshnessCheck = verified.some(v => v.scoresFresh);
  const hasEvidenceChainVerification = verified.some(v => v.evidenceChainsValid);
  const hasBidirectionalAttestation = verified.some(v => v.challengerTrust > 0 && v.responderTrust > 0);
  const hasWeakestLinkEnforcement = verified.some(v =>
    v.effectiveMutualTrust <= Math.min(v.challengerTrust, v.responderTrust)
  );

  const avgMutualTrust = verified.length > 0
    ? verified.reduce((sum, v) => sum + v.effectiveMutualTrust, 0) / verified.length
    : 0;

  let score = 0;
  if (hasChallengeResponse) score += 15;
  if (hasNonceVerification) score += 15;
  if (hasProtocolVersionCheck) score += 15;
  if (hasScoreFreshnessCheck) score += 10;
  if (hasEvidenceChainVerification) score += 15;
  if (hasBidirectionalAttestation) score += 15;
  if (hasWeakestLinkEnforcement) score += 15;

  const level = score >= 85 ? 5 : score >= 65 ? 4 : score >= 45 ? 3 : score >= 25 ? 2 : score > 0 ? 1 : 0;

  return {
    score,
    level,
    hasChallengeResponse,
    hasNonceVerification,
    hasProtocolVersionCheck,
    hasScoreFreshnessCheck,
    hasEvidenceChainVerification,
    hasBidirectionalAttestation,
    hasWeakestLinkEnforcement,
    verificationsCompleted: verified.length,
    avgMutualTrust,
  };
}
