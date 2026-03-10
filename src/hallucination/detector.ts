/**
 * hallucination/detector.ts — Composite hallucination detector.
 *
 * Orchestrates deterministic detectors and the optional LLM judge,
 * deduplicates findings, and produces a scored detection result.
 */

import type {
  HallucinationDetectorInput,
  HallucinationDetectorConfig,
  HallucinationDetectionResult,
  HallucinationFinding,
  HallucinationType,
} from "./types.js";
import { runAllDeterministicDetectors } from "./deterministicDetectors.js";
import { runLlmJudge } from "./llmJudge.js";

const ALL_TYPES: HallucinationType[] = [
  "fabricated_fact",
  "fabricated_citation",
  "fabricated_statistic",
  "fabricated_url",
  "false_attribution",
  "contradiction",
  "unsupported_certainty",
  "temporal_fabrication",
];

const DEFAULT_CONFIG: Required<Omit<HallucinationDetectorConfig, "llmJudgeFn">> & { llmJudgeFn: undefined } = {
  threshold: 0.3,
  enableDeterministic: true,
  enableLlmJudge: false,
  minConfidence: 0.5,
  llmJudgeFn: undefined,
};

/**
 * Run hallucination detection on an agent response.
 *
 * Usage:
 * ```ts
 * const result = await detectHallucinations({
 *   response: agentOutput,
 *   context: sourceDocuments,
 *   prompt: userQuestion,
 * });
 * console.log(result.passed, result.score, result.findings);
 * ```
 */
export async function detectHallucinations(
  input: HallucinationDetectorInput,
  config?: HallucinationDetectorConfig,
): Promise<HallucinationDetectionResult> {
  const startMs = Date.now();
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const detectorsUsed: string[] = [];
  let allFindings: HallucinationFinding[] = [];

  // Phase 1: Deterministic detectors
  if (cfg.enableDeterministic) {
    detectorsUsed.push("deterministic");
    const detFindings = runAllDeterministicDetectors(input);
    allFindings.push(...detFindings);
  }

  // Phase 2: LLM judge (optional)
  if (cfg.enableLlmJudge && cfg.llmJudgeFn) {
    detectorsUsed.push("llm_judge");
    const llmFindings = await runLlmJudge(input, cfg.llmJudgeFn);
    allFindings.push(...llmFindings);
  }

  // Filter by minimum confidence
  allFindings = allFindings.filter(f => f.confidence >= cfg.minConfidence);

  // Deduplicate overlapping findings (prefer higher confidence)
  allFindings = deduplicateFindings(allFindings);

  // Score calculation
  const score = calculateScore(allFindings, input.response);

  // Build summary
  const summary = {} as Record<HallucinationType, number>;
  for (const t of ALL_TYPES) {
    summary[t] = allFindings.filter(f => f.type === t).length;
  }

  return {
    findings: allFindings,
    score,
    passed: score <= cfg.threshold,
    summary,
    totalFindings: allFindings.length,
    detectorsUsed,
    durationMs: Date.now() - startMs,
  };
}

/**
 * Deduplicate findings that overlap in span text.
 * When two findings have >50% span overlap, keep the higher-confidence one.
 */
function deduplicateFindings(findings: HallucinationFinding[]): HallucinationFinding[] {
  if (findings.length <= 1) return findings;

  // Sort by confidence descending
  const sorted = [...findings].sort((a, b) => b.confidence - a.confidence);
  const kept: HallucinationFinding[] = [];
  const discarded = new Set<string>();

  for (const finding of sorted) {
    if (discarded.has(finding.id)) continue;

    kept.push(finding);

    // Mark lower-confidence findings with overlapping spans
    for (const other of sorted) {
      if (other.id === finding.id || discarded.has(other.id)) continue;
      if (spansOverlap(finding.span, other.span)) {
        discarded.add(other.id);
      }
    }
  }

  return kept;
}

function spansOverlap(a: string, b: string): boolean {
  if (a === b) return true;
  const shorter = a.length < b.length ? a : b;
  const longer = a.length >= b.length ? a : b;
  // Check if shorter is substantially contained in longer
  return longer.toLowerCase().includes(shorter.toLowerCase()) && shorter.length > longer.length * 0.5;
}

/**
 * Calculate hallucination score (0 = clean, 1 = fully hallucinated).
 *
 * Factors:
 * - Number of findings relative to response length
 * - Severity weighting
 * - Confidence weighting
 */
function calculateScore(findings: HallucinationFinding[], response: string): number {
  if (findings.length === 0) return 0;

  const severityWeights: Record<string, number> = {
    critical: 1.0,
    high: 0.75,
    medium: 0.5,
    low: 0.25,
  };

  // Weighted finding score
  let weightedSum = 0;
  for (const f of findings) {
    const severityW = severityWeights[f.severity] ?? 0.5;
    weightedSum += severityW * f.confidence;
  }

  // Normalize by response length (in sentences, roughly)
  const sentenceCount = Math.max(1, response.split(/[.!?]+/).filter(s => s.trim().length > 10).length);
  const normalizedScore = weightedSum / sentenceCount;

  // Clamp to 0-1
  return Math.min(1, Math.max(0, Number(normalizedScore.toFixed(4))));
}

/**
 * Convenience: run only deterministic detection (synchronous-friendly).
 */
export function detectHallucinationsDeterministic(
  input: HallucinationDetectorInput,
  config?: Omit<HallucinationDetectorConfig, "enableLlmJudge" | "llmJudgeFn">,
): Promise<HallucinationDetectionResult> {
  return detectHallucinations(input, {
    ...config,
    enableDeterministic: true,
    enableLlmJudge: false,
  });
}
