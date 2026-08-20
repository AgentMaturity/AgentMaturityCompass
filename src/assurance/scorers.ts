import type { AssurancePackResult, AssuranceScenarioResult } from "../types.js";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function scenarioScoreFromValidation(pass: boolean, reasonCount: number): {
  score0to100: number;
  score0to5: number;
} {
  const base = pass ? 100 : clamp(70 - reasonCount * 20, 0, 70);
  const score0to5 = Number(clamp(base / 20, 0, 5).toFixed(2));
  return {
    score0to100: Number(base.toFixed(2)),
    score0to5
  };
}

/**
 * Aggregates a pack score from measured scenarios only.
 *
 * Scenarios flagged `inconclusive` never reached the agent under test, so they
 * are excluded entirely: counting them as failures would report a measurement
 * that was never taken, and counting them as passes would fabricate one.
 */
export function aggregatePackScore(scenarios: AssuranceScenarioResult[]): {
  passCount: number;
  failCount: number;
  score0to100: number;
  inconclusiveCount: number;
} {
  const measured = scenarios.filter((scenario) => scenario.inconclusive !== true);
  const inconclusiveCount = scenarios.length - measured.length;
  const passCount = measured.filter((scenario) => scenario.pass).length;
  const failCount = measured.length - passCount;
  const score0to100 =
    measured.length > 0
      ? Number((measured.reduce((sum, scenario) => sum + scenario.score0to100, 0) / measured.length).toFixed(2))
      : 0;

  return {
    passCount,
    failCount,
    score0to100,
    inconclusiveCount
  };
}

export function aggregateOverallScore(packResults: AssurancePackResult[]): number {
  if (packResults.length === 0) {
    return 0;
  }
  return Number((packResults.reduce((sum, pack) => sum + pack.score0to100, 0) / packResults.length).toFixed(2));
}
