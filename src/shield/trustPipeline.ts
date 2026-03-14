/**
 * End-to-End Trust Pipeline
 *
 * Orchestrates the full trust verification workflow:
 * 1. Shield pre-action trust gate → runtime action check
 * 2. Formal verification → bounded model check on safety properties
 * 3. ZK privacy → range proof that trust score meets threshold
 * 4. Trust interchange → portable trust token capturing pipeline results
 *
 * Each stage produces a SHA-256 evidence hash; hashes are chained so any
 * mutation of an intermediate result invalidates the chain.
 */

import { createHash } from 'node:crypto';
import {
  shieldGuardOrchestrator,
  type PreActionTrustGateRequest,
  type PreActionTrustGateResult,
} from './shieldGuardOrchestrator.js';
import { boundedModelCheck } from '../enforce/formalVerification.js';
import { createZKRangeProof } from '../vault/zkPrivacy.js';
import { issueTrustToken, type TrustClaim } from '../passport/trustInterchange.js';

// ── Public Interfaces ─────────────────────────────────────────────────────

export interface TrustPipelineInput {
  agentId: string;
  action: string;
  toolName: string;
  parameters: Record<string, unknown>;
  sessionId: string;
  workspaceId: string;
}

export interface TrustPipelineResult {
  allowed: boolean;
  stages: {
    shieldGate: { passed: boolean; trustScore: number; reason: string };
    formalVerification: { passed: boolean; propertiesVerified: number; certificateHash: string };
    zkProof: { generated: boolean; claim: string; proofId: string };
    trustToken: { issued: boolean; tokenId: string; expiresAt: number };
  };
  overallTrustScore: number;
  evidenceChain: string[]; // SHA-256 hashes linking each stage
  processingTimeMs: number;
}

// ── Internal helpers ──────────────────────────────────────────────────────

const PIPELINE_SECRET = process.env['AMC_PIPELINE_SECRET'] ?? 'amc-pipeline-default-secret';
const TRUST_THRESHOLD = 50; // Minimum display-scale score (0-100) for ZK proof
const ZK_BIT_LENGTH = 8;

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Chain a new stage hash onto the previous evidence hash. */
function chainHash(prev: string, stageLabel: string, stageData: unknown): string {
  const payload = `${prev}:${stageLabel}:${JSON.stringify(stageData)}`;
  return sha256(payload);
}

// ── Pipeline ──────────────────────────────────────────────────────────────

/**
 * Run the full end-to-end trust pipeline for an agent action.
 *
 * Even when the shield gate blocks the action, the pipeline returns a
 * complete result object (with `allowed: false`) so callers can inspect
 * which stage failed.
 */
