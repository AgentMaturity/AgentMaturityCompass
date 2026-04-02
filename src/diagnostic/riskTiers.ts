/**
 * Risk-Tiered Assessment Profiles — MF-13
 *
 * Configures evaluation depth based on agent risk tier:
 * - Critical: Full 235 questions + all assurance packs
 * - High: 150 questions + security assurance packs
 * - Medium: 100 core questions
 * - Low: 50 essential questions
 *
 * MiroFish agent quote:
 * "Full evaluation on all 200+ deployments is impractical — need risk-based tiering."
 *  — Raj Patel (200+ deployments)
 */

import { z } from "zod";
import type { RiskTier } from "../types.js";

export const riskTierConfigSchema = z.object({
  tier: z.enum(["critical", "high", "med", "low"]),
  maxQuestions: z.number().min(10),
  assurancePacks: z.enum(["all", "security", "core", "minimal"]),
  evidenceDepth: z.enum(["full", "standard", "light"]),
  reportDetail: z.enum(["comprehensive", "standard", "summary"]),
  evaluationTimeoutMs: z.number().min(5000),
  requireSignature: z.boolean(),
});

export type RiskTierConfig = z.infer<typeof riskTierConfigSchema>;

export const RISK_TIER_PROFILES: Record<string, RiskTierConfig> = {
  critical: {
    tier: "critical",
    maxQuestions: 235,
    assurancePacks: "all",
    evidenceDepth: "full",
    reportDetail: "comprehensive",
    evaluationTimeoutMs: 600_000,
    requireSignature: true,
  },
  high: {
    tier: "high",
    maxQuestions: 150,
    assurancePacks: "security",
    evidenceDepth: "full",
    reportDetail: "comprehensive",
    evaluationTimeoutMs: 300_000,
    requireSignature: true,
  },
  med: {
    tier: "med",
    maxQuestions: 100,
    assurancePacks: "core",
    evidenceDepth: "standard",
    reportDetail: "standard",
    evaluationTimeoutMs: 180_000,
    requireSignature: false,
  },
  low: {
    tier: "low",
    maxQuestions: 50,
    assurancePacks: "minimal",
    evidenceDepth: "light",
    reportDetail: "summary",
    evaluationTimeoutMs: 60_000,
    requireSignature: false,
  },
};

export function getRiskTierProfile(tier: string): RiskTierConfig {
  return RISK_TIER_PROFILES[tier] ?? RISK_TIER_PROFILES["med"]!;
}

export interface AutoTierResult {
  detectedTier: RiskTier;
  confidence: number;
  factors: Array<{ factor: string; value: string; tierImpact: RiskTier }>;
  recommendation: string;
}

export function autoDetectRiskTier(agentCapabilities: {
  hasNetworkAccess?: boolean;
  handlesFinancialData?: boolean;
  handlesPII?: boolean;
  hasExecutePermissions?: boolean;
  isPublicFacing?: boolean;
  agentCount?: number;
  hasSafetyControls?: boolean;
}): AutoTierResult {
  const factors: AutoTierResult["factors"] = [];
  let maxTier: RiskTier = "low";

  if (agentCapabilities.handlesFinancialData) {
    factors.push({ factor: "financial_data", value: "true", tierImpact: "critical" });
    maxTier = "critical";
  }
  if (agentCapabilities.handlesPII) {
    factors.push({ factor: "pii_handling", value: "true", tierImpact: "high" });
    if (maxTier !== "critical") maxTier = "high";
  }
  if (agentCapabilities.hasExecutePermissions) {
    factors.push({ factor: "execute_permissions", value: "true", tierImpact: "high" });
    if (maxTier !== "critical") maxTier = "high";
  }
  if (agentCapabilities.isPublicFacing) {
    factors.push({ factor: "public_facing", value: "true", tierImpact: "high" });
    if (maxTier !== "critical") maxTier = "high";
  }
  if (agentCapabilities.hasNetworkAccess) {
    factors.push({ factor: "network_access", value: "true", tierImpact: "med" });
    if (maxTier === "low") maxTier = "med";
  }
  if ((agentCapabilities.agentCount ?? 1) > 10) {
    factors.push({ factor: "fleet_size", value: String(agentCapabilities.agentCount), tierImpact: "high" });
    if (maxTier !== "critical") maxTier = "high";
  }
  if (!agentCapabilities.hasSafetyControls) {
    factors.push({ factor: "no_safety_controls", value: "true", tierImpact: "critical" });
    maxTier = "critical";
  }

  const confidence = factors.length >= 3 ? 0.9 : factors.length >= 1 ? 0.7 : 0.5;
  const profile = getRiskTierProfile(maxTier);

  return {
    detectedTier: maxTier,
    confidence,
    factors,
    recommendation: `Recommended tier: ${maxTier} (${profile.maxQuestions} questions, ${profile.assurancePacks} assurance packs)`,
  };
}

export function shouldEscalateTier(currentTier: RiskTier, scoreRegression: number, incidentCount: number): {
  escalate: boolean;
  newTier: RiskTier;
  reason: string;
} {
  const tierOrder: RiskTier[] = ["low", "med", "high", "critical"];
  const currentIdx = tierOrder.indexOf(currentTier);

  if (scoreRegression > 1.0 || incidentCount >= 3) {
    const newIdx = Math.min(currentIdx + 2, tierOrder.length - 1);
    return { escalate: true, newTier: tierOrder[newIdx]!, reason: `Score regression ${scoreRegression.toFixed(1)} + ${incidentCount} incidents → escalated to ${tierOrder[newIdx]}` };
  }

  if (scoreRegression > 0.5 || incidentCount >= 1) {
    const newIdx = Math.min(currentIdx + 1, tierOrder.length - 1);
    if (newIdx > currentIdx) {
      return { escalate: true, newTier: tierOrder[newIdx]!, reason: `Score regression ${scoreRegression.toFixed(1)} + ${incidentCount} incidents → escalated to ${tierOrder[newIdx]}` };
    }
  }

  return { escalate: false, newTier: currentTier, reason: "No escalation needed" };
}
