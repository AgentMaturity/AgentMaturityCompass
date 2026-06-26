import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export type RiskCostLatencyTraceStatus = "ok" | "warning" | "error";
export type RiskCostLatencySloStatus = "healthy" | "breached" | "fail_closed";
export type RiskCostLatencyAlertSeverity = "info" | "warning" | "critical";

export interface RiskCostLatencySloTimeWindow {
  start: string;
  end: string;
}

export interface RiskCostLatencySloObjectives {
  minReliabilityRate: number;
  maxRiskIncidentRate: number;
  maxTotalCostUsd: number;
  maxP95LatencyMs: number;
  maxEscalationRate: number;
}

export interface RiskCostLatencyAlertRoute {
  routeId: string;
  channel: string;
  target: string;
  severity: RiskCostLatencyAlertSeverity;
}

export interface RiskCostLatencySloDefinition {
  sloId: string;
  agentId: string;
  timeWindow: RiskCostLatencySloTimeWindow;
  objectives: RiskCostLatencySloObjectives;
  alertRouting: RiskCostLatencyAlertRoute[];
  evidenceRefs: string[];
}

export interface RiskCostLatencyTraceRow {
  traceId: string;
  agentId: string;
  timestamp: string;
  status: RiskCostLatencyTraceStatus;
  latencyMs: number;
  costUsd: number;
  inputTokens?: number;
  outputTokens?: number;
  riskEvent?: string | null;
  failureMode?: string | null;
  promptBoundary?: string | null;
  toolBoundary?: string | null;
  remediationState?: string | null;
  escalationRequired?: boolean;
  evidenceRefs: string[];
}

export interface RiskCostLatencyTraceIndexEntry {
  traceId: string;
  agentId: string;
  timestamp: string;
  status: RiskCostLatencyTraceStatus;
  latencyMs: number;
  costUsd: number;
  tokenCount: number;
  riskEvent: string | null;
  failureMode: string | null;
  promptToolBoundary: string;
  remediationState: string | null;
  escalationRequired: boolean;
  evidenceRefs: string[];
  searchText: string;
  rowHash: string;
}

export interface RiskCostLatencyTraceIndex {
  entries: RiskCostLatencyTraceIndexEntry[];
  searchFields: string[];
}

export interface RiskCostLatencyFailureCluster {
  clusterId: string;
  failureMode: string;
  count: number;
  traceIds: string[];
  riskEvents: string[];
  promptToolBoundaries: string[];
  remediationStates: string[];
  evidenceRefs: string[];
}

export interface RiskCostLatencyLiveTrends {
  traceCount: number;
  reliabilityRate: number;
  riskIncidentRate: number;
  totalCostUsd: number;
  p95LatencyMs: number;
  escalationRate: number;
  tokenCount: number;
  failureModeCounts: Record<string, number>;
  riskEventCounts: Record<string, number>;
  remediationStateCounts: Record<string, number>;
}

export interface RiskCostLatencySloBreachEvidence {
  metricId: "reliabilityRate" | "riskIncidentRate" | "totalCostUsd" | "p95LatencyMs" | "escalationRate";
  observed: number;
  threshold: number;
  comparator: ">=" | "<=";
  evidenceRefs: string[];
  alertRouteIds: string[];
}

export interface RiskCostLatencySloAlert {
  alertId: string;
  source: "risk-cost-latency-slo";
  sloId: string;
  agentId: string;
  metricId: RiskCostLatencySloBreachEvidence["metricId"];
  severity: RiskCostLatencyAlertSeverity;
  routeId: string | null;
  channel: string | null;
  target: string | null;
  message: string;
  evidenceRefs: string[];
}

export interface BuildRiskCostLatencySloReceiptInput {
  definition: RiskCostLatencySloDefinition;
  traces: RiskCostLatencyTraceRow[];
  generatedAt?: string;
  sourceRefs?: string[];
}

export interface RiskCostLatencySloReceipt {
  schemaVersion: "2026-06-26";
  receiptId: string;
  generatedAt: string;
  surfaceBindings: ["Watch", "Studio", "API", "Fleet"];
  sourceRefs: string[];
  definition: RiskCostLatencySloDefinition;
  traceIndex: RiskCostLatencyTraceIndex;
  failureClusters: RiskCostLatencyFailureCluster[];
  liveTrends: RiskCostLatencyLiveTrends;
  breachEvidence: RiskCostLatencySloBreachEvidence[];
  alerts: RiskCostLatencySloAlert[];
  status: RiskCostLatencySloStatus;
  failClosed: boolean;
  failClosedReasons: string[];
  receiptHash: string;
}

