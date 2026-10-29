import { describe, expect, test } from "vitest";
import { evaluateExperimentGate, experimentGateComparisonRows, experimentGatePolicyPreset } from "../src/experiments/experimentGatePolicy.js";

describe("experiment gate policy ergonomics", () => {
  test("balanced thresholds use points, not fractions of a point", () => {
    const report = { schemaVersion: 2, valueUnit: "points", baseline: { trialId: "b" }, candidate: { trialId: "c" },
      counts: { pairedCases: 5 }, upliftSuccessRate: 0.1, upliftValuePoints: 0.5,
      baselineCostPerSuccess: 10, candidateCostPerSuccess: 10, confidenceInterval95: [0.1, 0.9], confidenceStatus: "estimated" };
    expect(evaluateExperimentGate(report, experimentGatePolicyPreset("balanced")).status).toBe("fail");
    expect(evaluateExperimentGate({ ...report, upliftValuePoints: 3, baselineCostPerSuccess: 0, candidateCostPerSuccess: 0 }, experimentGatePolicyPreset("balanced")).status).toBe("inconclusive");
    expect(evaluateExperimentGate({ ...report, upliftValuePoints: 3, valueUnit: "fraction" }, experimentGatePolicyPreset("balanced")).status).toBe("inconclusive");
    expect(experimentGateComparisonRows(report as any, experimentGatePolicyPreset("balanced")).join("\n")).toContain("points");
  });

  test("malformed or reversed confidence intervals are inconclusive", () => {
    const report = { schemaVersion: 2, valueUnit: "points", baseline: { trialId: "b" }, candidate: { trialId: "c" },
      counts: { pairedCases: 5 }, upliftSuccessRate: 0.1, upliftValuePoints: 3,
      baselineCostPerSuccess: 10, candidateCostPerSuccess: 10, confidenceStatus: "estimated" };
    for (const confidenceInterval95 of [[], [1], [1, 2, 3], [3, 1], [Number.NaN, 2]]) {
      expect(evaluateExperimentGate({ ...report, confidenceInterval95 }, experimentGatePolicyPreset("balanced")).status).toBe("inconclusive");
    }
  });

  test("incompatible value units cannot establish a value threshold failure or regression", () => {
    const report = { schemaVersion: 2, valueUnit: "fraction", baseline: { trialId: "b" }, candidate: { trialId: "c" },
      counts: { pairedCases: 5 }, upliftSuccessRate: 0.1,
      baselineCostPerSuccess: 10, candidateCostPerSuccess: 10, confidenceInterval95: [0.1, 0.9], confidenceStatus: "estimated" };
    const policy = experimentGatePolicyPreset("balanced");
    expect(evaluateExperimentGate({ ...report, upliftValuePoints: 0.5 }, policy).status).toBe("inconclusive");
    expect(evaluateExperimentGate({ ...report, upliftValuePoints: -0.5 }, policy).status).toBe("inconclusive");
    expect(evaluateExperimentGate({ ...report, upliftValuePoints: 0.5, upliftSuccessRate: -0.1 }, policy).status).toBe("fail");
  });

  test("presets remain deterministic", () => {
    expect(experimentGatePolicyPreset("strict")).toEqual({
      minUpliftSuccessRate: 0.03,
      minUpliftValuePoints: 5,
      valueUnit: "points",
      maxCostIncreaseRatio: 1.05,
      denyIfRegression: true
    });
    expect(experimentGatePolicyPreset("balanced")).toEqual({
      minUpliftSuccessRate: 0.01,
      minUpliftValuePoints: 2,
      valueUnit: "points",
      maxCostIncreaseRatio: 1.15,
      denyIfRegression: true
    });
  });

  test("comparison rows include all threshold lines", () => {
    const report = {
      upliftSuccessRate: 0.015,
      upliftValuePoints: 0.03,
      baselineCostPerSuccess: 2,
      candidateCostPerSuccess: 2.2
    } as {
      upliftSuccessRate: number;
      upliftValuePoints: number;
      baselineCostPerSuccess: number;
      candidateCostPerSuccess: number;
    } as any;

    const lines = experimentGateComparisonRows(report, experimentGatePolicyPreset("balanced"));
    expect(lines).toEqual([
      "- upliftSuccessRate (fraction): 0.0150 (min 0.0100)",
      "- upliftValuePoints (points, 0..100 scale): 0.0300 (min 2.0000)",
      "- costIncreaseRatio: 1.1000 (max 1.1500)",
      "- denyIfRegression: true"
    ]);
  });
});
