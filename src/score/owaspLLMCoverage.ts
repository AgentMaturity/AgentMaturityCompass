/**
 * OWASP LLM Top 10 coverage.
 * Source: OWASP GenAI Security Project (genai.owasp.org), 2023-2025
 *
 * Not evaluated (P0-15): this module used to count AMC source files as risk
 * coverage. File presence is not evidence that a risk is mitigated, so every
 * risk is reported as not evaluated.
 */

import { notEvaluatedCriteria, type NotEvaluatedCriterion } from "./euAIActCompliance.js";

export interface OWASPLLMCoverageResult {
  status: "not_evaluated";
  score: null;
  level: null;
  risks: NotEvaluatedCriterion[];
  gaps: string[];
  recommendations: string[];
}

const OWASP_LLM_RISKS: ReadonlyArray<[string, string]> = [
  ["LLM01", "LLM01: Prompt Injection mitigation"],
  ["LLM02", "LLM02: Insecure Output Handling mitigation"],
  ["LLM03", "LLM03: Training Data Poisoning mitigation"],
  ["LLM04", "LLM04: Model Denial of Service mitigation"],
  ["LLM05", "LLM05: Supply Chain Vulnerabilities mitigation"],
  ["LLM06", "LLM06: Sensitive Information Disclosure mitigation"],
  ["LLM07", "LLM07: Insecure Plugin Design mitigation"],
  ["LLM08", "LLM08: Excessive Agency mitigation"],
  ["LLM09", "LLM09: Overreliance mitigation"],
  ["LLM10", "LLM10: Model Theft mitigation"]
];

/** @deprecated Not evaluated since P0-15: it reports no score. Removal is a D-12 question. */
export function scoreOWASPLLMCoverage(_cwd?: string): OWASPLLMCoverageResult {
  return {
    status: "not_evaluated",
    score: null,
    level: null,
    risks: notEvaluatedCriteria(OWASP_LLM_RISKS),
    gaps: [],
    recommendations: ["Run assurance packs against the agent (`amc assurance run`) for observed results; file presence is not evidence."]
  };
}
