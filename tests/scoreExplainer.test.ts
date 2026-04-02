/**
 * Tests for Score Explainability Engine — MF-06
 */

import { describe, expect, test } from "vitest";
import {
  decomposeScore,
  generateScoreExplanationReport,
  computeConfidenceInterval,
  computeBenchmarkComparison,
  buildAuditTrail,
  renderExplanationMarkdown,
  type ScoreDecomposition,
} from "../src/score/scoreExplainer.js";
import type { DiagnosticReport, LayerScore, QuestionScore } from "../src/types.js";

function makeQuestion(
  qId: string,
  claimedLevel: number,
  finalLevel: number,
  confidence: number,
  evidenceCount: number,
): QuestionScore {
  return {
    questionId: qId,
    claimedLevel,
    supportedMaxLevel: Math.max(claimedLevel, finalLevel),
    finalLevel,
    confidence,
    evidenceEventIds: Array.from({ length: evidenceCount }, (_, i) => `ev-${qId}-${i}`),
    flags: [],
    narrative: `Assessment for ${qId}`,
  };
}

function makeReport(agentId: string, questions: QuestionScore[]): DiagnosticReport {
  const avgFinal = questions.reduce((s, q) => s + q.finalLevel, 0) / questions.length;
  const layers: LayerScore[] = [
    {
      layerName: "Skills",
      avgFinalLevel: avgFinal,
      confidenceWeightedFinalLevel: avgFinal,
    },
  ];

  return {
    runId: `run-${agentId}`,
    agentId,
    ts: Date.now(),
    version: "1.0.0",
    workspace: "/tmp/test",
    targetName: "default",
    window: "30d",
    layerScores: layers,
    questionScores: questions,
    targetDiff: [],
    integrityIndex: 0.85,
    trustLabel: "HIGH TRUST",
    evidenceCoverage: 0.9,
    ledgerEventCount: 100,
    status: "VALID",
  } as DiagnosticReport;
}

// ─── Score decomposition ────────────────────────────

describe("Score Explainer — decomposition", () => {
  test("decomposes a question score", () => {
    const q = makeQuestion("q1", 3.5, 3.5, 0.85, 5);
    const decomp = decomposeScore(q, "Skills");

    expect(decomp.questionId).toBe("q1");
    expect(decomp.layerName).toBe("Skills");
    expect(decomp.contributions.length).toBe(4);
    expect(decomp.confidence).toBe(0.85);
    expect(decomp.evidenceChain).toHaveLength(5);
  });

  test("contributions include all factors", () => {
    const q = makeQuestion("q2", 4.0, 4.0, 0.9, 8);
    const decomp = decomposeScore(q, "Resilience");

    const factors = decomp.contributions.map((c) => c.factor);
    expect(factors).toContain("base_assessment");
    expect(factors).toContain("evidence_quality");
    expect(factors).toContain("confidence");
    expect(factors).toContain("adjustments");
  });

  test("weights sum to 1.0", () => {
    const q = makeQuestion("q3", 3.0, 3.0, 0.7, 3);
    const decomp = decomposeScore(q, "Skills");

    const totalWeight = decomp.contributions.reduce((s, c) => s + c.weight, 0);
    expect(totalWeight).toBeCloseTo(1.0, 5);
  });

  test("captures positive adjustment (boost)", () => {
    const q = makeQuestion("q4", 3.0, 3.5, 0.8, 4); // final > claimed
    const decomp = decomposeScore(q, "Skills");
    expect(decomp.adjustmentDelta).toBeCloseTo(0.5, 5);
  });

  test("captures negative adjustment (cap)", () => {
    const q = makeQuestion("q5", 4.5, 4.0, 0.8, 4); // final < claimed
    const decomp = decomposeScore(q, "Skills");
    expect(decomp.adjustmentDelta).toBeCloseTo(-0.5, 5);
  });
});

// ─── Confidence intervals ───────────────────────────

