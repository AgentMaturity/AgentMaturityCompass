import { describe, it, expect } from "vitest";
import {
  evaluateHygienePrecision,
  HEDGE_SAMPLES,
  PREAMBLE_SAMPLES,
  CASUAL_SAMPLES,
} from "../src/steer/research/eval_hygiene_precision.js";

describe("eval_hygiene_precision", () => {
  it("evaluates all three transforms", () => {
    const result = evaluateHygienePrecision();
    expect(result.transforms).toHaveLength(3);
    expect(result.transforms.map((t) => t.transform)).toEqual([
      "hedges",
      "preamble",
      "casual",
    ]);
  });

  it("hedge transform achieves high F1 (> 0.8)", () => {
    const result = evaluateHygienePrecision();
    const hedges = result.transforms.find((t) => t.transform === "hedges")!;
    expect(hedges.f1).toBeGreaterThan(0.8);
    expect(hedges.precision).toBeGreaterThan(0.7);
    expect(hedges.recall).toBeGreaterThan(0.7);
  });

  it("preamble transform achieves high F1 (> 0.8)", () => {
    const result = evaluateHygienePrecision();
    const preamble = result.transforms.find((t) => t.transform === "preamble")!;
    expect(preamble.f1).toBeGreaterThan(0.8);
  });

  it("casual transform achieves high F1 (> 0.8)", () => {
    const result = evaluateHygienePrecision();
    const casual = result.transforms.find((t) => t.transform === "casual")!;
    expect(casual.f1).toBeGreaterThan(0.8);
  });

  it("overall F1 is above 0.8", () => {
    const result = evaluateHygienePrecision();
    expect(result.overallF1).toBeGreaterThan(0.8);
  });

  it("corpus sizes are sufficient", () => {
    expect(HEDGE_SAMPLES.length).toBeGreaterThanOrEqual(15);
    expect(PREAMBLE_SAMPLES.length).toBeGreaterThanOrEqual(10);
    expect(CASUAL_SAMPLES.length).toBeGreaterThanOrEqual(10);
  });

  it("no false positives on clean samples", () => {
    const result = evaluateHygienePrecision();
    for (const t of result.transforms) {
      expect(t.fp).toBe(0);
    }
  });
});
