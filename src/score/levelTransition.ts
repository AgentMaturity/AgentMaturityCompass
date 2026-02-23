/**
 * Level Transition Scoring Module
 *
 * Formalizes maturity level promotion and demotion as explicit events
 * with evidence gates, inspired by tiered knowledge promotion systems.
 *
 * Research basis:
 * - Tiered knowledge systems: promotion through repeated consistent
 *   traversal, demotion through evidence decay.
 * - AMC evidence decay: scores degrade without fresh proof.
 * - CMMI/SPICE maturity models: level transitions require formal
 *   assessment and evidence of sustained capability.
 *
 * Key insight: A maturity level isn't a snapshot — it's a TRANSITION.
 * The quality of the transition (evidence depth, duration, adversarial
 * testing) determines the reliability of the level assignment.
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";

export interface LevelTransition {
  /** Agent identifier */
  agentId: string;
  /** Dimension or overall */
  dimension: string;
  /** Previous level */
  fromLevel: number;
  /** New level */
  toLevel: number;
  /** Direction: promotion, demotion, or stable */
  direction: "promotion" | "demotion" | "stable";
  /** Timestamp of transition */
  timestamp: string;
  /** Evidence items supporting this transition */
  evidenceCount: number;
  /** Duration of sustained performance at new level (days) */
  sustainedDays: number;
  /** Whether adversarial testing was performed at new level */
  adversarialTested: boolean;
  /** Confidence in the transition (0-1) */
  confidence: number;
  /** Transition quality score (0-100) */
  quality: number;
}

export interface LevelTransitionReport {
  /** All recorded transitions */
  transitions: LevelTransition[];
  /** Average transition quality */
  avgTransitionQuality: number;
  /** Promotion success rate (promotions that stuck vs reverted) */
  promotionRetentionRate: number;
  /** Evidence decay rate (demotions per time period) */
  demotionRate: number;
  /** Overall score 0-100 */
  score: number;
  /** Maturity level */
  level: number;
  /** Gaps */
  gaps: string[];
}

/**
 * Evidence requirements per level transition.
 * Higher levels require exponentially more evidence.
 */
const EVIDENCE_REQUIREMENTS: Record<number, { minEvidence: number; minDays: number; requireAdversarial: boolean }> = {
  1: { minEvidence: 3, minDays: 0, requireAdversarial: false },
  2: { minEvidence: 10, minDays: 7, requireAdversarial: false },
  3: { minEvidence: 25, minDays: 14, requireAdversarial: true },
  4: { minEvidence: 50, minDays: 30, requireAdversarial: true },
  5: { minEvidence: 100, minDays: 90, requireAdversarial: true },
};

/**
 * Score a level transition's quality.
 */
export function scoreTransitionQuality(transition: Omit<LevelTransition, "quality" | "confidence">): LevelTransition {
  const targetLevel = transition.toLevel;
  const req = EVIDENCE_REQUIREMENTS[targetLevel] ?? EVIDENCE_REQUIREMENTS[1]!;

  let quality = 0;

  // Evidence sufficiency (40% weight)
  const evidenceRatio = Math.min(1, transition.evidenceCount / req.minEvidence);
  quality += evidenceRatio * 40;

  // Duration sufficiency (30% weight)
  const durationRatio = req.minDays > 0
    ? Math.min(1, transition.sustainedDays / req.minDays)
    : 1;
  quality += durationRatio * 30;

  // Adversarial testing (20% weight)
  if (req.requireAdversarial) {
    quality += transition.adversarialTested ? 20 : 0;
  } else {
    quality += transition.adversarialTested ? 20 : 10; // Bonus for optional adversarial
  }

  // Direction bonus (10% weight)
  if (transition.direction === "promotion") {
    quality += 10; // Promotions are positive signals
  } else if (transition.direction === "demotion") {
    quality += 5; // Demotions show the system is honest
  } else {
    quality += 7; // Stability is good
  }

  quality = Math.min(100, Math.round(quality));
  const confidence = quality / 100;

  return { ...transition, quality, confidence };
}

