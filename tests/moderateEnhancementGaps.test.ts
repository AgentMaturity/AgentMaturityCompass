/**
 * Tests for Moderate + Enhancement gap implementations — MF-16 to MF-35
 */
import { describe, expect, test } from "vitest";

// MF-16: Anti-gaming
import { detectGaming, randomizeQuestions, type GamingDetectionResult } from "../src/score/antiGaming.js";
import type { DiagnosticReport, QuestionScore } from "../src/types.js";

// MF-19: Longitudinal tracking
import { analyzeTimeSeries, detectRegressionAlert, type ScoreDataPoint } from "../src/diagnostic/longitudinalTracking.js";

function makeQ(id: string, level: number, confidence: number, evidenceCount: number): QuestionScore {
  return {
    questionId: id, layerName: "Skills", rawLevel: level, finalLevel: level,
    confidence, evidenceEventIds: Array.from({ length: evidenceCount }, (_, i) => `ev-${id}-${i}`),
    narrative: "", boosts: [], caps: [],
  };
}

function makeReport(questions: QuestionScore[]): DiagnosticReport {
  return {
    runId: "test-run", agentId: "test-agent", ts: Date.now(), version: "1.0.0",
    workspace: "/tmp", targetName: "default", window: "30d",
    layerScores: [{ layerName: "Skills", questionCount: questions.length, answeredCount: questions.length, avgFinalLevel: questions.reduce((s, q) => s + q.finalLevel, 0) / questions.length, avgConfidence: 0.8 }],
    questionScores: questions, targetDiff: [], integrityIndex: 0.8,
    trustLabel: "HIGH TRUST", evidenceCoverage: 0.9, ledgerEventCount: 100, status: "VALID",
  } as DiagnosticReport;
}

// ─── MF-16: Anti-gaming ─────────────────────────────

describe("MF-16 Anti-Gaming", () => {
  test("detects perfect score gaming", () => {
    const questions = Array.from({ length: 20 }, (_, i) => makeQ(`q${i}`, 5.0, 0.9, 5));
    const report = makeReport(questions);
    const result = detectGaming(report);
    expect(result.gamingScore).toBeGreaterThan(0);
    expect(result.indicators.some(i => i.type === "perfect_score_pattern")).toBe(true);
  });

  test("detects high score with low evidence", () => {
    const questions = Array.from({ length: 10 }, (_, i) => makeQ(`q${i}`, 4.5, 0.9, 1));
    const report = makeReport(questions);
    const result = detectGaming(report);
    expect(result.indicators.some(i => i.type === "high_score_low_evidence")).toBe(true);
  });

  test("clean report has low gaming score", () => {
    const questions = [makeQ("a", 3.5, 0.8, 5), makeQ("b", 2.0, 0.6, 3), makeQ("c", 4.0, 0.9, 7), makeQ("d", 1.5, 0.4, 2)];
    const report = makeReport(questions);
    const result = detectGaming(report);
    expect(result.verdict).toBe("clean");
    expect(result.gamingScore).toBeLessThan(25);
  });

  test("randomize questions is deterministic with same seed", () => {
    const ids = Array.from({ length: 50 }, (_, i) => `q${i}`);
    const r1 = randomizeQuestions(ids, 20, "seed-123");
    const r2 = randomizeQuestions(ids, 20, "seed-123");
    expect(r1).toEqual(r2);
  });

  test("randomize with different seeds produces different order", () => {
    const ids = Array.from({ length: 50 }, (_, i) => `q${i}`);
    const r1 = randomizeQuestions(ids, 20, "seed-A");
    const r2 = randomizeQuestions(ids, 20, "seed-B");
    expect(r1).not.toEqual(r2);
  });

  test("randomize returns correct count", () => {
    const ids = Array.from({ length: 100 }, (_, i) => `q${i}`);
    expect(randomizeQuestions(ids, 25, "test").length).toBe(25);
    expect(randomizeQuestions(ids, 200, "test").length).toBe(100); // capped
  });
});

