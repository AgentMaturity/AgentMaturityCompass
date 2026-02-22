import { describe, expect, test } from "vitest";
import { questionBank } from "../src/diagnostic/questionBank.js";

describe("question bank", () => {
  test("has exactly 91 questions", () => {
    expect(questionBank).toHaveLength(91);
  });

  test("has expected layer distribution 15/18/20/16/22", () => {
    const counts = questionBank.reduce<Record<string, number>>((acc, q) => {
      acc[q.layerName] = (acc[q.layerName] ?? 0) + 1;
      return acc;
    }, {});

    expect(counts).toEqual({
      "Strategic Agent Operations": 15,
      "Leadership & Autonomy": 18,
      "Culture & Alignment": 20,
      Resilience: 16,
      Skills: 22
    });
  });

  test("each question has six options levels 0..5 and six gates", () => {
    for (const question of questionBank) {
      expect(question.options).toHaveLength(6);
      expect(question.gates).toHaveLength(6);

      const optionLevels = question.options.map((o) => o.level);
      const gateLevels = question.gates.map((g) => g.level);

      expect(optionLevels).toEqual([0, 1, 2, 3, 4, 5]);
      expect(gateLevels).toEqual([0, 1, 2, 3, 4, 5]);

      for (const gate of question.gates) {
        expect(gate.minEvents).toBeGreaterThanOrEqual(0);
        expect(gate.minSessions).toBeGreaterThanOrEqual(0);
        expect(gate.minDistinctDays).toBeGreaterThanOrEqual(0);
        expect((gate.acceptedTrustTiers ?? []).length).toBeGreaterThan(0);
        if (gate.level >= 4) {
          expect(gate.acceptedTrustTiers?.includes("SELF_REPORTED")).toBe(false);
        }
        if (gate.level === 5) {
          expect(gate.requiredTrustTier).toBe("OBSERVED");
        }
      }
    }
  });

  test("includes EchoLeak and Garak diagnostic questions with expected maturity gates", () => {
    const echoleak = questionBank.find((question) => question.id === "AMC-5.18");
    const scanner = questionBank.find((question) => question.id === "AMC-5.19");

    expect(echoleak).toBeDefined();
    expect(scanner).toBeDefined();

    expect(echoleak?.options.find((option) => option.level === 0)?.label).toBe("No Output Sanitization");
    expect(echoleak?.options.find((option) => option.level === 1)?.label).toBe("Basic PII Filtering");
    expect(echoleak?.options.find((option) => option.level === 3)?.label).toContain("System Prompt Confidentiality");
    expect(echoleak?.options.find((option) => option.level === 4)?.label).toContain("Automated Leakage Scanning");

    expect(scanner?.options.find((option) => option.level === 0)?.label).toBe("No Automated Scanning");
    expect(scanner?.options.find((option) => option.level === 1)?.label).toBe("Ad-Hoc Manual Testing Only");
    expect(scanner?.options.find((option) => option.level === 3)?.label).toContain("Garak/PyRIT");
    expect(scanner?.options.find((option) => option.level === 4)?.label).toContain("CI/CD Scan Gates");

    expect(echoleak?.gates[4]?.requiredTrustTier).toBe("OBSERVED");
    expect(echoleak?.gates[4]?.mustInclude.auditTypes).toContain("ECHOLEAK_TEST_PASS");
    expect(scanner?.gates[4]?.requiredTrustTier).toBe("OBSERVED");
    expect(scanner?.gates[4]?.mustInclude.auditTypes).toContain("CI_SECURITY_GATE_PASS");
    expect(scanner?.gates[4]?.mustInclude.artifactPatterns).toContain("garak-scan-report");
    expect(scanner?.gates[4]?.mustInclude.artifactPatterns).toContain("vulnerability-scan-report");
  });
});
