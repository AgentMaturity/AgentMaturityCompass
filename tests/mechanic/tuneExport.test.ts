import { describe, it, expect } from "vitest";
import {
  exportAsRewardFunction,
  exportAsDSPyTargets,
  exportAsFineTuneRecipe,
} from "../../src/mechanic/tuneExport.js";
import type { MechanicGapReport } from "../../src/mechanic/mechanicSchema.js";

/* ------------------------------------------------------------------ */
/*  Mock Helpers                                                       */
/* ------------------------------------------------------------------ */

function makeQuestion(qId: string, measured: number, desired: number, status: "OK" | "UNKNOWN" | "BLOCKED" = "OK") {
  return {
    qId,
    measured,
    desired,
    gap: Number((desired - measured).toFixed(6)),
    status,
    reasons: status !== "OK" ? ["test reason"] : [],
    evidenceCoverage: 0.8,
  };
}

function makeDimension(dimensionId: string, measuredAverage: number, targetAverage: number, unknownCount = 0) {
  return {
    dimensionId,
    measuredAverage,
    targetAverage,
    unknownCount,
    topGaps: [],
  };
}

function buildMockReport(overrides: Partial<{
  questions: ReturnType<typeof makeQuestion>[];
  dimensions: ReturnType<typeof makeDimension>[];
  readiness: "READY" | "NEEDS_EVIDENCE" | "UNTRUSTED";
  integrityIndex: number;
}>): MechanicGapReport {
  const defaultQuestions = [
    makeQuestion("AMC-1.01", 2, 4),       // DIM-1, gap=2
    makeQuestion("AMC-2.01", 3, 5),       // DIM-2, gap=2
    makeQuestion("AMC-3.01", 1, 3),       // DIM-3, gap=2
    makeQuestion("AMC-4.01", 4, 5),       // DIM-4, gap=1
    makeQuestion("AMC-5.01", 0, 4),       // DIM-5, gap=4
  ];

  const questions = overrides.questions ?? defaultQuestions;
  // Pad to 235 with no-gap questions
  while (questions.length < 235) {
    const idx = questions.length;
    const dim = (idx % 5) + 1;
    questions.push(makeQuestion(`AMC-${dim}.${String(idx).padStart(2, "0")}`, 3, 3));
  }

  const dimensions = overrides.dimensions ?? [
    makeDimension("DIM-1", 2, 4),
    makeDimension("DIM-2", 3, 5),
    makeDimension("DIM-3", 1, 3),
    makeDimension("DIM-4", 4, 5),
    makeDimension("DIM-5", 0, 4),
  ];

  return {
    v: 1,
    generatedTs: 1700000000000,
    scope: { type: "WORKSPACE", id: "test-workspace" },
    readiness: overrides.readiness ?? "READY",
    perQuestion: questions,
    perDimension: dimensions,
    global: {
      upgradeReadiness: overrides.readiness ?? "READY",
      integrityIndex: overrides.integrityIndex ?? 0.92,
      correlationRatio: 0.95,
      strategyFailureRisks: {},
      valueDimensions: {},
    },
  } as MechanicGapReport;
}

/* ------------------------------------------------------------------ */
/*  Tests: exportAsRewardFunction                                      */
/* ------------------------------------------------------------------ */

