/**
 * AMC-440: Parameter matrix orchestration — run stress tests
 */
import { describe, expect, test, vi } from "vitest";
import {
  executeParameterMatrix,
  renderMatrixReportMarkdown,
} from "../src/steer/parameterMatrix.js";

describe("executeParameterMatrix", () => {
  test("runs all combinations and returns best/worst report", async () => {
    const runner = vi.fn(async (params: Record<string, number>) => {
      const score = params.temperature === 0.2 ? 0.92 : 0.51;
      return {
        responseText: `answer for temperature=${params.temperature}`,
        latencyMs: 50,
        microScore: score,
      };
    });

    const report = await executeParameterMatrix({
      prompt: "Explain recursion",
      model: "gpt-4",
      ranges: [
        { name: "temperature", values: [0.2, 0.8] },
        { name: "top_p", values: [0.9] },
      ],
      runner,
    });

    expect(runner).toHaveBeenCalledTimes(2);
    expect(report.totalCombinations).toBe(2);
    expect(report.completed).toBe(2);
    expect(report.bestCombination?.params.temperature).toBe(0.2);
    expect(report.worstCombination?.params.temperature).toBe(0.8);
  });

  test("captures runner failures without aborting full matrix", async () => {
    const runner = vi.fn(async (params: Record<string, number>) => {
      if (params.temperature === 0.8) {
        throw new Error("timeout");
      }
      return {
        responseText: "good answer",
        latencyMs: 40,
        microScore: 0.88,
      };
    });

    const report = await executeParameterMatrix({
      prompt: "Explain recursion",
      model: "gpt-4",
      ranges: [{ name: "temperature", values: [0.2, 0.8] }],
      runner,
    });

    expect(report.completed).toBe(1);
    expect(report.failed).toBe(1);
    expect(report.results.some((r) => r.error === "timeout")).toBe(true);
  });

  test("respects maxCombinations limit", async () => {
    const runner = vi.fn(async () => ({
      responseText: "ok",
      latencyMs: 10,
      microScore: 0.5,
    }));

    const report = await executeParameterMatrix({
      prompt: "Explain recursion",
      model: "gpt-4",
      ranges: [
        { name: "temperature", values: [0, 0.5, 1] },
        { name: "top_p", values: [0.8, 0.9, 1.0] },
      ],
      maxCombinations: 4,
      runner,
    });

    expect(report.totalCombinations).toBe(4);
    expect(runner).toHaveBeenCalledTimes(4);
  });
});

describe("renderMatrixReportMarkdown", () => {
  test("renders useful markdown summary", async () => {
    const report = await executeParameterMatrix({
      prompt: "Explain recursion",
      model: "gpt-4",
      ranges: [{ name: "temperature", values: [0.2] }],
      runner: async () => ({
        responseText: "good answer",
        latencyMs: 42,
        microScore: 0.88,
      }),
    });

    const markdown = renderMatrixReportMarkdown(report);
    expect(markdown).toContain("Parameter Matrix Report");
    expect(markdown).toContain("Best Combination");
    expect(markdown).toContain("temperature");
    expect(markdown).toContain("0.88");
  });
});