describe("Score Explainer — confidence intervals", () => {
  test("computes interval for high-evidence question", () => {
    const q = makeQuestion("ci1", 4.0, 4.0, 0.9, 8);
    const ci = computeConfidenceInterval(q);

    expect(ci.questionId).toBe("ci1");
    expect(ci.pointEstimate).toBe(4.0);
    expect(ci.lowerBound).toBeLessThan(4.0);
    expect(ci.upperBound).toBeGreaterThan(4.0);
    expect(ci.evidenceQuality).toBe("strong");
    expect(ci.confidenceLevel).toBe(0.95);
  });

  test("wider interval for low-evidence question", () => {
    const highQ = makeQuestion("ci2a", 3.0, 3.0, 0.9, 6);
    const lowQ = makeQuestion("ci2b", 3.0, 3.0, 0.3, 1);

    const highCI = computeConfidenceInterval(highQ);
    const lowCI = computeConfidenceInterval(lowQ);

    const highWidth = highCI.upperBound - highCI.lowerBound;
    const lowWidth = lowCI.upperBound - lowCI.lowerBound;

    expect(lowWidth).toBeGreaterThan(highWidth);
    expect(lowCI.evidenceQuality).toBe("weak");
  });

  test("interval bounds stay within 0-5", () => {
    const q = makeQuestion("ci3", 0.5, 0.5, 0.2, 1);
    const ci = computeConfidenceInterval(q);
    expect(ci.lowerBound).toBeGreaterThanOrEqual(0);
    expect(ci.upperBound).toBeLessThanOrEqual(5);
  });

  test("evidence quality classification", () => {
    expect(computeConfidenceInterval(makeQuestion("a", 3, 3, 0.9, 6)).evidenceQuality).toBe("strong");
    expect(computeConfidenceInterval(makeQuestion("b", 3, 3, 0.6, 4)).evidenceQuality).toBe("moderate");
    expect(computeConfidenceInterval(makeQuestion("c", 3, 3, 0.3, 2)).evidenceQuality).toBe("weak");
    expect(computeConfidenceInterval(makeQuestion("d", 3, 3, 0.1, 0)).evidenceQuality).toBe("insufficient");
  });
});

// ─── Benchmark comparison ───────────────────────────

describe("Score Explainer — benchmark comparison", () => {
  test("high score gets top category", () => {
    const q = makeQuestion("bm1", 4.5, 4.5, 0.9, 5);
    const comparison = computeBenchmarkComparison(q);
    expect(comparison.percentile).toBeGreaterThanOrEqual(70);
    expect(["top-10%", "above-average"]).toContain(comparison.category);
  });

  test("low score gets bottom category", () => {
    const q = makeQuestion("bm2", 0.5, 0.5, 0.5, 2);
    const comparison = computeBenchmarkComparison(q);
    expect(comparison.percentile).toBeLessThanOrEqual(30);
    expect(["bottom-10%", "below-average"]).toContain(comparison.category);
  });

  test("custom benchmark stats work", () => {
    const q = makeQuestion("bm3", 3.0, 3.0, 0.8, 4);
    const comparison = computeBenchmarkComparison(q, { mean: 3.0, median: 3.0, stdDev: 0.5 });
    expect(comparison.benchmarkMean).toBe(3.0);
    expect(comparison.percentile).toBeGreaterThanOrEqual(40);
    expect(comparison.percentile).toBeLessThanOrEqual(60);
  });
});

// ─── Audit trail ────────────────────────────────────