export async function runTrustPipeline(input: TrustPipelineInput): Promise<TrustPipelineResult> {
  const startTime = Date.now();
  const evidenceChain: string[] = [];

  // ── Stage 0: genesis hash ─────────────────────────────────────────────
  const genesisHash = sha256(
    `pipeline:${input.agentId}:${input.action}:${input.sessionId}:${startTime}`,
  );
  evidenceChain.push(genesisHash);

  // ── Stage 1: Shield pre-action trust gate ─────────────────────────────
  const gateRequest: PreActionTrustGateRequest = {
    action: input.action,
    toolName: input.toolName,
    parameters: input.parameters,
    sessionId: input.sessionId,
    instructionSource: 'user',
    trustContext: {
      lastVerifiedAt: Date.now(),
      cumulativeConfidence: 1.0,
      stepNumber: 1,
      previousActions: [],
    },
  };

  let gateResult: PreActionTrustGateResult;
  try {
    gateResult = await shieldGuardOrchestrator.preActionTrustGate(gateRequest);
  } catch (err) {
    gateResult = {
      allowed: false,
      reason: err instanceof Error ? err.message : 'Shield gate error',
      trustScore: 0,
      checks: {
        instructionHierarchyValid: false,
        dataLeakageRisk: 'none',
        credentialFreshness: 'expired',
        uncertaintyAcceptable: false,
      },
      recommendations: [],
      evidenceId: sha256(`gate-error:${input.sessionId}`),
    };
  }

  const shieldGateStage = {
    passed: gateResult.allowed,
    trustScore: gateResult.trustScore,
    reason: gateResult.reason,
  };

  const shieldHash = chainHash(genesisHash, 'shield-gate', shieldGateStage);
  evidenceChain.push(shieldHash);

  // If the shield gate blocked the action, stop here.
  if (!gateResult.allowed) {
    const processingTimeMs = Date.now() - startTime;
    return {
      allowed: false,
      stages: {
        shieldGate: shieldGateStage,
        formalVerification: { passed: false, propertiesVerified: 0, certificateHash: '' },
        zkProof: { generated: false, claim: '', proofId: '' },
        trustToken: { issued: false, tokenId: '', expiresAt: 0 },
      },
      overallTrustScore: gateResult.trustScore * 100, // convert 0-1 to display scale
      evidenceChain,
      processingTimeMs,
    };
  }

  // ── Stage 2: Formal verification ─────────────────────────────────────
  let formalVerificationStage = {
    passed: false,
    propertiesVerified: 0,
    certificateHash: '',
  };

  try {
    const modelCheckResult = boundedModelCheck(input.agentId);
    const violations = modelCheckResult.violations.filter(v => !v.holds);
    const propertiesVerified = modelCheckResult.certificates.length;
    const certificateHash =
      modelCheckResult.certificates.length > 0
        ? (modelCheckResult.certificates[0]!.certificateHash ?? sha256('no-cert'))
        : sha256('no-cert');

    formalVerificationStage = {
      passed: violations.length === 0,
      propertiesVerified,
      certificateHash,
    };
  } catch (err) {
    formalVerificationStage = {
      passed: false,
      propertiesVerified: 0,
      certificateHash: sha256(`fv-error:${input.agentId}`),
    };
  }

  const formalHash = chainHash(shieldHash, 'formal-verification', formalVerificationStage);
  evidenceChain.push(formalHash);

  // ── Stage 3: ZK range proof ───────────────────────────────────────────
  // Prove the trust score meets the threshold without revealing the exact score.
  const trustScoreDisplay = Math.round(gateResult.trustScore * 100);

  let zkProofStage = {
    generated: false,
    claim: '',
    proofId: '',
  };

  try {
    const zkProof = createZKRangeProof(
      trustScoreDisplay,
      TRUST_THRESHOLD,
      input.agentId,
      ZK_BIT_LENGTH,
    );
    zkProofStage = {
      generated: zkProof.verified,
      claim: zkProof.claim,
      proofId: zkProof.id,
    };
  } catch (err) {
    zkProofStage = {
      generated: false,
      claim: `score >= ${TRUST_THRESHOLD}`,
      proofId: sha256(`zk-error:${input.agentId}`),
    };
  }

  const zkHash = chainHash(formalHash, 'zk-proof', zkProofStage);
  evidenceChain.push(zkHash);

  // ── Stage 4: Trust token issuance ────────────────────────────────────
  let trustTokenStage = {
    issued: false,
    tokenId: '',
    expiresAt: 0,
  };

  try {
    const claims: TrustClaim[] = [
      {
        dimension: 'security',
        score: trustScoreDisplay,
        level: trustScoreDisplay >= 90 ? 'L5' :
               trustScoreDisplay >= 75 ? 'L4' :
               trustScoreDisplay >= 55 ? 'L3' :
               trustScoreDisplay >= 35 ? 'L2' :
               trustScoreDisplay >= 15 ? 'L1' : 'L0',
        evidenceCount: formalVerificationStage.propertiesVerified,
        observedShare: gateResult.trustScore,
        lastAssessedAt: Date.now(),
      },
    ];

    const token = issueTrustToken(
      input.workspaceId,
      sha256(`pipeline-pubkey:${input.workspaceId}`),
      input.agentId,
      claims,
      PIPELINE_SECRET,
      { ttlHours: 1, displayName: input.agentId },
    );

    trustTokenStage = {
      issued: true,
      tokenId: token.tokenId,
      expiresAt: token.expiresAt,
    };
  } catch (err) {
    trustTokenStage = {
      issued: false,
      tokenId: '',
      expiresAt: 0,
    };
  }

  const tokenHash = chainHash(zkHash, 'trust-token', trustTokenStage);
  evidenceChain.push(tokenHash);

  // ── Aggregate ─────────────────────────────────────────────────────────
  const overallTrustScore =
    gateResult.trustScore * 100 *
    (formalVerificationStage.passed ? 1.0 : 0.8) *
    (zkProofStage.generated ? 1.0 : 0.9) *
    (trustTokenStage.issued ? 1.0 : 0.95);

  const processingTimeMs = Date.now() - startTime;

  return {
    allowed: gateResult.allowed,
    stages: {
      shieldGate: shieldGateStage,
      formalVerification: formalVerificationStage,
      zkProof: zkProofStage,
      trustToken: trustTokenStage,
    },
    overallTrustScore: Math.round(overallTrustScore * 10) / 10,
    evidenceChain,
    processingTimeMs,
  };
}
