import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import {
  runLiveScoreBehaviorDrift,
  type LiveDriftAlert,
  type LiveDriftMetricId,
  type LiveDriftReceipt,
  type LiveDriftSampleRow,
  type LiveDriftSeverity,
  type LiveDriftThresholds,
  type LiveDriftWindow,
} from "./liveDriftAlerts.js";

export type AgentReadingTestFailureMode =
  | "truncation"
  | "boilerplate_burial"
  | "spa_shell"
  | "tabbed_content"
  | "soft_404"
  | "broken_code_fence"
  | "content_negotiation"
  | "cross_host_redirect"
  | "header_quality"
  | "content_start"
  | "custom";

export type AgentReadingTestContentDeliveryMode =
  | "html"
  | "markdown"
  | "js_rendered"
  | "redirect"
  | "soft_404"
  | "custom";

export interface AgentReadingTestLiveDriftRow {
  traceId: string;
  scenarioId: string;
  timestamp: string;
  benchmarkId: string;
  sourceRefHash: string;
  repositorySnapshotHash: string;
  licenseRefHash: string;
  homepageRefHash: string;
  readmeBlobHash: string;
  answerKeyHash: string;
  taskManifestHash: string;
  scoreFormHash: string;
  liveSiteSnapshotHash: string;
  taskId: string;
  failureMode: AgentReadingTestFailureMode;
  contentDeliveryMode: AgentReadingTestContentDeliveryMode;
  baselineResultHash?: string;
  liveResultHash?: string;
  driftStatisticHash?: string;
  alertReceiptHash?: string;
  rawContentCaptureHash: string;
  reportedCanaryHash: string;
  expectedCanaryHash: string;
  score0to20: number;
  maxPoints: number;
  canaryRecall0to1: number;
  taskCompletion0to1: number;
  evidenceRefs: string[];
  signedEvidenceRefs: string[];
}

export interface AgentReadingTestWindow {
  windowId: string;
  startedAt: string;
  endedAt: string;
  rows: AgentReadingTestLiveDriftRow[];
}

export interface AgentReadingTestLiveDriftThresholds {
  maxReadingScoreDrop0to1: number;
  maxCanaryRecallDrop0to1: number;
  maxTaskCompletionDrop0to1: number;
  minEvidenceCoverage0to1: number;
  maxFailureModeDivergence0to1: number;
  maxContentDeliveryDivergence0to1: number;
  maxContextDivergence0to1: number;
}

export interface RunAgentReadingTestLiveDriftInput {
  agentId: string;
  baselineWindow: AgentReadingTestWindow;
  liveWindow: AgentReadingTestWindow;
  thresholds?: Partial<AgentReadingTestLiveDriftThresholds>;
  liveDriftThresholds?: Partial<LiveDriftThresholds>;
  sourceRefs?: string[];
  now?: Date;
}

export interface AgentReadingTestDistribution {
  rowCount: number;
  readingScoreMean0to1: number;
  canaryRecallMean0to1: number;
  taskCompletionRate0to1: number;
  evidenceCoverage0to1: number;
  failureModeDistribution: Record<string, number>;
  contentDeliveryDistribution: Record<string, number>;
  contextDistribution: Record<string, number>;
}

export interface AgentReadingTestScoreDrift {
  readingScoreDrop0to1: number;
  canaryRecallDrop0to1: number;
  taskCompletionDrop0to1: number;
  evidenceCoverageDrop0to1: number;
}

export interface AgentReadingTestBehaviorDrift {
  failureModeDivergence0to1: number;
  contentDeliveryDivergence0to1: number;
  contextDivergence0to1: number;
}

export interface AgentReadingTestReceiptRow extends AgentReadingTestLiveDriftRow {
  normalizedScore0to1: number;
  receiptScore0to1: number;
  evidenceCoverage0to1: number;
  rowHash: string;
}

export interface AgentReadingTestLiveDriftResult {
  receipt: LiveDriftReceipt;
  readingReceiptHash: string;
  baselineRows: AgentReadingTestReceiptRow[];
  liveRows: AgentReadingTestReceiptRow[];
  baselineDistribution: AgentReadingTestDistribution;
  liveDistribution: AgentReadingTestDistribution;
  scoreDrift: AgentReadingTestScoreDrift;
  behaviorDrift: AgentReadingTestBehaviorDrift;
}

const DEFAULT_SOURCE_REF = "https://github.com/agent-ecosystem/agent-reading-test";
const DEFAULT_SITE_REF = "https://agentreadingtest.com";