/**
 * Analyze a set of transitions for overall health.
 */
export function scoreLevelTransitions(transitions: LevelTransition[]): LevelTransitionReport {
  const gaps: string[] = [];

  if (transitions.length === 0) {
    return {
      transitions: [],
      avgTransitionQuality: 0,
      promotionRetentionRate: 0,
      demotionRate: 0,
      score: 0,
      level: 0,
      gaps: ["No level transitions recorded — maturity tracking not active"],
    };
  }

  const avgQuality = transitions.reduce((sum, t) => sum + t.quality, 0) / transitions.length;

  const promotions = transitions.filter((t) => t.direction === "promotion");
  const demotions = transitions.filter((t) => t.direction === "demotion");

  // Check if promotions were followed by demotions (reverted)
  let revertedPromotions = 0;
  for (const promo of promotions) {
    const revert = demotions.find(
      (d) => d.dimension === promo.dimension &&
        d.fromLevel === promo.toLevel &&
        new Date(d.timestamp) > new Date(promo.timestamp)
    );
    if (revert) revertedPromotions++;
  }

  const promotionRetentionRate = promotions.length > 0
    ? (promotions.length - revertedPromotions) / promotions.length
    : 1;

  // Demotion rate (per 30 days)
  const timestamps = transitions.map((t) => new Date(t.timestamp).getTime());
  const timeSpanDays = timestamps.length >= 2
    ? (Math.max(...timestamps) - Math.min(...timestamps)) / (1000 * 60 * 60 * 24)
    : 30;
  const demotionRate = timeSpanDays > 0 ? (demotions.length / timeSpanDays) * 30 : 0;

  const score = Math.round(avgQuality * 0.5 + promotionRetentionRate * 30 + Math.max(0, 20 - demotionRate * 10));

  if (avgQuality < 50) gaps.push("Low average transition quality — transitions lack sufficient evidence or duration");
  if (promotionRetentionRate < 0.7) gaps.push("High promotion reversion rate — levels are being assigned prematurely");
  if (demotionRate > 2) gaps.push("High demotion rate — agent performance is unstable");
  if (!transitions.some((t) => t.adversarialTested)) {
    gaps.push("No transitions include adversarial testing — level assignments are untested under pressure");
  }

  const level = score >= 85 ? 5 : score >= 65 ? 4 : score >= 45 ? 3 : score >= 25 ? 2 : score >= 10 ? 1 : 0;

  return { transitions, avgTransitionQuality: avgQuality, promotionRetentionRate, demotionRate, score, level, gaps };
}

/**
 * Scan repo for level transition infrastructure.
 */
export function scanLevelTransitionInfra(root: string): LevelTransitionReport {
  const gaps: string[] = [];
  let infraScore = 0;

  const checks: [string, string, number][] = [
    ["src/score", "Scoring engine for level computation", 15],
    [".amc/evidence", "Evidence storage for transition proof", 15],
    ["src/vault", "Cryptographic vault for signed transitions", 15],
    ["src/mechanic", "Mechanic for upgrade planning", 15],
    ["src/score/claimExpiry.ts", "Evidence decay / claim expiry", 10],
    ["src/assurance", "Adversarial testing for level validation", 10],
    ["src/score/confidenceDrift.ts", "Drift detection for demotion triggers", 10],
    ["src/fleet", "Fleet-level transition tracking", 10],
  ];

  for (const [path, desc, points] of checks) {
    if (existsSync(join(root, path))) {
      infraScore += points;
    } else {
      gaps.push(`Missing: ${desc}`);
    }
  }

  const level = infraScore >= 90 ? 5 : infraScore >= 70 ? 4 : infraScore >= 50 ? 3 : infraScore >= 30 ? 2 : infraScore >= 10 ? 1 : 0;

  return {
    transitions: [],
    avgTransitionQuality: infraScore,
    promotionRetentionRate: 0,
    demotionRate: 0,
    score: infraScore,
    level,
    gaps,
  };
}
