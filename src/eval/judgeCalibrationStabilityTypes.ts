import type { EvidenceOutcome } from "../types.js";

export interface JudgeCalibrationStabilitySummary {
  checkCount: number;
  failedItemIds: string[];
  meanRankingStability0to1: number | null;
  meanDataQuality0to1: number | null;
  meanOcrReadability0to1: number | null;
  maxTailFailureRate0to1: number | null;
  stageDistribution: Record<string, number>;
  metricOutcomes: Record<"meanRankingStability0to1" | "meanDataQuality0to1" | "meanOcrReadability0to1" | "maxTailFailureRate0to1", EvidenceOutcome>;
}
