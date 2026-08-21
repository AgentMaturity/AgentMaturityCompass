/**
 * Fail-Secure Tool Governance
 * Scores whether agent tool calls fail closed (deny by default) rather than fail open.
 * Source: HN — Sentinel pattern, "fail-open is a nightmare for security" (2026)
 * Also covers OWASP LLM08: Excessive Agency
 */

import { existsSync } from "fs";
import { join } from "path";
import { assessCriterion, scoreAssessableCriteria, notAssessableNote } from "./controlSurfaceScope.js";

export interface FailSecureGovernanceResult {
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
  const failsClosedByDefaultOutcome = assessCriterion(root, enforcePaths);
  failsClosedByDefault = failsClosedByDefaultOutcome.met;

  // Tool call whitelist
  const whitelistPaths = [".amc/tool_allowlist.json", "src/enforce/allowlist.ts", "src/policy"];
  const hasToolCallWhitelistOutcome = assessCriterion(root, whitelistPaths);
  hasToolCallWhitelist = hasToolCallWhitelistOutcome.met;

  // Rate limiting
  const ratePaths = ["src/product/toolRateLimiter.ts", "src/product/toolRateLimiter.ts"];
  const hasRateLimitingOutcome = assessCriterion(root, ratePaths);
  hasRateLimiting = hasRateLimitingOutcome.met;

  // Semantic anomaly detection (Z-score / behavioral baseline)
  const anomalyPaths = ["src/score/modelDrift.ts", "src/drift", "src/observability/anomalyDetector.ts"];
  const hasSemanticAnomalyDetectionOutcome = assessCriterion(root, anomalyPaths);
  hasSemanticAnomalyDetection = hasSemanticAnomalyDetectionOutcome.met;

  // Context-aware approvals (human sees full context before approving)
  const approvalPaths = ["src/approvals", "APPROVALS.md", "src/enforce/stepupApproval.ts"];
  const hasContextAwareApprovalsOutcome = assessCriterion(root, approvalPaths);
  hasContextAwareApprovals = hasContextAwareApprovalsOutcome.met;

  // Tool call audit log
  const auditPaths = [".amc/ACTION_AUDIT.md", ".amc/audit_log.jsonl", "src/audit"];
  const hasToolCallAuditLogOutcome = assessCriterion(root, auditPaths);
  hasToolCallAuditLog = hasToolCallAuditLogOutcome.met;

  // Excessive agency controls (scope limits, autonomy caps)
  const agencyPaths = ["src/assurance/packs/governanceBypassPack.ts", "src/enforce", "src/policy"];
  const hasExcessiveAgencyControlsOutcome = assessCriterion(root, agencyPaths);
  hasExcessiveAgencyControls = hasExcessiveAgencyControlsOutcome.met;

  if (failsClosedByDefaultOutcome.assessable && !failsClosedByDefault) gaps.push("Tool governance fails open — actions proceed when rules engine is unavailable");
  if (hasToolCallWhitelistOutcome.assessable && !hasToolCallWhitelist) gaps.push("No tool call whitelist — agent can invoke any available tool");
  if (hasRateLimitingOutcome.assessable && !hasRateLimiting) gaps.push("No rate limiting on tool calls — susceptible to runaway loops");
  if (hasSemanticAnomalyDetectionOutcome.assessable && !hasSemanticAnomalyDetection) gaps.push("No semantic anomaly detection — unusual tool call patterns go undetected");
  if (hasContextAwareApprovalsOutcome.assessable && !hasContextAwareApprovals) gaps.push("No context-aware approvals — approvers lack full context for decisions");
  if (hasToolCallAuditLogOutcome.assessable && !hasToolCallAuditLog) gaps.push("No tool call audit log — cannot reconstruct what agent did");
  if (hasExcessiveAgencyControlsOutcome.assessable && !hasExcessiveAgencyControls) gaps.push("No excessive agency controls — agent autonomy is uncapped (OWASP LLM08)");

  if (failsClosedByDefaultOutcome.assessable && !failsClosedByDefault) recommendations.push("Implement fail-closed: if governance check fails or times out, block the action");
  if (hasSemanticAnomalyDetectionOutcome.assessable && !hasSemanticAnomalyDetection) recommendations.push("Add Z-score analysis of tool call frequency/patterns to detect behavioral anomalies");
  if (hasContextAwareApprovalsOutcome.assessable && !hasContextAwareApprovals) recommendations.push("Show approvers the full agent state (what it saw, what it plans) before approval");

  const outcomes = [failsClosedByDefaultOutcome, hasToolCallWhitelistOutcome, hasRateLimitingOutcome, hasSemanticAnomalyDetectionOutcome, hasContextAwareApprovalsOutcome, hasToolCallAuditLogOutcome, hasExcessiveAgencyControlsOutcome];
  const { score, assessed: assessedCriteria, total: totalCriteria, notAssessable: notAssessableCriteria } =
    scoreAssessableCriteria(outcomes);
  const skipped = notAssessableNote(notAssessableCriteria, totalCriteria);
  if (skipped) recommendations.push(skipped);
  const level = score >= 90 ? 5 : score >= 70 ? 4 : score >= 50 ? 3 : score >= 30 ? 2 : score >= 10 ? 1 : 0;

  return {
    score, level, assessedCriteria, totalCriteria, notAssessableCriteria,
    failsClosedByDefault, hasToolCallWhitelist, hasRateLimiting,
    hasSemanticAnomalyDetection, hasContextAwareApprovals, hasToolCallAuditLog, hasExcessiveAgencyControls,
    gaps, recommendations,
  };
}
