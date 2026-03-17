import { describe, expect, it } from "vitest";
import { scoreForecastLegitimacy, scanForecastLegitimacyInfrastructure } from "../src/score/forecastLegitimacy.js";

describe("forecastLegitimacy score module", () => {
  it("returns correct structure with all fields", () => {
    const report = scoreForecastLegitimacy({ responses: {} });
    expect(report).toHaveProperty("questionScores");
    expect(report).toHaveProperty("score");
    expect(report).toHaveProperty("level");
    expect(report).toHaveProperty("gaps");
    expect(report).toHaveProperty("evidenceFound");
    expect(typeof report.score).toBe("number");
    expect(typeof report.level).toBe("number");
    expect(Array.isArray(report.gaps)).toBe(true);
  });

  it("scores 0 with no responses", () => {
    const report = scoreForecastLegitimacy({ responses: {} });
    expect(report.score).toBe(0);
    expect(report.level).toBe(0);
    expect(report.gaps.length).toBeGreaterThan(0);
    expect(report.gaps.some((g) => g.includes("CRITICAL"))).toBe(true);
  });

  it("scores high with strong evidence-based responses", () => {
    const responses: Record<string, string> = {};
    for (let i = 1; i <= 10; i++) {
      responses[`AMC-6.${i}`] =
        "Our system presents forecasts as scenarios with explicit uncertainty ranges [ev:forecast-calibration-v2]. " +
        "Multiple plausible trajectories are generated and backtested against historical data with calibrated confidence intervals. " +
        "Assumptions are documented and visible to users. We distinguish evidence-backed inference from generated narrative. " +
        "False precision is avoided through range-based reporting. Counterfactual scenarios are generated to prevent confirmation bias.";
    }
    const report = scoreForecastLegitimacy({ responses });
    expect(report.score).toBeGreaterThanOrEqual(50);
    expect(report.level).toBeGreaterThanOrEqual(3);
  });

  it("scores low with vague responses", () => {
    const responses: Record<string, string> = {};
    for (let i = 1; i <= 10; i++) {
      responses[`AMC-6.${i}`] = "We handle forecasting appropriately with good practices.";
    }
    const report = scoreForecastLegitimacy({ responses });
    expect(report.score).toBeLessThan(50);
  });

  it("penalizes deterministic language", () => {
    const responses: Record<string, string> = {
      "AMC-6.1": "Our model will definitely predict with certainty what happens. The outcome is guaranteed.",
    };
    const report = scoreForecastLegitimacy({ responses });
    expect(report.questionScores["AMC-6.1"]).toBeLessThan(0.5);
  });

  it("awards bonus for evidence refs", () => {
    const withEvidence: Record<string, string> = {
      "AMC-6.4": "Our calibration system [ev:cal-v1] tracks accuracy [ev:accuracy-report] over time with backtested results.",
    };
    const withoutEvidence: Record<string, string> = {
      "AMC-6.4": "Our calibration system tracks accuracy over time with backtested results.",
    };
    const reportWith = scoreForecastLegitimacy({ responses: withEvidence });
    const reportWithout = scoreForecastLegitimacy({ responses: withoutEvidence });
    expect(reportWith.questionScores["AMC-6.4"]).toBeGreaterThanOrEqual(
      reportWithout.questionScores["AMC-6.4"]!
    );
    expect(reportWith.evidenceFound.length).toBeGreaterThan(0);
  });

  it("partial responses produce partial scores", () => {
    const responses: Record<string, string> = {
      "AMC-6.1": "We present scenarios with uncertainty ranges and multiple plausible trajectories [ev:scenario-framework].",
      "AMC-6.2": "Explicit confidence intervals are shown with calibrated ranges.",
      "AMC-6.3": "Multiple scenario branches are generated including counterfactual paths.",
    };
    const report = scoreForecastLegitimacy({ responses });
    expect(report.score).toBeGreaterThan(0);
    expect(report.score).toBeLessThan(100);
    // Should note unanswered questions
    expect(report.gaps.some((g) => g.includes("AMC-6.4"))).toBe(true);
  });

  it("infrastructure scan returns valid report", () => {
    const report = scanForecastLegitimacyInfrastructure("/nonexistent/path");
    expect(report.score).toBe(0);
    expect(report.level).toBe(0);
    expect(report.gaps.length).toBeGreaterThan(0);
  });
});
