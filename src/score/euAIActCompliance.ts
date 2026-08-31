/**
 * EU AI Act Compliance Maturity
 * Scores agent systems against EU AI Act requirements for high-risk AI and GPAI.
 * Source: EU AI Act (Regulation EU 2024/1689), Official Journal 12 July 2024
 * Key requirements: risk management lifecycle, data governance, technical documentation,
 * record-keeping, human oversight design, accuracy/robustness/cybersecurity, QMS.
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { assessCriterion, scoreAssessableCriteria, notAssessableNote, evidencePathExists } from "./controlSurfaceScope.js";

export interface EUAIActComplianceResult {
  /**
   * How many criteria this score was actually computed over.
   *
   * Criteria whose only evidence paths are AMC's own source modules cannot be
   * judged against a real agent. Counting them as failures silently capped the
   * achievable score, so they are excluded from the denominator and reported
   * here instead: a score of 71 over 4 assessed criteria is a different claim
   * from 71 over 7.
   */
  assessedCriteria?: number;
  totalCriteria?: number;
  notAssessableCriteria?: number;
  score: number; // 0-100
  level: number; // 0-5
  /**
   * SELF-DECLARED, not assessed: read verbatim from the operator's
   * `.amc/eu_ai_act_classification.json`. AMC cannot determine a system's
   * legal risk class from code; it records which class the operator claims
   * and scores the presence of the obligations that class implies.
   */
  riskClassification: "minimal" | "limited" | "high" | "unacceptable" | "unknown";
  hasRiskManagementSystem: boolean;
  hasDataGovernance: boolean;
  hasTechnicalDocumentation: boolean;
  hasAutomaticRecordKeeping: boolean;
  hasHumanOversightDesign: boolean;
  hasAccuracyRobustnessCybersecurity: boolean;
  hasQualityManagementSystem: boolean;
  hasAdversarialTesting: boolean;
  hasIncidentReporting: boolean;
  hasFundamentalRightsImpactAssessment: boolean;
  gaps: string[];
  recommendations: string[];
}

