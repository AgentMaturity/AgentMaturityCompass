/**
 * Per-action effect bands used by the mechanic simulator.
 *
 * These are HAND-CHOSEN CONSTANTS, not measurements or fitted estimates. No
 * historical outcome data informs them, so a simulation reports "applying this
 * action would move maturity by X" purely from the table below. The simulator
 * surfaces this through its honesty notes and refuses to project at all when
 * evidence is insufficient; treat the numbers as directional, not predictive.
 */

import type { MechanicActionKind } from "./upgradePlanSchema.js";

interface EffectShape {
  evidenceCoverageDelta: number;
  maturity: { low: number; mid: number; high: number };
  risk: { low: number; mid: number; high: number };
  value: { low: number; mid: number; high: number };
  tradeoffs: string[];
}

const EFFECTS: Record<MechanicActionKind, EffectShape> = {
  POLICY_PACK_APPLY: {
    evidenceCoverageDelta: 0.02,
    maturity: { low: 0.0, mid: 0.1, high: 0.2 },
    risk: { low: -1, mid: -3, high: -5 },
    value: { low: 0, mid: 1, high: 2 },
    tradeoffs: ["Stricter policy may temporarily reduce execution throughput."]
  },
  BUDGETS_APPLY: {
    evidenceCoverageDelta: 0.01,
    maturity: { low: -0.1, mid: 0.0, high: 0.1 },
    risk: { low: -2, mid: -4, high: -6 },
    value: { low: -1, mid: 0, high: 1 },
    tradeoffs: ["Tighter budgets can reduce output volume while improving risk posture."]
  },
  TOOLS_APPLY: {
    evidenceCoverageDelta: 0.03,
    maturity: { low: 0.0, mid: 0.15, high: 0.25 },
    risk: { low: -1, mid: -2, high: -4 },
    value: { low: 0, mid: 1, high: 2 },
    tradeoffs: ["Tool restrictions can block unsupported flows until policies are tuned."]
  },
  APPROVAL_POLICY_APPLY: {
    evidenceCoverageDelta: 0.01,
    maturity: { low: 0.0, mid: 0.1, high: 0.2 },
    risk: { low: -2, mid: -5, high: -8 },
    value: { low: -1, mid: 0, high: 1 },
    tradeoffs: ["Approval overhead increases for high-risk classes."]
  },
  PLUGIN_INSTALL: {
    evidenceCoverageDelta: 0.01,
    maturity: { low: -0.1, mid: 0.05, high: 0.2 },
    risk: { low: -1, mid: -2, high: -3 },
    value: { low: 0, mid: 2, high: 4 },
    tradeoffs: ["New plugin content introduces validation and governance overhead."]
  },
  ASSURANCE_RUN: {
    evidenceCoverageDelta: 0.04,
    maturity: { low: 0.0, mid: 0.2, high: 0.35 },
    risk: { low: -2, mid: -4, high: -7 },
    value: { low: 0, mid: 0.5, high: 1.5 },
    tradeoffs: ["Benefits are conditional on passing assurance scenarios."]
  },
  TRANSFORM_PLAN_CREATE: {
    evidenceCoverageDelta: 0.01,
    maturity: { low: 0.0, mid: 0.1, high: 0.2 },
    risk: { low: -1, mid: -2, high: -3 },
    value: { low: 0, mid: 1, high: 2 },
    tradeoffs: ["Planning does not improve measured maturity until execution checkpoints complete."]
  },
  FREEZE_SET: {
    evidenceCoverageDelta: 0.0,
    maturity: { low: -0.2, mid: -0.1, high: 0.0 },
    risk: { low: -3, mid: -6, high: -10 },
    value: { low: -2, mid: -1, high: 0 },
    tradeoffs: ["Execution freezes reduce short-term delivery to protect integrity."]
  },
  BENCH_CREATE: {
    evidenceCoverageDelta: 0.02,
    maturity: { low: 0.0, mid: 0.05, high: 0.1 },
    risk: { low: 0, mid: -1, high: -2 },
    value: { low: 0, mid: 1, high: 2 },
    tradeoffs: ["Benchmarking is a checkpoint and does not auto-raise scores."]
  },
  FORECAST_REFRESH: {
    evidenceCoverageDelta: 0.01,
    maturity: { low: 0.0, mid: 0.0, high: 0.05 },
    risk: { low: -1, mid: -2, high: -3 },
    value: { low: 0, mid: 0.5, high: 1 },
    tradeoffs: ["Forecast refresh improves clarity but depends on evidence quality."]
  }
};

export function aggregateProjectedEffects(kinds: MechanicActionKind[]): EffectShape {
  const base: EffectShape = {
    evidenceCoverageDelta: 0,
    maturity: { low: 0, mid: 0, high: 0 },
    risk: { low: 0, mid: 0, high: 0 },
    value: { low: 0, mid: 0, high: 0 },
    tradeoffs: []
  };
  for (const kind of kinds) {
    const effect = EFFECTS[kind];
    base.evidenceCoverageDelta += effect.evidenceCoverageDelta;
    base.maturity.low += effect.maturity.low;
    base.maturity.mid += effect.maturity.mid;
    base.maturity.high += effect.maturity.high;
    base.risk.low += effect.risk.low;
    base.risk.mid += effect.risk.mid;
    base.risk.high += effect.risk.high;
    base.value.low += effect.value.low;
    base.value.mid += effect.value.mid;
    base.value.high += effect.value.high;
    base.tradeoffs.push(...effect.tradeoffs);
  }
  base.evidenceCoverageDelta = Number(base.evidenceCoverageDelta.toFixed(6));
  base.maturity = {
    low: Number(base.maturity.low.toFixed(6)),
    mid: Number(base.maturity.mid.toFixed(6)),
    high: Number(base.maturity.high.toFixed(6))
  };
  base.risk = {
    low: Number(base.risk.low.toFixed(6)),
    mid: Number(base.risk.mid.toFixed(6)),
    high: Number(base.risk.high.toFixed(6))
  };
  base.value = {
    low: Number(base.value.low.toFixed(6)),
    mid: Number(base.value.mid.toFixed(6)),
    high: Number(base.value.high.toFixed(6))
  };
  base.tradeoffs = [...new Set(base.tradeoffs)].sort((a, b) => a.localeCompare(b));
  return base;
}
