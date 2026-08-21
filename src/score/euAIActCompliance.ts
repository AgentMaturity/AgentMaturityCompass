/**
 * EU AI Act Compliance Maturity
 * Scores agent systems against EU AI Act requirements for high-risk AI and GPAI.
 * Source: EU AI Act (Regulation EU 2024/1689), Official Journal 12 July 2024
 * Key requirements: risk management lifecycle, data governance, technical documentation,
 * record-keeping, human oversight design, accuracy/robustness/cybersecurity, QMS.
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { evidencePathExists } from "./controlSurfaceScope.js";

export interface EUAIActComplianceResult {
  score: number; // 0-100
  level: number; // 0-5
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
  for (const f of rmsPaths) {
    if (evidencePathExists(root, f)) hasRiskManagementSystem = true;
  }

  // Data governance (Art. 10)
  const dgPaths = ["docs/DATA_GOVERNANCE.md", ".amc/data_governance.json"];
  for (const f of dgPaths) {
    if (evidencePathExists(root, f)) hasDataGovernance = true;
  }

  // Technical documentation (Art. 11)
  const techDocPaths = ["docs/AMC_MASTER_REFERENCE.md", "README.md", "docs/ARCHITECTURE_MAP.md"];
  for (const f of techDocPaths) {
    if (evidencePathExists(root, f)) hasTechnicalDocumentation = true;
  }

  // Automatic record-keeping / logging (Art. 12)
  const logPaths = [".amc/audit_log.jsonl", ".amc/ACTION_AUDIT.md", "src/ledger"];
  for (const f of logPaths) {
    if (evidencePathExists(root, f)) hasAutomaticRecordKeeping = true;
  }

  // Human oversight design (Art. 14)
  const oversightPaths = ["src/approvals", "src/score/humanOversightQuality.ts", "APPROVALS.md"];
  for (const f of oversightPaths) {
    if (evidencePathExists(root, f)) hasHumanOversightDesign = true;
  }

  // Accuracy, robustness, cybersecurity (Art. 15)
  const arcPaths = ["src/assurance", "src/score/productionReadiness.ts", "tests"];
  for (const f of arcPaths) {
    if (evidencePathExists(root, f)) hasAccuracyRobustnessCybersecurity = true;
  }

  // Quality management system (Art. 17)
  const qmsPaths = ["docs/QA.md", ".amc/qms.json", "src/score/vibeCodeAudit.ts"];
  for (const f of qmsPaths) {
    if (evidencePathExists(root, f)) hasQualityManagementSystem = true;
  }

  // Adversarial testing (GPAI systemic risk requirement)
  const advPaths = ["src/assurance/packs", "src/lab/packs", "tests/adversarial"];
  for (const f of advPaths) {
    if (evidencePathExists(root, f)) hasAdversarialTesting = true;
  }

  // Incident reporting
  const incidentPaths = ["docs/INCIDENT_RESPONSE_READINESS.md", ".amc/incidents", "src/incidents"];
  for (const f of incidentPaths) {
    if (evidencePathExists(root, f)) hasIncidentReporting = true;
  }

  // Fundamental Rights Impact Assessment
  const friaPaths = [".amc/fria.json", "docs/FRIA.md", ".amc/fundamental_rights_assessment.json"];
  for (const f of friaPaths) {
    if (evidencePathExists(root, f)) hasFundamentalRightsImpactAssessment = true;
  }

  if (!hasRiskManagementSystem) gaps.push("No risk management system throughout lifecycle (EU AI Act Art. 9)");
  if (!hasDataGovernance) gaps.push("No data governance documentation (EU AI Act Art. 10)");
  if (!hasTechnicalDocumentation) gaps.push("No technical documentation for compliance assessment (EU AI Act Art. 11)");
  if (!hasAutomaticRecordKeeping) gaps.push("No automatic record-keeping / audit log (EU AI Act Art. 12)");
  if (!hasHumanOversightDesign) gaps.push("Human oversight not designed into system (EU AI Act Art. 14)");
  if (!hasAccuracyRobustnessCybersecurity) gaps.push("No accuracy/robustness/cybersecurity measures documented (EU AI Act Art. 15)");
  if (!hasQualityManagementSystem) gaps.push("No quality management system (EU AI Act Art. 17)");
  if (!hasAdversarialTesting) gaps.push("No adversarial testing (required for GPAI systemic risk)");
  if (!hasIncidentReporting) gaps.push("No incident reporting mechanism (required for GPAI systemic risk)");
  if (!hasFundamentalRightsImpactAssessment) gaps.push("No Fundamental Rights Impact Assessment (FRIA) for high-risk deployments");

  if (!hasRiskManagementSystem) recommendations.push("Create docs/RISK_MANAGEMENT.md documenting risk identification, assessment, and mitigation lifecycle");
  if (!hasFundamentalRightsImpactAssessment) recommendations.push("Complete a FRIA before deploying agents in high-risk contexts (employment, education, law enforcement)");
  if (!hasAdversarialTesting) recommendations.push("Run adversarial test packs (injection, compound threat, TOCTOU) and document results");

  const checks = [hasRiskManagementSystem, hasDataGovernance, hasTechnicalDocumentation,
    hasAutomaticRecordKeeping, hasHumanOversightDesign, hasAccuracyRobustnessCybersecurity,
    hasQualityManagementSystem, hasAdversarialTesting, hasIncidentReporting, hasFundamentalRightsImpactAssessment];
  const passed = checks.filter(Boolean).length;
  const score = Math.round((passed / checks.length) * 100);
  const level = score >= 90 ? 5 : score >= 70 ? 4 : score >= 50 ? 3 : score >= 30 ? 2 : score >= 10 ? 1 : 0;

  return {
    score, level, riskClassification,
    hasRiskManagementSystem, hasDataGovernance, hasTechnicalDocumentation,
    hasAutomaticRecordKeeping, hasHumanOversightDesign, hasAccuracyRobustnessCybersecurity,
    hasQualityManagementSystem, hasAdversarialTesting, hasIncidentReporting,
    hasFundamentalRightsImpactAssessment,
    gaps, recommendations,
  };
}
