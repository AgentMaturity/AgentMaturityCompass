/**
 * Runtime Execution Identity Maturity
 * Scores whether execution identity is properly tracked and matches user identity.
 * Source: HN — "Execution identity diverged from user identity" (Levo.ai, 2026)
 * Agents calling tools nobody remembered wiring up; MCP servers as quiet control planes.
 */

import { existsSync } from "fs";
import { join } from "path";
import { evidencePathExists } from "./controlSurfaceScope.js";

export interface RuntimeIdentityResult {
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
  const hasAgentIdentityBinding = identityPaths.some(f => evidencePathExists(root, f));

  // User identity propagation — auth context flows through
  const userIdPaths = ["src/auth", "src/enforce/identityMapper.ts", ".amc/identity_map.json"];
  const hasUserIdentityPropagation = userIdPaths.some(f => evidencePathExists(root, f));

  // Tool call ownership — every call attributed
  const ownershipPaths = [".amc/ACTION_AUDIT.md", ".amc/audit_log.jsonl", "src/receipts"];
  const hasToolCallOwnership = ownershipPaths.some(f => evidencePathExists(root, f));

  // Identity audit trail
  const auditPaths = [".amc/ACTION_AUDIT.md", ".amc/audit_log.jsonl", "src/ledger"];
  const hasIdentityAuditTrail = auditPaths.some(f => evidencePathExists(root, f));

  // JIT credentials — short-lived tokens
  const jitPaths = ["src/auth/jitCredentials.ts", ".amc/token_policy.json", "src/enforce/tokenManager.ts"];
  const hasJITCredentials = jitPaths.some(f => evidencePathExists(root, f));

  // Identity revocation
  const revocationPaths = ["src/auth/revocation.ts", ".amc/revocation_list.json"];
  const hasIdentityRevocation = revocationPaths.some(f => evidencePathExists(root, f));

  if (!hasAgentIdentityBinding) gaps.push("No stable agent identity — agent cannot prove who it is");
  if (!hasUserIdentityPropagation) gaps.push("User identity not propagated to tool calls — execution identity diverges from user identity");
  if (!hasToolCallOwnership) gaps.push("Tool calls not attributed to agent+user — cannot answer 'who called what'");
  if (!hasIdentityAuditTrail) gaps.push("No identity audit trail — cannot reconstruct execution chain");
  if (!hasJITCredentials) gaps.push("Static API keys in use — compromise of one key exposes all capabilities");
  if (!hasIdentityRevocation) gaps.push("No identity revocation — compromised agent identity cannot be invalidated");

  if (!hasUserIdentityPropagation) recommendations.push("Propagate user identity through all tool calls; bind agent actions to the user on whose behalf they act");
  if (!hasJITCredentials) recommendations.push("Replace static API keys with short-lived JIT tokens scoped to specific tasks");
  if (!hasIdentityRevocation) recommendations.push("Implement token revocation list; invalidate agent credentials on compromise detection");

  const checks = [hasAgentIdentityBinding, hasUserIdentityPropagation, hasToolCallOwnership,
    hasIdentityAuditTrail, hasJITCredentials, hasIdentityRevocation];
  const passed = checks.filter(Boolean).length;
  const score = Math.round((passed / checks.length) * 100);
  const level = score >= 90 ? 5 : score >= 70 ? 4 : score >= 50 ? 3 : score >= 30 ? 2 : score >= 10 ? 1 : 0;

  return {
    score, level,
    hasAgentIdentityBinding, hasUserIdentityPropagation, hasToolCallOwnership,
    hasIdentityAuditTrail, hasJITCredentials, hasIdentityRevocation,
    gaps, recommendations,
  };
}
