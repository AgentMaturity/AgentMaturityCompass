import { INJECTION_PATTERNS } from "./injectionPatterns.js";
import type { InjectionCategory, InjectionPattern, InjectionSeverity } from "./injectionPatterns.js";

/**
 * The one prompt-injection matcher (P5.1).
 *
 * Four tables became one; this is the only thing that reads it. The adapters
 * in `detector.ts`, `validators/`, `threatIntel.ts` and the runtime firewall
 * all call here and reshape the result to whatever their callers already
 * expect — so the four answers become one answer with four presentations,
 * which is the opposite of what it was.
 *
 * A CALLER STATES ITS THRESHOLD. A block decision and a risk score want
 * different things from the same evidence: blocking on a 0.5-confidence
 * percent-encoding hint would refuse every URL, and scoring that ignored it
 * would miss obfuscation. Neither is the table's business, so `minConfidence`
 * belongs to the caller and every caller says what it chose and why.
 */

export interface InjectionMatch {
  readonly id: string;
  readonly category: InjectionCategory;
  readonly severity: InjectionSeverity;
  readonly confidence: number;
  /** The text that matched, for evidence a person can check. */
  readonly matchedText: string;
  readonly position: number;
}

export interface InjectionVerdict {
  readonly detected: boolean;
  readonly matches: readonly InjectionMatch[];
  /** The highest severity seen, or null when nothing matched. */
  readonly severity: InjectionSeverity | null;
  /** 0..100, driven by the strongest match rather than by how many fired. */
  readonly riskScore: number;
  /** The strongest single confidence, 0 when nothing matched. */
  readonly confidence: number;
}

export interface InjectionMatchOptions {
  /** Patterns below this are not reported. Default 0: report everything. */
  readonly minConfidence?: number;
}

const SEVERITY_ORDER: readonly InjectionSeverity[] = ["low", "medium", "high", "critical"];

function strongest(a: InjectionSeverity | null, b: InjectionSeverity): InjectionSeverity {
  if (a === null) return b;
  return SEVERITY_ORDER.indexOf(b) > SEVERITY_ORDER.indexOf(a) ? b : a;
}

/**
 * Match `text` against the table.
 *
 * The risk score follows the STRONGEST match, not the count. Ten low-confidence
 * obfuscation hints are not more dangerous than one "ignore all previous
 * instructions", and a score that summed them would rank a base64 blob above
 * the thing the table exists to catch.
 */
export function matchInjection(text: string, options: InjectionMatchOptions = {}): InjectionVerdict {
  const minConfidence = options.minConfidence ?? 0;
  const matches: InjectionMatch[] = [];
  let severity: InjectionSeverity | null = null;
  let confidence = 0;

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.confidence < minConfidence) continue;
    const found = matchOne(pattern, text);
    if (!found) continue;
    matches.push(found);
    severity = strongest(severity, pattern.severity);
    confidence = Math.max(confidence, pattern.confidence);
  }

  return {
    detected: matches.length > 0,
    matches,
    severity,
    riskScore: Math.round(confidence * 100),
    confidence
  };
}

function matchOne(pattern: InjectionPattern, text: string): InjectionMatch | null {
  // No `g`-stripping here, deliberately. A shared RegExp carrying `g` keeps
  // `lastIndex` between calls, so the same input can match and then not match
  // — an intermittent miss a security matcher must not have. The first version
  // defended against it by rebuilding each regex, which was untestable
  // insurance against a pattern nobody had written. The invariant is asserted
  // instead: a test refuses any table entry carrying `g`, so the situation
  // cannot arise rather than being survived.
  const found = pattern.regex.exec(text);
  if (!found) return null;
  return {
    id: pattern.id,
    category: pattern.category,
    severity: pattern.severity,
    confidence: pattern.confidence,
    matchedText: found[0],
    position: found.index
  };
}

/**
 * Confidence at or above which a match is worth REFUSING a request over.
 *
 * The runtime firewall passes this; the shield detectors do not. That split is
 * the whole reason confidence lives in the table: the shared patterns include
 * low-confidence obfuscation hints — a long base64 run, a percent-encoded byte
 * — which belong in a risk score and must never, on their own, refuse a
 * request. Before consolidation the firewall avoided that by owning a separate
 * and much narrower regex, which is also why it disagreed with the other three
 * about everything else.
 */
export const BLOCK_CONFIDENCE = 0.75;
