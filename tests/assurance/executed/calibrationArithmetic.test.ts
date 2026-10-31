import { describe, expect, test } from "vitest";
import { calculateConfusion, wilson95 } from "../../../src/assurance/judges/calibration.js";

describe("P2-27 synthetic calibration arithmetic", () => {
  test("computes independently known confusion counts and Wilson bounds", () => {
    const groups = [
      { count: 36, expectedPass: true, predictedPass: true },
      { count: 12, expectedPass: false, predictedPass: true },
      { count: 48, expectedPass: false, predictedPass: false },
      { count: 4, expectedPass: true, predictedPass: false }
    ];
    const pairs = groups.flatMap((group, index) => Array.from({ length: group.count }, (_, i) => ({
      itemId: `synthetic-${index}-${i}`, expectedPass: group.expectedPass, predictedPass: group.predictedPass
    })));
    const result = calculateConfusion(pairs);
    expect(result).not.toBeNull();
    expect(result!.confusion).toEqual({ tp: 36, fp: 12, tn: 48, fn: 4 });
    expect(result!.falsePositiveRate).toBe(0.2);
    expect(result!.falseNegativeRate).toBe(0.1);
    expect(result!.interval95.fpr![0]).toBeCloseTo(0.11828389736858963, 12);
    expect(result!.interval95.fpr![1]).toBeCloseTo(0.3178204609181701, 12);
    expect(result!.interval95.fnr![0]).toBeCloseTo(0.03957888759557487, 12);
    expect(result!.interval95.fnr![1]).toBeCloseTo(0.230520743804739, 12);
  });

  test.each([
    { successes: 0, total: 25, low: 0, high: 0.13319649395317874 },
    { successes: 25, total: 25, low: 0.8668035060468213, high: 1 }
  ])("retains Wilson uncertainty for $successes/$total synthetic attempts", ({ successes, total, low, high }) => {
    const interval = wilson95(successes, total);
    expect(interval).not.toBeNull();
    expect(interval![0]).toBeCloseTo(low, 12);
    expect(interval![1]).toBeCloseTo(high, 12);
  });

  test.each([[0, 0], [-1, 25], [26, 25], [1.5, 25], [1, Infinity], [NaN, 25], ["1", 25]])(
    "keeps invalid or absent samples unknown (%j)", (successes, total) => {
      expect(wilson95(successes, total)).toBeNull();
    }
  );
});
