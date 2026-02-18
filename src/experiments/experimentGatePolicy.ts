import type { ExperimentReport } from "../types.js";
import type { ExperimentGatePolicy } from "./experimentSchema.js";

export type ExperimentGatePreset = "strict" | "balanced" | "exploratory";

export function experimentGatePolicyPreset(preset: ExperimentGatePreset): ExperimentGatePolicy {
  if (preset === "strict") {
    return {
      minUpliftSuccessRate: 0.03,
      minUpliftValuePoints: 0.05,
      maxCostIncreaseRatio: 1.05,
      denyIfRegression: true
    };
  }
  if (preset === "exploratory") {
    return {
      minUpliftSuccessRate: 0,
      minUpliftValuePoints: 0,
      maxCostIncreaseRatio: 1.25,
      denyIfRegression: false
    };
  }
  return {
    minUpliftSuccessRate: 0.01,
    minUpliftValuePoints: 0.02,
    maxCostIncreaseRatio: 1.15,
    denyIfRegression: true
  };
}

export function experimentGateComparisonRows(report: ExperimentReport, policy: ExperimentGatePolicy): string[] {
  const ratio = report.baselineCostPerSuccess > 0 ? report.candidateCostPerSuccess / report.baselineCostPerSuccess : null;
  const rows = [
    `- upliftSuccessRate: ${report.upliftSuccessRate.toFixed(4)} (min ${policy.minUpliftSuccessRate.toFixed(4)})`,
    `- upliftValuePoints: ${report.upliftValuePoints.toFixed(4)} (min ${policy.minUpliftValuePoints.toFixed(4)})`
  ];
  if (typeof policy.maxCostIncreaseRatio === "number") {
    rows.push(
      `- costIncreaseRatio: ${ratio === null ? "n/a (baselineCostPerSuccess=0)" : ratio.toFixed(4)} (max ${policy.maxCostIncreaseRatio.toFixed(4)})`
    );
  }
  rows.push(`- denyIfRegression: ${policy.denyIfRegression === true ? "true" : "false"}`);
  return rows;
}
