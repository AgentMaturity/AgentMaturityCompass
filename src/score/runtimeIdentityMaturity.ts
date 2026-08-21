/**
 * Runtime Execution Identity Maturity
 * Scores whether execution identity is properly tracked and matches user identity.
 * Source: HN — "Execution identity diverged from user identity" (Levo.ai, 2026)
 * Agents calling tools nobody remembered wiring up; MCP servers as quiet control planes.
 */

import { existsSync } from "fs";
import { join } from "path";
import { assessCriterion, scoreAssessableCriteria, notAssessableNote } from "./controlSurfaceScope.js";

export interface RuntimeIdentityResult {
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
  hasAgentIdentityBinding: boolean;     // agent has a stable, verifiable identity
  hasUserIdentityPropagation: boolean;  // user identity flows through to tool calls
  hasToolCallOwnership: boolean;        // every tool call is attributed to an agent+user
  hasIdentityAuditTrail: boolean;       // who called what, when, on whose behalf
  hasJITCredentials: boolean;           // short-lived tokens, not static API keys
  hasIdentityRevocation: boolean;       // can revoke agent identity/tokens
  gaps: string[];
  recommendations: string[];
}

export function scoreRuntimeIdentityMaturity(cwd?: string): RuntimeIdentityResult {
  const root = cwd ?? process.cwd();
  const gaps: string[] = [];
  const recommendations: string[] = [];

  // Agent identity binding — passport, manifest, or identity file
  const identityPaths = ["CAPABILITY_MANIFEST.md", ".amc/agent_identity.json", "docs/AGENT_PASSPORT.md", "src/score/identityContinuity.ts"];
  const hasAgentIdentityBindingOutcome = assessCriterion(root, identityPaths);
  const hasAgentIdentityBinding = hasAgentIdentityBindingOutcome.met;

  // User identity propagation — auth context flows through
  const userIdPaths = ["src/auth", "src/enforce/identityMapper.ts", ".amc/identity_map.json"];
  const hasUserIdentityPropagationOutcome = assessCriterion(root, userIdPaths);
  const hasUserIdentityPropagation = hasUserIdentityPropagationOutcome.met;

  // Tool call ownership — every call attributed
  const ownershipPaths = [".amc/ACTION_AUDIT.md", ".amc/audit_log.jsonl", "src/receipts"];
  const hasToolCallOwnershipOutcome = assessCriterion(root, ownershipPaths);
  const hasToolCallOwnership = hasToolCallOwnershipOutcome.met;

  // Identity audit trail
  const auditPaths = [".amc/ACTION_AUDIT.md", ".amc/audit_log.jsonl", "src/ledger"];
  const hasIdentityAuditTrailOutcome = assessCriterion(root, auditPaths);
  const hasIdentityAuditTrail = hasIdentityAuditTrailOutcome.met;

  // JIT credentials — short-lived tokens
  const jitPaths = ["src/auth/jitCredentials.ts", ".amc/token_policy.json", "src/enforce/tokenManager.ts"];
  const hasJITCredentialsOutcome = assessCriterion(root, jitPaths);
  const hasJITCredentials = hasJITCredentialsOutcome.met;

  // Identity revocation
  const revocationPaths = ["src/auth/revocation.ts", ".amc/revocation_list.json"];
  const hasIdentityRevocationOutcome = assessCriterion(root, revocationPaths);
  const hasIdentityRevocation = hasIdentityRevocationOutcome.met;

  if (hasAgentIdentityBindingOutcome.assessable && !hasAgentIdentityBinding) gaps.push("No stable agent identity — agent cannot prove who it is");
  if (hasUserIdentityPropagationOutcome.assessable && !hasUserIdentityPropagation) gaps.push("User identity not propagated to tool calls — execution identity diverges from user identity");
  if (hasToolCallOwnershipOutcome.assessable && !hasToolCallOwnership) gaps.push("Tool calls not attributed to agent+user — cannot answer 'who called what'");
  if (hasIdentityAuditTrailOutcome.assessable && !hasIdentityAuditTrail) gaps.push("No identity audit trail — cannot reconstruct execution chain");
  if (hasJITCredentialsOutcome.assessable && !hasJITCredentials) gaps.push("Static API keys in use — compromise of one key exposes all capabilities");
  if (hasIdentityRevocationOutcome.assessable && !hasIdentityRevocation) gaps.push("No identity revocation — compromised agent identity cannot be invalidated");

  if (hasUserIdentityPropagationOutcome.assessable && !hasUserIdentityPropagation) recommendations.push("Propagate user identity through all tool calls; bind agent actions to the user on whose behalf they act");
  if (hasJITCredentialsOutcome.assessable && !hasJITCredentials) recommendations.push("Replace static API keys with short-lived JIT tokens scoped to specific tasks");
  if (hasIdentityRevocationOutcome.assessable && !hasIdentityRevocation) recommendations.push("Implement token revocation list; invalidate agent credentials on compromise detection");

  const outcomes = [hasAgentIdentityBindingOutcome, hasUserIdentityPropagationOutcome, hasToolCallOwnershipOutcome, hasIdentityAuditTrailOutcome, hasJITCredentialsOutcome, hasIdentityRevocationOutcome];
  const { score, assessed: assessedCriteria, total: totalCriteria, notAssessable: notAssessableCriteria } =
    scoreAssessableCriteria(outcomes);
  const skipped = notAssessableNote(notAssessableCriteria, totalCriteria);
  if (skipped) recommendations.push(skipped);
  const level = score >= 90 ? 5 : score >= 70 ? 4 : score >= 50 ? 3 : score >= 30 ? 2 : score >= 10 ? 1 : 0;

  return {
    score, level, assessedCriteria, totalCriteria, notAssessableCriteria,
    hasAgentIdentityBinding, hasUserIdentityPropagation, hasToolCallOwnership,
    hasIdentityAuditTrail, hasJITCredentials, hasIdentityRevocation,
    gaps, recommendations,
  };
}