describe("exportAsRewardFunction", () => {
  it("generates reward signals for gapped questions", () => {
    const report = buildMockReport({});
    const result = exportAsRewardFunction(report);

    expect(result.version).toBe(1);
    expect(result.generatedTs).toBe(1700000000000);
    expect(result.scope.type).toBe("WORKSPACE");
    expect(result.totalGaps).toBeGreaterThan(0);
    expect(result.rewardSignals.length).toBe(result.totalGaps);
  });

  it("assigns correct weights based on gap size", () => {
    const report = buildMockReport({
      questions: [
        makeQuestion("AMC-1.01", 4, 5),   // gap=1 → weight 0.25
        makeQuestion("AMC-2.01", 3, 5),   // gap=2 → weight 0.5
        makeQuestion("AMC-3.01", 1, 4),   // gap=3 → weight 0.75
        makeQuestion("AMC-4.01", 0, 4),   // gap=4 → weight 1.0
      ],
    });
    const result = exportAsRewardFunction(report);
    const signals = result.rewardSignals;

    const sig1 = signals.find((s) => s.questionId === "AMC-1.01");
    const sig2 = signals.find((s) => s.questionId === "AMC-2.01");
    const sig3 = signals.find((s) => s.questionId === "AMC-3.01");
    const sig4 = signals.find((s) => s.questionId === "AMC-4.01");

    expect(sig1?.weight).toBe(0.25);
    expect(sig2?.weight).toBe(0.5);
    expect(sig3?.weight).toBe(0.75);
    expect(sig4?.weight).toBe(1.0);
  });

  it("produces positive reward signals for positive gaps", () => {
    const report = buildMockReport({});
    const result = exportAsRewardFunction(report);
    for (const signal of result.rewardSignals) {
      expect(signal.rewardSignal).toBeGreaterThan(0);
    }
  });

  it("returns zero gaps when all questions meet targets", () => {
    const questions = Array.from({ length: 235 }, (_, i) => {
      const dim = (i % 5) + 1;
      return makeQuestion(`AMC-${dim}.${String(i).padStart(2, "0")}`, 3, 3);
    });
    const report = buildMockReport({ questions });
    const result = exportAsRewardFunction(report);
    expect(result.totalGaps).toBe(0);
    expect(result.rewardSignals).toHaveLength(0);
  });

  it("includes metadata from report", () => {
    const report = buildMockReport({ integrityIndex: 0.88, readiness: "NEEDS_EVIDENCE" });
    const result = exportAsRewardFunction(report);
    expect(result.metadata.integrityIndex).toBe(0.88);
    expect(result.metadata.readiness).toBe("NEEDS_EVIDENCE");
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: exportAsDSPyTargets                                         */
/* ------------------------------------------------------------------ */

describe("exportAsDSPyTargets", () => {
  it("generates metrics for gapped questions only", () => {
    const report = buildMockReport({});
    const result = exportAsDSPyTargets(report);

    expect(result.version).toBe(1);
    expect(result.metrics.length).toBeGreaterThan(0);
    for (const metric of result.metrics) {
      expect(metric.targetValue).toBeGreaterThan(metric.currentValue);
      expect(metric.optimizationDirection).toBe("maximize");
    }
  });

  it("metric names are formatted correctly", () => {
    const report = buildMockReport({
      questions: [makeQuestion("AMC-1.01", 2, 4)],
    });
    const result = exportAsDSPyTargets(report);
    const metric = result.metrics.find((m) => m.name.includes("amc_1_01"));
    expect(metric).toBeDefined();
    expect(metric!.name).toBe("amc_amc_1_01");
  });

  it("adds constraint for UNTRUSTED readiness", () => {
    const report = buildMockReport({ readiness: "UNTRUSTED" });
    const result = exportAsDSPyTargets(report);
    expect(result.constraints.some((c) => c.includes("UNTRUSTED"))).toBe(true);
  });

  it("returns empty metrics when no gaps exist", () => {
    const questions = Array.from({ length: 235 }, (_, i) => {
      const dim = (i % 5) + 1;
      return makeQuestion(`AMC-${dim}.${String(i).padStart(2, "0")}`, 4, 4);
    });
    const report = buildMockReport({ questions });
    const result = exportAsDSPyTargets(report);
    expect(result.metrics).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: exportAsFineTuneRecipe                                      */
/* ------------------------------------------------------------------ */

describe("exportAsFineTuneRecipe", () => {
  it("generates focus areas grouped by dimension", () => {
    const report = buildMockReport({});
    const result = exportAsFineTuneRecipe(report);

    expect(result.version).toBe(1);
    expect(result.recipeName).toContain("amc-finetune");
    expect(result.focusAreas.length).toBeGreaterThan(0);
    for (const area of result.focusAreas) {
      expect(area.gapCount).toBeGreaterThan(0);
      expect(area.avgGap).toBeGreaterThan(0);
      expect(area.suggestedTrainingTopics.length).toBeGreaterThan(0);
      expect(["critical", "high", "medium", "low"]).toContain(area.priority);
    }
  });

  it("sorts focus areas by avgGap descending", () => {
    const report = buildMockReport({});
    const result = exportAsFineTuneRecipe(report);
    for (let i = 1; i < result.focusAreas.length; i++) {
      expect(result.focusAreas[i - 1].avgGap).toBeGreaterThanOrEqual(result.focusAreas[i].avgGap);
    }
  });

  it("assigns correct priority based on average gap", () => {
    const report = buildMockReport({
      questions: [
        makeQuestion("AMC-1.01", 0, 4),  // DIM-1, gap=4 → critical
        makeQuestion("AMC-2.01", 3, 4),  // DIM-2, gap=1 → medium
      ],
    });
    const result = exportAsFineTuneRecipe(report);
    const dim1 = result.focusAreas.find((f) => f.dimension === "DIM-1");
    const dim2 = result.focusAreas.find((f) => f.dimension === "DIM-2");
    expect(dim1?.priority).toBe("critical");
    expect(dim2?.priority).toBe("medium");
  });

  it("calculates estimated training hours from total gap score", () => {
    const report = buildMockReport({
      questions: [
        makeQuestion("AMC-1.01", 0, 5),   // gap=5
        makeQuestion("AMC-2.01", 0, 5),   // gap=5
      ],
    });
    const result = exportAsFineTuneRecipe(report);
    // total gap = 10, hours = 10 * 2.5 = 25
    expect(result.estimatedTrainingHours).toBe(25);
  });

  it("returns empty focus areas when no gaps exist", () => {
    const questions = Array.from({ length: 235 }, (_, i) => {
      const dim = (i % 5) + 1;
      return makeQuestion(`AMC-${dim}.${String(i).padStart(2, "0")}`, 3, 3);
    });
    const report = buildMockReport({ questions });
    const result = exportAsFineTuneRecipe(report);
    expect(result.focusAreas).toHaveLength(0);
    expect(result.estimatedTrainingHours).toBe(0);
  });

  it("includes regression testing data requirement when gaps exist", () => {
    const report = buildMockReport({});
    const result = exportAsFineTuneRecipe(report);
    expect(result.dataRequirements.some((r) => r.includes("regression testing"))).toBe(true);
  });
});
