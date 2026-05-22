import { describe, expect, test } from "vitest";
import { questionBank } from "../src/diagnostic/questionBank.js";
import { AUTO_ANSWER_RULES, autoAnswerRuleByQuestionId } from "../src/diagnostic/autoAnswer/autoAnswerMappings.js";
import { mechanicGapReportSchema } from "../src/mechanic/mechanicSchema.js";

const NEW_IDS = ["AMC-TUNE-1", "AMC-MEM-4.1", "AMC-DIST-1", "AMC-A2A-1", "AMC-VOICE-1"] as const;

describe("new domain native integration", () => {
  test("all five new native questions exist in question bank", () => {
    const ids = new Set(questionBank.map((q) => q.id));
    for (const id of NEW_IDS) {
      expect(ids.has(id), `missing ${id}`).toBe(true);
    }
  });

  test("all five new native questions auto-generate auto-answer rules", () => {
    expect(AUTO_ANSWER_RULES.length).toBe(questionBank.length);
    for (const id of NEW_IDS) {
      const rule = autoAnswerRuleByQuestionId(id);
      expect(rule.questionId).toBe(id);
      expect(rule.requiredEvidenceTypes.length).toBeGreaterThan(0);
      expect(rule.minEvents).toBeGreaterThan(0);
      expect(rule.minDistinctDays).toBeGreaterThan(0);
    }
  });

  test("new question layers match expected native dimensions", () => {
    const getLayer = (id: string) => questionBank.find((q) => q.id === id)?.layerName;
    expect(getLayer("AMC-TUNE-1")).toBe("Strategic Agent Operations");
    expect(getLayer("AMC-MEM-4.1")).toBe("Resilience");
    expect(getLayer("AMC-DIST-1")).toBe("Resilience");
    expect(getLayer("AMC-A2A-1")).toBe("Skills");
    expect(getLayer("AMC-VOICE-1")).toBe("Skills");
  });

  test("mechanic gap schema accepts 240-question reports including new domains", () => {
    const perQuestion = questionBank.map((q) => ({
      qId: q.id,
      measured: 2,
      desired: 3,
      gap: 1,
      status: "OK" as const,
      reasons: [],
      evidenceCoverage: 0.8,
    }));

    const parsed = mechanicGapReportSchema.parse({
      v: 1,
      generatedTs: 1,
      scope: { type: "WORKSPACE", id: "workspace" },
      readiness: "READY",
      perQuestion,
      perDimension: [
        { dimensionId: "DIM-1", measuredAverage: 2, targetAverage: 3, unknownCount: 0, topGaps: [{ qId: "AMC-TUNE-1", gap: 1 }] },
        { dimensionId: "DIM-2", measuredAverage: 2, targetAverage: 3, unknownCount: 0, topGaps: [] },
        { dimensionId: "DIM-3", measuredAverage: 2, targetAverage: 3, unknownCount: 0, topGaps: [] },
        { dimensionId: "DIM-4", measuredAverage: 2, targetAverage: 3, unknownCount: 0, topGaps: [{ qId: "AMC-MEM-4.1", gap: 1 }, { qId: "AMC-DIST-1", gap: 1 }] },
        { dimensionId: "DIM-5", measuredAverage: 2, targetAverage: 3, unknownCount: 0, topGaps: [{ qId: "AMC-A2A-1", gap: 1 }, { qId: "AMC-VOICE-1", gap: 1 }] },
      ],
      global: {
        upgradeReadiness: "READY",
        integrityIndex: 0.95,
        correlationRatio: 0.92,
        strategyFailureRisks: {},
        valueDimensions: {},
      },
    });

    expect(parsed.perQuestion).toHaveLength(240);
    for (const id of NEW_IDS) {
      expect(parsed.perQuestion.some((row) => row.qId === id), `schema missing ${id}`).toBe(true);
    }
  });
});
