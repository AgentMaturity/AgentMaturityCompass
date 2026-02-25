import { describe, it, expect } from "vitest";
import {
  getMCPAttackTaxonomy,
  analyzeMCPSecurityResilience,
  getMCPSecurityTestCases,
  type MCPSecurityTestResult,
} from "../../src/assurance/packs/mcpSecurityResiliencePack.js";

describe("MCP security resilience pack", () => {
  describe("getMCPAttackTaxonomy", () => {
    it("returns exactly 12 categories", () => {
      const taxonomy = getMCPAttackTaxonomy();
      expect(taxonomy).toHaveLength(12);
    });

    it("each category has a description and mitigations", () => {
      const taxonomy = getMCPAttackTaxonomy();
      for (const entry of taxonomy) {
        expect(entry.category.length).toBeGreaterThan(0);
        expect(entry.description.length).toBeGreaterThan(0);
        expect(entry.mitigations.length).toBeGreaterThan(0);
      }
    });

    it("has unique category names", () => {
      const taxonomy = getMCPAttackTaxonomy();
      const categories = taxonomy.map(t => t.category);
      expect(new Set(categories).size).toBe(categories.length);
    });

    it("includes critical severity categories", () => {
      const taxonomy = getMCPAttackTaxonomy();
      const critical = taxonomy.filter(t => t.severity === "critical");
      expect(critical.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe("getMCPSecurityTestCases", () => {
    it("returns at least 12 test cases", () => {
      const cases = getMCPSecurityTestCases();
      expect(cases.length).toBeGreaterThanOrEqual(12);
    });

    it("covers all 12 taxonomy categories", () => {
      const taxonomy = getMCPAttackTaxonomy();
      const cases = getMCPSecurityTestCases();
      const coveredCategories = new Set(cases.map(c => c.attackCategory));
      for (const entry of taxonomy) {
        expect(coveredCategories.has(entry.category)).toBe(true);
      }
    });

    it("has unique IDs", () => {
      const cases = getMCPSecurityTestCases();
      const ids = cases.map(c => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("each case has a non-empty description", () => {
      const cases = getMCPSecurityTestCases();
      for (const c of cases) {
        expect(c.description.length).toBeGreaterThan(0);
      }
    });

    it("includes critical severity test cases", () => {
      const cases = getMCPSecurityTestCases();
      const critical = cases.filter(c => c.severity === "critical");
      expect(critical.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe("analyzeMCPSecurityResilience", () => {
    it("passes when all attacks are blocked", () => {
      const testCases = getMCPSecurityTestCases();
      const results: MCPSecurityTestResult[] = testCases.map(tc => ({
        testCaseId: tc.id,
        attackBlocked: true,
        detectionMethod: "signature-based",
        falsePositive: false,
      }));

      const result = analyzeMCPSecurityResilience(results);
      expect(result.passed).toBe(true);
      expect(result.passedTests).toBe(testCases.length);
      expect(result.categoriesCovered).toBe(12);
      expect(result.findings.some(f => f.category === "all-blocked")).toBe(true);
      expect(result.findings.some(f => f.category === "full-coverage")).toBe(true);
    });

    it("fails when critical attacks are not blocked", () => {
      const results: MCPSecurityTestResult[] = [
        { testCaseId: "mcp-001", attackBlocked: false, detectionMethod: "none", falsePositive: false }, // critical: tool-poisoning
        { testCaseId: "mcp-002", attackBlocked: true, detectionMethod: "behavioral", falsePositive: false },
      ];

      const result = analyzeMCPSecurityResilience(results);
      expect(result.passed).toBe(false);
      expect(result.findings.some(f => f.category === "unblocked-critical-attacks")).toBe(true);
    });

    it("warns on unblocked high-severity attacks", () => {
      const results: MCPSecurityTestResult[] = [
        { testCaseId: "mcp-005", attackBlocked: false, detectionMethod: "none", falsePositive: false }, // high: shadow-tool-registration
      ];

      const result = analyzeMCPSecurityResilience(results);
      expect(result.findings.some(f => f.category === "unblocked-high-attacks")).toBe(true);
    });

    it("warns on false positives", () => {
      const results: MCPSecurityTestResult[] = [
        { testCaseId: "mcp-001", attackBlocked: true, detectionMethod: "heuristic", falsePositive: true },
        { testCaseId: "mcp-002", attackBlocked: true, detectionMethod: "heuristic", falsePositive: false },
      ];

      const result = analyzeMCPSecurityResilience(results);
      expect(result.findings.some(f => f.category === "false-positives")).toBe(true);
    });

    it("warns on coverage gaps", () => {
      // Only test 2 categories out of 12
      const results: MCPSecurityTestResult[] = [
        { testCaseId: "mcp-001", attackBlocked: true, detectionMethod: "signature", falsePositive: false },
        { testCaseId: "mcp-002", attackBlocked: true, detectionMethod: "signature", falsePositive: false },
      ];

      const result = analyzeMCPSecurityResilience(results);
      expect(result.findings.some(f => f.category === "coverage-gap")).toBe(true);
      expect(result.categoriesCovered).toBe(2);
    });

    it("counts critical attacks blocked correctly", () => {
      const results: MCPSecurityTestResult[] = [
        { testCaseId: "mcp-001", attackBlocked: true, detectionMethod: "sig", falsePositive: false },  // critical
        { testCaseId: "mcp-002", attackBlocked: true, detectionMethod: "sig", falsePositive: false },  // critical
        { testCaseId: "mcp-003", attackBlocked: false, detectionMethod: "none", falsePositive: false }, // critical
        { testCaseId: "mcp-004", attackBlocked: true, detectionMethod: "sig", falsePositive: false },  // critical
      ];

      const result = analyzeMCPSecurityResilience(results);
      expect(result.criticalAttacksBlocked).toBe(3);
    });

    it("generates recommendations for unblocked critical attacks", () => {
      const results: MCPSecurityTestResult[] = [
        { testCaseId: "mcp-001", attackBlocked: false, detectionMethod: "none", falsePositive: false },
      ];

      const result = analyzeMCPSecurityResilience(results);
      expect(result.recommendations.some(r => r.includes("tool-poisoning"))).toBe(true);
    });
  });
});
