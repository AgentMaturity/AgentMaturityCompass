import { mean } from "../experiments/stats.js";
import type {
  ConfidenceDriftEntry,
  ConfidenceDriftReport,
  DiagnosticReport,
  QuestionScore
} from "../types.js";
import { computeCalibratedConfidence } from "./calibration.js";

interface ConfidenceTimeSeries {
  questionId: string;
  entries: ConfidenceDriftEntry[];
}

function extractTimeSeriesForQuestion(
  questionId: string,
  reports: DiagnosticReport[]
): ConfidenceTimeSeries {
  const sortedReports = [...reports].sort((a, b) => a.ts - b.ts);
  const entries: ConfidenceDriftEntry[] = [];

  for (const report of sortedReports) {
    const questionScore = report.questionScores.find((q) => q.questionId === questionId);
    if (!questionScore) {
      continue;
    }

    const calibratedConfidence =
      reports.length >= 3 ? computeCalibratedConfidence(questionId, questionScore.confidence, reports) : null;

    entries.push({
      questionId,
      runId: report.runId,
      ts: report.ts,
      confidence: questionScore.confidence,
      finalLevel: questionScore.finalLevel,
      calibratedConfidence
    });
  }

  return {
    questionId,
    entries
  };
}

function computeAverageConfidence(entries: ConfidenceDriftEntry[], count: number): number | null {
  if (entries.length === 0 || count <= 0) {
    return null;
  }

  const taken = entries.slice(0, Math.min(count, entries.length));
  if (taken.length === 0) {
    return null;
  }

  return mean(taken.map((entry) => entry.confidence));
}

function computeLastAverageConfidence(entries: ConfidenceDriftEntry[], count: number): number | null {
  if (entries.length === 0 || count <= 0) {
    return null;
  }

  const startIdx = Math.max(0, entries.length - count);
  const taken = entries.slice(startIdx);

  if (taken.length === 0) {
    return null;
  }

  return mean(taken.map((entry) => entry.confidence));
}

export function trackConfidenceDrift(
  agentId: string,
  questionId: string,
  reports: DiagnosticReport[]
): ConfidenceDriftReport {
  const timeSeries = extractTimeSeriesForQuestion(questionId, reports);
  const entries = timeSeries.entries;

  const avgFirst5 = computeAverageConfidence(entries, 5);
  const avgLast5 = computeLastAverageConfidence(entries, 5);

  let confidenceDelta: number | null = null;
  let trendDirection: "IMPROVING" | "DEGRADING" | "STABLE" | "INSUFFICIENT_DATA";

  if (entries.length < 3) {
    trendDirection = "INSUFFICIENT_DATA";
  } else if (avgFirst5 === null || avgLast5 === null) {
    trendDirection = "INSUFFICIENT_DATA";
  } else {
    confidenceDelta = avgLast5 - avgFirst5;

    if (confidenceDelta > 0.05) {
      trendDirection = "IMPROVING";
    } else if (confidenceDelta < -0.05) {
      trendDirection = "DEGRADING";
    } else {
      trendDirection = "STABLE";
    }
  }

  return {
    agentId,
    questionId,
    entries,
    trendDirection,
    avgConfidenceFirst5: avgFirst5,
    avgConfidenceLast5: avgLast5,
    confidenceDelta
  };
}

export interface ConfidenceAnomaly {
  questionId: string;
  runId: string;
  delta: number;
}

export function findConfidenceAnomalies(
  reports: DiagnosticReport[],
  threshold: number = 0.3
): ConfidenceAnomaly[] {
  const sortedReports = [...reports].sort((a, b) => a.ts - b.ts);

  if (sortedReports.length < 2) {
    return [];
  }

  const anomalies: ConfidenceAnomaly[] = [];

  for (let i = 0; i < sortedReports.length - 1; i++) {
    const reportN = sortedReports[i];
    const reportN1 = sortedReports[i + 1];
    if (!reportN || !reportN1) {
      continue;
    }

    const scoresMapN = new Map<string, number>();
    for (const score of reportN.questionScores) {
      scoresMapN.set(score.questionId, score.confidence);
    }

    for (const scoreN1 of reportN1.questionScores) {
      const confN = scoresMapN.get(scoreN1.questionId);
      if (confN === undefined) {
        continue;
      }

      const delta = scoreN1.confidence - confN;

      if (delta < -threshold) {
        anomalies.push({
          questionId: scoreN1.questionId,
          runId: reportN1.runId,
          delta: Number(delta.toFixed(4))
        });
      }
    }
  }

  return anomalies;
}

export interface ConfidenceDriftAlert {
  questionId: string;
  severity: "WARN" | "CRITICAL";
  message: string;
}

export function generateConfidenceDriftAlerts(
  agentId: string,
  reports: DiagnosticReport[]
): ConfidenceDriftAlert[] {
  const alerts: ConfidenceDriftAlert[] = [];
  const sortedReports = [...reports].sort((a, b) => a.ts - b.ts);

  if (sortedReports.length === 0) {
    return alerts;
  }

  const allQuestionIds = new Set<string>();
  for (const report of sortedReports) {
    for (const score of report.questionScores) {
      allQuestionIds.add(score.questionId);
    }
  }

  for (const questionId of allQuestionIds) {
    const driftReport = trackConfidenceDrift(agentId, questionId, sortedReports);

    const anomalies = findConfidenceAnomalies(sortedReports, 0.4);
    const questionAnomalies = anomalies.filter((a) => a.questionId === questionId);
    if (questionAnomalies.length > 0) {
      const maxDrop = Math.min(...questionAnomalies.map((a) => a.delta));
      alerts.push({
        questionId,
        severity: "CRITICAL",
        message: `confidence dropped ${(Math.abs(maxDrop) * 100).toFixed(1)}% in a single run (threshold: 40%)`
      });
    }

    if (
      driftReport.trendDirection === "DEGRADING" &&
      driftReport.confidenceDelta !== null &&
      driftReport.confidenceDelta < -0.1
    ) {
      alerts.push({
        questionId,
        severity: "WARN",
        message: `confidence degrading trend over last 5 runs: delta=${driftReport.confidenceDelta.toFixed(3)}`
      });
    }

    const lastReport = sortedReports[sortedReports.length - 1];
    if (!lastReport) {
      continue;
    }
    const lastScore = lastReport.questionScores.find((q) => q.questionId === questionId);
    if (lastScore && lastScore.confidence < 0.3 && lastScore.finalLevel >= 3) {
      alerts.push({
        questionId,
        severity: "WARN",
        message: `low confidence (${lastScore.confidence.toFixed(2)}) on high-level claim (level ${lastScore.finalLevel})`
      });
    }
  }

  return alerts;
}
