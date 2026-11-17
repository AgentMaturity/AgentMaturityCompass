import { describe, expect, test } from "vitest";
import {
  scoreTaskHorizon,
  classifyTaskHorizon,
  TASK_HORIZON_BANDS,
} from "../src/score/taskHorizon.js";
import {
  scoreFactuality,
  scoreParametricFactuality,
  scoreSearchRetrievalFactuality,
  scoreGroundedFactuality,
} from "../src/score/factuality.js";
import {
  factualityClassSchema,
  truthguardFactualityAnnotationSchema,
} from "../src/truthguard/truthguardSchema.js";

// ── Task Horizon ─────────────────────────────────────────────────────

describe("classifyTaskHorizon", () => {
  // The spans used to be named L0 to L5, a second meaning for the maturity scale. They are run lengths now.
  test.each([
    [0.5, "under-1-min"],
    [3, "1-5-min"],
    [15, "5-30-min"],
    [60, "30-min-2-hr"],
    [300, "2-8-hr"],
    [600, "8-hr-plus"],
  ] as const)("classifies %s minutes as %s", (minutes, span) => {
    expect(classifyTaskHorizon(minutes).span).toBe(span);
    expect(classifyTaskHorizon(minutes)).not.toHaveProperty("level");
  });
});

describe("scoreTaskHorizon", () => {
  test("a short run with its one control is low risk", () => {
    const result = scoreTaskHorizon({
      taskDurationMinutes: 0.5,
      completedAutonomously: true,
      activeGovernanceControls: ["basic output validation"], // the older name for "output validation" still counts
    });
    expect(result.span).toBe("under-1-min");
    expect(result.governanceSufficient).toBe(true);
    expect(result.riskLabel).toBe("low");
    expect(result.missingGovernance).toHaveLength(0);
    expect(result.score).toBe(100);
  });

  test("an hour-long run with controls missing is high risk", () => {
    const result = scoreTaskHorizon({
      taskDurationMinutes: 60,
      completedAutonomously: true,
      activeGovernanceControls: ["output validation"],
    });
    expect(result.span).toBe("30-min-2-hr");
    expect(result.governanceSufficient).toBe(false);
    expect(result.riskLabel).toBe("high");
    expect(result.missingGovernance.length).toBeGreaterThan(0);
  });

  test("a ten-hour run with no controls is critical risk and scores zero", () => {
    const result = scoreTaskHorizon({
      taskDurationMinutes: 600,
      completedAutonomously: true,
      activeGovernanceControls: [],
    });
    expect(result.span).toBe("8-hr-plus");
    expect(result.governanceSufficient).toBe(false);
    expect(result.riskLabel).toBe("critical");
    expect(result.score).toBe(0);
  });

  test("a five-hour run with every listed control is sufficient", () => {
    const band = TASK_HORIZON_BANDS.find((b) => b.span === "2-8-hr")!;
    const result = scoreTaskHorizon({
      taskDurationMinutes: 300,
      completedAutonomously: true,
      activeGovernanceControls: band.governanceRequirements,
    });
    expect(result.governanceSufficient).toBe(true);
    expect(result.score).toBe(100);
  });

  // The defect this replaces: 60 of 100 points came from run length alone, so a longer run scored higher.
  test("a longer run never scores higher than a shorter one with the same controls", () => {
    const controls = ["output validation", "tool allowlist"];
    const scores = [0.5, 3, 15, 60, 300, 600].map((minutes) =>
      scoreTaskHorizon({ taskDurationMinutes: minutes, completedAutonomously: true, activeGovernanceControls: controls }).score);
    for (let i = 1; i < scores.length; i++) expect(scores[i]!).toBeLessThanOrEqual(scores[i - 1]!);
    expect(scores[0]).toBe(100);
    // A control listed only for longer runs must not lift a long run above a short one either.
    const late = [0.5, 15].map((minutes) =>
      scoreTaskHorizon({ taskDurationMinutes: minutes, completedAutonomously: true, activeGovernanceControls: ["cost budget"] }).score);
    expect(late).toEqual([0, 0]);
    expect(scoreTaskHorizon({ taskDurationMinutes: 600, completedAutonomously: true, activeGovernanceControls: [] }).score).toBe(0);
  });

  test("says what it is not, and treats a person stepping in as a note, not a gap", () => {
    const result = scoreTaskHorizon({
      taskDurationMinutes: 15,
      completedAutonomously: false,
      activeGovernanceControls: [],
    });
    expect(result.notes[0]).toContain("Not METR's time-horizon measure");
    expect(result.notes.some((note) => note.includes("A person stepped in"))).toBe(true);
    expect(result.gaps.some((gap) => gap.includes("autonomously"))).toBe(false);
    expect(result).not.toHaveProperty("level");
  });
});

// ── Factuality Dimensions ────────────────────────────────────────────

describe("scoreParametricFactuality", () => {
  test("scores high accuracy with uncertainty expression", () => {
    const result = scoreParametricFactuality({
      totalClaims: 10,
      verifiedCorrect: 9,
      verifiedIncorrect: 1,
      unverifiable: 0,
      expressesUncertainty: true,
      refusesWhenUnsure: true,
    });
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.level).toBeGreaterThanOrEqual(4);
  });

  test("does not score absent claims", () => {
    const result = scoreParametricFactuality({
      totalClaims: 0,
      verifiedCorrect: 0,
      verifiedIncorrect: 0,
      unverifiable: 0,
      expressesUncertainty: false,
      refusesWhenUnsure: false,
    });
    expect(result.score).toBeNull();
    expect(result.outcome).toBe("not_evaluated");
  });

  test("flags hallucinations in gaps", () => {
    const result = scoreParametricFactuality({
      totalClaims: 10,
      verifiedCorrect: 5,
      verifiedIncorrect: 5,
      unverifiable: 0,
      expressesUncertainty: false,
      refusesWhenUnsure: false,
    });
    expect(result.gaps.some((g) => g.includes("incorrect"))).toBe(true);
  });
});

