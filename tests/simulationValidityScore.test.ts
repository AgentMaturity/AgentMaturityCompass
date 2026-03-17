import { describe, expect, it } from "vitest";
import { scoreSimulationValidity, scanSimulationValidityInfrastructure } from "../src/score/simulationValidity.js";

describe("simulationValidity score module", () => {
  it("returns correct structure", () => {
    const report = scoreSimulationValidity({ responses: {} });
    expect(report).toHaveProperty("questionScores");
    expect(report).toHaveProperty("score");
    expect(report).toHaveProperty("level");
    expect(report).toHaveProperty("gaps");
  });

  it("scores 0 with no responses", () => {
    const report = scoreSimulationValidity({ responses: {} });
    expect(report.score).toBe(0);
    expect(report.gaps.some((g) => g.includes("CRITICAL"))).toBe(true);
  });

  it("scores high with strong validity responses", () => {
    const responses: Record<string, string> = {};
    for (let i = 30; i <= 36; i++) {
      responses[`AMC-6.${i}`] =
        "Agent populations are diverse with heterogeneous configurations to avoid mode collapse [ev:diversity-config-v3]. " +
        "Independent runs are compared for convergence and divergence. Seed perturbations test sensitivity. " +
        "Adversarial and counterfactual scenarios are explored. Minority/outlier trajectories are preserved. " +
        "Calibration checks run against known historical cases. Platform-mechanic artifacts are identified and separated.";
    }
    const report = scoreSimulationValidity({ responses });
    expect(report.score).toBeGreaterThanOrEqual(50);
    expect(report.level).toBeGreaterThanOrEqual(3);
  });

  it("flags synthetic consensus risk when no convergence or diversity checks", () => {
    const responses: Record<string, string> = {
      "AMC-6.32": "We test with different seed perturbations for sensitivity analysis.",
      "AMC-6.33": "Adversarial counterfactual scenarios are explored in stress tests.",
    };
    const report = scoreSimulationValidity({ responses });
    expect(report.gaps.some((g) => g.includes("synthetic consensus"))).toBe(true);
  });

  it("does not flag synthetic consensus when convergence is addressed", () => {
    const responses: Record<string, string> = {
      "AMC-6.30": "Diverse heterogeneous agent populations with varied configurations to avoid mode collapse [ev:diversity-check].",
      "AMC-6.31": "Independent runs compared for convergence and divergence across replicated experiments [ev:convergence-report].",
    };
    const report = scoreSimulationValidity({ responses });
    expect(report.gaps.some((g) => g.includes("synthetic consensus"))).toBe(false);
  });

  it("infrastructure scan returns valid report", () => {
    const report = scanSimulationValidityInfrastructure("/nonexistent/path");
    expect(report.score).toBe(0);
    expect(report.gaps.length).toBeGreaterThan(0);
  });
});
