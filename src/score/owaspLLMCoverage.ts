/**
 * OWASP Top 10 for LLM Applications coverage, 2025 edition (P4).
 * Source: https://genai.owasp.org/llm-top-10/ ("2025 Top 10 Risk & Mitigations for LLMs and Gen AI Apps"), opened
 * 2026-11-16. The list is shared with the evidence-bound framework (`amc compliance report --framework owasp-llm`).
 *
 * Not evaluated (P0-15): this module used to count AMC source files as risk
 * coverage. File presence is not evidence that a risk is mitigated, so every
 * risk is reported as not evaluated.
 */

import { notEvaluatedCriteria, type NotEvaluatedCriterion } from "./euAIActCompliance.js";
import { OWASP_LLM_CATEGORIES } from "../compliance/mappings/owaspLlmTop10.js";

export interface OWASPLLMCoverageResult {
  status: "not_evaluated";
  score: null;
  level: null;
  risks: NotEvaluatedCriterion[];
  gaps: string[];
  recommendations: string[];
}

const OWASP_LLM_RISKS: ReadonlyArray<[string, string]> = OWASP_LLM_CATEGORIES.map((category) => [category.slice(0, 5), `${category} mitigation`]);

/** @deprecated Not evaluated since P0-15: it reports no score. Removal is a D-12 question. */
export function scoreOWASPLLMCoverage(_cwd?: string): OWASPLLMCoverageResult {
  return {
    status: "not_evaluated",
    score: null,
    level: null,
    risks: notEvaluatedCriteria(OWASP_LLM_RISKS),
    gaps: [],
    recommendations: ["Run assurance packs against the agent (`amc assurance run`) for observed results; file presence is not evidence.",
      "For the 2025 list bound to evidence, run `amc compliance report --framework owasp-llm`."]
  };
}
