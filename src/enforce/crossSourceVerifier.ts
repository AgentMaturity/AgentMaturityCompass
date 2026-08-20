import { emitGuardEvent } from './evidenceEmitter.js';
/**
 * Cross-source verification — checks claim consistency across sources.
 */

export interface VerificationResult {
  consistent: boolean;
  conflicts: string[];
  confidence: number;
}

export function verifyCrossSources(claim: string, sources: string[]): VerificationResult {
  if (sources.length === 0) return { consistent: false, conflicts: ['No sources provided'], confidence: 0 };

  const conflicts: string[] = [];
  const claimLower = claim.toLowerCase();

  let supporting = 0;
  for (const source of sources) {
    const sourceLower = source.toLowerCase();
    // Simple word overlap heuristic
    const claimWords = new Set(claimLower.split(/\s+/).filter(w => w.length > 3));
    const sourceWords = new Set(sourceLower.split(/\s+/).filter(w => w.length > 3));
    let overlap = 0;
    for (const w of claimWords) {
      if (sourceWords.has(w)) overlap++;
    }
    const similarity = claimWords.size > 0 ? overlap / claimWords.size : 0;
    if (similarity >= 0.3) {
      supporting++;
    } else {
      conflicts.push(`Source lacks supporting evidence: "${source.slice(0, 50)}..."`);
    }
  }

  const confidence = sources.length > 0 ? supporting / sources.length : 0;
    const __e30Allowed = conflicts.length === 0;
  emitGuardEvent({ agentId: 'system', moduleCode: 'E30', severity: 'medium', decision: __e30Allowed ? 'allow' : 'deny', reason: `E30 ${__e30Allowed ? 'allowed' : 'denied'}` });
  return { consistent: conflicts.length === 0, conflicts, confidence };
}