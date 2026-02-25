/**
 * Adaptive Access Control Maturity
 * Scores whether access control adapts to observed agent behavior (observe → learn → enforce).
 * Source: AgentGuardian (arXiv:2601.10440)
 * Static RBAC doesn't adapt to observed behavior.
 */

import { existsSync } from "fs";
import { join } from "path";

export interface AdaptiveAccessControlResult {
  score: number; // 0-100
  level: number; // 0-5
  hasBehaviorProfiling: boolean;
  hasLearnedPolicies: boolean;
  hasStagingPhase: boolean;
  hasAnomalyBasedDenial: boolean;
  hasContextualPermissions: boolean;
  hasPolicyEvolution: boolean;
  gaps: string[];
  recommendations: string[];
}

export function scoreAdaptiveAccessControl(cwd?: string): AdaptiveAccessControlResult {
  const root = cwd ?? process.cwd();
  const gaps: string[] = [];
  const recommendations: string[] = [];

  const hasBehaviorProfiling = ["src/monitor/behaviorProfile.ts", "src/score/modelDrift.ts", ".amc/behavior_profiles"]
    .some(f => existsSync(join(root, f)));

  const hasLearnedPolicies = ["src/enforce/learnedPolicies.ts", ".amc/learned_access_policies.json"]
    .some(f => existsSync(join(root, f)));

  const hasStagingPhase = ["src/enforce/policyStaging.ts", ".amc/policy_staging.json"]
    .some(f => existsSync(join(root, f)));

  const hasAnomalyBasedDenial = ["src/enforce/anomalyDenial.ts", "src/ops/anomalyDetector.ts"]
    .some(f => existsSync(join(root, f)));

  const hasContextualPermissions = ["src/enforce/contextualPermissions.ts", "src/auth/contextAwareAuth.ts"]
    .some(f => existsSync(join(root, f)));

  const hasPolicyEvolution = ["src/enforce/policyEvolution.ts", ".amc/policy_versions"]
    .some(f => existsSync(join(root, f)));

  if (!hasBehaviorProfiling) gaps.push("No behavior profiling — access control cannot learn from observed agent actions");
  if (!hasLearnedPolicies) gaps.push("No learned policies — all access rules are manually defined");
  if (!hasStagingPhase) gaps.push("No policy staging phase — new policies go straight to enforcement without observation");
  if (!hasAnomalyBasedDenial) gaps.push("No anomaly-based denial — unusual behavior does not trigger access restrictions");
  if (!hasContextualPermissions) gaps.push("No contextual permissions — access decisions ignore execution context");
  if (!hasPolicyEvolution) gaps.push("No policy evolution — access policies are static and never improve");

  if (!hasBehaviorProfiling) recommendations.push("Profile agent behavior to establish baselines for adaptive access control");
  if (!hasLearnedPolicies) recommendations.push("Derive access policies from observed behavior patterns");
  if (!hasStagingPhase) recommendations.push("Stage new policies in observe mode before enforcing them");
  if (!hasAnomalyBasedDenial) recommendations.push("Deny access on anomalous behavior that deviates from learned profiles");

  const checks = [hasBehaviorProfiling, hasLearnedPolicies, hasStagingPhase,
    hasAnomalyBasedDenial, hasContextualPermissions, hasPolicyEvolution];
  const passed = checks.filter(Boolean).length;
  const score = Math.round((passed / checks.length) * 100);
  const level = score >= 90 ? 5 : score >= 70 ? 4 : score >= 50 ? 3 : score >= 30 ? 2 : score >= 10 ? 1 : 0;

  return {
    score, level,
    hasBehaviorProfiling, hasLearnedPolicies, hasStagingPhase,
    hasAnomalyBasedDenial, hasContextualPermissions, hasPolicyEvolution,
    gaps, recommendations,
  };
}
