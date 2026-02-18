/**
 * Community/Platform Governance Mode
 *
 * Scores platform governance maturity across dimensions:
 * identity verification, content moderation, reputation integrity,
 * evidence layer, trust composition.
 */
import { z } from "zod";

// ── Types ──────────────────────────────────────────────────────────────────

export const COMMUNITY_TRUST_TIERS = ["OBSERVED", "ATTESTED", "SELF_REPORTED"] as const;
export type CommunityTrustTier = (typeof COMMUNITY_TRUST_TIERS)[number];

export const COMMUNITY_DIMENSIONS = [
  "identity_verification",
  "content_moderation",
  "reputation_integrity",
  "evidence_layer",
  "trust_composition",
] as const;
export type CommunityDimension = (typeof COMMUNITY_DIMENSIONS)[number];

export const GAMING_PATTERNS = [
  "karma_gaming",
  "vote_manipulation",
  "self_dealing",
  "sybil_attack",
] as const;
export type GamingPattern = (typeof GAMING_PATTERNS)[number];

export interface CommunitySignal {
  id: string;
  tier: CommunityTrustTier;
  dimension: CommunityDimension;
  source: string;
  ts: number;
  value: number; // 0-5
  evidence?: string;
}

export interface GamingDetection {
  pattern: GamingPattern;
  confidence: number; // 0-1
  description: string;
  affectedDimension: CommunityDimension;
  evidenceIds: string[];
}

export interface DimensionScore {
  dimension: CommunityDimension;
  score: number; // 0-5
  signalCount: number;
  tierBreakdown: Record<CommunityTrustTier, number>;
  recommendations: string[];
}

export interface CommunityGovernanceReport {
  platformName: string;
  generatedTs: number;
  overallScore: number; // 0-5
  dimensionScores: DimensionScore[];
  gamingDetections: GamingDetection[];
  signalCount: number;
  recommendations: string[];
}

export interface CommunityPlatformConfig {
  name: string;
  createdTs: number;
  signals: CommunitySignal[];
}

// ── Schema ─────────────────────────────────────────────────────────────────

export const communitySignalSchema = z.object({
  id: z.string().min(1),
  tier: z.enum(COMMUNITY_TRUST_TIERS),
  dimension: z.enum(COMMUNITY_DIMENSIONS),
  source: z.string().min(1),
  ts: z.number().int(),
  value: z.number().min(0).max(5),
  evidence: z.string().optional(),
});

export const communityPlatformConfigSchema = z.object({
  name: z.string().min(1),
  createdTs: z.number().int(),
  signals: z.array(communitySignalSchema),
});

// ── Tier weights (OBSERVED > ATTESTED > SELF_REPORTED) ─────────────────────

const TIER_WEIGHTS: Record<CommunityTrustTier, number> = {
  OBSERVED: 1.0,
  ATTESTED: 0.7,
  SELF_REPORTED: 0.3,
};

// ── Core logic ─────────────────────────────────────────────────────────────

export function initCommunityPlatform(name: string): CommunityPlatformConfig {
  return {
    name,
    createdTs: Date.now(),
    signals: [],
  };
}