// ─── MF-19: Longitudinal tracking ──────────────────

describe("MF-19 Longitudinal Tracking", () => {
  test("analyzes stable time series", () => {
    const points: ScoreDataPoint[] = Array.from({ length: 10 }, (_, i) => ({
      ts: Date.now() - (10 - i) * 86_400_000,
      runId: `run-${i}`,
      overallScore: 3.5 + (Math.random() * 0.1 - 0.05),
      integrityIndex: 0.8,
      layerScores: {},
      evidenceCoverage: 0.9,
    }));
    const analysis = analyzeTimeSeries(points);
    expect(analysis.dataPoints).toBe(10);
    expect(analysis.trend).toBe("stable");
    expect(analysis.regressionDetected).toBe(false);
  });

  test("detects declining trend", () => {
    const points: ScoreDataPoint[] = Array.from({ length: 10 }, (_, i) => ({
      ts: Date.now() - (10 - i) * 86_400_000,
      runId: `run-${i}`,
      overallScore: 4.0 - i * 0.2,
      integrityIndex: 0.8,
      layerScores: {},
      evidenceCoverage: 0.9,
    }));
    const analysis = analyzeTimeSeries(points);
    expect(analysis.trend).toBe("declining");
    expect(analysis.trendMagnitude).toBeLessThan(0);
  });

  test("detects improving trend", () => {
    const points: ScoreDataPoint[] = Array.from({ length: 10 }, (_, i) => ({
      ts: Date.now() - (10 - i) * 86_400_000,
      runId: `run-${i}`,
      overallScore: 2.0 + i * 0.2,
      integrityIndex: 0.8,
      layerScores: {},
      evidenceCoverage: 0.9,
    }));
    const analysis = analyzeTimeSeries(points);
    expect(analysis.trend).toBe("improving");
  });

  test("detects regression", () => {
    const points: ScoreDataPoint[] = [
      { ts: Date.now() - 5 * 86_400_000, runId: "r1", overallScore: 4.0, integrityIndex: 0.9, layerScores: {}, evidenceCoverage: 0.9 },
      { ts: Date.now() - 4 * 86_400_000, runId: "r2", overallScore: 4.0, integrityIndex: 0.9, layerScores: {}, evidenceCoverage: 0.9 },
      { ts: Date.now() - 1 * 86_400_000, runId: "r3", overallScore: 2.5, integrityIndex: 0.6, layerScores: {}, evidenceCoverage: 0.7 },
    ];
    const analysis = analyzeTimeSeries(points);
    expect(analysis.regressionDetected).toBe(true);
    expect(analysis.regressionAmount).toBeGreaterThanOrEqual(1);
  });

  test("regression alert fires", () => {
    const analysis = analyzeTimeSeries([
      { ts: Date.now() - 86_400_000, runId: "r1", overallScore: 4.0, integrityIndex: 0.9, layerScores: {}, evidenceCoverage: 0.9 },
      { ts: Date.now(), runId: "r2", overallScore: 2.0, integrityIndex: 0.5, layerScores: {}, evidenceCoverage: 0.6 },
    ]);
    const alert = detectRegressionAlert(analysis);
    expect(alert.alert).toBe(true);
    expect(["warning", "critical"]).toContain(alert.severity);
  });

  test("handles empty data", () => {
    const analysis = analyzeTimeSeries([]);
    expect(analysis.dataPoints).toBe(0);
    expect(analysis.trend).toBe("stable");
    expect(analysis.baseline).toBeNull();
  });

  test("establishes baseline from first 5 points", () => {
    const points: ScoreDataPoint[] = Array.from({ length: 10 }, (_, i) => ({
      ts: Date.now() - (10 - i) * 86_400_000,
      runId: `run-${i}`,
      overallScore: i < 5 ? 3.0 : 3.0,
      integrityIndex: 0.8,
      layerScores: {},
      evidenceCoverage: 0.9,
    }));
    const analysis = analyzeTimeSeries(points);
    expect(analysis.baseline).toBeCloseTo(3.0, 1);
  });
});
