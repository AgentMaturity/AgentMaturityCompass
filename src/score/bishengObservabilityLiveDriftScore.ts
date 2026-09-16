import {
  buildBishengObservabilityScoreSurface,
  type BishengObservabilityLiveDriftResult,
  type BishengObservabilityScoreSurface,
} from "../watch/bishengObservabilityLiveDrift.js";

export function projectBishengObservabilityScoreSurface(
  result: BishengObservabilityLiveDriftResult,
): BishengObservabilityScoreSurface {
  return buildBishengObservabilityScoreSurface(
    result.receipt,
    result.bishengObservabilityEvidenceCoverage0to1,
    result.missingReasons,
  );
}

export type { BishengObservabilityScoreSurface } from "../watch/bishengObservabilityLiveDrift.js";
