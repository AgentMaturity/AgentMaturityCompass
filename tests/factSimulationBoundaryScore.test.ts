import { describe, expect, it } from "vitest";
import { scoreFactSimulationBoundary, scanFactSimBoundaryInfrastructure } from "../src/score/factSimulationBoundary.js";

describe("factSimulationBoundary score module", () => {
  it("returns correct structure", () => {
    const report = scoreFactSimulationBoundary({ responses: {} });
    expect(report).toHaveProperty("questionScores");
    expect(report).toHaveProperty("boundaryScore");
    expect(report).toHaveProperty("writebackScore");
    expect(report).toHaveProperty("score");
    expect(report).toHaveProperty("level");
    expect(report).toHaveProperty("gaps");
    expect(report).toHaveProperty("evidenceFound");
  });

  it("scores 0 with no responses", () => {
    const report = scoreFactSimulationBoundary({ responses: {} });
    expect(report.score).toBe(0);
    expect(report.level).toBe(0);
    expect(report.gaps.some((g) => g.includes("CRITICAL"))).toBe(true);
  });

  it("scores high with strong boundary + writeback responses", () => {
    const responses: Record<string, string> = {};
    // Boundary questions
    for (let i = 11; i <= 17; i++) {
      responses[`AMC-6.${i}`] =
        "All data is tagged with provenance class (observed | inferred | simulated) and stored in separate partitions [ev:provenance-schema-v3]. " +
        "Users can query only grounded facts via a boundary-filtered API. Writeback controls require approval gates. " +
        "Synthetic artifacts are quarantined and reversible. The UI clearly labels imagined vs observed content.";
    }
    // Writeback questions
    for (let i = 37; i <= 42; i++) {
      responses[`AMC-6.${i}`] =
        "Writeback to persistent memory requires human approval [ev:writeback-policy-v2]. All mutations are tagged as synthetic/inferred/verified. " +
        "Synthetic writebacks are isolated from authoritative memory. Users can rollback post-simulation mutations. " +
        "Contamination alerts fire when generated content becomes future input, preventing recursive self-confirmation loops.";
    }
    const report = scoreFactSimulationBoundary({ responses });
    expect(report.score).toBeGreaterThanOrEqual(50);
    expect(report.boundaryScore).toBeGreaterThanOrEqual(50);
    expect(report.writebackScore).toBeGreaterThanOrEqual(50);
  });

  it("scores low with vague responses", () => {
    const responses: Record<string, string> = {};
    for (let i = 11; i <= 17; i++) {
      responses[`AMC-6.${i}`] = "We handle data management well.";
    }
    const report = scoreFactSimulationBoundary({ responses });
    expect(report.score).toBeLessThan(50);
  });

  it("boundary and writeback sub-scores are independent", () => {
    const responses: Record<string, string> = {};
    // Strong boundary, no writeback
    for (let i = 11; i <= 17; i++) {
      responses[`AMC-6.${i}`] =
        "Data is separated by provenance class with isolated partitions [ev:boundary-schema]. " +
        "Tags classify each node as observed, inferred, or simulated.";
    }
    const report = scoreFactSimulationBoundary({ responses });
    expect(report.boundaryScore).toBeGreaterThan(report.writebackScore);
  });

  it("infrastructure scan returns valid report", () => {
    const report = scanFactSimBoundaryInfrastructure("/nonexistent/path");
    expect(report.score).toBe(0);
    expect(report.gaps.length).toBeGreaterThan(0);
  });
});
