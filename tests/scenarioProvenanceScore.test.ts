import { describe, expect, it } from "vitest";
import { scoreScenarioProvenance, scanScenarioProvenanceInfrastructure } from "../src/score/scenarioProvenance.js";

describe("scenarioProvenance score module", () => {
  it("returns correct structure", () => {
    const report = scoreScenarioProvenance({ responses: {} });
    expect(report).toHaveProperty("questionScores");
    expect(report).toHaveProperty("traceabilityScore");
    expect(report).toHaveProperty("interactionScore");
    expect(report).toHaveProperty("score");
    expect(report).toHaveProperty("level");
    expect(report).toHaveProperty("gaps");
  });

  it("scores 0 with no responses", () => {
    const report = scoreScenarioProvenance({ responses: {} });
    expect(report.score).toBe(0);
    expect(report.gaps.some((g) => g.includes("CRITICAL"))).toBe(true);
  });

  it("scores high with strong traceability + interaction responses", () => {
    const responses: Record<string, string> = {};
    for (let i = 26; i <= 29; i++) {
      responses[`AMC-6.${i}`] =
        "Full claim lineage traces from report through simulation to source seed [ev:lineage-engine-v2]. " +
        "Simulation runs are replayable from frozen snapshots with deterministic checkpoint restoration. " +
        "Random seeds, model versions, and prompt versions are captured immutably. Config diffs are visible between runs.";
    }
    for (let i = 53; i <= 57; i++) {
      responses[`AMC-6.${i}`] =
        "Simulated agents are clearly labeled as synthetic during interactive dialogue [ev:dialogue-safety-v1]. " +
        "Provenance boundaries are maintained in conversation — agents don't assert simulated beliefs as facts. " +
        "Users are reminded they're interacting with a simulation. Safety caveats and source links maintained conversationally.";
    }
    const report = scoreScenarioProvenance({ responses });
    expect(report.score).toBeGreaterThanOrEqual(50);
    expect(report.traceabilityScore).toBeGreaterThanOrEqual(50);
    expect(report.interactionScore).toBeGreaterThanOrEqual(50);
  });

  it("traceability and interaction sub-scores are independent", () => {
    const responses: Record<string, string> = {};
    // Only traceability
    for (let i = 26; i <= 29; i++) {
      responses[`AMC-6.${i}`] =
        "Complete lineage from report to source with frozen snapshot replay [ev:trace-v1]. " +
        "Config versions and random seeds captured for reproducibility.";
    }
    const report = scoreScenarioProvenance({ responses });
    expect(report.traceabilityScore).toBeGreaterThan(report.interactionScore);
  });

  it("infrastructure scan returns valid report", () => {
    const report = scanScenarioProvenanceInfrastructure("/nonexistent/path");
    expect(report.score).toBe(0);
    expect(report.gaps.length).toBeGreaterThan(0);
  });
});
