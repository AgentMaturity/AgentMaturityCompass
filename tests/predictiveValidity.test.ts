import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  analyzePredictionLog,
  computeCalibrationScore,
  computeInterRaterReliability,
  computeScoreStability,
  detectLongitudinalDrift,
  parsePredictionLogMarkdown,
  trackPredictionLog,
  type ScoreObservation,
  type ValidityPredictionEntry,
} from "../src/score/predictiveValidity.js";

function makePrediction(
  overrides: Partial<ValidityPredictionEntry> = {},
): ValidityPredictionEntry {
  return {
    predictionId: "pred-1",
    timestamp: new Date("2026-02-01T00:00:00.000Z"),
    agentId: "agent-a",
    predictedOutcome: "success",
    confidence: 0.8,
    actualOutcome: "success",
    wasCorrect: true,
    evaluatorId: "eva-1",
    runId: "run-1",
    score: 80,
    ...overrides,
  };
}

function makeObservation(
  score: number,
  dayOffset: number,
  agentId: string = "agent-a",
): ScoreObservation {
  return {
    agentId,
    score,
    timestamp: Date.UTC(2026, 1, 1 + dayOffset),
  };
}

describe("parsePredictionLogMarkdown", () => {
  test("parses markdown-table pattern used by PREDICTION_LOG.md", () => {
    const markdown = `
| timestamp | agent_id | prediction_id | predicted_outcome | confidence | actual_outcome | score | evaluator |
|---|---|---|---|---|---|---|---|
| 2026-02-18T12:00:00Z | agent-a | p-1 | success | 0.80 | success | 82 | r1 |
| 2026-02-19T12:00:00Z | agent-a | p-2 | fail | 35% | success | 74 | r2 |
`;

    const entries = parsePredictionLogMarkdown(markdown);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.predictionId).toBe("p-1");
    expect(entries[0]?.wasCorrect).toBe(true);
    expect(entries[1]?.confidence).toBeCloseTo(0.35, 6);
    expect(entries[1]?.wasCorrect).toBe(false);
  });
});

describe("computeCalibrationScore", () => {
  test("computes ECE metric for resolved predictions", () => {
    const rows: ValidityPredictionEntry[] = [];
    for (let i = 0; i < 20; i += 1) {
      rows.push(makePrediction({ predictionId: `t-${i}`, confidence: 1, wasCorrect: true }));
      rows.push(makePrediction({
        predictionId: `f-${i}`,
        confidence: 0,
        predictedOutcome: "fail",
        actualOutcome: "success",
        wasCorrect: false,
      }));
    }

    const report = computeCalibrationScore(rows, 10);
    expect(report.resolvedPredictions).toBe(40);
    expect(report.expectedCalibrationError).toBeCloseTo(0, 6);
    expect(report.maximumCalibrationError).toBeCloseTo(0, 6);
    expect(report.brierScore).toBeCloseTo(0, 6);
    expect(report.quality).toBe("excellent");
  });

  test("tracks unresolved predictions separately", () => {
    const report = computeCalibrationScore([
      makePrediction({ predictionId: "ok-1", wasCorrect: true }),
      makePrediction({
        predictionId: "pending-1",
        actualOutcome: undefined,
        wasCorrect: undefined,
      }),
    ]);

    expect(report.totalPredictions).toBe(2);
    expect(report.resolvedPredictions).toBe(1);
    expect(report.unresolvedPredictions).toBe(1);
  });
});

describe("computeInterRaterReliability", () => {
  test("reports high reliability for consistent raters", () => {
    const report = computeInterRaterReliability([
      { agentId: "agent-a", runId: "r1", evaluatorId: "alice", score: 80 },
      { agentId: "agent-a", runId: "r1", evaluatorId: "bob", score: 82 },
      { agentId: "agent-a", runId: "r1", evaluatorId: "carol", score: 81 },
      { agentId: "agent-a", runId: "r2", evaluatorId: "alice", score: 74 },
      { agentId: "agent-a", runId: "r2", evaluatorId: "bob", score: 75 },
      { agentId: "agent-a", runId: "r2", evaluatorId: "carol", score: 76 },
    ]);

    expect(report.targetsWithMultipleRaters).toBe(2);
    expect(report.averagePairwiseDifference).toBeLessThan(3);
    expect(report.agreementScore).toBeGreaterThan(0.95);
    expect(["excellent", "good"]).toContain(report.quality);
  });

  test("reports poor reliability for contradictory raters", () => {
    const report = computeInterRaterReliability([
      { agentId: "agent-a", runId: "r1", evaluatorId: "alice", score: 20 },
      { agentId: "agent-a", runId: "r1", evaluatorId: "bob", score: 80 },
      { agentId: "agent-a", runId: "r2", evaluatorId: "alice", score: 85 },
      { agentId: "agent-a", runId: "r2", evaluatorId: "bob", score: 25 },
    ]);

    expect(report.averagePairwiseDifference).toBeGreaterThan(40);
    expect(report.intraclassCorrelation).toBeLessThan(0.5);
    expect(report.quality).toBe("poor");
  });
});

