/**
 * Prediction-vs-outcome calibration utilities.
 *
 * Focus: deterministic scoring for how well confidence estimates
 * match realized outcomes.
 */

export interface PredictionOutcome {
  predictionId?: string;
  /** Confidence / probability in [0,1] that outcome=true. */
  confidence: number;
  /** Realized ground truth. */
  outcome: boolean;
  /** Optional importance multiplier (default=1). */
  weight?: number;
  ts?: number;
}

export interface CalibrationBin {
  index: number;
  minConfidence: number;
  maxConfidence: number;
  count: number;
  weight: number;
  avgConfidence: number;
  empiricalRate: number;
  calibrationGap: number;
}

export interface ConfidenceQualityReport {
  sampleSize: number;
  weightedSampleSize: number;
  binCount: number;
  accuracy: number;
  meanConfidence: number;
  outcomeRate: number;
  calibrationBias: number;
  meanAbsoluteCalibrationError: number;
  expectedCalibrationError: number;
  maximumCalibrationError: number;
  brierScore: number;
  logLoss: number;
  sharpness: number;
  qualityLabel: "EXCELLENT" | "GOOD" | "FAIR" | "POOR" | "INSUFFICIENT_DATA";
  bins: CalibrationBin[];
}

export interface CalibrationOptions {
  /** Reliability bins for ECE/MCE and reliability table. */
  binCount?: number;
  /** Numeric epsilon for stable log-loss clipping. */
  epsilon?: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function qualityLabel(report: Omit<ConfidenceQualityReport, "qualityLabel">): ConfidenceQualityReport["qualityLabel"] {
  if (report.sampleSize < 20) return "INSUFFICIENT_DATA";

  // Weighted blend: prioritize calibration, then probabilistic loss quality.
  const calibrationComponent = 1 - Math.min(1, report.expectedCalibrationError / 0.25);
  const brierComponent = 1 - Math.min(1, report.brierScore / 0.35);
  const lossComponent = 1 - Math.min(1, report.logLoss / 1.25);
  const score = 0.5 * calibrationComponent + 0.3 * brierComponent + 0.2 * lossComponent;

  if (score >= 0.85) return "EXCELLENT";
  if (score >= 0.7) return "GOOD";
  if (score >= 0.5) return "FAIR";
  return "POOR";
}

export function computeConfidenceQuality(
  rows: PredictionOutcome[],
  options: CalibrationOptions = {}
): ConfidenceQualityReport {
  const binCount = Math.max(2, Math.min(100, Math.floor(options.binCount ?? 10)));
  const epsilon = Math.max(1e-12, Math.min(1e-3, options.epsilon ?? 1e-9));

  if (rows.length === 0) {
    return {
      sampleSize: 0,
      weightedSampleSize: 0,
      binCount,
      accuracy: 0,
      meanConfidence: 0,
      outcomeRate: 0,
      calibrationBias: 0,
      meanAbsoluteCalibrationError: 0,
      expectedCalibrationError: 0,
      maximumCalibrationError: 0,
      brierScore: 0,
      logLoss: 0,
      sharpness: 0,
      qualityLabel: "INSUFFICIENT_DATA",
      bins: []
    };
  }

  const normalized = rows.map((row) => {
    const confidence = clamp01(row.confidence);
    const y = row.outcome ? 1 : 0;
    const weight = row.weight && row.weight > 0 && Number.isFinite(row.weight) ? row.weight : 1;
    return { confidence, y, weight };
  });

  const totalWeight = normalized.reduce((sum, row) => sum + row.weight, 0);
  const weightedMeanConfidence = normalized.reduce((sum, row) => sum + row.confidence * row.weight, 0) / totalWeight;
  const weightedOutcomeRate = normalized.reduce((sum, row) => sum + row.y * row.weight, 0) / totalWeight;

  const weightedAccuracy =
    normalized.reduce((sum, row) => {
      const pred = row.confidence >= 0.5 ? 1 : 0;
      return sum + (pred === row.y ? row.weight : 0);
    }, 0) / totalWeight;

  const brierScore =
    normalized.reduce((sum, row) => {
      const err = row.confidence - row.y;
      return sum + err * err * row.weight;
    }, 0) / totalWeight;

  const logLoss =
    normalized.reduce((sum, row) => {
      const p = Math.min(1 - epsilon, Math.max(epsilon, row.confidence));
      const loss = -(row.y * Math.log(p) + (1 - row.y) * Math.log(1 - p));
      return sum + loss * row.weight;
    }, 0) / totalWeight;

  const calibrationBias =
    normalized.reduce((sum, row) => sum + (row.confidence - row.y) * row.weight, 0) / totalWeight;

  const maeCalibration =
    normalized.reduce((sum, row) => sum + Math.abs(row.confidence - row.y) * row.weight, 0) / totalWeight;

  // Unlike the unweighted variance in experiments/stats.ts, calibration weights each observation by its declared reliability.
  const variance =
    normalized.reduce((sum, row) => {
      const diff = row.confidence - weightedMeanConfidence;
      return sum + diff * diff * row.weight;
    }, 0) / totalWeight;

  const binAgg = Array.from({ length: binCount }, (_, i) => ({
    index: i,
    minConfidence: i / binCount,
    maxConfidence: (i + 1) / binCount,
    weight: 0,
    confSum: 0,
    outcomeSum: 0
  }));

  for (const row of normalized) {
    const idx = Math.min(binCount - 1, Math.floor(row.confidence * binCount));
    const bin = binAgg[idx]!;
    bin.weight += row.weight;
    bin.confSum += row.confidence * row.weight;
    bin.outcomeSum += row.y * row.weight;
  }

  const bins: CalibrationBin[] = [];
  let eceNumerator = 0;
  let mce = 0;

  for (const bin of binAgg) {
    if (bin.weight <= 0) continue;
    const avgConfidence = bin.confSum / bin.weight;
    const empiricalRate = bin.outcomeSum / bin.weight;
    const gap = avgConfidence - empiricalRate;
    const absGap = Math.abs(gap);
    eceNumerator += absGap * bin.weight;
    mce = Math.max(mce, absGap);

    bins.push({
      index: bin.index,
      minConfidence: Number(bin.minConfidence.toFixed(6)),
      maxConfidence: Number(bin.maxConfidence.toFixed(6)),
      count: Math.round(bin.weight),
      weight: Number(bin.weight.toFixed(6)),
      avgConfidence: Number(avgConfidence.toFixed(6)),
      empiricalRate: Number(empiricalRate.toFixed(6)),
      calibrationGap: Number(gap.toFixed(6))
    });
  }

  const base: Omit<ConfidenceQualityReport, "qualityLabel"> = {
    sampleSize: rows.length,
    weightedSampleSize: Number(totalWeight.toFixed(6)),
    binCount,
    accuracy: Number(weightedAccuracy.toFixed(6)),
    meanConfidence: Number(weightedMeanConfidence.toFixed(6)),
    outcomeRate: Number(weightedOutcomeRate.toFixed(6)),
    calibrationBias: Number(calibrationBias.toFixed(6)),
    meanAbsoluteCalibrationError: Number(maeCalibration.toFixed(6)),
    expectedCalibrationError: Number((eceNumerator / totalWeight).toFixed(6)),
    maximumCalibrationError: Number(mce.toFixed(6)),
    brierScore: Number(brierScore.toFixed(6)),
    logLoss: Number(logLoss.toFixed(6)),
    sharpness: Number(Math.sqrt(Math.max(0, variance)).toFixed(6)),
    bins
  };

  return {
    ...base,
    qualityLabel: qualityLabel(base)
  };
}

function pct(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export function renderConfidenceQualityMarkdown(report: ConfidenceQualityReport): string {
  const lines = [
    "# Confidence Quality Report",
    "",
    `- Sample size: ${report.sampleSize} (weighted=${report.weightedSampleSize})`,
    `- Quality label: ${report.qualityLabel}`,
    `- Accuracy: ${pct(report.accuracy)}`,
    `- Mean confidence: ${pct(report.meanConfidence)}`,
    `- Outcome rate: ${pct(report.outcomeRate)}`,
    `- Calibration bias (conf - outcome): ${report.calibrationBias >= 0 ? "+" : ""}${pct(report.calibrationBias)}`,
    `- ECE: ${pct(report.expectedCalibrationError)}`,
    `- MCE: ${pct(report.maximumCalibrationError)}`,
    `- MAE calibration: ${pct(report.meanAbsoluteCalibrationError)}`,
    `- Brier score: ${report.brierScore.toFixed(4)}`,
    `- Log loss: ${report.logLoss.toFixed(4)}`,
    `- Sharpness (stdev of confidence): ${report.sharpness.toFixed(4)}`,
    "",
    "## Reliability bins",
    "",
    "| Bin | Range | n | avg confidence | empirical outcome | gap |",
    "|---|---:|---:|---:|---:|---:|"
  ];

  if (report.bins.length === 0) {
    lines.push("| - | - | 0 | - | - | - |");
  } else {
    for (const bin of report.bins) {
      lines.push(
        `| ${bin.index} | [${bin.minConfidence.toFixed(2)}, ${bin.maxConfidence.toFixed(2)}) | ${bin.count} | ${pct(bin.avgConfidence)} | ${pct(bin.empiricalRate)} | ${bin.calibrationGap >= 0 ? "+" : ""}${pct(bin.calibrationGap)} |`
      );
    }
  }

  lines.push("", "## Interpretation", "", "- Positive gap means over-confidence; negative means under-confidence.");
  lines.push("- Good calibration keeps ECE/MCE low while maintaining useful sharpness.");
  lines.push("");
  return lines.join("\n");
}
