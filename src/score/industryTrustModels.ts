/**
 * Industry-Specific Trust Models for AMC Score
 *
 * Dynamic risk weighting, sector-specific trust decay rates and
 * regulatory environment adaptation. AMC has no measured peer data, so no
 * model carries benchmark percentiles and no score has a percentile rank.
 *
 * All scores are 0–1 (matching AMC canonical M(a,d,t) model).
 * Maturity levels: L0–L5 (from formalSpec.ts scoreToLevel).
 */

import { type MaturityLevel } from "./formalSpec.js";
import { scoreToLevel, toDisplayScore } from "./scoringScale.js";
import { sealedRunReportVerifies } from "../diagnostic/reportSeal.js";
import { resolveRunReport } from "../diagnostic/runReportResolution.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface IndustryTrustModel {
  industryId: string;
  name: string;
  riskProfile: "critical" | "high" | "medium" | "low";
  dimensionWeights: Record<string, number>;    // Dimension → weight multiplier
  trustDecayRate: number;                       // Score points (0–1 scale) lost per 24h without refresh
  maxStaleHours: number;                        // Hours before trust expires completely
  evidenceRequirements: {
    minObservedShare: number;                   // Minimum fraction of observed (not self-reported) evidence (0–1)
    minEvidenceCount: number;                   // Minimum evidence artifacts needed
    requiredDimensions: string[];               // Dimensions that MUST have evidence
  };
  regulatoryFrameworks: string[];              // Applicable compliance frameworks
}

export interface IndustryAdjustedScore {
  rawScore: number;                // Display scale (default 0–100)
  adjustedScore: number;           // Display scale (default 0–100)
  maturityLevel: MaturityLevel;    // L0–L5 derived from internal score
  industryId: string;
  percentileRank: null;            // no peer data has been measured
  percentileReason: "no peer data";
  observedEvidenceShare: number | null; // from the agent's run; null when not evaluated
  dimensionAdjustments: Record<string, { raw: number; weighted: number; weight: number; level: MaturityLevel }>;
  decayApplied: number;            // Display scale
  riskFactors: string[];
  complianceGaps: string[];
}

// ── Industry Models ────────────────────────────────────────────────────────

export const INDUSTRY_TRUST_MODELS: Record<string, IndustryTrustModel> = {
  healthcare: {
    industryId: "healthcare",
    name: "Healthcare & Life Sciences",
    riskProfile: "critical",
    dimensionWeights: {
      security: 1.5, privacy: 1.8, reliability: 1.3, compliance: 1.6,
      safety: 2.0, transparency: 1.2, fairness: 1.1, governance: 1.4,
      evaluation: 1.0, cost: 0.6,
    },
    trustDecayRate: 0.08,    // 0.08/24h — fast decay in healthcare
    maxStaleHours: 72,       // 3 days max
    evidenceRequirements: {
      minObservedShare: 0.7,   // 70% must be observed evidence
      minEvidenceCount: 50,
      requiredDimensions: ["security", "privacy", "safety", "compliance"],
    },
    regulatoryFrameworks: ["HIPAA", "FDA_21CFR11", "EU_MDR", "GDPR"],
  },
  finance: {
    industryId: "finance",
    name: "Financial Services",
    riskProfile: "critical",
    dimensionWeights: {
      security: 1.6, privacy: 1.4, reliability: 1.5, compliance: 1.8,
      safety: 1.2, transparency: 1.3, fairness: 1.4, governance: 1.5,
      evaluation: 1.1, cost: 0.8,
    },
    trustDecayRate: 0.06,
    maxStaleHours: 120,
    evidenceRequirements: {
      minObservedShare: 0.65,
      minEvidenceCount: 40,
      requiredDimensions: ["security", "compliance", "governance", "reliability"],
    },
    regulatoryFrameworks: ["SOX", "PCI_DSS", "MiFID_II", "GDPR", "DORA"],
  },
  defense: {
    industryId: "defense",
    name: "Defense & Intelligence",
    riskProfile: "critical",
    dimensionWeights: {
      security: 2.0, privacy: 1.5, reliability: 1.8, compliance: 1.5,
      safety: 1.8, transparency: 0.8, fairness: 0.9, governance: 1.6,
      evaluation: 1.3, cost: 0.5,
    },
    trustDecayRate: 0.12,    // Fastest decay — 0.12/24h
    maxStaleHours: 48,
    evidenceRequirements: {
      minObservedShare: 0.85,
      minEvidenceCount: 80,
      requiredDimensions: ["security", "reliability", "safety", "governance", "evaluation"],
    },
    regulatoryFrameworks: ["NIST_800_53", "FedRAMP", "ITAR", "CMMC"],
  },
  autonomous_vehicles: {
    industryId: "autonomous_vehicles",
    name: "Autonomous Vehicles & Robotics",
    riskProfile: "critical",
    dimensionWeights: {
      security: 1.4, privacy: 1.0, reliability: 2.0, compliance: 1.3,
      safety: 2.0, transparency: 1.5, fairness: 1.0, governance: 1.4,
      evaluation: 1.6, cost: 0.7,
    },
    trustDecayRate: 0.10,
    maxStaleHours: 24,       // Tightest window — must re-verify daily
    evidenceRequirements: {
      minObservedShare: 0.8,
      minEvidenceCount: 100,
      requiredDimensions: ["safety", "reliability", "security", "evaluation", "transparency"],
    },
    regulatoryFrameworks: ["ISO_26262", "IEC_61508", "UNECE_R157", "SOTIF_ISO_21448"],
  },
  enterprise_saas: {
    industryId: "enterprise_saas",
    name: "Enterprise SaaS",
    riskProfile: "high",
    dimensionWeights: {
      security: 1.3, privacy: 1.2, reliability: 1.3, compliance: 1.2,
      safety: 1.0, transparency: 1.1, fairness: 1.0, governance: 1.2,
      evaluation: 1.0, cost: 1.0,
    },
    trustDecayRate: 0.03,
    maxStaleHours: 168,      // 7 days
    evidenceRequirements: {
      minObservedShare: 0.5,
      minEvidenceCount: 20,
      requiredDimensions: ["security", "reliability"],
    },
    regulatoryFrameworks: ["SOC2", "GDPR", "ISO_27001"],
  },
  entertainment: {
    industryId: "entertainment",
    name: "Entertainment & Media",
    riskProfile: "low",
    dimensionWeights: {
      security: 1.0, privacy: 1.1, reliability: 1.0, compliance: 0.9,
      safety: 0.8, transparency: 1.2, fairness: 1.3, governance: 0.8,
      evaluation: 0.9, cost: 1.2,
    },
    trustDecayRate: 0.01,    // Slowest decay
    maxStaleHours: 720,      // 30 days
    evidenceRequirements: {
      minObservedShare: 0.3,
      minEvidenceCount: 10,
      requiredDimensions: ["fairness"],
    },
    regulatoryFrameworks: ["COPPA", "GDPR"],
  },
};

