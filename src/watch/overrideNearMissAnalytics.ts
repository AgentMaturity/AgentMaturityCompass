import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export type OverrideNearMissEventType = "human_override" | "ignored_escalation" | "near_miss" | "approval";
export type OverrideNearMissReceiptStatus = "ready" | "fail_closed";
export type OverrideNearMissAlertSeverity = "warning" | "critical";

export interface OverrideNearMissTrendWindow {
  start: string;
  end: string;
  evidenceRefs: string[];
}

export interface OverrideNearMissEvent {
  eventId: string;
  agentId: string;
  useCaseId: string;
  timestamp: string;
  eventType: OverrideNearMissEventType;
  reasonCode: string;
  actionTaken: string;
  nearMissLink?: string | null;
  failureMode: string;
  riskEvent: string;
  promptBoundary: string;
  toolBoundary: string;
  latencyMs: number;
  costUsd: number;
  remediationState: string;
  reviewerId?: string | null;
  evidenceRefs: string[];
}

export interface OverrideNearMissTraceIndexEntry {
  eventId: string;
  agentId: string;
  useCaseId: string;
  timestamp: string;
  eventType: OverrideNearMissEventType;
  reasonCode: string;
  actionTaken: string;
  nearMissLink: string | null;
  failureMode: string;
  riskEvent: string;
  promptToolBoundary: string;
  latencyMs: number;
  costUsd: number;
  remediationState: string;
  reviewerId: string | null;
  evidenceRefs: string[];
  searchText: string;
  rowHash: string;
}

export interface OverrideNearMissTraceIndex {
  entries: OverrideNearMissTraceIndexEntry[];
  searchFields: [
    "eventId",
    "agentId",
    "useCaseId",
    "eventType",
    "reasonCode",
    "riskEvent",
    "failureMode",
    "promptToolBoundary",
    "remediationState"
  ];
}

export interface OverrideNearMissFailureCluster {
  clusterId: string;
  failureMode: string;
  count: number;
  eventIds: string[];
  agentIds: string[];
  useCaseIds: string[];
  riskEvents: string[];
  promptToolBoundaries: string[];
  remediationStates: string[];
  evidenceRefs: string[];
}

export interface OverrideNearMissLiveTrends {
  eventCount: number;
  agentCount: number;
  useCaseCount: number;
  overrideCount: number;
  nearMissCount: number;
  ignoredEscalationCount: number;
  approvalCount: number;
  totalCostUsd: number;
  p95LatencyMs: number;
  openRemediationCount: number;
  reasonCodeCounts: Record<string, number>;
  actionTakenCounts: Record<string, number>;
  failureModeCounts: Record<string, number>;
  riskEventCounts: Record<string, number>;
  remediationStateCounts: Record<string, number>;
}

export interface RepeatedApprovalPattern {
  patternId: string;
  agentId: string;
  useCaseId: string;
  reasonCode: string;
  actionTaken: string;
  count: number;
  eventIds: string[];
  reviewerIds: string[];
  evidenceRefs: string[];
}

export interface OverrideNearMissWatchAlert {
  alertId: string;
  source: "override-near-miss-analytics";
  status: OverrideNearMissReceiptStatus;
  severity: OverrideNearMissAlertSeverity;
  metricId: "failClosedReasons" | "ignoredEscalationCount";
  message: string;
  evidenceRefs: string[];
  failClosedReasons: string[];
}

export interface BuildOverrideNearMissAnalyticsReceiptInput {
  window: OverrideNearMissTrendWindow;
  events: OverrideNearMissEvent[];
  generatedAt?: string;
  sourceRefs?: string[];
}

export interface OverrideNearMissAnalyticsReceipt {
  schemaVersion: "2026-06-26";
  receiptId: string;
  generatedAt: string;
  surfaceBindings: ["Watch", "Studio", "API"];
  sourceRefs: string[];
  window: OverrideNearMissTrendWindow;
  traceIndex: OverrideNearMissTraceIndex;
  failureClusters: OverrideNearMissFailureCluster[];
  liveTrends: OverrideNearMissLiveTrends;
  repeatedApprovalPatterns: RepeatedApprovalPattern[];
  status: OverrideNearMissReceiptStatus;
  failClosed: boolean;
  failClosedReasons: string[];
  receiptHash: string;
}

