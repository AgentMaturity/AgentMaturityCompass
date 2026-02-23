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
  test("classifies <1 min as L0", () => {
    expect(classifyTaskHorizon(0.5).level).toBe("L0");
  });

  test("classifies 3 min as L1", () => {
    expect(classifyTaskHorizon(3).level).toBe("L1");
  });

  test("classifies 15 min as L2", () => {
    expect(classifyTaskHorizon(15).level).toBe("L2");
  });

  test("classifies 60 min as L3", () => {
    expect(classifyTaskHorizon(60).level).toBe("L3");
  });

  test("classifies 300 min as L4", () => {
    expect(classifyTaskHorizon(300).level).toBe("L4");
  });

  test("classifies 600 min as L5", () => {
    expect(classifyTaskHorizon(600).level).toBe("L5");
  });
});

describe("scoreTaskHorizon", () => {
  test("scores L0 with full governance as low risk", () => {
    const result = scoreTaskHorizon({
      taskDurationMinutes: 0.5,
      completedAutonomously: true,
      activeGovernanceControls: ["basic output validation"],
    });
    expect(result.level).toBe("L0");
    expect(result.governanceSufficient).toBe(true);
    expect(result.riskLabel).toBe("low");
    expect(result.missingGovernance).toHaveLength(0);
  });

  test("scores L3 with missing governance as high risk", () => {
    const result = scoreTaskHorizon({
      taskDurationMinutes: 60,
      completedAutonomously: true,
      activeGovernanceControls: ["output validation"],
    });
    expect(result.level).toBe("L3");
    expect(result.governanceSufficient).toBe(false);
    expect(result.riskLabel).toBe("high");
    expect(result.missingGovernance.length).toBeGreaterThan(0);
  });

  test("scores L5 with missing governance as critical risk", () => {
    const result = scoreTaskHorizon({
      taskDurationMinutes: 600,
      completedAutonomously: true,
      activeGovernanceControls: [],
    });
    expect(result.level).toBe("L5");
    expect(result.governanceSufficient).toBe(false);
    expect(result.riskLabel).toBe("critical");
  });

  test("L4 with full governance is sufficient", () => {
    const band = TASK_HORIZON_BANDS.find((b) => b.level === "L4")!;
    const result = scoreTaskHorizon({
      taskDurationMinutes: 300,
      completedAutonomously: true,
      activeGovernanceControls: band.governanceRequirements,
    });
    expect(result.governanceSufficient).toBe(true);
    expect(result.score).toBeGreaterThan(0);
  });

  test("adds gap when not completed autonomously at L2+", () => {
    const result = scoreTaskHorizon({
      taskDurationMinutes: 15,
      completedAutonomously: false,
      activeGovernanceControls: [],
    });
    expect(result.gaps.some((g) => g.includes("autonomously"))).toBe(true);
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

  test("returns 0 for no claims", () => {
    const result = scoreParametricFactuality({
      totalClaims: 0,
      verifiedCorrect: 0,
      verifiedIncorrect: 0,
      unverifiable: 0,
      expressesUncertainty: false,
      refusesWhenUnsure: false,
    });
    expect(result.score).toBe(0);
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

  test("returns 0 for no claims", () => {
    const result = scoreSearchRetrievalFactuality({
      totalClaims: 0,
      correctlyAttributed: 0,
      fabricatedCitations: 0,
      sourcesVerified: false,
      contradictionsFlagged: false,
    });
    expect(result.score).toBe(0);
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
    expect(result.searchRetrieval.score).toBe(0);
    expect(result.grounded.score).toBe(0);
  });

  test("returns 0 when nothing assessed", () => {
    const result = scoreFactuality({});
    expect(result.overallScore).toBe(0);
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
