import { describe, expect, test } from "vitest";
import {
  generateCombinations,
  analyzeParameterSensitivity,
  buildMatrixRequestBody,
  buildMatrixReport,
  type ParameterRange,
  type MatrixRunResult,
} from "../src/steer/parameterMatrix.js";

describe("generateCombinations", () => {
  test("generates cartesian product of parameter ranges", () => {
    const ranges: ParameterRange[] = [
      { name: "temperature", values: [0.0, 0.5, 1.0] },
      { name: "top_p", values: [0.9, 1.0] },
    ];
    const combos = generateCombinations(ranges);
    expect(combos.length).toBe(6); // 3 * 2
    expect(combos[0]!.params).toHaveProperty("temperature");
    expect(combos[0]!.params).toHaveProperty("top_p");
  });

  test("respects maxCombinations cap", () => {
    const ranges: ParameterRange[] = [
      { name: "temperature", values: [0.0, 0.5, 1.0] },
      { name: "top_p", values: [0.9, 1.0] },
    ];
    const combos = generateCombinations(ranges, 3);
    expect(combos.length).toBe(3);
  });

  test("returns empty for empty ranges", () => {
    expect(generateCombinations([])).toEqual([]);
  });

  test("generates unique IDs for each combination", () => {
    const ranges: ParameterRange[] = [
      { name: "temperature", values: [0.0, 1.0] },
    ];
    const combos = generateCombinations(ranges);
    const ids = combos.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("analyzeParameterSensitivity", () => {
  test("identifies sensitive parameters", () => {
    const results: MatrixRunResult[] = [
      { combinationId: "a", params: { temperature: 0, top_p: 1 }, responseText: "", microScore: 0.9, latencyMs: 0 },
      { combinationId: "b", params: { temperature: 1, top_p: 1 }, responseText: "", microScore: 0.3, latencyMs: 0 },
      { combinationId: "c", params: { temperature: 0, top_p: 0.5 }, responseText: "", microScore: 0.85, latencyMs: 0 },
      { combinationId: "d", params: { temperature: 1, top_p: 0.5 }, responseText: "", microScore: 0.35, latencyMs: 0 },
    ];
    const ranges: ParameterRange[] = [
      { name: "temperature", values: [0, 1] },
      { name: "top_p", values: [0.5, 1] },
    ];
    const sensitivity = analyzeParameterSensitivity(results, ranges);
    // Temperature has much larger effect than top_p
    expect(sensitivity.temperature).toBeGreaterThan(sensitivity.top_p!);
  });
});

describe("buildMatrixRequestBody", () => {
  test("builds a valid request body", () => {
    const combo = { id: "c1", params: { temperature: 0.7, top_p: 0.9 } };
    const body = buildMatrixRequestBody(combo, "What is 2+2?", "gpt-4o");
    expect(body.model).toBe("gpt-4o");
    expect(body.messages).toEqual([{ role: "user", content: "What is 2+2?" }]);
    expect(body.temperature).toBe(0.7);
    expect(body.top_p).toBe(0.9);
  });
});

describe("buildMatrixReport", () => {
  test("produces a report with best/worst and sensitivity", () => {
    const results: MatrixRunResult[] = [
      { combinationId: "a", params: { temperature: 0 }, responseText: "Good answer.", microScore: 0.9, latencyMs: 100 },
      { combinationId: "b", params: { temperature: 1 }, responseText: "Bad answer.", microScore: 0.3, latencyMs: 200 },
      { combinationId: "c", params: { temperature: 0.5 }, responseText: "", microScore: 0, latencyMs: 0, error: "timeout" },
    ];
    const ranges: ParameterRange[] = [{ name: "temperature", values: [0, 0.5, 1] }];
    const report = buildMatrixReport(results, ranges);
    expect(report.totalCombinations).toBe(3);
    expect(report.completed).toBe(2);
    expect(report.failed).toBe(1);
    expect(report.bestCombination!.combinationId).toBe("a");
    expect(report.worstCombination!.combinationId).toBe("b");
    expect(report.averageScore).toBeGreaterThan(0);
    expect(report.parameterSensitivity).toHaveProperty("temperature");
  });
});
