import { describe, expect, test } from "vitest";
import {
  computeConfidenceQuality,
  renderConfidenceQualityMarkdown,
  type PredictionOutcome
} from "../src/diagnostic/selfCalibration.js";

describe("self calibration", () => {
  test("computes calibration and confidence-quality metrics", () => {
    const rows: PredictionOutcome[] = [
      { confidence: 0.9, outcome: true },
      { confidence: 0.8, outcome: true },
      { confidence: 0.7, outcome: true },
      { confidence: 0.6, outcome: false },
      { confidence: 0.4, outcome: false },
      { confidence: 0.3, outcome: false },
      { confidence: 0.2, outcome: false },
      { confidence: 0.1, outcome: false }
    ];

    const report = computeConfidenceQuality(rows, { binCount: 4 });

    expect(report.sampleSize).toBe(8);
    expect(report.weightedSampleSize).toBe(8);
    expect(report.accuracy).toBeCloseTo(0.875, 6);
    expect(report.meanConfidence).toBeCloseTo(0.5, 6);
    expect(report.outcomeRate).toBeCloseTo(0.375, 6);
    expect(report.calibrationBias).toBeCloseTo(0.125, 6);
    expect(report.expectedCalibrationError).toBeGreaterThan(0);
    expect(report.maximumCalibrationError).toBeGreaterThan(0);
    expect(report.brierScore).toBeCloseTo(0.1, 6);
    expect(report.qualityLabel).toBe("INSUFFICIENT_DATA");
    expect(report.bins.length).toBeGreaterThan(0);
  });

  test("assigns excellent label to well-calibrated larger sample", () => {
    const rows: PredictionOutcome[] = [];
    for (let i = 0; i < 20; i += 1) rows.push({ confidence: 0.9, outcome: true });
    for (let i = 0; i < 20; i += 1) rows.push({ confidence: 0.1, outcome: false });

    const report = computeConfidenceQuality(rows, { binCount: 10 });

    expect(report.sampleSize).toBe(40);
    expect(report.expectedCalibrationError).toBeCloseTo(0.1, 6);
    expect(report.brierScore).toBeCloseTo(0.01, 6);
    expect(report.logLoss).toBeLessThan(0.2);
    expect(report.qualityLabel).toBe("GOOD");
  });

  test("supports weighted rows and markdown rendering", () => {
    const report = computeConfidenceQuality(
      [
        { confidence: 0.8, outcome: true, weight: 3 },
        { confidence: 0.8, outcome: false, weight: 1 },
        { confidence: 0.2, outcome: false, weight: 4 }
      ],
      { binCount: 5 }
    );

    expect(report.weightedSampleSize).toBe(8);
    expect(report.sharpness).toBe(0.3); // Weighted population SD; the unweighted rows have a different spread.
    expect(report.brierScore).toBeCloseTo(0.115, 6);

    const md = renderConfidenceQualityMarkdown(report);
    expect(md).toContain("# Confidence Quality Report");
    expect(md).toContain("## Reliability bins");
  });

  test("returns empty-safe default for zero rows", () => {
    const report = computeConfidenceQuality([]);
    expect(report.sampleSize).toBe(0);
    expect(report.qualityLabel).toBe("INSUFFICIENT_DATA");
    expect(report.bins).toEqual([]);
  });
});
