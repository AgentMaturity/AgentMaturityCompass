/**
 * Trust-Authorization Synchronization Maturity
 * Scores whether runtime trust state stays synchronized with permission state.
 * Source: SoK: Trust-Authorization Mismatch (arXiv:2512.06914)
 * Static permissions don't track runtime trust fluctuations — trust and permission state diverge.
 */

import { existsSync, readdirSync } from "fs";
import { join } from "path";

export interface TrustAuthorizationSyncResult {
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

  const hasDynamicPermissions = [".amc/dynamic_permissions.json", "src/enforce/dynamicPermissions.ts", "src/auth/dynamicAuth.ts"]
    .some(f => existsSync(join(root, f)));

  const hasTrustSignalIntegration = ["src/score/crossAgentTrust.ts", "src/trust", ".amc/trust_signals.json"]
    .some(f => existsSync(join(root, f)));

  const hasPermissionDecay = ["src/enforce/permissionDecay.ts", ".amc/permission_ttl.json", "src/auth/tokenExpiry.ts"]
    .some(f => existsSync(join(root, f)));

  const hasTrustPermissionAudit = [".amc/trust_permission_audit.jsonl", "src/audit/trustPermissionSync.ts"]
    .some(f => existsSync(join(root, f)));

  const hasContextAwareAuth = ["src/auth/contextAwareAuth.ts", "src/enforce/contextualPermissions.ts"]
    .some(f => existsSync(join(root, f)));

  const hasTrustDivergenceDetection = ["src/monitor/trustDivergence.ts", "src/score/confidenceDrift.ts"]
    .some(f => existsSync(join(root, f)));

  const hasRuntimeTrustRecalibration = ["src/trust/recalibration.ts", "src/enforce/trustRecalibrator.ts"]
    .some(f => existsSync(join(root, f)));

  if (!hasDynamicPermissions) gaps.push("No dynamic permissions — permissions are static and cannot adapt to trust changes");
  if (!hasTrustSignalIntegration) gaps.push("No trust signal integration — trust state is not fed into authorization decisions");
  if (!hasPermissionDecay) gaps.push("No permission decay — granted permissions never expire or weaken");
  if (!hasTrustPermissionAudit) gaps.push("No trust-permission audit trail — cannot detect when trust and permissions diverge");
  if (!hasContextAwareAuth) gaps.push("No context-aware authorization — permissions ignore execution context");
  if (!hasTrustDivergenceDetection) gaps.push("No trust divergence detection — trust drift goes unnoticed");
  if (!hasRuntimeTrustRecalibration) gaps.push("No runtime trust recalibration — trust scores are never updated during execution");

  if (!hasDynamicPermissions) recommendations.push("Implement dynamic permission grants that adjust based on runtime trust signals");
  if (!hasPermissionDecay) recommendations.push("Add TTL-based permission decay so stale grants auto-expire");
  if (!hasTrustDivergenceDetection) recommendations.push("Monitor for divergence between trust score and granted permissions");
  if (!hasRuntimeTrustRecalibration) recommendations.push("Recalibrate trust scores during execution based on observed behavior");

  const checks = [hasDynamicPermissions, hasTrustSignalIntegration, hasPermissionDecay,
    hasTrustPermissionAudit, hasContextAwareAuth, hasTrustDivergenceDetection, hasRuntimeTrustRecalibration];
  const passed = checks.filter(Boolean).length;
  const score = Math.round((passed / checks.length) * 100);
  const level = score >= 90 ? 5 : score >= 70 ? 4 : score >= 50 ? 3 : score >= 30 ? 2 : score >= 10 ? 1 : 0;

  return {
    score, level,
    hasDynamicPermissions, hasTrustSignalIntegration, hasPermissionDecay,
    hasTrustPermissionAudit, hasContextAwareAuth, hasTrustDivergenceDetection,
    hasRuntimeTrustRecalibration, gaps, recommendations,
  };
}
