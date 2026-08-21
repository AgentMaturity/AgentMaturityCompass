/**
 * Trust-Authorization Synchronization Maturity
 * Scores whether runtime trust state stays synchronized with permission state.
 * Source: SoK: Trust-Authorization Mismatch (arXiv:2512.06914)
 * Static permissions don't track runtime trust fluctuations — trust and permission state diverge.
 */

import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { assessCriterion, scoreAssessableCriteria, notAssessableNote } from "./controlSurfaceScope.js";

export interface TrustAuthorizationSyncResult {
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
  hasDynamicPermissions: boolean;
  hasTrustSignalIntegration: boolean;
  hasPermissionDecay: boolean;
  hasTrustPermissionAudit: boolean;
  hasContextAwareAuth: boolean;
  hasTrustDivergenceDetection: boolean;
  hasRuntimeTrustRecalibration: boolean;
  gaps: string[];
  recommendations: string[];
}

export function scoreTrustAuthorizationSync(cwd?: string): TrustAuthorizationSyncResult {
  const root = cwd ?? process.cwd();
  const gaps: string[] = [];
  const recommendations: string[] = [];

  const hasDynamicPermissionsOutcome = assessCriterion(root, [".amc/dynamic_permissions.json", "src/enforce/dynamicPermissions.ts", "src/auth/dynamicAuth.ts"]);
  const hasDynamicPermissions = hasDynamicPermissionsOutcome.met;

  const hasTrustSignalIntegrationOutcome = assessCriterion(root, ["src/score/crossAgentTrust.ts", "src/trust", ".amc/trust_signals.json"]);
  const hasTrustSignalIntegration = hasTrustSignalIntegrationOutcome.met;

  const hasPermissionDecayOutcome = assessCriterion(root, ["src/enforce/permissionDecay.ts", ".amc/permission_ttl.json", "src/auth/tokenExpiry.ts"]);
  const hasPermissionDecay = hasPermissionDecayOutcome.met;

  const hasTrustPermissionAuditOutcome = assessCriterion(root, [".amc/trust_permission_audit.jsonl", "src/audit/trustPermissionSync.ts"]);
  const hasTrustPermissionAudit = hasTrustPermissionAuditOutcome.met;

  const hasContextAwareAuthOutcome = assessCriterion(root, ["src/auth/contextAwareAuth.ts", "src/enforce/contextualPermissions.ts"]);
  const hasContextAwareAuth = hasContextAwareAuthOutcome.met;

  const hasTrustDivergenceDetectionOutcome = assessCriterion(root, ["src/monitor/trustDivergence.ts", "src/score/confidenceDrift.ts"]);
  const hasTrustDivergenceDetection = hasTrustDivergenceDetectionOutcome.met;

  const hasRuntimeTrustRecalibrationOutcome = assessCriterion(root, ["src/trust/recalibration.ts", "src/enforce/trustRecalibrator.ts"]);
  const hasRuntimeTrustRecalibration = hasRuntimeTrustRecalibrationOutcome.met;

  if (hasDynamicPermissionsOutcome.assessable && !hasDynamicPermissions) gaps.push("No dynamic permissions — permissions are static and cannot adapt to trust changes");
  if (hasTrustSignalIntegrationOutcome.assessable && !hasTrustSignalIntegration) gaps.push("No trust signal integration — trust state is not fed into authorization decisions");
  if (hasPermissionDecayOutcome.assessable && !hasPermissionDecay) gaps.push("No permission decay — granted permissions never expire or weaken");
  if (hasTrustPermissionAuditOutcome.assessable && !hasTrustPermissionAudit) gaps.push("No trust-permission audit trail — cannot detect when trust and permissions diverge");
  if (hasContextAwareAuthOutcome.assessable && !hasContextAwareAuth) gaps.push("No context-aware authorization — permissions ignore execution context");
  if (hasTrustDivergenceDetectionOutcome.assessable && !hasTrustDivergenceDetection) gaps.push("No trust divergence detection — trust drift goes unnoticed");
  if (hasRuntimeTrustRecalibrationOutcome.assessable && !hasRuntimeTrustRecalibration) gaps.push("No runtime trust recalibration — trust scores are never updated during execution");

  if (hasDynamicPermissionsOutcome.assessable && !hasDynamicPermissions) recommendations.push("Implement dynamic permission grants that adjust based on runtime trust signals");
  if (hasPermissionDecayOutcome.assessable && !hasPermissionDecay) recommendations.push("Add TTL-based permission decay so stale grants auto-expire");
  if (hasTrustDivergenceDetectionOutcome.assessable && !hasTrustDivergenceDetection) recommendations.push("Monitor for divergence between trust score and granted permissions");
  if (hasRuntimeTrustRecalibrationOutcome.assessable && !hasRuntimeTrustRecalibration) recommendations.push("Recalibrate trust scores during execution based on observed behavior");

  const outcomes = [hasDynamicPermissionsOutcome, hasTrustSignalIntegrationOutcome, hasPermissionDecayOutcome, hasTrustPermissionAuditOutcome, hasContextAwareAuthOutcome, hasTrustDivergenceDetectionOutcome, hasRuntimeTrustRecalibrationOutcome];
  const { score, assessed: assessedCriteria, total: totalCriteria, notAssessable: notAssessableCriteria } =
    scoreAssessableCriteria(outcomes);
  const skipped = notAssessableNote(notAssessableCriteria, totalCriteria);
  if (skipped) recommendations.push(skipped);
  const level = score >= 90 ? 5 : score >= 70 ? 4 : score >= 50 ? 3 : score >= 30 ? 2 : score >= 10 ? 1 : 0;

  return {
    score, level, assessedCriteria, totalCriteria, notAssessableCriteria,
    hasDynamicPermissions, hasTrustSignalIntegration, hasPermissionDecay,
    hasTrustPermissionAudit, hasContextAwareAuth, hasTrustDivergenceDetection,
    hasRuntimeTrustRecalibration, gaps, recommendations,
  };
}
