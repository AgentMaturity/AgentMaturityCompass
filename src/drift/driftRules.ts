import type { DiagnosticReport, LayerName } from "../types.js";
import type { AssurancePackResult } from "../types.js";
import type { AlertsConfig } from "./alerts.js";
import { bootstrapDifferenceCI, deterministicSeed } from "../experiments/stats.js";

function overall(report: DiagnosticReport): number {
  return report.layerScores.reduce((sum, row) => sum + row.avgFinalLevel, 0) / report.layerScores.length;
}

function layerMap(report: DiagnosticReport): Map<LayerName, number> {
  return new Map(report.layerScores.map((row) => [row.layerName, row.avgFinalLevel]));
}

function assertComparable(baseline: DiagnosticReport[], current: DiagnosticReport): void {
  if (baseline.length === 0) throw new Error("INSUFFICIENT_EVIDENCE: drift baseline is empty; comparison unconfirmed");
  let expectedLayers: string | undefined;
  for (const run of [...baseline, current]) {
    if (!Array.isArray(run.layerScores) || run.layerScores.length === 0
      || ![run.integrityIndex, run.correlationRatio, run.ts, run.windowStartTs, run.windowEndTs].every(Number.isFinite)
      || run.layerScores.some(row => !row || typeof row.layerName !== "string" || !row.layerName || !Number.isFinite(row.avgFinalLevel)))
      throw new Error("INSUFFICIENT_EVIDENCE: drift run has missing or nonfinite comparison metrics; comparison unconfirmed");
    const names = run.layerScores.map(row => row.layerName);
    const layers = JSON.stringify([...names].sort());
    if (new Set(names).size !== names.length || (expectedLayers !== undefined && layers !== expectedLayers))
      throw new Error("INSUFFICIENT_EVIDENCE: drift runs have incomparable layer sets; comparison unconfirmed");
    expectedLayers = layers;
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return (sorted[Math.floor((sorted.length - 1) / 2)]! + sorted[Math.floor(sorted.length / 2)]!) / 2;
}

export interface DriftEvaluation {
  triggered: boolean;
  confirmation: "confirmed" | "unconfirmed";
  ruleId: string | null;
  reasons: string[];
  deltas: {
    overallDrop: number;
    integrityDrop: number;
    correlationDrop: number;
    maxLayerDrop: number;
  };
}

export function evaluateDriftRules(params: {
  config: AlertsConfig;
  previousRun: DiagnosticReport;
  baselineRuns?: DiagnosticReport[];
  currentRun: DiagnosticReport;
  assuranceByPack: Map<string, AssurancePackResult>;
}): DriftEvaluation {
  const baseline = params.baselineRuns ?? [params.previousRun];
  assertComparable(baseline, params.currentRun);
  const significantDrop = (values: number[], current: number, metric: string): boolean => baseline.length === 1
    || bootstrapDifferenceCI({ baseline: values, candidate: [current],
      seed: deterministicSeed([...baseline.map(run => run.runId), params.currentRun.runId, metric]) })[1] < 0;
  const overallValues = baseline.map(overall), integrityValues = baseline.map(run => run.integrityIndex);
  const overallDrop = Number((median(overallValues) - overall(params.currentRun)).toFixed(4));
  const integrityDrop = Number((median(integrityValues) - params.currentRun.integrityIndex).toFixed(4));
  const correlationDrop = Number((median(baseline.map(run => run.correlationRatio)) - params.currentRun.correlationRatio).toFixed(4));
  const overallConfirmed = significantDrop(overallValues, overall(params.currentRun), "overall");
  const integrityConfirmed = significantDrop(integrityValues, params.currentRun.integrityIndex, "integrity");
  const previousLayers = layerMap(baseline[0]!), currentLayers = layerMap(params.currentRun);
  const baselineLayers = baseline.map(layerMap);
  const layerDrops = [...previousLayers.keys()].map(layer => {
    const values = baselineLayers.map(layers => layers.get(layer)!), current = currentLayers.get(layer)!;
    return { drop: Number((median(values) - current).toFixed(4)), confirmed: significantDrop(values, current, layer) };
  });
  const maxLayerDrop = Math.max(0, ...layerDrops.map(layer => layer.drop));

  for (const rule of params.config.alerts.rules) {
    const reasons: string[] = [];
    if (overallDrop >= rule.when.overallDropGte && overallConfirmed) {
      reasons.push(`overall drop ${overallDrop} >= ${rule.when.overallDropGte}`);
    }
    if (layerDrops.some(layer => layer.drop >= rule.when.layerDropGte && layer.confirmed)) {
      reasons.push(`layer drop ${maxLayerDrop} >= ${rule.when.layerDropGte}`);
    }
    if (integrityDrop >= rule.when.integrityDropGte && integrityConfirmed) {
      reasons.push(`integrity drop ${integrityDrop} >= ${rule.when.integrityDropGte}`);
    }
    if (params.currentRun.correlationRatio < rule.when.correlationDropBelow) {
      reasons.push(`correlation ${params.currentRun.correlationRatio} < ${rule.when.correlationDropBelow}`);
    }
    for (const [packId, minScore] of Object.entries(rule.when.assuranceDropBelow)) {
      const pack = params.assuranceByPack.get(packId);
      if (!pack || !Number.isFinite(pack.score0to100)) {
        reasons.push(`assurance ${packId} unavailable (INSUFFICIENT_EVIDENCE)`);
      } else if (pack.score0to100 < minScore) {
        reasons.push(`assurance ${packId} score ${pack.score0to100.toFixed(1)} < ${minScore}`);
      }
    }
    if (reasons.length > 0) {
      const confirmation = baseline.length === 1 || reasons.some(reason => reason.includes("INSUFFICIENT_EVIDENCE")) ? "unconfirmed" : "confirmed";
      if (confirmation === "unconfirmed") reasons.unshift("unconfirmed: single-run comparison or unavailable assurance evidence");
      return {
        triggered: true,
        confirmation,
        ruleId: rule.id,
        reasons,
        deltas: {
          overallDrop,
          integrityDrop,
          correlationDrop,
          maxLayerDrop
        }
      };
    }
  }

  return {
    triggered: false,
    confirmation: baseline.length === 1 ? "unconfirmed" : "confirmed",
    ruleId: null,
    reasons: [],
    deltas: {
      overallDrop,
      integrityDrop,
      correlationDrop,
      maxLayerDrop
    }
  };
}
