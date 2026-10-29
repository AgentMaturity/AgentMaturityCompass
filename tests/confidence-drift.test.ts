import { describe, it, expect } from "vitest";
import {
  trackConfidenceDrift,
  applyConfidencePenalty,
  type ConfidencePrediction,
} from "../src/score/confidenceDrift.js";

function makePred(overrides: Partial<ConfidencePrediction> = {}): ConfidencePrediction {
  return {
    id: "p-" + Math.random().toString(36).slice(2, 8),
    timestamp: new Date().toISOString(),
    predictedOutcome: "success",
    confidenceLevel: 0.5,
    citationCount: 1,
    ...overrides,
  };
}

describe("trackConfidenceDrift", () => {
  it("empty array returns default result", () => {
    const result = trackConfidenceDrift([]);
    expect(result).toHaveProperty("calibrationScore");
    expect(result).toHaveProperty("driftTrend");
    expect(result).toHaveProperty("overconfidencePenalty");
    expect(result).toHaveProperty("citationlessHighConfidenceRate");
  });

  it("calibrationScore is between 0 and 1 once a prediction is resolved, and null (not 1) on none", () => {
    // WP37: an empty input used to read as perfect calibration (1).
    expect(trackConfidenceDrift([]).calibrationScore).toBeNull();
    const result = trackConfidenceDrift([makePred({ confidenceLevel: 0.7, wasCorrect: true })]);
    expect(result.calibrationScore).toBeGreaterThanOrEqual(0);
    expect(result.calibrationScore).toBeLessThanOrEqual(1);
  });

  it("overconfidencePenalty is non-negative", () => {
    const result = trackConfidenceDrift([]);
    expect(result.overconfidencePenalty).toBeGreaterThanOrEqual(0);
  });

  it("driftTrend is a known value", () => {
    const result = trackConfidenceDrift([]);
    expect(["improving", "stable", "degrading"]).toContain(result.driftTrend);
  });

  it("high citationless rate increases overconfidence penalty", () => {
    const preds = [
      makePred({ confidenceLevel: 0.95, wasCorrect: false, citationCount: 0 }),
      makePred({ confidenceLevel: 0.9, wasCorrect: false, citationCount: 0 }),
      makePred({ confidenceLevel: 0.85, wasCorrect: false, citationCount: 0 }),
    ];
    const result = trackConfidenceDrift(preds);
    expect(result.citationlessHighConfidenceRate).toBeGreaterThan(0);
    expect(result.overconfidencePenalty).toBeGreaterThan(0);
  });

  it("well-calibrated predictions give better calibration score", () => {
    const good = [
      makePred({ confidenceLevel: 0.9, wasCorrect: true, citationCount: 2 }),
      makePred({ confidenceLevel: 0.8, wasCorrect: true, citationCount: 2 }),
      makePred({ confidenceLevel: 0.7, wasCorrect: true, citationCount: 2 }),
    ];
    const bad = [
      makePred({ confidenceLevel: 0.95, wasCorrect: false, citationCount: 0 }),
      makePred({ confidenceLevel: 0.95, wasCorrect: false, citationCount: 0 }),
      makePred({ confidenceLevel: 0.95, wasCorrect: false, citationCount: 0 }),
    ];
    const goodResult = trackConfidenceDrift(good);
    const badResult = trackConfidenceDrift(bad);
    expect(goodResult.calibrationScore).toBeGreaterThanOrEqual(badResult.calibrationScore!);
  });
});

describe("applyConfidencePenalty", () => {
  it("returns a number", () => {
    const profile = trackConfidenceDrift([]);
    const result = applyConfidencePenalty(80, profile);
    expect(typeof result).toBe("number");
  });

  it("zero penalty returns original score", () => {
    const profile = trackConfidenceDrift([]);
    // Empty predictions → zero penalties
    const result = applyConfidencePenalty(80, profile);
    expect(result).toBe(80);
  });

  it("penalty reduces score", () => {
    const preds = [
      makePred({ confidenceLevel: 0.95, wasCorrect: false, citationCount: 0 }),
      makePred({ confidenceLevel: 0.9, wasCorrect: false, citationCount: 0 }),
      makePred({ confidenceLevel: 0.85, wasCorrect: false, citationCount: 0 }),
    ];
    const profile = trackConfidenceDrift(preds);
    const result = applyConfidencePenalty(80, profile);
    expect(result).toBeLessThan(80);
  });

  it("score never goes below 0", () => {
    const preds = Array.from({ length: 20 }, () =>
      makePred({ confidenceLevel: 0.99, wasCorrect: false, citationCount: 0 })
    );
    const profile = trackConfidenceDrift(preds);
    const result = applyConfidencePenalty(5, profile);
    expect(result).toBeGreaterThanOrEqual(0);
  });
});
