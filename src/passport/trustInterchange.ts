/**
 * Universal Trust Interchange Protocol for AMC Passport
 *
 * Cross-platform trust portability:
 * - Standardized trust credential format (AMC Trust Token)
 * - Cross-platform credential exchange
 * - Federated trust verification network
 * - Trust translation between different scoring systems
 */

import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { type MaturityLevel } from "../score/formalSpec.js";
import { scoreToLevel, toDisplayScore, toInternalScore, getScoringConfig } from "../score/scoringScale.js";

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * AMC Trust Token — portable, verifiable trust credential.
 * Designed to be exchangeable across platforms.
 */
export interface AMCTrustToken {
  version: "1.0";
  tokenId: string;
  issuer: {
    workspaceId: string;
    platform: string;             // "amc" | "langsmith" | "langfuse" | "custom"
    publicKeyHash: string;
  };
  subject: {
    agentId: string;
    displayName?: string;
    passportId?: string;
  };
  claims: TrustClaim[];
  issuedAt: number;
  expiresAt: number;
  signature: string;              // HMAC-SHA256 of canonical token
}

export interface TrustClaim {
  dimension: string;              // "security" | "reliability" | "safety" | etc.
  score: number;                  // Display scale (default 0–100)
  level: MaturityLevel;           // L0–L5 derived from score
  evidenceCount: number;
  observedShare: number;          // 0-1 fraction of observed evidence
  lastAssessedAt: number;
}

/**
 * Trust translation table for converting between scoring systems.
 */
export interface TrustTranslation {
  sourceSystem: string;
  targetSystem: string;
  mappings: DimensionMapping[];
}

export interface DimensionMapping {
  sourceDimension: string;
  targetDimension: string;
  conversionFactor: number;       // Multiply source score by this
  offset: number;                 // Add this after multiplication
  confidence: number;             // 0-1 confidence in the mapping
}

/**
 * Federated verification request/response.
 */
export interface FederatedVerificationRequest {
  requestId: string;
  requesterId: string;
  tokenId: string;
  requiredClaims: string[];       // Which dimensions must be verified
  minScores?: Record<string, number>; // Minimum scores per dimension
  timestamp: number;
}

export interface FederatedVerificationResponse {
  requestId: string;
  tokenId: string;
  verified: boolean;
  claimResults: Record<string, { verified: boolean; score: number; reason: string }>;
  verifierId: string;
  timestamp: number;
  signature: string;
}

export interface TrustNetwork {
  nodes: TrustNetworkNode[];
  edges: TrustNetworkEdge[];
}

export interface TrustNetworkNode {
  id: string;
  platform: string;
  publicKeyHash: string;
  trustLevel: "anchor" | "verified" | "provisional" | "unknown";
}

export interface TrustNetworkEdge {
  from: string;
  to: string;
  trustScore: number;             // 0–1
  trustLevel: MaturityLevel;      // L0–L5
  establishedAt: number;
  lastVerifiedAt: number;
  mutual: boolean;
}

// ── Trust Token Issuance ───────────────────────────────────────────────────

function canonicalize(obj: unknown): string {
  return JSON.stringify(obj, Object.keys(obj as object).sort());
}

/**
 * Issue an AMC Trust Token for an agent.
 */
export function issueTrustToken(
  workspaceId: string,
  publicKeyHash: string,
  agentId: string,
  claims: TrustClaim[],
  secret: string,
  opts?: { ttlHours?: number; displayName?: string; passportId?: string },
): AMCTrustToken {
  const now = Date.now();
  const token: Omit<AMCTrustToken, "signature"> = {
    version: "1.0",
    tokenId: randomUUID(),
    issuer: { workspaceId, platform: "amc", publicKeyHash },
    subject: { agentId, displayName: opts?.displayName, passportId: opts?.passportId },
    claims,
    issuedAt: now,
    expiresAt: now + (opts?.ttlHours ?? 24) * 3600000,
  };

  const payload = canonicalize(token);
  const signature = createHmac("sha256", secret).update(payload).digest("hex");

  return { ...token, signature } as AMCTrustToken;
}

/**
 * Verify an AMC Trust Token.
 */
export function verifyTrustToken(
  token: AMCTrustToken,
  secret: string,
): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];

  // Check expiry
  if (Date.now() > token.expiresAt) {
    reasons.push(`Token expired at ${new Date(token.expiresAt).toISOString()}`);
  }

  // Check signature
  const tokenCopy = { ...token };
  delete (tokenCopy as Record<string, unknown>).signature;
  const payload = canonicalize(tokenCopy);
  const expectedSig = createHmac("sha256", secret).update(payload).digest("hex");
  if (token.signature !== expectedSig) {
    reasons.push("Invalid signature");
  }

  // Check claims integrity
  for (const claim of token.claims) {
    if (claim.score < 0 || claim.score > getScoringConfig().scale) reasons.push(`Invalid score for ${claim.dimension}: ${claim.score}`);
    if (claim.observedShare < 0 || claim.observedShare > 1) reasons.push(`Invalid observedShare for ${claim.dimension}`);
  }

  return { valid: reasons.length === 0, reasons };
}

