import { emitGuardEvent } from '../enforce/evidenceEmitter.js';
import { matchInjection } from './injection/injectionMatcher.js';

export interface Attack {
  type: string;
  pattern: string;
  confidence: number;
  position: number;
}

export interface DetectorResult {
  detected: boolean;
  attacks: Attack[];
  riskScore: number;
  confidence: number;
}

interface PatternDef {
  type: string;
  regex: RegExp;
  confidence: number;
}

/**
 * Injection detection, as an adapter over the one matcher (P5.1).
 *
 * This file used to own a 16-regex table of its own, one of four that
 * disagreed with each other. The table moved to `injection/injectionPatterns`;
 * what stays here is the SHAPE this module's callers already depend on —
 * `Attack[]` with a `type`, and a risk score averaged across matches.
 *
 * Reports every match regardless of confidence, because this function feeds
 * scoring and reporting rather than a block decision. The firewall applies a
 * threshold; this does not.
 */
export function detectInjection(prompt: string): DetectorResult {
  const verdict = matchInjection(prompt);
  const attacks: Attack[] = verdict.matches.map((match) => ({
    type: match.category,
    pattern: match.matchedText.slice(0, 80),
    confidence: match.confidence,
    position: match.position,
  }));

  const riskScore = attacks.length === 0 ? 0 : Math.min(1, attacks.reduce((s, a) => s + a.confidence, 0) / attacks.length);

  const result = { detected: attacks.length > 0, attacks, riskScore, confidence: riskScore };
  emitGuardEvent({
    agentId: 'system', moduleCode: 'S2',
    decision: result.detected ? 'deny' : 'allow',
    reason: result.detected ? `Detected ${attacks.length} injection attacks` : 'No injection detected',
    severity: result.detected ? 'critical' : 'low',
    meta: { attackCount: attacks.length, riskScore },
  });
  return result;
}

export function detect(input: string): DetectorResult {
  return detectInjection(input);
}