const SURFACE_BINDINGS = ["Watch", "Studio", "API", "Fleet"] as const;
const SEARCH_FIELDS = ["traceId", "status", "riskEvent", "failureMode", "promptToolBoundary", "remediationState"] as const;

function nonEmpty(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function finiteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function round(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1_000_000) / 1_000_000;
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return round(numerator / denominator);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(nonEmpty))].sort();
}

function parseTime(value: string): number {
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : Number.NaN;
}

function percentile(values: number[], p: number): number {
  const sorted = values.filter(finiteNonNegative).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return round(sorted[index] ?? 0);
}

function rowHash(entry: Omit<RiskCostLatencyTraceIndexEntry, "rowHash">): string {
  return sha256Hex(canonicalize(entry));
}

function receiptHash(receipt: Omit<RiskCostLatencySloReceipt, "receiptHash">): string {
  return sha256Hex(canonicalize(receipt));
}

function promptToolBoundary(row: RiskCostLatencyTraceRow): string {
  const prompt = nonEmpty(row.promptBoundary) ? row.promptBoundary.trim() : "prompt-unknown";
  const tool = nonEmpty(row.toolBoundary) ? row.toolBoundary.trim() : "tool-unknown";
  return `${prompt}/${tool}`;
}

function buildTraceIndex(traces: RiskCostLatencyTraceRow[]): RiskCostLatencyTraceIndex {
  const entries = traces
    .map((row): RiskCostLatencyTraceIndexEntry => {
      const tokenCount = Math.max(0, Math.trunc((row.inputTokens ?? 0) + (row.outputTokens ?? 0)));
      const failureMode = nonEmpty(row.failureMode) ? row.failureMode.trim() : null;
      const riskEvent = nonEmpty(row.riskEvent) ? row.riskEvent.trim() : null;
      const remediationState = nonEmpty(row.remediationState) ? row.remediationState.trim() : null;
      const boundary = promptToolBoundary(row);
      const base = {
        traceId: row.traceId,
        agentId: row.agentId,
        timestamp: row.timestamp,
        status: row.status,
        latencyMs: round(row.latencyMs),
        costUsd: round(row.costUsd),
        tokenCount,
        riskEvent,
        failureMode,
        promptToolBoundary: boundary,
        remediationState,
        escalationRequired: row.escalationRequired === true,
        evidenceRefs: unique(row.evidenceRefs),
        searchText: [
          row.traceId,
          row.status,
          riskEvent ?? "",
          failureMode ?? "",
          boundary,
          remediationState ?? "",
        ].join(" ").trim(),
      } satisfies Omit<RiskCostLatencyTraceIndexEntry, "rowHash">;
      return {
        ...base,
        rowHash: rowHash(base),
      };
    })
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.traceId.localeCompare(b.traceId));
  return {
    entries,
    searchFields: [...SEARCH_FIELDS],
  };
}

