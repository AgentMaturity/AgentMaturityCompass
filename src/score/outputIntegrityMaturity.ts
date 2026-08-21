/**
 * Output Integrity Maturity
 * Scores validation of LLM outputs before downstream use.
 * Source: OWASP LLM02 (Insecure Output Handling) — downstream code execution,
 * data injection, XSS via unvalidated LLM output.
 * Also covers prior art self-knowledge: confidence calibration with citation.
 */

import { existsSync } from "fs";
import { join } from "path";
import { evidencePathExists } from "./controlSurfaceScope.js";

export interface OutputIntegrityResult {
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
  for (const f of validationPaths) {
    if (evidencePathExists(root, f)) hasOutputValidation = true;
  }

  // Output sanitization
  const sanitizePaths = ["src/enforce/sanitizer.ts", "src/output/sanitize.ts", "src/bridge/sanitize.ts"];
  for (const f of sanitizePaths) {
    if (evidencePathExists(root, f)) hasOutputSanitization = true;
  }

  // Confidence calibration (self-knowledge loss pattern)
  const confidencePaths = ["src/score/confidenceDrift.ts", "src/claims/claimConfidence.ts"];
  for (const f of confidencePaths) {
    if (evidencePathExists(root, f)) hasConfidenceCalibration = true;
  }

  // Citation requirement (every answer carries its own proof)
  const citationPaths = ["src/truthguard/truthProtocol.ts", "src/claims", "src/score/claimProvenance.ts"];
  for (const f of citationPaths) {
    if (evidencePathExists(root, f)) hasCitationRequirement = true;
  }

  // Code execution guard (prevent LLM output from being exec'd without review)
  const codeGuardPaths = ["src/enforce/codeExecutionGuard.ts", "src/sandbox", "src/ops/sandbox.ts"];
  for (const f of codeGuardPaths) {
    if (evidencePathExists(root, f)) hasCodeExecutionGuard = true;
  }

  // Structured output enforcement (JSON schema, typed outputs)
  const structuredPaths = ["src/enforce/schemaValidator.ts", "src/output/schema.ts", "src/types.ts"];
  for (const f of structuredPaths) {
    if (evidencePathExists(root, f)) hasStructuredOutputEnforcement = true;
  }

  // Output audit trail
  const auditPaths = [".amc/ACTION_AUDIT.md", ".amc/audit_log.jsonl", "src/receipts"];
  for (const f of auditPaths) {
    if (evidencePathExists(root, f)) hasOutputAuditTrail = true;
  }

  if (!hasOutputValidation) gaps.push("No output validation — LLM outputs used directly without checking (OWASP LLM02)");
  if (!hasOutputSanitization) gaps.push("No output sanitization — injection via LLM output possible");
  if (!hasConfidenceCalibration) gaps.push("No confidence calibration — agent expresses all outputs with equal fluency regardless of certainty");
  if (!hasCitationRequirement) gaps.push("No citation requirement — outputs lack provenance (self-knowledge gap)");
  if (!hasCodeExecutionGuard) gaps.push("No code execution guard — LLM-generated code may execute without review");
  if (!hasStructuredOutputEnforcement) gaps.push("No structured output enforcement — free-text outputs bypass type safety");
  if (!hasOutputAuditTrail) gaps.push("No output audit trail — cannot trace what was output and when");

  if (!hasOutputValidation) recommendations.push("Validate all LLM outputs against expected schema before passing downstream");
  if (!hasConfidenceCalibration) recommendations.push("Implement confidence scores per output claim; surface low-confidence outputs for human review");
  if (!hasCodeExecutionGuard) recommendations.push("Never auto-execute LLM-generated code; require explicit human approval or sandboxed execution");

  const checks = [hasOutputValidation, hasOutputSanitization, hasConfidenceCalibration,
    hasCitationRequirement, hasCodeExecutionGuard, hasStructuredOutputEnforcement, hasOutputAuditTrail];
  const passed = checks.filter(Boolean).length;
  const score = Math.round((passed / checks.length) * 100);
  const level = score >= 90 ? 5 : score >= 70 ? 4 : score >= 50 ? 3 : score >= 30 ? 2 : score >= 10 ? 1 : 0;

  return {
    score, level,
    hasOutputValidation, hasOutputSanitization, hasConfidenceCalibration,
    hasCitationRequirement, hasCodeExecutionGuard, hasStructuredOutputEnforcement, hasOutputAuditTrail,
    gaps, recommendations,
  };
}