export function addCommunitySignal(
  config: CommunityPlatformConfig,
  signal: Omit<CommunitySignal, "id">
): CommunityPlatformConfig {
  const id = `csig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    ...config,
    signals: [...config.signals, { ...signal, id }],
  };
}

export function detectGamingPatterns(signals: CommunitySignal[]): GamingDetection[] {
  const detections: GamingDetection[] = [];

  // Detect karma gaming: many self-reported signals with high values but few observed ones
  const selfReported = signals.filter((s) => s.tier === "SELF_REPORTED");
  const observed = signals.filter((s) => s.tier === "OBSERVED");
  if (selfReported.length > 5 && observed.length < 2) {
    const avgSelfValue = selfReported.reduce((a, b) => a + b.value, 0) / selfReported.length;
    if (avgSelfValue > 3.5) {
      detections.push({
        pattern: "karma_gaming",
        confidence: Math.min(1, (avgSelfValue - 3) / 2),
        description: `High self-reported scores (avg ${avgSelfValue.toFixed(1)}) with insufficient observed evidence`,
        affectedDimension: "reputation_integrity",
        evidenceIds: selfReported.map((s) => s.id),
      });
    }
  }

  // Detect vote manipulation: spikes of signals from same source in short time
  const bySource = new Map<string, CommunitySignal[]>();
  for (const s of signals) {
    const arr = bySource.get(s.source) ?? [];
    arr.push(s);
    bySource.set(s.source, arr);
  }
  for (const [source, sigs] of bySource) {
    if (sigs.length > 10) {
      const sorted = sigs.sort((a, b) => a.ts - b.ts);
      const timeSpan = sorted[sorted.length - 1].ts - sorted[0].ts;
      if (timeSpan < 60_000 * 5) {
        // 10+ signals in 5 minutes
        detections.push({
          pattern: "vote_manipulation",
          confidence: 0.8,
          description: `${sigs.length} signals from "${source}" in ${Math.round(timeSpan / 1000)}s`,
          affectedDimension: "reputation_integrity",
          evidenceIds: sigs.map((s) => s.id),
        });
      }
    }
  }

  // Detect self-dealing: same source rating itself highly
  const selfDealing = signals.filter(
    (s) => s.tier === "SELF_REPORTED" && s.value >= 4 && s.dimension === "reputation_integrity"
  );
  if (selfDealing.length > 3) {
    detections.push({
      pattern: "self_dealing",
      confidence: 0.7,
      description: `${selfDealing.length} self-reported high reputation signals detected`,
      affectedDimension: "reputation_integrity",
      evidenceIds: selfDealing.map((s) => s.id),
    });
  }

  // Detect Sybil attacks: many distinct sources with identical patterns
  const sourceValues = new Map<string, number[]>();
  for (const s of signals) {
    const arr = sourceValues.get(s.source) ?? [];
    arr.push(s.value);
    sourceValues.set(s.source, arr);
  }
  const patterns = [...sourceValues.entries()].map(([src, vals]) => ({
    src,
    avg: vals.reduce((a, b) => a + b, 0) / vals.length,
    count: vals.length,
  }));
  const identicalPatterns = patterns.filter(
    (p) => patterns.filter((q) => Math.abs(q.avg - p.avg) < 0.1 && q.count === p.count && q.src !== p.src).length > 2
  );
  if (identicalPatterns.length > 2) {
    detections.push({
      pattern: "sybil_attack",
      confidence: 0.6,
      description: `${identicalPatterns.length} sources with suspiciously identical signal patterns`,
      affectedDimension: "identity_verification",
      evidenceIds: signals.filter((s) => identicalPatterns.some((p) => p.src === s.source)).map((s) => s.id),
    });
  }

  return detections;
}

function scoreDimension(signals: CommunitySignal[], dimension: CommunityDimension): DimensionScore {
  const dimSignals = signals.filter((s) => s.dimension === dimension);
  if (dimSignals.length === 0) {
    return {
      dimension,
      score: 0,
      signalCount: 0,
      tierBreakdown: { OBSERVED: 0, ATTESTED: 0, SELF_REPORTED: 0 },
      recommendations: [`No signals for ${dimension}. Provide observed evidence.`],
    };
  }

  let weightedSum = 0;
  let weightTotal = 0;
  const tierBreakdown: Record<CommunityTrustTier, number> = { OBSERVED: 0, ATTESTED: 0, SELF_REPORTED: 0 };

  for (const s of dimSignals) {
    const w = TIER_WEIGHTS[s.tier];
    weightedSum += s.value * w;
    weightTotal += w;
    tierBreakdown[s.tier]++;
  }

  const score = weightTotal > 0 ? weightedSum / weightTotal : 0;
  const recommendations: string[] = [];

  if (tierBreakdown.OBSERVED === 0) {
    recommendations.push(`Add OBSERVED evidence for ${dimension}`);
  }
  if (score < 2) {
    recommendations.push(`${dimension} score is low (${score.toFixed(1)}). Review governance controls.`);
  }

  return { dimension, score, signalCount: dimSignals.length, tierBreakdown, recommendations };
}

export function scoreCommunityGovernance(config: CommunityPlatformConfig): CommunityGovernanceReport {
  const gamingDetections = detectGamingPatterns(config.signals);
  const dimensionScores = COMMUNITY_DIMENSIONS.map((d) => scoreDimension(config.signals, d));
  const overallScore =
    dimensionScores.length > 0
      ? dimensionScores.reduce((a, b) => a + b.score, 0) / dimensionScores.length
      : 0;

  // Penalize overall score for gaming detections
  const gamingPenalty = gamingDetections.reduce((acc, d) => acc + d.confidence * 0.5, 0);
  const adjustedOverall = Math.max(0, overallScore - gamingPenalty);

  const recommendations = dimensionScores.flatMap((d) => d.recommendations);
  if (gamingDetections.length > 0) {
    recommendations.push(
      `${gamingDetections.length} gaming pattern(s) detected — investigate before trusting community signals.`
    );
  }

  return {
    platformName: config.name,
    generatedTs: Date.now(),
    overallScore: adjustedOverall,
    dimensionScores,
    gamingDetections,
    signalCount: config.signals.length,
    recommendations,
  };
}

export function renderCommunityGovernanceMarkdown(report: CommunityGovernanceReport): string {
  const lines: string[] = [
    `# Community Governance Report — ${report.platformName}`,
    "",
    `**Overall Score:** ${report.overallScore.toFixed(2)} / 5`,
    `**Signals:** ${report.signalCount}`,
    `**Generated:** ${new Date(report.generatedTs).toISOString()}`,
    "",
    "## Dimension Scores",
    "",
  ];

  for (const d of report.dimensionScores) {
    lines.push(`### ${d.dimension}`);
    lines.push(`- Score: ${d.score.toFixed(2)} / 5`);
    lines.push(`- Signals: ${d.signalCount} (OBSERVED: ${d.tierBreakdown.OBSERVED}, ATTESTED: ${d.tierBreakdown.ATTESTED}, SELF_REPORTED: ${d.tierBreakdown.SELF_REPORTED})`);
    if (d.recommendations.length > 0) {
      lines.push("- Recommendations:");
      for (const r of d.recommendations) lines.push(`  - ${r}`);
    }
    lines.push("");
  }

  if (report.gamingDetections.length > 0) {
    lines.push("## Gaming Detections", "");
    for (const g of report.gamingDetections) {
      lines.push(`- **${g.pattern}** (confidence: ${g.confidence.toFixed(2)}): ${g.description}`);
    }
    lines.push("");
  }

  if (report.recommendations.length > 0) {
    lines.push("## Recommendations", "");
    for (const r of report.recommendations) lines.push(`- ${r}`);
    lines.push("");
  }

  return lines.join("\n");
}
