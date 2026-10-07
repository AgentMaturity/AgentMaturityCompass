import { describe, expect, test } from "vitest";
import {
  fraction,
  level,
  levelToPercent,
  likert,
  likertToPercent,
  percent,
  percentToFraction,
  percentToLevel
} from "../src/score/units.js";

describe("typed score units (P0-21)", () => {
  test("a Likert answer is an integer 1-5 and nothing else", () => {
    expect(() => likert(6)).toThrow(new RangeError("Likert answer must be an integer 1-5, got 6"));
    expect(() => likert(0)).toThrow(RangeError);
    expect(() => likert(2.5)).toThrow(RangeError);
    expect(() => likert(Number.NaN)).toThrow(RangeError);
    expect(likert(3)).toBe(3);
  });

  test("percent, level and fraction reject values outside their range", () => {
    expect(() => percent(-1)).toThrow(new RangeError("Percent must be a number 0-100, got -1"));
    expect(() => percent(100.1)).toThrow(RangeError);
    expect(() => percent(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => level(7)).toThrow(new RangeError("Level must be an integer 0-5, got 7"));
    expect(() => level(2.5)).toThrow(RangeError);
    expect(() => fraction(1.5)).toThrow(new RangeError("Fraction must be a number 0-1, got 1.5"));
    expect(percent(72.5)).toBe(72.5);
    expect(level(0)).toBe(0);
    expect(fraction(0.75)).toBe(0.75);
  });

  test("conversions are explicit", () => {
    expect(likertToPercent(likert(5))).toBe(100);
    expect(likertToPercent(likert(1))).toBe(0);
    expect(likertToPercent(likert(3))).toBe(50);
    expect(levelToPercent(level(4))).toBe(80);
    expect(percentToFraction(percent(75))).toBe(0.75);
  });

  test("percentToLevel is the one level table: L2 starts at 30", () => {
    const table: Array<[number, number]> = [
      [0, 1], [29.9, 1], [30, 2], [54.9, 2], [55, 3], [74.9, 3], [75, 4], [89.9, 4], [90, 5], [100, 5]
    ];
    for (const [p, expected] of table) {
      expect(percentToLevel(percent(p)), `percent ${p}`).toBe(expected);
    }
  });
});
