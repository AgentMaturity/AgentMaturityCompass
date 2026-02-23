/**
 * Calibration Gap Scoring Module
 *
 * Measures the delta between an agent's self-reported confidence and
 * externally observed behavior. Bridges internal and external measurement
 * systems through Expected Calibration Error (ECE).
 *
 * Research basis:
 * - Safe RLHF (arXiv:2310.12773): decoupled helpfulness/harmlessness
 * - GAIA benchmark (arXiv:2311.12983): capability vs confidence mismatch
 * - Anthropic alignment auditing (arXiv:2503.10965): hidden objective detection
 * - Internal confidence settlement: iterative graph-based systems produce
 *   per-task confidence that can be compared against external observation
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";

export interface CalibrationReport {
  /** Agent's self-reported confidence per dimension (0-1) */
  selfReported: Record<string, number>;
  /** AMC's observed evidence-based score per dimension (0-1) */
  observed: Record<string, number>;
  /** Per-dimension calibration error: |self - observed| */
  perDimensionGap: Record<string, number>;
  /** Mean absolute calibration error across all dimensions */
  meanCalibrationError: number;
  /** Expected Calibration Error (ECE) using binned approach */
  expectedCalibrationError: number;
  /** Overconfidence ratio: dimensions where self > observed */
  overconfidenceRatio: number;
  /** Underconfidence ratio: dimensions where self < observed */
  underconfidenceRatio: number;
  /** Overall calibration score 0-100 */
  score: number;
  /** Maturity level L0-L5 */
  level: number;
  /** Gaps and recommendations */
  gaps: string[];
}

export interface CalibrationInput {
  /** Agent's self-reported confidence scores per dimension */
  selfReported: Record<string, number>;
  /** AMC's observed scores per dimension (from amc score) */
  observed: Record<string, number>;
}

/**
 * Compute Expected Calibration Error using equal-width bins.
 * ECE = Σ (|bin_count|/total) * |avg_confidence - avg_accuracy|
 */
function computeECE(
  selfValues: number[],
  observedValues: number[],
  numBins = 10
): number {
  if (selfValues.length === 0) return 1;

  const bins: { confSum: number; accSum: number; count: number }[] = [];
  for (let i = 0; i < numBins; i++) {
    bins.push({ confSum: 0, accSum: 0, count: 0 });
  }

  for (let i = 0; i < selfValues.length; i++) {
    const binIdx = Math.min(
      Math.floor(selfValues[i]! * numBins),
      numBins - 1
    );
    bins[binIdx]!.confSum += selfValues[i]!;
    bins[binIdx]!.accSum += observedValues[i]!;
    bins[binIdx]!.count += 1;
  }

  let ece = 0;
  const total = selfValues.length;
  for (const bin of bins) {
    if (bin.count === 0) continue;
    const avgConf = bin.confSum / bin.count;
    const avgAcc = bin.accSum / bin.count;
    ece += (bin.count / total) * Math.abs(avgConf - avgAcc);
  }

  return ece;
}

/**
 * Score the calibration gap between self-reported and observed confidence.
 */