describe("score stability", () => {
  test("high stability index for repeatable scores", () => {
    const report = computeScoreStability([
      makeObservation(70, 0),
      makeObservation(71, 1),
      makeObservation(70, 2),
      makeObservation(72, 3),
    ]);

    expect(report.sampleSize).toBe(4);
    expect(report.stabilityIndex).toBeGreaterThan(0.85);
    expect(report.stabilityBand).toBe("high");
  });

  test("low stability index for volatile scores", () => {
    const report = computeScoreStability([
      makeObservation(20, 0),
      makeObservation(90, 1),
      makeObservation(30, 2),
      makeObservation(95, 3),
    ]);

    expect(report.stabilityIndex).toBeLessThan(0.65);
    expect(report.stabilityBand).toBe("low");
  });
});

describe("detectLongitudinalDrift", () => {
  test("detects improving trajectory", () => {
    const report = detectLongitudinalDrift([
      makeObservation(40, 0),
      makeObservation(46, 3),
      makeObservation(54, 6),
      makeObservation(62, 9),
    ]);

    expect(report.direction).toBe("improving");
    expect(report.delta).toBeGreaterThan(0);
    expect(report.slopePer30Days).toBeGreaterThan(0);
  });

  test("detects degrading trajectory", () => {
    const report = detectLongitudinalDrift([
      makeObservation(90, 0),
      makeObservation(82, 3),
      makeObservation(75, 6),
      makeObservation(68, 9),
    ]);

    expect(report.direction).toBe("degrading");
    expect(report.delta).toBeLessThan(0);
    expect(report.slopePer30Days).toBeLessThan(0);
  });
});

describe("prediction log analysis and tracking", () => {
  test("analyzePredictionLog composes calibration, reliability, stability, and drift", () => {
    const entries: ValidityPredictionEntry[] = [
      makePrediction({ predictionId: "a-1", runId: "run-1", score: 60, confidence: 0.8, wasCorrect: true }),
      makePrediction({ predictionId: "a-2", runId: "run-1", evaluatorId: "eva-2", score: 62, confidence: 0.7, wasCorrect: true }),
      makePrediction({ predictionId: "a-3", runId: "run-2", score: 70, timestamp: new Date("2026-02-10T00:00:00.000Z"), confidence: 0.8, wasCorrect: true }),
      makePrediction({ predictionId: "a-4", runId: "run-3", score: 78, timestamp: new Date("2026-02-15T00:00:00.000Z"), confidence: 0.9, wasCorrect: true }),
      makePrediction({
        predictionId: "b-1",
        agentId: "agent-b",
        runId: "run-1",
        score: 88,
        timestamp: new Date("2026-02-01T00:00:00.000Z"),
        confidence: 0.9,
        wasCorrect: true,
      }),
      makePrediction({
        predictionId: "b-2",
        agentId: "agent-b",
        runId: "run-2",
        score: 76,
        timestamp: new Date("2026-02-10T00:00:00.000Z"),
        confidence: 0.9,
        wasCorrect: false,
      }),
      makePrediction({
        predictionId: "b-3",
        agentId: "agent-b",
        runId: "run-3",
        score: 68,
        timestamp: new Date("2026-02-15T00:00:00.000Z"),
        confidence: 0.85,
        wasCorrect: false,
      }),
    ];

    const report = analyzePredictionLog(entries);
    expect(report.totalEntries).toBe(7);
    expect(report.resolvedEntries).toBe(7);
    expect(report.interRaterReliability.totalRatings).toBeGreaterThan(0);
    expect(report.stabilityByAgent["agent-a"]).toBeDefined();
    expect(report.driftByAgent["agent-b"]).toBeDefined();
    expect(report.improvingAgents).toContain("agent-a");
    expect(report.degradingAgents).toContain("agent-b");
  });

  test("trackPredictionLog returns warning when file is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "amc-validity-missing-"));
    try {
      const report = trackPredictionLog(dir);
      expect(report.fileFound).toBe(false);
      expect(report.entries).toHaveLength(0);
      expect(report.warnings.length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("trackPredictionLog parses and analyzes PREDICTION_LOG.md automatically", () => {
    const dir = mkdtempSync(join(tmpdir(), "amc-validity-log-"));
    const amcDir = join(dir, ".amc");
    mkdirSync(amcDir, { recursive: true });
    writeFileSync(
      join(amcDir, "PREDICTION_LOG.md"),
      `
| ts | agent | prediction_id | predicted | confidence | actual | correct | evaluator | run_id | score |
|---|---|---|---|---|---|---|---|---|---|
| 2026-02-18T00:00:00Z | agent-a | p-1 | success | 0.8 | success | true | r1 | run-1 | 72 |
| 2026-02-19T00:00:00Z | agent-a | p-2 | success | 0.7 | fail | false | r2 | run-1 | 74 |
`,
      "utf8",
    );

    try {
      const report = trackPredictionLog(dir);
      expect(report.fileFound).toBe(true);
      expect(report.entries).toHaveLength(2);
      expect(report.analysis.totalEntries).toBe(2);
      expect(report.analysis.calibration.resolvedPredictions).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
