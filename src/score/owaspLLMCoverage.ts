/**
 * OWASP LLM Top 10 coverage, 2023 v1.1 numbering.
 * Source: OWASP GenAI Security Project (genai.owasp.org), 2023-2025
 *
 * The ids below are the 2023 v1.1 list (LLM06 Sensitive Information Disclosure, LLM08 Excessive Agency, ...). The 2025
 * list renumbers them; the evidence-bound 2025 framework is `amc compliance report --framework owasp-llm` (SH-TRUST-04).
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
  ["LLM01", "LLM01:2023 Prompt Injection mitigation"],
  ["LLM02", "LLM02:2023 Insecure Output Handling mitigation"],
  ["LLM03", "LLM03:2023 Training Data Poisoning mitigation"],
  ["LLM04", "LLM04:2023 Model Denial of Service mitigation"],
  ["LLM05", "LLM05:2023 Supply Chain Vulnerabilities mitigation"],
  ["LLM06", "LLM06:2023 Sensitive Information Disclosure mitigation"],
  ["LLM07", "LLM07:2023 Insecure Plugin Design mitigation"],
  ["LLM08", "LLM08:2023 Excessive Agency mitigation"],
  ["LLM09", "LLM09:2023 Overreliance mitigation"],
  ["LLM10", "LLM10:2023 Model Theft mitigation"]
];

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
