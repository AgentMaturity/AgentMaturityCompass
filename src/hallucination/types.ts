/**
 * hallucination/types.ts — Core types for hallucination detection.
 *
 * Defines the taxonomy of hallucination categories and the result
 * structures returned by both deterministic and LLM-judge detectors.
 */

/** Categories of hallucination we detect. */
export type HallucinationType =
  | "fabricated_fact"       // Claim with no basis in provided context
  | "fabricated_citation"   // Non-existent paper, study, or reference
  | "fabricated_statistic"  // Invented numbers, percentages, metrics
  | "fabricated_url"        // Made-up URLs or links
  | "false_attribution"     // Real source, wrong claim attributed to it
  | "contradiction"         // Internal contradiction within the response
  | "unsupported_certainty" // Confident language without evidence backing
  | "temporal_fabrication"; // Invented dates, timelines, or version numbers

/** Severity of a detected hallucination. */
export type HallucinationSeverity = "low" | "medium" | "high" | "critical";

/** A single detected hallucination instance. */
export interface HallucinationFinding {
  /** Unique ID for this finding within the detection run. */
  id: string;
  /** Type of hallucination detected. */
  type: HallucinationType;
  /** Severity assessment. */
  severity: HallucinationSeverity;
  /** The specific text span that is hallucinated. */
  span: string;
  /** Start character offset in the response text (-1 if not locatable). */
  offset: number;
  /** Human-readable explanation of why this is a hallucination. */
  reason: string;
  /** Which detector found it: "deterministic" or "llm_judge". */
  detector: "deterministic" | "llm_judge";
  /** Confidence 0-1. Deterministic detectors return 1.0; LLM judge varies. */
  confidence: number;
}

/** Input to the hallucination detector. */
export interface HallucinationDetectorInput {
  /** The agent's response text to analyze. */
  response: string;
  /** The source context/documents the agent was given (grounding truth). */
  context?: string;
  /** The user's original prompt/question. */
  prompt?: string;
  /** Known facts for cross-referencing (key-value pairs). */
  knownFacts?: Record<string, string>;
}

/** Result from a hallucination detection run. */
export interface HallucinationDetectionResult {
  /** All findings from all detectors. */
  findings: HallucinationFinding[];
  /** Overall hallucination score 0-1 (0 = no hallucination, 1 = fully hallucinated). */
  score: number;
  /**
   * Whether the response passes the hallucination check. null when it could not
   * be judged clean: no grounding context and no LLM judge ran, so absence of
   * findings is not evidence of absence.
   */
  passed: boolean | null;
  /** True only when grounding context was supplied or the LLM judge ran. */
  evaluated: boolean;
  /** Breakdown by type. */
  summary: Record<HallucinationType, number>;
  /** Total findings count. */
  totalFindings: number;
  /** Which detectors were run. */
  detectorsUsed: string[];
  /** Duration in ms. */
  durationMs: number;
}

/** Configuration for the hallucination detector. */
export interface HallucinationDetectorConfig {
  /** Score threshold for passing (default 0.3 — anything above fails). */
  threshold?: number;
  /** Enable deterministic detectors (default true). */
  enableDeterministic?: boolean;
  /** Enable LLM-judge detector (default false — requires LLM provider). */
  enableLlmJudge?: boolean;
  /** LLM judge function — must be provided if enableLlmJudge is true. */
  llmJudgeFn?: LlmJudgeFn;
  /** Minimum confidence to include a finding (default 0.5). */
  minConfidence?: number;
}

/**
 * LLM judge function signature. Takes a structured prompt and returns
 * the model's assessment as a JSON string matching LlmJudgeResponse.
 */
export type LlmJudgeFn = (prompt: string) => Promise<string>;

/** Expected JSON structure from the LLM judge response. */
export interface LlmJudgeResponse {
  findings: Array<{
    type: HallucinationType;
    severity: HallucinationSeverity;
    span: string;
    reason: string;
    confidence: number;
  }>;
  overallAssessment: string;
}