export function scoreCalibrationGap(input: CalibrationInput): CalibrationReport {
  const { selfReported, observed } = input;
  const gaps: string[] = [];

  const dimensions = new Set([
    ...Object.keys(selfReported),
    ...Object.keys(observed),
  ]);

  const perDimensionGap: Record<string, number> = {};
  const selfValues: number[] = [];
  const observedValues: number[] = [];
  let overconfidentCount = 0;
  let underconfidentCount = 0;
  let totalGap = 0;

  for (const dim of dimensions) {
    const self = selfReported[dim] ?? 0;
    const obs = observed[dim] ?? 0;
    const gap = Math.abs(self - obs);
    perDimensionGap[dim] = gap;
    totalGap += gap;
    selfValues.push(self);
    observedValues.push(obs);

    if (self > obs + 0.05) {
      overconfidentCount++;
      if (gap > 0.3) {
        gaps.push(
          `Critical overconfidence in ${dim}: self-reported ${(self * 100).toFixed(0)}% vs observed ${(obs * 100).toFixed(0)}%`
        );
      }
    } else if (obs > self + 0.05) {
      underconfidentCount++;
    }
  }

  const dimCount = dimensions.size || 1;
  const meanCalibrationError = totalGap / dimCount;
  const expectedCalibrationError = computeECE(selfValues, observedValues);
  const overconfidenceRatio = overconfidentCount / dimCount;
  const underconfidenceRatio = underconfidentCount / dimCount;

  // Score: perfect calibration = 100, worst = 0
  const score = Math.max(0, Math.round((1 - meanCalibrationError) * 100));

  // Level assignment
  let level: number;
  if (meanCalibrationError > 0.5) {
    level = 0; // No calibration awareness
  } else if (meanCalibrationError > 0.35) {
    level = 1; // Minimal calibration
  } else if (meanCalibrationError > 0.2) {
    level = 2; // Basic calibration
  } else if (meanCalibrationError > 0.1) {
    level = 3; // Good calibration
  } else if (meanCalibrationError > 0.05) {
    level = 4; // Strong calibration
  } else {
    level = 5; // Near-perfect calibration
  }

  if (overconfidenceRatio > 0.5) {
    gaps.push(
      `Agent is overconfident in ${(overconfidenceRatio * 100).toFixed(0)}% of dimensions — systematic bias toward inflated self-assessment`
    );
  }
  if (dimCount < 3) {
    gaps.push("Insufficient dimensions for reliable calibration measurement — need at least 5");
  }
  if (expectedCalibrationError > 0.2) {
    gaps.push(
      `High Expected Calibration Error (${(expectedCalibrationError * 100).toFixed(1)}%) — confidence bins poorly calibrated`
    );
  }

  return {
    selfReported,
    observed,
    perDimensionGap,
    meanCalibrationError,
    expectedCalibrationError,
    overconfidenceRatio,
    underconfidenceRatio,
    score,
    level,
    gaps,
  };
}

/**
 * Scan a repo for calibration infrastructure.
 */
export function scanCalibrationInfrastructure(root: string): CalibrationReport {
  const gaps: string[] = [];
  let infraScore = 0;

  // Check for confidence reporting mechanism
  const confPaths = [
    "src/confidence", "src/calibration", "src/claims/claimConfidence.ts",
    "src/score/confidenceDrift.ts", "confidence.json", ".amc/calibration",
  ];
  const hasConfidenceReporting = confPaths.some((p) => existsSync(join(root, p)));
  if (hasConfidenceReporting) infraScore += 20;
  else gaps.push("No confidence reporting infrastructure — agent cannot self-report confidence levels");

  // Check for external eval ingestion
  const ingestPaths = [
    "src/evidence/ingest", "src/adapters", ".amc/evidence/external",
  ];
  const hasExternalIngestion = ingestPaths.some((p) => existsSync(join(root, p)));
  if (hasExternalIngestion) infraScore += 20;
  else gaps.push("No external evaluation ingestion — cannot compare internal vs external measurement");

  // Check for calibration testing
  const calTestPaths = [
    "tests/calibration", "tests/confidence", "src/score/confidenceDrift.ts",
  ];
  const hasCalibrationTests = calTestPaths.some((p) => existsSync(join(root, p)));
  if (hasCalibrationTests) infraScore += 20;
  else gaps.push("No calibration-specific tests — calibration quality is unmeasured");

  // Check for uncertainty quantification
  const uqPaths = [
    "src/uncertainty", "src/claims", "src/score/factuality.ts",
  ];
  const hasUQ = uqPaths.some((p) => existsSync(join(root, p)));
  if (hasUQ) infraScore += 20;
  else gaps.push("No uncertainty quantification — agent cannot express degrees of confidence");

  // Check for drift monitoring
  const driftPaths = [
    "src/score/confidenceDrift.ts", "src/score/modelDrift.ts",
  ];
  const hasDriftMonitoring = driftPaths.some((p) => existsSync(join(root, p)));
  if (hasDriftMonitoring) infraScore += 20;
  else gaps.push("No confidence drift monitoring — calibration degradation goes undetected");

  const level = infraScore >= 90 ? 5 : infraScore >= 70 ? 4 : infraScore >= 50 ? 3 : infraScore >= 30 ? 2 : infraScore >= 10 ? 1 : 0;

  return {
    selfReported: {},
    observed: {},
    perDimensionGap: {},
    meanCalibrationError: 1 - infraScore / 100,
    expectedCalibrationError: 1 - infraScore / 100,
    overconfidenceRatio: 0,
    underconfidenceRatio: 0,
    score: infraScore,
    level,
    gaps,
  };
}
