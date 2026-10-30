import type { EvidenceOutcome } from "../types.js";

export interface ValidityPredictionEntry {
  predictionId: string;
  timestamp: Date;
  agentId: string;
  predictedOutcome: string;
  confidence: number; // 0..1
  actualOutcome?: string;
  wasCorrect?: boolean;
  evaluatorId?: string;
  runId?: string;
  score?: number; // 0..100 (optional run/evaluator score)
}

export interface CalibrationBin {
  index: number;
  minConfidence: number;
  maxConfidence: number;
  sampleCount: number;
  avgConfidence: number;
  accuracy: number;
  gap: number; // avgConfidence - accuracy
}

export interface CalibrationScore {
  totalPredictions: number;
  resolvedPredictions: number;
  unresolvedPredictions: number;
  expectedCalibrationError: number; // ECE
  maximumCalibrationError: number; // MCE
  brierScore: number;
  calibrationBias: number;
  overconfidenceRate: number;
  underconfidenceRate: number;
  bins: CalibrationBin[];
  quality: "excellent" | "good" | "fair" | "poor" | "insufficient-data";
}

export interface InterRaterScore {
  agentId: string;
  evaluatorId: string;
  score: number;
  runId?: string;
}

export interface InterRaterTargetAgreement {
  targetId: string;
  raterCount: number;
  minScore: number;
  maxScore: number;
  scoreRange: number;
  stdDeviation: number;
}

export interface InterRaterReliabilityReport {
  outcome: EvidenceOutcome;
  sampleSize: number;
  metricOutcomes: Record<string, EvidenceOutcome>;
  totalRatings: number;
  totalTargets: number;
  targetsWithMultipleRaters: number;
  totalRaters: number;
  averageRatersPerTarget: number | null;
  multiRaterCoverage: number | null;
  averagePairwiseDifference: number | null;
  agreementScore: number | null; // 0..1
  intraclassCorrelation: number; // -1..1
  quality: "excellent" | "good" | "moderate" | "poor" | "insufficient-data";
  perTargetAgreement: InterRaterTargetAgreement[];
}

export interface ScoreObservation {
  agentId: string;
  score: number; // 0..100
  timestamp: Date | string | number;
  runId?: string;
  evaluatorId?: string;
}

export interface ScoreStabilityReport {
  outcome: EvidenceOutcome;
  metricOutcomes: Record<string, EvidenceOutcome>;
  agentId: string;
  sampleSize: number;
  meanScore: number | null;
  standardDeviation: number | null;
  coefficientOfVariation: number | null;
  meanAbsoluteDelta: number | null;
  maxDelta: number | null;
  stabilityIndex: number | null; // 0..1
  stabilityBand: "high" | "medium" | "low" | "insufficient-data";
}

export interface LongitudinalDriftReport {
  agentId: string;
  sampleSize: number;
  baselineMean: number;
  recentMean: number;
  delta: number;
  deltaPercent: number;
  slopePerDay: number;
  slopePer30Days: number;
  predictedScore30Days: number;
  recentVolatility: number;
  direction: "improving" | "degrading" | "stable" | "insufficient-data";
  severity: "none" | "low" | "medium" | "high";
}

export interface PredictionLogAnalysis {
  totalEntries: number;
  resolvedEntries: number;
  unresolvedEntries: number;
  resolutionRate: number;
  calibration: CalibrationScore;
  interRaterReliability: InterRaterReliabilityReport;
  stabilityByAgent: Record<string, ScoreStabilityReport>;
  driftByAgent: Record<string, LongitudinalDriftReport>;
  improvingAgents: string[];
  degradingAgents: string[];
}

export interface PredictionLogTrackingReport {
  sourcePath: string;
  fileFound: boolean;
  entries: ValidityPredictionEntry[];
  analysis: PredictionLogAnalysis;
  warnings: string[];
}
