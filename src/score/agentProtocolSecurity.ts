/**
 * Agent Protocol Security Maturity
 * Scores protocol-agnostic security across multi-protocol agent deployments.
 * Source: Multi-protocol security analysis (MCP, A2A, Agora, ANP)
 * Agents use multiple protocols with different security models.
 */

import { existsSync } from "fs";
import { join } from "path";
import { assessCriterion, scoreAssessableCriteria, notAssessableNote } from "./controlSurfaceScope.js";

export interface AgentProtocolSecurityResult {
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
  hasProtocolInventory: boolean;
  hasProtocolAuthN: boolean;
  hasProtocolAuthZ: boolean;
  hasProtocolInputValidation: boolean;
  hasProtocolRateLimiting: boolean;
  hasProtocolAudit: boolean;
  hasProtocolVersionPinning: boolean;
  gaps: string[];
  recommendations: string[];
}

export function scoreAgentProtocolSecurity(cwd?: string): AgentProtocolSecurityResult {
  const root = cwd ?? process.cwd();
  const gaps: string[] = [];
  const recommendations: string[] = [];

  const hasProtocolInventoryOutcome = assessCriterion(root, [".amc/protocol_inventory.json", "src/protocols", "ADAPTERS.md"]);
  const hasProtocolInventory = hasProtocolInventoryOutcome.met;

  const hasProtocolAuthNOutcome = assessCriterion(root, ["src/auth", "src/enforce/protocolAuth.ts"]);
  const hasProtocolAuthN = hasProtocolAuthNOutcome.met;

  const hasProtocolAuthZOutcome = assessCriterion(root, ["src/enforce", "src/policy"]);
  const hasProtocolAuthZ = hasProtocolAuthZOutcome.met;

  const hasProtocolInputValidationOutcome = assessCriterion(root, ["src/enforce/inputValidator.ts", "src/bridge/sanitize.ts", "src/shield/ingress.ts"]);
  const hasProtocolInputValidation = hasProtocolInputValidationOutcome.met;

  const hasProtocolRateLimitingOutcome = assessCriterion(root, ["src/enforce/rateLimit.ts", "src/ops/rateLimiter.ts"]);
  const hasProtocolRateLimiting = hasProtocolRateLimitingOutcome.met;

  const hasProtocolAuditOutcome = assessCriterion(root, [".amc/audit_log.jsonl", "src/audit", "src/ledger"]);
  const hasProtocolAudit = hasProtocolAuditOutcome.met;

  const hasProtocolVersionPinningOutcome = assessCriterion(root, [".amc/protocol_versions.json", "src/protocols/versionPin.ts"]);
  const hasProtocolVersionPinning = hasProtocolVersionPinningOutcome.met;

  if (hasProtocolInventoryOutcome.assessable && !hasProtocolInventory) gaps.push("No protocol inventory — unknown which protocols the agent exposes or consumes");
  if (hasProtocolAuthNOutcome.assessable && !hasProtocolAuthN) gaps.push("No protocol authentication — agent endpoints accept unauthenticated requests");
  if (hasProtocolAuthZOutcome.assessable && !hasProtocolAuthZ) gaps.push("No protocol authorization — no enforcement of who can call what");
  if (hasProtocolInputValidationOutcome.assessable && !hasProtocolInputValidation) gaps.push("No protocol input validation — malformed or malicious inputs are not filtered");
  if (hasProtocolRateLimitingOutcome.assessable && !hasProtocolRateLimiting) gaps.push("No protocol rate limiting — agent is vulnerable to resource exhaustion");
  if (hasProtocolAuditOutcome.assessable && !hasProtocolAudit) gaps.push("No protocol audit trail — cross-protocol interactions are not logged");
  if (hasProtocolVersionPinningOutcome.assessable && !hasProtocolVersionPinning) gaps.push("No protocol version pinning — protocol upgrades may introduce breaking changes silently");

  if (hasProtocolInventoryOutcome.assessable && !hasProtocolInventory) recommendations.push("Create a protocol inventory documenting all agent communication protocols");
  if (hasProtocolInputValidationOutcome.assessable && !hasProtocolInputValidation) recommendations.push("Validate and sanitize inputs at every protocol boundary");
  if (hasProtocolRateLimitingOutcome.assessable && !hasProtocolRateLimiting) recommendations.push("Add rate limiting per protocol endpoint to prevent resource exhaustion");
  if (hasProtocolVersionPinningOutcome.assessable && !hasProtocolVersionPinning) recommendations.push("Pin protocol versions and test upgrades before deployment");

  const outcomes = [hasProtocolInventoryOutcome, hasProtocolAuthNOutcome, hasProtocolAuthZOutcome, hasProtocolInputValidationOutcome, hasProtocolRateLimitingOutcome, hasProtocolAuditOutcome, hasProtocolVersionPinningOutcome];
  const { score, assessed: assessedCriteria, total: totalCriteria, notAssessable: notAssessableCriteria } =
    scoreAssessableCriteria(outcomes);
  const skipped = notAssessableNote(notAssessableCriteria, totalCriteria);
  if (skipped) recommendations.push(skipped);
  const level = score >= 90 ? 5 : score >= 70 ? 4 : score >= 50 ? 3 : score >= 30 ? 2 : score >= 10 ? 1 : 0;

  return {
    score, level, assessedCriteria, totalCriteria, notAssessableCriteria,
    hasProtocolInventory, hasProtocolAuthN, hasProtocolAuthZ,
    hasProtocolInputValidation, hasProtocolRateLimiting, hasProtocolAudit,
    hasProtocolVersionPinning, gaps, recommendations,
  };
}