function countBy(values: Array<string | null>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    if (!value) continue;
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function buildLiveTrends(entries: RiskCostLatencyTraceIndexEntry[]): RiskCostLatencyLiveTrends {
  const traceCount = entries.length;
  return {
    traceCount,
    reliabilityRate: pct(entries.filter((entry) => entry.status === "ok").length, traceCount),
    riskIncidentRate: pct(entries.filter((entry) => entry.riskEvent !== null).length, traceCount),
    totalCostUsd: round(entries.reduce((sum, entry) => sum + entry.costUsd, 0)),
    p95LatencyMs: percentile(entries.map((entry) => entry.latencyMs), 0.95),
    escalationRate: pct(entries.filter((entry) => entry.escalationRequired).length, traceCount),
    tokenCount: entries.reduce((sum, entry) => sum + entry.tokenCount, 0),
    failureModeCounts: countBy(entries.map((entry) => entry.failureMode)),
    riskEventCounts: countBy(entries.map((entry) => entry.riskEvent)),
    remediationStateCounts: countBy(entries.map((entry) => entry.remediationState)),
  };
}

function buildFailureClusters(entries: RiskCostLatencyTraceIndexEntry[]): RiskCostLatencyFailureCluster[] {
  const groups = new Map<string, RiskCostLatencyTraceIndexEntry[]>();
  for (const entry of entries) {
    if (!entry.failureMode) continue;
    groups.set(entry.failureMode, [...(groups.get(entry.failureMode) ?? []), entry]);
  }
  return [...groups.entries()]
    .map(([failureMode, rows]) => ({
      clusterId: `slofc_${sha256Hex(canonicalize({ failureMode, traceIds: rows.map((row) => row.traceId).sort() })).slice(0, 16)}`,
      failureMode,
      count: rows.length,
      traceIds: rows.map((row) => row.traceId).sort(),
      riskEvents: unique(rows.map((row) => row.riskEvent ?? "")),
      promptToolBoundaries: unique(rows.map((row) => row.promptToolBoundary)),
      remediationStates: unique(rows.map((row) => row.remediationState ?? "")),
      evidenceRefs: unique(rows.flatMap((row) => row.evidenceRefs)),
    }))
    .sort((a, b) => b.count - a.count || a.failureMode.localeCompare(b.failureMode));
}

function definitionReasons(definition: RiskCostLatencySloDefinition): string[] {
  const reasons: string[] = [];
  if (!nonEmpty(definition.sloId)) reasons.push("sloId:missing");
  if (!nonEmpty(definition.agentId)) reasons.push("agentId:missing");
  const start = parseTime(definition.timeWindow.start);
  const end = parseTime(definition.timeWindow.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) reasons.push("timeWindow:invalid");
  if (!Array.isArray(definition.evidenceRefs) || definition.evidenceRefs.filter(nonEmpty).length === 0) reasons.push("sloEvidenceRefs:missing");
  if (!Array.isArray(definition.alertRouting) || definition.alertRouting.length === 0) reasons.push("alertRouting:missing");
  for (const route of definition.alertRouting ?? []) {
    if (!nonEmpty(route.routeId) || !nonEmpty(route.channel) || !nonEmpty(route.target)) {
      reasons.push(`alertRouting:${route.routeId || "unknown"}:invalid`);
    }
  }
  const objectives = definition.objectives;
  if (!Number.isFinite(objectives.minReliabilityRate) || objectives.minReliabilityRate < 0 || objectives.minReliabilityRate > 1) {
    reasons.push("objective:minReliabilityRate:invalid");
  }
  if (!Number.isFinite(objectives.maxRiskIncidentRate) || objectives.maxRiskIncidentRate < 0 || objectives.maxRiskIncidentRate > 1) {
    reasons.push("objective:maxRiskIncidentRate:invalid");
  }
  if (!finiteNonNegative(objectives.maxTotalCostUsd)) reasons.push("objective:maxTotalCostUsd:invalid");
  if (!finiteNonNegative(objectives.maxP95LatencyMs)) reasons.push("objective:maxP95LatencyMs:invalid");
  if (!Number.isFinite(objectives.maxEscalationRate) || objectives.maxEscalationRate < 0 || objectives.maxEscalationRate > 1) {
    reasons.push("objective:maxEscalationRate:invalid");
  }
  return reasons;
}

function traceReasons(definition: RiskCostLatencySloDefinition, traces: RiskCostLatencyTraceRow[]): string[] {
  if (traces.length === 0) return ["traces:missing"];
  const reasons: string[] = [];
  const start = parseTime(definition.timeWindow.start);
  const end = parseTime(definition.timeWindow.end);
  for (const row of traces) {
    const traceRef = row.traceId || "unknown";
    if (!nonEmpty(row.traceId)) reasons.push("traceId:missing");
    if (row.agentId !== definition.agentId) reasons.push(`${traceRef}:agentId:mismatch`);
    const ts = parseTime(row.timestamp);
    if (!Number.isFinite(ts)) {
      reasons.push(`${traceRef}:timestamp:invalid`);
    } else if (Number.isFinite(start) && Number.isFinite(end) && (ts < start || ts > end)) {
      reasons.push(`${traceRef}:timestamp:outsideWindow`);
    }
    if (row.status !== "ok" && row.status !== "warning" && row.status !== "error") reasons.push(`${traceRef}:status:invalid`);
    if (!finiteNonNegative(row.latencyMs)) reasons.push(`${traceRef}:latencyMs:invalid`);
    if (!finiteNonNegative(row.costUsd)) reasons.push(`${traceRef}:costUsd:invalid`);
    if (!Array.isArray(row.evidenceRefs) || row.evidenceRefs.filter(nonEmpty).length === 0) reasons.push(`${traceRef}:evidenceRefs:missing`);
  }
  return reasons;
}

function buildBreachEvidence(
  definition: RiskCostLatencySloDefinition,
  trends: RiskCostLatencyLiveTrends,
  entries: RiskCostLatencyTraceIndexEntry[]
): RiskCostLatencySloBreachEvidence[] {
  const evidenceRefs = unique([...definition.evidenceRefs, ...entries.flatMap((entry) => entry.evidenceRefs)]);
  const alertRouteIds = unique(definition.alertRouting.map((route) => route.routeId));
  const rows: RiskCostLatencySloBreachEvidence[] = [];
  const add = (
    metricId: RiskCostLatencySloBreachEvidence["metricId"],
    observed: number,
    threshold: number,
    comparator: RiskCostLatencySloBreachEvidence["comparator"],
    breached: boolean
  ): void => {
    if (!breached) return;
    rows.push({
      metricId,
      observed: round(observed),
      threshold: round(threshold),
      comparator,
      evidenceRefs,
      alertRouteIds,
    });
  };
  add("reliabilityRate", trends.reliabilityRate, definition.objectives.minReliabilityRate, ">=", trends.reliabilityRate < definition.objectives.minReliabilityRate);
  add("riskIncidentRate", trends.riskIncidentRate, definition.objectives.maxRiskIncidentRate, "<=", trends.riskIncidentRate > definition.objectives.maxRiskIncidentRate);
  add("totalCostUsd", trends.totalCostUsd, definition.objectives.maxTotalCostUsd, "<=", trends.totalCostUsd > definition.objectives.maxTotalCostUsd);
  add("p95LatencyMs", trends.p95LatencyMs, definition.objectives.maxP95LatencyMs, "<=", trends.p95LatencyMs > definition.objectives.maxP95LatencyMs);
  add("escalationRate", trends.escalationRate, definition.objectives.maxEscalationRate, "<=", trends.escalationRate > definition.objectives.maxEscalationRate);
  return rows;
}

function buildAlerts(
  definition: RiskCostLatencySloDefinition,
  breaches: RiskCostLatencySloBreachEvidence[]
): RiskCostLatencySloAlert[] {
  const route = definition.alertRouting[0] ?? null;
  return breaches.map((breach) => ({
    alertId: `rcls_${sha256Hex(canonicalize({ sloId: definition.sloId, metricId: breach.metricId, observed: breach.observed })).slice(0, 16)}`,
    source: "risk-cost-latency-slo",
    sloId: definition.sloId,
    agentId: definition.agentId,
    metricId: breach.metricId,
    severity: route?.severity ?? "critical",
    routeId: route?.routeId ?? null,
    channel: route?.channel ?? null,
    target: route?.target ?? null,
    message: `${definition.sloId} breached ${breach.metricId}: observed ${breach.observed} must be ${breach.comparator} ${breach.threshold}.`,
    evidenceRefs: breach.evidenceRefs,
  }));
}

export function buildRiskCostLatencySloReceipt(
  input: BuildRiskCostLatencySloReceiptInput
): RiskCostLatencySloReceipt {
  const traceIndex = buildTraceIndex(input.traces);
  const liveTrends = buildLiveTrends(traceIndex.entries);
  const failureClusters = buildFailureClusters(traceIndex.entries);
  const breachEvidence = buildBreachEvidence(input.definition, liveTrends, traceIndex.entries);
  const failClosedReasons = unique([
    ...definitionReasons(input.definition),
    ...traceReasons(input.definition, input.traces),
  ]);
  const alerts = buildAlerts(input.definition, breachEvidence);
  const status: RiskCostLatencySloStatus = failClosedReasons.length > 0
    ? "fail_closed"
    : breachEvidence.length > 0 ? "breached" : "healthy";
  const base = {
    schemaVersion: "2026-06-26" as const,
    receiptId: `risk-cost-latency-slo-${input.definition.sloId}`,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    surfaceBindings: [...SURFACE_BINDINGS],
    sourceRefs: unique(input.sourceRefs ?? []),
    definition: {
      ...input.definition,
      evidenceRefs: unique(input.definition.evidenceRefs),
      alertRouting: [...input.definition.alertRouting],
    },
    traceIndex,
    failureClusters,
    liveTrends,
    breachEvidence,
    alerts,
    status,
    failClosed: failClosedReasons.length > 0,
    failClosedReasons,
  } satisfies Omit<RiskCostLatencySloReceipt, "receiptHash">;
  return {
    ...base,
    receiptHash: receiptHash(base),
  };
}

export function buildRiskCostLatencySloWatchAlerts(receipt: RiskCostLatencySloReceipt): RiskCostLatencySloAlert[] {
  return receipt.alerts.map((alert) => ({ ...alert, source: "risk-cost-latency-slo" }));
}