export const defaultAgentReadingTestLiveDriftThresholds: AgentReadingTestLiveDriftThresholds = {
  maxReadingScoreDrop0to1: 0.08,
  maxCanaryRecallDrop0to1: 0.08,
  maxTaskCompletionDrop0to1: 0.08,
  minEvidenceCoverage0to1: 1,
  maxFailureModeDivergence0to1: 0.35,
  maxContentDeliveryDivergence0to1: 0.35,
  maxContextDivergence0to1: 0.35,
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round(value: number, places = 6): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function nonEmpty(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function mean(values: number[], fallback = 0): number {
  return values.length === 0 ? fallback : round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function labelDistribution<T>(rows: T[], labelFor: (row: T) => string): Record<string, number> {
  if (rows.length === 0) return {};
  const counts = new Map<string, number>();
  for (const row of rows) {
    const label = labelFor(row);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].map(([label, count]) => [label, round(count / rows.length)]));
}

function totalVariationDistance(left: Record<string, number>, right: Record<string, number>): number {
  const labels = new Set([...Object.keys(left), ...Object.keys(right)]);
  let total = 0;
  for (const label of labels) {
    total += Math.abs((left[label] ?? 0) - (right[label] ?? 0));
  }
  return round(total / 2);
}

function normalizedScore(row: AgentReadingTestLiveDriftRow): number {
  if (!Number.isFinite(row.maxPoints) || row.maxPoints <= 0) return 0;
  return clamp01(row.score0to20 / row.maxPoints);
}

function rowScore(row: AgentReadingTestLiveDriftRow): number {
  return mean([
    normalizedScore(row),
    clamp01(row.canaryRecall0to1),
    clamp01(row.taskCompletion0to1),
  ]);
}

function rowEvidenceCoverage(row: AgentReadingTestLiveDriftRow, phase: "baseline" | "live"): number {
  const phaseProof = phase === "baseline"
    ? [nonEmpty(row.baselineResultHash)]
    : [nonEmpty(row.liveResultHash), nonEmpty(row.driftStatisticHash), nonEmpty(row.alertReceiptHash)];
  const checks = [
    nonEmpty(row.benchmarkId),
    nonEmpty(row.sourceRefHash),
    nonEmpty(row.repositorySnapshotHash),
    nonEmpty(row.licenseRefHash),
    nonEmpty(row.homepageRefHash),
    nonEmpty(row.readmeBlobHash),
    nonEmpty(row.answerKeyHash),
    nonEmpty(row.taskManifestHash),
    nonEmpty(row.scoreFormHash),
    nonEmpty(row.liveSiteSnapshotHash),
    nonEmpty(row.taskId),
    row.failureMode !== "custom",
    row.contentDeliveryMode !== "custom",
    nonEmpty(row.rawContentCaptureHash),
    nonEmpty(row.reportedCanaryHash),
    nonEmpty(row.expectedCanaryHash),
    Number.isFinite(row.score0to20),
    Number.isFinite(row.maxPoints) && row.maxPoints > 0,
    Number.isFinite(row.canaryRecall0to1),
    Number.isFinite(row.taskCompletion0to1),
    row.evidenceRefs.length > 0,
    row.signedEvidenceRefs.length > 0,
    ...phaseProof,
  ];
  return round(checks.filter(Boolean).length / checks.length);
}

function contextLabel(row: AgentReadingTestLiveDriftRow): string {
  return [
    row.repositorySnapshotHash || "unknown-repo",
    row.liveSiteSnapshotHash || "unknown-site",
    row.answerKeyHash || "unknown-answer-key",
    row.taskManifestHash || "unknown-task-manifest",
    row.scoreFormHash || "unknown-score-form",
    row.failureMode,
    row.contentDeliveryMode,
  ].join("/");
}

function toReceiptRow(row: AgentReadingTestLiveDriftRow, phase: "baseline" | "live"): AgentReadingTestReceiptRow {
  const normalizedScore0to1 = normalizedScore(row);
  const receiptScore0to1 = rowScore(row);
  const evidenceCoverage0to1 = rowEvidenceCoverage(row, phase);
  const withoutHash = {
    ...row,
    score0to20: Number.isFinite(row.score0to20) ? row.score0to20 : 0,
    maxPoints: Number.isFinite(row.maxPoints) ? row.maxPoints : 0,
    canaryRecall0to1: clamp01(row.canaryRecall0to1),
    taskCompletion0to1: clamp01(row.taskCompletion0to1),
    normalizedScore0to1,
    receiptScore0to1,
    evidenceCoverage0to1,
  };
  return {
    ...withoutHash,
    rowHash: sha256Hex(canonicalize(withoutHash)),
  };
}

function toLiveDriftRow(row: AgentReadingTestLiveDriftRow): LiveDriftSampleRow {
  const score0to1 = rowScore(row);
  return {
    traceId: row.traceId,
    scenarioId: row.scenarioId,
    timestamp: row.timestamp,
    score0to1,
    passed: score0to1 >= 0.8,
    refused: false,
    errored: false,
    behaviorSignature: `agent-reading-test:${row.failureMode}:${row.contentDeliveryMode}:${row.taskId}`,
    lifecycleStage: "deployment_maintenance",
    taskCategory: "web content reading",
    domain: "developer documentation",
    agentEvaluationDimension: "web_agents",
    latencyMs: 0,
    costUsd: 0,
    evidenceRefs: row.evidenceRefs,
    signedEvidenceRefs: row.signedEvidenceRefs,
  };
}

function toLiveDriftWindow(window: AgentReadingTestWindow): LiveDriftWindow {
  return {
    windowId: window.windowId,
    startedAt: window.startedAt,
    endedAt: window.endedAt,
    rows: window.rows.map(toLiveDriftRow),
  };
}

function distribution(rows: AgentReadingTestReceiptRow[]): AgentReadingTestDistribution {
  return {
    rowCount: rows.length,
    readingScoreMean0to1: mean(rows.map((row) => row.normalizedScore0to1)),
    canaryRecallMean0to1: mean(rows.map((row) => row.canaryRecall0to1)),
    taskCompletionRate0to1: mean(rows.map((row) => row.taskCompletion0to1)),
    evidenceCoverage0to1: mean(rows.map((row) => row.evidenceCoverage0to1), rows.length === 0 ? 1 : 0),
    failureModeDistribution: labelDistribution(rows, (row) => row.failureMode),
    contentDeliveryDistribution: labelDistribution(rows, (row) => row.contentDeliveryMode),
    contextDistribution: labelDistribution(rows, contextLabel),
  };
}

function buildAlert(
  input: RunAgentReadingTestLiveDriftInput,
  metricId: LiveDriftMetricId,
  observed: number,
  threshold: number,
  message: string,
  severity: LiveDriftSeverity,
): LiveDriftAlert {
  const evidenceRefs = unique([
    ...(input.sourceRefs ?? []),
    DEFAULT_SOURCE_REF,
    DEFAULT_SITE_REF,
    ...input.baselineWindow.rows.flatMap((row) => row.evidenceRefs),
    ...input.liveWindow.rows.flatMap((row) => row.evidenceRefs),
  ]);
  const signedEvidenceRefs = unique([
    ...input.baselineWindow.rows.flatMap((row) => row.signedEvidenceRefs),
    ...input.liveWindow.rows.flatMap((row) => row.signedEvidenceRefs),
  ]);
  return {
    alertId: `agent-reading-test:${metricId}:${sha256Hex(canonicalize({ metricId, observed, threshold, message })).slice(0, 12)}`,
    metricId,
    severity,
    message,
    threshold,
    observed: round(observed),
    evidenceRefs,
    signedEvidenceRefs,
  };
}

function withAdditionalAlerts(receipt: LiveDriftReceipt, additionalAlerts: LiveDriftAlert[]): LiveDriftReceipt {
  if (additionalAlerts.length === 0) return receipt;
  const { receiptHash: _receiptHash, ...withoutHash } = receipt;
  const alerts = [...receipt.alerts, ...additionalAlerts];
  const updatedWithoutHash = {
    ...withoutHash,
    alerts,
    recommendation: "alert" as const,
    failClosed: true,
    summary: `${alerts.length} live drift alert(s), recommendation=alert`,
  };
  return {
    ...updatedWithoutHash,
    receiptHash: sha256Hex(canonicalize(updatedWithoutHash)),
  };
}

export function runAgentReadingTestLiveDrift(input: RunAgentReadingTestLiveDriftInput): AgentReadingTestLiveDriftResult {
  const thresholds = {
    ...defaultAgentReadingTestLiveDriftThresholds,
    ...(input.thresholds ?? {}),
  };
  const baselineRows = input.baselineWindow.rows.map((row) => toReceiptRow(row, "baseline"));
  const liveRows = input.liveWindow.rows.map((row) => toReceiptRow(row, "live"));
  const baselineDistribution = distribution(baselineRows);
  const liveDistribution = distribution(liveRows);
  const scoreDrift: AgentReadingTestScoreDrift = {
    readingScoreDrop0to1: round(Math.max(0, baselineDistribution.readingScoreMean0to1 - liveDistribution.readingScoreMean0to1)),
    canaryRecallDrop0to1: round(Math.max(0, baselineDistribution.canaryRecallMean0to1 - liveDistribution.canaryRecallMean0to1)),
    taskCompletionDrop0to1: round(Math.max(0, baselineDistribution.taskCompletionRate0to1 - liveDistribution.taskCompletionRate0to1)),
    evidenceCoverageDrop0to1: round(Math.max(0, baselineDistribution.evidenceCoverage0to1 - liveDistribution.evidenceCoverage0to1)),
  };
  const behaviorDrift: AgentReadingTestBehaviorDrift = {
    failureModeDivergence0to1: totalVariationDistance(baselineDistribution.failureModeDistribution, liveDistribution.failureModeDistribution),
    contentDeliveryDivergence0to1: totalVariationDistance(baselineDistribution.contentDeliveryDistribution, liveDistribution.contentDeliveryDistribution),
    contextDivergence0to1: totalVariationDistance(baselineDistribution.contextDistribution, liveDistribution.contextDistribution),
  };
  const additionalAlerts: LiveDriftAlert[] = [];
  if (scoreDrift.readingScoreDrop0to1 > thresholds.maxReadingScoreDrop0to1) {
    additionalAlerts.push(buildAlert(input, "agentReadingTestScoreMean0to1", scoreDrift.readingScoreDrop0to1, thresholds.maxReadingScoreDrop0to1, "Live Agent Reading Test score dropped beyond threshold.", "high"));
  }
  if (scoreDrift.canaryRecallDrop0to1 > thresholds.maxCanaryRecallDrop0to1) {
    additionalAlerts.push(buildAlert(input, "agentReadingTestCanaryRecallMean0to1", scoreDrift.canaryRecallDrop0to1, thresholds.maxCanaryRecallDrop0to1, "Live Agent Reading Test canary recall dropped beyond threshold.", "critical"));
  }
  if (scoreDrift.taskCompletionDrop0to1 > thresholds.maxTaskCompletionDrop0to1) {
    additionalAlerts.push(buildAlert(input, "agentReadingTestTaskCompletionRate0to1", scoreDrift.taskCompletionDrop0to1, thresholds.maxTaskCompletionDrop0to1, "Live Agent Reading Test task completion dropped beyond threshold.", "high"));
  }
  if (liveDistribution.evidenceCoverage0to1 < thresholds.minEvidenceCoverage0to1) {
    additionalAlerts.push(buildAlert(input, "agentReadingTestEvidenceCoverage0to1", liveDistribution.evidenceCoverage0to1, thresholds.minEvidenceCoverage0to1, "Live Agent Reading Test rows are missing source snapshot, license, homepage, README blob, answer key, task manifest, score form, live-site snapshot, raw content, canary, result, drift statistic, alert receipt, evidence, or signed evidence proof.", "critical"));
  }
  if (behaviorDrift.failureModeDivergence0to1 > thresholds.maxFailureModeDivergence0to1) {
    additionalAlerts.push(buildAlert(input, "agentReadingTestFailureModeDistribution", behaviorDrift.failureModeDivergence0to1, thresholds.maxFailureModeDivergence0to1, "Live Agent Reading Test failure-mode distribution diverged beyond threshold.", "medium"));
  }
  if (behaviorDrift.contentDeliveryDivergence0to1 > thresholds.maxContentDeliveryDivergence0to1) {
    additionalAlerts.push(buildAlert(input, "agentReadingTestContentDeliveryDistribution", behaviorDrift.contentDeliveryDivergence0to1, thresholds.maxContentDeliveryDivergence0to1, "Live Agent Reading Test content-delivery distribution diverged beyond threshold.", "medium"));
  }
  if (behaviorDrift.contextDivergence0to1 > thresholds.maxContextDivergence0to1) {
    additionalAlerts.push(buildAlert(input, "agentReadingTestContextDistribution", behaviorDrift.contextDivergence0to1, thresholds.maxContextDivergence0to1, "Live Agent Reading Test source, site, answer-key, task, score-form, or content context diverged beyond threshold.", "medium"));
  }
  const receipt = withAdditionalAlerts(
    runLiveScoreBehaviorDrift({
      agentId: input.agentId,
      baselineWindow: toLiveDriftWindow(input.baselineWindow),
      liveWindow: toLiveDriftWindow(input.liveWindow),
      thresholds: input.liveDriftThresholds,
      sourceRefs: unique([...(input.sourceRefs ?? []), DEFAULT_SOURCE_REF, DEFAULT_SITE_REF]),
      now: input.now,
    }),
    additionalAlerts,
  );
  const readingReceiptHash = sha256Hex(canonicalize({
    baselineRows,
    liveRows,
    baselineDistribution,
    liveDistribution,
    scoreDrift,
    behaviorDrift,
    thresholds,
    receiptHash: receipt.receiptHash,
  }));
  return {
    receipt,
    readingReceiptHash,
    baselineRows,
    liveRows,
    baselineDistribution,
    liveDistribution,
    scoreDrift,
    behaviorDrift,
  };
}
