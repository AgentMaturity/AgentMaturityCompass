/**
 * tests/continuousRedTeam.test.ts
 * Unit tests for src/shield/continuousRedTeam.ts
 */

import { describe, it, expect } from "vitest";
import {
  ContinuousRedTeam,
  type RedTeamConfig,
  type RedTeamReport,
} from "../src/shield/continuousRedTeam.js";

function makeMinimalConfig(overrides?: Partial<RedTeamConfig>): RedTeamConfig {
  return {
    intervalMs: 60000,
    attacksPerRound: 5,
    maxEvolutionDepth: 3,
    regressionAlertThreshold: 0.2,
    targetProfiles: [],
    enableAutoEscalation: false,
    independentRatio: 0.6,
    mutationRate: 0.3,
    crossoverRate: 0.2,
    elitePoolSize: 50,
    ...overrides,
  };
}

describe("ContinuousRedTeam constructor", () => {
  it("should construct with minimal config", () => {
    const rt = new ContinuousRedTeam(makeMinimalConfig());
    expect(rt).toBeDefined();
  });

  it("should apply default values for optional fields", () => {
    const rt = new ContinuousRedTeam({
      intervalMs: 5000,
      attacksPerRound: 3,
      maxEvolutionDepth: 2,
      regressionAlertThreshold: 0.15,
      targetProfiles: [],
      enableAutoEscalation: false,
      independentRatio: 0.6,
      mutationRate: 0.3,
      crossoverRate: 0.2,
      elitePoolSize: 50,
    });
    expect(rt).toBeDefined();
  });

  it("should be an EventEmitter", () => {
    const rt = new ContinuousRedTeam(makeMinimalConfig());
    expect(typeof rt.on).toBe("function");
    expect(typeof rt.emit).toBe("function");
  });
});

describe("generateReport", () => {
  it("should return a RedTeamReport with all required fields", () => {
    const rt = new ContinuousRedTeam(makeMinimalConfig());
    const report: RedTeamReport = rt.generateReport();
    expect(report).toHaveProperty("id");
    expect(report).toHaveProperty("generatedAt");
    expect(report).toHaveProperty("totalRounds");
    expect(report).toHaveProperty("totalAttacks");
    expect(report).toHaveProperty("overallSuccessRate");
    expect(report).toHaveProperty("trendDirection");
    expect(report).toHaveProperty("criticalFindings");
    expect(report).toHaveProperty("evolutionInsights");
    expect(report).toHaveProperty("recommendedRemediations");
    expect(report).toHaveProperty("trendPValue");
  });

  it("should have a unique string id for each report", () => {
    const rt = new ContinuousRedTeam(makeMinimalConfig());
    const r1 = rt.generateReport();
    const r2 = rt.generateReport();
    expect(r1.id).toBeTruthy();
    expect(r2.id).toBeTruthy();
    expect(r1.id).not.toBe(r2.id);
  });

  it("overallSuccessRate should be between 0 and 1", () => {
    const rt = new ContinuousRedTeam(makeMinimalConfig());
    const report = rt.generateReport();
    expect(report.overallSuccessRate).toBeGreaterThanOrEqual(0);
    expect(report.overallSuccessRate).toBeLessThanOrEqual(1);
  });

  it("trendDirection should be one of improving/stable/degrading", () => {
    const rt = new ContinuousRedTeam(makeMinimalConfig());
    const report = rt.generateReport();
    expect(["improving", "stable", "degrading"]).toContain(report.trendDirection);
  });

  it("criticalFindings should be an array", () => {
    const rt = new ContinuousRedTeam(makeMinimalConfig());
    const report = rt.generateReport();
    expect(Array.isArray(report.criticalFindings)).toBe(true);
  });

  it("recommendedRemediations should be a non-empty array", () => {
    const rt = new ContinuousRedTeam(makeMinimalConfig());
    const report = rt.generateReport();
    expect(Array.isArray(report.recommendedRemediations)).toBe(true);
    expect(report.recommendedRemediations.length).toBeGreaterThan(0);
  });

  it("should generate report for a specific targetId", () => {
    const rt = new ContinuousRedTeam(makeMinimalConfig());
    const report = rt.generateReport("specific-target");
    expect(report).toHaveProperty("totalRounds");
    expect(report.totalRounds).toBe(0); // no rounds run yet
  });

  it("totalRounds and totalAttacks should start at 0 (no rounds run)", () => {
    const rt = new ContinuousRedTeam(makeMinimalConfig());
    const report = rt.generateReport();
    expect(report.totalRounds).toBe(0);
    expect(report.totalAttacks).toBe(0);
  });

  it("generatedAt should be a recent timestamp", () => {
    const before = Date.now();
    const rt = new ContinuousRedTeam(makeMinimalConfig());
    const report = rt.generateReport();
    const after = Date.now();
    expect(report.generatedAt).toBeGreaterThanOrEqual(before);
    expect(report.generatedAt).toBeLessThanOrEqual(after);
  });
});
