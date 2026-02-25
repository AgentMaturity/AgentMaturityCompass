import { describe, it, expect } from "vitest";
import {
  detectAmplificationPattern,
  analyzeEconomicAmplification,
  getEconomicTestCases,
  type EconomicTestResult,
} from "../../src/assurance/packs/economicAmplificationPack.js";

describe("economic amplification pack", () => {
  describe("detectAmplificationPattern", () => {
    it("returns no amplification for normal usage", () => {
      const result = detectAmplificationPattern(5, 10);
      expect(result.amplified).toBe(false);
      expect(result.factor).toBe(0.5);
      expect(result.severity).toBe("none");
    });

    it("returns no amplification at 2x boundary", () => {
      const result = detectAmplificationPattern(20, 10);
      expect(result.amplified).toBe(false);
      expect(result.factor).toBe(2.0);
      expect(result.severity).toBe("none");
    });

    it("detects moderate amplification", () => {
      const result = detectAmplificationPattern(30, 10);
      expect(result.amplified).toBe(true);
      expect(result.factor).toBe(3.0);
      expect(result.severity).toBe("moderate");
    });

    it("detects severe amplification", () => {
      const result = detectAmplificationPattern(80, 10);
      expect(result.amplified).toBe(true);
      expect(result.factor).toBe(8.0);
      expect(result.severity).toBe("severe");
    });

    it("detects critical amplification", () => {
      const result = detectAmplificationPattern(150, 10);
      expect(result.amplified).toBe(true);
      expect(result.factor).toBe(15.0);
      expect(result.severity).toBe("critical");
    });

    it("handles zero expected calls", () => {
      const result = detectAmplificationPattern(5, 0);
      expect(result.amplified).toBe(true);
      expect(result.factor).toBe(Infinity);
      expect(result.severity).toBe("critical");
    });

    it("handles zero actual and zero expected", () => {
      const result = detectAmplificationPattern(0, 0);
      expect(result.amplified).toBe(false);
      expect(result.factor).toBe(1);
      expect(result.severity).toBe("none");
    });
  });

  describe("analyzeEconomicAmplification", () => {
    it("passes when no amplification occurs", () => {
      const results: EconomicTestResult[] = [
        { testCaseId: "econ-001", actualToolCalls: 8, costEstimate: 0.10, wasAmplified: false, wasCapped: false },
        { testCaseId: "econ-002", actualToolCalls: 4, costEstimate: 0.05, wasAmplified: false, wasCapped: false },
      ];

      const result = analyzeEconomicAmplification(results);
      expect(result.passed).toBe(true);
      expect(result.findings.some(f => f.category === "no-amplification")).toBe(true);
    });

    it("fails when amplification is uncapped", () => {
      const results: EconomicTestResult[] = [
        { testCaseId: "econ-001", actualToolCalls: 100, costEstimate: 5.00, wasAmplified: true, wasCapped: false },
        { testCaseId: "econ-002", actualToolCalls: 3, costEstimate: 0.05, wasAmplified: false, wasCapped: false },
      ];

      const result = analyzeEconomicAmplification(results);
      expect(result.passed).toBe(false);
      expect(result.findings.some(f => f.category === "uncapped-amplification")).toBe(true);
    });

    it("passes when amplification is capped", () => {
      const results: EconomicTestResult[] = [
        { testCaseId: "econ-001", actualToolCalls: 15, costEstimate: 0.20, wasAmplified: true, wasCapped: true },
        { testCaseId: "econ-002", actualToolCalls: 4, costEstimate: 0.05, wasAmplified: false, wasCapped: false },
      ];

      const result = analyzeEconomicAmplification(results);
      expect(result.passed).toBe(true);
      expect(result.findings.some(f => f.category === "capped-amplification")).toBe(true);
    });

    it("warns on high cost estimates", () => {
      const results: EconomicTestResult[] = [
        { testCaseId: "econ-001", actualToolCalls: 8, costEstimate: 2.50, wasAmplified: false, wasCapped: false },
        { testCaseId: "econ-002", actualToolCalls: 4, costEstimate: 1.50, wasAmplified: false, wasCapped: false },
      ];

      const result = analyzeEconomicAmplification(results);
      expect(result.findings.some(f => f.category === "high-cost")).toBe(true);
    });

    it("computes max amplification factor", () => {
      const results: EconomicTestResult[] = [
        { testCaseId: "econ-001", actualToolCalls: 50, costEstimate: 1.00, wasAmplified: true, wasCapped: true },
        { testCaseId: "econ-002", actualToolCalls: 3, costEstimate: 0.05, wasAmplified: false, wasCapped: false },
      ];

      const result = analyzeEconomicAmplification(results);
      // econ-001 expected 10, actual 50 → factor 5.0
      expect(result.maxAmplificationFactor).toBe(5.0);
    });

    it("counts passed tests correctly", () => {
      const results: EconomicTestResult[] = [
        { testCaseId: "econ-001", actualToolCalls: 50, costEstimate: 1.00, wasAmplified: true, wasCapped: true },
        { testCaseId: "econ-002", actualToolCalls: 100, costEstimate: 5.00, wasAmplified: true, wasCapped: false },
        { testCaseId: "econ-003", actualToolCalls: 40, costEstimate: 0.50, wasAmplified: false, wasCapped: false },
      ];

      const result = analyzeEconomicAmplification(results);
      // econ-001: amplified but capped → pass. econ-002: amplified uncapped → fail. econ-003: not amplified → pass.
      expect(result.passedTests).toBe(2);
      expect(result.totalTests).toBe(3);
    });
  });

  describe("getEconomicTestCases", () => {
    it("returns at least 6 test cases", () => {
      const cases = getEconomicTestCases();
      expect(cases.length).toBeGreaterThanOrEqual(6);
    });

    it("covers all amplification types", () => {
      const cases = getEconomicTestCases();
      expect(cases.some(c => c.amplificationType === "recursive")).toBe(true);
      expect(cases.some(c => c.amplificationType === "fan_out")).toBe(true);
      expect(cases.some(c => c.amplificationType === "chain")).toBe(true);
      expect(cases.some(c => c.amplificationType === "retry_storm")).toBe(true);
    });

    it("has unique IDs", () => {
      const cases = getEconomicTestCases();
      const ids = cases.map(c => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("all cases have positive expected tool calls", () => {
      const cases = getEconomicTestCases();
      for (const c of cases) {
        expect(c.expectedToolCalls).toBeGreaterThan(0);
      }
    });

    it("all cases have non-empty trigger prompts", () => {
      const cases = getEconomicTestCases();
      for (const c of cases) {
        expect(c.triggerPrompt.length).toBeGreaterThan(0);
      }
    });
  });
});
