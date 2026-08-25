import { emitGuardEvent } from '../enforce/evidenceEmitter.js';
import { matchInjection } from './injection/injectionMatcher.js';
import { INJECTION_PATTERNS } from './injection/injectionPatterns.js';
/**
 * Threat intelligence — pattern matching against known threat indicators.
 */


export interface ThreatMatch {
  pattern: string;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface ThreatIntelResult {
  matched: boolean;
  threats: ThreatMatch[];
  totalEntries: number;
}

interface ThreatPattern {
  re: RegExp;
  category: string;
  severity: ThreatMatch['severity'];
}

/**
 * Threat matching, as an adapter over the one matcher (P5.1).
 *
 * This file owned a 10-regex table, and its flagship pattern was broken: it
 * read `ignore <one word> instructions`, so "ignore all previous instructions"
 * — two words — did not match. Measured, not inferred. Consolidating fixed it
 * as a side effect of there being one table to fix.
 */
export function checkThreatIntel(text: string): ThreatIntelResult {
  const verdict = matchInjection(text);
  const threats: ThreatMatch[] = verdict.matches.map((match) => ({
    pattern: match.id,
    category: match.category,
    severity: match.severity,
  }));

  const result = { matched: threats.length > 0, threats, totalEntries: INJECTION_PATTERNS.length };
  emitGuardEvent({
    agentId: 'system', moduleCode: 'S3',
    decision: result.matched ? 'deny' : 'allow',
    reason: result.matched ? `Matched ${threats.length} threat patterns` : 'No threats matched',
    severity: result.matched ? 'high' : 'low',
    meta: { threatCount: threats.length, categories: threats.map(t => t.category) },
  });
  return result;
}

export function getStats(): { totalEntries: number; byCategory: Record<string, number> } {
  const byCategory: Record<string, number> = {};
  for (const pattern of INJECTION_PATTERNS) {
    byCategory[pattern.category] = (byCategory[pattern.category] ?? 0) + 1;
  }
  return { totalEntries: INJECTION_PATTERNS.length, byCategory };
}
