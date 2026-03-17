import { describe, expect, it } from "vitest";
import {
  evaluateSimulationLane,
  isSimulationLaneActive,
  getSimulationLaneQuestionIds,
} from "../src/lanes/simulationForecastLane.js";

describe("simulationForecastLane", () => {
  describe("isSimulationLaneActive", () => {
    it("returns true for simulation-engine", () => {
      expect(isSimulationLaneActive("simulation-engine")).toBe(true);
    });

    it("returns true for forecast-decision-support", () => {
      expect(isSimulationLaneActive("forecast-decision-support")).toBe(true);
    });

    it("returns true for synthetic-social-environment", () => {
      expect(isSimulationLaneActive("synthetic-social-environment")).toBe(true);
    });

    it("returns false for task-agent", () => {
      expect(isSimulationLaneActive("task-agent")).toBe(false);
    });

    it("returns false for orchestrated-workflow", () => {
      expect(isSimulationLaneActive("orchestrated-workflow")).toBe(false);
    });

    it("returns false for null/undefined", () => {
      expect(isSimulationLaneActive(null)).toBe(false);
      expect(isSimulationLaneActive(undefined)).toBe(false);
    });
  });

  describe("getSimulationLaneQuestionIds", () => {
    it("returns 57 question IDs", () => {
      const ids = getSimulationLaneQuestionIds();
      expect(ids).toHaveLength(57);
    });

    it("all IDs match AMC-6.x format", () => {
      const ids = getSimulationLaneQuestionIds();
      for (const id of ids) {
        expect(id).toMatch(/^AMC-6\.\d+$/);
      }
    });

    it("covers 6.1 through 6.57", () => {
      const ids = getSimulationLaneQuestionIds();
      expect(ids[0]).toBe("AMC-6.1");
      expect(ids[56]).toBe("AMC-6.57");
    });
  });

  describe("evaluateSimulationLane", () => {
    it("returns inactive report for non-simulation types", () => {
      const report = evaluateSimulationLane("task-agent", {});
      expect(report.active).toBe(false);
      expect(report.overallScore).toBe(0);
      expect(report.allGaps).toContain("Simulation & Forecast lane is not active for this system type");
    });

    it("returns active report with zero scores for no responses", () => {
      const report = evaluateSimulationLane("simulation-engine", {});
      expect(report.active).toBe(true);
      expect(report.systemType).toBe("simulation-engine");
      expect(report.overallScore).toBe(0);
      expect(report.overallLevel).toBe(0);
      expect(report.coverage.answered).toBe(0);
      expect(report.coverage.total).toBe(57);
    });

    it("computes weighted overall score from dimension scores", () => {
      // Full responses across all dimensions
      const responses: Record<string, string> = {};
      for (let i = 1; i <= 57; i++) {
        responses[`AMC-6.${i}`] =
          "Comprehensive implementation with evidence [ev:sim-governance-v3]. " +
          "All scenarios show multiple plausible trajectories with calibrated uncertainty ranges. " +
          "Data is separated by provenance (observed | inferred | simulated) with isolated partitions. " +
          "Synthetic personas are clearly labeled with governance controls. " +
          "Agent populations are diverse to avoid mode collapse. Convergence testing across independent runs. " +
          "Full lineage traces from report to source seed with frozen snapshot replay. " +
          "Privacy controls restrict sensitive attribute inference. " +
          "Simulated agents labeled during dialogue. Contamination alerts on recursive self-confirmation. " +
          "Backtested against historical ground truth with calibration checks. " +
          "Defamation risk controls for real-person representation. " +
          "Safety reminders maintained in post-simulation interaction.";
      }
      const report = evaluateSimulationLane("simulation-engine", responses);
      expect(report.active).toBe(true);
      expect(report.overallScore).toBeGreaterThanOrEqual(30);
      expect(report.coverage.answered).toBeGreaterThan(0);
    });

    it("has 5 dimensions with correct names", () => {
      const report = evaluateSimulationLane("simulation-engine", {});
      expect(report.dimensions.forecastLegitimacy.name).toBe("Forecast Legitimacy");
      expect(report.dimensions.boundaryIntegrity.name).toBe("Boundary Integrity");
      expect(report.dimensions.syntheticIdentity.name).toBe("Synthetic Identity Governance");
      expect(report.dimensions.simulationValidity.name).toBe("Simulation Validity");
      expect(report.dimensions.scenarioProvenance.name).toBe("Scenario Provenance");
    });

    it("dimension weights sum to 1.0", () => {
      const report = evaluateSimulationLane("simulation-engine", {});
      const weightSum = Object.values(report.dimensions).reduce((sum, d) => sum + d.weight, 0);
      expect(Math.abs(weightSum - 1.0)).toBeLessThan(0.001);
    });

    it("produces priority recommendations sorted by weakest dimension", () => {
      const responses: Record<string, string> = {};
      // Only answer forecast legitimacy questions strongly
      for (let i = 1; i <= 10; i++) {
        responses[`AMC-6.${i}`] =
          "Strong scenario-based forecasting with calibrated uncertainty [ev:forecast-v2]. " +
          "Multiple trajectories, backtested, assumption visibility, counterfactual exploration.";
      }
      const report = evaluateSimulationLane("simulation-engine", responses);
      expect(report.priorities.length).toBeGreaterThan(0);
      expect(report.priorities.length).toBeLessThanOrEqual(3);
    });

    it("reports correct coverage percentage", () => {
      const responses: Record<string, string> = {};
      // Answer exactly 10 out of 57
      for (let i = 1; i <= 10; i++) {
        responses[`AMC-6.${i}`] =
          "Scenario-based forecasts with uncertainty ranges and calibrated confidence [ev:fc-v1].";
      }
      const report = evaluateSimulationLane("simulation-engine", responses);
      expect(report.coverage.answered).toBe(10);
      expect(report.coverage.total).toBe(57);
      expect(report.coverage.percentage).toBe(Math.round((10 / 57) * 100));
    });
  });
});
