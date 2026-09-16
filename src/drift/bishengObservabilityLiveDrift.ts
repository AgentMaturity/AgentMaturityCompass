import type {
  BishengObservabilityDriftStatistic,
  BishengObservabilityLiveDriftResult,
} from "../watch/bishengObservabilityLiveDrift.js";

export function extractBishengObservabilityDriftStatistic(
  result: BishengObservabilityLiveDriftResult,
): BishengObservabilityDriftStatistic {
  return result.driftStatistic;
}

export type { BishengObservabilityDriftStatistic } from "../watch/bishengObservabilityLiveDrift.js";
