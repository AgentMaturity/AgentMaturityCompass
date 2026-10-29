import { describe, expect, it } from "vitest";
import { assessProductionReadiness } from "../src/score/productionReadiness.js";
import { scoreOperationalIndependence } from "../src/score/operationalIndependence.js";
import { getEvidenceCoverageReport } from "../src/score/evidenceCoverageGap.js";
import { getLeanAMCProfile } from "../src/score/leanAMC.js";

describe("advanced scoring modules", () => {
  it("returns structured production readiness result", () => {
    const result = assessProductionReadiness("agent-1", { strictMode: false });
    expect(result).toMatchObject({
      ready: expect.any(Boolean),
      score: expect.any(Number),
      gates: expect.any(Array),
      blockers: expect.any(Array),
      recommendations: expect.any(Array)
    });
    expect(result.gates.length).toBeGreaterThanOrEqual(6);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("returns valid operational independence score", () => {
    const result = scoreOperationalIndependence("agent-1", 30);

    expect(result).toMatchObject({
      score: null,
      outcome: "not_evaluated",
      sampleSize: 0,
      longestRunDays: expect.any(Number),
      escalationRate: null,
      driftEvents: expect.any(Number),
      qualityHeld: expect.any(Boolean)
    });

    expect(result.score).toBeNull();
    expect(result.longestRunDays).toBeGreaterThanOrEqual(0);
    expect(result.escalationRate).toBeNull();
    expect(result.driftEvents).toBeGreaterThanOrEqual(0);
  });

  it("returns evidence coverage numbers", () => {
    const result = getEvidenceCoverageReport("agent-1");

    expect(result).toMatchObject({
      totalQIDs: expect.any(Number),
      automatedCoverage: expect.any(Number),
      manualRequired: expect.any(Number),
      coveragePercent: expect.any(Number),
      automatedQIDs: expect.any(Array),
      manualQIDs: expect.any(Array),
      improvementPlan: expect.any(Array)
    });
    expect(result.totalQIDs).toBeGreaterThan(0);
    expect(result.automatedCoverage + result.manualRequired).toBe(result.totalQIDs);
  });

  it("lean profile exposes required modules", () => {
    const result = getLeanAMCProfile();

    expect(result.requiredModules.length).toBeGreaterThan(0);
    expect(result.skippableModules.length).toBeGreaterThan(0);
    expect(result.maximumAchievableLevel).toBeGreaterThanOrEqual(0);
    expect(result.maximumAchievableLevel).toBeLessThanOrEqual(5);
  });
});
