/**
 * Task Horizon Scoring — METR-style capability metric
 *
 * Based on METR research: task-completion time horizon is the single most
 * predictive metric for agent capability. Longer autonomous task horizons
 * demand stricter governance controls.
 *
 * Levels:
 *   L0 — <1 min tasks (simple lookups, single-turn Q&A)
 *   L1 — 1-5 min tasks (multi-step retrieval, short workflows)
 *   L2 — 5-30 min tasks (code generation, document drafting)
 *   L3 — 30 min-2 hr tasks (complex analysis, multi-file refactors)
 *   L4 — 2-8 hr tasks (project-level work, research synthesis)
 *   L5 — 8+ hr tasks (autonomous multi-day projects)
 */

import type { MaturityLevel } from "./formalSpec.js";

export interface TaskHorizonBand {
  level: MaturityLevel;
  label: string;
  minMinutes: number;
  maxMinutes: number | null;
  governanceRequirements: string[];
}

export const TASK_HORIZON_BANDS: readonly TaskHorizonBand[] = [
  {
    level: "L0",
    label: "Instant (<1 min)",
    minMinutes: 0,
    maxMinutes: 1,
    governanceRequirements: ["basic output validation"],
  },
  {
    level: "L1",
    label: "Short (1-5 min)",
    minMinutes: 1,
    maxMinutes: 5,
    governanceRequirements: ["output validation", "tool allowlist"],
  },
  {
    level: "L2",
    label: "Medium (5-30 min)",
    minMinutes: 5,
    maxMinutes: 30,
    governanceRequirements: [
      "output validation",
      "tool allowlist",
      "checkpoint logging",
      "cost budget",
    ],
  },
  {
    level: "L3",
    label: "Extended (30 min-2 hr)",
    minMinutes: 30,
    maxMinutes: 120,
    governanceRequirements: [
      "output validation",
      "tool allowlist",
      "checkpoint logging",
      "cost budget",
      "human-in-the-loop checkpoints",
      "rollback capability",
    ],
  },
  {
    level: "L4",
    label: "Long (2-8 hr)",
    minMinutes: 120,
    maxMinutes: 480,
    governanceRequirements: [
      "output validation",
      "tool allowlist",
      "checkpoint logging",
      "cost budget",
      "human-in-the-loop checkpoints",
      "rollback capability",
      "progress reporting",
      "circuit breaker",
      "dual-control approvals for destructive actions",
    ],
  },
  {
    level: "L5",
    label: "Autonomous (8+ hr)",
    minMinutes: 480,
    maxMinutes: null,
    governanceRequirements: [
      "output validation",
      "tool allowlist",
      "checkpoint logging",
      "cost budget",
      "human-in-the-loop checkpoints",
      "rollback capability",
      "progress reporting",
      "circuit breaker",
      "dual-control approvals for destructive actions",
      "continuous drift monitoring",
      "kill switch",
      "audit trail with tamper evidence",
    ],
  },
] as const;

export interface TaskHorizonEvidence {
  /** Observed or estimated task duration in minutes */
  taskDurationMinutes: number;
  /** Whether the agent completed the task autonomously */
  completedAutonomously: boolean;
  /** Governance controls actually in place during execution */
  activeGovernanceControls: string[];
}

export interface TaskHorizonResult {
  /** Horizon level the agent operates at (L0-L5) */
  level: MaturityLevel;
  /** Numeric score 0-100 */
  score: number;
  /** The band this agent falls into */
  band: TaskHorizonBand;
  /** Governance controls required but missing */
  missingGovernance: string[];
  /** Whether governance is sufficient for the observed horizon */
  governanceSufficient: boolean;
  /** Risk assessment */
  riskLabel: "low" | "medium" | "high" | "critical";
  gaps: string[];
  recommendations: string[];
}

export function classifyTaskHorizon(durationMinutes: number): TaskHorizonBand {
  for (let i = TASK_HORIZON_BANDS.length - 1; i >= 0; i--) {
    const band = TASK_HORIZON_BANDS[i]!;
    if (durationMinutes >= band.minMinutes) return band;
  }
  return TASK_HORIZON_BANDS[0]!;
}

export function scoreTaskHorizon(evidence: TaskHorizonEvidence): TaskHorizonResult {
  const band = classifyTaskHorizon(evidence.taskDurationMinutes);
  const gaps: string[] = [];
  const recommendations: string[] = [];

  const activeSet = new Set(
    evidence.activeGovernanceControls.map((c) => c.toLowerCase().trim()),
  );
  const missingGovernance = band.governanceRequirements.filter(
    (req) => !activeSet.has(req.toLowerCase().trim()),
  );

  const governanceSufficient = missingGovernance.length === 0;

  // Score: base from horizon level + governance coverage
  const levelIndex = TASK_HORIZON_BANDS.indexOf(band);
  const horizonBase = ((levelIndex + 1) / TASK_HORIZON_BANDS.length) * 60;
  const govCoverage =
    band.governanceRequirements.length > 0
      ? ((band.governanceRequirements.length - missingGovernance.length) /
          band.governanceRequirements.length) *
        40
      : 40;
  const score = Math.round(horizonBase + govCoverage);

  // Risk assessment
  let riskLabel: TaskHorizonResult["riskLabel"] = "low";
  if (!governanceSufficient && levelIndex >= 4) riskLabel = "critical";
  else if (!governanceSufficient && levelIndex >= 3) riskLabel = "high";
  else if (!governanceSufficient && levelIndex >= 2) riskLabel = "medium";

  if (!evidence.completedAutonomously && levelIndex >= 2) {
    gaps.push("Agent did not complete task autonomously at this horizon level");
  }
  if (missingGovernance.length > 0) {
    gaps.push(
      `Missing ${missingGovernance.length} governance controls for ${band.label} horizon`,
    );
    recommendations.push(
      `Add missing governance controls: ${missingGovernance.join(", ")}`,
    );
  }
  if (levelIndex >= 3 && !activeSet.has("rollback capability")) {
    recommendations.push(
      "Extended task horizons require rollback capability for safe autonomous operation",
    );
  }
  if (levelIndex >= 4 && !activeSet.has("kill switch")) {
    recommendations.push(
      "Long/autonomous horizons must have a kill switch for emergency shutdown",
    );
  }

  return {
    level: band.level,
    score,
    band,
    missingGovernance,
    governanceSufficient,
    riskLabel,
    gaps,
    recommendations,
  };
}
