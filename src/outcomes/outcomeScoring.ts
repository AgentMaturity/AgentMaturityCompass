import type { OutcomeEvent, OutcomeMetricResult } from "../types.js";
import type { OutcomeContract, OutcomeMetric } from "./outcomeContractSchema.js";

function parseJsonValue(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function truthySignal(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value > 0;
  }
  if (typeof value === "string") {
    const norm = value.trim().toLowerCase();
    if (["true", "yes", "1", "ok", "success", "completed", "present"].includes(norm)) {
      return true;
    }
    if (["false", "no", "0", "failed", "missing"].includes(norm)) {
      return false;
    }
  }
  return false;
}

function trustRank(tier: "OBSERVED" | "ATTESTED" | "SELF_REPORTED"): number {
  if (tier === "OBSERVED") {
    return 3;
  }
  if (tier === "ATTESTED") {
    return 2;
  }
  return 1;
}

function requiredTrustRank(tier: OutcomeMetric["evidenceRules"]["trustTierAtLeast"]): number {
  if (tier === "OBSERVED") {
    return 3;
  }
  if (tier === "ATTESTED") {
    return 2;
  }
  return 1;
}

function evaluateThreshold(measured: number, target: unknown, baseline: number | null): boolean {
  if (typeof target === "number") {
    return measured >= target;
  }
  if (typeof target === "boolean") {
    return measured > 0 === target;
  }
  if (typeof target === "string") {
    const text = target.trim().toLowerCase();
    if (text === "<=baseline") {
      return baseline !== null ? measured <= baseline : false;
    }
    const mult = text.match(/^<=baseline\*(\d+(?:\.\d+)?)$/);
    if (mult && baseline !== null) {
      return measured <= baseline * Number(mult[1]);
    }
    const direct = Number(text);
    if (Number.isFinite(direct)) {
      return measured >= direct;
    }
  }
  return false;
}

function metricEvents(events: OutcomeEvent[], metricId: string): OutcomeEvent[] {
  return events.filter((event) => event.metric_id === metricId);
}

/**
 * The tier an outcome counts at (P0-18): only AMC's runtime (ToolHub) observes outcomes and no outcome writer verifies
 * a third-party attestation, so webhook, manual and imported rows, 1.x rows stored as OBSERVED or ATTESTED included,
 * read SELF_REPORTED. Stored rows are never rewritten.
 */
export function outcomeTrustTier(event: OutcomeEvent): OutcomeEvent["trust_tier"] {
  return event.source === "toolhub" && event.trust_tier === "OBSERVED" ? "OBSERVED" : "SELF_REPORTED";
}

function computeTrustCoverage(events: OutcomeEvent[]): OutcomeMetricResult["trustCoverage"] {
  if (events.length === 0) {
    return {
      observed: 0,
      attested: 0,
      selfReported: 0
    };
  }
  const observed = events.filter((event) => outcomeTrustTier(event) === "OBSERVED").length;
  const attested = events.filter((event) => outcomeTrustTier(event) === "ATTESTED").length;
  const self = events.filter((event) => outcomeTrustTier(event) === "SELF_REPORTED").length;
  return {
    observed: Number((observed / events.length).toFixed(4)),
    attested: Number((attested / events.length).toFixed(4)),
    selfReported: Number((self / events.length).toFixed(4))
  };
}

function maxTrustRank(events: OutcomeEvent[]): number {
  if (events.length === 0) {
    return 0;
  }
  let max = 0;
  for (const event of events) {
    max = Math.max(max, trustRank(outcomeTrustTier(event)));
  }
  return max;
}

function ratioFromSignals(
  events: OutcomeEvent[],
  numeratorSignal: string,
  denominatorSignal: string
): { value: number | null; sampleSize: number; evidence: OutcomeEvent[] } {
  const numeratorEvents = metricEvents(events, numeratorSignal);
  const denominatorEvents = metricEvents(events, denominatorSignal);
  const numerator = numeratorEvents.filter((event) => truthySignal(parseJsonValue(event.value))).length;
  const denominator = denominatorEvents.filter((event) => truthySignal(parseJsonValue(event.value))).length;
  const combined = [...numeratorEvents, ...denominatorEvents];
  return {
    value: denominator > 0 ? numerator / denominator : null,
    sampleSize: denominator,
    evidence: combined
  };
}

function avgFromSignal(events: OutcomeEvent[], signal: string): { value: number | null; sampleSize: number; evidence: OutcomeEvent[] } {
  const rows = metricEvents(events, signal);
  const values = rows.map((event) => asNumber(parseJsonValue(event.value))).filter((value): value is number => value !== null);
  if (values.length === 0) {
    return {
      value: null,
      sampleSize: 0,
      evidence: rows
    };
  }
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    value: Number(avg.toFixed(6)),
    sampleSize: values.length,
    evidence: rows
  };
}

function derivedCostPerSuccess(params: {
  llmTokens: number;
  successCount: number;
  events: OutcomeEvent[];
}): { value: number | null; sampleSize: number; evidence: OutcomeEvent[] } {
  if (params.successCount <= 0) {
    return {
      value: null,
      sampleSize: 0,
      evidence: params.events
    };
  }
  return {
    value: Number((params.llmTokens / params.successCount).toFixed(6)),
    sampleSize: params.successCount,
    evidence: params.events
  };
}

