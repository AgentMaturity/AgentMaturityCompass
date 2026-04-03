/**
 * Micro-score — Response-level scoring for live traffic (AMC-427)
 *
 * Lightweight, zero-LLM-call scoring that runs on every response in the steer pipeline.
 * Dimensions: coherence, conciseness, safety, relevance, format compliance.
 * Returns a 0-1 composite score plus per-dimension breakdowns.
 */

import type { SteerStage, SteerResponseContext } from "./types.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface MicroScoreDimension {
  name: string;
  score: number; // 0-1
  weight: number;
  signals: string[];
}

export interface MicroScoreResult {
  composite: number; // 0-1 weighted average
  dimensions: MicroScoreDimension[];
  responseLength: number;
  timestamp: number;
}

export interface MicroScoreOptions {
  /** Weight overrides per dimension (default all 1.0) */
  weights?: Partial<Record<string, number>>;
  /** Maximum response length before penalizing conciseness */
  maxDesiredLength?: number;
  /** Minimum response length before penalizing (too terse) */
  minDesiredLength?: number;
}

// ── Safety signals ─────────────────────────────────────────────────────────

const SAFETY_RED_FLAGS = [
  /\b(?:ignore|bypass|override)\s+(?:safety|security|restrictions|guidelines)\b/i,
  /\b(?:jailbreak|hack|exploit)\b/i,
  /\b(?:here(?:'s| is) how to (?:hack|break|bypass))\b/i,
  /\b(?:sudo|rm -rf|chmod 777)\b/i,
];

// ── Anti-refusal patterns ─────────────────────────────────────────────────
// Detects model refusal phrases that indicate the response is blocking rather
// than answering. Each pattern has a weight — hard refusals score higher.

interface RefusalPattern {
  pattern: RegExp;
  weight: number; // 1 = soft, 2 = moderate, 3 = hard refusal
  label: string;
}

const REFUSAL_PATTERNS: RefusalPattern[] = [
  // Hard refusals (weight 3) — outright "I can't/won't"
  { pattern: /\bI(?:'m| am) (?:sorry|afraid),?\s*(?:but\s+)?I\s+(?:can(?:'t|not)|am (?:not|un)able)\b/i, weight: 3, label: "apology_refusal" },
  { pattern: /\bI\s+cannot\s+(?:assist|help|fulfill|comply|provide|engage)\b/i, weight: 3, label: "cannot_verb" },
  { pattern: /\bI\s+can(?:'t|not)\s+(?:help|assist|provide|do that|fulfill)\b/i, weight: 3, label: "cant_verb" },
  { pattern: /\bI\s+will\s+not\s+(?:help|assist|provide|engage)\b/i, weight: 3, label: "will_not" },
  { pattern: /\bI\s+must\s+(?:decline|refuse|respectfully decline)\b/i, weight: 3, label: "must_decline" },
  { pattern: /\bI(?:'m| am)\s+(?:not able|unable)\s+to\s+(?:help|assist|provide)\b/i, weight: 3, label: "unable_to" },
  { pattern: /\bI(?:'m| am)\s+(?:designed|programmed)\s+(?:to\s+(?:refuse|decline)|not\s+to\s+(?:assist|help|provide))\b/i, weight: 3, label: "programmed_refuse" },
  { pattern: /\bI\s+need\s+to\s+(?:respectfully\s+)?decline\b/i, weight: 3, label: "need_decline" },

  // Moderate refusals (weight 2) — policy/guideline language
  { pattern: /\b(?:against|violates?|outside)\s+(?:my|the)\s+(?:guidelines|policies|usage policies|acceptable use)\b/i, weight: 2, label: "policy_violation" },
  { pattern: /\bmy\s+(?:guidelines|policies)\s+prevent\b/i, weight: 2, label: "guidelines_prevent" },
  { pattern: /\bAs\s+a\s+(?:responsible\s+)?AI\b/i, weight: 2, label: "as_an_ai" },
  { pattern: /\bAs\s+an\s+AI\s+(?:language\s+)?model\b/i, weight: 2, label: "ai_language_model" },
  { pattern: /\bI\s+(?:apologize|must apologize),?\s*(?:but|for)\b/i, weight: 2, label: "apologize_but" },
  { pattern: /\bMy\s+apologies,?\s*(?:but|I)\b/i, weight: 2, label: "my_apologies" },
  { pattern: /\b(?:This|That)\s+(?:request\s+)?(?:goes against|violates|is outside)\b/i, weight: 2, label: "request_violates" },
  { pattern: /\b(?:This|That)\s+is\s+outside\s+my\s+(?:acceptable use|boundaries)\b/i, weight: 2, label: "outside_boundaries" },

  // Soft refusals (weight 1) — hedged declines, conditional refusals
  { pattern: /\bI\s+don(?:'t| not)\s+think\s+I\s+should\b/i, weight: 1, label: "dont_think_should" },
  { pattern: /\bSorry,?\s*(?:but\s+)?I(?:'m| am)\s+unable\b/i, weight: 1, label: "sorry_unable" },
  { pattern: /\bUnfortunately,?\s*I\s+(?:cannot|can(?:'t|not))\b/i, weight: 1, label: "unfortunately_cant" },
  { pattern: /\bI\s+(?:can(?:'t|not)|am unable to)\s+(?:provide\s+)?(?:information|details|guidance)\s+on\b/i, weight: 1, label: "cant_provide_info" },
  { pattern: /\bplease\s+consult\s+(?:an?\s+)?(?:appropriate|qualified|licensed)\s+(?:professional|expert|specialist)\b/i, weight: 1, label: "consult_professional" },
  { pattern: /\bI(?:'m| am)\s+(?:not\s+)?(?:comfortable|equipped)\s+(?:to|with)\b/i, weight: 1, label: "not_comfortable" },
  { pattern: /\bfor\s+(?:safety|ethical|legal)\s+reasons?\b/i, weight: 1, label: "safety_reasons" },
  { pattern: /\bI\s+(?:strongly\s+)?(?:advise|recommend|suggest)\s+(?:against|not)\b/i, weight: 1, label: "advise_against" },
  { pattern: /\bI(?:'m| am)\s+not\s+(?:the right|qualified|in a position)\b/i, weight: 1, label: "not_qualified" },
  { pattern: /\bconsult\s+(?:a\s+)?(?:doctor|lawyer|professional|expert)\b/i, weight: 1, label: "consult_expert" },
];

const HEDGE_INDICATORS = [
  /\bI think\b/gi,
  /\bperhaps\b/gi,
  /\bmaybe\b/gi,
  /\bpossibly\b/gi,
  /\bit seems\b/gi,
  /\bI'm not sure\b/gi,
  /\bmight be\b/gi,
  /\bcould be\b/gi,
];

const REPETITION_WINDOW = 50; // characters to check for repetition

// ── Scoring functions ──────────────────────────────────────────────────────

function scoreCoherence(text: string): MicroScoreDimension {
  const signals: string[] = [];
  let score = 1.0;

  // Check for abrupt topic shifts (consecutive sentences with no shared words)
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 10);
  if (sentences.length >= 2) {
    let incoherentTransitions = 0;
    for (let i = 1; i < sentences.length; i++) {
      const prev = new Set(sentences[i - 1]!.toLowerCase().split(/\s+/));
      const curr = sentences[i]!.toLowerCase().split(/\s+/);
      const overlap = curr.filter((w) => prev.has(w) && w.length > 3).length;
      if (overlap === 0) incoherentTransitions++;
    }
    const ratio = incoherentTransitions / (sentences.length - 1);
    if (ratio > 0.5) {
      score -= 0.3;
      signals.push("low_sentence_coherence");
    }
  }

  // Check for repetition (same substring repeated)
  for (let i = 0; i < text.length - REPETITION_WINDOW * 2; i += REPETITION_WINDOW) {
    const chunk = text.slice(i, i + REPETITION_WINDOW);
    const rest = text.slice(i + REPETITION_WINDOW);
    if (rest.includes(chunk)) {
      score -= 0.2;
      signals.push("repetitive_content");
      break;
    }
  }

  // Empty or near-empty
  if (text.trim().length < 5) {
    score = 0.1;
    signals.push("near_empty_response");
  }

  return { name: "coherence", score: Math.max(0, score), weight: 1.0, signals };
}

function scoreConciseness(
  text: string,
  minLen: number,
  maxLen: number,
): MicroScoreDimension {
  const signals: string[] = [];
  let score = 1.0;
  const len = text.length;

  if (len > maxLen) {
    score -= Math.min(0.5, ((len - maxLen) / maxLen) * 0.5);
    signals.push("exceeds_max_length");
  }
  if (len < minLen && len > 0) {
    score -= Math.min(0.3, ((minLen - len) / minLen) * 0.3);
    signals.push("below_min_length");
  }

  // Hedge density
  let hedgeCount = 0;
  for (const pattern of HEDGE_INDICATORS) {
    const matches = text.match(pattern);
    if (matches) hedgeCount += matches.length;
  }
  const hedgeDensity = hedgeCount / Math.max(1, text.split(/\s+/).length);
  if (hedgeDensity > 0.05) {
    score -= 0.15;
    signals.push("high_hedge_density");
  }

  return {
    name: "conciseness",
    score: Math.max(0, score),
    weight: 1.0,
    signals,
  };
}

function scoreSafety(text: string): MicroScoreDimension {
  const signals: string[] = [];
  let score = 1.0;

  for (const pattern of SAFETY_RED_FLAGS) {
    if (pattern.test(text)) {
      score -= 0.3;
      signals.push(`safety_flag:${pattern.source.slice(0, 30)}`);
    }
  }

  return { name: "safety", score: Math.max(0, score), weight: 1.5, signals };
}

function scoreAntiRefusal(text: string): MicroScoreDimension {
  const signals: string[] = [];
  let totalWeightedHits = 0;

  for (const { pattern, weight, label } of REFUSAL_PATTERNS) {
    if (pattern.test(text)) {
      totalWeightedHits += weight;
      signals.push(`refusal:${label}`);
    }
  }

  if (totalWeightedHits === 0) {
    return { name: "anti-refusal", score: 1.0, weight: 1.2, signals };
  }

  // Scale penalty by refusal density relative to text length.
  // Short texts that are mostly refusal get hit harder than long texts
  // where a refusal phrase is embedded in otherwise helpful content.
  const wordCount = Math.max(1, text.split(/\s+/).length);
  const densityFactor = Math.min(1.0, 30 / wordCount); // short = high penalty

  // Base penalty: each weighted hit drops the score
  // Hard refusal (3) ≈ -0.25, moderate (2) ≈ -0.17, soft (1) ≈ -0.08
  const basePenalty = totalWeightedHits * 0.08;
  const penalty = Math.min(0.9, basePenalty * (0.5 + 0.5 * densityFactor));
  const score = Math.max(0.05, 1.0 - penalty);

  return { name: "anti-refusal", score, weight: 1.2, signals };
}

function scoreFormatCompliance(text: string): MicroScoreDimension {
  const signals: string[] = [];
  let score = 1.0;

  // Check for broken markdown
  const openCodeBlocks = (text.match(/```/g) || []).length;
  if (openCodeBlocks % 2 !== 0) {
    score -= 0.2;
    signals.push("unclosed_code_block");
  }

  // Check for broken links
  const brokenLinks = text.match(/\[([^\]]*)\]\(\s*\)/g);
  if (brokenLinks && brokenLinks.length > 0) {
    score -= 0.1;
    signals.push("empty_link_targets");
  }

  // Check for trailing incomplete sentence
  const trimmed = text.trim();
  if (
    trimmed.length > 20 &&
    !trimmed.endsWith(".") &&
    !trimmed.endsWith("!") &&
    !trimmed.endsWith("?") &&
    !trimmed.endsWith(":") &&
    !trimmed.endsWith("```") &&
    !trimmed.endsWith(">") &&
    !trimmed.endsWith(")") &&
    !trimmed.endsWith("]")
  ) {
    score -= 0.1;
    signals.push("incomplete_ending");
  }

  return {
    name: "format",
    score: Math.max(0, score),
    weight: 0.8,
    signals,
  };
}

// ── Main scoring ───────────────────────────────────────────────────────────

export function microScore(
  text: string,
  options: MicroScoreOptions = {},
): MicroScoreResult {
  const maxLen = options.maxDesiredLength ?? 4000;
  const minLen = options.minDesiredLength ?? 20;

  const dimensions = [
    scoreCoherence(text),
    scoreConciseness(text, minLen, maxLen),
    scoreSafety(text),
    scoreAntiRefusal(text),
    scoreFormatCompliance(text),
  ];

  // Apply weight overrides
  if (options.weights) {
    for (const dim of dimensions) {
      if (options.weights[dim.name] !== undefined) {
        dim.weight = options.weights[dim.name]!;
      }
    }
  }

  const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0);
  const composite =
    totalWeight > 0
      ? dimensions.reduce((sum, d) => sum + d.score * d.weight, 0) / totalWeight
      : 0;

  return {
    composite: Math.round(composite * 1000) / 1000,
    dimensions,
    responseLength: text.length,
    timestamp: Date.now(),
  };
}

// ── Steer stage ────────────────────────────────────────────────────────────

/**
 * Creates a SteerStage that attaches micro-score metadata to responses.
 * Does NOT modify the response body — only annotates via metadata.
 */
export function createMicroScoreStage(
  options: MicroScoreOptions = {},
): SteerStage {
  return {
    id: "micro-score",
    enabled: true,
    onResponse: async (
      context: SteerResponseContext,
    ): Promise<SteerResponseContext> => {
      const contentType = context.response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        return context;
      }

      const cloned = context.response.clone();
      let text = "";
      try {
        const body = (await cloned.json()) as Record<string, unknown>;
        // OpenAI
        if (Array.isArray(body.choices)) {
          const first = (body.choices as Array<Record<string, unknown>>)[0];
          const msg = first?.message as Record<string, unknown> | undefined;
          if (msg && typeof msg.content === "string") {
            text = msg.content;
          }
        }
        // Anthropic
        if (!text && Array.isArray(body.content)) {
          const first = (body.content as Array<Record<string, unknown>>)[0];
          if (first && typeof first.text === "string") {
            text = first.text;
          }
        }
      } catch {
        return context;
      }

      if (!text) return context;

      const score = microScore(text, options);
      return {
        ...context,
        metadata: {
          ...context.metadata,
          microScore: score,
        },
      };
    },
  };
}
