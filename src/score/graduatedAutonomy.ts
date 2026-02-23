/**
 * Graduated Autonomy Governance — Confidence-based escalation model
 *
 * Based on Anthropic's autonomy research: agents naturally progress from
 * supervised → semi-autonomous → autonomous. This module models that
 * progression with confidence-based governance escalation.
 *
 * Modes:
 *   SUPERVISED   — All actions require human approval
 *   GUIDED       — Low-risk actions auto-approved, high-risk need approval
 *   AUTONOMOUS   — Agent acts independently within policy bounds
 *   FULL_AUTO    — Agent acts with post-hoc audit only (highest maturity)
 *
 * Transitions require sustained evidence of competence at current level.
 */

import type { MaturityLevel } from "./formalSpec.js";

export type AutonomyMode = "SUPERVISED" | "GUIDED" | "AUTONOMOUS" | "FULL_AUTO";

export interface AutonomyTransitionRule {
  from: AutonomyMode;
  to: AutonomyMode;
  requiredMaturityLevel: MaturityLevel;
  minDaysAtCurrentLevel: number;
  requiredSuccessRate: number;
  requiredMinActions: number;
  description: string;
}

export interface AutonomyState {
  currentMode: AutonomyMode;
  maturityLevel: MaturityLevel;
  daysAtCurrentLevel: number;
  successRate: number;
  totalActions: number;
  eligibleTransitions: AutonomyTransitionRule[];
  riskOverrides: RiskOverride[];
}

export interface RiskOverride {
  domain: string;
  maxMode: AutonomyMode;
  reason: string;
}

export interface AutonomyAssessment {
  currentMode: AutonomyMode;
  recommendedMode: AutonomyMode;
  canEscalate: boolean;
  canDeescalate: boolean;
  escalationBlockers: string[];
  deescalationTriggers: string[];
  confidenceScore: number;
  riskAdjustedMode: AutonomyMode;
}

export const AUTONOMY_TRANSITIONS: readonly AutonomyTransitionRule[] = [
  {
    from: "SUPERVISED",
    to: "GUIDED",
    requiredMaturityLevel: "L2",
    minDaysAtCurrentLevel: 7,
    requiredSuccessRate: 0.90,
    requiredMinActions: 50,
    description: "Agent demonstrates consistent safe behavior under supervision",
  },
  {
    from: "GUIDED",
    to: "AUTONOMOUS",
    requiredMaturityLevel: "L3",
    minDaysAtCurrentLevel: 14,
    requiredSuccessRate: 0.95,
    requiredMinActions: 200,
    description: "Agent handles low-risk actions reliably, ready for policy-bounded autonomy",
  },
  {
    from: "AUTONOMOUS",
    to: "FULL_AUTO",
    requiredMaturityLevel: "L4",
    minDaysAtCurrentLevel: 30,
    requiredSuccessRate: 0.98,
    requiredMinActions: 500,
    description: "Agent operates within policy with near-zero incidents, eligible for post-hoc audit",
  },
];

const DEESCALATION_TRIGGERS = [
  { condition: "successRate < 0.85", action: "Drop one level immediately" },
  { condition: "securityIncident", action: "Drop to SUPERVISED immediately" },
  { condition: "policyViolation", action: "Drop to SUPERVISED, require manual review" },
  { condition: "assurancePackFailure", action: "Drop one level, re-run assurance" },
];

const DOMAIN_RISK_CAPS: Record<string, AutonomyMode> = {
  healthcare: "GUIDED",
  finance: "GUIDED",
  legal: "AUTONOMOUS",
  infrastructure: "AUTONOMOUS",
  "code-generation": "FULL_AUTO",
  "content-creation": "FULL_AUTO",
  "data-analysis": "FULL_AUTO",
};

export function assessAutonomy(
  currentMode: AutonomyMode,
  maturityLevel: MaturityLevel,
  daysAtLevel: number,
  successRate: number,
  totalActions: number,
  domain?: string,
): AutonomyAssessment {
  const eligible = AUTONOMY_TRANSITIONS.filter(
    (t) =>
      t.from === currentMode &&
      compareLevels(maturityLevel, t.requiredMaturityLevel) >= 0 &&
      daysAtLevel >= t.minDaysAtCurrentLevel &&
      successRate >= t.requiredSuccessRate &&
      totalActions >= t.requiredMinActions,
  );

  const blockers: string[] = [];
  const nextTransition = AUTONOMY_TRANSITIONS.find((t) => t.from === currentMode);

  if (nextTransition && eligible.length === 0) {
    if (compareLevels(maturityLevel, nextTransition.requiredMaturityLevel) < 0)
      blockers.push(`Maturity ${maturityLevel} < required ${nextTransition.requiredMaturityLevel}`);
    if (daysAtLevel < nextTransition.minDaysAtCurrentLevel)
      blockers.push(`${daysAtLevel}d at level < required ${nextTransition.minDaysAtCurrentLevel}d`);
    if (successRate < nextTransition.requiredSuccessRate)
      blockers.push(`Success rate ${(successRate * 100).toFixed(1)}% < required ${(nextTransition.requiredSuccessRate * 100).toFixed(1)}%`);
    if (totalActions < nextTransition.requiredMinActions)
      blockers.push(`${totalActions} actions < required ${nextTransition.requiredMinActions}`);
  }

  const deescalationTriggers: string[] = [];
  if (successRate < 0.85) deescalationTriggers.push("Success rate below 85% — recommend de-escalation");
  if (successRate < 0.70) deescalationTriggers.push("Success rate critical — drop to SUPERVISED");

  const recommendedMode = eligible.length > 0 ? eligible[0]!.to : currentMode;

  const domainCap = domain ? DOMAIN_RISK_CAPS[domain] : undefined;
  const riskAdjustedMode = domainCap
    ? modeMin(recommendedMode, domainCap)
    : recommendedMode;

  const canDeescalate = deescalationTriggers.length > 0;

  return {
    currentMode,
    recommendedMode,
    canEscalate: eligible.length > 0 && riskAdjustedMode !== currentMode,
    canDeescalate,
    escalationBlockers: blockers,
    deescalationTriggers,
    confidenceScore: Math.min(successRate * (totalActions / 100), 1.0),
    riskAdjustedMode,
  };
}

export function getDeescalationTriggers(): typeof DEESCALATION_TRIGGERS {
  return DEESCALATION_TRIGGERS;
}

export function getDomainRiskCap(domain: string): AutonomyMode | undefined {
  return DOMAIN_RISK_CAPS[domain];
}

const MODE_ORDER: AutonomyMode[] = ["SUPERVISED", "GUIDED", "AUTONOMOUS", "FULL_AUTO"];

function modeMin(a: AutonomyMode, b: AutonomyMode): AutonomyMode {
  return MODE_ORDER.indexOf(a) <= MODE_ORDER.indexOf(b) ? a : b;
}

function compareLevels(a: MaturityLevel, b: MaturityLevel): number {
  const order = ["L0", "L1", "L2", "L3", "L4", "L5"];
  return order.indexOf(a) - order.indexOf(b);
}
