/**
 * Self-Model Calibration Engine
 * Measures how accurately an agent can predict its own performance.
 * Self-Model Accuracy = 1 - |Predicted - Actual|
 * Includes Expected Calibration Error (ECE) and unknown-unknown detection.
 */

import { createHash, randomUUID } from "node:crypto";
import type {
  SelfModelPrediction,
  CalibrationBin,
  SelfModelCalibrationReport
} from "../values/valueTypes.js";

function sign(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

// ── Self-Model Accuracy ──────────────────────────────────────────────────────

/**
 * Compute self-model accuracy for a single prediction.
 * SelfModelAccuracy = 1 - |Predicted - Actual|
 */
export function computeSelfModelAccuracy(predicted: number, actual: number): number {
  return Math.max(0, 1 - Math.abs(predicted - actual));
}

/**
 * Compute overall self-model accuracy across all predictions.
 */
export function computeOverallSelfModelAccuracy(predictions: SelfModelPrediction[]): number {
  const completed = predictions.filter((p) => p.actualAccuracy !== undefined);
  if (completed.length === 0) return 0;

  const total = completed.reduce(
    (sum, p) => sum + computeSelfModelAccuracy(p.predictedAccuracy, p.actualAccuracy!),
    0
  );
  return total / completed.length;
}

// ── Confidence Calibration ───────────────────────────────────────────────────

/**
 * Build calibration bins: group predictions by predicted confidence,
 * then compare to actual success rate in each bin.
 */
export function buildCalibrationBins(
  predictions: SelfModelPrediction[],
  numBins: number = 10
): CalibrationBin[] {
  const completed = predictions.filter((p) => p.actualAccuracy !== undefined);
  if (completed.length === 0) return [];

  const binWidth = 1 / numBins;
  const bins: CalibrationBin[] = [];

  for (let i = 0; i < numBins; i++) {
    const binStart = i * binWidth;
    const binEnd = (i + 1) * binWidth;
    const inBin = completed.filter(
      (p) => p.predictedConfidence >= binStart && p.predictedConfidence < binEnd
    );

    if (inBin.length === 0) {
      bins.push({ binStart, binEnd, predictedConfidenceMean: (binStart + binEnd) / 2, actualSuccessRate: 0, count: 0 });
      continue;
    }

    const predictedMean = inBin.reduce((s, p) => s + p.predictedConfidence, 0) / inBin.length;
    const actualRate = inBin.reduce((s, p) => s + (p.actualAccuracy! >= 0.5 ? 1 : 0), 0) / inBin.length;

    bins.push({
      binStart,
      binEnd,
      predictedConfidenceMean: predictedMean,
      actualSuccessRate: actualRate,
      count: inBin.length
    });
  }

  return bins;
}

/**
 * Expected Calibration Error (ECE):
 * Weighted average of |predicted_confidence - actual_success_rate| per bin.
 */
export function computeECE(bins: CalibrationBin[]): number {
  const totalCount = bins.reduce((s, b) => s + b.count, 0);
  if (totalCount === 0) return 0;

  return bins.reduce((ece, bin) => {
    if (bin.count === 0) return ece;
    const weight = bin.count / totalCount;
    return ece + weight * Math.abs(bin.predictedConfidenceMean - bin.actualSuccessRate);
  }, 0);
}

// ── Unknown-Unknown Detection ────────────────────────────────────────────────

/**
 * Detect unknown-unknowns: tasks where the agent was confident but wrong.
 * High confidence (>0.7) + low actual accuracy (<0.3) = unknown-unknown.
 */
export function computeUnknownUnknownRate(predictions: SelfModelPrediction[]): number {
  const completed = predictions.filter((p) => p.actualAccuracy !== undefined);
  if (completed.length === 0) return 0;

  const unknownUnknowns = completed.filter(
    (p) => p.predictedConfidence > 0.7 && p.actualAccuracy! < 0.3
  );

  return unknownUnknowns.length / completed.length;
}

// ── Full Report ──────────────────────────────────────────────────────────────

export function generateSelfModelCalibrationReport(
  agentId: string,
  runId: string,
  predictions: SelfModelPrediction[]
): SelfModelCalibrationReport {
  const bins = buildCalibrationBins(predictions);
  const ece = computeECE(bins);
  const overallAccuracy = computeOverallSelfModelAccuracy(predictions);
  const unknownUnknownRate = computeUnknownUnknownRate(predictions);

  // Attach computed self-model accuracy to each prediction
  const enriched = predictions.map((p) => ({
    ...p,
    selfModelAccuracy: p.actualAccuracy !== undefined
      ? computeSelfModelAccuracy(p.predictedAccuracy, p.actualAccuracy)
      : undefined
  }));

  const report: Omit<SelfModelCalibrationReport, "signature"> = {
    agentId,
    runId,
    overallSelfModelAccuracy: overallAccuracy,
    expectedCalibrationError: ece,
    calibrationBins: bins,
    predictions: enriched,
    unknownUnknownRate
  };

  return { ...report, signature: sign(JSON.stringify(report)) };
}

/**
 * Create a new self-model prediction (before execution).
 */
export function createPrediction(
  agentId: string,
  runId: string,
  taskDescription: string,
  predictedAccuracy: number,
  predictedConfidence: number
): SelfModelPrediction {
  const prediction: Omit<SelfModelPrediction, "signature"> = {
    predictionId: randomUUID(),
    agentId,
    runId,
    taskDescription,
    predictedAccuracy,
    predictedConfidence,
    ts: Date.now()
  };
  return { ...prediction, signature: sign(JSON.stringify(prediction)) };
}

/**
 * Record actual outcome for a prediction.
 */
export function recordOutcome(
  prediction: SelfModelPrediction,
  actualAccuracy: number
): SelfModelPrediction {
  const updated = {
    ...prediction,
    actualAccuracy,
    selfModelAccuracy: computeSelfModelAccuracy(prediction.predictedAccuracy, actualAccuracy)
  };
  return { ...updated, signature: sign(JSON.stringify({ ...updated, signature: undefined })) };
}
