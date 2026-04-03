/**
 * Research Eval Suite — Index
 *
 * Re-exports all four research evaluation modules for the AMC steer pipeline.
 * Each module provides labeled corpora, evaluation functions, and statistical
 * metrics (confusion matrices, F1, bootstrap CIs, convergence analysis).
 */

export {
  buildConfusionMatrix,
  bootstrapMacroF1CI,
  computeClassMetrics,
  evaluateAutotuneClassification,
  LABELED_CORPUS,
} from "./eval_autotune_classification.js";
export type {
  ClassificationEvalResult,
  ClassMetrics,
  ConfusionMatrix,
  LabeledSample,
} from "./eval_autotune_classification.js";

export {
  computePercentiles,
  evaluateMonotonicity,
  evaluateScoringCalibration,
  evaluateTierDiscrimination,
  MONOTONICITY_CASES,
  TIERED_CORPUS,
} from "./eval_scoring_calibration.js";
export type {
  MonotonicityResult,
  MonotonicityTestCase,
  ScoringCalibrationResult,
  TierDiscriminationResult,
  TieredSample,
} from "./eval_scoring_calibration.js";

export {
  evaluateHygienePrecision,
  HEDGE_SAMPLES,
  PREAMBLE_SAMPLES,
  CASUAL_SAMPLES,
} from "./eval_hygiene_precision.js";
export type {
  HygienePrecisionResult,
  HygieneSample,
  TransformMetrics,
} from "./eval_hygiene_precision.js";

export {
  evaluateFeedbackConvergence,
  evaluateProfileSeparation,
  simulateConvergence,
  SYNTHETIC_PROFILES,
} from "./eval_feedback_convergence.js";
export type {
  ConvergenceResult,
  ConvergenceTracePoint,
  FeedbackConvergenceEvalResult,
  ProfileSeparationResult,
  SyntheticUserProfile,
} from "./eval_feedback_convergence.js";