// ── Trust Translation ──────────────────────────────────────────────────────

/**
 * Built-in translation tables for common scoring systems.
 */
export const TRUST_TRANSLATIONS: TrustTranslation[] = [
  {
    sourceSystem: "amc",
    targetSystem: "nist_ai_rmf",
    mappings: [
      { sourceDimension: "security", targetDimension: "MANAGE-3", conversionFactor: 0.8, offset: 0.10, confidence: 0.85 },
      { sourceDimension: "governance", targetDimension: "GOVERN-1", conversionFactor: 0.9, offset: 0.05, confidence: 0.90 },
      { sourceDimension: "evaluation", targetDimension: "MEASURE-2", conversionFactor: 0.85, offset: 0.08, confidence: 0.80 },
      { sourceDimension: "safety", targetDimension: "MAP-1", conversionFactor: 0.75, offset: 0.12, confidence: 0.75 },
      { sourceDimension: "transparency", targetDimension: "MANAGE-4", conversionFactor: 0.8, offset: 0.10, confidence: 0.82 },
    ],
  },
  {
    sourceSystem: "amc",
    targetSystem: "iso_42001",
    mappings: [
      { sourceDimension: "governance", targetDimension: "A.6", conversionFactor: 0.9, offset: 0.05, confidence: 0.88 },
      { sourceDimension: "reliability", targetDimension: "A.8", conversionFactor: 0.85, offset: 0.07, confidence: 0.82 },
      { sourceDimension: "evaluation", targetDimension: "A.9", conversionFactor: 0.88, offset: 0.06, confidence: 0.85 },
      { sourceDimension: "safety", targetDimension: "A.10", conversionFactor: 0.82, offset: 0.09, confidence: 0.80 },
    ],
  },
];

/**
 * Translate trust scores from one system to another.
 */
export function translateTrustScores(
  scores: Record<string, number>,
  sourceSystem: string,
  targetSystem: string,
): Record<string, { score: number; level: MaturityLevel; confidence: number }> {
  const translation = TRUST_TRANSLATIONS.find(
    t => t.sourceSystem === sourceSystem && t.targetSystem === targetSystem
  );
  if (!translation) return {};

  const result: Record<string, { score: number; level: MaturityLevel; confidence: number }> = {};
  for (const mapping of translation.mappings) {
    const sourceScore = scores[mapping.sourceDimension];
    if (sourceScore !== undefined) {
      // sourceScore is display-scale; convert to internal for computation
      const internalSource = toInternalScore(sourceScore);
      const internalTranslated = Math.min(1.0, Math.max(0, internalSource * mapping.conversionFactor + mapping.offset));
      result[mapping.targetDimension] = {
        score: toDisplayScore(internalTranslated),
        level: scoreToLevel(internalTranslated),
        confidence: mapping.confidence,
      };
    }
  }
  return result;
}

// ── Federated Verification ─────────────────────────────────────────────────

/**
 * Create a federated verification request.
 */
export function createVerificationRequest(
  requesterId: string,
  tokenId: string,
  requiredClaims: string[],
  minScores?: Record<string, number>,
): FederatedVerificationRequest {
  return {
    requestId: randomUUID(),
    requesterId,
    tokenId,
    requiredClaims,
    minScores,
    timestamp: Date.now(),
  };
}

/**
 * Process a federated verification request against a token.
 */
export function processVerificationRequest(
  request: FederatedVerificationRequest,
  token: AMCTrustToken,
  verifierId: string,
  secret: string,
): FederatedVerificationResponse {
  const claimResults: Record<string, { verified: boolean; score: number; reason: string }> = {};

  for (const requiredClaim of request.requiredClaims) {
    const claim = token.claims.find(c => c.dimension === requiredClaim);
    if (!claim) {
      claimResults[requiredClaim] = { verified: false, score: 0, reason: "Claim not present in token" };
      continue;
    }

    const minScore = request.minScores?.[requiredClaim] ?? 0;
    const meetsThreshold = claim.score >= minScore;

    claimResults[requiredClaim] = {
      verified: meetsThreshold,
      score: claim.score,
      reason: meetsThreshold
        ? `Score ${claim.score} meets threshold ${minScore}`
        : `Score ${claim.score} below threshold ${minScore}`,
    };
  }

  const allVerified = Object.values(claimResults).every(r => r.verified);
  const responsePayload = canonicalize({ requestId: request.requestId, tokenId: request.tokenId, claimResults, verified: allVerified });
  const signature = createHmac("sha256", secret).update(responsePayload).digest("hex");

  return {
    requestId: request.requestId,
    tokenId: request.tokenId,
    verified: allVerified,
    claimResults,
    verifierId,
    timestamp: Date.now(),
    signature,
  };
}