const SURFACE_BINDINGS = ["Watch", "Studio", "API"] as const;
const SEARCH_FIELDS = [
  "eventId",
  "agentId",
  "useCaseId",
  "eventType",
  "reasonCode",
  "riskEvent",
  "failureMode",
  "promptToolBoundary",
  "remediationState",
] as const;

function nonEmpty(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(nonEmpty).map((value) => value.trim()))].sort();
}

function round(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1_000_000) / 1_000_000;
}

function finiteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function parseTime(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function percentile(values: number[], p: number): number {
  const sorted = values.filter(finiteNonNegative).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return round(sorted[index] ?? 0);
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    if (!nonEmpty(value)) continue;
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function promptToolBoundary(event: OverrideNearMissEvent): string {
  const prompt = nonEmpty(event.promptBoundary) ? event.promptBoundary.trim() : "prompt-unknown";
  const tool = nonEmpty(event.toolBoundary) ? event.toolBoundary.trim() : "tool-unknown";
  return `${prompt}/${tool}`;
}

function entryHash(entry: Omit<OverrideNearMissTraceIndexEntry, "rowHash">): string {
  return sha256Hex(canonicalize(entry));
}

function receiptHash(receipt: Omit<OverrideNearMissAnalyticsReceipt, "receiptHash">): string {
  return sha256Hex(canonicalize(receipt));
}

function buildTraceIndex(events: OverrideNearMissEvent[]): OverrideNearMissTraceIndex {
  const entries = events
    .map((event): OverrideNearMissTraceIndexEntry => {
      const boundary = promptToolBoundary(event);
      const nearMissLink = nonEmpty(event.nearMissLink) ? event.nearMissLink.trim() : null;
      const reviewerId = nonEmpty(event.reviewerId) ? event.reviewerId.trim() : null;
      const base = {
        eventId: event.eventId.trim(),
        agentId: event.agentId.trim(),
        useCaseId: event.useCaseId.trim(),
        timestamp: event.timestamp,
        eventType: event.eventType,
        reasonCode: event.reasonCode.trim(),
        actionTaken: event.actionTaken.trim(),
        nearMissLink,
        failureMode: event.failureMode.trim(),
        riskEvent: event.riskEvent.trim(),
        promptToolBoundary: boundary,
        latencyMs: round(event.latencyMs),
        costUsd: round(event.costUsd),
        remediationState: event.remediationState.trim(),
        reviewerId,
        evidenceRefs: unique(event.evidenceRefs),
        searchText: [
          event.eventId,
          event.agentId,
          event.useCaseId,
          event.eventType,
          event.reasonCode,
          event.riskEvent,
          event.failureMode,
          boundary,
          event.remediationState,
        ].join(" ").trim(),
      } satisfies Omit<OverrideNearMissTraceIndexEntry, "rowHash">;
      return {
        ...base,
        rowHash: entryHash(base),
      };
    })
    .sort((a, b) => a.eventId.localeCompare(b.eventId));

  return {
    entries,
    searchFields: [...SEARCH_FIELDS],
  };
}

function buildFailureClusters(entries: OverrideNearMissTraceIndexEntry[]): OverrideNearMissFailureCluster[] {
  const groups = new Map<string, OverrideNearMissTraceIndexEntry[]>();
  for (const entry of entries) {
    if (!nonEmpty(entry.failureMode)) continue;
    groups.set(entry.failureMode, [...(groups.get(entry.failureMode) ?? []), entry]);
  }

  return [...groups.entries()]
    .map(([failureMode, rows]) => ({
      clusterId: `onmfc_${sha256Hex(canonicalize({
        failureMode,
        eventIds: rows.map((row) => row.eventId).sort(),
      })).slice(0, 16)}`,
      failureMode,
      count: rows.length,
      eventIds: unique(rows.map((row) => row.eventId)),
      agentIds: unique(rows.map((row) => row.agentId)),
      useCaseIds: unique(rows.map((row) => row.useCaseId)),
      riskEvents: unique(rows.map((row) => row.riskEvent)),
      promptToolBoundaries: unique(rows.map((row) => row.promptToolBoundary)),
      remediationStates: unique(rows.map((row) => row.remediationState)),
      evidenceRefs: unique(rows.flatMap((row) => row.evidenceRefs)),
    }))
    .sort((a, b) => b.count - a.count || a.failureMode.localeCompare(b.failureMode));
}

function buildLiveTrends(entries: OverrideNearMissTraceIndexEntry[]): OverrideNearMissLiveTrends {
  return {
    eventCount: entries.length,
    agentCount: unique(entries.map((entry) => entry.agentId)).length,
    useCaseCount: unique(entries.map((entry) => entry.useCaseId)).length,
    overrideCount: entries.filter((entry) => entry.eventType === "human_override").length,
    nearMissCount: entries.filter((entry) => entry.eventType === "near_miss").length,
    ignoredEscalationCount: entries.filter((entry) => entry.eventType === "ignored_escalation").length,
    approvalCount: entries.filter((entry) => entry.eventType === "approval").length,
    totalCostUsd: round(entries.reduce((sum, entry) => sum + entry.costUsd, 0)),
    p95LatencyMs: percentile(entries.map((entry) => entry.latencyMs), 0.95),
    openRemediationCount: entries.filter((entry) => entry.remediationState !== "closed").length,
    reasonCodeCounts: countBy(entries.map((entry) => entry.reasonCode)),
    actionTakenCounts: countBy(entries.map((entry) => entry.actionTaken)),
    failureModeCounts: countBy(entries.map((entry) => entry.failureMode)),
    riskEventCounts: countBy(entries.map((entry) => entry.riskEvent)),
    remediationStateCounts: countBy(entries.map((entry) => entry.remediationState)),
  };
}

function buildRepeatedApprovalPatterns(entries: OverrideNearMissTraceIndexEntry[]): RepeatedApprovalPattern[] {
  const groups = new Map<string, OverrideNearMissTraceIndexEntry[]>();
  for (const entry of entries) {
    if (entry.eventType !== "approval") continue;
    const key = canonicalize({
      agentId: entry.agentId,
      useCaseId: entry.useCaseId,
      reasonCode: entry.reasonCode,
      actionTaken: entry.actionTaken,
    });
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  return [...groups.values()]
    .filter((rows) => rows.length >= 2)
    .map((rows) => {
      const first = rows[0]!;
      return {
        patternId: `onmap_${sha256Hex(canonicalize({
          agentId: first.agentId,
          useCaseId: first.useCaseId,
          reasonCode: first.reasonCode,
          actionTaken: first.actionTaken,
          eventIds: rows.map((row) => row.eventId).sort(),
        })).slice(0, 16)}`,
        agentId: first.agentId,
        useCaseId: first.useCaseId,
        reasonCode: first.reasonCode,
        actionTaken: first.actionTaken,
        count: rows.length,
        eventIds: unique(rows.map((row) => row.eventId)),
        reviewerIds: unique(rows.map((row) => row.reviewerId ?? "")),
        evidenceRefs: unique(rows.flatMap((row) => row.evidenceRefs)),
      };
    })
    .sort((a, b) => b.count - a.count || a.patternId.localeCompare(b.patternId));
}

function windowReasons(window: OverrideNearMissTrendWindow): string[] {
  const reasons: string[] = [];
  const start = parseTime(window.start);
  const end = parseTime(window.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) reasons.push("trendWindow:invalid");
  if (!Array.isArray(window.evidenceRefs) || window.evidenceRefs.filter(nonEmpty).length === 0) {
    reasons.push("trendWindowEvidence:missing");
  }
  return reasons;
}

function eventReasons(window: OverrideNearMissTrendWindow, events: OverrideNearMissEvent[]): string[] {
  if (events.length === 0) return ["events:missing"];

  const start = parseTime(window.start);
  const end = parseTime(window.end);
  const reasons: string[] = [];
  for (const event of events) {
    const eventRef = nonEmpty(event.eventId) ? event.eventId : "unknown";
    if (!nonEmpty(event.eventId)) reasons.push("eventId:missing");
    if (!nonEmpty(event.agentId)) reasons.push(`${eventRef}:agentId:missing`);
    if (!nonEmpty(event.useCaseId)) reasons.push(`${eventRef}:useCaseId:missing`);
    const ts = parseTime(event.timestamp);
    if (!Number.isFinite(ts)) {
      reasons.push(`${eventRef}:timestamp:invalid`);
    } else if (Number.isFinite(start) && Number.isFinite(end) && (ts < start || ts > end)) {
      reasons.push(`${eventRef}:timestamp:outsideWindow`);
    }
    if (
      event.eventType !== "human_override" &&
      event.eventType !== "ignored_escalation" &&
      event.eventType !== "near_miss" &&
      event.eventType !== "approval"
    ) {
      reasons.push(`${eventRef}:eventType:invalid`);
    }
    if (!nonEmpty(event.reasonCode)) reasons.push(`${eventRef}:reasonCode:missing`);
    if (!nonEmpty(event.actionTaken)) reasons.push(`${eventRef}:actionTaken:missing`);
    if ((event.eventType === "near_miss" || event.eventType === "ignored_escalation") && !nonEmpty(event.nearMissLink)) {
      reasons.push(`${eventRef}:nearMissLink:missing`);
    }
    if (!nonEmpty(event.failureMode)) reasons.push(`${eventRef}:failureMode:missing`);
    if (!nonEmpty(event.riskEvent)) reasons.push(`${eventRef}:riskEvent:missing`);
    if (!nonEmpty(event.promptBoundary)) reasons.push(`${eventRef}:promptBoundary:missing`);
    if (!nonEmpty(event.toolBoundary)) reasons.push(`${eventRef}:toolBoundary:missing`);
    if (!finiteNonNegative(event.latencyMs)) reasons.push(`${eventRef}:latencyMs:invalid`);
    if (!finiteNonNegative(event.costUsd)) reasons.push(`${eventRef}:costUsd:invalid`);
    if (!nonEmpty(event.remediationState)) reasons.push(`${eventRef}:remediationState:missing`);
    if (!Array.isArray(event.evidenceRefs) || event.evidenceRefs.filter(nonEmpty).length === 0) {
      reasons.push(`${eventRef}:evidenceRefs:missing`);
    }
  }
  return reasons;
}

export function buildOverrideNearMissAnalyticsReceipt(
  input: BuildOverrideNearMissAnalyticsReceiptInput
): OverrideNearMissAnalyticsReceipt {
  const traceIndex = buildTraceIndex(input.events);
  const failClosedReasons = unique([
    ...windowReasons(input.window),
    ...eventReasons(input.window, input.events),
  ]);
  const status: OverrideNearMissReceiptStatus = failClosedReasons.length > 0 ? "fail_closed" : "ready";
  const base = {
    schemaVersion: "2026-06-26" as const,
    receiptId: `override-near-miss-${sha256Hex(canonicalize({
      window: input.window,
      events: traceIndex.entries.map((entry) => entry.eventId),
    })).slice(0, 16)}`,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    surfaceBindings: [...SURFACE_BINDINGS],
    sourceRefs: unique(input.sourceRefs ?? []),
    window: {
      ...input.window,
      evidenceRefs: unique(input.window.evidenceRefs),
    },
    traceIndex,
    failureClusters: buildFailureClusters(traceIndex.entries),
    liveTrends: buildLiveTrends(traceIndex.entries),
    repeatedApprovalPatterns: buildRepeatedApprovalPatterns(traceIndex.entries),
    status,
    failClosed: failClosedReasons.length > 0,
    failClosedReasons,
  } satisfies Omit<OverrideNearMissAnalyticsReceipt, "receiptHash">;

  return {
    ...base,
    receiptHash: receiptHash(base),
  };
}

export function buildOverrideNearMissWatchAlerts(
  receipt: OverrideNearMissAnalyticsReceipt
): OverrideNearMissWatchAlert[] {
  const evidenceRefs = unique([
    ...receipt.window.evidenceRefs,
    ...receipt.traceIndex.entries.flatMap((entry) => entry.evidenceRefs),
  ]);

  if (receipt.failClosed) {
    return [{
      alertId: `override-near-miss-${receipt.receiptHash.slice(0, 16)}`,
      source: "override-near-miss-analytics",
      status: receipt.status,
      severity: "critical",
      metricId: "failClosedReasons",
      message: `Override and near-miss analytics failed closed with ${receipt.failClosedReasons.length} reason(s).`,
      evidenceRefs,
      failClosedReasons: receipt.failClosedReasons,
    }];
  }

  if (receipt.liveTrends.ignoredEscalationCount > 0) {
    return [{
      alertId: `override-near-miss-ignored-${receipt.receiptHash.slice(0, 16)}`,
      source: "override-near-miss-analytics",
      status: receipt.status,
      severity: "warning",
      metricId: "ignoredEscalationCount",
      message: `${receipt.liveTrends.ignoredEscalationCount} ignored escalation event(s) require operator review.`,
      evidenceRefs,
      failClosedReasons: [],
    }];
  }

  return [];
}