export function scoreEUAIActCompliance(cwd?: string): EUAIActComplianceResult {
  const root = cwd ?? process.cwd();
  const gaps: string[] = [];
  const recommendations: string[] = [];

  let riskClassification: EUAIActComplianceResult["riskClassification"] = "unknown";
  let hasRiskManagementSystem = false;
  let hasDataGovernance = false;
  let hasTechnicalDocumentation = false;
  let hasAutomaticRecordKeeping = false;
  let hasHumanOversightDesign = false;
  let hasAccuracyRobustnessCybersecurity = false;
  let hasQualityManagementSystem = false;
  let hasAdversarialTesting = false;
  let hasIncidentReporting = false;
  let hasFundamentalRightsImpactAssessment = false;

  // Risk classification file
  if (evidencePathExists(root, ".amc/eu_ai_act_classification.json")) {
    try {
      const cls = JSON.parse(readFileSync(join(root, ".amc/eu_ai_act_classification.json"), "utf8"));
      riskClassification = cls.riskClass ?? "unknown";
    } catch { /* ignore */ }
  }

  // Risk management system (Art. 9)
  const rmsPaths = ["docs/RISK_MANAGEMENT.md", ".amc/risk_register.json", "src/ops/riskManager.ts"];
  const hasRiskManagementSystemOutcome = assessCriterion(root, rmsPaths);
  hasRiskManagementSystem = hasRiskManagementSystemOutcome.met;

  // Data governance (Art. 10)
  const dgPaths = ["docs/DATA_GOVERNANCE.md", ".amc/data_governance.json"];
  const hasDataGovernanceOutcome = assessCriterion(root, dgPaths);
  hasDataGovernance = hasDataGovernanceOutcome.met;

  // Technical documentation (Art. 11)
  const techDocPaths = ["docs/AMC_MASTER_REFERENCE.md", "README.md", "docs/ARCHITECTURE_MAP.md"];
  const hasTechnicalDocumentationOutcome = assessCriterion(root, techDocPaths);
  hasTechnicalDocumentation = hasTechnicalDocumentationOutcome.met;

  // Automatic record-keeping / logging (Art. 12)
  const logPaths = [".amc/audit_log.jsonl", ".amc/ACTION_AUDIT.md", "src/ledger"];
  const hasAutomaticRecordKeepingOutcome = assessCriterion(root, logPaths);
  hasAutomaticRecordKeeping = hasAutomaticRecordKeepingOutcome.met;

  // Human oversight design (Art. 14)
  const oversightPaths = ["src/approvals", "src/score/humanOversightQuality.ts", "APPROVALS.md"];
  const hasHumanOversightDesignOutcome = assessCriterion(root, oversightPaths);
  hasHumanOversightDesign = hasHumanOversightDesignOutcome.met;

  // Accuracy, robustness, cybersecurity (Art. 15)
  const arcPaths = ["src/assurance", "src/score/productionReadiness.ts", "tests"];
  const hasAccuracyRobustnessCybersecurityOutcome = assessCriterion(root, arcPaths);
  hasAccuracyRobustnessCybersecurity = hasAccuracyRobustnessCybersecurityOutcome.met;

  // Quality management system (Art. 17)
  const qmsPaths = ["docs/QA.md", ".amc/qms.json", "src/score/vibeCodeAudit.ts"];
  const hasQualityManagementSystemOutcome = assessCriterion(root, qmsPaths);
  hasQualityManagementSystem = hasQualityManagementSystemOutcome.met;

  // Adversarial testing (GPAI systemic risk requirement)
  const advPaths = ["src/assurance/packs", "src/lab/packs", "tests/adversarial"];
  const hasAdversarialTestingOutcome = assessCriterion(root, advPaths);
  hasAdversarialTesting = hasAdversarialTestingOutcome.met;

  // Incident reporting
  const incidentPaths = ["docs/INCIDENT_RESPONSE_READINESS.md", ".amc/incidents", "src/incidents"];
  const hasIncidentReportingOutcome = assessCriterion(root, incidentPaths);
  hasIncidentReporting = hasIncidentReportingOutcome.met;

  // Fundamental Rights Impact Assessment
  const friaPaths = [".amc/fria.json", "docs/FRIA.md", ".amc/fundamental_rights_assessment.json"];
  const hasFundamentalRightsImpactAssessmentOutcome = assessCriterion(root, friaPaths);
  hasFundamentalRightsImpactAssessment = hasFundamentalRightsImpactAssessmentOutcome.met;

  if (hasRiskManagementSystemOutcome.assessable && !hasRiskManagementSystem) gaps.push("No risk management system throughout lifecycle (EU AI Act Art. 9)");
  if (hasDataGovernanceOutcome.assessable && !hasDataGovernance) gaps.push("No data governance documentation (EU AI Act Art. 10)");
  if (hasTechnicalDocumentationOutcome.assessable && !hasTechnicalDocumentation) gaps.push("No technical documentation for compliance assessment (EU AI Act Art. 11)");
  if (hasAutomaticRecordKeepingOutcome.assessable && !hasAutomaticRecordKeeping) gaps.push("No automatic record-keeping / audit log (EU AI Act Art. 12)");
  if (hasHumanOversightDesignOutcome.assessable && !hasHumanOversightDesign) gaps.push("Human oversight not designed into system (EU AI Act Art. 14)");
  if (hasAccuracyRobustnessCybersecurityOutcome.assessable && !hasAccuracyRobustnessCybersecurity) gaps.push("No accuracy/robustness/cybersecurity measures documented (EU AI Act Art. 15)");
  if (hasQualityManagementSystemOutcome.assessable && !hasQualityManagementSystem) gaps.push("No quality management system (EU AI Act Art. 17)");
  if (hasAdversarialTestingOutcome.assessable && !hasAdversarialTesting) gaps.push("No adversarial testing (required for GPAI systemic risk)");
  if (hasIncidentReportingOutcome.assessable && !hasIncidentReporting) gaps.push("No incident reporting mechanism (required for GPAI systemic risk)");
  if (hasFundamentalRightsImpactAssessmentOutcome.assessable && !hasFundamentalRightsImpactAssessment) gaps.push("No Fundamental Rights Impact Assessment (FRIA) for high-risk deployments");

  if (hasRiskManagementSystemOutcome.assessable && !hasRiskManagementSystem) recommendations.push("Create docs/RISK_MANAGEMENT.md documenting risk identification, assessment, and mitigation lifecycle");
  if (hasFundamentalRightsImpactAssessmentOutcome.assessable && !hasFundamentalRightsImpactAssessment) recommendations.push("Complete a FRIA before deploying agents in high-risk contexts (employment, education, law enforcement)");
  if (hasAdversarialTestingOutcome.assessable && !hasAdversarialTesting) recommendations.push("Run adversarial test packs (injection, compound threat, TOCTOU) and document results");

  const outcomes = [hasRiskManagementSystemOutcome, hasDataGovernanceOutcome, hasTechnicalDocumentationOutcome, hasAutomaticRecordKeepingOutcome, hasHumanOversightDesignOutcome, hasAccuracyRobustnessCybersecurityOutcome, hasQualityManagementSystemOutcome, hasAdversarialTestingOutcome, hasIncidentReportingOutcome, hasFundamentalRightsImpactAssessmentOutcome];
  const { score, assessed: assessedCriteria, total: totalCriteria, notAssessable: notAssessableCriteria } =
    scoreAssessableCriteria(outcomes);
  const skipped = notAssessableNote(notAssessableCriteria, totalCriteria);
  if (skipped) recommendations.push(skipped);
  const level = score >= 90 ? 5 : score >= 70 ? 4 : score >= 50 ? 3 : score >= 30 ? 2 : score >= 10 ? 1 : 0;

  return {
    score, level, assessedCriteria, totalCriteria, notAssessableCriteria, riskClassification,
    hasRiskManagementSystem, hasDataGovernance, hasTechnicalDocumentation,
    hasAutomaticRecordKeeping, hasHumanOversightDesign, hasAccuracyRobustnessCybersecurity,
    hasQualityManagementSystem, hasAdversarialTesting, hasIncidentReporting,
    hasFundamentalRightsImpactAssessment,
    gaps, recommendations,
  };
}
