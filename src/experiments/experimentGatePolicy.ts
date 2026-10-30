import type { ExperimentReport } from "../types.js";
import type { ExperimentGatePolicy } from "./experimentSchema.js";

export type ExperimentGatePreset = "strict" | "balanced" | "exploratory";

export function experimentGatePolicyPreset(preset: ExperimentGatePreset): ExperimentGatePolicy {
  if (preset === "strict") {
    return {
      minUpliftSuccessRate: 0.03,
      minUpliftValuePoints: 5,
      valueUnit: "points",
      maxCostIncreaseRatio: 1.05,
      denyIfRegression: true
    };
  }
  if (preset === "exploratory") {
    return {
      minUpliftSuccessRate: 0,
      minUpliftValuePoints: 0,
      valueUnit: "points",
      maxCostIncreaseRatio: 1.25,
      denyIfRegression: false
    };
  }
  return {
    minUpliftSuccessRate: 0.01,
    minUpliftValuePoints: 2,
    valueUnit: "points",
    maxCostIncreaseRatio: 1.15,
    denyIfRegression: true
  };
}

/** The paired-case floor below which no gate can pass on an experiment report. */
export const DEFAULT_MIN_PAIRED_CASES = 3;

export type ExperimentGateStatus = "pass" | "fail" | "inconclusive";

const finite = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;

/** Cost ratio, or why it cannot be judged. A zero baseline is not a reason to skip the check. */
function costRatio(report: Record<string, unknown>): { ratio: number } | { unavailable: string } {
  const baseline = finite(report.baselineCostPerSuccess), candidate = finite(report.candidateCostPerSuccess);
  if (baseline === null || candidate === null || baseline < 0 || candidate < 0) return { unavailable: "cost evidence unavailable" };
  if (baseline === 0) return candidate === 0 ? { unavailable: "cost ratio undefined: both costs per success are zero" } : { ratio: Number.POSITIVE_INFINITY };
  return { ratio: candidate / baseline };
}

/**
 * The one experiment gate rule set (AXE-33): `amc experiment gate` and the bundle gate's requireExperimentPass both
 * call this. `fail` is evidence the candidate does not meet policy; `inconclusive` is evidence that cannot decide
 * (legacy unbound report, too few paired cases, insufficient interval, unknown cost). Only `pass` may promote.
 */
export function evaluateExperimentGate(
  input: ExperimentReport | Record<string, unknown>,
  policy: ExperimentGatePolicy & { candidateConfigDigest?: string }
): { status: ExperimentGateStatus; reasons: string[] } {
  const report = input as Record<string, unknown>;
  const failed: string[] = [];
  const inconclusive: string[] = [];
  const side = (value: unknown) => value && typeof value === "object" ? value as Record<string, unknown> : {};
  const baseline = side(report.baseline), candidate = side(report.candidate);
  if (report.schemaVersion !== 2 || typeof baseline.trialId !== "string" || typeof candidate.trialId !== "string") {
    inconclusive.push("legacy or unbound experiment report: case results are not bound to trial and configuration identity");
  } else if (baseline.trialId === candidate.trialId) {
    inconclusive.push("baseline and candidate share one trial identity");
  }
  if (policy.candidateConfigDigest !== undefined && report.candidateConfigDigest !== policy.candidateConfigDigest) {
    failed.push(`candidate configuration digest ${String(report.candidateConfigDigest ?? "missing")} does not match ${policy.candidateConfigDigest}`);
  }
  const comparableValueUnits = (report.valueUnit === undefined || report.valueUnit === "points") && (policy.valueUnit === undefined || policy.valueUnit === "points");
  if (!comparableValueUnits) {
    inconclusive.push("value-point units are not comparable: expected points on a 0..100 scale");
  }
  const counts = side(report.counts);
  // Legacy reports carry no counts: every listed case was scored.
  const paired = finite(counts.pairedCases) ?? (Array.isArray(report.cases) ? report.cases.length : 0);
  const minPaired = policy.minPairedCases ?? DEFAULT_MIN_PAIRED_CASES;
  if (paired < minPaired) inconclusive.push(`${paired} paired case(s); at least ${minPaired} required`);
  const upliftSuccess = finite(report.upliftSuccessRate), upliftValue = finite(report.upliftValuePoints);
  if (upliftSuccess === null) inconclusive.push("upliftSuccessRate missing");
  else if (upliftSuccess < policy.minUpliftSuccessRate) {
    failed.push(`upliftSuccessRate ${upliftSuccess.toFixed(4)} is below ${policy.minUpliftSuccessRate.toFixed(4)}`);
  }
  if (upliftValue === null) inconclusive.push("upliftValuePoints missing");
  else if (comparableValueUnits && upliftValue < policy.minUpliftValuePoints) {
    failed.push(`upliftValuePoints ${upliftValue.toFixed(4)} is below ${policy.minUpliftValuePoints.toFixed(4)}`);
  }
  if (policy.denyIfRegression && ((upliftSuccess ?? 0) < 0 || (comparableValueUnits && (upliftValue ?? 0) < 0))) {
    failed.push("regression detected while denyIfRegression=true");
  }
  if (typeof policy.maxCostIncreaseRatio === "number") {
    const cost = costRatio(report);
    if ("unavailable" in cost) inconclusive.push(cost.unavailable);
    else if (cost.ratio > policy.maxCostIncreaseRatio) {
      failed.push(`cost increase ratio ${cost.ratio.toFixed(4)} exceeds ${policy.maxCostIncreaseRatio.toFixed(4)}`);
    }
  }
  const bounds = Array.isArray(report.confidenceInterval95) ? report.confidenceInterval95.map(finite) : [];
  const interval = bounds.length === 2 && bounds[0] !== null && bounds[1] !== null && bounds[0]! <= bounds[1]! ? bounds as [number, number] : null;
  if (report.schemaVersion === 2 && (report.confidenceStatus !== "estimated" || interval === null)) {
    inconclusive.push("paired confidence interval unavailable (insufficient sample)");
  } else if (policy.requireIntervalAboveZero && !(interval !== null && (interval[0] ?? 0) > 0)) {
    inconclusive.push("paired 95% interval of the value-point difference does not exclude zero");
  }
  // With no paired case the thresholds were computed from nothing, so they cannot show a failure either.
  const status = paired === 0 ? "inconclusive" : failed.length > 0 ? "fail" : inconclusive.length > 0 ? "inconclusive" : "pass";
  return { status, reasons: [...failed, ...inconclusive] };
}

export function experimentGateComparisonRows(report: ExperimentReport, policy: ExperimentGatePolicy): string[] {
  const cost = costRatio(report as unknown as Record<string, unknown>);
  const rows = [
    `- upliftSuccessRate (fraction): ${report.upliftSuccessRate.toFixed(4)} (min ${policy.minUpliftSuccessRate.toFixed(4)})`,
    `- upliftValuePoints (points, 0..100 scale): ${report.upliftValuePoints.toFixed(4)} (min ${policy.minUpliftValuePoints.toFixed(4)})`
  ];
  if (typeof policy.maxCostIncreaseRatio === "number") {
    rows.push(
      `- costIncreaseRatio: ${"unavailable" in cost ? `n/a (${cost.unavailable})` : cost.ratio.toFixed(4)} (max ${policy.maxCostIncreaseRatio.toFixed(4)})`
    );
  }
  rows.push(`- denyIfRegression: ${policy.denyIfRegression === true ? "true" : "false"}`);
  return rows;
}
