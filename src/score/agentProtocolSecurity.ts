/**
 * Agent Protocol Security Maturity
 * Scores protocol-agnostic security across multi-protocol agent deployments.
 * Source: Multi-protocol security analysis (MCP, A2A, Agora, ANP)
 * Agents use multiple protocols with different security models.
 */

import { existsSync } from "fs";
import { join } from "path";

export interface AgentProtocolSecurityResult {
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

  const hasProtocolInventory = [".amc/protocol_inventory.json", "src/protocols", "ADAPTERS.md"]
    .some(f => existsSync(join(root, f)));

  const hasProtocolAuthN = ["src/auth", "src/enforce/protocolAuth.ts"]
    .some(f => existsSync(join(root, f)));

  const hasProtocolAuthZ = ["src/enforce", "src/policy"]
    .some(f => existsSync(join(root, f)));

  const hasProtocolInputValidation = ["src/enforce/inputValidator.ts", "src/bridge/sanitize.ts", "src/shield/ingress.ts"]
    .some(f => existsSync(join(root, f)));

  const hasProtocolRateLimiting = ["src/enforce/rateLimit.ts", "src/ops/rateLimiter.ts"]
    .some(f => existsSync(join(root, f)));

  const hasProtocolAudit = [".amc/audit_log.jsonl", "src/audit", "src/ledger"]
    .some(f => existsSync(join(root, f)));

  const hasProtocolVersionPinning = [".amc/protocol_versions.json", "src/protocols/versionPin.ts"]
    .some(f => existsSync(join(root, f)));

  if (!hasProtocolInventory) gaps.push("No protocol inventory — unknown which protocols the agent exposes or consumes");
  if (!hasProtocolAuthN) gaps.push("No protocol authentication — agent endpoints accept unauthenticated requests");
  if (!hasProtocolAuthZ) gaps.push("No protocol authorization — no enforcement of who can call what");
  if (!hasProtocolInputValidation) gaps.push("No protocol input validation — malformed or malicious inputs are not filtered");
  if (!hasProtocolRateLimiting) gaps.push("No protocol rate limiting — agent is vulnerable to resource exhaustion");
  if (!hasProtocolAudit) gaps.push("No protocol audit trail — cross-protocol interactions are not logged");
  if (!hasProtocolVersionPinning) gaps.push("No protocol version pinning — protocol upgrades may introduce breaking changes silently");

  if (!hasProtocolInventory) recommendations.push("Create a protocol inventory documenting all agent communication protocols");
  if (!hasProtocolInputValidation) recommendations.push("Validate and sanitize inputs at every protocol boundary");
  if (!hasProtocolRateLimiting) recommendations.push("Add rate limiting per protocol endpoint to prevent resource exhaustion");
  if (!hasProtocolVersionPinning) recommendations.push("Pin protocol versions and test upgrades before deployment");

  const checks = [hasProtocolInventory, hasProtocolAuthN, hasProtocolAuthZ,
    hasProtocolInputValidation, hasProtocolRateLimiting, hasProtocolAudit, hasProtocolVersionPinning];
  const passed = checks.filter(Boolean).length;
  const score = Math.round((passed / checks.length) * 100);
  const level = score >= 90 ? 5 : score >= 70 ? 4 : score >= 50 ? 3 : score >= 30 ? 2 : score >= 10 ? 1 : 0;

  return {
    score, level,
    hasProtocolInventory, hasProtocolAuthN, hasProtocolAuthZ,
    hasProtocolInputValidation, hasProtocolRateLimiting, hasProtocolAudit,
    hasProtocolVersionPinning, gaps, recommendations,
  };
}