export interface ComputeMetricContext {
  contract: OutcomeContract;
  metric: OutcomeMetric;
  events: OutcomeEvent[];
  llmTokens: number;
  baselineMetricValue: number | null;
  blockedAudits: string[];
}

export interface ComputedMetric {
  metric: OutcomeMetricResult;
  levelReached: number;
}

export function computeMetric(context: ComputeMetricContext): ComputedMetric {
  const metric = context.metric;
  const reasons: string[] = [];
  let measuredValue: number | string | boolean | null = null;
  let sampleSize = 0;
  let evidence: OutcomeEvent[] = [];

  if (metric.type === "ratio") {
    if (!metric.numeratorSignal || !metric.denominatorSignal) {
      reasons.push("ratio metric missing numeratorSignal/denominatorSignal in contract");
    } else {
      const ratio = ratioFromSignals(context.events, metric.numeratorSignal, metric.denominatorSignal);
      measuredValue = ratio.value;
      sampleSize = ratio.sampleSize;
      evidence = ratio.evidence;
    }
  } else if (metric.type === "avg") {
    if (!metric.signal) {
      reasons.push("avg metric missing signal in contract");
    } else {
      const avg = avgFromSignal(context.events, metric.signal);
      measuredValue = avg.value;
      sampleSize = avg.sampleSize;
      evidence = avg.evidence;
    }
  } else {
    if (metric.metricId === "economic.cost_per_success" || metric.inputs?.includes("llm.tokens")) {
      const success = metricEvents(context.events, "workorder.completed").filter((event) =>
        truthySignal(parseJsonValue(event.value))
      ).length;
      const result = derivedCostPerSuccess({
        llmTokens: context.llmTokens,
        successCount: success,
        events: metricEvents(context.events, "workorder.completed")
      });
      measuredValue = result.value;
      sampleSize = result.sampleSize;
      evidence = result.evidence;
    } else {
      reasons.push("derived metric inputs not supported by deterministic engine");
    }
  }

  const trustCoverage = computeTrustCoverage(evidence);
  const observedRatio = trustCoverage.observed;
  const requiredObservedRatio = context.contract.outcomeContract.windowDefaults.minObservedRatioForClaims;
  const requiredRank = requiredTrustRank(metric.evidenceRules.trustTierAtLeast);

  const effectiveMaxRank = maxTrustRank(evidence);
  if (effectiveMaxRank < requiredRank) {
    reasons.push(`trust tier below required minimum ${metric.evidenceRules.trustTierAtLeast}`);
  }

  if (metric.evidenceRules.minSampleSize && sampleSize < metric.evidenceRules.minSampleSize) {
    reasons.push(`sample size ${sampleSize} is below minimum ${metric.evidenceRules.minSampleSize}`);
  }

  for (const auditType of metric.evidenceRules.requiresNoAudit ?? []) {
    if (context.blockedAudits.includes(auditType)) {
      reasons.push(`forbidden audit present in window: ${auditType}`);
    }
  }

  if (observedRatio < requiredObservedRatio && sampleSize > 0) {
    reasons.push(`observed coverage ${observedRatio.toFixed(3)} below threshold ${requiredObservedRatio.toFixed(3)}`);
  }

  let levelReached = 0;
  const numeric = typeof measuredValue === "number" ? measuredValue : null;
  if (numeric !== null) {
    if (evaluateThreshold(numeric, metric.target.level3, context.baselineMetricValue)) {
      levelReached = 3;
    }
    if (evaluateThreshold(numeric, metric.target.level4, context.baselineMetricValue)) {
      levelReached = 4;
    }
    if (evaluateThreshold(numeric, metric.target.level5, context.baselineMetricValue)) {
      levelReached = 5;
    }
  }

  const onlySelf = trustCoverage.selfReported > 0 && trustCoverage.observed === 0 && trustCoverage.attested === 0;
  if (onlySelf && levelReached > 2) {
    levelReached = 2;
    reasons.push("self-reported-only evidence caps metric at level 2");
  }

  let status: OutcomeMetricResult["status"] = "MISSING";
  if (sampleSize === 0 || measuredValue === null) {
    status = reasons.length > 0 ? "UNKNOWN" : "MISSING";
  } else if (observedRatio < requiredObservedRatio || effectiveMaxRank < requiredRank) {
    status = "UNKNOWN";
  } else if (levelReached >= 3 && reasons.length === 0) {
    status = "SATISFIED";
  } else {
    status = "PARTIAL";
  }

  const checklist: string[] = [];
  if (status !== "SATISFIED") {
    checklist.push(`Collect more ${metric.evidenceRules.trustTierAtLeast} outcome signals for ${metric.metricId}.`);
    if (metric.evidenceRules.minSampleSize) {
      checklist.push(`Reach sample size >= ${metric.evidenceRules.minSampleSize}.`);
    }
    checklist.push("Ensure forbidden audit events are absent in this reporting window.");
  }

  return {
    levelReached,
    metric: {
      metricId: metric.metricId,
      category: metric.category,
      measuredValue,
      sampleSize,
      trustCoverage,
      status,
      reasons,
      evidenceRefs: evidence.slice(0, 20).map((row) => row.event_hash),
      checklist
    }
  };
}

export function scoreCategory(metrics: ComputedMetric[]): number {
  if (metrics.length === 0) {
    return 0;
  }
  const sum = metrics.reduce((acc, row) => acc + row.levelReached * 20, 0);
  return Number((sum / metrics.length).toFixed(3));
}
