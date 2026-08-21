/**
 * Adaptive Access Control Maturity
 * Scores whether access control adapts to observed agent behavior (observe → learn → enforce).
 * Source: AgentGuardian (arXiv:2601.10440)
 * Static RBAC doesn't adapt to observed behavior.
 */

import { existsSync } from "fs";
import { join } from "path";
import { assessCriterion, scoreAssessableCriteria, notAssessableNote } from "./controlSurfaceScope.js";

export interface AdaptiveAccessControlResult {
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

  const hasBehaviorProfilingOutcome = assessCriterion(root, ["src/watch/behavioralProfiler.ts", "src/score/modelDrift.ts", ".amc/behavior_profiles"]);
  const hasBehaviorProfiling = hasBehaviorProfilingOutcome.met;

  const hasLearnedPoliciesOutcome = assessCriterion(root, ["src/enforce/learnedPolicies.ts", ".amc/learned_access_policies.json"]);
  const hasLearnedPolicies = hasLearnedPoliciesOutcome.met;

  const hasStagingPhaseOutcome = assessCriterion(root, ["src/enforce/policyStaging.ts", ".amc/policy_staging.json"]);
  const hasStagingPhase = hasStagingPhaseOutcome.met;

  const hasAnomalyBasedDenialOutcome = assessCriterion(root, ["src/enforce/anomalyDenial.ts", "src/observability/anomalyDetector.ts"]);
  const hasAnomalyBasedDenial = hasAnomalyBasedDenialOutcome.met;

  const hasContextualPermissionsOutcome = assessCriterion(root, ["src/enforce/contextualPermissions.ts", "src/auth/contextAwareAuth.ts"]);
  const hasContextualPermissions = hasContextualPermissionsOutcome.met;

  const hasPolicyEvolutionOutcome = assessCriterion(root, ["src/enforce/policyEvolution.ts", ".amc/policy_versions"]);
  const hasPolicyEvolution = hasPolicyEvolutionOutcome.met;

  if (hasBehaviorProfilingOutcome.assessable && !hasBehaviorProfiling) gaps.push("No behavior profiling — access control cannot learn from observed agent actions");
  if (hasLearnedPoliciesOutcome.assessable && !hasLearnedPolicies) gaps.push("No learned policies — all access rules are manually defined");
  if (hasStagingPhaseOutcome.assessable && !hasStagingPhase) gaps.push("No policy staging phase — new policies go straight to enforcement without observation");
  if (hasAnomalyBasedDenialOutcome.assessable && !hasAnomalyBasedDenial) gaps.push("No anomaly-based denial — unusual behavior does not trigger access restrictions");
  if (hasContextualPermissionsOutcome.assessable && !hasContextualPermissions) gaps.push("No contextual permissions — access decisions ignore execution context");
  if (hasPolicyEvolutionOutcome.assessable && !hasPolicyEvolution) gaps.push("No policy evolution — access policies are static and never improve");

  if (hasBehaviorProfilingOutcome.assessable && !hasBehaviorProfiling) recommendations.push("Profile agent behavior to establish baselines for adaptive access control");
  if (hasLearnedPoliciesOutcome.assessable && !hasLearnedPolicies) recommendations.push("Derive access policies from observed behavior patterns");
  if (hasStagingPhaseOutcome.assessable && !hasStagingPhase) recommendations.push("Stage new policies in observe mode before enforcing them");
  if (hasAnomalyBasedDenialOutcome.assessable && !hasAnomalyBasedDenial) recommendations.push("Deny access on anomalous behavior that deviates from learned profiles");

  const outcomes = [hasBehaviorProfilingOutcome, hasLearnedPoliciesOutcome, hasStagingPhaseOutcome, hasAnomalyBasedDenialOutcome, hasContextualPermissionsOutcome, hasPolicyEvolutionOutcome];
  const { score, assessed: assessedCriteria, total: totalCriteria, notAssessable: notAssessableCriteria } =
    scoreAssessableCriteria(outcomes);
  const skipped = notAssessableNote(notAssessableCriteria, totalCriteria);
  if (skipped) recommendations.push(skipped);
  const level = score >= 90 ? 5 : score >= 70 ? 4 : score >= 50 ? 3 : score >= 30 ? 2 : score >= 10 ? 1 : 0;

  return {
    score, level, assessedCriteria, totalCriteria, notAssessableCriteria,
    hasBehaviorProfiling, hasLearnedPolicies, hasStagingPhase,
    hasAnomalyBasedDenial, hasContextualPermissions, hasPolicyEvolution,
    gaps, recommendations,
  };
}
