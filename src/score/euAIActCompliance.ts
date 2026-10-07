/**
 * EU AI Act obligations (Regulation EU 2024/1689) for high-risk AI and GPAI.
 *
 * Not evaluated (P0-15): this module used to count file paths as compliance,
 * so `README.md` alone satisfied Art. 11. File presence is not evidence of an
 * obligation being met, so every criterion is reported as not evaluated.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { evidencePathExists } from "./controlSurfaceScope.js";

export interface NotEvaluatedCriterion {
  id: string;
  title: string;
  status: "not_evaluated";
  reason: string;
}

export interface EUAIActComplianceResult {
  status: "not_evaluated";
  score: null;
  level: null;
  /**
   * SELF-DECLARED, not assessed: read verbatim from the operator's
   * `.amc/eu_ai_act_classification.json`. AMC cannot determine a system's
   * legal risk class from code; it records which class the operator claims.
   */
  riskClassification: "minimal" | "limited" | "high" | "unacceptable" | "unknown";
  riskClassificationClaimKind: "self_reported";
  criteria: NotEvaluatedCriterion[];
  gaps: string[];
  recommendations: string[];
}

const EU_AI_ACT_CRITERIA: ReadonlyArray<[string, string]> = [
  ["Art. 9", "a risk management system throughout the lifecycle (EU AI Act Art. 9)"],
  ["Art. 10", "data governance (EU AI Act Art. 10)"],
  ["Art. 11", "technical documentation (EU AI Act Art. 11)"],
  ["Art. 12", "automatic record-keeping (EU AI Act Art. 12)"],
  ["Art. 14", "human oversight by design (EU AI Act Art. 14)"],
  ["Art. 15", "accuracy, robustness and cybersecurity (EU AI Act Art. 15)"],
  ["Art. 17", "a quality management system (EU AI Act Art. 17)"],
  ["GPAI-adversarial", "adversarial testing (GPAI systemic risk)"],
  ["GPAI-incidents", "serious-incident reporting (GPAI systemic risk)"],
  ["FRIA", "a fundamental rights impact assessment (high-risk deployments)"]
];

/** Every criterion "not evaluated" with the shared reason; used by the three former path scorers. */
export function notEvaluatedCriteria(rows: ReadonlyArray<[string, string]>): NotEvaluatedCriterion[] {
  return rows.map(([id, title]) => ({ id, title, status: "not_evaluated", reason: `file presence is not evidence of ${title}` }));
}

/** @deprecated Not evaluated since P0-15: it reports no score. Removal is a D-12 question. */
export function scoreEUAIActCompliance(cwd?: string): EUAIActComplianceResult {
  const root = cwd ?? process.cwd();
  let riskClassification: EUAIActComplianceResult["riskClassification"] = "unknown";
  if (evidencePathExists(root, ".amc/eu_ai_act_classification.json")) {
    try {
      const cls = JSON.parse(readFileSync(join(root, ".amc/eu_ai_act_classification.json"), "utf8"));
      riskClassification = cls.riskClass ?? "unknown";
    } catch { /* ignore */ }
  }
  return {
    status: "not_evaluated",
    score: null,
    level: null,
    riskClassification,
    riskClassificationClaimKind: "self_reported",
    criteria: notEvaluatedCriteria(EU_AI_ACT_CRITERIA),
    gaps: [],
    recommendations: ["Record runtime evidence (`amc quickscore`) and use evidence-backed compliance reporting; file presence is not evidence."]
  };
}
