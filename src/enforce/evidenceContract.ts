import { createHash } from 'node:crypto';
import { emitGuardEvent } from './evidenceEmitter.js';

export interface Claim {
  id: string;
  statement: string;
  requiredEvidence: string[];
}

export interface Evidence {
  id: string;
  claimId: string;
  content: string;
  source?: string;
}

export interface EvidenceContract {
  contractId: string;
  claims: Claim[];
  claimHashes: Record<string, string>;
  createdAt: number;
  verified: boolean;
}

export interface VerificationResult {
  verified: boolean;
  claimResults: Array<{ claimId: string; satisfied: boolean; missingEvidence: string[]; hashValid: boolean }>;
  overallScore: number;
}

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function createEvidenceContract(claims: Claim[]): EvidenceContract {
  const claimHashes: Record<string, string> = {};
  for (const claim of claims) {
    claimHashes[claim.id] = hashContent(JSON.stringify(claim));
  }
  emitGuardEvent({ agentId: 'system', moduleCode: 'E24', decision: 'allow', reason: 'E24 observation (no allow/deny decision was made here)', severity: 'medium' });
  return {
    contractId: `ec_${Date.now()}_${hashContent(JSON.stringify(claims)).slice(0, 8)}`,
    claims,
    claimHashes,
    createdAt: Date.now(),
    verified: false,
  };
}

export function verifyEvidenceContract(contract: EvidenceContract, evidence: Evidence[]): VerificationResult {
  const claimResults: VerificationResult['claimResults'] = [];

  for (const claim of contract.claims) {
    const expectedHash = contract.claimHashes[claim.id];
    const actualHash = hashContent(JSON.stringify(claim));
    const hashValid = expectedHash === actualHash;

    const providedEvidence = evidence.filter(e => e.claimId === claim.id);
    const providedIds = new Set(providedEvidence.map(e => e.id));
    const missingEvidence = claim.requiredEvidence.filter(id => !providedIds.has(id));

    claimResults.push({ claimId: claim.id, satisfied: missingEvidence.length === 0 && hashValid, missingEvidence, hashValid });
  }

  const satisfiedCount = claimResults.filter(r => r.satisfied).length;
    const __e24Allowed = claimResults.every(r => r.satisfied);
  emitGuardEvent({ agentId: 'system', moduleCode: 'E24', severity: 'medium', decision: __e24Allowed ? 'allow' : 'deny', reason: `E24 ${__e24Allowed ? 'allowed' : 'denied'}` });
  return { verified: claimResults.every(r => r.satisfied),
    claimResults,
    overallScore: contract.claims.length > 0 ? satisfiedCount / contract.claims.length : 0,
  };
}