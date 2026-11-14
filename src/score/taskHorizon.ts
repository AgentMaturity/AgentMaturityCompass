/**
 * Autonomy span: how long an agent ran on its own, and whether the controls AMC lists for a run of that length
 * were in place.
 *
 * What this is not: it is not METR's time-horizon measure, it does not measure what an agent is capable of, and a
 * longer run never scores higher. The spans are AMC's own cut-offs, chosen so that longer unattended runs ask for
 * more controls: each span lists every control of the shorter spans plus its own. The score is the share of the
 * listed controls that were in place, and it is capped at what the same controls would score on any shorter run.
 *
 * Inputs are whatever the caller supplies, so the result is self-reported unless the caller took them from records.
 * A span is not a maturity level: the L0 to L5 scale (./maturityTaxonomy.ts) is not used here.
 */

export type AutonomySpanId = "under-1-min" | "1-5-min" | "5-30-min" | "30-min-2-hr" | "2-8-hr" | "8-hr-plus";

export interface TaskHorizonBand {
  span: AutonomySpanId;
  label: string;
  minMinutes: number;
  maxMinutes: number | null;
  governanceRequirements: string[];
}

export const TASK_HORIZON_BANDS: readonly TaskHorizonBand[] = [
  {
    span: "under-1-min",
    label: "Under 1 minute",
    minMinutes: 0,
    maxMinutes: 1,
    governanceRequirements: ["output validation"],
  },
  {
    span: "1-5-min",
    label: "1 to 5 minutes",
    minMinutes: 1,
    maxMinutes: 5,
    governanceRequirements: ["output validation", "tool allowlist"],
  },
  {
    span: "5-30-min",
    label: "5 to 30 minutes",
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
    span: "30-min-2-hr",
    label: "30 minutes to 2 hours",
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
    span: "2-8-hr",
    label: "2 to 8 hours",
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
    span: "8-hr-plus",
    label: "8 hours or more",
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
  /** How long the agent ran, in minutes. */
  taskDurationMinutes: number;
  /** Whether the agent finished without a person stepping in. */
  completedAutonomously: boolean;
  /** Controls in place during the run. */
  activeGovernanceControls: string[];
}

export interface TaskHorizonResult {
  /** The span the run length falls in. */
  span: AutonomySpanId;
  /** Share of the listed controls that were in place, 0 to 100, capped at the share for any shorter span. A longer run never scores higher. */
  score: number;
  band: TaskHorizonBand;
  /** Controls listed for this span that were not in place. */
  missingGovernance: string[];
  /** True when every control listed for this span was in place. */
  governanceSufficient: boolean;
  /** Rises with the run length only when controls are missing. */
  riskLabel: "low" | "medium" | "high" | "critical";
  gaps: string[];
  recommendations: string[];
  /** What the result does not show. */
  notes: string[];
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
  const notes = [
    "Not METR's time-horizon measure and not a measure of capability: it checks controls against run length.",
  ];

  // "basic output validation" was the shortest span's own name for "output validation" before the lists were nested.
  const activeSet = new Set(
    evidence.activeGovernanceControls.map((c) => c.toLowerCase().trim().replace(/^basic output validation$/, "output validation")),
  );
  const missingGovernance = band.governanceRequirements.filter(
    (req) => !activeSet.has(req.toLowerCase().trim()),
  );

  const governanceSufficient = missingGovernance.length === 0;

  // The score is control coverage only. Run length sets which controls are listed; it adds no points, and the
  // running minimum over this span and every shorter one means a longer run never scores higher.
  const required = band.governanceRequirements.length;
  const spanIndex = TASK_HORIZON_BANDS.indexOf(band);
  const coverage = (row: TaskHorizonBand): number =>
    row.governanceRequirements.filter((req) => activeSet.has(req)).length / row.governanceRequirements.length;
  const score = Math.round(Math.min(...TASK_HORIZON_BANDS.slice(0, spanIndex + 1).map(coverage)) * 100);

  let riskLabel: TaskHorizonResult["riskLabel"] = "low";
  if (!governanceSufficient && spanIndex >= 4) riskLabel = "critical";
  else if (!governanceSufficient && spanIndex >= 3) riskLabel = "high";
  else if (!governanceSufficient && spanIndex >= 2) riskLabel = "medium";

  if (!evidence.completedAutonomously) {
    notes.push("A person stepped in during this run, so the span is how long the agent ran, not how long it ran unaided.");
  }
  if (missingGovernance.length > 0) {
    gaps.push(
      `${missingGovernance.length} of the ${required} controls listed for a run of ${band.label.toLowerCase()} were not in place`,
    );
    recommendations.push(
      `Put these controls in place: ${missingGovernance.join(", ")}`,
    );
  }
  if (spanIndex >= 3 && !activeSet.has("rollback capability")) {
    recommendations.push("A run of 30 minutes or more needs a way to undo what the agent did (rollback capability)");
  }
  if (spanIndex >= 4 && !activeSet.has("kill switch")) {
    recommendations.push("A run of 2 hours or more needs a kill switch a person can use to stop it");
  }

  return {
    span: band.span,
    score,
    band,
    missingGovernance,
    governanceSufficient,
    riskLabel,
    gaps,
    recommendations,
    notes,
  };
}
