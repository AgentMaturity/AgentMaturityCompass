import { describe, expect, test } from "vitest";
import { experimentGateComparisonRows, experimentGatePolicyPreset } from "../src/experiments/experimentGatePolicy.js";

describe("experiment gate policy ergonomics", () => {
  test("presets remain deterministic", () => {
    expect(experimentGatePolicyPreset("strict")).toEqual({
      minUpliftSuccessRate: 0.03,
      minUpliftValuePoints: 0.05,
      maxCostIncreaseRatio: 1.05,
      denyIfRegression: true
    });
    expect(experimentGatePolicyPreset("balanced")).toEqual({
      minUpliftSuccessRate: 0.01,
      minUpliftValuePoints: 0.02,
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
      "- upliftSuccessRate: 0.0150 (min 0.0100)",
      "- upliftValuePoints: 0.0300 (min 0.0200)",
      "- costIncreaseRatio: 1.1000 (max 1.1500)",
      "- denyIfRegression: true"
    ]);
  });
});
