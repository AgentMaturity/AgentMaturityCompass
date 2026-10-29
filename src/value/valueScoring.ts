import { mean } from "../experiments/stats.js";
import type { ValueContract } from "./valueContracts.js";
import type { ValuePolicy } from "./valuePolicySchema.js";
import type { ValueEvent } from "./valueEventSchema.js";

export interface ValueKpiScore {
  kpiId: string;
  normalizedScore: number | null;
  baselineValue: number | null;
  currentValue: number | null;
  delta: number | null;
  trustKindSummary: {
    observed: number;
    attested: number;
    selfReported: number;
  };
  evidenceRefsCount: number;
}

export interface ValueScoreOutput {
  kpis: ValueKpiScore[];
  dimensions: {
    emotional: number | null;
    functional: number | null;
    economic: number | null;
    brand: number | null;
    lifetime: number | null;
    valueScore: number | null;
  };
  notes: string[];
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function clamp100(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, value));
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : Number(mean(values).toFixed(6));
}

function normalizeScore(params: {
  direction: "LOWER_IS_BETTER" | "HIGHER_IS_BETTER";
  value: number;
  minGood: number;
  maxBad: number;
}): number {
  if (params.direction === "LOWER_IS_BETTER") {
    const denom = params.maxBad - params.minGood;
    if (Math.abs(denom) < 1e-9) {
      return params.value <= params.minGood ? 100 : 0;
    }
    return clamp100(((params.maxBad - params.value) / denom) * 100);
  }
  const denom = params.minGood - params.maxBad;
  if (Math.abs(denom) < 1e-9) {
    return params.value >= params.minGood ? 100 : 0;
  }
  return clamp100(((params.value - params.maxBad) / denom) * 100);
}

function trustSummary(events: ValueEvent[]): {
  observed: number;
  attested: number;
  selfReported: number;
} {
  if (events.length === 0) {
    return {
      observed: 0,
      attested: 0,
      selfReported: 0
    };
  }
  const observed = events.filter((event) => event.source.trustKind === "OBSERVED").length;
  const attested = events.filter((event) => event.source.trustKind === "ATTESTED").length;
  const self = events.filter((event) => event.source.trustKind === "SELF_REPORTED").length;
  return {
    observed: Number((observed / events.length).toFixed(6)),
    attested: Number((attested / events.length).toFixed(6)),
    selfReported: Number((self / events.length).toFixed(6))
  };
}

export function scoreValueDimensions(params: {
  contract: ValueContract;
  policy: ValuePolicy;
  currentEvents: ValueEvent[];
  baselineEvents: ValueEvent[];
}): ValueScoreOutput {
  const kpis: ValueKpiScore[] = [];
  const notes: string[] = [];
  const dimensionBuckets: Record<"emotional" | "functional" | "economic" | "brand" | "lifetime", Array<{ score: number; weight: number }>> = {
    emotional: [],
    functional: [],
    economic: [],
    brand: [],
    lifetime: []
  };

  for (const kpi of params.contract.valueContract.kpis) {
    const current = params.currentEvents.filter((event) => event.kpiId === kpi.kpiId);
    const baseline = params.baselineEvents.filter((event) => event.kpiId === kpi.kpiId);
    const currentValue = average(current.map((event) => event.value));
    const baselineValue = average(baseline.map((event) => event.value));
    const summary = trustSummary(current);
    const normalizedScore =
      currentValue === null
        ? null
        : Number(
            normalizeScore({
              direction: kpi.direction,
              value: currentValue,
              minGood: kpi.normalization.minGood,
              maxBad: kpi.normalization.maxBad
            }).toFixed(6)
          );

    const delta =
      currentValue !== null && baselineValue !== null
        ? Number((currentValue - baselineValue).toFixed(6))
        : null;

    kpis.push({
      kpiId: kpi.kpiId,
      normalizedScore,
      baselineValue,
      currentValue,
      delta,
      trustKindSummary: summary,
      evidenceRefsCount: current.reduce((sum, event) => sum + (event.evidenceRefs.eventHashes?.length ?? 0) + (event.evidenceRefs.receiptIds?.length ?? 0), 0)
    });

    if (normalizedScore === null) {
      notes.push(`missing_events:${kpi.kpiId}`);
      continue;
    }

    const pureSelfReported = summary.observed === 0 && summary.attested === 0 && summary.selfReported > 0;
    for (const dim of ["emotional", "functional", "economic", "brand", "lifetime"] as const) {
      const weight = kpi.valueDimensionImpacts[dim];
      if (weight <= 0) {
        continue;
      }
      if (dim === "economic" && params.contract.valueContract.constraints.forbidSelfReportedToAffectEconomicValue && pureSelfReported) {
        notes.push(`self_reported_excluded:economic:${kpi.kpiId}`);
        continue;
      }
      dimensionBuckets[dim].push({
        score: normalizedScore,
        weight
      });
    }
  }

  const dimensionScore = (bucket: Array<{ score: number; weight: number }>): number | null => {
    const weightSum = bucket.reduce((sum, row) => sum + row.weight, 0);
    if (weightSum <= 0) {
      return null;
    }
    const value = bucket.reduce((sum, row) => sum + row.score * row.weight, 0) / weightSum;
    return Number(clamp100(value).toFixed(6));
  };

  const emotional = dimensionScore(dimensionBuckets.emotional);
  const functional = dimensionScore(dimensionBuckets.functional);
  const economic = dimensionScore(dimensionBuckets.economic);
  const brand = dimensionScore(dimensionBuckets.brand);
  const lifetime = dimensionScore(dimensionBuckets.lifetime);

  const weights = params.policy.valuePolicy.formulas.dimensionWeights;
  const weightedParts: Array<{ value: number; weight: number }> = [];
  if (emotional !== null) weightedParts.push({ value: emotional, weight: weights.emotional });
  if (functional !== null) weightedParts.push({ value: functional, weight: weights.functional });
  if (economic !== null) weightedParts.push({ value: economic, weight: weights.economic });
  if (brand !== null) weightedParts.push({ value: brand, weight: weights.brand });
  if (lifetime !== null) weightedParts.push({ value: lifetime, weight: weights.lifetime });
  const weightTotal = weightedParts.reduce((sum, row) => sum + row.weight, 0);
  const valueScore =
    weightTotal > 0
      ? Number(
          clamp100(weightedParts.reduce((sum, row) => sum + row.value * row.weight, 0) / weightTotal).toFixed(6)
        )
      : null;

  const observedShare = clamp01(
    kpis.length === 0 ? 0 : kpis.reduce((sum, row) => sum + row.trustKindSummary.observed, 0) / Math.max(1, kpis.length)
  );
  if (observedShare < params.policy.valuePolicy.evidenceGates.minObservedShareForStrongClaims) {
    notes.push("observed_share_low_for_strong_claims");
  }

  return {
    kpis,
    dimensions: {
      emotional,
      functional,
      economic,
      brand,
      lifetime,
      valueScore
    },
    notes: [...new Set(notes)]
  };
}