describe("Score Explainer — audit trail", () => {
  test("builds trail from report", () => {
    const questions = [
      makeQuestion("at1", 3.0, 3.0, 0.8, 3),
      makeQuestion("at2", 3.0, 3.5, 0.8, 4), // boosted
      makeQuestion("at3", 4.0, 3.5, 0.8, 3), // capped
    ];
    const report = makeReport("audit-agent", questions);
    const trail = buildAuditTrail(report);

    // At minimum: claimed_assessment for each question
    expect(trail.length).toBeGreaterThanOrEqual(3);

    // Check that adjustments are recorded for boosted/capped questions
    const adjustments = trail.filter((a) => a.action !== "claimed_assessment");
    expect(adjustments.length).toBeGreaterThan(0);
  });

  test("trail entries have required fields", () => {
    const questions = [makeQuestion("at4", 3.0, 3.5, 0.8, 3)];
    const report = makeReport("trail-agent", questions);
    const trail = buildAuditTrail(report);

    for (const entry of trail) {
      expect(entry).toHaveProperty("ts");
      expect(entry).toHaveProperty("action");
      expect(entry).toHaveProperty("questionId");
      expect(entry).toHaveProperty("fromValue");
      expect(entry).toHaveProperty("toValue");
      expect(entry).toHaveProperty("reason");
    }
  });
});

// ─── Full report ────────────────────────────────────

describe("Score Explainer — full report", () => {
  test("generates complete explanation report", () => {
    const questions = [
      makeQuestion("fr1", 4.0, 4.0, 0.9, 6),
      makeQuestion("fr2", 3.5, 3.5, 0.7, 4),
      makeQuestion("fr3", 2.0, 2.0, 0.5, 2),
      makeQuestion("fr4", 1.0, 1.5, 0.6, 3), // boosted
      makeQuestion("fr5", 4.5, 4.0, 0.8, 5), // capped
    ];
    const report = makeReport("full-agent", questions);
    const explanation = generateScoreExplanationReport(report);

    expect(explanation.reportId).toMatch(/^sxr_/);
    expect(explanation.agentId).toBe("full-agent");
    expect(explanation.overallScore).toBeGreaterThan(0);
    expect(explanation.overallExplanation.length).toBeGreaterThan(50);
    expect(explanation.layerExplanations).toHaveLength(1);
    expect(explanation.questionDecompositions).toHaveLength(5);
    expect(explanation.naturalLanguageExplanations).toHaveLength(5);
    expect(explanation.confidenceIntervals).toHaveLength(5);
    expect(explanation.benchmarkComparisons).toHaveLength(5);
    expect(explanation.auditTrail.length).toBeGreaterThan(0);
    expect(explanation.reportSha256).toBeTruthy();
  });

  test("overall explanation mentions key info", () => {
    const questions = [makeQuestion("oe1", 3.5, 3.5, 0.8, 5)];
    const report = makeReport("explain-agent", questions);
    const explanation = generateScoreExplanationReport(report);

    expect(explanation.overallExplanation).toContain("L");
    expect(explanation.overallExplanation).toContain("question");
  });

  test("natural language explanations are readable", () => {
    const questions = [
      makeQuestion("nl1", 4.5, 4.5, 0.95, 8),
      makeQuestion("nl2", 1.0, 1.0, 0.3, 1),
    ];
    const report = makeReport("nl-agent", questions);
    const explanation = generateScoreExplanationReport(report);

    const strong = explanation.naturalLanguageExplanations.find((e) => e.questionId === "nl1")!;
    expect(strong.strengthAreas.length).toBeGreaterThan(0);
    expect(strong.confidenceStatement).toContain("strong");

    const weak = explanation.naturalLanguageExplanations.find((e) => e.questionId === "nl2")!;
    expect(weak.weaknessAreas.length).toBeGreaterThan(0);
    expect(weak.improvementSuggestions.length).toBeGreaterThan(0);
  });
});

// ─── Markdown rendering ─────────────────────────────

describe("Score Explainer — markdown", () => {
  test("renders markdown report", () => {
    const questions = [
      makeQuestion("md1", 4.0, 4.0, 0.9, 6),
      makeQuestion("md2", 1.5, 1.5, 0.3, 1),
    ];
    const report = makeReport("md-agent", questions);
    const explanation = generateScoreExplanationReport(report);
    const md = renderExplanationMarkdown(explanation);

    expect(md).toContain("Score Explanation Report");
    expect(md).toContain("md-agent");
    expect(md).toContain("Layer Breakdown");
    expect(md).toContain("Overall Explanation");
  });
});
