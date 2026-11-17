/**
 * Universal Trust Interchange Protocol for AMC Passport
 *
 * Cross-platform trust portability:
 * - Standardized trust credential format (AMC Trust Token)
 * - Cross-platform credential exchange
 * - Federated trust verification network
 * - Trust translation between different scoring systems
 */

import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { canonicalize as canonicalJson } from "../utils/json.js";
import { type MaturityLevel } from "../score/formalSpec.js";
import { scoreToLevel, toDisplayScore, toInternalScore, getScoringConfig } from "../score/scoringScale.js";

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * AMC Trust Token: a set of claims under a shared-secret HMAC. Whoever holds the secret can make one, so it is not a
 * credential anyone else can check. A token made with the public demo secret (`amc passport issue-token`) is a demo:
 * it says so inside the token, and no verifier calls it verified.
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
  /** Present on a token made with the public demo secret. */
  demo?: true;
  notice?: string;
  signature: string;              // HMAC-SHA256 of canonical token
}

/** The public secret the CLI demo signs with. Anyone can make a token with it, so it never verifies. */
export const DEMO_TOKEN_SECRET = "cli-demo-secret";
export const DEMO_TOKEN_NOTICE = "Demo token: signed with a public demo secret that anyone can use, so it shows nothing about the agent and is never verified.";

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
  conversionFactor: number;       // Multiply source score by this (made-up example value)
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

/** Deep canonical form: the old top-level key list dropped every nested field, so claims were not under the HMAC. */
function canonicalize(obj: unknown): string {
  return canonicalJson(obj);
}

function hmacMatches(payload: string, secret: string, signature: string): boolean {
  const expected = Buffer.from(createHmac("sha256", secret).update(payload).digest("hex"), "utf8");
  const given = Buffer.from(typeof signature === "string" ? signature : "", "utf8");
  return given.length === expected.length && timingSafeEqual(given, expected);
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

/** The CLI demo: a token under the public demo secret, labelled a demo inside the token itself. */
export function issueDemoTrustToken(agentId: string, claims: TrustClaim[], opts?: { ttlHours?: number }): AMCTrustToken {
  const now = Date.now();
  const token: Omit<AMCTrustToken, "signature"> = {
    version: "1.0", tokenId: randomUUID(), issuer: { workspaceId: "demo", platform: "amc", publicKeyHash: "none" },
    subject: { agentId }, claims, issuedAt: now, expiresAt: now + (opts?.ttlHours ?? 24) * 3600000, demo: true, notice: DEMO_TOKEN_NOTICE
  };
  return { ...token, signature: createHmac("sha256", DEMO_TOKEN_SECRET).update(canonicalize(token)).digest("hex") };
}

/**
 * Verify an AMC Trust Token. A demo token, or any token checked against the public demo secret, is never valid.
 */
export function verifyTrustToken(
  token: AMCTrustToken,
  secret: string,
): { valid: boolean; reasons: string[]; hmacMatches: boolean; demo: boolean } {
  const reasons: string[] = [];

  // Check expiry
  if (Date.now() > token.expiresAt) {
    reasons.push(`Token expired at ${new Date(token.expiresAt).toISOString()}`);
  }

  // Check signature
  const tokenCopy = { ...token };
  delete (tokenCopy as Record<string, unknown>).signature;
  const payload = canonicalize(tokenCopy);
  const matches = hmacMatches(payload, secret, token.signature);
  if (!matches) reasons.push("Invalid signature");
  const demo = secret === DEMO_TOKEN_SECRET || token.demo === true;
  if (demo) reasons.push(DEMO_TOKEN_NOTICE);

  // Check claims integrity
  for (const claim of token.claims) {
    if (claim.score < 0 || claim.score > getScoringConfig().scale) reasons.push(`Invalid score for ${claim.dimension}: ${claim.score}`);
    if (claim.observedShare < 0 || claim.observedShare > 1) reasons.push(`Invalid observedShare for ${claim.dimension}`);
  }

  return { valid: reasons.length === 0, reasons, hmacMatches: matches, demo };
}

// ── Trust Translation ──────────────────────────────────────────────────────

/** Shown with every translation: the factors below are AMC's own made-up examples, not from either framework. */
export const TRANSLATION_NOTICE = "Example only: these conversion factors were made up by AMC. NIST AI RMF and ISO/IEC 42001 have no numeric score, so no real conversion exists.";

/**
 * Example translation tables. The factors, offsets and confidences are made-up examples: neither NIST AI RMF nor
 * ISO/IEC 42001 defines a numeric scale, so these numbers do not come from either framework.
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
  // A claim is checked only inside a token that verifies: a demo, expired or altered token verifies no claim.
  const tokenCheck = verifyTrustToken(token, secret);

  for (const requiredClaim of request.requiredClaims) {
    if (!tokenCheck.valid) {
      claimResults[requiredClaim] = { verified: false, score: 0, reason: `token not verified: ${tokenCheck.reasons.join("; ")}` };
      continue;
    }
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
