/**
 * Output Integrity Maturity
 * Scores validation of LLM outputs before downstream use.
 * Source: OWASP LLM02 (Insecure Output Handling) — downstream code execution,
 * data injection, XSS via unvalidated LLM output.
 * Also covers prior art self-knowledge: confidence calibration with citation.
 */

import { existsSync } from "fs";
import { join } from "path";
import { assessCriterion, scoreAssessableCriteria, notAssessableNote } from "./controlSurfaceScope.js";

export interface OutputIntegrityResult {
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
  hasOutputValidation: boolean;
  hasOutputSanitization: boolean;
  hasConfidenceCalibration: boolean;
  hasCitationRequirement: boolean;
  hasCodeExecutionGuard: boolean;
  hasStructuredOutputEnforcement: boolean;
  hasOutputAuditTrail: boolean;
  gaps: string[];
  recommendations: string[];
}

export function scoreOutputIntegrityMaturity(cwd?: string): OutputIntegrityResult {
  const root = cwd ?? process.cwd();
  const gaps: string[] = [];
  const recommendations: string[] = [];

  let hasOutputValidation = false;
  let hasOutputSanitization = false;
  let hasConfidenceCalibration = false;
  let hasCitationRequirement = false;
  let hasCodeExecutionGuard = false;
  let hasStructuredOutputEnforcement = false;
  let hasOutputAuditTrail = false;

  // Output validation
  const validationPaths = ["src/truthguard", "src/output", "src/validate", "src/enforce/outputValidator.ts"];
  const hasOutputValidationOutcome = assessCriterion(root, validationPaths);
  hasOutputValidation = hasOutputValidationOutcome.met;

  // Output sanitization
  const sanitizePaths = ["src/shield/sanitizer.ts", "src/shield/sanitizer.ts", "src/shield/sanitizer.ts"];
  const hasOutputSanitizationOutcome = assessCriterion(root, sanitizePaths);
  hasOutputSanitization = hasOutputSanitizationOutcome.met;

  // Confidence calibration (self-knowledge loss pattern)
  const confidencePaths = ["src/score/confidenceDrift.ts", "src/claims/claimConfidence.ts"];
  const hasConfidenceCalibrationOutcome = assessCriterion(root, confidencePaths);
  hasConfidenceCalibration = hasConfidenceCalibrationOutcome.met;

  // Citation requirement (every answer carries its own proof)
  const citationPaths = ["src/runtime/truthProtocol.ts", "src/claims", "src/score/claimProvenance.ts"];
  const hasCitationRequirementOutcome = assessCriterion(root, citationPaths);
  hasCitationRequirement = hasCitationRequirementOutcome.met;

  // Code execution guard (prevent LLM output from being exec'd without review)
  const codeGuardPaths = ["src/enforce/codeExecutionGuard.ts", "src/sandbox", "src/sandbox/sandbox.ts"];
  const hasCodeExecutionGuardOutcome = assessCriterion(root, codeGuardPaths);
  hasCodeExecutionGuard = hasCodeExecutionGuardOutcome.met;

  // Structured output enforcement (JSON schema, typed outputs)
  const structuredPaths = ["src/enforce/schemaValidator.ts", "src/output/schema.ts", "src/types.ts"];
  const hasStructuredOutputEnforcementOutcome = assessCriterion(root, structuredPaths);
  hasStructuredOutputEnforcement = hasStructuredOutputEnforcementOutcome.met;

  // Output audit trail
  const auditPaths = [".amc/ACTION_AUDIT.md", ".amc/audit_log.jsonl", "src/receipts"];
  const hasOutputAuditTrailOutcome = assessCriterion(root, auditPaths);
  hasOutputAuditTrail = hasOutputAuditTrailOutcome.met;

  if (hasOutputValidationOutcome.assessable && !hasOutputValidation) gaps.push("No output validation — LLM outputs used directly without checking (OWASP LLM02)");
  if (hasOutputSanitizationOutcome.assessable && !hasOutputSanitization) gaps.push("No output sanitization — injection via LLM output possible");
  if (hasConfidenceCalibrationOutcome.assessable && !hasConfidenceCalibration) gaps.push("No confidence calibration — agent expresses all outputs with equal fluency regardless of certainty");
  if (hasCitationRequirementOutcome.assessable && !hasCitationRequirement) gaps.push("No citation requirement — outputs lack provenance (self-knowledge gap)");
  if (hasCodeExecutionGuardOutcome.assessable && !hasCodeExecutionGuard) gaps.push("No code execution guard — LLM-generated code may execute without review");
  if (hasStructuredOutputEnforcementOutcome.assessable && !hasStructuredOutputEnforcement) gaps.push("No structured output enforcement — free-text outputs bypass type safety");
  if (hasOutputAuditTrailOutcome.assessable && !hasOutputAuditTrail) gaps.push("No output audit trail — cannot trace what was output and when");

  if (hasOutputValidationOutcome.assessable && !hasOutputValidation) recommendations.push("Validate all LLM outputs against expected schema before passing downstream");
  if (hasConfidenceCalibrationOutcome.assessable && !hasConfidenceCalibration) recommendations.push("Implement confidence scores per output claim; surface low-confidence outputs for human review");
  if (hasCodeExecutionGuardOutcome.assessable && !hasCodeExecutionGuard) recommendations.push("Never auto-execute LLM-generated code; require explicit human approval or sandboxed execution");

  const outcomes = [hasOutputValidationOutcome, hasOutputSanitizationOutcome, hasConfidenceCalibrationOutcome, hasCitationRequirementOutcome, hasCodeExecutionGuardOutcome, hasStructuredOutputEnforcementOutcome, hasOutputAuditTrailOutcome];
  const { score, assessed: assessedCriteria, total: totalCriteria, notAssessable: notAssessableCriteria } =
    scoreAssessableCriteria(outcomes);
  const skipped = notAssessableNote(notAssessableCriteria, totalCriteria);
  if (skipped) recommendations.push(skipped);
  const level = score >= 90 ? 5 : score >= 70 ? 4 : score >= 50 ? 3 : score >= 30 ? 2 : score >= 10 ? 1 : 0;

  return {
    score, level, assessedCriteria, totalCriteria, notAssessableCriteria,
    hasOutputValidation, hasOutputSanitization, hasConfidenceCalibration,
    hasCitationRequirement, hasCodeExecutionGuard, hasStructuredOutputEnforcement, hasOutputAuditTrail,
    gaps, recommendations,
  };
}