// ── Industry-Adjusted Scoring ──────────────────────────────────────────────

/**
 * Apply industry-specific weights and decay to raw AMC dimension scores.
 * All scores are 0–1 scale. Output includes L0–L5 maturity level.
 */
export function computeIndustryAdjustedScore(
  rawDimensionScores: Record<string, number>,  // 0–1 per dimension
  industryId: string,
  lastVerifiedAt: number,
  observedEvidenceShare: number | null,  // the run's evidenceTrustCoverage.observed; null without a run
  now?: number,
): IndustryAdjustedScore {
  const model = INDUSTRY_TRUST_MODELS[industryId] ?? INDUSTRY_TRUST_MODELS.enterprise_saas!;
  const currentTime = now ?? Date.now();
  const staleHours = (currentTime - lastVerifiedAt) / 3600000;

  // Apply dimension weights (internal 0–1, output via toDisplayScore)
  const adjustments: Record<string, { raw: number; weighted: number; weight: number; level: MaturityLevel }> = {};
  let totalWeighted = 0;
  let totalWeight = 0;

  for (const [dim, rawScore] of Object.entries(rawDimensionScores)) {
    const weight = model.dimensionWeights[dim] ?? 1.0;
    const weighted = rawScore * weight;
    adjustments[dim] = { raw: toDisplayScore(rawScore), weighted: toDisplayScore(weighted), weight, level: scoreToLevel(rawScore) };
    totalWeighted += weighted;
    totalWeight += weight;
  }

  let internalScore = totalWeight > 0 ? totalWeighted / totalWeight : 0;

  // Apply temporal decay
  const decayPoints = Math.min(internalScore, (staleHours / 24) * model.trustDecayRate);
  if (staleHours > model.maxStaleHours) {
    internalScore = 0; // Expired → L0
  } else {
    internalScore -= decayPoints;
  }
  internalScore = Math.max(0, internalScore);

  // Risk factors
  const riskFactors: string[] = [];
  if (staleHours > model.maxStaleHours * 0.5) riskFactors.push(`Trust aging: ${staleHours.toFixed(0)}h since last verification`);
  if (observedEvidenceShare === null) {
    riskFactors.push("Observed evidence share is not evaluated: no scored run supplied it");
  } else if (observedEvidenceShare < model.evidenceRequirements.minObservedShare) {
    riskFactors.push(`Low observed evidence: ${(observedEvidenceShare * 100).toFixed(0)}% (need ${(model.evidenceRequirements.minObservedShare * 100).toFixed(0)}%)`);
  }

  // Compliance gaps — dimension below L3 threshold (0.55)
  const complianceGaps: string[] = [];
  for (const dim of model.evidenceRequirements.requiredDimensions) {
    if (!rawDimensionScores[dim] || rawDimensionScores[dim]! < 0.55) {
      complianceGaps.push(`Required dimension "${dim}" at ${scoreToLevel(rawDimensionScores[dim] ?? 0)} — needs L3+`);
    }
  }

  const rawAvg = Object.values(rawDimensionScores).reduce((s, v) => s + v, 0) / Math.max(1, Object.keys(rawDimensionScores).length);

  return {
    rawScore: toDisplayScore(rawAvg),
    adjustedScore: toDisplayScore(internalScore),
    maturityLevel: scoreToLevel(internalScore),
    industryId: model.industryId,
    percentileRank: null,
    percentileReason: "no peer data",
    observedEvidenceShare,
    dimensionAdjustments: adjustments,
    decayApplied: toDisplayScore(decayPoints),
    riskFactors,
    complianceGaps,
  };
}

/**
 * A run's observed-evidence share (the latest run unless `runRef` names one), or
 * null when there is no run or the run is not sealed by this workspace's auditor
 * key: an unsealed run file is not evidence.
 */
export function latestObservedEvidenceShare(workspace: string, agentId?: string, runRef = "latest"): number | null {
  try {
    const { report } = resolveRunReport(workspace, runRef, agentId);
    if (!sealedRunReportVerifies(workspace, report as unknown as Record<string, unknown>)) return null;
    return report.evidenceTrustCoverage?.observed ?? null;
  } catch {
    return null;
  }
}
