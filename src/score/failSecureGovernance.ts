/**
 * Fail-Secure Tool Governance
 * Scores whether agent tool calls fail closed (deny by default) rather than fail open.
 * Source: HN — Sentinel pattern, "fail-open is a nightmare for security" (2026)
 * Also covers OWASP LLM08: Excessive Agency
 */

import { existsSync } from "fs";
import { join } from "path";
import { evidencePathExists } from "./controlSurfaceScope.js";

export interface FailSecureGovernanceResult {
  score: number; // 0-100
  level: number; // 0-5
  failsClosedByDefault: boolean;
  hasToolCallWhitelist: boolean;
  hasRateLimiting: boolean;
  hasSemanticAnomalyDetection: boolean;
  hasContextAwareApprovals: boolean;
  hasToolCallAuditLog: boolean;
  hasExcessiveAgencyControls: boolean;
  gaps: string[];
  recommendations: string[];
}

export function scoreFailSecureGovernance(cwd?: string): FailSecureGovernanceResult {
  const root = cwd ?? process.cwd();
  const gaps: string[] = [];
  const recommendations: string[] = [];

  let failsClosedByDefault = false;
  let hasToolCallWhitelist = false;
  let hasRateLimiting = false;
  let hasSemanticAnomalyDetection = false;
  let hasContextAwareApprovals = false;
  let hasToolCallAuditLog = false;
  let hasExcessiveAgencyControls = false;

  // Fail-closed / deny-by-default
  const enforcePaths = ["src/enforce", "src/ops/circuitBreaker.ts", "ACTION_POLICY.md"];
  for (const f of enforcePaths) {
    if (evidencePathExists(root, f)) failsClosedByDefault = true;
  }

  // Tool call whitelist
  const whitelistPaths = [".amc/tool_allowlist.json", "src/enforce/allowlist.ts", "src/policy"];
  for (const f of whitelistPaths) {
    if (evidencePathExists(root, f)) hasToolCallWhitelist = true;
  }

  // Rate limiting
  const ratePaths = ["src/ops/rateLimiter.ts", "src/enforce/rateLimit.ts"];
  for (const f of ratePaths) {
    if (evidencePathExists(root, f)) hasRateLimiting = true;
  }

  // Semantic anomaly detection (Z-score / behavioral baseline)
  const anomalyPaths = ["src/score/modelDrift.ts", "src/drift", "src/ops/anomalyDetector.ts"];
  for (const f of anomalyPaths) {
    if (evidencePathExists(root, f)) hasSemanticAnomalyDetection = true;
  }

  // Context-aware approvals (human sees full context before approving)
  const approvalPaths = ["src/approvals", "APPROVALS.md", "src/enforce/stepupApproval.ts"];
  for (const f of approvalPaths) {
    if (evidencePathExists(root, f)) hasContextAwareApprovals = true;
  }

  // Tool call audit log
  const auditPaths = [".amc/ACTION_AUDIT.md", ".amc/audit_log.jsonl", "src/audit"];
  for (const f of auditPaths) {
    if (evidencePathExists(root, f)) hasToolCallAuditLog = true;
  }

  // Excessive agency controls (scope limits, autonomy caps)
  const agencyPaths = ["src/assurance/packs/governanceBypassPack.ts", "src/enforce", "src/policy"];
  for (const f of agencyPaths) {
    if (evidencePathExists(root, f)) hasExcessiveAgencyControls = true;
  }

  if (!failsClosedByDefault) gaps.push("Tool governance fails open — actions proceed when rules engine is unavailable");
  if (!hasToolCallWhitelist) gaps.push("No tool call whitelist — agent can invoke any available tool");
  if (!hasRateLimiting) gaps.push("No rate limiting on tool calls — susceptible to runaway loops");
  if (!hasSemanticAnomalyDetection) gaps.push("No semantic anomaly detection — unusual tool call patterns go undetected");
  if (!hasContextAwareApprovals) gaps.push("No context-aware approvals — approvers lack full context for decisions");
  if (!hasToolCallAuditLog) gaps.push("No tool call audit log — cannot reconstruct what agent did");
  if (!hasExcessiveAgencyControls) gaps.push("No excessive agency controls — agent autonomy is uncapped (OWASP LLM08)");

  if (!failsClosedByDefault) recommendations.push("Implement fail-closed: if governance check fails or times out, block the action");
  if (!hasSemanticAnomalyDetection) recommendations.push("Add Z-score analysis of tool call frequency/patterns to detect behavioral anomalies");
  if (!hasContextAwareApprovals) recommendations.push("Show approvers the full agent state (what it saw, what it plans) before approval");

  const checks = [failsClosedByDefault, hasToolCallWhitelist, hasRateLimiting,
    hasSemanticAnomalyDetection, hasContextAwareApprovals, hasToolCallAuditLog, hasExcessiveAgencyControls];
  const passed = checks.filter(Boolean).length;
  const score = Math.round((passed / checks.length) * 100);
  const level = score >= 90 ? 5 : score >= 70 ? 4 : score >= 50 ? 3 : score >= 30 ? 2 : score >= 10 ? 1 : 0;

  return {
    score, level,
    failsClosedByDefault, hasToolCallWhitelist, hasRateLimiting,
    hasSemanticAnomalyDetection, hasContextAwareApprovals, hasToolCallAuditLog, hasExcessiveAgencyControls,
    gaps, recommendations,
  };
}