describe("scoreSearchRetrievalFactuality", () => {
  test("scores high with good attribution and verification", () => {
    const result = scoreSearchRetrievalFactuality({
      totalClaims: 10,
      correctlyAttributed: 10,
      fabricatedCitations: 0,
      sourcesVerified: true,
      contradictionsFlagged: true,
      retrievalPrecision: 0.9,
      retrievalRecall: 0.85,
    });
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  test("penalizes fabricated citations", () => {
    const result = scoreSearchRetrievalFactuality({
      totalClaims: 10,
      correctlyAttributed: 5,
      fabricatedCitations: 5,
      sourcesVerified: false,
      contradictionsFlagged: false,
    });
    expect(result.score).toBeLessThan(30);
    expect(result.gaps.some((g) => g.includes("fabricated"))).toBe(true);
  });

  test("does not score absent claims", () => {
    const result = scoreSearchRetrievalFactuality({
      totalClaims: 0,
      correctlyAttributed: 0,
      fabricatedCitations: 0,
      sourcesVerified: false,
      contradictionsFlagged: false,
    });
    expect(result.score).toBeNull();
    expect(result.outcome).toBe("not_evaluated");
  });
});

describe("scoreGroundedFactuality", () => {
  test("scores high with faithful claims and inference distinction", () => {
    const result = scoreGroundedFactuality({
      totalClaims: 10,
      faithfulClaims: 10,
      unfaithfulClaims: 0,
      distinguishesInference: true,
      flagsInsufficientContext: true,
    });
    expect(result.score).toBe(100);
    expect(result.level).toBe(5);
  });

  test("flags unfaithful claims", () => {
    const result = scoreGroundedFactuality({
      totalClaims: 10,
      faithfulClaims: 5,
      unfaithfulClaims: 5,
      distinguishesInference: false,
      flagsInsufficientContext: false,
    });
    expect(result.gaps.some((g) => g.includes("contradict"))).toBe(true);
  });
});

describe("scoreFactuality (composite)", () => {
  test("computes weighted overall score", () => {
    const result = scoreFactuality({
      parametric: {
        totalClaims: 10,
        verifiedCorrect: 9,
        verifiedIncorrect: 1,
        unverifiable: 0,
        expressesUncertainty: true,
        refusesWhenUnsure: true,
      },
      searchRetrieval: {
        totalClaims: 10,
        correctlyAttributed: 9,
        fabricatedCitations: 0,
        sourcesVerified: true,
        contradictionsFlagged: true,
      },
      grounded: {
        totalClaims: 10,
        faithfulClaims: 10,
        unfaithfulClaims: 0,
        distinguishesInference: true,
        flagsInsufficientContext: true,
      },
    });
    expect(result.overallScore).toBeGreaterThan(0);
    expect(result.overallLevel).toBeGreaterThanOrEqual(3);
    expect(result.parametric.score).toBeGreaterThan(0);
    expect(result.searchRetrieval.score).toBeGreaterThan(0);
    expect(result.grounded.score).toBeGreaterThan(0);
  });

  test("handles partial input (only parametric)", () => {
    const result = scoreFactuality({
      parametric: {
        totalClaims: 10,
        verifiedCorrect: 8,
        verifiedIncorrect: 2,
        unverifiable: 0,
        expressesUncertainty: true,
        refusesWhenUnsure: false,
      },
    });
    expect(result.overallScore).toBeGreaterThan(0);
    expect(result.searchRetrieval.score).toBeNull();
    expect(result.grounded.score).toBeNull();
  });

  test("does not score when nothing is assessed", () => {
    const result = scoreFactuality({});
    expect(result.overallScore).toBeNull();
    expect(result.outcome).toBe("not_evaluated");
  });
});

// ── Truthguard Factuality Schema ─────────────────────────────────────

describe("truthguard factuality schema", () => {
  test("validates factuality class enum", () => {
    expect(factualityClassSchema.parse("parametric")).toBe("parametric");
    expect(factualityClassSchema.parse("search_retrieval")).toBe("search_retrieval");
    expect(factualityClassSchema.parse("grounded")).toBe("grounded");
    expect(factualityClassSchema.parse("unknown")).toBe("unknown");
    expect(() => factualityClassSchema.parse("invalid")).toThrow();
  });

  test("validates factuality annotation", () => {
    const annotation = truthguardFactualityAnnotationSchema.parse({
      claimIndex: 0,
      factualityClass: "parametric",
      verified: true,
      confidence: 0.95,
    });
    expect(annotation.claimIndex).toBe(0);
    expect(annotation.factualityClass).toBe("parametric");
    expect(annotation.verified).toBe(true);
    expect(annotation.confidence).toBe(0.95);
  });

  test("annotation allows optional fields", () => {
    const annotation = truthguardFactualityAnnotationSchema.parse({
      claimIndex: 2,
      factualityClass: "grounded",
    });
    expect(annotation.verified).toBeUndefined();
    expect(annotation.confidence).toBeUndefined();
  });
});
